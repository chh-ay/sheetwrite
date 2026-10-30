// What every renderer of the command model shares: the context its controls
// run in, and one refresh pass over its controls. The full ribbon, the compact
// ribbon and the toolbar differ only in layout.

import { actionFeedbackFor } from "../action-feedback.js";
import { fontShorthandParts } from "../format-presets.js";
import type { Grid, IconOverrides } from "../types/grid.js";
import type { RibbonFocus } from "./command-spec.js";
import type { RibbonCommandStates, RibbonContext, RibbonControlView } from "./ribbon-controls.js";
import type { RibbonPopup } from "./ribbon-popup.js";

/** One style read and one theme-font parse, shared by every value box. */
function readFocus(grid: Grid): RibbonFocus {
  const themeFont = fontShorthandParts(grid.getTheme().font);
  return {
    style: grid.getFocusCellStyle(),
    themeFontFamily: themeFont.family,
    themeFontPx: themeFont.px,
  };
}

export interface CommandContextOptions {
  readonly grid: Grid;
  readonly popup: RibbonPopup;
  readonly focusGrid: () => void;
  readonly icons?: IconOverrides;
  /** Names the renderer in feedback keys, so each renderer runs a command once at a time. */
  readonly feedbackScope: "ribbon" | "toolbar";
}

export function createCommandContext(options: CommandContextOptions): RibbonContext {
  const { grid, icons } = options;
  return {
    grid,
    popup: options.popup,
    focus: () => readFocus(grid),
    focusGrid: options.focusGrid,
    ...(icons === undefined ? {} : { icons }),
    run: (key, command, control) => {
      const feedback = actionFeedbackFor(grid);
      if (feedback) void feedback.run(`${options.feedbackScope}:${key}`, command, control);
      else command();
    },
  };
}

/** Refresh every control from one snapshot. Only a value box reads the focus style. */
export function refreshControls(
  controls: readonly RibbonControlView[],
  grid: Grid,
  state: RibbonCommandStates,
): void {
  let focus: RibbonFocus | undefined;
  const snapshot = {
    state,
    get focus(): RibbonFocus {
      focus ??= readFocus(grid);
      return focus;
    },
  };

  for (const control of controls) control.refresh(snapshot);
}
