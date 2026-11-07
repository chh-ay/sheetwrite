/**
 * Content pages the docs generator owns, relative to the docs content root
 * (`docs/src/content/docs`): whole directories and single pages. `.gitignore`
 * lists the same paths; the generator removes a page under an owned
 * directory once no source produces it, and `docs:check` reads owned pages
 * only from the generator, never from disk. A generated page has no source
 * file in the repository, so the site gives it no edit link.
 */
export const GENERATED_CONTENT_DIRECTORIES = [
  "api",
  "performance",
  "reference/formula-functions",
] as const;
export const GENERATED_CONTENT_PAGES = [
  "reference/compatibility-results.md",
  "reference/excel-function-coverage.md",
  "reference/formula-functions.md",
  "reference/moved-guides.md",
  "reference/package-entry-points.md",
] as const;

/** Whether the generator owns the page at `path`, relative to the content root with `/` separators. */
export function isGeneratedContentPath(path: string): boolean {
  return (
    GENERATED_CONTENT_PAGES.some((page) => path === page) ||
    GENERATED_CONTENT_DIRECTORIES.some((directory) => path.startsWith(`${directory}/`))
  );
}

/** The parts of an mdast tree this step reads. */
interface FrontmatterTree {
  readonly children: Array<{ type: string; value?: string }>;
}

/**
 * Marks each generated page under `contentRoot` with `generated: true` in its
 * frontmatter, so the site gives it no edit link: it has no source file in
 * the repository. Authored pages carry nothing extra.
 */
export function markGeneratedPages(options: { readonly contentRoot: string }) {
  return (tree: FrontmatterTree, file: { readonly path?: string }): void => {
    const path = file.path ?? "";
    const yaml = tree.children.find((node) => node.type === "yaml");
    if (!path.startsWith(options.contentRoot) || yaml === undefined) return;
    if (!isGeneratedContentPath(path.slice(options.contentRoot.length))) return;
    yaml.value = `${yaml.value ?? ""}\ngenerated: true`;
  };
}
