---
"@sheetwrite/core": patch
---

Writing a block with many text cells packs the text for the engine with one UTF-8 encode per 65,536 strings instead of one per cell, which shortens large pastes, imports and received restores of text.
