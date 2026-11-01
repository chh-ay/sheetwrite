---
"@sheetwrite/core": patch
---

Accept per-call cancellation for revision and comment operations. Reject cancellation with the signal reason without reporting a failure or accepting late responses. Use AbortError reasons for coordinator teardown and sync disconnection, and stop durable restoration work after teardown.
