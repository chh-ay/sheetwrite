//! The cells that SUBTOTAL and AGGREGATE leave out of a reference: rows that
//! the sheet's view hides, and cells whose formula calls SUBTOTAL or
//! AGGREGATE, which Excel skips so that a subtotal is not counted twice.

use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{
    CellRange, EvalResult, FormulaError, Value, FORMULA_RECURSION_LIMIT, RANGE_CELL_LIMIT,
};

use super::array::ast_produces_array;
use super::functions::MAX_FUNCTION_ARGS;
use super::math::{SubtotalCode, SubtotalFold};
use super::matrix::{argument_range, range_from_ast};
use super::range_view::{CellSink, RangeView};
use super::value::number_from_value;
use super::EvalPass;
use crate::formula_slots::FormulaStore;
use crate::row_visibility::{HiddenRowCursor, SkippedRows};
use crate::sheet::SheetData;

#[cfg(test)]
thread_local! {
    /// Sends SUBTOTAL through the function accumulator, for tests that
    /// compare the two readers.
    pub(super) static SUBTOTAL_VIEWS_OFF: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Whether tests have sent SUBTOTAL through the function accumulator.
#[cfg(test)]
pub(super) fn views_off() -> bool {
    SUBTOTAL_VIEWS_OFF.with(std::cell::Cell::get)
}

/// Whether tests have sent SUBTOTAL through the function accumulator.
#[cfg(not(test))]
pub(super) const fn views_off() -> bool {
    false
}

/// Whether `ast` calls SUBTOTAL or AGGREGATE anywhere.
pub(crate) fn ast_calls_subtotal(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::Subtotal, _) => true,
        #[cfg(feature = "analysis")]
        Ast::Func(Func::Analysis(super::analysis::AGGREGATE_ID), _) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(ast_calls_subtotal),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            ast_calls_subtotal(left) || ast_calls_subtotal(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => ast_calls_subtotal(inner),
        Ast::LetSlot { expression, .. } => ast_calls_subtotal(expression),
        Ast::NamedFormula(named) => ast_calls_subtotal(&named.expression),
        _ => false,
    }
}

/// What a SUBTOTAL or AGGREGATE reference argument leaves out. A skipped
/// cell is read as blank and is not evaluated, so an error there does not
/// reach the result.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct SkippedCells {
    pub(crate) rows: Option<SkippedRows>,
    pub(crate) nested_subtotals: bool,
}

impl SkippedCells {
    /// The rows of `sheet` this skips, as a cursor for a walk down the rows.
    pub(crate) fn hidden_rows(self, sheet: &SheetData) -> HiddenRowCursor {
        self.rows.map_or_else(HiddenRowCursor::default, |rows| {
            sheet.visibility.hidden_rows(rows)
        })
    }

    #[inline(never)]
    pub(crate) fn skips_cell(
        self,
        sheet: &SheetData,
        row: u32,
        col: u32,
        slots: &FormulaStore,
    ) -> bool {
        self.nested_subtotals
            && sheet
                .formulas
                .id((row, col))
                .is_some_and(|id| slots.is_subtotal(id))
    }
}

impl CellSink for SubtotalFold {
    #[inline]
    fn number(&mut self, number: f64) {
        self.push_number(number);
    }

    #[inline]
    fn other(&mut self) {
        self.push_other();
    }
}

/// The function and hidden rows of a SUBTOTAL code, or the error a code that
/// isn't one gives once every argument is read.
fn subtotal_code(value: &Value, missing: bool) -> SubtotalCode {
    if missing {
        return Err(FormulaError::Value);
    }
    let number = number_from_value(value)?;
    if !number.is_finite() || number < i64::MIN as f64 || number > i64::MAX as f64 {
        return Err(FormulaError::Num);
    }
    match number.trunc() as i64 {
        code @ 1..=11 => Ok((code, SkippedRows::Filtered)),
        code @ 101..=111 => Ok((code - 100, SkippedRows::Hidden)),
        _ => Err(FormulaError::Value),
    }
}

impl CellStore {
    /// SUBTOTAL, with its references read in place: hidden rows are stepped
    /// over run by run, and only formula cells are checked for a nested
    /// SUBTOTAL. Every argument is read in order, as the function accumulator
    /// reads it, so the same error wins. See `eval_func` for why families
    /// live in out-of-line `*_family` handlers.
    #[inline(never)]
    pub(super) fn eval_subtotal_family(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        let mut reader = SubtotalReader {
            store: self,
            sheet,
            skipped: SkippedCells {
                rows: Some(SkippedRows::Filtered),
                nested_subtotals: true,
            },
            fold: SubtotalFold::new(9),
            folding: false,
            cells: 0,
        };

        let mut code = Err(FormulaError::Value);
        for (index, arg) in args.iter().enumerate() {
            let first = match reader.argument(index, arg, pass, depth) {
                Ok(first) => first,
                Err(error) => return Value::Error(error),
            };
            if index >= MAX_FUNCTION_ARGS {
                return Value::Error(FormulaError::Value);
            }
            if index == 0 {
                code = subtotal_code(&first, matches!(arg, Ast::Missing));
                let (function, rows) = code.unwrap_or((9, SkippedRows::Filtered));
                reader.fold = SubtotalFold::new(function);
                reader.skipped.rows = Some(rows);
                reader.folding = true;
            }
        }

        if args.len() < 2 {
            return Value::Error(FormulaError::Value);
        }
        match code {
            Ok(_) => reader.fold.finish(),
            Err(error) => Value::Error(error),
        }
    }
}

/// The arguments of one SUBTOTAL call, read in order.
struct SubtotalReader<'a> {
    store: &'a CellStore,
    sheet: usize,
    /// What the references after the code leave out.
    skipped: SkippedCells,
    fold: SubtotalFold,
    /// Whether values go into `fold`: every argument after the code.
    folding: bool,
    /// Cells of the call so far, against the accumulator's limit.
    cells: u64,
}

/// A sink that keeps nothing, for the code argument's cells.
struct Discard;

impl CellSink for Discard {
    fn number(&mut self, _number: f64) {}

    fn other(&mut self) {}
}

impl SubtotalReader<'_> {
    /// Argument `index`, read as the function accumulator reads it. Returns
    /// its first value.
    fn argument(
        &mut self,
        index: usize,
        arg: &Ast,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        // A cell after the code is a one-cell reference, so its row can be
        // hidden.
        let reference = if index > 0 && matches!(arg, Ast::Cell(..) | Ast::AbsCell(..)) {
            range_from_ast(arg, self.sheet)
        } else {
            argument_range(arg, self.sheet)
        };
        if let Some(range) = reference {
            return self.range(range, index > 0, pass, depth + 1);
        }
        if matches!(arg, Ast::Func(Func::Union, _) | Ast::SheetSpan(_)) {
            return self.areas(arg, pass, depth + 1);
        }
        self.value(arg, pass, depth)
    }

    /// One range, with the checks of the accumulator's range read. With
    /// `skips`, the rows and nested subtotals that SUBTOTAL leaves out are
    /// left unread. Returns the first value of the range.
    fn range(
        &mut self,
        range: CellRange,
        skips: bool,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }

        let view = RangeView::clipped(self.store, range, depth)?;
        let (rows, cols) = view.shape();
        let cells = (rows as u64).saturating_mul(cols as u64);
        if cells > RANGE_CELL_LIMIT || self.cells.saturating_add(cells) > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }
        self.cells += cells;

        let data = &self.store.sheets[range.sheet as usize];
        let skipped = self.skipped;
        let slots = &self.store.formula_slots;
        let mut hidden = if skips {
            skipped.hidden_rows(data)
        } else {
            HiddenRowCursor::default()
        };
        let skips_formula = |row: usize, col: usize| {
            skips && skipped.skips_cell(data, row as u32, col as u32, slots)
        };
        if self.folding {
            view.scan_visible(&mut hidden, skips_formula, pass, &mut self.fold)?;
            return Ok(Value::Blank);
        }
        view.scan_visible(&mut hidden, skips_formula, pass, &mut Discard)?;
        Ok(view.cell(0, 0, pass))
    }

    /// A union or 3-D reference, area by area, none of it skipped. Returns
    /// the first value of the first area.
    fn areas(
        &mut self,
        reference: &Ast,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        let mut first = None;
        for area in self
            .store
            .area_ranges(Func::Subtotal, reference, self.sheet, depth)
        {
            let (range, range_depth) = area?;
            let value = self.range(range, false, pass, range_depth)?;
            first.get_or_insert(value);
        }
        if let Some(value) = first {
            return Ok(value);
        }

        // Every sheet of the span is smaller than the range: one blank keeps
        // the argument.
        self.count(1)?;
        Ok(Value::Blank)
    }

    /// An array or one value.
    fn value(
        &mut self,
        arg: &Ast,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        if ast_produces_array(arg) {
            if let Some(result) = self
                .store
                .eval_dynamic_array(arg, self.sheet, pass, depth + 1)
            {
                let matrix = result?;
                matrix.validate_copies(2)?;
                for value in &matrix.values {
                    if let Value::Error(error) = value {
                        return Err(*error);
                    }
                    self.count(1)?;
                    if self.folding {
                        self.fold.push(value, true);
                    }
                }
                return Ok(matrix.values.first().map_or(Value::Blank, Clone::clone));
            }
        }

        let value = self.store.eval_ast(arg, self.sheet, pass, depth + 1);
        if let Value::Error(error) = value {
            return Err(error);
        }
        self.count(1)?;
        if self.folding {
            self.fold.push(&value, false);
        }
        Ok(value)
    }

    /// `cells` more cells, against the accumulator's limit.
    fn count(&mut self, cells: u64) -> Result<(), FormulaError> {
        if self.cells.saturating_add(cells) > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }
        self.cells += cells;
        Ok(())
    }
}

#[cfg(test)]
mod differential {
    use super::SUBTOTAL_VIEWS_OFF;

    use crate::cells::DEFAULT_MAX_PAGED_DIRTY_CELLS;
    use crate::store::CellStore;

    const ROWS: usize = 40;

    /// A–C mix numbers, text, logical values, blanks, error formulas,
    /// nested subtotals and other formulas; D holds a spill.
    fn dense_sheet(store: &mut CellStore) -> usize {
        let sheet = store.add_sheet(12, ROWS + 10);
        for row in 0..ROWS {
            for col in 0..3 {
                match (row * 5 + col * 3) % 11 {
                    0 => {
                        store.set_string(sheet, row, col, ["7", "x", "", "Ünï"][(row + col) % 4], 0)
                    }
                    1 => store.set_bool(sheet, row, col, row % 2 == 0, 0),
                    2 => {}
                    3 => {
                        store.set_formula(sheet, row, col, &format!("=A{}*2", row % 3 + 1), 0);
                    }
                    4 => {
                        store.set_formula(sheet, row, col, "=SUBTOTAL(9,A1:A3)", 0);
                    }
                    5 => {
                        store.set_formula(sheet, row, col, "=\"t\"", 0);
                    }
                    _ => store.set_number(
                        sheet,
                        row,
                        col,
                        (row as f64).mul_add(2.25, -(col as f64) * 7.5),
                        0,
                    ),
                }
            }
        }
        store.set_formula(sheet, 33, 2, "=1/0", 0);
        store.set_number(sheet, 37, 1, f64::INFINITY, 0);
        store.set_formula(sheet, 0, 3, "=SEQUENCE(6,1,2,3)", 0);
        store.set_number(sheet, 2, 4, 1e308, 0);
        store.set_number(sheet, 3, 4, 1e308, 0);
        sheet
    }

    fn dense_formulas() -> Vec<String> {
        let mut formulas = Vec::new();
        for code in [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
            111,
        ] {
            for args in [
                "A1:A30",
                "A1:C30",
                "B1:B40",
                "C1:C40",
                "A1:A20,B5:B25",
                "A3,B4,A1:A2",
                "D1:D8",
                "E1:E5",
                "A1:A0",
                "A1:C30,E1:E5",
            ] {
                formulas.push(format!("=SUBTOTAL({code},{args})"));
            }
        }
        for code in ["\"9\"", "0", "12", "TRUE", "9.7", "A1", "", "1/0", "-1"] {
            formulas.push(format!("=SUBTOTAL({code},A1:A30)"));
        }
        for source in [
            "=SUBTOTAL(9,A1:A30,{1,2})",
            "=SUBTOTAL(9)",
            "=SUBTOTAL(9,{1,2,3})",
            "=SUBTOTAL(9,A1:A5,SEQUENCE(3))",
            "=SUBTOTAL(9,(A1:A3,B1:B3))",
            "=SUBTOTAL(109,S1:S2!A1:A5)",
            "=SUBTOTAL(109,A1:A30,{1;\"x\";TRUE})",
            "=SUBTOTAL(3,{1,2;\"\",TRUE})",
            "=SUBTOTAL(A1:A2,B1:B5)",
            "=SUBTOTAL(E3:E4,B1:B5)",
            "=SUBTOTAL({9},A1:A5)",
            "=SUBTOTAL({109,1},A1:A30)",
            "=SUBTOTAL((A1,A2),A1:A5)",
            "=SUBTOTAL(S1:S2!A1,A1:A5)",
            "=SUBTOTAL(9,1/0,A1:A5)",
            "=SUBTOTAL(9,\"3\",TRUE,A1:A5)",
            "=SUBTOTAL(9,,A1:A5)",
            "=SUBTOTAL(1,{1E308,1E308})",
            "=SUBTOTAL(9,{1,2},C1:C40)",
            "=SUBTOTAL(9,SEQUENCE(2,2)/0)",
        ] {
            formulas.push(source.to_owned());
        }
        formulas
    }

    /// A and B loaded in the first page, a formula over them in C, and rows
    /// past the first page not loaded.
    fn paged_sheet(store: &mut CellStore) -> usize {
        let sheet = store.add_paged_sheet(10, 6000, 4096, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
        let column_a: Vec<f64> = (0..ROWS).map(|row| ((row * 7) % 11) as f64).collect();
        let column_b: Vec<f64> = (0..ROWS)
            .map(|row| (row as f64).mul_add(0.5, -3.0))
            .collect();
        store.begin_page_load();
        store.set_column_numbers(sheet, 0, 0, &column_a, 0);
        store.set_column_numbers(sheet, 1, 0, &column_b, 0);
        store.commit_sources();
        for row in 0..5 {
            store.set_formula(
                sheet,
                row,
                2,
                &format!("=SUBTOTAL(9,A{}:B{})", row + 1, row + 3),
                0,
            );
        }
        sheet
    }

    fn paged_formulas() -> Vec<String> {
        [
            "=SUBTOTAL(9,A1:A40)",
            "=SUBTOTAL(109,A1:B40)",
            "=SUBTOTAL(1,A1:A5000)",
            "=SUBTOTAL(9,C1:C5)",
            "=SUBTOTAL(3,A1:C40)",
        ]
        .map(str::to_owned)
        .to_vec()
    }

    /// A formula and its result, as kind, number bits and text.
    type Outcome = (String, u8, u64, Option<String>);

    fn results(views: bool) -> Vec<Outcome> {
        SUBTOTAL_VIEWS_OFF.with(|off| off.set(!views));
        let mut store = CellStore::new();
        let dense = dense_sheet(&mut store);
        let second = dense_sheet(&mut store);
        store.set_sheet_name(dense, "s1", "S1");
        store.set_sheet_name(second, "s2", "S2");
        let paged = paged_sheet(&mut store);
        assert!(store.set_hidden_rows(dense, &[3, 5, 20, 22], &[8, 12, 30, 31]));
        assert!(store.set_hidden_rows(paged, &[2, 3], &[10, 10]));

        let mut cells = Vec::new();
        for (sheet, sources) in [(dense, dense_formulas()), (paged, paged_formulas())] {
            for (row, source) in sources.into_iter().enumerate() {
                store.set_formula(sheet, row, 8, &source, 0);
                cells.push((sheet, row, source));
            }
            store.recompute(sheet);
        }
        SUBTOTAL_VIEWS_OFF.with(|off| off.set(false));

        cells
            .into_iter()
            .map(|(sheet, row, source)| {
                let cell = store.get_cell(sheet, row, 8);
                (source, cell.kind(), cell.num().to_bits(), cell.string())
            })
            .collect()
    }

    #[test]
    fn subtotal_views_match_the_function_accumulator() {
        let accumulated = results(false);
        let viewed = results(true);
        assert_eq!(accumulated.len(), viewed.len(), "formula counts differ");
        for (accumulated, viewed) in accumulated.iter().zip(&viewed) {
            assert_eq!(accumulated, viewed, "{}", accumulated.0);
        }
    }
}
