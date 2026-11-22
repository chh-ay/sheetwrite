import { type ActionGuard, type ActionState, createActionGuard } from "@docs/lib/action-guard.js";
import { createSignal } from "solid-js";

/**
 * Solid binding for {@link createActionGuard}: one guard per component
 * instance. `pending`, `error` and `state` are reactive getters, so read them
 * where they render (never destructure them).
 */
function useAction(): ActionGuard & ActionState {
  const [state, set_state] = createSignal<ActionState>({ pending: false, error: null });
  const { run, clearError: clear_error } = createActionGuard(set_state);
  return {
    get pending() {
      return state().pending;
    },
    get error() {
      return state().error;
    },
    get state() {
      return state();
    },
    run,
    clearError: clear_error,
  };
}

/** Attributes that mark a button as working on its action (styled by the site CSS). */
function pendingProps(pending: boolean): { "aria-busy"?: true; disabled?: true } {
  return pending ? { "aria-busy": true, disabled: true } : {};
}

/** The one place an action failure is shown, next to the controls it belongs to. */
function ActionError(props: Readonly<{ error: string | null }>) {
  return (
    <p class="sw-action-error" data-action-error="" hidden={props.error === null} role="alert">
      {props.error}
    </p>
  );
}

export { ActionError, pendingProps, useAction };
