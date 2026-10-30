// The shape of the command model: one registry of commands, grouped into
// tabs, that the full ribbon, the compact ribbon and the toolbar all render.
// The registry itself is in ribbon-model.ts; the DOM is in ribbon-controls.ts.

import type { IconName } from "../icons/icon-names.js";
import type { PivotDestination } from "../panels/panel-controller.js";
import type { CellStyle } from "../types/cell.js";
import type { CellAddress } from "../types/coordinates.js";
import type { CommandFlags, Grid, GridCommandName } from "../types/grid.js";

/**
 * Where a control's disabled state comes from. `edit` borrows the state of a
 * selection-scoped edit command, which is disabled exactly when the grid is
 * read-only or nothing is selected; `view` controls never disable.
 */
export type RibbonAvailability = GridCommandName | "edit" | "view";

/** The command whose state stands in for every selection-scoped edit. */
export const EDIT_STATE_COMMAND: GridCommandName = "clearFormat";

export interface RibbonMenuItem {
 readonly label: string;
 readonly icon?: IconName;
 readonly run: (grid: Grid) => unknown;
}

/**
 * What every command in the registry has, whatever renders it. `id` is stable
 * across the full ribbon, the compact ribbon and the toolbar; it is also the
 * `data-command` hook and the `ToolbarItem.action` a custom toolbar names.
 */
interface CommandIdentity {
 readonly id: string;
 /** `GridConfig` switches that show the command; any one enabled shows it. */
 readonly flags?: readonly (keyof CommandFlags)[];
}

/** A command button; `toggle` buttons reflect their command's activity. */
export interface RibbonButtonSpec extends CommandIdentity {
 readonly kind: "button";
 readonly label: string;
 readonly icon: IconName;
 readonly run: (grid: Grid) => unknown;
 readonly availability: RibbonAvailability;
 readonly toggle?: boolean;
 readonly large?: boolean;
}

/**
 * A dropdown. With `run`, it is a split button: the face runs the default
 * command and the arrow opens the menu, as Excel's Paste and Borders do.
 */
export interface RibbonMenuSpec extends CommandIdentity {
 readonly kind: "menu";
 readonly label: string;
 readonly icon: IconName;
 readonly availability: RibbonAvailability;
 readonly items: readonly RibbonMenuItem[];
 readonly run?: (grid: Grid) => unknown;
 readonly large?: boolean;
}

/**
 * What the value boxes show, read once per refresh instead of once per box:
 * the focus cell's effective style and the theme font unstyled cells use.
 */
export interface RibbonFocus {
 readonly style: CellStyle;
 readonly themeFontFamily: string | undefined;
 readonly themeFontPx: number | undefined;
}

/** An editable dropdown (font, size, number format). */
export interface RibbonComboSpec extends CommandIdentity {
 readonly kind: "combo";
 readonly label: string;
 /** Width in CSS pixels; Excel sizes each box to its longest common value. */
 readonly width: number;
 readonly availability: RibbonAvailability;
 readonly options: readonly string[];
 /** Render each option in its own typeface, as Excel's font list does. */
 readonly previewFont?: boolean;
 readonly read: (focus: RibbonFocus) => string;
 /** Apply typed or picked text; returns false when the text is not valid. */
 readonly apply: (grid: Grid, value: string) => boolean;
}

/** Excel's font-color and fill-color split buttons with a palette menu. */
export interface RibbonColorSpec extends CommandIdentity {
 readonly kind: "color";
 readonly label: string;
 readonly icon: IconName;
 /** Palette entry that removes the color ("Automatic" / "No Fill"). */
 readonly clearLabel: string;
 /** Color the face applies before the user picks one, as in Excel. */
 readonly initial: string;
 readonly apply: (grid: Grid, color: string | null) => void;
}

/** A button that opens a one-field form at the focus cell (link, note). */
export interface RibbonFormSpec extends CommandIdentity {
 readonly kind: "form";
 readonly label: string;
 readonly icon: IconName;
 readonly field: string;
 readonly multiline: boolean;
 readonly read: (grid: Grid, cell: CellAddress) => string;
 /** Save the value; returns an error message to show, or null on success. */
 readonly submit: (grid: Grid, cell: CellAddress, value: string) => string | null;
}

/**
 * A button that opens Excel's "Choose where to place" form: a new sheet, or a
 * cell typed as A1 (Insert › Pivot table).
 */
export interface RibbonPlacementSpec extends CommandIdentity {
 readonly kind: "placement";
 readonly label: string;
 readonly icon: IconName;
 /** Why the command cannot run at all here, shown as the tooltip; null when it can. */
 readonly unavailable: (grid: Grid) => string | null;
 /** Run the command; returns an error message to show, or null on success. */
 readonly submit: (grid: Grid, destination: PivotDestination) => Promise<string | null>;
}

/** Zoom out / current percent / zoom in, as in Excel's View > Zoom group. */
interface RibbonZoomSpec extends CommandIdentity {
 readonly kind: "zoom";
}

export type RibbonControlSpec =
 | RibbonButtonSpec
 | RibbonMenuSpec
 | RibbonComboSpec
 | RibbonColorSpec
 | RibbonFormSpec
 | RibbonPlacementSpec
 | RibbonZoomSpec;

/**
 * One ribbon group. `flow` groups hold buttons that can shrink from large to
 * small before collapsing. `rows` groups are Excel's dense Font, Alignment and
 * Number layouts: their rows only ever collapse whole.
 */
export type RibbonGroupSpec =
 | {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly layout: "flow";
  readonly controls: readonly RibbonControlSpec[];
 }
 | {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly layout: "rows";
  readonly rows: readonly (readonly RibbonControlSpec[])[];
 };

export interface RibbonTabSpec {
 readonly label: string;
 readonly groups: readonly RibbonGroupSpec[];
 /**
  * Group ids in the order they give up space as the ribbon narrows. Excel
  * shrinks the right-hand, less-used groups first.
  */
 readonly reduceOrder: readonly string[];
}

/** Whether `flags` show a command. `export` is opt-in; every other switch is opt-out. */
function commandShown(spec: RibbonControlSpec, flags: CommandFlags): boolean {
 if (spec.flags === undefined) return true;

 return spec.flags.some((flag) =>
  flag === "export" ? flags.export === true : flags[flag] !== false,
 );
}

function shownGroup(group: RibbonGroupSpec, flags: CommandFlags): RibbonGroupSpec[] {
 if (group.layout === "flow") {
  const controls = group.controls.filter((control) => commandShown(control, flags));
  return controls.length === 0 ? [] : [{ ...group, controls }];
 }

 const rows = group.rows
  .map((row) => row.filter((control) => commandShown(control, flags)))
  .filter((row) => row.length > 0);
 return rows.length === 0 ? [] : [{ ...group, rows }];
}

/** The tabs without the commands `flags` hide; a group left empty is dropped. */
export function shownTabs(tabs: readonly RibbonTabSpec[], flags: CommandFlags): RibbonTabSpec[] {
 return tabs.map((tab) => ({
  ...tab,
  groups: tab.groups.flatMap((group) => shownGroup(group, flags)),
 }));
}

/**
 * Every command once, in tab and group order, grouped as the toolbar shows
 * them. A command that two tabs share (Insert, Delete) keeps its first place.
 */
export function commandGroups(tabs: readonly RibbonTabSpec[]): RibbonControlSpec[][] {
 const seen = new Set<string>();
 const groups: RibbonControlSpec[][] = [];
 for (const tab of tabs) {
  for (const group of tab.groups) {
   const controls = (group.layout === "flow" ? group.controls : group.rows.flat()).filter(
    (control) => !seen.has(control.id),
   );
   for (const control of controls) seen.add(control.id);
   if (controls.length > 0) groups.push(controls);
  }
 }

 return groups;
}
