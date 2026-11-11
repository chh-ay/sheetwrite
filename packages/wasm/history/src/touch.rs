//! Who changed which cells of one sheet, in the coordinates of the later
//! version. Each log operation that writes cells adds one rectangle with its
//! author; structural operations move, cut or remove the rectangles as they
//! move the cells, so authorship follows the cells, not the final row number.

use crate::axis::{transform, AxisOp, NONE};

/// Rows `r0..=r1` and columns `c0..=c1`, written by `author`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Touch {
    pub r0: u32,
    pub c0: u32,
    pub r1: u32,
    pub c1: u32,
    pub author: u32,
}

impl Touch {
    const fn contains(&self, row: u32, col: u32) -> bool {
        self.r0 <= row && row <= self.r1 && self.c0 <= col && col <= self.c1
    }
}

/// Rectangles in log order: a later rectangle is a later write.
#[derive(Debug, Default)]
pub(crate) struct Touches {
    list: Vec<Touch>,
    scratch: Vec<Touch>,
    lines: Vec<(u32, u32)>,
}

impl Touches {
    pub(crate) fn add(&mut self, touch: Touch) {
        if touch.r0 > touch.r1 || touch.c0 > touch.c1 {
            return;
        }

        // A repeated write of the same cells by the same person adds nothing.
        if self.list.last() == Some(&touch) {
            return;
        }

        self.list.push(touch);
    }

    #[cfg(test)]
    pub(crate) const fn len(&self) -> usize {
        self.list.len()
    }

    /// Move the rows of every rectangle as `op` moves the rows of the sheet.
    pub(crate) fn apply_rows(&mut self, op: AxisOp) {
        self.apply(op, true);
    }

    /// Move the columns of every rectangle as `op` moves the columns of the sheet.
    pub(crate) fn apply_cols(&mut self, op: AxisOp) {
        self.apply(op, false);
    }

    fn apply(&mut self, op: AxisOp, rows: bool) {
        self.scratch.clear();

        for touch in &self.list {
            self.lines.clear();
            let (first, last) = if rows {
                (touch.r0, touch.r1)
            } else {
                (touch.c0, touch.c1)
            };
            transform(op, first, last, &mut self.lines);

            for &(first, last) in &self.lines {
                self.scratch.push(if rows {
                    Touch {
                        r0: first,
                        r1: last,
                        ..*touch
                    }
                } else {
                    Touch {
                        c0: first,
                        c1: last,
                        ..*touch
                    }
                });
            }
        }

        std::mem::swap(&mut self.list, &mut self.scratch);
    }

    /// The last person who wrote the cell, or `NONE` when no logged write reaches it.
    pub(crate) fn last_author(&self, row: u32, col: u32) -> u32 {
        self.list
            .iter()
            .rev()
            .find(|touch| touch.contains(row, col))
            .map_or(NONE, |touch| touch.author)
    }

    /// Every person who wrote the cell, in the order of their first write.
    pub(crate) fn authors(&self, row: u32, col: u32, out: &mut Vec<u32>) {
        for touch in &self.list {
            if touch.contains(row, col) && !out.contains(&touch.author) {
                out.push(touch.author);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(r0: u32, c0: u32, r1: u32, c1: u32, author: u32) -> Touch {
        Touch {
            r0,
            c0,
            r1,
            c1,
            author,
        }
    }

    #[test]
    fn the_last_write_names_the_author_and_all_writers_are_kept() {
        let mut touches = Touches::default();
        touches.add(rect(0, 0, 9, 3, 1));
        touches.add(rect(2, 1, 2, 1, 2));

        assert_eq!(touches.last_author(2, 1), 2);
        assert_eq!(touches.last_author(5, 0), 1);
        assert_eq!(touches.last_author(10, 0), NONE);

        let mut authors = Vec::new();
        touches.authors(2, 1, &mut authors);
        assert_eq!(authors, vec![1, 2]);
    }

    #[test]
    fn authorship_follows_cells_through_inserted_and_removed_rows() {
        let mut touches = Touches::default();
        touches.add(rect(4, 0, 4, 0, 7));

        touches.apply_rows(AxisOp::Insert { at: 1, count: 3 });
        assert_eq!(touches.last_author(7, 0), 7);
        assert_eq!(touches.last_author(4, 0), NONE);

        touches.apply_rows(AxisOp::Remove { at: 7, count: 1 });
        assert_eq!(touches.len(), 0);
    }

    #[test]
    fn a_cleared_and_reinserted_cell_keeps_both_writers() {
        let mut touches = Touches::default();
        touches.add(rect(3, 2, 3, 2, 1));
        touches.apply_cols(AxisOp::Remove { at: 2, count: 1 });
        touches.apply_cols(AxisOp::Insert { at: 2, count: 1 });
        touches.add(rect(3, 2, 3, 2, 4));

        assert_eq!(touches.last_author(3, 2), 4);
    }
}
