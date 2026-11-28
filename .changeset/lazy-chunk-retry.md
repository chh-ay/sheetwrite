---
"@sheetwrite/xlsx": patch
"@sheetwrite/charts": patch
---

An add-on whose code chunk fails to load, for example after a dropped network request, now loads it again on the next use instead of failing for the rest of the page's life. The XLSX call that started the failed load rejects with the load error, and the next XLSX call loads the codec again. The charts add-on reports the failure with a console warning instead of an unhandled promise rejection; the chart mounted during the failed load stays empty, and the next chart loads the drawing code again.
