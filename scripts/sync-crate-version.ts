import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Changesets versions all engine packages together but only edits package.json.
 * Copy that fixed version into each Rust manifest and lockfile after versioning.
 */
const root = resolve(import.meta.dir, "..");
const crate = resolve(root, "packages/wasm");

/** Keep every Rust crate on the fixed version of the published engine packages. */
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
  await replaceVersion(
    resolve(crate, "history/Cargo.toml"),
    /(\[package\]\nname = "sheetwrite-history"\nversion = ")[^"]+"/,
    version,
  );
  await replaceVersion(
    resolve(crate, "history/Cargo.lock"),
    /(name = "sheetwrite-history"\nversion = ")[^"]+"/,
    version,
  );
  await replaceVersion(
    resolve(root, "packages/queries/engine/Cargo.toml"),
    /(\[package\]\nname = "sheetwrite-queries"\nversion = ")[^"]+"/,
    version,
  );
  await replaceVersion(
    resolve(root, "packages/queries/engine/Cargo.lock"),
    /(name = "sheetwrite-queries"\nversion = ")[^"]+"/,
    version,
  );
  return version;
}

async function replaceVersion(path: string, pattern: RegExp, version: string): Promise<void> {
  const source = await readFile(path, "utf8");
  if (!pattern.test(source)) throw new Error(`${path} has no crate version`);
  await writeFile(path, source.replace(pattern, `$1${version}"`));
}

if (import.meta.main) {
  process.stdout.write(`Rust crate version: ${await syncCrateVersion()}\n`);
}
