// drive.mjs <port> <browser...>: every case, light and dark, at DPR 1, 1.25, 1.5 and 2; one JSON line each; crops to out/crops.
import { chromium, firefox } from "/home/vvin/checkouts/pd-blitproof/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
import fs from "node:fs";
const [port, ...browsers] = process.argv.slice(2);
const CASES = (process.env.CASES ?? "plain,frozen,merge,overflow,wrap,cf,borders").split(",");
fs.mkdirSync("/home/vvin/learn/perfdeep/rest/out/crops", { recursive: true });
for (const name of browsers) {
  const browser = await (name === "firefox" ? firefox : chromium).launch();
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: dpr });
    for (const dark of [false, true]) for (const kase of CASES) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForFunction(() => window.ready === true);
      const canvases = await page.evaluate(([k, d]) => window.compare(k, d), [kase, dark]);
      for (const c of canvases) if (c.crop) { const file = `/home/vvin/learn/perfdeep/rest/out/crops/${name}-${dpr}-${dark ? "dark" : "light"}-${kase}-${c.canvas}.png`; fs.writeFileSync(file, Buffer.from(c.crop.split(",")[1], "base64")); c.crop = file; }
      console.log(JSON.stringify({ browser: name, dpr, theme: dark ? "dark" : "light", case: kase, differing: canvases.reduce((s, c) => s + (c.differing ?? 0), 0), canvases, errors }));
      await page.close();
    }
    await context.close();
  }
  await browser.close();
}
