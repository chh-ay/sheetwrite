import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

import { FormulaAssist } from "../src/formula-assist.js";
import type { AssistDeps } from "../src/formula-help.js";
import { setFormulaSuggester } from "../src/formula-suggestions.js";
import { initSheetwrite, SheetwriteStore } from "../src/index.js";
import type { FormulaSuggester } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

// Ghost text in the formula bar (#801): a formula suggester's suggestion,
// drawn dimmed after the caret and taken with Tab, Ctrl+→ or dismissed with Esc.

/** Formula help loads its chunk and the function table asynchronously. */
const LOAD_TIMEOUT_MS = 2_000;
const POLL_MS = 5;

let store: SheetwriteStore;
/** What the suggester was told, in order. */
let feedback: string[] = [];
/** The suggester's answer for each typed text. */
let answers = new Map<string, string>();
let removeSuggester: () => void = () => undefined;

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
  removeSuggester = setFormulaSuggester(store, suggester);
});

afterAll(() => {
  removeSuggester();
  store.dispose();
});

afterEach(() => {
  document.body.innerHTML = "";
  feedback = [];
  answers = new Map();
});

async function waitFor(isReady: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (!isReady()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(POLL_MS);
  }
}

function keydown(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
}

function ghostText(): string | null {
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
  await waitFor(() => document.querySelector(".sheetwrite-formula-help") !== null, "formula help");
  return { textarea, assist, type };
}

describe("ghost text", () => {
  it("draws the suggestion after the text and takes it with Tab", async () => {
    const { textarea, type } = await field(true);
    answers.set("=B4*", "C4");
    type("=B4*");
    expect(ghostText()).toBe("C4");

    textarea.dispatchEvent(keydown("Tab"));
    expect(textarea.value).toBe("=B4*C4");
    expect(feedback).toEqual(["accept"]);
    expect(ghostText()).toBeNull();
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
    answers.set("=B4*C", "4");
    type("=B4*");

    textarea.dispatchEvent(keydown("Escape"));
    expect(ghostText()).toBeNull();
    expect(feedback).toEqual(["dismiss"]);
    expect(textarea.value).toBe("=B4*");

    type("=B4*C");
    expect(ghostText()).toBe("4");
  });

  it("shows nothing while the function list is open unless an entry inserts the same text", async () => {
    const { type } = await field(true);
    answers.set("=VL", "OOKUP(");
    await waitFor(() => {
      type("=VL");
      return document.querySelector('[role="option"]') !== null;
    }, "the function list");
    expect(ghostText()).toBe("OOKUP(");

    answers.set("=SU", "MPRODUCT(A1:A3)");
    type("=SU");
    expect(ghostText()).toBeNull();

    answers.set("=SU", "MPRODUCT(");
    type("=SU");
    expect(ghostText()).toBe("MPRODUCT(");
    expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent).toBe(
      "SUMPRODUCT",
    );
  });

  it("moves to the next argument on Tab when the call still lacks a required one", async () => {
    const { textarea, type } = await field(true);
    await waitFor(() => {
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
    expect(ghostText()).toBeNull();

    const tab = keydown("Tab");
    textarea.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });
});
