import { onCleanup, onMount } from "solid-js";

/** A playing scene: `sync()` applies the current decision again, `stop()` ends the watching. */
export interface SceneHandle {
  readonly sync: () => void;
  readonly stop: () => void;
}

/**
 * Plays the CSS animations inside a landing illustration only while it is on
 * screen, and never when the reader asks for reduced motion.
 *
 * The illustrations are plain SVG with CSS keyframes. Their non-animated
 * styles are the finished, informative state, so a reduced-motion reader (for
 * whom the stylesheet removes the animations) sees the complete picture.
 * `data-landing-running` reports whether the scene can play its animations.
 * `sync()` applies the decision to animations that started later (a newly
 * selected story).
 */
export function playScene(root: HTMLElement): SceneHandle {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false;
  const apply = (): void => {
    const play = visible && !reducedMotion.matches;
    const animations = root.getAnimations({ subtree: true });
    for (const animation of animations) {
      // Pause only running animations and resume only paused ones: play()
      // on a finished animation starts it again, so a finished entrance
      // would play again when the reader scrolls back.
      if (!play && animation.playState === "running") animation.pause();
      else if (play && animation.playState === "paused") animation.play();
    }
    root.dataset.landingRunning = String(play && animations.length > 0);
  };
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? false;
      apply();
    },
    { threshold: 0.2 },
  );
  // A changed motion preference adds or removes the CSS animations at the
  // next style pass, so the decision waits for that frame.
  const onPreference = (): void => {
    requestAnimationFrame(apply);
  };
  observer.observe(root);
  reducedMotion.addEventListener("change", onPreference);
  apply();
  return {
    sync: apply,
    stop: () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", onPreference);
    },
  };
}

export interface ScenePlayback<T extends HTMLElement> {
  /** Pass as the root element's `ref`. */
  readonly ref: (root: T) => void;
  /** Applies the current decision to animations that mounted later (a newly selected story). */
  readonly sync: () => void;
}

/** {@link playScene} for a component's root element, from mount to cleanup. */
export function createScenePlayback<T extends HTMLElement>(): ScenePlayback<T> {
  let root: T | undefined;
  let scene: SceneHandle | undefined;
  onMount(() => {
    if (root !== undefined) scene = playScene(root);
  });
  onCleanup(() => {
    scene?.stop();
    scene = undefined;
  });
  return {
    ref: (element) => {
      root = element;
    },
    sync: () => scene?.sync(),
  };
}
