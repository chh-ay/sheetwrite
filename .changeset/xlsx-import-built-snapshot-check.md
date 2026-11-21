---
"@sheetwrite/core": patch
"@sheetwrite/xlsx": patch
---

XLSX import is faster: the reader checks the snapshot it builds with direct reads instead of proving every field of its own objects again, with the same schema, reference and size checks. Snapshot validation also accepts plain cells without building paths or reading property descriptors a second time. Core gains an internal `@sheetwrite/core/codec` entry point for Sheetwrite's own codecs, with no compatibility promise.
