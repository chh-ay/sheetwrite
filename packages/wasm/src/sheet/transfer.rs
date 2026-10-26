//! Sheet coordinator state; each owned module transfers its own state.

use super::*;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};

impl SheetData {
    /// Resident state only: an unloaded clean datasource cell stays unloaded.
    /// Formula entries follow through the store's formula codec, and
    /// conditional rules are re-sent by the host.
    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        self.cells.write_transfer(out);
        self.spill.write_transfer(out);
        self.formulas.write_transfer(out);
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        let cells = CellStorage::read_transfer(input)?;
        let spill = SpillState::read_transfer(input)?;
        let formulas = SheetFormulas::read_transfer(input)?;

        Ok(Self {
            cells,
            formulas,
            spill,
        })
    }
}
