//! Shared scalar semantics for scalar and element-wise operators.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use crate::calc::{Ast, CmpOp, Op};
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value, FORMULA_RECURSION_LIMIT};

use super::matrix::{EvalMatrix, SPILL_MAX_BYTES};
use super::value::{compare_values, number_from_value, text_from_value};

#[derive(Clone, Copy)]
pub(super) enum UnaryOp {
    Neg,
    Pos,
    Percent,
}

#[inline]
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

#[inline]
pub(super) fn binary<Right: std::borrow::Borrow<Value>>(
    op: Op,
    left: &Value,
    right: impl FnOnce() -> Right,
) -> Value {
    if op == Op::Concat {
        let left = match text_from_value(left) {
            Ok(text) => text,
            Err(error) => return Value::Error(error),
        };
        return match text_from_value(right().borrow()) {
            Ok(right) => Value::text(left + &right),
            Err(error) => Value::Error(error),
        };
    }
    let left = match number_from_value(left) {
        Ok(number) => number,
        Err(error) => return Value::Error(error),
    };
    let right = match number_from_value(right().borrow()) {
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

#[inline]
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

enum Operand {
    Scalar(Value),
    Array(EvalMatrix),
}

impl Operand {
    fn bytes(&self) -> usize {
        match self {
            Self::Scalar(Value::Text(text)) => text.len(),
            Self::Scalar(_) => 0,
            Self::Array(matrix) => {
                matrix.values.capacity() * std::mem::size_of::<Value>()
                    + matrix
                        .values
                        .iter()
                        .map(|value| match value {
                            Value::Text(text) => text.len(),
                            _ => 0,
                        })
                        .sum::<usize>()
            }
        }
    }

    fn shape(&self) -> (usize, usize) {
        match self {
            Self::Scalar(_) => (1, 1),
            Self::Array(matrix) => (matrix.rows, matrix.cols),
        }
    }

    fn at(&self, row: usize, col: usize) -> Option<&Value> {
        match self {
            Self::Scalar(value) => Some(value),
            Self::Array(matrix) => matrix.get(
                if matrix.rows == 1 { 0 } else { row },
                if matrix.cols == 1 { 0 } else { col },
            ),
        }
    }
}

impl CellStore {
    fn operator_operand(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<Operand, FormulaError> {
        match self.eval_dynamic_array(ast, sheet, affected, memo, visiting, depth + 1) {
            Some(matrix) => matrix.map(Operand::Array),
            None => Ok(Operand::Scalar(self.eval_ast(
                ast,
                sheet,
                affected,
                memo,
                visiting,
                depth + 1,
            ))),
        }
    }

    pub(super) fn eval_operator_array(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }
        if let Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) = ast {
            let op = match ast {
                Ast::Neg(_) => UnaryOp::Neg,
                Ast::Pos(_) => UnaryOp::Pos,
                _ => UnaryOp::Percent,
            };
            let mut matrix =
                match self.operator_operand(inner, sheet, affected, memo, visiting, depth + 1)? {
                    Operand::Array(matrix) => matrix,
                    Operand::Scalar(value) => {
                        return Ok(EvalMatrix::new(1, 1, vec![unary(op, &value)]));
                    }
                };
            for value in &mut matrix.values {
                *value = unary(op, value);
            }
            return Ok(matrix);
        }
        let (left, right) = match ast {
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => (left, right),
            _ => return Err(FormulaError::Value),
        };
        let left = self.operator_operand(left, sheet, affected, memo, visiting, depth + 1)?;
        let right = self.operator_operand(right, sheet, affected, memo, visiting, depth + 1)?;
        let (left_rows, left_cols) = left.shape();
        let (right_rows, right_cols) = right.shape();
        let rows = left_rows.max(right_rows);
        let cols = left_cols.max(right_cols);
        let operand_bytes = left
            .bytes()
            .checked_add(right.bytes())
            .ok_or(FormulaError::Num)?;
        let cells = EvalMatrix::validate_shape(rows, cols, 1, operand_bytes)?;
        let mut bytes = operand_bytes + cells * std::mem::size_of::<Value>();
        let mut values = Vec::with_capacity(cells);
        for row in 0..rows {
            for col in 0..cols {
                let value = match (left.at(row, col), right.at(row, col)) {
                    (Some(left), Some(right)) => match ast {
                        Ast::Bin(op, _, _) => binary(*op, left, || right),
                        Ast::Cmp(op, _, _) => comparison(*op, left, right),
                        _ => unreachable!("binary operator matched above"),
                    },
                    _ => Value::Error(FormulaError::Na),
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
