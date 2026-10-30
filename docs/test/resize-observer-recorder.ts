/**
 * Records which elements are under a live ResizeObserver observation. The
 * test DOM has no layout, so a page-level observer that forgets to unobserve a
 * removed element is visible only through this record.
 */
export class RecordingResizeObserver {
  static readonly observed = new Set<Element>();

  private readonly targets = new Set<Element>();

  observe(target: Element): void {
    this.targets.add(target);
    RecordingResizeObserver.observed.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
    RecordingResizeObserver.observed.delete(target);
  }

  disconnect(): void {
    for (const target of this.targets) RecordingResizeObserver.observed.delete(target);
    this.targets.clear();
  }
}

/** Replaces the global ResizeObserver; the returned function restores it. */
export function installRecordingResizeObserver(): () => void {
  const original = globalThis.ResizeObserver;
  RecordingResizeObserver.observed.clear();
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: RecordingResizeObserver,
  });
  return () => {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: original,
    });
  };
}
