---
"@sheetwrite/xlsx": patch
---

Escape the content type of each retained part in `[Content_Types].xml`, so a type such as `application/x-a&b` saves as valid XML. A persisted part graph whose relationships do not parse or point outside the package is dropped with a warning on save, as a graph with a bad checksum is, instead of failing the save.
