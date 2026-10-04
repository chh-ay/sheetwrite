//! Dynamic array reshaping for the full engine: TOCOL, TOROW, WRAPROWS,
//! WRAPCOLS, EXPAND, HSTACK, and VSTACK.
//!
//! `shape` and `bound` read only argument shapes and literal numbers. The
//! engine calls them before it recalculates cells, so cell values can be out of
//! date there. When every size argument is a literal, they give the exact size
//! of the result. Otherwise `shape` gives a size that the limits accept and
//! `bound` gives an upper bound of cells.

use std::collections::{HashMap, HashSet};
use std::mem::size_of;

use super::super::array::ast_produces_array;
use super::super::matrix::{
    optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_BYTES, SPILL_MAX_CELLS, SPILL_MAX_COLS,
    SPILL_MAX_RECOMPUTE_CELLS, SPILL_MAX_ROWS,
};
use super::super::value::{bool_from_value, number_from_value};
use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &[
    "EXPAND", "HSTACK", "TOCOL", "TOROW", "VSTACK", "WRAPCOLS", "WRAPROWS",
];

/// Largest TOCOL and TOROW `ignore` code: 1 skips blanks, 2 skips errors.
const MAX_IGNORE_CODE: f64 = 3.0;
const IGNORE_BLANKS: u8 = 1;
const IGNORE_ERRORS: u8 = 2;

/// An EXPAND size above every spill limit. `validate_shape` rejects it.
const OVERSIZED: usize = SPILL_MAX_ROWS + 1;

fn check_arity(name: &str, args: &[Ast]) -> Result<(), FormulaError> {
    let is_valid = match name {
        "HSTACK" | "VSTACK" => !args.is_empty(),
        "TOCOL" | "TOROW" => (1..=3).contains(&args.len()),
        "WRAPCOLS" | "WRAPROWS" => (2..=3).contains(&args.len()),
        "EXPAND" => (2..=4).contains(&args.len()),
        _ => false,
    };
    if is_valid {
        Ok(())
    } else {
        Err(FormulaError::Value)
    }
}

/// The arguments that hold arrays: all of them for the stacks, else the first.
fn sources<'a>(name: &str, args: &'a [Ast]) -> &'a [Ast] {
    if matches!(name, "HSTACK" | "VSTACK") {
        args
    } else {
        &args[..1]
    }
}

fn is_array_argument(ast: &Ast, sheet: usize) -> bool {
    range_from_ast(ast, sheet).is_some() || ast_produces_array(ast)
}

/// Excel shows a blank source cell as 0 in a reshaped array.
fn output_value(value: &Value) -> Value {
    match value {
        Value::Blank => Value::Number(0.0),
        other => other.clone(),
    }
}

// ---------------------------------------------------------------------------
// Static size estimate for `shape` and `bound`.
// ---------------------------------------------------------------------------

/// A scalar argument as the parser left it.
enum StaticArgument {
    Omitted,
    Literal(f64),
    Computed,
}

fn literal_number(ast: &Ast) -> Option<f64> {
    match ast {
        Ast::Num(value) if value.is_finite() => Some(*value),
        Ast::Bool(value) => Some(if *value { 1.0 } else { 0.0 }),
        Ast::Neg(inner) => literal_number(inner).map(|value| -value),
        Ast::Pos(inner) => literal_number(inner),
        _ => None,
    }
}

fn static_argument(args: &[Ast], index: usize) -> StaticArgument {
    match optional_ast(args, index) {
        None => StaticArgument::Omitted,
        Some(ast) => literal_number(ast).map_or(StaticArgument::Computed, StaticArgument::Literal),
    }
}

/// Size of a result before evaluation.
enum Estimate {
    /// `evaluate` returns this size or a source error.
    Exact { rows: usize, cols: usize },
    /// A size inside the spill limits, and an upper bound of result cells.
    Approximate {
        rows: usize,
        cols: usize,
        max_cells: usize,
    },
    /// A source has no static shape.
    Unknown,
}

/// Rows and columns of a source argument, or `None` when only evaluation can
/// tell.
fn source_extent(
    store: &CellStore,
    ast: &Ast,
    sheet: usize,
) -> Result<Option<(usize, usize)>, FormulaError> {
    if !is_array_argument(ast, sheet) {
        return Ok(Some((1, 1)));
    }
    if let Ast::Func(Func::Analysis(name), args) = ast {
        if NAMES.binary_search(name).is_ok() {
            return Ok(match estimate(store, name, args, sheet)? {
                Estimate::Exact { rows, cols } => Some((rows, cols)),
                Estimate::Approximate { .. } | Estimate::Unknown => None,
            });
        }
    }
    match store.matrix_shape(ast, sheet) {
        Ok((rows, cols, _)) => Ok(Some((rows, cols))),
        Err(error) if range_from_ast(ast, sheet).is_some() => Err(error),
        Err(_) => match store.dynamic_array_bound(ast, sheet) {
            Some(Err(error)) => Err(error),
            Some(Ok(_)) | None => Ok(None),
        },
    }
}

/// Literal EXPAND size, when it is not below the source size.
fn literal_expand_size(argument: StaticArgument, source: usize) -> Option<usize> {
    match argument {
        StaticArgument::Omitted => Some(source),
        StaticArgument::Literal(value) if value.trunc() >= source as f64 => {
            Some(if value > SPILL_MAX_ROWS as f64 {
                OVERSIZED
            } else {
                value as usize
            })
        }
        StaticArgument::Literal(_) | StaticArgument::Computed => None,
    }
}

/// Columns per row (WRAPROWS) or rows per column (WRAPCOLS), and the count of
/// rows or columns that the wrap makes.
fn wrap_extent(cells: usize, wrap_count: f64) -> (usize, usize) {
    let wrap = if wrap_count >= cells as f64 {
        cells
    } else {
        wrap_count as usize
    };
    (wrap, cells.div_ceil(wrap))
}

fn stack_extent(
    name: &str,
    extents: impl Iterator<Item = Result<Option<(usize, usize)>, FormulaError>>,
) -> Result<Option<(usize, usize)>, FormulaError> {
    let is_horizontal = name == "HSTACK";
    let mut joined = 0usize;
    let mut widest = 0usize;
    for extent in extents {
        let Some((rows, cols)) = extent? else {
            return Ok(None);
        };
        let (along, across) = if is_horizontal {
            (cols, rows)
        } else {
            (rows, cols)
        };
        joined = joined.checked_add(along).ok_or(FormulaError::Num)?;
        widest = widest.max(across);
    }
    Ok(Some(if is_horizontal {
        (widest, joined)
    } else {
        (joined, widest)
    }))
}

fn estimate(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
) -> Result<Estimate, FormulaError> {
    check_arity(name, args)?;
    if matches!(name, "HSTACK" | "VSTACK") {
        return Ok(
            match stack_extent(
                name,
                args.iter().map(|ast| source_extent(store, ast, sheet)),
            )? {
                Some((rows, cols)) => Estimate::Exact { rows, cols },
                None => Estimate::Unknown,
            },
        );
    }
    let Some((source_rows, source_cols)) = source_extent(store, &args[0], sheet)? else {
        return Ok(Estimate::Unknown);
    };
    let cells = source_rows
        .checked_mul(source_cols)
        .ok_or(FormulaError::Num)?;
    Ok(match name {
        "TOCOL" | "TOROW" => {
            let keeps_all = match static_argument(args, 1) {
                StaticArgument::Omitted => true,
                StaticArgument::Literal(ignore) => ignore.trunc() == 0.0,
                StaticArgument::Computed => false,
            };
            let scan_is_static = !matches!(static_argument(args, 2), StaticArgument::Computed);
            match (name, keeps_all && scan_is_static) {
                ("TOCOL", true) => Estimate::Exact {
                    rows: cells,
                    cols: 1,
                },
                ("TOCOL", false) => Estimate::Approximate {
                    rows: cells,
                    cols: 1,
                    max_cells: cells,
                },
                (_, true) => Estimate::Exact {
                    rows: 1,
                    cols: cells,
                },
                (_, false) => Estimate::Approximate {
                    rows: 1,
                    cols: cells.min(SPILL_MAX_COLS),
                    max_cells: cells,
                },
            }
        }
        "WRAPCOLS" | "WRAPROWS" => {
            let is_vector = source_rows == 1 || source_cols == 1;
            match static_argument(args, 1) {
                StaticArgument::Literal(wrap_count) if is_vector && wrap_count.trunc() >= 1.0 => {
                    let (wrap, length) = wrap_extent(cells, wrap_count.trunc());
                    let (rows, cols) = if name == "WRAPROWS" {
                        (length, wrap)
                    } else {
                        (wrap, length)
                    };
                    Estimate::Exact { rows, cols }
                }
                // Any wrap gives fewer than twice the source cells.
                _ => Estimate::Approximate {
                    rows: cells,
                    cols: 1,
                    max_cells: cells.saturating_mul(2).saturating_sub(1),
                },
            }
        }
        "EXPAND" => match (
            literal_expand_size(static_argument(args, 1), source_rows),
            literal_expand_size(static_argument(args, 2), source_cols),
        ) {
            (Some(rows), Some(cols)) => Estimate::Exact { rows, cols },
            _ => Estimate::Approximate {
                rows: source_rows,
                cols: source_cols,
                max_cells: SPILL_MAX_CELLS,
            },
        },
        _ => return Err(FormulaError::Value),
    })
}

pub(super) fn produces_array(_: &str, _: &[Ast]) -> bool {
    true
}

pub(super) fn shape(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
) -> Result<(usize, usize, usize), FormulaError> {
    let (rows, cols) = match estimate(store, name, args, sheet)? {
        Estimate::Exact { rows, cols } => (rows, cols),
        Estimate::Approximate {
            rows,
            cols,
            max_cells,
        } => {
            if matches!(name, "TOCOL" | "TOROW") {
                (rows, cols)
            } else {
                (max_cells.min(SPILL_MAX_CELLS), 1)
            }
        }
        Estimate::Unknown => (SPILL_MAX_CELLS, 1),
    };
    let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
    Ok((rows, cols, cells))
}

pub(super) fn bound(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
) -> Result<usize, FormulaError> {
    match estimate(store, name, args, sheet)? {
        Estimate::Exact { rows, cols } => EvalMatrix::validate_shape(rows, cols, 1, 0),
        Estimate::Approximate { max_cells, .. } => Ok(max_cells.min(SPILL_MAX_CELLS)),
        Estimate::Unknown => Ok(SPILL_MAX_CELLS),
    }
}

// ---------------------------------------------------------------------------
// Evaluation.
// ---------------------------------------------------------------------------

struct Evaluation<'a> {
    store: &'a CellStore,
    args: &'a [Ast],
    sheet: usize,
    affected: &'a HashSet<AbsCellKey>,
    memo: &'a mut HashMap<AbsCellKey, EvalResult>,
    visiting: &'a mut HashSet<AbsCellKey>,
    depth: usize,
}

impl Evaluation<'_> {
    fn scalar(&mut self, index: usize) -> Option<Value> {
        let ast = optional_ast(self.args, index)?;
        Some(self.store.eval_ast(
            ast,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth + 1,
        ))
    }

    fn source(&mut self, ast: &Ast) -> Result<EvalMatrix, FormulaError> {
        if is_array_argument(ast, self.sheet) {
            self.store.eval_matrix_arg(
                ast,
                self.sheet,
                self.affected,
                self.memo,
                self.visiting,
                self.depth + 1,
            )
        } else {
            let value = self.store.eval_ast(
                ast,
                self.sheet,
                self.affected,
                self.memo,
                self.visiting,
                self.depth + 1,
            );
            Ok(EvalMatrix::new(1, 1, vec![value]))
        }
    }

    fn pad(&mut self, index: usize) -> Value {
        self.scalar(index)
            .map_or(Value::Error(FormulaError::Na), |value| output_value(&value))
    }
}

/// Source matrices, and the bytes that they hold while the result is built.
struct Inputs {
    matrices: Vec<EvalMatrix>,
    cells: usize,
    bytes: usize,
}

impl Inputs {
    fn read(evaluation: &mut Evaluation<'_>, name: &str) -> Result<Self, FormulaError> {
        let args = evaluation.args;
        let mut inputs = Inputs {
            matrices: Vec::with_capacity(sources(name, args).len()),
            cells: 0,
            bytes: 0,
        };
        for ast in sources(name, args) {
            let matrix = evaluation.source(ast)?;
            let bytes = matrix.values.iter().try_fold(
                matrix
                    .values
                    .capacity()
                    .checked_mul(size_of::<Value>())
                    .ok_or(FormulaError::Num)?,
                |bytes, value| {
                    bytes
                        .checked_add(match value {
                            Value::Text(text) => text.len(),
                            _ => 0,
                        })
                        .ok_or(FormulaError::Num)
                },
            )?;
            inputs.cells = inputs
                .cells
                .checked_add(matrix.values.len())
                .ok_or(FormulaError::Num)?;
            inputs.bytes = inputs.bytes.checked_add(bytes).ok_or(FormulaError::Num)?;
            if inputs.cells > SPILL_MAX_RECOMPUTE_CELLS || inputs.bytes > SPILL_MAX_BYTES {
                return Err(FormulaError::Num);
            }
            inputs.matrices.push(matrix);
        }
        Ok(inputs)
    }

    /// Checks the result size against the spill and work limits, and reserves
    /// its values.
    fn reserve(&self, rows: usize, cols: usize) -> Result<Output, FormulaError> {
        let cells = EvalMatrix::validate_shape(rows, cols, 1, self.bytes)?;
        if self
            .cells
            .checked_add(cells)
            .is_none_or(|work| work > SPILL_MAX_RECOMPUTE_CELLS)
        {
            return Err(FormulaError::Num);
        }
        let mut values = Vec::new();
        values
            .try_reserve_exact(cells)
            .map_err(|_| FormulaError::Num)?;
        let bytes = self
            .bytes
            .checked_add(cells * size_of::<Value>())
            .ok_or(FormulaError::Num)?;
        Ok(Output { values, bytes })
    }
}

/// Counts text payloads before cloning them, while all inputs remain live.
struct Output {
    values: Vec<Value>,
    bytes: usize,
}

impl Output {
    fn push(&mut self, value: &Value) -> Result<(), FormulaError> {
        if let Value::Text(text) = value {
            self.bytes = self
                .bytes
                .checked_add(text.len())
                .ok_or(FormulaError::Num)?;
            if self.bytes > SPILL_MAX_BYTES {
                return Err(FormulaError::Num);
            }
        }
        self.values.push(output_value(value));
        Ok(())
    }
}

pub(super) fn evaluate(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> Result<EvalMatrix, FormulaError> {
    check_arity(name, args)?;
    let mut evaluation = Evaluation {
        store,
        args,
        sheet,
        affected,
        memo,
        visiting,
        depth,
    };
    let inputs = Inputs::read(&mut evaluation, name)?;
    match name {
        "TOCOL" | "TOROW" => flatten(&mut evaluation, name, &inputs),
        "WRAPCOLS" | "WRAPROWS" => wrap(&mut evaluation, name, &inputs),
        "EXPAND" => expand(&mut evaluation, &inputs),
        _ => stack(name, &inputs),
    }
}

fn flatten(
    evaluation: &mut Evaluation<'_>,
    name: &str,
    inputs: &Inputs,
) -> Result<EvalMatrix, FormulaError> {
    let ignore = match evaluation.scalar(1) {
        None => 0.0,
        Some(value) => number_from_value(&value)?.trunc(),
    };
    if !(0.0..=MAX_IGNORE_CODE).contains(&ignore) {
        return Err(FormulaError::Value);
    }
    let ignore = ignore as u8;
    let scan_by_column = evaluation
        .scalar(2)
        .map_or(Ok(false), |value| bool_from_value(&value))?;
    let source = &inputs.matrices[0];
    let mut values = inputs.reserve(source.values.len(), 1)?;
    for index in 0..source.values.len() {
        let position = if scan_by_column {
            (index % source.rows) * source.cols + index / source.rows
        } else {
            index
        };
        let value = &source.values[position];
        let is_skipped = match value {
            Value::Blank => ignore & IGNORE_BLANKS != 0,
            Value::Error(_) => ignore & IGNORE_ERRORS != 0,
            _ => false,
        };
        if !is_skipped {
            values.push(value)?;
        }
    }
    if values.values.is_empty() {
        return Err(FormulaError::Calc);
    }
    let (rows, cols) = if name == "TOCOL" {
        (values.values.len(), 1)
    } else {
        (1, values.values.len())
    };
    EvalMatrix::validate_shape(rows, cols, 1, inputs.bytes)?;
    Ok(EvalMatrix::new(rows, cols, values.values))
}

fn wrap(
    evaluation: &mut Evaluation<'_>,
    name: &str,
    inputs: &Inputs,
) -> Result<EvalMatrix, FormulaError> {
    let source = &inputs.matrices[0];
    if source.rows != 1 && source.cols != 1 {
        return Err(FormulaError::Value);
    }
    let wrap_count = match evaluation.scalar(1) {
        None => 0.0,
        Some(value) => number_from_value(&value)?.trunc(),
    };
    if wrap_count < 1.0 {
        return Err(FormulaError::Num);
    }
    let pad = evaluation.pad(2);
    let (wrap, length) = wrap_extent(source.values.len(), wrap_count);
    let is_by_row = name == "WRAPROWS";
    let (rows, cols) = if is_by_row {
        (length, wrap)
    } else {
        (wrap, length)
    };
    let mut values = inputs.reserve(rows, cols)?;
    for row in 0..rows {
        for col in 0..cols {
            let position = if is_by_row {
                row * cols + col
            } else {
                col * rows + row
            };
            values.push(source.values.get(position).unwrap_or(&pad))?;
        }
    }
    Ok(EvalMatrix::new(rows, cols, values.values))
}

/// EXPAND size: the source size when omitted, `#VALUE!` below it.
fn expand_size(value: Option<Value>, source: usize) -> Result<usize, FormulaError> {
    let Some(value) = value else {
        return Ok(source);
    };
    if matches!(value, Value::Blank) {
        return Ok(source);
    }
    let requested = number_from_value(&value)?.trunc();
    if requested < source as f64 {
        return Err(FormulaError::Value);
    }
    Ok(if requested > SPILL_MAX_ROWS as f64 {
        OVERSIZED
    } else {
        requested as usize
    })
}

fn expand(evaluation: &mut Evaluation<'_>, inputs: &Inputs) -> Result<EvalMatrix, FormulaError> {
    let source = &inputs.matrices[0];
    let rows = expand_size(evaluation.scalar(1), source.rows)?;
    let cols = expand_size(evaluation.scalar(2), source.cols)?;
    let mut values = inputs.reserve(rows, cols)?;
    let pad = evaluation.pad(3);
    for row in 0..rows {
        for col in 0..cols {
            values.push(source.get(row, col).unwrap_or(&pad))?;
        }
    }
    Ok(EvalMatrix::new(rows, cols, values.values))
}

fn stack(name: &str, inputs: &Inputs) -> Result<EvalMatrix, FormulaError> {
    let (rows, cols) = stack_extent(
        name,
        inputs
            .matrices
            .iter()
            .map(|matrix| Ok(Some((matrix.rows, matrix.cols)))),
    )?
    .ok_or(FormulaError::Value)?;
    let mut values = inputs.reserve(rows, cols)?;
    let pad = Value::Error(FormulaError::Na);
    if name == "HSTACK" {
        for row in 0..rows {
            for matrix in &inputs.matrices {
                if row < matrix.rows {
                    let start = row * matrix.cols;
                    for value in &matrix.values[start..start + matrix.cols] {
                        values.push(value)?;
                    }
                } else {
                    for _ in 0..matrix.cols {
                        values.push(&pad)?;
                    }
                }
            }
        }
    } else {
        for matrix in &inputs.matrices {
            for row in matrix.values.chunks(matrix.cols) {
                for value in row {
                    values.push(value)?;
                }
                for _ in 0..cols - matrix.cols {
                    values.push(&pad)?;
                }
            }
        }
    }
    Ok(EvalMatrix::new(rows, cols, values.values))
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;
    use crate::types::KIND_EMPTY;

    /// Column of the formula under test, right of every data range.
    const RESULT_COL: usize = 12;
    const SHEET_COLS: usize = 24;
    const SHEET_ROWS: usize = 40;

    /// Puts `input` in a cell: `=` starts a formula, a number is a number, an
    /// empty string leaves the cell blank, and other text is text.
    fn put(store: &mut CellStore, sheet: usize, row: usize, col: usize, input: &str) {
        if input.is_empty() {
            return;
        }
        if input.starts_with('=') {
            store.set_formula(sheet, row, col, input, 0);
        } else if let Ok(number) = input.parse::<f64>() {
            store.set_number(sheet, row, col, number, 0);
        } else {
            store.set_string(sheet, row, col, input, 0);
        }
    }

    fn shown(store: &CellStore, sheet: usize, row: usize, col: usize) -> String {
        let cell = store.get_cell(sheet, row, col);
        match cell.string() {
            Some(text) => text,
            None if cell.kind() == KIND_EMPTY => String::new(),
            None => cell.num().to_string(),
        }
    }

    /// The result of the formula in the result column: its whole spill, or the
    /// single cell when it does not spill.
    fn result(store: &CellStore, sheet: usize) -> Vec<Vec<String>> {
        let is_spill_cell = |row: usize, col: usize| {
            store.spill_anchor_row(sheet, row, col) == 0
                && store.spill_anchor_col(sheet, row, col) == RESULT_COL as u32
        };
        if !is_spill_cell(0, RESULT_COL) {
            return vec![vec![shown(store, sheet, 0, RESULT_COL)]];
        }
        let rows = (0..SHEET_ROWS)
            .take_while(|&row| is_spill_cell(row, RESULT_COL))
            .count();
        let cols = (RESULT_COL..SHEET_COLS)
            .take_while(|&col| is_spill_cell(0, col))
            .count();
        (0..rows)
            .map(|row| {
                (RESULT_COL..RESULT_COL + cols)
                    .map(|col| shown(store, sheet, row, col))
                    .collect()
            })
            .collect()
    }

    fn sheet_with(data: &[&[&str]]) -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(SHEET_COLS, SHEET_ROWS);
        for (row, cells) in data.iter().enumerate() {
            for (col, input) in cells.iter().enumerate() {
                put(&mut store, sheet, row, col, input);
            }
        }
        (store, sheet)
    }

    fn evaluate(data: &[&[&str]], formula: &str) -> Vec<Vec<String>> {
        let (mut store, sheet) = sheet_with(data);
        store.set_formula(sheet, 0, RESULT_COL, formula, 0);
        store.recompute(sheet);
        result(&store, sheet)
    }

    fn grid(rows: &[&[&str]]) -> Vec<Vec<String>> {
        rows.iter()
            .map(|row| row.iter().map(|cell| cell.to_string()).collect())
            .collect()
    }

    fn column(cells: &[&str]) -> Vec<Vec<String>> {
        cells.iter().map(|cell| vec![cell.to_string()]).collect()
    }

    const NAMES_TABLE: &[&[&str]] = &[
        &["Ben", "Peter", "Mary", "Sam"],
        &["John", "Hillary", "Jenny", "James"],
        &["Agnes", "Harry", "Felicity", "Joe"],
    ];
    const NAMES_WITH_BLANKS: &[&[&str]] = &[
        &["Ben", "Peter", "Mary", "Sam"],
        &["John", "Hillary", "Jenny", "James"],
        &["Agnes", "Harry", "", ""],
    ];

    #[test]
    fn flatten_matches_microsoft_examples() {
        // https://support.microsoft.com/en-us/excel/functions/tocol-function
        assert_eq!(
            evaluate(NAMES_TABLE, "=TOCOL(A1:D3)"),
            column(&[
                "Ben", "Peter", "Mary", "Sam", "John", "Hillary", "Jenny", "James", "Agnes",
                "Harry", "Felicity", "Joe",
            ])
        );
        assert_eq!(
            evaluate(NAMES_WITH_BLANKS, "=TOCOL(A1:D3)"),
            column(&[
                "Ben", "Peter", "Mary", "Sam", "John", "Hillary", "Jenny", "James", "Agnes",
                "Harry", "0", "0",
            ])
        );
        assert_eq!(
            evaluate(NAMES_WITH_BLANKS, "=TOCOL(A1:D3,1)"),
            column(&[
                "Ben", "Peter", "Mary", "Sam", "John", "Hillary", "Jenny", "James", "Agnes",
                "Harry"
            ])
        );
        assert_eq!(
            evaluate(NAMES_WITH_BLANKS, "=TOCOL(A1:D3,1,TRUE)"),
            column(&[
                "Ben", "John", "Agnes", "Peter", "Hillary", "Harry", "Mary", "Jenny", "Sam",
                "James"
            ])
        );
        // https://support.microsoft.com/en-us/excel/functions/torow-function
        assert_eq!(
            evaluate(NAMES_WITH_BLANKS, "=TOROW(A1:D3,1,TRUE)"),
            grid(&[&[
                "Ben", "John", "Agnes", "Peter", "Hillary", "Harry", "Mary", "Jenny", "Sam",
                "James"
            ]])
        );
    }

    #[test]
    fn flatten_ignores_errors_on_request() {
        let data: &[&[&str]] = &[&["1", "=1/0", ""], &["", "=NA()", "2"]];
        assert_eq!(
            evaluate(data, "=TOROW(A1:C2,2)"),
            grid(&[&["1", "0", "0", "2"]])
        );
        assert_eq!(evaluate(data, "=TOROW(A1:C2,3)"), grid(&[&["1", "2"]]));
        assert_eq!(
            evaluate(data, "=TOROW(A1:C2)"),
            grid(&[&["1", "#DIV/0!", "0", "0", "#N/A", "2"]])
        );
    }

    #[test]
    fn wrap_matches_microsoft_examples() {
        let letters: &[&[&str]] = &[&["A", "B", "C", "D", "E", "F", "G"]];
        // https://support.microsoft.com/en-us/excel/functions/wraprows-function
        assert_eq!(
            evaluate(letters, "=WRAPROWS(A1:G1,3)"),
            grid(&[&["A", "B", "C"], &["D", "E", "F"], &["G", "#N/A", "#N/A"]])
        );
        assert_eq!(
            evaluate(letters, "=WRAPROWS(A1:G1,3,\"x\")"),
            grid(&[&["A", "B", "C"], &["D", "E", "F"], &["G", "x", "x"]])
        );
        // https://support.microsoft.com/en-us/excel/functions/wrapcols-function
        assert_eq!(
            evaluate(letters, "=WRAPCOLS(A1:G1,3,\"x\")"),
            grid(&[&["A", "D", "G"], &["B", "E", "x"], &["C", "F", "x"]])
        );
        // A wrap count at or above the length returns the vector in one row.
        assert_eq!(
            evaluate(letters, "=WRAPROWS(A1:C1,5)"),
            grid(&[&["A", "B", "C"]])
        );
    }

    #[test]
    fn expand_matches_microsoft_examples() {
        // https://support.microsoft.com/en-us/excel/functions/expand-function
        let data: &[&[&str]] = &[&["1", "2"], &["3", "4"]];
        assert_eq!(
            evaluate(data, "=EXPAND(A1:B2,3,3)"),
            grid(&[
                &["1", "2", "#N/A"],
                &["3", "4", "#N/A"],
                &["#N/A", "#N/A", "#N/A"]
            ])
        );
        assert_eq!(
            evaluate(data, "=EXPAND(A1,3,3,\"-\")"),
            grid(&[&["1", "-", "-"], &["-", "-", "-"], &["-", "-", "-"]])
        );
        assert_eq!(
            evaluate(data, "=EXPAND(A1:B2,,3)"),
            grid(&[&["1", "2", "#N/A"], &["3", "4", "#N/A"]])
        );
        assert_eq!(evaluate(data, "=EXPAND(A1:B2,C1,C1)"), grid(data));
    }

    #[test]
    fn stacks_match_microsoft_examples() {
        // https://support.microsoft.com/en-us/excel/functions/hstack-function
        let pairs: &[&[&str]] = &[
            &["A", "B", "C", "", "AA", "BB", "CC"],
            &["D", "E", "F", "", "DD", "EE", "FF"],
        ];
        assert_eq!(
            evaluate(pairs, "=HSTACK(A1:C2,E1:G2)"),
            grid(&[
                &["A", "B", "C", "AA", "BB", "CC"],
                &["D", "E", "F", "DD", "EE", "FF"]
            ])
        );
        let uneven: &[&[&str]] = &[
            &["1", "2", "A", "B", "X", "Y"],
            &["3", "4", "C", "D"],
            &["5", "6"],
        ];
        assert_eq!(
            evaluate(uneven, "=HSTACK(A1:B3,C1:D2,E1:F1)"),
            grid(&[
                &["1", "2", "A", "B", "X", "Y"],
                &["3", "4", "C", "D", "#N/A", "#N/A"],
                &["5", "6", "#N/A", "#N/A", "#N/A", "#N/A"],
            ])
        );
        // https://support.microsoft.com/en-us/excel/functions/vstack-function
        assert_eq!(
            evaluate(pairs, "=VSTACK(A1:C2,E1:G2)"),
            grid(&[
                &["A", "B", "C"],
                &["D", "E", "F"],
                &["AA", "BB", "CC"],
                &["DD", "EE", "FF"]
            ])
        );
        assert_eq!(
            evaluate(uneven, "=VSTACK(A1:B3,C1:D2,E1:F1)"),
            grid(&[
                &["1", "2"],
                &["3", "4"],
                &["5", "6"],
                &["A", "B"],
                &["C", "D"],
                &["X", "Y"]
            ])
        );
        let ragged: &[&[&str]] = &[
            &["1", "2", "A", "B", "C", "=1/0"],
            &["3", "4", "D", "E", "F"],
            &["5", "6"],
        ];
        assert_eq!(
            evaluate(ragged, "=VSTACK(A1:B3,C1:E2,F1)"),
            grid(&[
                &["1", "2", "#N/A"],
                &["3", "4", "#N/A"],
                &["5", "6", "#N/A"],
                &["A", "B", "C"],
                &["D", "E", "F"],
                &["#DIV/0!", "#N/A", "#N/A"],
            ])
        );
        assert_eq!(evaluate(&[], "=HSTACK(1,\"two\")"), grid(&[&["1", "two"]]));
    }

    #[test]
    fn documented_errors() {
        let data: &[&[&str]] = &[&["1", "2"], &["3", "4"], &["", ""]];
        let cases = [
            // WRAPROWS and WRAPCOLS: a source that is not a vector, a wrap count below 1.
            ("=WRAPROWS(A1:B2,2)", "#VALUE!"),
            ("=WRAPCOLS(A1:B2,2)", "#VALUE!"),
            ("=WRAPROWS(A1:A2,0)", "#NUM!"),
            ("=WRAPCOLS(A1:A2,-1)", "#NUM!"),
            ("=WRAPROWS(A1:A2,\"two\")", "#VALUE!"),
            // EXPAND: a size below the source size, or a result that is too large.
            ("=EXPAND(A1:B2,1)", "#VALUE!"),
            ("=EXPAND(A1:B2,2,1)", "#VALUE!"),
            ("=EXPAND(A1:B2,2000000,2)", "#NUM!"),
            // TOCOL and TOROW: an ignore code out of range, nothing left to return.
            ("=TOCOL(A1:B2,4)", "#VALUE!"),
            ("=TOROW(A1:B2,-1)", "#VALUE!"),
            ("=TOCOL(A3:B3,1)", "#CALC!"),
            // Argument counts.
            ("=TOCOL()", "#VALUE!"),
            ("=WRAPROWS(A1:A2)", "#VALUE!"),
            ("=EXPAND(A1:B2)", "#VALUE!"),
            ("=HSTACK()", "#VALUE!"),
        ];
        for (formula, expected) in cases {
            assert_eq!(evaluate(data, formula), grid(&[&[expected]]), "{formula}");
        }
    }

    #[test]
    fn results_feed_other_functions() {
        let data: &[&[&str]] = &[&["1", "2"], &["3", "4"]];
        let cases = [
            ("=SUM(TOCOL(A1:B2))", "10"),
            ("=SUM(EXPAND(A1:B2,3,3,1))", "15"),
            ("=SUM(HSTACK(A1:B2,A1:B2))", "20"),
            // The first value of an array in a single-value context.
            ("=VSTACK(B2,A1)+0", "4"),
        ];
        for (formula, expected) in cases {
            assert_eq!(evaluate(data, formula), grid(&[&[expected]]), "{formula}");
        }
        assert_eq!(
            evaluate(data, "=TRANSPOSE(TOCOL(A1:B2))"),
            grid(&[&["1", "2", "3", "4"]])
        );
        assert_eq!(
            evaluate(data, "=TAKE(VSTACK(A1:B2,A1:B2),3)"),
            grid(&[&["1", "2"], &["3", "4"], &["1", "2"]])
        );
        assert_eq!(
            evaluate(data, "=TOROW(HSTACK(A1:A2,B1:B2),0,TRUE)"),
            grid(&[&["1", "3", "2", "4"]])
        );
    }

    #[test]
    fn spill_follows_cell_arguments_after_edits() {
        let data: &[&[&str]] = &[&["1", "2"], &["3", "3"], &["5"], &["7"]];
        let (mut store, sheet) = sheet_with(data);
        store.set_formula(sheet, 0, RESULT_COL, "=WRAPROWS(A1:A4,B1)", 0);
        store.recompute(sheet);
        assert_eq!(result(&store, sheet), grid(&[&["1", "3"], &["5", "7"]]));

        store.set_number(sheet, 0, 1, 3.0, 0);
        store.recompute(sheet);
        assert_eq!(
            result(&store, sheet),
            grid(&[&["1", "3", "5"], &["7", "#N/A", "#N/A"]])
        );

        store.set_formula(sheet, 0, RESULT_COL, "=EXPAND(A1:A2,B2,B1,0)", 0);
        store.recompute(sheet);
        assert_eq!(
            result(&store, sheet),
            grid(&[&["1", "0", "0"], &["3", "0", "0"], &["0", "0", "0"]])
        );

        store.set_number(sheet, 1, 0, 9.0, 0);
        store.set_number(sheet, 1, 1, 2.0, 0);
        store.recompute(sheet);
        assert_eq!(
            result(&store, sheet),
            grid(&[&["1", "0", "0"], &["9", "0", "0"]])
        );
    }

    #[test]
    fn filter_accepts_value_dependent_shapes() {
        let source: &[&[&str]] = &[&["1", "3", "", "1"], &["2", "", "", "1"], &["3"], &["4"]];
        assert_eq!(
            evaluate(source, "=FILTER(WRAPROWS(A1:A4,B1),D1:D2)"),
            grid(&[&["1", "2", "3"], &["4", "#N/A", "#N/A"]])
        );
        assert_eq!(
            evaluate(source, "=FILTER(EXPAND(A1:A2,B1,2,0),A1:A3)"),
            grid(&[&["1", "0"], &["2", "0"], &["0", "0"]])
        );
        assert_eq!(
            evaluate(source, "=SUM(HSTACK(EXPAND(A1:A2,B1,2,0),SEQUENCE(3)))"),
            grid(&[&["9"]])
        );
    }

    #[test]
    fn oversized_results_report_num() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 20_000);
        store.set_formula(sheet, 0, 1, "=TOROW(SEQUENCE(20000))", 0);
        // A computed ignore code keeps the upper bound inside the column limit.
        store.set_formula(sheet, 1, 1, "=TOROW(SEQUENCE(20000),C1)", 0);
        store.set_formula(
            sheet,
            2,
            1,
            "=HSTACK(SEQUENCE(1,10000),SEQUENCE(1,10000))",
            0,
        );
        store.recompute(sheet);
        for row in 0..3 {
            assert_eq!(shown(&store, sheet, row, 1), "#NUM!", "row {row}");
        }
    }

    #[test]
    fn live_text_buffers_respect_byte_limit() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 1_000);
        let text = "x".repeat(32_767);
        for row in 0..1_000 {
            store.set_string(sheet, row, 0, &text, 0);
        }
        store.set_formula(sheet, 0, 2, "=HSTACK(A1:A1000,A1:A1000)+0", 0);
        store.recompute(sheet);
        assert_eq!(shown(&store, sheet, 0, 2), "#NUM!");
    }
}
