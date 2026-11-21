// drive.mjs <port> <browser...>: every case at DPR 1 and 2; prints one JSON line per case.
import { chromium, firefox } from "/home/vvin/checkouts/pd-blitproof/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
const [port, ...browsers] = process.argv.slice(2);
const CASES = (process.env.CASES ?? "plain,frozen,merge,overflow,selection,wrap,cf,borders").split(",");
const STEPS = [7, 20, 60, 61, 1500, 1000, 997, 400, 400.5, 401, 0];
for (const name of browsers) {
  const browser = await (name === "firefox" ? firefox : chromium).launch();
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: dpr, ...(name === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {}) });
    for (const kase of CASES) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForFunction(() => window.ready === true);
      const steps = await page.evaluate(([k, s]) => window.prove(k === "cut" ? "selection" : k, s, k === "cut"), [kase, STEPS]);
      const differing = steps.reduce((sum, step) => sum + step.differing, 0);
      const blits = steps.reduce((sum, step) => sum + step.blits, 0);
      console.log(JSON.stringify({ browser: name, dpr, case: kase, differing, blits, steps, errors }));
      await page.close();
    }
    await context.close();
  }
  await browser.close();
}
