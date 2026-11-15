/** A framework-neutral showcase scenario: a live grid and a snapshot of what it shows. */
export interface LiveScenario<Snapshot> {
  readonly ready: Promise<void>;
  snapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
