import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { pageMeta } from "../lib/seo.js";
import stylesheet from "../styles/showcase-formulas.css?url";

const FormulasShowcase = lazy(() => import("../showcases/FormulasShowcase.js"));

const description =
  "Thirteen live formulas summarize 20,000 orders with the full Sheetwrite formula engine: GROUPBY and PIVOTBY tables, statistics, distributions, LINEST, NPV and working days, DSUM, LAMBDA helpers, regex, and spill references. Change the data and every answer recalculates.";

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
