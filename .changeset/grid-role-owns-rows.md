---
"@sheetwrite/core": patch
---

The grid's ARIA roles are valid: the `grid` role owns only rows and cells.

- The hidden mirror `div.sheetwrite-aria` now has `role="grid"` and carries `aria-multiselectable`, `aria-rowcount`, `aria-colcount`, `aria-readonly` and the host's `aria-label`. It used to be a `rowgroup` inside a host with the `grid` role, and that host also held the toolbar, the sheet tabs and the panels, which a grid may not own.
- The host is a labelled `group` that keeps the focus and `aria-activedescendant`. Code that reads `aria-rowcount`, `aria-colcount` or `aria-readonly` from the host reads them from `host.querySelector('[role="grid"]')` instead.
- `aria-activedescendant` names only a cell the mirror holds. While the active cell is scrolled out of the mirrored window, the host has no `aria-activedescendant`.
