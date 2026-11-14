// Diagrams for the import, export and reference pages: the checked LibreOffice
// round trips, the two XLSX exports, the API gate, resource ceilings, rebase
// and event direction. Every label and number comes from the page the diagram
// sits on.
import type { JSX } from "solid-js";

import { FanFigure, FlowFigure } from "./blueprint-layouts.js";

/** Import and export › LibreOffice compatibility: the recorded round trips. */
export function LibreOfficeRoundTripDiagram() {
  return (
    <FlowFigure
      outcome={{
        from: 1,
        step: {
          title: "Known producer difference",
          lines: [
            "LibreOffice omits a conditional rule's",
            "stopIfTrue; it is recorded separately",
          ],
          tone: "muted",
        },
      }}
      note="A passing comparison doesn't mean byte-identical files or full Excel support."
      steps={[
        { title: "Sheetwrite writes", code: ["toXlsxWorkbook(…)"], lines: ["an .xlsx file"] },
        { title: "LibreOffice 26.8", lines: ["opens and saves", "the file again"] },
        {
          title: "Sheetwrite reads",
          code: ["fromXlsxWorkbook(…)"],
          lines: ["0 unexpected differences"],
          tone: "accent",
        },
      ]}
      text={{
        title: "The checked Sheetwrite and LibreOffice round trip",
        description:
          "In the recorded LibreOffice 26.8 comparison, Sheetwrite writes a workbook with toXlsxWorkbook, LibreOffice opens and saves it, and Sheetwrite reads it back with fromXlsxWorkbook: 0 unexpected differences, in both the Sheetwrite → LibreOffice → Sheetwrite and the LibreOffice → Sheetwrite → LibreOffice → Sheetwrite chains. The one known producer difference, that LibreOffice omits a conditional rule's stopIfTrue, is recorded separately. A passing comparison doesn't mean byte-identical files or full Excel support.",
      }}
    />
  );
}

/** Import and export › XLSX export: the table export and the workbook export. */
export function XlsxExportsDiagram() {
  return (
    <FanFigure
      source={{
        title: "One document, two ways to save it as .xlsx",
        lines: ["Both need the @sheetwrite/xlsx add-on"],
      }}
      text={{
        title: "Table export and workbook export",
        description:
          "Table interchange, toXlsxTable and grid.exportXlsx, writes the active sheet only, with synthesized first-row column headers and resolved values instead of formula source. Workbook interchange, toXlsxWorkbook(snapshot), writes every worksheet from the same WorkbookSnapshot persistence uses, with formula source, styles, merges, frozen panes, named ranges and tables, and adds no header row.",
      }}
      tiles={[
        {
          title: "Table: grid.exportXlsx",
          code: ["toXlsxTable(workbook, store)"],
          lines: ["Active sheet only, a header row", "added, values not formulas"],
        },
        {
          title: "Workbook: toXlsxWorkbook",
          code: ["toXlsxWorkbook(snapshot)"],
          lines: ["Every sheet, formula source,", "styles, merges, names, tables"],
          tone: "accent",
        },
      ]}
    />
  );
}

/** Reference › Public API contract: what the release gate checks. */
export function ApiGateDiagram() {
  return (
    <FlowFigure
      outcome={{
        from: 2,
        step: {
          title: "The gate fails",
          lines: [
            "An export the list doesn't hold, a listed",
            "export that's gone, or a changed signature",
          ],
          tone: "danger",
        },
        kind: "fail",
      }}
      steps={[
        { title: "Build the packages", lines: ["Each exports map is", "the public boundary"] },
        {
          title: "Read the declarations",
          lines: ["TypeScript analyzes", "the emitted .d.ts files"],
        },
        {
          title: "bun run api:check",
          lines: ["Compares every export", "with the reviewed list"],
          code: ["public-api-baseline.json"],
          tone: "accent",
        },
      ]}
      text={{
        title: "How the release gate checks the public API",
        description:
          "The release gate builds the packages, whose exports maps are the public boundary, analyzes the emitted declarations with TypeScript, and runs bun run api:check, which compares every export with scripts/public-api-baseline.json, the reviewed list of exports with a digest of each declaration. An export the list doesn't hold, a listed export that is gone, or an export whose signature changed fails the gate before any package can publish.",
      }}
    />
  );
}

/** Reference › Compatibility and limits: one ceiling from each area, and what happens above it. */
export function LimitsDiagram() {
  return (
    <FanFigure
      source={{
        title: "Every resource has a stated ceiling",
        lines: ["One from each area, and what happens above it"],
      }}
      text={{
        title: "A ceiling from each area and what happens above it",
        description:
          "Each area states its ceilings. A formula range above 1,000,000 cells resolves to #NUM!. A transaction above 10,000 operations is rejected. A snapshot above 256 sheets is rejected. Delimited text above 32 MiB of input throws. A remote version above 10,000 operations emits a protocol error and requires a reload.",
      }}
      tiles={[
        { title: "Formulas", lines: ["Range above", "1,000,000 cells:", "#NUM!"] },
        { title: "Transactions", lines: ["Above 10,000", "operations:", "rejected"] },
        { title: "Snapshots", lines: ["Above 256", "sheets:", "rejected"] },
        { title: "Delimited text", lines: ["Above 32 MiB", "of input:", "throws"] },
        {
          title: "Sync",
          lines: ["Version above", "10,000 operations", "needs a reload"],
          tone: "muted",
        },
      ]}
    />
  );
}

/** Reference › Document operations: conservative rebase of pending local operations. */
export function RebaseDiagram() {
  return (
    <FlowFigure
      outcome={{
        from: 1,
        step: {
          title: "Overlap: conflict",
          lines: ["The original pending queue is kept", "for the host to resolve"],
          tone: "muted",
        },
      }}
      note="Validate untrusted snapshot JSON first: SnapshotValidationError names the failing path."
      steps={[
        { title: "Pending local ops", lines: ["Not yet acknowledged", "by the server"] },
        {
          title: "Rebase",
          code: ["rebaseDocumentOperations"],
          lines: ["over the remote versions"],
          tone: "accent",
        },
        { title: "Rebased queue", lines: ["Only when the ops", "can't overlap"] },
      ]}
      text={{
        title: "How pending operations are rebased",
        description:
          "rebaseDocumentOperations moves pending local operations over the remote versions only when it can establish that they don't overlap. When they might, it reports a conflict and keeps the original pending queue for the host to resolve. Untrusted snapshot JSON is validated before hydration, and SnapshotValidationError names the failing path.",
      }}
    />
  );
}

/** Reference › Events: committed changes, by source, and the observational events. */
export function EventDirectionDiagram() {
  return (
    <FanFigure
      source={{
        title: "grid.on(evt, fn) returns off()",
        lines: ["Only change carries committed document changes"],
      }}
      text={{
        title: "Which grid events carry committed changes",
        description:
          "grid.on subscribes to an event and returns an off function. change is the committed transaction stream: with source local it is user or API output the host may persist; with source remote it is already-persisted input that must not be enqueued again. selection, scroll, edit-begin, search and the other UI events only observe. renderer-fallback, datasource-error, export-error and engine-failed report failures.",
      }}
      tiles={[
        { title: 'change, "local"', lines: ["Persist it"], tone: "accent" },
        {
          title: 'change, "remote"',
          lines: ["Already persisted:", "don't enqueue it"],
          tone: "muted",
        },
        {
          title: "UI events",
          code: ["selection · scroll", "edit-begin · search"],
          lines: ["Observe only"],
        },
        { title: "Failures", code: ["renderer-fallback", "datasource-error", "engine-failed"] },
      ]}
    />
  );
}

/** Reference and import diagrams by the name a placement uses. */
export const REFERENCE_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  "libreoffice-round-trip": LibreOfficeRoundTripDiagram,
  "xlsx-exports": XlsxExportsDiagram,
  "api-gate": ApiGateDiagram,
  limits: LimitsDiagram,
  rebase: RebaseDiagram,
  "event-direction": EventDirectionDiagram,
};
