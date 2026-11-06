//! A literal REGEX pattern compiles once for the formulas that hold it, not
//! once per recalculation, and its program is freed with the last of them.
//! This test binary's allocator counts allocated and live heap bytes.
#![cfg(feature = "analysis")]

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

use sheetwrite_wasm::CellStore;

/// Compiles to a program of tens of kilobytes, far above anything else one
/// recalculation of these formulas allocates.
const LARGE_PATTERN: &str = "(alpha|beta){40}";
/// Below the compiled size of `LARGE_PATTERN` by a wide margin.
const RECOMPILE_BYTES: usize = 16 * 1024;
const FORMULAS: usize = 4;

struct CountingAllocator;

static LIVE_BYTES: AtomicUsize = AtomicUsize::new(0);
static ALLOCATED_BYTES: AtomicUsize = AtomicUsize::new(0);

// SAFETY: every call forwards to `System` unchanged and only adjusts counters.
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = System.alloc(layout);
        if !pointer.is_null() {
            LIVE_BYTES.fetch_add(layout.size(), Ordering::Relaxed);
            ALLOCATED_BYTES.fetch_add(layout.size(), Ordering::Relaxed);
        }
        pointer
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        LIVE_BYTES.fetch_sub(layout.size(), Ordering::Relaxed);
        System.dealloc(pointer, layout)
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

fn set_regex_formulas(store: &mut CellStore, sheet: usize, pattern: &str) {
    for row in 0..FORMULAS {
        store.set_formula(
            sheet,
            row,
            1,
            &format!("=VALUETOTEXT(REGEXTEST($A$1,\"{pattern}\"))"),
            0,
        );
    }
}

fn clear_formulas(store: &mut CellStore, sheet: usize) {
    for row in 0..FORMULAS {
        store.set_number(sheet, row, 1, 0.0, 0);
    }
    store.recompute(sheet);
}

#[test]
fn literal_patterns_compile_once_and_leave_with_their_formulas() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, FORMULAS);
    store.set_string(sheet, 0, 0, "alpha", 0);

    // Warm the store's own buffers with a pattern this test does not reuse.
    set_regex_formulas(&mut store, sheet, "warm");
    store.recompute(sheet);
    clear_formulas(&mut store, sheet);
    let before_formulas = LIVE_BYTES.load(Ordering::Relaxed);

    set_regex_formulas(&mut store, sheet, LARGE_PATTERN);
    store.recompute(sheet);
    store.set_string(sheet, 0, 0, "beta", 0);
    let allocated_before_edit = ALLOCATED_BYTES.load(Ordering::Relaxed);
    store.recompute(sheet);
    let edit_allocations = ALLOCATED_BYTES.load(Ordering::Relaxed) - allocated_before_edit;

    assert_eq!(
        store.get_cell(sheet, 0, 1).string().as_deref(),
        Some("FALSE")
    );
    assert!(
        edit_allocations < RECOMPILE_BYTES,
        "the recalculation after an edit allocated {edit_allocations} B"
    );

    clear_formulas(&mut store, sheet);
    let after_formulas = LIVE_BYTES.load(Ordering::Relaxed);
    assert!(
        after_formulas < before_formulas + RECOMPILE_BYTES,
        "{} B stay live after the formulas are gone",
        after_formulas - before_formulas
    );
}
