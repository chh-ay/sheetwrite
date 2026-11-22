import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { verifyReleaseArtifacts } from "./release-artifacts.js";
import { ENGINE_LOADER_FILES } from "./wasm-factory.js";

const COPIED_LOADERS: readonly string[] = ENGINE_LOADER_FILES;

/** Build output directories that the canonical tarballs carry. */
const GENERATED_DIRECTORIES = ["dist", "pkg", "pkg-history"] as const;

const artifact_root = resolve(process.argv[2] ?? "test-results/release-artifacts");
const repository_root = resolve(import.meta.dir, "..");
const manifest = await verifyReleaseArtifacts(artifact_root);
let hydrated = 0;

for (const artifact of manifest.packages) {
  const directory = artifact.name.slice("@sheetwrite/".length);
  const package_root = join(repository_root, "packages", directory);
  // Engine packages other than `@sheetwrite/wasm` get their loaders copied at build time.
  const generated_files = artifact.files.filter(
    (file) =>
      GENERATED_DIRECTORIES.some((root) => file === root || file.startsWith(`${root}/`)) ||
      (directory !== "wasm" && COPIED_LOADERS.includes(file)),
  );
  if (generated_files.length === 0) continue;
  for (const root of GENERATED_DIRECTORIES) {
    await rm(join(package_root, root), { recursive: true, force: true });
  }
  await mkdir(package_root, { recursive: true });
  const child = Bun.spawn(
    [
      "tar",
      "-xzf",
      join(artifact_root, artifact.path),
      "-C",
      package_root,
      "--strip-components=1",
      ...generated_files.map((file) => `package/${file}`),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stderr, exit_code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (exit_code !== 0) throw new Error(`Could not hydrate ${artifact.name}: ${stderr}`);
  hydrated += 1;
}

console.log(`Hydrated generated outputs from ${hydrated} canonical tarballs`);
