import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

import { EditController, type EditRect } from "../src/editor.js";
import { DEFAULT_THEME } from "../src/index.js";
import { installCoreStyles } from "./fixtures.js";

const CELL: EditRect = { x: 10, y: 20, w: 80, h: 24 };
/** The editor's 2 px top and bottom borders (grid.css); it has no vertical padding. */
const BORDERS = 4;
/** The editor sets its line height to the cell's height less its borders. */
const LINE_HEIGHT = CELL.h - BORDERS;
const MAX_VISIBLE_LINES = 8;

let remove_styles: () => void = () => {};

beforeAll(() => {
  remove_styles = installCoreStyles();
});

afterAll(() => {
  remove_styles();
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** Calls to `getComputedStyle` and reads of an element's box, while `run` runs. */
interface LayoutReads {
  styles: number;
  boxes: number;
}

const BOX_PROPERTIES = ["offsetHeight", "clientHeight"] as const;

function count_layout_reads(run: () => void): LayoutReads {
  const reads: LayoutReads = { styles: 0, boxes: 0 };
  const computed_style = window.getComputedStyle;
  window.getComputedStyle = (element, pseudo) => {
    reads.styles++;
    return computed_style.call(window, element, pseudo);
  };
  const restores = BOX_PROPERTIES.map((property) => {
    let owner: object | null = HTMLTextAreaElement.prototype;
    while (owner !== null && !Object.hasOwn(owner, property)) owner = Object.getPrototypeOf(owner);
    const descriptor =
      owner === null ? undefined : Object.getOwnPropertyDescriptor(owner, property);
    const read = descriptor?.get;
    if (owner === null || descriptor === undefined || read === undefined) {
      throw new Error(`no ${property} getter to observe`);
    }
    Object.defineProperty(owner, property, {
      ...descriptor,
      get(this: HTMLElement) {
        reads.boxes++;
        return read.call(this);
      },
    });
    return () => Object.defineProperty(owner, property, descriptor);
  });
  try {
    run();
  } finally {
    window.getComputedStyle = computed_style;
    for (const restore of restores) restore();
  }
  return reads;
}

function open_editor(initial: string): HTMLTextAreaElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  new EditController(host).begin({
    row: 0,
    col: 0,
    type: "text",
    initial,
    selectAll: false,
    entering: false,
    rect: CELL,
    label: "Edit A, row 1",
    theme: DEFAULT_THEME,
    focus: true,
    onText: () => {},
    onCommit: () => {},
    onCancel: () => {},
  });
  const textarea = host.querySelector("textarea.sheetwrite-editor");
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("editor textarea missing");
  return textarea;
}

function type(textarea: HTMLTextAreaElement, text: string): void {
  textarea.value = text;
  textarea.dispatchEvent(new Event("input"));
}

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
}

describe("the cell editor's height", () => {
  it("is the cell's on one line, and opening reads no style or layout", () => {
    let textarea: HTMLTextAreaElement | undefined;
    const reads = count_layout_reads(() => {
      textarea = open_editor("Customer 2");
    });
    expect(reads).toEqual({ styles: 0, boxes: 0 });
    expect(textarea?.style.height).toBe(`${CELL.h}px`);
  });

  it("grows with each explicit line up to eight, and shrinks back", () => {
    const textarea = open_editor(lines(3));
    expect(textarea.style.height).toBe(`${3 * LINE_HEIGHT + BORDERS}px`);
    type(textarea, lines(MAX_VISIBLE_LINES + 4));
    expect(textarea.style.height).toBe(`${MAX_VISIBLE_LINES * LINE_HEIGHT + BORDERS}px`);
    type(textarea, "one line");
    expect(textarea.style.height).toBe(`${CELL.h}px`);
  });

  it("reads the field's style once per open, and never its box", () => {
    const textarea = open_editor("one line");
    const reads = count_layout_reads(() => {
      type(textarea, lines(2));
      type(textarea, lines(5));
      type(textarea, lines(3));
    });
    expect(reads).toEqual({ styles: 1, boxes: 0 });
  });
});
