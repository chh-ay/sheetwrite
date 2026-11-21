// Excel-style ribbon: a tab row over one panel of labeled groups, in a full
// or a compact (one row) layout. Both layouts render the same live controls
// from the command registry. It reads only the public Grid API, so the grid's
// built-in chrome and the composable shell mount the same class. Owners place
// the element; the ribbon never positions itself.

import { iconNode } from "../icons/resolve.js";
import { onQueryCommandsChange } from "../query-commands.js";
import { Scope } from "../scope.js";
import { checkIconStyles, checkStylePart } from "../style-parts.js";
import type { CommandFlags, Grid, IconOverrides, RibbonConfig, RibbonMode } from "../types/grid.js";
import {
  commandAvailable,
  shownTabs,
  tabAvailable,
  type RibbonControlSpec,
  type RibbonGroupSpec,
  type RibbonTabSpec,
} from "./command-spec.js";
import { createCommandContext, refreshControls } from "./command-surface.js";
import {
  renderControl,
  twoLineLabel,
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
  RIBBON_PANEL_HEIGHT,
  RIBBON_TAB_ROW_HEIGHT,
  ribbonIsCompact,
} from "./ribbon-metrics.js";
import { RIBBON_TABS } from "./ribbon-model.js";
import { RibbonPopup } from "./ribbon-popup.js";

export interface RibbonMountOptions extends RibbonConfig {
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
  readonly controls: readonly {
    readonly spec: RibbonControlSpec;
    readonly view: RibbonControlView;
  }[];
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
  private readonly options: RibbonMountOptions;
  private readonly context: RibbonContext;
  private readonly popup: RibbonPopup;
  private readonly tabs: HTMLButtonElement[] = [];
  private readonly tabSpecs: readonly RibbonTabSpec[];
  private readonly panels: (PanelView | undefined)[] = [];
  private readonly tabList: HTMLDivElement;
  /** Opens a menu of the tabs that do not fit in the tab row; hidden while they all fit. */
  private readonly moreTabsButton: HTMLButtonElement;
  private readonly minimizeButton: HTMLButtonElement;
  private readonly modeButton: HTMLButtonElement;
  /** The compact ribbon's gear, which opens the Keyboard shortcuts panel; only with `keyboardSettings`. */
  private readonly settingsButton: HTMLButtonElement | null = null;
  private readonly id: number;
  /** The ribbon's listeners, observer and pending fit frame; `destroy` closes it. */
  private readonly lifetime = new Scope();
  private activeTab = 0;
  private minimized = false;
  private mode: RibbonMode;
  private compact = false;
  private fitFrame = 0;
  private fittedWidth = -1;

  constructor(host: HTMLElement, grid: Grid, options: RibbonMountOptions) {
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

    // The tab row holds the tablist and, beside it, the layout buttons: a
    // tablist may own only tabs, or screen readers miscount the tabs.
    const tabRow = document.createElement("div");
    tabRow.className = "sheetwrite-ribbon-tabs";
    this.tabList = document.createElement("div");
    this.tabList.className = "sheetwrite-ribbon-tablist";
    this.tabList.setAttribute("role", "tablist");
    this.tabList.setAttribute("aria-label", "Ribbon tabs");
    this.tabSpecs.forEach((tab, index) => this.tabList.appendChild(this.createTab(tab, index)));

    this.moreTabsButton = document.createElement("button");
    this.moreTabsButton.type = "button";
    this.moreTabsButton.className = "sheetwrite-ribbon-more-tabs";
    this.moreTabsButton.title = "More tabs";
    this.moreTabsButton.setAttribute("aria-label", "More tabs");
    this.moreTabsButton.setAttribute("aria-haspopup", "menu");
    this.moreTabsButton.setAttribute("aria-expanded", "false");
    this.moreTabsButton.hidden = true;
    const moreCaret = document.createElement("span");
    moreCaret.className = "sheetwrite-ribbon-caret";
    moreCaret.setAttribute("aria-hidden", "true");
    this.moreTabsButton.appendChild(moreCaret);
    this.moreTabsButton.addEventListener("mousedown", (event) => event.preventDefault());
    this.moreTabsButton.addEventListener("click", (event) => this.openMoreTabs(event.detail === 0));

    this.modeButton = document.createElement("button");
    this.modeButton.type = "button";
    this.modeButton.className = "sheetwrite-ribbon-mode";
    this.modeButton.textContent = "Compact";
    this.modeButton.setAttribute("aria-label", "Compact ribbon");
    this.modeButton.title = "Switch between the full and compact ribbon";
    this.modeButton.addEventListener("mousedown", (event) => event.preventDefault());
    this.modeButton.addEventListener("click", () => {
      this.mode = this.compact ? "full" : "compact";
      this.fit();
    });

    this.minimizeButton = document.createElement("button");
    this.minimizeButton.type = "button";
    this.minimizeButton.className = "sheetwrite-ribbon-minimize";
    this.minimizeButton.addEventListener("mousedown", (event) => event.preventDefault());
    this.minimizeButton.addEventListener("click", () => this.setMinimized(!this.minimized));

    // A one-row ribbon has no room for File › Options, so a gear opens the
    // Keyboard shortcuts panel there.
    if (options.flags?.keyboardSettings) {
      const settings = document.createElement("button");
      settings.type = "button";
      settings.className = "sheetwrite-ribbon-settings";
      settings.dataset.command = "keyboardShortcuts";
      settings.title = "Settings: keyboard shortcuts";
      settings.setAttribute("aria-label", "Keyboard shortcuts");
      // An icon never stands alone: the gear shows its name beside it.
      const name = document.createElement("span");
      name.className = "sheetwrite-ribbon-settings-label";
      name.textContent = "Shortcuts";
      settings.append(iconNode("settings", options.icons), name);
      settings.addEventListener("mousedown", (event) => event.preventDefault());
      settings.addEventListener("click", () => grid.openKeyboardSettings());
      this.settingsButton = settings;
    }

    tabRow.append(
      this.tabList,
      this.moreTabsButton,
      ...(this.settingsButton ? [this.settingsButton] : []),
    );
    tabRow.append(this.modeButton, this.minimizeButton);
    this.element.appendChild(tabRow);
    this.element.addEventListener("keydown", this.onKeydown);
    host.appendChild(this.element);
    checkStylePart(this.element, "ribbon", "The ribbon");
    this.lifetime.add(() => this.element.remove());
    this.lifetime.add(() => this.popup.destroy());

    this.lifetime.add(
      grid.on("command-state-change", (event) => this.refresh((command) => event.states[command])),
    );
    // A query session connects after the grid exists, and its commands appear then.
    this.lifetime.add(
      onQueryCommandsChange(grid, () => this.refresh((command) => grid.getCommandState(command))),
    );
    // Some commands depend on the document, such as Edit Links on its links.
    this.lifetime.add(grid.on("change", () => this.updateAvailability()));
    // Absent in some test environments; the ribbon then never shrinks groups.
    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(() => this.scheduleFit());
      resizeObserver.observe(this.element);
      this.lifetime.add(() => resizeObserver.disconnect());
    }
    this.lifetime.add(() => cancelAnimationFrame(this.fitFrame));

    this.updateMinimizeButton();
    this.updateLayout();
    this.updateAvailability();
    this.selectTab(this.openingTab(), false);
  }

  /** Height the owner reserves above the grid. */
  get height(): number {
    const panelHeight = this.compact ? RIBBON_COMPACT_PANEL_HEIGHT : RIBBON_PANEL_HEIGHT;
    return RIBBON_TAB_ROW_HEIGHT + (this.minimized ? 0 : panelHeight);
  }

  destroy(): void {
    this.lifetime.close();
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

    const panel = this.panelAt(index);
    for (const [panelIndex, view] of this.panels.entries()) {
      if (view !== undefined) view.element.hidden = panelIndex !== index || this.minimized;
    }
    this.refreshPanel(panel, (command) => this.grid.getCommandState(command));
    this.fittedWidth = -1;
    // A following key can open a menu before the next animation frame.
    this.fit();
    // After the fit, which shows the selected tab if it was in the More tabs menu.
    if (focus) this.tabs[index]?.focus();
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
    for (const group of groups.values()) this.showAvailable(group);

    const reduceOrder: RibbonFitGroup[] = [];
    for (const id of spec.reduceOrder) {
      const group = groups.get(id);
      if (group !== undefined) reduceOrder.push({ id, shrinks: group.spec.layout === "flow" });
    }

    const panel = { element, groups, controls, fitSteps: ribbonFitSteps(reduceOrder) };
    this.panels[index] = panel;
    this.element.appendChild(element);
    checkIconStyles(element, "The ribbon");
    return panel;
  }

  private createGroup(spec: RibbonGroupSpec, controls: RibbonControlView[]): GroupView {
    const groupControls: { spec: RibbonControlSpec; view: RibbonControlView }[] = [];
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
        groupControls.push({ spec: control, view });
        line.appendChild(view.element);
      }
    }

    // Shown only while collapsed: opens the whole group in a popup.
    const collapsed = document.createElement("button");
    collapsed.type = "button";
    collapsed.className = "sheetwrite-ribbon-button sheetwrite-ribbon-group-button";
    collapsed.dataset.large = "";
    // The shown name may break over two lines; the accessible name stays whole.
    collapsed.setAttribute("aria-label", spec.label);
    collapsed.setAttribute("aria-haspopup", "true");
    collapsed.setAttribute("aria-expanded", "false");
    const glyph = document.createElement("span");
    glyph.className = "sheetwrite-ribbon-icon";
    glyph.appendChild(iconNode(spec.icon, this.options.icons));
    const text = document.createElement("span");
    text.className = "sheetwrite-ribbon-label";
    // At most two lines in the full ribbon; the compact ribbon shows one.
    text.textContent = twoLineLabel(spec.label);
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
    return { spec, element, body, controls: groupControls };
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
    this.updateAvailability();
    const panel = this.panels[this.activeTab];
    if (panel !== undefined && !this.minimized) this.refreshPanel(panel, states);
  }

  /**
   * Hide the commands the grid cannot run now (see `available`), and the
   * groups and tabs they leave empty. A tab that disappears while selected
   * hands the selection to the first tab still shown.
   */
  private updateAvailability(): void {
    let changed = false;
    this.tabSpecs.forEach((spec, index) => {
      const tab = this.tabs[index];
      const hidden = !tabAvailable(spec, this.grid);
      if (tab === undefined || tab.hidden === hidden) return;
      tab.hidden = hidden;
      changed = true;
    });
    for (const panel of this.panels) {
      for (const group of panel?.groups.values() ?? [])
        changed = this.showAvailable(group) || changed;
    }
    if (!changed) return;

    if (this.tabs[this.activeTab]?.hidden === true) this.selectTab(this.openingTab(), false);
    this.fittedWidth = -1;
    this.scheduleFit();
  }

  /** Show a group's available controls, and the group while it has any; true on change. */
  private showAvailable(group: GroupView): boolean {
    let changed = false;
    let shown = 0;
    for (const { spec, view } of group.controls) {
      const hidden = !commandAvailable(spec, this.grid);
      if (!hidden) shown += 1;
      if (view.element.hidden === hidden) continue;
      view.element.hidden = hidden;
      changed = true;
    }
    const hidden = shown === 0;
    if (group.element.hidden !== hidden) {
      group.element.hidden = hidden;
      changed = true;
    }
    return changed;
  }

  /** Home while it shows, as in Excel, where File comes first but the ribbon opens on Home; else the first tab shown. */
  private openingTab(): number {
    const shown = (index: number) => this.tabs[index]?.hidden === false;
    const home = this.tabSpecs.findIndex((spec, index) => spec.opensFirst === true && shown(index));
    if (home !== -1) return home;
    return Math.max(
      0,
      this.tabs.findIndex((tab) => !tab.hidden),
    );
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
    if (this.fitFrame !== 0 || this.lifetime.closed) return;
    this.fitFrame = requestAnimationFrame(() => {
      this.fitFrame = 0;
      this.fit();
    });
  }

  /**
   * Move the tabs that do not fit, last first, into the More tabs menu, so no
   * tab label is cut off. The selected tab always stays in the row.
   */
  private fitTabs(): void {
    const list = this.tabList;
    for (const tab of this.tabs) delete tab.dataset.overflow;
    // Both widths round to whole pixels, so fractional tab widths can differ by one.
    const overflows = (): boolean => list.scrollWidth > list.clientWidth + 1;
    this.moreTabsButton.hidden = !overflows();
    for (let index = this.tabs.length - 1; index >= 0 && overflows(); index -= 1) {
      const tab = this.tabs[index];
      if (tab !== undefined && index !== this.activeTab && !tab.hidden) tab.dataset.overflow = "";
    }
  }

  /** List the tabs that did not fit; picking one selects it, which brings it into the row. */
  private openMoreTabs(keyboard: boolean): void {
    const trigger = this.moreTabsButton;
    if (this.popup.isOpen(trigger)) {
      this.popup.closeFrom(trigger, keyboard);
      return;
    }
    const menu = document.createElement("div");
    menu.className = "sheetwrite-ribbon-menu";
    this.tabs.forEach((tab, index) => {
      if (tab.hidden || tab.dataset.overflow === undefined) return;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "sheetwrite-ribbon-menu-item";
      item.setAttribute("role", "menuitem");
      item.tabIndex = -1;
      item.textContent = tab.textContent;
      item.addEventListener("mousedown", (event) => event.preventDefault());
      item.addEventListener("click", (event) => {
        this.popup.closeAll(false);
        if (this.minimized) this.setMinimized(false);
        this.selectTab(index, event.detail === 0);
      });
      menu.appendChild(item);
    });
    this.popup.open(trigger, menu, { role: "menu", label: "More tabs", focus: keyboard });
  }

  private updateLayout(): void {
    const compact = ribbonIsCompact(this.element.clientWidth, this.mode, this.options.compactWidth);
    this.modeButton.setAttribute("aria-pressed", String(compact));
    if (this.settingsButton !== null) this.settingsButton.hidden = !compact;
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
    // The settings button shows only in the compact layout, so fit the tabs after it.
    this.fitTabs();
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
    // Arrows and Home/End move among the tabs shown now, wrapping at the ends.
    const shown = this.tabs.flatMap((tab, tabIndex) => (tab.hidden ? [] : [tabIndex]));
    const position = shown.indexOf(index);
    const count = shown.length;
    const targets: Record<string, number | undefined> = {
      ArrowRight: shown[(position + 1) % count],
      ArrowLeft: shown[(position + count - 1) % count],
      Home: shown[0],
      End: shown[count - 1],
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    this.selectTab(next, true);
  };
}
