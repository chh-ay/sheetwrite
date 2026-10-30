---
title: Events
description: Grid events, their payloads, and which events carry committed document changes.
---

`grid.on(evt, fn)` subscribes to a grid event and returns an `off()` function. Call it to unsubscribe.

```ts prelude="core" partial="requires surrounding host state" title="Observe committed changes"
const off = grid.on("change", ({ transaction, source, commitReason }) => {
  if (source === "local") console.log(commitReason, transaction.patches.length);
});
// later
off();
```

After a user types a value and presses Enter, the log shows `edit-enter 1`.

## Event direction

`change` is the committed transaction stream. `ChangeEvent.source` is `local` for user or API output that a host may persist, and `remote` for already-persisted input that must not be enqueued again. Selection, search, renderer fallback, and other UI events remain observational.

Framework `onGridChange` / `grid-change` callbacks carry the same committed event. Adapter readiness is `{ grid, generation, reason }`; `reason` distinguishes `initial`, `input-reset`, and `renderer-reset`. The imperative ref, exposed handle, or binding is assigned before readiness and cleared on replacement.

## Grid events

| Event | Payload |
| --- | --- |
| `change` | `ChangeEvent`: `{ transaction; changes; commitReason; source: "local" \| "remote"; epoch? }` |
| `selection` | `{ selection: Selection \| null }` |
| `scroll` | `{ scrollTop; firstRow; lastRow; scrollLeft; firstVisibleColumn; lastVisibleColumn }`; the visible-column fields are `number \| null`. |
| `edit-begin` | `{ addr: CellAddress }` |
| `edit-commit` | `{ addr: CellAddress; value: CellValue }` |
| `search` | `SearchResult`: `{ query: string; matches: CellAddress[]; active: number }` |
| `command-state-change` | `{ states }`: every command's `GridCommandState`. See [Host-owned command state](/docs/features/grid/toolbar-and-ribbon/#host-owned-command-state). |
| `mutation-rejected` | `{ issues: MutationIssue[] }` |
| `active-sheet` | `{ sheet: SheetId }`, after the visible sheet changes (direct call or cross-sheet scroll). |
| `hyperlink-activate` | `HyperlinkActivationEvent` |
| `theme-change` | `{ theme: Theme }`, after `setTheme` or `replaceTheme` changes the base theme. |
| `renderer-fallback` | `{ requested: "worker"; error: SheetwriteError }`, once, when the worker renderer could not be constructed. |
| `datasource-error` | `{ request; error: SheetwriteError }`; `request` is the `DataSourceRequest` without its `signal`. |
| `export-error` | `{ format: "csv" \| "xlsx"; error: SheetwriteError }`, when a built-in toolbar or context-menu export fails. |

`commitReason` is one of `edit-blur`, `edit-enter`, `edit-tab`, `edit-programmatic`, `paste`, `cut`, `clear`, `fill`, `structure`, `style`, `replace`, `undo`, `redo` or `api`.

## Sync coordinator events

`SyncCoordinator` has its own event stream. `sync.on(fn)` returns an unsubscribe function:

```ts prelude="collaboration" partial="requires surrounding host state" title="Sync events"
const sync = new SyncCoordinator(grid, adapter, {
  documentId: "products",
  serverVersion: loadedSnapshot.version ?? 0,
});
const off = sync.on((event) => {
  if (event.type === "conflict") showConflict(event.response);
  if (event.type === "reload-required") requestFreshSnapshot();
});

saveButton.onclick = () => void sync.sendNext();
// later
off();
sync.destroy();
```

| `event.type` | Payload |
| --- | --- |
| `state` | `state` |
| `restored` | `pending` |
| `persisting`, `pending`, `sending` | `mutation` |
| `acknowledged` | `clientMutationId`, `version`, `duplicate` |
| `conflict` | `mutation`, `response` |
| `remote-applied` | `operation` |
| `reload-required` | `expectedVersion`, `receivedVersion`, optional `snapshot` |
| `reloaded`, `recovered` | `serverVersion`, `pending` |
| `storage-error`, `error` | `error`, optional `clientMutationId` |

## Edge cases and limits

- Persist only `change` events with `source: "local"`. Remote input is observable but never belongs in outgoing local persistence.
- `changes` is empty for commits that only change metadata.
- Hydration from a snapshot and datasource pages emit no user change event.

## See also

- [Grid methods](/docs/features/grid/grid-methods/#lifecycle)
- [Persistence](/docs/features/data/persistence/)
- [Error handling](/docs/concepts/error-handling/)
- Generated [`GridEvents`](/docs/api/core/grid-events/), [`ChangeEvent`](/docs/api/core/change-event/) and [`SyncCoordinatorEvent`](/docs/api/core/sync-coordinator-event/) contracts
