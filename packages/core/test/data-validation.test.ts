import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { validationPatches } from "../src/data-validation-command.js";
import { type GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DataValidationRule, Range } from "../src/types.js";
import { answerDialog, elementAdded, mountGridWithData } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
  document.body.replaceChildren();
});

function range(r0: number, c0: number, r1: number, c1: number): Range {
  return { sheet: "s1", start: { row: r0, col: c0 }, end: { row: r1, col: c1 } };
}

/** Type `text` into the cell at view `row`, `col` and press Enter. */
function enter(host: HTMLElement, grid: GridImpl, row: number, col: number, text: string): void {
  grid.beginEdit(row, col, text);
  host
    .querySelector("textarea.sheetwrite-editor")
    ?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
}

/** Let a lazily loaded alert open, if one does. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("data validation rules with formulas", () => {
  it("takes a list's items from a range and follows edits to it", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule({
      id: "city",
      range: range(0, 0, 9, 0),
      condition: { kind: "list", source: "=$C$1:$C$3" },
      policy: "reject",
    });
    // C1:C3 hold Phnom Penh, Tokyo and Berlin; Excel compares without case.
    enter(host, grid, 0, 0, "tokyo");
    await settle();
    expect(host.querySelector(".sheetwrite-dialog")).toBeNull();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("tokyo");

    enter(host, grid, 1, 0, "Paris");
    await answerDialog(host, "Cancel");
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("Customer 1");

    enter(host, grid, 2, 2, "Paris");
    enter(host, grid, 1, 0, "Paris");
    await settle();
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("Paris");
    grid.destroy();
    store.dispose();
  });

  it("takes a list from a defined name", () => {
    const { grid, store } = mountGridWithData(10);
    store.applyTransaction({
      patches: [{ op: "setNamedRange", namedRange: { name: "Cities", range: range(0, 2, 2, 2) } }],
    });
    grid.setValidationRule({
      id: "city",
      range: range(0, 0, 9, 0),
      condition: { kind: "list", source: "=Cities" },
      policy: "reject",
    });
    const set = (value: string) =>
      store.applyTransaction({
        patches: [
          { op: "set", addr: { sheet: "s1", row: 4, col: 0 }, value: { kind: "literal", value } },
        ],
      }).status;
    expect(set("Berlin")).toBe("applied");
    expect(set("Paris")).toBe("rejected");
    grid.destroy();
    store.dispose();
  });

  it("checks formula bounds and a custom formula in each cell", async () => {
    const { grid, host, store } = mountGridWithData(10);
    // B holds 0.5, 10.5, 20.5…: each value must stay below the cell above it plus 100.
    grid.setValidationRule({
      id: "bound",
      range: range(1, 1, 9, 1),
      condition: { kind: "number", comparison: { operator: "lessThan", value: "=B1+100" } },
      policy: "reject",
    });
    enter(host, grid, 1, 1, "100");
    await settle();
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe(100);
    enter(host, grid, 2, 1, "300");
    await answerDialog(host, "Cancel");
    expect(store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBe(20.5);

    // Excel's "no duplicates" rule sees the typed value in its cell.
    grid.setValidationRule({
      id: "unique",
      range: range(0, 0, 9, 0),
      condition: { kind: "custom", formula: "=COUNTIF($A$1:$A$10,A1)=1" },
      policy: "reject",
    });
    enter(host, grid, 3, 0, "Customer 1");
    await answerDialog(host, "Cancel");
    expect(store.getCell({ sheet: "s1", row: 3, col: 0 }).resolved).toBe("Customer 3");
    enter(host, grid, 3, 0, "Someone new");
    await settle();
    expect(store.getCell({ sheet: "s1", row: 3, col: 0 }).resolved).toBe("Someone new");
    grid.destroy();
    store.dispose();
  });

  it("moves a rule's formulas with inserted rows", () => {
    const { grid, store } = mountGridWithData(10);
    grid.setValidationRule({
      id: "city",
      range: range(0, 0, 3, 0),
      condition: { kind: "list", source: "=$C$5:$C$7" },
      policy: "reject",
    });
    grid.insertRows(0, 2);
    const rule = store.getWorkbook().sheets[0]?.validationRules?.[0];
    expect(rule?.range).toEqual(range(2, 0, 5, 0));
    expect(rule?.condition).toEqual({ kind: "list", source: "=$C$7:$C$9" });
    grid.destroy();
    store.dispose();
  });
});

describe("Data Validation command", () => {
  const settings = {
    condition: { kind: "list", values: ["Open", "Closed"] },
    policy: "reject",
  } satisfies Omit<DataValidationRule, "id" | "range">;

  it("splits a rule around the selection and gives the selection its own rule", () => {
    const existing: DataValidationRule = {
      id: "validation-1",
      range: range(0, 0, 9, 0),
      ...settings,
    };
    const patches = validationPatches(
      "s1",
      [existing],
      [range(3, 0, 4, 0)],
      { condition: { kind: "any" }, policy: "reject", inputMessage: "Note" },
      undefined,
    );
    expect(patches).toEqual([
      { op: "setValidationRule", sheet: "s1", rule: { ...existing, range: range(0, 0, 2, 0) } },
      {
        op: "setValidationRule",
        sheet: "s1",
        rule: { ...existing, id: "validation-2", range: range(5, 0, 9, 0) },
      },
      {
        op: "setValidationRule",
        sheet: "s1",
        rule: {
          condition: { kind: "any" },
          policy: "reject",
          inputMessage: "Note",
          id: "validation-3",
          range: range(3, 0, 4, 0),
        },
      },
    ]);
    // Apply to all changes the rule itself; Clear All removes it.
    expect(validationPatches("s1", [existing], [range(3, 0, 4, 0)], null, existing)).toEqual([
      { op: "removeValidationRule", sheet: "s1", id: "validation-1" },
    ]);
  });

  it("creates a list rule from the dialog and edits it again", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setSelection({ kind: "range", range: range(0, 2, 4, 2) });
    grid.actions.dataValidation();
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDivElement);
    expect(dialog.querySelector(".sheetwrite-dialog-title")?.textContent).toBe("Data Validation");
    const [allow] = [...dialog.querySelectorAll("select")];
    if (!allow) throw new Error("expected the Allow box");
    allow.value = "list";
    allow.dispatchEvent(new Event("change"));
    const source = [...dialog.querySelectorAll<HTMLInputElement>("input")].find(
      (input) => input.closest("label")?.textContent?.startsWith("Source") === true,
    );
    if (!source) throw new Error("expected the Source box");
    source.value = "North,South";
    await answerDialog(host, "OK");
    expect(store.getWorkbook().sheets[0]?.validationRules).toEqual([
      {
        id: "validation-1",
        range: range(0, 2, 4, 2),
        condition: { kind: "list", values: ["North", "South"] },
        policy: "reject",
      },
    ]);

    // The rule covers more than C1, so a second change of C1 alone asks nothing and splits it.
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 2 } });
    grid.actions.dataValidation();
    await answerDialog(host, "Clear All");
    await answerDialog(host, "OK");
    expect(store.getWorkbook().sheets[0]?.validationRules?.map((rule) => rule.range)).toEqual([
      range(1, 2, 4, 2),
    ]);
    grid.undo();
    expect(store.getWorkbook().sheets[0]?.validationRules?.map((rule) => rule.range)).toEqual([
      range(0, 2, 4, 2),
    ]);
    grid.destroy();
    store.dispose();
  });

  it("asks before it erases several kinds of rule", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule({ id: "a", range: range(0, 0, 0, 0), ...settings });
    grid.setValidationRule({
      id: "b",
      range: range(1, 0, 1, 0),
      condition: { kind: "number", min: 1 },
      policy: "warn",
    });
    grid.setSelection({ kind: "range", range: range(0, 0, 1, 0) });
    grid.actions.dataValidation();
    const question = await elementAdded(host, ".sheetwrite-dialog", HTMLDivElement);
    expect(question.textContent).toContain("more than one type of validation");
    await answerDialog(host, "No");
    expect(host.querySelector(".sheetwrite-dialog")).toBeNull();
    expect(store.getWorkbook().sheets[0]?.validationRules).toHaveLength(2);
    grid.destroy();
    store.dispose();
  });
});
