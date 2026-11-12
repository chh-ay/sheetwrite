// Apply the proposed docs pictures to built docs pages, screenshot them and
// measure the HTML they add.
// node docmk.mjs <site-origin> <parts-origin> <site-dir> <outdir> <playwright-module> <art.css> <docs-mockup.css>
import { readFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";

const [site, partsOrigin, siteDir, out, playwrightPath, artCss, mockCss] = process.argv.slice(2);
const { chromium } = await import(playwrightPath);
const css = readFileSync(artCss, "utf8") + readFileSync(mockCss, "utf8");

const CARD_ART_BY_HREF = {
  "/docs/start/": "getting-started",
  "/docs/frameworks/": "frameworks",
  "/docs/tutorials/": "tutorials",
  "/docs/concepts/": "concepts",
  "/docs/features/": "features",
  "/docs/import-export/": "import-export",
  "/docs/api/": "api-reference",
  "/docs/reference/formula-functions/": "formulas",
  "/docs/performance/": "performance",
};

/** Per page: what it gets. `after` is a heading id, "lead" (the first paragraph), or a selector. */
const PAGES = [
  { id: "overview", path: "/docs/", cards: true, mark: "guides" },
  { id: "start", path: "/docs/start/", section: "getting-started" },
  { id: "concepts", path: "/docs/concepts/", section: "concepts" },
  { id: "features", path: "/docs/features/", section: "features" },
  { id: "first-grid", path: "/docs/start/first-grid/", diagram: "first-grid", after: "lead" },
  {
    id: "choose-an-engine",
    path: "/docs/start/choose-an-engine/",
    diagram: "engines",
    replace: ".sw-frame--diagram",
  },
  {
    id: "installation",
    path: "/docs/start/installation/",
    diagram: "load-order",
    after: "runtime-initialization",
  },
  {
    id: "calculation-engine",
    path: "/docs/concepts/calculation-engine/",
    diagram: "recalculation",
    after: "what-happens-on-an-edit",
  },
  {
    id: "host-owned-rows",
    path: "/docs/features/data/host-owned-rows/",
    diagram: "row-bridge",
    after: "lead",
  },
  {
    id: "datasources",
    path: "/docs/features/data/datasources/",
    diagram: "paging",
    after: "storage",
  },
  {
    id: "data-model",
    path: "/docs/features/analysis/data-model/",
    diagram: "relationships",
    after: "lead",
  },
  {
    id: "dashboards",
    path: "/docs/features/analysis/dashboards/",
    diagram: "dashboard-slicers",
    after: "slicers",
  },
  {
    id: "collaboration",
    path: "/docs/features/collaboration/",
    diagram: "collaboration-recovery",
    after: "remote-operations-and-version-gaps",
  },
  {
    id: "import-export",
    path: "/docs/import-export/",
    diagram: "xlsx",
    after: "lead",
    section: "import-export",
  },
  {
    id: "persistence",
    path: "/docs/features/data/persistence/",
    diagram: "version-archive",
    after: "opt-in-version-archives",
  },
  { id: "api", path: "/docs/api/", mark: "api" },
  { id: "formulas", path: "/docs/reference/formula-functions/", mark: "formulas" },
  { id: "releases", path: "/docs/releases/", mark: "changelog" },
].filter(
  (page) => !process.env.DOCMK_PAGES || process.env.DOCMK_PAGES.split(",").includes(page.id),
);

const SHOTS = (process.env.DOCMK_SHOTS ?? "1440-light,390-light").split(",").map((shot) => {
  const [width, theme] = shot.split("-");
  return [Number(width), theme];
});

const browser = await chromium.launch();
const partsPage = await browser.newPage();
await partsPage.goto(`${partsOrigin}/?view=docparts`, { waitUntil: "networkidle" });
const parts = await partsPage.$$eval("[data-part]", (nodes) =>
  Object.fromEntries(nodes.map((node) => [node.dataset.part, node.innerHTML])),
);
await partsPage.close();

/** The page change, as markup to add (and markup it replaces), for both the DOM and the byte count. */
function plan(page) {
  const adds = [];
  if (page.cards)
    for (const art of Object.values(CARD_ART_BY_HREF)) adds.push(parts[`card:${art}`]);
  if (page.mark) adds.push(parts[`mark:${page.mark}`]);
  if (page.section) adds.push(`<div class="mk-section-art">${parts[`card:${page.section}`]}</div>`);
  if (page.diagram)
    adds.push(`<figure class="mk-doc-figure">${parts[`diagram:${page.diagram}`]}</figure>`);
  return adds;
}

function transform({ page, parts, cardArtByHref }) {
  const fromHtml = (html) => {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  };
  if (page.cards) {
    for (const card of document.querySelectorAll("a.sw-doc-card")) {
      const art = cardArtByHref[card.getAttribute("href")];
      const old = card.querySelector("svg.sw-card__art");
      if (!art || !old) continue;
      const svg = fromHtml(parts[`card:${art}`]);
      svg.classList.add("sw-card__art");
      old.replaceWith(svg);
    }
  }
  const header = document.querySelector(".sw-document__header");
  if (page.mark && header) header.prepend(fromHtml(parts[`mark:${page.mark}`]));
  if (page.section && header)
    header.append(fromHtml(`<div class="mk-section-art">${parts[`card:${page.section}`]}</div>`));
  if (page.diagram) {
    const figure = fromHtml(
      `<figure class="mk-doc-figure">${parts[`diagram:${page.diagram}`]}</figure>`,
    );
    const article = document.querySelector("article.sw-prose");
    if (page.replace) document.querySelector(page.replace)?.replaceWith(figure);
    else if (page.after === "lead") article.querySelector(":scope > p")?.after(figure);
    else document.getElementById(page.after)?.after(figure);
  }
}

const brotli = (text) =>
  brotliCompressSync(Buffer.from(text), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
    .length;

for (const page of PAGES) {
  const file = `${siteDir}${page.path}index.html`;
  const before = readFileSync(file, "utf8");
  // The added markup goes where the page puts it; the byte count inserts it before </article>.
  let after = before;
  if (page.cards) after = after.replace(/<svg class="sw-card__art"[^>]*>.*?<\/svg>/g, "");
  if (page.replace)
    after = after.replace(/<figure class="sw-frame sw-frame--diagram">.*?<\/figure>/s, "");
  after = after.replace("</article>", `${plan(page).join("")}</article>`);
  console.log(
    `bytes ${page.id} ${before.length} ${brotli(before)} ${after.length} ${brotli(after)}`,
  );
  for (const [width, theme] of SHOTS) {
    const tab = await browser.newPage({ viewport: { width, height: 1000 } });
    await tab.addInitScript((dark) => {
      if (dark) localStorage.setItem("sw-theme", "dark");
    }, theme === "dark");
    await tab.goto(`${site}${page.path}`, { waitUntil: "networkidle" });
    if (theme === "dark")
      await tab.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await tab.addStyleTag({ content: css });
    await tab.evaluate(transform, { page, parts, cardArtByHref: CARD_ART_BY_HREF });
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForTimeout(300);
    const wide = await tab.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await tab.screenshot({ path: `${out}/doc-${page.id}-${width}-${theme}.png`, fullPage: true });
    console.log(page.id, width, theme, wide ? "OVERFLOW" : "");
    await tab.close();
  }
}
await browser.close();
