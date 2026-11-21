// node align.mjs <base> <outdir> [browsers]
// For the + and ⋯ icons of the sheet-tab bar, compare the icon's vertical
// centre with the neighbouring tab label's optical centre (the middle of the
// x-height), two ways:
//  - DOM: the svg box centre against baseline - xHeight / 2, where the baseline
//    comes from a zero-size inline-block in the label and the x-height from
//    canvas measureText("x") in the label's font;
//  - ink: an "x" is drawn on each label's baseline and the bar is screenshot; the ink box
//    (50% coverage) and the coverage-weighted centroid of the icon and of the
//    label give each one's vertical centre in CSS px.
// Writes align.jsonl and a 2x crop of each bar.
import { chromium, firefox, webkit } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [base, out, which = "chromium,firefox,webkit"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const ENGINES = { chromium, firefox, webkit };
const PAGES = (process.env.PAGES ?? "/showcases/spreadsheet/,/react/").split(",");
const WIDTHS_ENV = process.env.WIDTHS;
const WIDTHS = WIDTHS_ENV ? WIDTHS_ENV.split(",").map(Number) : [1440, 834, 390, 320];
for (const name of which.split(",")) {
  const lines = [];
  const browser = await ENGINES[name].launch();
  for (const dpr of [1, 2]) for (const theme of ["light", "dark"]) for (const width of WIDTHS) {
    const touch = width <= 834;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dpr, colorScheme: theme, hasTouch: touch, ...(name === "firefox" ? {} : { isMobile: touch && width <= 390 }) });
    await ctx.addInitScript((t) => { try { localStorage.setItem("sheetwrite-theme", t); } catch {} }, theme);
    const page = await ctx.newPage();
    for (const path of PAGES) {
      const rec = { browser: name, dpr, theme, width, page: path };
      try {
        await page.goto(base + path, { waitUntil: "load", timeout: 60000 });
        await page.waitForTimeout(2500);
        if (process.env.EXTRA_CSS) { await page.addStyleTag({ content: readFileSync(process.env.EXTRA_CSS, "utf8") }); await page.waitForTimeout(300); }
        const bar = page.locator(".sheetwrite-shell-bottom-row, .sheetwrite-tabbar").first();
        await bar.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        // The page functions below share these helpers.
        await page.addScriptTag({ content: [pairs, labelNode].map(String).join("\n") });
        rec.dom = await page.evaluate(domAlign);
        const shot = `${out}/${name}-dpr${dpr}-${theme}-${width}${path.replaceAll("/", "_")}bar.png`;
        await bar.screenshot({ path: shot });
        // Ink: an "x" on each label's baseline gives the x-height band.
        const regions = await page.evaluate(prepareInk);
        const box = await bar.boundingBox();
        const png = await page.screenshot({ clip: box });
        rec.ink = await page.evaluate(inkAlign, { png: png.toString("base64"), regions, origin: [box.x, box.y], dpr });
        await page.reload();
      } catch (error) { rec.error = String(error.message).slice(0, 200); }
      lines.push(JSON.stringify(rec));
    }
    await ctx.close();
  }
  await browser.close();
  writeFileSync(`${out}/align-${name}.jsonl`, lines.join("\n") + "\n");
  console.log("done", name, lines.length);
}

function pairs() {
  const bar = document.querySelector(".sheetwrite-shell-bottom-row") ?? document.querySelector(".sheetwrite-tabbar");
  const add = bar.querySelector(".sheetwrite-tab-add");
  const tabs = [...bar.querySelectorAll(".sheetwrite-tab")].filter((tab) => tab.getClientRects().length > 0);
  const active = bar.querySelector(".sheetwrite-tab-active");
  const addRect = add.getBoundingClientRect();
  // The tab whose right edge is nearest to the left of +.
  const beside = tabs.filter((tab) => tab.getBoundingClientRect().right <= addRect.left + 1).at(-1) ?? tabs.at(-1);
  const more = bar.querySelector(".sheetwrite-tab-options-button");
  return [["+", add.querySelector("svg"), beside], ["⋯", more?.querySelector("svg"), active]];
}

function labelNode(tab) {
  const walker = document.createTreeWalker(tab, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.trim()) return node;
  return null;
}

function domAlign() {
  return pairs().map(([icon, svg, tab]) => {
    if (!svg || !tab) return { icon, missing: true };
    const text = labelNode(tab);
    const marker = document.createElement("span");
    marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    text.after(marker);
    const baseline = marker.getBoundingClientRect().bottom;
    marker.remove();
    const font = getComputedStyle(text.parentElement).font;
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = font;
    const x = ctx.measureText("x");
    const r = svg.getBoundingClientRect();
    const iconCentre = r.top + r.height / 2;
    const textCentre = baseline - (x.actualBoundingBoxAscent - x.actualBoundingBoxDescent) / 2;
    return { icon, label: text.textContent.trim(), iconCentre, textCentre, diff: Math.round((iconCentre - textCentre) * 100) / 100 };
  });
}

function prepareInk() {
  return pairs().map(([icon, svg, tab]) => {
    if (!svg || !tab) return { icon, missing: true };
    const text = labelNode(tab);
    // An "x" on the label's own baseline, drawn in the tab's left padding by a
    // zero-width box, so nothing moves: its ink is exactly the x-height band.
    const marker = document.createElement("span");
    marker.style.cssText = "display:inline-block;width:0;white-space:nowrap;direction:rtl";
    const probe = document.createElement("span");
    probe.textContent = "x";
    probe.style.cssText = "padding-left:4px";
    marker.append(probe);
    text.before(marker);
    const t = probe.getBoundingClientRect();
    const s = svg.getBoundingClientRect();
    return { icon, iconRect: [s.left, s.top - 2, s.width, s.height + 4], textRect: [t.left, t.top - 2, t.width, t.height + 4] };
  });
}

async function inkAlign({ png, regions, origin, dpr }) {
  const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const centre = ([x, y, w, h]) => {
    const x0 = Math.max(0, Math.floor((x - origin[0]) * dpr)), y0 = Math.max(0, Math.floor((y - origin[1]) * dpr));
    const x1 = Math.min(bitmap.width, Math.ceil((x - origin[0] + w) * dpr)), y1 = Math.min(bitmap.height, Math.ceil((y - origin[1] + h) * dpr));
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const W = x1 - x0, H = y1 - y0;
    // The background is the commonest colour in the region.
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) { const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; counts.set(k, (counts.get(k) ?? 0) + 1); }
    const bg = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const br = bg >> 16, bgG = (bg >> 8) & 255, bb = bg & 255;
    const diff = new Float64Array(W * H); let max = 0;
    for (let p = 0; p < W * H; p++) { const d = Math.max(Math.abs(data[p * 4] - br), Math.abs(data[p * 4 + 1] - bgG), Math.abs(data[p * 4 + 2] - bb)); diff[p] = d; if (d > max) max = d; }
    let top = -1, bottom = -1, sum = 0, weighted = 0;
    for (let row = 0; row < H; row++) {
      let rowInk = 0;
      for (let col = 0; col < W; col++) { const c = diff[row * W + col] / max; if (c >= 0.5) rowInk = 1; sum += c; weighted += c * (row + 0.5); }
      if (rowInk) { if (top < 0) top = row; bottom = row + 1; }
    }
    const toCss = (v) => origin[1] + (y0 + v) / dpr;
    return { box: toCss((top + bottom) / 2), centroid: toCss(weighted / sum), debug: { x0, y0, W, H, max, top, bottom, bg } };
  };
  return regions.map((r) => {
    if (r.missing) return r;
    const icon = centre(r.iconRect), text = centre(r.textRect);
    return { icon: r.icon, boxDiff: Math.round((icon.box - text.box) * 100) / 100, centroidDiff: Math.round((icon.centroid - text.centroid) * 100) / 100, iconDebug: icon.debug, textDebug: text.debug };
  });
}
