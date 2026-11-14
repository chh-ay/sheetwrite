/**
 * Routes and docs of public API symbols, read from the generated API manifest
 * (`src/generated/public-api.json`). Code hovers link and preview symbols with
 * them; the showcase code aside describes the calls a snippet makes.
 */

export interface ApiManifestShape {
  packages: readonly {
    name: string;
    entryPoints: readonly {
      subpath: string;
      classification: string;
      exports?: readonly {
        name: string;
        signature?: string;
        documentation?: string;
        memberDocs?: readonly { name: string; documentation: string }[];
      }[];
    }[];
  }[];
}

type ManifestPackage = ApiManifestShape["packages"][number];

function coreFirst(packages: ApiManifestShape["packages"]): ManifestPackage[] {
  return [...packages].sort((left, right) =>
    left.name === "@sheetwrite/core" ? -1 : right.name === "@sheetwrite/core" ? 1 : 0,
  );
}

function rootFirst(entryPoints: ManifestPackage["entryPoints"]) {
  return [...entryPoints].sort((left, right) =>
    left.subpath === "." ? -1 : right.subpath === "." ? 1 : 0,
  );
}

function entrySlug(packageName: string, subpath: string): string {
  const packageSlug = packageName.replace("@sheetwrite/", "");
  return subpath === "."
    ? packageSlug
    : `${packageSlug}-${subpath.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

export interface MemberReference {
  docs: string;
  route: string;
}

function referenceAnchor(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Symbol name -> generated reference route, so every hover on a public API
 * symbol can link straight to its documentation page. Root entry points win
 * name collisions; `@sheetwrite/core` wins across packages.
 */
export function apiReferenceRoutes(manifest: ApiManifestShape): ReadonlyMap<string, string> {
  const routes = new Map<string, string>();
  for (const pkg of coreFirst(manifest.packages)) {
    for (const entry of rootFirst(pkg.entryPoints)) {
      if (entry.classification !== "supported") continue;
      const slug = entrySlug(pkg.name, entry.subpath);
      for (const item of entry.exports ?? []) {
        if (!routes.has(item.name)) {
          routes.set(item.name, `/docs/api/${slug}/${referenceAnchor(item.name)}/`);
        }
      }
    }
  }
  return routes;
}

export interface SymbolPreview {
  signature: string;
  docs?: string;
}

/**
 * Symbol name -> declaration + docs for hover previews inside generated
 * fences, where the type engine has no imports to resolve against. Collision
 * policy mirrors `apiReferenceRoutes` so preview and link always agree.
 */
export function apiSymbolPreviews(manifest: ApiManifestShape): ReadonlyMap<string, SymbolPreview> {
  const previews = new Map<string, SymbolPreview>();
  for (const pkg of coreFirst(manifest.packages)) {
    for (const entry of rootFirst(pkg.entryPoints)) {
      if (entry.classification !== "supported") continue;
      for (const item of entry.exports ?? []) {
        if (!item.signature || previews.has(item.name)) continue;
        previews.set(item.name, {
          signature: item.signature.replace(/^export\s+/, ""),
          docs: item.documentation || undefined,
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
  for (const pkg of coreFirst(manifest.packages)) {
    for (const entry of pkg.entryPoints) {
      if (entry.classification !== "supported") continue;
      const slug = entrySlug(pkg.name, entry.subpath);
      for (const item of entry.exports ?? []) {
        for (const member of item.memberDocs ?? []) {
          if (!member.documentation || members.has(member.name)) continue;
          members.set(member.name, {
            docs: member.documentation,
            route: `/docs/api/${slug}/${referenceAnchor(item.name)}/#${referenceAnchor(item.name)}-${referenceAnchor(member.name)}`,
          });
        }
      }
    }
  }
  return members;
}
