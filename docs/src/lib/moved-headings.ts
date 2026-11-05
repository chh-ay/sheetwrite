import formulaHeadingTargets from "../generated/formula-heading-targets.json" with { type: "json" };
import { fragmentId } from "./fragment.js";
import { MOVED_PAGES, type MovedPage } from "./moved-pages.js";

/**
 * Pages that keep their address but move some headings to topic pages. The
 * formula overview's targets are generated, so this map lives apart from
 * `moved-pages.ts`, which the docs server and deployment scripts load without
 * generated docs.
 */
export const MOVED_HEADINGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "/docs/reference/formula-functions/": formulaHeadingTargets,
  "/docs/concepts/runtime-ownership/": {
    "document-protocol-and-storage-transactions":
      "/docs/concepts/documents-and-operations/#document-protocol-and-storage-transactions",
    "cell-values": "/docs/concepts/documents-and-operations/#cell-values",
  },
  "/docs/performance/benchmark-protocol/": {
    "release-comparison": "/docs/performance/release-comparison/",
  },
};

/**
 * After a redirect, the new page receives the old fragment. When that heading
 * now lives on another page, this returns that page; otherwise undefined.
 */
export function forwardedHeading(
  href: string,
  hash: string,
  movedPages: Readonly<Record<string, MovedPage>> = MOVED_PAGES,
): string | undefined {
  const anchor = fragmentId(hash);
  if (anchor.length === 0) return undefined;
  const movedHeading = MOVED_HEADINGS[href]?.[anchor];
  if (movedHeading !== undefined) return movedHeading;
  for (const page of Object.values(movedPages)) {
    if (page.to !== href) continue;
    const target = page.anchors[anchor];
    if (target !== undefined && !target.startsWith(`${href}#`)) return target;
  }
  return undefined;
}
