//! AGGREGATE applies a built-in aggregate after it removes error values and
//! nested SUBTOTAL or AGGREGATE results.

use std::collections::{HashMap, HashSet};

use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};

use super::super::functions::{apply_func, FuncAccumulator};
use super::super::matrix::{optional_ast, range_from_ast, EvalMatrix};
use super::super::value::number_from_value;

pub(crate) const NAMES: &[&str] = &["AGGREGATE"];

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
    ignores_nested: bool,
}

impl Options {
    /// Options 0 to 3 ignore nested subtotals. Options 2, 3, 6, and 7 ignore
    /// errors. The odd options also ignore hidden rows, which the engine
    /// does not track.
    fn from_code(code: i64) -> Option<Self> {
        (0..=7).contains(&code).then_some(Self {
            ignores_errors: matches!(code, 2 | 3 | 6 | 7),
            ignores_nested: code <= 3,
        })
    }
}

fn operation(function_number: i64) -> Option<Func> {
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
        18 => Func::Analysis("PERCENTILE.EXC"),
        19 => Func::Analysis("QUARTILE.EXC"),
        _ => return None,
    })
}

pub(crate) fn evaluate_ast(
    store: &CellStore,
    _name: &str,
    args: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> EvalResult {
    let mut context = Context {
        store,
        sheet,
        affected,
        memo,
        visiting,
        depth: depth + 1,
    };
    match aggregate(args, &mut context) {
        Ok(value) => value,
        Err(error) => Value::Error(error),
    }
}

struct Context<'a> {
    store: &'a CellStore,
    sheet: usize,
    affected: &'a HashSet<AbsCellKey>,
    memo: &'a mut HashMap<AbsCellKey, EvalResult>,
    visiting: &'a mut HashSet<AbsCellKey>,
    depth: usize,
}

impl Context<'_> {
    fn scalar(&mut self, ast: &Ast) -> Value {
        self.store.eval_ast(
            ast,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth,
        )
    }

    fn code(&mut self, ast: Option<&Ast>, default: i64) -> Result<i64, FormulaError> {
        match ast {
            Some(ast) => Ok(number_from_value(&self.scalar(ast))?.trunc() as i64),
            None => Ok(default),
        }
    }

    fn matrix(&mut self, ast: &Ast) -> Result<EvalMatrix, FormulaError> {
        self.store.eval_matrix_arg(
            ast,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth,
        )
    }
}

fn aggregate(args: &[Ast], context: &mut Context<'_>) -> Result<Value, FormulaError> {
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
/// argument keeps its shape.
fn push_data(
    ast: &Ast,
    options: &Options,
    context: &mut Context<'_>,
    values: &mut FuncAccumulator,
) -> Result<(), FormulaError> {
    let range = range_from_ast(ast, context.sheet);
    if range.is_none() && !super::super::array::ast_produces_array(ast) {
        return Err(FormulaError::Value);
    }
    let matrix = context.matrix(ast)?;
    let formulas = range.filter(|_| options.ignores_nested).and_then(|range| {
        Some((
            range,
            &context.store.sheets.get(range.sheet as usize)?.formulas,
        ))
    });
    values.reserve(matrix.values.len())?;
    for (index, value) in matrix.values.iter().enumerate() {
        let is_nested = formulas.is_some_and(|(range, formulas)| {
            let row = range.row_start + (index / matrix.cols) as u32;
            let col = range.col_start + (index % matrix.cols) as u32;
            formulas
                .get(&(row, col))
                .and_then(|formula| formula.ast.as_ref())
                .is_some_and(contains_subtotal)
        });
        let is_ignored_error = options.ignores_errors && matches!(value, Value::Error(_));
        values.push_range(if is_nested || is_ignored_error {
            Value::Blank
        } else {
            value.clone()
        })?;
    }
    values.finish_arg_with_missing(matrix.rows, matrix.cols, false)
}

fn contains_subtotal(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::Subtotal, _) => true,
        Ast::Func(Func::Analysis(name), _) if NAMES.contains(name) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(contains_subtotal),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            contains_subtotal(left) || contains_subtotal(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => contains_subtotal(inner),
        Ast::LetSlot { expression, .. } => contains_subtotal(expression),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    const FORMULA_COLUMN: usize = 4;

    /// The Microsoft example data, starting in A1.
    fn microsoft_example() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 40);
        let first = [
            None,
            Some(72.0),
            Some(30.0),
            None,
            Some(31.0),
            Some(96.0),
            Some(32.0),
            Some(81.0),
            Some(33.0),
            Some(53.0),
            Some(34.0),
        ];
        let second = [
            82.0, 65.0, 95.0, 63.0, 53.0, 71.0, 55.0, 83.0, 100.0, 91.0, 89.0,
        ];
        for (row, (number, other)) in first.iter().zip(second).enumerate() {
            match number {
                Some(number) => store.set_number(sheet, row, 0, *number, 0),
                None if row == 0 => {
                    store.set_formula(sheet, row, 0, "=1/0", 0);
                }
                None => {
                    store.set_formula(sheet, row, 0, "=SQRT(-1)", 0);
                }
            }
            store.set_number(sheet, row, 1, other, 0);
        }
        (store, sheet)
    }

    fn results(store: &mut CellStore, sheet: usize, formulas: &[&str]) -> Vec<String> {
        for (row, formula) in formulas.iter().enumerate() {
            store.set_formula(sheet, row, FORMULA_COLUMN, formula, 0);
        }
        store.recompute(sheet);
        (0..formulas.len())
            .map(|row| {
                let cell = store.get_cell(sheet, row, FORMULA_COLUMN);
                cell.string().unwrap_or_else(|| cell.num().to_string())
            })
            .collect()
    }

    #[test]
    fn microsoft_examples_ignore_errors_and_require_k_for_array_functions() {
        // https://support.microsoft.com/en-us/excel/functions/aggregate-function
        let (mut store, sheet) = microsoft_example();
        let actual = results(
            &mut store,
            sheet,
            &[
                "=AGGREGATE(4,6,A1:A11)",
                "=AGGREGATE(14,6,A1:A11,3)",
                "=AGGREGATE(15,6,A1:A11)",
                "=AGGREGATE(12,6,A1:A11,B1:B11)",
                "=MAX(A1:A2)",
            ],
        );
        assert_eq!(actual, ["96", "72", "#VALUE!", "68", "#DIV/0!"]);
    }

    #[test]
    fn every_function_number_uses_its_named_function() {
        let (mut store, sheet) = microsoft_example();
        let cases = [
            (1, "AVERAGE", ""),
            (2, "COUNT", ""),
            (3, "COUNTA", ""),
            (4, "MAX", ""),
            (5, "MIN", ""),
            (6, "PRODUCT", ""),
            (7, "STDEV.S", ""),
            (8, "STDEV.P", ""),
            (9, "SUM", ""),
            (10, "VAR.S", ""),
            (11, "VAR.P", ""),
            (12, "MEDIAN", ""),
            (13, "MODE.SNGL", ""),
            (14, "LARGE", ",2"),
            (15, "SMALL", ",3"),
            (16, "PERCENTILE.INC", ",0.3"),
            (17, "QUARTILE.INC", ",1"),
            (18, "PERCENTILE.EXC", ",0.7"),
            (19, "QUARTILE.EXC", ",3"),
        ];
        let aggregates = cases
            .iter()
            .map(|(number, _, k)| format!("=AGGREGATE({number},6,B1:B11{k})"))
            .collect::<Vec<_>>();
        let named = cases
            .iter()
            .map(|(_, name, k)| format!("={name}(B1:B11{k})"))
            .collect::<Vec<_>>();
        let named_sources = named.iter().map(String::as_str).collect::<Vec<_>>();
        let aggregate_sources = aggregates.iter().map(String::as_str).collect::<Vec<_>>();
        let expected = results(&mut store, sheet, &named_sources);
        let actual = results(&mut store, sheet, &aggregate_sources);
        assert_eq!(actual, expected);
    }

    #[test]
    fn options_control_errors_and_nested_subtotals() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 12);
        store.set_number(sheet, 0, 0, 10.0, 0);
        store.set_number(sheet, 1, 0, 20.0, 0);
        store.set_formula(sheet, 2, 0, "=SUBTOTAL(9,A1:A2)*2", 0);
        store.set_formula(sheet, 3, 0, "=AGGREGATE(9,4,A1:A2)", 0);
        store.set_formula(sheet, 4, 0, "=1/0", 0);
        let actual = results(
            &mut store,
            sheet,
            &[
                "=AGGREGATE(9,2,A1:A5)",
                "=AGGREGATE(9,,A1:A4)",
                "=AGGREGATE(9,6,A1:A5)",
                "=AGGREGATE(9,4,A1:A5)",
                "=AGGREGATE(3,2,A1:A5)",
                "=AGGREGATE(9,6,A1:A2,A5)",
                "=AGGREGATE(20,6,A1:A2)",
                "=AGGREGATE(9,8,A1:A2)",
                "=AGGREGATE(9,6,5)",
                "=AGGREGATE(9,6)",
            ],
        );
        assert_eq!(
            actual,
            ["30", "30", "120", "#DIV/0!", "2", "30", "#VALUE!", "#VALUE!", "#VALUE!", "#VALUE!"]
        );
    }
}
