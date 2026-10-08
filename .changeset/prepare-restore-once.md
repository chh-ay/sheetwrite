---
"@sheetwrite/core": minor
---

Reuse decoded compressed restore blocks during synchronous transaction application and row projection, while revalidating payloads changed by host callbacks. Large-clear undo uses its already materialized block without decompressing it again. Rebase decodes each restore once across structural edits and serializes it once when complete. Document operations and change events retain their existing wire format.
