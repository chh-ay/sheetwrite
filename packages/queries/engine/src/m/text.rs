//! M lexical forms for generated text, from the Power Query M lexical structure:
//! https://learn.microsoft.com/powerquery-m/m-spec-lexical-structure

use std::fmt::Write;

/// A text literal: `"` doubles, line breaks and other controls use `#(...)`
/// escapes, and a literal `#(` is written as `#(#)(` so it is not read as an escape.
pub(crate) fn text(out: &mut String, value: &str) {
    out.push('"');
    escaped(out, value);
    out.push('"');
}

fn escaped(out: &mut String, value: &str) {
    let mut characters = value.chars().peekable();

    while let Some(character) = characters.next() {
        match character {
            '"' => out.push_str("\"\""),
            '\r' => out.push_str("#(cr)"),
            '\n' => out.push_str("#(lf)"),
            '\t' => out.push_str("#(tab)"),
            '#' if characters.peek() == Some(&'(') => out.push_str("#(#)"),
            control if control.is_control() => {
                // Short escapes take four hex digits; longer code points take eight.
                let code = u32::from(control);
                if code <= 0xffff {
                    let _ = write!(out, "#({code:04X})");
                } else {
                    let _ = write!(out, "#({code:08X})");
                }
            }
            other => out.push(other),
        }
    }
}

/// A quoted identifier `#"..."`, valid for every name, including keywords and
/// names with spaces or dots.
pub(crate) fn identifier(out: &mut String, name: &str) {
    out.push_str("#\"");
    escaped(out, name);
    out.push('"');
}

/// A field access `[#"name"]`; quoted identifiers are valid inside brackets.
pub(crate) fn field(out: &mut String, name: &str) {
    out.push('[');
    identifier(out, name);
    out.push(']');
}

/// A finite number literal. Negative values use the unary minus operator.
pub(crate) fn number(out: &mut String, value: f64) {
    // Debug formatting is the shortest text that reads back to the same f64,
    // with an `e` exponent for very large or small values, as M allows.
    let _ = write!(out, "{value:?}");
}

/// Section member names must not contain `.`, `"`, tabs or line breaks, nor
/// leading or trailing blanks ([MS-QDEFF] 2.3.2); such characters become `_`.
pub(crate) fn member_name(name: &str) -> String {
    let replaced: String = name
        .chars()
        .map(|character| match character {
            '.' | '"' | '\t' | '\r' | '\n' => '_',
            other => other,
        })
        .collect();
    let trimmed = replaced.trim();

    if trimmed.is_empty() {
        String::from("Query")
    } else {
        trimmed.to_owned()
    }
}
