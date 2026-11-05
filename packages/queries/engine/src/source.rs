//! Sources are parsed in Rust directly into the declared typed columns.

use crate::budget::OutputBudget;
use crate::buffers::{at, flat_index, row_index};
use crate::column::{Batch, Column, Value};
use crate::execute::push_converted;
use crate::plan::{Diagnostic, ErrorPolicy, Limits, SourceSpec};

/// Parses host-supplied UTF-8 bytes; it never fetches a locator or infers column types.
pub fn parse_source(bytes: &[u8], spec: &SourceSpec, limits: &Limits) -> Result<Batch, Diagnostic> {
    if bytes.len() > limits.max_source_bytes {
        return Err(Diagnostic::limit());
    }

    match spec {
        SourceSpec::Json { columns, path } => {
            crate::source_json::parse(bytes, columns, path, limits)
        }
        SourceSpec::Csv {
            columns,
            delimiter,
            headers,
            empty_is_null,
        } => {
            let mut output: Vec<Column> = columns.iter().cloned().map(Column::new).collect();
            crate::column::validate_names(&output)?;

            let mut reader = crate::csv::Reader::new(bytes, *delimiter)?;
            let mut record = crate::csv::Record::default();
            let positions: Vec<u32> = if *headers {
                reader.read(&mut record)?;
                columns
                    .iter()
                    .map(|column| {
                        let mut matches = record
                            .fields()
                            .enumerate()
                            .filter(|(_, field)| *field == column.name);
                        let index = matches
                            .next()
                            .map(|entry| entry.0)
                            .ok_or_else(|| Diagnostic::column(&column.id))?;

                        if matches.next().is_some() {
                            return Err(Diagnostic::new("duplicate-column"));
                        }

                        flat_index(index)
                    })
                    .collect::<Result<_, _>>()?
            } else {
                (0..flat_index(columns.len())?).collect()
            };

            // Every record must have the first record's width, as RFC 4180 requires.
            let mut width = headers.then_some(record.len());
            let mut rows = 0;
            let mut budget = OutputBudget::new(limits);

            while reader.read(&mut record)? {
                limits.shape(rows + 1, output.len())?;

                if *width.get_or_insert(record.len()) != record.len() {
                    return Err(Diagnostic::new("csv"));
                }

                if !*headers && record.len() != output.len() {
                    return Err(Diagnostic::new("shape"));
                }

                for (index, column) in output.iter_mut().enumerate() {
                    let field = record
                        .field(row_index(*at(&positions, index)?)?)
                        .ok_or_else(|| Diagnostic::new("shape"))?;
                    let value = if *empty_is_null && field.is_empty() {
                        Value::Null
                    } else {
                        Value::Text(field)
                    };
                    push_converted(column, value, ErrorPolicy::Error, &mut budget)?;
                }

                rows += 1;
            }

            Batch::new(output, rows, limits)
        }
    }
}
