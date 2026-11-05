import type { SavedQuery } from "@sheetwrite/core";

import { emitWarning, type XlsxCodecContext } from "./resources.js";

// Stale-part checks run on every export, so they stay outside the lazily
// loaded Power Query module.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SECOND_LANE_SEED = 0x9e3779b9;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_LANE = 8;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    if (entry !== undefined) output[key] = canonical(entry);
  }

  return output;
}

/** 64-bit hex fingerprint of text, with two FNV-1a lanes. */
export function textDigest(text: string): string {
  let low = FNV_OFFSET;
  let high = SECOND_LANE_SEED;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    low = Math.imul(low ^ code, FNV_PRIME) >>> 0;
    high = (Math.imul(high ^ code, FNV_PRIME) ^ (high >>> 15)) >>> 0;
  }

  return (
    high.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_LANE, "0") +
    low.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_LANE, "0")
  );
}

/** Fingerprint of `workbook.queries`; retained query parts are valid only while it matches. */
export function queriesDigest(queries: readonly SavedQuery[] | undefined): string {
  return textDigest(JSON.stringify(canonical(queries ?? [])));
}

export function queryWarning(context: XlsxCodecContext, message: string, part?: string): void {
  emitWarning(context, { code: "query-loss", message, ...(part ? { part } : {}) });
}
