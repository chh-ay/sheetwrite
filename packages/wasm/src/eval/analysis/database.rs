//! Database functions keep header rows and criteria rows intact.

use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{FormulaError, Value};

use super::super::criteria::Criterion;
use super::super::matrix::EvalMatrix;
use super::super::value::{compare_text_case_insensitive, plain_number};
use super::super::{EvalPass, EvalResult};

family_functions! {
    DAVERAGE,
    DCOUNT,
    DCOUNTA,
    DGET,
    DMAX,
    DMIN,
    DPRODUCT,
    DSTDEV,
    DSTDEVP,
    DSUM,
    DVAR,
    DVARP,
}

const ARGUMENT_COUNT: usize = 3;
type CriteriaRows = Vec<Vec<(usize, Criterion)>>;

pub(crate) fn evaluate_ast(
    store: &CellStore,
    function: Function,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> EvalResult {
    if args.len() != ARGUMENT_COUNT {
        return Value::Error(FormulaError::Value);
    }
    let database = match store.eval_matrix_arg(&args[0], sheet, pass, depth + 1) {
        Ok(matrix) => matrix,
        Err(error) => return Value::Error(error),
    };
    let field = store.eval_ast(&args[1], sheet, pass, depth + 1);
    let column = if matches!(function, Function::DCOUNT | Function::DCOUNTA)
        && (matches!(args[1], Ast::Missing)
            || matches!(&field, Value::Blank)
            || matches!(&field, Value::Text(text) if text.is_empty()))
    {
        None
    } else {
        match field_column(&database.values[..database.cols], &field) {
            Ok(column) => Some(column),
            Err(error) => return Value::Error(error),
        }
    };
    let criteria = match store.eval_matrix_arg(&args[2], sheet, pass, depth + 1) {
        Ok(matrix) => matrix,
        Err(error) => return Value::Error(error),
    };
    let rows = match compile_criteria(&database, &criteria) {
        Ok(rows) => rows,
        Err(error) => return Value::Error(error),
    };
    aggregate(function, &database, column, &rows)
}

fn field_column(headers: &[Value], field: &Value) -> Result<usize, FormulaError> {
    match field {
        Value::Number(number) if number.is_finite() && number.fract() == 0.0
            && *number >= 1.0 && *number <= headers.len() as f64 => Ok(*number as usize - 1),
        Value::Text(label) => headers.iter().position(|header| {
            matches!(header, Value::Text(text) if compare_text_case_insensitive(text, label).is_eq())
        }).ok_or(FormulaError::Value),
        Value::Error(error) => Err(*error),
        Value::Number(_) | Value::Bool(_) | Value::Blank => Err(FormulaError::Value),
    }
}

fn compile_criteria(
    database: &EvalMatrix,
    criteria: &EvalMatrix,
) -> Result<CriteriaRows, FormulaError> {
    if criteria.rows < 2 {
        return Err(FormulaError::Value);
    }
    let headers = &database.values[..database.cols];
    let mut rows = Vec::with_capacity(criteria.rows - 1);
    let mut columns = vec![None; criteria.cols];
    for cells in criteria.values[criteria.cols..].chunks_exact(criteria.cols) {
        let mut conditions = Vec::new();
        for (column, value) in cells.iter().enumerate() {
            // A blank criterion imposes no restriction, even under an unused header.
            if matches!(value, Value::Blank)
                || matches!(value, Value::Text(text) if text.is_empty())
            {
                continue;
            }
            if let Value::Error(error) = value {
                return Err(*error);
            }
            let database_column = if let Some(database_column) = columns[column] {
                database_column
            } else {
                let database_column = field_column(headers, &criteria.values[column])?;
                columns[column] = Some(database_column);
                database_column
            };
            conditions.push((database_column, database_criterion(value)?));
        }
        rows.push(conditions);
    }
    Ok(rows)
}

fn database_criterion(value: &Value) -> Result<Criterion, FormulaError> {
    if let Value::Text(text) = value {
        let raw = text.trim();
        // Unlike COUNTIF, plain database text criteria are prefixes.
        if !raw.starts_with(['=', '<', '>'])
            && !raw.contains(['*', '?', '~'])
            && plain_number(raw).is_none()
            && !raw.eq_ignore_ascii_case("TRUE")
            && !raw.eq_ignore_ascii_case("FALSE")
        {
            return Criterion::parse(Value::text(format!("{raw}*")));
        }
    }
    Criterion::parse(value.clone())
}

fn aggregate(
    function: Function,
    database: &EvalMatrix,
    column: Option<usize>,
    criteria: &CriteriaRows,
) -> Value {
    let mut count = 0usize;
    let mut total = 0.0;
    let mut mean = 0.0;
    let mut squared_deviations = 0.0;
    let mut product = 1.0;
    let mut extreme: Option<f64> = None;
    let mut single = None;
    for record in database.values[database.cols..].chunks_exact(database.cols) {
        if !criteria.iter().any(|conditions| {
            conditions
                .iter()
                .all(|(column, criterion)| criterion.matches(&record[*column]))
        }) {
            continue;
        }
        let Some(field) = column else {
            count += 1;
            continue;
        };
        let value = &record[field];
        match function {
            Function::DGET => {
                if single.is_some() {
                    return Value::Error(FormulaError::Num);
                }
                single = Some(value.clone());
                continue;
            }
            Function::DCOUNTA => {
                if !matches!(value, Value::Blank) {
                    count += 1;
                }
                continue;
            }
            Function::DCOUNT => {
                if matches!(value, Value::Number(_)) {
                    count += 1;
                }
                continue;
            }
            Function::DAVERAGE
            | Function::DMAX
            | Function::DMIN
            | Function::DPRODUCT
            | Function::DSTDEV
            | Function::DSTDEVP
            | Function::DSUM
            | Function::DVAR
            | Function::DVARP => {}
        }
        if let Value::Error(error) = value {
            return Value::Error(*error);
        }
        let Value::Number(number) = value else {
            continue;
        };
        count += 1;
        match function {
            Function::DSUM | Function::DAVERAGE => total += number,
            Function::DPRODUCT => product *= number,
            Function::DMAX => {
                extreme = Some(extreme.map_or(*number, |previous| previous.max(*number)))
            }
            Function::DMIN => {
                extreme = Some(extreme.map_or(*number, |previous| previous.min(*number)))
            }
            Function::DSTDEV | Function::DSTDEVP | Function::DVAR | Function::DVARP => {
                let delta = number - mean;
                mean += delta / count as f64;
                squared_deviations += delta * (number - mean);
            }
            // Counted and returned above.
            Function::DCOUNT | Function::DCOUNTA | Function::DGET => {}
        }
    }
    let result = match function {
        Function::DGET => {
            return single.map_or(Value::Error(FormulaError::Value), |value| {
                if matches!(value, Value::Blank) {
                    Value::number(0.0)
                } else {
                    value
                }
            })
        }
        Function::DCOUNT | Function::DCOUNTA => count as f64,
        Function::DSUM => total,
        Function::DAVERAGE if count != 0 => total / count as f64,
        Function::DAVERAGE => return Value::Error(FormulaError::DivZero),
        Function::DMAX | Function::DMIN => extreme.unwrap_or_default(),
        Function::DPRODUCT => {
            if count == 0 {
                0.0
            } else {
                product
            }
        }
        Function::DSTDEV | Function::DSTDEVP | Function::DVAR | Function::DVARP => {
            let sample = matches!(function, Function::DSTDEV | Function::DVAR);
            if count <= usize::from(sample) {
                return Value::Error(FormulaError::DivZero);
            }
            if !squared_deviations.is_finite() {
                return Value::Error(FormulaError::Num);
            }
            let variance = squared_deviations.max(0.0) / (count - usize::from(sample)) as f64;
            if matches!(function, Function::DSTDEV | Function::DSTDEVP) {
                variance.sqrt()
            } else {
                variance
            }
        }
    };
    if result.is_finite() {
        Value::number(result)
    } else {
        Value::Error(FormulaError::Num)
    }
}
