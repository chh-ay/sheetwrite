---
"@sheetwrite/core": minor
"@sheetwrite/formulas": minor
---

The full engine adds Excel's 32 remaining financial functions (#275):

- Coupon dates and days: `COUPDAYBS`, `COUPDAYS`, `COUPDAYSNC`, `COUPNCD`, `COUPNUM` and `COUPPCD`.
- Accrued interest, prices, yields and durations of bonds: `ACCRINT`, `ACCRINTM`, `PRICE`, `YIELD`, `DURATION` and `MDURATION`, and `ODDFPRICE`, `ODDFYIELD`, `ODDLPRICE` and `ODDLYIELD` for an odd first or last period.
- Discounted securities and Treasury bills: `DISC`, `INTRATE`, `PRICEDISC`, `PRICEMAT`, `RECEIVED`, `YIELDDISC`, `YIELDMAT`, `TBILLEQ`, `TBILLPRICE` and `TBILLYIELD`.
- Depreciation: `VDB`, `AMORDEGRC` and `AMORLINC`.
- `DOLLARDE`, `DOLLARFR` and `ISPMT`.

All five day-count bases follow Excel's rules.

The default engine does not change.
