const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const ease = (progress: number) =>
  progress < 0.5 ? 4 * progress * progress * progress : 1 - (-2 * progress + 2) ** 3 / 2;
/** 0 → 1 between `from` and `to`, eased. */
const span = (time: number, from: number, to: number) => ease(clamp((time - from) / (to - from)));
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
const count = (value: number) => Math.round(value).toLocaleString("en-US");

export { clamp, count, ease, lerp, span };
