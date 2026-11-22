import type { CellScalar, Column } from "./types/cell.js";
import type { CellAddress } from "./types/coordinates.js";
import type {
  CellEditor,
  CellEditorContext,
  CellEditorInstance,
  CellEditorNavigation,
  CellEditorRect,
  Grid,
} from "./types/grid.js";

const NO_EDITOR_ERROR = Symbol("no-editor-error");

function report_custom_editor_error(error: unknown): void {
  const reporter = "reportError" in globalThis ? globalThis.reportError : undefined;
  if (typeof reporter === "function") {
    reporter(error);
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}

function snapshot_column(column: Readonly<Column>): Column {
  return structuredClone(column);
}

export interface CustomEditorState {
  grid: Grid;
  address: Readonly<CellAddress>;
  viewAddress: Readonly<CellAddress>;
  column: Readonly<Column>;
  value: CellScalar;
  text: string;
  initialInput: string | undefined;
  selectAll: boolean;
  label: string;
}

export interface BeginCustomEditorOptions extends CustomEditorState {
  editor: CellEditor;
  rect: CellEditorRect;
  onCommit: (value: string, navigation: CellEditorNavigation) => void;
  onCancel: () => void;
}

interface ActiveEditor {
  generation: number;
  abort: AbortController;
  wrapper: HTMLDivElement;
  instance: CellEditorInstance | null;
  state: CustomEditorState;
  rect: CellEditorRect;
  onCommit: BeginCustomEditorOptions["onCommit"];
  onCancel: BeginCustomEditorOptions["onCancel"];
  composing: boolean;
  tearingDown: boolean;
  commitPending: boolean;
}

/** Owns exactly one host-supplied editor instance and guards all late callbacks. */
export class CustomEditorController {
  private active: ActiveEditor | null = null;
  private generation = 0;

  constructor(private readonly host: HTMLElement) {}

  get isEditing(): boolean {
    return this.active !== null;
  }

  begin(options: BeginCustomEditorOptions): void {
    this.cancel(false);

    const wrapper = document.createElement("div");
    wrapper.className = "sheetwrite-custom-editor";
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", options.label);
    // Focusable so a press on an editor button that does not take focus (WebKit
    // never focuses pressed buttons) moves focus to the wrapper, not out of it.
    wrapper.tabIndex = -1;
    wrapper.style.position = "absolute";
    wrapper.style.zIndex = "6";
    wrapper.style.pointerEvents = "auto";

    const active: ActiveEditor = {
      generation: ++this.generation,
      abort: new AbortController(),
      wrapper,
      instance: null,
      state: {
        ...options,
        address: { ...options.address },
        viewAddress: { ...options.viewAddress },
        column: snapshot_column(options.column),
      },
      rect: options.rect,
      onCommit: options.onCommit,
      onCancel: options.onCancel,
      composing: false,
      tearingDown: false,
      commitPending: false,
    };
    this.active = active;
    this.host.appendChild(wrapper);
    this.position(options.rect);

    wrapper.addEventListener("compositionstart", this.on_composition_start);
    wrapper.addEventListener("compositionend", this.on_composition_end);
    wrapper.addEventListener("keydown", this.on_key_down);
    wrapper.addEventListener("focusout", this.on_focus_out);

    const context = this.context(active);
    try {
      const instance = options.editor.mount(wrapper, context);
      if (this.active !== active) {
        try {
          instance.destroy();
        } catch (error) {
          report_custom_editor_error(error);
        }
        return;
      }
      active.instance = instance;
      instance.reposition(options.rect);
      this.focus_editor(active);
    } catch (error) {
      const teardown_error = this.teardown(active);
      if (teardown_error !== NO_EDITOR_ERROR) report_custom_editor_error(teardown_error);
      throw error;
    }
  }

  /** Refresh external state after a transaction without replacing ownership. */
  update(
    state: Partial<Omit<CustomEditorState, "grid" | "address" | "initialInput" | "selectAll">>,
  ): void {
    const active = this.active;
    if (!active?.instance) return;
    active.state = {
      ...active.state,
      ...state,
      column: state.column ? snapshot_column(state.column) : active.state.column,
    };
    active.wrapper.setAttribute("aria-label", active.state.label);
    active.instance.update(this.context(active));
  }

  position(rect: CellEditorRect): void {
    const active = this.active;
    if (!active) return;
    active.rect = rect;
    active.wrapper.style.left = `${rect.x}px`;
    active.wrapper.style.top = `${rect.y}px`;
    active.wrapper.style.width = `${rect.width}px`;
    active.wrapper.style.minHeight = `${rect.height}px`;
    active.instance?.reposition(rect);
  }

  cancel(notify = true): void {
    const active = this.active;
    if (!active) return;
    active.abort.abort();
    let cancel_error: unknown = NO_EDITOR_ERROR;
    try {
      active.instance?.cancel();
    } catch (error) {
      cancel_error = error;
    }
    const teardown_error = this.teardown(active);
    try {
      if (notify) active.onCancel();
    } finally {
      if (cancel_error !== NO_EDITOR_ERROR) report_custom_editor_error(cancel_error);
      if (teardown_error !== NO_EDITOR_ERROR) report_custom_editor_error(teardown_error);
    }
  }

  destroy(): void {
    this.cancel(false);
  }

  private context(active: ActiveEditor): CellEditorContext {
    const generation = active.generation;
    return {
      ...active.state,
      address: { ...active.state.address },
      viewAddress: { ...active.state.viewAddress },
      column: snapshot_column(active.state.column),
      signal: active.abort.signal,
      commit: (value, navigation = "none") => {
        if (this.active?.generation !== generation || active.abort.signal.aborted) return;
        if (typeof value !== "string") {
          this.cancel();
          return;
        }
        this.finish_commit(active, value, navigation);
      },
      cancel: () => {
        if (this.active?.generation !== generation || active.abort.signal.aborted) return;
        this.cancel();
      },
    };
  }

  private focus_editor(active: ActiveEditor): void {
    const target = active.wrapper.querySelector<HTMLElement>(
      "input,textarea,select,button,[contenteditable=true],[tabindex]",
    );
    const focus_target = target ?? active.wrapper;
    if (!focus_target.hasAttribute("aria-label") && !focus_target.hasAttribute("aria-labelledby")) {
      focus_target.setAttribute("aria-label", active.state.label);
    }
    focus_target.focus({ preventScroll: true });
  }

  private request_commit(active: ActiveEditor, navigation: CellEditorNavigation): void {
    if (
      this.active !== active ||
      active.abort.signal.aborted ||
      active.commitPending ||
      !active.instance
    ) {
      return;
    }

    let result: string | void | Promise<string | void>;
    try {
      result = active.instance.commit(navigation);
    } catch {
      this.cancel();
      return;
    }
    if (typeof result === "string") {
      this.finish_commit(active, result, navigation);
      return;
    }
    if (result === undefined) {
      this.cancel();
      return;
    }

    active.commitPending = true;
    active.wrapper.setAttribute("aria-busy", "true");
    void Promise.resolve(result).then(
      (value) => {
        if (this.active !== active || active.abort.signal.aborted) return;
        active.commitPending = false;
        active.wrapper.removeAttribute("aria-busy");
        if (typeof value === "string") this.finish_commit(active, value, navigation);
        else this.cancel();
      },
      () => {
        if (this.active !== active || active.abort.signal.aborted) return;
        active.commitPending = false;
        active.wrapper.removeAttribute("aria-busy");
        this.cancel();
      },
    );
  }

  private finish_commit(
    active: ActiveEditor,
    value: string,
    navigation: CellEditorNavigation,
  ): void {
    if (this.active !== active || active.abort.signal.aborted) return;
    const teardown_error = this.teardown(active);
    try {
      active.onCommit(value, navigation);
    } finally {
      if (teardown_error !== NO_EDITOR_ERROR) report_custom_editor_error(teardown_error);
    }
  }

  private teardown(active: ActiveEditor): unknown {
    if (this.active !== active || active.tearingDown) return NO_EDITOR_ERROR;
    active.tearingDown = true;
    this.active = null;
    active.abort.abort();
    active.wrapper.removeEventListener("compositionstart", this.on_composition_start);
    active.wrapper.removeEventListener("compositionend", this.on_composition_end);
    active.wrapper.removeEventListener("keydown", this.on_key_down);
    active.wrapper.removeEventListener("focusout", this.on_focus_out);
    let error: unknown = NO_EDITOR_ERROR;
    try {
      active.instance?.destroy();
    } catch (caught) {
      error = caught;
    } finally {
      active.wrapper.remove();
      active.instance = null;
      active.tearingDown = false;
    }
    return error;
  }

  private readonly on_composition_start = (): void => {
    if (this.active) this.active.composing = true;
  };

  private readonly on_composition_end = (): void => {
    if (this.active) this.active.composing = false;
  };

  private readonly on_key_down = (event: KeyboardEvent): void => {
    const active = this.active;
    if (!active || active.composing || event.isComposing || event.defaultPrevented) return;
    let navigation: CellEditorNavigation | null = null;
    if (event.key === "Enter" && !event.shiftKey) navigation = "down";
    else if (event.key === "Tab") navigation = event.shiftKey ? "left" : "right";
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      return;
    }
    if (!navigation || !active.instance) return;
    event.preventDefault();
    event.stopPropagation();
    this.request_commit(active, navigation);
  };

  private readonly on_focus_out = (event: FocusEvent): void => {
    const active = this.active;
    if (!active || active.tearingDown || active.commitPending) return;
    if (event.relatedTarget instanceof Node && active.wrapper.contains(event.relatedTarget)) return;
    this.request_commit(active, "none");
  };
}
