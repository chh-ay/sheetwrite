import type { Locator, Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

async function openEditor(page: Page, kind: "cell" | "bar"): Promise<Locator> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill("G3");
  await nameBox.press("Enter");
  if (kind === "cell") await page.keyboard.type("=");
  const editor =
    kind === "cell"
      ? page.locator("textarea.sheetwrite-editor")
      : page.getByRole("textbox", { name: "Formula bar" });
  await editor.fill("=ROUND(");
  return editor;
}

for (const kind of ["cell", "bar"] as const) {
  test(`${kind} formula editor inserts lines, keeps help aligned and commits source @portability`, async ({
    page,
  }, testInfo) => {
    const editor = await openEditor(page, kind);
    const initialHeight = await editor.evaluate((field) => field.getBoundingClientRect().height);
    const guide = page.getByRole("status").filter({ hasText: "ROUND(" });
    await expect(guide.locator("strong")).toHaveText("number");
    await editor.press("Alt+Enter");
    await expect(editor).toHaveValue("=ROUND(\n");
    await expect(editor).toBeFocused();
    await expect(editor).toHaveAttribute("aria-multiline", "true");
    expect(await editor.evaluate((field) => field.getBoundingClientRect().height)).toBeGreaterThan(
      initialHeight,
    );
    expect(await editor.getAttribute("role")).not.toBe("combobox");
    await page.keyboard.type("SUM");
    const list = page.getByRole("listbox", { name: "Functions" });
    await expect(list.getByRole("option", { name: "SUM", exact: true })).toBeVisible();
    // Alt+Enter must not accept the open completion.
    await editor.press("Alt+Enter");
    await expect(editor).toHaveValue("=ROUND(\nSUM\n");
    await page.keyboard.press("Backspace");
    await expect(list.getByRole("option", { name: "SUM", exact: true })).toBeVisible();
    await editor.press("Tab");
    await expect(editor).toHaveValue("=ROUND(\nSUM(");
    await page.keyboard.type("A1:A3),");
    await editor.press("Alt+Enter");
    await page.keyboard.type("2)");
    await page.keyboard.press("ArrowLeft");
    await expect(guide.locator("strong")).toHaveText("digits");
    const source = "=ROUND(\nSUM(A1:A3),\n2)";
    const mirror = page.locator(".sheetwrite-formula-mirror");
    await expect(mirror).toHaveText(source);
    const geometry = await editor.evaluate((field) => {
      const mirror = document.querySelector(".sheetwrite-formula-mirror");
      if (!mirror) throw new Error("Formula text mirror is missing");
      const editorBox = field.getBoundingClientRect();
      const mirrorBox = mirror.getBoundingClientRect();
      const reference = [...mirror.querySelectorAll("span")].find(
        (span) => span.textContent === "A1:A3",
      );
      if (!reference) throw new Error("Coloured reference is missing");
      return {
        editor: [editorBox.x, editorBox.y, editorBox.width, editorBox.height],
        mirror: [mirrorBox.x, mirrorBox.y, mirrorBox.width, mirrorBox.height],
        lineHeight: getComputedStyle(field).lineHeight,
        mirrorLineHeight: getComputedStyle(mirror).lineHeight,
        referenceY: reference.getBoundingClientRect().y,
        referenceColor: reference.style.color,
      };
    });
    expect(geometry.mirror).toEqual(geometry.editor);
    expect(geometry.mirrorLineHeight).toBe(geometry.lineHeight);
    expect(geometry.referenceY).toBeGreaterThan(geometry.editor[1] ?? 0);
    expect(geometry.referenceColor).not.toBe("");
    const screenshot = testInfo.outputPath(`${kind}-multiline.png`);
    await page.screenshot({ path: screenshot });
    await testInfo.attach(`${kind} multi-line formula`, {
      path: screenshot,
      contentType: "image/png",
    });
    await editor.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__sheetwriteSpreadsheetGrid?.store.getFormula({ sheet: "sales", row: 2, col: 6 }),
        ),
      )
      .toBe(source);
    // Reopening retains line breaks; removing them shrinks the editor again.
    const nameBox = page.getByRole("textbox", { name: "Cell reference" });
    await nameBox.fill("G3");
    await nameBox.press("Enter");
    if (kind === "cell") await page.keyboard.press("F2");
    await expect(editor).toHaveValue(source);
    // A selection is replaced, not surrounded, when inserting a line.
    await editor.focus();
    await editor.evaluate((field) => {
      if (!(field instanceof HTMLTextAreaElement))
        throw new Error("Formula editor is not a textarea");
      const digit = field.value.lastIndexOf("2");
      field.setSelectionRange(digit, digit + 1);
    });
    await editor.press("Alt+Enter");
    await expect(editor).toHaveValue("=ROUND(\nSUM(A1:A3),\n\n)");
    // Long drafts stay bounded and their coloured layer follows vertical scroll.
    await editor.fill(`=SUM(\n${Array.from({ length: 12 }, () => "1,").join("\n")}\n2)`);
    await editor.evaluate((field) => {
      field.scrollTop = field.scrollHeight;
    });
    await expect
      .poll(() =>
        editor.evaluate((field) => {
          const mirror = document.querySelector(".sheetwrite-formula-mirror");
          return field.scrollTop > 0 && mirror?.scrollTop === field.scrollTop;
        }),
      )
      .toBe(true);
    await editor.fill("=42");
    expect(await editor.evaluate((field) => field.getBoundingClientRect().height)).toBe(
      initialHeight,
    );
    await editor.press("Escape");
    expect(
      await page.evaluate(() =>
        window.__sheetwriteSpreadsheetGrid?.store.getFormula({ sheet: "sales", row: 2, col: 6 }),
      ),
    ).toBe(source);
  });
}
