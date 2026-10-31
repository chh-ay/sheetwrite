//! Formula help reads formula text while the user types it: the tokens with
//! their spans, for syntax colours, the argument guide and completion, and the
//! first syntax error. The tokens come from the parser's own lexer step
//! (`calc::lex_token`) and the error from the parser itself, so formula help
//! cannot accept or reject a formula that the engine reads differently.
//!
//! Offsets cross the boundary as UTF-16 code units, the offsets of a
//! JavaScript string and of the caret in a text field.

use crate::calc::{first_parse_error, lex_token, Tok};
use wasm_bindgen::prelude::wasm_bindgen;

/// The `u32` fields of one token in the `formulaTokens` array: kind, start
/// offset, end offset, and 1 when whitespace comes before the token.
const TOKEN_FIELDS: usize = 4;

/// What a token is. The numbers are the `kind` field of `formulaTokens`; the
/// TypeScript reader in `packages/core/src/formula-analysis.ts` lists them in
/// the same order.
#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum TokenKind {
    Number,
    String,
    /// `TRUE` or `FALSE` as a value; `TRUE()` is a call.
    Bool,
    ErrorLiteral,
    /// A name: a function, a cell, column or row reference, a defined name,
    /// a table or a sheet.
    Ident,
    QuotedSheet,
    StructuredRef,
    /// An arithmetic, text or comparison operator.
    Operator,
    Colon,
    Bang,
    /// The `#` of a spill reference.
    Hash,
    Comma,
    Semicolon,
    LParen,
    RParen,
    LBrace,
    RBrace,
    /// Text the lexer cannot read. An open quote or bracket runs to the end.
    Bad,
}

/// One token of [`lex_tolerant`] and its byte span in the source.
pub(crate) struct Spanned<'a> {
    /// The token, or the lexer's message for text it cannot read.
    pub tok: Result<Tok<'a>, String>,
    pub start: usize,
    pub end: usize,
}

/// Where the formula starts in editor text: after leading whitespace and one
/// `=`, as `calc::parse` reads it.
fn formula_start(src: &str) -> usize {
    let trimmed = src.trim_start();
    let start = src.len() - trimmed.len();

    if trimmed.starts_with('=') {
        start + 1
    } else {
        start
    }
}

/// The tokens of `src` with their spans. Unlike the parser's `tokenize`, it
/// never stops: text that the lexer cannot read becomes one bad token and
/// lexing goes on after it, because the text is often incomplete while the
/// user types. Intersection operators are tokens here, as for the parser.
pub(crate) fn lex_tolerant(src: &str) -> Vec<Spanned<'_>> {
    let mut tokens: Vec<Spanned<'_>> = Vec::new();
    let mut index = formula_start(src);

    while index < src.len() {
        let start = index;
        let previous = tokens.last().and_then(|token| token.tok.as_ref().ok());
        let tok = match lex_token(src, &mut index, previous) {
            Ok(None) => continue,
            Ok(Some(tok)) => Ok(tok),
            Err(message) => {
                // An unknown character is not consumed: skip that one character.
                if index == start {
                    index += src[start..].chars().next().map_or(1, char::len_utf8);
                }
                Err(message)
            }
        };
        tokens.push(Spanned {
            tok,
            start,
            end: index,
        });
    }

    tokens
}

fn token_kind(tok: &Result<Tok<'_>, String>, next: Option<&Spanned<'_>>) -> TokenKind {
    let Ok(tok) = tok else {
        return TokenKind::Bad;
    };

    match tok {
        Tok::Num(_) => TokenKind::Number,
        Tok::Str(_) => TokenKind::String,
        Tok::Ident(_, true) => TokenKind::QuotedSheet,
        Tok::Ident(name, false) => {
            let is_logical =
                name.eq_ignore_ascii_case("TRUE") || name.eq_ignore_ascii_case("FALSE");
            let is_value = !matches!(
                next.map(|token| &token.tok),
                Some(Ok(Tok::LParen | Tok::Bang))
            );
            if is_logical && is_value {
                TokenKind::Bool
            } else {
                TokenKind::Ident
            }
        }
        Tok::Structured(_) => TokenKind::StructuredRef,
        Tok::Op(_) | Tok::Cmp(_) => TokenKind::Operator,
        Tok::Error(_) => TokenKind::ErrorLiteral,
        Tok::Colon => TokenKind::Colon,
        Tok::Bang => TokenKind::Bang,
        Tok::Hash => TokenKind::Hash,
        Tok::Comma => TokenKind::Comma,
        Tok::Semicolon => TokenKind::Semicolon,
        Tok::LParen => TokenKind::LParen,
        Tok::RParen => TokenKind::RParen,
        Tok::LBrace => TokenKind::LBrace,
        Tok::RBrace => TokenKind::RBrace,
        // The lexer emits neither as a token with text of its own.
        Tok::Intersect | Tok::End => TokenKind::Bad,
    }
}

/// Converts increasing byte offsets of one string to UTF-16 offsets in one
/// pass over the string.
struct Utf16Offsets<'a> {
    src: &'a str,
    byte: usize,
    unit: usize,
}

impl<'a> Utf16Offsets<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            src,
            byte: 0,
            unit: 0,
        }
    }

    /// The UTF-16 offset of `byte`, which must not be before the last one asked.
    fn at(&mut self, byte: usize) -> u32 {
        self.unit += self.src[self.byte..byte].encode_utf16().count();
        self.byte = byte;
        u32::try_from(self.unit).unwrap_or(u32::MAX)
    }
}

/// The tokens of formula text: four `u32` per token, `kind` (the order of
/// [`TokenKind`]), `from` and `to` (UTF-16 offsets into `src`) and `space`
/// (1 when whitespace comes before the token). A leading `=` is not a token.
/// The lexer never stops at an error; text it cannot read is a bad token.
#[wasm_bindgen(js_name = formulaTokens)]
pub fn formula_tokens(src: &str) -> Vec<u32> {
    let tokens = lex_tolerant(src);
    let mut offsets = Utf16Offsets::new(src);
    let mut packed = Vec::with_capacity(tokens.len() * TOKEN_FIELDS);
    let mut previous_end = formula_start(src);

    for (index, token) in tokens.iter().enumerate() {
        // An intersection is whitespace; the next token's `space` field shows it.
        if matches!(token.tok, Ok(Tok::Intersect)) {
            continue;
        }

        let kind = token_kind(&token.tok, tokens.get(index + 1));
        let space = u32::from(token.start > previous_end);
        packed.extend([
            kind as u32,
            offsets.at(token.start),
            offsets.at(token.end),
            space,
        ]);
        previous_end = token.end;
    }

    packed
}

/// The first syntax error of a formula, as the engine's parser finds it.
#[wasm_bindgen]
pub struct FormulaSyntaxError {
    from: u32,
    to: u32,
    incomplete: bool,
    message: String,
}

#[wasm_bindgen]
impl FormulaSyntaxError {
    /// The UTF-16 offset where the marked text starts.
    #[wasm_bindgen(getter)]
    pub fn from(&self) -> u32 {
        self.from
    }

    /// The UTF-16 offset where the marked text ends.
    #[wasm_bindgen(getter)]
    pub fn to(&self) -> u32 {
        self.to
    }

    /// The text ends before the formula is complete: a value, a `)` or a
    /// closing quote is missing at the end. Typing on usually completes it.
    #[wasm_bindgen(getter)]
    pub fn incomplete(&self) -> bool {
        self.incomplete
    }

    #[wasm_bindgen(getter)]
    pub fn message(&self) -> String {
        self.message.clone()
    }
}

/// The first error and its byte span: a lexer error, or else a parser error.
fn first_error(src: &str) -> Option<(usize, usize, bool, String)> {
    let tokens = lex_tolerant(src);
    let mut toks = Vec::with_capacity(tokens.len() + 1);
    let mut spans = Vec::with_capacity(tokens.len());

    for token in tokens {
        match token.tok {
            Ok(tok) => toks.push(tok),
            Err(message) => {
                let opens_run = matches!(src.as_bytes()[token.start], b'"' | b'\'' | b'[');
                let incomplete = opens_run && token.end == src.len();
                return Some((token.start, token.end, incomplete, message));
            }
        }
        spans.push((token.start, token.end));
    }

    toks.push(Tok::End);
    let (message, index) = first_parse_error(toks)?;
    Some(match spans.get(index) {
        Some(&(start, end)) => (start, end, false, message),
        // The parser stopped at the end marker: the text ends too early.
        None => (src.len(), src.len(), true, message),
    })
}

/// The first syntax error in formula text, or `undefined` when the engine's
/// parser reads the whole formula. A leading `=` is optional, as for a cell.
#[wasm_bindgen(js_name = formulaSyntaxError)]
pub fn formula_syntax_error(src: &str) -> Option<FormulaSyntaxError> {
    let (start, end, incomplete, message) = first_error(src)?;
    let mut offsets = Utf16Offsets::new(src);

    Some(FormulaSyntaxError {
        from: offsets.at(start),
        to: offsets.at(end),
        incomplete,
        message,
    })
}
