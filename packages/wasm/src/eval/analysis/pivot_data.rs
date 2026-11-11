//! `GETPIVOTDATA(data_field, pivot_table, [field1, item1, ...])`: a value
//! cell of a pivot table, named by its data field and row and column items.

use std::borrow::Cow;

use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{FormulaError, Value};

use super::super::matrix::range_from_ast;
use super::super::value::text_from_value;
use super::super::{EvalPass, EvalResult};

pub(crate) const NAMES: &[&str] = &["GETPIVOTDATA"];

/// The data field and the pivot reference come before the pairs.
const FIXED_ARGUMENTS: usize = 2;
/// Excel takes at most 126 field and item pairs.
const MAX_PAIRS: usize = 126;

pub(crate) fn evaluate_ast(
    store: &CellStore,
    _name: &str,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> EvalResult {
    pivot_data(store, args, sheet, pass, depth).unwrap_or_else(Value::Error)
}

fn pivot_data(
    store: &CellStore,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> Result<Value, FormulaError> {
    let pair_arguments = args.len().saturating_sub(FIXED_ARGUMENTS);
    if args.len() < FIXED_ARGUMENTS
        || !pair_arguments.is_multiple_of(2)
        || pair_arguments / 2 > MAX_PAIRS
    {
        return Err(FormulaError::Value);
    }

    let text = |ast: &Ast, pass: &mut EvalPass<'_>| {
        text_from_value(&store.eval_ast(ast, sheet, pass, depth + 1)).map(Cow::into_owned)
    };
    let data_field = text(&args[0], pass)?;

    // The pivot is the one whose output holds the reference's first cell. A
    // value that is not a reference names no pivot.
    let pivot_cell = match range_from_ast(&args[1], sheet) {
        Some(range) => range,
        None => {
            return match store.eval_ast(&args[1], sheet, pass, depth + 1) {
                Value::Error(error) => Err(error),
                _ => Err(FormulaError::Ref),
            }
        }
    };

    let mut items = Vec::with_capacity(pair_arguments / 2);
    let (pairs, _) = args[FIXED_ARGUMENTS..].as_chunks::<2>();
    for [field, item] in pairs {
        let field = text(field, pass)?;
        let item = match store.eval_ast(item, sheet, pass, depth + 1) {
            Value::Error(error) => return Err(error),
            item => item,
        };
        items.push((field, item));
    }

    store.pivot_data(
        pivot_cell.sheet as usize,
        (pivot_cell.row_start, pivot_cell.col_start),
        &data_field,
        &items,
    )
}
