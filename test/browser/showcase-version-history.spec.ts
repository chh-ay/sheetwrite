import { expect, test } from "./fixtures.js";

test("a compare lists each author's changes and a restore brings the version back", async ({
  page,
}) => {
  await page.goto("/showcases/version-history/");
  const controls = page.getByRole("complementary", { name: "Controls" });
  const changes = page.getByTestId("history-changes").locator("li");
  await expect(controls.getByText("Budget approved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await controls.getByRole("button", { name: "Raise Marketing by 15%" }).click();
  await expect(page.getByTestId("history-server-version")).toHaveText("1");
  await controls.getByRole("button", { name: /cuts Travel/ }).click();
  await expect(page.getByTestId("history-server-version")).toHaveText("3");

  await controls.getByRole("button", { name: "Compare with now" }).click();
  await expect(changes).toHaveCount(3);
  await expect(changes.filter({ hasText: "You" })).toHaveCount(1);
  await expect(changes.filter({ hasText: "Sam Lee" })).toHaveCount(2);

  // Restoring Q3 and Q4 undoes Sam's cuts and keeps your Q2 change.
  await controls.getByRole("button", { name: "Restore Q3 and Q4" }).click();
  await controls.getByRole("button", { name: "Compare with now" }).click();
  await expect(changes).toHaveCount(1);
  await expect(changes.first()).toContainText("You");

  await controls.getByRole("button", { name: "Save version" }).click();
  await expect(controls.getByText("Revision 1")).toBeVisible();
});
