import type { EngineInstance } from "@sheetwrite/wasm";

/** The token kinds of `formulaTokens`, in the order of `TokenKind` in formula_tokens.rs. */
export const ENGINE_KINDS = [
  "num",
  "str",
  "bool",
  "error",
  "ident",
  "quoted",
  "structured",
  "op",
  "colon",
  "bang",
  "hash",
  "comma",
  "semicolon",
  "lparen",
  "rparen",
  "lbrace",
  "rbrace",
  "bad",
] as const;

/** One kind of `ENGINE_KINDS`. */
export type RawKind = (typeof ENGINE_KINDS)[number];

/** `kind`, `from`, `to` and the whitespace flag of each token in `formulaTokens`. */
export const TOKEN_FIELDS = 4;

/** Kind index of text the engine's lexer cannot read. */
const BAD_TOKEN_KIND = ENGINE_KINDS.indexOf("bad");

/** Whether the lexer of `engine` reads all of `text`, so its references can be rewritten. */
export function formulaLexes(engine: EngineInstance, text: string): boolean {
  const packed = engine.formulaTokens(text);

  for (let at = 0; at < packed.length; at += TOKEN_FIELDS) {
    if (packed[at] === BAD_TOKEN_KIND) return false;
  }

  return true;
}
