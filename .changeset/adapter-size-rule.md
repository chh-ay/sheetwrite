---
"@sheetwrite/core": minor
"@sheetwrite/react": minor
"@sheetwrite/vue": minor
"@sheetwrite/svelte": minor
---

**Breaking:** the simple `Sheetwrite` component has one size rule in React, Vue and Svelte: give exactly one of `height` or `fill`.

- All three check it the same way, while rendering and before a grid mounts. Both or neither throws `SheetwriteError` with code `invalid-argument` and operation `create-grid`. React used to accept both or neither at run time and let `fill` win. Svelte checked after the grid had mounted.
- Vue types `fill` as `fill?: true`, like React and Svelte, and its `SheetwriteProps` is now a type alias whose `height` and `fill` exclude each other. Code that extends the `SheetwriteProps` interface must use the type instead, and TypeScript code that passes `fill: false` must leave `fill` out.
- The Svelte `Sheetwrite` declaration keeps the `Row` and `Id` generics, so `columns`, `getRowId` and the row callbacks are typed from your `defaultRows`.
