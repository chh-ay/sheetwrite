import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

import { FormulaAssist } from "../src/formula-assist.js";
import type { AssistDeps } from "../src/formula-help.js";
import { setFormulaSuggester } from "../src/formula-suggestions.js";
import { initSheetwrite, SheetwriteStore } from "../src/index.js";
import type { FormulaSuggester } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

// Ghost text in the formula bar: a formula suggester's suggestion, drawn
// dimmed after the caret, taken with Tab or Ctrl+→ and dismissed with Esc.

/** Formula help loads its chunk and the function table asynchronously. */
const LOAD_TIMEOUT_MS = 2_000;
const POLL_MS = 5;

let store: SheetwriteStore;
/** What the suggester was told, in order. */
let feedback: string[] = [];
/** The suggester's answer for each typed text. */
let answers = new Map<string, string>();
let remove_suggester: () => void = () => undefined;

const suggester: FormulaSuggester = {
  open: () => ({
    suggest: (text) => {
      const answer = answers.get(text);
      return answer === undefined ? null : { text: answer };
    },
    feedback: (event) => {
      feedback.push(event);
    },
    close: () => undefined,
  }),
};

beforeAll(async () => {
  await initSheetwrite();
  store = new SheetwriteStore(makeWorkbook(2));
  remove_suggester = setFormulaSuggester(store, suggester);
});

afterAll(() => {
  remove_suggester();
  store.dispose();
});

afterEach(() => {
  document.body.innerHTML = "";
  feedback = [];
  answers = new Map();
});

async function wait_for(is_ready: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (!is_ready()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(POLL_MS);
  }
}

function keydown(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
}

function ghost_text(): string | null {
  return document.querySelector(".sheetwrite-formula-ghost")?.textContent ?? null;
}

/** A field with formula help, as the formula bar (`suggestions`) or the cell editor sets it up. */
async function field(suggestions: boolean): Promise<{
  textarea: HTMLTextAreaElement;
  assist: FormulaAssist;
  type: (text: string) => void;
}> {
  const textarea = document.createElement("textarea");
  document.body.appendChild(textarea);
  const deps: AssistDeps = {
    highlightCells: () => undefined,
    sheet: () => "s1",
    cell: () => ({ sheet: "s1", row: 4, col: 1 }),
    store,
    suggestions,
  };
  const assist = new FormulaAssist(deps);
  textarea.addEventListener("input", () => assist.update());
  textarea.addEventListener("keydown", (event) => assist.handleKeyDown(event));
  textarea.focus();
  assist.attach(textarea, null);

  const type = (text: string): void => {
    textarea.value = text;
    textarea.setSelectionRange(text.length, text.length);
    textarea.dispatchEvent(new Event("input"));
  };
  // The help chunk loads on the first formula; the function list after it.
  type("=");
  await wait_for(() => document.querySelector(".sheetwrite-formula-help") !== null, "formula help");
  return { textarea, assist, type };
}

describe("ghost text", () => {
  it("draws the suggestion after the text and takes it with Tab", async () => {
    const { textarea, type } = await field(true);
    answers.set("=B4*", "C4");
    type("=B4*");
    expect(ghost_text()).toBe("C4");

    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=B4*C4");
    expect(feedback).toEqual(["accept"]);
    expect(ghost_text()).toBeNull();
  });

  it("takes one word with Ctrl+→: a whole reference", async () => {
    const { textarea, type } = await field(true);
    answers.set("=SUM(", "Sheet2!A1:A9)");
    type("=SUM(");

    textarea.dispatchEvent(keydown("ArrowRight", { ctrlKey: true }));
    expect(textarea.value).toBe("=SUM(Sheet2!A1:A9");
    expect(feedback).toEqual(["accept-word"]);
  });

  it("hides the suggestion on Esc until the text changes, and tells the suggester", async () => {
    const { textarea, type } = await field(true);
    answers.set("=B4*", "C4");
    answers.set("=B4+", "C4");
    type("=B4*");

    textarea.dispatchEvent(keydown("Escape"));
    expect(ghost_text()).toBeNull();
    expect(feedback).toEqual(["dismiss"]);
    expect(textarea.value).toBe("=B4*");

    type("=B4+");
    expect(ghost_text()).toBe("C4");
  });

  /** Type `=VL` until the function list shows: the list loads after formula help. */
  async function list_loaded(type: (text: string) => void): Promise<void> {
    await wait_for(() => {
      type("=VL");
      return document.querySelector('[role="option"]') !== null;
    }, "the function list");
  }

  function active_entry(): string | null {
    return document.querySelector('[role="option"][aria-selected="true"]')?.textContent ?? null;
  }

  it("shows a suggestion while the function list is open when it starts with an entry's text", async () => {
    const { textarea, type } = await field(true);
    await list_loaded(type);

    answers.set("=SU", "MPRODUCT(A1:A3)");
    type("=SU");
    expect(ghost_text()).toBe("MPRODUCT(A1:A3)");
    expect(active_entry()).toBe("SUMPRODUCT");
    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=SUMPRODUCT(A1:A3)");

    // No entry starts a new suggestion: Tab stays the list's, as in Excel.
    answers.set("=B", "4*C4");
    type("=B");
    expect(ghost_text()).toBeNull();
  });

  it("keeps the suggestion while the user types it, also when the function list opens", async () => {
    const { textarea, type } = await field(true);
    await list_loaded(type);

    answers.set("=", "SUM(B2:B4)");
    type("=");
    expect(ghost_text()).toBe("SUM(B2:B4)");
    type("=S");
    expect(ghost_text()).toBe("UM(B2:B4)");
    type("=Su");
    expect(ghost_text()).toBe("M(B2:B4)");
    expect(active_entry()).toBe("SUM");
    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=SuM(B2:B4)");

    answers.set("=", "B4*C4");
    type("=");
    type("=B");
    expect(ghost_text()).toBe("4*C4");
    type("=B5");
    expect(ghost_text()).toBeNull();
  });

  it("gives Tab to the function list once the user moves to another entry", async () => {
    const { textarea, type } = await field(true);
    await list_loaded(type);

    answers.set("=", "SUM(B2:B4)");
    type("=");
    type("=S");
    textarea.dispatchEvent(keydown("ArrowDown"));
    const entry = active_entry();
    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe(`=${entry}(`);
  });

  it("moves to the next argument on Tab when the call still lacks a required one", async () => {
    const { textarea, type } = await field(true);
    await wait_for(() => {
      type("=VLOOKUP(A2");
      return document.querySelector(".sheetwrite-formula-signature") !== null;
    }, "the argument guide");

    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=VLOOKUP(A2,");

    type("=VLOOKUP(A2,B:C,2");
    const tab = keydown("Tab");
    textarea.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(textarea.value).toBe("=VLOOKUP(A2,B:C,2");
  });

  it("stays off in fields that don't show suggestions, such as the cell editor", async () => {
    const { textarea, type } = await field(false);
    answers.set("=B4*", "C4");
    type("=B4*");
    expect(ghost_text()).toBeNull();

    const tab = keydown("Tab");
    textarea.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });
});
