//! A wildcard pattern whose tokens cannot be allocated fails its formula with
//! `#NUM!` instead of aborting the engine. This test binary's allocator refuses
//! every allocation above `MAX_ALLOCATION_BYTES`, standing in for a nearly
//! full WebAssembly memory.

use std::alloc::{GlobalAlloc, Layout, System};
use std::ptr::null_mut;

use sheetwrite_wasm::CellStore;

const MAX_ALLOCATION_BYTES: usize = 32 * 1024 * 1024;
/// Under SEARCH's 16 MiB text limit, but its four-byte tokens need 40 MB.
const PATTERN_CHARS: usize = 10_000_000;

struct CappedAllocator;

// SAFETY: every call forwards to `System` unchanged, except that a request
// above the cap returns null, which `GlobalAlloc` allows for any failure.
unsafe impl GlobalAlloc for CappedAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if layout.size() > MAX_ALLOCATION_BYTES {
            null_mut()
        } else {
            System.alloc(layout)
        }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        System.dealloc(ptr, layout)
    }
}

#[global_allocator]
static ALLOCATOR: CappedAllocator = CappedAllocator;

#[test]
fn unallocatable_wildcard_patterns_give_num_errors() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 1);
    store.set_string(sheet, 0, 0, &"a".repeat(PATTERN_CHARS), 0);
    store.set_string(sheet, 0, 1, "b", 0);
    store.set_formula(sheet, 0, 2, "=SEARCH(A1,B1)", 0);
    store.set_formula(sheet, 0, 3, "=COUNTIF(B1,A1&\"*\")", 0);
    store.recompute(sheet);

    for col in [2, 3] {
        assert_eq!(
            store.get_cell(sheet, 0, col).string().as_deref(),
            Some("#NUM!")
        );
    }
}
