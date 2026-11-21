//! AGGREGATE applies a built-in aggregate after it removes error values,
//! hidden rows, and nested SUBTOTAL or AGGREGATE results, as its options say.

use crate::calc::{Ast, Func};
use crate::row_visibility::SkippedRows;
use crate::store::CellStore;
use crate::types::{EvalResult, FormulaError, Value};

use super::super::functions::{apply_func, FuncAccumulator};
use super::super::matrix::{optional_ast, range_from_ast, EvalMatrix};
use super::super::subtotal::SkippedCells;
use super::super::value::number_from_value;
use super::super::EvalPass;

family_functions! {
    AGGREGATE,
}

const FUNCTION_ARGUMENT: usize = 0;
const OPTIONS_ARGUMENT: usize = 1;
const FIRST_DATA_ARGUMENT: usize = 2;
/// The array form takes the function, the options, one array, and `k`.
const ARRAY_FORM_ARGUMENT_COUNT: usize = 4;
const MAX_ARGUMENT_COUNT: usize = 253;
/// Function numbers 14 and above use the array form.
const FIRST_ARRAY_FORM_FUNCTION: i64 = 14;

struct Options {
    ignores_errors: bool,
    skipped: SkippedCells,
}

impl Options {
    /// Options 0 to 3 ignore nested subtotals. Options 2, 3, 6, and 7 ignore
    /// errors. The odd options ignore hidden rows, whether a filter, a
    /// collapsed group or the user hid them.
    fn from_code(code: i64) -> Option<Self> {
        (0..=7).contains(&code).then_some(Self {
            ignores_errors: matches!(code, 2 | 3 | 6 | 7),
            skipped: SkippedCells {
                rows: (code % 2 == 1).then_some(SkippedRows::Hidden),
                nested_subtotals: code <= 3,
            },
        })
    }
}

const fn operation(function_number: i64) -> Option<Func> {
    Some(match function_number {
        1 => Func::Avg,
        2 => Func::Count,
        3 => Func::CountA,
        4 => Func::Max,
        5 => Func::Min,
        6 => Func::Product,
        7 => Func::StdevS,
        8 => Func::StdevP,
        9 => Func::Sum,
        10 => Func::VarS,
        11 => Func::VarP,
        12 => Func::Median,
        13 => Func::ModeSngl,
        14 => Func::Large,
        15 => Func::Small,
        16 => Func::PercentileInc,
        17 => Func::QuartileInc,
        18 => Func::Analysis(super::PERCENTILE_EXC_ID),
        19 => Func::Analysis(super::QUARTILE_EXC_ID),
        _ => return None,
    })
}

pub(crate) fn evaluate_ast(
    store: &CellStore,
    _: Function,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> EvalResult {
    let mut context = Context {
        store,
        sheet,
        pass,
        depth,
    };
    match aggregate(args, &mut context) {
        Ok(value) => value,
        Err(error) => Value::Error(error),
    }
}

struct Context<'a, 'p> {
    store: &'a CellStore,
    sheet: usize,
    pass: &'a mut EvalPass<'p>,
    /// Depth of the AGGREGATE call; its arguments evaluate one level deeper.
    depth: usize,
}

impl Context<'_, '_> {
    fn scalar(&mut self, ast: &Ast) -> Value {
        self.store
            .eval_ast(ast, self.sheet, self.pass, self.depth + 1)
    }

    fn code(&mut self, ast: Option<&Ast>, default: i64) -> Result<i64, FormulaError> {
        match ast {
            Some(code_ast) => Ok(number_from_value(&self.scalar(code_ast))?.trunc() as i64),
            None => Ok(default),
        }
    }

    fn matrix(&mut self, ast: &Ast) -> Result<EvalMatrix, FormulaError> {
        self.store
            .eval_matrix_arg(ast, self.sheet, self.pass, self.depth + 1)
    }
}

fn aggregate(args: &[Ast], context: &mut Context<'_, '_>) -> Result<Value, FormulaError> {
    if args.len() <= FIRST_DATA_ARGUMENT || args.len() > MAX_ARGUMENT_COUNT {
        return Err(FormulaError::Value);
    }
    let function_number = context.code(optional_ast(args, FUNCTION_ARGUMENT), -1)?;
    let options = Options::from_code(context.code(optional_ast(args, OPTIONS_ARGUMENT), 0)?)
        .ok_or(FormulaError::Value)?;
    let func = operation(function_number).ok_or(FormulaError::Value)?;
    let array_form = function_number >= FIRST_ARRAY_FORM_FUNCTION;
    if array_form && args.len() != ARRAY_FORM_ARGUMENT_COUNT {
        return Err(FormulaError::Value);
    }
    let data_end = if array_form {
        FIRST_DATA_ARGUMENT + 1
    } else {
        args.len()
    };
    let mut values = FuncAccumulator::default();
    for ast in &args[FIRST_DATA_ARGUMENT..data_end] {
        push_data(ast, &options, context, &mut values)?;
    }
    if array_form {
        values.push_scalar(context.scalar(&args[FIRST_DATA_ARGUMENT + 1]))?;
        values.finish_arg_with_missing(1, 1, false)?;
    }
    Ok(apply_func(func, &values))
}

/// Ignored cells become blanks, which every selectable function skips, so the
/// argument keeps its shape. Only a reference has rows and formulas to skip.
fn push_data(
    ast: &Ast,
    options: &Options,
    context: &mut Context<'_, '_>,
    values: &mut FuncAccumulator,
) -> Result<(), FormulaError> {
    let names = context.store.name_scope(context.sheet);
    let range = range_from_ast(ast, names);
    if range.is_none() && !super::super::array::ast_produces_array(ast, context.pass.shapes(names))
    {
        return Err(FormulaError::Value);
    }
    let matrix = context.matrix(ast)?;
    let source =
        range.and_then(|area| Some((area, context.store.sheets.get(area.sheet as usize)?)));
    values.reserve(matrix.values.len())?;
    let mut hidden = source.map(|(_, sheet)| options.skipped.hidden_rows(sheet));
    for (index, value) in matrix.values.iter().enumerate() {
        let is_skipped = source.is_some_and(|(range, sheet)| {
            let row = range.row_start + (index / matrix.cols) as u32;
            let col = range.col_start + (index % matrix.cols) as u32;
            hidden.as_mut().is_some_and(|rows| rows.skips(row))
                || options
                    .skipped
                    .skips_cell(sheet, row, col, &context.store.formula_slots)
        });
        let is_ignored_error = options.ignores_errors && matches!(value, Value::Error(_));
        values.push_range(if is_skipped || is_ignored_error {
            Value::Blank
        } else {
            value.clone()
        })?;
    }
    values.finish_arg_with_missing(matrix.rows, matrix.cols, false)
}
