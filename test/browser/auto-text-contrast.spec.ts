import { expect, screenshotPixels, test, waitForHydration } from "./fixtures.js";

// #706: in a dark theme, automatic text on an explicit light fill painted in the
// theme's light foreground. It must contrast with the cell's own fill instead.

/** The engine loads on the first run; a cold run can take a few seconds in CI. */
const RUN_TIMEOUT_MS = 30_000;
const ROW_HEADER_WIDTH = 48;
const HEADER_HEIGHT = 28;
const ROW_HEIGHT = 28;
const COLUMN_WIDTH = 160;
/** WCAG AA contrast for body text. */
const READABLE_CONTRAST = 4.5;

const EXAMPLE = `
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "200px";

const workbook: Workbook = {
  activeSheet: "s",
  sheets: [{
    id: "s",
    name: "S",
    rowCount: 3,
    columns: [
      { key: "a", header: "A", width: ${COLUMN_WIDTH}, type: "text" },
      { key: "b", header: "B", width: ${COLUMN_WIDTH}, type: "text" },
    ],
  }],
};

await initSheetwrite();
const grid = createGrid(host, {
  workbook,
  theme: {
    bg: "#0d1117",
    fg: "#e6edf3",
    headerBg: "#161b22",
    headerFg: "#e6edf3",
    gridLine: "#30363d",
    rowHeight: ${ROW_HEIGHT},
    headerHeight: ${HEADER_HEIGHT},
    rowHeaderWidth: ${ROW_HEADER_WIDTH},
  },
});
const text = (col: number, label: string, backgroundColor: string) => ({
  op: "set" as const,
  addr: { sheet: "s", row: 0, col },
  value: { kind: "literal" as const, value: label },
  style: { bold: true, backgroundColor },
});
grid.applyTransaction({
  patches: [text(0, "MMMMMMMM", "#e6f2ec"), text(1, "MMMMMMMM", "#0b3d2e")],
});
`;

function luminance([red, green, blue]: readonly number[]): number {
  const linear = (value = 0) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrast(first: number, second: number): number {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** The fill (most common pixel) and the text pixel that contrasts most with it. */
function fillAndText(rgba: Uint8ClampedArray): { fill: number; text: number } {
  const counts = new Map<number, number>();
  for (let offset = 0; offset + 3 < rgba.length; offset += 4) {
    const key =
      ((rgba[offset] ?? 0) << 16) | ((rgba[offset + 1] ?? 0) << 8) | (rgba[offset + 2] ?? 0);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let fillKey = 0;
  let fillCount = 0;
  for (const [key, count] of counts) {
    if (count > fillCount) [fillKey, fillCount] = [key, count];
  }
  const channels = (key: number) => [(key >> 16) & 255, (key >> 8) & 255, key & 255];
  const fill = luminance(channels(fillKey));
  let text = fill;
  for (const key of counts.keys()) {
    const candidate = luminance(channels(key));
    if (contrast(candidate, fill) > contrast(text, fill)) text = candidate;
  }
  return { fill, text };
}

test("automatic text contrasts with an explicit fill in a dark theme (#706)", async ({
  page,
}, testInfo) => {
  await page.goto("/docs/start/first-grid/");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Try it" }).first().click();
  const playground = page.getByRole("region", { name: "Complete first grid" });
  const status = playground.getByRole("status");
  await expect(status).toHaveText(/^Ran in \d+ ms/, { timeout: RUN_TIMEOUT_MS });
  await playground.getByRole("textbox", { name: "Code of Complete first grid" }).fill(EXAMPLE);
  await playground.getByRole("button", { name: "Run" }).click();
  await expect(status).toHaveText(/^Ran in \d+ ms/, { timeout: RUN_TIMEOUT_MS });

  const canvas = playground
    .frameLocator("iframe")
    .locator("#grid canvas.sheetwrite-canvas")
    .first();
  await expect(canvas).toBeAttached();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The grid canvas has no box");

  // Inset each cell rectangle so grid lines and the selection outline stay out.
  const cell = (col: number) => ({
    x: box.x + ROW_HEADER_WIDTH + col * COLUMN_WIDTH + 4,
    y: box.y + HEADER_HEIGHT + 4,
    width: COLUMN_WIDTH - 8,
    height: ROW_HEIGHT - 8,
  });
  await expect
    .poll(async () => {
      const { fill, text } = fillAndText(
        await screenshotPixels(page, await page.screenshot({ clip: cell(0) })),
      );
      return contrast(fill, text) >= READABLE_CONTRAST && text < fill;
    })
    .toBe(true);

  const screenshot = testInfo.outputPath("auto-text-contrast-dark.png");
  await page.screenshot({
    path: screenshot,
    clip: {
      x: box.x,
      y: box.y,
      width: ROW_HEADER_WIDTH + 2 * COLUMN_WIDTH,
      height: 3 * ROW_HEIGHT,
    },
  });
  await testInfo.attach("dark theme, light and dark fills", {
    path: screenshot,
    contentType: "image/png",
  });

  // A1: pale fill, dark text. B1: dark fill, light text.
  const light = fillAndText(await screenshotPixels(page, await page.screenshot({ clip: cell(0) })));
  expect(light.text).toBeLessThan(light.fill);
  expect(contrast(light.fill, light.text)).toBeGreaterThanOrEqual(READABLE_CONTRAST);
  const dark = fillAndText(await screenshotPixels(page, await page.screenshot({ clip: cell(1) })));
  expect(dark.text).toBeGreaterThan(dark.fill);
  expect(contrast(dark.fill, dark.text)).toBeGreaterThanOrEqual(READABLE_CONTRAST);
});
