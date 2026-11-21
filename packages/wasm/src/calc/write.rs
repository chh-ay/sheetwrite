//! `Ast` back to formula text.

use super::*;

/// Serialize the authoritative AST into parseable formula source.
#[cfg(test)]
pub(crate) fn serialize(ast: &Ast) -> String {
    let mut out = String::from("=");
    write_ast(ast, &mut out);
    out
}

/// Whether a reference must quote the sheet `name`, as in `'Q1 Sales'!A1`.
pub(crate) fn sheet_name_needs_quotes(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return true;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return true;
    }
    if chars.any(|ch| !(ch.is_ascii_alphanumeric() || ch == '_')) {
        return true;
    }
    parse_a1(name).is_some()
}

fn write_structured_ref(
    table_name: Option<&str>,
    column_name: &str,
    section: TableSection,
    out: &mut String,
) {
    if let Some(name) = table_name {
        out.push_str(name);
    }
    match section {
        TableSection::Body => {
            out.push('[');
            out.push_str(column_name);
            out.push(']');
        }
        TableSection::CurrentRow => {
            out.push_str("[@");
            out.push_str(column_name);
            out.push(']');
        }
        TableSection::Headers | TableSection::Totals => {
            out.push_str("[[");
            out.push_str(if section == TableSection::Headers {
                "#Headers"
            } else {
                "#Totals"
            });
            out.push_str("],[");
            out.push_str(column_name);
            out.push_str("]]");
        }
    }
}

/// The written name of a 3-D endpoint: its own text while detached, else the
/// workbook's current name for its sheet.
fn span_endpoint_name<'a>(endpoint: &'a SheetSpanEndpoint, names: &'a [String]) -> Option<&'a str> {
    endpoint
        .name
        .as_deref()
        .or_else(|| names.get(endpoint.handle as usize).map(String::as_str))
}

/// What bound references write: the current name of each sheet handle, the
/// table and column names of each table slot, and the spelling of each
/// defined name. Without tables, a bound table reference writes `#REF!`;
/// without names, a defined name writes nothing.
#[derive(Clone, Copy)]
pub(crate) struct WrittenNames<'a> {
    pub(crate) sheets: &'a [String],
    pub(crate) tables: Option<&'a TableSlots>,
    pub(crate) names: Option<&'a crate::store::names::NameTable>,
}

impl WrittenNames<'_> {
    /// For text written with no workbook: every bound reference is `#REF!`.
    pub(crate) const NONE: WrittenNames<'static> = WrittenNames {
        sheets: &[],
        tables: None,
        names: None,
    };
}

pub(crate) fn write_ast(ast: &Ast, out: &mut String) {
    write_ast_with_names(ast, out, &WrittenNames::NONE);
}

pub(crate) fn write_ast_with_names(ast: &Ast, out: &mut String, names: &WrittenNames<'_>) {
    match ast {
        Ast::Num(value) => out.push_str(NumberText::of(*value).as_str()),
        Ast::Str(value) => write_text(value, out),
        Ast::Bool(value) => out.push_str(if *value { "TRUE" } else { "FALSE" }),
        Ast::Name(name) => out.push_str(name),
        Ast::LetName { name, .. } => out.push_str(name),
        Ast::DefinedName(id, _) => {
            if let Some(table) = names.names {
                table.write_spelling(*id, out);
            }
        }
        Ast::UnresolvedStructured(reference) => write_structured_ref(
            reference.table_name.as_deref(),
            &reference.column_name,
            reference.section,
            out,
        ),
        Ast::Structured(reference) => {
            let bound = names.tables.and_then(|tables| {
                let table = tables.get(reference.table)?;
                Some((table.name.as_str(), table.column_at(reference.col)?))
            });
            let Some((table_name, column)) = bound else {
                out.push_str("#REF!");
                return;
            };
            write_structured_ref(
                reference.qualified.then_some(table_name),
                &column.name,
                reference.section,
                out,
            );
        }
        Ast::Cell(row, col, flags) => write_a1(*row, *col, *flags, out),
        Ast::SheetCell(reference) => {
            let DetachedCellRef {
                sheet,
                row,
                col,
                flags,
            } = &**reference;

            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*row, *col, *flags, out);
        }
        Ast::AbsCell(sheet, row, col, flags) => {
            let Some(name) = names.sheets.get(sheet.handle as usize) else {
                out.push_str("#REF!");
                return;
            };
            write_sheet_name(name, flags.quoted(), out);
            out.push('!');
            write_a1(*row, *col, *flags, out);
        }
        Ast::Range(r0, c0, r1, c1, flags) => write_area(*r0, *c0, *r1, *c1, flags, out),
        Ast::SheetRange(reference) => {
            let DetachedRangeRef {
                sheet,
                row_start: r0,
                col_start: c0,
                row_end: r1,
                col_end: c1,
                flags,
            } = &**reference;

            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_area(*r0, *c0, *r1, *c1, flags, out);
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, flags) => {
            let Some(name) = names.sheets.get(sheet.handle as usize) else {
                out.push_str("#REF!");
                return;
            };
            write_sheet_name(name, flags.start.quoted(), out);
            out.push('!');
            write_area(*r0, *c0, *r1, *c1, flags, out);
        }
        Ast::SheetSpan(span) => {
            let (Some(first), Some(last)) = (
                span_endpoint_name(&span.first, names.sheets),
                span_endpoint_name(&span.last, names.sheets),
            ) else {
                out.push_str("#REF!");
                return;
            };
            // Excel quotes the whole span once: `'Sheet 1:Sheet 3'!A1`.
            if span.first.quoted || span.last.quoted {
                out.push('\'');
                out.push_str(&first.replace('\'', "''"));
                out.push(':');
                out.push_str(&last.replace('\'', "''"));
                out.push('\'');
            } else {
                out.push_str(first);
                out.push(':');
                out.push_str(last);
            }
            out.push('!');
            if span.cell {
                write_a1(span.row_start, span.col_start, span.flags.start, out);
            } else {
                write_area(
                    span.row_start,
                    span.col_start,
                    span.row_end,
                    span.col_end,
                    &span.flags,
                    out,
                );
            }
        }
        Ast::Missing => {}
        #[cfg(feature = "analysis")]
        Ast::Parameter { name, .. } => out.push_str(name),
        #[cfg(feature = "analysis")]
        Ast::Lambda(definition) => {
            out.push_str(func_name(Func::Analysis(crate::eval::analysis::LAMBDA_ID)));
            out.push('(');
            for parameter in &definition.parameters {
                write_ast_with_names(parameter, out, names);
                out.push(',');
            }
            write_ast_with_names(&definition.body, out, names);
            out.push(')');
        }
        #[cfg(feature = "analysis")]
        Ast::RegexPattern(pattern) => write_text(pattern.text(), out),
        Ast::InvalidRef => out.push_str("#REF!"),
        Ast::Array(array) => {
            let ArrayLiteral { cols, values } = &**array;

            out.push('{');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    out.push(if index % *cols as usize == 0 {
                        ';'
                    } else {
                        ','
                    });
                }
                match value {
                    Value::Number(number) => out.push_str(NumberText::of(*number).as_str()),
                    Value::Text(text) => write_text(text, out),
                    Value::Bool(flag) => out.push_str(if *flag { "TRUE" } else { "FALSE" }),
                    Value::Error(error) => out.push_str(error.sentinel()),
                    Value::Blank => {}
                }
            }
            out.push('}');
        }
        Ast::LetSlot { expression, .. } => write_ast_with_names(expression, out, names),
        Ast::Func(Func::AnchorArray, args) if args.len() == 1 => {
            write_ast_with_names(&args[0], out, names);
            // A deleted anchor writes as #REF!, which has no spill suffix.
            if !matches!(args[0], Ast::InvalidRef) {
                out.push('#');
            }
        }
        Ast::Func(Func::Union, areas) => {
            out.push('(');
            for (index, area) in areas.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast_with_names(area, out, names);
            }
            out.push(')');
        }
        Ast::Func(Func::Intersect, operands) => {
            for (index, operand) in operands.iter().enumerate() {
                if index > 0 {
                    out.push(' ');
                }
                // A signed operand needs its own parentheses, or the sign
                // would apply to the whole intersection when parsed again.
                let signed = matches!(operand, Ast::Neg(_) | Ast::Pos(_) | Ast::Percent(_));
                if signed {
                    out.push('(');
                }
                write_ast_with_names(operand, out, names);
                if signed {
                    out.push(')');
                }
            }
        }
        Ast::Func(func, args) => {
            out.push_str(func_name(*func));
            out.push('(');
            for (index, arg) in args.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast_with_names(arg, out, names);
            }
            out.push(')');
        }
        #[cfg(feature = "analysis")]
        Ast::UnknownFunc(call) if call.name == crate::eval::analysis::lambda::CALL => {
            let UnknownCall { args, .. } = &**call;

            if let Some(callee) = args.first() {
                write_ast_with_names(callee, out, names);
            }
            out.push('(');
            for (index, argument) in args.iter().skip(1).enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast_with_names(argument, out, names);
            }
            out.push(')');
        }
        Ast::UnknownFunc(call) => {
            let UnknownCall { name, args } = &**call;

            out.push_str(name);
            out.push('(');
            for (index, arg) in args.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast_with_names(arg, out, names);
            }
            out.push(')');
        }
        Ast::Bin(op, left, right) => {
            out.push('(');
            write_ast_with_names(left, out, names);
            out.push(match op {
                Op::Add => '+',
                Op::Sub => '-',
                Op::Mul => '*',
                Op::Div => '/',
                Op::Pow => '^',
                Op::Concat => '&',
            });
            write_ast_with_names(right, out, names);
            out.push(')');
        }
        Ast::Cmp(op, left, right) => {
            out.push('(');
            write_ast_with_names(left, out, names);
            out.push_str(match op {
                CmpOp::Eq => "=",
                CmpOp::Ne => "<>",
                CmpOp::Lt => "<",
                CmpOp::Le => "<=",
                CmpOp::Gt => ">",
                CmpOp::Ge => ">=",
            });
            write_ast_with_names(right, out, names);
            out.push(')');
        }
        Ast::Neg(inner) => {
            out.push_str("-(");
            write_ast_with_names(inner, out, names);
            out.push(')');
        }
        Ast::Pos(inner) => {
            out.push_str("+(");
            write_ast_with_names(inner, out, names);
            out.push(')');
        }
        Ast::Percent(inner) => {
            out.push('(');
            write_ast_with_names(inner, out, names);
            out.push_str(")%");
        }
    }
}

fn write_text(value: &str, out: &mut String) {
    out.push('"');
    out.push_str(&value.replace('"', "\"\""));
    out.push('"');
}

fn write_sheet_name(name: &str, quoted: bool, out: &mut String) {
    if quoted {
        out.push('\'');
        out.push_str(&name.replace('\'', "''"));
        out.push('\'');
    } else {
        out.push_str(name);
    }
}

/// Writes a range, in the short form when it covers whole rows (`2:3`) or
/// whole columns (`B:C`). A range over every cell is written as rows, as
/// Excel writes `1:1048576`.
fn write_area(r0: u32, c0: u32, r1: u32, c1: u32, flags: &RangeFlags, out: &mut String) {
    if spans_all_cols(c0, c1) {
        write_absolute_marker(flags.start.row_abs(), out);
        out.push_str(&(u64::from(r0) + 1).to_string());
        out.push(':');
        write_absolute_marker(flags.end.row_abs(), out);
        out.push_str(&(u64::from(r1) + 1).to_string());
    } else if spans_all_rows(r0, r1) {
        write_absolute_marker(flags.start.col_abs(), out);
        write_col(c0, out);
        out.push(':');
        write_absolute_marker(flags.end.col_abs(), out);
        write_col(c1, out);
    } else {
        write_a1(r0, c0, flags.start, out);
        out.push(':');
        write_a1(r1, c1, flags.end, out);
    }
}

fn write_absolute_marker(absolute: bool, out: &mut String) {
    if absolute {
        out.push('$');
    }
}

fn write_a1(row: u32, col: u32, flags: RefFlags, out: &mut String) {
    if flags.col_abs() {
        out.push('$');
    }
    write_col(col, out);
    if flags.row_abs() {
        out.push('$');
    }
    out.push_str(&(u64::from(row) + 1).to_string());
}

/// Append the A1 letters of a 0-based column (`0` → `A`, `26` → `AA`).
pub(crate) fn write_col(mut col: u32, out: &mut String) {
    let mut letters = [0u8; 7];
    let mut index = letters.len();
    loop {
        index -= 1;
        letters[index] = b'A' + (col % 26) as u8;
        if col < 26 {
            break;
        }
        col = col / 26 - 1;
    }
    out.push_str(std::str::from_utf8(&letters[index..]).expect("ASCII column letters"));
}
