---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Both engines export `formulaTokens(text)` and `checkFormulaSyntax(text)`. `formulaTokens` returns the tokens of formula text from the engine's own lexer as a `Uint32Array`, four numbers per token: the kind, the start and end as UTF-16 offsets, and 1 when whitespace comes before the token. It does not stop at an error: an open quote or bracket becomes one bad token to the end of the text. `checkFormulaSyntax` returns the first error of the engine's parser with its span, its message and an `incomplete` flag for a formula that ends too early, or `undefined`. Formula help in `@sheetwrite/core` uses them, so it marks exactly the formulas that the engine rejects. The parser's error messages are now sentences that a user can act on, such as "Add ) to close the (.".
