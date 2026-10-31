/**
 * Lifetime scopes (see GLOSSARY.md: scope, disposer, abort). A scope owns an
 * `AbortController` and a list of disposers. Closing it aborts its signal
 * first, so work that checks the signal stops, then runs the disposers in
 * reverse order of registration. Grid, chrome builds and long operations each
 * have one; a child scope closes with its parent.
 */
export class Scope {
  readonly signal: AbortSignal;
  private readonly controller: AbortController;
  /** Insertion order is registration order; a `Set` lets a finished disposer leave in O(1). */
  private readonly disposers = new Set<() => void>();

  constructor() {
    this.controller = new AbortController();
    this.signal = this.controller.signal;
  }

  get closed(): boolean {
    return this.signal.aborted;
  }

  /**
   * Run `dispose` when the scope closes, or at once when it is already closed.
   * Returns a function that removes `dispose` without running it, for a
   * resource that was freed another way first.
   */
  add(dispose: () => void): () => void {
    if (this.closed) {
      dispose();
      return noop;
    }
    this.disposers.add(dispose);
    return () => {
      this.disposers.delete(dispose);
    };
  }

  /**
   * A scope that closes with this one, with this scope's abort reason. A
   * child that closes first leaves this scope's list, so short operations
   * do not grow it.
   */
  child(): Scope {
    const child = new Scope();
    if (this.closed) {
      child.close(this.signal.reason);
      return child;
    }

    const leaveParent = this.add(() => child.close(this.signal.reason));
    child.add(leaveParent);
    return child;
  }

  /** Call `callback` after `delayMs`, unless the scope closes first. */
  setTimeout(callback: () => void, delayMs: number): void {
    const removeClear = this.add(() => clearTimeout(timer));
    const timer = setTimeout(() => {
      removeClear();
      callback();
    }, delayMs);
  }

  /**
   * Run `dispose` after `delayMs`, or at once when the scope closes first, so
   * a resource that must outlive the current task (an object URL that a
   * download still reads) is freed exactly once.
   */
  disposeAfter(dispose: () => void, delayMs: number): void {
    if (this.closed) {
      dispose();
      return;
    }

    const removeDispose = this.add(() => {
      clearTimeout(timer);
      dispose();
    });
    const timer = setTimeout(() => {
      removeDispose();
      dispose();
    }, delayMs);
  }

  /**
   * Abort the signal with `reason`, then run every disposer in reverse order.
   * Every disposer runs even when one throws; the first error is thrown after
   * the last one. Closing a closed scope does nothing.
   */
  close(reason?: unknown): void {
    if (this.closed) return;

    this.controller.abort(reason);
    const disposers = [...this.disposers];
    this.disposers.clear();
    let failure: unknown;
    let failed = false;
    for (let index = disposers.length - 1; index >= 0; index--) {
      try {
        disposers[index]?.();
      } catch (error) {
        if (!failed) {
          failure = error;
          failed = true;
        }
      }
    }
    if (failed) throw failure;
  }
}

/**
 * One operation of a kind at a time: `next()` closes the scope of the
 * running operation before it opens a new one, so a newer operation aborts
 * the older one.
 */
export class ScopeSlot {
  private readonly parent: Scope;
  private scope: Scope | null = null;

  constructor(parent: Scope) {
    this.parent = parent;
  }

  /** Whether an operation opened here is still running. */
  get active(): boolean {
    return this.scope !== null && !this.scope.closed;
  }

  /** Close the running operation, then open a scope for the next one. */
  next(): Scope {
    this.close();
    this.scope = this.parent.child();
    return this.scope;
  }

  /** The running operation's scope, or a new one when none runs. */
  current(): Scope {
    if (this.scope !== null && !this.scope.closed) return this.scope;
    this.scope = this.parent.child();
    return this.scope;
  }

  close(): void {
    const scope = this.scope;
    this.scope = null;
    scope?.close();
  }
}

/**
 * Give the page one turn (a 0 ms timer). Rejects with the scope's abort
 * reason as soon as the scope closes, and clears the timer then.
 */
export function nextTurn(scope: Scope): Promise<void> {
  const turn = Promise.withResolvers<void>();
  if (scope.closed) {
    turn.reject(scope.signal.reason);
    return turn.promise;
  }

  const removeStop = scope.add(() => {
    clearTimeout(timer);
    turn.reject(scope.signal.reason);
  });
  const timer = setTimeout(() => {
    removeStop();
    turn.resolve();
  }, 0);
  return turn.promise;
}

/**
 * Whether `error` is the reason of an abort: the `AbortError` that
 * `AbortController.abort()` makes when it gets no reason. An abort is not a
 * failure, so callers that alert the user on failures skip it.
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

function noop(): void {}
