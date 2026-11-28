---
"@sheetwrite/queries": patch
---

The query engine drops a shape-limit check after each step that no step could fail; the steps that grow a table already check the limit themselves.
