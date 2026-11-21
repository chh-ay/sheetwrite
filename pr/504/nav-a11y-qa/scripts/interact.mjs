// Keyboard walks, phone menu, outline tracking, reduced motion. Usage: node interact.mjs <base> <outdir> <browser>
import { chromium, firefox } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const [base, out, bname = "chromium"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
const browser = await (bname === "firefox" ? firefox : chromium).launch();
const log = (...a) => console.log(...a);
const report = {};
const describe = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
  const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.getAttribute("value") || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const region = el.closest("header, nav, main, aside, footer, dialog")?.tagName.toLowerCase() ?? "body";
  return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 40), name, ring, visible: r.width > 0 && r.height > 0, x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height), region, fv: el.matches(":focus-visible") };
};
// 1. Keyboard walks.
for (const [label, path] of [["home", "/"], ["guide", "/docs/start/installation/"], ["api", "/docs/api/core/create-grid/"], ["showcase", "/showcases/sort/"]]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(800);
  const stops = [];
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press("Tab");
    const d = await page.evaluate(describe);
    stops.push(d);
    if (i === 0) await page.screenshot({ path: `${out}/shots/kbd-${bname}-${label}-tab1.png` });
    if ([5, 15, 30, 60].includes(i)) await page.screenshot({ path: `${out}/shots/kbd-${bname}-${label}-tab${i + 1}.png` });
  }
  const noRing = stops.filter((s) => s && s.visible && !s.ring);
  const invisible = stops.filter((s) => s && !s.visible);
  // Trap: the same element repeating, or a short cycle that never reaches the footer.
  let repeats = 0;
  for (let i = 1; i < stops.length; i++) if (stops[i] && stops[i - 1] && JSON.stringify(stops[i]) === JSON.stringify(stops[i - 1])) repeats++;
  const regions = [...new Set(stops.map((s) => s?.region ?? "body(none)"))];
  report[label] = { first: stops[0], firstStops: stops.slice(0, 25).map((s) => s && `${s.region}:${s.tag}:${s.name}${s.ring ? "" : " [NO RING]"}`), noRing: noRing.slice(0, 10), invisible: invisible.slice(0, 10).map((s) => `${s.tag}.${s.cls} ${s.name}`), repeats, regions };
  log(`\n== keyboard ${label} ${path}`);
  log(" first stop:", JSON.stringify(stops[0]));
  log(" first 25:", report[label].firstStops.join(" | "));
  log(" stops without a visible ring:", noRing.length, JSON.stringify(noRing.slice(0, 6).map((s) => `${s.tag}.${s.cls} "${s.name}" fv=${s.fv}`)));
  log(" focused but zero-size:", invisible.length, JSON.stringify(report[label].invisible.slice(0, 6)));
  log(" identical consecutive stops (trap signal):", repeats, " regions reached:", regions.join(","));
  // Skip link: first Tab, then Enter, then Tab lands inside main.
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute("href") }));
  if (skip.href?.startsWith("#")) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    await page.keyboard.press("Tab");
    const after = await page.evaluate(() => ({ inMain: !!document.activeElement?.closest("main, #main-content"), name: document.activeElement?.textContent?.trim().slice(0, 40), hash: location.hash }));
    log(" skip link:", JSON.stringify(skip), "-> next Tab", JSON.stringify(after));
  } else log(" skip link: NONE; first Tab =", JSON.stringify(skip));
  await page.close();
}
// 2. Phone menus at 390 px.
for (const [label, path, toggleSel] of [["docs", "/docs/start/installation/", ".sw-nav-toggle"], ["home", "/", ".sw-header__menu"], ["showcase", "/showcases/sort/", ".sw-header__menu, .sw-nav-toggle"]]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: bname !== "firefox" });
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(600);
  const toggle = page.locator(toggleSel).first();
  const tinfo = await toggle.evaluate((e) => ({ label: e.getAttribute("aria-label") ?? e.textContent.trim(), expanded: e.getAttribute("aria-expanded"), visible: e.getClientRects().length > 0, size: [e.getBoundingClientRect().width, e.getBoundingClientRect().height] })).catch((e) => ({ error: e.message.slice(0, 80) }));
  log(`\n== phone menu ${label}: toggle`, JSON.stringify(tinfo));
  if (tinfo.error) { await page.close(); continue; }
  await toggle.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => {
    const d = document.querySelector("dialog[open], [popover]:popover-open");
    const r = d?.getBoundingClientRect();
    return { open: !!d, kind: d?.tagName, focusInside: !!d?.contains(document.activeElement), focus: document.activeElement?.textContent?.trim().slice(0, 30), links: d?.querySelectorAll("a").length, box: r && [r.left, r.top, r.right, r.bottom].map(Math.round), current: d?.querySelector("[aria-current=page]")?.textContent?.trim(), docOverflow: document.documentElement.scrollWidth - innerWidth };
  });
  log(" opened:", JSON.stringify(opened));
  await page.screenshot({ path: `${out}/shots/menu-${bname}-${label}-390.png` });
  // Tab 200 times: does focus ever leave the open menu?
  let left = 0;
  for (let i = 0; i < 200; i++) { await page.keyboard.press("Tab"); if (!(await page.evaluate(() => !!document.querySelector("dialog[open], [popover]:popover-open")?.contains(document.activeElement)))) left++; }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closed = await page.evaluate((sel) => ({ open: !!document.querySelector("dialog[open], [popover]:popover-open"), focusOnToggle: document.activeElement?.matches(sel), focus: document.activeElement?.className }), toggleSel);
  log(" tab stops outside open menu:", left, "/200; after Escape:", JSON.stringify(closed));
  await page.close();
}
// 3. Outline tracks the scroll.
for (const path of ["/docs/start/installation/", "/docs/features/collaboration/", "/docs/features/formulas/analysis-formulas/"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(500);
  const ids = await page.$$eval(".sw-toc a", (as) => as.map((a) => decodeURIComponent(a.hash.slice(1))));
  const atTop = await page.$eval(".sw-toc", (t) => t.querySelector("[aria-current]")?.hash ?? null).catch(() => "no outline");
  const wrong = [];
  for (const id of ids) {
    await page.evaluate((id) => { const el = document.getElementById(id); scrollTo(0, el.getBoundingClientRect().top + scrollY - 80); }, id);
    await page.waitForTimeout(120);
    const cur = await page.$eval(".sw-toc", (t) => decodeURIComponent(t.querySelector("[aria-current]")?.hash.slice(1) ?? ""));
    const atEnd = await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
    if (cur !== id && !atEnd) wrong.push(`${id} -> ${cur}`);
  }
  // Clicking an outline entry marks it.
  log(`\n== outline ${path}: ${ids.length} entries, current at page top = ${atTop}, mismatches while scrolling: ${wrong.length}`, JSON.stringify(wrong.slice(0, 5)));
  await page.evaluate(() => scrollTo(0, 0));
  await page.close();
}
// 4. Reduced motion: running animations and smooth scrolling with and without the preference.
for (const motion of ["no-preference", "reduce"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: motion });
  for (const path of ["/", "/showcases/", "/showcases/sort/", "/docs/start/installation/", "/docs/performance/"]) {
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const a = await page.evaluate(() => {
      const running = document.getAnimations().filter((x) => x.playState === "running");
      const desc = running.slice(0, 5).map((x) => `${x.animationName ?? x.constructor.name}:${x.effect?.target?.className?.toString().slice(0, 30)}:${x.effect?.getComputedTiming().duration}`);
      const videos = [...document.querySelectorAll("video")].map((v) => ({ autoplay: v.autoplay, paused: v.paused }));
      return { running: running.length, desc, scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior, videos };
    });
    log(`motion=${motion} ${path}`, JSON.stringify(a));
    await page.close();
  }
  await ctx.close();
}
writeFileSync(`${out}/interact-${bname}.json`, JSON.stringify(report, null, 2));
await browser.close();
