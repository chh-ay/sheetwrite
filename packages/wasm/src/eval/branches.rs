//! IF, IFERROR, IFNA, IFS, SWITCH and CHOOSE when an argument is an array.
//!
//! `eval_func` runs the scalar forms of these functions and evaluates only
//! the argument a call takes. This module serves a call that the shape
//! checks mark as an array ([`ast_produces_array`]). When every selecting
//! argument (the IF and IFS conditions, the value IFERROR and IFNA test, the
//! SWITCH expression and its cases, the CHOOSE index) is one value, the call
//! still evaluates only the argument it takes, which can be an array or a
//! range. When a selecting argument is an array, the call is lifted as in
//! Excel: every argument broadcasts to the largest row and column count, an
//! argument with more than one but fewer rows or columns than that gives
//! #N/A outside itself, and the scalar rule picks each element.

use std::cmp::Ordering;

use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{FormulaError, Value};

use super::array::{ast_produces_array, Shapes};
use super::lookup::positive_index;
use super::matrix::{EvalMatrix, SPILL_MAX_BYTES, UNKNOWN_SIZE_PRECHARGE};
use super::operators::Operand;
use super::value::{bool_from_value, compare_values};
use super::EvalPass;

/// A function that returns one of its arguments.
#[derive(Clone, Copy)]
enum Branching {
    If,
    IfError,
    IfNa,
    Ifs,
    Switch,
    Choose,
}

/// What a call returns for one element: the argument at an index, or a
/// value its rule computed (an error, FALSE for IF without
/// `value_if_false`, the value IFERROR and IFNA tested).
enum Pick {
    Argument(usize),
    Value(Value),
}

impl Branching {
    #[allow(
        clippy::wildcard_enum_match_arm,
        reason = "every other function returns none of its arguments"
    )]
    const fn of(func: Func) -> Option<Self> {
        match func {
            Func::If => Some(Self::If),
            Func::IfError => Some(Self::IfError),
            Func::IfNa => Some(Self::IfNa),
            Func::Ifs => Some(Self::Ifs),
            Func::Switch => Some(Self::Switch),
            Func::Choose => Some(Self::Choose),
            _ => None,
        }
    }

    /// Whether a call takes `count` arguments, as the scalar forms check.
    const fn takes(self, count: usize) -> bool {
        match self {
            Self::If => matches!(count, 2 | 3),
            Self::IfError => matches!(count, 1 | 2),
            Self::IfNa => count == 2,
            Self::Ifs => count >= 2 && count.is_multiple_of(2),
            Self::Switch => count >= 3,
            Self::Choose => count >= 2,
        }
    }

    /// Whether a selecting argument is an array, so the call is lifted.
    fn lifts(self, args: &[Ast], shapes: Shapes<'_>) -> bool {
        let is_array = |arg: &Ast| ast_produces_array(arg, shapes);
        match self {
            Self::If | Self::IfError | Self::IfNa | Self::Choose => {
                args.first().is_some_and(is_array)
            }
            Self::Ifs => args.iter().step_by(2).any(is_array),
            Self::Switch => {
                let cases = args
                    .get(1..switch_pairs_end(args.len()))
                    .unwrap_or_default();
                args.first().is_some_and(is_array) || cases.iter().step_by(2).any(is_array)
            }
        }
    }

    /// The scalar rule of the function. `element` gives the value of an
    /// argument; the rule asks only for the arguments it needs, in order.
    fn pick(self, args: &[Ast], mut element: impl FnMut(usize) -> Value) -> Pick {
        match self {
            Self::If => match bool_from_value(&element(0)) {
                Ok(true) => Pick::Argument(1),
                Ok(false) if args.len() > 2 => Pick::Argument(2),
                Ok(false) => Pick::Value(Value::Bool(false)),
                Err(error) => Pick::Value(Value::Error(error)),
            },
            Self::IfError => match element(0) {
                Value::Error(_) if args.len() > 1 => Pick::Argument(1),
                Value::Error(_) => Pick::Value(Value::Number(0.0)),
                value @ (Value::Number(_) | Value::Text(_) | Value::Bool(_) | Value::Blank) => {
                    Pick::Value(value)
                }
            },
            Self::IfNa => match element(0) {
                Value::Error(FormulaError::Na) => Pick::Argument(1),
                value @ (Value::Number(_)
                | Value::Text(_)
                | Value::Bool(_)
                | Value::Blank
                | Value::Error(_)) => Pick::Value(value),
            },
            Self::Ifs => pick_ifs(args.len(), element),
            Self::Switch => pick_switch(args.len(), element),
            Self::Choose => match positive_index(&element(0)) {
                Ok(position) if position + 1 < args.len() => Pick::Argument(position + 1),
                Ok(_) => Pick::Value(Value::Error(FormulaError::Value)),
                Err(error) => Pick::Value(Value::Error(error)),
            },
        }
    }
}

/// The end of SWITCH's case and result pairs; an even argument count ends
/// with a default.
const fn switch_pairs_end(count: usize) -> usize {
    if count.is_multiple_of(2) {
        count - 1
    } else {
        count
    }
}

/// IFS: the value after the first TRUE condition, #N/A when none is TRUE.
fn pick_ifs(count: usize, mut element: impl FnMut(usize) -> Value) -> Pick {
    for condition in (0..count).step_by(2) {
        match bool_from_value(&element(condition)) {
            Ok(true) => return Pick::Argument(condition + 1),
            Ok(false) => {}
            Err(error) => return Pick::Value(Value::Error(error)),
        }
    }
    Pick::Value(Value::Error(FormulaError::Na))
}

/// SWITCH: the result after the first case equal to the expression, else
/// the default, else #N/A.
fn pick_switch(count: usize, mut element: impl FnMut(usize) -> Value) -> Pick {
    let expression = element(0);
    if let Value::Error(error) = expression {
        return Pick::Value(Value::Error(error));
    }
    let pairs_end = switch_pairs_end(count);
    for case in (1..pairs_end).step_by(2) {
        match compare_values(&expression, &element(case)) {
            Ok(Ordering::Equal) => return Pick::Argument(case + 1),
            Ok(Ordering::Less | Ordering::Greater) => {}
            Err(error) => return Pick::Value(Value::Error(error)),
        }
    }
    if pairs_end < count {
        Pick::Argument(pairs_end)
    } else {
        Pick::Value(Value::Error(FormulaError::Na))
    }
}

/// A lifted call: its rule, its arguments, and the sheet and depth it is
/// evaluated at.
#[derive(Clone, Copy)]
struct LiftedCall<'a> {
    kind: Branching,
    args: &'a [Ast],
    sheet: usize,
    depth: usize,
}

/// Rows, columns and cells of an array.
type ArrayShape = (usize, usize, usize);

impl CellStore {
    /// An IF, IFERROR, IFNA, IFS, SWITCH or CHOOSE `call` as an array: the
    /// argument it takes, or the lifted call when a selecting argument is
    /// an array. Any other node is #VALUE!. Out of line, like every
    /// `*_family` handler, so the array path adds nothing to `eval_ast`.
    #[inline(never)]
    pub(super) fn eval_branches_family(
        &self,
        call: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        let Ast::Func(func, args) = call else {
            return Err(FormulaError::Value);
        };
        let kind = Branching::of(*func).ok_or(FormulaError::Value)?;
        if !kind.takes(args.len()) {
            return Err(FormulaError::Value);
        }
        if kind.lifts(args, pass.shapes(self.name_scope(sheet))) {
            let lifted = LiftedCall {
                kind,
                args,
                sheet,
                depth,
            };
            return self.eval_lifted_branches(lifted, pass);
        }

        let picked = kind.pick(args, |index| {
            self.eval_ast(&args[index], sheet, pass, depth + 1)
        });
        let value = match picked {
            Pick::Argument(index) => match self.branch_operand(&args[index], sheet, pass, depth) {
                Operand::Array(matrix) => return Ok(matrix),
                Operand::Scalar(value) => value,
            },
            Pick::Value(value) => value,
        };
        Ok(EvalMatrix::new(1, 1, vec![value]))
    }

    /// The array shape of a lifted `call` before evaluation: the largest row
    /// and column count of its arguments. A call that takes one argument has
    /// the shape of the argument it takes, unknown until it runs, so it has
    /// no static shape (#VALUE!).
    pub(super) fn branches_shape(
        &self,
        call: &Ast,
        formula_sheet: usize,
        pass: &mut EvalPass<'_>,
    ) -> Result<ArrayShape, FormulaError> {
        let Ast::Func(func, args) = call else {
            return Err(FormulaError::Value);
        };
        let names = self.name_scope(formula_sheet);
        let lifted = Branching::of(*func)
            .is_some_and(|kind| kind.takes(args.len()) && kind.lifts(args, pass.shapes(names)));
        if !lifted {
            return Err(FormulaError::Value);
        }

        let (mut rows, mut cols) = (1, 1);
        for arg in args {
            if ast_produces_array(arg, pass.shapes(names)) {
                let (arg_rows, arg_cols, _) = self.matrix_shape(arg, formula_sheet, pass)?;
                rows = rows.max(arg_rows);
                cols = cols.max(arg_cols);
            }
        }
        Ok((rows, cols, EvalMatrix::validate_shape(rows, cols, 1, 0)?))
    }

    /// The spill budget a branching call charges before it runs: the largest
    /// bound among its arguments, or the unknown-size charge when none has
    /// one. Errors in an argument's bound belong to that argument, which the
    /// call may not take. A lifted row and column broadcast to a larger
    /// rectangle; the pending loop charges the rest after evaluation.
    pub(super) fn branches_bound(
        &self,
        args: &[Ast],
        formula_sheet: usize,
        pass: &mut EvalPass<'_>,
    ) -> usize {
        args.iter()
            .filter_map(|arg| self.dynamic_array_bound(arg, formula_sheet, pass)?.ok())
            .max()
            .unwrap_or(UNKNOWN_SIZE_PRECHARGE)
    }

    /// One argument of a branching call: an empty argument is 0, as in
    /// Excel, and any other is its array or its value. An array that fails
    /// is that error as a value, which IFERROR and IFNA test and the other
    /// functions return where they take it.
    fn branch_operand(
        &self,
        arg: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Operand {
        if matches!(arg, Ast::Missing) {
            return Operand::Scalar(Value::Number(0.0));
        }
        match self.eval_dynamic_array(arg, sheet, pass, depth + 1) {
            Some(Ok(matrix)) => Operand::Array(matrix),
            Some(Err(error)) => Operand::Scalar(Value::Error(error)),
            None => Operand::Scalar(self.eval_ast(arg, sheet, pass, depth + 1)),
        }
    }

    /// The lifted call: every argument evaluated and broadcast to one shape,
    /// each element picked by the function's scalar rule.
    fn eval_lifted_branches(
        &self,
        call: LiftedCall<'_>,
        pass: &mut EvalPass<'_>,
    ) -> Result<EvalMatrix, FormulaError> {
        let LiftedCall {
            kind,
            args,
            sheet,
            depth,
        } = call;
        let mut operands = Vec::with_capacity(args.len());
        let (mut rows, mut cols, mut operand_bytes) = (1, 1, 0_usize);
        for arg in args {
            let operand = self.branch_operand(arg, sheet, pass, depth);
            let (operand_rows, operand_cols) = operand.shape();
            rows = rows.max(operand_rows);
            cols = cols.max(operand_cols);
            operand_bytes = operand_bytes
                .checked_add(operand.bytes())
                .ok_or(FormulaError::Num)?;
            operands.push(operand);
        }

        let cells = EvalMatrix::validate_shape(rows, cols, 1, operand_bytes)?;
        let mut bytes = operand_bytes + cells * size_of::<Value>();
        let mut values = Vec::with_capacity(cells);
        for row in 0..rows {
            for col in 0..cols {
                let element = |index: usize| {
                    operands
                        .get(index)
                        .and_then(|operand| operand.at(row, col))
                        .cloned()
                        .unwrap_or(Value::Error(FormulaError::Na))
                };
                let value = match kind.pick(args, element) {
                    Pick::Argument(index) => element(index),
                    Pick::Value(value) => value,
                };
                if let Value::Text(text) = &value {
                    bytes = bytes.checked_add(text.len()).ok_or(FormulaError::Num)?;
                    if bytes > SPILL_MAX_BYTES {
                        return Err(FormulaError::Num);
                    }
                }
                values.push(value);
            }
        }
        Ok(EvalMatrix::new(rows, cols, values))
    }
}
