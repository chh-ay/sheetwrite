import type { Locator, Page } from "@playwright/test";

import { expect, siteUrl, test, waitForHydration } from "./fixtures.js";

// Shared docs controls in a real browser; code-enhancements and
// code-popover-placement unit tests own their logic.

const INSTALLATION_URL = siteUrl("/docs/start/installation/");
const FIRST_GRID_URL = siteUrl("/docs/start/first-grid/");
/** The page clock runs on to this point, then stops; timers then fire only on demand. */
const CLOCK_PAUSE_LEAD_MS = 1_000;

function framework_tabs(page: Page): Locator {
  return page.getByRole("tablist", { name: "Framework" }).first().getByRole("tab");
}

test("framework tabs keep one tab stop, follow the keys, and synchronize and persist across guides", async ({
  page,
}) => {
  await page.goto(INSTALLATION_URL);
  await waitForHydration(page);
  const tabs = framework_tabs(page);
  // The article mounts after hydration; wait for its tabs before counting them.
  await expect(tabs.first()).toBeVisible();
  const count = await tabs.count();
  expect(count).toBeGreaterThan(2);
  const expect_active = async (index: number) => {
    const tab = tabs.nth(index);
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toBeFocused();
    await expect(tabs.and(page.locator('[tabindex="0"]'))).toHaveCount(1);
    await expect(tab).toHaveAttribute("tabindex", "0");
  };
  await tabs.first().click();
  await expect_active(0);
  for (const [key, index] of [
    ["ArrowRight", 1],
    ["ArrowLeft", 0],
    ["ArrowLeft", count - 1],
    ["Home", 0],
    ["End", count - 1],
  ] as const) {
    await page.keyboard.press(key);
    await expect_active(index);
  }

  const framework_panel = page.getByRole("tabpanel", { name: /^(Vanilla|React|Vue|Svelte)$/ });
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });
  const stored_framework = () => page.evaluate(() => localStorage.getItem("sheetwrite-framework"));
  // The shown panel's code is highlighted, also in a panel that was hidden at load.
  const expect_highlighted = async (language: string) => {
    const colors = await framework_panel
      .locator(`pre[data-language="${language}"] .code`)
      .first()
      .evaluate((code) => ({
        code: getComputedStyle(code).color,
        tokens: Array.from(
          code.querySelectorAll<HTMLElement>("span[style]"),
          (token) => getComputedStyle(token).color,
        ),
      }));
    expect(
      colors.tokens.some((color) => color !== colors.code),
      language,
    ).toBe(true);
  };
  await tab("React").click();
  await expect(framework_panel).toContainText("@sheetwrite/react");
  await expect_highlighted("tsx");
  expect(await stored_framework()).toBe("React");

  await page.goto("/docs/frameworks/lifecycle/");
  await expect(tab("React")).toHaveAttribute("aria-selected", "true");
  await expect(framework_panel).toContainText("SheetwriteGrid");
  await tab("Vue").click();
  expect(await stored_framework()).toBe("Vue");
  await page.goto(INSTALLATION_URL);
  await expect(tab("Vue")).toHaveAttribute("aria-selected", "true");
  await expect_highlighted("vue");
  await tab("Svelte").click();
  await expect_highlighted("svelte");
});

test("with storage blocked, a malformed fragment and forced colors, preference controls work and show focus", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });
  });
  await page.emulateMedia({ forcedColors: "active" });
  // The fixture fails the test on any page error.
  await page.goto(`${INSTALLATION_URL}#%`);
  await waitForHydration(page);
  const outline_of_focused = () =>
    page.evaluate(() => {
      const focused = document.activeElement;
      return focused === null ? "none" : getComputedStyle(focused).outlineStyle;
    });
  // Keyboard focus shows in forced colors: the skip link, then the theme button.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("A");
  expect(await outline_of_focused()).toBe("solid");
  const theme_button = page.getByRole("button", { name: /^Use (light|dark) theme$/ });
  await theme_button.focus();
  expect(await outline_of_focused()).toBe("solid");

  const tabs = framework_tabs(page);
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  // Each framework tab holds its own install command; use the visible one.
  const terminal = page.locator(".sw-terminal:visible").first();
  await terminal.getByRole("tab", { name: "pnpm", exact: true }).click();
  await expect(terminal.locator("pre")).toContainText("pnpm add");

  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await theme_button.click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", theme ?? "");
});

test("the package command shares the code block's copy button, and its feedback follows the copied command", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 900 });
  // A paused clock keeps the feedback timer from clearing "Copied" on its own.
  await page.clock.install();
  await page.goto(INSTALLATION_URL);
  await waitForHydration(page);
  await page.clock.pauseAt(Date.now() + CLOCK_PAUSE_LEAD_MS);
  const tab = page.getByRole("tabpanel").filter({ visible: true }).first();
  const terminal = tab.locator(".sw-terminal").first();
  const command_copy = terminal.locator(".sw-terminal__copy");
  const block_copy = tab.locator(".expressive-code .copy button").first();
  await tab.locator(".expressive-code .frame").first().hover();
  const [command, block] = await Promise.all([
    command_copy.boundingBox(),
    block_copy.boundingBox(),
  ]);
  if (command === null || block === null) throw new Error("A copy button has no box.");
  expect([command.width, command.height]).toEqual([block.width, block.height]);
  // Both show only the icon; the label is for screen readers.
  const visible_label_width = await command_copy
    .locator("span")
    .evaluate((label) => label.getBoundingClientRect().width);
  expect(visible_label_width).toBeLessThanOrEqual(1);
  const [command_radius, block_radius] = await Promise.all(
    [command_copy, block_copy].map((button) =>
      button.evaluate((element) => getComputedStyle(element).borderTopLeftRadius),
    ),
  );
  expect(command_radius).toBe(block_radius);

  await terminal.getByRole("tab", { name: "npm", exact: true }).click();
  await terminal.getByRole("button", { name: "Copy" }).click();
  await expect(terminal.getByRole("button", { name: "Copied" })).toBeVisible();
  await terminal.getByRole("tab", { name: "pnpm", exact: true }).click();
  await expect(command_copy).toHaveText("Copy");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("npm install");
});

/** Longer than the popover close delay, so a scheduled close has run. */
const AFTER_POPOVER_CLOSE_MS = 300;

/** The first code trigger whose hover panel holds a link the reader can focus. */
async function popover_with_link(page: Page): Promise<{ trigger: Locator; panelId: string }> {
  // The URL and shell can change before lazy MDX replaces the old article.
  // Scope discovery to this page's example, never the outgoing page's triggers.
  const example = page.getByRole("figure", { name: "Complete first grid", exact: true });
  await expect(example).toBeVisible();
  // Panels wait in the page's inert store until a trigger opens one.
  const find_panel_id = () =>
    example.evaluate((element) => {
      const stores = [
        ...document.querySelectorAll<HTMLTemplateElement>("template.sw-code-popover-store"),
      ];
      for (const trigger of element.querySelectorAll<HTMLElement>(
        "[data-sw-code-popover-trigger]",
      )) {
        const id = trigger.dataset.swCodePopoverTrigger ?? "";
        if (stores.some((store) => store.content.getElementById(id)?.querySelector("a[href]"))) {
          return id;
        }
      }
      return "";
    });
  // The article mounts after hydration and after client-side navigation.
  await expect.poll(find_panel_id).not.toBe("");
  const panel_id = await find_panel_id();
  return {
    trigger: page.locator(`[data-sw-code-popover-trigger="${panel_id}"]`).first(),
    panelId: panel_id,
  };
}

test("a code popover opens alike on focus and hover, holds while its link has focus, and stays single across visits", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(FIRST_GRID_URL);
  await waitForHydration(page);
  const { trigger, panelId: panel_id } = await popover_with_link(page);
  const panel = page.locator(`[id="${panel_id}"]`);

  await trigger.focus();
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveAccessibleDescription(/\S/);
  await expect(page.locator(`body > [id="${panel_id}"]`)).toHaveCount(1);
  const focused_text = await panel.innerText();
  await panel.locator("a[href]").first().focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(AFTER_POPOVER_CLOSE_MS);
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.blur();
  await trigger.hover();
  await expect(panel).toBeVisible();
  expect(await panel.innerText()).toBe(focused_text);

  await page
    .getByRole("navigation", { name: "Documentation" })
    .getByRole("link", { name: "Installation", exact: true })
    .click();
  await expect(page).toHaveURL(INSTALLATION_URL);
  await expect(panel).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(FIRST_GRID_URL);
  await (await popover_with_link(page)).trigger.focus();
  await expect(panel).toHaveCount(1);
});

/** The panel's distance from its symbol (`PANEL_OFFSET_PX` in `code-popovers.ts`). */
const POPOVER_GAP_PX = 8;
/** Layout rounds boxes to device pixels. */
const POPOVER_GAP_TOLERANCE_PX = 1;
/** The panel's width cap: 35rem at the 16 px root size. */
const POPOVER_MAX_WIDTH_PX = 560;
/** How far from the scrolled code panel's left edge the 390 px run brings the symbol. */
const SCROLLED_SYMBOL_INSET_PX = 16;
const PHONE_VIEWPORT = { width: 390, height: 844 };

// Below 48rem code lines do not wrap: the code panel scrolls, and the 390 px
// run scrolls it so the symbol sits past the panel's scrolled-off start.
for (const { scrolled, ...viewport } of [
  { width: 1440, height: 900, scrolled: false },
  { width: 834, height: 1112, scrolled: false },
  { ...PHONE_VIEWPORT, scrolled: true },
]) {
  test(`at ${viewport.width} px a code popover opens 8 px from its symbol and inside the viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(INSTALLATION_URL);
    await waitForHydration(page);
    const trigger = page.locator('[data-sw-symbol="createGrid"]').filter({ visible: true }).first();
    const panel = page.locator(
      `[id="${await trigger.getAttribute("data-sw-code-popover-trigger")}"]`,
    );
    if (scrolled) {
      const scroll = await trigger.evaluate((symbol, inset) => {
        const code = symbol.closest("pre");
        if (code === null) throw new Error("The symbol is not in a code panel.");
        const before = { scrollWidth: code.scrollWidth, clientWidth: code.clientWidth };
        code.scrollLeft +=
          symbol.getBoundingClientRect().left - code.getBoundingClientRect().left - inset;
        const shown = symbol.getBoundingClientRect();
        const panel_box = code.getBoundingClientRect();
        const hit = document.elementFromPoint(
          shown.left + shown.width / 2,
          shown.top + shown.height / 2,
        );
        return {
          ...before,
          scrollLeft: code.scrollLeft,
          insidePanel: shown.left >= panel_box.left && shown.right <= panel_box.right,
          symbolOnTop: hit !== null && symbol.contains(hit),
        };
      }, SCROLLED_SYMBOL_INSET_PX);
      expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth);
      expect(scroll.scrollLeft).toBeGreaterThan(0);
      expect(scroll.insidePanel).toBe(true);
      expect(scroll.symbolOnTop).toBe(true);
    }

    await trigger.hover();
    await expect(panel).toBeVisible();
    const symbol = await trigger.boundingBox();
    const box = await panel.boundingBox();
    if (symbol === null || box === null) throw new Error("The symbol or its panel has no box.");
    const opens_below = box.y >= symbol.y + symbol.height;
    const gap = opens_below ? box.y - (symbol.y + symbol.height) : symbol.y - (box.y + box.height);
    expect(Math.abs(gap - POPOVER_GAP_PX)).toBeLessThanOrEqual(POPOVER_GAP_TOLERANCE_PX);
    // The panel starts at the symbol's column, unless that would push it past the viewport.
    expect(box.x).toBeLessThanOrEqual(symbol.x + POPOVER_GAP_TOLERANCE_PX);
    expect(box.x + box.width).toBeGreaterThan(symbol.x);
    expect(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height,
    ).toBe(true);
    expect(box.width).toBeLessThanOrEqual(POPOVER_MAX_WIDTH_PX);
  });
}

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: PHONE_VIEWPORT });

  test("the first tap on a linked code name opens its panel, which links to the API page", async ({
    page,
  }) => {
    await page.goto(FIRST_GRID_URL);
    await waitForHydration(page);
    const trigger = page
      .getByRole("figure", { name: "Complete first grid", exact: true })
      .locator("a[data-sw-code-popover-trigger][href]")
      .first();
    await expect(trigger).toBeVisible();
    const panel = page.locator(
      `[id="${await trigger.getAttribute("data-sw-code-popover-trigger")}"]`,
    );

    await trigger.tap();
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(FIRST_GRID_URL);
    await expect(panel.getByRole("link", { name: "API reference" })).toHaveAttribute(
      "href",
      (await trigger.getAttribute("href")) ?? "",
    );
  });
});
