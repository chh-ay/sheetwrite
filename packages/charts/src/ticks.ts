/** Mantissas of a rounded tick step: each step is one of these times a power of ten. */
const STEP_MANTISSAS = [1, 2, 2.5, 5, 10] as const;

/**
 * When all values are on one side of zero and the smallest magnitude is more
 * than this share of the largest, the axis starts near the data, not at zero.
 * Excel uses the same 5/6 rule, so small changes to large values stay visible.
 */
const ZERO_BASELINE_SHARE = 5 / 6;

/** A value axis: the domain ends are tick values, and `ticks` runs from `min` to `max`. */
export interface TickScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** `toFixed` accepts at most this many digits. */
const MAX_FRACTION_DIGITS = 100;

/**
 * Division drift in tick units, such as 0.7 / 0.1 = 6.999999999999999. It is
 * relative to the step, so it holds for steps of any size.
 */
const TICK_INDEX_TOLERANCE = 1e-9;

/**
 * The smallest rounded step (1, 2, 2.5 or 5 × 10^n) that covers `span` in at
 * most `maxTicks` steps, and the decimal places that show its multiples exactly.
 */
function roundedStep(span: number, maxTicks: number): { step: number; decimals: number } {
  const rawStep = span / Math.max(1, maxTicks);
  let exponent = Math.floor(Math.log10(rawStep));
  // The last mantissa, 10, always covers the raw step, so the fallback never applies.
  let mantissa: number =
    STEP_MANTISSAS.find((candidate) => candidate * 10 ** exponent >= rawStep) ?? 10;
  if (mantissa === 10) {
    mantissa = 1;
    exponent += 1;
  }

  // 2.5 has one decimal of its own; the other mantissas are whole numbers.
  const decimals = Math.max(0, -exponent) + (mantissa === 2.5 ? 1 : 0);
  return { step: mantissa * 10 ** exponent, decimals: Math.min(decimals, MAX_FRACTION_DIGITS) };
}

/**
 * Rounded ticks that cover `[dataMin, dataMax]`. With `includeZero`, the axis
 * includes zero unless the data is far from it, so bars and areas have a baseline.
 */
export function tickScale(
  dataMin: number,
  dataMax: number,
  maxTicks: number,
  includeZero: boolean,
): TickScale {
  let low = dataMin;
  let high = dataMax;

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    low = 0;
    high = 1;
  }

  if (includeZero) {
    if (low > 0 && low <= high * ZERO_BASELINE_SHARE) low = 0;
    if (high < 0 && high >= low * ZERO_BASELINE_SHARE) high = 0;
  }

  // A flat series still needs a span to place its ticks around the value.
  if (low === high) {
    const pad = low === 0 ? 1 : Math.abs(low) / 2;
    if (low >= 0 && includeZero) {
      low = 0;
      high = high === 0 ? 1 : high + pad;
    } else {
      low -= pad;
      high += pad;
    }
  }

  const { step, decimals } = roundedStep(high - low, maxTicks);
  const first = Math.floor(low / step + TICK_INDEX_TOLERANCE);
  const last = Math.ceil(high / step - TICK_INDEX_TOLERANCE);
  const ticks: number[] = [];

  // Compute each tick from its index and round it, so float drift never shows as 0.30000000000000004.
  // Adding 0 turns -0 into 0, which would otherwise format as "-0".
  for (let index = first; index <= last; index += 1) {
    ticks.push(Number((index * step).toFixed(decimals)) + 0);
  }

  return { min: ticks[0] ?? low, max: ticks[ticks.length - 1] ?? high, step, ticks };
}
