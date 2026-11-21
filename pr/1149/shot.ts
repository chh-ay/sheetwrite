// shot.ts <label>: the docs Report sheet in the 720 px screenshot stage. Click A3, press → six
// times to G3, then save 2x and 1x captures of the stage and check that the frame the arrows
// left matches a full repaint. Run from docs/ (vite is the docs' own).
import { createServer } from "/home/vvin/checkouts/pd-snap/docs/node_modules/vite/dist/node/index.js";
import { chromium } from "/home/vvin/checkouts/pd-snap/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";

const [label = "after"] = process.argv.slice(2);
const ROOT = "/home/vvin/checkouts/pd-snap";
const OUT = "/home/vvin/learn/perfdeep/snap/out";
const server = await createServer({
  configFile: false,
  root: `${ROOT}/docs/src/figures`,
  cacheDir: `/home/vvin/learn/perfdeep/snap/vite-${label}`,
  logLevel: "warn",
  server: { port: 0, host: "127.0.0.1", fs: { allow: [ROOT] } },
});
await server.listen();
const address = server.httpServer?.address();
if (address === null || typeof address !== "object" || address === undefined) throw new Error("no stage");
const browser = await chromium.launch();
try {
  for (const dpr of [2, 1]) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: dpr });
    await page.goto(`http://127.0.0.1:${address.port}/?sheet=report&width=720&height=480&ribbon=compact`);
    await page.waitForSelector("html[data-figure-ready]", { state: "attached", timeout: 60_000 });
    const viewport = page.locator(".sheetwrite-viewport").first();
    const box = await viewport.boundingBox();
    if (!box) throw new Error("no grid viewport");
    // A3: the row header is 48 px wide; rows 1 and 2 are 44 and 28 px under a 32 px header.
    await page.mouse.click(box.x + 48 + 30, box.y + 32 + 44 + 28 + 20);
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press("ArrowRight");
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const grid = (window as unknown as { __sheetwriteFigureGrid: { getSelection(): unknown } }).__sheetwriteFigureGrid;
      const scroller = document.querySelector(".sheetwrite-scroller");
      return { selection: grid.getSelection(), scrollLeft: scroller?.scrollLeft, scrollTop: scroller?.scrollTop };
    });
    const stage = page.locator("#stage");
    const arrowed = await stage.screenshot({ path: `${OUT}/${label}-g3-${dpr}x.png` });
    // A full repaint of the same position: a theme change redraws every pixel.
    await page.evaluate(() => (window as unknown as { __sheetwriteFigureGrid: { setTheme(t: object): void } }).__sheetwriteFigureGrid.setTheme({}));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(300);
    const repainted = await stage.screenshot({ path: `${OUT}/${label}-g3-${dpr}x-repaint.png` });
    console.log(JSON.stringify({ label, dpr, ...state, matchesFullRepaint: arrowed.equals(repainted) }));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
