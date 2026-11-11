//! Sort-merge joins enumerate key runs twice so expansion is bounded before output.

use crate::budget::OutputBudget;
use crate::buffers::{at, at_mut, flat_index, row_index};
use crate::column::{validate_names, Batch, Column, Value};
use crate::keys::{compare_keys, sorted_rows, KeyColumns};
use crate::plan::{Diagnostic, JoinKind, Limits};
use std::{cmp::Ordering, ops::Range};

struct Merge<'a> {
    left: &'a Batch,
    right: &'a Batch,
    left_keys: Vec<u32>,
    right_keys: Vec<u32>,
    left_rows: Vec<u32>,
    right_rows: Vec<u32>,
}

impl<'a> Merge<'a> {
    fn new(
        left: &'a Batch,
        right: &'a Batch,
        keys: &[(String, String)],
    ) -> Result<Self, Diagnostic> {
        if keys.is_empty() {
            return Err(Diagnostic::new("join-keys"));
        }

        let left_keys = keys
            .iter()
            .map(|pair| left.column_index(&pair.0).and_then(flat_index))
            .collect::<Result<Vec<_>, _>>()?;
        let right_keys = keys
            .iter()
            .map(|pair| right.column_index(&pair.1).and_then(flat_index))
            .collect::<Result<Vec<_>, _>>()?;

        for (left_key, right_key) in left_keys.iter().zip(&right_keys) {
            if at(&left.columns, row_index(*left_key)?)?.column_type()
                != at(&right.columns, row_index(*right_key)?)?.column_type()
            {
                return Err(Diagnostic::new("type"));
            }
        }

        Ok(Self {
            left,
            right,
            left_rows: sorted_rows(left, &left_keys)?,
            right_rows: sorted_rows(right, &right_keys)?,
            left_keys,
            right_keys,
        })
    }

    fn visit(
        &self,
        mut visit: impl FnMut(Range<usize>, Range<usize>, bool) -> Result<(), Diagnostic>,
    ) -> Result<(), Diagnostic> {
        let mut left = 0;
        let mut right = 0;

        while left < self.left_rows.len() || right < self.right_rows.len() {
            let order = if left == self.left_rows.len() {
                Ordering::Greater
            } else if right == self.right_rows.len() {
                Ordering::Less
            } else {
                compare_keys(
                    KeyColumns {
                        batch: self.left,
                        keys: &self.left_keys,
                    },
                    KeyColumns {
                        batch: self.right,
                        keys: &self.right_keys,
                    },
                    *at(&self.left_rows, left)?,
                    *at(&self.right_rows, right)?,
                )?
            };

            let mut left_end = left;
            let mut right_end = right;

            if order != Ordering::Greater {
                left_end = run_end(self.left, &self.left_keys, &self.left_rows, left)?;
            }

            if order != Ordering::Less {
                right_end = run_end(self.right, &self.right_keys, &self.right_rows, right)?;
            }

            visit(left..left_end, right..right_end, order == Ordering::Equal)?;
            left = left_end;
            right = right_end;
        }

        Ok(())
    }
}

// The side projection and payload budget have one lifetime: this join's output.
struct JoinOutput<'a> {
    left: &'a Batch,
    right: &'a Batch,
    columns: Vec<Column>,
    budget: OutputBudget,
    include_left: bool,
    include_right: bool,
}

impl<'a> JoinOutput<'a> {
    fn new(
        left: &'a Batch,
        right: &'a Batch,
        kind: JoinKind,
        limits: &Limits,
    ) -> Result<Self, Diagnostic> {
        let include_left = !matches!(kind, JoinKind::RightSemi | JoinKind::RightAnti);
        let include_right = !matches!(kind, JoinKind::LeftSemi | JoinKind::LeftAnti);
        let mut columns = Vec::new();

        if include_left {
            columns.extend(
                left.columns
                    .iter()
                    .map(|column| Column::new(column.spec.clone())),
            );
        }

        if include_right {
            columns.extend(
                right
                    .columns
                    .iter()
                    .map(|column| Column::new(column.spec.clone())),
            );
        }

        validate_names(&columns)?;

        Ok(Self {
            left,
            right,
            columns,
            budget: OutputBudget::new(limits),
            include_left,
            include_right,
        })
    }

    fn append(&mut self, left_row: Option<u32>, right_row: Option<u32>) -> Result<(), Diagnostic> {
        let mut output = 0;

        if self.include_left {
            for source in 0..self.left.columns.len() {
                let value = match left_row {
                    Some(row) => self.left.value(source, row_index(row)?)?,
                    None => Value::Null,
                };

                self.budget
                    .push(at_mut(&mut self.columns, output)?, value)?;
                output += 1;
            }
        }

        if self.include_right {
            for source in 0..self.right.columns.len() {
                let value = match right_row {
                    Some(row) => self.right.value(source, row_index(row)?)?,
                    None => Value::Null,
                };

                self.budget
                    .push(at_mut(&mut self.columns, output)?, value)?;
                output += 1;
            }
        }

        Ok(())
    }
}

fn run_end(batch: &Batch, keys: &[u32], rows: &[u32], start: usize) -> Result<usize, Diagnostic> {
    let first = *at(rows, start)?;
    let side = KeyColumns { batch, keys };
    let mut end = start + 1;

    while end < rows.len() {
        if compare_keys(side, side, first, *at(rows, end)?)? != Ordering::Equal {
            break;
        }

        end += 1;
    }

    Ok(end)
}

fn run_count(
    left: usize,
    right: usize,
    matched: bool,
    kind: JoinKind,
) -> Result<usize, Diagnostic> {
    if matched {
        return match kind {
            JoinKind::LeftSemi => Ok(left),
            JoinKind::RightSemi => Ok(right),
            JoinKind::LeftAnti | JoinKind::RightAnti => Ok(0),
            JoinKind::Inner | JoinKind::Left | JoinKind::Right | JoinKind::Full => {
                left.checked_mul(right).ok_or_else(Diagnostic::limit)
            }
        };
    }

    Ok(match kind {
        JoinKind::Left | JoinKind::LeftAnti => left,
        JoinKind::Right | JoinKind::RightAnti => right,
        JoinKind::Full => left + right,
        JoinKind::Inner | JoinKind::LeftSemi | JoinKind::RightSemi => 0,
    })
}

/// Key equality follows M; output order is key order, then original row ids.
pub(crate) fn join(
    left: &Batch,
    right: &Batch,
    keys: &[(String, String)],
    kind: JoinKind,
    limits: &Limits,
) -> Result<Batch, Diagnostic> {
    // Table.Join uses key equality. M defines null = null as true, unlike SQL.
    // https://learn.microsoft.com/powerquery-m/table-join
    // https://learn.microsoft.com/powerquery-m/m-spec-operators#equality-operators
    let merge = Merge::new(left, right, keys)?;
    let mut output = JoinOutput::new(left, right, kind, limits)?;
    let mut rows = 0usize;

    merge.visit(|left_run, right_run, matched| {
        rows = rows
            .checked_add(run_count(left_run.len(), right_run.len(), matched, kind)?)
            .ok_or_else(Diagnostic::limit)?;
        limits.shape(rows, output.columns.len())
    })?;

    let left_only = !output.include_right;
    let right_only = !output.include_left;

    merge.visit(|left_run, right_run, matched| {
        if run_count(left_run.len(), right_run.len(), matched, kind)? == 0 {
            return Ok(());
        }

        if left_only || right_only {
            if left_only {
                for index in left_run {
                    output.append(Some(*at(&merge.left_rows, index)?), None)?;
                }
            } else {
                for index in right_run {
                    output.append(None, Some(*at(&merge.right_rows, index)?))?;
                }
            }
        } else if matched {
            for left_index in left_run {
                for right_index in right_run.clone() {
                    output.append(
                        Some(*at(&merge.left_rows, left_index)?),
                        Some(*at(&merge.right_rows, right_index)?),
                    )?;
                }
            }
        } else {
            for index in left_run {
                output.append(Some(*at(&merge.left_rows, index)?), None)?;
            }

            for index in right_run {
                output.append(None, Some(*at(&merge.right_rows, index)?))?;
            }
        }

        Ok(())
    })?;

    Batch::new(output.columns, rows, limits)
}
