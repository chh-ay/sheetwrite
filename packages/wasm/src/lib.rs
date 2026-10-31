//! Columnar cell store for Sheetwrite, resident in WASM linear memory.
//!
//! Layout decisions:
//! - Values are stored **column-major** (each column is a contiguous run) so
//!   whole-column scans (sort/filter/aggregate) stay cache-local.
//! - A source cell is a tagged scalar: empty, number (`f64`), interned string,
//!   boolean, or formula. Strings are dictionary-encoded in a per-store pool;
//!   the cell payload holds the pool ID rather than a heap allocation.
//! - Styles are *not* held here as objects; the host owns the small style
//!   dictionary and the store keeps only a `u32` style id per cell. That keeps
//!   the large per-cell array in linear memory and the tiny dictionary in JS.
//! - Render-window reads cross the boundary in bulk (`get_window`) and return
//!   one packed fixed-width payload plus window-local formula-error strings.

#[cfg(not(feature = "formula-engine"))]
compile_error!(
    "SHEETWRITE_STORE_ONLY_BLOCKED: formula-entry-ast,dependency-index; \
     the store-only boundary must replace FormulaEntry::ast and FormulaGraph::index"
);

#[cfg(feature = "formula-engine")]
mod calc;
#[cfg(feature = "formula-engine")]
mod cells;
#[cfg(feature = "formula-engine")]
mod derived;
#[cfg(feature = "formula-engine")]
mod eval;
#[cfg(feature = "formula-engine")]
mod formula_reads;
#[cfg(feature = "formula-engine")]
mod graph;
#[cfg(feature = "formula-engine")]
mod memory;
#[cfg(feature = "analysis")]
mod pivot;
#[cfg(feature = "formula-engine")]
mod query;
#[cfg(feature = "formula-engine")]
mod sheet;
#[cfg(feature = "formula-engine")]
mod spill;
#[cfg(feature = "formula-engine")]
mod store;
#[cfg(feature = "formula-engine")]
mod transfer;
#[cfg(feature = "formula-engine")]
mod types;
#[cfg(feature = "formula-engine")]
mod window;

#[cfg(all(test, feature = "formula-engine"))]
mod formula_syntax_tests;
#[cfg(all(test, feature = "formula-engine"))]
mod structural_edit_tests;
#[cfg(all(test, feature = "formula-engine"))]
mod tests;

#[cfg(feature = "formula-engine")]
pub use store::{CellOut, CellStore};
#[cfg(feature = "formula-engine")]
pub use window::WindowView;

/// Names accepted by the full engine, including aliases.
#[cfg(feature = "analysis")]
#[wasm_bindgen::prelude::wasm_bindgen(js_name = functionNames)]
pub fn function_names() -> Vec<String> {
    calc::function_names()
}

#[cfg(all(test, feature = "formula-engine"))]
pub(crate) use sheet::*;
#[cfg(all(test, feature = "formula-engine"))]
pub(crate) use types::*;
