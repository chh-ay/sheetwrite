import { relative, sep } from "node:path";

import type { ApiEntryPoint, ApiPackage } from "./public-api.js";

/**
 * Address rules that the docs generator and the plain-text endpoints share.
 * Both must give a page the same route, or `llms.txt` links pages that the
 * site does not serve.
 */

/** The site route of an authored page at `path` under the docs content root. */
export function routeForContentPath(contentRoot: string, path: string): string {
  const relative_path = relative(contentRoot, path)
    .split(sep)
    .join("/")
    .replace(/\.mdx?$/, "");
  const without_index = relative_path === "index" ? "" : relative_path.replace(/\/index$/, "");
  return `/docs/${without_index}${without_index.length === 0 ? "" : "/"}`;
}

/** The slug of an entry point's reference page: `/docs/api/<slug>/`. */
export function entrySlug(packageName: string, subpath: string): string {
  const package_slug = packageName.replace("@sheetwrite/", "");
  if (subpath === ".") return package_slug;
  return `${package_slug}-${subpath.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

/** The import specifier of an entry point, as readers write it. */
export function entryLabel(pkg: ApiPackage, entry: ApiEntryPoint): string {
  return entry.subpath === "." ? pkg.name : `${pkg.name}/${entry.subpath.slice(2)}`;
}
