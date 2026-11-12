//! The REGEX functions keep no compiled pattern after their formula is gone.
//! Count only the engine's test thread: libtest allocates on its runner thread
//! concurrently, even when this binary has only one test. The exact live-byte
//! comparison must not include that unrelated work.
#![cfg(feature = "analysis")]

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

use sheetwrite_wasm::CellStore;

/// Patterns that each compile to a distinct program of several kilobytes.
const PATTERNS: [&str; 3] = ["(alpha|beta){40}", "(gamma|delta){40}", "(kappa|sigma){40}"];

struct CountingAllocator;

thread_local! {
    /// Live bytes this thread allocated. Wrapping, because one thread can free
    /// what another allocated; only the test thread's difference is compared.
    static LIVE_BYTES: Cell<usize> = const { Cell::new(0) };
}

// SAFETY: every call forwards to `System` unchanged and only adjusts a counter.
#[allow(unsafe_code, reason = "the test replaces the global allocator")]
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = System.alloc(layout);
        if !pointer.is_null() {
            LIVE_BYTES.with(|bytes| bytes.set(bytes.get().wrapping_add(layout.size())));
        }
        pointer
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        LIVE_BYTES.with(|bytes| bytes.set(bytes.get().wrapping_sub(layout.size())));
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
    let settled = LIVE_BYTES.with(Cell::get);

    for pattern in &PATTERNS[1..] {
        evaluate_and_drop(pattern);
    }

    assert_eq!(LIVE_BYTES.with(Cell::get), settled);
}
