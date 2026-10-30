---
"@sheetwrite/core": patch
---

`renderer: "worker"` now works without `workerUrl` in bundled apps. The grid creates its worker with the exact `new Worker(new URL("./worker.js", import.meta.url))` expression bundlers look for, so Vite (and other bundlers that recognize it) build the worker with its imports instead of copying a file whose imports are missing, which made the grid fall back to the main-thread renderer.
