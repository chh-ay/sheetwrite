---
"@sheetwrite/core": patch
---

Editing a cell in a `date` column keeps it a date. The editor opens on the date text (`2024-02-29`, or `2024-03-01 12:00` when the serial has a time) rather than the raw serial, so committing it unchanged keeps the serial. A number typed into a date column is stored as that serial instead of as text. Custom editors receive the same date text in `CellEditorContext.text`.
