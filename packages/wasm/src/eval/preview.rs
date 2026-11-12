//! The result of a formula text, evaluated against the store without
//! changing it, for the result preview in formula help (#221).
//!
//! A preview parses and resolves the text as the cell at its position would,
//! then evaluates it with an empty set of formulas to recompute: every
//! referenced formula is read from its stored result, nothing registers a
//! dependency, writes a cell or a spill, or creates history. Before
//! evaluation, a walk over the tree refuses functions that change state
//! (RAND, RANDBETWEEN) and host functions. During evaluation the existing
//! range, array, text and LAMBDA checks apply the smaller limits of
//! `preview_limits`, so a preview stays within its time budget.

use wasm_bindgen::prelude::*;

use crate::calc::{Ast, Func};
use crate::formula_slots::{FormulaResults, FormulaWork};
use crate::store::CellStore;
use crate::types::{FormulaError, Value};

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

impl CellStore {
    /// The result `source` (a formula with its leading `=`) would have in the
    /// cell at `row` and `col` of `sheet`, without changing the store.
    /// Referenced formulas give their stored results; nothing recalculates.
    /// A formula that calls RAND, RANDBETWEEN or a host function is refused
    /// before any of it runs, and one that needs more than the preview
    /// limits returns `CostLimit` rather than a partial answer.
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
        let Ok(ast) = self.resolve_preview_ast(source, formula_sheet, row, col) else {
            return FormulaPreview::unavailable(FormulaPreviewStatus::Syntax);
        };

        let scope = PreviewScope::enter();
        let _origin = FormulaOriginGuard::push((row, col));
        let _reads = super::reference::RuntimeReadPause::enter();
        let mut walk = SafetyWalk {
            #[cfg(feature = "host-functions")]
            store: self,
            #[cfg(feature = "host-functions")]
            sheet,
            scope: &scope,
            named: Vec::new(),
            refusal: None,
        };
        walk.visit(&ast, 0);
        if let Some(refusal) = walk.refusal {
            return FormulaPreview::unavailable(refusal);
        }

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
        let (status, value, shape) = if ast_produces_array(&resolved) {
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

        if value == Value::Error(FormulaError::Loading) {
            return FormulaPreview::unavailable(FormulaPreviewStatus::Loading);
        }
        FormulaPreview::value(status, value, shape)
    }
}

/// Refuses a formula that would call a function that changes state or a
/// host function, wherever the call sits, before any of the formula runs.
struct SafetyWalk<'a> {
    #[cfg(feature = "host-functions")]
    store: &'a CellStore,
    #[cfg(feature = "host-functions")]
    sheet: usize,
    scope: &'a PreviewScope,
    /// Defined names already walked, by address: a name used many times is
    /// walked once.
    named: Vec<usize>,
    refusal: Option<FormulaPreviewStatus>,
}

impl SafetyWalk<'_> {
    /// Walks `ast`; returns true once the formula is refused.
    fn visit(&mut self, ast: &Ast, depth: usize) -> bool {
        if depth > PREVIEW_NESTING || self.scope.charge_work(1).is_err() {
            return self.refuse(FormulaPreviewStatus::CostLimit);
        }

        if matches!(ast, Ast::Func(Func::Rand | Func::RandBetween, _)) {
            return self.refuse(FormulaPreviewStatus::UnsafeFunction);
        }
        if let Ast::NamedFormula(named) = ast {
            let address = std::rc::Rc::as_ptr(named) as usize;
            if !self.named.contains(&address) {
                self.named.push(address);
                if self.visit(&named.expression, depth + 1) {
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

    /// A host function is refused. A call the formula left unresolved can be
    /// a defined name's LAMBDA calling itself, whose body is walked once.
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
        if let Some(lambda) = self.store.named_lambda(name, self.sheet) {
            return self.visit(&Ast::NamedFormula(lambda), depth + 1);
        }

        false
    }

    fn refuse(&mut self, status: FormulaPreviewStatus) -> bool {
        self.refusal.get_or_insert(status);
        true
    }
}
