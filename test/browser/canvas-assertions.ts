/**
 * Returns whether an RGBA sample contains fully opaque paint that differs from
 * its background. The most frequent opaque color is treated as the background.
 */
export function hasOpaqueForeground(rgba: ArrayLike<number>): boolean {
  const opaqueColors = new Map<string, number>();
  let opaquePixels = 0;

  for (let offset = 0; offset + 3 < rgba.length; offset += 4) {
    if (rgba[offset + 3] !== 255) continue;

    opaquePixels += 1;
    const key = `${rgba[offset]},${rgba[offset + 1]},${rgba[offset + 2]}`;
    opaqueColors.set(key, (opaqueColors.get(key) ?? 0) + 1);
  }

  if (opaqueColors.size < 2) return false;

  let dominantCount = 0;
  for (const count of opaqueColors.values()) dominantCount = Math.max(dominantCount, count);
  return dominantCount < opaquePixels;
}
