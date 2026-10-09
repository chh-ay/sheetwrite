import { useEffect, useRef, useState } from "react";

export interface TimelineOptions<T extends HTMLElement> {
  /** Loop length in seconds. */
  loopSeconds: number;
  /** The time shown, without motion, when the reader asks for reduced motion. */
  stillSeconds: number;
  /**
   * Called once per mount (and again on replay) with the root element. It
   * returns the frame function, which draws the picture for a loop time `t`
   * straight into the DOM. When `t` is smaller than the previous call, the
   * loop has started again.
   */
  create: (root: T) => (t: number) => void;
}

/**
 * Runs a scripted illustration: one `requestAnimationFrame` loop that draws
 * each frame from the elapsed time. The loop runs only while the root is on
 * screen and motion is allowed; reduced motion draws `stillSeconds` once.
 * `data-landing-running` on the root reports whether the loop runs.
 * `seek(seconds)` starts a fresh scene at that time; replay starts at zero.
 */
export function useTimeline<T extends HTMLElement>(options: TimelineOptions<T>) {
  const ref = useRef<T>(null);
  // Options are read at mount; the loop never restarts because a caller
  // passed a new function object.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [epoch, setEpoch] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    void epoch;
    const root = ref.current;
    if (!root) return;
    const { loopSeconds, stillSeconds, create } = optionsRef.current;
    const draw = create(root);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let raf = 0;
    const start = startRef.current;
    let elapsed = start ?? 0;
    let last = 0;

    const tick = (now: number) => {
      // A long pause (a background tab) does not skip the picture ahead.
      elapsed += Math.min(100, now - last) / 1000;
      last = now;
      draw(elapsed % loopSeconds);
      raf = requestAnimationFrame(tick);
    };
    const update = () => {
      const play = visible && !reducedMotion.matches;
      root.dataset.landingRunning = String(play);
      cancelAnimationFrame(raf);
      raf = 0;
      if (play) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else if (reducedMotion.matches) {
        draw(start ?? stillSeconds);
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        update();
      },
      { threshold: 0.15 },
    );
    draw(reducedMotion.matches ? (start ?? stillSeconds) : elapsed);
    observer.observe(root);
    reducedMotion.addEventListener("change", update);
    update();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      reducedMotion.removeEventListener("change", update);
    };
  }, [epoch]);

  const seek = (seconds: number) => {
    startRef.current = seconds;
    setEpoch((value) => value + 1);
  };
  return { ref, seek, replay: () => seek(0) };
}
