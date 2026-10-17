//! Database functions keep header rows and criteria rows intact.

use std::collections::{HashMap, HashSet};

use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{AbsCellKey, FormulaError, Value};

use super::super::criteria::Criterion;
use super::super::matrix::EvalMatrix;
use super::super::value::compare_text_case_insensitive;
use super::super::EvalResult;

pub(crate) const NAMES: &[&str] = &[
    "DAVERAGE", "DCOUNT", "DCOUNTA", "DGET", "DMAX", "DMIN", "DPRODUCT", "DSTDEV", "DSTDEVP",
    "DSUM", "DVAR", "DVARP",
];

const ARGUMENT_COUNT: usize = 3;
type CriteriaRows = Vec<Vec<(usize, Criterion)>>;

pub(crate) fn evaluate_ast(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> EvalResult {
    if args.len() != ARGUMENT_COUNT {
        return Value::Error(FormulaError::Value);
    }
    let database = match store.eval_matrix_arg(&args[0], sheet, affected, memo, visiting, depth + 1)
    {
        Ok(matrix) => matrix,
        Err(error) => return Value::Error(error),
    };
    let field = store.eval_ast(&args[1], sheet, affected, memo, visiting, depth + 1);
    let column = if matches!(name, "DCOUNT" | "DCOUNTA")
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
    let criteria = match store.eval_matrix_arg(&args[2], sheet, affected, memo, visiting, depth + 1)
    {
        Ok(matrix) => matrix,
        Err(error) => return Value::Error(error),
    };
    let rows = match compile_criteria(&database, &criteria) {
        Ok(rows) => rows,
        Err(error) => return Value::Error(error),
    };
    aggregate(name, &database, column, &rows)
}

fn field_column(headers: &[Value], field: &Value) -> Result<usize, FormulaError> {
    match field {
        Value::Number(number) if number.is_finite() && number.fract() == 0.0
            && *number >= 1.0 && *number <= headers.len() as f64 => Ok(*number as usize - 1),
        Value::Text(label) => headers.iter().position(|header| {
            matches!(header, Value::Text(text) if compare_text_case_insensitive(text, label).is_eq())
        }).ok_or(FormulaError::Value),
        Value::Error(error) => Err(*error),
        _ => Err(FormulaError::Value),
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
            let database_column = match columns[column] {
                Some(database_column) => database_column,
                None => {
                    let database_column = field_column(headers, &criteria.values[column])?;
                    columns[column] = Some(database_column);
                    database_column
                }
            };
            conditions.push((database_column, database_criterion(value)));
        }
        rows.push(conditions);
    }
    Ok(rows)
}

fn database_criterion(value: &Value) -> Criterion {
    if let Value::Text(text) = value {
        let raw = text.trim();
        // Unlike COUNTIF, plain database text criteria are prefixes.
        if !raw.starts_with(['=', '<', '>'])
            && !raw.contains(['*', '?', '~'])
            && raw.parse::<f64>().is_err()
            && !raw.eq_ignore_ascii_case("TRUE")
            && !raw.eq_ignore_ascii_case("FALSE")
        {
            return Criterion::parse(Value::text(format!("{raw}*")));
        }
    }
    Criterion::parse(value.clone())
}

fn aggregate(
    name: &str,
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
        let Some(column) = column else {
            count += 1;
            continue;
        };
        let value = &record[column];
        match name {
            "DGET" => {
                if single.is_some() {
                    return Value::Error(FormulaError::Num);
                }
                single = Some(value.clone());
                continue;
            }
            "DCOUNTA" => {
                if !matches!(value, Value::Blank) {
                    count += 1;
                }
                continue;
            }
            "DCOUNT" => {
                if matches!(value, Value::Number(_)) {
                    count += 1;
                }
                continue;
            }
            _ => {}
        }
        if let Value::Error(error) = value {
            return Value::Error(*error);
        }
        let Value::Number(number) = value else {
            continue;
        };
        count += 1;
        match name {
            "DSUM" | "DAVERAGE" => total += number,
            "DPRODUCT" => product *= number,
            "DMAX" => extreme = Some(extreme.map_or(*number, |previous| previous.max(*number))),
            "DMIN" => extreme = Some(extreme.map_or(*number, |previous| previous.min(*number))),
            "DSTDEV" | "DSTDEVP" | "DVAR" | "DVARP" => {
                let delta = number - mean;
                mean += delta / count as f64;
                squared_deviations += delta * (number - mean);
            }
            _ => return Value::Error(FormulaError::Name),
        }
    }
    let result = match name {
        "DGET" => {
            return single.map_or(Value::Error(FormulaError::Value), |value| {
                if matches!(value, Value::Blank) {
                    Value::number(0.0)
                } else {
                    value
                }
            })
        }
        "DCOUNT" | "DCOUNTA" => count as f64,
        "DSUM" => total,
        "DAVERAGE" if count != 0 => total / count as f64,
        "DAVERAGE" => return Value::Error(FormulaError::DivZero),
        "DMAX" | "DMIN" => extreme.unwrap_or(0.0),
        "DPRODUCT" => {
            if count == 0 {
                0.0
            } else {
                product
            }
        }
        "DSTDEV" | "DSTDEVP" | "DVAR" | "DVARP" => {
            let sample = matches!(name, "DSTDEV" | "DVAR");
            if count <= usize::from(sample) {
                return Value::Error(FormulaError::DivZero);
            }
            if !squared_deviations.is_finite() {
                return Value::Error(FormulaError::Num);
            }
            let variance = squared_deviations.max(0.0) / (count - usize::from(sample)) as f64;
            if matches!(name, "DSTDEV" | "DSTDEVP") {
                variance.sqrt()
            } else {
                variance
            }
        }
        _ => return Value::Error(FormulaError::Name),
    };
    if result.is_finite() {
        Value::number(result)
    } else {
        Value::Error(FormulaError::Num)
    }
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    fn orchard() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(12, 40);
        for (column, header) in ["Tree", "Height", "Age", "Yield", "Profit"]
            .iter()
            .enumerate()
        {
            store.set_string(sheet, 3, column, header, 0);
            store.set_string(sheet, 0, column, header, 0);
        }
        store.set_string(sheet, 0, 5, "Height", 0);
        store.set_string(sheet, 1, 0, "=Apple", 0);
        store.set_string(sheet, 1, 1, ">10", 0);
        store.set_string(sheet, 1, 2, "<16", 0);
        store.set_string(sheet, 1, 5, "<16", 0);
        store.set_string(sheet, 2, 0, "=Pear", 0);
        let records = [
            ("Apple", [18.0, 20.0, 14.0, 105.0]),
            ("Pear", [12.0, 12.0, 10.0, 96.0]),
            ("Cherry", [13.0, 14.0, 9.0, 105.0]),
            ("Apple", [14.0, 15.0, 10.0, 75.0]),
            ("Pear", [9.0, 8.0, 8.0, 77.0]),
            ("Apple", [8.0, 9.0, 6.0, 45.0]),
        ];
        for (index, (tree, numbers)) in records.iter().enumerate() {
            store.set_string(sheet, index + 4, 0, tree, 0);
            for (column, number) in numbers.iter().enumerate() {
                store.set_number(sheet, index + 4, column + 1, *number, 0);
            }
        }
        (store, sheet)
    }

    #[test]
    fn microsoft_orchard_examples_use_headers_and_boolean_criteria() {
        // https://support.microsoft.com/en-us/excel/functions/daverage-function
        // https://support.microsoft.com/en-us/excel/functions/dsum-function
        // https://support.microsoft.com/en-us/excel/functions/dproduct-function
        // https://support.microsoft.com/en-us/excel/functions/dvar-function
        // https://support.microsoft.com/en-us/excel/functions/dvarp-function
        // https://support.microsoft.com/en-us/excel/functions/dstdev-function
        // https://support.microsoft.com/en-us/excel/functions/dstdevp-function
        // https://support.microsoft.com/en-us/excel/functions/dmax-function
        // https://support.microsoft.com/en-us/excel/functions/dmin-function
        let (mut store, sheet) = orchard();
        let cases = [
            ("=DAVERAGE(A4:E10,\"Yield\",A1:B2)", 12.0, 1e-12),
            ("=DAVERAGE(A4:E10,3,A4:E10)", 13.0, 1e-12),
            ("=DSUM(A4:E10,\"Profit\",A1:A2)", 225.0, 1e-12),
            ("=DSUM(A4:E10,\"Profit\",A1:F3)", 248.0, 1e-12),
            ("=DPRODUCT(A4:E10,\"Yield\",A1:F3)", 800.0, 1e-12),
            ("=DMAX(A4:E10,\"Profit\",A1:F3)", 96.0, 1e-12),
            ("=DMIN(A4:E10,\"Profit\",A1:F3)", 75.0, 1e-12),
            ("=DVAR(A4:E10,\"Yield\",A1:A3)", 8.8, 1e-12),
            ("=DVARP(A4:E10,\"Yield\",A1:A3)", 7.04, 1e-12),
            ("=DSTDEV(A4:E10,\"Yield\",A1:A3)", 2.96648, 1e-5),
            ("=DSTDEVP(A4:E10,\"Yield\",A1:A3)", 2.6533, 1e-4),
            // https://support.microsoft.com/en-us/excel/functions/dcounta-function
            ("=DCOUNTA(A4:E10,\"Profit\",A1:F2)", 1.0, 1e-12),
        ];
        for (row, (formula, _, _)) in cases.iter().enumerate() {
            store.set_formula(sheet, row, 8, formula, 0);
        }
        store.recompute(sheet);
        for (row, (formula, expected, tolerance)) in cases.iter().enumerate() {
            let cell = store.get_cell(sheet, row, 8);
            assert!(cell.string().is_none(), "{formula}: {:?}", cell.string());
            assert!(
                (cell.num() - expected).abs() < *tolerance,
                "{formula}: {}",
                cell.num()
            );
        }
    }

    #[test]
    fn microsoft_count_examples_distinguish_numeric_and_nonempty_fields() {
        // https://support.microsoft.com/en-us/excel/functions/dcount-function
        // https://support.microsoft.com/en-us/excel/functions/dcounta-function
        let (mut store, sheet) = orchard();
        // Filter height, not age, so the count functions can distinguish text ages.
        store.set_string(sheet, 1, 2, "", 0);
        store.set_string(sheet, 7, 2, "N/A", 0);
        store.set_number(sheet, 9, 1, 12.0, 0);
        store.set_number(sheet, 9, 2, 11.0, 0);
        for (row, formula) in [
            "=DCOUNT(A4:E10,\"Age\",A1:F2)",
            "=DCOUNTA(A4:E10,\"Age\",A1:F2)",
            "=DCOUNT(A4:E10,,A1:F2)",
            "=DCOUNTA(A4:E10,\"\",A1:F2)",
        ]
        .iter()
        .enumerate()
        {
            store.set_formula(sheet, row, 8, formula, 0);
        }
        store.recompute(sheet);
        for (row, expected) in [1.0, 2.0, 2.0, 2.0].iter().enumerate() {
            assert_eq!(store.get_cell(sheet, row, 8).num(), *expected);
        }
    }

    #[test]
    fn documented_get_errors_and_invalid_arguments_reach_the_consumer() {
        // https://support.microsoft.com/en-us/excel/functions/dget-function
        let (mut store, sheet) = orchard();
        store.set_string(sheet, 2, 1, ">12", 0);
        store.set_string(sheet, 12, 0, "Tree", 0);
        store.set_string(sheet, 13, 0, "=Absent", 0);
        let cases = [
            ("=DGET(A4:E10,\"Yield\",A1:F3)", None),
            ("=DGET(A4:E10,\"Yield\",A1:A3)", Some("#NUM!")),
            ("=DGET(A4:E10,\"Yield\",A13:A14)", Some("#VALUE!")),
            ("=DSUM(A4:E10,0,A1:A2)", Some("#VALUE!")),
            ("=DSUM(A4:E10,6,A1:A2)", Some("#VALUE!")),
            ("=DSUM(A4:E10,1.5,A1:A2)", Some("#VALUE!")),
            ("=DSUM(A4:E10,\"Unknown\",A1:A2)", Some("#VALUE!")),
            ("=DSUM(A4:E10,1,A1:A1)", Some("#VALUE!")),
            ("=DAVERAGE(A4:E10,4,A13:A14)", Some("#DIV/0!")),
            ("=DVAR(A4:E10,4,A1:F3)", Some("#DIV/0!")),
            ("=DSTDEV(A4:E10,4,A1:F3)", Some("#DIV/0!")),
            ("=DVARP(A4:E10,4,A13:A14)", Some("#DIV/0!")),
            ("=DSTDEVP(A4:E10,4,A13:A14)", Some("#DIV/0!")),
            ("=DSUM(A4:E10,4)", Some("#VALUE!")),
        ];
        for (row, (formula, _)) in cases.iter().enumerate() {
            store.set_formula(sheet, row + 16, 8, formula, 0);
        }
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 16, 8).num(), 10.0);
        for (row, (formula, expected)) in cases.iter().enumerate().skip(1) {
            assert_eq!(
                store.get_cell(sheet, row + 16, 8).string().as_deref(),
                *expected,
                "{formula}"
            );
        }
    }

    #[test]
    fn criteria_prefixes_wildcards_escapes_and_blank_rows_filter_records() {
        // Microsoft documents prefix text, *, ?, ~, and blank criteria rows here:
        // https://support.microsoft.com/en-us/excel/functions/daverage-function
        let mut store = CellStore::new();
        let sheet = store.add_sheet(10, 20);
        store.set_string(sheet, 0, 0, "Name", 0);
        store.set_string(sheet, 0, 1, "Amount", 0);
        for (row, name) in ["Apple", "APPLE PIE", "A*", "A?", "A~", "Pear"]
            .iter()
            .enumerate()
        {
            store.set_string(sheet, row + 1, 0, name, 0);
            store.set_number(sheet, row + 1, 1, (row + 1) as f64, 0);
        }
        let cases = [
            ("App", 3.0),
            ("=apple", 1.0),
            ("=A?", 12.0),
            ("=A~*", 3.0),
            ("=A~?", 4.0),
            ("=A~~", 5.0),
            ("<>Pear", 15.0),
            (">=Pear", 6.0),
            ("", 21.0),
        ];
        for (column, (criterion, _)) in cases.iter().enumerate() {
            store.set_string(sheet, 9, column, "nAmE", 0);
            store.set_string(sheet, 10, column, criterion, 0);
            let letter = (b'A' + column as u8) as char;
            store.set_formula(
                sheet,
                column,
                9,
                &format!("=DSUM(A1:B7,\"amount\",{letter}10:{letter}11)"),
                0,
            );
        }
        store.recompute(sheet);
        for (row, (_, expected)) in cases.iter().enumerate() {
            assert_eq!(store.get_cell(sheet, row, 9).num(), *expected);
        }
    }

    #[test]
    fn selected_errors_empty_fields_and_text_values_keep_database_semantics() {
        let (mut store, sheet) = orchard();
        store.set_string(sheet, 12, 0, "Tree", 0);
        store.set_string(sheet, 13, 0, "=Cherry", 0);
        store.set_formula(sheet, 6, 3, "=1/0", 0);
        store.set_string(sheet, 14, 0, "Tree", 0);
        store.set_string(sheet, 15, 0, "=Absent", 0);
        store.set_string(sheet, 3, 5, "Optional", 0);
        let cases = [
            ("=DSUM(A4:E10,4,A1:A2)", Some(30.0), None),
            ("=DSUM(A4:E10,4,A13:A14)", None, Some("#DIV/0!")),
            ("=DGET(A4:E10,4,A13:A14)", None, Some("#DIV/0!")),
            ("=DCOUNT(A4:E10,4,A13:A14)", Some(0.0), None),
            ("=DCOUNTA(A4:E10,4,A13:A14)", Some(1.0), None),
            ("=DGET(A4:E10,1,A13:A14)", None, Some("Cherry")),
            ("=DSUM(A4:E10,4,A15:A16)", Some(0.0), None),
            ("=DMAX(A4:E10,4,A15:A16)", Some(0.0), None),
            ("=DMIN(A4:E10,4,A15:A16)", Some(0.0), None),
            ("=DPRODUCT(A4:E10,4,A15:A16)", Some(0.0), None),
            ("=DGET(A4:F10,6,A13:A14)", Some(0.0), None),
            ("=DCOUNTA(A4:F10,6,A13:A14)", Some(0.0), None),
            ("=DSUM(A4:E10,1,A13:A14)", Some(0.0), None),
            ("=DVAR(A4:E10,1,A13:A14)", None, Some("#DIV/0!")),
        ];
        for (row, (formula, _, _)) in cases.iter().enumerate() {
            store.set_formula(sheet, row + 18, 8, formula, 0);
        }
        store.recompute(sheet);
        for (row, (formula, number, text)) in cases.iter().enumerate() {
            let cell = store.get_cell(sheet, row + 18, 8);
            if let Some(number) = number {
                assert_eq!(cell.num(), *number, "{formula}");
            } else {
                assert_eq!(cell.string().as_deref(), *text, "{formula}");
            }
        }
    }
}
