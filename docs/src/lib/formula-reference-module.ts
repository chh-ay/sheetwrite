/**
 * The formula reference filter and its select load only with the formula
 * family pages that use them, not with every documentation page. The route
 * loader loads them before a formula page renders, so the server renders the
 * table in place instead of streaming it in after the page. The module state
 * lives here, outside the route file, because the router splits a route's
 * loader and component into separate modules.
 */

type FormulaReferenceModule = typeof import("../components/FormulaReference.js");

let formulaReferenceModule: FormulaReferenceModule | undefined;
let formulaReferenceLoad: Promise<FormulaReferenceModule> | undefined;

/** Formula family pages, whose article holds the formula reference. */
export const FORMULA_FAMILY_PAGE = /^\/docs\/reference\/formula-functions\/[^/]+\/$/;

/** Loads the formula reference module once. */
export function loadFormulaReference(): Promise<FormulaReferenceModule> {
  formulaReferenceLoad ??= import("../components/FormulaReference.js").then((module) => {
    formulaReferenceModule = module;
    return module;
  });
  return formulaReferenceLoad;
}

/** The formula reference module, when it has loaded. */
export function loadedFormulaReference(): FormulaReferenceModule | undefined {
  return formulaReferenceModule;
}
