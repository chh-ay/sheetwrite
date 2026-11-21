---
"@sheetwrite/core": patch
---

A number with no number format shows as Excel's General format shows it: no thousands separators, up to 11 characters in a cell (the minus sign not counted), and scientific notation for a number whose whole part does not fit or that is below 0.0001. So `2026` shows as `2026`, `0.0001234` as `0.0001234` and `123456789012` as `1.23457E+11`. In a narrow cell, the number takes fewer decimals or scientific notation before it shows `####`. Before, it showed `2,026`, `0` and `123,456,789,012`, and negative zero showed as `-0`.
