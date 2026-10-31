/** The manifest fields that can name a file a consumer loads. */
export interface PackageTargetFields {
  readonly exports?: unknown;
  readonly types?: unknown;
  readonly main?: unknown;
  readonly module?: unknown;
  readonly browser?: unknown;
  readonly svelte?: unknown;
}

/**
 * Every package-relative file that a manifest names as an entry: export
 * targets at any depth (objects and fallback arrays), and the top-level
 * `types`, `main`, `module`, `browser` and `svelte` fields. Paths have no
 * leading `./` and each appears once. Each check applies its own file rule to
 * the result.
 */
export function packageTargets(manifest: PackageTargetFields): string[] {
  const targets = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.startsWith("./")) targets.add(value.slice(2));
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const item of Object.values(value)) visit(item);
    }
  };

  visit(manifest.exports);
  for (const field of ["types", "main", "module", "browser", "svelte"] as const) {
    const value = manifest[field];
    if (typeof value === "string") targets.add(value.replace(/^\.\//, ""));
    else if (field === "browser") visit(value);
  }
  return [...targets];
}
