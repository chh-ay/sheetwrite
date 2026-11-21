#[cfg(test)]
use super::*;

#[test]
fn reference_operators_serialize_to_text_that_parses_back_to_the_same_tree() {
    for (source, expected) in [
        ("=SUM(A1:C3 B2:D4)", "=SUM(A1:C3 B2:D4)"),
        ("=a1   b2  c3", "=A1 B2 C3"),
        ("=(-A1) B1", "=(-(A1)) B1"),
        ("=A1:B2 'Other Sheet'!B1", "=A1:B2 'Other Sheet'!B1"),
        ("=SUM((A1:A2,C1:C2))", "=SUM((A1:A2,C1:C2))"),
        ("=INDEX(( A1:B2 , D1 ),1,1,2)", "=INDEX((A1:B2,D1),1,1,2)"),
        ("=SUM(Sheet1:Sheet3!A1:B2)", "=SUM(Sheet1:Sheet3!A1:B2)"),
        ("=SUM('My Sheet:Other'!$A$1)", "=SUM('My Sheet:Other'!$A$1)"),
        ("=SUM('My Sheet':Other!A1)", "=SUM('My Sheet:Other'!A1)"),
        ("=SUM('O''Brien:Last'!A1)", "=SUM('O''Brien:Last'!A1)"),
        ("=SUM(A1 + B1)", "=SUM((A1+B1))"),
        ("=SUM(#REF! B2:D4)", "=SUM(#REF! B2:D4)"),
        ("=SUM(B2:D4 #ref!)", "=SUM(B2:D4 #REF!)"),
    ] {
        let ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
        assert_eq!(serialize(&ast), expected, "{source}");
        assert_eq!(parse(expected).as_ref(), Ok(&ast), "{source}");
    }

    assert!(matches!(
        parse("=A1 B1"),
        Ok(Ast::Func(Func::Intersect, operands)) if operands.len() == 2
    ));
    assert!(matches!(parse("=SUM (A1)"), Ok(Ast::Func(Func::Sum, _))));
    assert!(matches!(
        parse("=Sheet1:Sheet3!A1"),
        Ok(Ast::SheetSpan(span)) if span.cell && span.first.name.as_deref() == Some("Sheet1")
    ));
}

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
fn array_constants_parse_rows_and_columns_and_round_trip() {
    let shapes = [
        ("={1,2,3}", 3, 3, "={1,2,3}"),
        ("={1;2;3}", 1, 3, "={1;2;3}"),
        ("={1,2;3,4}", 2, 4, "={1,2;3,4}"),
        ("={ -1.5 , +2 }", 2, 2, "={-1.5,2}"),
        (
            "={\"a\"\"b\",true,False;#n/a,#DIV/0!,#REF!}",
            3,
            6,
            "={\"a\"\"b\",TRUE,FALSE;#N/A,#DIV/0!,#REF!}",
        ),
    ];
    for (source, expected_cols, expected_len, expected_text) in shapes {
        let ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
        let Ast::Array(array) = &ast else {
            panic!("{source} did not parse as an array constant");
        };
        let ArrayLiteral { cols, values } = &**array;
        assert_eq!(
            (*cols, values.len()),
            (expected_cols, expected_len),
            "{source}"
        );
        assert_eq!(serialize(&ast), expected_text, "{source}");
        assert_eq!(parse(&serialize(&ast)).as_ref(), Ok(&ast), "{source}");
    }

    assert_eq!(
        parse("={\"x\",FALSE,#NAME?}"),
        Ok(Ast::Array(Box::new(ArrayLiteral {
            cols: 3,
            values: vec![
                Value::text("x"),
                Value::Bool(false),
                Value::Error(FormulaError::Name),
            ]
            .into(),
        })))
    );
    assert_eq!(
        serialize(&parse("=SUM({1,2},A1)").unwrap()),
        "=SUM({1,2},A1)"
    );
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
fn seeded_operator_ast_round_trip_property() {
    fn generated(seed: &mut u64, depth: usize) -> Ast {
        *seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
        if depth == 0 {
            return Ast::Num(((*seed >> 32) % 10_000) as f64 / 100.0);
        }
        match *seed % 9 {
            0 => Ast::Neg(Box::new(generated(seed, depth - 1))),
            1 => Ast::Pos(Box::new(generated(seed, depth - 1))),
            2 => Ast::Percent(Box::new(generated(seed, depth - 1))),
            operator => {
                let op = match operator {
                    3 => Op::Add,
                    4 => Op::Sub,
                    5 => Op::Mul,
                    6 => Op::Div,
                    7 => Op::Pow,
                    _ => Op::Concat,
                };
                Ast::Bin(
                    op,
                    Box::new(generated(seed, depth - 1)),
                    Box::new(generated(seed, depth - 1)),
                )
            }
        }
    }

    let mut seed = 0x05ee_d070_u64;
    for _ in 0..512 {
        let ast = generated(&mut seed, 5);
        let source = serialize(&ast);
        assert_eq!(parse(&source), Ok(ast), "failed source: {source}");
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

#[test]
fn names_sheet_refs_and_unknown_calls_preserve_source_case() {
    assert_eq!(
        parse("=Revenue_Q1"),
        Ok(Ast::Name("Revenue_Q1".to_owned().into()))
    );
    assert_eq!(
        parse("=Sales.Data"),
        Ok(Ast::Name("Sales.Data".to_owned().into()))
    );

    let sheet_ref = parse("='North East'!a1").expect("quoted sheet ref should parse");
    assert_eq!(serialize(&sheet_ref), "='North East'!A1");
    assert_eq!(parse(&serialize(&sheet_ref)), Ok(sheet_ref));

    let unicode_sheet = parse("='München Süd'!b2").expect("UTF-8 quoted sheet ref should parse");
    assert_eq!(serialize(&unicode_sheet), "='München Süd'!B2");
    assert_eq!(parse(&serialize(&unicode_sheet)), Ok(unicode_sheet));
    assert_eq!(parse("=\"café\""), Ok(Ast::Str("café".to_owned().into())));
    assert_eq!(
        serialize(&parse("=1\u{2003}+2").expect("Unicode whitespace should parse")),
        "=(1+2)"
    );

    let unknown = parse("=MiXeD.Call(Revenue_Q1)").expect("unknown call should remain parseable");
    assert_eq!(
        unknown,
        Ast::UnknownFunc(Box::new(UnknownCall {
            name: "MiXeD.Call".to_owned(),
            args: (vec![Ast::Name("Revenue_Q1".to_owned().into())]).into()
        }))
    );
    assert_eq!(serialize(&unknown), "=MiXeD.Call(Revenue_Q1)");
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
            Ast::Func(Func::Rept, (vec![Ast::Num(1.0)]).into()),
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
            Ast::Bin(Op::Add, Box::new(Ast::Num(1.0)), Box::new(Ast::Num(2.0))),
            boxed * 2,
        ),
        (
            "comparison",
            Ast::Cmp(CmpOp::Eq, Box::new(Ast::Num(1.0)), Box::new(Ast::Num(2.0))),
            boxed * 2,
        ),
        ("negation", Ast::Neg(Box::new(Ast::Num(1.0))), boxed),
        ("unary plus", Ast::Pos(Box::new(Ast::Num(1.0))), boxed),
        ("percent", Ast::Percent(Box::new(Ast::Num(1.0))), boxed),
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
