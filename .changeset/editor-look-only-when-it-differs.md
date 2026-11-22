---
"@sheetwrite/core": patch
---

The cell editor writes a cell's font, colour, alignment, decoration and padding inline only when they differ from the editor's stylesheet, so opening the editor on an unformatted cell is faster. A host stylesheet that sets `.sheetwrite-editor`'s font applies again to cells without their own font, as before 0.7.0.
