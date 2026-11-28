---
"@sheetwrite/core": patch
---

A `setBlock` operation taken from a `change` event, an apply result, a permission callback or a sync guard and then sent again is copied again before it is measured. A getter added to an entry of its `block.values` or `block.styleIds` can no longer store a value that `maxEncodedBytes` would reject. A hole in those arrays stays a hole even when `Array.prototype` has that index, and is rejected as before.
