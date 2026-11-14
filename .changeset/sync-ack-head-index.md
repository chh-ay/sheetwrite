---
"@sheetwrite/core": patch
---

Acknowledging a queued commit costs the same at any queue depth. Before, every acknowledgement moved the rest of the pending queue, so draining a deep offline queue grew with the square of its length.
