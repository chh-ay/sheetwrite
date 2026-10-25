import { expect, it } from "bun:test";

import { fitRibbon, ribbonFitSteps, type RibbonFitStep } from "../src/ribbon/ribbon-fit.js";

const order = [
  { id: "editing", shrinks: true },
  { id: "number", shrinks: false },
  { id: "clipboard", shrinks: true },
];

it("shrinks every flow group before collapsing any group, in reduce order", () => {
  expect(ribbonFitSteps(order).map((step) => `${step.id}:${step.size}`)).toEqual([
    "editing:medium",
    "clipboard:medium",
    "editing:small",
    "clipboard:small",
    "editing:collapsed",
    "number:collapsed",
    "clipboard:collapsed",
  ]);
});

it("applies only the steps needed to fit, and all of them when nothing fits", () => {
  const steps = ribbonFitSteps(order);
  const applied: RibbonFitStep[] = [];
  const fitsAfter = (count: number) => () => applied.length >= count;

  expect(fitRibbon(steps, (step) => applied.push(step), fitsAfter(0))).toBe(0);
  expect(fitRibbon(steps, (step) => applied.push(step), fitsAfter(3))).toBe(3);
  expect(applied.map((step) => step.id)).toEqual(["editing", "clipboard", "editing"]);

  applied.length = 0;
  expect(
    fitRibbon(
      steps,
      (step) => applied.push(step),
      () => false,
    ),
  ).toBe(steps.length);
});
