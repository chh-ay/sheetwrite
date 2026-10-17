//! Bounded grouping and pivot aggregation for the full engine.
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use super::super::matrix::{optional_ast, EvalMatrix, SPILL_MAX_RECOMPUTE_CELLS};
use super::super::value::{bool_from_value, compare_values, number_from_value};
use crate::calc::{parse, Ast, Func};
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &["GROUPBY", "PERCENTOF", "PIVOTBY"];
const AGGREGATORS: &[&str] = &[
    "ARRAYTOTEXT",
    "AVERAGE",
    "CONCAT",
    "COUNT",
    "COUNTA",
    "MAX",
    "MEDIAN",
    "MIN",
    "PERCENTOF",
    "PRODUCT",
    "STDEV.P",
    "STDEV.S",
    "SUM",
    "VAR.P",
    "VAR.S",
];

struct Context<'a> {
    store: &'a CellStore,
    sheet: usize,
    affected: &'a HashSet<AbsCellKey>,
    memo: &'a mut HashMap<AbsCellKey, EvalResult>,
    visiting: &'a mut HashSet<AbsCellKey>,
    depth: usize,
    work: usize,
    sums: HashMap<(usize, usize, usize), Value>,
}
impl Context<'_> {
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
        if !super::super::array::ast_produces_array(expression) {
            self.charge(1)?;
            return Ok(EvalMatrix::new(1, 1, vec![self.scalar(expression)]));
        }
        let matrix = self.store.eval_matrix_arg(
            expression,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth + 1,
        )?;
        self.charge(matrix.values.len())?;
        Ok(matrix)
    }
    fn charge(&mut self, work: usize) -> Result<(), FormulaError> {
        self.work = self.work.checked_add(work).ok_or(FormulaError::Num)?;
        if self.work > SPILL_MAX_RECOMPUTE_CELLS {
            return Err(FormulaError::Num);
        }
        Ok(())
    }
    fn sum_rows(
        &mut self,
        values: &EvalMatrix,
        rows: &[usize],
        column: usize,
    ) -> Result<Value, FormulaError> {
        // These slices belong to stable group vectors for this evaluation.
        let key = (rows.as_ptr() as usize, rows.len(), column);
        if let Some(sum) = self.sums.get(&key) {
            return Ok(sum.clone());
        }
        self.charge(rows.len())?;
        let mut total = 0.0;
        for &row in rows {
            match &values.values[row * values.cols + column] {
                Value::Number(number) => total += number,
                Value::Error(error) => {
                    let result = Value::Error(*error);
                    self.sums.insert(key, result.clone());
                    return Ok(result);
                }
                _ => {}
            }
        }
        let sum = Value::number(total);
        self.sums.insert(key, sum.clone());
        Ok(sum)
    }
    fn option(
        &mut self,
        arguments: &[Ast],
        index: usize,
        default: i32,
    ) -> Result<i32, FormulaError> {
        let Some(expression) = optional_ast(arguments, index) else {
            return Ok(default);
        };
        let number = number_from_value(&self.scalar(expression))?;
        if number.fract() != 0.0 || number < i32::MIN as f64 || number > i32::MAX as f64 {
            return Err(FormulaError::Value);
        }
        Ok(number as i32)
    }
}

#[derive(Clone, Hash, PartialEq, Eq)]
enum KeyPart {
    Zero,
    Number(u64),
    Text(String),
    Bool(bool),
}
fn key_part(value: &Value) -> Result<KeyPart, FormulaError> {
    Ok(match value {
        // Blank compares equal to each of these values. Keep them in one bucket,
        // then use compare_values to separate unequal nonblank keys.
        Value::Blank | Value::Bool(false) => KeyPart::Zero,
        Value::Number(number) if *number == 0.0 => KeyPart::Zero,
        Value::Number(number) if number.is_finite() => KeyPart::Number(number.to_bits()),
        Value::Number(_) => return Err(FormulaError::Num),
        Value::Text(text) if text.is_empty() => KeyPart::Zero,
        Value::Text(text) => KeyPart::Text(text.to_lowercase()),
        Value::Bool(boolean) => KeyPart::Bool(*boolean),
        Value::Error(error) => return Err(*error),
    })
}
struct Group {
    fields: Vec<Value>,
    rows: Vec<usize>,
    parent: Option<usize>,
}
struct Axis {
    groups: Vec<Group>,
    memberships: Vec<usize>,
    order: Vec<usize>,
    grand: usize,
    width: usize,
}
fn compare_fields(left: &[Value], right: &[Value]) -> Ordering {
    for (left_value, right_value) in left.iter().zip(right) {
        let order =
            compare_values(left_value, right_value).expect("group keys are checked before sorting");
        if order != Ordering::Equal {
            return order;
        }
    }
    Ordering::Equal
}
impl Axis {
    fn build(
        context: &mut Context<'_>,
        fields: &EvalMatrix,
        included: &[usize],
        total_depth: i32,
    ) -> Result<Self, FormulaError> {
        if total_depth.unsigned_abs() > fields.cols as u32 {
            return Err(FormulaError::Value);
        }
        let mut groups = vec![Group {
            fields: Vec::new(),
            rows: Vec::new(),
            parent: None,
        }];
        let mut buckets: HashMap<Vec<KeyPart>, Vec<usize>> = HashMap::new();
        // Every included row belongs to the root and one group per prefix.
        let membership_width = fields.cols + 1;
        let mut memberships = vec![
            0;
            fields
                .rows
                .checked_mul(membership_width)
                .ok_or(FormulaError::Num)?
        ];
        // Reuse the lookup key; only a new bucket needs an owned copy.
        let mut key = Vec::with_capacity(fields.cols);
        for &row in included {
            groups[0].rows.push(row);
            key.clear();
            let mut parent = 0;
            for width in 1..=fields.cols {
                let values = &fields.values[row * fields.cols..row * fields.cols + width];
                let text_work = values.iter().try_fold(0usize, |work, value| {
                    work.checked_add(if let Value::Text(text) = value {
                        text.len()
                    } else {
                        0
                    })
                    .ok_or(FormulaError::Num)
                })?;
                context.charge(width.checked_add(text_work).ok_or(FormulaError::Num)?)?;
                key.push(key_part(&values[width - 1])?);
                let mut found = None;
                if let Some(bucket) = buckets.get(&key) {
                    for &group in bucket {
                        context.charge(width)?;
                        if compare_fields(&groups[group].fields, values) == Ordering::Equal {
                            found = Some(group);
                            break;
                        }
                    }
                }
                let group = found.unwrap_or_else(|| {
                    let index = groups.len();
                    groups.push(Group {
                        fields: values.to_vec(),
                        rows: Vec::new(),
                        parent: Some(parent),
                    });
                    buckets.entry(key.clone()).or_default().push(index);
                    index
                });
                groups[group].rows.push(row);
                memberships[row * membership_width + width] = group;
                parent = group;
            }
        }
        let depth = total_depth.unsigned_abs() as usize;
        let order = (0..groups.len())
            .filter(|&index| {
                let width = groups[index].fields.len();
                width == fields.cols
                    || (depth > 0 && width == 0)
                    || (depth > 1 && width > 0 && width < depth)
            })
            .collect();
        Ok(Self {
            groups,
            memberships,
            order,
            grand: 0,
            width: fields.cols,
        })
    }
    fn memberships(&self, row: usize) -> &[usize] {
        let width = self.width + 1;
        &self.memberships[row * width..(row + 1) * width]
    }
    fn ancestor(&self, mut group: usize, width: usize) -> usize {
        while self.groups[group].fields.len() > width {
            group = self.groups[group]
                .parent
                .expect("nonroot group has a parent");
        }
        group
    }
    fn sort(
        &mut self,
        context: &mut Context<'_>,
        sort: &[i32],
        totals_top: bool,
        hierarchy: bool,
        aggregates: &[Vec<Value>],
    ) -> Result<(), FormulaError> {
        let count = self.order.len();
        let comparisons = count
            .checked_mul(count.max(1).ilog2() as usize)
            .and_then(|work| work.checked_mul(self.width.max(sort.len())))
            .and_then(|work| work.checked_mul(if hierarchy { self.width } else { 1 }))
            .ok_or(FormulaError::Num)?;
        context.charge(comparisons)?;
        for &code in sort {
            if code.unsigned_abs() as usize > self.width {
                let column = code.unsigned_abs() as usize - self.width - 1;
                for aggregate in aggregates {
                    compare_values(&aggregate[column], &aggregate[column])?;
                }
            }
        }
        let positions = super::sorted_positions(self.order.len(), &mut |left, right| {
            let left_index = self.order[left];
            let right_index = self.order[right];
            let left_fields = &self.groups[left_index].fields;
            let right_fields = &self.groups[right_index].fields;
            if left_fields.is_empty() || right_fields.is_empty() {
                return if totals_top {
                    left_fields.len().cmp(&right_fields.len())
                } else {
                    right_fields.len().cmp(&left_fields.len())
                };
            }
            if hierarchy {
                let common = left_fields.len().min(right_fields.len());
                for field in 0..common {
                    let direction = sort
                        .iter()
                        .find(|code| code.unsigned_abs() as usize == field + 1)
                        .copied()
                        .unwrap_or(1);
                    let order = compare_values(&left_fields[field], &right_fields[field])
                        .expect("checked group key");
                    if order != Ordering::Equal {
                        // Compare each sibling's full aggregate, not the value
                        // of whichever descendant the sort happens to visit.
                        if sort.len() == 1 && sort[0].unsigned_abs() as usize > self.width {
                            let column = sort[0].unsigned_abs() as usize - self.width - 1;
                            let left_ancestor = self.ancestor(left_index, field + 1);
                            let right_ancestor = self.ancestor(right_index, field + 1);
                            let value_order = compare_values(
                                &aggregates[left_ancestor][column],
                                &aggregates[right_ancestor][column],
                            )
                            .expect("sort values are checked");
                            if value_order != Ordering::Equal {
                                return if sort[0] < 0 {
                                    value_order.reverse()
                                } else {
                                    value_order
                                };
                            }
                        }
                        return if direction < 0 {
                            order.reverse()
                        } else {
                            order
                        };
                    }
                }
                return if totals_top {
                    left_fields.len().cmp(&right_fields.len())
                } else {
                    right_fields.len().cmp(&left_fields.len())
                };
            }
            for &code in sort {
                let column = code.unsigned_abs() as usize - 1;
                let (left_value, right_value) = if column < self.width {
                    (&left_fields[column], &right_fields[column])
                } else {
                    (
                        &aggregates[left_index][column - self.width],
                        &aggregates[right_index][column - self.width],
                    )
                };
                let order =
                    compare_values(left_value, right_value).expect("sort values are checked");
                if order != Ordering::Equal {
                    return if code < 0 { order.reverse() } else { order };
                }
            }
            Ordering::Equal
        });
        self.order = positions
            .into_iter()
            .map(|position| self.order[position])
            .collect();
        Ok(())
    }
}

struct Aggregator {
    function: Ast,
    arity: usize,
    label: String,
}
impl Aggregator {
    fn resolve(mut expression: &Ast) -> Result<Self, FormulaError> {
        while let Ast::LetSlot {
            expression: inner, ..
        } = expression
        {
            expression = inner;
        }
        if let Ast::Name(name) = expression {
            let label = name.to_ascii_uppercase();
            if !AGGREGATORS.contains(&label.as_str()) {
                return Err(FormulaError::Value);
            }
            let function = parse(&format!("={label}(0)")).map_err(|_| FormulaError::Value)?;
            return Ok(Self {
                arity: if label == "PERCENTOF" { 2 } else { 1 },
                function,
                label,
            });
        }
        if let Ast::Func(Func::Analysis(super::LAMBDA_ID), _) = expression {
            let arity = super::lambda::parameter_count(expression)?;
            if !(1..=2).contains(&arity) {
                return Err(FormulaError::Value);
            }
            return Ok(Self {
                function: expression.clone(),
                arity,
                label: "Lambda".into(),
            });
        }
        Err(FormulaError::Value)
    }
    fn aggregate(
        &self,
        context: &mut Context<'_>,
        values: &EvalMatrix,
        rows: &[usize],
        total_rows: &[usize],
        column: usize,
    ) -> Result<Value, FormulaError> {
        if self.label == "SUM" {
            return context.sum_rows(values, rows, column);
        }
        if self.label == "PERCENTOF" {
            let subset = context.sum_rows(values, rows, column)?;
            let total = context.sum_rows(values, total_rows, column)?;
            return Ok(
                match (number_from_value(&subset), number_from_value(&total)) {
                    (Err(error), _) | (_, Err(error)) => Value::Error(error),
                    (_, Ok(0.0)) => Value::Error(FormulaError::DivZero),
                    (Ok(subset), Ok(total)) => Value::number(subset / total),
                },
            );
        }
        let source = |indices: &[usize]| Ast::BoundMatrix {
            rows: indices.len().max(1),
            cols: 1,
            values: Rc::new(if indices.is_empty() {
                vec![Value::Blank]
            } else {
                indices
                    .iter()
                    .map(|&row| values.values[row * values.cols + column].clone())
                    .collect()
            }),
        };
        context.charge(rows.len() + if self.arity == 2 { total_rows.len() } else { 0 })?;
        let mut arguments = vec![source(rows)];
        if self.arity == 2 {
            arguments.push(source(total_rows));
        }
        let invocation = if let Ast::Func(Func::Analysis(super::LAMBDA_ID), _) = &self.function {
            arguments.insert(0, self.function.clone());
            Ast::UnknownFunc(super::lambda::CALL.into(), arguments)
        } else if let Ast::Func(function, _) = self.function {
            Ast::Func(function, arguments)
        } else {
            return Err(FormulaError::Value);
        };
        if super::super::array::ast_produces_array(&invocation) {
            let result = context.matrix(&invocation)?;
            if result.values.len() != 1 {
                return Err(FormulaError::Calc);
            }
            Ok(result.into_first())
        } else {
            Ok(context.scalar(&invocation))
        }
    }
}

pub(crate) fn produces_array(name: &str, _: &[Ast]) -> bool {
    name != "PERCENTOF"
}
pub(crate) fn shape(
    _: &CellStore,
    _: &str,
    _: &[Ast],
    _: usize,
) -> Result<(usize, usize, usize), FormulaError> {
    Ok((1, 1, 1))
}
pub(crate) fn bound(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
) -> Result<usize, FormulaError> {
    let is_pivot = name == "PIVOTBY";
    let required = if is_pivot { 4 } else { 3 };
    if arguments.len() < required {
        return Err(FormulaError::Value);
    }
    let extent = |expression: &Ast| -> Result<(usize, usize), FormulaError> {
        if !super::super::array::ast_produces_array(expression) {
            return Ok((1, 1));
        }
        let (rows, cols, cells) = store.matrix_shape(expression, sheet)?;
        let bound = store
            .dynamic_array_bound(expression, sheet)
            .transpose()?
            .unwrap_or(cells);
        Ok(if bound > cells {
            (bound, bound)
        } else {
            (rows, cols)
        })
    };
    let (source_rows, row_width) = extent(&arguments[0])?;
    let (_, value_width) = extent(&arguments[required - 2])?;
    let (column_groups, header_rows) = if is_pivot {
        let (source_rows, column_width) = extent(&arguments[1])?;
        (
            source_rows.saturating_mul(column_width).saturating_add(1),
            column_width.saturating_add(1),
        )
    } else {
        (1, 1)
    };
    let output_rows = source_rows
        .saturating_mul(row_width)
        .saturating_add(1)
        .saturating_add(header_rows);
    let output_cols = row_width.saturating_add(column_groups.saturating_mul(value_width));
    Ok(output_rows
        .saturating_mul(output_cols)
        .min(super::super::matrix::SPILL_MAX_CELLS))
}

pub(crate) fn evaluate_ast(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> EvalResult {
    if name != "PERCENTOF" || arguments.len() != 2 {
        return Value::Error(FormulaError::Value);
    }
    let sum = |expression: &Ast,
               memo: &mut HashMap<AbsCellKey, EvalResult>,
               visiting: &mut HashSet<AbsCellKey>| {
        store.eval_ast(
            &Ast::Func(Func::Sum, vec![expression.clone()]),
            sheet,
            affected,
            memo,
            visiting,
            depth + 1,
        )
    };
    let subset = match number_from_value(&sum(&arguments[0], memo, visiting)) {
        Ok(number) => number,
        Err(error) => return Value::Error(error),
    };
    let total = match number_from_value(&sum(&arguments[1], memo, visiting)) {
        Ok(number) => number,
        Err(error) => return Value::Error(error),
    };
    if total == 0.0 {
        Value::Error(FormulaError::DivZero)
    } else {
        Value::number(subset / total)
    }
}

fn sort_codes(
    context: &mut Context<'_>,
    arguments: &[Ast],
    index: usize,
    fields: usize,
    values: usize,
) -> Result<Vec<i32>, FormulaError> {
    let Some(expression) = optional_ast(arguments, index) else {
        return Ok((1..=fields).map(|column| column as i32).collect());
    };
    let matrix = context.matrix(expression)?;
    if matrix.rows != 1 && matrix.cols != 1 {
        return Err(FormulaError::Value);
    }
    let mut codes = Vec::with_capacity(matrix.values.len());
    for value in &matrix.values {
        let number = number_from_value(value)?;
        if number.fract() != 0.0 || number == 0.0 || number.abs() > (fields + values) as f64 {
            return Err(FormulaError::Value);
        }
        if matrix.values.len() > 1 && number.abs() > fields as f64 {
            return Err(FormulaError::Value);
        }
        codes.push(number as i32);
    }
    Ok(codes)
}

pub(crate) fn evaluate_matrix(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> Result<EvalMatrix, FormulaError> {
    let is_pivot = name == "PIVOTBY";
    let required = if is_pivot { 4 } else { 3 };
    let maximum = if is_pivot { 11 } else { 8 };
    if arguments.len() < required || arguments.len() > maximum {
        return Err(FormulaError::Value);
    }
    let mut context = Context {
        store,
        sheet,
        affected,
        memo,
        visiting,
        depth,
        work: 0,
        sums: HashMap::new(),
    };
    let row_fields = context.matrix(&arguments[0])?;
    let col_fields = if is_pivot {
        Some(context.matrix(&arguments[1])?)
    } else {
        None
    };
    let values = context.matrix(&arguments[required - 2])?;
    if row_fields.rows != values.rows
        || col_fields
            .as_ref()
            .is_some_and(|fields| fields.rows != values.rows)
    {
        return Err(FormulaError::Value);
    }
    let aggregator = Aggregator::resolve(&arguments[required - 1])?;
    let headers = context.option(arguments, required, -1)?;
    if !(-1..=3).contains(&headers) {
        return Err(FormulaError::Value);
    }
    let has_headers = headers == 1
        || headers == 3
        || (headers == -1
            && values.rows > 1
            && matches!(values.values[0], Value::Text(_))
            && matches!(values.values[values.cols], Value::Number(_)));
    let show_headers = headers == 2
        || headers == 3
        || (headers == -1
            && (row_fields.cols > 1 || col_fields.as_ref().is_some_and(|fields| fields.cols > 1)));
    let relationship = if is_pivot {
        0
    } else {
        context.option(arguments, 7, 0)?
    };
    let default_row_total = if relationship == 1 {
        1
    } else {
        row_fields.cols.min(2) as i32
    };
    let row_total = context.option(arguments, required + 1, default_row_total)?;
    let row_sort = sort_codes(
        &mut context,
        arguments,
        required + 2,
        row_fields.cols,
        values.cols,
    )?;
    let col_total = if is_pivot {
        context.option(
            arguments,
            7,
            col_fields.as_ref().ok_or(FormulaError::Value)?.cols.min(2) as i32,
        )?
    } else {
        0
    };
    let col_sort = if is_pivot {
        sort_codes(
            &mut context,
            arguments,
            8,
            col_fields.as_ref().ok_or(FormulaError::Value)?.cols,
            values.cols,
        )?
    } else {
        Vec::new()
    };
    if !(0..=1).contains(&relationship) || (relationship == 1 && row_total.unsigned_abs() > 1) {
        return Err(FormulaError::Value);
    }
    let relative = if is_pivot {
        context.option(arguments, 10, 0)?
    } else {
        2
    };
    if !(0..=4).contains(&relative) {
        return Err(FormulaError::Value);
    }
    let filter_index = if is_pivot { 9 } else { 6 };
    let filter = optional_ast(arguments, filter_index)
        .map(|expression| context.matrix(expression))
        .transpose()?;
    if filter
        .as_ref()
        .is_some_and(|matrix| matrix.rows != values.rows || matrix.cols != 1)
    {
        return Err(FormulaError::Value);
    }
    let mut included = Vec::new();
    for row in usize::from(has_headers)..values.rows {
        if filter
            .as_ref()
            .map(|matrix| bool_from_value(&matrix.values[row]))
            .transpose()?
            .unwrap_or(true)
        {
            included.push(row);
        }
    }
    if included.is_empty() {
        return Err(FormulaError::Calc);
    }
    let mut rows = Axis::build(&mut context, &row_fields, &included, row_total)?;
    let mut columns = if let Some(fields) = &col_fields {
        Some(Axis::build(&mut context, fields, &included, col_total)?)
    } else {
        None
    };
    let header_rows = columns.as_ref().map_or(usize::from(show_headers), |axis| {
        axis.width + usize::from(show_headers)
    });
    let value_columns = columns
        .as_ref()
        .map_or(Some(values.cols), |axis| {
            axis.order.len().checked_mul(values.cols)
        })
        .ok_or(FormulaError::Num)?;
    let output_cols = rows
        .width
        .checked_add(value_columns)
        .ok_or(FormulaError::Num)?;
    let output_rows = header_rows
        .checked_add(rows.order.len())
        .ok_or(FormulaError::Num)?;
    let cells = EvalMatrix::validate_shape(output_rows, output_cols, 1, 0)?;
    context.charge(cells)?;
    let mut row_aggregates = Vec::with_capacity(rows.groups.len());
    for group in &rows.groups {
        let mut aggregated = Vec::with_capacity(values.cols);
        for column in 0..values.cols {
            aggregated.push(aggregator.aggregate(
                &mut context,
                &values,
                &group.rows,
                &included,
                column,
            )?);
        }
        row_aggregates.push(aggregated);
    }
    rows.sort(
        &mut context,
        &row_sort,
        row_total < 0,
        relationship == 0,
        &row_aggregates,
    )?;
    let mut intersections: HashMap<(usize, usize), Vec<usize>> = HashMap::new();
    if let Some(columns) = &mut columns {
        let mut col_aggregates = Vec::with_capacity(columns.groups.len());
        for group in &columns.groups {
            let mut aggregated = Vec::with_capacity(values.cols);
            for column in 0..values.cols {
                aggregated.push(aggregator.aggregate(
                    &mut context,
                    &values,
                    &group.rows,
                    &included,
                    column,
                )?);
            }
            col_aggregates.push(aggregated);
        }
        columns.sort(
            &mut context,
            &col_sort,
            col_total < 0,
            true,
            &col_aggregates,
        )?;
        for &row in &included {
            for &row_group in rows.memberships(row) {
                for &col_group in columns.memberships(row) {
                    context.charge(1)?;
                    intersections
                        .entry((row_group, col_group))
                        .or_default()
                        .push(row);
                }
            }
        }
    }
    let mut output = vec![Value::Blank; cells];
    if show_headers {
        for (column, header) in output.iter_mut().take(rows.width).enumerate() {
            *header = if has_headers {
                row_fields.values[column].clone()
            } else {
                Value::text(format!("Row field {}", column + 1))
            };
        }
    }
    if let Some(columns) = &columns {
        for (position, &group) in columns.order.iter().enumerate() {
            for field in 0..columns.width {
                let label = columns.groups[group]
                    .fields
                    .get(field)
                    .cloned()
                    .unwrap_or_else(|| {
                        if field == columns.groups[group].fields.len() {
                            Value::text("Total")
                        } else {
                            Value::Blank
                        }
                    });
                for column in 0..values.cols {
                    output[field * output_cols + rows.width + position * values.cols + column] =
                        label.clone();
                }
            }
            if show_headers {
                for column in 0..values.cols {
                    output[columns.width * output_cols
                        + rows.width
                        + position * values.cols
                        + column] = if has_headers {
                        values.values[column].clone()
                    } else {
                        Value::text(aggregator.label.as_str())
                    };
                }
            }
        }
    } else if show_headers {
        for column in 0..values.cols {
            output[rows.width + column] = if has_headers {
                values.values[column].clone()
            } else {
                Value::text(aggregator.label.as_str())
            };
        }
    }
    for (position, &row_group) in rows.order.iter().enumerate() {
        let offset = (position + header_rows) * output_cols;
        let group = &rows.groups[row_group];
        for field in 0..rows.width {
            output[offset + field] = group.fields.get(field).cloned().unwrap_or_else(|| {
                if field == group.fields.len() {
                    Value::text("Total")
                } else {
                    Value::Blank
                }
            });
        }
        if let Some(columns) = &columns {
            for (col_position, &col_group) in columns.order.iter().enumerate() {
                let subset = intersections
                    .get(&(row_group, col_group))
                    .map_or(&[][..], Vec::as_slice);
                let denominator = match relative {
                    0 => (rows.grand, col_group),
                    1 => (row_group, columns.grand),
                    2 => (rows.grand, columns.grand),
                    3 => (
                        row_group,
                        columns.groups[col_group].parent.unwrap_or(columns.grand),
                    ),
                    4 => (
                        rows.groups[row_group].parent.unwrap_or(rows.grand),
                        col_group,
                    ),
                    _ => unreachable!(),
                };
                let total_rows = intersections
                    .get(&denominator)
                    .map_or(&[][..], Vec::as_slice);
                for column in 0..values.cols {
                    output[offset + rows.width + col_position * values.cols + column] =
                        aggregator.aggregate(&mut context, &values, subset, total_rows, column)?;
                }
            }
        } else {
            for column in 0..values.cols {
                output[offset + rows.width + column] = row_aggregates[row_group][column].clone();
            }
        }
    }
    let matrix = EvalMatrix::new(output_rows, output_cols, output);
    matrix.validate_bytes()?;
    Ok(matrix)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn calculate(formula: &str) -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(64, 32);
        // Sales by product and year, as in the Microsoft summary examples.
        // https://support.microsoft.com/en-us/excel/functions/groupby-function
        // https://support.microsoft.com/en-us/excel/functions/pivotby-function
        for (row, (product, year, sales)) in [
            ("Pear", 2024.0, 10.0),
            ("Apple", 2023.0, 20.0),
            ("pear", 2023.0, 30.0),
            ("Apple", 2024.0, 40.0),
        ]
        .into_iter()
        .enumerate()
        {
            store.set_string(sheet, row, 0, product, 0);
            store.set_number(sheet, row, 1, year, 0);
            store.set_number(sheet, row, 2, sales, 0);
            store.set_number(sheet, row, 3, if row < 2 { 1.0 } else { 0.0 }, 0);
        }
        store.set_formula(sheet, 8, 8, formula, 0);
        store.recompute(sheet);
        (store, sheet)
    }

    #[test]
    fn sales_by_product_year_and_value_order() {
        for (formula, expected) in [
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,1)", vec![60.0, 40.0, 100.0]),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,0,-2)", vec![60.0, 40.0]),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,-1)", vec![100.0, 60.0, 40.0]),
            (
                "=GROUPBY(A1:A4,C1:C4,LAMBDA(subset,SUM(subset)),0,0)",
                vec![60.0, 40.0],
            ),
            (
                "=LET(aggregate,LAMBDA(subset,SUM(subset)),GROUPBY(A1:A4,C1:C4,aggregate,0,0))",
                vec![60.0, 40.0],
            ),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,0,,D1:D4)", vec![20.0, 10.0]),
        ] {
            let (store, sheet) = calculate(formula);
            for (row, expected) in expected.into_iter().enumerate() {
                assert_eq!(
                    store.get_cell(sheet, 8 + row, 9).string(),
                    None,
                    "{formula}"
                );
                assert_eq!(
                    store.get_cell(sheet, 8 + row, 9).num(),
                    expected,
                    "{formula}"
                );
            }
        }
    }

    #[test]
    fn sales_pivot_and_percent_of_column() {
        let (store, sheet) = calculate("=PIVOTBY(A1:A4,B1:B4,C1:C4,SUM,0,1,,1)");
        assert_eq!(
            store.get_cell(sheet, 10, 8).string().as_deref(),
            Some("Pear")
        );
        for (row, expected) in [[20.0, 40.0, 60.0], [30.0, 10.0, 40.0], [50.0, 50.0, 100.0]]
            .into_iter()
            .enumerate()
        {
            for (column, expected) in expected.into_iter().enumerate() {
                assert_eq!(store.get_cell(sheet, 9 + row, 9 + column).string(), None);
                assert_eq!(store.get_cell(sheet, 9 + row, 9 + column).num(), expected);
            }
        }
        let (store, sheet) = calculate("=PIVOTBY(A1:A4,B1:B4,C1:C4,PERCENTOF,0,0,,0)");
        assert_eq!(store.get_cell(sheet, 9, 9).num(), 0.4);
        assert_eq!(store.get_cell(sheet, 9, 10).num(), 0.8);
    }

    #[test]
    fn hierarchy_subtotals_and_multiple_field_sort() {
        let (store, sheet) = calculate("=GROUPBY(A1:B4,C1:C4,SUM,0,2)");
        for (row, expected) in [20.0, 40.0, 60.0, 30.0, 10.0, 40.0, 100.0]
            .into_iter()
            .enumerate()
        {
            assert_eq!(store.get_cell(sheet, 8 + row, 10).num(), expected);
        }
        let (store, sheet) = calculate("=GROUPBY(A1:B4,C1:C4,SUM,0,-2)");
        for (row, expected) in [100.0, 60.0, 20.0, 40.0, 40.0, 30.0, 10.0]
            .into_iter()
            .enumerate()
        {
            assert_eq!(store.get_cell(sheet, 8 + row, 10).num(), expected);
        }
        let (store, sheet) = calculate("=GROUPBY(A1:B4,C1:C4,SUM,0,0,HSTACK(-1,-2))");
        for (row, expected) in [10.0, 30.0, 40.0, 20.0].into_iter().enumerate() {
            assert_eq!(store.get_cell(sheet, 8 + row, 10).num(), expected);
        }
        for (formula, expected) in [
            (
                "=GROUPBY(A1:B4,C1:C4,SUM,0,2,-3)",
                vec![40.0, 20.0, 60.0, 30.0, 10.0, 40.0, 100.0],
            ),
            (
                "=GROUPBY(A1:B4,C1:C4,SUM,0,,-2,,1)",
                vec![10.0, 40.0, 20.0, 30.0, 100.0],
            ),
        ] {
            let (store, sheet) = calculate(formula);
            for (row, expected) in expected.into_iter().enumerate() {
                assert_eq!(
                    store.get_cell(sheet, 8 + row, 10).num(),
                    expected,
                    "{formula}"
                );
            }
        }
    }

    #[test]
    fn eta_reduced_numeric_aggregators() {
        for (function, expected) in [
            ("SUM", 60.0),
            ("AVERAGE", 30.0),
            ("COUNT", 2.0),
            ("COUNTA", 2.0),
            ("MAX", 40.0),
            ("MIN", 20.0),
            ("MEDIAN", 30.0),
            ("PRODUCT", 800.0),
            ("STDEV.S", 200.0_f64.sqrt()),
            ("STDEV.P", 10.0),
            ("VAR.S", 200.0),
            ("VAR.P", 100.0),
        ] {
            let formula = format!("=GROUPBY(A1:A4,C1:C4,{function},0,0)");
            let (store, sheet) = calculate(&formula);
            assert_eq!(
                store.get_cell(sheet, 8, 8).string().as_deref(),
                Some("Apple")
            );
            assert!(
                (store.get_cell(sheet, 8, 9).num() - expected).abs() < 1e-10,
                "{formula}"
            );
        }
    }

    #[test]
    fn headers_and_multiple_value_columns() {
        let (store, sheet) = calculate("=GROUPBY(A1:A4,C1:D4,SUM,2,0)");
        assert!(store.get_cell(sheet, 8, 8).string().is_some());
        assert_eq!(store.get_cell(sheet, 9, 9).num(), 60.0);
        assert_eq!(store.get_cell(sheet, 9, 10).num(), 1.0);
        for header_code in [1, 3] {
            let (mut store, sheet) = calculate("=1");
            store.set_string(sheet, 0, 0, "Product", 0);
            store.set_string(sheet, 0, 2, "Sales", 0);
            store.set_formula(
                sheet,
                8,
                8,
                &format!("=GROUPBY(A1:A4,C1:C4,SUM,{header_code},0)"),
                0,
            );
            store.recompute(sheet);
            let first_row = 8 + usize::from(header_code == 3);
            assert_eq!(store.get_cell(sheet, first_row, 9).num(), 60.0);
            assert_eq!(store.get_cell(sheet, first_row + 1, 9).num(), 30.0);
            if header_code == 3 {
                assert_eq!(
                    store.get_cell(sheet, 8, 8).string().as_deref(),
                    Some("Product")
                );
                assert_eq!(
                    store.get_cell(sheet, 8, 9).string().as_deref(),
                    Some("Sales")
                );
            }
        }
    }

    #[test]
    fn pivot_relative_totals_and_two_parameter_lambda() {
        for (relative, expected) in [(0, 0.4), (1, 1.0 / 3.0), (2, 0.2), (3, 1.0 / 3.0), (4, 0.4)] {
            for function in [
                "PERCENTOF",
                "LAMBDA(subset,totalset,SUM(subset)/SUM(totalset))",
            ] {
                let (store, sheet) = calculate(&format!(
                    "=PIVOTBY(A1:A4,B1:B4,C1:C4,{function},0,0,,0,,,{relative})"
                ));
                assert_eq!(store.get_cell(sheet, 8, 8).string(), None);
                assert!((store.get_cell(sheet, 9, 9).num() - expected).abs() < 1e-10);
            }
        }
    }

    #[test]
    fn percentof_sum_ratio_and_errors() {
        // https://support.microsoft.com/en-us/excel/functions/percentof-function
        let (store, sheet) = calculate("=PERCENTOF(C1:C2,C1:C4)");
        assert_eq!(store.get_cell(sheet, 8, 8).num(), 0.3);
        let cases = [
            (
                "=GROUPBY(A1:A4,C1:C4,LAMBDA(subset,subset,SUM(subset)))",
                "#VALUE!",
            ),
            (
                "=PIVOTBY(SEQUENCE(1001),SEQUENCE(1001),SEQUENCE(1001),SUM,0,0,,0)",
                "#NUM!",
            ),
            ("=GROUPBY(A1:A3,C1:C4,SUM)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,ABS)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,HSTACK(SUM,AVERAGE))", "#VALUE!"),
            ("=PIVOTBY(A1:A4,B1:B4,C1:C4,HSTACK(SUM,AVERAGE))", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,LAMBDA(subset,subset),0,0)", "#CALC!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,0,,D1:D3)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,0,,D3:D6)", "#CALC!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,4)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,2)", "#VALUE!"),
            ("=GROUPBY(A1:B4,C1:C4,SUM,0,2,,,1)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,0,3)", "#VALUE!"),
            ("=PIVOTBY(A1:A4,B1:B3,C1:C4,SUM)", "#VALUE!"),
            ("=PIVOTBY(A1:A4,B1:B4,C1:C4,SUM,0,0,,0,,,5)", "#VALUE!"),
            ("=PERCENTOF(C1:C4,D3:D4)", "#DIV/0!"),
        ];
        for (formula, error) in cases {
            let (store, sheet) = calculate(formula);
            assert_eq!(
                store.get_cell(sheet, 8, 8).string().as_deref(),
                Some(error),
                "{formula}"
            );
        }
    }
}
