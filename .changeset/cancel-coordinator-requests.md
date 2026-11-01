---
"@sheetwrite/core": minor
---

**Behaviour change:** sync and collaboration coordinators treat an abort as cancellation, not as a failure.

- Revision `list`, `preview` and `restore`, and comment `load`, `create`, `reply`, `resolve` and `mutate` accept a final optional `AbortSignal`. Cancelling, or destroying the coordinator, rejects the call with the signal's reason and emits no `error` event. A late response cannot create a preview grid or change the coordinator's version or threads.
- Coordinator teardown and sync disconnection pass an `AbortError` reason to transport adapters, not a string.
- A sync send aborted by `setOnline(false)` or `destroy()` rejects with that `AbortError` reason, not a `sync-failed` error, and emits no `error` event. The commit stays pending under its mutation ID.
- Restoring durable pending commits stops after `destroy()`, and a storage abort caused by destroy is not reported as a hydration failure.
- IndexedDB pending-commit storage keeps its typed `aborted` code.

**Upgrade checklist:** do not compare cancellation reasons with the old string messages. Handle an `AbortError` rejection from comment `load`/`mutate` after `destroy()`, and from a sync send after `setOnline(false)`, as cancellation. Cancellation cannot undo a request the server already committed; keep mutation IDs to reconcile an ambiguous response.
