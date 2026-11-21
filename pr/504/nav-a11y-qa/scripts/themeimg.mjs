import { chromium } from "/Users/chhay/learn/sheetwrite/node_modules/.bun/playwright@1.63.0/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
const base = "http://127.0.0.1:4870";
const paths = readFileSync("paths.txt", "utf8").split("\n").filter((p) => p && !p.startsWith("/docs/api/"));
const b = await chromium.launch();
const out = {};
for (const theme of ["dark", "light"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem("sheetwrite-theme", t), theme);
  const p = await ctx.newPage();
  for (const path of paths) {
    await p.goto(base + path, { waitUntil: "load" });
    const imgs = await p.evaluate(async () => {
      const res = [];
      for (const img of document.querySelectorAll("main img")) {
        if (!img.complete) await new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 3000); });
        if (!img.naturalWidth || img.getClientRects().length === 0) continue;
        const c = document.createElement("canvas"); c.width = 64; c.height = 64;
        const g = c.getContext("2d"); g.drawImage(img, 0, 0, 64, 64);
        let sum = 0; const d = g.getImageData(0, 0, 64, 64).data;
        for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        res.push({ src: img.currentSrc.replace(location.origin, ""), lum: Math.round((sum / 4096) * 100) / 100, alt: img.alt.slice(0, 50) });
      }
      return res;
    });
    for (const i of imgs) (out[i.src.split("?")[0]] ??= { pages: new Set(), lum: {} }), out[i.src.split("?")[0]].pages.add(path), (out[i.src.split("?")[0]].lum[theme] = i.lum);
  }
  await ctx.close();
}
const rows = Object.entries(out).map(([src, v]) => ({ src, pages: [...v.pages].slice(0, 2), dark: v.lum.dark, light: v.lum.light }));
console.log("images:", rows.length);
const darkGlare = rows.filter((r) => r.dark !== undefined && r.dark > 0.75);
const lightDim = rows.filter((r) => r.light !== undefined && r.light < 0.3);
console.log("bright images shown in dark theme (mean luminance > 0.75):", darkGlare.length);
for (const r of darkGlare.slice(0, 40)) console.log("  ", r.dark, r.src, r.pages.join(" "));
console.log("dark images shown in light theme (< 0.3):", lightDim.length);
for (const r of lightDim.slice(0, 20)) console.log("  ", r.light, r.src, r.pages.join(" "));
await b.close();
