//! Conditional-format formulas evaluate at each visible cell without copying
//! their parsed formula, so a window read allocates the same number of times
//! however many cells its rules cover. This test binary's allocator counts
//! allocations.

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

use sheetwrite_wasm::CellStore;

const COLS: u32 = 100;
const ROWS: u32 = 1_000;
/// Relative, mixed and absolute cells and a range. Each call of `MOD` or
/// `AND` allocates once of its own, so a rule with one would hide whether
/// the formula itself is copied.
const FORMULAS: [&str; 3] = ["=A1>$A$2", "=$A1+B$1>C2", "=SUM($A1:$C1)>12"];
const FORMULA_KIND: u8 = 6;
const GREATER_KIND: u8 = 0;

struct CountingAllocator;

static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);

// SAFETY: every call forwards to `System` unchanged and only counts.
#[allow(unsafe_code, reason = "the test replaces the global allocator")]
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        // SAFETY: the caller's `layout` contract passes on to `System` unchanged.
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        // SAFETY: `pointer` came from `alloc` above, so from `System`, with `layout`.
        unsafe { System.dealloc(pointer, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

fn store_with_rules() -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(COLS as usize, ROWS as usize);
    for row in 0..ROWS {
        for col in 0..COLS {
            store.set_number(
                sheet,
                row as usize,
                col as usize,
                f64::from((row * 7 + col * 3) % 10),
                0,
            );
        }
    }
    let rules = FORMULAS.len() + 1;
    let mut kinds = vec![FORMULA_KIND; FORMULAS.len()];
    kinds.push(GREATER_KIND);
    let bounds: Vec<u32> = (0..rules)
        .flat_map(|_| [0, 0, ROWS - 1, COLS - 1])
        .collect();
    let mut nums = vec![0.0; FORMULAS.len()];
    nums.push(4.0);
    let mut sources: Vec<String> = FORMULAS.iter().map(|source| (*source).to_owned()).collect();
    sources.push(String::new());
    store.set_conditional_rules(sheet, &kinds, &bounds, &nums, sources, &vec![0; rules]);
    (store, sheet)
}

/// Allocations of one window read over `rows` rows, and its packed bytes.
fn window_allocations(
    store: &CellStore,
    sheet: usize,
    rows: usize,
    cols: &[u32],
) -> (usize, Vec<u8>) {
    let before = ALLOCATIONS.load(Ordering::Relaxed);
    let mut view = store.get_window(sheet, 0, rows, cols);
    let allocations = ALLOCATIONS.load(Ordering::Relaxed) - before;
    (allocations, view.take_packed())
}

#[test]
fn window_reads_allocate_independently_of_covered_cells() {
    let (store, sheet) = store_with_rules();
    let cols: Vec<u32> = (0..COLS).collect();
    // Warm any buffer the first evaluation sizes.
    let _ = window_allocations(&store, sheet, 10, &cols);

    let (small, small_packed) = window_allocations(&store, sheet, 10, &cols);
    let (large, large_packed) = window_allocations(&store, sheet, ROWS as usize, &cols);
    assert!(
        small_packed.len() < large_packed.len(),
        "both reads return their windows"
    );
    assert_eq!(
        small, large,
        "a 1,000-cell read allocated {small} times, a 100,000-cell read {large} times"
    );
}
