import { pageMeta } from "@docs/lib/seo.js";
import { ORDER_ROWS, RELATIONSHIPS } from "@docs/showcases/scenarios/data-model.js";
import DataModelSnippet from "@docs/showcases/snippets/data-model.mdx";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { DataModelStage } from "../showcases/data-model/DataModelStage.js";
import { ShowcasePage, ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";

import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import featureStylesheet from "@docs/styles/feature-showcases.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/data-model")({
  head: () => ({
    meta: pageMeta(
      "Data model — Sheetwrite showcases",
      "Relate orders to products and regions, pivot by fields of the related tables with a measure, and see what a broken key does.",
    ),
    links: [
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: featureStylesheet },
    ],
  }),
  component: DataModelShowcase,
});

function DataModelShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{ title: "The code behind it", Snippet: DataModelSnippet }}
        eyebrow="Analysis"
        facts={[
          { label: "Orders", value: ORDER_ROWS.toLocaleString("en") },
          { label: "Tables", value: "Orders, Products, Regions" },
          { label: "Relationships", value: RELATIONSHIPS.length.toLocaleString("en") },
        ]}
        guide={{ href: "/docs/features/analysis/data-model/", label: "Read the data model guide" }}
        id="data-model"
        stage={<Island component={DataModelStage} name="showcase-data-model" props={{}} />}
        task={
          <>
            Pivot orders by a column of a related table, with a measure that recalculates in every
            cell. Then break a key and see what the relationship and the pivot report.
          </>
        }
        title="One pivot across related tables"
      >
        <ShowcaseSection id="data-model-rules" title="How the model reads the tables">
          <ul>
            <li>
              A pivot over the model equals a pivot over Orders with each related column looked up
              for every order. An order without a matching product shows a blank row label.
            </li>
            <li>
              A repeated lookup key makes the lookup ambiguous, so the pivot shows{" "}
              <code>#VALUE!</code> until the key is unique again.
            </li>
            <li>
              The measure <code>=SUM(Orders[Amount])/COUNT(Orders[Amount])</code> is calculated
              again for each cell and total, so a total is the mean of all its orders.
            </li>
            <li>
              Relationships, measures and model pivots are saved in the workbook, undone and synced.
              Excel opens an exported file without them.
            </li>
          </ul>
        </ShowcaseSection>
      </ShowcasePage>
    </NoHydration>
  );
}
