import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

import { EditController } from "../src/editor.js";
import { FormulaAssist } from "../src/formula-assist.js";
import type { AssistDeps } from "../src/formula-help.js";
import { DEFAULT_THEME, initSheetwrite, SheetwriteStore } from "../src/index.js";
import type { HighlightRange } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

/** Formula help loads its chunk and the function table asynchronously. */
const LOAD_TIMEOUT_MS = 2_000;
const POLL_MS = 5;

let store: SheetwriteStore;
const SALES_UNITS = {
  name: "SalesUnits",
  range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 1, col: 1 } },
};

beforeAll(async () => {
  await initSheetwrite();
  store = new SheetwriteStore(makeWorkbook(2));
});

afterAll(() => {
  store.dispose();
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function waitFor(isReady: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (!isReady()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(POLL_MS);
  }
}

function keydown(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
}

// The help layer goes to the field's offset parent, which is the body in tests.
function itemsOf(): string[] {
  return [...document.querySelectorAll('[role="option"]')].map((el) => el.textContent ?? "");
}

function selectedItem(): string | null {
  return document.querySelector('[role="option"][aria-selected="true"]')?.textContent ?? null;
}

function deps(highlights: (HighlightRange[] | null)[] = [], source = store): AssistDeps {
  return {
    highlightCells: (ranges) => {
      highlights.push(ranges);
    },
    sheet: () => "s1",
    cell: () => ({ sheet: "s1", row: 0, col: 0 }),
    store: source,
  };
}

/** A cell editor with formula help, as the grid builds it, after `begin`. */
function beginEdit(source = store): {
  editor: EditController;
  textarea: HTMLTextAreaElement;
  state: { cancelled: boolean; committed: string | null; highlights: (HighlightRange[] | null)[] };
} {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const state = {
    cancelled: false,
    committed: null as string | null,
    highlights: [] as (HighlightRange[] | null)[],
  };

  const editor = new EditController(host, deps(state.highlights, source));
  editor.begin({
    row: 0,
    col: 0,
    type: "text",
    initial: "",
    selectAll: false,
    entering: false,
    rect: { x: 10, y: 20, w: 80, h: 24 },
    label: "Edit A, row 1",
    theme: DEFAULT_THEME,
    focus: true,
    onText: () => {},
    onCommit: (value) => {
      state.committed = value;
    },
    onCancel: () => {
      state.cancelled = true;
    },
  });

  const textarea = document.querySelector("textarea.sheetwrite-editor");
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("editor textarea missing");
  return { editor, textarea, state };
}

function type(textarea: HTMLTextAreaElement, text: string, caret = text.length): void {
  textarea.value = text;
  textarea.setSelectionRange(caret, caret);
  textarea.dispatchEvent(new Event("input"));
}

/** Type `text` and wait until the help lists `name`. */
async function typeUntilListed(
  textarea: HTMLTextAreaElement,
  text: string,
  name: string,
): Promise<void> {
  type(textarea, text);
  await waitFor(() => itemsOf().includes(name), `${name} in the function list`);
}

describe("formula help loading", () => {
  it("lets keys through to the editor until the help has loaded", () => {
    const assist = new FormulaAssist(deps());
    expect(assist.handleKeyDown(keydown("Enter"))).toBe(false);
    expect(assist.isOpen).toBe(false);
  });
});

describe("function list", () => {
  it("moves with the arrow keys, wraps, and accepts with Enter", async () => {
    const { textarea } = beginEdit();
    await typeUntilListed(textarea, "=CO", "COUNT");
    const items = itemsOf();
    expect(items.length).toBeGreaterThan(2);

    textarea.dispatchEvent(keydown("ArrowDown"));
    expect(selectedItem()).toBe(items[1] ?? "missing");
    textarea.dispatchEvent(keydown("ArrowUp"));
    textarea.dispatchEvent(keydown("ArrowUp"));
    expect(selectedItem()).toBe(items.at(-1) ?? "missing");

    textarea.dispatchEvent(keydown("Enter"));
    expect(textarea.value).toBe(`=${items.at(-1)}(`);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("closes on the first Escape and cancels the edit on the second", async () => {
    const { editor, textarea, state } = beginEdit();
    await typeUntilListed(textarea, "=SUM(A", "ABS");

    textarea.dispatchEvent(keydown("Escape"));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(editor.isEditing).toBe(true);

    textarea.dispatchEvent(keydown("Escape"));
    expect(state.cancelled).toBe(true);
    expect(state.highlights.at(-1)).toBeNull();
  });

  // https://support.microsoft.com/en-us/excel/use-formula-autocomplete
  it("lists names, tables, table columns and argument values, with Excel's argument names", async () => {
    const workbook = makeWorkbook(2);
    const sheet = workbook.sheets[0]!;
    const named = new SheetwriteStore({
      ...workbook,
      namedRanges: [SALES_UNITS],
      sheets: [
        {
          ...sheet,
          tables: [
            {
              id: "orders",
              name: "Orders",
              range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 2 } },
              columns: [
                { id: "name", name: "Name" },
                { id: "amount", name: "Amount" },
                { id: "city", name: "City" },
              ],
              headerRow: true,
              totalsRow: false,
            },
          ],
        },
      ],
    });
    const { textarea } = beginEdit(named);
    await typeUntilListed(textarea, "=Sa", "SalesUnits");
    type(textarea, "=Orders[A");
    expect(itemsOf()).toEqual(["Amount"]);

    type(textarea, "=VLOOKUP(A1,A1:B3,2,");
    expect(itemsOf()).toEqual(["TRUE - Approximate match", "FALSE - Exact match"]);
    textarea.dispatchEvent(keydown("ArrowDown"));
    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=VLOOKUP(A1,A1:B3,2,FALSE");

    type(textarea, "=SUMIF(");
    const guide = document.querySelector(".sheetwrite-formula-signature")?.textContent;
    expect(guide).toBe("SUMIF(range, criteria, [sum_range])");
    named.dispose();
  });
});

describe("reference colours", () => {
  it("fills each referenced range in the colour of its text, and clears on commit", async () => {
    const { editor, textarea, state } = beginEdit();
    await typeUntilListed(textarea, "=SU", "SUM");

    type(textarea, "=SUM(A1:B2)+C3+'Sheet 1'!A1:B2+Missing!A1");

    const ranges = state.highlights.at(-1) ?? [];
    expect(ranges.map(({ sheet, start, end }) => ({ sheet, start, end }))).toEqual([
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      { sheet: "s1", start: { row: 2, col: 2 }, end: { row: 2, col: 2 } },
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    ]);
    const [first, second, sameSheet] = ranges;
    expect(first?.color).not.toBe(second?.color);
    expect(sameSheet?.color).not.toBe(first?.color);

    const mirrored = [...document.querySelectorAll<HTMLElement>(".sheetwrite-formula-mirror span")];
    const a1b2 = mirrored.find((span) => span.textContent === "A1:B2");
    expect(a1b2?.style.color).toBeTruthy();
    expect(first?.color?.startsWith(a1b2!.style.color)).toBe(true);

    editor.commit("down");
    expect(state.committed).toBe("=SUM(A1:B2)+C3+'Sheet 1'!A1:B2+Missing!A1");
    expect(state.highlights.at(-1)).toBeNull();
    expect(document.querySelector(".sheetwrite-formula-mirror")).toBeNull();
  });
});

describe("result preview", () => {
  it("shows the result once typing pauses, and nothing for an unfinished formula", async () => {
    const { textarea } = beginEdit();
    const preview = () => document.querySelector(".sheetwrite-formula-preview")?.textContent ?? "";

    type(textarea, "=ROUND(1/3,2)*3");
    await waitFor(() => preview() === "= 0.99", "the preview of a value");
    expect(textarea.getAttribute("aria-describedby")).toContain(
      document.querySelector(".sheetwrite-formula-preview")?.id ?? "missing",
    );

    type(textarea, "=SEQUENCE(2,3,5)");
    await waitFor(() => preview() === "= 5 … (2 × 3 array)", "the preview of an array");

    type(textarea, "=RAND()");
    await waitFor(() => preview().startsWith("No preview"), "a refused preview");

    type(textarea, "=ROUND(");
    expect(preview()).toBe("");
  });

  // Excel shows no result while a function name is still being typed (#1001).
  it("shows nothing while the name at the caret is unfinished", async () => {
    const { textarea } = beginEdit();
    const preview = () => document.querySelector(".sheetwrite-formula-preview")?.textContent ?? "";

    await typeUntilListed(textarea, "=AVER", "AVERAGE");
    // Longer than the pause after which the preview calculates.
    await Bun.sleep(300);
    expect(preview()).toBe("");

    type(textarea, "=AVERAGE(1,3)");
    await waitFor(() => preview() === "= 2", "the preview once the call is written");
  });
});

describe("fixes for live errors", () => {
  it("offers the fix under the error and applies it with Tab or a click", async () => {
    const named = new SheetwriteStore({ ...makeWorkbook(2), namedRanges: [SALES_UNITS] });
    const { textarea } = beginEdit(named);
    const fix = () => document.querySelector<HTMLButtonElement>(".sheetwrite-formula-fix");
    await typeUntilListed(textarea, "=SU", "SUM");

    type(textarea, "=SUMM(A1:A3)");
    expect(fix()?.textContent).toBe("Did you mean SUM?");
    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=SUM(A1:A3)");
    expect(fix()).toBeNull();

    type(textarea, "=SUM(A1:A3))+1");
    expect(fix()?.textContent).toBe("Remove the extra )");
    fix()?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(textarea.value).toBe("=SUM(A1:A3)+1");

    // The caret away from the end, where a missing ) shows, and outside the name SUM.
    type(textarea, "=SUM(A1:A3", 5);
    expect(fix()?.textContent).toBe("Add the missing )");
    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=SUM(A1:A3)");

    type(textarea, "=SalesUnit*2");
    expect(fix()?.textContent).toBe("Did you mean SalesUnits?");
    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=SalesUnits*2");
    named.dispose();
  });

  it("commits the fixed formula on Enter, as without a fix", async () => {
    const { textarea, state } = beginEdit();
    await typeUntilListed(textarea, "=SU", "SUM");

    type(textarea, "=SUMM(A1:A3)");
    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=SUM(A1:A3)");
    // The caret now ends the name SUM, but the fix opens no function list.
    expect(itemsOf()).toEqual([]);
    textarea.dispatchEvent(keydown("Enter"));
    expect(state.committed).toBe("=SUM(A1:A3)");
  });
});
