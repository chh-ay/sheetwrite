---
"@sheetwrite/core": minor
---

New `grid.trimMemory()` gives back the memory that an open grid can build again: decoded cell strings, rendered number text, compiled number formats, text measurement and unused overlay nodes, in the grid and in its worker renderer. Document data, undo history and the visible output do not change; the next frame builds only what it paints. Call it on a memory signal or when the page goes to the background. The number format caches are shared by all grids on the page, so a trim drops them for every grid. It does nothing after `destroy()`, and it does not shrink WebAssembly memory (use `releaseEngineMemory()` for that).

The find bar now builds its DOM when it first opens, not when the grid is created. A grid that never opens the find bar has no `.sheetwrite-find` element.

Upgrade checklist:

- If your code or tests look for `.sheetwrite-find` before the find bar opens, open it first with `grid.actions.find()` or Ctrl+F.
