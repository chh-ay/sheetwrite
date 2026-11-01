---
"@sheetwrite/core": patch
---

Accept per-call cancellation for revision and comment operations. Reject cancellation with the signal reason without reporting a failure or accepting late responses. Use AbortError reasons for coordinator teardown and sync disconnection; a sync send aborted by disconnection or destroy rejects with that reason instead of a sync-failed error and emits no error event. Stop durable restoration work after teardown.
