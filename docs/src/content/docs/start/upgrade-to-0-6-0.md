---
title: Upgrade to 0.6.0
description: Review formula recalculation, document protocol, XLSX fidelity, and optional UI changes before upgrading.
added: "0.6.0"
---

## Update packages together

Update the Sheetwrite packages your app uses to the same release. Keep XLSX and
the full engine explicit: install `@sheetwrite/xlsx` for XLSX and select
`@sheetwrite/formulas` before mounting when analysis functions are needed.
See [Choose an engine](/docs/start/choose-an-engine/).

## Review changed results

| Change | What to review |
| --- | --- |
| Volatile formulas | `RAND`, `RANDBETWEEN`, `TODAY`, `NOW`, `OFFSET`, and `INDIRECT` recalculate with their dependents after cell-input changes. Transactions without cell changes do not recalculate. |
| Clock values | All `TODAY` and `NOW` calls in one recalculation use one clock reading. An explicit `recalculateVolatile(date)` time lasts until the next edit. |
| Dynamic references | `OFFSET` and `INDIRECT` return references; one-cell results are values, not one-cell spills. `INDIRECT` reference text is not rewritten by fill, copy, or structural edits. |
| Reference operators | Intersection, unions, and 3-D references now calculate. Empty or cross-sheet intersections return `#NULL!`; a union where one range is required returns `#VALUE!`. |
| New information functions | `FORMULATEXT`, `ISFORMULA`, `HYPERLINK`, and `CELL` are available. `HYPERLINK` produces text; the grid does not open it. Unsupported `CELL` info types return `#VALUE!`. |
| Circular references | Iteration remains off by default. Enabling it retains the last values if a cycle does not converge. Multi-cell spilling formulas inside a cycle still return `#CYCLE!`. |

See [Calculation engine](/docs/concepts/calculation-engine/) and the
[formula catalog](/docs/reference/formula-functions/) for supported behavior.

## Update document consumers

The undoable `setCalculation` operation stores `iterate`, `maxIterations`, and
`maxChange`. Defaults are off, 100, and 0.001. Settings travel through snapshots,
synchronization, engine transfer, and XLSX `calcPr`. Default settings do not
change existing snapshot output. Update exhaustive operation handlers and
server-side validation before accepting clients that can change this setting.

Imported workbooks can now carry `workbook.xlsxSource`, which holds compressed
opaque XLSX parts. Preserve it when storing snapshots if the host needs those
parts on export. Review snapshot size policies as well as the XLSX preservation
limit. See [Documents and operations](/docs/concepts/documents-and-operations/)
and [XLSX import and export](/docs/import-export/xlsx-export/).

Large undo still uses the existing `restoreBlock` and atomic-batch protocol.
The faster native restore does not remove the server's obligation to validate
restore input and commit batches atomically. See
[Large undo and atomic batches](/docs/features/collaboration/#large-undo-and-atomic-batches).
History retains at most 200 entries and 256 MiB of engine-reported snapshot
payloads; the newest entry stays undoable. This is not a process-memory cap:
cloned formula trees and JavaScript patch/redo payloads are outside the byte count.

## Review imported workbook appearance

- Cells with no XLSX vertical alignment now import at the bottom, as in Excel. Sheetwrite's unset native alignment remains middle; export writes it as centered.
- Column widths use the OOXML conversion rather than the old extra 5-pixel fixture offset. Automatic row heights stay automatic.
- A hyperlink without display text uses its cell text. Explicit cell font colors and underline settings win over the default link look.
- Per-cell `fontFamily`, `verticalAlign`, and `numberFormat` survive clipboard, snapshots, and XLSX. `General` opts a cell out of the column number format.

Unknown chart, pivot, image, VBA, custom XML, and other package parts can survive
an XLSX round trip as opaque data. This does not make imported objects editable.
Preservation is bounded by `maxPreservedBytes` (64 MiB by default); dropped graphs
produce warnings. Cell edits invalidate retained chart and pivot graphs; structural
sheet edits invalidate affected image graphs. VBA and custom XML remain retained.
Table filter rules, sort state, calculated-column formulas, and totals-row
functions now round-trip.

Streaming CSV, TSV, and XLSX exports return byte streams. Blob-based XLSX import
and incremental worksheet parsing reduce buffering; they do not make workbook
construction constant-memory or remove resource limits. Existing buffered APIs
remain available.

LibreOffice 26.8 round-trip checks pass for the recorded corpus, not every possible
workbook. LibreOffice's omission of conditional-format `stopIfTrue` remains a
recorded producer difference. No reviewed Excel or Google Sheets parity rate is
claimed from that result.

## Opt into UI additions

The flat toolbar stays the default. Enable `config.ribbon: true` for the Home,
Insert, Data, and View ribbon. The ribbon loads as a separate chunk and reserves
its height during loading. A failed chunk falls back to the flat toolbar and
reports the error.

The shell's status line now shows Average, Count, and Sum for selected visible
cells. Filtered-out rows are excluded. `Grid.summarizeSelection(signal?)` also
returns Min and Max and supports cancellation. The shell name box accepts
ranges such as `B2:D9` and `$B$2:$D$9`.

Worker rendering can use the default bundled worker without `workerUrl` when the
bundler supports module-worker URL construction. Keep an explicit served URL
for other delivery policies and observe fallback rather than assuming worker
startup succeeded. See [Worker rendering](/docs/features/worker-rendering/).

## Performance changes do not change ownership

Off-screen literal edits avoid display work when they cannot affect the view.
Sheets with formulas or references still rescan active search results after edits
to avoid stale computed matches. View rows, selection, and scrolling reconcile
before change listeners run. Durable synchronization queues no longer scan all
pending commits on each local commit.

Package output is smaller but remains readable. Use exported entry points rather
than internal declaration files that are no longer published. Wrapped text
breaks at grapheme boundaries, including emoji and combining marks.
