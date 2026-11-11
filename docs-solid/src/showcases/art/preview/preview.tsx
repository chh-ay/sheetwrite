// Review page for the showcase illustrations; served by preview/vite.config.ts
// only, never part of the site build. `?view=hub` (default) or `?view=diagrams`,
// and `?theme=dark`.
import "../../../styles/site-core.css";
import "../../../styles/site-mid.css";
import "../../../styles/site-tail.css";
import "../../../styles/showcases/touch-targets.css";
import "../../../styles/showcases/hub.css";
import "../art.css";
import { For, type JSX } from "solid-js";
import { render } from "solid-js/web";

import {
  BoundarySeam,
  CollaborationRecoveryDiagram,
  CommandModelDiagram,
  DataModelDiagram,
  DIAGRAMS,
  RecalculationDiagram,
} from "../diagrams.js";
import {
  ChartReadsCellsDiagram,
  DashboardDiagram,
  EngineApiDiagram,
  FormattingDiagram,
  FunctionEnginesDiagram,
  HostImportDiagram,
  QueriesRefreshDiagram,
  SortModesDiagram,
  StorageDiagram,
  VersionsDiagram,
} from "../explain-diagrams.js";
import { HUB_ART } from "../hub-art.js";
import { COLLABORATION_PROOF_ART, VANILLA_PROOF_ART } from "../proof-art.js";

const params = new URLSearchParams(location.search);
if (params.get("theme") === "dark") document.documentElement.dataset.theme = "dark";

interface PreviewCard {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly summary: string;
  readonly hue: string;
}

/** The hub's cards in its order, with the copy and group the hub shows. */
const CARDS: readonly PreviewCard[] = [
  [
    "spreadsheet",
    "Workbook",
    "Spreadsheet app",
    "An Excel-style ribbon, formula bar and sheet tabs around one grid. Narrow it and watch the groups fold.",
    "accent",
  ],
  [
    "analysis",
    "Formulas",
    "Analysis",
    "A pivot table and a live chart over two years of orders. Edit an order and both move.",
    "info",
  ],
  [
    "data-model",
    "Formulas",
    "Data model",
    "Relate tables, pivot by a related column with a measure, then break a key.",
    "violet",
  ],
  [
    "dashboards",
    "Formulas",
    "Dashboards",
    "KPI cards, a PivotChart and a pivot that one slicer filters together.",
    "code-type",
  ],
  [
    "queries",
    "Data & scale",
    "Saved queries",
    "Saved queries shape a CSV feed into tables. Refresh, change a step, refresh again.",
    "warning",
  ],
  [
    "sort",
    "Data & scale",
    "Sort in place",
    "Sort the cells in place as Excel does, or only the view, and see which formulas follow.",
    "code-property",
  ],
  [
    "functions",
    "Formulas",
    "Excel functions",
    "Engineering, financial, statistics, lookup and regex functions, calculated live.",
    "accent",
  ],
  [
    "recalculation",
    "Formulas",
    "Live recalculation",
    "Edit a cell that a sheet full of formulas reads, and move its lookups, timed in your browser.",
    "violet",
  ],
  [
    "version-history",
    "Collaboration",
    "Version history",
    "Edit with a teammate, compare versions by author, and restore a range.",
    "code-type",
  ],
  [
    "performance",
    "Data & scale",
    "Performance & scale",
    "Fly the live grid across a billion addresses and watch what stays loaded.",
    "warning",
  ],
  [
    "formulas",
    "Formulas",
    "Formula analysis",
    "GROUPBY, PIVOTBY, LAMBDA and regex over an order ledger, recalculated on every edit.",
    "info",
  ],
  [
    "collaboration",
    "Collaboration",
    "Collaboration protocol",
    "Sequencing, reconnects, conflicts, and recovery across two clients.",
    "danger",
  ],
  [
    "database",
    "Data & scale",
    "Database & document lifecycle",
    "IndexedDB snapshots, commits, compaction, and reload recovery.",
    "code-type",
  ],
  [
    "host-rows",
    "Data & scale",
    "Host-owned rows",
    "Your store owns the rows. Sort the view, filter and edit; every delta names the record.",
    "accent",
  ],
  [
    "interoperability",
    "Workbook",
    "Spreadsheet interoperability",
    "XLSX and delimited exchange with fixture-backed fidelity warnings.",
    "info",
  ],
  [
    "formatting",
    "Workbook",
    "Formatting & number formats",
    "A styled budget, mixed number formats, and a live XLSX fidelity check.",
    "code-property",
  ],
  [
    "data-tools",
    "Data & scale",
    "Data tools",
    "Filter and organize dispatch orders; exercise validation and protection.",
    "warning",
  ],
].map(([id, group, label, summary, hue]) => ({ id, group, label, summary, hue }) as PreviewCard);

const FRAMEWORKS: readonly PreviewCard[] = [
  [
    "vanilla",
    "Vanilla workbench",
    "Direct lifecycle, renderer choice, and workbook operations.",
    "warning",
  ],
  [
    "react",
    "React workbench",
    "Controlled analytics, formulas, clipboard, and reset semantics.",
    "fw-react",
  ],
  [
    "vue",
    "Vue workbench",
    "Validation, protection, notes, sheets, and host persistence.",
    "fw-vue",
  ],
  [
    "svelte",
    "Svelte workbench",
    "Durable offline edits, reconnect drain, and activity state.",
    "fw-svelte",
  ],
].map(
  ([id, label, summary, hue]) =>
    ({ id, group: "Framework integration", label, summary, hue }) as PreviewCard,
);

function Card(props: Readonly<{ card: PreviewCard; framework?: boolean }>) {
  const Art = HUB_ART[props.card.id];
  return (
    <li data-kind={props.framework ? "framework" : "capability"} data-owner={props.card.id}>
      <a
        class={`sw-hub-launch${props.framework ? " sw-hub-launch--framework" : ""}`}
        data-owner={props.card.id}
        href="#"
        style={{ "--sw-hub-accent": `var(--sw-${props.card.hue})` }}
      >
        <span class="sw-hub-preview">{Art && <Art />}</span>
        <span class="sw-hub-launch__body">
          <span class="sw-hub-launch__meta">{props.card.group}</span>
          <strong>{props.card.label}</strong>
          <span class="sw-hub-launch__summary">{props.card.summary}</span>
          <span class="sw-hub__owner-count">Open live example →</span>
        </span>
      </a>
    </li>
  );
}

function Hub() {
  return (
    <div class="sw-hub-frame">
      <main class="sw-hub">
        <header class="sw-hub__hero">
          <p class="sw-hub__eyebrow">Showcases</p>
          <h1>See Sheetwrite at work.</h1>
          <p class="sw-hub__lede">
            Each example opens a live spreadsheet with real controls. Start with a capability, or
            pick the framework you build with.
          </p>
        </header>
        <section class="sw-hub__scenes">
          <section class="sw-hub__group">
            <div class="sw-hub__group-head">
              <h3>Capabilities</h3>
              <p>Each opens on the feature it proves, with live data and controls.</p>
            </div>
            <ol class="sw-hub-scenes" data-group="all">
              <For each={CARDS}>{(card) => <Card card={card} />}</For>
            </ol>
          </section>
          <section class="sw-hub__group">
            <div class="sw-hub__group-head">
              <h3>Framework adapters</h3>
              <p>The same engine, mounted through each first-party adapter.</p>
            </div>
            <ol class="sw-hub-scenes" data-group="all">
              <For each={FRAMEWORKS}>{(card) => <Card card={card} framework />}</For>
            </ol>
          </section>
        </section>
      </main>
    </div>
  );
}

function Diagrams() {
  return (
    <main
      class="sw-hub"
      style={{
        display: "grid",
        gap: "3rem",
        "max-width": "60rem",
        margin: "0 auto",
        padding: "3rem 1.25rem",
      }}
    >
      <For each={DIAGRAMS}>
        {(diagram) => (
          <figure style={{ margin: 0, display: "grid", gap: "0.75rem" }}>
            <figcaption>
              <strong
                style={{
                  font: "600 var(--sw-text-h4)/1.3 var(--sw-font-display)",
                  color: "var(--sw-fg-strong)",
                }}
              >
                {diagram.showcase}
              </strong>
              <span style={{ color: "var(--sw-fg-muted)", "font-size": "var(--sw-text-small)" }}>
                {" "}
                · {diagram.placement}
              </span>
            </figcaption>
            <div
              style={{
                border: "1px solid var(--sw-border)",
                "border-radius": "var(--sw-radius-lg)",
                background: "var(--sw-surface-1)",
                padding: "clamp(0.75rem, 2vw, 1.5rem)",
              }}
            >
              <diagram.Diagram />
            </div>
          </figure>
        )}
      </For>
    </main>
  );
}

/** Every picture the page-pattern mockups place, each under a `data-part` name. */
function Parts() {
  const parts: readonly (readonly [string, () => JSX.Element])[] = [
    ...Object.entries(COLLABORATION_PROOF_ART).map(
      ([title, Art]) => [`proof:${title}`, Art] as const,
    ),
    ...Object.entries(VANILLA_PROOF_ART).map(([title, Art]) => [`proof:${title}`, Art] as const),
    ["command-model", CommandModelDiagram],
    ["analysis", ChartReadsCellsDiagram],
    ["dashboards", DashboardDiagram],
    ["queries", QueriesRefreshDiagram],
    ["sort", SortModesDiagram],
    ["functions", FunctionEnginesDiagram],
    ["version-history", VersionsDiagram],
    ["formulas", EngineApiDiagram],
    ["database", StorageDiagram],
    ["host-rows", HostImportDiagram],
    ["formatting", FormattingDiagram],
    ["data-model", DataModelDiagram],
    ["recalculation", RecalculationDiagram],
    ["collaboration-recovery", CollaborationRecoveryDiagram],
    [
      "seam:collaboration",
      () => (
        <BoundarySeam
          interfaces={[
            ["PersistenceAdapter", ["load(documentId)", "commit(request)"]],
            ["RemoteOperationSource", ["subscribe(…)"]],
          ]}
        />
      ),
    ],
  ];
  return (
    <main>
      <For each={parts}>
        {([name, Part]) => (
          <div data-part={name}>
            <Part />
          </div>
        )}
      </For>
    </main>
  );
}

const views: Record<string, () => JSX.Element> = { hub: Hub, diagrams: Diagrams, parts: Parts };
const root = document.getElementById("root");
if (root) render(views[params.get("view") ?? "hub"] ?? Hub, root);
