---
"@sheetwrite/core": patch
---

Cut and paste moves the cells in Firefox and Safari as it does in Chromium, and a copy inside the grid keeps its formulas and styles there. A grid finds its own copy or cut by a token on the table of the HTML it writes, since those browsers keep no custom clipboard formats; before, the paste fell back to the copied text.
