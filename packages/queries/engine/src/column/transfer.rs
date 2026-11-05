//! Owned wire lanes are validated here before the execution module sees a column.

use super::{Column, Payload, Value};
use crate::buffers::{at, row_index, Bits, Texts};
use crate::mixed::Mixed;
use crate::plan::{ColumnSpec, ColumnType, Diagnostic};

/// Owned transfer lanes move out once; row error codes index the packed code pool.
#[derive(Default)]
pub(crate) struct ColumnBuffers {
    pub column_type: Option<ColumnType>,
    pub metadata: Vec<u8>,
    pub metadata_offsets: Vec<u32>,
    pub validity: Vec<u8>,
    pub error_rows: Vec<u32>,
    pub error_codes: Vec<u32>,
    pub numbers: Vec<f64>,
    pub logical: Vec<u8>,
    pub text: Vec<u8>,
    pub offsets: Vec<u32>,
    pub dates: Vec<i32>,
    pub date_times: Vec<i64>,
    pub tags: Vec<u8>,
    pub indexes: Vec<u32>,
}

impl Column {
    /// Metadata contains id, name, then interned codes; payload buffers move unchanged.
    pub(crate) fn into_buffers(self) -> Result<ColumnBuffers, Diagnostic> {
        let mut metadata = Texts::default();
        metadata.push(&self.spec.id)?;
        metadata.push(&self.spec.name)?;

        for code in self.error_codes {
            metadata.push(&code)?;
        }

        let (metadata, metadata_offsets) = metadata.into_parts();
        let (error_rows, error_codes) = self.error_records.into_iter().unzip();
        let mut buffers = ColumnBuffers {
            column_type: Some(self.spec.column_type),
            metadata,
            metadata_offsets,
            validity: self.valid.into_bytes(),
            error_rows,
            error_codes,
            ..ColumnBuffers::default()
        };

        match self.payload {
            Payload::Numbers(values) => buffers.numbers = values,
            Payload::Logical(values) => buffers.logical = values.into_bytes(),
            Payload::Texts(values) => {
                (buffers.text, buffers.offsets) = values.into_parts();
            }
            Payload::Dates(values) => buffers.dates = values,
            Payload::DateTimes(values) => buffers.date_times = values,
            Payload::Mixed(values) => {
                buffers.numbers = values.numbers;
                buffers.logical = values.logical.into_bytes();
                (buffers.text, buffers.offsets) = values.texts.into_parts();
                buffers.dates = values.dates;
                buffers.date_times = values.date_times;
                buffers.tags = values.tags;
                buffers.indexes = values.indexes;
            }
        }

        Ok(buffers)
    }

    /// Adopts host lanes after validating their shapes; no payload is cloned.
    pub(crate) fn from_buffers(buffers: ColumnBuffers, rows: usize) -> Result<Self, Diagnostic> {
        let column_type = buffers.column_type.ok_or_else(|| Diagnostic::new("type"))?;
        let mut metadata =
            crate::wire::decode_strings(&buffers.metadata, &buffers.metadata_offsets)?.into_iter();
        let id = metadata.next().ok_or_else(|| Diagnostic::new("shape"))?;
        let name = metadata.next().ok_or_else(|| Diagnostic::new("shape"))?;
        let error_codes: Vec<String> = metadata.collect();
        let valid = Bits::from_bytes(buffers.validity, rows)?;

        if buffers.error_rows.len() != buffers.error_codes.len() {
            return Err(Diagnostic::new("shape"));
        }

        let error_records: Vec<(u32, u32)> = buffers
            .error_rows
            .into_iter()
            .zip(buffers.error_codes)
            .collect();
        let errors = error_mask(&error_records, &error_codes, &valid, rows)?;
        let payload = adopt_payload(
            column_type,
            ColumnBuffers {
                numbers: buffers.numbers,
                logical: buffers.logical,
                text: buffers.text,
                offsets: buffers.offsets,
                dates: buffers.dates,
                date_times: buffers.date_times,
                tags: buffers.tags,
                indexes: buffers.indexes,
                ..ColumnBuffers::default()
            },
            rows,
        )?;
        let column = Self {
            spec: ColumnSpec {
                id,
                name,
                column_type,
            },
            payload,
            valid,
            errors,
            error_records,
            error_codes,
        };

        for row in 0..rows {
            let value = column.value(row)?;
            let is_error = matches!(value, Value::Error(_));
            let is_valid = !matches!(value, Value::Null | Value::Error(_));
            if is_error != column.errors.get(row)? || is_valid != column.valid.get(row)? {
                return Err(Diagnostic::new("shape"));
            }

            if column_type == ColumnType::Mixed && is_error {
                let code = column.error_code(row)?;
                if value != Value::Error(code) {
                    return Err(Diagnostic::new("shape"));
                }
            }

            if matches!(value, Value::Number(number) if !number.is_finite()) {
                return Err(Diagnostic::new("non-finite"));
            }
        }

        Ok(column)
    }
}

fn error_mask(
    records: &[(u32, u32)],
    codes: &[String],
    valid: &Bits,
    rows: usize,
) -> Result<Bits, Diagnostic> {
    let mut previous = None;
    for (row, code) in records {
        let index = row_index(*row)?;
        if index >= rows || previous.is_some_and(|prior| prior >= *row) || valid.get(index)? {
            return Err(Diagnostic::new("shape"));
        }

        at(codes, row_index(*code)?)?;
        previous = Some(*row);
    }

    let mut errors = Bits::default();
    let mut records = records.iter().peekable();
    for row in 0..rows {
        let has_error = records
            .peek()
            .is_some_and(|record| row_index(record.0).ok() == Some(row));
        errors.push(has_error)?;
        if has_error {
            records.next();
        }
    }

    Ok(errors)
}

fn require_length(actual: usize, expected: usize) -> Result<(), Diagnostic> {
    if actual == expected {
        Ok(())
    } else {
        Err(Diagnostic::new("shape"))
    }
}

fn adopt_payload(
    kind: ColumnType,
    buffers: ColumnBuffers,
    rows: usize,
) -> Result<Payload, Diagnostic> {
    let ColumnBuffers {
        numbers,
        logical,
        text,
        offsets,
        dates,
        date_times,
        tags,
        indexes,
        ..
    } = buffers;

    Ok(match kind {
        ColumnType::Number => {
            require_length(numbers.len(), rows)?;
            Payload::Numbers(numbers)
        }
        ColumnType::Logical => Payload::Logical(Bits::from_bytes(logical, rows)?),
        ColumnType::Text => {
            let texts = Texts::from_parts(text, offsets)?;
            require_length(texts.len(), rows)?;
            Payload::Texts(texts)
        }
        ColumnType::Date => {
            require_length(dates.len(), rows)?;
            Payload::Dates(dates)
        }
        ColumnType::DateTime => {
            require_length(date_times.len(), rows)?;
            Payload::DateTimes(date_times)
        }
        ColumnType::Mixed => {
            require_length(tags.len(), rows)?;
            require_length(indexes.len(), rows)?;
            let logical_rows = tags
                .iter()
                .filter(|tag| **tag == crate::mixed::LOGICAL_TAG)
                .count();
            Payload::Mixed(Mixed {
                tags,
                indexes,
                numbers,
                logical: Bits::from_bytes(logical, logical_rows)?,
                texts: Texts::from_parts(text, offsets)?,
                dates,
                date_times,
            })
        }
    })
}

#[cfg(test)]
mod tests;
