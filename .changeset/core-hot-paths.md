---
"@sheetwrite/core": patch
"@sheetwrite/react": patch
"@sheetwrite/vue": patch
"@sheetwrite/svelte": patch
---

Faster large edits, scrolling and collaboration paths. Results are unchanged; numbers are medians from alternating runs.

- A large `setBlock` measures its payload once per commit instead of three times: a 1,000,000-cell block write is 60% faster (1,364 ms to 545 ms), 50% faster with detailed change capture.
- Number and date cells reuse their formatted text, and wrapped text stops laying out lines that cannot be drawn: wrapped-text scrolling is 39% faster and number-format scrolling 14% faster.
- Inserting rows with a row bridge checks duplicate IDs with a set: inserting 10,000 rows into 1,000,000 fell from 34.7 s to 5 ms.
- Framework adapters subscribe to command state only while a command-state handler exists, so selection skips the per-cell summary otherwise (24% faster selection without a handler).
- Rebasing operations no longer clones them a second time (98% faster for a large block), and sparse writes skip validation rules outside the written area (22% faster with 100 unrelated rules).
- A search highlight or note on a partly visible top row is no longer dropped, and a command-state handler installed inside a selection or change callback now receives the following emission.
