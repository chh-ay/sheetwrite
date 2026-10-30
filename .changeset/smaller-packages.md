---
"@sheetwrite/core": patch
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
"@sheetwrite/xlsx": patch
"@sheetwrite/react": patch
"@sheetwrite/vue": patch
---

The packages are smaller to install. The code is not minified and stays readable.

- `@sheetwrite/core` is 1.83 MB → 1.55 MB unpacked (387 KB → 350 KB packed), with 214 → 157 files.
- The packages publish only the type declarations that their entry points use. Core no longer ships 57 internal declaration files (117 KB), and `@sheetwrite/xlsx` no longer ships 8. You cannot import these files through the package `exports`, so no types change.
- The published JavaScript uses 2-space indentation instead of 4. This saves 155 KB in core and 20 KB in `@sheetwrite/xlsx`.
- `@sheetwrite/wasm` and `@sheetwrite/formulas` no longer publish `pkg/sheetwrite_wasm_bg.wasm.d.ts` (14 KB each). No entry point refers to it, and `sheetwrite_wasm.d.ts` has the same types.
