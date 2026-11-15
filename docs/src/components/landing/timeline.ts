import { onCleanup, onMount } from "solid-js";

export interface TimelineOptions<T extends HTMLElement> {
  /** Loop length in seconds. */
  readonly loopSeconds: number;
  /** The time shown, without motion, when the reader asks for reduced motion. */
  readonly stillSeconds: number;
  /**
   * Called once per run (on mount, and again on each seek or replay) with the
   * root element. It returns the frame function, which draws the picture for
   * a loop time `t` straight into the DOM. When `t` is smaller than the
   * previous call, the loop has started again.
   */
  readonly create: (root: T) => (t: number) => void;
}

export interface Timeline<T extends HTMLElement> {
  /** Pass as the root element's `ref`. */
  readonly ref: (root: T) => void;
  /** Starts a fresh scene at `seconds`. */
  readonly seek: (seconds: number) => void;
  /** Starts a fresh scene at zero. */
  readonly replay: () => void;
}

/**
 * Runs a scripted illustration: one `requestAnimationFrame` loop that draws
 * each frame from the elapsed time. The loop runs only while the root is on
 * screen and motion is allowed; reduced motion draws `stillSeconds` once (or
 * the time the reader seeked to). `data-landing-running` on the root reports
 * whether the loop runs.
 */
export function createTimeline<T extends HTMLElement>(options: TimelineOptions<T>): Timeline<T> {
  let root: T | undefined;
  let start: number | null = null;
  let stop = (): void => {};

  const run = (): void => {
    stop();
    const element = root;
    if (element === undefined) return;
    const { loopSeconds, stillSeconds, create } = options;
    const draw = create(element);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const startAt = start;
    let visible = false;
    let raf = 0;
    let elapsed = startAt ?? 0;
    let last = 0;

    const tick = (now: number): void => {
      // A long pause (a background tab) does not skip the picture ahead.
      elapsed += Math.min(100, now - last) / 1000;
      last = now;
      draw(elapsed % loopSeconds);
      raf = requestAnimationFrame(tick);
    };
    const update = (): void => {
      const play = visible && !reducedMotion.matches;
      element.dataset.landingRunning = String(play);
      cancelAnimationFrame(raf);
      raf = 0;
      if (play) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else if (reducedMotion.matches) {
        draw(startAt ?? stillSeconds);
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        update();
      },
      { threshold: 0.15 },
    );
    draw(reducedMotion.matches ? (startAt ?? stillSeconds) : elapsed);
    observer.observe(element);
    reducedMotion.addEventListener("change", update);
    update();
    stop = () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      reducedMotion.removeEventListener("change", update);
    };
  };

  onMount(run);
  onCleanup(() => stop());

  const seek = (seconds: number): void => {
    start = seconds;
    run();
  };
  return {
    ref: (element) => {
      root = element;
    },
    seek,
    replay: () => seek(0),
  };
}
