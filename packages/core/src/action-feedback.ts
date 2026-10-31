import type { ClipboardOutcome, Grid } from "./types/grid.js";

/**
 * What a user reads when a built-in command cannot finish. Outcomes not
 * listed here ("done", "empty") need no message.
 */
const CLIPBOARD_MESSAGES: Partial<Record<ClipboardOutcome, string>> = {
  blocked:
    "The browser blocked clipboard access. Allow clipboard access for this site, or use the keyboard shortcut.",
  unsupported:
    "This browser cannot use the clipboard from a menu. Use the keyboard shortcut instead.",
};

/** How long a message stays before it clears itself. */
const MESSAGE_MS = 6000;

function isClipboardOutcome(value: unknown): value is ClipboardOutcome {
  return value === "done" || value === "empty" || value === "blocked" || value === "unsupported";
}

/** The text a user reads for a thrown value: the error message, or the value itself. */
export function errorDetail(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : String(cause);
}

/**
 * One feedback channel per grid for its built-in toolbar, context menu and
 * find bar: a command already running ignores a second start, its button
 * shows that it is busy, and a failure or a refused clipboard becomes one
 * readable alert instead of a silent no-op.
 */
class ActionFeedback {
  private readonly el: HTMLElement;
  private readonly running = new Set<string>();
  private timer: number | undefined;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "sheetwrite-action-status";
    this.el.setAttribute("role", "alert");
    this.el.hidden = true;
    host.appendChild(this.el);
  }

  isRunning(key: string): boolean {
    return this.running.has(key);
  }

  /**
   * Runs one command unless the same command is still running. `button`, when
   * given, carries the busy state for the duration.
   */
  async run(key: string, command: () => unknown, button?: HTMLButtonElement): Promise<void> {
    if (this.running.has(key)) return;
    this.running.add(key);
    const wasDisabled = button?.disabled ?? false;
    const label = button?.getAttribute("aria-label");
    const title = button?.title;
    if (button) {
      const name = label ?? button.textContent ?? key;
      button.setAttribute("aria-label", `Running ${name}…`);
      button.title = `Running ${name}…`;
    }
    button?.setAttribute("aria-busy", "true");
    if (button) button.disabled = true;
    try {
      const outcome = await command();
      if (isClipboardOutcome(outcome)) {
        const message = CLIPBOARD_MESSAGES[outcome];
        if (message !== undefined) this.show(message);
      }
    } catch (cause) {
      this.show(`The command did not finish: ${errorDetail(cause)}`);
    } finally {
      this.running.delete(key);
      button?.removeAttribute("aria-busy");
      if (button) {
        if (label === null || label === undefined) button.removeAttribute("aria-label");
        else button.setAttribute("aria-label", label);
        button.title = title ?? "";
      }
      // Command state may have changed meanwhile; only undo our own disable.
      if (button && !wasDisabled) button.disabled = false;
    }
  }

  show(message: string): void {
    this.el.textContent = message;
    this.el.hidden = false;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.clear(), MESSAGE_MS);
  }

  clear(): void {
    window.clearTimeout(this.timer);
    this.el.hidden = true;
    this.el.textContent = "";
  }

  destroy(): void {
    window.clearTimeout(this.timer);
    this.el.remove();
  }
}

/** Feedback channels by grid, so shell chrome built outside the grid finds its grid's channel. */
const channels = new WeakMap<Grid, ActionFeedback>();

function attachActionFeedback(grid: Grid, host: HTMLElement): ActionFeedback {
  const feedback = new ActionFeedback(host);
  channels.set(grid, feedback);
  return feedback;
}

function actionFeedbackFor(grid: Grid): ActionFeedback | undefined {
  return channels.get(grid);
}

export { ActionFeedback, actionFeedbackFor, attachActionFeedback };
