//! Byte, width and Thai text functions of the full engine: `LENB`, `LEFTB`,
//! `RIGHTB`, `MIDB`, `REPLACEB`, `FINDB`, `SEARCHB`, `ASC`, `DBCS` and
//! `BAHTTEXT`.
//!
//! The byte functions count one byte per character, as Excel does when the
//! default editing language is not a double-byte language, so each one
//! evaluates with its character function.

mod baht;
mod width;

use super::super::functions::{apply_func, require_arity, text_arg, FuncAccumulator};
use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

family_functions! {
    ASC,
    BAHTTEXT,
    DBCS,
    FINDB,
    LEFTB,
    LENB,
    MIDB,
    REPLACEB,
    RIGHTB,
    SEARCHB,
}

/// The longest text a width conversion may return, as for other text
/// functions.
const MAX_TEXT_OUTPUT_BYTES: usize = 16 * 1024 * 1024;

pub(crate) fn evaluate(function: Function, values: &FuncAccumulator) -> EvalResult {
    let character_function = match function {
        Function::LENB => Func::Len,
        Function::LEFTB => Func::Left,
        Function::RIGHTB => Func::Right,
        Function::MIDB => Func::Mid,
        Function::REPLACEB => Func::Replace,
        Function::FINDB => Func::Find,
        Function::SEARCHB => Func::Search,
        Function::ASC => return convert_width(values, width::half_width),
        Function::DBCS => return convert_width(values, width::full_width),
        Function::BAHTTEXT => return baht::baht_text(values),
    };

    apply_func(character_function, values)
}

fn convert_width(values: &FuncAccumulator, convert: fn(&str) -> String) -> EvalResult {
    let result = require_arity(values, 1, 1)
        .and_then(|_| text_arg(values, 0, None))
        .and_then(|text| {
            let converted = convert(&text);

            if converted.len() > MAX_TEXT_OUTPUT_BYTES {
                Err(FormulaError::Num)
            } else {
                Ok(Value::text(converted))
            }
        });

    result.unwrap_or_else(Value::Error)
}
