/**
 * Routes and docs of public API symbols, read from the generated API manifest
 * (`src/generated/public-api.json`). Code hovers link and preview symbols with
 * them; the showcase code aside describes the calls a snippet makes.
 */

import { apiAnchor, apiPageSlugs } from "./api-page-slugs.js";

export interface ApiManifestShape {
  packages: readonly {
    name: string;
    entryPoints: readonly {
      subpath: string;
      classification: string;
      exports?: readonly {
        name: string;
        kind?: string;
        signature?: string;
        documentation?: string;
        memberDocs?: readonly { name: string; documentation: string }[];
      }[];
    }[];
  }[];
}

type ManifestPackage = ApiManifestShape["packages"][number];

function core_first(packages: ApiManifestShape["packages"]): ManifestPackage[] {
  return [...packages].sort((left, right) =>
    left.name === "@sheetwrite/core" ? -1 : right.name === "@sheetwrite/core" ? 1 : 0,
  );
}

function root_first(entry_points: ManifestPackage["entryPoints"]) {
  return [...entry_points].sort((left, right) =>
    left.subpath === "." ? -1 : right.subpath === "." ? 1 : 0,
  );
}

function entry_slug(package_name: string, subpath: string): string {
  const package_slug = package_name.replace("@sheetwrite/", "");
  return subpath === "."
    ? package_slug
    : `${package_slug}-${subpath.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

/** A JSDoc tag as `[name, text]`, the shape the language server's hovers use. */
export type DocumentationTag = [name: string, text: string | undefined];

/** A manifest doc comment split into its summary and its tags. */
export interface SplitDocumentation {
  docs?: string;
  tags: readonly DocumentationTag[];
}

/**
 * The manifest keeps `@param`, `@returns`, `@throws`, `@example` and `@see` in
 * the doc text, one per line; hovers show the summary and render tags apart.
 */
export function splitDocumentation(documentation: string | undefined): SplitDocumentation {
  const sections = (documentation ?? "").split(/(?:^|\n)@(\w+)\b[ \t]*\n?/);
  const tags: DocumentationTag[] = [];
  for (let index = 1; index < sections.length; index += 2) {
    const name = sections[index] ?? "";
    const raw = sections[index + 1]?.trim() ?? "";
    // `@param name - text` reads as `name text`, as the language server's hovers give it.
    const text = name === "param" ? raw.replace(/^([\w$.]+)\s+-\s+/, "$1 ") : raw;
    tags.push([name, text === "" ? undefined : text]);
  }
  const docs = sections[0]?.trim();
  return { docs: docs === "" ? undefined : docs, tags };
}

export interface MemberReference {
  docs: string;
  tags: readonly DocumentationTag[];
  route: string;
}

/**
 * Symbol name -> generated reference route, so every hover on a public API
 * symbol can link straight to its documentation page. Root entry points win
 * name collisions; `@sheetwrite/core` wins across packages.
 */
export function apiReferenceRoutes(manifest: ApiManifestShape): ReadonlyMap<string, string> {
  const routes = new Map<string, string>();
  for (const pkg of core_first(manifest.packages)) {
    for (const entry of root_first(pkg.entryPoints)) {
      if (entry.classification !== "supported") continue;
      const slug = entry_slug(pkg.name, entry.subpath);
      const pages = apiPageSlugs(entry.exports ?? []);
      for (const item of entry.exports ?? []) {
        if (!routes.has(item.name)) {
          routes.set(item.name, `/docs/api/${slug}/${pages.get(item.name)}/`);
        }
      }
    }
  }
  return routes;
}

export interface SymbolPreview {
  signature: string;
  docs?: string;
  tags: readonly DocumentationTag[];
}

/**
 * Symbol name -> declaration + docs for hover previews inside generated
 * fences, where the type engine has no imports to resolve against. Collision
 * policy mirrors `apiReferenceRoutes` so preview and link always agree.
 */
export function apiSymbolPreviews(manifest: ApiManifestShape): ReadonlyMap<string, SymbolPreview> {
  const previews = new Map<string, SymbolPreview>();
  for (const pkg of core_first(manifest.packages)) {
    for (const entry of root_first(pkg.entryPoints)) {
      if (entry.classification !== "supported") continue;
      for (const item of entry.exports ?? []) {
        if (!item.signature || previews.has(item.name)) continue;
        previews.set(item.name, {
          signature: item.signature.replace(/^export\s+/, ""),
          ...splitDocumentation(item.documentation),
        });
      }
    }
  }
  return previews;
}

/**
 * Member name -> owning documentation. Framework template hovers (`@ready`,
 * `onGridChange={…}`) resolve to synthetic bindings without JSDoc; the member
 * docs from the API manifest restore the depth and a deep link.
 */
export function apiMemberReferences(
  manifest: ApiManifestShape,
): ReadonlyMap<string, MemberReference> {
  const members = new Map<string, MemberReference>();
  for (const pkg of core_first(manifest.packages)) {
    for (const entry of pkg.entryPoints) {
      if (entry.classification !== "supported") continue;
      const slug = entry_slug(pkg.name, entry.subpath);
      const pages = apiPageSlugs(entry.exports ?? []);
      for (const item of entry.exports ?? []) {
        for (const member of item.memberDocs ?? []) {
          const { docs, tags } = splitDocumentation(member.documentation);
          if (docs === undefined || members.has(member.name)) continue;
          members.set(member.name, {
            docs,
            tags,
            route: `/docs/api/${slug}/${pages.get(item.name)}/#${apiAnchor(item.name)}-${apiAnchor(member.name)}`,
          });
        }
      }
    }
  }
  return members;
}
