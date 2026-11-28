---
"@sheetwrite/core": patch
---

Weekday names (`ddd`, `dddd`) for serials 1–59 (1 January to 28 February 1900) now match Excel and `WEEKDAY`: serial 1 shows Sunday and serial 59 shows Tuesday. These names used to be a day later. Excel counts its fictional 29 February 1900 when it counts weekdays. Weekday names for serial 60 onward are unchanged.
