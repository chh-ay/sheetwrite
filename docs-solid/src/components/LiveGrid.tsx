import { createEffect, createSignal, mergeProps, on, onCleanup, Show } from "solid-js";

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
export function LiveGrid(rawProps: LiveGridProps) {
  const props = mergeProps({ height: DEFAULT_HEIGHT }, rawProps);
  let host!: HTMLDivElement;
  const [state, setState] = createSignal<LiveGridState>("idle");

  createEffect(
    on(
      () => props.name,
      (name) => {
        const element = host;
        let dispose: (() => void) | undefined;
        let removed = false;
        const observer = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            setState("loading");
            import("@docs/figures/live-grid.js")
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
        onCleanup(() => {
          removed = true;
          observer.disconnect();
          dispose?.();
        });
      },
    ),
  );

  return (
    <figure class="sw-live-grid" data-state={state()}>
      <div
        aria-busy={state() === "loading"}
        aria-label={props.label}
        class="sw-live-grid__host"
        ref={(element) => {
          host = element;
        }}
        role="region"
        style={{ height: `${props.height}px` }}
      >
        <Show when={state() === "failed"}>
          <p class="sw-live-grid__status">The live grid could not load. Reload to try again.</p>
        </Show>
      </div>
      <Show when={props.caption !== undefined}>
        <figcaption>{props.caption}</figcaption>
      </Show>
    </figure>
  );
}
