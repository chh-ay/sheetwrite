/** Highest code unit that UTF-8 encodes as a single byte. */
const ONE_BYTE_MAX = 0x7f;
/** Highest code unit that UTF-8 encodes as two bytes. */
const TWO_BYTE_MAX = 0x7ff;
/** First and last UTF-16 high (leading) surrogate. */
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;
/** First and last UTF-16 low (trailing) surrogate. */
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;
/** UTF-8 bytes of a code point from U+0080 to U+07FF. */
const TWO_BYTE_CODE_POINT = 2;
/** UTF-8 bytes of any other Basic Multilingual Plane code point, and of U+FFFD. */
const THREE_BYTE_CODE_POINT = 3;
/** UTF-8 bytes of a code point outside the Basic Multilingual Plane, written as a surrogate pair. */
const SURROGATE_PAIR_BYTES = 4;
/** UTF-16 code units of a surrogate pair. */
const SURROGATE_PAIR_UNITS = 2;

/**
 * UTF-8 bytes of the code point that starts at `index`. A surrogate pair is
 * four bytes and spans two code units; every other unit spans one. A lone
 * surrogate counts three bytes, the size of the U+FFFD that `TextEncoder`
 * writes in its place.
 */
export function utf8CodePointBytes(text: string, index: number): number {
  const code = text.charCodeAt(index);
  if (code <= ONE_BYTE_MAX) return 1;
  if (code <= TWO_BYTE_MAX) return TWO_BYTE_CODE_POINT;
  if (code >= HIGH_SURROGATE_MIN && code <= HIGH_SURROGATE_MAX) {
    const next = text.charCodeAt(index + 1);
    if (next >= LOW_SURROGATE_MIN && next <= LOW_SURROGATE_MAX) return SURROGATE_PAIR_BYTES;
  }
  return THREE_BYTE_CODE_POINT;
}

/** UTF-16 code units of the code point whose UTF-8 size is `bytes`. */
export function utf8CodePointUnits(bytes: number): number {
  return bytes === SURROGATE_PAIR_BYTES ? SURROGATE_PAIR_UNITS : 1;
}

/**
 * UTF-8 byte length of `text`, matching `TextEncoder`. Counting stops at the
 * first code point that takes the total past `stopAfter`, and that total is
 * returned, so a caller can bound the work on hostile input.
 */
export function utf8ByteLength(text: string, stopAfter = Number.POSITIVE_INFINITY): number {
  let bytes = 0;
  let index = 0;
  while (index < text.length) {
    const width = utf8CodePointBytes(text, index);
    bytes += width;
    if (bytes > stopAfter) return bytes;

    index += utf8CodePointUnits(width);
  }
  return bytes;
}
