// Mock the proposed showcase pattern on real built pages:
// node mk.mjs <site-origin> <parts-origin> <outdir> <playwright-module> <art.css> <pattern.css>
import { readFileSync } from "node:fs";

const [site, partsOrigin, out, playwrightPath, artCss, patternCss] = process.argv.slice(2);
const { chromium } = await import(playwrightPath);
const css = readFileSync(artCss, "utf8") + readFileSync(patternCss, "utf8");

/** Per page: the prose section that sits beside which diagram. */
const PAGES = [
  {
    id: "spreadsheet",
    path: "/showcases/spreadsheet/",
    explain: "One command model",
    diagram: "command-model",
  },
  {
    id: "collaboration",
    path: "/showcases/collaboration/",
    explain: "Protocol faults",
    diagram: "collaboration-recovery",
  },
  {
    id: "data-model",
    path: "/showcases/data-model/",
    explain: "How the model reads the tables",
    diagram: "data-model",
  },
  {
    id: "recalculation",
    path: "/showcases/recalculation/",
    explain: "What the timings include",
    diagram: "recalculation",
  },
  { id: "vanilla", path: "/vanilla/" },
];
const SHOTS = [
  [1440, "light"],
  [2560, "light"],
  [390, "light"],
  [1440, "dark"],
];

const browser = await chromium.launch();
const partsPage = await browser.newPage();
await partsPage.goto(`${partsOrigin}/?view=parts`, { waitUntil: "networkidle" });
const parts = await partsPage.$$eval("[data-part]", (nodes) =>
  Object.fromEntries(nodes.map((node) => [node.dataset.part, node.innerHTML])),
);
await partsPage.close();

function transform({ parts, explain, diagram }) {
  const el = (tag, className, html) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  };
  const proofCards = (items) => {
    const list = el("ul", "mk-proofs");
    for (const { title, detail } of items) {
      const art = parts[`proof:${title}`] ?? "";
      const card = el("li");
      card.append(
        el(
          "article",
          "mk-proof",
          `<div class="mk-proof__art">${art}</div><div class="mk-proof__body"><strong>${title}</strong><p>${detail}</p></div>`,
        ),
      );
      list.append(card);
    }
    return list;
  };

  // Framework workbench: proofs as cards with pictures.
  const vanillaProofs = document.querySelector(".sw-showcase-page__proof ol");
  if (vanillaProofs) {
    const items = [...vanillaProofs.children].map((li) => {
      const body = li.querySelector("div");
      const title = body?.firstElementChild?.textContent.trim() ?? "";
      const detail = body?.querySelector("p")?.textContent.trim() ?? "";
      return { title, detail };
    });
    vanillaProofs.replaceWith(proofCards(items));
    return;
  }

  const page = document.querySelector(".sw-showcase__page");
  const code = page.querySelector(".sw-showcase__code");
  const sections = [...page.querySelectorAll(".sw-showcase__section")];
  const prose = sections.find(
    (section) => section.querySelector("h2")?.textContent.trim() === explain,
  );
  if (prose && diagram && parts[diagram]) {
    const row = el("div", "mk-row");
    code.before(row);
    prose.classList.add("mk-text");
    row.append(prose, el("figure", "mk-figure", parts[diagram]));
  }
  if (code) {
    const row = el("div", "mk-row mk-row--code");
    code.before(row);
    const text = code.innerText ?? "";
    const pre = code.querySelector("pre");
    const lines = (pre?.innerText ?? "").trim().split("\n").length;
    if (pre && lines > 26) {
      const more = el("button", "sw-button mk-more", `Show all ${lines} lines`);
      more.type = "button";
      code.append(more);
    }
    const apis = [
      ...new Set(
        text.match(
          /\b(?:grid\.[a-zA-Z]+|create[A-Z][A-Za-z]+|init[A-Z][A-Za-z]+|new [A-Z][A-Za-z]+|[a-z]+\.(?:subscribe|on|ready))(?=\()/g,
        ) ?? [],
      ),
    ]
      .filter((api) => !/^new (?:Promise|Map|Set|Error|URL)$/.test(api))
      .slice(0, 8);
    const guide = code.querySelector(".sw-link-arrow");
    const aside = el(
      "aside",
      "mk-aside",
      `<h3>In this code</h3><ul>${apis.map((api) => `<li><code>${api.replace("new ", "")}</code></li>`).join("")}</ul>`,
    );
    if (guide) aside.append(guide);
    row.append(code, aside);
  }
  const points = page.querySelector(".sw-proofs-points");
  if (points) {
    const items = [...points.children].map((li) => ({
      title: li.querySelector("strong")?.textContent.trim() ?? "",
      detail: li.querySelector("span")?.textContent.trim() ?? "",
    }));
    points.replaceWith(proofCards(items));
  }
  const map = page.querySelector(".sw-proofs-boundary__map");
  if (map) {
    const lanes = map.querySelectorAll(".sw-proofs-boundary__lane");
    const boundary = el("div", "mk-boundary");
    boundary.append(lanes[0], el("div", "mk-seam", parts["seam:collaboration"] ?? ""), lanes[1]);
    map.replaceWith(boundary);
  }
}

for (const { id, path, explain, diagram } of PAGES) {
  for (const [width, theme] of SHOTS) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.addInitScript((dark) => {
      if (dark) {
        localStorage.setItem("sw-theme", "dark");
        document.documentElement.dataset.theme = "dark";
      }
    }, theme === "dark");
    await page.goto(`${site}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    if (theme === "dark")
      await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await page.addStyleTag({ content: css });
    await page.evaluate(transform, { parts, explain, diagram });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await page.screenshot({ path: `${out}/mk-${id}-${width}-${theme}.png`, fullPage: true });
    console.log(id, width, theme, height, wide ? "OVERFLOW" : "");
    await page.close();
  }
}
await browser.close();
