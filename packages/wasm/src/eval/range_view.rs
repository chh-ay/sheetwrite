//! Borrowed written ranges and owned computed arrays behind one read interface.
//!
//! Written ranges retain their column-major storage. Selecting a cell does not
//! allocate a matrix; materialization reads each column once into row-major output.

use crate::store::CellStore;
use crate::types::{CellRange, FormulaError, Value, KIND_FORMULA, KIND_STRING};

use super::matrix::{EvalMatrix, SPILL_MAX_BYTES};
use super::{string_from_pool_ref, EvalPass, LiteralSources};

/// A clipped written range, with the same admission checks as an array read.
pub(super) struct RangeView<'a> {
    store: &'a CellStore,
    range: CellRange,
    rows: usize,
    cols: usize,
    depth: usize,
}

impl<'a> RangeView<'a> {
    /// Checks the whole-area shape without reading or copying its values.
    pub(super) fn new(
        store: &'a CellStore,
        range: CellRange,
        depth: usize,
    ) -> Result<Self, FormulaError> {
        let data = store
            .sheets
            .get(range.sheet as usize)
            .ok_or(FormulaError::Ref)?;
        if data.cells.row_count() == 0
            || data.cells.n_cols() == 0
            || range.row_start as usize >= data.cells.row_count()
            || range.col_start as usize >= data.cells.n_cols()
        {
            return Err(FormulaError::Ref);
        }

        let rows =
            (range.row_end as usize).min(data.cells.row_count() - 1) - range.row_start as usize + 1;
        let cols =
            (range.col_end as usize).min(data.cells.n_cols() - 1) - range.col_start as usize + 1;
        EvalMatrix::validate_shape(rows, cols, 1, 0)?;

        Ok(Self {
            store,
            range,
            rows,
            cols,
            depth,
        })
    }

    /// The rectangle after clipping to the sheet extent.
    pub(super) fn shape(&self) -> (usize, usize) {
        (self.rows, self.cols)
    }

    /// Reads one zero-based cell, using literal storage when evaluation is unnecessary.
    pub(super) fn cell(&self, row: usize, col: usize, pass: &mut EvalPass<'_>) -> Value {
        if row >= self.rows || col >= self.cols {
            return Value::Error(FormulaError::Ref);
        }
        let sheet = self.range.sheet as usize;
        let row = self.range.row_start as usize + row;
        let col = self.range.col_start as usize + col;
        let data = &self.store.sheets[sheet];
        if !data.cells.is_loaded(row, col) {
            return Value::Error(FormulaError::Loading);
        }
        let value = LiteralSources::new(data, self.depth)
            .and_then(|sources| sources.value_at(&self.store.strings, data.cells.idx(row, col)))
            .unwrap_or_else(|| self.store.eval_at(sheet, row, col, pass, self.depth + 1));
        value
    }

    /// Allocates only the output buffer and fills it in storage order.
    pub(super) fn materialize(&self, pass: &mut EvalPass<'_>) -> Result<EvalMatrix, FormulaError> {
        let data = &self.store.sheets[self.range.sheet as usize];
        let total = self.rows * self.cols;
        let mut bytes = total
            .checked_mul(std::mem::size_of::<Value>())
            .ok_or(FormulaError::Num)?;
        for col in self.range.col_start as usize..self.range.col_start as usize + self.cols {
            for row in self.range.row_start as usize..self.range.row_start as usize + self.rows {
                let index = data.cells.idx(row, col);
                if matches!(data.cells.kind_at(index), KIND_STRING | KIND_FORMULA) {
                    if let Some(text) =
                        string_from_pool_ref(&self.store.strings, data.cells.str_id_at(index))
                    {
                        bytes = bytes.checked_add(text.len()).ok_or(FormulaError::Num)?;
                        if bytes > SPILL_MAX_BYTES {
                            return Err(FormulaError::Num);
                        }
                    }
                }
            }
        }

        let mut values = vec![Value::Blank; total];
        for col in 0..self.cols {
            for row in 0..self.rows {
                if !self.store.sheets[self.range.sheet as usize]
                    .cells
                    .is_loaded(
                        self.range.row_start as usize + row,
                        self.range.col_start as usize + col,
                    )
                {
                    return Err(FormulaError::Loading);
                }
                values[row * self.cols + col] = self.cell(row, col, pass);
            }
        }
        Ok(EvalMatrix::new(self.rows, self.cols, values))
    }
}

/// A function argument that is either a borrowed range or a computed matrix.
pub(super) enum ArrayView<'a> {
    Range(RangeView<'a>),
    Matrix(EvalMatrix),
}

impl ArrayView<'_> {
    pub(super) fn shape(&self) -> (usize, usize) {
        match self {
            Self::Range(range) => range.shape(),
            Self::Matrix(matrix) => (matrix.rows, matrix.cols),
        }
    }

    pub(super) fn cell(&self, row: usize, col: usize, pass: &mut EvalPass<'_>) -> Value {
        match self {
            Self::Range(range) => range.cell(row, col, pass),
            Self::Matrix(matrix) => matrix
                .get(row, col)
                .cloned()
                .unwrap_or(Value::Error(FormulaError::Ref)),
        }
    }
}

#[cfg(test)]
mod differential {
    use super::*;
    use crate::formula_slots::{FormulaResults, FormulaWork};

    #[test]
    fn compare_old_range_matrix() {
        for paged in [false, true] {
            let mut store = CellStore::new();
            let sheet = if paged {
                store.add_paged_sheet(8, 20, 4, 1_000_000, 1000)
            } else {
                store.add_sheet(8, 20)
            };
            for col in 0..6 {
                for row in 0..16 {
                    match (row + col) % 6 {
                        0 => store.set_number(sheet, row, col, (row * 13 + col) as f64, 0),
                        1 => store.set_string(sheet, row, col, "éclair", 0),
                        2 => {
                            store.set_formula(sheet, row, col, "=TRUE()", 0);
                        }
                        3 => {
                            store.set_formula(sheet, row, col, "=1/0", 0);
                        }
                        4 => {
                            store.set_formula(sheet, row, col, "=17+2", 0);
                        }
                        _ => continue,
                    }
                }
            }
            store.recompute(sheet);
            for last_row in [0, 7, 19, 100] {
                for last_col in [0, 3, 7, 100] {
                    let range = CellRange::new(sheet as u32, 0, 0, last_row, last_col);
                    let affected = FormulaWork::default();
                    let mut results = FormulaResults::default();
                    let mut pass = EvalPass {
                        affected: &affected,
                        results: &mut results,
                    };
                    let expected = store.legacy_range_matrix(range, &mut pass, 0);
                    let actual = RangeView::new(&store, range, 0)
                        .and_then(|view| view.materialize(&mut pass));
                    assert_eq!(format!("{expected:?}"), format!("{actual:?}"));
                }
            }
        }
    }
}
