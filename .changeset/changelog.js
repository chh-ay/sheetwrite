import github from "@changesets/changelog-github";

/**
 * `@changesets/changelog-github`, with one short line for dependency updates.
 * All published packages move together in one fixed group, and each change is
 * listed under the package it changed, so a dependent package lists only the
 * new dependency versions, not the commit of every changeset.
 *
 * @type {typeof import("@changesets/changelog-github").default}
 */
export default {
  getReleaseLine: github.getReleaseLine,
  getDependencyReleaseLine: async (_changesets, dependenciesUpdated) =>
    dependenciesUpdated.length === 0
      ? ""
      : `- Updated dependencies: ${dependenciesUpdated
          .map((dependency) => `${dependency.name}@${dependency.newVersion}`)
          .join(", ")}`,
};
