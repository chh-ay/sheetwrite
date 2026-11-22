---
"@sheetwrite/formulas": patch
---

Editing a value under a pivot table, without moving the row to another group, updates each affected aggregate in place instead of taking the row out of its groups and adding it back. Value edits under a 100,000-row pivot take about 20% fewer instructions.
