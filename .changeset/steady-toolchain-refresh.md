---
"@sheetwrite/wasm": patch
---

Adopt the current rustfmt style and clippy-selected rewrites in the columnar store: replace `unwrap` calls after `is_some` in the paged setters, use the newer `is_multiple_of`, `as_chunks`, and `slice::from_ref` standard-library forms, and drop redundant counters and conversions.
