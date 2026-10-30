// The toolbar: the command registry on one row, with the ribbon's controls,
// glyphs, state and keyboard. Commands that do not fit move, in order, into a
// "More commands" popup, so every command stays reachable at any width.

import { iconContentNode, iconNode } from "../icons/resolve.js";
import type {
  CommandFlags,
  Grid,
  GridCommandName,
  IconOverrides,
  ToolbarActionName,
  ToolbarItem,
} from "../types/grid.js";
import {
  commandGroups,
  shownTabs,
  type RibbonAvailability,
  type RibbonControlSpec,
} from "./command-spec.js";
import { createCommandContext, refreshControls } from "./command-surface.js";
import {
  isDisabled,
  renderControl,
  type RibbonCommandStates,
  type RibbonContext,
  type RibbonControlView,
} from "./ribbon-controls.js";
import { RIBBON_TABS } from "./ribbon-model.js";
import { RibbonPopup } from "./ribbon-popup.js";

export interface CommandToolbarOptions {
  /** Accessible toolbar name. */
  readonly label: string;
  /** Extra class names for the owner's placement and theme hooks. */
  readonly className: string;
  /** A custom item list; when absent, every command `flags` shows, in ribbon order. */
  readonly items?: readonly ToolbarItem[];
  readonly flags: CommandFlags;
  readonly icons?: IconOverrides;
  /** Where keyboard focus goes back to; defaults to focusing the host. */
  readonly focusGrid?: () => void;
}

/**
 * Legacy toolbar actions that are items of a registry menu. A custom toolbar
 * that names one gets a one-click button for that exact item, as before 0.7.
 * Every other `ToolbarActionName` is the id of a registry command.
 */
const ACTION_COMMANDS: Partial<Record<ToolbarActionName, string>> = {
  clearFormat: "clear",
  merge: "mergeAndCenter",
  unmerge: "mergeAndCenter",
};

type ToolbarEntry =
  | { readonly kind: "separator" }
  | { readonly kind: "command"; readonly spec: RibbonControlSpec; readonly item?: ToolbarItem }
  | {
      readonly kind: "custom";
      readonly item: ToolbarItem;
      readonly onClick: (grid: Grid) => void;
      readonly spec?: RibbonControlSpec;
    };

function registryCommand(action: ToolbarActionName): RibbonControlSpec | undefined {
  const id = ACTION_COMMANDS[action] ?? action;
  return commandGroups(RIBBON_TABS)
    .flat()
    .find((spec) => spec.id === id);
}

function defaultEntries(flags: CommandFlags): ToolbarEntry[] {
  const entries: ToolbarEntry[] = [];
  for (const group of commandGroups(shownTabs(RIBBON_TABS, flags))) {
    if (entries.length > 0) entries.push({ kind: "separator" });
    for (const spec of group) entries.push({ kind: "command", spec });
  }

  return entries;
}

function customEntries(items: readonly ToolbarItem[]): ToolbarEntry[] {
  const entries: ToolbarEntry[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    if (item.action === "separator") {
      entries.push({ kind: "separator" });
      continue;
    }

    const spec = item.action === undefined ? undefined : registryCommand(item.action);
    const menuItem =
      spec?.kind === "menu" && item.action !== undefined && item.action in ACTION_COMMANDS
        ? spec.items.find((entry) => entry.icon === item.action)
        : undefined;
    const onClick =
      item.onClick ??
      (menuItem === undefined ? undefined : (grid: Grid) => void menuItem.run(grid));
    if (onClick !== undefined) {
      // A menu item keeps its own name and glyph unless the item overrides them.
      const named =
        menuItem === undefined ? item : { ...item, title: item.title ?? menuItem.label };
      const shown =
        spec !== undefined && menuItem?.icon !== undefined && spec.kind === "menu"
          ? { ...spec, icon: menuItem.icon }
          : spec;
      entries.push(
        shown === undefined
          ? { kind: "custom", item: named, onClick }
          : { kind: "custom", item: named, onClick, spec: shown },
      );
      continue;
    }

    if (spec === undefined || placed.has(spec.id)) continue;
    placed.add(spec.id);
    entries.push({ kind: "command", spec, item });
  }

  return entries;
}

/** Item `title` and `icon` replace the command's label and glyph in this toolbar only. */
function withItemOverrides(
  spec: RibbonControlSpec,
  item: ToolbarItem | undefined,
  context: RibbonContext,
): [RibbonControlSpec, RibbonContext] {
  if (item === undefined || spec.kind === "zoom") return [spec, context];

  const labelled = item.title === undefined ? spec : { ...spec, label: item.title };
  if (item.icon === undefined || !("icon" in spec)) return [labelled, context];

  return [labelled, { ...context, icons: { ...context.icons, [spec.icon]: item.icon } }];
}

/** A host callback button, in the same look as the commands around it. */
function renderCustom(
  entry: Extract<ToolbarEntry, { kind: "custom" }>,
  context: RibbonContext,
): RibbonControlView {
  const { item, onClick, spec } = entry;
  const label = item.title ?? (spec !== undefined && "label" in spec ? spec.label : "");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheetwrite-ribbon-button";
  button.dataset.command = item.action ?? spec?.id ?? "custom";
  if (label !== "") {
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  const glyph = document.createElement("span");
  glyph.className = "sheetwrite-ribbon-icon";
  if (item.icon !== undefined) glyph.appendChild(iconContentNode(item.icon));
  else if (spec !== undefined && "icon" in spec)
    glyph.appendChild(iconNode(spec.icon, context.icons));
  button.appendChild(glyph);

  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () =>
    context.run(`custom:${label || spec?.id || "item"}`, () => onClick(context.grid), button),
  );

  const availability: RibbonAvailability =
    spec !== undefined && "availability" in spec ? spec.availability : "view";
  return {
    element: button,
    refresh({ state }) {
      // A pending callback keeps its button disabled until the feedback settles.
      button.disabled =
        isDisabled(availability, state) || button.getAttribute("aria-busy") === "true";
    },
  };
}

function separator(): HTMLElement {
  const divider = document.createElement("span");
  divider.className = "sheetwrite-command-toolbar-separator";
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-orientation", "vertical");
  return divider;
}

export class CommandToolbar {
  readonly element: HTMLDivElement;

  private readonly grid: Grid;
  private readonly popup: RibbonPopup;
  private readonly context: RibbonContext;
  private readonly row: HTMLDivElement;
  private readonly more: HTMLButtonElement;
  private readonly items: HTMLElement[] = [];
  private readonly controls: RibbonControlView[] = [];
  private readonly disposeState: () => void;
  private readonly resizeObserver: ResizeObserver | null;
  /** Index of the first item moved to the overflow; `items.length` when all fit. */
  private overflowStart: number;
  private fitFrame = 0;
  private destroyed = false;

  constructor(host: HTMLElement, grid: Grid, options: CommandToolbarOptions) {
    this.grid = grid;
    this.popup = new RibbonPopup(host);
    this.context = createCommandContext({
      grid,
      popup: this.popup,
      focusGrid: options.focusGrid ?? (() => host.focus()),
      ...(options.icons === undefined ? {} : { icons: options.icons }),
      feedbackScope: "toolbar",
    });

    this.element = document.createElement("div");
    this.element.className = `sheetwrite-command-toolbar ${options.className}`;
    this.element.setAttribute("role", "toolbar");
    this.element.setAttribute("aria-label", options.label);

    this.row = document.createElement("div");
    this.row.className = "sheetwrite-command-toolbar-row";
    const entries =
      options.items === undefined ? defaultEntries(options.flags) : customEntries(options.items);
    for (const entry of entries) this.row.appendChild(this.renderEntry(entry));
    this.overflowStart = this.items.length;

    this.more = document.createElement("button");
    this.more.type = "button";
    this.more.className = "sheetwrite-ribbon-button sheetwrite-command-toolbar-more";
    this.more.title = "More commands";
    this.more.setAttribute("aria-label", "More commands");
    this.more.setAttribute("aria-haspopup", "true");
    this.more.setAttribute("aria-expanded", "false");
    this.more.hidden = true;
    const caret = document.createElement("span");
    caret.className = "sheetwrite-ribbon-caret";
    caret.setAttribute("aria-hidden", "true");
    this.more.appendChild(caret);
    this.more.addEventListener("mousedown", (event) => event.preventDefault());
    this.more.addEventListener("click", (event) => this.openOverflow(event.detail === 0));

    this.element.append(this.row, this.more);
    this.element.addEventListener("keydown", this.onKeydown);
    host.appendChild(this.element);

    this.refresh((command) => grid.getCommandState(command));
    this.disposeState = grid.on("command-state-change", (event) =>
      this.refresh((command: GridCommandName) => event.states[command]),
    );
    // Absent in some test environments; every command then stays on the row.
    this.resizeObserver =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => this.scheduleFit()) : null;
    this.resizeObserver?.observe(this.element);
    this.scheduleFit();
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    cancelAnimationFrame(this.fitFrame);
    this.resizeObserver?.disconnect();
    this.disposeState();
    this.popup.destroy();
    this.element.remove();
  }

  private renderEntry(entry: ToolbarEntry): HTMLElement {
    let element: HTMLElement;
    if (entry.kind === "separator") {
      element = separator();
    } else {
      const view =
        entry.kind === "custom"
          ? renderCustom(entry, this.context)
          : renderControl(...withItemOverrides(entry.spec, entry.item, this.context));
      this.controls.push(view);
      element = view.element;
    }

    this.items.push(element);
    return element;
  }

  private refresh(state: RibbonCommandStates): void {
    refreshControls(this.controls, this.grid, state);
  }

  /** Resize bursts arrive many times a frame; fit at most once per frame. */
  private scheduleFit(): void {
    if (this.fitFrame !== 0 || this.destroyed) return;

    this.fitFrame = requestAnimationFrame(() => {
      this.fitFrame = 0;
      this.fit();
    });
  }

  /** Hide trailing items until the row fits; the More button then lists them. */
  private fit(): void {
    this.popup.closeAll(false);
    for (const item of this.items) item.hidden = false;
    this.more.hidden = true;
    this.overflowStart = this.items.length;
    const fits = (): boolean => this.row.scrollWidth <= this.row.clientWidth;
    if (fits()) return;

    this.more.hidden = false;
    while (this.overflowStart > 0 && !fits()) {
      this.overflowStart -= 1;
      const item = this.items[this.overflowStart];
      if (item !== undefined) item.hidden = true;
    }

    // A separator never ends the visible row.
    const last = this.items[this.overflowStart - 1];
    if (last?.getAttribute("role") === "separator") {
      this.overflowStart -= 1;
      last.hidden = true;
    }
  }

  /** Lend the hidden items' live controls to a popup, then put them back. */
  private openOverflow(keyboard: boolean): void {
    if (this.popup.isOpen(this.more)) {
      this.popup.closeFrom(this.more, keyboard);
      return;
    }

    const lent = this.items
      .slice(this.overflowStart)
      .filter((item) => item.getAttribute("role") !== "separator");
    const surface = document.createElement("div");
    surface.className = "sheetwrite-command-toolbar-overflow";
    for (const item of lent) {
      item.hidden = false;
      surface.appendChild(item);
    }

    this.popup.open(this.more, surface, {
      role: "group",
      label: "More commands",
      focus: keyboard,
      onClose: () => {
        // Hidden items are a suffix of the row, so appending restores the order.
        for (const item of this.items.slice(this.overflowStart)) {
          item.hidden = true;
          this.row.appendChild(item);
        }
      },
    });
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    // The toolbar sits inside the grid host, whose handler treats Enter, Space
    // and arrows as cell navigation. Keep plain keys here; Ctrl/Cmd shortcuts
    // (undo, copy) still reach the grid, as they do from the ribbon.
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.context.focusGrid();
      return;
    }

    // Text boxes keep arrows and Home/End for the caret.
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement || !(focused instanceof HTMLElement)) return;

    const stops = [...this.element.querySelectorAll<HTMLElement>("button, input")].filter(
      (stop) =>
        stop.closest("[hidden]") === null && !stop.matches(":disabled") && stop.tabIndex !== -1,
    );
    const current = stops.indexOf(focused);
    if (current === -1) return;

    const last = stops.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: Math.min(last, current + 1),
      ArrowLeft: Math.max(0, current - 1),
      Home: 0,
      End: last,
    };
    const next = targets[event.key];
    if (next === undefined) return;

    event.preventDefault();
    stops[next]?.focus();
  };
}
