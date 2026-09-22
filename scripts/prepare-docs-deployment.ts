import { copyFile, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const requiredFiles = [
  "index.html",
  "docs/index.html",
  "sitemap.xml",
  "pagefind/pagefind-entry.json",
];

async function requireDirectory(path: string): Promise<void> {
  if (!(await lstat(path)).isDirectory()) {
    throw new Error(`Expected a real directory, not a symlink or special file: ${path}`);
  }
}

async function collectFiles(sourceRoot: string, directory = ""): Promise<Map<string, number>> {
  const files = new Map<string, number>();
  for (const entry of await readdir(join(sourceRoot, directory))) {
    const relativePath = directory ? `${directory}/${entry}` : entry;
    const sourcePath = join(sourceRoot, relativePath);
    const stats = await lstat(sourcePath);
    if (stats.isDirectory()) {
      for (const [path, size] of await collectFiles(sourceRoot, relativePath)) {
        files.set(path, size);
      }
    } else if (stats.isFile()) {
      files.set(relativePath, stats.size);
    } else {
      throw new Error(`Cannot package a symlink or special file: ${sourcePath}`);
    }
  }
  return files;
}

export async function prepareDocsDeployment(root = repositoryRoot): Promise<void> {
  const sourceRoot = join(root, "docs/dist/client");
  for (const directory of ["docs", "docs/dist", "docs/dist/client"]) {
    await requireDirectory(join(root, directory));
  }
  const files = await collectFiles(sourceRoot);
  for (const required of requiredFiles) {
    if (!files.has(required) || files.get(required) === 0) {
      throw new Error(`Docs build is incomplete: missing or empty ${join(sourceRoot, required)}`);
    }
  }

  const vercelRoot = join(root, ".vercel");
  await mkdir(vercelRoot, { recursive: true });
  await requireDirectory(vercelRoot);
  const outputRoot = join(vercelRoot, "output");
  // Validate the complete source before discarding the previous deployment.
  await rm(outputRoot, { recursive: true, force: true });
  const staticRoot = join(outputRoot, "static");
  await mkdir(staticRoot, { recursive: true });
  for (const path of files.keys()) {
    const destination = join(staticRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(sourceRoot, path), destination);
  }
  await writeFile(
    join(outputRoot, "config.json"),
    `${JSON.stringify(
      {
        version: 3,
        routes: [
          { src: "^/$", dest: "/index.html" },
          { handle: "filesystem" },
          { src: "^/(.+?)/?$", dest: "/$1/index.html" },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

if (import.meta.main) {
  await prepareDocsDeployment();
}
