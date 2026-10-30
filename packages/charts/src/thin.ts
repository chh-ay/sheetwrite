interface PixelBucket {
  minIndex: number;
  maxIndex: number;
}

/**
 * Indices of the points to draw when a series has more points than pixels:
 * for each horizontal pixel, the point with the smallest value and the point
 * with the largest value. Each run of `null` values keeps its first index, so
 * a line still breaks at the gap. The result is in ascending index order.
 *
 * `pixels[i]` is the horizontal position of point `i` in CSS pixels; it does
 * not have to be sorted (scatter x values are not).
 */
export function thinToPixels(
  pixels: ArrayLike<number>,
  values: ArrayLike<number | null>,
): number[] {
  const buckets = new Map<number, PixelBucket>();
  const kept: number[] = [];
  let previousWasNull = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? null;
    const pixel = pixels[index];

    if (value === null || pixel === undefined || !Number.isFinite(pixel)) {
      if (!previousWasNull) kept.push(index);
      previousWasNull = true;
      continue;
    }
    previousWasNull = false;

    const column = Math.floor(pixel);
    const bucket = buckets.get(column);
    if (!bucket) {
      buckets.set(column, { minIndex: index, maxIndex: index });
      continue;
    }

    if (value < (values[bucket.minIndex] ?? value)) bucket.minIndex = index;
    if (value > (values[bucket.maxIndex] ?? value)) bucket.maxIndex = index;
  }

  for (const bucket of buckets.values()) {
    kept.push(bucket.minIndex);
    if (bucket.maxIndex !== bucket.minIndex) kept.push(bucket.maxIndex);
  }

  return kept.sort((left, right) => left - right);
}
