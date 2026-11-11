//! History-only cell diff kernel. It has no formula engine: the document
//! engine rebuilds both versions and exports bounded windows of their cells as
//! packed bytes; this kernel aligns rows and columns through the structural
//! operations of the log, compares the cells and writes one bounded page of
//! changes into typed arrays.

mod axis;
mod compare;
mod touch;
mod transfer;

use axis::{Axis, AxisOp, NONE};
use touch::{Touch, Touches};
use transfer::{read_block, Block};
use wasm_bindgen::prelude::*;

/// Rows, columns and writers of one sheet of the later version.
#[derive(Debug)]
struct Sheet {
    rows: Axis,
    cols: Axis,
    touches: Touches,
}

/// One page of changes as parallel columns.
#[derive(Debug, Default)]
struct Page {
    sheet: Vec<u32>,
    row: Vec<u32>,
    col: Vec<u32>,
    before_row: Vec<u32>,
    before_col: Vec<u32>,
    flags: Vec<u8>,
    author: Vec<u32>,
    authored: bool,
}

impl Page {
    const fn len(&self) -> usize {
        self.flags.len()
    }

    fn clear(&mut self) {
        self.sheet.clear();
        self.row.clear();
        self.col.clear();
        self.before_row.clear();
        self.before_col.clear();
        self.flags.clear();
        self.author.clear();
        self.authored = false;
    }
}

/// Diff state for one comparison. JavaScript creates one per request and
/// frees it when the request ends.
#[wasm_bindgen]
#[derive(Debug)]
pub struct DiffKernel {
    sheets: Vec<Option<Sheet>>,
    before_styles: Vec<u32>,
    after_styles: Vec<u32>,
    before: Block,
    after: Block,
    page: Page,
    limit: usize,
    strip: Vec<u8>,
}

#[wasm_bindgen]
impl DiffKernel {
    /// A kernel whose pages hold at most `limit` changes.
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new(limit: u32) -> Self {
        Self {
            sheets: Vec::new(),
            before_styles: Vec::new(),
            after_styles: Vec::new(),
            before: Block::default(),
            after: Block::default(),
            page: Page::default(),
            limit: limit.max(1) as usize,
            strip: Vec::new(),
        }
    }

    /// Track a sheet with `rows` by `cols` cells. A sheet of the earlier
    /// version starts with every line at its earlier position; a sheet added
    /// later has no earlier lines. Returns the sheet's slot.
    #[wasm_bindgen(js_name = addSheet)]
    pub fn add_sheet(&mut self, rows: u32, cols: u32, earlier: bool) -> u32 {
        let (row_axis, col_axis) = if earlier {
            (Axis::identity(rows), Axis::identity(cols))
        } else {
            (Axis::inserted(rows), Axis::inserted(cols))
        };

        self.sheets.push(Some(Sheet {
            rows: row_axis,
            cols: col_axis,
            touches: Touches::default(),
        }));

        (self.sheets.len() - 1) as u32
    }

    /// Stop tracking a removed sheet.
    #[wasm_bindgen(js_name = removeSheet)]
    pub fn remove_sheet(&mut self, slot: u32) {
        if let Some(sheet) = self.sheets.get_mut(slot as usize) {
            *sheet = None;
        }
    }

    /// Rows `at..at + count` were inserted.
    #[wasm_bindgen(js_name = insertRows)]
    pub fn insert_rows(&mut self, slot: u32, at: u32, count: u32) {
        self.rows(slot, AxisOp::Insert { at, count });
    }

    /// Rows `at..at + count` were removed.
    #[wasm_bindgen(js_name = removeRows)]
    pub fn remove_rows(&mut self, slot: u32, at: u32, count: u32) {
        self.rows(slot, AxisOp::Remove { at, count });
    }

    /// Rows `from..from + count` moved to start at row `to`.
    #[wasm_bindgen(js_name = moveRows)]
    pub fn move_rows(&mut self, slot: u32, from: u32, count: u32, to: u32) {
        self.rows(slot, AxisOp::Move { from, count, to });
    }

    /// Columns `at..at + count` were inserted.
    #[wasm_bindgen(js_name = insertCols)]
    pub fn insert_cols(&mut self, slot: u32, at: u32, count: u32) {
        self.cols(slot, AxisOp::Insert { at, count });
    }

    /// Columns `at..at + count` were removed.
    #[wasm_bindgen(js_name = removeCols)]
    pub fn remove_cols(&mut self, slot: u32, at: u32, count: u32) {
        self.cols(slot, AxisOp::Remove { at, count });
    }

    /// Columns `from..from + count` moved to start at column `to`.
    #[wasm_bindgen(js_name = moveCols)]
    pub fn move_cols(&mut self, slot: u32, from: u32, count: u32, to: u32) {
        self.cols(slot, AxisOp::Move { from, count, to });
    }

    /// Record that `author` wrote rows `r0..=r1` and columns `c0..=c1`.
    #[allow(
        clippy::too_many_arguments,
        reason = "a WebAssembly export: JavaScript passes the rectangle as numbers, without building an object per call"
    )]
    pub fn touch(&mut self, slot: u32, r0: u32, c0: u32, r1: u32, c1: u32, author: u32) {
        if let Some(Some(sheet)) = self.sheets.get_mut(slot as usize) {
            sheet.touches.add(Touch {
                r0,
                c0,
                r1,
                c1,
                author,
            });
        }
    }

    /// Content IDs for the style IDs of each version's store.
    #[wasm_bindgen(js_name = setStyles)]
    pub fn set_styles(&mut self, before: &[u32], after: &[u32]) {
        self.before_styles.clear();
        self.before_styles.extend_from_slice(before);
        self.after_styles.clear();
        self.after_styles.extend_from_slice(after);
    }

    /// `[start, length, earlier start]` per row segment; the earlier start is
    /// `0xFFFFFFFF` for inserted rows.
    #[wasm_bindgen(js_name = rowSegments)]
    #[must_use]
    pub fn row_segments(&self, slot: u32) -> Vec<u32> {
        self.segments(slot, true)
    }

    /// `[start, length, earlier start]` per column segment.
    #[wasm_bindgen(js_name = colSegments)]
    #[must_use]
    pub fn col_segments(&self, slot: u32) -> Vec<u32> {
        self.segments(slot, false)
    }

    /// Decode one window of the later version. Returns `false` for bytes that
    /// are not an engine range transfer.
    #[wasm_bindgen(js_name = loadAfter)]
    pub fn load_after(&mut self, bytes: &[u8]) -> bool {
        read_block(bytes, &mut self.after).is_ok()
    }

    /// Decode the earlier cells of the next piece. Returns `false` for bytes
    /// that are not an engine range transfer.
    #[wasm_bindgen(js_name = loadBefore)]
    pub fn load_before(&mut self, bytes: &[u8]) -> bool {
        read_block(bytes, &mut self.before).is_ok()
    }

    /// Compare a `rows` by `cols` piece of the loaded later window, at
    /// `(piece_row, piece_col)` inside it, with the loaded earlier cells (or
    /// with nothing when `earlier` is false). Cells are taken row by row from
    /// ordinal `from`. `row0`, `col0` and `before_row0`, `before_col0` are
    /// the sheet coordinates of the piece in each version. Returns the ordinal
    /// of the next cell to compare: `rows * cols` when the piece is done, less
    /// when the page filled up first.
    #[allow(
        clippy::too_many_arguments,
        reason = "a WebAssembly export: JavaScript passes the piece as numbers, without building an object per call"
    )]
    pub fn compare(
        &mut self,
        slot: u32,
        earlier: bool,
        piece_row: u32,
        piece_col: u32,
        rows: u32,
        cols: u32,
        row0: u32,
        col0: u32,
        before_row0: u32,
        before_col0: u32,
        from: u32,
    ) -> u32 {
        let Some(Some(sheet)) = self.sheets.get(slot as usize) else {
            return rows * cols;
        };

        let window_rows = self.after.rows;
        let total = rows * cols;
        let mut ordinal = from;
        let mut strip = std::mem::take(&mut self.strip);
        const STRIP_ROWS: u32 = 64;

        while ordinal < total && self.page.len() < self.limit {
            let first_row = ordinal / cols;
            let end_row = (first_row + STRIP_ROWS).min(rows);
            let strip_rows = (end_row - first_row) as usize;
            strip.clear();
            strip.resize(strip_rows * cols as usize, 0);
            for col in 0..cols {
                let after_base = (piece_col + col) as usize * window_rows + (piece_row + first_row) as usize;
                let before_base = col as usize * self.before.rows + first_row as usize;
                for r in 0..strip_rows {
                    let after_index = after_base + r;
                    let after = compare::Cell {
                        block: &self.after,
                        index: after_index,
                        style: compare::style(&self.after_styles, self.after.styles[after_index]),
                    };
                    let before = earlier.then(|| {
                        let index = before_base + r;
                        compare::Cell {
                            block: &self.before,
                            index,
                            style: compare::style(&self.before_styles, self.before.styles[index]),
                        }
                    });
                    strip[r * cols as usize + col as usize] = compare::flags(before, after);
                }
            }
            let strip_end = end_row * cols;
            while ordinal < strip_end {
                if self.page.len() >= self.limit {
                    break;
                }
                let flags = strip[(ordinal - first_row * cols) as usize];
                if flags != 0 {
                    let row = ordinal / cols;
                    let col = ordinal % cols;
                    self.page.sheet.push(slot);
                    self.page.row.push(row0 + row);
                    self.page.col.push(col0 + col);
                    self.page.before_row.push(if earlier { before_row0 + row } else { NONE });
                    self.page.before_col.push(if earlier { before_col0 + col } else { NONE });
                    self.page.flags.push(flags);
                }
                ordinal += 1;
            }
        }
        self.strip = strip;
        let _ = sheet;

        ordinal
    }

    /// Changes written since the last `clearPage`.
    #[wasm_bindgen(js_name = pageLength)]
    #[must_use]
    #[allow(
        clippy::missing_const_for_fn,
        reason = "wasm-bindgen cannot export a const fn"
    )]
    pub fn page_length(&self) -> u32 {
        self.page.len() as u32
    }

    /// The sheet slot of each change.
    #[wasm_bindgen(js_name = pageSheets)]
    #[must_use]
    pub fn page_sheets(&mut self) -> Vec<u32> {
        self.finish_page();
        std::mem::take(&mut self.page.sheet)
    }

    /// The later row of each change.
    #[wasm_bindgen(js_name = pageRows)]
    #[must_use]
    pub fn page_rows(&mut self) -> Vec<u32> {
        self.finish_page();
        std::mem::take(&mut self.page.row)
    }

    /// The later column of each change.
    #[wasm_bindgen(js_name = pageCols)]
    #[must_use]
    pub fn page_cols(&mut self) -> Vec<u32> {
        self.finish_page();
        std::mem::take(&mut self.page.col)
    }

    /// The earlier row of each change; `0xFFFFFFFF` for a new row.
    #[wasm_bindgen(js_name = pageBeforeRows)]
    #[must_use]
    pub fn page_before_rows(&mut self) -> Vec<u32> {
        self.finish_page();
        std::mem::take(&mut self.page.before_row)
    }

    /// The earlier column of each change; `0xFFFFFFFF` for a new column.
    #[wasm_bindgen(js_name = pageBeforeCols)]
    #[must_use]
    pub fn page_before_cols(&mut self) -> Vec<u32> {
        self.finish_page();
        std::mem::take(&mut self.page.before_col)
    }

    /// What changed in each cell, as `VALUE`, `FORMULA`, `STYLE`, `ADDED` and `REMOVED` bits.
    #[wasm_bindgen(js_name = pageFlags)]
    #[must_use]
    pub fn page_flags(&mut self) -> Vec<u8> {
        self.finish_page();
        std::mem::take(&mut self.page.flags)
    }

    /// The last writer of each changed cell; `0xFFFFFFFF` when no logged write reaches it.
    #[wasm_bindgen(js_name = pageAuthors)]
    #[must_use]
    pub fn page_authors(&mut self) -> Vec<u32> {
        self.finish_page();
        std::mem::take(&mut self.page.author)
    }

    /// Empty the page so `compare` can fill it again.
    #[wasm_bindgen(js_name = clearPage)]
    pub fn clear_page(&mut self) {
        self.page.clear();
    }

    /// Everyone who wrote a cell of the later version, in the order of their first write.
    #[wasm_bindgen(js_name = cellAuthors)]
    #[must_use]
    pub fn cell_authors(&self, slot: u32, row: u32, col: u32) -> Vec<u32> {
        let mut authors = Vec::new();
        if let Some(Some(sheet)) = self.sheets.get(slot as usize) {
            sheet.touches.authors(row, col, &mut authors);
        }

        authors
    }
}

impl DiffKernel {
    /// Proto: last authors of the page, one sweep over the log per sheet.
    fn finish_page(&mut self) {
        if self.page.authored {
            return;
        }
        self.page.authored = true;
        let len = self.page.flags.len();
        let mut authors = vec![NONE; len];
        let mut order: Vec<u32> = (0..len as u32).collect();
        order.sort_unstable_by_key(|&i| (self.page.sheet[i as usize], self.page.row[i as usize], self.page.col[i as usize]));
        let mut start = 0;
        while start < order.len() {
            let slot = self.page.sheet[order[start] as usize];
            let mut end = start;
            while end < order.len() && self.page.sheet[order[end] as usize] == slot { end += 1; }
            let run = &order[start..end];
            if let Some(Some(sheet)) = self.sheets.get(slot as usize) {
                let rows: Vec<u32> = run.iter().map(|&i| self.page.row[i as usize]).collect();
                sheet.touches.assign_last_authors(&rows, run, &self.page.col, &mut authors);
            }
            start = end;
        }
        self.page.author = authors;
    }

    fn rows(&mut self, slot: u32, op: AxisOp) {
        if let Some(Some(sheet)) = self.sheets.get_mut(slot as usize) {
            sheet.rows.apply(op);
            sheet.touches.apply_rows(op);
        }
    }

    fn cols(&mut self, slot: u32, op: AxisOp) {
        if let Some(Some(sheet)) = self.sheets.get_mut(slot as usize) {
            sheet.cols.apply(op);
            sheet.touches.apply_cols(op);
        }
    }

    fn segments(&self, slot: u32, rows: bool) -> Vec<u32> {
        let Some(Some(sheet)) = self.sheets.get(slot as usize) else {
            return Vec::new();
        };

        let axis = if rows { &sheet.rows } else { &sheet.cols };

        axis.segments()
            .iter()
            .flat_map(|segment| [segment.start, segment.len, segment.origin])
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transfer::tests::{block_bytes, Cell};

    #[test]
    fn pages_changes_with_aligned_rows_and_authors() {
        let mut kernel = DiffKernel::new(10);
        let sheet = kernel.add_sheet(3, 1, true);

        // Row 0 was inserted by author 4; the old rows 0..3 are now rows 1..4.
        kernel.insert_rows(sheet, 0, 1);
        kernel.touch(sheet, 0, 0, 0, 0, 4);
        kernel.touch(sheet, 2, 0, 2, 0, 5);
        assert_eq!(kernel.row_segments(sheet), vec![0, 1, NONE, 1, 3, 0]);

        let after = block_bytes(
            4,
            1,
            &[
                Cell::Text("new"),
                Cell::Number(1.0),
                Cell::Number(9.0),
                Cell::Number(3.0),
            ],
            &[],
        );
        let before = block_bytes(
            3,
            1,
            &[Cell::Number(1.0), Cell::Number(2.0), Cell::Number(3.0)],
            &[],
        );
        assert!(kernel.load_after(&after));

        assert_eq!(
            kernel.compare(sheet, false, 0, 0, 1, 1, 0, 0, NONE, NONE, 0),
            1
        );
        assert!(kernel.load_before(&before));
        assert_eq!(kernel.compare(sheet, true, 1, 0, 3, 1, 1, 0, 0, 0, 0), 3);

        assert_eq!(kernel.page_rows(), vec![0, 2]);
        assert_eq!(kernel.page_before_rows(), vec![NONE, 1]);
        assert_eq!(kernel.page_flags(), vec![compare::ADDED, compare::VALUE]);
        assert_eq!(kernel.page_authors(), vec![4, 5]);
        assert_eq!(kernel.cell_authors(sheet, 2, 0), vec![5]);
    }

    #[test]
    fn stops_when_the_page_is_full_and_resumes_at_the_returned_cell() {
        let mut kernel = DiffKernel::new(1);
        let sheet = kernel.add_sheet(1, 3, false);
        let after = block_bytes(
            1,
            3,
            &[Cell::Number(1.0), Cell::Empty, Cell::Number(3.0)],
            &[],
        );
        assert!(kernel.load_after(&after));

        assert_eq!(
            kernel.compare(sheet, false, 0, 0, 1, 3, 0, 0, NONE, NONE, 0),
            1
        );
        assert_eq!(kernel.page_cols(), vec![0]);

        kernel.clear_page();
        assert_eq!(
            kernel.compare(sheet, false, 0, 0, 1, 3, 0, 0, NONE, NONE, 1),
            3
        );
        assert_eq!(kernel.page_cols(), vec![2]);
    }
}
