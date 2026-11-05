---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

The full engine adds 23 of Excel's engineering functions (#274):

- Base conversion between binary, octal, decimal and hexadecimal: `BIN2DEC`, `DEC2HEX`, `HEX2OCT` and the other nine pairs. Binary, octal and hexadecimal numbers have at most 10 digits, and 10 digits with the highest bit set are negative, in two's complement.
- Bit functions on integers from 0 to 2^48 - 1: `BITAND`, `BITOR`, `BITXOR`, `BITLSHIFT` and `BITRSHIFT`.
- `DELTA`, `GESTEP`, `ERF`, `ERF.PRECISE`, `ERFC` and `ERFC.PRECISE`.

The default engine does not change.
