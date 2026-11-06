import { useEffect, useRef, useState } from "react";

/** Props of {@link LiveGrid}. */
interface LiveGridProps {
  /** A key of `LIVE_WORKBOOKS` (figures/live-workbooks.ts). */
  readonly name: string;
  /** The grid's height in CSS pixels; the space is held before the grid loads. */
  readonly height?: number;
  /** The grid region's accessible name. */
  readonly label: string;
  readonly caption?: string;
}

/** Load the grid this far before it scrolls into view. */
const PRELOAD_MARGIN = "200px";
const DEFAULT_HEIGHT = 240;

/** "idle" until the grid scrolls near, then "loading", then "ready" or "failed". */
type LiveGridState = "idle" | "loading" | "ready" | "failed";

/**
 * An editable grid on a docs page. The page holds its space from the start,
 * so nothing moves when it loads, and the engine, the styles and the
 * workbook load only when the grid comes near the viewport.
 */
export function LiveGrid({ name, height = DEFAULT_HEIGHT, label, caption }: LiveGridProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LiveGridState>("idle");

  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    let dispose: (() => void) | undefined;
    let removed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setState("loading");
        import("../figures/live-grid.js")
          .then(({ mountLiveGrid }) => mountLiveGrid(element, name))
          .then(
            (teardown) => {
              if (removed) return teardown();
              dispose = teardown;
              setState("ready");
            },
            () => setState("failed"),
          );
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(element);
    return () => {
      removed = true;
      observer.disconnect();
      dispose?.();
    };
  }, [name]);

  return (
    <figure className="sw-live-grid" data-state={state}>
      <div
        aria-busy={state === "loading"}
        aria-label={label}
        className="sw-live-grid__host"
        ref={host}
        role="region"
        style={{ height }}
      >
        {state === "failed" && (
          <p className="sw-live-grid__status">The live grid could not load. Reload to try again.</p>
        )}
      </div>
      {caption !== undefined && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
