---
"@sheetwrite/xlsx": patch
---

XLSX export compresses parts with the runtime's `CompressionStream` when it has one. The parts and ZIP headers stay the same, but the compressed bytes come from the runtime's zlib, so they can differ between Bun, Node and browsers; Excel and LibreOffice open them the same.
