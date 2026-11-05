---
"@sheetwrite/queries": minor
---

Add the optional headless query engine. Rust parses host-owned CSV and JSON bytes
and runs filter, select, rename, change type, sort-merge join, sorted grouping,
and mixed-type unpivot steps over typed column arrays.

The query artifact loads only on demand. Typed buffers preserve nulls and cell
errors, fatal failures return structured diagnostics, and expanding operations
check resource limits. The engine does not fetch data or store credentials. The
default and full formula engine artifacts are unchanged.
