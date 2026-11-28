---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

XLSX and CSV failures stay small:

- An XLSX error message keeps at most 8 KiB of text from the file, from the start and the end, and keeps the decoding error as its `cause`.
- One XLSX conversion reports at most 64 warnings to `onWarning`.
- `DelimitedTextOptionsError.context` keeps a number option value, or only `valueType` for any other value, never a copy of it.
- A registered XLSX backend name in a failure context is cut to 256 characters.
