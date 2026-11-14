import { pageMeta } from "@docs/lib/seo.js";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { DataEvents } from "../showcases/data-tools/DataEvents.js";
import { DataToolsStage } from "../showcases/data-tools/DataToolsStage.js";
import { ShowcasePage } from "../showcases/layout/ShowcasePage.js";
import {
  DATA_COLUMNS,
  DATA_ROWS,
  DATA_RULES,
  probeValue,
} from "../showcases/scenarios/data-tools.js";
import DataToolsSnippet from "../showcases/snippets/data-tools.mdx";
import DataToolsSnippetSource from "../showcases/snippets/data-tools.mdx?source";

import stylesheet from "../styles/showcases/data-tools.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/data-tools")({
  head: () => ({
    meta: pageMeta(
      "Data tools — Sheetwrite showcases",
      "Filter and organize 4,800 dispatch orders. Exercise validation, protected ranges, row grouping and visibility with live Grid event receipts.",
    ),
    links: [
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: stylesheet },
    ],
  }),
  component: DataToolsShowcase,
});

/** Each guarded column and its probe, as the scenario defines them. */
const RULE_PROBES = Object.values(DATA_RULES).map((rule) => ({
  key: rule.key,
  header: rule.column.header,
  rule: rule.rule,
  tryLabel: rule.key === "order" ? "Try a new order ID" : `Try ${rule.key} ${probeValue(rule.key)}`,
}));

function DataToolsShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{
          title: "How it is built",
          Snippet: DataToolsSnippet,
          source: DataToolsSnippetSource,
          // What the grid reported, live, beside the calls that produce it.
          figure: (
            <section aria-labelledby="data-events" class="sw-data-events-aside">
              <h3 class="sw-showcase__aside-title" id="data-events">
                What the grid reported
              </h3>
              <p>Newest first: grid calls and events, plus labeled host role changes.</p>
              <Island component={DataEvents} name="showcase-data-events" props={{}} />
              <p class="sw-prose">
                Sorting has its own showcase: <a href="/showcases/sort/">sort in place</a>, as Excel
                does, or for the view only.
              </p>
            </section>
          ),
        }}
        eyebrow="Data"
        facts={[
          { label: "Orders", value: DATA_ROWS.toLocaleString("en") },
          { label: "Columns", value: DATA_COLUMNS.length.toLocaleString("en") },
          { label: "Rules", value: RULE_PROBES.length.toLocaleString("en") },
        ]}
        guide={{
          href: "/docs/features/data/data-operations/",
          label: "Read the data operations guide",
        }}
        id="data-tools"
        stage={
          <Island
            component={DataToolsStage}
            name="showcase-data-tools"
            props={{ rules: RULE_PROBES }}
          />
        }
        task={
          <>
            Narrow {DATA_ROWS.toLocaleString("en")} dispatch orders with filters, groups and hidden
            rows, then try edits that the rules reject, warn about or lock.
          </>
        }
        title="Filter the work, guard the data"
      />
    </NoHydration>
  );
}
