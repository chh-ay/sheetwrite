---
"@sheetwrite/wasm": patch
---

Rebuild the columnar store on the pinned Rust 1.98.1 toolchain. The source now follows the new rustfmt style, and clippy-selected rewrites replace `unwrap` calls after `is_some` in the paged setters, use the newer `is_multiple_of`, `as_chunks`, and `slice::from_ref` standard-library forms, and drop redundant counters and conversions.
