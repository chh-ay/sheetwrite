//! Shared scalar semantics for scalar and element-wise operators.

use std::cmp::Ordering;

use crate::calc::{CmpOp, Op};
use crate::types::{FormulaError, Value};

use super::value::{compare_values, number_from_value, text_from_value};

#[derive(Clone, Copy)]
pub(super) enum UnaryOp {
    Neg,
    Pos,
    Percent,
}

pub(super) fn unary(op: UnaryOp, value: &Value) -> Value {
    match number_from_value(value) {
        Ok(number) => Value::number(match op {
            UnaryOp::Neg => -number,
            UnaryOp::Pos => number,
            UnaryOp::Percent => number / 100.0,
        }),
        Err(error) => Value::Error(error),
    }
}

pub(super) fn binary(op: Op, left: &Value, right: impl FnOnce() -> Value) -> Value {
    if op == Op::Concat {
        let left = match text_from_value(left) {
            Ok(text) => text,
            Err(error) => return Value::Error(error),
        };
        return match text_from_value(&right()) {
            Ok(right) => Value::text(left + &right),
            Err(error) => Value::Error(error),
        };
    }
    let left = match number_from_value(left) {
        Ok(number) => number,
        Err(error) => return Value::Error(error),
    };
    let right = match number_from_value(&right()) {
        Ok(number) => number,
        Err(error) => return Value::Error(error),
    };
    match op {
        Op::Add => Value::number(left + right),
        Op::Sub => Value::number(left - right),
        Op::Mul => Value::number(left * right),
        Op::Div if right == 0.0 => Value::Error(FormulaError::DivZero),
        Op::Div => Value::number(left / right),
        Op::Pow if left == 0.0 && right < 0.0 => Value::Error(FormulaError::DivZero),
        Op::Pow => Value::number(left.powf(right)),
        Op::Concat => unreachable!("concatenation returned before numeric coercion"),
    }
}

pub(super) fn comparison(op: CmpOp, left: &Value, right: &Value) -> Value {
    let ordering = match compare_values(left, right) {
        Ok(ordering) => ordering,
        Err(error) => return Value::Error(error),
    };
    Value::Bool(match op {
        CmpOp::Eq => ordering == Ordering::Equal,
        CmpOp::Ne => ordering != Ordering::Equal,
        CmpOp::Lt => ordering == Ordering::Less,
        CmpOp::Gt => ordering == Ordering::Greater,
        CmpOp::Le => matches!(ordering, Ordering::Less | Ordering::Equal),
        CmpOp::Ge => matches!(ordering, Ordering::Greater | Ordering::Equal),
    })
}
