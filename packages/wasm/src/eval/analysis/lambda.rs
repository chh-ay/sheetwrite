//! Full-engine lexical functions and bounded array helpers.
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use super::super::array::ast_produces_array;
use super::super::matrix::{EvalMatrix, SPILL_MAX_RECOMPUTE_CELLS};
use super::super::value::number_from_value;
use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value, FORMULA_RECURSION_LIMIT};

pub(crate) const NAMES: &[&str] = &[
    "BYCOL",
    "BYROW",
    "ISOMITTED",
    "LAMBDA",
    "MAKEARRAY",
    "MAP",
    "REDUCE",
    "SCAN",
];
pub(crate) const CALL: &str = "$LAMBDA_CALL";
const PARAMETER_LIMIT: usize = 253;
const SUBSTITUTION_NODE_LIMIT: usize = 16_384;
const CALL_DEPTH_LIMIT: usize = 64;
const CALL_WORK_LIMIT: usize = 2_000_000;

// Evaluation crosses scalar and matrix hooks. A scoped budget follows those
// calls and resets when the outer helper returns.
thread_local! {
    static CALL_BUDGET: std::cell::Cell<(usize, usize)> = const { std::cell::Cell::new((0, 0)) };
}
struct CallBudget;
impl CallBudget {
    fn enter() -> Result<Self, FormulaError> {
        CALL_BUDGET.with(|budget| {
            let (depth, work) = budget.get();
            if depth >= CALL_DEPTH_LIMIT || work >= CALL_WORK_LIMIT {
                return Err(FormulaError::Num);
            }
            budget.set((depth + 1, if depth == 0 { 0 } else { work }));
            Ok(Self)
        })
    }
    fn charge(work: usize) -> Result<(), FormulaError> {
        CALL_BUDGET.with(|budget| {
            let (depth, previous) = budget.get();
            if depth == 0 {
                return Ok(());
            }
            let total = previous.checked_add(work).ok_or(FormulaError::Num)?;
            if total > CALL_WORK_LIMIT {
                return Err(FormulaError::Num);
            }
            budget.set((depth, total));
            Ok(())
        })
    }
}
impl Drop for CallBudget {
    fn drop(&mut self) {
        CALL_BUDGET.with(|budget| {
            let (depth, work) = budget.get();
            budget.set((depth - 1, if depth == 1 { 0 } else { work }));
        });
    }
}

fn definition(mut expression: &Ast) -> Result<(&[Ast], &Ast), FormulaError> {
    while let Ast::LetSlot {
        expression: inner, ..
    } = expression
    {
        expression = inner;
    }
    let Ast::Func(Func::Analysis("LAMBDA"), arguments) = expression else {
        return Err(FormulaError::Value);
    };
    let (body, parameters) = arguments.split_last().ok_or(FormulaError::Value)?;
    if parameters.len() > PARAMETER_LIMIT {
        return Err(FormulaError::Value);
    }
    for (index, parameter) in parameters.iter().enumerate() {
        let Ast::Name(name) = parameter else {
            return Err(FormulaError::Value);
        };
        if name.contains('.')
            || parameters[..index].iter().any(
                |earlier| matches!(earlier, Ast::Name(other) if other.eq_ignore_ascii_case(name)),
            )
        {
            return Err(FormulaError::Value);
        }
    }
    Ok((parameters, body))
}
pub(crate) fn parameter_count(expression: &Ast) -> Result<usize, FormulaError> {
    definition(expression).map(|(parameters, _)| parameters.len())
}

pub(crate) fn capture(expression: &Ast, bindings: &[(&str, Ast)]) -> Result<Ast, FormulaError> {
    substitute(expression, bindings, &mut 0)
}
fn substitute(
    expression: &Ast,
    bindings: &[(&str, Ast)],
    nodes: &mut usize,
) -> Result<Ast, FormulaError> {
    *nodes += 1;
    CallBudget::charge(1)?;
    if *nodes > SUBSTITUTION_NODE_LIMIT {
        return Err(FormulaError::Num);
    }
    let lookup = |name: &str| {
        bindings
            .iter()
            .rev()
            .find(|(parameter, _)| parameter.eq_ignore_ascii_case(name))
            .map(|(_, value)| value)
    };
    Ok(match expression {
        Ast::Name(name) => lookup(name).cloned().unwrap_or_else(|| expression.clone()),
        Ast::UnknownFunc(name, arguments) if lookup(name).is_some() => {
            let mut invocation = vec![lookup(name).ok_or(FormulaError::Value)?.clone()];
            invocation.extend(
                arguments
                    .iter()
                    .map(|argument| substitute(argument, bindings, nodes))
                    .collect::<Result<Vec<_>, _>>()?,
            );
            Ast::UnknownFunc(CALL.into(), invocation)
        }
        Ast::Func(Func::Analysis("LAMBDA"), arguments) => {
            let (parameters, body) = definition(expression)?;
            let visible: Vec<_> = bindings.iter().filter(|(name, _)| !parameters.iter().any(|parameter| matches!(parameter, Ast::Name(local) if local.eq_ignore_ascii_case(name)))).cloned().collect();
            let mut nested = arguments[..arguments.len() - 1].to_vec();
            nested.push(substitute(body, &visible, nodes)?);
            Ast::Func(Func::Analysis("LAMBDA"), nested)
        }
        Ast::Func(Func::Let, arguments) => {
            if arguments.len() < 3 || arguments.len().is_multiple_of(2) {
                return Err(FormulaError::Value);
            }
            let mut visible = bindings.to_vec();
            let mut expanded = Vec::with_capacity(arguments.len());
            for pair in arguments[..arguments.len() - 1].as_chunks::<2>().0 {
                expanded.push(pair[0].clone());
                expanded.push(substitute(&pair[1], &visible, nodes)?);
                if let Ast::Name(name) = &pair[0] {
                    visible.retain(|(parameter, _)| !parameter.eq_ignore_ascii_case(name));
                }
            }
            expanded.push(substitute(
                arguments.last().ok_or(FormulaError::Value)?,
                &visible,
                nodes,
            )?);
            Ast::Func(Func::Let, expanded)
        }
        Ast::Func(function, arguments) => Ast::Func(
            *function,
            arguments
                .iter()
                .map(|argument| substitute(argument, bindings, nodes))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        Ast::UnknownFunc(name, arguments) => Ast::UnknownFunc(
            name.clone(),
            arguments
                .iter()
                .map(|argument| substitute(argument, bindings, nodes))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        Ast::Bin(operator, left, right) => Ast::Bin(
            *operator,
            Box::new(substitute(left, bindings, nodes)?),
            Box::new(substitute(right, bindings, nodes)?),
        ),
        Ast::Cmp(operator, left, right) => Ast::Cmp(
            *operator,
            Box::new(substitute(left, bindings, nodes)?),
            Box::new(substitute(right, bindings, nodes)?),
        ),
        Ast::Neg(inner) => Ast::Neg(Box::new(substitute(inner, bindings, nodes)?)),
        Ast::Pos(inner) => Ast::Pos(Box::new(substitute(inner, bindings, nodes)?)),
        Ast::Percent(inner) => Ast::Percent(Box::new(substitute(inner, bindings, nodes)?)),
        Ast::LetSlot { expression, .. } => substitute(expression, bindings, nodes)?,
        _ => expression.clone(),
    })
}

fn apply(function: &Ast, arguments: &[Ast]) -> Result<Ast, FormulaError> {
    let (parameters, body) = definition(function)?;
    if parameters.len() != arguments.len() {
        return Err(FormulaError::Value);
    }
    let bindings: Vec<_> = parameters
        .iter()
        .zip(arguments)
        .map(|(parameter, argument)| {
            let Ast::Name(name) = parameter else {
                unreachable!("definition validates parameters")
            };
            (name.as_str(), argument.clone())
        })
        .collect();
    substitute(body, &bindings, &mut 0)
}

fn call_body(arguments: &[Ast]) -> Result<Ast, FormulaError> {
    apply(
        arguments.first().ok_or(FormulaError::Value)?,
        &arguments[1..],
    )
}

pub(crate) fn produces_array(name: &str, arguments: &[Ast]) -> bool {
    let Ok(_budget) = CallBudget::enter() else {
        return false;
    };
    match name {
        "MAP" | "SCAN" | "BYROW" | "BYCOL" | "MAKEARRAY" => true,
        CALL => call_body(arguments).is_ok_and(|body| ast_produces_array(&body)),
        _ => false,
    }
}

fn source_shape(
    store: &CellStore,
    expression: &Ast,
    sheet: usize,
) -> Result<(usize, usize, usize), FormulaError> {
    if ast_produces_array(expression) {
        store.matrix_shape(expression, sheet)
    } else {
        Ok((1, 1, 1))
    }
}
pub(crate) fn shape(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
) -> Result<(usize, usize, usize), FormulaError> {
    let _budget = CallBudget::enter()?;
    let (rows, cols) = match name {
        CALL => return store.matrix_shape(&call_body(arguments)?, sheet),
        "MAKEARRAY" => {
            if arguments.len() != 3 {
                return Err(FormulaError::Value);
            }
            let affected = HashSet::new();
            let mut memo = HashMap::new();
            let mut visiting = HashSet::new();
            let mut context = Context {
                store,
                sheet,
                affected: &affected,
                memo: &mut memo,
                visiting: &mut visiting,
                depth: 0,
            };
            (
                context.dimension(&arguments[0])?,
                context.dimension(&arguments[1])?,
            )
        }
        "MAP" => {
            if arguments.len() < 2 {
                return Err(FormulaError::Value);
            }
            let (rows, cols, _) = source_shape(store, &arguments[0], sheet)?;
            (rows, cols)
        }
        "SCAN" => {
            if arguments.len() != 3 {
                return Err(FormulaError::Value);
            }
            let (rows, cols, _) = source_shape(store, &arguments[1], sheet)?;
            (rows, cols)
        }
        "BYROW" | "BYCOL" => {
            if arguments.len() != 2 {
                return Err(FormulaError::Value);
            }
            let (rows, cols, _) = source_shape(store, &arguments[0], sheet)?;
            if name == "BYROW" {
                (rows, 1)
            } else {
                (1, cols)
            }
        }
        _ => return Err(FormulaError::Value),
    };
    Ok((rows, cols, EvalMatrix::validate_shape(rows, cols, 2, 0)?))
}

pub(crate) fn bound(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
) -> Result<usize, FormulaError> {
    shape(store, name, arguments, sheet).map(|(_, _, cells)| cells)
}

struct Context<'a> {
    store: &'a CellStore,
    sheet: usize,
    affected: &'a HashSet<AbsCellKey>,
    memo: &'a mut HashMap<AbsCellKey, EvalResult>,
    visiting: &'a mut HashSet<AbsCellKey>,
    depth: usize,
}

impl Context<'_> {
    fn call_body(&mut self, arguments: &[Ast]) -> Result<Ast, FormulaError> {
        let function = arguments.first().ok_or(FormulaError::Value)?;
        let (parameters, _) = definition(function)?;
        if parameters.len() != arguments.len() - 1 {
            return Err(FormulaError::Value);
        }
        let evaluated = arguments[1..]
            .iter()
            .map(|argument| {
                if matches!(argument, Ast::Missing) || definition(argument).is_ok() {
                    return Ok(argument.clone());
                }
                if ast_produces_array(argument) {
                    let mut matrix = self.matrix(argument)?;
                    return Ok(Ast::BoundMatrix {
                        rows: matrix.rows,
                        cols: matrix.cols,
                        values: Rc::new(std::mem::take(&mut matrix.values)),
                    });
                }
                let value = self.scalar(argument);
                if let Value::Error(error) = value {
                    return Err(error);
                }
                Ok(literal(&value))
            })
            .collect::<Result<Vec<_>, _>>()?;
        apply(function, &evaluated)
    }
    fn scalar(&mut self, expression: &Ast) -> Value {
        self.store.eval_ast(
            expression,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth + 1,
        )
    }
    fn matrix(&mut self, expression: &Ast) -> Result<EvalMatrix, FormulaError> {
        self.store.eval_matrix_arg(
            expression,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth + 1,
        )
    }
    fn dimension(&mut self, expression: &Ast) -> Result<usize, FormulaError> {
        let number = number_from_value(&self.scalar(expression))?;
        if !number.is_finite() || number < 1.0 || number.fract() != 0.0 {
            return Err(FormulaError::Value);
        }
        Ok(number as usize)
    }
    fn invoke(&mut self, function: &Ast, arguments: &[Ast]) -> Result<Value, FormulaError> {
        CallBudget::charge(1)?;
        if self.depth >= FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }
        let body = apply(function, arguments)?;
        if ast_produces_array(&body) {
            let matrix = self.matrix(&body)?;
            if matrix.values.len() != 1 {
                return Err(FormulaError::Calc);
            }
            Ok(matrix.into_first())
        } else {
            let value = self.scalar(&body);
            if let Value::Error(error) = value {
                Err(error)
            } else {
                Ok(value)
            }
        }
    }
}

fn literal(value: &Value) -> Ast {
    match value {
        Value::Number(number) => Ast::Num(*number),
        Value::Text(text) => Ast::Str(text.to_string()),
        Value::Bool(boolean) => Ast::Bool(*boolean),
        Value::Blank | Value::Error(_) => Ast::BoundMatrix {
            rows: 1,
            cols: 1,
            values: Rc::new(vec![value.clone()]),
        },
    }
}

pub(crate) fn evaluate(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> EvalResult {
    let _budget = match CallBudget::enter() {
        Ok(budget) => budget,
        Err(error) => return Value::Error(error),
    };
    let mut context = Context {
        store,
        sheet,
        affected,
        memo,
        visiting,
        depth,
    };
    let result = match name {
        "LAMBDA" => definition(&Ast::Func(Func::Analysis("LAMBDA"), arguments.to_vec()))
            .map(|_| Value::Error(FormulaError::Calc)),
        "ISOMITTED" if arguments.len() == 1 => {
            Ok(Value::Bool(matches!(arguments[0], Ast::Missing)))
        }
        "ISOMITTED" => Err(FormulaError::Value),
        CALL => context
            .call_body(arguments)
            .map(|body| context.scalar(&body)),
        "REDUCE" => reduce(&mut context, arguments, false).map(EvalMatrix::into_first),
        _ => evaluate_with_context(&mut context, name, arguments).map(EvalMatrix::into_first),
    };
    result.unwrap_or_else(Value::Error)
}

pub(in crate::eval) fn evaluate_matrix(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> Result<EvalMatrix, FormulaError> {
    let _budget = CallBudget::enter()?;
    if depth > FORMULA_RECURSION_LIMIT {
        return Err(FormulaError::Num);
    }
    let mut context = Context {
        store,
        sheet,
        affected,
        memo,
        visiting,
        depth,
    };
    evaluate_with_context(&mut context, name, arguments)
}

fn reduce(
    context: &mut Context<'_>,
    arguments: &[Ast],
    scan: bool,
) -> Result<EvalMatrix, FormulaError> {
    if arguments.len() != 3 {
        return Err(FormulaError::Value);
    }
    let array = context.matrix(&arguments[1])?;
    let mut accumulator = context.scalar(&arguments[0]);
    let mut results = Vec::with_capacity(if scan { array.values.len() } else { 1 });
    for value in &array.values {
        accumulator = context.invoke(&arguments[2], &[literal(&accumulator), literal(value)])?;
        if scan {
            results.push(accumulator.clone());
        }
    }
    if scan {
        Ok(EvalMatrix::new(array.rows, array.cols, results))
    } else {
        Ok(EvalMatrix::new(1, 1, vec![accumulator]))
    }
}

fn evaluate_with_context(
    context: &mut Context<'_>,
    name: &str,
    arguments: &[Ast],
) -> Result<EvalMatrix, FormulaError> {
    match name {
        CALL => {
            let body = context.call_body(arguments)?;
            context.matrix(&body)
        }
        "SCAN" => reduce(context, arguments, true),
        "MAKEARRAY" => {
            if arguments.len() != 3 {
                return Err(FormulaError::Value);
            }
            let rows = context.dimension(&arguments[0])?;
            let cols = context.dimension(&arguments[1])?;
            let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
            let mut values = Vec::with_capacity(cells);
            for row in 1..=rows {
                for col in 1..=cols {
                    values.push(
                        context
                            .invoke(&arguments[2], &[Ast::Num(row as f64), Ast::Num(col as f64)])?,
                    );
                }
            }
            Ok(EvalMatrix::new(rows, cols, values))
        }
        "MAP" => {
            if arguments.len() < 2 {
                return Err(FormulaError::Value);
            }
            let function = arguments.last().ok_or(FormulaError::Value)?;
            let arrays = arguments[..arguments.len() - 1]
                .iter()
                .map(|argument| context.matrix(argument))
                .collect::<Result<Vec<_>, _>>()?;
            let first = arrays.first().ok_or(FormulaError::Value)?;
            if arrays.iter().any(|array| !first.same_shape(array)) {
                return Err(FormulaError::Value);
            }
            if first
                .values
                .len()
                .checked_mul(arrays.len())
                .is_none_or(|work| work > SPILL_MAX_RECOMPUTE_CELLS)
            {
                return Err(FormulaError::Num);
            }
            EvalMatrix::validate_shape(first.rows, first.cols, arrays.len() + 1, 0)?;
            let mut values = Vec::with_capacity(first.values.len());
            let mut parameters = Vec::with_capacity(arrays.len());
            for index in 0..first.values.len() {
                parameters.clear();
                parameters.extend(arrays.iter().map(|array| literal(&array.values[index])));
                values.push(context.invoke(function, &parameters)?);
            }
            Ok(EvalMatrix::new(first.rows, first.cols, values))
        }
        "BYROW" | "BYCOL" => {
            if arguments.len() != 2 {
                return Err(FormulaError::Value);
            }
            let array = context.matrix(&arguments[0])?;
            let by_row = name == "BYROW";
            let count = if by_row { array.rows } else { array.cols };
            let mut values = Vec::with_capacity(count);
            for index in 0..count {
                let slice = if by_row {
                    array.values[index * array.cols..(index + 1) * array.cols].to_vec()
                } else {
                    (0..array.rows)
                        .map(|row| array.values[row * array.cols + index].clone())
                        .collect()
                };
                let parameter = Ast::BoundMatrix {
                    rows: if by_row { 1 } else { array.rows },
                    cols: if by_row { array.cols } else { 1 },
                    values: Rc::new(slice),
                };
                values.push(context.invoke(&arguments[1], &[parameter])?);
            }
            Ok(EvalMatrix::new(
                if by_row { count } else { 1 },
                if by_row { 1 } else { count },
                values,
            ))
        }
        _ => Err(FormulaError::Value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn calculate(formula: &str) -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(32, 16);
        for row in 0..2 {
            for col in 0..3 {
                store.set_number(sheet, row, col, (row * 3 + col + 1) as f64, 0);
            }
        }
        store.set_formula(sheet, 4, 4, formula, 0);
        store.recompute(sheet);
        (store, sheet)
    }

    #[test]
    fn microsoft_helper_examples() {
        // Microsoft Support examples, with A1:C2 = 1,2,3;4,5,6.
        // https://support.microsoft.com/en-us/excel/functions/map-function
        // https://support.microsoft.com/en-us/excel/functions/reduce-function
        // https://support.microsoft.com/en-us/excel/functions/scan-function
        // https://support.microsoft.com/en-us/excel/functions/byrow-function
        // https://support.microsoft.com/en-us/excel/functions/bycol-function
        // https://support.microsoft.com/en-us/excel/functions/makearray-function
        // https://support.microsoft.com/en-us/excel/functions/lambda-function
        // https://support.microsoft.com/en-us/excel/functions/isomitted-function
        let examples = [
            ("=LAMBDA(number,number+1)(2)", 1, 1, vec![3.0]),
            (
                "=MAP(A1:C2,LAMBDA(a,IF(a>4,a*a,a)))",
                2,
                3,
                vec![1.0, 2.0, 3.0, 4.0, 25.0, 36.0],
            ),
            ("=REDUCE(,A1:C2,LAMBDA(a,b,a+b^2))", 1, 1, vec![91.0]),
            (
                "=SCAN(1,A1:C2,LAMBDA(a,b,a*b))",
                2,
                3,
                vec![1.0, 2.0, 6.0, 24.0, 120.0, 720.0],
            ),
            (
                "=BYROW(A1:C2,LAMBDA(array,MAX(array)))",
                2,
                1,
                vec![3.0, 6.0],
            ),
            (
                "=BYCOL(A1:C2,LAMBDA(array,MAX(array)))",
                1,
                3,
                vec![4.0, 5.0, 6.0],
            ),
            (
                "=MAKEARRAY(3,3,LAMBDA(r,c,r*c))",
                3,
                3,
                vec![1.0, 2.0, 3.0, 2.0, 4.0, 6.0, 3.0, 6.0, 9.0],
            ),
            ("=LAMBDA(x,y,IF(ISOMITTED(y),x,x+y))(10,)", 1, 1, vec![10.0]),
        ];
        for (formula, rows, cols, expected) in examples {
            let (store, sheet) = calculate(formula);
            for row in 0..rows {
                for col in 0..cols {
                    let cell = store.get_cell(sheet, 4 + row, 4 + col);
                    assert_eq!(cell.string(), None, "{formula}: {:?}", cell.string());
                    assert_eq!(
                        cell.num(),
                        expected[row * cols + col],
                        "{formula} at {row},{col}"
                    );
                }
            }
        }
    }

    #[test]
    fn helper_errors_and_bounded_recursion() {
        let cases = [
            ("=LAMBDA(x,x+1)", "#CALC!"),
            ("=LAMBDA(x,x+1)(1,2)", "#VALUE!"),
            ("=LAMBDA(x,x,x)(1,2)", "#VALUE!"),
            ("=LAMBDA(a.b,a.b)(1)", "#VALUE!"),
            ("=MAP(A1:C2,LAMBDA(a,b,a+b))", "#VALUE!"),
            ("=MAP(A1:C2,A1:A2,LAMBDA(a,b,a+b))", "#VALUE!"),
            ("=REDUCE(0,A1:C2,LAMBDA(a,a))", "#VALUE!"),
            ("=SCAN(0,A1:C2,LAMBDA(a,a))", "#VALUE!"),
            ("=BYROW(A1:C2,LAMBDA(a,b,a))", "#VALUE!"),
            ("=BYCOL(A1:C2,LAMBDA(a,b,a))", "#VALUE!"),
            ("=BYROW(A1:C2,LAMBDA(a,a))", "#CALC!"),
            ("=MAKEARRAY(0,3,LAMBDA(r,c,r*c))", "#VALUE!"),
            ("=MAKEARRAY(3,3,LAMBDA(r,r))", "#VALUE!"),
            ("=MAKEARRAY(1001,1000,LAMBDA(r,c,r*c))", "#NUM!"),
            ("=ISOMITTED()", "#VALUE!"),
            ("=LAMBDA(x,x)()", "#VALUE!"),
            ("=LAMBDA(self,self(self))(LAMBDA(self,self(self)))", "#NUM!"),
            ("=LAMBDA(self,n,IF(n=0,0,self(self,n-1)+self(self,n-1)))(LAMBDA(self,n,IF(n=0,0,self(self,n-1)+self(self,n-1))),30)", "#NUM!"),
        ];
        for (formula, expected) in cases {
            let (store, sheet) = calculate(formula);
            assert_eq!(
                store.get_cell(sheet, 4, 4).string().as_deref(),
                Some(expected),
                "{formula}"
            );
        }
    }

    #[test]
    fn lexical_binding_omission_and_array_invocation() {
        let cases = [
            ("=LET(x,7,f,LAMBDA(x,x+1),f(2))", 3.0),
            ("=LET(x,7,f,LAMBDA(y,x+y),f(2))", 9.0),
            ("=LET(f,LAMBDA(x,x+1),MAP(A1:C2,f))", 2.0),
            ("=LAMBDA(x,LET(x,5,x))(2)", 5.0),
            ("=LAMBDA(x,LAMBDA(x,x+1)(4)+x)(2)", 7.0),
            ("=LAMBDA(x,IF(ISOMITTED(x),1,2))(A10)", 2.0),
            ("=LAMBDA(x,SUM(x))(A1:C2)", 21.0),
            ("=LAMBDA(self,n,IF(n=0,1,n*self(self,n-1)))(LAMBDA(self,n,IF(n=0,1,n*self(self,n-1))),6)", 720.0),
        ];
        for (formula, expected) in cases {
            let (store, sheet) = calculate(formula);
            assert_eq!(store.get_cell(sheet, 4, 4).string(), None, "{formula}");
            assert_eq!(store.get_cell(sheet, 4, 4).num(), expected, "{formula}");
        }
        let (store, sheet) = calculate("=LAMBDA(x,SEQUENCE(x))(3)");
        assert_eq!(store.get_cell(sheet, 6, 4).num(), 3.0);
    }
    #[test]
    fn parameters_shadow_named_ranges_and_dependency_edits_refresh_spills() {
        let (mut store, sheet) = calculate("=MAP(A1:C2,LAMBDA(x,x+1))");
        assert!(store.set_named_range("x", -1, sheet, 0, 0, 0, 0));
        store.set_formula(sheet, 8, 4, "=LAMBDA(x,x+1)(2)", 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 8, 4).num(), 3.0);
        store.set_number(sheet, 1, 2, 20.0, 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 5, 6).num(), 21.0);
    }
}
