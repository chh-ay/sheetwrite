---
title: LibreOffice compatibility
description: Understand the checked LibreOffice round trips, display fixes and known producer differences.
---

```ts prelude="core" partial="bytes contains an XLSX workbook saved by LibreOffice" title="Read producer output and retain warnings"
import { fromXlsxWorkbook, toXlsxWorkbook } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

declare const bytes: Uint8Array;
const snapshot = await fromXlsxWorkbook(bytes, {
  onWarning: (warning) => console.warn(warning.code, warning.message),
});
const output = await toXlsxWorkbook(snapshot, {
  onWarning: (warning) => console.warn(warning.code, warning.message),
});
```

The recorded LibreOffice 26.8 comparison in [PR #190](https://github.com/chh-ay/sheetwrite/pull/190) reports:

| Chain | Unexpected differences | Known producer difference |
| --- | --- | --- |
| Sheetwrite → LibreOffice → Sheetwrite | 0 | LibreOffice omits conditional-rule `stopIfTrue`. |
| LibreOffice → Sheetwrite → LibreOffice → Sheetwrite | 0 | Known producer differences remain separately recorded. |

A passing semantic comparison does **not** mean byte-identical files or full Excel feature support.

[Try it live: producer compatibility evidence](/showcases/interoperability/#contract).

<details>
<summary>Full setup</summary>

Use the public importer on bytes from a host-selected LibreOffice file. No special LibreOffice backend is required:

```ts compile title="Read a LibreOffice-saved file"
import { fromXlsxWorkbookFile, toXlsxWorkbook } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

const input = document.querySelector<HTMLInputElement>('input[type="file"]');
const file = input?.files?.[0];
if (!file) throw new Error("Choose a LibreOffice-saved XLSX file first");
const options = {
  onWarning: (warning: import("@sheetwrite/core").XlsxWorkbookWarning) =>
    console.warn(warning.code, warning.message),
};
const snapshot = await fromXlsxWorkbookFile(file, options);
const output = await toXlsxWorkbook(snapshot, options);
console.log(output.byteLength);
```

This converts the selected file. It does not invoke LibreOffice or run the repository's producer comparison.

</details>

## Display and layout fidelity

| Field | Import/export behavior |
| --- | --- |
| Vertical alignment | Native absent/bottom imports as bottom, matching Excel. Native center maps to the grid's middle default. Export writes the default as center and an explicit middle override where a bottom column default would otherwise apply. |
| Column width | Uses OOXML's maximum-digit-width conversion rather than adding 2–3 px on each cycle. Sheetwrite pixel widths round-trip exactly; native fixture widths no longer include the old extra 5 px. |
| Row height | `ht` without `customHeight="1"` remains automatic, not fixed. |
| Hyperlink display | An absent `display` uses the cell text. An explicitly empty display remains empty. |
| Hyperlink appearance | Export retains the link's font. Default link color/underline applies only to properties the cell style does not set. Explicit cell styling wins when painting. |

## What the comparison proves

The evidence compares normalized workbook semantics, not ZIP/XML identity. Generated hyperlink IDs may change. Hyperlink presentation moved into cell styles compares equal only when the painted appearance remains equal.

[PR #189](https://github.com/chh-ay/sheetwrite/pull/189) separates `workbook.xlsxSource` opaque bytes from semantic comparison. LibreOffice can rename parts and add its own theme or document-property graphs. Retained graphs are checked separately by **count per kind**: owner, sheet and relationship type. The result must retain at least as many graphs of each kind as the source; additions are allowed.

That detects a lost chart, pivot or drawing count. It cannot detect one graph dropped and replaced by another of the same kind on the same owner. It does not prove opaque payload identity across different producers. A direct Sheetwrite no-edit round trip retains [eligible original compressed payloads](/docs/import-export/kept-parts-and-round-trips/).

## Known producer difference

LibreOffice does not write `stopIfTrue`. The comparison records its omission in `knownProducerDifferences`, separate from unexpected `differences`; it does not pretend the conditional-format behavior survived unchanged. If later matching rules matter, inspect the file and warnings after resaving in LibreOffice.

The reported pass is for the pinned fixtures and LibreOffice 26.8 in PR #190. It is not a claim that every workbook, feature or producer version round-trips without loss. The earlier #189 result still had 19 differences; #190 resolves the display/layout differences and records the known stop-rule loss.

## See also

- [Detailed compatibility results](/docs/reference/compatibility-results/)
- [XLSX import warnings](/docs/import-export/xlsx-import/#warnings)
- [Workbook export fidelity](/docs/import-export/xlsx-export/#workbook-interchange)
- [Kept parts and round trips](/docs/import-export/kept-parts-and-round-trips/)
