/**
 * Base URL for links to a file in the repository. `develop` is the default
 * branch and the branch the docs are generated from; the repository has no
 * `main` branch.
 */
export const REPOSITORY_SOURCE_URL = "https://github.com/chh-ay/sheetwrite/blob/develop";

/** Link target for a repository-relative path such as `packages/core/src/a1.ts`. */
export function repositorySourceUrl(path: string): string {
  return `${REPOSITORY_SOURCE_URL}/${path}`;
}
