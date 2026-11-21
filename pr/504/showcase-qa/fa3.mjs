import { session, BASE } from "./lib.mjs";
const [bName] = process.argv.slice(2);
const { page, step, done } = await session("fa3", bName, "1440");
const ghost = page.locator(".sheetwrite-formula-ghost");
const g = async () => JSON.stringify(await ghost.allInnerTexts());
await step("open", async () => { await page.goto(BASE + "/showcases/formula-assist/"); await page.getByRole("button", { name: "March's total" }).scrollIntoViewIfNeeded(); await page.waitForFunction(() => !document.querySelector(".sw-showcase__controls button")?.disabled, null, { timeout: 30000 }); await page.waitForTimeout(3000); });
await step("= wait, then S U", async (note) => {
  await page.getByRole("button", { name: "March's total" }).click(); await page.keyboard.type("="); await page.waitForTimeout(1500); note(`'=' ${await g()}`);
  await page.keyboard.type("S"); await page.waitForTimeout(800); note(`'=S' ${await g()}`);
  await page.keyboard.type("U"); await page.waitForTimeout(800); note(`'=SU' ${await g()}`);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
});
await step("=S typed at once, wait 3 s", async (note) => {
  await page.getByRole("button", { name: "March's total" }).click(); await page.keyboard.type("=S"); await page.waitForTimeout(3000); note(`'=S' ${await g()}`);
  await page.keyboard.type("UM("); await page.waitForTimeout(1500); note(`'=SUM(' ${await g()}`);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
});
await done();
