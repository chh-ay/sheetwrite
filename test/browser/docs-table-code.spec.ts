import { builtPagesMatching } from "./built-pages.js";
import { expect, siteUrl, test } from "./fixtures.js";

// Every docs table (the Markdown tables' frame), at a desktop, a tablet and a
// phone width: inline code in a cell breaks over lines only at a space or
// between the words of a name, where the build puts a <wbr>, never inside a
// word ("…StorageErro" / "r"); and on a phone no table of three columns or
// fewer scrolls sideways.

const WIDTHS = [1440, 834, 390] as const;
/** The widest table that must fit a phone without scrolling. */
const PHONE_COLUMNS = 3;

/** Each break inside a word of a table's inline code, and each table of `max_columns` or fewer that scrolls. */
function table_defects(max_columns: number): string[] {
  const found: string[] = [];
  const range = document.createRange();
  for (const code of document.querySelectorAll<HTMLElement>(".sw-table-frame :not(pre) > code")) {
    if (code.getClientRects().length < 2) continue;
    // A <wbr> splits the text, so a break at the start of a text node is between words.
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let previous: { top: number; char: string; node: Node } | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (let index = 0; index < text.length; index++) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getClientRects()[0];
        if (rect === undefined) continue;
        const char = text[index] ?? "";
        const broke = previous !== undefined && rect.top > previous.top + rect.height / 2;
        const between_words = previous?.node !== node && index === 0;
        if (broke && !between_words && !/\s/.test(char) && !/\s/.test(previous?.char ?? " ")) {
          found.push(`"${code.textContent}" breaks inside a word, before "${text.slice(index)}"`);
        }
        previous = { top: rect.top, char, node };
      }
    }
  }
  for (const frame of document.querySelectorAll<HTMLElement>(".sw-table-frame")) {
    const columns = frame.querySelector("tr")?.children.length ?? 0;
    const overflow = frame.scrollWidth - frame.clientWidth;
    if (frame.clientWidth > 0 && columns <= max_columns && overflow > 1) {
      const head = frame.querySelector("tr")?.textContent?.trim().replace(/\s+/g, " ");
      found.push(`the ${columns}-column table "${head}" scrolls ${overflow} px sideways`);
    }
  }
  return found;
}

for (const width of WIDTHS) {
  test(`table code breaks only between words, and narrow tables fit, at ${width} px @portability`, async ({
    browser,
  }) => {
    test.setTimeout(10 * 60_000);
    const context = await browser.newContext({
      baseURL: siteUrl(),
      viewport: { width, height: 900 },
    });
    const found: string[] = [];
    for (const path of builtPagesMatching(/sw-table-frame/)) {
      const page = await context.newPage();
      await page.goto(path, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const defects = await page.evaluate(table_defects, width <= 390 ? PHONE_COLUMNS : 0);
      for (const defect of defects) found.push(`${path}: ${defect}`);
      await page.close();
    }
    await context.close();
    expect(found).toEqual([]);
  });
}
