//! References whose coordinates are known only during evaluation.
//!
//! Decision: OFFSET and INDIRECT are volatile, as in Excel, instead of
//! recording the cells each evaluation read as dynamic graph edges.
//! - Every edit already recalculates the volatile set and its static readers,
//!   so an edited target always refreshes the formula.
//! - Dynamic edges would retain up to the range budget per formula, need a
//!   bound and an eviction rule, and need repair on every row or column edit.
//!   Volatility retains no edges and needs no structural repair, because the
//!   next evaluation reads the reference again.
//! - Workbooks without these functions pay nothing: the volatile set stays
//!   empty, and nonvolatile recalculation has no new per-cell check.
//! - The cost is paid by workbooks that use them: one evaluation of each such
//!   formula per edit (about 5 ms per edit for 10,000 OFFSET formulas).
//!
//! Runtime reads go through the shared [`EvalPass`], so a reference that
//! reaches its own formula meets the visiting set and returns `#CYCLE!`.
//!
//! Evaluation resolves the calls where it meets them, inside the live LET and
//! LAMBDA scopes. Formula cells also rewrite the calls into plain references
//! before evaluation, so consumers that accept only a written reference
//! (ROWS, SUMIF, INDEX, ...) see one.

use std::cell::RefCell;

use crate::calc::{sheet_name_key, Ast, Func, RangeFlags, RefFlags, SheetRef};
use crate::store::CellStore;
use crate::types::{CellRange, FormulaError, Value};

use super::matrix::{range_from_ast, EvalMatrix, SPILL_MAX_COLS, SPILL_MAX_ROWS};
use super::value::{bool_from_value, number_from_value, text_from_value};
use super::{current_formula_origin, sheet_envelopes, EvalPass};

const OFFSET_MIN_ARGS: usize = 3;
const OFFSET_MAX_ARGS: usize = 5;

/// Where a call sits in the tree that the formula-cell rewrite walks.
#[derive(Clone, Copy, PartialEq)]
pub(super) enum RewriteScope {
    /// The formula's own result: a one-cell reference stays a range, so the
    /// spill path still sees an array-producing expression.
    Root,
    /// Any other position: a one-cell reference becomes a cell, which scalar
    /// consumers such as IF and IFERROR read as a value.
    Nested,
    /// Inside LET or LAMBDA, whose names are bound only during evaluation.
    /// Only `A1#` is rewritten here; evaluation resolves the calls.
    Deferred,
}

impl RewriteScope {
    fn child(self) -> Self {
        match self {
            Self::Deferred => Self::Deferred,
            Self::Root | Self::Nested => Self::Nested,
        }
    }
}

pub(super) fn ast_contains_runtime_ref(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::Offset | Func::Indirect, _) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(ast_contains_runtime_ref),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            ast_contains_runtime_ref(left) || ast_contains_runtime_ref(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => ast_contains_runtime_ref(inner),
        Ast::LetSlot { expression, .. } => ast_contains_runtime_ref(expression),
        _ => false,
    }
}

fn sheet_ref(handle: u32) -> SheetRef {
    SheetRef {
        handle,
        name: String::new(),
        quoted: false,
    }
}

fn range_ast(range: CellRange) -> Ast {
    Ast::AbsRange(
        sheet_ref(range.sheet),
        range.row_start,
        range.col_start,
        range.row_end,
        range.col_end,
        RangeFlags::default(),
    )
}

fn is_single_cell(range: CellRange) -> bool {
    range.row_start == range.row_end && range.col_start == range.col_end
}

/// The ranges runtime references resolved to in one anchor evaluation.
#[derive(Default)]
pub(super) struct RuntimeReads {
    pub(super) ranges: Vec<CellRange>,
    /// Past [`RUNTIME_READ_LIMIT`] the ranges are bounding ranges that can
    /// cover cells the anchor never read, so a change inside them does not
    /// prove that the anchor read it.
    pub(super) merged: bool,
}

thread_local! {
    /// The reads of the spill anchor being evaluated; `None` outside such an
    /// evaluation. The spill loop uses them to find anchors that read a spill
    /// installed after them.
    static RUNTIME_READS: RefCell<Option<RuntimeReads>> = const { RefCell::new(None) };
}

/// Starts recording runtime reads and returns the enclosing recording, which
/// [`finish_runtime_reads`] restores.
pub(super) fn start_runtime_reads() -> Option<RuntimeReads> {
    RUNTIME_READS.with(|reads| reads.replace(Some(RuntimeReads::default())))
}

/// The reads recorded since the matching [`start_runtime_reads`].
pub(super) fn finish_runtime_reads(enclosing: Option<RuntimeReads>) -> RuntimeReads {
    RUNTIME_READS
        .with(|reads| reads.replace(enclosing))
        .unwrap_or_default()
}

/// Recorded ranges kept apart per anchor evaluation. Past it, ranges merge
/// into one bounding range per sheet: a LAMBDA can resolve a reference per
/// element, and a coarser range only requeues an anchor more often.
const RUNTIME_READ_LIMIT: usize = 256;

fn record_runtime_read(reads: &mut RuntimeReads, range: CellRange) {
    if reads.ranges.len() < RUNTIME_READ_LIMIT {
        reads.ranges.push(range);
        return;
    }

    let merged = sheet_envelopes(reads.ranges.drain(..).chain(std::iter::once(range)));
    reads.ranges = merged;
    reads.merged = true;
}

impl CellStore {
    /// The range an OFFSET or INDIRECT call refers to now.
    pub(super) fn runtime_range(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<CellRange, FormulaError> {
        let range = match func {
            Func::Offset => self.offset_reference(args, sheet, pass, depth)?,
            Func::Indirect => self.indirect_reference(args, sheet, pass, depth)?,
            _ => return Err(FormulaError::Ref),
        };

        if range.row_end as usize >= SPILL_MAX_ROWS || range.col_end as usize >= SPILL_MAX_COLS {
            return Err(FormulaError::Ref);
        }

        RUNTIME_READS.with(|reads| {
            if let Some(reads) = reads.borrow_mut().as_mut() {
                record_runtime_read(reads, range);
            }
        });
        Ok(range)
    }

    /// A scalar context reads a one-cell reference as that cell. A larger
    /// reference is `#VALUE!`, as a written range is in the same place.
    pub(super) fn eval_runtime_reference(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Value {
        match self.runtime_range(func, args, sheet, pass, depth) {
            Ok(range) if is_single_cell(range) => self.eval_at(
                range.sheet as usize,
                range.row_start as usize,
                range.col_start as usize,
                pass,
                depth + 1,
            ),
            Ok(_) => Value::Error(FormulaError::Value),
            Err(error) => Value::Error(error),
        }
    }

    pub(super) fn eval_runtime_reference_matrix(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        let range = self.runtime_range(func, args, sheet, pass, depth)?;
        self.eval_matrix_arg(&range_ast(range), sheet, pass, depth + 1)
    }

    /// A copy of a formula's tree in which every `A1#` is the range its anchor
    /// spills into now, and every OFFSET or INDIRECT outside LET and LAMBDA is
    /// the reference it resolves to now.
    pub(super) fn resolve_spill_refs(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Ast {
        let mut resolved = ast.clone();
        self.rewrite_references(&mut resolved, sheet, pass, depth, RewriteScope::Root);
        resolved
    }

    /// The expansion of a LET whose arguments call OFFSET or INDIRECT, with
    /// those calls rewritten inside the LET's live slot scope. Bindings that
    /// the calls read are evaluated once and cached for the evaluation that
    /// follows in the same scope.
    pub(super) fn resolve_let_runtime_refs(
        &self,
        args: &[Ast],
        mut expanded: Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
        scope: RewriteScope,
    ) -> Ast {
        if args.iter().any(ast_contains_runtime_ref) {
            self.rewrite_references(&mut expanded, sheet, pass, depth, scope);
        }
        expanded
    }

    fn rewrite_references(
        &self,
        ast: &mut Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
        scope: RewriteScope,
    ) {
        if depth > crate::types::FORMULA_RECURSION_LIMIT {
            return;
        }

        let child = scope.child();
        match ast {
            Ast::Func(Func::AnchorArray, args) => *ast = self.spill_reference(args, sheet),
            Ast::Func(func @ (Func::Offset | Func::Indirect), args) => {
                for arg in args.iter_mut() {
                    self.rewrite_references(arg, sheet, pass, depth + 1, child);
                }
                if scope == RewriteScope::Deferred {
                    return;
                }

                // A #REF! becomes the node consumers already know. Other
                // errors keep the call below the root, so evaluation reports
                // them where they occur. At the root the error is the result;
                // keeping the call there would charge the spill budget for an
                // unknown shape on every recalculation.
                match self.runtime_range(*func, args, sheet, pass, depth + 1) {
                    Ok(range) if scope == RewriteScope::Nested && is_single_cell(range) => {
                        *ast = Ast::AbsCell(
                            sheet_ref(range.sheet),
                            range.row_start,
                            range.col_start,
                            RefFlags::default(),
                        );
                    }
                    Ok(range) => *ast = range_ast(range),
                    Err(FormulaError::Ref) => *ast = Ast::InvalidRef,
                    Err(error) if scope == RewriteScope::Root => {
                        *ast = Ast::Array {
                            cols: 1,
                            values: vec![Value::Error(error)],
                        };
                    }
                    Err(_) => {}
                }
            }
            Ast::Func(Func::Let, args) | Ast::UnknownFunc(_, args) => {
                for arg in args {
                    self.rewrite_references(arg, sheet, pass, depth + 1, RewriteScope::Deferred);
                }
            }
            #[cfg(feature = "analysis")]
            Ast::Func(Func::Analysis(_), args) => {
                for arg in args {
                    self.rewrite_references(arg, sheet, pass, depth + 1, RewriteScope::Deferred);
                }
            }
            Ast::Func(_, args) => {
                for arg in args {
                    self.rewrite_references(arg, sheet, pass, depth + 1, child);
                }
            }
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                self.rewrite_references(left, sheet, pass, depth + 1, child);
                self.rewrite_references(right, sheet, pass, depth + 1, child);
            }
            Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
                self.rewrite_references(inner, sheet, pass, depth + 1, child);
            }
            Ast::LetSlot { expression, .. } => {
                self.rewrite_references(expression, sheet, pass, depth + 1, child);
            }
            _ => {}
        }
    }

    fn offset_reference(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<CellRange, FormulaError> {
        if !(OFFSET_MIN_ARGS..=OFFSET_MAX_ARGS).contains(&args.len()) {
            return Err(FormulaError::Value);
        }

        let source = match range_from_ast(&args[0], sheet) {
            Some(source) => source,
            None => {
                return Err(match self.eval_ast(&args[0], sheet, pass, depth + 1) {
                    Value::Error(error) => error,
                    _ => FormulaError::Value,
                });
            }
        };
        let mut integer = |index: usize, default: i64| -> Result<i64, FormulaError> {
            match args.get(index) {
                None | Some(Ast::Missing) => Ok(default),
                Some(expression) => {
                    let value = self.eval_ast(expression, sheet, pass, depth + 1);
                    let number = number_from_value(&value)?.trunc();
                    if number < i64::MIN as f64 || number >= i64::MAX as f64 {
                        return Err(FormulaError::Ref);
                    }
                    Ok(number as i64)
                }
            }
        };
        let rows = integer(1, 0)?;
        let cols = integer(2, 0)?;
        let height = integer(3, i64::from(source.row_end - source.row_start) + 1)?;
        let width = integer(4, i64::from(source.col_end - source.col_start) + 1)?;
        if height <= 0 || width <= 0 {
            return Err(FormulaError::Value);
        }

        let row = i64::from(source.row_start)
            .checked_add(rows)
            .ok_or(FormulaError::Ref)?;
        let col = i64::from(source.col_start)
            .checked_add(cols)
            .ok_or(FormulaError::Ref)?;
        let row_end = row.checked_add(height - 1).ok_or(FormulaError::Ref)?;
        let col_end = col.checked_add(width - 1).ok_or(FormulaError::Ref)?;
        if row < 0
            || col < 0
            || row_end >= SPILL_MAX_ROWS as i64
            || col_end >= SPILL_MAX_COLS as i64
        {
            return Err(FormulaError::Ref);
        }

        Ok(CellRange::new(
            source.sheet,
            row as u32,
            col as u32,
            row_end as u32,
            col_end as u32,
        ))
    }

    fn indirect_reference(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<CellRange, FormulaError> {
        if args.is_empty() || args.len() > 2 {
            return Err(FormulaError::Value);
        }

        let value = self.eval_ast(&args[0], sheet, pass, depth + 1);
        if let Value::Error(error) = value {
            return Err(error);
        }
        let text = text_from_value(&value)?;
        let a1 = match args.get(1) {
            None | Some(Ast::Missing) => true,
            Some(expression) => {
                bool_from_value(&self.eval_ast(expression, sheet, pass, depth + 1))?
            }
        };

        // The formula parser trims spaces, strips `=` and unwraps brackets;
        // reference text must not get those, so `"=A1"` stays #REF! as in Excel.
        if text.trim() != text || text.starts_with(['=', '(']) {
            return Err(FormulaError::Ref);
        }

        let converted;
        let source = if a1 {
            text.as_str()
        } else {
            converted = match r1c1_to_a1(&text, current_formula_origin().unwrap_or((0, 0))) {
                Ok(converted) => converted,
                Err(error) => return self.indirect_named_reference(&text, sheet).ok_or(error),
            };
            &converted
        };
        let (row, col) = current_formula_origin().unwrap_or((0, 0));
        let entry = self.parse_formula_entry(source, sheet as u32, row, col);
        entry
            .ast
            .as_ref()
            .and_then(|ast| range_from_ast(ast, sheet))
            .or_else(|| self.indirect_named_reference(source, sheet))
            .ok_or(FormulaError::Ref)
    }

    fn indirect_named_reference(&self, text: &str, sheet: usize) -> Option<CellRange> {
        let (sheet, name) = match text.rsplit_once('!') {
            Some((qualifier, name)) => {
                let unquoted = qualifier
                    .strip_prefix('\'')
                    .and_then(|value| value.strip_suffix('\''));
                let title = unquoted.unwrap_or(qualifier).replace("''", "'");
                let sheet = self
                    .sheet_ids
                    .get(&title)
                    .or_else(|| self.sheet_lookup.get(&sheet_name_key(&title)))?;
                (*sheet, name)
            }
            None => (sheet, text),
        };
        let (row, col) = current_formula_origin().unwrap_or((0, 0));
        let entry = self.parse_formula_entry(name, sheet as u32, row, col);
        match entry.ast.as_ref()? {
            ast @ (Ast::NamedRange(_) | Ast::Structured(_)) => range_from_ast(ast, sheet),
            _ => None,
        }
    }
}

fn r1c1_to_a1(text: &str, origin: (u32, u32)) -> Result<String, FormulaError> {
    let (prefix, reference) = text
        .rsplit_once('!')
        .map_or(("", text), |(sheet, reference)| {
            (&text[..sheet.len() + 1], reference)
        });
    let mut output = String::from(prefix);
    for (index, endpoint) in reference.split(':').enumerate() {
        if index > 1 {
            return Err(FormulaError::Ref);
        }
        if index != 0 {
            output.push(':');
        }
        let endpoint = endpoint.to_ascii_uppercase();
        let remainder = endpoint.strip_prefix('R').ok_or(FormulaError::Ref)?;
        let separator = remainder.find('C').ok_or(FormulaError::Ref)?;
        let row = r1c1_axis(&remainder[..separator], origin.0, SPILL_MAX_ROWS)?;
        let col = r1c1_axis(&remainder[separator + 1..], origin.1, SPILL_MAX_COLS)?;
        let mut column = col + 1;
        let mut letters = [0u8; 3];
        let mut start = letters.len();
        while column > 0 {
            start -= 1;
            letters[start] = b'A' + ((column - 1) % 26) as u8;
            column = (column - 1) / 26;
        }
        for &letter in &letters[start..] {
            output.push(char::from(letter));
        }
        output.push_str(&(row + 1).to_string());
    }
    Ok(output)
}

fn r1c1_axis(text: &str, origin: u32, limit: usize) -> Result<u32, FormulaError> {
    let coordinate = if text.is_empty() {
        i64::from(origin)
    } else if let Some(relative) = text
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
    {
        i64::from(origin)
            .checked_add(relative.parse::<i64>().map_err(|_| FormulaError::Ref)?)
            .ok_or(FormulaError::Ref)?
    } else {
        text.parse::<i64>()
            .map_err(|_| FormulaError::Ref)?
            .checked_sub(1)
            .ok_or(FormulaError::Ref)?
    };
    if coordinate < 0 || coordinate >= limit as i64 {
        return Err(FormulaError::Ref);
    }
    Ok(coordinate as u32)
}
