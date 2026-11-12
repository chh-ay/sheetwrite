//! One read interface over a written range or a computed array.
//!
//! A written range stays in the sheet's column-major storage: reading one cell
//! touches only that cell, and nothing is copied until a caller asks for the
//! whole range as an `EvalMatrix`.

use crate::cells::{payload_num, payload_str_id};
use crate::sheet::SheetData;
use crate::store::CellStore;
use crate::types::{
    CellRange, FormulaError, Value, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING,
};

use super::matrix::{EvalMatrix, SPILL_MAX_BYTES};
use super::{string_from_pool_ref, EvalPass, LiteralSources};

/// A written range clipped to its sheet's used extent.
pub(super) struct RangeView<'a> {
    store: &'a CellStore,
    data: &'a SheetData,
    sheet: usize,
    row_start: usize,
    col_start: usize,
    rows: usize,
    cols: usize,
    depth: usize,
}

impl<'a> RangeView<'a> {
    /// Clips `range` to the sheet. A missing sheet or a range that starts
    /// outside it is `#REF!`, and a range over the array shape limit is
    /// `#NUM!`. No cell is read.
    pub(super) fn new(
        store: &'a CellStore,
        range: CellRange,
        depth: usize,
    ) -> Result<Self, FormulaError> {
        let view = Self::clipped(store, range, depth)?;
        EvalMatrix::validate_shape(view.rows, view.cols, 1, 0)?;
        Ok(view)
    }

    /// Clips `range` to the sheet without a size limit, for readers that
    /// apply their own. A missing sheet or a range that starts outside it is
    /// `#REF!`. No cell is read.
    pub(super) fn clipped(
        store: &'a CellStore,
        range: CellRange,
        depth: usize,
    ) -> Result<Self, FormulaError> {
        let sheet = range.sheet as usize;
        let data = store.sheets.get(sheet).ok_or(FormulaError::Ref)?;
        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        if data.cells.row_count() == 0
            || data.cells.n_cols() == 0
            || row_start >= data.cells.row_count()
            || col_start >= data.cells.n_cols()
        {
            return Err(FormulaError::Ref);
        }

        let row_end = (range.row_end as usize).min(data.cells.row_count() - 1);
        let col_end = (range.col_end as usize).min(data.cells.n_cols() - 1);

        Ok(Self {
            store,
            data,
            sheet,
            row_start,
            col_start,
            rows: row_end - row_start + 1,
            cols: col_end - col_start + 1,
            depth,
        })
    }

    /// The number of rows and columns after clipping.
    pub(super) const fn shape(&self) -> (usize, usize) {
        (self.rows, self.cols)
    }

    /// The value of the cell at a zero-based `row` and `col` of the view:
    /// `#REF!` outside it, `#LOADING!` when its page isn't loaded.
    pub(super) fn cell(&self, row: usize, col: usize, pass: &mut EvalPass<'_>) -> Value {
        if row >= self.rows || col >= self.cols {
            return Value::Error(FormulaError::Ref);
        }

        let sheet_row = self.row_start + row;
        let sheet_col = self.col_start + col;
        if !self.data.cells.is_loaded(sheet_row, sheet_col) {
            return Value::Error(FormulaError::Loading);
        }

        let literals = LiteralSources::new(self.data, self.depth);
        self.loaded_value(literals, sheet_row, sheet_col, pass)
    }

    /// The value of a loaded cell at a sheet `row` and `col`: its literal
    /// when `literals` holds one, otherwise its evaluated formula.
    fn loaded_value(
        &self,
        literals: Option<LiteralSources<'_>>,
        row: usize,
        col: usize,
        pass: &mut EvalPass<'_>,
    ) -> Value {
        let index = self.data.cells.idx(row, col);
        let literal = literals.and_then(|sources| sources.value_at(&self.store.strings, index));
        match literal {
            Some(value) => value,
            None => self
                .store
                .eval_at(self.sheet, row, col, pass, self.depth + 1),
        }
    }

    /// Visits every cell in row-major order as a number or a skipped cell,
    /// as a function that reads only the numbers of a range sees it. The
    /// first unloaded cell is `#LOADING!` and the first error cell is its
    /// error, as is a literal number that isn't finite or text missing from
    /// the string pool; the walk stops there.
    pub(super) fn scan_numbers(
        &self,
        pass: &mut EvalPass<'_>,
        mut visit: impl FnMut(Option<f64>),
    ) -> Result<(), FormulaError> {
        let literals = LiteralSources::new(self.data, self.depth);
        for row in self.row_start..self.row_start + self.rows {
            for col in self.col_start..self.col_start + self.cols {
                if !self.data.cells.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }

                let index = self.data.cells.idx(row, col);
                let literal = literals.and_then(|sources| sources.sources.literal(index));
                let number = match literal {
                    Some((KIND_NUMBER, payload)) => {
                        let number = payload_num(payload);
                        if !number.is_finite() {
                            return Err(FormulaError::Num);
                        }
                        Some(number)
                    }
                    Some((KIND_STRING, payload)) => {
                        string_from_pool_ref(&self.store.strings, payload_str_id(payload))
                            .ok_or(FormulaError::Ref)?;
                        None
                    }
                    Some(_) => None,
                    None if self.data.cells.kind_at(index) == KIND_EMPTY => None,
                    None => match self
                        .store
                        .eval_at(self.sheet, row, col, pass, self.depth + 1)
                    {
                        Value::Number(number) => Some(number),
                        Value::Error(error) => return Err(error),
                        Value::Text(_) | Value::Bool(_) | Value::Blank => None,
                    },
                };
                visit(number);
            }
        }
        Ok(())
    }

    /// Every cell of the view in one row-major matrix. Fails with `#NUM!`
    /// when the values and their stored text exceed the array byte budget, and
    /// with `#LOADING!` when any cell isn't loaded.
    pub(super) fn materialize(&self, pass: &mut EvalPass<'_>) -> Result<EvalMatrix, FormulaError> {
        let total = self.rows * self.cols;
        self.check_text_budget(total)?;

        let literals = LiteralSources::new(self.data, self.depth);
        let mut values = Vec::with_capacity(total);
        for row in self.row_start..self.row_start + self.rows {
            for col in self.col_start..self.col_start + self.cols {
                if !self.data.cells.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }

                values.push(self.loaded_value(literals, row, col, pass));
            }
        }
        Ok(EvalMatrix::new(self.rows, self.cols, values))
    }

    /// Charges `cells` values plus the text stored in the view against the
    /// array byte budget.
    fn check_text_budget(&self, cells: usize) -> Result<(), FormulaError> {
        let mut bytes = cells
            .checked_mul(std::mem::size_of::<Value>())
            .ok_or(FormulaError::Num)?;
        for col in self.col_start..self.col_start + self.cols {
            for row in self.row_start..self.row_start + self.rows {
                let index = self.data.cells.idx(row, col);
                if !matches!(self.data.cells.kind_at(index), KIND_STRING | KIND_FORMULA) {
                    continue;
                }
                let Some(text) =
                    string_from_pool_ref(&self.store.strings, self.data.cells.str_id_at(index))
                else {
                    continue;
                };

                bytes = bytes.checked_add(text.len()).ok_or(FormulaError::Num)?;
                if bytes > SPILL_MAX_BYTES {
                    return Err(FormulaError::Num);
                }
            }
        }
        Ok(())
    }
}

/// A function argument read as an array: a written range in place, or the
/// matrix another function computed.
pub(super) enum ArrayView<'a> {
    Range(RangeView<'a>),
    Matrix(EvalMatrix),
}

impl ArrayView<'_> {
    /// The number of rows and columns.
    pub(super) const fn shape(&self) -> (usize, usize) {
        match self {
            Self::Range(range) => range.shape(),
            Self::Matrix(matrix) => (matrix.rows, matrix.cols),
        }
    }

    /// The value at a zero-based `row` and `col`; `#REF!` outside the array.
    pub(super) fn cell(&self, row: usize, col: usize, pass: &mut EvalPass<'_>) -> Value {
        match self {
            Self::Range(range) => range.cell(row, col, pass),
            Self::Matrix(matrix) => matrix
                .get(row, col)
                .map_or(Value::Error(FormulaError::Ref), Clone::clone),
        }
    }
}
