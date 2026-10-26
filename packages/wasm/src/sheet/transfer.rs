//! Sheet coordinator state; physical cells transfer through `CellStorage`.

use super::*;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};

impl SheetData {
    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        self.cells.write_transfer(out);

        out.usize(self.spill_ranges.len());

        for (&(row, col), range) in &self.spill_ranges {
            out.u32(row);
            out.u32(col);
            out.u32(range.anchor.0);
            out.u32(range.anchor.1);
            out.u32(range.row_end);
            out.u32(range.col_end);
        }

        out.usize(self.spill_owners.len());

        for (&(row, col), &(anchor_row, anchor_col)) in &self.spill_owners {
            out.u32(row);
            out.u32(col);
            out.u32(anchor_row);
            out.u32(anchor_col);
        }

        out.usize(self.spill_blockers.len());

        for blocker in &self.spill_blockers {
            out.u32(blocker.row_start);
            out.u32(blocker.col_start);
            out.u32(blocker.row_end);
            out.u32(blocker.col_end);
        }

        out.usize(self.dirty_cells.len());

        for &(row, col) in &self.dirty_cells {
            out.u32(row);
            out.u32(col);
        }

        out.bool(self.all_dirty);
        // Conditional rules contain parsed ASTs and are lazily rebuilt by the host.
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        let cells = CellStorage::read_transfer(input)?;
        let mut sheet = Self {
            cells,
            formulas: FxHashMap::default(),
            spill_ranges: FxHashMap::default(),
            spill_owners: FxHashMap::default(),
            spill_blockers: Vec::new(),
            dirty_cells: FxHashSet::default(),
            all_dirty: false,
            cond_rules: Vec::new(),
        };

        for _ in 0..input.count()? {
            let key = (input.u32()?, input.u32()?);
            let range = SpillRange {
                anchor: (input.u32()?, input.u32()?),
                row_end: input.u32()?,
                col_end: input.u32()?,
            };
            sheet.spill_ranges.insert(key, range);
        }

        for _ in 0..input.count()? {
            sheet
                .spill_owners
                .insert((input.u32()?, input.u32()?), (input.u32()?, input.u32()?));
        }

        for _ in 0..input.count()? {
            sheet.spill_blockers.push(SpillBlocker {
                row_start: input.u32()?,
                col_start: input.u32()?,
                row_end: input.u32()?,
                col_end: input.u32()?,
            });
        }

        for _ in 0..input.count()? {
            sheet.dirty_cells.insert((input.u32()?, input.u32()?));
        }

        sheet.all_dirty = input.bool()?;
        Ok(sheet)
    }
}
