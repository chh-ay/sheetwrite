//! Bounded dynamic-array evaluation: the dispatch for every array
//! expression, the array functions (FILTER, SORT, UNIQUE, TAKE, DROP,
//! CHOOSECOLS, CHOOSEROWS, TRANSPOSE, SEQUENCE and TRIMRANGE), spill
//! references (`A1#`), and the shape and spill-budget checks made before
//! evaluation.

use std::cmp::Ordering;
use std::collections::hash_map::DefaultHasher;

use rustc_hash::FxHashMap;
use std::hash::{Hash, Hasher};
use std::mem::size_of;
use std::rc::Rc;

use crate::calc::{Ast, Func, RangeFlags, Shape, SheetRef};
use crate::store::names::NameScope;
use crate::store::CellStore;
use crate::types::{FormulaError, Value};

use super::expand_let_ast;
use super::index::index_selects_whole_axis;
use super::lookup::{integer_arg, option_code};
use super::matrix::{
    intersection_range, optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_RECOMPUTE_CELLS,
    UNKNOWN_SIZE_PRECHARGE,
};
use super::range_view::{RowReader, ValueRows};
use super::reference::RewriteScope;
use super::value::{bool_from_value, compare_values, number_from_value};
use super::{placed_cell, EvalPass};

pub(super) fn static_integer(ast: Option<&Ast>) -> Option<i64> {
    match ast? {
        Ast::Num(value)
            if value.is_finite() && *value >= i64::MIN as f64 && *value <= i64::MAX as f64 =>
        {
            Some(value.trunc() as i64)
        }
        Ast::Neg(inner, _) => static_integer(Some(inner)).and_then(i64::checked_neg),
        Ast::Pos(inner, _) => static_integer(Some(inner)),
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
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Percent(..)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => None,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => None,
    }
}

/// What shape checks know about LAMBDA parameters and the named LAMBDAs
/// they call; the default engine has no LAMBDA, so it knows nothing and
/// costs nothing. A defined name's own shape is marked on its use
/// ([`Ast::DefinedName`]), so no check reads it.
#[cfg(feature = "analysis")]
pub(crate) use super::analysis::lambda::Shapes;

#[cfg(not(feature = "analysis"))]
#[derive(Clone, Copy)]
pub(crate) struct Shapes<'a>(std::marker::PhantomData<&'a ()>);

#[cfg(not(feature = "analysis"))]
impl<'a> Shapes<'a> {
    /// A formula's own shape, outside every call. `_names` serves the
    /// analysis engine's named LAMBDA calls; this engine has none.
    pub(crate) const fn top(_names: NameScope<'a>) -> Self {
        Self(std::marker::PhantomData)
    }
}

/// Whether `ast` evaluates to an array. A LAMBDA parameter's shape comes
/// from `shapes`: [`Shapes::top`] outside every call. A value, a cell or a
/// written range, what most arguments are, is decided inline; every other
/// node takes [`node_produces_array`].
#[inline]
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "every other node takes the full walk; listing them here would only repeat it"
)]
pub(crate) fn ast_produces_array(ast: &Ast, shapes: Shapes<'_>) -> bool {
    match ast {
        Ast::Num(_) | Ast::Str(_) | Ast::Bool(_) | Ast::Cell(..) | Ast::AbsCell(..) => false,
        Ast::Range(..) | Ast::AbsRange(..) => true,
        _ => node_produces_array(ast, shapes),
    }
}

/// [`ast_produces_array`] of any other node. A call or operator whose
/// [`Shape`] was decided when it was built answers without a walk; the
/// rest are decided here.
fn node_produces_array(ast: &Ast, _shapes: Shapes<'_>) -> bool {
    match ast {
        Ast::Func(_, _, shape)
        | Ast::Bin(_, _, _, shape)
        | Ast::Cmp(_, _, _, shape)
        | Ast::Neg(_, shape)
        | Ast::Pos(_, shape)
        | Ast::Percent(_, shape)
            if shape.get() != Shape::Dynamic =>
        {
            shape.get() == Shape::Array
        }
        Ast::Func(Func::AnchorArray | Func::Offset | Func::Indirect | Func::Intersect, ..) => true,
        #[cfg(feature = "analysis")]
        Ast::Parameter { depth, index, .. } => _shapes.parameter_is_array(*depth, *index),
        #[cfg(feature = "analysis")]
        Ast::UnknownFunc(call) if call.name == super::analysis::lambda::CALL => {
            let args = &call.args;
            super::analysis::lambda::produces_array(
                super::analysis::lambda::Invocation::Call,
                args,
                _shapes,
            )
        }
        Ast::DefinedName(_, produces_array) => *produces_array,
        Ast::Structured(reference) => reference.row_start != reference.row_end,
        Ast::Range(..) | Ast::AbsRange(..) | Ast::Array(_) => true,
        Ast::LetSlot { expression, .. } => ast_produces_array(expression, _shapes),
        Ast::Bin(_, left, right, _) | Ast::Cmp(_, left, right, _) => {
            ast_produces_array(left, _shapes) || ast_produces_array(right, _shapes)
        }
        Ast::Neg(inner, _) | Ast::Pos(inner, _) | Ast::Percent(inner, _) => {
            ast_produces_array(inner, _shapes)
        }
        #[cfg(feature = "analysis")]
        // Reached only for a call whose shape is decided when asked: a
        // family with array hooks, or an argument whose shape is.
        Ast::Func(func @ Func::Analysis(id), args, _) => {
            super::analysis::array_hooks(*id, args, _shapes).is_some()
                || super::lift::lifts(*func, args, _shapes)
        }
        Ast::Func(
            Func::Filter
            | Func::Sort
            | Func::Unique
            | Func::Transpose
            | Func::Sequence
            | Func::Take
            | Func::Drop
            | Func::ChooseCols
            | Func::ChooseRows
            | Func::TrimRange,
            ..,
        ) => true,
        Ast::Func(Func::Let, args, _) => args.iter().any(|arg| ast_produces_array(arg, _shapes)),
        Ast::Func(Func::Index, args, _) => index_selects_whole_axis(args),
        // A selecting argument that is an array lifts the call; an array in
        // another argument is what the call can return.
        Ast::Func(
            Func::If | Func::IfError | Func::IfNa | Func::Ifs | Func::Switch | Func::Choose,
            args,
            _,
        ) => args.iter().any(|arg| ast_produces_array(arg, _shapes)),
        // A function that takes one value, given an array there.
        Ast::Func(func, args, _) => super::lift::lifts(*func, args, _shapes),
        _ => false,
    }
}

/// The [`Shape`] of `ast` as far as the tree decides it: the shape a call or
/// operator was built with, and for any other node the one its kind gives.
/// A node that binding or a rewrite can still turn into an array (a name, a
/// structured or detached reference, a LET name, a LAMBDA parameter, an
/// unknown call) is [`Shape::Dynamic`].
pub(crate) fn node_shape(ast: &Ast) -> Shape {
    match ast {
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Cell(..)
        | Ast::AbsCell(..)
        | Ast::SheetCell(_)
        | Ast::InvalidRef => Shape::Scalar,
        Ast::Range(..) | Ast::AbsRange(..) | Ast::Array(_) => Shape::Array,
        Ast::Func(_, _, shape)
        | Ast::Bin(_, _, _, shape)
        | Ast::Cmp(_, _, _, shape)
        | Ast::Neg(_, shape)
        | Ast::Pos(_, shape)
        | Ast::Percent(_, shape) => shape.get(),
        Ast::LetSlot { expression, .. } => node_shape(expression),
        Ast::Name(_)
        | Ast::DefinedName(..)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::SheetRange(_)
        | Ast::SheetSpan(_)
        | Ast::UnknownFunc(_)
        | Ast::LetName { .. } => Shape::Dynamic,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } => Shape::Dynamic,
        #[cfg(feature = "analysis")]
        Ast::Lambda(_) | Ast::RegexPattern(_) => Shape::Scalar,
    }
}

/// The [`Shape`] of a call of `func` with `args`, decided once when the call
/// is built ([`Ast::call`]). It follows [`node_produces_array`] arm by arm:
/// OFFSET, INDIRECT, `A1#` and a family with array hooks are decided when
/// asked, the array functions are arrays, LET and the branch functions are
/// arrays when an argument is, INDEX when it selects a whole row or column,
/// and every other function when an argument that takes one value is.
pub(crate) fn call_shape(func: Func, args: &[Ast]) -> Shape {
    match func {
        Func::AnchorArray | Func::Offset | Func::Indirect => Shape::Dynamic,
        #[cfg(feature = "analysis")]
        Func::Analysis(id) if super::analysis::family(id).array.is_some() => Shape::Dynamic,
        Func::Intersect
        | Func::Filter
        | Func::Sort
        | Func::Unique
        | Func::Transpose
        | Func::Sequence
        | Func::Take
        | Func::Drop
        | Func::ChooseCols
        | Func::ChooseRows
        | Func::TrimRange => Shape::Array,
        Func::Let
        | Func::If
        | Func::IfError
        | Func::IfNa
        | Func::Ifs
        | Func::Switch
        | Func::Choose => Shape::any(args.iter().map(node_shape)),
        Func::Index if index_selects_whole_axis(args) => Shape::Array,
        Func::Index => Shape::Scalar,
        _ => {
            let value_args = super::lift::value_args(func);
            Shape::any(
                args.iter()
                    .enumerate()
                    .filter(|&(index, _)| value_args.takes(index))
                    .map(|(_, arg)| node_shape(arg)),
            )
        }
    }
}

fn sequence_shape(args: &[Ast]) -> Result<(usize, usize, usize), FormulaError> {
    if args.is_empty() || args.len() > 4 {
        return Err(FormulaError::Value);
    }
    let requested_rows = static_integer(optional_ast(args, 0)).ok_or(FormulaError::Value)?;
    let requested_cols = static_integer(optional_ast(args, 1)).unwrap_or(1);
    if requested_rows <= 0 || requested_cols <= 0 {
        return Err(FormulaError::Value);
    }
    let rows = usize::try_from(requested_rows).map_err(|_| FormulaError::Num)?;
    let cols = usize::try_from(requested_cols).map_err(|_| FormulaError::Num)?;
    let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
    Ok((rows, cols, cells))
}

fn transformed_axis_bound(size: usize, requested: i64, drop: bool) -> Result<usize, FormulaError> {
    if requested == 0 {
        return Err(FormulaError::Calc);
    }
    let magnitude = usize::try_from(requested.unsigned_abs()).unwrap_or(usize::MAX);
    let selected = magnitude.min(size);
    let output = if drop {
        size.saturating_sub(selected)
    } else {
        selected
    };
    if output == 0 {
        Err(FormulaError::Calc)
    } else {
        Ok(output)
    }
}

impl CellStore {
    /// The range that the anchor of `A1#` spills into now, or `#REF!` when
    /// the anchor holds no spill.
    pub(super) fn spill_reference(&self, args: &[Ast], formula_sheet: usize) -> Ast {
        let (sheet, row, col) = match args {
            [Ast::Cell(row, col, flags)] => {
                let (placed_row, placed_col) = placed_cell(*row, *col, *flags);
                (formula_sheet, placed_row, placed_col)
            }
            [Ast::AbsCell(sheet, row, col, flags)] => {
                let (placed_row, placed_col) = placed_cell(*row, *col, *flags);
                (sheet.handle as usize, placed_row, placed_col)
            }
            _ => return Ast::InvalidRef,
        };
        let Some(range) = self
            .sheets
            .get(sheet)
            .and_then(|data| data.spill.installed((row, col)))
        else {
            return Ast::InvalidRef;
        };
        let sheet_ref = SheetRef {
            handle: sheet as u32,
        };
        Ast::AbsRange(
            sheet_ref,
            row,
            col,
            range.row_end,
            range.col_end,
            RangeFlags::ABSOLUTE,
        )
    }

    pub(super) fn dynamic_array_bound(
        &self,
        ast: &Ast,
        formula_sheet: usize,
        pass: &mut EvalPass<'_>,
    ) -> Option<Result<usize, FormulaError>> {
        match ast {
            // The shape is known only after evaluation, so the pending loop
            // charges the spill budget with the evaluated size instead.
            Ast::Func(Func::Offset | Func::Indirect, ..) => Some(Ok(UNKNOWN_SIZE_PRECHARGE)),
            Ast::Bin(..) | Ast::Cmp(..) | Ast::Neg(..) | Ast::Pos(..) | Ast::Percent(..)
                if ast_produces_array(ast, pass.shapes(self.name_scope(formula_sheet))) =>
            {
                Some(
                    self.matrix_shape(ast, formula_sheet, pass)
                        .map(|shape| shape.2)
                        .or_else(|error| {
                            // An operator over a runtime reference or a size
                            // read from a cell gets its shape only after
                            // evaluation, which charges it.
                            if error == FormulaError::Value {
                                Ok(UNKNOWN_SIZE_PRECHARGE)
                            } else {
                                Err(error)
                            }
                        }),
                )
            }
            Ast::Func(Func::AnchorArray, args, _) => {
                let range = self.spill_reference(args, formula_sheet);
                Some(
                    self.matrix_shape(&range, formula_sheet, pass)
                        .map(|(_, _, cells)| cells),
                )
            }
            #[cfg(feature = "analysis")]
            Ast::Parameter { depth, index, .. } => {
                let frame = pass.results.call_frame();
                let (rows, cols) = super::analysis::lambda::parameter_shape(frame, *depth, *index)?;
                Some(EvalMatrix::validate_shape(rows, cols, 1, 0))
            }
            #[cfg(feature = "analysis")]
            Ast::UnknownFunc(call) if call.name == super::analysis::lambda::CALL => {
                let args = &call.args;
                ast_produces_array(ast, pass.shapes(self.name_scope(formula_sheet))).then(|| {
                    runtime_reference_bound(
                        ast,
                        super::analysis::lambda::bound(
                            self,
                            super::analysis::lambda::Invocation::Call,
                            args,
                            formula_sheet,
                            pass,
                        ),
                        self.name_scope(formula_sheet),
                    )
                })
            }
            #[cfg(feature = "analysis")]
            Ast::Func(func @ Func::Analysis(id), args, _) => {
                let names = self.name_scope(formula_sheet);
                if let Some(hooks) = super::analysis::array_hooks(*id, args, pass.shapes(names)) {
                    return Some(runtime_reference_bound(
                        ast,
                        (hooks.bound)(self, *id, args, formula_sheet, pass),
                        names,
                    ));
                }
                super::lift::lifts(*func, args, pass.shapes(names))
                    .then(|| self.lifted_bound(ast, formula_sheet, pass))
            }
            Ast::Range(..)
            | Ast::AbsRange(..)
            | Ast::Structured(..)
            | Ast::Func(Func::Intersect, ..)
            | Ast::Array(_) => Some(
                self.matrix_shape(ast, formula_sheet, pass)
                    .map(|(_, _, cells)| cells),
            ),
            Ast::LetSlot { expression, .. } => {
                self.dynamic_array_bound(expression, formula_sheet, pass)
            }
            Ast::DefinedName(id, _) => {
                let read = self.name_scope(formula_sheet).read(*id);
                if read.range().is_some() {
                    Some(
                        self.matrix_shape(ast, formula_sheet, pass)
                            .map(|(_, _, cells)| cells),
                    )
                } else {
                    read.with_formula(|expression| {
                        self.dynamic_array_bound(expression, formula_sheet, pass)
                    })
                    .flatten()
                }
            }
            // The selection is at most the whole area; an area that has no
            // shape before evaluation is charged after it.
            Ast::Func(Func::Index, args, _) if index_selects_whole_axis(args) => Some(Ok(self
                .matrix_shape(&args[0], formula_sheet, pass)
                .map_or(UNKNOWN_SIZE_PRECHARGE, |(_, _, cells)| cells))),
            Ast::Func(Func::Let, args, _) => match expand_let_ast(args) {
                Ok((expanded, _)) => self.dynamic_array_bound(&expanded, formula_sheet, pass),
                Err(_) => None,
            },
            Ast::Func(Func::Filter | Func::Sort | Func::Unique | Func::TrimRange, args, _) => {
                let Some(source) = args.first() else {
                    return Some(Err(FormulaError::Value));
                };
                Some(
                    self.matrix_shape(source, formula_sheet, pass)
                        .map(|(_, _, cells)| cells),
                )
            }
            Ast::Func(Func::Transpose | Func::Take | Func::Drop, args, _) => {
                let Some(source) = args.first() else {
                    return Some(Err(FormulaError::Value));
                };
                Some(match self.matrix_shape(ast, formula_sheet, pass) {
                    Ok((_, _, cells)) => Ok(cells),
                    Err(shape_error) if self.matrix_shape(source, formula_sheet, pass).is_ok() => {
                        Err(shape_error)
                    }
                    Err(shape_error) => self
                        .dynamic_array_bound(source, formula_sheet, pass)
                        .unwrap_or(Err(shape_error)),
                })
            }
            Ast::Func(Func::ChooseCols | Func::ChooseRows, args, _) => {
                let Some(source) = args.first() else {
                    return Some(Err(FormulaError::Value));
                };
                Some(match self.matrix_shape(ast, formula_sheet, pass) {
                    Ok((_, _, cells)) => Ok(cells),
                    Err(shape_error) if self.matrix_shape(source, formula_sheet, pass).is_ok() => {
                        Err(shape_error)
                    }
                    Err(shape_error) => match self.dynamic_array_bound(source, formula_sheet, pass)
                    {
                        Some(Ok(_)) => Ok(UNKNOWN_SIZE_PRECHARGE),
                        Some(Err(error)) => Err(error),
                        None => Err(shape_error),
                    },
                })
            }
            Ast::Func(Func::Sequence, args, _) => Some(if args.is_empty() || args.len() > 4 {
                Err(FormulaError::Value)
            } else if static_integer(optional_ast(args, 0)).is_none()
                || (optional_ast(args, 1).is_some()
                    && static_integer(optional_ast(args, 1)).is_none())
            {
                Ok(UNKNOWN_SIZE_PRECHARGE)
            } else {
                sequence_shape(args).map(|shape| shape.2)
            }),
            Ast::Func(Func::Choose, args, _) => {
                if args.len() < 2 {
                    return Some(Err(FormulaError::Value));
                }
                if let Some(index) = static_integer(args.first()) {
                    if index <= 0 || index as usize >= args.len() {
                        return Some(Err(FormulaError::Value));
                    }
                    return self.dynamic_array_bound(&args[index as usize], formula_sheet, pass);
                }
                Some(Ok(self.branches_bound(args, formula_sheet, pass)))
            }
            Ast::Func(
                Func::If | Func::IfError | Func::IfNa | Func::Ifs | Func::Switch,
                args,
                _,
            ) if ast_produces_array(ast, pass.shapes(self.name_scope(formula_sheet))) => {
                Some(Ok(self.branches_bound(args, formula_sheet, pass)))
            }
            Ast::Func(func, args, _)
                if super::lift::lifts(*func, args, pass.shapes(self.name_scope(formula_sheet))) =>
            {
                Some(self.lifted_bound(ast, formula_sheet, pass))
            }
            _ => None,
        }
    }

    /// The spill budget of a lifted call: its cells, or the unknown-size
    /// charge when an argument's shape is known only after evaluation, as
    /// for an operator.
    fn lifted_bound(
        &self,
        ast: &Ast,
        formula_sheet: usize,
        pass: &mut EvalPass<'_>,
    ) -> Result<usize, FormulaError> {
        match self.matrix_shape(ast, formula_sheet, pass) {
            Ok((_, _, cells)) => Ok(cells),
            Err(FormulaError::Value) => Ok(UNKNOWN_SIZE_PRECHARGE),
            Err(error) => Err(error),
        }
    }

    /// An array expression as one matrix. `None` for a scalar expression.
    pub(super) fn eval_dynamic_array(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<Result<EvalMatrix, FormulaError>> {
        self.eval_array(ast, sheet, pass, depth)
    }

    /// An array expression as rows of one base. The row steps (FILTER, SORT,
    /// UNIQUE, TAKE, DROP, CHOOSEROWS) pick rows of their argument's rows
    /// instead of copying them, and an array constant shares its values with
    /// the formula tree; any other array is one computed matrix. `None` for a
    /// scalar expression.
    pub(super) fn eval_rows(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<Result<ValueRows, FormulaError>> {
        self.eval_array(ast, sheet, pass, depth)
    }

    /// The one array dispatch, built once per result form so that a caller
    /// that wants a matrix gets a computed one as it is, and a row step's
    /// argument keeps the rows of its base.
    fn eval_array<T: ArrayResult>(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<Result<T, FormulaError>> {
        let result = match ast {
            Ast::Bin(..) | Ast::Cmp(..) | Ast::Neg(..) | Ast::Pos(..) | Ast::Percent(..)
                if ast_produces_array(ast, pass.shapes(self.name_scope(sheet))) =>
            {
                self.eval_operator_array(ast, sheet, pass, depth + 1)
            }
            Ast::Func(Func::AnchorArray, args, _) => {
                let range = self.spill_reference(args, sheet);
                return self.eval_array(&range, sheet, pass, depth);
            }
            Ast::Func(func @ (Func::Offset | Func::Indirect), args, _) => {
                self.eval_runtime_reference_matrix(*func, args, sheet, pass, depth + 1)
            }
            Ast::InvalidRef => Err(FormulaError::Ref),
            // An array argument shares its values with the call frame, so a
            // row step over it copies none.
            #[cfg(feature = "analysis")]
            Ast::Parameter { depth, index, .. } => {
                let frame = pass.results.call_frame();
                if let Some(super::analysis::lambda::Slot::Array { rows, cols, values }) =
                    frame.and_then(|call_frame| call_frame.slot(*depth, *index))
                {
                    return Some(T::shared(*rows, *cols, values));
                }
                Ok(super::analysis::lambda::parameter_matrix(
                    self, frame, *depth, *index,
                )?)
            }
            #[cfg(feature = "analysis")]
            Ast::UnknownFunc(call) if call.name == super::analysis::lambda::CALL => {
                let args = &call.args;
                if !ast_produces_array(ast, pass.shapes(self.name_scope(sheet))) {
                    return None;
                }
                super::analysis::lambda::evaluate_matrix(
                    self,
                    super::analysis::lambda::Invocation::Call,
                    args,
                    sheet,
                    pass,
                    depth + 1,
                )
            }
            #[cfg(feature = "analysis")]
            Ast::Func(Func::Analysis(id), args, _) => {
                match super::analysis::array_hooks(*id, args, pass.shapes(self.name_scope(sheet))) {
                    Some(hooks) => (hooks.evaluate)(self, *id, args, sheet, pass, depth + 1),
                    None => self.eval_lifted_family(ast, sheet, pass, depth + 1)?,
                }
            }
            Ast::Range(..) | Ast::AbsRange(..) | Ast::Structured(..) => {
                self.eval_matrix_arg(ast, sheet, pass, depth + 1)
            }
            // An empty intersection is #NULL!, which the range path cannot tell.
            Ast::Func(Func::Intersect, operands, _) => {
                intersection_range(operands, self.name_scope(sheet))
                    .and_then(|_| self.eval_matrix_arg(ast, sheet, pass, depth + 1))
            }
            Ast::Array(array) => {
                let crate::calc::ArrayLiteral { values, .. } = &**array;
                return Some(
                    self.matrix_shape(ast, sheet, pass)
                        .and_then(|(rows, cols, _)| T::shared(rows, cols, values)),
                );
            }
            Ast::LetSlot { expression, .. } => {
                return self.eval_array(expression, sheet, pass, depth)
            }
            Ast::DefinedName(id, _) => {
                let read = self.name_scope(sheet).read(*id);
                if read.range().is_none() {
                    return read
                        .with_formula(|expression| self.eval_array(expression, sheet, pass, depth))
                        .flatten();
                }
                self.eval_matrix_arg(ast, sheet, pass, depth + 1)
            }
            Ast::Func(Func::Let, args, _) => {
                let (expanded_ast, slots) = match expand_let_ast(args) {
                    Ok(expanded) => expanded,
                    Err(error) => return Some(Err(error)),
                };
                let enclosing = pass.results.let_frame_mut().open_expanded(slots);
                let expanded = self.resolve_let_runtime_refs(
                    args,
                    expanded_ast,
                    sheet,
                    pass,
                    depth + 1,
                    RewriteScope::Root,
                );
                let array = self.eval_array(&expanded, sheet, pass, depth + 1);
                pass.results.let_frame_mut().close_expanded(enclosing);
                return array;
            }
            Ast::Func(Func::Filter, args, _) => {
                return Some(
                    self.eval_filter(args, sheet, pass, depth + 1)
                        .and_then(T::rows),
                )
            }
            Ast::Func(Func::Sort, args, _) => {
                return Some(
                    self.eval_sort(args, sheet, pass, depth + 1)
                        .and_then(T::rows),
                )
            }
            Ast::Func(Func::Unique, args, _) => {
                return Some(
                    self.eval_unique(args, sheet, pass, depth + 1)
                        .and_then(T::rows),
                )
            }
            Ast::Func(Func::Take, args, _) => {
                return Some(
                    self.eval_take_drop(args, false, sheet, pass, depth + 1)
                        .and_then(T::rows),
                )
            }
            Ast::Func(Func::Drop, args, _) => {
                return Some(
                    self.eval_take_drop(args, true, sheet, pass, depth + 1)
                        .and_then(T::rows),
                )
            }
            Ast::Func(Func::ChooseCols, args, _) => {
                return Some(
                    self.eval_choose_axis(args, false, sheet, pass, depth + 1)
                        .and_then(T::rows),
                )
            }
            Ast::Func(Func::ChooseRows, args, _) => {
                return Some(
                    self.eval_choose_axis(args, true, sheet, pass, depth + 1)
                        .and_then(T::rows),
                )
            }
            Ast::Func(Func::Transpose, args, _) => {
                self.eval_transpose(args, sheet, pass, depth + 1)
            }
            Ast::Func(Func::TrimRange, args, _) => {
                self.eval_trim_range(args, sheet, pass, depth + 1)
            }
            Ast::Func(Func::Sequence, args, _) => self.eval_sequence(args, sheet, pass, depth + 1),
            // One out-of-line call: the check that IF and the other branch
            // functions produce an array stays in the family, out of the
            // evaluator this dispatch is inlined into.
            Ast::Func(
                Func::If | Func::IfError | Func::IfNa | Func::Ifs | Func::Switch | Func::Choose,
                ..,
            ) => self.eval_branches_family(ast, sheet, pass, depth + 1)?,
            Ast::Func(Func::Index, args, _) if index_selects_whole_axis(args) => {
                self.eval_index_array(args, sheet, pass, depth + 1)
            }
            // One out-of-line call, as for the branch functions: the check
            // that a function taking one value is lifted stays in the family.
            Ast::Func(..) => self.eval_lifted_family(ast, sheet, pass, depth + 1)?,
            _ => return None,
        };
        Some(result.and_then(T::computed))
    }
    fn eval_rows_arg(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<ValueRows, FormulaError> {
        let Some(rows) = self.eval_rows(ast, sheet, pass, depth + 1) else {
            return Err(FormulaError::Value);
        };
        rows
    }

    fn eval_array_matrix_arg(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if let Some(result) = self.eval_dynamic_array(ast, sheet, pass, depth + 1) {
            result
        } else {
            Err(FormulaError::Value)
        }
    }

    /// The shape of an array expression before it is evaluated. `pass` is the
    /// pass that asks; the full engine's shape hooks share its compiled regex
    /// programs, and the default engine only passes it on.
    #[cfg_attr(
        not(feature = "analysis"),
        allow(
            clippy::only_used_in_recursion,
            reason = "only full-engine hooks read the pass"
        )
    )]
    pub(super) fn matrix_shape(
        &self,
        ast: &Ast,
        formula_sheet: usize,
        pass: &mut EvalPass<'_>,
    ) -> Result<(usize, usize, usize), FormulaError> {
        match ast {
            Ast::Bin(_, left, right, _) | Ast::Cmp(_, left, right, _) => {
                let names = self.name_scope(formula_sheet);
                let (left_rows, left_cols, _) = if ast_produces_array(left, pass.shapes(names)) {
                    self.matrix_shape(left, formula_sheet, pass)?
                } else {
                    (1, 1, 1)
                };
                let (right_rows, right_cols, _) = if ast_produces_array(right, pass.shapes(names)) {
                    self.matrix_shape(right, formula_sheet, pass)?
                } else {
                    (1, 1, 1)
                };
                let rows = left_rows.max(right_rows);
                let cols = left_cols.max(right_cols);
                return Ok((rows, cols, EvalMatrix::validate_shape(rows, cols, 1, 0)?));
            }
            Ast::Neg(inner, _) | Ast::Pos(inner, _) | Ast::Percent(inner, _) => {
                return self.matrix_shape(inner, formula_sheet, pass);
            }
            Ast::Func(Func::AnchorArray, args, _) => {
                return self.matrix_shape(
                    &self.spill_reference(args, formula_sheet),
                    formula_sheet,
                    pass,
                );
            }
            Ast::InvalidRef => return Err(FormulaError::Ref),
            #[cfg(feature = "analysis")]
            Ast::Parameter { depth, index, .. } => {
                let frame = pass.results.call_frame();
                if let Some((rows, cols)) =
                    super::analysis::lambda::parameter_shape(frame, *depth, *index)
                {
                    return Ok((rows, cols, EvalMatrix::validate_shape(rows, cols, 1, 0)?));
                }
            }
            #[cfg(feature = "analysis")]
            Ast::UnknownFunc(call) if call.name == super::analysis::lambda::CALL => {
                let args = &call.args;

                return super::analysis::lambda::shape(
                    self,
                    super::analysis::lambda::Invocation::Call,
                    args,
                    formula_sheet,
                    pass,
                );
            }
            #[cfg(feature = "analysis")]
            Ast::Func(func @ Func::Analysis(id), args, _) => {
                let shapes = pass.shapes(self.name_scope(formula_sheet));
                let Some(hooks) = super::analysis::array_hooks(*id, args, shapes) else {
                    if super::lift::lifts(*func, args, shapes) {
                        return self.lifted_shape(*func, args, formula_sheet, pass);
                    }
                    return Err(FormulaError::Value);
                };
                let (rows, cols, cells) = (hooks.shape)(self, *id, args, formula_sheet, pass)?;
                let validated = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
                if cells != validated {
                    return Err(FormulaError::Value);
                }
                return Ok((rows, cols, cells));
            }
            Ast::Func(Func::Let, args, _) => {
                let (expanded, _) = expand_let_ast(args)?;
                return self.matrix_shape(&expanded, formula_sheet, pass);
            }
            Ast::Func(Func::Filter | Func::Sort | Func::Unique, args, _) => {
                return self.matrix_shape(
                    args.first().ok_or(FormulaError::Value)?,
                    formula_sheet,
                    pass,
                );
            }
            Ast::LetSlot { expression, .. } => {
                return self.matrix_shape(expression, formula_sheet, pass);
            }
            // A resolved name has its binding's shape, as its expansion would.
            Ast::LetName { slot, .. } => {
                // SAFETY: a resolved name is evaluated only inside its LET,
                // which has bound the slot and is still being evaluated.
                let frame = pass.results.let_frame();
                #[allow(unsafe_code, reason = "calls `LetFrame::binding`; see its reason")]
                let binding = frame.and_then(|active| unsafe { active.binding(*slot) });
                if let Some(bound) = binding {
                    return self.matrix_shape(bound, formula_sheet, pass);
                }
            }
            Ast::DefinedName(id, _) => {
                let read = self.name_scope(formula_sheet).read(*id);
                if let Some(shape) = read
                    .with_formula(|expression| self.matrix_shape(expression, formula_sheet, pass))
                {
                    return shape;
                }
            }
            Ast::Array(array) => {
                let crate::calc::ArrayLiteral {
                    cols: width,
                    values,
                } = &**array;
                let cols = *width as usize;
                let rows = values.len() / cols;
                return Ok((rows, cols, EvalMatrix::validate_shape(rows, cols, 1, 0)?));
            }
            Ast::Func(Func::Transpose, args, _) => {
                let (rows, cols, cells) = self.matrix_shape(
                    args.first().ok_or(FormulaError::Value)?,
                    formula_sheet,
                    pass,
                )?;
                return Ok((cols, rows, cells));
            }
            Ast::Func(Func::Sequence, args, _) => return sequence_shape(args),
            Ast::Func(
                Func::If | Func::IfError | Func::IfNa | Func::Ifs | Func::Switch | Func::Choose,
                ..,
            ) => return self.branches_shape(ast, formula_sheet, pass),
            Ast::Func(Func::Take | Func::Drop, args, _) => {
                let source = args.first().ok_or(FormulaError::Value)?;
                let (rows, cols, _) = self.matrix_shape(source, formula_sheet, pass)?;
                let drop = matches!(ast, Ast::Func(Func::Drop, ..));
                let output_rows = static_integer(optional_ast(args, 1))
                    .map_or(Ok(rows), |requested| {
                        transformed_axis_bound(rows, requested, drop)
                    })?;
                let output_cols = match optional_ast(args, 2) {
                    Some(requested) => static_integer(Some(requested))
                        .map_or(Ok(cols), |count| transformed_axis_bound(cols, count, drop))?,
                    None => cols,
                };
                let cells = EvalMatrix::validate_shape(output_rows, output_cols, 1, 0)?;
                return Ok((output_rows, output_cols, cells));
            }
            Ast::Func(Func::ChooseCols | Func::ChooseRows, args, _) => {
                let source = args.first().ok_or(FormulaError::Value)?;
                let (rows, cols, _) = self.matrix_shape(source, formula_sheet, pass)?;
                if args.len() < 2 {
                    return Err(FormulaError::Value);
                }
                let (output_rows, output_cols) = if matches!(ast, Ast::Func(Func::ChooseRows, ..)) {
                    (args.len() - 1, cols)
                } else {
                    (rows, args.len() - 1)
                };
                let cells = EvalMatrix::validate_shape(output_rows, output_cols, 1, 0)?;
                return Ok((output_rows, output_cols, cells));
            }
            Ast::Func(func, args, _)
                if super::lift::lifts(*func, args, pass.shapes(self.name_scope(formula_sheet))) =>
            {
                return self.lifted_shape(*func, args, formula_sheet, pass);
            }
            _ => {}
        }
        let range = match ast {
            Ast::Func(Func::Intersect, operands, _) => {
                intersection_range(operands, self.name_scope(formula_sheet))?
            }
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
            | Ast::InvalidRef
            | Ast::Func(..)
            | Ast::UnknownFunc(..)
            | Ast::Bin(..)
            | Ast::Cmp(..)
            | Ast::Neg(..)
            | Ast::Pos(..)
            | Ast::Percent(..)
            | Ast::LetSlot { .. }
            | Ast::LetName { .. }
            | Ast::Array { .. } => {
                range_from_ast(ast, self.name_scope(formula_sheet)).ok_or(FormulaError::Value)?
            }
            #[cfg(feature = "analysis")]
            Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => {
                range_from_ast(ast, self.name_scope(formula_sheet)).ok_or(FormulaError::Value)?
            }
        };
        let data = self
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
        let row_end = (range.row_end as usize).min(data.cells.row_count() - 1);
        let col_end = (range.col_end as usize).min(data.cells.n_cols() - 1);
        let rows = row_end - range.row_start as usize + 1;
        let cols = col_end - range.col_start as usize + 1;
        let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
        Ok((rows, cols, cells))
    }

    fn scalar_array_arg(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Value {
        self.eval_ast(ast, sheet, pass, depth + 1)
    }

    fn optional_bool_array_arg(
        &self,
        args: &[Ast],
        index: usize,
        default: bool,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<bool, FormulaError> {
        let Some(ast) = optional_ast(args, index) else {
            return Ok(default);
        };
        bool_from_value(&self.scalar_array_arg(ast, sheet, pass, depth + 1))
    }

    fn eval_filter(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<ValueRows, FormulaError> {
        if !(2..=3).contains(&args.len()) {
            return Err(FormulaError::Value);
        }
        let (array_rows, array_cols, array_cells) = self.matrix_shape(&args[0], sheet, pass)?;
        let (_, _, include_cells) = self.matrix_shape(&args[1], sheet, pass)?;
        let selected_bound = array_rows.max(array_cols);
        let extra = include_cells
            .checked_mul(size_of::<Value>())
            .and_then(|bytes| {
                selected_bound
                    .checked_mul(size_of::<usize>())
                    .and_then(|selected| bytes.checked_add(selected))
            })
            .ok_or(FormulaError::Num)?;
        EvalMatrix::validate_shape(array_rows, array_cols, 2, extra)?;
        if array_cells
            .checked_add(include_cells)
            .is_none_or(|work| work > SPILL_MAX_RECOMPUTE_CELLS)
        {
            return Err(FormulaError::Num);
        }
        let array = self.eval_rows_arg(&args[0], sheet, pass, depth + 1)?;
        let include = self.eval_array_matrix_arg(&args[1], sheet, pass, depth + 1)?;
        array.validate_copies(2)?;
        // Value-dependent arrays can shrink from their static shape bound.
        debug_assert!(
            array.cells() <= array_cells,
            "an array is no larger than its shape bound"
        );
        let (array_rows, array_cols) = array.shape();

        let filter_rows = include.rows == array_rows && include.cols == 1;
        let filter_cols = include.rows == 1 && include.cols == array_cols;
        if !filter_rows && !filter_cols {
            return Err(FormulaError::Value);
        }

        let mut selected = Vec::with_capacity(if filter_rows { array_rows } else { array_cols });
        for (index, value) in include.values.iter().enumerate() {
            if bool_from_value(value)? {
                selected.push(index);
            }
        }
        if selected.is_empty() {
            let Some(empty) = optional_ast(args, 2) else {
                return Err(FormulaError::Calc);
            };
            return Ok(ValueRows::matrix(EvalMatrix::new(
                1,
                1,
                vec![self.scalar_array_arg(empty, sheet, pass, depth + 1)],
            )));
        }
        if filter_rows {
            return Ok(array.pick(selected.into_iter()));
        }
        // `ValueRows` picks only rows, so picked columns are copied.
        let matrix = array.into_matrix();
        let (rows, cols) = (matrix.rows, selected.len());
        let cells = rows.checked_mul(cols).ok_or(FormulaError::Num)?;
        let mut values = Vec::with_capacity(cells);
        for row in 0..matrix.rows {
            for &col in &selected {
                values.push(matrix.values[row * matrix.cols + col].clone());
            }
        }
        Ok(ValueRows::matrix(EvalMatrix::new(rows, cols, values)))
    }

    fn eval_sort(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<ValueRows, FormulaError> {
        if args.is_empty() || args.len() > 4 {
            return Err(FormulaError::Value);
        }
        let by_col = self.optional_bool_array_arg(args, 3, false, sheet, pass, depth + 1)?;
        // FILTER and UNIQUE report their range's shape here, an upper bound
        // for the budget checks; the rows they return can be fewer.
        let (array_rows, array_cols, _) = self.matrix_shape(&args[0], sheet, pass)?;
        let item_bound = if by_col { array_cols } else { array_rows };
        // The sort order and each item's key.
        let extra = item_bound
            .checked_mul(size_of::<usize>() + size_of::<Option<&Value>>())
            .ok_or(FormulaError::Num)?;
        EvalMatrix::validate_shape(array_rows, array_cols, 2, extra)?;
        let comparisons = if item_bound < 2 {
            0
        } else {
            let log = usize::BITS as usize - item_bound.leading_zeros() as usize;
            item_bound.checked_mul(log).ok_or(FormulaError::Num)?
        };
        if comparisons > SPILL_MAX_RECOMPUTE_CELLS {
            return Err(FormulaError::Num);
        }
        let array = self.eval_rows_arg(&args[0], sheet, pass, depth + 1)?;
        array.validate_copies(2)?;
        let (array_rows, array_cols) = array.shape();
        let dimension = if by_col { array_rows } else { array_cols };
        let sort_index = match optional_ast(args, 1) {
            Some(ast) => integer_arg(&self.scalar_array_arg(ast, sheet, pass, depth + 1))?,
            None => 1,
        };
        if sort_index <= 0 || sort_index as usize > dimension {
            return Err(FormulaError::Value);
        }
        let order = match optional_ast(args, 2) {
            Some(ast) => option_code(&self.scalar_array_arg(ast, sheet, pass, depth + 1))?,
            None => 1,
        };
        if !matches!(order, -1 | 1) {
            return Err(FormulaError::Value);
        }

        let item_count = if by_col { array_cols } else { array_rows };
        let key = sort_index as usize - 1;
        let mut indices: Vec<usize> = (0..item_count).collect();
        // Each item's key, looked up once instead of twice per comparison.
        let reader = array.reader();
        let keys: Vec<Option<&Value>> = indices
            .iter()
            .map(|&item| {
                if by_col {
                    reader.value(key, item)
                } else {
                    reader.value(item, key)
                }
            })
            .collect();
        let mut error = None;
        indices.sort_by(|left, right| {
            if error.is_some() {
                return Ordering::Equal;
            }
            let compared = match (keys[*left], keys[*right]) {
                (Some(left_key), Some(right_key)) => compare_values(left_key, right_key),
                _ => Err(FormulaError::Ref),
            };
            match compared {
                Ok(value) if order == -1 => value.reverse(),
                Ok(value) => value,
                Err(found) => {
                    error = Some(found);
                    Ordering::Equal
                }
            }
        });
        if let Some(first_error) = error {
            return Err(first_error);
        }
        if !by_col {
            return Ok(array.pick(indices.into_iter()));
        }

        // `ValueRows` picks only rows, so reordered columns are copied.
        let matrix = array.into_matrix();
        let mut values = Vec::with_capacity(matrix.values.len());
        for row in 0..matrix.rows {
            for &col in &indices {
                values.push(matrix.values[row * matrix.cols + col].clone());
            }
        }
        Ok(ValueRows::matrix(EvalMatrix::new(
            matrix.rows,
            matrix.cols,
            values,
        )))
    }

    fn eval_unique(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<ValueRows, FormulaError> {
        if args.is_empty() || args.len() > 3 {
            return Err(FormulaError::Value);
        }
        let by_col = self.optional_bool_array_arg(args, 1, false, sheet, pass, depth + 1)?;
        // As in SORT, the shape of a FILTER argument bounds the budget; the
        // items come from the evaluated array.
        let (array_rows, array_cols, _) = self.matrix_shape(&args[0], sheet, pass)?;
        let item_bound = if by_col { array_cols } else { array_rows };
        const UNIQUE_ITEM_BYTES: usize = 64;
        let extra = item_bound
            .checked_mul(UNIQUE_ITEM_BYTES)
            .ok_or(FormulaError::Num)?;
        EvalMatrix::validate_shape(array_rows, array_cols, 2, extra)?;
        let array = self.eval_rows_arg(&args[0], sheet, pass, depth + 1)?;
        array.validate_copies(2)?;
        let exactly_once = self.optional_bool_array_arg(args, 2, false, sheet, pass, depth + 1)?;
        let (array_rows, array_cols) = array.shape();
        let item_count = if by_col { array_cols } else { array_rows };
        let reader = array.reader();

        // Store collision chains in insertion order, without an allocation per hash.
        let mut buckets: FxHashMap<u64, (usize, usize)> = FxHashMap::default();
        let mut representatives: Vec<(usize, usize, Option<usize>)> =
            Vec::with_capacity(item_count);
        let mut comparisons = 0usize;
        for item in 0..item_count {
            let hash = item_hash(reader, item, by_col);
            let mut position = buckets.get(&hash).map(|&(first, _)| first);
            let mut found = None;
            while let Some(index) = position {
                let (representative, _, next) = representatives[index];
                comparisons = comparisons.checked_add(1).ok_or(FormulaError::Num)?;
                if comparisons > SPILL_MAX_RECOMPUTE_CELLS {
                    return Err(FormulaError::Num);
                }
                if items_equal(reader, representative, item, by_col)? {
                    found = Some(index);
                    break;
                }
                position = next;
            }
            if let Some(position) = found {
                representatives[position].1 += 1;
            } else {
                let next = representatives.len();
                if let Some((_, last)) = buckets.get_mut(&hash) {
                    representatives[*last].2 = Some(next);
                    *last = next;
                } else {
                    buckets.insert(hash, (next, next));
                }
                representatives.push((item, 1, None));
            }
        }

        let retained: Vec<usize> = representatives
            .into_iter()
            .filter_map(|(item, count, _)| (!exactly_once || count == 1).then_some(item))
            .collect();
        if retained.is_empty() {
            return Err(FormulaError::Calc);
        }
        if !by_col {
            return Ok(array.pick(retained.into_iter()));
        }

        // `ValueRows` picks only rows, so kept columns are copied.
        let matrix = array.into_matrix();
        let (rows, cols) = (matrix.rows, retained.len());
        let cells = rows.checked_mul(cols).ok_or(FormulaError::Num)?;
        let mut values = Vec::with_capacity(cells);
        for row in 0..matrix.rows {
            for &col in &retained {
                values.push(matrix.values[row * matrix.cols + col].clone());
            }
        }
        Ok(ValueRows::matrix(EvalMatrix::new(rows, cols, values)))
    }
    fn eval_transpose(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if args.len() != 1 {
            return Err(FormulaError::Value);
        }
        let source = self.eval_array_matrix_arg(&args[0], sheet, pass, depth + 1)?;
        EvalMatrix::validate_shape(source.cols, source.rows, 2, 0)?;
        source.validate_copies(2)?;
        let mut values = Vec::new();
        values
            .try_reserve_exact(source.values.len())
            .map_err(|_| FormulaError::Num)?;
        for row in 0..source.cols {
            for col in 0..source.rows {
                values.push(source.values[col * source.cols + row].clone());
            }
        }
        Ok(EvalMatrix::new(source.cols, source.rows, values))
    }

    /// `TRIMRANGE(range, [trim_rows], [trim_cols])`: the range without its
    /// leading and trailing blank rows and columns. Each trim argument is 0
    /// (none), 1 (leading), 2 (trailing) or 3 (both, the default). A range
    /// with no value left is `#REF!`, as in Excel.
    fn eval_trim_range(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if !(1..=3).contains(&args.len()) {
            return Err(FormulaError::Value);
        }

        // A single cell is a 1 x 1 range.
        let source = match self.eval_dynamic_array(&args[0], sheet, pass, depth + 1) {
            Some(result) => result?,
            None => match self.eval_ast(&args[0], sheet, pass, depth + 1) {
                Value::Error(error) => return Err(error),
                value @ (Value::Number(_) | Value::Text(_) | Value::Bool(_) | Value::Blank) => {
                    EvalMatrix::new(1, 1, vec![value])
                }
            },
        };
        let trim_rows = self.trim_mode(optional_ast(args, 1), sheet, pass, depth)?;
        let trim_cols = self.trim_mode(optional_ast(args, 2), sheet, pass, depth)?;
        let filled =
            |row: usize, col: usize| !matches!(source.get(row, col), Some(Value::Blank) | None);
        let filled_rows: Vec<usize> = (0..source.rows)
            .filter(|&row| (0..source.cols).any(|col| filled(row, col)))
            .collect();
        let filled_cols: Vec<usize> = (0..source.cols)
            .filter(|&col| (0..source.rows).any(|row| filled(row, col)))
            .collect();
        let (Some(&first_row), Some(&last_row)) = (filled_rows.first(), filled_rows.last()) else {
            return Err(FormulaError::Ref);
        };
        let (Some(&first_col), Some(&last_col)) = (filled_cols.first(), filled_cols.last()) else {
            return Err(FormulaError::Ref);
        };
        let rows = trimmed_span(source.rows, first_row, last_row, trim_rows);
        let cols = trimmed_span(source.cols, first_col, last_col, trim_cols);
        let mut values = Vec::new();

        values
            .try_reserve_exact((rows.end - rows.start) * (cols.end - cols.start))
            .map_err(|_| FormulaError::Num)?;

        for row in rows.clone() {
            for col in cols.clone() {
                values.push(source.get(row, col).cloned().unwrap_or(Value::Blank));
            }
        }

        Ok(EvalMatrix::new(
            rows.end - rows.start,
            cols.end - cols.start,
            values,
        ))
    }

    /// A TRIMRANGE trim argument: a whole number from 0 to 3, 3 when omitted.
    fn trim_mode(
        &self,
        mode_arg: Option<&Ast>,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<u8, FormulaError> {
        let Some(arg) = mode_arg else {
            return Ok(TRIM_BOTH);
        };
        let mode = number_from_value(&self.eval_ast(arg, sheet, pass, depth + 1))?.trunc();

        if !(0.0..=f64::from(TRIM_BOTH)).contains(&mode) {
            return Err(FormulaError::Value);
        }

        Ok(mode as u8)
    }

    fn eval_sequence(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if args.is_empty() || args.len() > 4 {
            return Err(FormulaError::Value);
        }
        let scalar = |index: usize, default: Value, pass: &mut EvalPass<'_>| {
            optional_ast(args, index).map_or(default, |ast| {
                self.scalar_array_arg(ast, sheet, pass, depth + 1)
            })
        };
        let requested_rows = integer_arg(&scalar(0, Value::Number(1.0), pass))?;
        let requested_cols = integer_arg(&scalar(1, Value::Number(1.0), pass))?;
        if requested_rows <= 0 || requested_cols <= 0 {
            return Err(FormulaError::Value);
        }
        let rows = usize::try_from(requested_rows).map_err(|_| FormulaError::Num)?;
        let cols = usize::try_from(requested_cols).map_err(|_| FormulaError::Num)?;
        let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
        let start = number_from_value(&scalar(2, Value::Number(1.0), pass))?;
        let step = number_from_value(&scalar(3, Value::Number(1.0), pass))?;
        let mut values = Vec::new();
        values
            .try_reserve_exact(cells)
            .map_err(|_| FormulaError::Num)?;
        for index in 0..cells {
            let value = start + step * index as f64;
            if !value.is_finite() {
                return Err(FormulaError::Num);
            }
            values.push(Value::Number(value));
        }
        Ok(EvalMatrix::new(rows, cols, values))
    }

    fn eval_take_drop(
        &self,
        args: &[Ast],
        drop: bool,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<ValueRows, FormulaError> {
        if !(2..=3).contains(&args.len()) {
            return Err(FormulaError::Value);
        }
        let rows = integer_arg(&self.scalar_array_arg(&args[1], sheet, pass, depth + 1))? as i64;
        let requested_cols = match optional_ast(args, 2) {
            Some(ast) => {
                Some(integer_arg(&self.scalar_array_arg(ast, sheet, pass, depth + 1))? as i64)
            }
            None => None,
        };
        if rows == 0 || requested_cols == Some(0) {
            return Err(FormulaError::Calc);
        }
        let source = self.eval_rows_arg(&args[0], sheet, pass, depth + 1)?;
        let (source_rows, source_cols) = source.shape();
        let cols = requested_cols.unwrap_or(source_cols as i64);
        let output_rows = transformed_axis_bound(source_rows, rows, drop)?;
        let output_cols = match requested_cols {
            Some(cols) => transformed_axis_bound(source_cols, cols, drop)?,
            None => source_cols,
        };
        let cells = EvalMatrix::validate_shape(output_rows, output_cols, 2, 0)?;
        source.validate_copies(2)?;
        let row_magnitude = usize::try_from(rows.unsigned_abs())
            .unwrap_or(usize::MAX)
            .min(source_rows);
        let col_magnitude = usize::try_from(cols.unsigned_abs())
            .unwrap_or(usize::MAX)
            .min(source_cols);
        let row_start = if drop {
            if rows > 0 {
                row_magnitude
            } else {
                0
            }
        } else if rows < 0 {
            source_rows - row_magnitude
        } else {
            0
        };
        let col_start = match requested_cols {
            None => 0,
            Some(_) if drop => {
                if cols > 0 {
                    col_magnitude
                } else {
                    0
                }
            }
            Some(_) if cols < 0 => source_cols - col_magnitude,
            Some(_) => 0,
        };
        if output_cols == source_cols {
            return Ok(source.span(row_start, output_rows));
        }

        // `ValueRows` spans only whole rows, so a column cut is copied.
        let matrix = source.into_matrix();
        let mut values = Vec::new();
        values
            .try_reserve_exact(cells)
            .map_err(|_| FormulaError::Num)?;
        for row in row_start..row_start + output_rows {
            for col in col_start..col_start + output_cols {
                values.push(matrix.values[row * matrix.cols + col].clone());
            }
        }
        Ok(ValueRows::matrix(EvalMatrix::new(
            output_rows,
            output_cols,
            values,
        )))
    }

    fn eval_choose_axis(
        &self,
        args: &[Ast],
        rows_axis: bool,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<ValueRows, FormulaError> {
        if args.len() < 2 {
            return Err(FormulaError::Value);
        }
        let selector_count = args.len() - 1;
        let index_bytes = selector_count
            .checked_mul(size_of::<i32>())
            .ok_or(FormulaError::Num)?;
        let selector_shape = if rows_axis {
            (selector_count, 1)
        } else {
            (1, selector_count)
        };
        EvalMatrix::validate_shape(selector_shape.0, selector_shape.1, 0, index_bytes)?;
        let mut indices = Vec::new();
        indices
            .try_reserve_exact(selector_count)
            .map_err(|_| FormulaError::Num)?;
        for ast in &args[1..] {
            let index = integer_arg(&self.scalar_array_arg(ast, sheet, pass, depth + 1))?;
            if index == 0 {
                return Err(FormulaError::Value);
            }
            indices.push(index);
        }
        let source = self.eval_rows_arg(&args[0], sheet, pass, depth + 1)?;
        let (source_rows, source_cols) = source.shape();
        let dimension = if rows_axis { source_rows } else { source_cols };
        let (output_rows, output_cols) = if rows_axis {
            (selector_count, source_cols)
        } else {
            (source_rows, selector_count)
        };
        let cells = EvalMatrix::validate_shape(output_rows, output_cols, 2, index_bytes)?;
        source.validate_copies(2)?;
        for index in &mut indices {
            let normalized = if *index > 0 {
                *index as usize - 1
            } else if *index < 0 {
                dimension
                    .checked_sub(index.unsigned_abs() as usize)
                    .ok_or(FormulaError::Value)?
            } else {
                return Err(FormulaError::Value);
            };
            if normalized >= dimension {
                return Err(FormulaError::Value);
            }
            *index = i32::try_from(normalized).map_err(|_| FormulaError::Num)?;
        }
        if rows_axis {
            return Ok(source.pick(indices.into_iter().map(|row| row as usize)));
        }

        // `ValueRows` picks only rows, so chosen columns are copied.
        let matrix = source.into_matrix();
        let mut values = Vec::new();
        values
            .try_reserve_exact(cells)
            .map_err(|_| FormulaError::Num)?;
        for row in 0..matrix.rows {
            for &col in &indices {
                values.push(matrix.values[row * matrix.cols + col as usize].clone());
            }
        }
        Ok(ValueRows::matrix(EvalMatrix::new(
            output_rows,
            output_cols,
            values,
        )))
    }
}

/// The form an array dispatch returns, each checked against the array byte
/// budget: a matrix for callers that read every value, or rows of one base
/// for a row step's argument and for a spill.
trait ArrayResult: Sized {
    /// A matrix a function computed.
    fn computed(matrix: EvalMatrix) -> Result<Self, FormulaError>;
    /// The rows a row step kept.
    fn rows(rows: ValueRows) -> Result<Self, FormulaError>;
    /// An array constant's `values`, `cols` per row.
    fn shared(rows: usize, cols: usize, values: &Rc<[Value]>) -> Result<Self, FormulaError>;
}

impl ArrayResult for EvalMatrix {
    fn computed(matrix: Self) -> Result<Self, FormulaError> {
        matrix.validate_copies(1)?;
        Ok(matrix)
    }

    fn rows(rows: ValueRows) -> Result<Self, FormulaError> {
        Self::computed(rows.into_matrix())
    }

    fn shared(rows: usize, cols: usize, values: &Rc<[Value]>) -> Result<Self, FormulaError> {
        Self::computed(Self::new(rows, cols, values.to_vec()))
    }
}

impl ArrayResult for ValueRows {
    fn computed(matrix: EvalMatrix) -> Result<Self, FormulaError> {
        matrix.validate_copies(1)?;
        Ok(Self::matrix(matrix))
    }

    fn rows(rows: Self) -> Result<Self, FormulaError> {
        rows.validate_copies(1)?;
        Ok(rows)
    }

    /// Shared with the formula tree, so nothing is copied or counted.
    fn shared(rows: usize, cols: usize, values: &Rc<[Value]>) -> Result<Self, FormulaError> {
        Ok(Self::shared(rows, cols, Rc::clone(values)))
    }
}

pub(super) fn dynamic_recompute_within_limit(total: usize, next: usize) -> Option<usize> {
    total
        .checked_add(next)
        .filter(|sum| *sum <= SPILL_MAX_RECOMPUTE_CELLS)
}

/// A LAMBDA body or array helper argument that calls OFFSET or INDIRECT has
/// no shape before evaluation, so a shape query reports `#VALUE!`. Such a
/// formula is charged like a bare runtime reference: a precharge now, and
/// whatever its result holds beyond it once the pending loop evaluates it.
#[cfg(feature = "analysis")]
fn runtime_reference_bound(
    ast: &Ast,
    bound: Result<usize, FormulaError>,
    names: NameScope<'_>,
) -> Result<usize, FormulaError> {
    match bound {
        Err(FormulaError::Value) if super::reference::ast_contains_runtime_ref(ast, names) => {
            Ok(UNKNOWN_SIZE_PRECHARGE)
        }
        estimate => estimate,
    }
}

/// The hash of UNIQUE item `item`: a row, or a column when `by_col`. A row
/// is read as one slice, a column value by value. A number hashes `-0` as
/// `0` and text hashes case-folded, so equal numbers and texts that differ
/// only in case hash alike.
fn item_hash(array: RowReader<'_>, item: usize, by_col: bool) -> u64 {
    let mut hasher = DefaultHasher::new();
    if by_col {
        for row in 0..array.shape().0 {
            hash_item_value(array.value(row, item), &mut hasher);
        }
    } else {
        for value in array.row(item) {
            hash_item_value(Some(value), &mut hasher);
        }
    }
    hasher.finish()
}

fn hash_item_value(value: Option<&Value>, hasher: &mut DefaultHasher) {
    match value {
        Some(Value::Number(number)) => {
            0u8.hash(hasher);
            let bits = if *number == 0.0 { 0 } else { number.to_bits() };
            bits.hash(hasher);
        }
        Some(Value::Text(text)) => {
            1u8.hash(hasher);
            for character in text.chars().flat_map(char::to_lowercase) {
                character.hash(hasher);
            }
        }
        Some(Value::Bool(flag)) => {
            2u8.hash(hasher);
            flag.hash(hasher);
        }
        Some(Value::Blank) => 3u8.hash(hasher),
        Some(Value::Error(error)) => {
            4u8.hash(hasher);
            error.slot().hash(hasher);
        }
        None => 5u8.hash(hasher),
    }
}

fn items_equal(
    array: RowReader<'_>,
    left_index: usize,
    right_index: usize,
    by_col: bool,
) -> Result<bool, FormulaError> {
    if !by_col {
        for (left, right) in array.row(left_index).iter().zip(array.row(right_index)) {
            if !item_values_equal(left, right)? {
                return Ok(false);
            }
        }
        return Ok(true);
    }
    for row in 0..array.shape().0 {
        let left = array.value(row, left_index).ok_or(FormulaError::Ref)?;
        let right = array.value(row, right_index).ok_or(FormulaError::Ref)?;
        if !item_values_equal(left, right)? {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Excel's UNIQUE keeps an empty cell apart from 0, "" and FALSE, which
/// compare equal to it elsewhere; [`hash_item_value`] buckets it apart too.
fn item_values_equal(left: &Value, right: &Value) -> Result<bool, FormulaError> {
    Ok(match (left, right) {
        (Value::Error(left_error), Value::Error(right_error)) => left_error == right_error,
        (Value::Error(_), _) | (_, Value::Error(_)) => false,
        (Value::Blank, other) | (other, Value::Blank) => matches!(other, Value::Blank),
        _ => compare_values(left, right)? == Ordering::Equal,
    })
}

/// TRIMRANGE trims leading blanks for mode 1, trailing blanks for mode 2
/// and both for mode 3.
const TRIM_LEADING: u8 = 1;
const TRIM_TRAILING: u8 = 2;
const TRIM_BOTH: u8 = TRIM_LEADING | TRIM_TRAILING;

/// The rows or columns that TRIMRANGE keeps, as a range of indexes.
fn trimmed_span(
    length: usize,
    first_filled: usize,
    last_filled: usize,
    mode: u8,
) -> std::ops::Range<usize> {
    let start = if mode & TRIM_LEADING != 0 {
        first_filled
    } else {
        0
    };
    let end = if mode & TRIM_TRAILING != 0 {
        last_filled + 1
    } else {
        length
    };

    start..end
}

#[cfg(test)]
mod tests {
    use crate::eval::{matrix_resource_stats, reset_matrix_resource_stats};
    use crate::store::CellStore;
    use crate::types::KIND_EMPTY;

    fn number(store: &CellStore, sheet: usize, row: usize, col: usize) -> f64 {
        store.get_cell(sheet, row, col).num()
    }

    fn text(store: &CellStore, sheet: usize, row: usize, col: usize) -> Option<String> {
        store.get_cell(sheet, row, col).string()
    }

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-9,
            "expected {expected}, got {actual}"
        );
    }

    /// UNIQUE groups items by hash, then compares the items in a group. Two
    /// values it calls equal must hash alike, or whether they merge depends
    /// on a hash collision. An empty cell stays apart from 0, "" and FALSE.
    #[test]
    fn unique_equality_agrees_with_its_hash() {
        use super::{hash_item_value, item_values_equal, DefaultHasher, Hasher};
        use crate::types::Value;

        let hash = |value: &Value| {
            let mut hasher = DefaultHasher::new();
            hash_item_value(Some(value), &mut hasher);
            hasher.finish()
        };
        let values = [
            Value::Blank,
            Value::Number(0.0),
            Value::Number(-0.0),
            Value::text(""),
            Value::Bool(false),
            Value::text("a"),
            Value::text("A"),
        ];
        for left in &values {
            for right in &values {
                if item_values_equal(left, right).unwrap() {
                    assert_eq!(hash(left), hash(right), "{left:?} and {right:?}");
                }
            }
        }
    }

    #[test]
    fn sequence_spills_retry_collisions_resize_dependencies_and_restore_history() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(10, 8);
        store.set_number(sheet, 0, 0, 2.0, 0);
        store.set_number(sheet, 0, 1, 3.0, 0);
        store.set_number(sheet, 1, 4, 99.0, 0);
        store.set_formula(sheet, 0, 3, "=SEQUENCE(A1,B1,10,2)", 0);
        store.set_formula(sheet, 0, 7, "=F2+1", 0);
        store.recompute(sheet);

        assert_eq!(text(&store, sheet, 0, 3).as_deref(), Some("#SPILL!"));
        assert_eq!(store.spill_anchor_row(sheet, 1, 5), u32::MAX);
        assert_close(number(&store, sheet, 0, 7), 1.0);

        store.clear_cell(sheet, 1, 4, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 5), 14.0);
        assert_close(number(&store, sheet, 1, 5), 20.0);
        assert_close(number(&store, sheet, 0, 7), 21.0);
        assert_eq!(store.spill_anchor_row(sheet, 1, 5), 0);
        assert_eq!(store.spill_anchor_col(sheet, 1, 5), 3);

        store.set_number(sheet, 0, 0, 1.0, 0);
        store.recompute(sheet);
        for col in 3..=5 {
            assert_eq!(store.get_cell(sheet, 1, col).kind(), KIND_EMPTY);
            assert_eq!(store.spill_anchor_row(sheet, 1, col), u32::MAX);
        }
        assert_close(number(&store, sheet, 0, 7), 1.0);

        let snapshot = store
            .capture_range(sheet, 0, 3, 1, 1)
            .expect("array anchor history");
        store.set_formula(sheet, 0, 3, "=SEQUENCE(2,2,50,5)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 1, 4), 65.0);
        assert_eq!(store.get_cell(sheet, 0, 5).kind(), KIND_EMPTY);

        assert!(store.restore_range(sheet, 0, 3, &snapshot));
        store.set_number(sheet, 0, 0, 2.0, 0);
        store.recompute(sheet);
        assert_eq!(
            store.formula_source(sheet, 0, 3).as_deref(),
            Some("=SEQUENCE(A1,B1,10,2)")
        );
        assert_close(number(&store, sheet, 1, 5), 20.0);
        assert_close(number(&store, sheet, 0, 7), 21.0);
    }

    #[test]
    fn rejected_static_array_shapes_allocate_no_matrices() {
        let mut store = CellStore::new();
        let sheet = store.add_paged_sheet(2, 1_000_001, 256, 1_000_000, 1_000_000);
        store.set_formula(sheet, 0, 1, "=SEQUENCE(1000001,1)", 0);
        reset_matrix_resource_stats();
        store.recompute(sheet);
        assert_eq!(text(&store, sheet, 0, 1).as_deref(), Some("#NUM!"));
        assert_eq!(matrix_resource_stats(), [0, 0, 0]);

        let mut store = CellStore::new();
        let sheet = store.add_paged_sheet(4, 500_000, 256, 1_000_000, 1_000_000);
        store.set_formula(sheet, 0, 1, "=CHOOSECOLS(SEQUENCE(500000,1),1,1,1)", 0);
        reset_matrix_resource_stats();
        store.recompute(sheet);
        assert_eq!(text(&store, sheet, 0, 1).as_deref(), Some("#NUM!"));
        assert_eq!(matrix_resource_stats(), [0, 0, 0]);
    }

    /// Row steps pick rows of the matrix their range was read into: the
    /// chain below reads its two ranges into matrices and copies its picked
    /// rows once, into the matrix that spills. An array constant is read
    /// where the formula keeps it, so its sorted rows are the only copy.
    #[test]
    fn chained_row_steps_copy_their_result_once() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 20);
        for row in 0..20 {
            store.set_number(sheet, row, 0, (20 - row) as f64, 0);
            store.set_bool(sheet, row, 1, row % 2 == 0, 0);
        }
        store.set_formula(
            sheet,
            0,
            2,
            "=CHOOSEROWS(DROP(TAKE(UNIQUE(SORT(FILTER(A1:A20,B1:B20))),6),1),2,1)",
            0,
        );
        reset_matrix_resource_stats();
        store.recompute(sheet);
        assert_eq!(number(&store, sheet, 0, 2), 6.0);
        assert_eq!(number(&store, sheet, 1, 2), 4.0);
        assert_eq!(
            matrix_resource_stats()[2],
            3,
            "the two ranges and the spilled rows are the only matrices"
        );

        store.set_formula(sheet, 0, 3, "=SORT({3;1;2},1,-1)", 0);
        reset_matrix_resource_stats();
        store.recompute(sheet);
        assert_eq!(number(&store, sheet, 2, 3), 1.0);
        assert_eq!(
            matrix_resource_stats()[2],
            1,
            "only the spilled rows are copied"
        );
    }

    #[test]
    fn sort_and_unique_read_the_rows_a_shrinking_array_returns() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 6);
        for (row, label) in ["b", "a", "b", "c", "a", "d"].into_iter().enumerate() {
            store.set_string(sheet, row, 0, label, 0);
            store.set_number(sheet, row, 1, row as f64, 0);
        }

        // UNIQUE and FILTER return fewer rows than their range; SORT and
        // UNIQUE read the rows they return, not the rows of the range.
        for (formula, expected) in [
            ("=SORT(UNIQUE(A1:A6))", vec!["a", "b", "c", "d"]),
            ("=SORT(FILTER(A1:A6,B1:B6<3),1,-1)", vec!["b", "b", "a"]),
            ("=UNIQUE(FILTER(A1:A6,B1:B6<3))", vec!["b", "a"]),
        ] {
            store.set_formula(sheet, 0, 2, formula, 0);
            store.recompute(sheet);
            let sorted: Vec<Option<String>> = (0..expected.len())
                .map(|row| text(&store, sheet, row, 2))
                .collect();
            let wanted: Vec<Option<String>> = expected
                .iter()
                .map(|label| Some((*label).to_owned()))
                .collect();
            assert_eq!(sorted, wanted, "{formula}");
            assert_eq!(store.get_cell(sheet, expected.len(), 2).kind(), KIND_EMPTY);
        }
    }
}
