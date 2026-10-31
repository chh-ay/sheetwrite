//! The rows of one sheet that its view hides, for SUBTOTAL and AGGREGATE.
//!
//! Excel keeps two kinds of hidden row apart. Every SUBTOTAL code skips a row
//! that a filter hides; codes 101 to 111 also skip a row that the user hid or
//! that a collapsed group hides. The AGGREGATE options that ignore hidden rows
//! skip both kinds. Each kind is a sorted list of disjoint, non-adjacent
//! inclusive row runs, so the cost follows the number of hidden ranges, not
//! the number of rows. A sheet without hidden rows holds one null pointer.

use crate::memory::{StoreMemoryStats, SHEET_INDEXES_METADATA};
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};

/// Inclusive data rows `start..=end`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct RowRun {
    start: u32,
    end: u32,
}

#[derive(Debug, Default, Eq, PartialEq)]
struct HiddenRuns {
    /// Rows hidden by the user or by a collapsed row group.
    manual: Vec<RowRun>,
    /// Rows that a filter hides.
    filtered: Vec<RowRun>,
}

/// Which hidden rows a function skips.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SkippedRows {
    /// Rows that a filter hides (SUBTOTAL 1 to 11).
    Filtered,
    /// Every hidden row (SUBTOTAL 101 to 111, AGGREGATE options 1, 3, 5 and 7).
    Hidden,
}

#[derive(Debug, Default)]
pub(crate) struct RowVisibility(Option<Box<HiddenRuns>>);

impl RowVisibility {
    /// Replaces both kinds of hidden row. Each slice holds `[start, end]`
    /// pairs of inclusive rows in ascending order without overlap. Returns
    /// `None`, and keeps the old rows, when a slice breaks that rule;
    /// otherwise whether the hidden rows changed.
    pub(crate) fn replace(&mut self, manual: &[u32], filtered: &[u32]) -> Option<bool> {
        let next = HiddenRuns {
            manual: parse_runs(manual)?,
            filtered: parse_runs(filtered)?,
        };

        let next = (!next.manual.is_empty() || !next.filtered.is_empty()).then(|| Box::new(next));
        if self.0 == next {
            return Some(false);
        }

        self.0 = next;
        Some(true)
    }

    pub(crate) fn skips(&self, row: u32, skipped: SkippedRows) -> bool {
        let Some(runs) = &self.0 else {
            return false;
        };

        contains(&runs.filtered, row)
            || (skipped == SkippedRows::Hidden && contains(&runs.manual, row))
    }

    /// Shifts the runs at or below `at` down by `count`. A run that `at`
    /// splits stays hidden on both sides; the new rows are visible.
    pub(crate) fn insert_rows(&mut self, at: u32, count: u32) {
        self.rebuild(|runs| {
            let mut out = Vec::with_capacity(runs.len() + 1);
            for run in runs {
                if run.end < at {
                    push_merged(&mut out, run);
                    continue;
                }

                if run.start < at {
                    push_merged(&mut out, RowRun { end: at - 1, ..run });
                }
                push_merged(
                    &mut out,
                    RowRun {
                        start: run.start.max(at).saturating_add(count),
                        end: run.end.saturating_add(count),
                    },
                );
            }
            out
        });
    }

    /// Drops rows `at..at + count` and moves later runs up.
    pub(crate) fn delete_rows(&mut self, at: u32, count: u32) {
        let end = at.saturating_add(count);
        self.rebuild(|runs| {
            let mut out = Vec::with_capacity(runs.len());
            for run in runs {
                if run.start < at {
                    push_merged(
                        &mut out,
                        RowRun {
                            end: run.end.min(at - 1),
                            ..run
                        },
                    );
                }
                if run.end >= end {
                    push_merged(
                        &mut out,
                        RowRun {
                            start: run.start.max(end) - count,
                            end: run.end - count,
                        },
                    );
                }
            }
            out
        });
    }

    fn rebuild(&mut self, mut shift: impl FnMut(Vec<RowRun>) -> Vec<RowRun>) {
        let Some(runs) = &mut self.0 else {
            return;
        };

        runs.manual = shift(std::mem::take(&mut runs.manual));
        runs.filtered = shift(std::mem::take(&mut runs.filtered));
        if runs.manual.is_empty() && runs.filtered.is_empty() {
            self.0 = None;
        }
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let Some(runs) = &self.0 else {
            return;
        };

        let metadata = stats.owner_mut(SHEET_INDEXES_METADATA);
        let size = std::mem::size_of::<HiddenRuns>();
        metadata.add_payload(size, size);
        metadata.add_vec::<RowRun>(runs.manual.len(), runs.manual.capacity());
        metadata.add_vec::<RowRun>(runs.filtered.len(), runs.filtered.capacity());
    }

    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        let (manual, filtered) = self.0.as_deref().map_or((&[][..], &[][..]), |runs| {
            (&runs.manual[..], &runs.filtered[..])
        });
        for runs in [manual, filtered] {
            out.usize(runs.len());
            for run in runs {
                out.u32(run.start);
                out.u32(run.end);
            }
        }
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        let mut read_packed_runs = || -> TransferResult<Vec<u32>> {
            let words = input.count()?.saturating_mul(WORDS_PER_RUN);
            let mut packed = Vec::with_capacity(words);
            for _ in 0..words {
                packed.push(input.u32()?);
            }
            Ok(packed)
        };
        let manual = read_packed_runs()?;
        let filtered = read_packed_runs()?;

        let mut visibility = Self::default();
        visibility
            .replace(&manual, &filtered)
            .ok_or("invalid hidden rows")?;
        Ok(visibility)
    }
}

/// A packed run is its first and its last row.
const WORDS_PER_RUN: usize = 2;

fn parse_runs(packed: &[u32]) -> Option<Vec<RowRun>> {
    let (pairs, odd_word) = packed.as_chunks::<WORDS_PER_RUN>();
    if !odd_word.is_empty() {
        return None;
    }

    let mut runs = Vec::new();
    for &[start, end] in pairs {
        let run = RowRun { start, end };
        let is_after_last = runs.last().is_none_or(|last: &RowRun| run.start > last.end);
        if run.start > run.end || !is_after_last {
            return None;
        }
        push_merged(&mut runs, run);
    }
    Some(runs)
}

/// Appends `run`, which starts after every run in `runs`, and joins it to the
/// last run when the two touch, so equal row sets have equal runs.
fn push_merged(runs: &mut Vec<RowRun>, run: RowRun) {
    match runs.last_mut() {
        Some(last) if last.end.saturating_add(1) >= run.start => last.end = last.end.max(run.end),
        _ => runs.push(run),
    }
}

fn contains(runs: &[RowRun], row: u32) -> bool {
    let after = runs.partition_point(|run| run.start <= row);
    after > 0 && runs[after - 1].end >= row
}

#[cfg(test)]
mod tests {
    use super::{RowVisibility, SkippedRows};
    use crate::memory::{StoreMemoryStats, SHEET_INDEXES_METADATA};
    use crate::transfer::{Reader, Writer};

    const TAG: u32 = 7;

    fn hidden_rows(visibility: &RowVisibility, skipped: SkippedRows) -> Vec<u32> {
        (0..20)
            .filter(|&row| visibility.skips(row, skipped))
            .collect()
    }

    #[test]
    fn filtered_rows_are_skipped_by_both_kinds_and_manual_rows_only_by_hidden() {
        let mut visibility = RowVisibility::default();
        assert_eq!(visibility.replace(&[2, 3, 9, 9], &[5, 6]), Some(true));

        assert_eq!(hidden_rows(&visibility, SkippedRows::Filtered), [5, 6]);
        assert_eq!(
            hidden_rows(&visibility, SkippedRows::Hidden),
            [2, 3, 5, 6, 9]
        );
        assert_eq!(visibility.replace(&[2, 3, 9, 9], &[5, 6]), Some(false));
    }

    #[test]
    fn rejects_unsorted_overlapping_or_odd_runs_and_keeps_the_old_rows() {
        let mut visibility = RowVisibility::default();
        visibility.replace(&[1, 1], &[]);

        for invalid in [&[4, 3][..], &[5, 6, 2, 3], &[1, 4, 4, 6], &[1]] {
            assert_eq!(visibility.replace(invalid, &[]), None);
            assert_eq!(visibility.replace(&[], invalid), None);
        }
        assert_eq!(hidden_rows(&visibility, SkippedRows::Hidden), [1]);
    }

    #[test]
    fn touching_runs_merge_so_equal_rows_compare_equal() {
        let mut visibility = RowVisibility::default();
        visibility.replace(&[1, 2, 3, 4], &[]);

        assert_eq!(visibility.replace(&[1, 4], &[]), Some(false));
    }

    #[test]
    fn no_hidden_rows_hold_no_heap_and_clearing_frees_the_runs() {
        let mut visibility = RowVisibility::default();
        let mut stats = StoreMemoryStats::default();
        visibility.add_memory_stats(&mut stats);
        assert_eq!(stats.allocated_bytes(), 0);

        visibility.replace(&[0, 999_999], &[]);
        let mut stats = StoreMemoryStats::default();
        visibility.add_memory_stats(&mut stats);
        assert_eq!(stats.owner_mut(SHEET_INDEXES_METADATA).entries, 1);

        assert_eq!(visibility.replace(&[], &[]), Some(true));
        assert!(visibility.0.is_none());
    }

    #[test]
    fn inserted_rows_shift_runs_and_split_a_run_they_enter() {
        let mut visibility = RowVisibility::default();
        visibility.replace(&[2, 4, 8, 8], &[]);

        visibility.insert_rows(3, 2);

        assert_eq!(hidden_rows(&visibility, SkippedRows::Hidden), [2, 5, 6, 10]);
    }

    #[test]
    fn deleted_rows_drop_their_runs_and_join_the_rest() {
        let mut visibility = RowVisibility::default();
        visibility.replace(&[1, 3, 6, 7, 9, 12], &[]);

        visibility.delete_rows(3, 4);

        assert_eq!(
            hidden_rows(&visibility, SkippedRows::Hidden),
            [1, 2, 3, 5, 6, 7, 8]
        );
        visibility.delete_rows(0, 20);
        assert!(visibility.0.is_none());
    }

    #[test]
    fn transfer_round_trips_both_kinds() {
        let mut visibility = RowVisibility::default();
        visibility.replace(&[1, 2], &[7, 9]);
        let mut out = Writer::new(TAG);
        visibility.write_transfer(&mut out);

        let mut input = Reader::new(&out.0, TAG).expect("tagged transfer");
        let copy = RowVisibility::read_transfer(&mut input).expect("valid transfer");

        input.finish().expect("no trailing bytes");
        assert_eq!(copy.0, visibility.0);
    }
}
