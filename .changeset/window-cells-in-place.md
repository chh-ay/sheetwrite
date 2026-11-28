---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Scrolling reads each visible window faster. The engine writes a window's cells straight into the buffer it hands to the page, instead of filling five lists first and then copying them into that buffer one value at a time. Reading a 50-row window of five columns takes about half as long inside the engine.
