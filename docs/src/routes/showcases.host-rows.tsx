import { pageMeta } from "@docs/lib/seo.js";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { HostImportDiagram } from "../art/explain-diagrams.js";
import { Island } from "../islands/Island.js";
import {
  ACCOUNT_COLUMNS,
  ACCOUNT_ROWS,
  LEAD_IMPORT_ROWS,
  LEAD_LOAD_BATCH_ROWS,
} from "../showcases/host-rows/accounts.js";
import { HostRowsStage } from "../showcases/host-rows/HostRowsStage.js";
import { ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { ShowcasePage } from "../showcases/layout/ShowcasePage.js";
import HostRowsSnippet from "../showcases/snippets/host-rows.mdx";
import HostRowsSnippetSource from "../showcases/snippets/host-rows.mdx?source";

import artStylesheet from "../art/art.css?url";
import stylesheet from "../styles/showcases/host-rows.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/host-rows")({
  head: () => ({
    meta: pageMeta(
      "Host-owned rows — Sheetwrite",
      "Sort and filter host-owned CRM accounts, import 10,000 leads through the row bridge, and watch the live ID-check and cell-load time.",
    ),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: stylesheet },
    ],
  }),
  component: HostRowsShowcase,
});

function HostRowsShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        explain={
          <ShowcaseSection
            id="host-rows-loading"
            figure={<HostImportDiagram />}
            title="How the import loads"
          >
            <p>
              The insert of {LEAD_IMPORT_ROWS.toLocaleString("en")} rows is one commit. Their{" "}
              {(LEAD_IMPORT_ROWS * ACCOUNT_COLUMNS.length).toLocaleString("en")} cell values load in
              batches of {LEAD_LOAD_BATCH_ROWS.toLocaleString("en")} rows, because one Grid
              transaction accepts a bounded number of operations.
            </p>
          </ShowcaseSection>
        }
        code={{
          title: "The code behind it",
          Snippet: HostRowsSnippet,
          source: HostRowsSnippetSource,
        }}
        eyebrow="Data"
        facts={[
          { label: "Accounts", value: ACCOUNT_ROWS.toLocaleString("en") },
          { label: "Leads to import", value: LEAD_IMPORT_ROWS.toLocaleString("en") },
          { label: "Identity", value: "Stable account IDs" },
        ]}
        guide={{
          href: "/docs/features/data/host-owned-rows/",
          label: "Read the host-owned rows guide",
        }}
        id="host-rows"
        stage={<Island component={HostRowsStage} name="showcase-host-rows" props={{}} />}
        task="Your app owns the account store. Sort the view, filter and edit the grid, then import thousands of leads: every delta still names the same account ID."
        title="Move the view. Keep the account."
      ></ShowcasePage>
    </NoHydration>
  );
}
