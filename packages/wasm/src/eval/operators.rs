//! Shared scalar semantics for scalar and element-wise operators.

use std::cmp::Ordering;

use crate::calc::{Ast, CmpOp, Op};
use crate::store::CellStore;
use crate::types::{FormulaError, Value, FORMULA_RECURSION_LIMIT};

use super::matrix::{EvalMatrix, SPILL_MAX_BYTES};
use super::value::{compare_values, number_from_value, text_from_value};
use super::EvalPass;

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
    left_value: &Value,
    right_operand: impl FnOnce() -> Right,
) -> Value {
    if op == Op::Concat {
        let left = match text_from_value(left_value) {
            Ok(text) => text,
            Err(error) => return Value::Error(error),
        };
        let right_value = right_operand();
        return match text_from_value(right_value.borrow()) {
            Ok(right_text) => {
                let mut output = String::with_capacity(left.len() + right_text.len());
                output.push_str(&left);
                output.push_str(&right_text);
                Value::text(output)
            }
            Err(error) => Value::Error(error),
        };
    }
    let left = match number_from_value(left_value) {
        Ok(number) => number,
        Err(error) => return Value::Error(error),
    };
    let right = match number_from_value(right_operand().borrow()) {
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
pub(crate) fn comparison(op: CmpOp, left: &Value, right: &Value) -> Value {
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
                            Value::Number(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => 0,
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
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Operand, FormulaError> {
        match self.eval_dynamic_array(ast, sheet, pass, depth + 1) {
            Some(matrix) => matrix.map(Operand::Array),
            None => Ok(Operand::Scalar(self.eval_ast(ast, sheet, pass, depth + 1))),
        }
    }

    pub(super) fn eval_operator_array(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }
        if let Some((op, inner)) = unary_parts(ast) {
            let mut matrix = match self.operator_operand(inner, sheet, pass, depth + 1)? {
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
        let Some((operator, left_ast, right_ast)) = binary_parts(ast) else {
            return Err(FormulaError::Value);
        };
        let left = self.operator_operand(left_ast, sheet, pass, depth + 1)?;
        let right = self.operator_operand(right_ast, sheet, pass, depth + 1)?;
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
                    (Some(left_cell), Some(right_cell)) => match operator {
                        BinaryOperator::Arithmetic(op) => binary(op, left_cell, || right_cell),
                        BinaryOperator::Comparison(op) => comparison(op, left_cell, right_cell),
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

/// The operator of a binary node: arithmetic or a comparison.
#[derive(Clone, Copy)]
enum BinaryOperator {
    Arithmetic(Op),
    Comparison(CmpOp),
}

/// The operator and operand of a unary operator node, `None` for any other node.
fn unary_parts(ast: &Ast) -> Option<(UnaryOp, &Ast)> {
    match ast {
        Ast::Neg(inner) => Some((UnaryOp::Neg, inner.as_ref())),
        Ast::Pos(inner) => Some((UnaryOp::Pos, inner.as_ref())),
        Ast::Percent(inner) => Some((UnaryOp::Percent, inner.as_ref())),
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::NamedRange(_)
        | Ast::NamedFormula(_)
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
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => None,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::RegexPattern(_) => None,
    }
}

/// A binary operator node's operator and its left and right operands.
type BinaryParts<'a> = (BinaryOperator, &'a Ast, &'a Ast);

/// The operator and operands of a binary operator node, `None` for any other node.
fn binary_parts(ast: &Ast) -> Option<BinaryParts<'_>> {
    match ast {
        Ast::Bin(op, left, right) => Some((
            BinaryOperator::Arithmetic(*op),
            left.as_ref(),
            right.as_ref(),
        )),
        Ast::Cmp(op, left, right) => Some((
            BinaryOperator::Comparison(*op),
            left.as_ref(),
            right.as_ref(),
        )),
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::NamedRange(_)
        | Ast::NamedFormula(_)
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
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => None,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::RegexPattern(_) => None,
    }
}
