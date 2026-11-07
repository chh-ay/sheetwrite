import { pageMeta } from "@docs/lib/seo.js";
import { FEED_START_ROWS, LARGE_ORDER_AMOUNT } from "@docs/showcases/scenarios/queries.js";
import QueriesSnippet from "@docs/showcases/snippets/queries.mdx";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { ShowcasePage, ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { QueriesStage } from "../showcases/queries/QueriesStage.js";

import featureStylesheet from "@docs/styles/feature-showcases.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/queries")({
  head: () => ({
    meta: pageMeta(
      "Saved queries — Sheetwrite showcases",
      "Saved queries shape a CSV order feed and a JSON region list into workbook tables. Refresh them, change a step, and open Queries & Connections.",
    ),
    links: [
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: featureStylesheet },
    ],
  }),
  component: QueriesShowcase,
});

function QueriesShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{ title: "The code behind it", Snippet: QueriesSnippet }}
        eyebrow="Data"
        facts={[
          { label: "Orders in the feed", value: FEED_START_ROWS.toLocaleString("en") },
          { label: "Saved queries", value: "Region totals, Large orders" },
          { label: "Package", value: "@sheetwrite/queries", code: true },
        ]}
        guide={{
          href: "/docs/features/data/data-operations/#saved-queries-and-refresh",
          label: "Read the queries guide",
        }}
        id="queries"
        stage={<Island component={QueriesStage} name="showcase-queries" props={{}} />}
        task={
          <>
            Refresh two saved queries that shape an order feed into workbook tables. Let new orders
            arrive, change a step, and refresh again.
          </>
        }
        title="Saved queries that refresh into tables"
      >
        <ShowcaseSection id="queries-rules" title="What a refresh does">
          <ul>
            <li>
              The session loads sources only through your <code>fetchSource</code> callback, so your
              app applies its own credentials and network rules.
            </li>
            <li>
              Undo and redo restore the written values without another source load: watch Source
              loads stay the same.
            </li>
            <li>
              Large orders keeps orders of {LARGE_ORDER_AMOUNT.toLocaleString("en")} or more. A
              refresh that would grow a table over other cells writes nothing.
            </li>
            <li>
              With a Power Query codec, XLSX export writes the saved queries as Power Query parts
              for Excel, and import reads them back.
            </li>
          </ul>
        </ShowcaseSection>
      </ShowcasePage>
    </NoHydration>
  );
}
