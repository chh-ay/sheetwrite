import { expect, test } from "./fixtures.js";

// The formula assist showcase: ghost text in the formula bar and its keys.

test("suggests a row total from its neighbours, Tab takes it, and = on the filled cell starts again @portability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/showcases/formula-assist/");
  const target = page.getByRole("button", { name: "Finance's total" });
  const bar = page.getByRole("textbox", { name: "Formula bar" });
  const ghost = page.locator(".sheetwrite-formula-ghost");
  await target.click();
  await expect(bar).toBeFocused();
  await page.keyboard.type("=");
  await expect(ghost).toHaveText("SUM(B6:G6)");
  await page.keyboard.press("Tab");
  await expect(bar).toHaveValue("=SUM(B6:G6)");
  await expect(ghost).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(bar).toHaveValue("=SUM(B6:G6)");

  await target.click();
  await page.keyboard.type("=");
  await expect(bar).toHaveValue("=");
  await expect(ghost).toHaveText("SUM(B6:G6)");
});
