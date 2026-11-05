import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { verifyReleaseArtifacts } from "./release-artifacts.js";
import { ENGINE_LOADER_FILES } from "./wasm-factory.js";

const COPIED_LOADERS: readonly string[] = ENGINE_LOADER_FILES;

/** Build output directories that the canonical tarballs carry. */
const GENERATED_DIRECTORIES = ["dist", "pkg", "pkg-history"] as const;

const artifactRoot = resolve(process.argv[2] ?? "test-results/release-artifacts");
const repositoryRoot = resolve(import.meta.dir, "..");
const manifest = await verifyReleaseArtifacts(artifactRoot);
let hydrated = 0;

for (const artifact of manifest.packages) {
  const directory = artifact.name.slice("@sheetwrite/".length);
  const packageRoot = join(repositoryRoot, "packages", directory);
  // Engine packages other than `@sheetwrite/wasm` get their loaders copied at build time.
  const generatedFiles = artifact.files.filter(
    (file) =>
      GENERATED_DIRECTORIES.some((root) => file === root || file.startsWith(`${root}/`)) ||
      (directory !== "wasm" && COPIED_LOADERS.includes(file)),
  );
  if (generatedFiles.length === 0) continue;
  for (const root of GENERATED_DIRECTORIES) {
    await rm(join(packageRoot, root), { recursive: true, force: true });
  }
  await mkdir(packageRoot, { recursive: true });
  const child = Bun.spawn(
    [
      "tar",
      "-xzf",
      join(artifactRoot, artifact.path),
      "-C",
      packageRoot,
      "--strip-components=1",
      ...generatedFiles.map((file) => `package/${file}`),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (exitCode !== 0) throw new Error(`Could not hydrate ${artifact.name}: ${stderr}`);
  hydrated += 1;
}

console.log(`Hydrated generated outputs from ${hydrated} canonical tarballs`);
