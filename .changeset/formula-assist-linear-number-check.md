---
"@sheetwrite/formula-assist": patch
---

Formula assist checks a neighbouring formula for numbers of its own in time linear in its length. It used a regular expression that backtracks, so a neighbour holding a long run of digits followed by a letter could stall the formula bar at the first key of an edit. Suggestions are unchanged.
