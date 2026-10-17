import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays the CSS animations inside a landing illustration only while it is on
 * screen, and never when the reader asks for reduced motion.
 *
 * The illustrations are plain SVG with CSS keyframes. Their non-animated
 * styles are the finished, informative state, so a reduced-motion reader (for
 * whom the stylesheet removes the animations) sees the complete picture.
 * `data-landing-running` reports whether any animation currently plays.
 * `replay()` remounts the subtree through `epoch`, which restarts every
 * animation from its first frame. `sync()` applies the current decision to
 * animations that mounted later (for example a newly selected story).
 */
export function useScenePlayback<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const applyRef = useRef<() => void>(() => {});
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    // `epoch` only remounts the subtree; the observers attach to the same root.
    void epoch;
    const root = ref.current;
    if (!root) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const apply = () => {
      const play = visible && !reducedMotion.matches;
      const animations = root.getAnimations({ subtree: true });
      for (const animation of animations) {
        if (play) animation.play();
        else animation.pause();
      }
      root.dataset.landingRunning = String(play && animations.length > 0);
    };
    applyRef.current = apply;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        apply();
      },
      { threshold: 0.2 },
    );
    // A changed motion preference adds or removes the CSS animations at the
    // next style pass, so the decision waits for that frame.
    const onPreference = () => requestAnimationFrame(apply);
    observer.observe(root);
    reducedMotion.addEventListener("change", onPreference);
    apply();
    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", onPreference);
      applyRef.current = () => {};
    };
  }, [epoch]);

  const sync = useCallback(() => applyRef.current(), []);
  return { ref, epoch, sync, replay: () => setEpoch((value) => value + 1) };
}
