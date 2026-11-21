---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

XLSX export takes a `compression` option. The default, `"deterministic"`, keeps the bundled `fflate` codec and the same bytes as before in every runtime. `"native"` compresses with the runtime's `CompressionStream` where it has one: export is faster, the file holds the same parts, but the compressed bytes differ between runtimes.
