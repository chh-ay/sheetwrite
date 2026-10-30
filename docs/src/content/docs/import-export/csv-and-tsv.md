---
title: CSV and TSV
description: Exchange plain table values without installing the optional XLSX package.
---

```ts compile title="Read a CSV table"
import { fromCsv } from "@sheetwrite/core";

const data = fromCsv("Customer,Total\r\nAda,120\r\nLin,75\r\n", [
  { key: "customer", header: "Customer", width: 140, type: "text" },
  { key: "total", header: "Total", width: 100, type: "number" },
]);
console.log(data.rowCount); // 2
```

<div class="sw-grid-result" data-caption="CSV data: the first record supplies headers, not a data row">

| Ada | 120 |
| --- | --- |
| Lin | 75 |

</div>

[Try it live: CSV / TSV lab](/showcases/interoperability/#delimited).

<details>
<summary>Full setup</summary>

```ts compile title="Export a table to CSV and a range to TSV"
import {
  downloadBytes, initSheetwrite, SheetwriteStore, toCsv, toTsv,
  type Workbook,
} from "@sheetwrite/core";

await initSheetwrite();
const workbook: Workbook = {
  activeSheet: "s",
  sheets: [{ id: "s", name: "Sales", rowCount: 2, columns: [
    { key: "customer", header: "Customer", width: 140, type: "text" },
    { key: "total", header: "Total", width: 100, type: "number" },
  ] }],
};
const store = new SheetwriteStore(workbook, {
  rowCount: 2, columns: { customer: ["Ada", "Lin"], total: new Float64Array([120, 75]) },
});
const sheet = workbook.sheets[0];
if (!sheet) throw new Error("Missing Sales sheet");
const csv = toCsv(sheet, store);
const tsv = toTsv({ sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } }, store);
downloadBytes(csv, "sales.csv", "text/csv");
console.log(tsv); // Ada\t120\r\nLin\t75
```

</details>

## Functions

| Function | Result |
| --- | --- |
| `fromCsv(text, columns, options?)` | Materialized `ColumnarData`; first record consumed as a positional header. |
| `toCsv(sheet, store, options?)` | CSV string for visible columns, with UTF-8 BOM and CRLF line endings. |
| `toTsv(range, store, options?)` | TSV string for an explicit range, suitable for Excel/Sheets clipboard interchange. |
| `grid.exportCsv(filename)` | Synchronous active-sheet download. |
| `downloadBytes(bytes, filename, mime)` | Download a `Uint8Array` or string. |
| `toCsvStream` / `toTsvStream` | [Bounded byte streams](/docs/import-export/large-files-and-streaming/) with backpressure and cancellation. |

CSV and TSV are core-only. `fromCsv` projects input fields onto declared visible columns. Hidden declared columns initialize to `null`; extra fields are ignored and missing fields become `null`. It fully materializes the returned table.

## Output and injection safety

`toCsv` follows the current view row order after sorting, filtering, hidden rows and collapsed groups. `toTsv` instead uses canonical data-space coordinates: reversed corners are normalized, and active views do not remap the range. TSV uses CRLF with no BOM and also injection-hardens values. Both synchronous writers fetch at most `maxWriterWindowRows` rows per packed store read, but still return one in-memory string.

CSV output is UTF-8 with a BOM and CRLF endings. For string values, a leading `=`, `+`, `-`, `@`, tab or CR is prefixed with a single quote. The value cannot reopen as an executable formula. For example, the string `=1+1` exports as `'=1+1`, while a real formula cell exports its resolved scalar.

For the full setup, the CSV string is `\uFEFFCustomer,Total\r\nAda,120\r\nLin,75` (BOM and line endings shown as escapes).

Clipboard formulas and references retain rich behavior only when copied/cut and pasted through the same live Sheetwrite grid controller. Payloads from another controller or application, including spreadsheet HTML, paste as injection-neutralized text. `pasteValues` uses resolved literals.

## Options and edge cases

Delimited functions accept `DelimitedTextOptions` for bounded resources. See the [API contract](/docs/api/core/delimited-text-options/) and the [hostile-input lab](/showcases/interoperability/#limits). These plain-text formats do not carry workbook styles, formula source, names or multiple worksheets.

Built-in toolbar/context-menu download failures show an alert and emit `export-error` with `{ format: "csv", error }`. See [export error handling](/docs/import-export/xlsx-export/#errors-and-built-in-actions).

## See also

- [XLSX export](/docs/import-export/xlsx-export/)
- [Editing and clipboard](/docs/features/grid/editing-and-clipboard/)
- [`fromCsv`](/docs/api/core/from-csv/)
- [`toCsv`](/docs/api/core/to-csv/)
- [`toTsv`](/docs/api/core/to-tsv/)
