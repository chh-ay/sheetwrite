//! JSON records stream into columns; unknown fields never allocate a row object.

use crate::budget::OutputBudget;
use crate::buffers::{at, at_mut};
use crate::column::{Batch, Column, Value};
use crate::execute::push_converted;
use crate::plan::{ColumnSpec, Diagnostic, ErrorPolicy, Limits};
use serde::de::{self, DeserializeSeed, IgnoredAny, MapAccess, SeqAccess, Visitor};
use std::fmt;

struct Target<'a> {
    columns: Vec<Column>,
    rows: usize,
    limits: &'a Limits,
    issue: Option<Diagnostic>,
    budget: OutputBudget,
}

impl Target<'_> {
    fn fail<E: de::Error>(&mut self, issue: Diagnostic) -> E {
        self.issue = Some(issue);
        E::custom("query source rejected")
    }
}

/// Schema and record path are fixed before parsing the first source row.
pub(crate) fn parse(
    bytes: &[u8],
    specs: &[ColumnSpec],
    path: &[String],
    limits: &Limits,
) -> Result<Batch, Diagnostic> {
    let mut target = Target {
        columns: specs.iter().cloned().map(Column::new).collect(),
        rows: 0,
        limits,
        issue: None,
        budget: OutputBudget::new(limits),
    };

    crate::column::validate_names(&target.columns)?;

    let mut deserializer = crate::json::Deserializer::new(bytes);
    let result = Path {
        target: &mut target,
        path,
    }
    .deserialize(&mut deserializer);
    if result.is_err() {
        return Err(target.issue.unwrap_or_else(|| Diagnostic::new("json")));
    }

    deserializer.end().map_err(|_| Diagnostic::new("json"))?;
    Batch::new(target.columns, target.rows, limits)
}

struct Path<'a, 'b> {
    target: &'a mut Target<'b>,
    path: &'a [String],
}

impl<'de> DeserializeSeed<'de> for Path<'_, '_> {
    type Value = ();

    fn deserialize<D: de::Deserializer<'de>>(self, deserializer: D) -> Result<(), D::Error> {
        if self.path.is_empty() {
            deserializer.deserialize_seq(Rows(self.target))
        } else {
            deserializer.deserialize_map(self)
        }
    }
}

impl<'de> Visitor<'de> for Path<'_, '_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("record path")
    }

    fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<(), M::Error> {
        let mut found = false;
        let (field, remaining) = self
            .path
            .split_first()
            .ok_or_else(|| de::Error::custom("record path"))?;

        while let Some(matches) = map.next_key_seed(KeySeed(|key: &str| key == field))? {
            if matches {
                if found {
                    return Err(self.target.fail(Diagnostic::new("json-path")));
                }

                map.next_value_seed(Path {
                    target: self.target,
                    path: remaining,
                })?;
                found = true;
            } else {
                map.next_value::<IgnoredAny>()?;
            }
        }

        if !found {
            return Err(self.target.fail(Diagnostic::new("json-path")));
        }

        Ok(())
    }
}

struct Rows<'a, 'b>(&'a mut Target<'b>);

impl<'de> Visitor<'de> for Rows<'_, '_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("array of records")
    }

    fn visit_seq<S: SeqAccess<'de>>(self, mut sequence: S) -> Result<(), S::Error> {
        while sequence.next_element_seed(Record(self.0))?.is_some() {}

        Ok(())
    }
}

struct Record<'a, 'b>(&'a mut Target<'b>);

impl<'de> DeserializeSeed<'de> for Record<'_, '_> {
    type Value = ();

    fn deserialize<D: de::Deserializer<'de>>(self, deserializer: D) -> Result<(), D::Error> {
        deserializer.deserialize_map(self)
    }
}

impl<'de> Visitor<'de> for Record<'_, '_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("source record")
    }

    fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<(), M::Error> {
        if let Err(issue) = self.0.limits.shape(self.0.rows + 1, self.0.columns.len()) {
            return Err(self.0.fail(issue));
        }

        while let Some(index) = map.next_key_seed(KeySeed(|key: &str| {
            self.0
                .columns
                .iter()
                .position(|column| column.name() == key)
        }))? {
            if let Some(index) = index {
                if at(&self.0.columns, index)
                    .map_err(|_| de::Error::custom("column index"))?
                    .len()
                    > self.0.rows
                {
                    return Err(self.0.fail(Diagnostic::new("duplicate-column")));
                }

                map.next_value_seed(Scalar {
                    target: self.0,
                    column: index,
                })?;
            } else {
                map.next_value::<IgnoredAny>()?;
            }
        }

        for column in &mut self.0.columns {
            if column.len() == self.0.rows {
                if let Err(issue) = self.0.budget.push(column, Value::Null) {
                    self.0.issue = Some(issue);
                    return Err(de::Error::custom("query source rejected"));
                }
            }
        }

        self.0.rows += 1;
        Ok(())
    }
}

struct Scalar<'a, 'b> {
    target: &'a mut Target<'b>,
    column: usize,
}

impl Scalar<'_, '_> {
    fn push<E: de::Error>(self, value: Value<'_>) -> Result<(), E> {
        let Target {
            columns,
            budget,
            issue,
            ..
        } = self.target;
        let column = at_mut(columns, self.column).map_err(|_| E::custom("column index"))?;

        push_converted(column, value, ErrorPolicy::Error, budget).map_err(|diagnostic| {
            *issue = Some(diagnostic);
            E::custom("query source rejected")
        })
    }
}

impl<'de> DeserializeSeed<'de> for Scalar<'_, '_> {
    type Value = ();

    fn deserialize<D: de::Deserializer<'de>>(self, deserializer: D) -> Result<(), D::Error> {
        deserializer.deserialize_any(self)
    }
}

impl<'de> Visitor<'de> for Scalar<'_, '_> {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("scalar")
    }

    fn visit_unit<E: de::Error>(self) -> Result<(), E> {
        self.push(Value::Null)
    }

    fn visit_bool<E: de::Error>(self, value: bool) -> Result<(), E> {
        self.push(Value::Logical(value))
    }

    fn visit_f64<E: de::Error>(self, value: f64) -> Result<(), E> {
        self.push(Value::Number(value))
    }

    fn visit_str<E: de::Error>(self, value: &str) -> Result<(), E> {
        self.push(Value::Text(value))
    }

    fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<(), M::Error> {
        while map.next_entry::<IgnoredAny, IgnoredAny>()?.is_some() {}

        self.push(Value::Error("conversion"))
    }

    fn visit_seq<S: SeqAccess<'de>>(self, mut sequence: S) -> Result<(), S::Error> {
        while sequence.next_element::<IgnoredAny>()?.is_some() {}

        self.push(Value::Error("conversion"))
    }
}

struct KeySeed<F>(F);

impl<'de, F, T> DeserializeSeed<'de> for KeySeed<F>
where
    F: FnOnce(&str) -> T,
{
    type Value = T;

    fn deserialize<D: de::Deserializer<'de>>(self, deserializer: D) -> Result<T, D::Error> {
        deserializer.deserialize_str(self)
    }
}

impl<'de, F, T> Visitor<'de> for KeySeed<F>
where
    F: FnOnce(&str) -> T,
{
    type Value = T;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("record field")
    }

    fn visit_str<E: de::Error>(self, key: &str) -> Result<T, E> {
        Ok(self.0(key))
    }
}
