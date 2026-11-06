/**
 * The page head's two links. They are built from what the page already
 * holds (its title, its route and its source path), so no page carries them
 * as data. This module has no imports, so the page code gains only these lines.
 */

const REPOSITORY_URL = "https://github.com/chh-ay/sheetwrite";
const SITE_URL = "https://www.sheetwrite.dev";

/** GitHub's editor for a repository path, on `develop`, the branch the docs are built from. */
export function editUrl(sourcePath: string): string {
  return `${REPOSITORY_URL}/edit/develop/${sourcePath}`;
}

/**
 * A new issue in the repository's documentation form, with the page's title
 * and address in its Pages field. The form adds the `documentation`,
 * `area:docs` and `needs-triage` labels that `docs/agents/issue-format.md`
 * gives a documentation issue.
 */
export function reportProblemUrl(title: string, route: string): string {
  return `${REPOSITORY_URL}/issues/new?template=documentation.yml&pages=${encodeURIComponent(`${title}: ${SITE_URL}${route}`)}`;
}
