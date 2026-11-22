/** The version-free tarball file name a release consumer fixture installs a package from. */
export function versionFreeTarballName(packageName: string): string;

/**
 * Copies canonical tarballs to the version-free paths of a fixture lock's
 * Sheetwrite placeholders and fills those entries. Returns the installed names.
 */
export function installCanonicalTarballs(
  lockPath: string,
  tarballs: ReadonlyMap<string, string>,
): Promise<string[]>;
