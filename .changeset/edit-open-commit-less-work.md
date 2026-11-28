---
"@sheetwrite/core": patch
---

Opening and committing the cell editor do less work. The edited cell is read once instead of up to three times. F2 on a one-line cell finds the caret from the editor the browser has just laid out for focus, instead of measuring the text on a canvas. The editor is a scroll box that may show a vertical scrollbar only when its text runs past eight lines, which makes the layout of every shorter edit cheaper.
