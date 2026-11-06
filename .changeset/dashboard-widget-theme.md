---
"@sheetwrite/core": patch
---

The dashboard background, secondary widget text and error colors follow the theme. When `--sheetwrite-widget-muted-bg`, `--sheetwrite-widget-muted` or `--sheetwrite-widget-error` is unset, the stylesheet derives it from the widget background and text colors the grid sets, so a dark theme no longer shows a light dashboard background or light-theme greys and reds.
