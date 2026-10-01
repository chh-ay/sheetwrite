//! Streaming, row-major reads of one cell range.
//!
//! The reduction and criteria functions used to materialize every cell of a
//! range into a list before folding it. [`RangeReader`] hands the values out
//! one at a time instead, so the same fold runs without the list. It reports
//! the same failures as the list-building path (`CellStore::eval_range_values`):
//! an unloaded cell and an error cell both stop the walk at the same cell.

use std::collections::{HashMap, HashSet};

use crate::sheet::SheetData;
use crate::store::CellStore;
use crate::types::{
    AbsCellKey, CellRange, EvalResult, FormulaError, Value, KIND_EMPTY, RANGE_CELL_LIMIT,
};

/// A one-pass cursor over a rectangle of cells in row-major order.
pub(crate) struct RangeReader<'a> {
    store: &'a CellStore,
    data: &'a SheetData,
    sheet: usize,
    row: usize,
    col: usize,
    row_start: usize,
    row_end: usize,
    col_start: usize,
    col_end: usize,
    depth: usize,
}

impl<'a> RangeReader<'a> {
    /// Prepares a walk over `range`. The structural checks match
    /// `eval_range_values`: a missing sheet or a range that starts outside the
    /// sheet is `#REF!`, and a range over `RANGE_CELL_LIMIT` cells is `#NUM!`.
    pub(crate) fn new(
        store: &'a CellStore,
        range: CellRange,
        depth: usize,
    ) -> Result<Self, FormulaError> {
        let sheet = range.sheet as usize;
        let Some(data) = store.sheets.get(sheet) else {
            return Err(FormulaError::Ref);
        };
        if data.row_count == 0
            || data.n_cols == 0
            || range.row_start as usize >= data.row_count
            || range.col_start as usize >= data.n_cols
        {
            return Err(FormulaError::Ref);
        }
        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(data.row_count - 1);
        let col_end = (range.col_end as usize).min(data.n_cols - 1);
        let rows = row_end - row_start + 1;
        let cols = col_end - col_start + 1;
        if (rows as u64).saturating_mul(cols as u64) > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }
        Ok(Self {
            store,
            data,
            sheet,
            row: row_start,
            col: col_start,
            row_start,
            row_end,
            col_start,
            col_end,
            depth,
        })
    }

    /// The number of rows and columns the walk covers, after clamping to the
    /// sheet's used extent.
    pub(crate) fn shape(&self) -> (usize, usize) {
        (
            self.row_end - self.row_start + 1,
            self.col_end - self.col_start + 1,
        )
    }

    /// The next value in row-major order, or `None` once the range is spent.
    /// An error cell stops the walk with that error.
    pub(crate) fn next(
        &mut self,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
    ) -> Result<Option<Value>, FormulaError> {
        let Some(value) = self.next_allow_errors(affected, memo, visiting)? else {
            return Ok(None);
        };
        if let Value::Error(error) = value {
            return Err(error);
        }
        Ok(Some(value))
    }

    /// Like [`Self::next`], but an error cell is handed back as a value.
    /// Criteria ranges read errors as plain values; only the summed range
    /// stops the walk.
    pub(crate) fn next_allow_errors(
        &mut self,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
    ) -> Result<Option<Value>, FormulaError> {
        if self.row > self.row_end {
            return Ok(None);
        }
        if !self.data.is_loaded(self.row, self.col) {
            return Err(FormulaError::Loading);
        }
        let index = self.data.idx(self.row, self.col);
        let value = if self.data.kind_at(index) == KIND_EMPTY {
            Value::Blank
        } else {
            self.store.eval_at(
                self.sheet,
                self.row,
                self.col,
                affected,
                memo,
                visiting,
                self.depth + 1,
            )
        };
        self.col += 1;
        if self.col > self.col_end {
            self.col = self.col_start;
            self.row += 1;
        }
        Ok(Some(value))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, HashSet};

    use super::RangeReader;
    use crate::eval::functions::FuncAccumulator;
    use crate::store::CellStore;
    use crate::types::{CellRange, FormulaError, Value};

    /// The list-building path's row-major values, used as the reference.
    fn listed_values(store: &CellStore, range: CellRange) -> Result<Vec<Value>, FormulaError> {
        let affected = HashSet::new();
        let mut memo = HashMap::new();
        let mut visiting = HashSet::new();
        let mut values = FuncAccumulator::default();
        store.eval_range_values(range, &affected, &mut memo, &mut visiting, 0, &mut values)?;
        Ok(values
            .entries()
            .iter()
            .map(|entry| entry.value.clone())
            .collect())
    }

    /// The streaming path's row-major values, stopping at the first error.
    fn streamed_values(store: &CellStore, range: CellRange) -> Result<Vec<Value>, FormulaError> {
        let affected = HashSet::new();
        let mut memo = HashMap::new();
        let mut visiting = HashSet::new();
        let mut reader = RangeReader::new(store, range, 0)?;
        let mut values = Vec::new();
        while let Some(value) = reader.next(&affected, &mut memo, &mut visiting)? {
            values.push(value);
        }
        Ok(values)
    }

    /// The streaming path's values with error cells handed back as values.
    fn streamed_values_allowing_errors(
        store: &CellStore,
        range: CellRange,
    ) -> Result<Vec<Value>, FormulaError> {
        let affected = HashSet::new();
        let mut memo = HashMap::new();
        let mut visiting = HashSet::new();
        let mut reader = RangeReader::new(store, range, 0)?;
        let mut values = Vec::new();
        while let Some(value) = reader.next_allow_errors(&affected, &mut memo, &mut visiting)? {
            values.push(value);
        }
        Ok(values)
    }

    fn mixed_store() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 12);
        store.set_number(sheet, 0, 0, 1.5, 0);
        store.set_string(sheet, 0, 1, "café", 0);
        store.set_number(sheet, 1, 1, 2.5, 0);
        store.set_bool(sheet, 2, 0, true, 0);
        store.set_formula(sheet, 2, 1, "=A1+A2", 0);
        store.set_formula(sheet, 3, 0, "=1/0", 0);
        store.set_formula(sheet, 3, 1, "=\"x\"&\"y\"", 0);
        store.recompute(sheet);
        (store, sheet)
    }

    fn range(sheet: usize, r0: u32, c0: u32, r1: u32, c1: u32) -> CellRange {
        CellRange::new(sheet as u32, r0, c0, r1, c1)
    }

    #[test]
    fn streaming_matches_the_list_path_for_mixed_blank_and_formula_cells() {
        let (store, sheet) = mixed_store();
        for candidate in [
            range(sheet, 0, 0, 3, 1),
            range(sheet, 0, 0, 1, 1),
            range(sheet, 0, 0, 0, 0),
            range(sheet, 2, 0, 2, 1),
            range(sheet, 0, 1, 2, 1),
            range(sheet, 0, 0, 11, 2),
            range(sheet, 0, 2, 2, 2),
        ] {
            assert_eq!(
                streamed_values(&store, candidate),
                listed_values(&store, candidate),
                "range {candidate:?}"
            );
        }
        assert_eq!(
            RangeReader::new(&store, range(sheet, 0, 0, 11, 2), 0)
                .unwrap()
                .shape(),
            (12, 3)
        );
        assert_eq!(
            RangeReader::new(&store, range(sheet, 2, 1, 99, 99), 0)
                .unwrap()
                .shape(),
            (10, 2)
        );
    }

    #[test]
    fn streaming_stops_where_the_list_path_stops() {
        let (store, sheet) = mixed_store();
        for candidate in [
            range(sheet, 0, 0, 3, 0),
            range(sheet, 3, 0, 3, 0),
            range(sheet, 1, 0, 3, 1),
            range(sheet, 12, 0, 13, 0),
            range(sheet, 1, 3, 2, 3),
        ] {
            assert_eq!(
                streamed_values(&store, candidate),
                listed_values(&store, candidate),
                "range {candidate:?}"
            );
        }
    }

    #[test]
    fn errors_continue_the_walk_only_when_asked() {
        let (store, sheet) = mixed_store();
        let candidate = range(sheet, 0, 0, 3, 1);
        assert_eq!(
            streamed_values(&store, candidate),
            Err(FormulaError::DivZero)
        );
        let values = streamed_values_allowing_errors(&store, candidate).unwrap();
        assert_eq!(values.len(), 8);
        assert_eq!(values[0], Value::Number(1.5));
        assert_eq!(values[1], Value::text("café"));
        assert_eq!(values[2], Value::Blank);
        assert_eq!(values[3], Value::Number(2.5));
        assert_eq!(values[4], Value::Bool(true));
        assert_eq!(values[5], Value::Number(1.5));
        assert_eq!(values[6], Value::Error(FormulaError::DivZero));
        assert_eq!(values[7], Value::text("xy"));
    }

    #[test]
    fn streaming_stops_on_a_cell_that_is_not_loaded() {
        let mut store = CellStore::new();
        let sheet = store.add_paged_sheet(2, 8, 4, 0, 0);
        store.hydrate_page_numbers(sheet, 0, 0, &[1.0, 2.0, 3.0, 4.0], 0, &[]);
        let loaded = range(sheet, 0, 0, 3, 0);
        assert_eq!(streamed_values(&store, loaded), listed_values(&store, loaded));
        assert_eq!(
            streamed_values(&store, range(sheet, 0, 0, 7, 0)),
            Err(FormulaError::Loading)
        );
        assert_eq!(
            streamed_values_allowing_errors(&store, range(sheet, 4, 0, 7, 0)),
            Err(FormulaError::Loading)
        );
    }
}
