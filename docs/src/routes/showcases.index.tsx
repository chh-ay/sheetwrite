import { pageMeta } from "@docs/lib/seo.js";
import { CAPABILITY_OWNERS, type CapabilityOwnerId } from "@docs/showcases/hub-inventory.js";
import { createFileRoute } from "@tanstack/solid-router";
import { For } from "solid-js";
import { NoHydration } from "solid-js/web";

import { HUB_ART } from "../art/hub-art.js";
import { Icon } from "../components/Icon.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { Island } from "../islands/Island.js";
import { ALL_GROUPS, HubFilter } from "../showcases/hub/HubFilter.js";

import artStylesheet from "../art/art.css?url";
import hubStylesheet from "../styles/showcases/hub.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";

export const Route = createFileRoute("/showcases/")({
  head: () => ({
    meta: pageMeta(
      "Showcases — evaluate Sheetwrite by feature",
      "Live examples of every Sheetwrite feature: editing, formulas, pivot tables and charts, million-row scale, XLSX/CSV, offline sync and collaboration.",
    ),
    links: [
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: hubStylesheet },
      { rel: "stylesheet", href: artStylesheet },
    ],
  }),
  component: ShowcaseHub,
});

const OWNER_BY_ID = new Map(CAPABILITY_OWNERS.map((owner) => [owner.id, owner]));

/** The featured app card followed by the capability launch cards. */
const SCENE_ORDER = [
  "spreadsheet",
  "analysis",
  "data-model",
  "dashboards",
  "queries",
  "sort",
  "functions",
  "recalculation",
  "version-history",
  "performance",
  "formulas",
  "collaboration",
  "database",
  "host-rows",
  "interoperability",
  "formatting",
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
  "data-tools": "Filter and organize dispatch orders; exercise validation and protection.",
  spreadsheet:
    "An Excel-style ribbon, formula bar and sheet tabs around one grid. Narrow it and watch the groups fold.",
  analysis: "A pivot table and a live chart over two years of orders. Edit an order and both move.",
  sort: "Sort the cells in place as Excel does, or only the view, and see which formulas follow.",
  queries: "Saved queries shape a CSV feed into tables. Refresh, change a step, refresh again.",
  "data-model": "Relate tables, pivot by a related column with a measure, then break a key.",
  dashboards: "KPI cards, a PivotChart and a pivot that one slicer filters together.",
  "version-history": "Edit with a teammate, compare versions by author, and restore a range.",
  functions: "Engineering, financial, statistics, lookup and regex functions, calculated live.",
  recalculation:
    "Edit a cell that a sheet full of formulas reads, and move its lookups, timed in your browser.",
};

const FRAMEWORK_SUMMARY: Readonly<Record<string, string>> = {
  vanilla: "Direct lifecycle, renderer choice, and workbook operations.",
  react: "Controlled analytics, formulas, clipboard, and reset semantics.",
  vue: "Validation, protection, notes, sheets, and host persistence.",
  svelte: "Durable offline edits, reconnect drain, and activity state.",
};

type HubGroup = "data" | "formulas" | "workbook" | "collaboration" | "framework";

const HUB_GROUPS: readonly { id: HubGroup; label: string }[] = [
  { id: "data", label: "Data & scale" },
  { id: "formulas", label: "Formulas" },
  { id: "workbook", label: "Workbook" },
  { id: "collaboration", label: "Collaboration" },
  { id: "framework", label: "Framework integration" },
];

type HubOwner = (typeof CAPABILITY_OWNERS)[number];

function ownerGroup(owner: HubOwner): HubGroup {
  if (owner.kind === "framework") return "framework";
  if (
    owner.id === "formulas" ||
    owner.id === "functions" ||
    owner.id === "recalculation" ||
    owner.id === "analysis" ||
    owner.id === "data-model" ||
    owner.id === "dashboards"
  ) {
    return "formulas";
  }
  if (owner.id === "interoperability" || owner.id === "formatting" || owner.id === "spreadsheet") {
    return "workbook";
  }
  if (owner.id === "collaboration" || owner.id === "version-history") return "collaboration";
  return "data";
}

/** A card's illustration, drawn for its showcase or framework (art/hub-art.tsx). */
function CardArt(props: Readonly<{ id: string }>) {
  const Art = HUB_ART[props.id];
  return <span class="sw-hub-preview">{Art === undefined ? null : <Art />}</span>;
}

function HubCard(props: Readonly<{ owner: HubOwner }>) {
  const isFramework = () => props.owner.kind === "framework";
  return (
    <li
      data-group={ownerGroup(props.owner)}
      data-kind={props.owner.kind}
      data-owner={props.owner.id}
    >
      <a
        class={`sw-hub-launch${isFramework() ? " sw-hub-launch--framework" : ""}`}
        data-owner={props.owner.id}
        href={props.owner.href}
      >
        <CardArt id={props.owner.id} />
        <span class="sw-hub-launch__body">
          <span class="sw-hub-launch__meta">
            {HUB_GROUPS.find((item) => item.id === ownerGroup(props.owner))?.label}
          </span>
          <strong>{props.owner.label}</strong>
          <span class="sw-hub-launch__summary">
            {isFramework()
              ? FRAMEWORK_SUMMARY[props.owner.id]
              : SCENE_SUMMARY[props.owner.id as SceneOwnerId]}
          </span>
          <span class="sw-hub__owner-count">
            Open live example
            <Icon name="arrow-right" size="sm" />
          </span>
        </span>
      </a>
    </li>
  );
}

function HubSection(
  props: Readonly<{ id: string; title: string; note: string; owners: readonly HubOwner[] }>,
) {
  return (
    <section aria-labelledby={props.id} class="sw-hub__group">
      <div class="sw-hub__group-head">
        <h3 id={props.id}>{props.title}</h3>
        <p>{props.note}</p>
      </div>
      <ol class="sw-hub-scenes" data-group={ALL_GROUPS}>
        <For each={props.owners}>{(owner) => <HubCard owner={owner} />}</For>
      </ol>
    </section>
  );
}

const CAPABILITY_CARDS = SCENE_ORDER.map((id) => OWNER_BY_ID.get(id)).filter(
  (owner): owner is NonNullable<typeof owner> => owner !== undefined,
);
const FRAMEWORK_CARDS = CAPABILITY_OWNERS.filter((owner) => owner.kind === "framework");

function ShowcaseHub() {
  return (
    <NoHydration>
      <div class="sw-hub-frame">
        <SiteTopbar pathname="/showcases/" />
        <main class="sw-hub" id="main-content">
          <header class="sw-hub__hero">
            <p class="sw-hub__eyebrow">Showcases</p>
            <h1>See Sheetwrite at work.</h1>
            <p class="sw-hub__lede">
              Each example opens a live spreadsheet with real controls. Start with a capability, or
              pick the framework you build with.
            </p>
          </header>

          <section aria-labelledby="hub-scenes" class="sw-hub__scenes">
            <h2 class="sw-hub__visually-hidden" id="hub-scenes">
              Live examples
            </h2>
            <Island
              component={HubFilter}
              hydrate="interaction"
              name="showcase-hub-filter"
              props={{
                groups: [{ id: ALL_GROUPS, label: "All" }, ...HUB_GROUPS],
                total: CAPABILITY_CARDS.length + FRAMEWORK_CARDS.length,
              }}
            />
            <HubSection
              id="hub-capabilities"
              note="Each opens on the feature it proves, with live data and controls."
              owners={CAPABILITY_CARDS}
              title="Capabilities"
            />
            <HubSection
              id="hub-frameworks"
              note="The same engine, mounted through each first-party adapter."
              owners={FRAMEWORK_CARDS}
              title="Framework adapters"
            />
          </section>
        </main>
      </div>
    </NoHydration>
  );
}
