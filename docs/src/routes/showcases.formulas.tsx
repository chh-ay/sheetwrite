import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { pageMeta } from "../lib/seo.js";

import stylesheet from "../styles/showcase-formulas.css?url";

const FormulasShowcase = lazy(() => import("../showcases/FormulasShowcase.js"));

const description =
  "Thirteen live formulas over 20,000 orders: GROUPBY, PIVOTBY, statistics, LINEST, NPV, LAMBDA and spills. Change the data and every answer recalculates.";

export const Route = createFileRoute("/showcases/formulas")({
  head: () => ({
    meta: pageMeta("Formula analysis with the full engine — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: FormulasRoute,
});

function FormulasRoute() {
  return (
    <Suspense
      fallback={
        <main className="sw-fx-loading" data-testid="formulas-route-loading">
          <p>Loading the formula workbook…</p>
        </main>
      }
    >
      <FormulasShowcase />
    </Suspense>
  );
}
