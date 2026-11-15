import { readFile } from "node:fs/promises";

/**
 * Fail unless the built stylesheets mask the command icons with an emitted
 * copy of core's icon sheet: icons.css points at `./icons.svg`, and the
 * bundler must rewrite that URL to a file it wrote next to the build.
 *
 * `stylesheets` are `{ path, text }`; `resolveUrl(url, stylesheetPath)`
 * returns the emitted file a browser would fetch for `url`.
 */
export async function assertIconSheetEmitted({ bundler, stylesheets, resolveUrl, packagedSheet }) {
  const expected = await readFile(packagedSheet);
  const references = stylesheets.flatMap(({ path, text }) =>
    text.includes(".sheetwrite-icon")
      ? [...text.matchAll(/url\(\s*["']?([^"')]+\.svg)["']?\s*\)/g)].map((match) => ({
          url: match[1],
          path,
        }))
      : [],
  );
  if (references.length === 0) {
    throw new Error(`${bundler} stylesheets reference no icon sheet file`);
  }
  for (const { url, path } of references) {
    const file = resolveUrl(url, path);
    const emitted = await readFile(file).catch((error) => {
      throw new Error(`${bundler} icon sheet ${url} does not resolve to an emitted file`, {
        cause: error,
      });
    });
    if (!emitted.equals(expected)) {
      throw new Error(`${bundler} emitted ${url}, which is not core's styles/icons.svg`);
    }
  }
}
