//! Typed columns own payload buffers; batches add an optional flat row selection.

use crate::budget::OutputBudget;
use crate::buffers::{at, flat_index, row_index, Bits, Texts};
use crate::mixed::Mixed;
use crate::plan::{ColumnSpec, ColumnType, Diagnostic, Limits};
use std::cmp::Ordering;

mod transfer;
pub(crate) use transfer::ColumnBuffers;

const MICROS_PER_SECOND: i64 = 1_000_000;
const NANOS_PER_MICROSECOND: i64 = 1_000;
const UNIX_EPOCH_YEAR: i32 = 1970;

/// A borrowed scalar view; null and error remain distinct from every typed value.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Value<'a> {
    Null,
    Error(&'a str),
    Number(f64),
    Logical(bool),
    Text(&'a str),
    Date(i32),
    DateTime(i64),
}

impl Value<'_> {
    /// Nulls and errors inherit their column's type rather than inventing one.
    pub fn column_type(self) -> Option<ColumnType> {
        match self {
            Self::Null | Self::Error(_) => None,
            Self::Number(_) => Some(ColumnType::Number),
            Self::Logical(_) => Some(ColumnType::Logical),
            Self::Text(_) => Some(ColumnType::Text),
            Self::Date(_) => Some(ColumnType::Date),
            Self::DateTime(_) => Some(ColumnType::DateTime),
        }
    }
}

#[derive(Debug)]
enum Payload {
    Numbers(Vec<f64>),
    Logical(Bits),
    Texts(Texts),
    Dates(Vec<i32>),
    DateTimes(Vec<i64>),
    Mixed(Mixed),
}

/// One typed payload with row validity, error bits, and an interned error-code pool.
#[derive(Debug)]
pub struct Column {
    pub(crate) spec: ColumnSpec,
    payload: Payload,
    valid: Bits,
    errors: Bits,
    error_records: Vec<(u32, u32)>,
    error_codes: Vec<String>,
}

impl Column {
    /// Creates an empty column; appended values must match its declared type.
    pub fn new(spec: ColumnSpec) -> Self {
        let payload = match spec.column_type {
            ColumnType::Number => Payload::Numbers(Vec::new()),
            ColumnType::Logical => Payload::Logical(Bits::default()),
            ColumnType::Text => Payload::Texts(Texts::default()),
            ColumnType::Date => Payload::Dates(Vec::new()),
            ColumnType::DateTime => Payload::DateTimes(Vec::new()),
            ColumnType::Mixed => Payload::Mixed(Mixed::default()),
        };
        Self {
            spec,
            payload,
            valid: Bits::default(),
            errors: Bits::default(),
            error_records: Vec::new(),
            error_codes: Vec::new(),
        }
    }

    /// Stable identity used by plans; rename never changes it.
    pub fn id(&self) -> &str {
        &self.spec.id
    }

    /// Display name used by source fields and exported table headers.
    pub fn name(&self) -> &str {
        &self.spec.name
    }

    /// The fixed payload type; mixed columns carry their own lane tags.
    pub fn column_type(&self) -> ColumnType {
        self.spec.column_type
    }

    /// Physical row count, before any batch-level selection.
    pub(crate) fn len(&self) -> usize {
        self.valid.len()
    }

    /// Appends a typed value; non-finite numbers become conversion errors.
    pub fn push(&mut self, value: Value<'_>) -> Result<(), Diagnostic> {
        let row = flat_index(self.len())?;
        if row == u32::MAX {
            return Err(Diagnostic::limit());
        }

        if value.column_type().is_some_and(|kind| {
            self.column_type() != ColumnType::Mixed && kind != self.column_type()
        }) {
            return Err(Diagnostic::new("type"));
        }

        let value = match value {
            Value::Number(number) if !number.is_finite() => Value::Error("conversion"),
            other => other,
        };

        let error_index = if let Value::Error(code) = value {
            let index = self.intern_error(code)?;
            Some(index)
        } else {
            None
        };

        match &mut self.payload {
            Payload::Numbers(values) => values.push(if let Value::Number(value) = value {
                value
            } else {
                0.0
            }),
            Payload::Logical(values) => values.push(matches!(value, Value::Logical(true)))?,
            Payload::Texts(values) => values.push(if let Value::Text(value) = value {
                value
            } else {
                ""
            })?,
            Payload::Dates(values) => values.push(if let Value::Date(value) = value {
                value
            } else {
                0
            }),
            Payload::DateTimes(values) => values.push(if let Value::DateTime(value) = value {
                value
            } else {
                0
            }),
            Payload::Mixed(values) => values.push(value, error_index)?,
        }

        if let Some(code) = error_index {
            self.error_records.push((row, code));
        }

        self.valid
            .push(!matches!(value, Value::Null | Value::Error(_)))?;
        self.errors.push(matches!(value, Value::Error(_)))?;

        Ok(())
    }

    /// Reads a physical row; invalid row or lane indexes return a diagnostic.
    pub fn value(&self, row: usize) -> Result<Value<'_>, Diagnostic> {
        if let Payload::Mixed(values) = &self.payload {
            return values.get(row, &self.error_codes);
        }

        if self.errors.get(row)? {
            return Ok(Value::Error(self.error_code(row)?));
        }

        if !self.valid.get(row)? {
            return Ok(Value::Null);
        }

        Ok(match &self.payload {
            Payload::Numbers(values) => Value::Number(*at(values, row)?),
            Payload::Logical(values) => Value::Logical(values.get(row)?),
            Payload::Texts(values) => Value::Text(values.get(row)?),
            Payload::Dates(values) => Value::Date(*at(values, row)?),
            Payload::DateTimes(values) => Value::DateTime(*at(values, row)?),
            Payload::Mixed(values) => values.get(row, &self.error_codes)?,
        })
    }

    fn error_code(&self, row: usize) -> Result<&str, Diagnostic> {
        let row = flat_index(row)?;
        let index = self
            .error_records
            .binary_search_by_key(&row, |record| record.0)
            .map_err(|_| Diagnostic::new("error-code"))?;
        let code = row_index(at(&self.error_records, index)?.1)?;

        Ok(at(&self.error_codes, code)?.as_str())
    }

    fn intern_error(&mut self, code: &str) -> Result<u32, Diagnostic> {
        if let Some(index) = self.error_codes.iter().position(|prior| prior == code) {
            return flat_index(index);
        }

        let index = flat_index(self.error_codes.len())?;
        self.error_codes.push(code.to_owned());
        Ok(index)
    }
}

/// Columns have equal physical lengths; selection entries are checked physical row ids.
#[derive(Debug)]
pub struct Batch {
    pub(crate) columns: Vec<Column>,
    pub(crate) rows: usize,
    pub(crate) selection: Option<Vec<u32>>,
}

impl Batch {
    /// Validates shape and unique identities before a batch enters the engine.
    pub fn new(columns: Vec<Column>, rows: usize, limits: &Limits) -> Result<Self, Diagnostic> {
        limits.shape(rows, columns.len())?;
        if columns.iter().any(|column| column.len() != rows) {
            return Err(Diagnostic::new("shape"));
        }

        validate_names(&columns)?;
        Ok(Self {
            columns,
            rows,
            selection: None,
        })
    }

    /// Logical row count after all filters, without copying the payload lanes.
    pub fn row_count(&self) -> usize {
        self.selection.as_ref().map_or(self.rows, Vec::len)
    }

    /// Ordered physical columns; use `value` to apply the logical row selection.
    pub fn columns(&self) -> &[Column] {
        &self.columns
    }

    /// Reads a logical cell without panicking on caller-provided coordinates.
    pub fn value(&self, column: usize, row: usize) -> Result<Value<'_>, Diagnostic> {
        let physical = if let Some(rows) = &self.selection {
            row_index(*at(rows, row)?)?
        } else {
            row
        };

        at(&self.columns, column)?.value(physical)
    }

    /// Resolves stable identity once during plan preparation.
    pub fn column_index(&self, id: &str) -> Result<usize, Diagnostic> {
        self.columns
            .iter()
            .position(|column| column.id() == id)
            .ok_or_else(|| Diagnostic::column(id))
    }

    /// Returned views obey the byte ceiling even when no step had to allocate new columns.
    pub(crate) fn validate_budget(&self, limits: &Limits) -> Result<(), Diagnostic> {
        let mut budget = OutputBudget::new(limits);
        for (index, column) in self.columns.iter().enumerate() {
            for row in 0..self.row_count() {
                budget.admit(column.column_type(), self.value(index, row)?)?;
            }
        }

        Ok(())
    }

    /// Copies a selected view only when the caller needs owned contiguous columns.
    pub fn materialize(self, limits: &Limits) -> Result<Self, Diagnostic> {
        if self.selection.is_none() {
            return Ok(self);
        }

        let mut columns: Vec<Column> = self
            .columns
            .iter()
            .map(|column| Column::new(column.spec.clone()))
            .collect();
        let mut budget = OutputBudget::new(limits);
        for (index, column) in columns.iter_mut().enumerate() {
            for row in 0..self.row_count() {
                budget.push(column, self.value(index, row)?)?;
            }
        }

        Self::new(columns, self.row_count(), limits)
    }
}

/// Table-style output names must be unique even when the payload is empty.
pub(crate) fn validate_names(columns: &[Column]) -> Result<(), Diagnostic> {
    for (index, column) in columns.iter().enumerate() {
        if column.id().is_empty()
            || column.name().trim().is_empty()
            || columns.iter().take(index).any(|prior| {
                prior.id() == column.id() || prior.name().eq_ignore_ascii_case(column.name())
            })
        {
            return Err(Diagnostic::new("duplicate-column"));
        }
    }

    Ok(())
}

/// A total key order keeps joins and groups deterministic across source batches.
pub(crate) fn compare(left: Value<'_>, right: Value<'_>) -> Ordering {
    match (left, right) {
        (Value::Null, Value::Null) => Ordering::Equal,
        (Value::Null, _) => Ordering::Less,
        (_, Value::Null) => Ordering::Greater,
        (Value::Number(left), Value::Number(right)) => {
            left.partial_cmp(&right).unwrap_or(Ordering::Equal)
        }
        (Value::Logical(left), Value::Logical(right)) => left.cmp(&right),
        (Value::Text(left), Value::Text(right)) => left.encode_utf16().cmp(right.encode_utf16()),
        (Value::Date(left), Value::Date(right)) => left.cmp(&right),
        (Value::DateTime(left), Value::DateTime(right)) => left.cmp(&right),
        _ => type_rank(left).cmp(&type_rank(right)),
    }
}
fn type_rank(value: Value<'_>) -> u8 {
    match value {
        Value::Null => 0,
        Value::Error(_) => 1,
        Value::Logical(_) => 2,
        Value::Number(_) => 3,
        Value::Text(_) => 4,
        Value::Date(_) => 5,
        Value::DateTime(_) => 6,
    }
}

/// Date storage uses whole days from the Unix epoch, independent of worksheet serials.
pub(crate) fn date_from_text(value: &str) -> Option<i32> {
    let date = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()?;
    let epoch = chrono::NaiveDate::from_ymd_opt(UNIX_EPOCH_YEAR, 1, 1)?;
    i32::try_from(date.signed_duration_since(epoch).num_days()).ok()
}

/// Timestamps use microseconds without a zone; unsupported formats do not get guessed.
pub(crate) fn datetime_from_text(value: &str) -> Option<i64> {
    chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f")
        .ok()
        .map(|date| date.and_utc().timestamp_micros())
}

/// Formatting is invariant so refresh does not depend on the host's locale.
pub(crate) fn formatted(value: Value<'_>) -> Option<String> {
    match value {
        Value::Text(value) => Some(value.to_owned()),
        Value::Number(value) => Some(value.to_string()),
        Value::Logical(value) => Some(value.to_string()),
        Value::Date(days) => chrono::NaiveDate::from_ymd_opt(UNIX_EPOCH_YEAR, 1, 1)?
            .checked_add_signed(chrono::TimeDelta::days(i64::from(days)))
            .map(|date| date.format("%Y-%m-%d").to_string()),
        Value::DateTime(micros) => chrono::DateTime::from_timestamp(
            micros.div_euclid(MICROS_PER_SECOND),
            u32::try_from(micros.rem_euclid(MICROS_PER_SECOND) * NANOS_PER_MICROSECOND).ok()?,
        )
        .map(|date| date.naive_utc().format("%Y-%m-%dT%H:%M:%S%.f").to_string()),
        Value::Null | Value::Error(_) => None,
    }
}
