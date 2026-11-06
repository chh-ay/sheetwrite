import type { CellBorder, CellStyle, CellVerticalAlign } from "@sheetwrite/core";
import { isCellFontFamily } from "@sheetwrite/core";

import { DRAWINGML_NAMESPACES, MAIN_NAMESPACES, MAIN_NS } from "./format.js";
import {
  assertResource,
  boundedErrorText,
  emitWarning,
  type XlsxCodecContext,
} from "./resources.js";
import {
  assertXmlRoot,
  escapeXml,
  XmlBuffer,
  type XmlElement,
  xmlAttribute,
  xmlBoolean,
  xmlChild,
  xmlChildren,
} from "./xml.js";

const BUILTIN_NUMBER_FORMATS: Readonly<Record<number, string>> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "mm-dd-yy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

const INDEXED_COLORS = [
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "800000",
  "008000",
  "000080",
  "808000",
  "800080",
  "008080",
  "C0C0C0",
  "808080",
  "9999FF",
  "993366",
  "FFFFCC",
  "CCFFFF",
  "660066",
  "FF8080",
  "0066CC",
  "CCCCFF",
  "000080",
  "FF00FF",
  "FFFF00",
  "00FFFF",
  "800080",
  "800000",
  "008080",
  "0000FF",
  "00CCFF",
  "CCFFFF",
  "CCFFCC",
  "FFFF99",
  "99CCFF",
  "FF99CC",
  "CC99FF",
  "FFCC99",
  "3366FF",
  "33CCCC",
  "99CC00",
  "FFCC00",
  "FF9900",
  "FF6600",
  "666699",
  "969696",
  "003366",
  "339966",
  "003300",
  "333300",
  "993300",
  "993366",
  "333399",
  "333333",
] as const;

interface FontRecord {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly color?: string;
}

interface FillRecord {
  readonly backgroundColor?: string;
}

interface BorderRecord {
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}

export interface ParsedCellStyle {
  readonly style?: CellStyle;
  readonly numberFormat?: string;
  readonly date: boolean;
}

function argb(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const color = value.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(color)) {
    return `FF${[...color]
      .map((component) => component.repeat(2))
      .join("")
      .toUpperCase()}`;
  }
  if (/^[\da-f]{6}$/i.test(color)) return `FF${color.toUpperCase()}`;
  if (/^[\da-f]{8}$/i.test(color)) return color.toUpperCase();
  return undefined;
}

function sheetwrite_color(value: string | undefined): string | undefined {
  if (!value || !/^[\da-f]{8}$/i.test(value)) return undefined;
  return `#${value.slice(2).toUpperCase()}`;
}

function tint_color(value: string, tint: number): string {
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels as [number, number, number];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  let lightness = (maximum + minimum) / 2;
  if (maximum !== minimum) {
    const delta = maximum - minimum;
    saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
    if (maximum === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
  }
  hue = Math.round(hue * 240) / 240;
  saturation = Math.round(saturation * 240) / 240;
  lightness = Math.round(lightness * 240);
  lightness =
    Math.round(tint < 0 ? lightness * (1 + tint) : lightness * (1 - tint) + 240 * tint) / 240;
  const hue_channel = (first: number, second: number, offset: number): number => {
    let normalized = offset;
    if (normalized < 0) normalized += 1;
    if (normalized > 1) normalized -= 1;
    if (normalized < 1 / 6) return first + (second - first) * 6 * normalized;
    if (normalized < 1 / 2) return second;
    if (normalized < 2 / 3) return first + (second - first) * (2 / 3 - normalized) * 6;
    return first;
  };
  const output =
    saturation === 0
      ? [lightness, lightness, lightness]
      : (() => {
          const second =
            lightness < 0.5
              ? lightness * (1 + saturation)
              : lightness + saturation - lightness * saturation;
          const first = 2 * lightness - second;
          return [
            hue_channel(first, second, hue + 1 / 3),
            hue_channel(first, second, hue),
            hue_channel(first, second, hue - 1 / 3),
          ];
        })();
  return output
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

function parsed_theme_colors(
  root: XmlElement | undefined,
  part: string,
): ReadonlyMap<number, string> {
  const colors = new Map<number, string>();
  if (!root) return colors;
  assertXmlRoot(root, "theme", DRAWINGML_NAMESPACES, part);
  const scheme = xmlChild(xmlChild(root, "themeElements") ?? root, "clrScheme");
  if (!scheme) return colors;
  const names = [
    "lt1",
    "dk1",
    "lt2",
    "dk2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink",
  ] as const;
  for (let index = 0; index < names.length; index++) {
    const item = xmlChild(scheme, names[index]!);
    const source = item?.children[0];
    const raw =
      source &&
      (source.name.endsWith("sysClr")
        ? xmlAttribute(source, "lastClr")
        : xmlAttribute(source, "val"));
    if (raw && /^[\da-f]{6}$/i.test(raw)) colors.set(index, raw.toUpperCase());
  }
  return colors;
}

function resolved_color(
  element: XmlElement | undefined,
  theme: ReadonlyMap<number, string>,
  context: XlsxCodecContext,
  warnings: Set<string>,
  part: string,
): string | undefined {
  if (!element) return undefined;
  const rgb = sheetwrite_color(xmlAttribute(element, "rgb"));
  let six_digit = rgb?.slice(1);
  const theme_index = Number(xmlAttribute(element, "theme"));
  const indexed = Number(xmlAttribute(element, "indexed"));
  if (!six_digit && Number.isInteger(theme_index)) six_digit = theme.get(theme_index);
  if (!six_digit && Number.isInteger(indexed) && indexed >= 0 && indexed < INDEXED_COLORS.length) {
    six_digit = INDEXED_COLORS[indexed];
  }
  if (!six_digit) {
    const key = JSON.stringify(element.attributes);
    if (!warnings.has(key)) {
      warnings.add(key);
      emitWarning(context, {
        code: "format-loss",
        message: "An automatic, invalid, or unavailable theme style color was dropped",
        part,
      });
    }
    return undefined;
  }
  const raw_tint = xmlAttribute(element, "tint");
  if (raw_tint !== undefined) {
    const tint = Number(raw_tint);
    if (!Number.isFinite(tint) || tint < -1 || tint > 1) {
      emitWarning(context, {
        code: "format-loss",
        message: `Invalid style color tint ${raw_tint} was ignored`,
        part,
      });
    } else {
      six_digit = tint_color(six_digit, tint);
    }
  }
  return `#${six_digit}`;
}

function canonical_style(style: CellStyle | undefined): CellStyle | undefined {
  if (!style) return undefined;
  const border = style.border;
  const ordered_border = border
    ? {
        ...(border.all ? { all: { ...border.all } } : {}),
        ...(border.top ? { top: { ...border.top } } : {}),
        ...(border.right ? { right: { ...border.right } } : {}),
        ...(border.bottom ? { bottom: { ...border.bottom } } : {}),
        ...(border.left ? { left: { ...border.left } } : {}),
      }
    : undefined;
  const ordered: CellStyle = {
    ...(style.bold !== undefined ? { bold: style.bold } : {}),
    ...(style.italic !== undefined ? { italic: style.italic } : {}),
    ...(style.underline !== undefined ? { underline: style.underline } : {}),
    ...(style.strikethrough !== undefined ? { strikethrough: style.strikethrough } : {}),
    ...(style.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style.fontFamily !== undefined ? { fontFamily: style.fontFamily } : {}),
    ...(style.color !== undefined ? { color: style.color } : {}),
    ...(style.backgroundColor !== undefined ? { backgroundColor: style.backgroundColor } : {}),
    ...(style.align !== undefined ? { align: style.align } : {}),
    ...(style.verticalAlign !== undefined ? { verticalAlign: style.verticalAlign } : {}),
    ...(style.wrap !== undefined ? { wrap: style.wrap } : {}),
    ...(ordered_border && Object.keys(ordered_border).length > 0 ? { border: ordered_border } : {}),
  };
  return Object.keys(ordered).length > 0 ? ordered : undefined;
}

function border_style(border: CellBorder | undefined): string | undefined {
  if (!border) return undefined;
  if (border.style === "dashed") return (border.width ?? 1) >= 2 ? "mediumDashed" : "dashed";
  if (border.style === "dotted") return "dotted";
  return (border.width ?? 1) >= 2 ? "medium" : "thin";
}

function imported_border(
  element: XmlElement | undefined,
  theme: ReadonlyMap<number, string>,
  context: XlsxCodecContext,
  warnings: Set<string>,
  part: string,
): CellBorder | undefined {
  if (!element) return undefined;
  const raw_style = xmlAttribute(element, "style");
  const color = resolved_color(xmlChild(element, "color"), theme, context, warnings, part);
  if (!raw_style && !color) return undefined;
  const border: CellBorder = {};
  if (raw_style === "dashed" || raw_style?.includes("Dash")) border.style = "dashed";
  else if (raw_style === "dotted") border.style = "dotted";
  else if (raw_style) border.style = "solid";
  if (
    raw_style === "medium" ||
    raw_style === "thick" ||
    raw_style === "double" ||
    raw_style?.startsWith("medium")
  ) {
    border.width = 2;
  } else if (raw_style) {
    border.width = 1;
  }
  if (color) border.color = color;
  return border;
}

function style_key(style: CellStyle | undefined, number_format: string | undefined): string {
  return JSON.stringify([canonical_style(style) ?? null, number_format ?? null]);
}

function date_number_format(format: string | undefined): boolean {
  if (!format) return false;
  const has_elapsed_time = /\[(?:h+|m+|s+)\]/i.test(format);
  const stripped = format.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "").toLowerCase();
  return has_elapsed_time || /[ymdhis]/.test(stripped);
}

/** XLSX spells the centered vertical alignment `center`; cell styles say `middle`. */
const XLSX_VERTICAL: Readonly<Record<CellVerticalAlign, string>> = {
  top: "top",
  middle: "center",
  bottom: "bottom",
};

function has_alignment(style: CellStyle): boolean {
  return style.align !== undefined || style.verticalAlign !== undefined || style.wrap !== undefined;
}

function alignment_xml(style: CellStyle | undefined, differential = false): string {
  // Ordinary cells default to center in Sheetwrite, but bottom in OOXML.
  // A differential style instead leaves unspecified fields untouched.
  const vertical = differential
    ? style?.verticalAlign && XLSX_VERTICAL[style.verticalAlign]
    : style?.verticalAlign === "bottom"
      ? undefined
      : XLSX_VERTICAL[style?.verticalAlign ?? "middle"];
  return `<alignment${style?.align ? ` horizontal="${style.align}"` : ""}${vertical ? ` vertical="${vertical}"` : ""}${style?.wrap ? ' wrapText="1"' : ""}/>`;
}

/** Alignment fields of a cell or differential style from its `<alignment>` element. */
function imported_alignment(alignment: XmlElement | undefined, differential = false): CellStyle {
  const style: CellStyle = differential ? {} : { verticalAlign: "bottom" };
  if (!alignment) return style;
  const horizontal = xmlAttribute(alignment, "horizontal");
  if (horizontal === "left" || horizontal === "center" || horizontal === "right") {
    style.align = horizontal;
  }
  const vertical = xmlAttribute(alignment, "vertical");
  if (vertical === "top" || vertical === "bottom") style.verticalAlign = vertical;
  else if (vertical === "center") {
    if (differential) style.verticalAlign = "middle";
    else delete style.verticalAlign;
  }
  if (xmlBoolean(xmlAttribute(alignment, "wrapText"))) style.wrap = true;
  return style;
}
// Column widths use the seven-pixel maximum digit width of Calibri 11pt.
// An unnamed font lets producers choose a different metric and resize columns.
const DEFAULT_CELL_FONT: FontRecord = {
  fontFamily: "Calibri",
  fontSize: (11 * 96) / 72,
};

function font_xml(font: FontRecord, defaults?: FontRecord): string {
  let xml = "<font>";
  if (font.bold) xml += "<b/>";
  if (font.italic) xml += "<i/>";
  if (font.underline) xml += "<u/>";
  if (font.strikethrough) xml += "<strike/>";
  const font_size = font.fontSize ?? defaults?.fontSize;
  if (font_size !== undefined) xml += `<sz val="${(font_size * 72) / 96}"/>`;
  const color = argb(font.color);
  if (color) xml += `<color rgb="${color}"/>`;
  // Validated cell families need no escaping; XML-escape anyway as the boundary rule.
  const font_family = font.fontFamily ?? defaults?.fontFamily;
  if (font_family !== undefined) xml += `<name val="${escapeXml(font_family)}"/>`;
  return `${xml}</font>`;
}

function border_side_xml(name: string, border: CellBorder | undefined): string {
  const style = border_style(border);
  if (!style) return `<${name}/>`;
  const color = argb(border?.color);
  return `<${name} style="${style}">${color ? `<color rgb="${color}"/>` : ""}</${name}>`;
}

function style_font(style: CellStyle | undefined): FontRecord {
  return {
    ...(style?.bold ? { bold: true } : {}),
    ...(style?.italic ? { italic: true } : {}),
    ...(style?.underline ? { underline: true } : {}),
    ...(style?.strikethrough ? { strikethrough: true } : {}),
    ...(style?.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style?.fontFamily !== undefined ? { fontFamily: style.fontFamily } : {}),
    ...(argb(style?.color) ? { color: style!.color } : {}),
  };
}

function style_border(style: CellStyle | undefined): BorderRecord {
  const result: BorderRecord = {};
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const value = style?.border?.[side] ?? style?.border?.all;
    if (value && (border_style(value) || argb(value.color))) result[side] = value;
  }
  return result;
}

function differential_xml(style: CellStyle): string {
  const font = style_font(style);
  const border = style_border(style);
  let xml = "<dxf>";
  if (Object.keys(font).length > 0) xml += font_xml(font);
  const fill_color = argb(style.backgroundColor);
  if (fill_color) {
    xml += `<fill><patternFill><bgColor rgb="${fill_color}"/></patternFill></fill>`;
  }
  if (Object.keys(border).length > 0) {
    xml += `<border>${border_side_xml("left", border.left)}${border_side_xml("right", border.right)}${border_side_xml("top", border.top)}${border_side_xml("bottom", border.bottom)}</border>`;
  }
  if (has_alignment(style)) xml += alignment_xml(style, true);
  return `${xml}</dxf>`;
}

/** Deterministic style table shared by table and workbook writers. */
export class StylesRegistry {
  readonly #context: XlsxCodecContext;
  readonly #styles: { style?: CellStyle; numberFormat?: string }[] = [{}];
  readonly #style_ids = new Map<string, number>([[style_key(undefined, undefined), 0]]);
  readonly #differentials: CellStyle[] = [];
  readonly #differential_ids = new Map<string, number>();
  readonly #custom_formats: string[] = [];
  readonly #custom_format_ids = new Map<string, number>();

  constructor(context: XlsxCodecContext) {
    this.#context = context;
  }

  /**
   * The `numFmtId` of `format`: a built-in id, or a custom id from 164 that
   * `styles.xml` lists. Cell styles and pivot value fields share the ids.
   */
  numberFormatId(format: string): number {
    const builtin = Object.entries(BUILTIN_NUMBER_FORMATS).find(([, value]) => value === format);
    if (builtin) return Number(builtin[0]);
    let custom = this.#custom_format_ids.get(format);
    if (custom === undefined) {
      custom = 164 + this.#custom_formats.length;
      this.#custom_formats.push(format);
      this.#custom_format_ids.set(format, custom);
    }
    return custom;
  }

  register(style: CellStyle | undefined, numberFormat: string | undefined): number {
    const cleaned_style = canonical_style(style);
    const cleaned_format = numberFormat && numberFormat !== "General" ? numberFormat : undefined;
    const key = style_key(cleaned_style, cleaned_format);
    const existing = this.#style_ids.get(key);
    if (existing !== undefined) return existing;
    for (const [side, border] of Object.entries(cleaned_style?.border ?? {})) {
      if (border?.width !== undefined && border.width !== 1 && border.width !== 2) {
        emitWarning(this.#context, {
          code: "format-loss",
          message: `Border ${side} width ${border.width} is preserved in metadata; native XLSX uses the closest standard width`,
          part: "xl/styles.xml",
        });
      }
    }
    const id = this.#styles.length;
    assertResource(this.#context, "maxStyles", id + 1);
    this.#styles.push({ style: cleaned_style, numberFormat: cleaned_format });
    this.#style_ids.set(key, id);
    return id;
  }

  registerDifferential(style: CellStyle): number {
    const cleaned = canonical_style(style) ?? {};
    const key = JSON.stringify(cleaned);
    const existing = this.#differential_ids.get(key);
    if (existing !== undefined) return existing;
    for (const [side, border] of Object.entries(cleaned.border ?? {})) {
      if (border?.width !== undefined && border.width !== 1 && border.width !== 2) {
        emitWarning(this.#context, {
          code: "format-loss",
          message: `Conditional-format border ${side} width ${border.width} is preserved in metadata; native XLSX uses the closest standard width`,
          part: "xl/styles.xml",
        });
      }
    }
    const id = this.#differentials.length;
    assertResource(this.#context, "maxStyles", this.#styles.length + id + 1);
    this.#differentials.push(cleaned);
    this.#differential_ids.set(key, id);
    return id;
  }

  toXml(): Uint8Array {
    const fonts: FontRecord[] = [{}];
    const fills: FillRecord[] = [{}, {}];
    const borders: BorderRecord[] = [{}];
    const font_ids = new Map<string, number>([["{}", 0]]);
    const fill_ids = new Map<string, number>([["{}", 0]]);
    const border_ids = new Map<string, number>([["{}", 0]]);
    const xfs: {
      fontId: number;
      fillId: number;
      borderId: number;
      numFmtId: number;
      alignment?: CellStyle;
    }[] = [];

    for (const record of this.#styles) {
      const style = record.style;
      const font = style_font(style);
      const fill: FillRecord = argb(style?.backgroundColor)
        ? { backgroundColor: style!.backgroundColor }
        : {};
      const border = style_border(style);
      const font_key = JSON.stringify(font);
      const fill_key = JSON.stringify(fill);
      const border_key = JSON.stringify(border);
      let font_id = font_ids.get(font_key);
      if (font_id === undefined) {
        font_id = fonts.length;
        fonts.push(font);
        font_ids.set(font_key, font_id);
      }
      let fill_id = fill_ids.get(fill_key);
      if (fill_id === undefined) {
        fill_id = fills.length;
        fills.push(fill);
        fill_ids.set(fill_key, fill_id);
      }
      let border_id = border_ids.get(border_key);
      if (border_id === undefined) {
        border_id = borders.length;
        borders.push(border);
        border_ids.set(border_key, border_id);
      }
      const num_fmt_id = record.numberFormat ? this.numberFormatId(record.numberFormat) : 0;
      xfs.push({
        fontId: font_id,
        fillId: fill_id,
        borderId: border_id,
        numFmtId: num_fmt_id,
        alignment: style,
      });
    }

    const xml = new XmlBuffer(this.#context);
    xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    xml.append(`<styleSheet xmlns="${MAIN_NS}">`);
    const custom_formats = this.#custom_formats;
    if (custom_formats.length > 0) {
      xml.append(`<numFmts count="${custom_formats.length}">`);
      for (let index = 0; index < custom_formats.length; index++) {
        xml.append(
          `<numFmt numFmtId="${164 + index}" formatCode="${escapeXml(custom_formats[index]!)}"/>`,
        );
      }
      xml.append("</numFmts>");
    }
    xml.append(`<fonts count="${fonts.length}">`);
    for (const font of fonts) xml.append(font_xml(font, DEFAULT_CELL_FONT));
    xml.append("</fonts>");
    xml.append(
      `<fills count="${fills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>`,
    );
    for (let index = 2; index < fills.length; index++) {
      const color = argb(fills[index]!.backgroundColor)!;
      xml.append(
        `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`,
      );
    }
    xml.append("</fills>");
    xml.append(`<borders count="${borders.length}">`);
    for (const border of borders) {
      xml.append(
        `<border>${border_side_xml("left", border.left)}${border_side_xml("right", border.right)}${border_side_xml("top", border.top)}${border_side_xml("bottom", border.bottom)}<diagonal/></border>`,
      );
    }
    xml.append("</borders>");
    xml.append(
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf></cellStyleXfs>',
    );
    xml.append(`<cellXfs count="${xfs.length}">`);
    for (const xf of xfs) {
      const alignment = xf.alignment;
      // Include xf0: otherwise unstyled Sheetwrite cells render bottom-aligned.
      xml.append(
        `<xf numFmtId="${xf.numFmtId}" fontId="${xf.fontId}" fillId="${xf.fillId}" borderId="${xf.borderId}" xfId="0"${xf.numFmtId ? ' applyNumberFormat="1"' : ""}${xf.fontId ? ' applyFont="1"' : ""}${xf.fillId > 1 ? ' applyFill="1"' : ""}${xf.borderId ? ' applyBorder="1"' : ""} applyAlignment="1">`,
      );
      xml.append(alignment_xml(alignment));
      xml.append("</xf>");
    }
    xml.append("</cellXfs>");
    xml.append(
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    );
    if (this.#differentials.length > 0) {
      xml.append(`<dxfs count="${this.#differentials.length}">`);
      for (const style of this.#differentials) xml.append(differential_xml(style));
      xml.append("</dxfs>");
    }
    xml.append("</styleSheet>");
    return xml.finish();
  }
}

function integer_attribute(element: XmlElement, name: string, fallback = 0): number {
  const raw = xmlAttribute(element, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(
      boundedErrorText(`Sheetwrite: invalid XLSX style ${name}=${JSON.stringify(raw)}`),
    );
  }
  return value;
}

function font_property_enabled(element: XmlElement | undefined): boolean {
  if (!element) return false;
  const value = xmlAttribute(element, "val");
  return value === undefined || xmlBoolean(value);
}

function parsed_differential_style(
  dxf: XmlElement,
  theme: ReadonlyMap<number, string>,
  context: XlsxCodecContext,
  warnings: Set<string>,
  part: string,
): CellStyle {
  const style: CellStyle = {};
  const font = xmlChild(dxf, "font");
  if (font_property_enabled(font ? xmlChild(font, "b") : undefined)) style.bold = true;
  if (font_property_enabled(font ? xmlChild(font, "i") : undefined)) style.italic = true;
  const underline = font ? xmlChild(font, "u") : undefined;
  const underline_value = underline ? xmlAttribute(underline, "val") : undefined;
  if (
    underline &&
    underline_value !== "none" &&
    underline_value !== "0" &&
    underline_value?.toLowerCase() !== "false"
  ) {
    style.underline = true;
  }
  if (font_property_enabled(font ? xmlChild(font, "strike") : undefined)) {
    style.strikethrough = true;
  }
  const font_size = Number(font ? xmlAttribute(xmlChild(font, "sz") ?? font, "val") : undefined);
  if (Number.isFinite(font_size) && font_size > 0) style.fontSize = (font_size * 96) / 72;
  const font_color = resolved_color(
    font ? xmlChild(font, "color") : undefined,
    theme,
    context,
    warnings,
    part,
  );
  if (font_color) style.color = font_color;
  const fill = xmlChild(dxf, "fill");
  const pattern = fill ? xmlChild(fill, "patternFill") : undefined;
  const pattern_type = pattern ? xmlAttribute(pattern, "patternType") : undefined;
  const differential_fill = pattern
    ? resolved_color(
        xmlChild(pattern, pattern_type === "solid" ? "fgColor" : "bgColor"),
        theme,
        context,
        warnings,
        part,
      )
    : undefined;
  if (differential_fill) {
    style.backgroundColor = differential_fill;
  } else if (pattern_type && pattern_type !== "none" && pattern_type !== "gray125") {
    emitWarning(context, {
      code: "format-loss",
      message: `Non-solid conditional-format fill pattern ${pattern_type} cannot be represented and was dropped`,
      part,
    });
  }
  const border = xmlChild(dxf, "border");
  if (border) {
    const parsed = {
      top: imported_border(xmlChild(border, "top"), theme, context, warnings, part),
      right: imported_border(xmlChild(border, "right"), theme, context, warnings, part),
      bottom: imported_border(xmlChild(border, "bottom"), theme, context, warnings, part),
      left: imported_border(xmlChild(border, "left"), theme, context, warnings, part),
    };
    if (parsed.top || parsed.right || parsed.bottom || parsed.left) {
      style.border = {};
      if (parsed.top) style.border.top = parsed.top;
      if (parsed.right) style.border.right = parsed.right;
      if (parsed.bottom) style.border.bottom = parsed.bottom;
      if (parsed.left) style.border.left = parsed.left;
    }
  }
  const alignment = xmlChild(dxf, "alignment");
  Object.assign(style, imported_alignment(alignment, true));
  return style;
}

export class ParsedStyles {
  readonly #styles: ParsedCellStyle[];
  readonly #differentials: CellStyle[];
  readonly #formats = new Map<number, string>();

  /** The format code of `numFmtId`, or undefined for an unknown id or General. */
  numberFormat(numFmtId: number): string | undefined {
    const format = this.#formats.get(numFmtId);
    return format === "General" ? undefined : format;
  }

  constructor(
    root: XmlElement | undefined,
    context: XlsxCodecContext,
    themeRoot?: XmlElement,
    part = "xl/styles.xml",
    themePart = "xl/theme/theme1.xml",
  ) {
    if (!root) {
      this.#styles = [{ date: false, style: { verticalAlign: "bottom" } }];
      this.#differentials = [];
      return;
    }
    assertXmlRoot(root, "styleSheet", MAIN_NAMESPACES, part);
    const theme = parsed_theme_colors(themeRoot, themePart);
    const formats = this.#formats;
    for (const [id, value] of Object.entries(BUILTIN_NUMBER_FORMATS)) {
      formats.set(Number(id), value);
    }
    const number_formats = xmlChildren(
      xmlChild(root, "numFmts") ?? { attributes: {}, children: [], name: "", text: "" },
      "numFmt",
    );
    assertResource(context, "maxStyles", number_formats.length);
    for (const format of number_formats) {
      const id = integer_attribute(format, "numFmtId", -1);
      const code = xmlAttribute(format, "formatCode");
      if (id < 0 || code === undefined) {
        throw new TypeError("Sheetwrite: invalid XLSX custom number format");
      }
      formats.set(id, code);
    }
    const fonts = xmlChildren(
      xmlChild(root, "fonts") ?? { attributes: {}, children: [], name: "", text: "" },
      "font",
    );
    // Every XLSX font names a family and size, usually the workbook default.
    // Only a different family or size becomes a cell style, so ordinary text
    // keeps the grid's theme font.
    const default_name_element = fonts[0] ? xmlChild(fonts[0], "name") : undefined;
    const default_font_name = default_name_element
      ? xmlAttribute(default_name_element, "val")
      : undefined;
    const default_size_element = fonts[0] ? xmlChild(fonts[0], "sz") : undefined;
    const default_font_size = default_size_element
      ? Number(xmlAttribute(default_size_element, "val"))
      : undefined;
    const fills = xmlChildren(
      xmlChild(root, "fills") ?? { attributes: {}, children: [], name: "", text: "" },
      "fill",
    );
    const borders = xmlChildren(
      xmlChild(root, "borders") ?? { attributes: {}, children: [], name: "", text: "" },
      "border",
    );
    const xfs = xmlChildren(
      xmlChild(root, "cellXfs") ?? { attributes: {}, children: [], name: "", text: "" },
      "xf",
    );
    const differentials = xmlChildren(
      xmlChild(root, "dxfs") ?? { attributes: {}, children: [], name: "", text: "" },
      "dxf",
    );
    assertResource(context, "maxStyles", xfs.length + differentials.length);
    assertResource(
      context,
      "maxStyles",
      Math.max(fonts.length, fills.length, borders.length, xfs.length),
    );
    const color_warnings = new Set<string>();
    for (const [index, expected] of ["none", "gray125"].entries()) {
      const pattern = fills[index] ? xmlChild(fills[index]!, "patternFill") : undefined;
      const actual = pattern ? (xmlAttribute(pattern, "patternType") ?? "none") : undefined;
      if (actual !== undefined && actual !== expected) {
        emitWarning(context, {
          code: "format-loss",
          message: `Reserved Excel fill ${index} had pattern ${actual}; it was treated as ${expected}`,
          part,
        });
      }
    }
    this.#styles = xfs.map((xf, style_index) => {
      const font_id = integer_attribute(xf, "fontId");
      const fill_id = integer_attribute(xf, "fillId");
      const border_id = integer_attribute(xf, "borderId");
      const num_fmt_id = integer_attribute(xf, "numFmtId");
      if (font_id >= fonts.length || fill_id >= fills.length || border_id >= borders.length) {
        throw new TypeError(
          `Sheetwrite: invalid XLSX style ${style_index} references font ${font_id}, fill ${fill_id}, or border ${border_id}`,
        );
      }
      const style: CellStyle = {};
      const font = fonts[font_id]!;
      if (font_property_enabled(xmlChild(font, "b"))) style.bold = true;
      if (font_property_enabled(xmlChild(font, "i"))) style.italic = true;
      const underline = xmlChild(font, "u");
      const underline_value = underline ? xmlAttribute(underline, "val") : undefined;
      if (
        underline &&
        underline_value !== "none" &&
        underline_value !== "0" &&
        underline_value?.toLowerCase() !== "false"
      ) {
        style.underline = true;
      }
      if (
        underline_value &&
        ["double", "singleAccounting", "doubleAccounting"].includes(underline_value) &&
        !color_warnings.has(`underline:${font_id}`)
      ) {
        color_warnings.add(`underline:${font_id}`);
        emitWarning(context, {
          code: "format-loss",
          message: `Excel ${underline_value} underline was reduced to boolean underline`,
          part,
        });
      }
      if (font_property_enabled(xmlChild(font, "strike"))) style.strikethrough = true;
      const size = Number(
        xmlAttribute(
          xmlChild(font, "sz") ?? { attributes: {}, children: [], name: "", text: "" },
          "val",
        ),
      );
      if (Number.isFinite(size) && size > 0 && size !== default_font_size) {
        style.fontSize = (size * 96) / 72;
      }
      const font_color = resolved_color(
        xmlChild(font, "color"),
        theme,
        context,
        color_warnings,
        part,
      );
      if (font_color) style.color = font_color;
      const name_element = xmlChild(font, "name");
      const font_name = name_element ? xmlAttribute(name_element, "val") : undefined;
      if (font_name !== undefined && font_name !== default_font_name) {
        if (isCellFontFamily(font_name)) {
          style.fontFamily = font_name;
        } else if (!color_warnings.has(`font-name:${font_id}`)) {
          color_warnings.add(`font-name:${font_id}`);
          emitWarning(context, {
            code: "format-loss",
            message: `Font "${font_name.slice(0, 64)}" cannot be represented and was dropped`,
            part,
          });
        }
      }

      if (fill_id > 1) {
        const fill = fills[fill_id]!;
        const pattern = xmlChild(fill, "patternFill");
        const pattern_type = pattern ? (xmlAttribute(pattern, "patternType") ?? "none") : undefined;
        if (pattern_type === "solid") {
          const color = resolved_color(
            xmlChild(pattern!, "fgColor"),
            theme,
            context,
            color_warnings,
            part,
          );
          if (color) style.backgroundColor = color;
        } else if (
          pattern_type !== undefined &&
          pattern_type !== "none" &&
          pattern_type !== "gray125"
        ) {
          emitWarning(context, {
            code: "format-loss",
            message: `Non-solid fill pattern ${pattern_type} cannot be represented and was dropped`,
            part,
          });
        } else if (xmlChild(fill, "gradientFill")) {
          emitWarning(context, {
            code: "format-loss",
            message: "Gradient fill cannot be represented and was dropped",
            part,
          });
        }
      }

      const border = borders[border_id]!;
      if (
        (xmlBoolean(xmlAttribute(border, "diagonalUp")) ||
          xmlBoolean(xmlAttribute(border, "diagonalDown")) ||
          xmlAttribute(xmlChild(border, "diagonal") ?? border, "style")) &&
        !color_warnings.has(`diagonal:${border_id}`)
      ) {
        color_warnings.add(`diagonal:${border_id}`);
        emitWarning(context, {
          code: "format-loss",
          message: "Diagonal border presentation cannot be represented and was dropped",
          part,
        });
      }
      const parsed = {
        top: imported_border(xmlChild(border, "top"), theme, context, color_warnings, part),
        right: imported_border(xmlChild(border, "right"), theme, context, color_warnings, part),
        bottom: imported_border(xmlChild(border, "bottom"), theme, context, color_warnings, part),
        left: imported_border(xmlChild(border, "left"), theme, context, color_warnings, part),
      };
      if (parsed.top || parsed.right || parsed.bottom || parsed.left) {
        style.border = {};
        if (parsed.top) style.border.top = parsed.top;
        if (parsed.right) style.border.right = parsed.right;
        if (parsed.bottom) style.border.bottom = parsed.bottom;
        if (parsed.left) style.border.left = parsed.left;
      }
      Object.assign(style, imported_alignment(xmlChild(xf, "alignment")));
      const number_format = formats.get(num_fmt_id);
      return {
        ...(Object.keys(style).length > 0 ? { style } : {}),
        ...(number_format && number_format !== "General" ? { numberFormat: number_format } : {}),
        date: date_number_format(number_format),
      };
    });
    this.#differentials = differentials.map((dxf) =>
      parsed_differential_style(dxf, theme, context, color_warnings, part),
    );
    if (this.#styles.length === 0) {
      this.#styles.push({ date: false, style: { verticalAlign: "bottom" } });
    }
  }

  at(index: number): ParsedCellStyle {
    const style = this.#styles[index];
    if (!style) throw new TypeError(`Sheetwrite: XLSX cell style index ${index} is out of range`);
    return style;
  }

  /** The differential style at `index`, or undefined when the file has none there. */
  differentialAt(index: number): CellStyle | undefined {
    return this.#differentials[index];
  }
}
