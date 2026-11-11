//! The REGEX functions keep no compiled pattern after their formula is gone.
//! This test binary's allocator counts live heap bytes, so memory that a
//! workbook leaves behind after it is dropped shows up as a difference.
#![cfg(feature = "analysis")]

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

use sheetwrite_wasm::CellStore;

/// Patterns that each compile to a distinct program of several kilobytes.
const PATTERNS: [&str; 3] = ["(alpha|beta){40}", "(gamma|delta){40}", "(kappa|sigma){40}"];

struct CountingAllocator;

static LIVE_BYTES: AtomicUsize = AtomicUsize::new(0);

// SAFETY: every call forwards to `System` unchanged and only adjusts a counter.
#[allow(unsafe_code, reason = "the test replaces the global allocator")]
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = System.alloc(layout);
        if !pointer.is_null() {
            LIVE_BYTES.fetch_add(layout.size(), Ordering::Relaxed);
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

/// Builds a workbook with one formula per REGEX function, all using
/// `pattern`, recalculates it, checks its results and drops it.
fn evaluate_and_drop(pattern: &str) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 3);
    store.set_formula(
        sheet,
        0,
        0,
        &format!("=VALUETOTEXT(REGEXTEST(\"x\",\"{pattern}\"))"),
        0,
    );
    store.set_formula(
        sheet,
        1,
        0,
        &format!("=REGEXREPLACE(\"x\",\"{pattern}\",\"y\")"),
        0,
    );
    store.set_formula(
        sheet,
        2,
        0,
        &format!("=IFNA(REGEXEXTRACT(\"x\",\"{pattern}\"),\"none\")"),
        0,
    );

    store.recompute(sheet);

    assert_eq!(
        store.get_cell(sheet, 0, 0).string().as_deref(),
        Some("FALSE")
    );
    assert_eq!(store.get_cell(sheet, 1, 0).string().as_deref(), Some("x"));
    assert_eq!(
        store.get_cell(sheet, 2, 0).string().as_deref(),
        Some("none")
    );
}

#[test]
fn regex_memory_is_released_with_the_formula() {
    evaluate_and_drop(PATTERNS[0]);
    let settled = LIVE_BYTES.load(Ordering::Relaxed);

    for pattern in &PATTERNS[1..] {
        evaluate_and_drop(pattern);
    }

    assert_eq!(LIVE_BYTES.load(Ordering::Relaxed), settled);
}
