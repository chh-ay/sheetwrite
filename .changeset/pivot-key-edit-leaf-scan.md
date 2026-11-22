---
"@sheetwrite/formulas": patch
---

Moving a row out of its group under a pivot table finds the group's next label row with one comparison per row instead of walking each row's group chain. Key edits under a 100,000-row pivot take about 15% fewer instructions.
