//! Streaming, row-major reads of one cell range.
//!
//! [`RangeReader`] hands the values out one at a time, so a reduction or
//! criteria fold runs without materializing the range into a list. The
//! error-stopping `next` path reports the same failures as the list-building
//! path (`CellStore::eval_range_values`): an unloaded cell and an error cell
//! both stop the walk at the same cell. `next_allow_errors` instead returns
//! error cells as values for criteria ranges.

use super::{EvalPass, LiteralSources};

use crate::sheet::SheetData;
use crate::store::CellStore;
use crate::types::{
    CellRange, FormulaError, Value, KIND_EMPTY, KIND_FORMULA, LITERAL_KIND_BITS, RANGE_CELL_LIMIT,
};

#[cfg(test)]
thread_local! {
    /// Tests turn literal-column reads off to compare the kernels that use
    /// them with the cell-by-cell walk.
    pub(crate) static LITERAL_COLUMNS_OFF: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// A one-pass cursor over a rectangle of cells in row-major order.
pub(crate) struct RangeReader<'a> {
    store: &'a CellStore,
    data: &'a SheetData,
    /// Present when dense literal sources may bypass `eval_at`.
    literals: Option<LiteralSources<'a>>,
    sheet: usize,
    row: usize,
    col: usize,
    row_start: usize,
    row_end: usize,
    col_start: usize,
    col_end: usize,
    depth: usize,

    /// Page-tile cursor: the first row after the current row band of source
    /// pages. Entering a band records one access per column page; cells inside
    /// it index the page directory directly.
    tile_end_row: usize,
}

/// A range of literal cells as one `(kinds, payloads)` slice pair per column,
/// each `rows` long. Cell `(row, col)` of the range is `columns[col].0[row]`.
pub(crate) struct LiteralColumns<'a> {
    pub(crate) rows: usize,
    pub(crate) columns: Vec<(&'a [u8], &'a [u64])>,
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

        if data.cells.row_count() == 0
            || data.cells.n_cols() == 0
            || range.row_start as usize >= data.cells.row_count()
            || range.col_start as usize >= data.cells.n_cols()
        {
            return Err(FormulaError::Ref);
        }

        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(data.cells.row_count() - 1);
        let col_end = (range.col_end as usize).min(data.cells.n_cols() - 1);
        let rows = row_end - row_start + 1;
        let cols = col_end - col_start + 1;

        if (rows as u64).saturating_mul(cols as u64) > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }

        Ok(Self {
            store,
            data,
            literals: LiteralSources::new(data, depth),
            sheet,
            row: row_start,
            col: col_start,
            row_start,
            row_end,
            col_start,
            col_end,
            depth,
            tile_end_row: 0,
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

    /// The range's cells as dense column slices of raw kinds and payloads,
    /// when every cell is a literal number, text or boolean, or a blank that
    /// no spill writes into. `None` sends the caller to the cell-by-cell walk:
    /// paged storage, formula or spill cells, and reads at the depth limit,
    /// where literals go through `eval_at` and fail. Call it before reading.
    pub(crate) fn literal_columns(&self) -> Option<LiteralColumns<'a>> {
        self.literals?;

        #[cfg(test)]
        if LITERAL_COLUMNS_OFF.with(std::cell::Cell::get) {
            return None;
        }

        let rows = self.row_start..=self.row_end;
        let mut columns = Vec::new();
        columns
            .try_reserve_exact(self.col_end - self.col_start + 1)
            .ok()?;

        for col in self.col_start..=self.col_end {
            let column = self.data.cells.dense_column(col)?;
            let (kinds, payloads) = column.raw_slices();
            let kinds = kinds.get(rows.clone())?;

            // Literal kinds are 0..=3 (a raw empty kind without the calculated
            // bit is a plain blank). Any other kind sets a higher bit, so one
            // OR over the column decides it without a branch per cell.
            if kinds.iter().fold(0, |any, &kind| any | kind) & !LITERAL_KIND_BITS != 0 {
                return None;
            }

            columns.push((kinds, payloads.get(rows.clone())?));
        }

        Some(LiteralColumns {
            rows: self.row_end - self.row_start + 1,
            columns,
        })
    }

    /// The next value in row-major order, or `None` once the range is spent.
    /// An error cell stops the walk with that error.
    pub(crate) fn next(&mut self, pass: &mut EvalPass<'_>) -> Result<Option<Value>, FormulaError> {
        let Some(value) = self.next_allow_errors(pass)? else {
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
        pass: &mut EvalPass<'_>,
    ) -> Result<Option<Value>, FormulaError> {
        if self.row > self.row_end {
            return Ok(None);
        }

        let index = self.data.cells.idx(self.row, self.col);
        let value = if self.data.cells.is_paged() {
            self.paged_value_at(index, pass)?
        } else {
            if let Some(value) = self
                .literals
                .and_then(|sources| sources.value_at(&self.store.strings, index))
            {
                value
            } else {
                self.dense_value_at(self.row, self.col, pass)
            }
        };

        self.col += 1;

        if self.col > self.col_end {
            self.col = self.col_start;
            self.row += 1;
        }

        Ok(Some(value))
    }

    /// The value of a dense cell that is not a literal source: a formula is
    /// evaluated, and spill output, which shares the dense source slot, is
    /// read directly even when the source is empty.
    pub(crate) fn dense_value_at(&self, row: usize, col: usize, pass: &mut EvalPass<'_>) -> Value {
        let index = self.data.cells.idx(row, col);
        if self.data.cells.source_kind_at(index) != KIND_EMPTY {
            return self
                .store
                .eval_at(self.sheet, row, col, pass, self.depth + 1);
        }

        match self
            .data
            .cells
            .calculated_cell_at(index)
            .map_or((KIND_EMPTY, 0), |value| value)
        {
            (KIND_FORMULA, payload) => Value::Error(
                FormulaError::from_slot(payload).map_or(FormulaError::Value, |value| value),
            ),
            (kind, payload) => super::literal_cell_value(&self.store.strings, kind, payload),
        }
    }

    /// The value of a paged cell, or `Loading` when it is not resident. Out
    /// of line so dense walks keep a small loop body.
    #[inline(never)]
    fn paged_value_at(
        &mut self,
        index: usize,
        pass: &mut EvalPass<'_>,
    ) -> Result<Value, FormulaError> {
        if self.row >= self.tile_end_row {
            self.data
                .cells
                .touch_tile(self.row, self.col_start, self.col_end);
            self.tile_end_row = self.data.cells.next_page_row(self.row);
        }

        let run = self.data.cells.tile_run(index, index + 1);
        if !run.is_loaded(index) {
            return Err(FormulaError::Loading);
        }

        if run.source(index).0 == KIND_EMPTY && run.resolved(index).0 == KIND_EMPTY {
            return Ok(Value::Blank);
        }

        Ok(self
            .store
            .eval_at(self.sheet, self.row, self.col, pass, self.depth + 1))
    }
}

#[cfg(test)]
mod tests {
    use crate::formula_slots::{FormulaResults, FormulaWork};

    use super::RangeReader;
    use crate::eval::functions::FuncAccumulator;
    use crate::eval::EvalPass;
    use crate::store::CellStore;
    use crate::types::{CellRange, FormulaError, Value};

    /// The list-building path's row-major values, used as the reference.
    fn listed_values(store: &CellStore, range: CellRange) -> Result<Vec<Value>, FormulaError> {
        let affected = FormulaWork::default();
        let mut results = FormulaResults::default();

        let mut pass = EvalPass {
            affected: &affected,
            results: &mut results,
        };
        let mut values = FuncAccumulator::default();
        store.eval_range_values(range, &mut pass, 0, &mut values)?;
        Ok(values
            .entries()
            .iter()
            .map(|entry| entry.value.clone())
            .collect())
    }

    /// The streaming path's row-major values, stopping at the first error.
    fn streamed_values(store: &CellStore, range: CellRange) -> Result<Vec<Value>, FormulaError> {
        let affected = FormulaWork::default();
        let mut results = FormulaResults::default();

        let mut pass = EvalPass {
            affected: &affected,
            results: &mut results,
        };
        let mut reader = RangeReader::new(store, range, 0)?;
        let mut values = Vec::new();
        while let Some(value) = reader.next(&mut pass)? {
            values.push(value);
        }
        Ok(values)
    }

    #[test]
    fn dense_wide_streams_read_every_column() {
        const COLUMNS: usize = 4096;
        const ROWS: usize = 2;
        let mut store = CellStore::new();
        let sheet = store.add_sheet(COLUMNS, ROWS);
        store.set_number(sheet, 0, 0, 7.0, 0);
        store.set_formula(sheet, 1, COLUMNS - 1, "=9", 0);
        store.recompute(sheet);

        let affected = FormulaWork::default();
        let mut results = FormulaResults::default();

        let mut pass = EvalPass {
            affected: &affected,
            results: &mut results,
        };
        let range = CellRange::new(sheet as u32, 0, 0, 1, (COLUMNS - 1) as u32);
        let mut reader = RangeReader::new(&store, range, 0).unwrap();
        let mut count = 0;
        let mut sum = 0.0;
        while let Some(value) = reader.next(&mut pass).unwrap() {
            count += 1;
            if let Value::Number(number) = value {
                sum += number;
            }
        }
        assert_eq!(count, ROWS * COLUMNS);
        assert_eq!(sum, 16.0);
    }

    #[test]
    fn wide_paged_streams_preserve_loading() {
        const COLUMNS: usize = 65;
        const ROWS: usize = 2;
        let mut store = CellStore::new();
        let sheet = store.add_paged_sheet(COLUMNS + 1, ROWS, ROWS, 0, ROWS * COLUMNS);
        for col in 0..COLUMNS {
            store.set_column_numbers(sheet, col, 0, &[0.0; ROWS], 0);
        }
        store.set_number(sheet, 0, 0, 7.0, 0);
        store.set_formula(sheet, 1, COLUMNS - 1, "=9", 0);
        store.recompute(sheet);

        let affected = FormulaWork::default();
        let mut results = FormulaResults::default();

        let mut pass = EvalPass {
            affected: &affected,
            results: &mut results,
        };
        let range = CellRange::new(sheet as u32, 0, 0, 1, (COLUMNS - 1) as u32);
        let mut reader = RangeReader::new(&store, range, 0).unwrap();
        let mut count = 0;
        let mut sum = 0.0;
        while let Some(value) = reader.next(&mut pass).unwrap() {
            count += 1;
            if let Value::Number(number) = value {
                sum += number;
            }
        }
        assert_eq!(count, ROWS * COLUMNS);
        assert_eq!(sum, 16.0);

        // Extending the same multirow walk into one unknown column must still
        // stop at its first unloaded cell, not report a cached blank.
        let range = CellRange::new(sheet as u32, 0, 0, 1, COLUMNS as u32);
        let mut reader = RangeReader::new(&store, range, 0).unwrap();
        for _ in 0..COLUMNS {
            assert!(reader.next(&mut pass).unwrap().is_some());
        }
        assert!(matches!(reader.next(&mut pass), Err(FormulaError::Loading)));
    }

    fn streamed_values_allowing_errors(
        store: &CellStore,
        range: CellRange,
    ) -> Result<Vec<Value>, FormulaError> {
        let affected = FormulaWork::default();
        let mut results = FormulaResults::default();

        let mut pass = EvalPass {
            affected: &affected,
            results: &mut results,
        };
        let mut reader = RangeReader::new(store, range, 0)?;
        let mut values = Vec::new();
        while let Some(value) = reader.next_allow_errors(&mut pass)? {
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
        store.begin_page_load();
        store.set_column_numbers(sheet, 0, 0, &[1.0, 2.0, 3.0, 4.0], 0);
        store.commit_sources();
        let loaded = range(sheet, 0, 0, 3, 0);
        assert_eq!(
            streamed_values(&store, loaded),
            listed_values(&store, loaded)
        );
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
