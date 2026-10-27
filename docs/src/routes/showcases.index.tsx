import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { SiteTopbar } from "../components/SiteTopbar.js";
import { functionCount } from "../generated/formula-summary.json";
import landingBench from "../generated/landing-bench.json";
import { opensFreshDocument } from "../lib/navigation.js";
import { pageMeta } from "../lib/seo.js";
import { CAPABILITY_OWNERS, type CapabilityOwnerId } from "../showcases/hub-inventory.js";

import hubStylesheet from "../styles/showcase-hub.css?url";

export const Route = createFileRoute("/showcases/")({
  head: () => ({
    meta: pageMeta(
      "Showcases — evaluate Sheetwrite by feature",
      "Every public Sheetwrite feature with its owning live example: editing, formulas, validation, million-row scale, XLSX/CSV exchange, IndexedDB persistence, offline sync, and collaboration.",
    ),
    links: [{ rel: "stylesheet", href: hubStylesheet }],
  }),
  component: ShowcaseHub,
});

const OWNER_BY_ID = new Map(CAPABILITY_OWNERS.map((owner) => [owner.id, owner]));

/** The featured app card, capability launch cards, then the four framework adapters. */
const SCENE_ORDER = [
  "spreadsheet",
  "performance",
  "formulas",
  "collaboration",
  "database",
  "host-rows",
  "interoperability",
  "formatting",
  "engine",
  "data-tools",
] as const satisfies readonly CapabilityOwnerId[];

type SceneOwnerId = (typeof SCENE_ORDER)[number];

/** Concise launch copy, distilled from each checked owner's responsibility. */
const SCENE_SUMMARY: Readonly<Record<SceneOwnerId, string>> = {
  performance: "Fly the live Grid through a billion cells and watch what stays resident.",
  formulas: "GROUPBY, PIVOTBY, LAMBDA and regex over 20,000 orders, recalculated on every edit.",
  database: "IndexedDB snapshots, commits, compaction, and reload recovery.",
  "host-rows": "Your store owns the rows. Sort, filter and edit; every delta names the record.",
  interoperability: "XLSX and delimited exchange with fixture-backed fidelity warnings.",
  formatting: "A styled P&L, mixed number formats, and a live XLSX fidelity check.",
  collaboration: "Sequencing, reconnects, conflicts, and recovery across two clients.",
  engine: "A 50,000-row forecast with every public engine event traced beside it.",
  "data-tools": "Sort, filter and organize 4,800 orders; exercise validation and protection.",
  spreadsheet:
    "An Excel-style ribbon, formula bar and sheet tabs around one grid. Narrow it and watch the groups fold.",
};

/** Real import and mount line per first-party adapter. */
const FRAMEWORK_MOUNTS: Readonly<Record<string, { name: string; mount: string; pkg: string }>> = {
  vanilla: { name: "createGrid", mount: "createGrid(host, { workbook })", pkg: "@sheetwrite/core" },
  react: {
    name: "SheetwriteGrid",
    mount: "<SheetwriteGrid workbook={book} />",
    pkg: "@sheetwrite/react",
  },
  vue: {
    name: "SheetwriteGrid",
    mount: '<SheetwriteGrid :workbook="book" />',
    pkg: "@sheetwrite/vue",
  },
  svelte: {
    name: "SheetwriteGrid",
    mount: "<SheetwriteGrid {workbook} bind:grid />",
    pkg: "@sheetwrite/svelte",
  },
};

const FRAMEWORK_SUMMARY: Readonly<Record<string, string>> = {
  vanilla: "Direct lifecycle, renderer choice, and workbook operations.",
  react: "Controlled analytics, formulas, clipboard, and reset semantics.",
  vue: "Validation, protection, notes, sheets, and host persistence.",
  svelte: "Durable offline edits, reconnect drain, and activity state.",
};

type HubGroup = "all" | "data" | "formulas" | "workbook" | "collaboration" | "framework";

const HUB_GROUPS: readonly { id: HubGroup; label: string }[] = [
  { id: "all", label: "All" },
  { id: "data", label: "Data & scale" },
  { id: "formulas", label: "Formulas" },
  { id: "workbook", label: "Workbook" },
  { id: "collaboration", label: "Collaboration" },
  { id: "framework", label: "Framework integration" },
];

function ownerGroup(owner: (typeof CAPABILITY_OWNERS)[number]): Exclude<HubGroup, "all"> {
  if (owner.kind === "framework") return "framework";
  if (owner.id === "formulas" || owner.id === "engine") return "formulas";
  if (owner.id === "interoperability" || owner.id === "formatting" || owner.id === "spreadsheet") {
    return "workbook";
  }
  if (owner.id === "collaboration") return "collaboration";
  return "data";
}

interface HubBenchData {
  available: boolean;
  heroStats?: {
    millionRowMedianMs?: number;
    millionRowHeapMb?: number;
    millionRowScenarios?: number;
  };
}

const TELEMETRY_BAR_IDS = Array.from({ length: 16 }, (_, index) => `telemetry-${index + 1}`);
const EXCHANGE_CELL_IDS = Array.from({ length: 9 }, (_, index) => `exchange-${index + 1}`);

/** Million-row telemetry: paged-row counter, median readout, frame bars. */
function PerformanceScene({ medianMs }: Readonly<{ medianMs?: number }>) {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--performance">
      <span className="sw-hub-tele">
        <span className="sw-hub-tele__stat">
          <strong>1,000,000</strong>
          <small>rows paged</small>
        </span>
        <span className="sw-hub-tele__stat">
          {medianMs === undefined ? (
            <>
              <strong>Worker</strong>
              <small>renderer host</small>
            </>
          ) : (
            <>
              <strong>{medianMs} ms</strong>
              <small>median interaction</small>
            </>
          )}
        </span>
      </span>
      <span className="sw-hub-tele__bars">
        {TELEMETRY_BAR_IDS.map((id) => (
          <i key={id} />
        ))}
      </span>
      <span className="sw-hub-scene__caption">scroll · edit · cache</span>
    </span>
  );
}

/** Durable commit timeline: snapshot, append-only commits, compact, reload. */
function DatabaseScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--database">
      <span className="sw-hub-commits">
        <span className="sw-hub-commits__node" data-kind="snapshot">
          <i />
          <code>snapshot</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="commit">
          <i />
          <code>c41</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="commit">
          <i />
          <code>c42</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="commit">
          <i />
          <code>c43</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="compact">
          <i />
          <code>compact</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="reload">
          <i />
          <code>reload</code>
        </span>
      </span>
      <span className="sw-hub-scene__caption">IndexedDB · append-only log · recovery</span>
    </span>
  );
}

/** Workbook exchange: files in, grid in the middle, files back out. */
function InteroperabilityScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--interoperability">
      <span className="sw-hub-exchange">
        <span className="sw-hub-exchange__files">
          <span className="sw-hub-file">.xlsx</span>
          <span className="sw-hub-file">.csv</span>
        </span>
        <i className="sw-hub-exchange__arrow" />
        <span className="sw-hub-exchange__grid">
          {EXCHANGE_CELL_IDS.map((id) => (
            <i key={id} />
          ))}
        </span>
        <i className="sw-hub-exchange__arrow" />
        <span className="sw-hub-exchange__files">
          <span className="sw-hub-file">.xlsx</span>
          <span className="sw-hub-file">.tsv</span>
        </span>
      </span>
      <span className="sw-hub-scene__caption">import · fidelity warnings · export</span>
    </span>
  );
}

/** Two-client sequencing: per-client op lanes converging on one shared log. */
function CollaborationScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--collaboration">
      <span className="sw-hub-sync">
        <span className="sw-hub-sync__lane" data-client="a">
          <span className="sw-hub-sync__peer">A</span>
          <code>edit B2</code>
          <code>edit C4</code>
        </span>
        <span className="sw-hub-sync__seq">
          <span data-client="a">41</span>
          <span data-client="b">42</span>
          <span data-client="a">43</span>
          <span data-client="b">44</span>
        </span>
        <span className="sw-hub-sync__lane" data-client="b">
          <span className="sw-hub-sync__peer">B</span>
          <code>edit D1</code>
          <code>ack 42</code>
        </span>
      </span>
      <span className="sw-hub-scene__caption">sequenced client edits</span>
    </span>
  );
}

/** A formula spilling into a live result block. */
function FormulasScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--formulas">
      <code className="sw-hub-spill__formula">
        =GROUPBY(<em>region</em>, <em>revenue</em>, SUM)
      </code>
      <span className="sw-hub-spill">
        {[
          ["Americas", "10.9M"],
          ["EMEA", "9.5M"],
          ["APAC", "7.6M"],
          ["LATAM", "3.8M"],
        ].map(([label, value]) => (
          <span key={label}>
            <i>{label}</i>
            <b>{value}</b>
          </span>
        ))}
      </span>
      <span className="sw-hub-scene__caption">
        {functionCount} function names · LAMBDA · spill references
      </span>
    </span>
  );
}

/** One change traced like a profiler waterfall: each stage starts where the last ends. */
const ENGINE_STAGES = [
  { label: "Page", width: 18 },
  { label: "Recalc", width: 34 },
  { label: "Paint", width: 22 },
  { label: "Host ack", width: 26 },
] as const;

function EngineScene() {
  let start = 0;

  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--engine">
      <span className="sw-hub-waterfall">
        {ENGINE_STAGES.map((stage) => {
          const offset = start;

          start += stage.width;

          return (
            <span key={stage.label}>
              <i>{stage.label}</i>
              <b>
                <s style={{ marginLeft: `${offset}%`, width: `${stage.width}%` }} />
              </b>
            </span>
          );
        })}
      </span>
      <span className="sw-hub-scene__caption">one edit, traced from page to host</span>
    </span>
  );
}

/** Records sorted by ARR; every record keeps its ID, and the edited one is marked. */
const HOST_ROWS = [
  { id: "#003", share: 92, edited: true },
  { id: "#005", share: 78, edited: false },
  { id: "#001", share: 60, edited: false },
  { id: "#004", share: 41, edited: false },
] as const;

function HostRowsScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--host-rows">
      <span className="sw-hub-records">
        {HOST_ROWS.map((row) => (
          <span data-edited={row.edited || undefined} key={row.id}>
            <code>{row.id}</code>
            <b style={{ width: `${row.share}%` }} />
          </span>
        ))}
      </span>
      <span className="sw-hub-scene__caption">sorted by ARR, every ID kept</span>
    </span>
  );
}

/** A budget in miniature: header fill, currency, red negatives, a ruled total. */
const FORMATTED_ROWS = [
  { label: "Revenue", plan: "$84,250", delta: "6.2%", tone: undefined },
  { label: "Cloud", plan: "($12,600)", delta: "−12.3%", tone: "negative" },
  { label: "Profit", plan: "$28,850", delta: "14.9%", tone: "total" },
] as const;

function FormattingScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--formatting">
      <span className="sw-hub-budget">
        <span data-tone="head">
          <i>Budget line</i>
          <i>Plan</i>
          <i>Δ</i>
        </span>
        {FORMATTED_ROWS.map((row) => (
          <span data-tone={row.tone} key={row.label}>
            <i>{row.label}</i>
            <i>{row.plan}</i>
            <i>{row.delta}</i>
          </span>
        ))}
      </span>
      <span className="sw-hub-scene__caption">number formats and styles that survive XLSX</span>
    </span>
  );
}

/** A filtered column over a mini grid: one rejected, one warned and one locked cell. */
const DATA_TOOL_ROW_COUNT = 4;
const DATA_TOOL_COLUMN_COUNT = 4;
const DATA_TOOL_FILTERED_COLUMN = 1;
const DATA_TOOL_COLUMNS = Array.from({ length: DATA_TOOL_COLUMN_COUNT }, (_, index) => index);
const DATA_TOOL_CELLS = Array.from(
  { length: DATA_TOOL_ROW_COUNT * DATA_TOOL_COLUMN_COUNT },
  (_, index) => index,
);
const DATA_TOOL_STATES: Readonly<Record<number, "reject" | "warn" | "lock">> = {
  5: "reject",
  10: "warn",
  12: "lock",
};

function DataToolsScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--data-tools">
      <span className="sw-hub-rules">
        <span className="sw-hub-rules__grid">
          {DATA_TOOL_COLUMNS.map((column) => (
            <i
              data-filtered={column === DATA_TOOL_FILTERED_COLUMN || undefined}
              key={`head-${column}`}
            />
          ))}
          {DATA_TOOL_CELLS.map((cell) => (
            <b data-state={DATA_TOOL_STATES[cell]} key={cell} />
          ))}
        </span>
        <span className="sw-hub-rules__legend">
          <span data-state="reject">rejected</span>
          <span data-state="warn">warned</span>
          <span data-state="lock">locked</span>
        </span>
      </span>
      <span className="sw-hub-scene__caption">rules that hold under any sort or filter</span>
    </span>
  );
}

const RIBBON_SCENE_TABS = ["Home", "Insert", "Data", "View"] as const;
const RIBBON_SCENE_GROUPS = [
  "Clipboard",
  "Font",
  "Alignment",
  "Number",
  "Cells",
  "Editing",
] as const;

/** A miniature ribbon: tab row over labeled groups, Home selected. */
function SpreadsheetScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--spreadsheet">
      <span className="sw-hub-ribbon">
        <span className="sw-hub-ribbon__tabs">
          {RIBBON_SCENE_TABS.map((tab) => (
            <i data-selected={tab === "Home"} key={tab}>
              {tab}
            </i>
          ))}
        </span>
        <span className="sw-hub-ribbon__groups">
          {RIBBON_SCENE_GROUPS.map((group) => (
            <span key={group}>
              <b />
              <small>{group}</small>
            </span>
          ))}
        </span>
        <span className="sw-hub-ribbon__formula">
          <code>G50</code>
          <code>=SUM(G2:G49)</code>
        </span>
      </span>
      <span className="sw-hub-scene__caption">ribbon · formula bar · tabs · folds when narrow</span>
    </span>
  );
}

function CapabilityScene({ id, medianMs }: Readonly<{ id: SceneOwnerId; medianMs?: number }>) {
  switch (id) {
    case "spreadsheet":
      return <SpreadsheetScene />;
    case "performance":
      return <PerformanceScene medianMs={medianMs} />;
    case "formulas":
      return <FormulasScene />;
    case "database":
      return <DatabaseScene />;
    case "host-rows":
      return <HostRowsScene />;
    case "interoperability":
      return <InteroperabilityScene />;
    case "formatting":
      return <FormattingScene />;
    case "collaboration":
      return <CollaborationScene />;
    case "engine":
      return <EngineScene />;
    case "data-tools":
      return <DataToolsScene />;
  }
}

type HubOwner = (typeof CAPABILITY_OWNERS)[number];

function HubCard({ owner, medianMs }: Readonly<{ owner: HubOwner; medianMs?: number }>) {
  const cue = FRAMEWORK_MOUNTS[owner.id];
  const isFramework = owner.kind === "framework";
  return (
    <li data-kind={owner.kind} data-owner={owner.id}>
      <Link
        className={`sw-hub-launch${isFramework ? " sw-hub-launch--framework" : ""}`}
        data-owner={owner.id}
        reloadDocument={opensFreshDocument(owner.href)}
        to={owner.href}
      >
        {isFramework ? (
          <span aria-hidden="true" className="sw-hub-framework-scene">
            <code className="sw-hub-framework-scene__import">
              <span>
                <i>import</i> {"{ "}
                {cue?.name}
                {" }"}
              </span>{" "}
              <span>
                <i>from</i> <em>"{cue?.pkg}"</em>
              </span>
            </code>
            <code className="sw-hub-framework-scene__mount">{cue?.mount}</code>
          </span>
        ) : (
          <CapabilityScene id={owner.id as SceneOwnerId} medianMs={medianMs} />
        )}
        <span className="sw-hub-launch__body">
          <span className="sw-hub-launch__meta">
            {HUB_GROUPS.find((item) => item.id === ownerGroup(owner))?.label}
          </span>
          <strong>{owner.label}</strong>
          <span className="sw-hub-launch__summary">
            {isFramework ? FRAMEWORK_SUMMARY[owner.id] : SCENE_SUMMARY[owner.id as SceneOwnerId]}
          </span>
          <span className="sw-hub__owner-count">Open live example →</span>
        </span>
      </Link>
    </li>
  );
}

function HubSection({
  id,
  title,
  note,
  owners,
  group,
  medianMs,
}: Readonly<{
  id: string;
  title: string;
  note: string;
  owners: readonly HubOwner[];
  group: HubGroup;
  medianMs?: number;
}>) {
  if (owners.length === 0) return null;
  return (
    <section aria-labelledby={id} className="sw-hub__group">
      <div className="sw-hub__group-head">
        <h3 id={id}>{title}</h3>
        <p>{note}</p>
      </div>
      <ol className="sw-hub-scenes" data-group={group}>
        {owners.map((owner) => (
          <HubCard key={owner.id} medianMs={medianMs} owner={owner} />
        ))}
      </ol>
    </section>
  );
}

function ShowcaseHub() {
  const bench = landingBench as HubBenchData;
  const heroStats = bench.available ? bench.heroStats : undefined;
  const medianMs = heroStats?.millionRowMedianMs;
  const [group, setGroup] = useState<HubGroup>("all");
  const capabilityOwners = SCENE_ORDER.map((id) => OWNER_BY_ID.get(id)).filter(
    (owner): owner is NonNullable<typeof owner> => owner !== undefined,
  );
  const frameworkOwners = CAPABILITY_OWNERS.filter((owner) => owner.kind === "framework");
  const shows = (owner: HubOwner) => group === "all" || ownerGroup(owner) === group;
  const visibleCapabilities = capabilityOwners.filter(shows);
  const visibleFrameworks = frameworkOwners.filter(shows);
  const total = capabilityOwners.length + frameworkOwners.length;

  return (
    <div className="sw-hub-frame">
      <SiteTopbar active="showcases" />
      <main className="sw-hub" id="main-content">
        <header className="sw-hub__hero">
          <p className="sw-hub__eyebrow">Showcases</p>
          <h1>See Sheetwrite at work.</h1>
          <p className="sw-hub__lede">
            Each example opens a live spreadsheet with real controls. Start with a capability, or
            pick the framework you build with.
          </p>
        </header>

        <section aria-labelledby="hub-scenes" className="sw-hub__scenes">
          <h2 className="sw-hub__visually-hidden" id="hub-scenes">
            Live examples
          </h2>
          <div className="sw-hub__toolbar">
            <fieldset className="sw-hub__filters">
              <legend>Filter product examples</legend>
              {HUB_GROUPS.map((item) => (
                <button
                  aria-pressed={group === item.id}
                  key={item.id}
                  onClick={() => setGroup(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </fieldset>
            <p aria-live="polite" className="sw-hub__filter-status">
              {visibleCapabilities.length + visibleFrameworks.length} / {total} shown
            </p>
          </div>
          <HubSection
            group={group}
            id="hub-capabilities"
            medianMs={medianMs}
            note="Each opens on the feature it proves, with live data and controls."
            owners={visibleCapabilities}
            title="Capabilities"
          />
          <HubSection
            group={group}
            id="hub-frameworks"
            note="The same engine, mounted through each first-party adapter."
            owners={visibleFrameworks}
            title="Framework adapters"
          />
        </section>
      </main>
    </div>
  );
}
