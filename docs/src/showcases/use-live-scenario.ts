import { useEffect, useRef, useState, type RefObject } from "react";

import { errorText } from "../lib/errors.js";

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
export function useLiveScenario<Snapshot, Scenario extends LiveScenario<Snapshot>>(
  create: (host: HTMLElement) => Scenario,
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
