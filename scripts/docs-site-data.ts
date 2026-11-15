import { join } from "node:path";

import { releaseFacts } from "../docs/src/lib/releases.js";
import { entrySlug } from "./docs-paths.js";
import { type ExpectedFile, generatedDataRoot, stableJson } from "./docs-shared.js";
import { type FormulaReferencePage, formulaFamilyNavigation } from "./formula-docs.js";
import { headingAnchors } from "./markdown-anchors.js";
import type { PublicApiManifest } from "./public-api.js";

/**
 * The generated JSON that `docs/src/lib/navigation.ts`,
 * `docs/src/lib/moved-headings.ts` and the release links in the site's
 * header, sidebar and landing import. The docs generator and checker load
 * those modules, so `scripts/docs-cli.ts` writes these files before it loads
 * them. Nothing here may import the site's navigation or moved-page modules.
 */

const FORMULA_OVERVIEW_ROUTE = "reference/formula-functions.md";

/**
 * Where each old heading of the single-page formula reference lives now. An
 * old heading forwards only when exactly one family page holds it; shared
 * headings ("Signature profiles") stay on the overview.
 */
export function formulaHeadingTargets(
  formulaPages: readonly FormulaReferencePage[],
): Record<string, string> {
  const targets: Record<string, string> = {};
  const overviewAnchors = headingAnchors(
    formulaPages.find((page) => page.route === FORMULA_OVERVIEW_ROUTE)?.content ?? "",
  );
  const holders = new Map<string, string[]>();
  for (const page of formulaPages) {
    if (page.route === FORMULA_OVERVIEW_ROUTE) continue;
    const href = `/docs/${page.route.replace(/\.md$/, "/")}`;
    for (const heading of headingAnchors(page.content)) {
      if (overviewAnchors.has(heading)) continue;
      holders.set(heading, [...(holders.get(heading) ?? []), `${href}#${heading}`]);
    }
  }
  for (const [heading, headingTargets] of holders) {
    if (headingTargets.length === 1 && headingTargets[0] !== undefined)
      targets[heading] = headingTargets[0];
  }
  // The old single-page table used a heading for each family's title.
  for (const family of formulaFamilyNavigation(formulaPages)) {
    const oldHeading = [...headingAnchors(`### ${family.label}`)][0];
    if (oldHeading !== undefined) targets[oldHeading] = family.href;
  }
  return targets;
}

/** The API package links of the sidebar, one per package with an entry point. */
function apiNavigation(manifest: PublicApiManifest): { label: string; href: string }[] {
  return manifest.packages.map((pkg) => ({
    label: pkg.name,
    href: `/docs/api/${entrySlug(pkg.name, ".")}/`,
  }));
}

/** The navigation and moved-heading data files, with the exact bytes each must hold. */
export function siteDataFiles(
  manifest: PublicApiManifest,
  formulaPages: readonly FormulaReferencePage[],
): ExpectedFile[] {
  return [
    { path: join(generatedDataRoot, "api-nav.json"), content: stableJson(apiNavigation(manifest)) },
    {
      path: join(generatedDataRoot, "formula-heading-targets.json"),
      content: stableJson(formulaHeadingTargets(formulaPages)),
    },
    {
      path: join(generatedDataRoot, "formula-nav.json"),
      content: stableJson(formulaFamilyNavigation(formulaPages)),
    },
    { path: join(generatedDataRoot, "release-facts.json"), content: stableJson(releaseFacts()) },
  ];
}
