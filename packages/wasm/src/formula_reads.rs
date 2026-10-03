//! Same-sheet cells that the formulas of a visible window read.
//!
//! A windowed datasource loads only the columns on screen. A formula there can
//! read a column that is off screen, and it shows `#LOADING!` until that column
//! loads. The datasource controller asks for these read bands so it can load
//! them with the window.

use std::collections::{BTreeMap, HashSet};

use wasm_bindgen::prelude::*;

use crate::sheet::SheetData;
use crate::store::CellStore;
use crate::types::{cell_key, CellKey, CellRange};

#[wasm_bindgen]
impl CellStore {
    /// Same-sheet cells that the formulas in `start_row..end_row` × `cols`
    /// read, as flat `[row_start, row_end, col_start, col_end)` rectangles.
    ///
    /// The walk follows each read into the formula cells it reaches, so for
    /// `H = F - G` and `F = D - E` it reports `D`, `E`, `F`, and `G`. It skips
    /// reads of other sheets. `max_cells` bounds the walk: a read larger than
    /// the remaining budget is skipped, so one whole-column range cannot make a
    /// window demand the full column. Rectangles are disjoint and ascend by
    /// column, then by row.
    #[wasm_bindgen(js_name = formulaReadBands)]
    pub fn formula_read_bands(
        &self,
        sheet: usize,
        start_row: usize,
        end_row: usize,
        cols: &[u32],
        max_cells: usize,
    ) -> Vec<u32> {
        let (Some(data), Ok(handle)) = (self.sheets.get(sheet), u32::try_from(sheet)) else {
            return Vec::new();
        };
        if data.formulas.is_empty() {
            return Vec::new();
        }
        let mut walk = ReadWalk::new(data, handle, max_cells);
        let end_row = end_row.min(data.row_count);
        for &col in cols {
            for row in start_row..end_row {
                if let Some(key) = cell_key(row, col as usize) {
                    walk.visit(key);
                }
            }
        }
        walk.run();
        walk.into_rectangles()
    }
}

struct ReadWalk<'a> {
    data: &'a SheetData,
    handle: u32,
    remaining_cells: usize,
    visited: HashSet<CellKey>,
    pending: Vec<CellKey>,
    /// Half-open row intervals per column, unsorted until `into_rectangles`.
    rows_by_col: BTreeMap<u32, Vec<(u32, u32)>>,
}

impl<'a> ReadWalk<'a> {
    fn new(data: &'a SheetData, handle: u32, max_cells: usize) -> Self {
        Self {
            data,
            handle,
            remaining_cells: max_cells,
            visited: HashSet::new(),
            pending: Vec::new(),
            rows_by_col: BTreeMap::new(),
        }
    }

    /// Queues a formula cell once; cells without a formula read nothing.
    fn visit(&mut self, key: CellKey) {
        if self.data.formulas.contains_key(&key) && self.visited.insert(key) {
            self.pending.push(key);
        }
    }

    fn run(&mut self) {
        while let Some(key) = self.pending.pop() {
            let Some(entry) = self.data.formulas.get(&key) else {
                continue;
            };
            for cell in &entry.reads.cells {
                if cell.sheet != self.handle {
                    continue;
                }
                let range = CellRange::new(cell.sheet, cell.row, cell.col, cell.row, cell.col);
                self.read_range(range);
            }
            for &range in &entry.reads.ranges {
                if range.sheet == self.handle {
                    self.read_range(range);
                }
            }
        }
    }

    /// Records an inclusive read range clamped to the sheet, then queues the
    /// formula cells inside it. Skips the range when it exceeds the budget.
    fn read_range(&mut self, range: CellRange) {
        let (Ok(row_count), Ok(col_count)) = (
            u32::try_from(self.data.row_count),
            u32::try_from(self.data.n_cols),
        ) else {
            return;
        };
        if row_count == 0 || col_count == 0 {
            return;
        }
        let row_start = range.row_start.min(range.row_end);
        let col_start = range.col_start.min(range.col_end);
        let row_end = range.row_start.max(range.row_end).min(row_count - 1);
        let col_end = range.col_start.max(range.col_end).min(col_count - 1);
        if row_start > row_end || col_start > col_end {
            return;
        }
        let rows = (row_end - row_start + 1) as usize;
        let cols = (col_end - col_start + 1) as usize;
        let Some(cells) = rows.checked_mul(cols) else {
            return;
        };
        if cells > self.remaining_cells {
            return;
        }
        self.remaining_cells -= cells;
        for col in col_start..=col_end {
            self.rows_by_col
                .entry(col)
                .or_default()
                .push((row_start, row_end + 1));
            for row in row_start..=row_end {
                self.visit((row, col));
            }
        }
    }

    /// Merges each column's rows, then joins adjacent columns with equal rows.
    fn into_rectangles(self) -> Vec<u32> {
        let mut merged: Vec<(u32, Vec<(u32, u32)>)> = Vec::with_capacity(self.rows_by_col.len());
        for (col, mut rows) in self.rows_by_col {
            rows.sort_unstable();
            let mut disjoint: Vec<(u32, u32)> = Vec::with_capacity(rows.len());
            for (start, end) in rows {
                match disjoint.last_mut() {
                    Some(last) if start <= last.1 => last.1 = last.1.max(end),
                    _ => disjoint.push((start, end)),
                }
            }
            merged.push((col, disjoint));
        }

        let mut out = Vec::new();
        let mut index = 0;
        while index < merged.len() {
            let (first_col, rows) = &merged[index];
            let mut next = index + 1;
            while next < merged.len()
                && merged[next].0 == merged[next - 1].0 + 1
                && merged[next].1 == *rows
            {
                next += 1;
            }
            let col_end = merged[next - 1].0 + 1;
            for &(row_start, row_end) in rows {
                out.extend_from_slice(&[row_start, row_end, *first_col, col_end]);
            }
            index = next;
        }
        out
    }
}
