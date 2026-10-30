---
"@sheetwrite/core": minor
---

The toolbar, ribbon, ribbon menus and context menu now draw their command icons from one icon sheet, shipped as `@sheetwrite/core/icons.svg` with its layout in `@sheetwrite/core/icons.json`. The icons follow the text color, so they suit light, dark and High Contrast themes.

Replace icons by glyph name with the new `icons` option (`GridConfig.icons`, type `IconOverrides`). `IconName` and `ICON_NAMES` list the glyph names. To replace the whole set, set the CSS variable `--sheetwrite-icon-sheet` to your own sheet with the same layout.

The default sheet is an inline `data:` URL. If your Content Security Policy blocks `data:` images, serve `@sheetwrite/core/icons.svg` from your site and set `--sheetwrite-icon-sheet: url("/path/to/icons.svg")`.
