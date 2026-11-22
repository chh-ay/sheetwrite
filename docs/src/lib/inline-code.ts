/**
 * Inline code shorter than this fits a phone line, so it never needs to break
 * at a hyphen or quote; longer code keeps wrapping to avoid sideways scroll.
 */
export const SHORT_CODE_LENGTH = 32;

/** The class that keeps short inline code on one line. */
export const SHORT_CODE_CLASS = "sw-code-token";

/**
 * The places where a name in code may break over lines: between the words of
 * a camelCase or PascalCase name (`Storage|Error`, `XML|Http`), and after a
 * dot, slash, underscore, hyphen, opening parenthesis, comma or bar that a
 * name follows. Never inside a word or a number.
 */
const CODE_WORD_BREAK =
  /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[./_(,|-])(?=[A-Za-z$"'[{])/;

/** `text` cut at the places where a name in code may break; the parts join back to `text`. */
export function codeWords(text: string): string[] {
  return text.split(CODE_WORD_BREAK);
}
