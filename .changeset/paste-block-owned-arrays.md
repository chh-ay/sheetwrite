---
"@sheetwrite/core": patch
---

Pasting a block of cells is faster. Before a paste applies, Sheetwrite measures the size of the block it builds, and it checked each of the block's values and styles as if a caller might have put a getter on it. The paste built those lists itself, so the measurement now reads them directly, as it already does for `setBlock` input. Pasting 1,000 rows by 10 columns of text takes about half the time.
