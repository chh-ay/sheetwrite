/**
 * One in-flight guard for a showcase action button: a second start while the
 * first runs is ignored, and a failure becomes a readable message instead of
 * a stuck control. Framework-neutral, so React, Vue, Svelte and plain DOM
 * showcases share one behavior.
 */

interface ActionState {
  readonly pending: boolean;
  /** One sentence for the user: what failed and what to do. */
  readonly error: string | null;
}

interface ActionGuard {
  readonly state: ActionState;
  /**
   * Runs `action` unless one is already running. Resolves to false when the
   * start was ignored or the action failed.
   */
  run(action: () => unknown, failure: (cause: unknown) => string): Promise<boolean>;
  clearError(): void;
}

const IDLE: ActionState = { pending: false, error: null };

function createActionGuard(onChange: (state: ActionState) => void): ActionGuard {
  let state = IDLE;
  const set = (next: ActionState): void => {
    state = next;
    onChange(next);
  };
  return {
    get state() {
      return state;
    },
    async run(action, failure) {
      // The flag lives outside framework state, so two clicks in one frame
      // cannot both pass before a re-render disables the button.
      if (state.pending) return false;
      set({ pending: true, error: null });
      try {
        await action();
        set(IDLE);
        return true;
      } catch (cause) {
        set({ pending: false, error: failure(cause) });
        return false;
      }
    },
    clearError() {
      if (state.error !== null) set({ ...state, error: null });
    },
  };
}

/**
 * The second click of a double-click: a toggle button (create/destroy,
 * connect/disconnect) must not undo the first click with it.
 */
function isRepeatClick(event: { readonly detail: number }): boolean {
  return event.detail > 1;
}

export { createActionGuard, isRepeatClick, type ActionGuard, type ActionState };
