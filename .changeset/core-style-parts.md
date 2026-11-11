---
"@sheetwrite/core": minor
"@sheetwrite/react": minor
"@sheetwrite/vue": minor
"@sheetwrite/svelte": minor
---

The stylesheet ships in parts under `@sheetwrite/core/styles/`: `grid.css` (always needed), `formula-help.css`, `find.css`, `ribbon.css`, `panels.css`, `context-menu.css`, `tabs.css`, `charts.css`, `icons.css` and `dashboard.css`. A grid with only `grid.css` ships about 5 KB of CSS instead of 89.5 KB. `styles.css` imports every part, so an app that imports it looks the same as before. The framework adapters have the same parts, for example `@sheetwrite/react/styles/ribbon.css`. In a development build, a widget whose part is missing logs one warning that names the part.

The command icon sheet is now its own file, `styles/icons.svg`, which `icons.css` loads, instead of a `data:` URL inside the stylesheet. Only pages that show icons download it, and the browser caches it. `@sheetwrite/core/icons.svg` still points at the same sheet.

Upgrade checklist:

- Nothing to do if you import `styles.css` with Vite, webpack or Next.js: they copy `icons.svg` into the build.
- With esbuild, give `.svg` files a loader, for example `loader: { ".svg": "file" }`. Without one, the build fails with `No loader is configured for ".svg" files: icons.svg`.
- If you set `--sheetwrite-icon-sheet` only because your Content Security Policy blocks `data:` images, you can remove it: the default sheet is now a file from your own origin.
- To ship less CSS, replace `styles.css` with the parts your grid uses, `grid.css` first. The docs page on styles lists which part each widget needs.
