import type { SheetwriteStore } from "../store.js";

/** A version rebuilt in a private engine instance. `free` releases the store and the instance. */
export interface RebuiltVersion {
  readonly store: SheetwriteStore;
  /** The revision the log tail reached. */
  readonly revision: number;
  free(): void;
}

interface Entry {
  readonly key: string;
  readonly version: RebuiltVersion;
  users: number;
  /** No longer kept: the last user frees it. */
  dropped: boolean;
}

/** Key prefix of the current head, whose content changes when it moves. */
const HEAD_KEY = "head:";

/**
 * Cache key of a leased version. A marker's ID is the content ID of its
 * fields, so it names one document. The head's revision and checkpoint name
 * the head's document; once the head moves, its old key never matches again.
 */
export function rebuiltKey(id: string, revision: number, checkpoint: string): string {
  return id === "head" ? `${HEAD_KEY}${revision}:${checkpoint}` : `version:${id}`;
}

/**
 * The last version an archive rebuilt, so that the history panel's select,
 * compare and restore rebuild it once instead of once per call. It keeps at
 * most one replay store. A store that a call still uses is freed when that
 * call returns.
 */
export class RebuiltVersionCache {
  private kept: Entry | undefined;

  /**
   * Run `action` on the kept version under `key`, or on one that `build`
   * rebuilds. With `keep`, a new build replaces the kept version; without
   * it, the build is freed after `action`.
   */
  async use<T>(
    key: string,
    keep: boolean,
    build: () => Promise<RebuiltVersion>,
    action: (version: RebuiltVersion) => T | Promise<T>,
  ): Promise<T> {
    let entry = this.kept?.key === key ? this.kept : undefined;
    if (!entry) {
      entry = { key, version: await build(), users: 0, dropped: !keep };
      if (keep) {
        this.release();
        this.kept = entry;
      }
    }

    entry.users += 1;
    try {
      return await action(entry.version);
    } finally {
      entry.users -= 1;
      if (entry.dropped && entry.users === 0) {
        entry.version.free();
      }
    }
  }

  /** Stop keeping the rebuilt version; it is freed now, or when its last user returns. */
  release(): void {
    const entry = this.kept;
    if (!entry) {
      return;
    }

    this.kept = undefined;
    entry.dropped = true;
    if (entry.users === 0) {
      entry.version.free();
    }
  }

  /** Release a kept head: the head moved, so it can no longer match. */
  releaseHead(): void {
    if (this.kept?.key.startsWith(HEAD_KEY)) {
      this.release();
    }
  }
}
