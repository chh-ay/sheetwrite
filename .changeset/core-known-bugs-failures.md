---
"@sheetwrite/core": patch
---

Fix bugs that hid failures or let a peer mislead the page:

- Presence publishing reports an active-sheet failure as an `error` event instead of an unhandled rejection.
- Revision restore rejects a non-integer version from the adapter instead of storing `NaN`.
- Copied HTML writes only safe colors, and underline with strikethrough gives one `text-decoration` value.
- `Grid.destroy()` removes the DOM and listeners even when an earlier teardown step throws.
- `aria-rowcount` follows inserted, deleted and filtered rows.
- Default sync mutation IDs are random, so two clients that edit in the same millisecond do not collide.
- Conflict recovery saves the rebased queue only after every missed version applies.
- `SyncCoordinator.subscribe()` keeps the host's offline state.
- A table with too many columns reports a table-column limit.
