---
"@sheetwrite/core": patch
---

Undo of a large clear builds its compressed `restoreBlock` faster: base64 uses the runtime's native `Uint8Array` encoder when it has one, history sizing no longer formats each number as text, and the store no longer re-checks the shape of a block the engine just built. Decoding a received `restoreBlock` also uses native base64 when available and still accepts only the canonical encoding. The wire format and every limit are unchanged.
