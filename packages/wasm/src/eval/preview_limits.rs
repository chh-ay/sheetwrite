//! Smaller resource limits for one read-only formula preview.
//!
//! Ordinary evaluation never opens a preview, and every hook below starts
//! with one thread-local read at a range read, an array allocation, a text
//! output or a LAMBDA call. No hook runs per expression or per range cell.

use std::cell::Cell;

use crate::sheet::SheetData;
use crate::types::{FormulaError, LITERAL_KIND_BITS};
#[cfg(feature = "analysis")]
use crate::types::{KIND_EMPTY, KIND_NUMBER};

/// Cells a preview reads through typed scans of kind and payload arrays.
pub(super) const PREVIEW_TYPED_CELLS: usize = 1_000_000;
/// Cells a preview reads one by one: paged cells, formula and spill cells,
/// and every cell copied into an array.
pub(super) const PREVIEW_CELL_READS: usize = 50_000;
/// Cells of the largest array a preview may build.
pub(super) const PREVIEW_ARRAY_CELLS: usize = 10_000;
/// LAMBDA calls and the source-tree nodes the safety walk visits.
pub(super) const PREVIEW_WORK: usize = 50_000;
/// Text bytes the preview's text functions may produce in total.
pub(super) const PREVIEW_TEXT_BYTES: usize = 1 << 20;

#[derive(Clone, Copy, Default)]
struct Budget {
    typed: usize,
    cells: usize,
    work: usize,
    text: usize,
    exceeded: bool,
}

thread_local! {
    static ACTIVE: Cell<Option<Budget>> = const { Cell::new(None) };
}

/// The budget of one preview request. Dropping it restores the enclosing
/// state, so an early return or a nested preview leaves nothing behind.
pub(super) struct PreviewScope {
    enclosing: Option<Budget>,
}

impl PreviewScope {
    /// Opens a preview request with an empty budget.
    pub(super) fn enter() -> Self {
        let enclosing = ACTIVE.with(|active| active.replace(Some(Budget::default())));
        Self { enclosing }
    }

    /// Whether any limit refused work, even where IFERROR caught the error.
    pub(super) fn exceeded(&self) -> bool {
        ACTIVE.with(|active| active.get().is_some_and(|budget| budget.exceeded))
    }

    /// Charges `steps` of request work outside the evaluator: the safety walk.
    pub(super) fn charge_work(&self, steps: usize) -> Result<(), FormulaError> {
        charge(|budget| add(&mut budget.work, steps, PREVIEW_WORK))
    }
}

impl Drop for PreviewScope {
    fn drop(&mut self) {
        let enclosing = self.enclosing;
        ACTIVE.with(|active| active.set(enclosing));
    }
}

/// Whether a preview is being evaluated on this thread.
#[inline]
fn active() -> bool {
    ACTIVE.with(|active| active.get().is_some())
}

const fn add(counter: &mut usize, amount: usize, limit: usize) -> bool {
    *counter = counter.saturating_add(amount);
    *counter <= limit
}

/// Applies `update` to the active budget. A refusal is sticky: once a limit
/// is passed, every later charge fails too, so no partial answer survives.
#[cold]
#[inline(never)]
fn charge(update: impl FnOnce(&mut Budget) -> bool) -> Result<(), FormulaError> {
    ACTIVE.with(|active| {
        let Some(mut budget) = active.get() else {
            return Ok(());
        };
        let accepted = !budget.exceeded && update(&mut budget);
        budget.exceeded |= !accepted;
        active.set(Some(budget));
        if accepted {
            Ok(())
        } else {
            Err(FormulaError::Num)
        }
    })
}

/// How a whole-range read reaches its cells.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum RangeRead {
    /// Literal cells are read from the kind and payload arrays; formula and
    /// spill cells are evaluated one by one.
    Typed,
    /// Only number literals and empty cells bypass per-cell evaluation.
    #[cfg(feature = "analysis")]
    Numbers,
    /// Every cell is read one by one.
    Cells,
}

/// Charges a whole-range read before its first cell. Call it once per read,
/// never inside the read's loop.
#[inline]
pub(super) fn range(
    data: &SheetData,
    (row_start, col_start): (usize, usize),
    (rows, cols): (usize, usize),
    read: RangeRead,
) -> Result<(), FormulaError> {
    if active() {
        charge_range(data, (row_start, col_start), (rows, cols), read)
    } else {
        Ok(())
    }
}

#[cold]
#[inline(never)]
fn charge_range(
    data: &SheetData,
    (row_start, col_start): (usize, usize),
    (rows, cols): (usize, usize),
    read: RangeRead,
) -> Result<(), FormulaError> {
    let cells = rows.saturating_mul(cols);
    let dense = data.cells.dense_sources();
    let Some(sources) = dense.filter(|_| read != RangeRead::Cells) else {
        return charge(|budget| add(&mut budget.cells, cells, PREVIEW_CELL_READS));
    };
    if cells > PREVIEW_TYPED_CELLS {
        return charge(|_| false);
    }

    // Formula and spill cells are read one by one even in a typed scan.
    let (kinds, _) = sources.raw();
    let mut computed = 0usize;
    for col in col_start..col_start + cols {
        let start = data.cells.idx(row_start, col);
        let column = kinds.get(start..start + rows).unwrap_or_default();
        computed += column
            .iter()
            .filter(|&&kind| match read {
                RangeRead::Typed => kind & !LITERAL_KIND_BITS != 0,
                #[cfg(feature = "analysis")]
                RangeRead::Numbers => !matches!(kind, KIND_EMPTY | KIND_NUMBER),
                RangeRead::Cells => true,
            })
            .count();
    }
    charge(|budget| {
        add(&mut budget.typed, cells, PREVIEW_TYPED_CELLS)
            && add(&mut budget.cells, computed, PREVIEW_CELL_READS)
    })
}

/// Charges one cell read one by one, such as the cell scalar INDEX selects.
#[inline]
pub(super) fn cell() -> Result<(), FormulaError> {
    if active() {
        charge(|budget| add(&mut budget.cells, 1, PREVIEW_CELL_READS))
    } else {
        Ok(())
    }
}

/// Refuses an array of `cells` values before it is allocated.
#[inline]
pub(super) fn array(cells: usize) -> Result<(), FormulaError> {
    if active() && cells > PREVIEW_ARRAY_CELLS {
        charge(|_| false)
    } else {
        Ok(())
    }
}

/// Charges one LAMBDA call or step of helper work.
#[cfg_attr(
    not(feature = "analysis"),
    allow(
        dead_code,
        reason = "only the full engine's LAMBDA helpers charge calls"
    )
)]
#[inline]
pub(super) fn work(steps: usize) -> Result<(), FormulaError> {
    if active() {
        charge(|budget| add(&mut budget.work, steps, PREVIEW_WORK))
    } else {
        Ok(())
    }
}

/// Charges `bytes` of text output before a text function writes it.
#[inline]
pub(super) fn text(bytes: usize) -> Result<(), FormulaError> {
    if active() {
        charge(|budget| add(&mut budget.text, bytes, PREVIEW_TEXT_BYTES))
    } else {
        Ok(())
    }
}
