//! Matrix values and AST-to-range conversion helpers.

use crate::calc::{Ast, Func, NameId, SHEET_COLS, SHEET_ROWS};
use crate::store::names::NameScope;
use crate::store::CellStore;
use crate::types::{CellRange, FormulaError, Value};

use super::{placed_cell, placed_range, range_view, EvalPass};

use super::preview_limits;
use std::cell::Cell;
use std::mem::size_of;

thread_local! {
    /// `[current matrix bytes, peak matrix bytes, matrix allocations]`.
    static MATRIX_RESOURCE_STATS: Cell<[u64; 3]> = const { Cell::new([0, 0, 0]) };
}

pub(crate) fn matrix_resource_stats() -> [u64; 3] {
    MATRIX_RESOURCE_STATS.with(Cell::get)
}

pub(crate) fn reset_matrix_resource_stats() {
    MATRIX_RESOURCE_STATS.with(|stats| {
        let current = stats.get()[0];
        stats.set([current, current, 0]);
    });
}
pub(super) const SPILL_MAX_ROWS: usize = SHEET_ROWS as usize;
pub(super) const SPILL_MAX_COLS: usize = SHEET_COLS as usize;
pub(super) const SPILL_MAX_CELLS: usize = 1_000_000;
pub(super) const SPILL_MAX_BYTES: usize = 64 * 1024 * 1024;
pub(super) const SPILL_MAX_RECOMPUTE_CELLS: usize = 2_000_000;
/// Spill-budget cells charged before evaluating a formula whose size is known
/// only once it runs: a size read from a cell, a runtime reference. The
/// pending loop charges whatever the result holds beyond this, so the pass
/// budget still stops a pass that really produces more than it allows.
pub(super) const UNKNOWN_SIZE_PRECHARGE: usize = 1;

#[derive(Debug)]
pub(super) struct EvalMatrix {
    pub(super) rows: usize,
    pub(super) cols: usize,
    pub(super) values: Vec<Value>,
    accounted_bytes: u64,
}

impl EvalMatrix {
    pub(super) fn new(rows: usize, cols: usize, values: Vec<Value>) -> Self {
        // A path that skipped the shape check still cannot hand an oversized
        // array to a preview: the refusal is sticky, so the preview fails.
        let _refused = preview_limits::array(values.len());
        let bytes = values.capacity().saturating_mul(size_of::<Value>()) as u64;
        MATRIX_RESOURCE_STATS.with(|stats| {
            let [live, peak, allocations] = stats.get();
            let current = live.saturating_add(bytes);
            stats.set([current, peak.max(current), allocations.saturating_add(1)]);
        });
        Self {
            rows,
            cols,
            values,
            accounted_bytes: bytes,
        }
    }

    pub(super) fn into_first(mut self) -> Value {
        std::mem::take(&mut self.values)
            .into_iter()
            .next()
            .unwrap_or(Value::Blank)
    }
}

impl Drop for EvalMatrix {
    fn drop(&mut self) {
        MATRIX_RESOURCE_STATS.with(|stats| {
            let [current, peak, allocations] = stats.get();
            stats.set([
                current.saturating_sub(self.accounted_bytes),
                peak,
                allocations,
            ]);
        });
    }
}

impl EvalMatrix {
    /// The cell count of an array of `rows` × `cols` that is about to be
    /// built, checked against the array shape, cell and byte limits and,
    /// during a result preview, its smaller array limit.
    pub(super) fn validate_shape(
        rows: usize,
        cols: usize,
        value_buffers: usize,
        extra_bytes: usize,
    ) -> Result<usize, crate::types::FormulaError> {
        let cells = Self::validate_buffers(rows, cols, value_buffers, extra_bytes)?;
        preview_limits::array(cells)?;
        Ok(cells)
    }

    /// The cell count of a reference read in place, checked against the
    /// array shape limit. Nothing is allocated, so a preview's smaller array
    /// limit does not apply.
    pub(super) fn validate_reference_shape(
        rows: usize,
        cols: usize,
    ) -> Result<usize, crate::types::FormulaError> {
        Self::validate_buffers(rows, cols, 1, 0)
    }

    fn validate_buffers(
        rows: usize,
        cols: usize,
        value_buffers: usize,
        extra_bytes: usize,
    ) -> Result<usize, crate::types::FormulaError> {
        if rows == 0 || cols == 0 || rows > SPILL_MAX_ROWS || cols > SPILL_MAX_COLS {
            return Err(crate::types::FormulaError::Num);
        }
        let cells = rows
            .checked_mul(cols)
            .filter(|cells| *cells <= SPILL_MAX_CELLS)
            .ok_or(crate::types::FormulaError::Num)?;
        let value_bytes = cells
            .checked_mul(size_of::<Value>())
            .and_then(|bytes| bytes.checked_mul(value_buffers))
            .and_then(|bytes| bytes.checked_add(extra_bytes))
            .ok_or(crate::types::FormulaError::Num)?;
        if value_bytes > SPILL_MAX_BYTES {
            return Err(crate::types::FormulaError::Num);
        }
        Ok(cells)
    }
    /// One copy's [`Self::validate_copies`]: what the full engine's array
    /// functions check before returning a matrix.
    #[cfg(feature = "analysis")]
    pub(super) fn validate_bytes(&self) -> Result<(), crate::types::FormulaError> {
        self.validate_copies(1)
    }

    pub(super) fn validate_copies(&self, copies: usize) -> Result<(), crate::types::FormulaError> {
        let base = self
            .values
            .capacity()
            .checked_mul(size_of::<Value>())
            .ok_or(crate::types::FormulaError::Num)?;
        let bytes = self.values.iter().try_fold(base, |total, value| {
            let payload = match value {
                Value::Text(text) => text.len(),
                Value::Number(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => 0,
            };
            total.checked_add(payload)
        });
        if bytes
            .and_then(|total| total.checked_mul(copies))
            .is_none_or(|needed| needed > SPILL_MAX_BYTES)
        {
            return Err(crate::types::FormulaError::Num);
        }
        Ok(())
    }

    pub(super) fn get(&self, row: usize, col: usize) -> Option<&Value> {
        (row < self.rows && col < self.cols)
            .then(|| self.values.get(row * self.cols + col))
            .flatten()
    }

    pub(super) fn same_shape(&self, other: &Self) -> bool {
        self.rows == other.rows && self.cols == other.cols
    }
}

pub(super) fn optional_ast(args: &[Ast], index: usize) -> Option<&Ast> {
    match args.get(index) {
        Some(Ast::Missing) | None => None,
        value => value,
    }
}

/// The range of an argument written as a range, such as `A1:B10` or
/// `Sheet2!$A$1:$A$9`. A single-cell reference, a defined name or a LET value
/// returns `None`: functions that read a lone cell as a scalar value coerce it
/// differently from a range.
pub(super) fn written_range(ast: &Ast, names: NameScope<'_>) -> Option<CellRange> {
    match ast {
        Ast::Range(..) | Ast::AbsRange(..) => range_from_ast(ast, names),
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::DefinedName(..)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::SheetRange(..)
        | Ast::SheetSpan(_)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => None,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => None,
    }
}

/// Whether `argument` is written as a range: a range, a table column or a
/// defined name of a range. A lone cell, a LET value or a formula is not.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node is not a written range"
)]
pub(crate) fn is_range_argument(argument: &Ast, names: NameScope<'_>) -> bool {
    match argument {
        Ast::Range(..) | Ast::AbsRange(..) | Ast::Structured(..) => true,
        Ast::DefinedName(id, _) => names.range_family(*id).is_some(),
        _ => false,
    }
}

/// The range an argument of an aggregate or statistic names: a written
/// range, a defined name of one, a table column or an intersection. A lone
/// cell is a value there, not a range.
pub(super) fn argument_range(arg: &Ast, names: NameScope<'_>) -> Option<CellRange> {
    match arg {
        Ast::Range(..) | Ast::AbsRange(..) => range_from_ast(arg, names),
        Ast::DefinedName(id, _) => names.range_family(*id),
        Ast::Structured(reference) => Some(CellRange::new(
            reference.sheet,
            reference.row_start,
            reference.col,
            reference.row_end,
            reference.col,
        )),
        Ast::Func(Func::Intersect, operands) => intersection_range(operands, names).ok(),
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::SheetRange(..)
        | Ast::SheetSpan(_)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => None,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => None,
    }
}

/// The cells the defined name `id` covers: its range, or its formula's when
/// that is one reference. Out of line, as [`NameScope::range_family`] is.
#[inline(never)]
fn name_reference_family(id: NameId, names: NameScope<'_>) -> Option<CellRange> {
    let read = names.read(id);
    read.range().or_else(|| {
        read.with_formula(|expression| range_from_ast(expression, names))
            .flatten()
    })
}

/// The cells a reference argument covers, reading defined names through
/// `names`; `None` when `ast` is not one reference. A written range, the
/// argument most callers meet, is read inline; every other node takes
/// [`node_range`].
#[inline]
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "every other node takes the full walk; listing them here would only repeat it"
)]
pub(crate) fn range_from_ast(ast: &Ast, names: NameScope<'_>) -> Option<CellRange> {
    match ast {
        Ast::Range(r0, c0, r1, c1, flags) => {
            Some(placed_range(names.sheet, (*r0, *c0), (*r1, *c1), *flags))
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, flags) => {
            Some(placed_range(sheet.handle, (*r0, *c0), (*r1, *c1), *flags))
        }
        _ => node_range(ast, names),
    }
}

/// [`range_from_ast`] of any node; out of line, so its callers stay small.
#[inline(never)]
fn node_range(ast: &Ast, names: NameScope<'_>) -> Option<CellRange> {
    let formula_sheet = names.sheet;
    match ast {
        Ast::LetSlot { expression, .. } => range_from_ast(expression, names),
        Ast::DefinedName(id, _) => name_reference_family(*id, names),
        Ast::Cell(row, col, flags) => {
            let (placed_row, placed_col) = placed_cell(*row, *col, *flags);
            Some(CellRange::new(
                formula_sheet,
                placed_row,
                placed_col,
                placed_row,
                placed_col,
            ))
        }
        Ast::AbsCell(sheet, row, col, flags) => {
            let (placed_row, placed_col) = placed_cell(*row, *col, *flags);
            Some(CellRange::new(
                sheet.handle,
                placed_row,
                placed_col,
                placed_row,
                placed_col,
            ))
        }
        Ast::Range(r0, c0, r1, c1, flags) => {
            Some(placed_range(formula_sheet, (*r0, *c0), (*r1, *c1), *flags))
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, flags) => {
            Some(placed_range(sheet.handle, (*r0, *c0), (*r1, *c1), *flags))
        }
        Ast::Structured(reference) => Some(CellRange::new(
            reference.sheet,
            reference.row_start,
            reference.col,
            reference.row_end,
            reference.col,
        )),
        Ast::Func(Func::Intersect, operands) => intersection_range(operands, names).ok(),
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::UnresolvedStructured(_)
        | Ast::SheetCell(..)
        | Ast::SheetRange(..)
        | Ast::SheetSpan(_)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::LetName { .. }
        | Ast::Array { .. } => None,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => None,
    }
}

/// The cells every operand of an intersection covers. Every operand must be
/// a single-area reference: anything else is `#VALUE!` (`#REF!` for a deleted
/// reference). References that share no cell, or sit on different sheets,
/// are `#NULL!`.
pub(crate) fn intersection_range(
    operands: &[Ast],
    names: NameScope<'_>,
) -> Result<CellRange, FormulaError> {
    let mut common: Option<CellRange> = None;
    let mut empty = false;

    // Every operand is checked before an empty result is reported, so a
    // non-reference operand stays #VALUE! wherever it sits.
    for operand in operands {
        let Some(range) = range_from_ast(operand, names) else {
            return Err(match operand {
                Ast::InvalidRef => FormulaError::Ref,
                Ast::Num(_)
                | Ast::Str(_)
                | Ast::Bool(_)
                | Ast::Missing
                | Ast::Name(_)
                | Ast::DefinedName(..)
                | Ast::UnresolvedStructured(_)
                | Ast::Structured(_)
                | Ast::Cell(..)
                | Ast::SheetCell(..)
                | Ast::AbsCell(..)
                | Ast::Range(..)
                | Ast::SheetRange(..)
                | Ast::AbsRange(..)
                | Ast::SheetSpan(_)
                | Ast::Func(..)
                | Ast::UnknownFunc(..)
                | Ast::Bin(..)
                | Ast::Cmp(..)
                | Ast::Neg(_)
                | Ast::Pos(_)
                | Ast::Percent(_)
                | Ast::LetSlot { .. }
                | Ast::LetName { .. }
                | Ast::Array { .. } => FormulaError::Value,
                #[cfg(feature = "analysis")]
                Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => {
                    FormulaError::Value
                }
            });
        };
        let Some(current) = common else {
            common = Some(range);
            continue;
        };
        let overlap = CellRange::new(
            range.sheet,
            current.row_start.max(range.row_start),
            current.col_start.max(range.col_start),
            current.row_end.min(range.row_end),
            current.col_end.min(range.col_end),
        );
        if current.sheet != range.sheet
            || overlap.row_start > overlap.row_end
            || overlap.col_start > overlap.col_end
        {
            empty = true;
        } else {
            common = Some(overlap);
        }
    }

    match common {
        Some(_) if empty => Err(FormulaError::Null),
        Some(range) => Ok(range),
        None => Err(FormulaError::Value),
    }
}

impl CellStore {
    pub(super) fn eval_matrix_arg(
        &self,
        ast: &Ast,
        formula_sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        let Some(range) = range_from_ast(ast, self.name_scope(formula_sheet)) else {
            let Some(result) = self.eval_dynamic_array(ast, formula_sheet, pass, depth + 1) else {
                return Err(FormulaError::Value);
            };
            let matrix = result?;
            matrix.validate_copies(2)?;
            return Ok(matrix);
        };
        self.eval_range_matrix(range, pass, depth)
    }

    /// The values of a written range, up to the sheet's used extent.
    pub(super) fn eval_range_matrix(
        &self,
        range: CellRange,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        range_view::RangeView::new(self, range, depth)?.materialize(pass)
    }
}

#[cfg(test)]
mod tests {
    use super::{matrix_resource_stats, reset_matrix_resource_stats, EvalMatrix};
    use crate::types::Value;

    #[test]
    fn matrix_resource_stats_track_concurrent_peak_and_release() {
        reset_matrix_resource_stats();
        let first = EvalMatrix::new(1, 2, vec![Value::Number(1.0), Value::Number(2.0)]);
        let first_bytes = matrix_resource_stats()[0];
        assert!(first_bytes > 0);
        {
            let second = EvalMatrix::new(1, 1, vec![Value::Blank]);
            let [current, peak, allocations] = matrix_resource_stats();
            assert_eq!(current, peak);
            assert!(current > first_bytes);
            assert_eq!(allocations, 2);
            drop(second);
        }
        assert_eq!(matrix_resource_stats()[0], first_bytes);
        drop(first);
        let [current, peak, allocations] = matrix_resource_stats();
        assert_eq!(current, 0);
        assert!(peak > first_bytes);
        assert_eq!(allocations, 2);
    }
}
