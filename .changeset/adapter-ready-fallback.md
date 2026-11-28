---
"@sheetwrite/react": patch
"@sheetwrite/vue": patch
---

A React or Vue grid mounted on a page whose WASM is already initialized no longer renders its fallback before the grid appears, as the Svelte grid already did. Both rendered the fallback first and removed it once the grid was created. During server rendering and hydration the fallback still shows, because the server has no WASM.
