//! Rows or columns of one sheet: where each line of the later version was in
//! the earlier version. Structural operations from the log change the map as
//! they are replayed, so an inserted row does not make every row below it a
//! changed row.

/// A line with no earlier position: it was inserted after the earlier version.
pub(crate) const NONE: u32 = u32::MAX;

/// One structural change on an axis.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AxisOp {
    Insert {
        at: u32,
        count: u32,
    },
    Remove {
        at: u32,
        count: u32,
    },
    /// Remove `count` lines at `from`, then insert them at `to`, where `to` is
    /// an index after the removal.
    Move {
        from: u32,
        count: u32,
        to: u32,
    },
}

/// Consecutive later lines `start..start + len` that were `origin..origin + len`,
/// or that are new when `origin` is `NONE`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Segment {
    pub start: u32,
    pub len: u32,
    pub origin: u32,
}

/// The map of one axis as a short list of segments: one per structural change.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Axis {
    segments: Vec<Segment>,
    len: u32,
}

impl Axis {
    /// `len` lines, each at its earlier position.
    pub(crate) fn identity(len: u32) -> Self {
        Self::with_origin(len, 0)
    }

    /// `len` new lines, as in a sheet added after the earlier version.
    pub(crate) fn inserted(len: u32) -> Self {
        Self::with_origin(len, NONE)
    }

    fn with_origin(len: u32, origin: u32) -> Self {
        let segments = if len == 0 {
            Vec::new()
        } else {
            vec![Segment {
                start: 0,
                len,
                origin,
            }]
        };

        Self { segments, len }
    }

    #[cfg(test)]
    pub(crate) const fn len(&self) -> u32 {
        self.len
    }

    pub(crate) fn segments(&self) -> &[Segment] {
        &self.segments
    }

    /// Earlier position of `line`, or `NONE`.
    #[cfg(test)]
    pub(crate) fn origin(&self, line: u32) -> u32 {
        let index = self
            .segments
            .partition_point(|segment| segment.start + segment.len <= line);

        match self.segments.get(index) {
            Some(segment) if segment.start <= line && segment.origin != NONE => {
                segment.origin + (line - segment.start)
            }
            _ => NONE,
        }
    }

    /// Apply `op`; an operation outside the axis is ignored, as the store rejects it.
    pub(crate) fn apply(&mut self, op: AxisOp) {
        match op {
            AxisOp::Insert { at, count } => {
                if count == 0 || at > self.len {
                    return;
                }

                let index = self.split(at);
                self.segments.insert(
                    index,
                    Segment {
                        start: at,
                        len: count,
                        origin: NONE,
                    },
                );
                self.len += count;
            }
            AxisOp::Remove { at, count } => {
                if count == 0 || at.checked_add(count).is_none_or(|end| end > self.len) {
                    return;
                }

                self.take(at, count);
            }
            AxisOp::Move { from, count, to } => {
                if count == 0
                    || from.checked_add(count).is_none_or(|end| end > self.len)
                    || to > self.len - count
                {
                    return;
                }

                let moved = self.take(from, count);
                self.renumber();

                let index = self.split(to);
                self.segments.splice(index..index, moved);
                self.len += count;
            }
        }

        self.renumber();
    }

    /// Index of the segment that starts at `at`, splitting one segment if needed.
    fn split(&mut self, at: u32) -> usize {
        let index = self
            .segments
            .partition_point(|segment| segment.start + segment.len <= at);
        let Some(segment) = self.segments.get(index).copied() else {
            return self.segments.len();
        };

        if segment.start == at {
            return index;
        }

        let head = at - segment.start;
        self.segments[index].len = head;
        self.segments.insert(
            index + 1,
            Segment {
                start: at,
                len: segment.len - head,
                origin: if segment.origin == NONE {
                    NONE
                } else {
                    segment.origin + head
                },
            },
        );

        index + 1
    }

    /// Remove lines `at..at + count` and return their segments.
    fn take(&mut self, at: u32, count: u32) -> Vec<Segment> {
        let first = self.split(at);
        let last = self.split(at + count);
        self.len -= count;

        self.segments.drain(first..last).collect()
    }

    /// Recompute starts and join neighbours that continue each other.
    fn renumber(&mut self) {
        let mut joined: Vec<Segment> = Vec::with_capacity(self.segments.len());
        let mut start = 0;

        for segment in self.segments.drain(..) {
            if segment.len == 0 {
                continue;
            }

            if let Some(last) = joined.last_mut() {
                let continues = if last.origin == NONE {
                    segment.origin == NONE
                } else {
                    segment.origin == last.origin + last.len
                };

                if continues {
                    last.len += segment.len;
                    start += segment.len;
                    continue;
                }
            }

            joined.push(Segment { start, ..segment });
            start += segment.len;
        }

        self.segments = joined;
    }
}

/// Lines `first..=last` after `op`, appended to `out`: none when they were
/// removed, two pieces when lines were inserted inside them.
pub(crate) fn transform(op: AxisOp, first: u32, last: u32, out: &mut Vec<(u32, u32)>) {
    match op {
        AxisOp::Insert { at, count } => {
            if last < at {
                out.push((first, last));
            } else if first >= at {
                out.push((first + count, last + count));
            } else {
                out.push((first, at - 1));
                out.push((at + count, last + count));
            }
        }
        AxisOp::Remove { at, count } => {
            let end = at + count;
            if last < at {
                out.push((first, last));
            } else if first >= end {
                out.push((first - count, last - count));
            } else {
                let start = first.min(at);
                let stop = if last >= end {
                    last - count
                } else {
                    at.wrapping_sub(1)
                };
                if first < at || last >= end {
                    out.push((start, stop));
                }
            }
        }
        AxisOp::Move { from, count, to } => {
            let end = from + count;
            let inside = (first.max(from), last.min(end - 1));
            if inside.0 <= inside.1 {
                out.push((inside.0 - from + to, inside.1 - from + to));
            }

            let mut outside = Vec::with_capacity(2);
            if first < from {
                outside.push((first, last.min(from - 1)));
            }
            if last >= end {
                outside.push((first.max(end), last));
            }

            for (start, stop) in outside {
                let mut removed = Vec::with_capacity(1);
                transform(
                    AxisOp::Remove { at: from, count },
                    start,
                    stop,
                    &mut removed,
                );
                for (start, stop) in removed {
                    transform(AxisOp::Insert { at: to, count }, start, stop, out);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origins(axis: &Axis) -> Vec<u32> {
        (0..axis.len()).map(|line| axis.origin(line)).collect()
    }

    #[test]
    fn insert_and_remove_keep_the_earlier_position_of_every_other_line() {
        let mut axis = Axis::identity(6);

        axis.apply(AxisOp::Insert { at: 2, count: 2 });
        assert_eq!(origins(&axis), vec![0, 1, NONE, NONE, 2, 3, 4, 5]);

        axis.apply(AxisOp::Remove { at: 3, count: 3 });
        assert_eq!(origins(&axis), vec![0, 1, NONE, 4, 5]);
        assert_eq!(axis.segments().len(), 3);
    }

    #[test]
    fn a_move_keeps_the_moved_lines_and_joins_segments_back() {
        let mut axis = Axis::identity(5);

        axis.apply(AxisOp::Move {
            from: 0,
            count: 2,
            to: 3,
        });
        assert_eq!(origins(&axis), vec![2, 3, 4, 0, 1]);

        axis.apply(AxisOp::Move {
            from: 3,
            count: 2,
            to: 0,
        });
        assert_eq!(origins(&axis), vec![0, 1, 2, 3, 4]);
        assert_eq!(axis.segments().len(), 1);
    }

    #[test]
    fn an_operation_outside_the_axis_changes_nothing() {
        let mut axis = Axis::identity(3);

        axis.apply(AxisOp::Remove { at: 2, count: 2 });
        axis.apply(AxisOp::Insert { at: 4, count: 1 });
        axis.apply(AxisOp::Move {
            from: 0,
            count: 2,
            to: 2,
        });

        assert_eq!(axis, Axis::identity(3));
    }

    #[test]
    fn transforms_line_ranges_like_the_axis() {
        let mut out = Vec::new();

        transform(AxisOp::Insert { at: 3, count: 2 }, 1, 4, &mut out);
        assert_eq!(out, vec![(1, 2), (5, 6)]);

        out.clear();
        transform(AxisOp::Remove { at: 2, count: 3 }, 1, 6, &mut out);
        assert_eq!(out, vec![(1, 3)]);

        out.clear();
        transform(AxisOp::Remove { at: 2, count: 3 }, 2, 4, &mut out);
        assert!(out.is_empty());

        out.clear();
        transform(
            AxisOp::Move {
                from: 0,
                count: 2,
                to: 3,
            },
            1,
            2,
            &mut out,
        );
        assert_eq!(out, vec![(4, 4), (0, 0)]);
    }
}
