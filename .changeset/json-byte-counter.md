---
"@sheetwrite/core": patch
---

Reduce transaction admission work when counting encoded JSON bytes. Count plain ASCII runs together, encode finite number lengths without JSON serialization, and check own `toJSON` properties without allocating descriptors. Keep byte counts, resource limits, and invalid-input checks unchanged.
