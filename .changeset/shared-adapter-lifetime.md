---
"@sheetwrite/core": minor
"@sheetwrite/react": minor
"@sheetwrite/vue": minor
"@sheetwrite/svelte": minor
---

Share adapter initialization, reset classification, Grid generation publication, and retirement through `createAdapterGridController` in `@sheetwrite/core/adapter`. Apply pending live options before readiness, retire a new Grid when publication or readiness callbacks throw, preserve first-source loader diagnostics without replacing healthy Grids, and treat omitted and canvas renderers as the same input.
