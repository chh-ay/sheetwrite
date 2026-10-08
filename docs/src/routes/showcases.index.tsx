import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import landingBench from "../generated/landing-bench.json";
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

/**
 * Seven capability owners: three featured cards on the first desktop row, four
 * on the second, then the four adapters.
 */
const SCENE_ORDER = [
  "performance",
  "formulas",
  "collaboration",
  "database",
  "host-rows",
  "interoperability",
  "engine",
] as const satisfies readonly CapabilityOwnerId[];

type SceneOwnerId = (typeof SCENE_ORDER)[number];

/** Concise launch copy, distilled from each checked owner's responsibility. */
const SCENE_SUMMARY: Readonly<Record<SceneOwnerId, string>> = {
  performance: "Fly the live Grid through a billion cells and watch what stays resident.",
  formulas: "GROUPBY, PIVOTBY, LAMBDA and regex over 20,000 orders, recalculated on every edit.",
  database: "IndexedDB snapshots, commits, compaction, and reload recovery.",
  "host-rows": "Your store owns the rows. Sort, filter and edit; every delta names the record.",
  interoperability: "XLSX and delimited exchange with fixture-backed fidelity warnings.",
  collaboration: "Sequencing, reconnects, conflicts, and recovery across two clients.",
  engine: "A 50,000-row forecast with every public engine event traced beside it.",
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
  if (owner.id === "interoperability") return "workbook";
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
      <span className="sw-hub-scene__caption">299 functions · LAMBDA · spill references</span>
    </span>
  );
}

/** Engine events streaming beside a Grid. */
function EngineScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--engine">
      <span className="sw-hub-trace">
        <code>
          <i>datasource</i> rows 31–45 · 0.1 ms
        </code>
        <code>
          <i>formula</i> C2 810 → 900
        </code>
        <code>
          <i>drawing</i> canvas · 270 cells
        </code>
        <code>
          <i>host-save</i> acknowledged
        </code>
      </span>
      <span className="sw-hub-scene__caption">public events · paged forecast</span>
    </span>
  );
}

/** Host-owned rows: the view moves, the record IDs stay. */
function HostRowsScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--host-rows">
      <span className="sw-hub-trace">
        <code>
          <i>sort</i> ARR desc · IDs kept
        </code>
        <code>
          <i>edit</i> account-003 ARR → 225,000
        </code>
        <code>
          <i>delta</i> 1 record · host store
        </code>
        <code>
          <i>import</i> 10,000 leads · unique IDs
        </code>
      </span>
      <span className="sw-hub-scene__caption">stable row IDs · host write policy</span>
    </span>
  );
}

function CapabilityScene({ id, medianMs }: Readonly<{ id: SceneOwnerId; medianMs?: number }>) {
  switch (id) {
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
    case "collaboration":
      return <CollaborationScene />;
    case "engine":
      return <EngineScene />;
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
        // The formula page selects the full engine, so it opens as a fresh page.
        reloadDocument={owner.id === "formulas"}
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
