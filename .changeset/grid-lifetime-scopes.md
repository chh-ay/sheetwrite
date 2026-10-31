---
"@sheetwrite/core": minor
---

**Behaviour change:** `grid.destroy()` stops the grid's running work, and nothing of a destroyed grid or shell runs later.

- `grid.summarizeSelection()` rejects with an `AbortError` when the grid is destroyed while it runs, or when it is called on a destroyed grid. Before, it kept reading the freed store. Its pause timer is cleared when it is aborted.
- A clipboard action that a newer action of the same kind replaces (a second paste while the first one reads the clipboard; a copy or cut while another one writes) resolves `"empty"` and does not change the grid. A cut that the grid's destroy interrupts keeps its source cells. The actions still never reject.
- After destroy, no timer, animation frame, document or window listener, observer or download object URL of the grid, its ribbon or toolbar, find bar, side panel, auto-fit, export or action alerts stays: an export's object URL is revoked at once. An XLSX export that runs at destroy is aborted and downloads nothing.
- A ribbon, toolbar, find bar or panel chunk that loads after destroy (or after the chrome is rebuilt) does nothing, also in `createSpreadsheetShell`.
- An open field menu in the pivot panel stops listening on the document when the panel closes.
- An abort is never shown as an error alert.

**Upgrade checklist:** if you call `summarizeSelection()` and can destroy the grid while it runs, handle the `AbortError` rejection as you handle your own signal's abort.
