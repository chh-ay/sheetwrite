//! One read interface over a written range or a computed array.
//!
//! A written range stays in the sheet's column-major storage: reading one cell
//! touches only that cell, and nothing is copied until a caller asks for the
//! whole range as an `EvalMatrix`.

use std::rc::Rc;

use crate::cells::{payload_num, payload_str_id};
use crate::row_visibility::HiddenRowCursor;
use crate::sheet::SheetData;
use crate::store::CellStore;
use crate::types::{
    CellRange, FormulaError, StringStorage, Value, KIND_BOOL, KIND_EMPTY, KIND_FORMULA,
    KIND_NUMBER, KIND_STRING, LITERAL_KIND_BITS,
};

use super::matrix::{EvalMatrix, SPILL_MAX_BYTES};
use super::preview_limits::{self, RangeRead};
use super::{string_from_pool_ref, EvalPass, LiteralSources};

/// A written range clipped to its sheet's used extent.
pub(super) struct RangeView<'a> {
    pub(super) store: &'a CellStore,
    pub(super) data: &'a SheetData,
    pub(super) sheet: usize,
    pub(super) row_start: usize,
    pub(super) col_start: usize,
    rows: usize,
    cols: usize,
    pub(super) depth: usize,
}

/// Dense literal cells, as one row slice of kinds and payloads per column.
pub(super) struct LiteralColumns<'a> {
    pub(super) rows: usize,
    pub(super) columns: Vec<(&'a [u8], &'a [u64])>,
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
        EvalMatrix::validate_reference_shape(view.rows, view.cols)?;
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

    /// Borrows literal kind/payload columns without copying text or numbers.
    /// Formula, spill, paged and depth-limited reads use the cell cursor instead.
    pub(super) fn literal_columns(&self) -> Option<LiteralColumns<'a>> {
        LiteralSources::new(self.data, self.depth)?;

        #[cfg(test)]
        if super::range_reader::LITERAL_COLUMNS_OFF.with(std::cell::Cell::get) {
            return None;
        }

        let rows = self.row_start..self.row_start + self.rows;
        let mut columns = Vec::new();
        columns.try_reserve_exact(self.cols).ok()?;

        for col in self.col_start..self.col_start + self.cols {
            let column = self.data.cells.dense_column(col)?;
            let (column_kinds, payloads) = column.raw_slices();
            let kinds = column_kinds.get(rows.clone())?;

            // Literal kinds are 0..=3 (a raw empty kind without the calculated
            // bit is a plain blank). Any other kind sets a higher bit, so one
            // OR over the column decides it without a branch per cell.
            if kinds.iter().fold(0, |any, &kind| any | kind) & !LITERAL_KIND_BITS != 0 {
                return None;
            }

            columns.push((kinds, payloads.get(rows.clone())?));
        }

        Some(LiteralColumns {
            rows: self.rows,
            columns,
        })
    }

    /// The value of the cell at a zero-based `row` and `col` of the view:
    /// `#REF!` outside it, `#LOADING!` when its page isn't loaded.
    pub(super) fn cell(&self, row: usize, col: usize, pass: &mut EvalPass<'_>) -> Value {
        if row >= self.rows || col >= self.cols {
            return Value::Error(FormulaError::Ref);
        }

        if let Err(error) = preview_limits::cell() {
            return Value::Error(error);
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

    /// Reads every cell in row-major order into `sink`, as a function that
    /// reads only the numbers of a range sees it. The first unloaded cell is
    /// `#LOADING!` and the first error cell is its error, as is a literal
    /// number that isn't finite or text missing from the string pool; the
    /// walk stops there.
    pub(super) fn scan_numbers(
        &self,
        pass: &mut EvalPass<'_>,
        sink: &mut impl NumberSink,
    ) -> Result<(), FormulaError> {
        self.charge_preview(RangeRead::Typed)?;
        if let Some(literals) = LiteralSources::new(self.data, self.depth) {
            return self.scan_dense_numbers(literals, pass, sink);
        }

        for row in self.row_start..self.row_start + self.rows {
            for col in self.col_start..self.col_start + self.cols {
                if !self.data.cells.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }

                self.scan_computed(row, col, pass, sink)?;
            }
        }
        Ok(())
    }

    /// [`Self::scan_numbers`] over dense storage, which is always loaded:
    /// literal cells are read from their kind byte and payload.
    fn scan_dense_numbers(
        &self,
        literals: LiteralSources<'_>,
        pass: &mut EvalPass<'_>,
        sink: &mut impl NumberSink,
    ) -> Result<(), FormulaError> {
        let (kinds, payloads) = literals.sources.raw();
        for row in self.row_start..self.row_start + self.rows {
            for col in self.col_start..self.col_start + self.cols {
                let index = self.data.cells.idx(row, col);
                match literal_number(&self.store.strings, kinds, payloads, index) {
                    Some(Ok(Some(number))) => sink.number(number),
                    Some(Ok(None)) => sink.skipped(),
                    Some(Err(error)) => return Err(error),
                    None => self.scan_computed(row, col, pass, sink)?,
                }
            }
        }
        Ok(())
    }

    /// The sheet row and column of each cell, in row-major order.
    fn cells(&self) -> impl Iterator<Item = (usize, usize)> + '_ {
        (self.row_start..self.row_start + self.rows).flat_map(move |row| {
            (self.col_start..self.col_start + self.cols).map(move |col| (row, col))
        })
    }

    /// Pairs the cells of this view with those of `other` in row-major order,
    /// as a paired statistic reads two ranges of literal cells: an error of
    /// this view wins over any error of `other`, and `visit` gets each pair's
    /// numbers. `None`, before any cell is evaluated, when either view isn't
    /// dense, when they differ in size, or when a cell holds a formula.
    pub(super) fn literal_pairs(
        &self,
        other: &Self,
        mut visit: impl FnMut(Option<f64>, Option<f64>),
    ) -> Option<Result<(), FormulaError>> {
        if self.rows * self.cols != other.rows * other.cols {
            return None;
        }
        if let Err(error) = self
            .charge_preview(RangeRead::Typed)
            .and_then(|()| other.charge_preview(RangeRead::Typed))
        {
            return Some(Err(error));
        }
        let (left_kinds, left_payloads) = LiteralSources::new(self.data, self.depth)?.sources.raw();
        let (right_kinds, right_payloads) =
            LiteralSources::new(other.data, other.depth)?.sources.raw();
        let strings = &self.store.strings;

        let mut right_cells = other.cells();
        let mut right_error = None;
        for (row, col) in self.cells() {
            let index = self.data.cells.idx(row, col);
            let left = match literal_number(strings, left_kinds, left_payloads, index)? {
                Ok(number) => number,
                Err(error) => return Some(Err(error)),
            };
            if right_error.is_some() {
                continue;
            }

            let (right_row, right_col) = right_cells.next()?;
            let right_index = other.data.cells.idx(right_row, right_col);
            match literal_number(strings, right_kinds, right_payloads, right_index)? {
                Ok(right) => visit(left, right),
                Err(error) => right_error = Some(error),
            }
        }
        Some(right_error.map_or(Ok(()), Err))
    }

    /// One loaded cell without a literal source: blank, or a formula or
    /// spill result.
    fn scan_computed(
        &self,
        row: usize,
        col: usize,
        pass: &mut EvalPass<'_>,
        sink: &mut impl NumberSink,
    ) -> Result<(), FormulaError> {
        let index = self.data.cells.idx(row, col);
        let literal = LiteralSources::new(self.data, self.depth)
            .and_then(|sources| sources.value_at(&self.store.strings, index));
        let value = match literal {
            Some(value) => value,
            None if self.data.cells.kind_at(index) == KIND_EMPTY => Value::Blank,
            None => self
                .store
                .eval_at(self.sheet, row, col, pass, self.depth + 1),
        };
        match value {
            Value::Number(number) => sink.number(number),
            Value::Error(error) => return Err(error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => sink.skipped(),
        }
        Ok(())
    }

    /// Reads the cells in row-major order into `sink`, as SUBTOTAL reads a
    /// reference: rows that `hidden` skips and formula cells for which
    /// `skips_formula` holds are left out unread. The first unloaded cell is
    /// `#LOADING!`, and the first error cell, a literal number that isn't
    /// finite or text missing from the string pool stops the walk with its
    /// error.
    pub(super) fn scan_visible(
        &self,
        hidden: &mut HiddenRowCursor,
        skips_formula: impl Fn(usize, usize) -> bool,
        pass: &mut EvalPass<'_>,
        sink: &mut impl CellSink,
    ) -> Result<(), FormulaError> {
        self.charge_preview(RangeRead::Typed)?;
        let literals =
            LiteralSources::new(self.data, self.depth).map(|sources| sources.sources.raw());
        for row in self.row_start..self.row_start + self.rows {
            if hidden.skips(row as u32) {
                continue;
            }

            for col in self.col_start..self.col_start + self.cols {
                if !self.data.cells.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }

                let index = self.data.cells.idx(row, col);
                let literal = literals.and_then(|(kinds, payloads)| {
                    literal_number(&self.store.strings, kinds, payloads, index)
                        .map(|number| (number, kinds.get(index).copied()))
                });
                match literal {
                    Some((Ok(Some(number)), _)) => sink.number(number),
                    Some((Ok(None), Some(KIND_EMPTY))) => {}
                    Some((Ok(None), _)) => sink.other(),
                    Some((Err(error), _)) => return Err(error),
                    None if skips_formula(row, col)
                        || self.data.cells.kind_at(index) == KIND_EMPTY => {}
                    None => match self
                        .store
                        .eval_at(self.sheet, row, col, pass, self.depth + 1)
                    {
                        Value::Number(number) => sink.number(number),
                        Value::Error(error) => return Err(error),
                        Value::Text(_) | Value::Bool(_) => sink.other(),
                        Value::Blank => {}
                    },
                }
            }
        }
        Ok(())
    }

    /// Every cell of the view in one row-major matrix. Fails with `#NUM!`
    /// when the values and their stored text exceed the array byte budget, and
    /// with `#LOADING!` when any cell isn't loaded.
    pub(super) fn materialize(&self, pass: &mut EvalPass<'_>) -> Result<EvalMatrix, FormulaError> {
        let total = self.rows * self.cols;
        self.charge_preview(RangeRead::Cells)?;
        preview_limits::array(total)?;
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

    /// Charges one whole read of the view against a result preview's limits.
    pub(super) fn charge_preview(&self, read: RangeRead) -> Result<(), FormulaError> {
        preview_limits::range(
            self.data,
            (self.row_start, self.col_start),
            (self.rows, self.cols),
            read,
        )
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

/// A cell as a function that reads only numbers sees it: its number, `None`
/// for text, a logical value or a blank, or the error that stops the read.
type NumberCell = Result<Option<f64>, FormulaError>;

/// A dense cell as a function that reads only numbers sees it: a number,
/// `None` for text, a logical value or a blank, or the error of a number that
/// isn't finite or text missing from the string pool. `None` for a formula
/// or spill cell, which needs evaluating.
#[inline]
fn literal_number(
    strings: &StringStorage,
    kinds: &[u8],
    payloads: &[u64],
    index: usize,
) -> Option<NumberCell> {
    let (Some(&kind), Some(&payload)) = (kinds.get(index), payloads.get(index)) else {
        return Some(Err(FormulaError::Ref));
    };
    Some(match kind {
        KIND_NUMBER => {
            let number = payload_num(payload);
            if number.is_finite() {
                Ok(Some(number))
            } else {
                Err(FormulaError::Num)
            }
        }
        KIND_STRING => string_from_pool_ref(strings, payload_str_id(payload))
            .map_or(Err(FormulaError::Ref), |_| Ok(None)),
        KIND_BOOL | KIND_EMPTY => Ok(None),
        _ => return None,
    })
}

/// Receives the cells of a range as a function that reads only numbers sees
/// them.
pub(super) trait NumberSink {
    /// A cell holding `number`, which a formula may have left non-finite.
    fn number(&mut self, number: f64);

    /// A cell holding text, a logical value or nothing.
    fn skipped(&mut self);
}

/// Receives the cells of a range as SUBTOTAL reads them. Blank cells reach
/// neither method.
pub(super) trait CellSink {
    /// A cell holding `number`, which a formula may have left non-finite.
    fn number(&mut self, number: f64);

    /// A cell holding text or a logical value.
    fn other(&mut self);
}

/// Which rows of an array's base a row step keeps, in output order. FILTER,
/// SORT, UNIQUE, TAKE, DROP and CHOOSEROWS pick rows instead of copying them;
/// a step that reads another step's rows composes the two sets, so a chain of
/// steps keeps one base and one set.
#[derive(Debug)]
enum RowSet {
    /// Consecutive base rows from `start`; the array keeps how many.
    Span { start: usize },
    /// Base rows in output order.
    List(Vec<u32>),
}

/// The values under picked rows: a matrix a function computed, or values
/// shared with the formula tree (an array constant).
#[derive(Debug)]
enum BaseValues {
    Computed(EvalMatrix),
    Shared(Rc<[Value]>),
}

/// Rows of one base, in output order.
#[derive(Debug)]
pub(super) struct BaseRows {
    values: BaseValues,
    rows: RowSet,
    /// The number of rows `rows` keeps and the width of `values`.
    len: usize,
    cols: usize,
}

impl BaseRows {
    /// The base row of output row `row`, which must be below `len`.
    fn base_row(&self, row: usize) -> usize {
        match &self.rows {
            RowSet::Span { start } => start + row,
            RowSet::List(rows) => rows[row] as usize,
        }
    }

    fn reader(&self) -> RowReader<'_> {
        let values = match &self.values {
            BaseValues::Computed(matrix) => matrix.values.as_slice(),
            BaseValues::Shared(values) => values,
        };
        let (start, list) = match &self.rows {
            RowSet::Span { start } => (*start, None),
            RowSet::List(list) => (0, Some(list.as_slice())),
        };
        RowReader {
            values,
            start,
            list,
            len: self.len,
            cols: self.cols,
        }
    }
}

/// Rows of computed or shared values, in output order: what a row step
/// returns and what a spill installs. It borrows no sheet. A whole computed
/// matrix stays a matrix, so passing one costs what passing the matrix
/// does; picked rows and shared constants keep their base behind one box.
#[derive(Debug)]
pub(super) enum ValueRows {
    Matrix(EvalMatrix),
    Rows(Box<BaseRows>),
}

/// [`ValueRows`] borrowed for lookups in a loop, with its row set resolved
/// once: the base values, and either the first base row or the base rows.
#[derive(Clone, Copy)]
pub(super) struct RowReader<'a> {
    values: &'a [Value],
    start: usize,
    list: Option<&'a [u32]>,
    len: usize,
    cols: usize,
}

impl<'a> RowReader<'a> {
    /// The number of rows and columns.
    pub(super) const fn shape(&self) -> (usize, usize) {
        (self.len, self.cols)
    }

    /// The value at a zero-based `row` and `col`, or `None` outside the array.
    #[inline]
    pub(super) fn value(&self, row: usize, col: usize) -> Option<&'a Value> {
        if row >= self.len || col >= self.cols {
            return None;
        }
        let base = match self.list {
            Some(list) => list[row] as usize,
            None => self.start + row,
        };
        self.values.get(base * self.cols + col)
    }

    /// The values of output row `row`, which must be below the row count.
    pub(super) fn row(&self, row: usize) -> &'a [Value] {
        let base = match self.list {
            Some(list) => list[row] as usize,
            None => self.start + row,
        };
        &self.values[base * self.cols..(base + 1) * self.cols]
    }
}

impl ValueRows {
    /// Every row of a computed matrix.
    pub(super) const fn matrix(matrix: EvalMatrix) -> Self {
        Self::Matrix(matrix)
    }

    /// Every row of `values`, shared with the formula tree, `cols` per row.
    pub(super) fn shared(rows: usize, cols: usize, values: Rc<[Value]>) -> Self {
        Self::Rows(Box::new(BaseRows {
            values: BaseValues::Shared(values),
            rows: RowSet::Span { start: 0 },
            len: rows,
            cols,
        }))
    }

    /// The number of rows and columns.
    pub(super) fn shape(&self) -> (usize, usize) {
        match self {
            Self::Matrix(matrix) => (matrix.rows, matrix.cols),
            Self::Rows(base) => (base.len, base.cols),
        }
    }

    /// The number of values.
    pub(super) fn cells(&self) -> usize {
        let (rows, cols) = self.shape();
        rows * cols
    }

    /// A reader for lookups in a loop.
    pub(super) fn reader(&self) -> RowReader<'_> {
        match self {
            Self::Matrix(matrix) => RowReader {
                values: &matrix.values,
                start: 0,
                list: None,
                len: matrix.rows,
                cols: matrix.cols,
            },
            Self::Rows(base) => base.reader(),
        }
    }

    /// The value at a zero-based `row` and `col`, or `None` outside the array.
    pub(super) fn value(&self, row: usize, col: usize) -> Option<&Value> {
        self.reader().value(row, col)
    }

    /// This array's rows over their base, boxed once.
    fn into_base(self) -> Box<BaseRows> {
        match self {
            Self::Matrix(matrix) => Box::new(BaseRows {
                len: matrix.rows,
                cols: matrix.cols,
                values: BaseValues::Computed(matrix),
                rows: RowSet::Span { start: 0 },
            }),
            Self::Rows(base) => base,
        }
    }

    /// The rows `picked` of this array, in that order, without copying them.
    /// Each must be below the array's row count.
    #[must_use]
    pub(super) fn pick(self, picked: impl Iterator<Item = usize>) -> Self {
        let mut base = self.into_base();
        let list: Vec<u32> = picked.map(|row| base.base_row(row) as u32).collect();
        base.len = list.len();
        base.rows = RowSet::List(list);
        Self::Rows(base)
    }

    /// The `len` rows from `start` of this array, without copying them.
    #[must_use]
    pub(super) fn span(self, start: usize, len: usize) -> Self {
        let mut base = self.into_base();
        base.rows = match std::mem::replace(&mut base.rows, RowSet::Span { start: 0 }) {
            RowSet::Span { start: first } => RowSet::Span {
                start: first + start,
            },
            RowSet::List(mut list) => {
                list.truncate(start + len);
                list.drain(..start);
                RowSet::List(list)
            }
        };
        base.len = len;
        Self::Rows(base)
    }

    /// [`EvalMatrix::validate_copies`] for the rows this array keeps: `#NUM!`
    /// when `copies` copies of their values and text pass the array byte
    /// budget. Rows it leaves out are not counted, since no step copies them.
    pub(super) fn validate_copies(&self, copies: usize) -> Result<(), FormulaError> {
        if let Self::Matrix(matrix) = self {
            return matrix.validate_copies(copies);
        }
        let reader = self.reader();
        let mut bytes = self
            .cells()
            .checked_mul(size_of::<Value>())
            .ok_or(FormulaError::Num)?;
        for row in 0..reader.len {
            for value in reader.row(row) {
                if let Value::Text(text) = value {
                    bytes = bytes.checked_add(text.len()).ok_or(FormulaError::Num)?;
                }
            }
        }
        if bytes
            .checked_mul(copies)
            .is_none_or(|total| total > SPILL_MAX_BYTES)
        {
            return Err(FormulaError::Num);
        }
        Ok(())
    }

    /// The rows this array keeps as one matrix. A whole computed matrix moves
    /// out without a copy; picked rows are copied once.
    pub(super) fn into_matrix(self) -> EvalMatrix {
        match self {
            Self::Matrix(matrix) => matrix,
            Self::Rows(base) => {
                let reader = base.reader();
                let mut values = Vec::with_capacity(reader.len * reader.cols);
                for row in 0..reader.len {
                    values.extend_from_slice(reader.row(row));
                }
                EvalMatrix::new(reader.len, reader.cols, values)
            }
        }
    }
}

/// A function argument read as an array: a written range in place, or rows
/// of values another function computed.
pub(super) enum ArrayView<'a> {
    Range(RangeView<'a>),
    Rows(ValueRows),
}

impl ArrayView<'_> {
    /// The number of rows and columns.
    pub(super) fn shape(&self) -> (usize, usize) {
        match self {
            Self::Range(range) => range.shape(),
            Self::Rows(rows) => rows.shape(),
        }
    }

    /// The value at a zero-based `row` and `col`; `#REF!` outside the array.
    pub(super) fn cell(&self, row: usize, col: usize, pass: &mut EvalPass<'_>) -> Value {
        match self {
            Self::Range(range) => range.cell(row, col, pass),
            Self::Rows(rows) => rows
                .value(row, col)
                .map_or(Value::Error(FormulaError::Ref), Clone::clone),
        }
    }
}
