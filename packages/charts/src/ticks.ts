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

/** The smallest rounded step (1, 2, 2.5 or 5 × 10^n) that covers `span` in at most `maxTicks` steps. */
function roundedStep(span: number, maxTicks: number): number {
  const rawStep = span / Math.max(1, maxTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  // The last mantissa, 10, always covers the raw step, so the fallback never applies.
  const mantissa = STEP_MANTISSAS.find((candidate) => candidate * magnitude >= rawStep) ?? 10;

  return mantissa * magnitude;
}

/** `toFixed` accepts at most this many digits. */
const MAX_FRACTION_DIGITS = 20;

/** Float error below this is noise from the multiplication, not a real digit. */
const DIGIT_TOLERANCE = 1e-9;

/** Decimal places that show every multiple of `step` exactly. */
function stepDecimals(step: number): number {
  let decimals = 0;

  // A float step like 0.25 or 2.5e-7 needs its exact decimal count, not a log estimate.
  while (decimals < MAX_FRACTION_DIGITS) {
    const scaled = step * 10 ** decimals;
    if (Math.abs(Math.round(scaled) - scaled) <= DIGIT_TOLERANCE) break;
    decimals += 1;
  }

  return decimals;
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

  const step = roundedStep(high - low, maxTicks);
  const decimals = stepDecimals(step);
  const first = Math.floor(low / step);
  const last = Math.ceil(high / step);
  const ticks: number[] = [];

  // Compute each tick from its index and round it, so float drift never shows as 0.30000000000000004.
  // Adding 0 turns -0 into 0, which would otherwise format as "-0".
  for (let index = first; index <= last; index += 1) {
    ticks.push(Number((index * step).toFixed(decimals)) + 0);
  }

  return { min: ticks[0] ?? low, max: ticks[ticks.length - 1] ?? high, step, ticks };
}
