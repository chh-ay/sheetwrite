---
"@sheetwrite/core": patch
---

Comparing, restoring and reading a version validate the rebuilt snapshot once. The replay store takes the checkpoint that history already validated and repeats only the checks that depend on its own options (resource limits and storage), instead of walking every cell again. Results and errors do not change.
