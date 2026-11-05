//! Mixed values keep nulls, errors, and typed payloads distinct without boxed cells.

use crate::buffers::{at, flat_index, row_index, Bits, Texts};
use crate::column::Value;
use crate::plan::Diagnostic;

pub(crate) const NULL_TAG: u8 = 0;
pub(crate) const NUMBER_TAG: u8 = 1;
pub(crate) const LOGICAL_TAG: u8 = 2;
pub(crate) const TEXT_TAG: u8 = 3;
pub(crate) const DATE_TAG: u8 = 4;
pub(crate) const DATE_TIME_TAG: u8 = 5;
pub(crate) const ERROR_TAG: u8 = 6;

/// Tags select compact typed lanes; indexes select a lane entry or interned error code.
#[derive(Debug, Default)]
pub(crate) struct Mixed {
    pub(crate) tags: Vec<u8>,
    pub(crate) indexes: Vec<u32>,
    pub(crate) numbers: Vec<f64>,
    pub(crate) logical: Bits,
    pub(crate) texts: Texts,
    pub(crate) dates: Vec<i32>,
    pub(crate) date_times: Vec<i64>,
}

impl Mixed {
    /// Error indexes refer to the owning column's code pool, never borrowed text.
    pub(crate) fn push(
        &mut self,
        value: Value<'_>,
        error_index: Option<u32>,
    ) -> Result<(), Diagnostic> {
        let (tag, index) = match value {
            Value::Null => (NULL_TAG, 0),
            Value::Error(_) => (
                ERROR_TAG,
                error_index.ok_or_else(|| Diagnostic::new("error-code"))?,
            ),
            Value::Number(value) => {
                let index = flat_index(self.numbers.len())?;
                self.numbers.push(value);
                (NUMBER_TAG, index)
            }
            Value::Logical(value) => {
                let index = flat_index(self.logical.len())?;
                self.logical.push(value)?;
                (LOGICAL_TAG, index)
            }
            Value::Text(value) => {
                let index = flat_index(self.texts.len())?;
                self.texts.push(value)?;
                (TEXT_TAG, index)
            }
            Value::Date(value) => {
                let index = flat_index(self.dates.len())?;
                self.dates.push(value);
                (DATE_TAG, index)
            }
            Value::DateTime(value) => {
                let index = flat_index(self.date_times.len())?;
                self.date_times.push(value);
                (DATE_TIME_TAG, index)
            }
        };

        self.tags.push(tag);
        self.indexes.push(index);
        Ok(())
    }

    /// Resolving a tag checks both its lane and its index before exposing a value.
    pub(crate) fn get<'a>(
        &'a self,
        row: usize,
        error_codes: &'a [String],
    ) -> Result<Value<'a>, Diagnostic> {
        let index = row_index(*at(&self.indexes, row)?)?;

        Ok(match *at(&self.tags, row)? {
            NULL_TAG => Value::Null,
            ERROR_TAG => Value::Error(at(error_codes, index)?),
            NUMBER_TAG => Value::Number(*at(&self.numbers, index)?),
            LOGICAL_TAG => Value::Logical(self.logical.get(index)?),
            TEXT_TAG => Value::Text(self.texts.get(index)?),
            DATE_TAG => Value::Date(*at(&self.dates, index)?),
            DATE_TIME_TAG => Value::DateTime(*at(&self.date_times, index)?),
            _ => return Err(Diagnostic::new("type")),
        })
    }
}
