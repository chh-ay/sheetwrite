import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Icon } from "../components/Icon.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { opensFreshDocument } from "../lib/navigation.js";
import { pageMeta } from "../lib/seo.js";
import { CAPABILITY_OWNERS, type CapabilityOwnerId } from "../showcases/hub-inventory.js";

import hubStylesheet from "../styles/showcase-hub.css?url";

export const Route = createFileRoute("/showcases/")({
  head: () => ({
    meta: pageMeta(
      "Showcases — evaluate Sheetwrite by feature",
      "Live examples of every Sheetwrite feature: editing, formulas, pivot tables and charts, million-row scale, XLSX/CSV, offline sync and collaboration.",
    ),
    links: [{ rel: "stylesheet", href: hubStylesheet }],
  }),
  component: ShowcaseHub,
});

const OWNER_BY_ID = new Map(CAPABILITY_OWNERS.map((owner) => [owner.id, owner]));

/** The featured app card followed by the capability launch cards. */
const SCENE_ORDER = [
  "spreadsheet",
  "analysis",
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
  performance: "Fly the live grid across a billion addresses and watch what stays loaded.",
  formulas: "GROUPBY, PIVOTBY, LAMBDA and regex over an order ledger, recalculated on every edit.",
  database: "IndexedDB snapshots, commits, compaction, and reload recovery.",
  "host-rows":
    "Your store owns the rows. Sort the view, filter and edit; every delta names the record.",
  interoperability: "XLSX and delimited exchange with fixture-backed fidelity warnings.",
  formatting: "A styled budget, mixed number formats, and a live XLSX fidelity check.",
  collaboration: "Sequencing, reconnects, conflicts, and recovery across two clients.",
  engine: "A paged forecast with every public engine event traced beside it.",
  "data-tools": "Filter and organize dispatch orders; exercise validation and protection.",
  spreadsheet:
    "An Excel-style ribbon, formula bar and sheet tabs around one grid. Narrow it and watch the groups fold.",
  analysis: "A pivot table and a live chart over two years of orders. Edit an order and both move.",
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
  if (owner.id === "formulas" || owner.id === "engine" || owner.id === "analysis")
    return "formulas";
  if (owner.id === "interoperability" || owner.id === "formatting" || owner.id === "spreadsheet") {
    return "workbook";
  }
  if (owner.id === "collaboration") return "collaboration";
  return "data";
}

/** The size `scripts/docs-showcase-previews.ts` captures a demo at, for the image's aspect ratio. */
const PREVIEW_WIDTH = 960;
const PREVIEW_HEIGHT = 600;

/**
 * The live demo of a showcase, as `scripts/docs-showcase-previews.ts` captured
 * it in each theme. Both images are in the card; the site theme shows one.
 */
function ShowcasePreview({ id }: Readonly<{ id: SceneOwnerId }>) {
  return (
    <span aria-hidden="true" className="sw-hub-preview">
      {(["light", "dark"] as const).map((theme) => (
        <img
          alt=""
          data-preview-theme={theme}
          decoding="async"
          height={PREVIEW_HEIGHT}
          key={theme}
          loading="lazy"
          src={`/showcase-previews/${id}-${theme}.jpg`}
          width={PREVIEW_WIDTH}
        />
      ))}
    </span>
  );
}

type HubOwner = (typeof CAPABILITY_OWNERS)[number];

function HubCard({ owner }: Readonly<{ owner: HubOwner }>) {
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
          <ShowcasePreview id={owner.id as SceneOwnerId} />
        )}
        <span className="sw-hub-launch__body">
          <span className="sw-hub-launch__meta">
            {HUB_GROUPS.find((item) => item.id === ownerGroup(owner))?.label}
          </span>
          <strong>{owner.label}</strong>
          <span className="sw-hub-launch__summary">
            {isFramework ? FRAMEWORK_SUMMARY[owner.id] : SCENE_SUMMARY[owner.id as SceneOwnerId]}
          </span>
          <span className="sw-hub__owner-count">
            Open live example
            <Icon name="arrow-right" size="sm" />
          </span>
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
}: Readonly<{
  id: string;
  title: string;
  note: string;
  owners: readonly HubOwner[];
  group: HubGroup;
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
          <HubCard key={owner.id} owner={owner} />
        ))}
      </ol>
    </section>
  );
}

function ShowcaseHub() {
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
