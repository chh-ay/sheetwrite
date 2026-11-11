//! Joins and groups share one checked key comparator and deterministic row order.

use crate::buffers::{at, flat_index, row_index};
use crate::column::{compare, Batch, Value};
use crate::plan::Diagnostic;
use std::cmp::Ordering;

/// A batch and the columns that form its composite key.
#[derive(Clone, Copy, Debug)]
pub(crate) struct KeyColumns<'a> {
    pub(crate) batch: &'a Batch,
    pub(crate) keys: &'a [u32],
}

/// Composite keys compare left-to-right; null equals null before any typed value.
pub(crate) fn compare_keys(
    left: KeyColumns<'_>,
    right: KeyColumns<'_>,
    left_row: u32,
    right_row: u32,
) -> Result<Ordering, Diagnostic> {
    for (left_column, right_column) in left.keys.iter().zip(right.keys) {
        let order = compare(
            left.batch
                .value(row_index(*left_column)?, row_index(left_row)?)?,
            right
                .batch
                .value(row_index(*right_column)?, row_index(right_row)?)?,
        );
        if order != Ordering::Equal {
            return Ok(order);
        }
    }

    Ok(Ordering::Equal)
}

/// Error keys fail before sorting; row-id ties avoid a stable-sort scratch buffer.
pub(crate) fn sorted_rows(batch: &Batch, keys: &[u32]) -> Result<Vec<u32>, Diagnostic> {
    for column in keys {
        for row in 0..batch.row_count() {
            if matches!(batch.value(row_index(*column)?, row)?, Value::Error(_)) {
                return Err(Diagnostic {
                    row: Some(row),
                    column: Some(at(&batch.columns, row_index(*column)?)?.id().to_owned()),
                    ..Diagnostic::new("key-error")
                });
            }
        }
    }

    let count = flat_index(batch.row_count())?;
    let mut rows: Vec<u32> = (0..count).collect();
    let mut failure = None;
    let side = KeyColumns { batch, keys };

    rows.sort_unstable_by(
        |left, right| match compare_keys(side, side, *left, *right) {
            Ok(order) => order.then_with(|| left.cmp(right)),
            Err(issue) => {
                failure = Some(issue);
                Ordering::Equal
            }
        },
    );

    if let Some(issue) = failure {
        return Err(issue);
    }

    Ok(rows)
}

/// Duplicate references cannot create ambiguous output identities.
pub(crate) fn indexes(batch: &Batch, ids: &[String]) -> Result<Vec<u32>, Diagnostic> {
    let columns = ids
        .iter()
        .map(|id| batch.column_index(id).and_then(flat_index))
        .collect::<Result<Vec<_>, _>>()?;
    if columns
        .iter()
        .enumerate()
        .any(|(index, column)| columns.iter().take(index).any(|prior| prior == column))
    {
        return Err(Diagnostic::new("duplicate-column"));
    }

    Ok(columns)
}
