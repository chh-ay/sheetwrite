---
"@sheetwrite/xlsx": patch
"@sheetwrite/react": patch
"@sheetwrite/vue": patch
"@sheetwrite/svelte": patch
---

Exclude source maps from published library packages to reduce download and install size. Keep maps in local builds for development and size analysis.

Declare only CSS files as side effects in the React, Vue, and Svelte adapters. Bundlers can remove unused JavaScript and keep imported stylesheets.
