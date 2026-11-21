import { chromium } from "/Users/chhay/learn/sheetwrite/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://127.0.0.1:4870/");
await p.waitForTimeout(800);
await p.focus(".sw-header__menu");
const ax = async () => p.evaluate(() => { const a = document.activeElement; return `${a.tagName} ${a.textContent.trim().slice(0, 20)} in-menu=${!!a.closest("#site-nav")}`; });
await p.keyboard.press("Enter"); await p.waitForTimeout(200);
console.log("after Enter:", await ax(), "open=", await p.evaluate(() => document.querySelector("#site-nav").matches(":popover-open")));
const snap = await p.locator(".sw-header__menu").ariaSnapshot();
console.log("toggle aria:", snap);
for (let i = 0; i < 5; i++) { await p.keyboard.press("Tab"); console.log(" Tab", i + 1, await ax()); }
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
console.log("after Escape:", await ax(), "open=", await p.evaluate(() => document.querySelector("#site-nav").matches(":popover-open")));
await b.close();
