import { errorText } from "@docs/lib/errors.js";
import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";

import { useAction } from "../../lib/use-action.js";
import { whenNearViewport } from "./near-viewport.js";

/** A framework-neutral showcase scenario: a live grid and a snapshot of what it shows. */
export interface LiveScenario<Snapshot> {
  readonly ready: Promise<void>;
  snapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/** A scenario without a snapshot to follow: a grid that is ready, then disposed. */
export interface StartedScenario {
  readonly ready: Promise<void>;
  dispose(): void;
}

export interface LiveScenarioState<Snapshot, Scenario> {
  /** Pass as the grid host's `ref`. */
  readonly host: (element: HTMLElement) => void;
  /** The scenario once its grid is ready, for the controls to call. */
  readonly scenario: Accessor<Scenario | null>;
  readonly snapshot: Accessor<Snapshot | null>;
  /** Why the scenario failed to start. */
  readonly error: Accessor<string | null>;
}

/**
 * Creates a scenario in the host element once the host comes near the
 * viewport, follows its snapshot (when it has one), and disposes it with the
 * island. `load` imports the module with the scenario's factory, so the
 * engine, the workbook and the grid styles load only then.
 */
export function createLiveScenario<Scenario extends StartedScenario, Snapshot = never>(
  load: () => Promise<(host: HTMLElement) => Scenario>,
  options: {
    readonly onReady?: (scenario: Scenario) => void;
    readonly onDispose?: () => void;
  } = {},
): LiveScenarioState<Snapshot, Scenario> {
  let hostElement: HTMLElement | undefined;
  const [scenario, setScenario] = createSignal<Scenario | null>(null);
  const [snapshot, setSnapshot] = createSignal<Snapshot | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    const host = hostElement;
    if (host === undefined) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    const stopWaiting = whenNearViewport(host, () => {
      load()
        .then((create) => {
          if (disposed) return;
          const instance = create(host);
          const live = instance as Scenario & Partial<LiveScenario<Snapshot>>;
          const unsubscribe = live.subscribe?.(() => setSnapshot(() => live.snapshot?.() ?? null));
          stop = () => {
            unsubscribe?.();
            instance.dispose();
            options.onDispose?.();
          };
          return instance.ready.then(() => {
            if (disposed) return;
            if (live.snapshot) setSnapshot(() => live.snapshot?.() ?? null);
            setScenario(() => instance);
            options.onReady?.(instance);
          });
        })
        .catch((cause: unknown) => {
          if (!disposed) setError(errorText(cause));
        });
    });
    onCleanup(() => {
      disposed = true;
      stopWaiting();
      stop?.();
      setScenario(null);
    });
  });

  return {
    host: (element) => {
      hostElement = element;
    },
    scenario,
    snapshot,
    error,
  };
}

/**
 * Runs a side-panel action on the scenario. A failure shows as the action's
 * error: the scenario's own message, or `what` failed when it threw no Error.
 * The controls stay disabled until the scenario is ready.
 */
export function createScenarioAction<Scenario>(scenario: Accessor<Scenario | null>) {
  const action = useAction();
  const run = (what: string, call: (current: Scenario) => unknown) =>
    action.run(
      async () => {
        const current = scenario();
        if (current) await call(current);
      },
      (cause) => (cause instanceof Error ? cause.message : `${what} failed: ${errorText(cause)}`),
    );
  return {
    run,
    disabled: () => scenario() === null || action.pending,
    error: () => action.error,
    pending: () => action.pending,
  };
}
