import { useEffect, useRef, useState, type RefObject } from "react";

import { errorText } from "../lib/errors.js";
import { useAction } from "../lib/use-action.js";

/** A framework-neutral showcase scenario: a live grid and a snapshot of what it shows. */
export interface LiveScenario<Snapshot> {
  readonly ready: Promise<void>;
  snapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export interface LiveScenarioState<Snapshot, Scenario> {
  readonly hostRef: RefObject<HTMLDivElement | null>;
  /** The scenario once its grid is ready, for the controls to call. */
  readonly scenario: Scenario | null;
  readonly snapshot: Snapshot | null;
  /** Why the scenario failed to start. */
  readonly error: string | null;
}

/**
 * Create the scenario in the host element on mount, follow its snapshot, and
 * dispose it on unmount. Pass a module-level `create`, so it stays the same.
 */
export function useLiveScenario<Snapshot, Scenario>(
  // The intersection lets TypeScript infer `Snapshot` from the scenario type.
  create: (host: HTMLElement) => Scenario & LiveScenario<Snapshot>,
): LiveScenarioState<Snapshot, Scenario> {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const instance = create(host);
    let disposed = false;
    const unsubscribe = instance.subscribe(() => setSnapshot(instance.snapshot()));
    instance.ready
      .then(() => {
        if (disposed) return;
        setSnapshot(instance.snapshot());
        setScenario(instance);
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(errorText(cause));
      });

    return () => {
      disposed = true;
      unsubscribe();
      instance.dispose();
      setScenario(null);
    };
  }, [create]);

  return { hostRef, scenario, snapshot, error };
}

/**
 * Run a side-panel action on the scenario. A failure shows as the action's
 * error: the scenario's own message, or `what` failed when it threw no Error.
 * The controls stay disabled until the scenario is ready.
 */
export function useScenarioAction<Scenario>(scenario: Scenario | null) {
  const action = useAction();
  const run = (what: string, call: (current: Scenario) => unknown) =>
    action.run(
      async () => {
        if (scenario) await call(scenario);
      },
      (cause) => (cause instanceof Error ? cause.message : `${what} failed: ${errorText(cause)}`),
    );

  return { run, disabled: scenario === null || action.pending, error: action.error };
}
