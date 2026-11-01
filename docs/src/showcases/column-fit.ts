const ROW_GUTTER_MIN = 48;
const ROW_LABEL_FONT_PX = 13;
const ROW_LABEL_DIGIT_WIDTH = 0.6;
const ROW_LABEL_PADDING = 12;

export function rowGutterWidth(rowCount: number, minimum = ROW_GUTTER_MIN): number {
  const digits = String(Math.max(1, rowCount)).length;
  return Math.max(
    minimum,
    Math.ceil(digits * ROW_LABEL_FONT_PX * ROW_LABEL_DIGIT_WIDTH + ROW_LABEL_PADDING),
  );
}

interface ColumnFitPolicy {
  minimumScale: number;
  belowMinimum: "keep" | "clamp";
  rounding: "ceil" | "widest" | "ordered";
}

/** Undefined keeps the host's current widths when its shrink limit is reached. */
export function fitColumnPixels(
  natural: readonly number[],
  target: number,
  policy: ColumnFitPolicy,
): number[] | undefined {
  const total = natural.reduce((sum, width) => sum + width, 0);
  if (total <= 0) return [...natural];
  let scale = target / total;
  if (scale < policy.minimumScale) {
    if (policy.belowMinimum === "keep") return undefined;
    scale = policy.minimumScale;
  }
  if (policy.rounding === "ceil") return natural.map((width) => Math.ceil(width * scale));
  // The additive form preserves the Svelte host's existing rounding at integer boundaries.
  const widths = natural.map((width) =>
    policy.rounding === "ordered"
      ? width + Math.floor(((target - total) * width) / total)
      : Math.floor(width * scale),
  );
  let spare =
    (policy.rounding === "ordered" ? target : Math.round(total * scale)) -
    widths.reduce((sum, width) => sum + width, 0);
  const order = widths.map((width, index) => ({ width, index }));
  if (policy.rounding === "widest") order.sort((left, right) => right.width - left.width);
  for (const { index } of order) {
    if (spare <= 0) break;
    const width = widths[index];
    if (width === undefined) continue;
    widths[index] = width + 1;
    spare -= 1;
  }
  return widths;
}
