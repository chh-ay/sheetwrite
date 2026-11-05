---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

The full engine adds Excel's 54 engineering functions (#274):

- Base conversion between binary, octal, decimal and hexadecimal: `BIN2DEC`, `DEC2HEX`, `HEX2OCT` and the other nine pairs. Binary, octal and hexadecimal numbers have at most 10 digits, and 10 digits with the highest bit set are negative, in two's complement.
- Bit functions on integers from 0 to 2^48 - 1: `BITAND`, `BITOR`, `BITXOR`, `BITLSHIFT` and `BITRSHIFT`.
- `DELTA`, `GESTEP`, `ERF`, `ERF.PRECISE`, `ERFC` and `ERFC.PRECISE`.
- `CONVERT` for the 13 unit groups of Excel, with decimal prefixes on metric units and binary prefixes on `bit` and `byte`. Each factor is the exact definition of the unit, so a result can differ from Excel in the last digits.
- `BESSELJ`, `BESSELY`, `BESSELI` and `BESSELK`. They use the approximations that give Excel's published results, which are accurate to about 1E-8.
- Complex numbers in Excel's text form, such as `3+4i` or `2-j`: `COMPLEX` and the 25 `IM*` functions. Each part of a result has 15 significant digits.

The default engine does not change.
