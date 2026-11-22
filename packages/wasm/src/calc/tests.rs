#[cfg(test)]
use super::*;

#[test]
fn operator_precedence_is_excel_compatible_and_errors_stay_explicit() {
    assert_eq!(serialize(&parse("=-1^2").unwrap()), "=(-(1)^2)");
    assert_eq!(serialize(&parse("=2^3^2").unwrap()), "=((2^3)^2)");
    assert_eq!(serialize(&parse("=1&2+3").unwrap()), "=(1&(2+3))");
    assert_eq!(serialize(&parse("=2^2%").unwrap()), "=(2^(2)%)");
    assert!(parse("=%2").is_err());
    assert!(parse("=2^").is_err());
    assert!(parse("=2&&3").is_err());
}

#[test]
fn array_constants_reject_ragged_rows_references_and_expressions() {
    for source in [
        "={1,2;3}",
        "={1;2,3}",
        "={}",
        "={1,}",
        "={1;}",
        "={1,,2}",
        "={A1,2}",
        "={1+1}",
        "={(1)}",
        "={SUM(1)}",
        "={-\"a\"}",
        "={1,{2}}",
        "={1,2",
        "=1;2",
    ] {
        assert!(parse(source).is_err(), "{source} should not parse");
    }
}

#[test]
fn parse_rejects_deeply_nested_parentheses() {
    let mut src = String::new();
    for _ in 0..=PARSE_RECURSION_LIMIT {
        src.push('(');
    }
    src.push('1');
    for _ in 0..=PARSE_RECURSION_LIMIT {
        src.push(')');
    }

    assert!(parse(&src).is_err());
}

/// A space is an intersection after a closing parenthesis and before a
/// deleted reference or a quoted sheet name, as Excel reads it.
#[test]
fn a_space_before_any_reference_form_intersects() {
    for source in ["=SUM(B2:D4 #ref!)", "=(-A1) B1"] {
        assert!(parse(source).is_ok(), "{source}");
    }
    assert!(matches!(
        parse("=A1:B2 'Other Sheet'!B1"),
        Ok(Ast::Func(Func::Intersect, operands, _)) if operands.len() == 2
    ));
}

#[test]
fn text_literal_memory_counts_reference_counts() {
    let literal = parse("=\"abc\"").unwrap();
    let mut stats = MemoryOwnerStats::default();
    literal.heap_memory_stats(&mut stats);
    assert_eq!(stats.logical_bytes, 3);
    assert_eq!(stats.allocated_bytes, 3 + 2 * std::mem::size_of::<usize>());
    // A cloned tree shares the literal and writes it back unchanged.
    assert_eq!(serialize(&literal.clone()), "=\"abc\"");
}

#[test]
fn heap_memory_stats_accounts_owning_ast_shapes() {
    let boxed = std::mem::size_of::<Ast>();
    let cases: Vec<(&str, Ast, usize)> = vec![
        ("string", Ast::Str("abc".to_owned().into()), 3),
        ("name", Ast::Name("Total".to_owned().into()), 5),
        (
            "defined name",
            Ast::DefinedName(NameId::at(0).unwrap(), false),
            0,
        ),
        (
            "unqualified structured ref",
            Ast::UnresolvedStructured(Box::new(UnresolvedStructuredRef {
                table_name: None,
                column_name: "Amount".to_owned(),
                section: TableSection::Body,
            })),
            std::mem::size_of::<UnresolvedStructuredRef>() + 6,
        ),
        (
            "qualified structured ref",
            Ast::UnresolvedStructured(Box::new(UnresolvedStructuredRef {
                table_name: Some("Table1".to_owned()),
                column_name: "Amount".to_owned(),
                section: TableSection::Body,
            })),
            std::mem::size_of::<UnresolvedStructuredRef>() + 12,
        ),
        (
            "bound structured ref, inline",
            Ast::Structured(StructuredRef {
                table: 0,
                section: TableSection::Body,
                qualified: true,
                sheet: 1,
                row_start: 0,
                row_end: 3,
                col: 0,
            }),
            0,
        ),
        (
            "sheet cell",
            Ast::SheetCell(Box::new(DetachedCellRef {
                sheet: UnresolvedSheetRef {
                    name: "Data".to_owned(),
                    quoted: false,
                },
                row: 0,
                col: 0,
                flags: RefFlags::default(),
            })),
            std::mem::size_of::<DetachedCellRef>() + 4,
        ),
        (
            "sheet range",
            Ast::SheetRange(Box::new(DetachedRangeRef {
                sheet: UnresolvedSheetRef {
                    name: "Data".to_owned(),
                    quoted: false,
                },
                row_start: 0,
                col_start: 0,
                row_end: 1,
                col_end: 1,
                flags: RangeFlags::default(),
            })),
            std::mem::size_of::<DetachedRangeRef>() + 4,
        ),
        (
            "absolute cell",
            Ast::AbsCell(SheetRef { handle: 1 }, 0, 0, RefFlags::default()),
            0,
        ),
        (
            "absolute range",
            Ast::AbsRange(SheetRef { handle: 1 }, 0, 0, 1, 1, RangeFlags::default()),
            0,
        ),
        (
            "function arguments",
            Ast::call(Func::Rept, (vec![Ast::Num(1.0)]).into()),
            boxed,
        ),
        (
            "unknown function",
            Ast::UnknownFunc(Box::new(UnknownCall {
                name: "Foo".to_owned(),
                args: (vec![Ast::Num(1.0), Ast::Num(2.0)]).into(),
            })),
            std::mem::size_of::<UnknownCall>() + 3 + boxed * 2,
        ),
        (
            "binary",
            Ast::bin(Op::Add, Box::new(Ast::Num(1.0)), Box::new(Ast::Num(2.0))),
            boxed * 2,
        ),
        (
            "comparison",
            Ast::cmp(CmpOp::Eq, Box::new(Ast::Num(1.0)), Box::new(Ast::Num(2.0))),
            boxed * 2,
        ),
        ("negation", Ast::neg(Box::new(Ast::Num(1.0))), boxed),
        ("unary plus", Ast::pos(Box::new(Ast::Num(1.0))), boxed),
        ("percent", Ast::percent(Box::new(Ast::Num(1.0))), boxed),
        ("inline leaf", Ast::Cell(2, 3, RefFlags::default()), 0),
        ("invalid reference", Ast::InvalidRef, 0),
    ];
    for (label, ast, expected_logical) in cases {
        let mut stats = MemoryOwnerStats::default();
        ast.heap_memory_stats(&mut stats);
        assert_eq!(stats.logical_bytes, expected_logical, "{label}");
        assert!(stats.allocated_bytes >= stats.logical_bytes, "{label}");
    }
    assert_eq!(parse_col(""), None);
    assert_eq!(parse_col("A1"), None);
}
