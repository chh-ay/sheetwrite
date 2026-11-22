/**
 * The page address of each API symbol, shared by the reference generator
 * (scripts/docs-api.ts) and the site's code hovers (api-reference-routes.ts).
 *
 * A symbol's page is `/docs/api/<entry>/<slug>/`, its slug the name in kebab
 * case: `createGrid` is `create-grid`. Kebab case drops letter case, so two
 * exports of one entry point can fold to the same slug: the `ShownSuggestion`
 * type and the `shownSuggestion` function are both `shown-suggestion`, and on
 * a case-insensitive host even differently cased slugs would share a page.
 * The first of them keeps the plain slug and each other one adds its kind
 * (`shown-suggestion-interface`). "First" is a fixed order: values (functions,
 * variables, classes, enums) before types, then by name, so only the names that
 * fold together get a suffix and every other address stays as it was.
 */

/** Kinds that only exist as types; their values-first order keeps a function or variable on the plain slug. */
const TYPE_KINDS: Readonly<Record<string, true>> = { interface: true, type: true };

/** An export as the slug rule reads it. */
export interface ApiPageExport {
  readonly name: string;
  readonly kind?: string;
}

/** A name in kebab case, as API page slugs and member anchors write it: `createGrid` is `create-grid`. */
export function apiAnchor(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Each export's page slug within one entry point. Throws when two exports
 * still share a slug after the kind suffix (the same name in two spellings of
 * one kind, three ways), so the docs build fails instead of one page
 * replacing the other.
 */
export function apiPageSlugs(exports: readonly ApiPageExport[]): ReadonlyMap<string, string> {
  const groups = new Map<string, ApiPageExport[]>();
  for (const item of exports) {
    const base = apiAnchor(item.name);
    const group = groups.get(base);
    if (group === undefined) groups.set(base, [item]);
    else group.push(item);
  }
  const slugs = new Map<string, string>();
  const owners = new Map<string, string>();
  for (const [base, group] of groups) {
    const ordered = [...group].sort(
      (left, right) =>
        Number(TYPE_KINDS[left.kind ?? ""] === true) -
          Number(TYPE_KINDS[right.kind ?? ""] === true) ||
        (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
    );
    for (const [index, item] of ordered.entries()) {
      const slug = index === 0 ? base : `${base}-${apiAnchor(item.kind ?? "symbol")}`;
      const owner = owners.get(slug);
      if (owner !== undefined) {
        throw new Error(
          `API pages of ${owner} and ${item.name} fold to the same path "${slug}"; rename one export`,
        );
      }
      owners.set(slug, item.name);
      slugs.set(item.name, slug);
    }
  }
  return slugs;
}
