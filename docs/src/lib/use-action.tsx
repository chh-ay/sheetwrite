import { useRef, useState } from "react";

import { type ActionGuard, type ActionState, createActionGuard } from "./action-guard.js";

/** React binding for {@link createActionGuard}: one guard per component instance. */
function useAction(): ActionGuard & ActionState {
  const [state, setState] = useState<ActionState>({ pending: false, error: null });
  const guard = useRef<ActionGuard | null>(null);
  guard.current ??= createActionGuard(setState);
  const { run, clearError } = guard.current;
  return { ...state, state, run, clearError };
}

/** Attributes that mark a button as working on its action (styled by the site CSS). */
function pendingProps(pending: boolean): { "aria-busy"?: true; disabled?: true } {
  return pending ? { "aria-busy": true, disabled: true } : {};
}

/** The one place an action failure is shown, next to the controls it belongs to. */
function ActionError({ error }: Readonly<{ error: string | null }>) {
  return (
    <p className="sw-action-error" data-action-error="" hidden={error === null} role="alert">
      {error}
    </p>
  );
}

export { ActionError, pendingProps, useAction };
