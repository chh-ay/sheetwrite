import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
  formulaFamilyNavigation,
  loadFormulaContractInventory,
  loadFormulaReferenceEntries,
  syntaxLiterals,
  renderFormulaFunctionPages,
} from "../../scripts/formula-docs.ts";
import { FORMULA_FAMILY_CARDS, UNSUPPORTED_FORMULA_GROUPS } from "../src/lib/formula-overview.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");

type FormulaInventory = {
  functions: Array<{ canonical: string; family: string; builds: string[] }>;
  unsupportedCategories: Array<{ id: string; examples: string[] }>;
};

async function generated() {
  const inventory = (await loadFormulaContractInventory(REPO_ROOT)) as FormulaInventory;
  const pages = renderFormulaFunctionPages(inventory, await loadFormulaReferenceEntries(REPO_ROOT));
  const overview = pages.find((page) => page.route === "reference/formula-functions.md");
  if (overview === undefined) throw new Error("no overview page");
  const families = pages.filter((page) => page !== overview);
  return { inventory, overview, families };
}

describe("generated formula documentation contract", () => {
  it("publishes every function on exactly one family page, with every same-page link resolving", async () => {
    const { inventory, families, overview } = await generated();
    for (const formula of inventory.functions) {
      const holders = families.filter((page) =>
        page.table?.html.includes(`<span class="sw-code-function">${formula.canonical}</span>`),
      );
      expect(holders.map((page) => page.route)).toHaveLength(1);
    }
    for (const page of families) {
      // The table links its Excel differences, which the page lists.
      expect(page.content).toContain(`\n<FormulaReference family="${page.table?.family}">\n`);
      const ids = new Set([...page.content.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
      for (const [, target] of `${page.content}${page.table?.html}`.matchAll(/ href="#([^"]+)"/g)) {
        expect(ids.has(target)).toBeTrue();
      }
    }
    expect(formulaFamilyNavigation([overview, ...families]).map((entry) => entry.href)).toEqual(
      families.map((page) => `/docs/${page.route.replace(/\.md$/, "/")}`),
    );
  });

  it("shows each function's syntax and purpose, a Full build badge, and no internal contract", async () => {
    const { inventory, families } = await generated();
    for (const page of families) {
      const html = page.table?.html ?? "";
      expect(html).toContain("<th>Function and syntax</th><th>What it does</th></tr>");
      expect(html).not.toMatch(/Contract|Engine<\/th>|incumbent|required target|Default \+ full/u);
      expect(page.content).not.toMatch(/Signature:|Semantics:|Dialect:|Implementation:/u);
    }
    const tables = families.map((page) => page.table?.html ?? "").join("");
    for (const formula of inventory.functions) {
      const row =
        new RegExp(
          `<tr id="fn-[^"]+" data-formula-name="${formula.canonical.replaceAll(".", "\\.")}[ "].*?</tr>`,
          "u",
        ).exec(tables)?.[0] ?? "";
      expect(row.includes("Full build")).toBe(!formula.builds.includes("@sheetwrite/wasm"));
    }
  });

  it("keeps each argument of a syntax line together and marks the optional ones", async () => {
    const { families } = await generated();
    const math = families.find((page) => page.table?.family === "math")?.table?.html ?? "";
    expect(math).toContain(
      '<span class="sw-code-function">SUM</span>(<span class="sw-formula-arg"><var>number1</var></span>, <span class="sw-formula-arg" data-optional>[<var>number2</var>]</span>, <span class="sw-formula-arg" data-optional>…</span>)',
    );
  });

  it("gives every family a card with its count, its common functions and a link to all of them", async () => {
    const { inventory, overview } = await generated();
    for (const [family, card] of Object.entries(FORMULA_FAMILY_CARDS)) {
      const members = inventory.functions.filter((formula) => formula.family === family);
      const href = `/docs/reference/formula-functions/${family}/`;
      expect(overview.content).toContain(
        `<p class="sw-function-family__count">${members.length} functions · `,
      );
      expect(overview.content).toContain(
        `<a class="sw-function-family__more" href="${href}">See all ${members.length}`,
      );
      for (const name of card.common) {
        expect(overview.content).toContain(
          `<a href="${href}#fn-${name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}">${name}</a>`,
        );
      }
    }
    expect(overview.content).toContain("142 functions · 34 in the default build");
  });

  it("indexes every function from A to Z, each linking to its row on its family page", async () => {
    const { inventory, overview, families } = await generated();
    const index = overview.table?.html ?? "";
    expect(overview.table?.family).toBe("index");
    expect(overview.content).toContain('\n<FormulaReference family="index">\n');
    const links = [
      ...index.matchAll(
        /<li data-formula-name="[^"]*" data-engine="(default|full)"><a href="([^"]+)">([^<]+)<\/a>/gu,
      ),
    ];
    expect(links.map((match) => match[3])).toEqual(
      inventory.functions
        .map((formula) => formula.canonical)
        .sort((left, right) => left.localeCompare(right)),
    );
    for (const [, engine, href = "", name] of links) {
      const [route, id] = href.split("#");
      const page = families.find((entry) => `/docs/${entry.route.replace(/\.md$/, "/")}` === route);
      expect(page?.table?.html).toContain(`<tr id="${id}" data-formula-name="${name}`);
      const formula = inventory.functions.find((entry) => entry.canonical === name);
      expect(engine).toBe(formula?.builds.includes("@sheetwrite/wasm") ? "default" : "full");
    }
  });

  it("lists unsupported functions in plain words, without internal ids or script paths", async () => {
    const { inventory, overview } = await generated();
    const section = overview.content.split("## Unsupported functions")[1] ?? "";
    expect(section).not.toMatch(/Evidence|scripts\/|\| Scope \||`volatile`|\(`[a-z-]+`\)/u);
    for (const category of inventory.unsupportedCategories) {
      const group = UNSUPPORTED_FORMULA_GROUPS[category.id];
      expect(group).toBeDefined();
      expect(section).toContain(`<p class="sw-unsupported__name">${group?.name}</p>`);
      expect(section).toContain(`The cell shows <code>${group?.shows}</code>`);
      expect(section).toContain(`href="${group?.see.href}">${group?.see.label}</a>`);
    }
  });

  it("accepts argument names and rejects example values in a syntax line", () => {
    expect(syntaxLiterals("range, criteria, [sum_range]")).toEqual([]);
    expect(syntaxLiterals("known_y's, [known_x's], [const]")).toEqual([]);
    expect(syntaxLiterals("probability, alpha, beta, [A], [B]")).toEqual([]);
    expect(syntaxLiterals("rows, cols, lambda(row, col)")).toEqual([]);
    expect(syntaxLiterals("number1, [number2], …")).toEqual([]);
    expect(syntaxLiterals("25, A1:A3, 0")).toEqual(["25", "A1:A3", "0"]);
    expect(syntaxLiterals('B2:B25, ">5"')).toEqual(["B2:B25", '">5"']);
    expect(syntaxLiterals("Where do you want to look?")).toEqual(["Where do you want to look?"]);
    expect(syntaxLiterals("array1, lambda_or_array<#>")).toEqual(["lambda_or_array<#>"]);
  });
});
