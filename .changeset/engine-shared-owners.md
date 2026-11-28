---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

One owner in the engine for each rule that several places copied (part of #250): column letters (`ADDRESS`, `INDIRECT` R1C1 text and formula text), transferred error slots, and the walk over a formula's child expressions for the checks that only read a formula (volatile functions, LET, spill references, 3-D references). That walk lists every node kind, so a new kind cannot be skipped by a catch-all. Analysis functions follow one depth rule: a context holds the depth of its call, and arguments evaluate one level deeper.
