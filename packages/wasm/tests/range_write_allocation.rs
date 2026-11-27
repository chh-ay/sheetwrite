//! A range write that runs out of memory part of the way through changes no
//! cell, so the `false` it returns means that nothing happened. While armed,
//! this test binary's allocator refuses every allocation on the test thread
//! above `MAX_ALLOCATION_BYTES`, standing in for a nearly full WebAssembly
//! memory.

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::ptr::null_mut;

use sheetwrite_wasm::CellStore;

const MAX_ALLOCATION_BYTES: usize = 16 * 1024;
/// Edited cells in one column. A new edit lists each cell it writes in four
/// bytes, so its list outgrows `MAX_ALLOCATION_BYTES` part of the way down.
const ROWS: usize = 5_000;

struct CappedAllocator;

thread_local! {
    static ARMED: Cell<bool> = const { Cell::new(false) };
}

// SAFETY: every call forwards to `System` unchanged, except that a request
// above the cap while armed returns null, which `GlobalAlloc` allows for any
// failure.
#[allow(unsafe_code, reason = "the test replaces the global allocator")]
unsafe impl GlobalAlloc for CappedAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if layout.size() > MAX_ALLOCATION_BYTES && ARMED.with(Cell::get) {
            null_mut()
        } else {
            // SAFETY: the caller's contract for `alloc` is the one `System` needs.
            unsafe { System.alloc(layout) }
        }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // SAFETY: `ptr` came from `System.alloc` with this `layout`.
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: CappedAllocator = CappedAllocator;

/// Runs `write` with the allocator's cap armed.
fn armed<T>(write: impl FnOnce() -> T) -> T {
    ARMED.with(|armed| armed.set(true));
    let result = write();
    ARMED.with(|armed| armed.set(false));
    result
}

/// Every cell of the column still holds 1 with style 3.
fn assert_unchanged(store: &CellStore, sheet: usize, context: &str) {
    for row in 0..ROWS {
        let cell = store.get_cell(sheet, row, 0);
        assert_eq!((cell.num(), cell.style()), (1.0, 3), "{context}: row {row}");
    }
}

#[test]
fn a_range_write_that_runs_out_of_memory_changes_no_cell() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(1, ROWS, 0, 1_000_000, ROWS);
    for row in 0..ROWS {
        store.set_number(sheet, row, 0, 1.0, 3);
    }

    let remapped = armed(|| store.remap_range_styles(sheet, 0, 0, ROWS - 1, 0, &[3], &[4]));
    assert!(!remapped, "the style remap fails");
    assert_unchanged(&store, sheet, "after the style remap");

    let cleared = armed(|| store.clear_range(sheet, 0, 0, ROWS - 1, 0, true, true));
    assert!(!cleared, "the clear fails");
    assert_unchanged(&store, sheet, "after the clear");
}
