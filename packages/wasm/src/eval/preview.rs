//! The result of a formula text, evaluated against the store without
//! changing it, for the result preview in formula help.
//!
//! A preview parses and resolves the text as the cell at its position would,
//! then evaluates it with an empty set of formulas to recompute: every
//! referenced formula is read from its stored result, nothing registers a
//! dependency, writes a cell or a spill, or creates history. Before
//! evaluation, a walk over the tree refuses functions that change state
//! (RAND, RANDBETWEEN) and host functions. During evaluation the existing
//! range, array, text and LAMBDA checks apply the smaller limits of
//! `preview_limits`, so a preview stays within its time budget.
//!
//! A trial preview (`previewFormulaWith`) first puts a value in its cell, as
//! a data validation custom formula checks a typed value before it is
//! stored, and puts the cell's own content back afterwards.

use wasm_bindgen::prelude::*;

use crate::calc::{Ast, Func, NameId};
use crate::cells::{encode_num, encode_str_id};
use crate::formula_slots::{FormulaResults, FormulaWork};
use crate::store::names::shapes;
use crate::store::CellStore;
use crate::types::{FormulaError, Value, KIND_BOOL, KIND_EMPTY, KIND_NUMBER, KIND_STRING};

use super::preview_limits::PreviewScope;
use super::{ast_produces_array, EvalPass, FormulaOriginGuard};

/// Formula text longer than this many UTF-16 units is not previewed.
const PREVIEW_SOURCE_UNITS: usize = 8_192;
/// Nesting deeper than this is not previewed.
const PREVIEW_NESTING: usize = 256;
/// The numbers the JavaScript export writes for one preview.
const PREVIEW_FIELDS: usize = 5;

/// What a preview returned. JavaScript reads the status as its number.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum FormulaPreviewStatus {
    /// One value.
    Value = 0,
    /// An array: `rows` × `cols`, with its top-left value.
    Array = 1,
    /// The formula calls a function that changes state or a host function.
    UnsafeFunction = 2,
    /// The formula needs more work than a preview allows.
    CostLimit = 3,
    /// A cell the formula reads is not loaded yet.
    Loading = 4,
    /// The text does not parse.
    Syntax = 5,
}

/// The kind of a preview's value. JavaScript reads the kind as its number.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum FormulaPreviewKind {
    /// An empty result.
    Blank = 0,
    /// A number, in `number`.
    Number = 1,
    /// Text, in `text`.
    Text = 2,
    /// A logical value: `number` is 1 or 0.
    Boolean = 3,
    /// An error: `text` is its text, such as `#N/A`.
    Error = 4,
}

/// The result of [`CellStore::preview_formula`].
#[derive(Debug)]
pub(crate) struct FormulaPreview {
    status: FormulaPreviewStatus,
    kind: FormulaPreviewKind,
    number: f64,
    text: Option<String>,
    rows: u32,
    cols: u32,
}

#[cfg(test)]
impl FormulaPreview {
    /// Whether the preview has a value, and if not, why.
    pub(crate) const fn status(&self) -> FormulaPreviewStatus {
        self.status
    }

    /// The kind of the value (of the top-left value for an array).
    pub(crate) const fn kind(&self) -> FormulaPreviewKind {
        self.kind
    }

    /// A number, or 1 / 0 for a logical value.
    pub(crate) const fn number(&self) -> f64 {
        self.number
    }

    /// Text, or an error's text such as `#DIV/0!`.
    pub(crate) fn text(&self) -> Option<&str> {
        self.text.as_deref()
    }

    /// Rows of an array result; 1 for a value.
    pub(crate) const fn rows(&self) -> u32 {
        self.rows
    }

    /// Columns of an array result; 1 for a value.
    pub(crate) const fn cols(&self) -> u32 {
        self.cols
    }
}

impl FormulaPreview {
    /// The numbers JavaScript decodes: status, kind, number, rows, columns.
    fn fields(&self) -> [f64; PREVIEW_FIELDS] {
        let status = match self.status {
            FormulaPreviewStatus::Value => 0.0,
            FormulaPreviewStatus::Array => 1.0,
            FormulaPreviewStatus::UnsafeFunction => 2.0,
            FormulaPreviewStatus::CostLimit => 3.0,
            FormulaPreviewStatus::Loading => 4.0,
            FormulaPreviewStatus::Syntax => 5.0,
        };
        let kind = match self.kind {
            FormulaPreviewKind::Blank => 0.0,
            FormulaPreviewKind::Number => 1.0,
            FormulaPreviewKind::Text => 2.0,
            FormulaPreviewKind::Boolean => 3.0,
            FormulaPreviewKind::Error => 4.0,
        };
        [
            status,
            kind,
            self.number,
            f64::from(self.rows),
            f64::from(self.cols),
        ]
    }
}

impl FormulaPreview {
    const fn unavailable(status: FormulaPreviewStatus) -> Self {
        Self {
            status,
            kind: FormulaPreviewKind::Blank,
            number: 0.0,
            text: None,
            rows: 0,
            cols: 0,
        }
    }

    fn value(status: FormulaPreviewStatus, value: Value, (rows, cols): (usize, usize)) -> Self {
        let (kind, number, text) = match value {
            Value::Blank => (FormulaPreviewKind::Blank, 0.0, None),
            Value::Number(number) => (FormulaPreviewKind::Number, number, None),
            Value::Bool(flag) => (FormulaPreviewKind::Boolean, f64::from(u8::from(flag)), None),
            Value::Text(text) => (FormulaPreviewKind::Text, 0.0, Some(text.to_string())),
            Value::Error(error) => (
                FormulaPreviewKind::Error,
                0.0,
                Some(error.sentinel().to_owned()),
            ),
        };
        Self {
            status,
            kind,
            number,
            text,
            rows: u32::try_from(rows).unwrap_or(u32::MAX),
            cols: u32::try_from(cols).unwrap_or(u32::MAX),
        }
    }
}

#[wasm_bindgen]
impl CellStore {
    /// The result `source` (a formula with its leading `=`) would have in the
    /// cell `[sheet, row, col]`, without changing the store, as
    /// [`Self::preview_formula`] gives it. Writes five numbers into `out`
    /// (status, kind, number, rows, columns; see `formula-preview-result.ts`
    /// in core) and returns the text of a text or error value. Plain numbers
    /// keep the export free of an object that JavaScript must free.
    #[wasm_bindgen(js_name = previewFormula)]
    #[must_use]
    pub fn preview_formula_fields(
        &self,
        cell: &[u32],
        source: &str,
        out: &mut [f64],
    ) -> Option<String> {
        let &[sheet, row, col] = cell else {
            return None;
        };
        let preview = self.preview_formula(sheet as usize, row, col, source);
        for (slot, field) in out.iter_mut().zip(preview.fields()) {
            *slot = field;
        }
        preview.text
    }
}

/// A value a trial preview puts in its cell.
#[derive(Clone, Copy, Debug)]
pub(crate) enum TrialValue<'a> {
    Blank,
    Number(f64),
    Text(&'a str),
    Boolean(bool),
}

#[wasm_bindgen]
impl CellStore {
    /// As [`Self::preview_formula_fields`], with a value in the cell
    /// `[sheet, row, col]` instead of its content. `kind` numbers the value
    /// as a preview's kind does: 0 blank, 1 the number `number`, 2 the text
    /// `text`, 3 the logical `number != 0`.
    #[wasm_bindgen(js_name = previewFormulaWith)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    #[must_use]
    pub fn preview_formula_with_fields(
        &mut self,
        cell: &[u32],
        source: &str,
        kind: u8,
        number: f64,
        text: &str,
        out: &mut [f64],
    ) -> Option<String> {
        let &[sheet, row, col] = cell else {
            return None;
        };
        let value = match kind {
            1 => TrialValue::Number(number),
            2 => TrialValue::Text(text),
            3 => TrialValue::Boolean(number != 0.0),
            _ => TrialValue::Blank,
        };
        let preview = self.preview_formula_with((sheet as usize, row, col), source, value);
        for (slot, field) in out.iter_mut().zip(preview.fields()) {
            *slot = field;
        }
        preview.text
    }
}

impl CellStore {
    /// The result `source` would have in `cell` (sheet, row, column) if the
    /// cell held `value`. Formulas that read the cell see `value`; every
    /// other formula keeps its stored result, as in
    /// [`Self::preview_formula`]. A paged sheet gives no preview (`Loading`).
    pub(crate) fn preview_formula_with(
        &mut self,
        (sheet, row, col): (usize, u32, u32),
        source: &str,
        value: TrialValue<'_>,
    ) -> FormulaPreview {
        let (kind, payload) = match value {
            TrialValue::Blank => (KIND_EMPTY, 0),
            TrialValue::Number(number) => (KIND_NUMBER, encode_num(number)),
            TrialValue::Boolean(flag) => (KIND_BOOL, encode_num(f64::from(u8::from(flag)))),
            TrialValue::Text(text) => (KIND_STRING, encode_str_id(self.intern(text))),
        };
        let (cell_row, cell_col) = (row as usize, col as usize);
        let Some(saved) = self.sheets.get_mut(sheet).and_then(|data| {
            data.cells
                .show_dense_trial(cell_row, cell_col, kind, payload)
        }) else {
            return FormulaPreview::unavailable(FormulaPreviewStatus::Loading);
        };
        let preview = self.preview_formula(sheet, row, col, source);
        if let Some(data) = self.sheets.get_mut(sheet) {
            data.cells.restore_dense_slot(cell_row, cell_col, saved);
        }
        preview
    }
}

impl CellStore {
    /// The result `source` (a formula with its leading `=`) would have in the
    /// cell at `row` and `col` of `sheet`, without changing the store. The
    /// module docs say what a preview reads and refuses. A formula that needs
    /// more than the preview limits returns `CostLimit` rather than a partial
    /// answer.
    pub(crate) fn preview_formula(
        &self,
        sheet: usize,
        row: u32,
        col: u32,
        source: &str,
    ) -> FormulaPreview {
        if source.len() > PREVIEW_SOURCE_UNITS
            && source.encode_utf16().nth(PREVIEW_SOURCE_UNITS).is_some()
        {
            return FormulaPreview::unavailable(FormulaPreviewStatus::CostLimit);
        }
        let Ok(formula_sheet) = u32::try_from(sheet) else {
            return FormulaPreview::unavailable(FormulaPreviewStatus::Syntax);
        };
        if self.sheets.get(sheet).is_none() {
            return FormulaPreview::unavailable(FormulaPreviewStatus::Syntax);
        }
        let Ok(mut ast) = self.resolve_preview_ast(source, formula_sheet, row, col) else {
            return FormulaPreview::unavailable(FormulaPreviewStatus::Syntax);
        };

        let scope = PreviewScope::enter();
        let _origin = FormulaOriginGuard::push((row, col));
        let _reads = super::reference::RuntimeReadPause::enter();
        let mut walk = SafetyWalk {
            store: self,
            sheet,
            scope: &scope,
            named: Vec::new(),
            refusal: None,
        };
        walk.visit(&ast, 0);
        if let Some(refusal) = walk.refusal {
            return FormulaPreview::unavailable(refusal);
        }
        // The shape checks read the marks that a stored formula's tree
        // carries, so the preview tree gets the same marks.
        shapes::mark(&mut ast, self.name_scope(sheet));

        let preview = self.evaluate_preview(&ast, sheet);
        if scope.exceeded() {
            return FormulaPreview::unavailable(FormulaPreviewStatus::CostLimit);
        }
        preview
    }
}

impl CellStore {
    fn evaluate_preview(&self, ast: &Ast, sheet: usize) -> FormulaPreview {
        let affected = FormulaWork::default();
        let mut results = FormulaResults::default();
        let mut pass = EvalPass {
            affected: &affected,
            results: &mut results,
        };

        let resolved = self.resolve_spill_refs(ast, sheet, &mut pass, 0);
        let (status, result, shape) =
            if ast_produces_array(&resolved, pass.shapes(self.name_scope(sheet))) {
                match self.eval_matrix_arg(&resolved, sheet, &mut pass, 0) {
                    // A one-cell array, such as a one-cell OFFSET, shows as its value.
                    Ok(matrix) if matrix.rows == 1 && matrix.cols == 1 => {
                        (FormulaPreviewStatus::Value, matrix.into_first(), (1, 1))
                    }
                    Ok(matrix) => {
                        let shape = (matrix.rows, matrix.cols);
                        (FormulaPreviewStatus::Array, matrix.into_first(), shape)
                    }
                    Err(error) => (FormulaPreviewStatus::Value, Value::Error(error), (1, 1)),
                }
            } else {
                let value = self.eval_ast(&resolved, sheet, &mut pass, 0);
                (FormulaPreviewStatus::Value, value, (1, 1))
            };
        // The preview shows what the cell would show: 0 for a reference to an empty cell.
        let value = super::cell_value(result);

        if value == Value::Error(FormulaError::Loading) {
            return FormulaPreview::unavailable(FormulaPreviewStatus::Loading);
        }
        if let Value::Text(text) = &value {
            if super::preview_limits::text(text.len()).is_err() {
                return FormulaPreview::unavailable(FormulaPreviewStatus::CostLimit);
            }
        }
        FormulaPreview::value(status, value, shape)
    }
}

/// Refuses a formula that would call a function that changes state or a
/// host function, wherever the call sits, before any of the formula runs.
struct SafetyWalk<'a> {
    store: &'a CellStore,
    sheet: usize,
    scope: &'a PreviewScope,
    /// Defined names already walked: a name used many times is walked once.
    named: Vec<NameId>,
    refusal: Option<FormulaPreviewStatus>,
}

impl SafetyWalk<'_> {
    /// Walks `ast`; returns true once the formula is refused.
    fn visit(&mut self, ast: &Ast, depth: usize) -> bool {
        if depth > PREVIEW_NESTING || self.scope.charge_work(1).is_err() {
            return self.refuse(FormulaPreviewStatus::CostLimit);
        }

        if matches!(ast, Ast::Func(Func::Rand | Func::RandBetween, ..)) {
            return self.refuse(FormulaPreviewStatus::UnsafeFunction);
        }
        if let Ast::DefinedName(id, _) = ast {
            if !self.named.contains(id) {
                self.named.push(*id);
                let names = self.store.name_scope(self.sheet);
                let read = names.read(*id);
                let refused = read
                    .formula()
                    .is_some_and(|expression| self.visit(expression, depth + 1));
                if refused {
                    return true;
                }
            }
        }
        if let Ast::UnknownFunc(call) = ast {
            if self.unknown_call_refused(&call.name, depth) {
                return true;
            }
        }
        ast.any_child(&mut |child| self.visit(child, depth + 1))
    }

    /// A host function is refused. A call the formula left unbound can be a
    /// defined name's LAMBDA, whose formula is walked once.
    #[cfg_attr(
        not(feature = "host-functions"),
        allow(
            unused_variables,
            clippy::unused_self,
            clippy::needless_pass_by_ref_mut,
            clippy::missing_const_for_fn,
            reason = "the default engine has no host functions or LAMBDA"
        )
    )]
    fn unknown_call_refused(&mut self, name: &str, depth: usize) -> bool {
        #[cfg(feature = "host-functions")]
        if self
            .store
            .custom_functions
            .as_deref()
            .is_some_and(|functions| functions.contains_key(&name.to_ascii_uppercase()))
        {
            return self.refuse(FormulaPreviewStatus::UnsafeFunction);
        }

        #[cfg(feature = "analysis")]
        if let Some(id) = self
            .store
            .bindings
            .names
            .formula_id(name, self.sheet as u32)
        {
            // Only walked for what it calls, so its shape is not marked.
            return self.visit(&Ast::DefinedName(id, false), depth + 1);
        }

        false
    }

    fn refuse(&mut self, status: FormulaPreviewStatus) -> bool {
        self.refusal.get_or_insert(status);
        true
    }
}
