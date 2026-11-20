// Small pictures for the showcases' "What the scenario proves" cards and the
// framework workbenches' "What this example demonstrates" cards. Each picture
// is decorative: its card's title and text state the same facts. All of them
// are blueprint card pictures.
import type { JSX } from "solid-js";

import { type CardBox, cardLayout, WIDE_CARD } from "./blueprint-cards.js";
import { BlueprintCard } from "./blueprint.js";

/** A proof card's picture: columns of boxes on the 2:1 proof card canvas. */
const proof = (...columns: (readonly CardBox[])[]) => (
  <BlueprintCard layout={cardLayout(WIDE_CARD, columns)} />
);

/** Proof pictures by proof title, for the collaboration showcase's proof cards. */
export const COLLABORATION_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  // Both clients' edits are sequenced once, and both end with the same cells.
  "Convergence under ordering": () =>
    proof(
      [{ title: "Client A" }, { title: "Client B" }],
      [{ title: "Server" }],
      [{ title: "Same cells", tone: "accent" }],
    ),
  // A retry with the same mutation id is applied once.
  "Loss without double-apply": () =>
    proof(
      [{ title: "Retry m7", lines: ["same id"] }],
      [{ title: "Server" }],
      [{ title: "Applied once", tone: "accent" }],
    ),
  // Edits queue while offline and drain in order on reconnect.
  "Offline is a first-class state": () =>
    proof(
      [{ title: "Offline", lines: ["edits queue"] }],
      [{ title: "Reconnect" }],
      [{ title: "Drain", lines: ["in order"], tone: "accent" }],
    ),
  // A version that arrives early waits for the gap; a stale base is a conflict.
  "Gaps and conflicts stay explicit": () =>
    proof(
      [{ title: "v43 early" }, { title: "Stale base" }],
      [
        { title: "Buffered", lines: ["until v42"] },
        { title: "Conflict", tone: "danger" },
      ],
    ),
  // A restore over four versions travels and applies as one batch.
  "Atomic multi-version batches": () =>
    proof(
      [{ title: "Restore", lines: ["4 versions"] }],
      [{ title: "One batch", tone: "accent" }],
      [{ title: "Applied" }],
    ),
};

/** Proof pictures by proof title, for the vanilla workbench's "What this example demonstrates". */
export const VANILLA_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  // createWorkbench builds the grid; destroy() leaves no listener, toolbar or canvas.
  "Create and destroy": () =>
    proof(
      [{ title: "Create" }],
      [{ title: "Grid", lines: ["canvas, events"] }],
      [{ title: "Destroy", lines: ["none left"], tone: "accent" }],
    ),
  // The renderer and the data path build a new grid; read-only changes the running one.
  "Rebuild or change in place": () =>
    proof(
      [{ title: "Renderer" }, { title: "Read-only" }],
      [{ title: "New grid", tone: "accent" }, { title: "Same grid" }],
    ),
  // The grid asks for rows; the host's source loads them, with its own delay and cancel.
  "Your code loads the pages": () =>
    proof(
      [{ title: "Grid", lines: ["needs rows"] }],
      [{ title: "Your source", lines: ["delay, cancel"] }],
      [{ title: "Rows", tone: "accent" }],
    ),
  // A worker that can't start reports renderer-fallback; the main thread paints.
  "A visible worker fallback": () =>
    proof(
      [{ title: "Worker", lines: ["can't start"], tone: "danger" }],
      [{ title: "Main thread", lines: ["keeps painting"], tone: "accent" }],
    ),
};

/** Proof pictures by proof title, for the database showcase. */
export const DATABASE_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  // Two writers on the same base: one queue accepts the first, the second gets a conflict.
  "Atomic sequencing": () =>
    proof(
      [{ title: "A · base v5" }, { title: "B · base v5" }],
      [{ title: "Queue" }],
      [
        { title: "v6", tone: "accent" },
        { title: "Conflict", tone: "danger" },
      ],
    ),
  // A retry with the same mutation id gets the original version back.
  "Idempotent retries": () =>
    proof(
      [{ title: "Retry m7", lines: ["same id"] }],
      [{ title: "Adapter" }],
      [{ title: "Stored once", lines: ["returns v6"], tone: "accent" }],
    ),
  // The operation log grows to its limit, then folds into one snapshot.
  "Bounded storage": () =>
    proof(
      [{ title: "Log" }],
      [{ title: "Limit hit" }],
      [{ title: "Snapshot", lines: ["compacted"], tone: "accent" }],
    ),
  // A reload brings committed state and the pending queue back.
  "Reload recovery": () =>
    proof(
      [{ title: "IndexedDB" }],
      [{ title: "Reload" }],
      [{ title: "Committed", tone: "accent" }, { title: "Pending" }],
    ),
  // Undoing a 100,000-cell clear is one commit.
  "Large undo": () =>
    proof(
      [{ title: "Clear", lines: ["100,000 cells"] }],
      [{ title: "Undo" }],
      [{ title: "One commit", lines: ["restoreBlock"], tone: "accent" }],
    ),
  // An undo over the limit is rejected; older steps stay undoable.
  "Oversized undo": () =>
    proof(
      [{ title: "Undo", lines: ["too large"] }],
      [{ title: "Rejected", tone: "danger" }],
      [{ title: "Older steps", lines: ["kept"] }],
    ),
};

/** Proof pictures by proof title, for the React, Vue and Svelte workbenches. */
export const FRAMEWORK_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  // React state sets the grid's filters, ranking and search.
  "Filters from React state": () =>
    proof(
      [{ title: "React state" }],
      [{ title: "Filter" }, { title: "Rank" }, { title: "Search" }],
      [{ title: "Grid", tone: "accent" }],
    ),
  // An edit recalculates the formulas behind the KPI cards.
  "Formulas and KPIs": () =>
    proof(
      [{ title: "Edit" }],
      [{ title: "Formulas", code: ["=SUMIF(…)"] }],
      [{ title: "KPI cards", tone: "accent" }],
    ),
  // A reload or a renderer switch builds a new grid; React state applies again on ready.
  "Rebuilds keep React state": () =>
    proof(
      [{ title: "Reload" }],
      [{ title: "New grid" }],
      [{ title: "Ready", lines: ["state applied"], tone: "accent" }],
    ),
  // A CSV import is one undo step; CSV and XLSX exports download the workbook.
  "Import and export": () =>
    proof(
      [{ title: "CSV file" }],
      [{ title: "Grid", lines: ["one undo step"] }],
      [{ title: "CSV" }, { title: "XLSX" }],
    ),
  // A reviewer's edit is rejected; the same edit as the finance lead is accepted.
  "Rejected, then allowed": () =>
    proof(
      [{ title: "Reviewer" }],
      [{ title: "Rejected", tone: "danger" }],
      [{ title: "Accepted", lines: ["as lead"], tone: "accent" }],
    ),
  // Vue props drive the adapter; workbook changes go through the Grid API.
  "Vue props, Grid API": () =>
    proof(
      [{ title: "Vue props" }],
      [{ title: "Adapter" }],
      [{ title: "Grid API", tone: "accent" }],
    ),
  // The note editor and the event feed sit beside the grid.
  "Notes and events beside the grid": () =>
    proof([{ title: "Grid" }], [{ title: "Note editor" }, { title: "Event feed" }]),
  // An accepted edit waits in the pending queue until the host's version moves on.
  "Your server confirms each edit": () =>
    proof(
      [{ title: "Edit" }],
      [{ title: "Pending" }],
      [{ title: "Host", lines: ["next version"], tone: "accent" }],
    ),
  // The grid stays editable while the connection is down.
  "Edit while offline": () =>
    proof(
      [{ title: "Offline", tone: "danger" }],
      [{ title: "Grid", lines: ["still editable"], tone: "accent" }],
    ),
  // Edits wait in IndexedDB and are sent in order on reconnect.
  "Edits saved on the device": () =>
    proof(
      [{ title: "Outbox", lines: ["IndexedDB"] }],
      [{ title: "Reconnect" }],
      [{ title: "Server", lines: ["in order"], tone: "accent" }],
    ),
  // Cursors stay on the board; the queue and the server version sit beside it.
  "Who is where, and what waits": () =>
    proof(
      [{ title: "Board", lines: ["cursors"] }],
      [
        { title: "Queue", lines: ["2 pending"] },
        { title: "Server", lines: ["v8"] },
      ],
    ),
  // A version conflict and a remount both end in a restored state.
  "Recovery you can check": () =>
    proof(
      [{ title: "Conflict", lines: ["v6 vs v8"], tone: "danger" }],
      [{ title: "Remount" }],
      [{ title: "Restored", tone: "accent" }],
    ),
};
