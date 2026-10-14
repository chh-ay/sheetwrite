---
"@sheetwrite/wasm": minor
"@sheetwrite/core": minor
---

Reclaim obsolete text after committed edit transactions when dead storage exceeds the collection thresholds. History snapshots own their text, and raw string IDs and worker frames carry a pool epoch so caches remain correct after collection. Explicit string compaction now also reclaims unreachable text.
