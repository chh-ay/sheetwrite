// Excel's color picker: ten Office theme colors, each in five tints and
// shades below it, then ten standard colors. All values are 6-digit hex,
// because the XLSX writer reads 8-digit hex as ARGB.

const THEME_BASE = [
  "#ffffff",
  "#000000",
  "#e7e6e6",
  "#44546a",
  "#4472c4",
  "#ed7d31",
  "#a5a5a5",
  "#ffc000",
  "#5b9bd5",
  "#70ad47",
] as const;

/** Excel's rows under the theme colors: lighter by 80/60/40%, darker by 25/50%. */
const THEME_VARIANTS = [0.8, 0.6, 0.4, -0.25, -0.5] as const;

/** Excel's "Standard Colors" row. */
export const STANDARD_COLORS: readonly string[] = [
  "#c00000",
  "#ff0000",
  "#ffc000",
  "#ffff00",
  "#92d050",
  "#00b050",
  "#00b0f0",
  "#0070c0",
  "#002060",
  "#7030a0",
];

const CHANNEL_MAX = 255;
const HEX_RADIX = 16;

/**
 * Lighten (positive) or darken (negative) a `#rrggbb` color by a fraction,
 * moving each channel toward white or black as Excel's tints and shades do.
 */
function tintColor(hex: string, amount: number): string {
  let result = "#";
  for (let offset = 1; offset < hex.length; offset += 2) {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), HEX_RADIX);
    const value = amount > 0 ? channel + (CHANNEL_MAX - channel) * amount : channel * (1 + amount);
    result += Math.round(value).toString(HEX_RADIX).padStart(2, "0");
  }
  return result;
}

/** Theme colors as rows: the base row first, then each tint/shade row. */
export const THEME_COLOR_ROWS: readonly (readonly string[])[] = [
  THEME_BASE,
  ...THEME_VARIANTS.map((amount) => THEME_BASE.map((base) => tintColor(base, amount))),
];
