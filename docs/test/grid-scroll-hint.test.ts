import { afterEach, beforeEach, expect, it } from "bun:test";

import { installGridScrollHints } from "../src/lib/grid-scroll-hint.js";
import {
  installRecordingResizeObserver,
  RecordingResizeObserver,
} from "./resize-observer-recorder.js";

let restoreResizeObserver: () => void = () => {};

beforeEach(() => {
  restoreResizeObserver = installRecordingResizeObserver();
  document.body.replaceChildren();
});

afterEach(() => {
  restoreResizeObserver();
  document.body.replaceChildren();
});

it("stops observing every node of a Grid that leaves the page", async () => {
  const viewport = document.createElement("div");
  viewport.innerHTML = '<div class="sheetwrite-scroller"><div class="sizer"></div></div>';
  document.body.append(viewport);
  const uninstall = installGridScrollHints();
  expect(RecordingResizeObserver.observed.size).toBe(2);

  viewport.remove();
  // Mutation observers report in a microtask after the DOM change.
  await Promise.resolve();

  expect(RecordingResizeObserver.observed.size).toBe(0);
  uninstall();
});
