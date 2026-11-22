//! Functions that take one value, called with an array or a range.
//!
//! Excel runs such a function once for each element and returns an array of
//! the same shape. [`value_args`] declares, for each function, the arguments
//! that take one value; a call is lifted when one of them is an array. The
//! lifted arguments broadcast as the operators and the branch functions do: a
//! single row repeats down, a single column across, a 1×1 array is one value,
//! and an element outside a smaller argument is #N/A. Each element runs the
//! function's own scalar path, with that element's values in place of the
//! lifted arguments, so every family keeps its coercion and error rules. An
//! argument that takes a range (SUM's, COUNTIF's range, a lookup table) is
//! never lifted and reaches each element's call as written.

use std::rc::Rc;

use crate::calc::{ArrayLiteral, Ast, Func};
use crate::store::CellStore;
use crate::types::{FormulaError, Value, FORMULA_RECURSION_LIMIT};

use super::array::{ast_produces_array, Shapes};
use super::branches::ArrayShape;
use super::matrix::{EvalMatrix, SPILL_MAX_BYTES};
use super::operators::Operand;
use super::EvalPass;

/// The bit of [`ValueArgs`] that stands for its argument and every later one.
const LAST_ARGUMENT_BIT: usize = u8::BITS as usize - 1;

/// The arguments of a function that take one value: bit `i` for argument
/// `i`, and the highest bit for that argument and every later one.
#[derive(Clone, Copy)]
pub(super) struct ValueArgs(u8);

impl ValueArgs {
    /// No argument: the function is never lifted.
    pub(super) const NONE: Self = Self(0);
    /// Every argument, however many the call has.
    pub(super) const ALL: Self = Self(u8::MAX);

    /// The arguments at `positions`, each below [`LAST_ARGUMENT_BIT`].
    pub(super) const fn at(positions: &[usize]) -> Self {
        let mut bits = 0;
        let mut next = 0;
        while next < positions.len() {
            bits |= 1 << positions[next];
            next += 1;
        }
        Self(bits)
    }

    const fn is_none(self) -> bool {
        self.0 == 0
    }

    /// Whether the argument at `index` takes one value.
    const fn takes(self, index: usize) -> bool {
        let bit = if index < LAST_ARGUMENT_BIT {
            index
        } else {
            LAST_ARGUMENT_BIT
        };
        self.0 & (1 << bit) != 0
    }
}

/// WORKDAY and NETWORKDAYS: the two dates or the date and the day count;
/// the holidays are a range.
const DAYS_ARGS: ValueArgs = ValueArgs::at(&[0, 1]);
/// LARGE, SMALL, PERCENTILE.INC and QUARTILE.INC take `k` after the data;
/// COUNTIF, SUMIF and AVERAGEIF take the criteria after the range.
const AFTER_RANGE_ARGS: ValueArgs = ValueArgs::at(&[1]);
/// MATCH: the lookup value and the match type.
const MATCH_ARGS: ValueArgs = ValueArgs::at(&[0, 2]);
/// LOOKUP: the lookup value; the vectors are ranges or arrays.
const LOOKUP_VALUE_ARGS: ValueArgs = ValueArgs::at(&[0]);
/// VLOOKUP and HLOOKUP: the lookup value, the column or row number and the
/// match flag; XMATCH: the lookup value and the two modes.
const LOOKUP_ARGS: ValueArgs = ValueArgs::at(&[0, 2, 3]);

/// The arguments of `func` that take one value. A function that is not
/// listed is never lifted: its arguments take ranges or arrays (SUM, CONCAT,
/// INDEX, XLOOKUP's return array), a reference (ISREF, ISFORMULA, CELL), the
/// value as a whole (TYPE, N, T), or the call belongs to one cell (HYPERLINK).
/// TODAY, NOW and RAND take no argument. Each analysis family declares its
/// own functions.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "every other function takes no argument that lifts; listing the other Func variants adds nothing"
)]
#[cfg_attr(
    not(feature = "analysis"),
    allow(
        clippy::missing_const_for_fn,
        reason = "the full engine's arm calls a family's declaration through a function pointer, which a const fn cannot"
    )
)]
pub(super) fn value_args(func: Func) -> ValueArgs {
    match func {
        #[cfg(feature = "analysis")]
        Func::Analysis(id) => (super::analysis::family(id).value_args)(id),
        Func::Workday | Func::NetworkDays => DAYS_ARGS,
        Func::Large
        | Func::Small
        | Func::PercentileInc
        | Func::QuartileInc
        | Func::CountIf
        | Func::SumIf
        | Func::AverageIf => AFTER_RANGE_ARGS,
        Func::Match => MATCH_ARGS,
        Func::Lookup => LOOKUP_VALUE_ARGS,
        Func::VLookup | Func::HLookup | Func::XMatch => LOOKUP_ARGS,
        _ if is_math_of_values(func) || is_text_date_or_test_of_values(func) => ValueArgs::ALL,
        _ => ValueArgs::NONE,
    }
}

/// The math, trigonometry and numeral functions, whose every argument takes
/// one value.
const fn is_math_of_values(func: Func) -> bool {
    matches!(
        func,
        Func::Abs
            | Func::Sqrt
            | Func::Round
            | Func::RoundUp
            | Func::RoundDown
            | Func::Mod
            | Func::Pow
            | Func::Power
            | Func::Floor
            | Func::Ceiling
            | Func::Int
            | Func::Trunc
            | Func::Sign
            | Func::Exp
            | Func::Ln
            | Func::Log
            | Func::Log10
            | Func::MRound
            | Func::Even
            | Func::Odd
            | Func::Quotient
            | Func::IsEven
            | Func::IsOdd
            | Func::CeilingPrecise
            | Func::FloorPrecise
            | Func::IsoCeiling
            | Func::Sin
            | Func::Cos
            | Func::Tan
            | Func::Cot
            | Func::Csc
            | Func::Sec
            | Func::Asin
            | Func::Acos
            | Func::Atan
            | Func::Atan2
            | Func::Acot
            | Func::Sinh
            | Func::Cosh
            | Func::Tanh
            | Func::Coth
            | Func::Csch
            | Func::Sech
            | Func::Asinh
            | Func::Acosh
            | Func::Atanh
            | Func::Acoth
            | Func::Degrees
            | Func::Radians
            | Func::Roman
            | Func::Arabic
            | Func::Base
            | Func::Decimal
    )
}

/// The text, date, logical, information, financial and random functions
/// whose every argument takes one value.
const fn is_text_date_or_test_of_values(func: Func) -> bool {
    matches!(
        func,
        Func::Not
            | Func::IsBlank
            | Func::IsNumber
            | Func::IsText
            | Func::IsLogical
            | Func::IsError
            | Func::IsErr
            | Func::IsNa
            | Func::IsNonText
            | Func::ErrorType
            | Func::Len
            | Func::Left
            | Func::Right
            | Func::Mid
            | Func::Upper
            | Func::Lower
            | Func::Trim
            | Func::Text
            | Func::Exact
            | Func::Substitute
            | Func::Replace
            | Func::Find
            | Func::Search
            | Func::Value
            | Func::Clean
            | Func::Rept
            | Func::Char
            | Func::Code
            | Func::UniChar
            | Func::Unicode
            | Func::Proper
            | Func::NumberValue
            | Func::Date
            | Func::DateValue
            | Func::Day
            | Func::Month
            | Func::Year
            | Func::Time
            | Func::TimeValue
            | Func::Hour
            | Func::Minute
            | Func::Second
            | Func::Days
            | Func::EDate
            | Func::EOMonth
            | Func::Weekday
            | Func::WeekNum
            | Func::YearFrac
            | Func::Days360
            | Func::Pv
            | Func::Fv
            | Func::Pmt
            | Func::Ipmt
            | Func::Ppmt
            | Func::Rate
            | Func::RandBetween
    )
}

/// Whether a call of `func` with `args` is lifted: an argument that takes
/// one value is an array. Most calls have no array argument, and this
/// answers them inline in the shape check, from the arguments' own checks
/// and without looking `func` up; the conditional-format rules ask it of
/// every nested call in every visible cell. Each argument is checked once.
#[inline]
pub(super) fn lifts(func: Func, args: &[Ast], shapes: Shapes<'_>) -> bool {
    args.iter()
        .position(|arg| ast_produces_array(arg, shapes))
        .is_some_and(|first| array_at_value_arg(func, args, first, shapes))
}

/// Whether an argument of `func` that takes one value is an array, given
/// that the argument at `first` is the first array argument. Out of line,
/// so the common case stays small.
#[inline(never)]
fn array_at_value_arg(func: Func, args: &[Ast], first: usize, shapes: Shapes<'_>) -> bool {
    let value_args = value_args(func);
    value_args.takes(first)
        || (!value_args.is_none()
            && args
                .iter()
                .enumerate()
                .skip(first + 1)
                .any(|(index, arg)| value_args.takes(index) && ast_produces_array(arg, shapes)))
}

/// Whether a call of `func` with `args` can lift, decided once when the
/// call is built (`calc::CallShape`): an argument that takes one value is
/// not surely one value. The shape check walks into the arguments only of
/// a call for which this holds.
pub(crate) fn call_may_lift(func: Func, args: &[Ast]) -> bool {
    let value_args = value_args(func);
    !value_args.is_none()
        && args
            .iter()
            .enumerate()
            .any(|(index, arg)| value_args.takes(index) && !surely_one_value(arg, 0))
}

/// Whether `ast` is one value whatever its cells hold. It must never hold
/// where [`ast_produces_array`] can answer `true`, so it is conservative: a
/// node that binding or a rewrite can turn into an array later (a name, a
/// structured or detached reference, a LET use, a LAMBDA parameter), a
/// function that returns arrays of its own ([`returns_arrays`]), and a call
/// that can lift are not. Past the evaluator's depth limit it answers
/// `false`.
fn surely_one_value(ast: &Ast, depth: usize) -> bool {
    if depth > FORMULA_RECURSION_LIMIT {
        return false;
    }
    match ast {
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Cell(..)
        | Ast::AbsCell(..)
        | Ast::SheetCell(_)
        | Ast::InvalidRef => true,
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            surely_one_value(left, depth + 1) && surely_one_value(right, depth + 1)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            surely_one_value(inner, depth + 1)
        }
        Ast::Func(func, _, shape) => !shape.may_lift() && !returns_arrays(*func),
        Ast::Name(_)
        | Ast::DefinedName(..)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Range(..)
        | Ast::SheetRange(_)
        | Ast::AbsRange(..)
        | Ast::SheetSpan(_)
        | Ast::UnknownFunc(_)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array(_) => false,
        #[cfg(feature = "analysis")]
        Ast::RegexPattern(_) => true,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) => false,
    }
}

/// The functions whose call can be an array without lifting: the reference
/// functions, the array functions, LET, INDEX, the branch functions, and in
/// the full engine a family with array hooks. Every function that
/// [`super::array::ast_produces_array`] answers for by its own rule is here.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "every other built-in function returns one value unless it lifts"
)]
#[cfg_attr(
    not(feature = "analysis"),
    allow(
        clippy::missing_const_for_fn,
        reason = "the full engine's arm reads a family's array hooks, which a const fn cannot"
    )
)]
fn returns_arrays(func: Func) -> bool {
    match func {
        Func::AnchorArray
        | Func::Offset
        | Func::Indirect
        | Func::Intersect
        | Func::Filter
        | Func::Sort
        | Func::Unique
        | Func::Transpose
        | Func::Sequence
        | Func::Take
        | Func::Drop
        | Func::ChooseCols
        | Func::ChooseRows
        | Func::TrimRange
        | Func::Let
        | Func::Index
        | Func::If
        | Func::IfError
        | Func::IfNa
        | Func::Ifs
        | Func::Switch
        | Func::Choose => true,
        #[cfg(feature = "analysis")]
        Func::Analysis(id) => super::analysis::family(id).array.is_some(),
        _ => false,
    }
}

/// The argument that gives the scalar path `value`. Blank and errors have no
/// literal of their own: a one-cell array holds them, and the scalar path
/// reads its one value.
fn literal(value: &Value) -> Ast {
    match value {
        Value::Number(number) => Ast::Num(*number),
        Value::Text(text) => Ast::Str(Rc::clone(text)),
        Value::Bool(flag) => Ast::Bool(*flag),
        Value::Blank | Value::Error(_) => Ast::Array(Box::new(ArrayLiteral {
            cols: 1,
            values: Rc::from([value.clone()]),
        })),
    }
}

/// The arguments of the call for the element at `row`, `col`: each lifted
/// argument's element as a literal, every other argument as written. `None`
/// when the element lies outside a smaller lifted argument.
fn element_args(
    args: &[Ast],
    operands: &[Option<Operand>],
    row: usize,
    col: usize,
) -> Option<Box<[Ast]>> {
    args.iter()
        .zip(operands)
        .map(|(arg, operand)| match operand {
            Some(lifted) => lifted.at(row, col).map(literal),
            None => Some(arg.clone()),
        })
        .collect()
}

/// A lifted call: its function, its arguments, and the sheet and depth it
/// is evaluated at.
#[derive(Clone, Copy)]
struct LiftedCall<'a> {
    func: Func,
    args: &'a [Ast],
    sheet: usize,
    depth: usize,
}

impl CellStore {
    /// A lifted `call` as an array, or `None` when no argument that takes
    /// one value is an array. Out of line, like every `*_family` handler, so
    /// neither the check nor the lifted path adds to the evaluator the array
    /// dispatch is inlined into.
    #[inline(never)]
    pub(super) fn eval_lifted_family(
        &self,
        call: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<Result<EvalMatrix, FormulaError>> {
        let Ast::Func(func, args, _) = call else {
            return None;
        };
        if !lifts(*func, args, pass.shapes(self.name_scope(sheet))) {
            return None;
        }
        let lifted = LiftedCall {
            func: *func,
            args,
            sheet,
            depth,
        };
        Some(self.eval_lifted(lifted, pass))
    }

    /// The array shape of a lifted call before evaluation: the largest row
    /// and column count of the arguments that take one value.
    pub(super) fn lifted_shape(
        &self,
        func: Func,
        args: &[Ast],
        formula_sheet: usize,
        pass: &mut EvalPass<'_>,
    ) -> Result<ArrayShape, FormulaError> {
        let value_args = value_args(func);
        let (mut rows, mut cols) = (1, 1);
        for (index, arg) in args.iter().enumerate() {
            if value_args.takes(index) {
                let (arg_rows, arg_cols, _) = self.argument_shape(arg, formula_sheet, pass)?;
                rows = rows.max(arg_rows);
                cols = cols.max(arg_cols);
            }
        }
        Ok((rows, cols, EvalMatrix::validate_shape(rows, cols, 1, 0)?))
    }

    /// One argument that takes one value, evaluated once for every element:
    /// its array, or its value. An array that fails as a whole is that error
    /// in every element.
    fn lifted_operand(
        &self,
        arg: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Operand {
        match self.eval_dynamic_array(arg, sheet, pass, depth + 1) {
            Some(Ok(matrix)) => Operand::Array(matrix),
            Some(Err(error)) => Operand::Scalar(Value::Error(error)),
            None => Operand::Scalar(self.eval_ast(arg, sheet, pass, depth + 1)),
        }
    }

    /// The lifted call: the arguments that take one value evaluated once and
    /// broadcast to one shape, and the function run once for each element.
    /// An empty argument stays empty, so each call reads its default.
    fn eval_lifted(
        &self,
        call: LiftedCall<'_>,
        pass: &mut EvalPass<'_>,
    ) -> Result<EvalMatrix, FormulaError> {
        let LiftedCall {
            func,
            args,
            sheet,
            depth,
        } = call;
        let value_args = value_args(func);
        let mut operands = Vec::with_capacity(args.len());
        let (mut rows, mut cols, mut operand_bytes) = (1, 1, 0_usize);
        for (index, arg) in args.iter().enumerate() {
            let lifted = value_args.takes(index) && !matches!(arg, Ast::Missing);
            let operand = lifted.then(|| self.lifted_operand(arg, sheet, pass, depth));
            if let Some(evaluated) = &operand {
                let (operand_rows, operand_cols) = evaluated.shape();
                rows = rows.max(operand_rows);
                cols = cols.max(operand_cols);
                operand_bytes = operand_bytes
                    .checked_add(evaluated.bytes())
                    .ok_or(FormulaError::Num)?;
            }
            operands.push(operand);
        }

        let cells = EvalMatrix::validate_shape(rows, cols, 1, operand_bytes)?;
        let mut bytes = operand_bytes + cells * size_of::<Value>();
        let mut values = Vec::with_capacity(cells);
        for row in 0..rows {
            for col in 0..cols {
                let value = match element_args(args, &operands, row, col) {
                    Some(element) => {
                        self.eval_ast(&Ast::call(func, element), sheet, pass, depth + 1)
                    }
                    // Outside a smaller argument, as the operators give.
                    None => Value::Error(FormulaError::Na),
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
