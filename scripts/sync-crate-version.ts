import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * The `sheetwrite-wasm` crate builds both `@sheetwrite/wasm` and
 * `@sheetwrite/formulas`, which Changesets versions together. Changesets only
 * edits package.json, so this copies that version into the crate manifest and
 * its lockfile entry. Run after `changeset version`.
 */
const root = resolve(import.meta.dir, "..");
const crate = resolve(root, "packages/wasm");

export async function syncCrateVersion(): Promise<string> {
  const { version } = JSON.parse(await readFile(resolve(crate, "package.json"), "utf8")) as {
    version: string;
  };
  await replaceVersion(
    resolve(crate, "Cargo.toml"),
    /(\[package\]\nname = "sheetwrite-wasm"\nversion = ")[^"]+"/,
    version,
  );
  await replaceVersion(
    resolve(crate, "Cargo.lock"),
    /(name = "sheetwrite-wasm"\nversion = ")[^"]+"/,
    version,
  );
  return version;
}

async function replaceVersion(path: string, pattern: RegExp, version: string): Promise<void> {
  const source = await readFile(path, "utf8");
  if (!pattern.test(source)) throw new Error(`${path} has no sheetwrite-wasm version`);
  await writeFile(path, source.replace(pattern, `$1${version}"`));
}

if (import.meta.main) {
  console.log(`sheetwrite-wasm crate version: ${await syncCrateVersion()}`);
}
