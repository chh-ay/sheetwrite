---
title: "Excel function coverage"
description: "Every function in the pinned Microsoft Excel catalog, with full and lite engine availability and known differences."
---

This table covers **520 distinct Excel function names** from [Microsoft's category catalog](https://support.microsoft.com/en-us/excel/excel-functions-by-category), updated 2026-06-25 and retrieved 2026-10-30. It includes compatibility names and add-in functions. It is a pinned catalog, not a claim to cover functions Microsoft adds after that date.

The full engine has **216 supported**, **93 partly supported**, and **211 not supported** names in this catalog. Aliases count as separate Excel names. Functions outside the catalog remain in the [function contract](/docs/reference/formula-functions/).

## How to read the table

- **Full engine** is `@sheetwrite/formulas`. **Lite engine** is the default `@sheetwrite/wasm` package. Importing the full package alone does not select it; see [engine builds](/docs/reference/formula-functions/#engine-builds).
- **Supported** means registered and implemented within the linked Sheetwrite signature and semantic contract. It does not mean complete Excel parity, array broadcasting for every scalar function, unlimited numerical precision, or reviewed external results.
- **Partly supported** means implemented with a known Excel difference, marked as divergent in the formula contract. The row states the difference. Shared resource limits are documented in the [bounded evaluation contract](/docs/reference/formula-functions/#bounded-evaluation-contract).
- **Not supported** means not registered in that engine; the call evaluates to `#NAME?`. A function that is only in the full engine is not a broken lite implementation. **Unsupported by design** marks a name that the contract's [unsupported categories](/docs/reference/formula-functions/#unsupported-categories) exclude on purpose; other missing names are open gaps.
- Availability and aliases come from the formula contract, checked against the Rust parser registry and the full engine's analysis registries every time this page is generated or checked. The Microsoft catalog stores names, categories and source links only.
- To refresh the baseline, update `scripts/excel-functions.json` from the linked Microsoft catalog. Keep one row per name, split compound names, omit the featured-function duplicates, and prefer a function's current category over its compatibility duplicate. Run `bun run docs:generate`, then `bun run docs:check`.
- Reviewed external workbook results are separate from registry coverage; see [compatibility results](/docs/reference/compatibility-results/).

## Compatibility

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`BETADIST`](https://support.microsoft.com/en-us/excel/functions/betadist-function) | Not supported | Not supported | Not registered in either engine. |
| [`BETAINV`](https://support.microsoft.com/en-us/excel/functions/betainv-function) | Not supported | Not supported | Not registered in either engine. |
| [`BINOMDIST`](https://support.microsoft.com/en-us/excel/functions/binomdist-function) | Not supported | Not supported | Not registered in either engine. |
| [`CHIDIST`](https://support.microsoft.com/en-us/excel/functions/chidist-function) | Not supported | Not supported | Not registered in either engine. |
| [`CHIINV`](https://support.microsoft.com/en-us/excel/functions/chiinv-function) | Not supported | Not supported | Not registered in either engine. |
| [`CHITEST`](https://support.microsoft.com/en-us/excel/functions/chitest-function) | Not supported | Not supported | Not registered in either engine. |
| [`CONFIDENCE`](https://support.microsoft.com/en-us/excel/functions/confidence-function) | Not supported | Not supported | Not registered in either engine. |
| [`COVAR`](https://support.microsoft.com/en-us/excel/functions/covar-function) | Not supported | Not supported | Not registered in either engine. |
| [`CRITBINOM`](https://support.microsoft.com/en-us/excel/functions/critbinom-function) | Not supported | Not supported | Not registered in either engine. |
| [`EXPONDIST`](https://support.microsoft.com/en-us/excel/functions/expondist-function) | Not supported | Not supported | Not registered in either engine. |
| [`FDIST`](https://support.microsoft.com/en-us/excel/functions/fdist-function) | Not supported | Not supported | Not registered in either engine. |
| [`FINV`](https://support.microsoft.com/en-us/excel/functions/finv-function) | Not supported | Not supported | Not registered in either engine. |
| [`FTEST`](https://support.microsoft.com/en-us/excel/functions/ftest-function) | Not supported | Not supported | Not registered in either engine. |
| [`GAMMADIST`](https://support.microsoft.com/en-us/excel/functions/gammadist-function) | Not supported | Not supported | Not registered in either engine. |
| [`GAMMAINV`](https://support.microsoft.com/en-us/excel/functions/gammainv-function) | Not supported | Not supported | Not registered in either engine. |
| [`HYPGEOMDIST`](https://support.microsoft.com/en-us/excel/functions/hypgeomdist-function) | Not supported | Not supported | Not registered in either engine. |
| [`LOGINV`](https://support.microsoft.com/en-us/excel/functions/loginv-function) | Not supported | Not supported | Not registered in either engine. |
| [`LOGNORMDIST`](https://support.microsoft.com/en-us/excel/functions/lognormdist-function) | Not supported | Not supported | Not registered in either engine. |
| [`MODE`](https://support.microsoft.com/en-us/excel/functions/mode-function) | Not supported | Not supported | Not registered in either engine. |
| [`NEGBINOMDIST`](https://support.microsoft.com/en-us/excel/functions/negbinomdist-function) | Not supported | Not supported | Not registered in either engine. |
| [`NORMDIST`](https://support.microsoft.com/en-us/excel/functions/normdist-function) | Not supported | Not supported | Not registered in either engine. |
| [`NORMINV`](https://support.microsoft.com/en-us/excel/functions/norminv-function) | Not supported | Not supported | Not registered in either engine. |
| [`NORMSDIST`](https://support.microsoft.com/en-us/excel/functions/normsdist-function) | Not supported | Not supported | Not registered in either engine. |
| [`NORMSINV`](https://support.microsoft.com/en-us/excel/functions/normsinv-function) | Not supported | Not supported | Not registered in either engine. |
| [`PERCENTILE`](https://support.microsoft.com/en-us/excel/functions/percentile-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`PERCENTRANK`](https://support.microsoft.com/en-us/excel/functions/percentrank-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`POISSON`](https://support.microsoft.com/en-us/excel/functions/poisson-function) | Not supported | Not supported | Not registered in either engine. |
| [`QUARTILE`](https://support.microsoft.com/en-us/excel/functions/quartile-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`RANK`](https://support.microsoft.com/en-us/excel/functions/rank-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`STDEV`](https://support.microsoft.com/en-us/excel/functions/stdev-function) | Not supported | Not supported | Not registered in either engine. |
| [`STDEVP`](https://support.microsoft.com/en-us/excel/functions/stdevp-function) | Not supported | Not supported | Not registered in either engine. |
| [`TDIST`](https://support.microsoft.com/en-us/excel/functions/tdist-function) | Not supported | Not supported | Not registered in either engine. |
| [`TINV`](https://support.microsoft.com/en-us/excel/functions/tinv-function) | Not supported | Not supported | Not registered in either engine. |
| [`TTEST`](https://support.microsoft.com/en-us/excel/functions/ttest-function) | Not supported | Not supported | Not registered in either engine. |
| [`VAR`](https://support.microsoft.com/en-us/excel/functions/var-function) | Not supported | Not supported | Not registered in either engine. |
| [`VARP`](https://support.microsoft.com/en-us/excel/functions/varp-function) | Not supported | Not supported | Not registered in either engine. |
| [`WEIBULL`](https://support.microsoft.com/en-us/excel/functions/weibull-function) | Not supported | Not supported | Not registered in either engine. |
| [`ZTEST`](https://support.microsoft.com/en-us/excel/functions/ztest-function) | Not supported | Not supported | Not registered in either engine. |

## Cubes

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`CUBEKPIMEMBER`](https://support.microsoft.com/en-us/excel/functions/cubekpimember-function) | Not supported | Not supported | Not registered in either engine. |
| [`CUBEMEMBER`](https://support.microsoft.com/en-us/excel/functions/cubemember-function) | Not supported | Not supported | Unsupported by design: OLAP cube members, sets, and values are not resolved. |
| [`CUBEMEMBERPROPERTY`](https://support.microsoft.com/en-us/excel/functions/cubememberproperty-function) | Not supported | Not supported | Not registered in either engine. |
| [`CUBERANKEDMEMBER`](https://support.microsoft.com/en-us/excel/functions/cuberankedmember-function) | Not supported | Not supported | Not registered in either engine. |
| [`CUBESET`](https://support.microsoft.com/en-us/excel/functions/cubeset-function) | Not supported | Not supported | Unsupported by design: OLAP cube members, sets, and values are not resolved. |
| [`CUBESETCOUNT`](https://support.microsoft.com/en-us/excel/functions/cubesetcount-function) | Not supported | Not supported | Not registered in either engine. |
| [`CUBEVALUE`](https://support.microsoft.com/en-us/excel/functions/cubevalue-function) | Not supported | Not supported | Unsupported by design: OLAP cube members, sets, and values are not resolved. |

## Database functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`DAVERAGE`](https://support.microsoft.com/en-us/excel/functions/daverage-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DCOUNT`](https://support.microsoft.com/en-us/excel/functions/dcount-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DCOUNTA`](https://support.microsoft.com/en-us/excel/functions/dcounta-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DGET`](https://support.microsoft.com/en-us/excel/functions/dget-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DMAX`](https://support.microsoft.com/en-us/excel/functions/dmax-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DMIN`](https://support.microsoft.com/en-us/excel/functions/dmin-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DPRODUCT`](https://support.microsoft.com/en-us/excel/functions/dproduct-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DSTDEV`](https://support.microsoft.com/en-us/excel/functions/dstdev-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DSTDEVP`](https://support.microsoft.com/en-us/excel/functions/dstdevp-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DSUM`](https://support.microsoft.com/en-us/excel/functions/dsum-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DVAR`](https://support.microsoft.com/en-us/excel/functions/dvar-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |
| [`DVARP`](https://support.microsoft.com/en-us/excel/functions/dvarp-function) | Partly supported | Not supported | Lite engine: not registered. Database criteria use header names, AND across columns, and OR across rows. Custom formula predicates under headers that are not database fields are not supported. A not-equal criterion does not match a value of a different type, so "<>" skips numbers in a field that Excel counts as nonblank (#246). [Contract](/docs/reference/formula-functions/database/) |

## Date and time functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`DATE`](https://support.microsoft.com/en-us/excel/functions/date-function) | Partly supported | Partly supported | DATE can return a negative serial, as in =DATE(1900,1,-1). Excel returns #NUM! (#246). [Contract](/docs/reference/formula-functions/date-time/) |
| [`DATEDIF`](https://support.microsoft.com/en-us/excel/functions/datedif-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/date-time/) |
| [`DATEVALUE`](https://support.microsoft.com/en-us/excel/functions/datevalue-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`DAY`](https://support.microsoft.com/en-us/excel/functions/day-function) | Partly supported | Partly supported | Serial 0 and blank cells read as 1899-12-31. Excel returns year 1900, month 1 and day 0 (#246). Negative serials are accepted. Excel returns #NUM! (#246). [Contract](/docs/reference/formula-functions/date-time/) |
| [`DAYS`](https://support.microsoft.com/en-us/excel/functions/days-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`DAYS360`](https://support.microsoft.com/en-us/excel/functions/days360-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`EDATE`](https://support.microsoft.com/en-us/excel/functions/edate-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`EOMONTH`](https://support.microsoft.com/en-us/excel/functions/eomonth-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`HOUR`](https://support.microsoft.com/en-us/excel/functions/hour-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`ISOWEEKNUM`](https://support.microsoft.com/en-us/excel/functions/isoweeknum-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/date-time/) |
| [`MINUTE`](https://support.microsoft.com/en-us/excel/functions/minute-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`MONTH`](https://support.microsoft.com/en-us/excel/functions/month-function) | Partly supported | Partly supported | Serial 0 and blank cells read as 1899-12-31. Excel returns year 1900, month 1 and day 0 (#246). Negative serials are accepted. Excel returns #NUM! (#246). [Contract](/docs/reference/formula-functions/date-time/) |
| [`NETWORKDAYS`](https://support.microsoft.com/en-us/excel/functions/networkdays-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`NETWORKDAYS.INTL`](https://support.microsoft.com/en-us/excel/functions/networkdays-intl-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/date-time/) |
| [`NOW`](https://support.microsoft.com/en-us/excel/functions/now-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`SECOND`](https://support.microsoft.com/en-us/excel/functions/second-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`TIME`](https://support.microsoft.com/en-us/excel/functions/time-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`TIMEVALUE`](https://support.microsoft.com/en-us/excel/functions/timevalue-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`TODAY`](https://support.microsoft.com/en-us/excel/functions/today-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`WEEKDAY`](https://support.microsoft.com/en-us/excel/functions/weekday-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`WEEKNUM`](https://support.microsoft.com/en-us/excel/functions/weeknum-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`WORKDAY`](https://support.microsoft.com/en-us/excel/functions/workday-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |
| [`WORKDAY.INTL`](https://support.microsoft.com/en-us/excel/functions/workday-intl-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/date-time/) |
| [`YEAR`](https://support.microsoft.com/en-us/excel/functions/year-function) | Partly supported | Partly supported | Serial 0 and blank cells read as 1899-12-31. Excel returns year 1900, month 1 and day 0 (#246). Negative serials are accepted. Excel returns #NUM! (#246). [Contract](/docs/reference/formula-functions/date-time/) |
| [`YEARFRAC`](https://support.microsoft.com/en-us/excel/functions/yearfrac-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/date-time/) |

## Engineering functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`BESSELI`](https://support.microsoft.com/en-us/excel/functions/besseli-function) | Not supported | Not supported | Not registered in either engine. |
| [`BESSELJ`](https://support.microsoft.com/en-us/excel/functions/besselj-function) | Not supported | Not supported | Not registered in either engine. |
| [`BESSELK`](https://support.microsoft.com/en-us/excel/functions/besselk-function) | Not supported | Not supported | Not registered in either engine. |
| [`BESSELY`](https://support.microsoft.com/en-us/excel/functions/bessely-function) | Not supported | Not supported | Not registered in either engine. |
| [`BIN2DEC`](https://support.microsoft.com/en-us/excel/functions/bin2dec-function) | Not supported | Not supported | Not registered in either engine. |
| [`BIN2HEX`](https://support.microsoft.com/en-us/excel/functions/bin2hex-function) | Not supported | Not supported | Not registered in either engine. |
| [`BIN2OCT`](https://support.microsoft.com/en-us/excel/functions/bin2oct-function) | Not supported | Not supported | Not registered in either engine. |
| [`BITAND`](https://support.microsoft.com/en-us/excel/functions/bitand-function) | Not supported | Not supported | Not registered in either engine. |
| [`BITLSHIFT`](https://support.microsoft.com/en-us/excel/functions/bitlshift-function) | Not supported | Not supported | Not registered in either engine. |
| [`BITOR`](https://support.microsoft.com/en-us/excel/functions/bitor-function) | Not supported | Not supported | Not registered in either engine. |
| [`BITRSHIFT`](https://support.microsoft.com/en-us/excel/functions/bitrshift-function) | Not supported | Not supported | Not registered in either engine. |
| [`BITXOR`](https://support.microsoft.com/en-us/excel/functions/bitxor-function) | Not supported | Not supported | Not registered in either engine. |
| [`COMPLEX`](https://support.microsoft.com/en-us/excel/functions/complex-function) | Not supported | Not supported | Not registered in either engine. |
| [`CONVERT`](https://support.microsoft.com/en-us/excel/functions/convert-function) | Not supported | Not supported | Not registered in either engine. |
| [`DEC2BIN`](https://support.microsoft.com/en-us/excel/functions/dec2bin-function) | Not supported | Not supported | Not registered in either engine. |
| [`DEC2HEX`](https://support.microsoft.com/en-us/excel/functions/dec2hex-function) | Not supported | Not supported | Not registered in either engine. |
| [`DEC2OCT`](https://support.microsoft.com/en-us/excel/functions/dec2oct-function) | Not supported | Not supported | Not registered in either engine. |
| [`DELTA`](https://support.microsoft.com/en-us/excel/functions/delta-function) | Not supported | Not supported | Not registered in either engine. |
| [`ERF`](https://support.microsoft.com/en-us/excel/functions/erf-function) | Not supported | Not supported | Not registered in either engine. |
| [`ERF.PRECISE`](https://support.microsoft.com/en-us/excel/functions/erf-precise-function) | Not supported | Not supported | Not registered in either engine. |
| [`ERFC`](https://support.microsoft.com/en-us/excel/functions/erfc-function) | Not supported | Not supported | Not registered in either engine. |
| [`ERFC.PRECISE`](https://support.microsoft.com/en-us/excel/functions/erfc-precise-function) | Not supported | Not supported | Not registered in either engine. |
| [`GESTEP`](https://support.microsoft.com/en-us/excel/functions/gestep-function) | Not supported | Not supported | Not registered in either engine. |
| [`HEX2BIN`](https://support.microsoft.com/en-us/excel/functions/hex2bin-function) | Not supported | Not supported | Not registered in either engine. |
| [`HEX2DEC`](https://support.microsoft.com/en-us/excel/functions/hex2dec-function) | Not supported | Not supported | Not registered in either engine. |
| [`HEX2OCT`](https://support.microsoft.com/en-us/excel/functions/hex2oct-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMABS`](https://support.microsoft.com/en-us/excel/functions/imabs-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMAGINARY`](https://support.microsoft.com/en-us/excel/functions/imaginary-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMARGUMENT`](https://support.microsoft.com/en-us/excel/functions/imargument-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMCONJUGATE`](https://support.microsoft.com/en-us/excel/functions/imconjugate-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMCOS`](https://support.microsoft.com/en-us/excel/functions/imcos-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMCOSH`](https://support.microsoft.com/en-us/excel/functions/imcosh-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMCOT`](https://support.microsoft.com/en-us/excel/functions/imcot-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMCSC`](https://support.microsoft.com/en-us/excel/functions/imcsc-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMCSCH`](https://support.microsoft.com/en-us/excel/functions/imcsch-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMDIV`](https://support.microsoft.com/en-us/excel/functions/imdiv-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMEXP`](https://support.microsoft.com/en-us/excel/functions/imexp-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMLN`](https://support.microsoft.com/en-us/excel/functions/imln-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMLOG10`](https://support.microsoft.com/en-us/excel/functions/imlog10-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMLOG2`](https://support.microsoft.com/en-us/excel/functions/imlog2-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMPOWER`](https://support.microsoft.com/en-us/excel/functions/impower-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMPRODUCT`](https://support.microsoft.com/en-us/excel/functions/improduct-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMREAL`](https://support.microsoft.com/en-us/excel/functions/imreal-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMSEC`](https://support.microsoft.com/en-us/excel/functions/imsec-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMSECH`](https://support.microsoft.com/en-us/excel/functions/imsech-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMSIN`](https://support.microsoft.com/en-us/excel/functions/imsin-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMSINH`](https://support.microsoft.com/en-us/excel/functions/imsinh-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMSQRT`](https://support.microsoft.com/en-us/excel/functions/imsqrt-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMSUB`](https://support.microsoft.com/en-us/excel/functions/imsub-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMSUM`](https://support.microsoft.com/en-us/excel/functions/imsum-function) | Not supported | Not supported | Not registered in either engine. |
| [`IMTAN`](https://support.microsoft.com/en-us/excel/functions/imtan-function) | Not supported | Not supported | Not registered in either engine. |
| [`OCT2BIN`](https://support.microsoft.com/en-us/excel/functions/oct2bin-function) | Not supported | Not supported | Not registered in either engine. |
| [`OCT2DEC`](https://support.microsoft.com/en-us/excel/functions/oct2dec-function) | Not supported | Not supported | Not registered in either engine. |
| [`OCT2HEX`](https://support.microsoft.com/en-us/excel/functions/oct2hex-function) | Not supported | Not supported | Not registered in either engine. |

## Financial functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`ACCRINT`](https://support.microsoft.com/en-us/excel/functions/accrint-function) | Not supported | Not supported | Not registered in either engine. |
| [`ACCRINTM`](https://support.microsoft.com/en-us/excel/functions/accrintm-function) | Not supported | Not supported | Not registered in either engine. |
| [`AMORDEGRC`](https://support.microsoft.com/en-us/excel/functions/amordegrc-function) | Not supported | Not supported | Not registered in either engine. |
| [`AMORLINC`](https://support.microsoft.com/en-us/excel/functions/amorlinc-function) | Not supported | Not supported | Not registered in either engine. |
| [`COUPDAYBS`](https://support.microsoft.com/en-us/excel/functions/coupdaybs-function) | Not supported | Not supported | Not registered in either engine. |
| [`COUPDAYS`](https://support.microsoft.com/en-us/excel/functions/coupdays-function) | Not supported | Not supported | Not registered in either engine. |
| [`COUPDAYSNC`](https://support.microsoft.com/en-us/excel/functions/coupdaysnc-function) | Not supported | Not supported | Not registered in either engine. |
| [`COUPNCD`](https://support.microsoft.com/en-us/excel/functions/coupncd-function) | Not supported | Not supported | Not registered in either engine. |
| [`COUPNUM`](https://support.microsoft.com/en-us/excel/functions/coupnum-function) | Not supported | Not supported | Not registered in either engine. |
| [`COUPPCD`](https://support.microsoft.com/en-us/excel/functions/couppcd-function) | Not supported | Not supported | Not registered in either engine. |
| [`CUMIPMT`](https://support.microsoft.com/en-us/excel/functions/cumipmt-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`CUMPRINC`](https://support.microsoft.com/en-us/excel/functions/cumprinc-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`DB`](https://support.microsoft.com/en-us/excel/functions/db-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`DDB`](https://support.microsoft.com/en-us/excel/functions/ddb-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`DISC`](https://support.microsoft.com/en-us/excel/functions/disc-function) | Not supported | Not supported | Not registered in either engine. |
| [`DOLLARDE`](https://support.microsoft.com/en-us/excel/functions/dollarde-function) | Not supported | Not supported | Not registered in either engine. |
| [`DOLLARFR`](https://support.microsoft.com/en-us/excel/functions/dollarfr-function) | Not supported | Not supported | Not registered in either engine. |
| [`DURATION`](https://support.microsoft.com/en-us/excel/functions/duration-function) | Not supported | Not supported | Not registered in either engine. |
| [`EFFECT`](https://support.microsoft.com/en-us/excel/functions/effect-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`FV`](https://support.microsoft.com/en-us/excel/functions/fv-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/financial/) |
| [`FVSCHEDULE`](https://support.microsoft.com/en-us/excel/functions/fvschedule-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`INTRATE`](https://support.microsoft.com/en-us/excel/functions/intrate-function) | Not supported | Not supported | Not registered in either engine. |
| [`IPMT`](https://support.microsoft.com/en-us/excel/functions/ipmt-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/financial/) |
| [`IRR`](https://support.microsoft.com/en-us/excel/functions/irr-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/financial/) |
| [`ISPMT`](https://support.microsoft.com/en-us/excel/functions/ispmt-function) | Not supported | Not supported | Not registered in either engine. |
| [`MDURATION`](https://support.microsoft.com/en-us/excel/functions/mduration-function) | Not supported | Not supported | Not registered in either engine. |
| [`MIRR`](https://support.microsoft.com/en-us/excel/functions/mirr-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`NOMINAL`](https://support.microsoft.com/en-us/excel/functions/nominal-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`NPER`](https://support.microsoft.com/en-us/excel/functions/nper-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`NPV`](https://support.microsoft.com/en-us/excel/functions/npv-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/financial/) |
| [`ODDFPRICE`](https://support.microsoft.com/en-us/excel/functions/oddfprice-function) | Not supported | Not supported | Not registered in either engine. |
| [`ODDFYIELD`](https://support.microsoft.com/en-us/excel/functions/oddfyield-function) | Not supported | Not supported | Not registered in either engine. |
| [`ODDLPRICE`](https://support.microsoft.com/en-us/excel/functions/oddlprice-function) | Not supported | Not supported | Not registered in either engine. |
| [`ODDLYIELD`](https://support.microsoft.com/en-us/excel/functions/oddlyield-function) | Not supported | Not supported | Not registered in either engine. |
| [`PDURATION`](https://support.microsoft.com/en-us/excel/functions/pduration-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`PMT`](https://support.microsoft.com/en-us/excel/functions/pmt-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/financial/) |
| [`PPMT`](https://support.microsoft.com/en-us/excel/functions/ppmt-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/financial/) |
| [`PRICE`](https://support.microsoft.com/en-us/excel/functions/price-function) | Not supported | Not supported | Not registered in either engine. |
| [`PRICEDISC`](https://support.microsoft.com/en-us/excel/functions/pricedisc-function) | Not supported | Not supported | Not registered in either engine. |
| [`PRICEMAT`](https://support.microsoft.com/en-us/excel/functions/pricemat-function) | Not supported | Not supported | Not registered in either engine. |
| [`PV`](https://support.microsoft.com/en-us/excel/functions/pv-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/financial/) |
| [`RATE`](https://support.microsoft.com/en-us/excel/functions/rate-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/financial/) |
| [`RECEIVED`](https://support.microsoft.com/en-us/excel/functions/received-function) | Not supported | Not supported | Not registered in either engine. |
| [`RRI`](https://support.microsoft.com/en-us/excel/functions/rri-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`SLN`](https://support.microsoft.com/en-us/excel/functions/sln-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`SYD`](https://support.microsoft.com/en-us/excel/functions/syd-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`TBILLEQ`](https://support.microsoft.com/en-us/excel/functions/tbilleq-function) | Not supported | Not supported | Not registered in either engine. |
| [`TBILLPRICE`](https://support.microsoft.com/en-us/excel/functions/tbillprice-function) | Not supported | Not supported | Not registered in either engine. |
| [`TBILLYIELD`](https://support.microsoft.com/en-us/excel/functions/tbillyield-function) | Not supported | Not supported | Not registered in either engine. |
| [`VDB`](https://support.microsoft.com/en-us/excel/functions/vdb-function) | Not supported | Not supported | Not registered in either engine. |
| [`XIRR`](https://support.microsoft.com/en-us/excel/functions/xirr-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`XNPV`](https://support.microsoft.com/en-us/excel/functions/xnpv-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/financial/) |
| [`YIELD`](https://support.microsoft.com/en-us/excel/functions/yield-function) | Not supported | Not supported | Not registered in either engine. |
| [`YIELDDISC`](https://support.microsoft.com/en-us/excel/functions/yielddisc-function) | Not supported | Not supported | Not registered in either engine. |
| [`YIELDMAT`](https://support.microsoft.com/en-us/excel/functions/yieldmat-function) | Not supported | Not supported | Not registered in either engine. |

## Information functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`CELL`](https://support.microsoft.com/en-us/excel/functions/cell-function) | Partly supported | Partly supported | CELL supports the info types address, col, contents, row and type. Other info types return #VALUE!. CELL without a reference describes the cell of the formula, as in LibreOffice. Excel uses the last changed cell. A formula that reads its own cell with FORMULATEXT, ISFORMULA or CELL is a #CYCLE! error. Cells inside a spilled range and host-linked reference cells hold no formula. For them, FORMULATEXT returns #N/A and ISFORMULA returns FALSE. [Contract](/docs/reference/formula-functions/information-error/) |
| [`ERROR.TYPE`](https://support.microsoft.com/en-us/excel/functions/error-type-function) | Not supported | Not supported | Not registered in either engine. |
| [`INFO`](https://support.microsoft.com/en-us/excel/functions/info-function) | Not supported | Not supported | Not registered in either engine. |
| [`ISBLANK`](https://support.microsoft.com/en-us/excel/is-functions) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`ISERR`](https://support.microsoft.com/en-us/excel/is-functions) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`ISERROR`](https://support.microsoft.com/en-us/excel/is-functions) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`ISEVEN`](https://support.microsoft.com/en-us/excel/functions/iseven-function) | Not supported | Not supported | Not registered in either engine. |
| [`ISFORMULA`](https://support.microsoft.com/en-us/excel/functions/isformula-function) | Partly supported | Partly supported | CELL supports the info types address, col, contents, row and type. Other info types return #VALUE!. CELL without a reference describes the cell of the formula, as in LibreOffice. Excel uses the last changed cell. A formula that reads its own cell with FORMULATEXT, ISFORMULA or CELL is a #CYCLE! error. Cells inside a spilled range and host-linked reference cells hold no formula. For them, FORMULATEXT returns #N/A and ISFORMULA returns FALSE. [Contract](/docs/reference/formula-functions/information-error/) |
| [`ISLOGICAL`](https://support.microsoft.com/en-us/excel/is-functions) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`ISNA`](https://support.microsoft.com/en-us/excel/is-functions) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`ISNONTEXT`](https://support.microsoft.com/en-us/excel/is-functions) | Not supported | Not supported | Not registered in either engine. |
| [`ISNUMBER`](https://support.microsoft.com/en-us/excel/is-functions) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`ISODD`](https://support.microsoft.com/en-us/excel/is-functions) | Not supported | Not supported | Not registered in either engine. |
| [`ISOMITTED`](https://support.microsoft.com/en-us/excel/functions/isomitted-function) | Partly supported | Not supported | Lite engine: not registered. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays. [Contract](/docs/reference/formula-functions/information-error/) |
| [`ISREF`](https://support.microsoft.com/en-us/excel/is-functions) | Not supported | Not supported | Not registered in either engine. |
| [`ISTEXT`](https://support.microsoft.com/en-us/excel/is-functions) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`N`](https://support.microsoft.com/en-us/excel/functions/n-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`NA`](https://support.microsoft.com/en-us/excel/functions/na-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`SHEET`](https://support.microsoft.com/en-us/excel/functions/sheet-function) | Not supported | Not supported | Not registered in either engine. |
| [`SHEETS`](https://support.microsoft.com/en-us/excel/functions/sheets-function) | Not supported | Not supported | Not registered in either engine. |
| [`STOCKHISTORY`](https://support.microsoft.com/en-us/excel/functions/stockhistory-function) | Not supported | Not supported | Not registered in either engine. |
| [`TYPE`](https://support.microsoft.com/en-us/excel/functions/type-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |

## Logical functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`AND`](https://support.microsoft.com/en-us/excel/functions/and-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |
| [`BYCOL`](https://support.microsoft.com/en-us/excel/functions/bycol-function) | Partly supported | Not supported | Lite engine: not registered. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays. [Contract](/docs/reference/formula-functions/logical-control/) |
| [`BYROW`](https://support.microsoft.com/en-us/excel/functions/byrow-function) | Partly supported | Not supported | Lite engine: not registered. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays. [Contract](/docs/reference/formula-functions/logical-control/) |
| [`FALSE`](https://support.microsoft.com/en-us/excel/functions/false-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |
| [`IF`](https://support.microsoft.com/en-us/excel/functions/if-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |
| [`IFERROR`](https://support.microsoft.com/en-us/excel/functions/iferror-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`IFNA`](https://support.microsoft.com/en-us/excel/functions/ifna-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`IFS`](https://support.microsoft.com/en-us/excel/functions/ifs-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |
| [`LAMBDA`](https://support.microsoft.com/en-us/excel/functions/lambda-function) | Partly supported | Not supported | Lite engine: not registered. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays. An error argument stops the call before the body runs. =LAMBDA(x,IFERROR(x,0))(1/0) returns #DIV/0!; Excel returns 0 (#246). [Contract](/docs/reference/formula-functions/logical-control/) |
| [`LET`](https://support.microsoft.com/en-us/excel/functions/let-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |
| [`MAKEARRAY`](https://support.microsoft.com/en-us/excel/functions/makearray-function) | Partly supported | Not supported | Lite engine: not registered. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays. [Contract](/docs/reference/formula-functions/logical-control/) |
| [`MAP`](https://support.microsoft.com/en-us/excel/functions/map-function) | Partly supported | Not supported | Lite engine: not registered. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays. [Contract](/docs/reference/formula-functions/logical-control/) |
| [`NOT`](https://support.microsoft.com/en-us/excel/functions/not-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |
| [`OR`](https://support.microsoft.com/en-us/excel/functions/or-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |
| [`REDUCE`](https://support.microsoft.com/en-us/excel/functions/reduce-function) | Partly supported | Not supported | Lite engine: not registered. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays. [Contract](/docs/reference/formula-functions/logical-control/) |
| [`SCAN`](https://support.microsoft.com/en-us/excel/functions/scan-function) | Partly supported | Not supported | Lite engine: not registered. Named ranges are supported, but workbook-defined named formulas are not available. LAMBDA uses lexical parameters and LET bindings. Calls are limited to depth 64 and 2000000 work units. Helpers reject nested arrays. [Contract](/docs/reference/formula-functions/logical-control/) |
| [`SWITCH`](https://support.microsoft.com/en-us/excel/functions/switch-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |
| [`TRUE`](https://support.microsoft.com/en-us/excel/functions/true-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |
| [`XOR`](https://support.microsoft.com/en-us/excel/functions/xor-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/logical-control/) |

## Lookup and reference functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`ADDRESS`](https://support.microsoft.com/en-us/excel/functions/address-function) | Partly supported | Partly supported | Fractional row and column numbers return #VALUE!. Excel truncates them, as in =ADDRESS(2.5,1) (#246). Some argument errors become #VALUE!. Excel keeps the original error, as in =ADDRESS(1,1,NA()) (#246). [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`AREAS`](https://support.microsoft.com/en-us/excel/functions/areas-function) | Partly supported | Partly supported | A space between two references is the intersection operator. An empty intersection, or references on different sheets, return #NULL!. A non-reference operand returns #VALUE!. Spaces around other operators, after commas, before a closing parenthesis and between a function name and its parenthesis are not operators. A comma inside parentheses that are not a function call is the union operator, as in (A1:A2,C1:C2). Aggregate functions that read their arguments as a list of values accept a union. INDEX picks area area_num of a union, and an area_num past the last area returns #REF!. A union in any other position returns #VALUE!. AREAS counts the areas of a reference: the members of a union, or 1 for a cell, range or intersection. A non-reference argument returns #VALUE!. A 3-D reference such as Sheet1:Sheet3!A1:B2 or 'Sheet 1:Sheet 3'!A1 spans the sheets between its endpoints in workbook tab order. SUM, AVERAGE, COUNT, COUNTA, MAX, MIN, PRODUCT, STDEV.S, STDEV.P, VAR.S and VAR.P accept it; any other position returns #VALUE!. Excel also accepts it in the A-suffixed aggregate functions. A sheet inserted or moved inside the span joins it; a sheet moved out leaves it. Deleting an endpoint moves the endpoint to its inner neighbour; moving an endpoint past the other endpoint drops it; renaming an endpoint rewrites the formula text. Deleting every sheet of the span gives #REF!. Row and column edits do not change a 3-D reference. Cells beyond a smaller sheet's grid read as blank. XLSX import and export keep the Excel formula text of intersections, unions and 3-D references. [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`CHOOSE`](https://support.microsoft.com/en-us/excel/functions/choose-function) | Partly supported | Partly supported | Fractional index arguments return #VALUE!. Excel truncates them, as in =CHOOSE(1.5,"a","b") (#246). [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`CHOOSECOLS`](https://support.microsoft.com/en-us/excel/functions/choosecols-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/array/) |
| [`CHOOSEROWS`](https://support.microsoft.com/en-us/excel/functions/chooserows-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/array/) |
| [`COLUMN`](https://support.microsoft.com/en-us/excel/functions/column-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`COLUMNS`](https://support.microsoft.com/en-us/excel/functions/columns-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`DROP`](https://support.microsoft.com/en-us/excel/functions/drop-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/array/) |
| [`EXPAND`](https://support.microsoft.com/en-us/excel/functions/expand-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/array/) |
| [`FILTER`](https://support.microsoft.com/en-us/excel/functions/filter-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/array/) |
| [`FORMULATEXT`](https://support.microsoft.com/en-us/excel/functions/formulatext-function) | Partly supported | Partly supported | CELL supports the info types address, col, contents, row and type. Other info types return #VALUE!. CELL without a reference describes the cell of the formula, as in LibreOffice. Excel uses the last changed cell. A formula that reads its own cell with FORMULATEXT, ISFORMULA or CELL is a #CYCLE! error. Cells inside a spilled range and host-linked reference cells hold no formula. For them, FORMULATEXT returns #N/A and ISFORMULA returns FALSE. [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`GETPIVOTDATA`](https://support.microsoft.com/en-us/excel/functions/getpivotdata-function) | Not supported | Not supported | Not registered in either engine. |
| [`GROUPBY`](https://support.microsoft.com/en-us/excel/functions/groupby-function) | Partly supported | Not supported | Lite engine: not registered. Aggregators must be a single eta-reduced built-in or a LAMBDA with one or two parameters. Vectors of functions are not supported. Grouping and output use the engine spill and work limits. [Contract](/docs/reference/formula-functions/array/) |
| [`HLOOKUP`](https://support.microsoft.com/en-us/excel/functions/hlookup-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`HSTACK`](https://support.microsoft.com/en-us/excel/functions/hstack-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/array/) |
| [`HYPERLINK`](https://support.microsoft.com/en-us/excel/functions/hyperlink-function) | Partly supported | Partly supported | HYPERLINK returns its display value: the friendly name, or the link when there is no friendly name. The grid does not open the link. Use cell hyperlinks for links that open. [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`IMAGE`](https://support.microsoft.com/en-us/excel/functions/image-function) | Not supported | Not supported | Unsupported by design: Formula evaluation never performs network requests. |
| [`INDEX`](https://support.microsoft.com/en-us/excel/functions/index-function) | Partly supported | Partly supported | Fractional row and column numbers return #VALUE!. Excel truncates them, as in =INDEX(A1:A5,2.9) (#246). Row or column number 0 returns #VALUE!. Excel returns the whole column or row, as in =SUM(INDEX(A1:B5,0,1)) (#246). [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`INDIRECT`](https://support.microsoft.com/en-us/excel/functions/indirect-function) | Partly supported | Partly supported | OFFSET and INDIRECT are volatile and return references. Multi-cell results spill when used as formula results; reference-taking functions consume the reference. OFFSET requires a reference and positive height and width; omitted dimensions inherit the source shape. Row and column offsets truncate toward zero. Out-of-grid bounds return #REF!; nonpositive dimensions, nonnumeric offsets and a non-reference first argument return #VALUE!. INDIRECT supports A1 by default and R1C1 when a1 is FALSE, including relative R1C1 coordinates, sheet-qualified references, defined names and table references. Invalid reference text and external workbook references return #REF!. Reference text inside INDIRECT is not rewritten by fill, copy or structural edits. Ordinary reference arguments to OFFSET are rewritten. References must stay within the Excel grid; reading beyond the loaded sheet retains the engine's #REF! behavior. Existing range, spill and work limits apply. A reference that creates a runtime dependency cycle returns #CYCLE!. [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`LOOKUP`](https://support.microsoft.com/en-us/excel/functions/lookup-function) | Not supported | Not supported | Not registered in either engine. |
| [`MATCH`](https://support.microsoft.com/en-us/excel/functions/match-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`OFFSET`](https://support.microsoft.com/en-us/excel/functions/offset-function) | Partly supported | Partly supported | OFFSET and INDIRECT are volatile and return references. Multi-cell results spill when used as formula results; reference-taking functions consume the reference. OFFSET requires a reference and positive height and width; omitted dimensions inherit the source shape. Row and column offsets truncate toward zero. Out-of-grid bounds return #REF!; nonpositive dimensions, nonnumeric offsets and a non-reference first argument return #VALUE!. INDIRECT supports A1 by default and R1C1 when a1 is FALSE, including relative R1C1 coordinates, sheet-qualified references, defined names and table references. Invalid reference text and external workbook references return #REF!. Reference text inside INDIRECT is not rewritten by fill, copy or structural edits. Ordinary reference arguments to OFFSET are rewritten. References must stay within the Excel grid; reading beyond the loaded sheet retains the engine's #REF! behavior. Existing range, spill and work limits apply. A reference that creates a runtime dependency cycle returns #CYCLE!. [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`PIVOTBY`](https://support.microsoft.com/en-us/excel/functions/pivotby-function) | Partly supported | Not supported | Lite engine: not registered. Aggregators must be a single eta-reduced built-in or a LAMBDA with one or two parameters. Vectors of functions are not supported. Grouping and output use the engine spill and work limits. [Contract](/docs/reference/formula-functions/array/) |
| [`ROW`](https://support.microsoft.com/en-us/excel/functions/row-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`ROWS`](https://support.microsoft.com/en-us/excel/functions/rows-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`RTD`](https://support.microsoft.com/en-us/excel/functions/rtd-function) | Not supported | Not supported | Unsupported by design: Functions that query external providers or live data connections are not evaluated. |
| [`SORT`](https://support.microsoft.com/en-us/excel/functions/sort-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/array/) |
| [`SORTBY`](https://support.microsoft.com/en-us/excel/functions/sortby-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/array/) |
| [`TAKE`](https://support.microsoft.com/en-us/excel/functions/take-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/array/) |
| [`TOCOL`](https://support.microsoft.com/en-us/excel/functions/tocol-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/array/) |
| [`TOROW`](https://support.microsoft.com/en-us/excel/functions/torow-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/array/) |
| [`TRANSPOSE`](https://support.microsoft.com/en-us/excel/functions/transpose-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/array/) |
| [`TRIMRANGE`](https://support.microsoft.com/en-us/excel/functions/trimrange-function) | Not supported | Not supported | Not registered in either engine. |
| [`UNIQUE`](https://support.microsoft.com/en-us/excel/functions/unique-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/array/) |
| [`VLOOKUP`](https://support.microsoft.com/en-us/excel/functions/vlookup-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`VSTACK`](https://support.microsoft.com/en-us/excel/functions/vstack-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/array/) |
| [`WRAPCOLS`](https://support.microsoft.com/en-us/excel/functions/wrapcols-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/array/) |
| [`WRAPROWS`](https://support.microsoft.com/en-us/excel/functions/wraprows-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/array/) |
| [`XLOOKUP`](https://support.microsoft.com/en-us/excel/functions/xlookup-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/lookup-reference/) |
| [`XMATCH`](https://support.microsoft.com/en-us/excel/functions/xmatch-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/lookup-reference/) |

## Math and trigonometry functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`ABS`](https://support.microsoft.com/en-us/excel/functions/abs-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`ACOS`](https://support.microsoft.com/en-us/excel/functions/acos-function) | Not supported | Not supported | Not registered in either engine. |
| [`ACOSH`](https://support.microsoft.com/en-us/excel/functions/acosh-function) | Not supported | Not supported | Not registered in either engine. |
| [`ACOT`](https://support.microsoft.com/en-us/excel/functions/acot-function) | Not supported | Not supported | Not registered in either engine. |
| [`ACOTH`](https://support.microsoft.com/en-us/excel/functions/acoth-function) | Not supported | Not supported | Not registered in either engine. |
| [`AGGREGATE`](https://support.microsoft.com/en-us/excel/functions/aggregate-function) | Partly supported | Not supported | Lite engine: not registered. Hidden rows are not part of the engine model. AGGREGATE row visibility options therefore have no effect. [Contract](/docs/reference/formula-functions/math/) |
| [`ARABIC`](https://support.microsoft.com/en-us/excel/functions/arabic-function) | Not supported | Not supported | Not registered in either engine. |
| [`ASIN`](https://support.microsoft.com/en-us/excel/functions/asin-function) | Not supported | Not supported | Not registered in either engine. |
| [`ASINH`](https://support.microsoft.com/en-us/excel/functions/asinh-function) | Not supported | Not supported | Not registered in either engine. |
| [`ATAN`](https://support.microsoft.com/en-us/excel/functions/atan-function) | Not supported | Not supported | Not registered in either engine. |
| [`ATAN2`](https://support.microsoft.com/en-us/excel/functions/atan2-function) | Not supported | Not supported | Not registered in either engine. |
| [`ATANH`](https://support.microsoft.com/en-us/excel/functions/atanh-function) | Not supported | Not supported | Not registered in either engine. |
| [`BASE`](https://support.microsoft.com/en-us/excel/functions/base-function) | Not supported | Not supported | Not registered in either engine. |
| [`CEILING`](https://support.microsoft.com/en-us/excel/functions/ceiling-function) | Partly supported | Partly supported | The quotient is not corrected for binary error, and significance signs are not checked. =FLOOR(0.3,0.1) can return 0.2, and =FLOOR(2.5,-2) returns 4 instead of #NUM! (#246). [Contract](/docs/reference/formula-functions/math/) |
| [`CEILING.MATH`](https://support.microsoft.com/en-us/excel/functions/ceiling-math-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`CEILING.PRECISE`](https://support.microsoft.com/en-us/excel/functions/ceiling-precise-function) | Not supported | Not supported | Not registered in either engine. |
| [`COMBIN`](https://support.microsoft.com/en-us/excel/functions/combin-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`COMBINA`](https://support.microsoft.com/en-us/excel/functions/combina-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`COS`](https://support.microsoft.com/en-us/excel/functions/cos-function) | Not supported | Not supported | Not registered in either engine. |
| [`COSH`](https://support.microsoft.com/en-us/excel/functions/cosh-function) | Not supported | Not supported | Not registered in either engine. |
| [`COT`](https://support.microsoft.com/en-us/excel/functions/cot-function) | Not supported | Not supported | Not registered in either engine. |
| [`COTH`](https://support.microsoft.com/en-us/excel/functions/coth-function) | Not supported | Not supported | Not registered in either engine. |
| [`CSC`](https://support.microsoft.com/en-us/excel/functions/csc-function) | Not supported | Not supported | Not registered in either engine. |
| [`CSCH`](https://support.microsoft.com/en-us/excel/functions/csch-function) | Not supported | Not supported | Not registered in either engine. |
| [`DECIMAL`](https://support.microsoft.com/en-us/excel/functions/decimal-function) | Not supported | Not supported | Not registered in either engine. |
| [`DEGREES`](https://support.microsoft.com/en-us/excel/functions/degrees-function) | Not supported | Not supported | Not registered in either engine. |
| [`EVEN`](https://support.microsoft.com/en-us/excel/functions/even-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`EXP`](https://support.microsoft.com/en-us/excel/functions/exp-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`FACT`](https://support.microsoft.com/en-us/excel/functions/fact-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`FACTDOUBLE`](https://support.microsoft.com/en-us/excel/functions/factdouble-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`FLOOR`](https://support.microsoft.com/en-us/excel/functions/floor-function) | Partly supported | Partly supported | The quotient is not corrected for binary error, and significance signs are not checked. =FLOOR(0.3,0.1) can return 0.2, and =FLOOR(2.5,-2) returns 4 instead of #NUM! (#246). [Contract](/docs/reference/formula-functions/math/) |
| [`FLOOR.MATH`](https://support.microsoft.com/en-us/excel/functions/floor-math-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`FLOOR.PRECISE`](https://support.microsoft.com/en-us/excel/functions/floor-precise-function) | Not supported | Not supported | Not registered in either engine. |
| [`GCD`](https://support.microsoft.com/en-us/excel/functions/gcd-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`INT`](https://support.microsoft.com/en-us/excel/functions/int-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`ISO.CEILING`](https://support.microsoft.com/en-us/excel/functions/iso-ceiling-function) | Not supported | Not supported | Not registered in either engine. |
| [`LCM`](https://support.microsoft.com/en-us/excel/functions/lcm-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`LN`](https://support.microsoft.com/en-us/excel/functions/ln-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`LOG`](https://support.microsoft.com/en-us/excel/functions/log-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`LOG10`](https://support.microsoft.com/en-us/excel/functions/log10-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`MDETERM`](https://support.microsoft.com/en-us/excel/functions/mdeterm-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`MINVERSE`](https://support.microsoft.com/en-us/excel/functions/minverse-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`MMULT`](https://support.microsoft.com/en-us/excel/functions/mmult-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`MOD`](https://support.microsoft.com/en-us/excel/functions/mod-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`MROUND`](https://support.microsoft.com/en-us/excel/functions/mround-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`MULTINOMIAL`](https://support.microsoft.com/en-us/excel/functions/multinomial-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`MUNIT`](https://support.microsoft.com/en-us/excel/functions/munit-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`ODD`](https://support.microsoft.com/en-us/excel/functions/odd-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`PERCENTOF`](https://support.microsoft.com/en-us/excel/functions/percentof-function) | Partly supported | Not supported | Lite engine: not registered. Aggregators must be a single eta-reduced built-in or a LAMBDA with one or two parameters. Vectors of functions are not supported. Grouping and output use the engine spill and work limits. [Contract](/docs/reference/formula-functions/array/) |
| [`PI`](https://support.microsoft.com/en-us/excel/functions/pi-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`POWER`](https://support.microsoft.com/en-us/excel/functions/power-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`PRODUCT`](https://support.microsoft.com/en-us/excel/functions/product-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`QUOTIENT`](https://support.microsoft.com/en-us/excel/functions/quotient-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`RADIANS`](https://support.microsoft.com/en-us/excel/functions/radians-function) | Not supported | Not supported | Not registered in either engine. |
| [`RAND`](https://support.microsoft.com/en-us/excel/functions/rand-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`RANDARRAY`](https://support.microsoft.com/en-us/excel/functions/randarray-function) | Not supported | Not supported | Unsupported by design: RANDARRAY returns a volatile array and is outside the supported contract. |
| [`RANDBETWEEN`](https://support.microsoft.com/en-us/excel/functions/randbetween-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`ROMAN`](https://support.microsoft.com/en-us/excel/functions/roman-function) | Not supported | Not supported | Not registered in either engine. |
| [`ROUND`](https://support.microsoft.com/en-us/excel/functions/round-function) | Partly supported | Partly supported | Decimal rounding exposes binary scaling error. =ROUND(1.005,2) returns 1; Excel returns 1.01 (#246). [Contract](/docs/reference/formula-functions/math/) |
| [`ROUNDDOWN`](https://support.microsoft.com/en-us/excel/functions/rounddown-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`ROUNDUP`](https://support.microsoft.com/en-us/excel/functions/roundup-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`SEC`](https://support.microsoft.com/en-us/excel/functions/sec-function) | Not supported | Not supported | Not registered in either engine. |
| [`SECH`](https://support.microsoft.com/en-us/excel/functions/sech-function) | Not supported | Not supported | Not registered in either engine. |
| [`SEQUENCE`](https://support.microsoft.com/en-us/excel/functions/sequence-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/array/) |
| [`SERIESSUM`](https://support.microsoft.com/en-us/excel/functions/seriessum-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`SIGN`](https://support.microsoft.com/en-us/excel/functions/sign-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`SIN`](https://support.microsoft.com/en-us/excel/functions/sin-function) | Not supported | Not supported | Not registered in either engine. |
| [`SINH`](https://support.microsoft.com/en-us/excel/functions/sinh-function) | Not supported | Not supported | Not registered in either engine. |
| [`SQRT`](https://support.microsoft.com/en-us/excel/functions/sqrt-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`SQRTPI`](https://support.microsoft.com/en-us/excel/functions/sqrtpi-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`SUBTOTAL`](https://support.microsoft.com/en-us/excel/functions/subtotal-function) | Partly supported | Partly supported | Only function codes 1 to 11 are accepted. Codes 101 to 111, which ignore hidden rows in Excel, return #VALUE! (#246). [Contract](/docs/reference/formula-functions/math/) |
| [`SUM`](https://support.microsoft.com/en-us/excel/functions/sum-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`SUMIF`](https://support.microsoft.com/en-us/excel/functions/sumif-function) | Partly supported | Partly supported | A not-equal criterion does not match a value of a different type. With 5, "x" and a blank cell, "<>" selects only the text cell; Excel selects both nonblank cells (#246). The value range must have the same shape as the criteria range. =SUMIF(A1:A10,">0",B1) returns #VALUE!; Excel uses B1 as the top-left cell of a ten-row value range (#246). [Contract](/docs/reference/formula-functions/math/) |
| [`SUMIFS`](https://support.microsoft.com/en-us/excel/functions/sumifs-function) | Partly supported | Partly supported | A not-equal criterion does not match a value of a different type. With 5, "x" and a blank cell, "<>" selects only the text cell; Excel selects both nonblank cells, as in =COUNTIF(A1:A3,"<>") (#246). [Contract](/docs/reference/formula-functions/math/) |
| [`SUMPRODUCT`](https://support.microsoft.com/en-us/excel/functions/sumproduct-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |
| [`SUMSQ`](https://support.microsoft.com/en-us/excel/functions/sumsq-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`SUMX2MY2`](https://support.microsoft.com/en-us/excel/functions/sumx2my2-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`SUMX2PY2`](https://support.microsoft.com/en-us/excel/functions/sumx2py2-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`SUMXMY2`](https://support.microsoft.com/en-us/excel/functions/sumxmy2-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`TAN`](https://support.microsoft.com/en-us/excel/functions/tan-function) | Not supported | Not supported | Not registered in either engine. |
| [`TANH`](https://support.microsoft.com/en-us/excel/functions/tanh-function) | Not supported | Not supported | Not registered in either engine. |
| [`TRUNC`](https://support.microsoft.com/en-us/excel/functions/trunc-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/math/) |

## Statistical functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`AVEDEV`](https://support.microsoft.com/en-us/excel/functions/avedev-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`AVERAGE`](https://support.microsoft.com/en-us/excel/functions/average-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`AVERAGEA`](https://support.microsoft.com/en-us/excel/functions/averagea-function) | Not supported | Not supported | Not registered in either engine. |
| [`AVERAGEIF`](https://support.microsoft.com/en-us/excel/functions/averageif-function) | Partly supported | Partly supported | A not-equal criterion does not match a value of a different type. With 5, "x" and a blank cell, "<>" selects only the text cell; Excel selects both nonblank cells (#246). The value range must have the same shape as the criteria range. =SUMIF(A1:A10,">0",B1) returns #VALUE!; Excel uses B1 as the top-left cell of a ten-row value range (#246). [Contract](/docs/reference/formula-functions/statistical/) |
| [`AVERAGEIFS`](https://support.microsoft.com/en-us/excel/functions/averageifs-function) | Partly supported | Partly supported | A not-equal criterion does not match a value of a different type. With 5, "x" and a blank cell, "<>" selects only the text cell; Excel selects both nonblank cells, as in =COUNTIF(A1:A3,"<>") (#246). [Contract](/docs/reference/formula-functions/statistical/) |
| [`BETA.DIST`](https://support.microsoft.com/en-us/excel/functions/beta-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`BETA.INV`](https://support.microsoft.com/en-us/excel/functions/beta-inv-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`BINOM.DIST`](https://support.microsoft.com/en-us/excel/functions/binom-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`BINOM.DIST.RANGE`](https://support.microsoft.com/en-us/excel/functions/binom-dist-range-function) | Not supported | Not supported | Not registered in either engine. |
| [`BINOM.INV`](https://support.microsoft.com/en-us/excel/functions/binom-inv-function) | Not supported | Not supported | Not registered in either engine. |
| [`CHISQ.DIST`](https://support.microsoft.com/en-us/excel/functions/chisq-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`CHISQ.DIST.RT`](https://support.microsoft.com/en-us/excel/functions/chisq-dist-rt-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`CHISQ.INV`](https://support.microsoft.com/en-us/excel/functions/chisq-inv-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`CHISQ.INV.RT`](https://support.microsoft.com/en-us/excel/functions/chisq-inv-rt-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`CHISQ.TEST`](https://support.microsoft.com/en-us/excel/functions/chisq-test-function) | Not supported | Not supported | Not registered in either engine. |
| [`CONFIDENCE.NORM`](https://support.microsoft.com/en-us/excel/functions/confidence-norm-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`CONFIDENCE.T`](https://support.microsoft.com/en-us/excel/functions/confidence-t-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`CORREL`](https://support.microsoft.com/en-us/excel/functions/correl-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`COUNT`](https://support.microsoft.com/en-us/excel/functions/count-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`COUNTA`](https://support.microsoft.com/en-us/excel/functions/counta-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`COUNTBLANK`](https://support.microsoft.com/en-us/excel/functions/countblank-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`COUNTIF`](https://support.microsoft.com/en-us/excel/get-started/use-the-countif-function-in-microsoft-excel) | Partly supported | Partly supported | A not-equal criterion does not match a value of a different type. With 5, "x" and a blank cell, "<>" selects only the text cell; Excel selects both nonblank cells, as in =COUNTIF(A1:A3,"<>") (#246). [Contract](/docs/reference/formula-functions/statistical/) |
| [`COUNTIFS`](https://support.microsoft.com/en-us/excel/functions/countifs-function) | Partly supported | Partly supported | A not-equal criterion does not match a value of a different type. With 5, "x" and a blank cell, "<>" selects only the text cell; Excel selects both nonblank cells, as in =COUNTIF(A1:A3,"<>") (#246). [Contract](/docs/reference/formula-functions/statistical/) |
| [`COVARIANCE.P`](https://support.microsoft.com/en-us/excel/functions/covariance-p-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`COVARIANCE.S`](https://support.microsoft.com/en-us/excel/functions/covariance-s-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`DEVSQ`](https://support.microsoft.com/en-us/excel/functions/devsq-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`EXPON.DIST`](https://support.microsoft.com/en-us/excel/functions/expon-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`F.DIST`](https://support.microsoft.com/en-us/excel/functions/f-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`F.DIST.RT`](https://support.microsoft.com/en-us/excel/functions/f-dist-rt-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`F.INV`](https://support.microsoft.com/en-us/excel/functions/f-inv-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`F.INV.RT`](https://support.microsoft.com/en-us/excel/functions/f-inv-rt-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`F.TEST`](https://support.microsoft.com/en-us/excel/functions/f-test-function) | Not supported | Not supported | Not registered in either engine. |
| [`FISHER`](https://support.microsoft.com/en-us/excel/functions/fisher-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`FISHERINV`](https://support.microsoft.com/en-us/excel/functions/fisherinv-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`FORECAST`](https://support.microsoft.com/en-us/excel/forecast-and-forecast-linear-functions) | Supported | Not supported | Alias of `FORECAST.LINEAR`. Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`FORECAST.ETS`](https://support.microsoft.com/en-us/excel/forecasting-functions-reference#_forecast.ets) | Not supported | Not supported | Not registered in either engine. |
| [`FORECAST.ETS.CONFINT`](https://support.microsoft.com/en-us/excel/forecasting-functions-reference#_forecast.ets.confint) | Not supported | Not supported | Not registered in either engine. |
| [`FORECAST.ETS.SEASONALITY`](https://support.microsoft.com/en-us/excel/forecasting-functions-reference#_forecast.ets.seasonality) | Not supported | Not supported | Not registered in either engine. |
| [`FORECAST.ETS.STAT`](https://support.microsoft.com/en-us/excel/forecasting-functions-reference#_forecast.ets.stat) | Not supported | Not supported | Not registered in either engine. |
| [`FORECAST.LINEAR`](https://support.microsoft.com/en-us/excel/forecasting-functions-reference#_forecast.linear) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`FREQUENCY`](https://support.microsoft.com/en-us/excel/functions/frequency-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`GAMMA`](https://support.microsoft.com/en-us/excel/functions/gamma-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`GAMMA.DIST`](https://support.microsoft.com/en-us/excel/functions/gamma-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`GAMMA.INV`](https://support.microsoft.com/en-us/excel/functions/gamma-inv-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`GAMMALN`](https://support.microsoft.com/en-us/excel/functions/gammaln-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`GAMMALN.PRECISE`](https://support.microsoft.com/en-us/excel/functions/gammaln-precise-function) | Not supported | Not supported | Not registered in either engine. |
| [`GAUSS`](https://support.microsoft.com/en-us/excel/functions/gauss-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`GEOMEAN`](https://support.microsoft.com/en-us/excel/functions/geomean-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`GROWTH`](https://support.microsoft.com/en-us/excel/functions/growth-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`HARMEAN`](https://support.microsoft.com/en-us/excel/functions/harmean-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`HYPGEOM.DIST`](https://support.microsoft.com/en-us/excel/functions/hypgeom-dist-function) | Not supported | Not supported | Not registered in either engine. |
| [`INTERCEPT`](https://support.microsoft.com/en-us/excel/functions/intercept-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`KURT`](https://support.microsoft.com/en-us/excel/functions/kurt-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`LARGE`](https://support.microsoft.com/en-us/excel/functions/large-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`LINEST`](https://support.microsoft.com/en-us/excel/functions/linest-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`LOGEST`](https://support.microsoft.com/en-us/excel/functions/logest-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`LOGNORM.DIST`](https://support.microsoft.com/en-us/excel/functions/lognorm-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`LOGNORM.INV`](https://support.microsoft.com/en-us/excel/functions/lognorm-inv-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`MAX`](https://support.microsoft.com/en-us/excel/functions/max-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`MAXA`](https://support.microsoft.com/en-us/excel/functions/maxa-function) | Not supported | Not supported | Not registered in either engine. |
| [`MAXIFS`](https://support.microsoft.com/en-us/excel/functions/maxifs-function) | Partly supported | Partly supported | A not-equal criterion does not match a value of a different type. With 5, "x" and a blank cell, "<>" selects only the text cell; Excel selects both nonblank cells, as in =COUNTIF(A1:A3,"<>") (#246). [Contract](/docs/reference/formula-functions/statistical/) |
| [`MEDIAN`](https://support.microsoft.com/en-us/excel/functions/median-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`MIN`](https://support.microsoft.com/en-us/excel/functions/min-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`MINA`](https://support.microsoft.com/en-us/excel/functions/mina-function) | Not supported | Not supported | Not registered in either engine. |
| [`MINIFS`](https://support.microsoft.com/en-us/excel/functions/minifs-function) | Partly supported | Partly supported | A not-equal criterion does not match a value of a different type. With 5, "x" and a blank cell, "<>" selects only the text cell; Excel selects both nonblank cells, as in =COUNTIF(A1:A3,"<>") (#246). [Contract](/docs/reference/formula-functions/statistical/) |
| [`MODE.MULT`](https://support.microsoft.com/en-us/excel/functions/mode-mult-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`MODE.SNGL`](https://support.microsoft.com/en-us/excel/functions/mode-sngl-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`NEGBINOM.DIST`](https://support.microsoft.com/en-us/excel/functions/negbinom-dist-function) | Not supported | Not supported | Not registered in either engine. |
| [`NORM.DIST`](https://support.microsoft.com/en-us/excel/functions/norm-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`NORM.INV`](https://support.microsoft.com/en-us/excel/functions/norm-inv-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`NORM.S.DIST`](https://support.microsoft.com/en-us/excel/functions/norm-s-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`NORM.S.INV`](https://support.microsoft.com/en-us/excel/functions/norm-s-inv-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`PEARSON`](https://support.microsoft.com/en-us/excel/functions/pearson-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`PERCENTILE.EXC`](https://support.microsoft.com/en-us/excel/functions/percentile-exc-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`PERCENTILE.INC`](https://support.microsoft.com/en-us/excel/functions/percentile-inc-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`PERCENTRANK.EXC`](https://support.microsoft.com/en-us/excel/functions/percentrank-exc-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`PERCENTRANK.INC`](https://support.microsoft.com/en-us/excel/functions/percentrank-inc-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`PERMUT`](https://support.microsoft.com/en-us/excel/functions/permut-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`PERMUTATIONA`](https://support.microsoft.com/en-us/excel/functions/permutationa-function) | Supported | Not supported | Lite engine: not registered. Matrix functions use engine resource limits. [Contract](/docs/reference/formula-functions/math/) |
| [`PHI`](https://support.microsoft.com/en-us/excel/functions/phi-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`POISSON.DIST`](https://support.microsoft.com/en-us/excel/functions/poisson-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`PROB`](https://support.microsoft.com/en-us/excel/functions/prob-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`QUARTILE.EXC`](https://support.microsoft.com/en-us/excel/functions/quartile-exc-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`QUARTILE.INC`](https://support.microsoft.com/en-us/excel/functions/quartile-inc-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`RANK.AVG`](https://support.microsoft.com/en-us/excel/functions/rank-avg-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`RANK.EQ`](https://support.microsoft.com/en-us/excel/functions/rank-eq-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`RSQ`](https://support.microsoft.com/en-us/excel/functions/rsq-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`SKEW`](https://support.microsoft.com/en-us/excel/functions/skew-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`SKEW.P`](https://support.microsoft.com/en-us/excel/functions/skew-p-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`SLOPE`](https://support.microsoft.com/en-us/excel/functions/slope-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`SMALL`](https://support.microsoft.com/en-us/excel/functions/small-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`STANDARDIZE`](https://support.microsoft.com/en-us/excel/functions/standardize-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`STDEV.P`](https://support.microsoft.com/en-us/excel/functions/stdev-p-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`STDEV.S`](https://support.microsoft.com/en-us/excel/functions/stdev-s-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`STDEVA`](https://support.microsoft.com/en-us/excel/functions/stdeva-function) | Not supported | Not supported | Not registered in either engine. |
| [`STDEVPA`](https://support.microsoft.com/en-us/excel/functions/stdevpa-function) | Not supported | Not supported | Not registered in either engine. |
| [`STEYX`](https://support.microsoft.com/en-us/excel/functions/steyx-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`T.DIST`](https://support.microsoft.com/en-us/excel/functions/t-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`T.DIST.2T`](https://support.microsoft.com/en-us/excel/functions/t-dist-2t-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`T.DIST.RT`](https://support.microsoft.com/en-us/excel/functions/t-dist-rt-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`T.INV`](https://support.microsoft.com/en-us/excel/functions/t-inv-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`T.INV.2T`](https://support.microsoft.com/en-us/excel/functions/t-inv-2t-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`T.TEST`](https://support.microsoft.com/en-us/excel/functions/t-test-function) | Not supported | Not supported | Not registered in either engine. |
| [`TREND`](https://support.microsoft.com/en-us/excel/functions/trend-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/statistical/) |
| [`TRIMMEAN`](https://support.microsoft.com/en-us/excel/functions/trimmean-function) | Supported | Not supported | Lite engine: not registered. Regression functions skip pairs where either value is not a number. PERCENTRANK results are truncated, not rounded, to the requested significant digits. [Contract](/docs/reference/formula-functions/statistical/) |
| [`VAR.P`](https://support.microsoft.com/en-us/excel/functions/var-p-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`VAR.S`](https://support.microsoft.com/en-us/excel/functions/var-s-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/statistical/) |
| [`VARA`](https://support.microsoft.com/en-us/excel/functions/vara-function) | Not supported | Not supported | Not registered in either engine. |
| [`VARPA`](https://support.microsoft.com/en-us/excel/functions/varpa-function) | Not supported | Not supported | Not registered in either engine. |
| [`WEIBULL.DIST`](https://support.microsoft.com/en-us/excel/functions/weibull-dist-function) | Partly supported | Not supported | Lite engine: not registered. Scalar binary64 evaluation, not array broadcasting or blanket spreadsheet parity. Domain validation and finite numerical convergence may return #NUM!. [Contract](/docs/reference/formula-functions/statistical/) |
| [`Z.TEST`](https://support.microsoft.com/en-us/excel/functions/z-test-function) | Not supported | Not supported | Not registered in either engine. |

## Text functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`ARRAYTOTEXT`](https://support.microsoft.com/en-us/excel/functions/arraytotext-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/text/) |
| [`ASC`](https://support.microsoft.com/en-us/excel/functions/asc-function) | Not supported | Not supported | Not registered in either engine. |
| [`BAHTTEXT`](https://support.microsoft.com/en-us/excel/functions/bahttext-function) | Not supported | Not supported | Not registered in either engine. |
| [`CHAR`](https://support.microsoft.com/en-us/excel/functions/char-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`CLEAN`](https://support.microsoft.com/en-us/excel/functions/clean-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`CODE`](https://support.microsoft.com/en-us/excel/functions/code-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`CONCAT`](https://support.microsoft.com/en-us/excel/functions/concat-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`CONCATENATE`](https://support.microsoft.com/en-us/excel/functions/concatenate-function) | Supported | Supported | Alias of `CONCAT`. [Contract](/docs/reference/formula-functions/text/) |
| [`DBCS`](https://support.microsoft.com/en-us/excel/functions/dbcs-function) | Not supported | Not supported | Not registered in either engine. |
| [`DETECTLANGUAGE`](https://support.microsoft.com/en-us/excel/functions/detectlanguage-function) | Not supported | Not supported | Not registered in either engine. |
| [`DOLLAR`](https://support.microsoft.com/en-us/excel/functions/dollar-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/text/) |
| [`EXACT`](https://support.microsoft.com/en-us/excel/functions/exact-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`FIND`](https://support.microsoft.com/en-us/topic/c7912941-af2a-4bdf-a553-d0d89b0a0628) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`FINDB`](https://support.microsoft.com/en-us/topic/c7912941-af2a-4bdf-a553-d0d89b0a0628) | Not supported | Not supported | Not registered in either engine. |
| [`FIXED`](https://support.microsoft.com/en-us/excel/functions/fixed-function) | Partly supported | Not supported | Lite engine: not registered. Decimal rounding exposes binary scaling error. =ROUND(1.005,2) returns 1; Excel returns 1.01 (#246). [Contract](/docs/reference/formula-functions/text/) |
| [`LEFT`](https://support.microsoft.com/en-us/excel/functions/left-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`LEFTB`](https://support.microsoft.com/en-us/excel/functions/left-function) | Not supported | Not supported | Not registered in either engine. |
| [`LEN`](https://support.microsoft.com/en-us/excel/functions/len-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`LENB`](https://support.microsoft.com/en-us/excel/functions/len-function) | Not supported | Not supported | Not registered in either engine. |
| [`LOWER`](https://support.microsoft.com/en-us/excel/functions/lower-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`MID`](https://support.microsoft.com/en-us/excel/functions/mid-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`MIDB`](https://support.microsoft.com/en-us/excel/functions/mid-function) | Not supported | Not supported | Not registered in either engine. |
| [`NUMBERVALUE`](https://support.microsoft.com/en-us/excel/functions/numbervalue-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`PHONETIC`](https://support.microsoft.com/en-us/excel/functions/phonetic-function) | Not supported | Not supported | Not registered in either engine. |
| [`PROPER`](https://support.microsoft.com/en-us/excel/functions/proper-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`REGEXEXTRACT`](https://support.microsoft.com/en-us/excel/functions/regexextract-function) | Partly supported | Not supported | Lite engine: not registered. REGEXTEST, REGEXEXTRACT, and REGEXREPLACE use the regex-lite syntax, not full PCRE2. Lookaround, backreferences, Unicode classes such as \p{L}, and other patterns the engine cannot compile return #VALUE!. \d, \s, and \w use ASCII character classes. \b uses ASCII word boundaries. As in Excel, caseSensitivity is 0 (case-sensitive, the default) or 1 (case-insensitive). Case-insensitive matching and the (?i) flag fold ASCII letters only. If caseSensitivity is 1 or the pattern enables an inline i flag, a pattern with a non-ASCII cased letter or a \x, \u, or \U escape returns #VALUE!. Regex programs are limited to 2 MiB. Text inputs and outputs are limited to 32,767 characters. [Contract](/docs/reference/formula-functions/text/) |
| [`REGEXREPLACE`](https://support.microsoft.com/en-us/excel/functions/regexreplace-function) | Partly supported | Not supported | Lite engine: not registered. REGEXTEST, REGEXEXTRACT, and REGEXREPLACE use the regex-lite syntax, not full PCRE2. Lookaround, backreferences, Unicode classes such as \p{L}, and other patterns the engine cannot compile return #VALUE!. \d, \s, and \w use ASCII character classes. \b uses ASCII word boundaries. As in Excel, caseSensitivity is 0 (case-sensitive, the default) or 1 (case-insensitive). Case-insensitive matching and the (?i) flag fold ASCII letters only. If caseSensitivity is 1 or the pattern enables an inline i flag, a pattern with a non-ASCII cased letter or a \x, \u, or \U escape returns #VALUE!. Regex programs are limited to 2 MiB. Text inputs and outputs are limited to 32,767 characters. [Contract](/docs/reference/formula-functions/text/) |
| [`REGEXTEST`](https://support.microsoft.com/en-us/excel/functions/regextest-function) | Partly supported | Not supported | Lite engine: not registered. REGEXTEST, REGEXEXTRACT, and REGEXREPLACE use the regex-lite syntax, not full PCRE2. Lookaround, backreferences, Unicode classes such as \p{L}, and other patterns the engine cannot compile return #VALUE!. \d, \s, and \w use ASCII character classes. \b uses ASCII word boundaries. As in Excel, caseSensitivity is 0 (case-sensitive, the default) or 1 (case-insensitive). Case-insensitive matching and the (?i) flag fold ASCII letters only. If caseSensitivity is 1 or the pattern enables an inline i flag, a pattern with a non-ASCII cased letter or a \x, \u, or \U escape returns #VALUE!. Regex programs are limited to 2 MiB. Text inputs and outputs are limited to 32,767 characters. [Contract](/docs/reference/formula-functions/text/) |
| [`REPLACE`](https://support.microsoft.com/en-us/excel/functions/replace-function) | Partly supported | Partly supported | A start position after the end of the text returns #VALUE!. Excel appends the new text, as in =REPLACE("abc",5,1,"X") (#246). [Contract](/docs/reference/formula-functions/text/) |
| [`REPLACEB`](https://support.microsoft.com/en-us/excel/functions/replace-function) | Not supported | Not supported | Not registered in either engine. |
| [`REPT`](https://support.microsoft.com/en-us/excel/functions/rept-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`RIGHT`](https://support.microsoft.com/en-us/excel/functions/right-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`RIGHTB`](https://support.microsoft.com/en-us/excel/functions/right-function) | Not supported | Not supported | Not registered in either engine. |
| [`SEARCH`](https://support.microsoft.com/en-us/excel/functions/search-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`SEARCHB`](https://support.microsoft.com/en-us/excel/functions/search-function) | Not supported | Not supported | Not registered in either engine. |
| [`SUBSTITUTE`](https://support.microsoft.com/en-us/excel/functions/substitute-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`T`](https://support.microsoft.com/en-us/excel/functions/t-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/information-error/) |
| [`TEXT`](https://support.microsoft.com/en-us/excel/functions/text-function) | Partly supported | Partly supported | Numeric format codes are reduced to a decimal count. =TEXT(0.5,"0%") returns 0, grouping in "#,##0.00" is omitted, and =TEXT(2.5,"0") rounds half to even (#246). [Contract](/docs/reference/formula-functions/text/) |
| [`TEXTAFTER`](https://support.microsoft.com/en-us/excel/functions/textafter-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/text/) |
| [`TEXTBEFORE`](https://support.microsoft.com/en-us/excel/functions/textbefore-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/text/) |
| [`TEXTJOIN`](https://support.microsoft.com/en-us/excel/functions/textjoin-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`TEXTSPLIT`](https://support.microsoft.com/en-us/excel/functions/textsplit-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/text/) |
| [`TRANSLATE`](https://support.microsoft.com/en-us/excel/functions/translate-function) | Not supported | Not supported | Not registered in either engine. |
| [`TRIM`](https://support.microsoft.com/en-us/excel/functions/trim-function) | Partly supported | Partly supported | All Unicode whitespace is collapsed. Excel removes only ordinary spaces, so a line feed in =TRIM("a"&CHAR(10)&"b") stays a line feed in Excel (#246). [Contract](/docs/reference/formula-functions/text/) |
| [`UNICHAR`](https://support.microsoft.com/en-us/excel/functions/unichar-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`UNICODE`](https://support.microsoft.com/en-us/excel/functions/unicode-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`UPPER`](https://support.microsoft.com/en-us/excel/functions/upper-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`VALUE`](https://support.microsoft.com/en-us/excel/functions/value-function) | Supported | Supported | [Contract](/docs/reference/formula-functions/text/) |
| [`VALUETOTEXT`](https://support.microsoft.com/en-us/excel/functions/valuetotext-function) | Supported | Not supported | Lite engine: not registered. [Contract](/docs/reference/formula-functions/text/) |

## User defined functions that are installed with add-ins

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`CALL`](https://support.microsoft.com/en-us/excel/functions/call-function) | Not supported | Not supported | Not registered in either engine. |
| [`EUROCONVERT`](https://support.microsoft.com/en-us/excel/functions/euroconvert-function) | Not supported | Not supported | Not registered in either engine. |
| [`REGISTER.ID`](https://support.microsoft.com/en-us/excel/functions/register-id-function) | Not supported | Not supported | Not registered in either engine. |

## Web functions

| Excel function | Full engine | Lite engine | Notes and differences |
| --- | --- | --- | --- |
| [`ENCODEURL`](https://support.microsoft.com/en-us/excel/functions/encodeurl-function) | Not supported | Not supported | Unsupported by design: Formula evaluation never performs network requests. |
| [`FILTERXML`](https://support.microsoft.com/en-us/excel/functions/filterxml-function) | Not supported | Not supported | Unsupported by design: Formula evaluation never performs network requests. |
| [`WEBSERVICE`](https://support.microsoft.com/en-us/excel/functions/webservice-function) | Not supported | Not supported | Unsupported by design: Formula evaluation never performs network requests. |
