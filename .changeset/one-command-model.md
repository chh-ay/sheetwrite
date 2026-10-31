---
"@sheetwrite/core": minor
---

The toolbar, the full ribbon and a new compact ribbon render one command model. They show the same commands, glyphs, enabled and pressed state, accessible names and keyboard behavior.

- The compact ribbon shows a tab's commands on one row. Set `config.ribbon` to `{ mode: "compact" }`, or to `{ mode: "auto", compactWidth }` to use compact below a width (default 768 px). The **Compact** button beside the tab list switches layout.
- The toolbar shows the ribbon's commands on one row. Commands that do not fit move into a **More commands** popup. Font Color and Fill Color are palettes, and Borders, Clear and Merge & Center are menus, as in the ribbon.
- The `GridConfig` command flags (`bold`, `sort`, `export` and the others, typed as `CommandFlags`) now choose commands in the ribbon too. `export: true` adds an Export group with Export CSV and Export XLSX.
- Every command element has a `data-command` attribute. The old `.sheetwrite-tb-*` classes are gone.
- The built-in toolbar loads with the ribbon's chunk, so it appears after the grid mounts.
- The shell toolbar also loads lazily, with its row height reserved. Custom Border, Merge, Unmerge and Clear Formats items keep their one-click behavior.
