import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { expectedLlmsFiles, LLMS_FULL_PATH } from "./docs-llms.js";

/** The full-text endpoint built from the given docs pages, keyed by content path. */
async function full_text(pages: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-llms-"));
  try {
    for (const [path, content] of Object.entries(pages)) {
      const file = join(root, "docs/src/content/docs", path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    const files = await expectedLlmsFiles({ formatVersion: 2, packages: [] }, root, []);
    const full = files.find((file) => file.path === join(root, LLMS_FULL_PATH));
    if (full === undefined) throw new Error("Full-text endpoint is missing");
    return full.content;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const page = (title: string, ...body: string[]) =>
  ["---", `title: ${title}`, "---", ...body].join("\n");

describe("llms full text", () => {
  it("formats prose tokens and keeps code, blank lines included, verbatim", async () => {
    const example = '<sw-format value="0.25" code="0%"></sw-format>';
    const code = ["const text = `first", "", "", "last`;"].join("\n");
    const content = await full_text({
      "index.md": page(
        "Format examples",
        `Result: ${example}.`,
        "",
        "~~~html",
        example,
        "~~~",
        "",
        `\`\`\`ts compile\n${code}\n\`\`\``,
      ),
    });

    expect(content).toContain("Result: 25%.");
    expect(content).toContain(`~~~html\n${example}\n~~~`);
    // The compile flag is site tooling, not part of the example.
    expect(content).toContain(`\`\`\`ts\n${code}\n\`\`\``);
  });

  it("gives repeated guide titles their own anchors", async () => {
    const content = await full_text({
      "guides/first.md": page("Same title", "First."),
      "guides/second.md": page("Same title", "Second."),
    });

    const links = [...content.matchAll(/^- \[Same title\]\(#([^)]+)\)$/gm)].map(
      (match) => match[1],
    );
    expect(new Set(links).size).toBe(2);
    for (const anchor of links) expect(content).toContain(`<a id="${anchor}"></a>`);
  });
});
