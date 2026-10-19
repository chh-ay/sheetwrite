import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("package minification keeps module behavior, names, and declarations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sheetwrite-minify-"));
  try {
    await mkdir(join(directory, "nested"));
    const source = `// Generated implementation documentation.
import "./effect.js";
import { value } from "./nested/value.js";
export class PublicClass {
  read() {
    return value;
  }
}
export function publicFunction() {
  return new PublicClass().read();
}
export const importValue = () => import("./nested/value.js");
`;
    const declarations = "/** Public documentation. */\nexport declare class PublicClass {}\n";
    await writeFile(join(directory, "success.js"), source.replace('import "./effect.js";', ""));
    await writeFile(join(directory, "index.js"), source);
    await writeFile(join(directory, "index.d.ts"), declarations);
    await writeFile(join(directory, "effect.js"), 'throw new Error("side effect retained");\n');
    await writeFile(join(directory, "nested/value.js"), "export const value = 42;\n");

    const result = Bun.spawnSync([
      process.execPath,
      join(import.meta.dir, "minify-package.ts"),
      directory,
    ]);
    expect(result.exitCode).toBe(0);
    expect((await readFile(join(directory, "index.js"))).byteLength).toBeLessThan(
      Buffer.byteLength(source),
    );
    expect(await readFile(join(directory, "index.d.ts"), "utf8")).toBe(declarations);
    const moduleUrl = pathToFileURL(join(directory, "index.js")).href;
    await expect(import(moduleUrl)).rejects.toThrow("side effect retained");

    // These paths are temporary fixture modules, not author-time dependencies.
    const module = await import(pathToFileURL(join(directory, "success.js")).href);
    expect(module.PublicClass.name).toBe("PublicClass");
    expect(module.publicFunction.name).toBe("publicFunction");
    expect(module.publicFunction()).toBe(42);
    expect((await module.importValue()).value).toBe(42);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
