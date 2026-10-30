// Excel-style ribbon: a tab row over one panel of labeled groups, in a full
// or a compact (one row) layout. Both layouts render the same live controls
// from the command registry. It reads only the public Grid API, so the grid's
// built-in chrome and the composable shell mount the same class. Owners place
// the element; the ribbon never positions itself.

import { iconNode } from "../icons/resolve.js";
import type { CommandFlags, Grid, IconOverrides, RibbonConfig, RibbonMode } from "../types/grid.js";
import { shownTabs, type RibbonGroupSpec, type RibbonTabSpec } from "./command-spec.js";
import { createCommandContext, refreshControls } from "./command-surface.js";
import {
  renderControl,
  type RibbonCommandStates,
  type RibbonContext,
  type RibbonControlView,
} from "./ribbon-controls.js";
import {
  fitRibbon,
  ribbonFitSteps,
  type RibbonFitGroup,
  type RibbonFitStep,
} from "./ribbon-fit.js";
import {
  assertRibbonConfig,
  RIBBON_COMPACT_PANEL_HEIGHT,
  RIBBON_COMPACT_WIDTH,
  RIBBON_PANEL_HEIGHT,
  RIBBON_TAB_ROW_HEIGHT,
} from "./ribbon-metrics.js";
import { RIBBON_TABS } from "./ribbon-model.js";
import { RibbonPopup } from "./ribbon-popup.js";

export interface RibbonOptions extends RibbonConfig {
  /** Called after the ribbon is minimized to its tab row or expanded again. */
  readonly onHeightChange: (height: number) => void;
  /** Where keyboard focus goes back to; defaults to focusing the host. */
  readonly focusGrid?: () => void;
  /** Host glyph overrides, as `GridConfig.icons`. */
  readonly icons?: IconOverrides;
  /** `GridConfig` switches that choose commands; defaults show every command but Export. */
  readonly flags?: CommandFlags;
}

interface GroupView {
  readonly spec: RibbonGroupSpec;
  readonly element: HTMLElement;
  readonly body: HTMLElement;
}

/** One tab's DOM, built the first time the tab is shown. */
interface PanelView {
  readonly element: HTMLElement;
  readonly groups: ReadonlyMap<string, GroupView>;
  readonly controls: readonly RibbonControlView[];
  readonly fitSteps: readonly RibbonFitStep[];
}

let ribbonSerial = 0;

export class Ribbon {
  readonly element: HTMLDivElement;

  private readonly grid: Grid;
  private readonly options: RibbonOptions;
  private readonly context: RibbonContext;
  private readonly popup: RibbonPopup;
  private readonly tabs: HTMLButtonElement[] = [];
  private readonly tabSpecs: readonly RibbonTabSpec[];
  private readonly panels: (PanelView | undefined)[] = [];
  private readonly tabList: HTMLDivElement;
  private readonly minimizeButton: HTMLButtonElement;
  private readonly modeButton: HTMLButtonElement;
  private readonly id: number;
  private readonly disposers: Array<() => void> = [];
  private readonly resizeObserver: ResizeObserver | null;
  private activeTab = 0;
  private minimized = false;
  private mode: RibbonMode;
  private compact = false;
  private fitFrame = 0;
  private fittedWidth = -1;
  private destroyed = false;

  constructor(host: HTMLElement, grid: Grid, options: RibbonOptions) {
    ribbonSerial += 1;
    this.id = ribbonSerial;
    this.grid = grid;
    this.options = options;
    assertRibbonConfig(options);
    this.mode = options.mode ?? "full";
    this.tabSpecs = shownTabs(RIBBON_TABS, options.flags ?? {});

    this.popup = new RibbonPopup(host);
    this.context = createCommandContext({
      grid,
      popup: this.popup,
      focusGrid: options.focusGrid ?? (() => host.focus()),
      ...(options.icons === undefined ? {} : { icons: options.icons }),
      feedbackScope: "ribbon",
    });

    this.element = document.createElement("div");
    this.element.className = "sheetwrite-ribbon";
    this.element.setAttribute("role", "region");
    this.element.setAttribute("aria-label", "Ribbon");

    this.tabList = document.createElement("div");
    this.tabList.className = "sheetwrite-ribbon-tabs";
    this.tabList.setAttribute("role", "tablist");
    this.tabList.setAttribute("aria-label", "Ribbon tabs");
    this.tabSpecs.forEach((tab, index) => this.tabList.appendChild(this.createTab(tab, index)));

    this.modeButton = document.createElement("button");
    this.modeButton.type = "button";
    this.modeButton.className = "sheetwrite-ribbon-mode";
    this.modeButton.textContent = "Compact";
    this.modeButton.setAttribute("aria-label", "Compact ribbon");
    this.modeButton.title = "Switch between the full and compact ribbon";
    this.modeButton.addEventListener("mousedown", (event) => event.preventDefault());
    this.modeButton.addEventListener("click", () => {
      this.mode = this.compact ? "full" : "compact";
      this.updateLayout();
    });
    this.tabList.appendChild(this.modeButton);

    this.minimizeButton = document.createElement("button");
    this.minimizeButton.type = "button";
    this.minimizeButton.className = "sheetwrite-ribbon-minimize";
    this.minimizeButton.addEventListener("mousedown", (event) => event.preventDefault());
    this.minimizeButton.addEventListener("click", () => this.setMinimized(!this.minimized));
    this.tabList.appendChild(this.minimizeButton);

    this.element.appendChild(this.tabList);
    this.element.addEventListener("keydown", this.onKeydown);
    host.appendChild(this.element);

    this.disposers.push(
      grid.on("command-state-change", (event) => this.refresh((command) => event.states[command])),
    );
    // Absent in some test environments; the ribbon then never shrinks groups.
    this.resizeObserver =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => this.scheduleFit()) : null;
    this.resizeObserver?.observe(this.element);

    this.updateMinimizeButton();
    this.updateLayout();
    this.selectTab(0, false);
  }

  /** Height the owner reserves above the grid. */
  get height(): number {
    const panelHeight = this.compact ? RIBBON_COMPACT_PANEL_HEIGHT : RIBBON_PANEL_HEIGHT;
    return RIBBON_TAB_ROW_HEIGHT + (this.minimized ? 0 : panelHeight);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.fitFrame);
    this.resizeObserver?.disconnect();
    for (const dispose of this.disposers) dispose();
    this.popup.destroy();
    this.element.remove();
  }

  private createTab(spec: RibbonTabSpec, index: number): HTMLButtonElement {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "sheetwrite-ribbon-tab";
    tab.id = `sheetwrite-ribbon-${this.id}-tab-${index}`;
    tab.textContent = spec.label;
    tab.setAttribute("role", "tab");
    tab.addEventListener("mousedown", (event) => event.preventDefault());
    tab.addEventListener("click", () => {
      if (this.minimized) this.setMinimized(false);
      this.selectTab(index, false);
    });
    // Excel's shortcut for hiding the panel: double-click any tab.
    tab.addEventListener("dblclick", () => this.setMinimized(!this.minimized));
    this.tabs.push(tab);
    return tab;
  }

  private selectTab(index: number, focus: boolean): void {
    this.popup.closeAll(false);
    this.activeTab = index;
    this.tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === index;
      tab.setAttribute("aria-selected", String(selected));
      // Roving tabindex: Tab reaches the tab row once, arrows move within it.
      tab.tabIndex = selected ? 0 : -1;
    });
    if (focus) this.tabs[index]?.focus();

    const panel = this.panelAt(index);
    for (const [panelIndex, view] of this.panels.entries()) {
      if (view !== undefined) view.element.hidden = panelIndex !== index || this.minimized;
    }
    this.refreshPanel(panel, (command) => this.grid.getCommandState(command));
    this.fittedWidth = -1;
    this.scheduleFit();
  }

  /** Build a tab's panel on first use; most sessions never open most tabs. */
  private panelAt(index: number): PanelView {
    const existing = this.panels[index];
    if (existing !== undefined) return existing;

    const spec = this.tabSpecs[index];
    if (spec === undefined) throw new RangeError(`No ribbon tab ${index}`);
    const element = document.createElement("div");
    element.className = "sheetwrite-ribbon-panel";
    element.id = `sheetwrite-ribbon-${this.id}-panel-${index}`;
    element.setAttribute("role", "tabpanel");
    element.setAttribute("aria-labelledby", `sheetwrite-ribbon-${this.id}-tab-${index}`);
    this.tabs[index]?.setAttribute("aria-controls", element.id);

    const groups = new Map<string, GroupView>();
    const controls: RibbonControlView[] = [];
    for (const group of spec.groups) {
      const view = this.createGroup(group, controls);
      groups.set(group.id, view);
      element.appendChild(view.element);
    }

    const reduceOrder: RibbonFitGroup[] = [];
    for (const id of spec.reduceOrder) {
      const group = groups.get(id);
      if (group !== undefined) reduceOrder.push({ id, shrinks: group.spec.layout === "flow" });
    }

    const panel = { element, groups, controls, fitSteps: ribbonFitSteps(reduceOrder) };
    this.panels[index] = panel;
    this.element.appendChild(element);
    return panel;
  }

  private createGroup(spec: RibbonGroupSpec, controls: RibbonControlView[]): GroupView {
    const element = document.createElement("div");
    element.className = "sheetwrite-ribbon-group";
    element.dataset.size = "large";
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", spec.label);

    const body = document.createElement("div");
    body.className = "sheetwrite-ribbon-group-body";
    body.dataset.layout = spec.layout;
    const rows = spec.layout === "rows" ? spec.rows : [spec.controls];
    for (const row of rows) {
      const line = spec.layout === "rows" ? document.createElement("div") : body;
      if (line !== body) {
        line.className = "sheetwrite-ribbon-row";
        body.appendChild(line);
      }
      for (const control of row) {
        const view = renderControl(control, this.context);
        controls.push(view);
        line.appendChild(view.element);
      }
    }

    // Shown only while collapsed: opens the whole group in a popup.
    const collapsed = document.createElement("button");
    collapsed.type = "button";
    collapsed.className = "sheetwrite-ribbon-button sheetwrite-ribbon-group-button";
    collapsed.dataset.large = "";
    collapsed.setAttribute("aria-haspopup", "true");
    collapsed.setAttribute("aria-expanded", "false");
    const glyph = document.createElement("span");
    glyph.className = "sheetwrite-ribbon-icon";
    glyph.appendChild(iconNode(spec.icon, this.options.icons));
    const text = document.createElement("span");
    text.className = "sheetwrite-ribbon-label";
    text.textContent = spec.label;
    const caret = document.createElement("span");
    caret.className = "sheetwrite-ribbon-caret";
    caret.setAttribute("aria-hidden", "true");
    collapsed.append(glyph, text, caret);
    collapsed.addEventListener("mousedown", (event) => event.preventDefault());
    collapsed.addEventListener("click", (event) =>
      this.openCollapsed(collapsed, body, spec, event.detail === 0),
    );

    const label = document.createElement("div");
    label.className = "sheetwrite-ribbon-group-label";
    label.textContent = spec.label;
    label.setAttribute("aria-hidden", "true");

    element.append(body, collapsed, label);
    return { spec, element, body };
  }

  /** Lend the group's live controls to a popup, then put them back. */
  private openCollapsed(
    trigger: HTMLButtonElement,
    body: HTMLElement,
    spec: RibbonGroupSpec,
    keyboard: boolean,
  ): void {
    if (this.popup.isOpen(trigger)) {
      this.popup.closeFrom(trigger, keyboard);
      return;
    }
    const surface = document.createElement("div");
    surface.className = "sheetwrite-ribbon-group-popup";
    surface.appendChild(body);
    this.popup.open(trigger, surface, {
      role: "group",
      label: spec.label,
      focus: keyboard,
      onClose: () => trigger.before(body),
    });
  }

  private refresh(states: RibbonCommandStates): void {
    const panel = this.panels[this.activeTab];
    if (panel !== undefined && !this.minimized) this.refreshPanel(panel, states);
  }

  private refreshPanel(panel: PanelView, state: RibbonCommandStates): void {
    refreshControls(panel.controls, this.grid, state);
  }

  private setMinimized(minimized: boolean): void {
    if (minimized === this.minimized) return;
    this.minimized = minimized;
    this.element.dataset.minimized = String(minimized);
    this.updateMinimizeButton();
    this.selectTab(this.activeTab, false);
    this.options.onHeightChange(this.height);
  }

  private updateMinimizeButton(): void {
    const label = this.minimized ? "Pin the ribbon" : "Collapse the ribbon";
    this.minimizeButton.title = label;
    this.minimizeButton.setAttribute("aria-label", label);
    this.minimizeButton.setAttribute("aria-expanded", String(!this.minimized));
  }

  /** Resize bursts arrive many times a frame; fit at most once per frame. */
  private scheduleFit(): void {
    if (this.fitFrame !== 0 || this.destroyed) return;
    this.fitFrame = requestAnimationFrame(() => {
      this.fitFrame = 0;
      this.fit();
    });
  }

  private updateLayout(): void {
    const compact =
      this.mode === "compact" ||
      (this.mode === "auto" &&
        this.element.clientWidth < (this.options.compactWidth ?? RIBBON_COMPACT_WIDTH));
    this.modeButton.setAttribute("aria-pressed", String(compact));
    this.element.dataset.mode = compact ? "compact" : "full";
    if (compact === this.compact) return;

    this.popup.closeAll(false);
    this.compact = compact;
    this.fittedWidth = -1;
    this.options.onHeightChange(this.height);
    this.scheduleFit();
  }

  private fit(): void {
    this.updateLayout();
    const panel = this.panels[this.activeTab];
    if (panel === undefined || this.minimized) return;
    const width = panel.element.clientWidth;
    if (width === this.fittedWidth) return;
    this.fittedWidth = width;

    // Sizes are about to change, and a collapsed group's body may be on loan.
    this.popup.closeAll(false);
    for (const group of panel.groups.values()) {
      group.element.dataset.size = this.compact ? "medium" : "large";
    }
    fitRibbon(
      panel.fitSteps,
      (step) => {
        const group = panel.groups.get(step.id);
        if (group !== undefined) group.element.dataset.size = step.size;
      },
      () => panel.element.scrollWidth <= panel.element.clientWidth,
    );
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    // The ribbon sits inside the grid host, whose handler treats Enter, Space
    // and arrows as cell navigation. Keep plain keys here; Ctrl/Cmd shortcuts
    // (undo, copy) still reach the grid, as they do from Excel's ribbon.
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.context.focusGrid();
      return;
    }
    const index = this.tabs.findIndex((tab) => tab === event.target);
    if (index === -1) return;
    const count = this.tabs.length;
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % count,
      ArrowLeft: (index + count - 1) % count,
      Home: 0,
      End: count - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    this.selectTab(next, true);
  };
}
