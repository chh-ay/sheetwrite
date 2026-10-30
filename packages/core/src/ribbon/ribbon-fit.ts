// Excel-style ribbon scaling as pure functions: which group shrinks next as
// the ribbon narrows. The DOM side applies a step and measures; this module
// only decides the order, so it is tested without layout.

/**
 * How a group renders: `large` buttons with labels below; `medium` small
 * icons with labels beside them, stacked three high; `small` icons only;
 * `collapsed` one button that opens the whole group in a popup.
 */
type RibbonGroupSize = "large" | "medium" | "small" | "collapsed";

export interface RibbonFitGroup {
  readonly id: string;
  /** Dense row layouts cannot shrink, only collapse. */
  readonly shrinks: boolean;
}

export interface RibbonFitStep {
  readonly id: string;
  readonly size: RibbonGroupSize;
}

const SHRINK_SIZES: readonly RibbonGroupSize[] = ["medium", "small"];

/**
 * Reductions in the order Excel applies them: every group, taken in
 * `reduceOrder`, gives up one size before any group gives up the next. So all
 * groups shrink before any group collapses, and the first groups in the order
 * shrink and collapse first.
 */
export function ribbonFitSteps(reduceOrder: readonly RibbonFitGroup[]): RibbonFitStep[] {
  const steps: RibbonFitStep[] = [];
  for (const size of SHRINK_SIZES) {
    for (const group of reduceOrder) if (group.shrinks) steps.push({ id: group.id, size });
  }
  for (const group of reduceOrder) steps.push({ id: group.id, size: "collapsed" });
  return steps;
}

/**
 * Apply steps until the content fits. Returns how many steps were applied;
 * when even the last step does not fit, every step stays applied and the
 * ribbon scrolls.
 */
export function fitRibbon(
  steps: readonly RibbonFitStep[],
  apply: (step: RibbonFitStep) => void,
  fits: () => boolean,
): number {
  let applied = 0;
  while (applied < steps.length && !fits()) {
    const step = steps[applied];
    if (step === undefined) break;
    apply(step);
    applied += 1;
  }
  return applied;
}
