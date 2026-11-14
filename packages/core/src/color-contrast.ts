/** sRGB channels from 0 to 255 and alpha from 0 to 1. */
export interface RgbaColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

/** A canvas context, or anything else whose `fillStyle` normalizes CSS colours. */
export interface ColorResolver {
  fillStyle: string | CanvasGradient | CanvasPattern;
}

const HEX_COLOR = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_COLOR =
  /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i;
/** A colour no caller is likely to pass, so a resolver that keeps it rejected the input. */
const RESOLVER_SENTINEL = "#010203";
const OPAQUE_WHITE: RgbaColor = { red: 255, green: 255, blue: 255, alpha: 1 };

function hexChannel(digits: string, index: number): number {
  const short = digits.length <= 4;
  const pair = short ? digits.charAt(index).repeat(2) : digits.slice(index * 2, index * 2 + 2);
  return Number.parseInt(pair, 16);
}

function byteChannel(text: string | undefined): number {
  return Math.min(255, Math.max(0, Number(text)));
}

/** Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()`; anything else is `undefined`. */
export function parseRgbColor(input: string): RgbaColor | undefined {
  const text = input.trim();
  const hex = HEX_COLOR.exec(text);
  if (hex) {
    const digits = hex[1] ?? "";
    const hasAlpha = digits.length === 4 || digits.length === 8;
    return {
      red: hexChannel(digits, 0),
      green: hexChannel(digits, 1),
      blue: hexChannel(digits, 2),
      alpha: hasAlpha ? hexChannel(digits, 3) / 255 : 1,
    };
  }
  const rgb = RGB_COLOR.exec(text);
  if (!rgb) return undefined;
  const alphaText = rgb[4];
  const alpha = alphaText === undefined ? 1 : Number(alphaText) / (rgb[5] === "%" ? 100 : 1);
  return {
    red: byteChannel(rgb[1]),
    green: byteChannel(rgb[2]),
    blue: byteChannel(rgb[3]),
    alpha: Math.min(1, Math.max(0, alpha)),
  };
}

/**
 * Parses any CSS colour: the forms {@link parseRgbColor} reads directly, and
 * named or other colours through `resolver`, which normalizes them to one of
 * those forms. `undefined` when neither can read it.
 */
export function resolveCssColor(input: string, resolver?: ColorResolver): RgbaColor | undefined {
  const direct = parseRgbColor(input);
  if (direct || !resolver || input.trim() === "") return direct;
  resolver.fillStyle = RESOLVER_SENTINEL;
  resolver.fillStyle = input;
  const resolved = String(resolver.fillStyle);
  if (resolved === RESOLVER_SENTINEL && input.trim().toLowerCase() !== RESOLVER_SENTINEL) {
    return undefined;
  }
  return parseRgbColor(resolved);
}

/** `color` composited over the opaque `base`. */
function over(color: RgbaColor, base: RgbaColor): RgbaColor {
  const mix = (top: number, bottom: number): number =>
    top * color.alpha + bottom * (1 - color.alpha);
  return {
    red: mix(color.red, base.red),
    green: mix(color.green, base.green),
    blue: mix(color.blue, base.blue),
    alpha: 1,
  };
}

/** WCAG relative luminance, from 0 (black) to 1 (white). */
export function relativeLuminance(color: RgbaColor): number {
  const linear = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue);
}

/** WCAG contrast ratio of two relative luminances, from 1 to 21. */
export function contrastRatio(first: number, second: number): number {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hexByte(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}

/**
 * Automatic text colour on an explicit cell fill, as Excel picks it: the
 * theme's `foreground`, or its inverse when that contrasts more with the fill.
 * Dark text sits on light fills and light text on dark fills, in either theme.
 * A translucent fill is judged as painted over `background`. A fill or
 * foreground no parser can read keeps `foreground`.
 */
export function automaticTextColor(
  fill: string,
  foreground: string,
  background: string,
  resolver?: ColorResolver,
): string {
  const fillColor = resolveCssColor(fill, resolver);
  const foregroundColor = resolveCssColor(foreground, resolver);
  if (!fillColor || !foregroundColor) return foreground;
  const base = over(resolveCssColor(background, resolver) ?? OPAQUE_WHITE, OPAQUE_WHITE);
  const fillLuminance = relativeLuminance(over(fillColor, base));
  const inverse: RgbaColor = {
    red: 255 - foregroundColor.red,
    green: 255 - foregroundColor.green,
    blue: 255 - foregroundColor.blue,
    alpha: 1,
  };
  const keep = contrastRatio(relativeLuminance(foregroundColor), fillLuminance);
  const flip = contrastRatio(relativeLuminance(inverse), fillLuminance);
  if (flip <= keep) return foreground;
  return `#${hexByte(inverse.red)}${hexByte(inverse.green)}${hexByte(inverse.blue)}`;
}
