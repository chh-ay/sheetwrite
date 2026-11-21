//! Tokens of formula text.

use super::*;

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Tok<'a> {
    Num(f64),
    Str(String),
    Ident(Cow<'a, str>, bool),
    Structured(String),
    Op(char),
    LParen,
    RParen,
    Comma,
    Semicolon,
    LBrace,
    RBrace,
    Colon,
    Bang,
    Cmp(CmpOp),
    Error(FormulaError),
    /// The `#` after a cell reference: the whole spill of that anchor.
    Hash,
    /// Spaces between two references: the intersection operator.
    Intersect,
    /// The end of the text. Only the syntax check of formula help adds it
    /// (`first_parse_error`), so that an error can tell a missing token from
    /// a wrong one. The lexer never produces it.
    End,
}

/// Error constants a formula can contain. `#REF!` parses as an invalid
/// reference; the others are accepted only inside array constants.
const ERROR_LITERALS: [(&str, FormulaError); 9] = [
    ("#DIV/0!", FormulaError::DivZero),
    ("#NULL!", FormulaError::Null),
    ("#SPILL!", FormulaError::Spill),
    ("#CALC!", FormulaError::Calc),
    ("#VALUE!", FormulaError::Value),
    ("#REF!", FormulaError::Ref),
    ("#NAME?", FormulaError::Name),
    ("#NUM!", FormulaError::Num),
    ("#N/A", FormulaError::Na),
];

fn quoted_token(
    src: &str,
    index: &mut usize,
    quote: u8,
    unterminated: &str,
) -> Result<String, String> {
    let bytes = src.as_bytes();
    *index += 1;
    let mut segment = *index;
    let mut value = String::new();
    loop {
        if *index >= bytes.len() {
            return Err(unterminated.into());
        }
        if bytes[*index] != quote {
            *index += 1;
            continue;
        }

        value.push_str(&src[segment..*index]);
        if bytes.get(*index + 1) == Some(&quote) {
            value.push(quote as char);
            *index += 2;
            segment = *index;
        } else {
            *index += 1;
            return Ok(value);
        }
    }
}

/// What the last token means for spaces after it: they can be the
/// intersection operator only after a token that can end a reference.
#[derive(Clone, Copy)]
pub(crate) enum ReferenceEdge {
    /// Not a reference end: a separator, an operator or the start.
    None,
    /// A name: a reference end unless `(` follows, which makes it a call.
    Name,
    /// `)`, a table reference, a spill `#` or `#REF!`.
    Reference,
}

impl ReferenceEdge {
    /// `#REF!` is a reference operand too: a deleted operand serializes as
    /// it, and the formula must parse back to the same intersection.
    pub(crate) const fn after(previous: Option<&Tok<'_>>) -> Self {
        match previous {
            Some(Tok::Ident(..)) => Self::Name,
            Some(Tok::RParen | Tok::Structured(_) | Tok::Hash | Tok::Error(FormulaError::Ref)) => {
                Self::Reference
            }
            _ => Self::None,
        }
    }
}

/// Whether spaces between a token with `edge` and `rest` are the
/// intersection operator: they follow a token that can end a reference and
/// precede one that can start one. Spaces around other operators, after
/// separators and before `)` stay insignificant. A name followed by spaces
/// and `(` is a function call, not an intersection between a named range and
/// a parenthesized reference.
fn separates_references(edge: ReferenceEdge, rest: &str) -> bool {
    const DELETED_REFERENCE: &str = "#REF!";

    let Some(next) = rest.chars().next() else {
        return false;
    };
    let ends_reference = match edge {
        ReferenceEdge::Name => next != '(',
        ReferenceEdge::Reference => true,
        ReferenceEdge::None => false,
    };
    let starts_reference = next.is_alphabetic()
        || matches!(next, '$' | '_' | '\\' | '\'' | '(')
        || rest
            .get(..DELETED_REFERENCE.len())
            .is_some_and(|text| text.eq_ignore_ascii_case(DELETED_REFERENCE));
    ends_reference && starts_reference
}

/// Reads the number at `*index`: digits with one optional decimal point, then
/// an optional exponent (`E3`, `e-3`, `E+03`). An `E` without exponent digits
/// is left for the next token.
fn number_token(src: &str, index: &mut usize) -> Result<f64, String> {
    let bytes = src.as_bytes();
    let start = *index;
    let mut saw_decimal = false;
    while let Some(&byte) = bytes.get(*index) {
        if byte == b'.' && !saw_decimal {
            saw_decimal = true;
        } else if !byte.is_ascii_digit() {
            break;
        }
        *index += 1;
    }

    if matches!(bytes.get(*index), Some(b'e' | b'E')) {
        let signed = matches!(bytes.get(*index + 1), Some(b'+' | b'-'));
        let digits_start = *index + 1 + usize::from(signed);
        if bytes.get(digits_start).is_some_and(u8::is_ascii_digit) {
            *index = digits_start;
            while bytes.get(*index).is_some_and(u8::is_ascii_digit) {
                *index += 1;
            }
        }
    }

    let number = &src[start..*index];
    if number.len() <= EXACT_INTEGER_DIGITS && number.bytes().all(|byte| byte.is_ascii_digit()) {
        let integer = number
            .bytes()
            .fold(0u64, |value, digit| value * 10 + u64::from(digit - b'0'));
        return Ok(integer as f64);
    }
    number
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .ok_or_else(|| format!("{number} is not a valid number."))
}

/// Most digits of a whole number that reads as an exact `f64` (below 2^53),
/// the same value the decimal parser gives. Most numbers in formulas are
/// short whole numbers, and the decimal parser costs several times more.
const EXACT_INTEGER_DIGITS: usize = 15;

/// The token of one ASCII punctuation byte, or `None` for any other byte.
const fn punctuation_token(byte: u8) -> Option<Tok<'static>> {
    Some(match byte {
        b'+' | b'-' | b'*' | b'/' | b'^' | b'&' | b'%' => Tok::Op(byte as char),
        b'(' => Tok::LParen,
        b')' => Tok::RParen,
        b',' => Tok::Comma,
        b';' => Tok::Semicolon,
        b'{' => Tok::LBrace,
        b'}' => Tok::RBrace,
        b':' => Tok::Colon,
        b'!' => Tok::Bang,
        b'#' => Tok::Hash,
        _ => return None,
    })
}

/// Reads the token at `*index` and moves `*index` past it. Whitespace gives
/// `Ok(None)`, except where it is the intersection operator after `previous`.
/// The parser's cursor and every other reader of formula text lex with this
/// one step, so they cannot disagree about where a token ends. After an
/// error, `*index` is past the bad text when its end is known: an open quote
/// or bracket runs to the end of `src`; an unknown character is not consumed.
#[inline(always)]
pub(crate) fn lex_token<'a>(
    src: &'a str,
    index: &mut usize,
    previous: Option<&Tok<'a>>,
) -> Result<Option<Tok<'a>>, String> {
    lex_token_after(src, index, ReferenceEdge::after(previous))
}

/// [`lex_token`] after a token with `edge`.
#[inline(always)]
fn lex_token_after<'a>(
    src: &'a str,
    index: &mut usize,
    edge: ReferenceEdge,
) -> Result<Option<Tok<'a>>, String> {
    let bytes = src.as_bytes();
    let c = bytes[*index];

    let tok = if c.is_ascii_whitespace() {
        while bytes.get(*index).is_some_and(u8::is_ascii_whitespace) {
            *index += 1;
        }
        if !separates_references(edge, &src[*index..]) {
            return Ok(None);
        }
        Tok::Intersect
    } else if c == b'"' {
        Tok::Str(quoted_token(src, index, b'"', "Add \" to close the text.")?)
    } else if c.is_ascii_digit()
        || (c == b'.' && bytes.get(*index + 1).is_some_and(u8::is_ascii_digit))
    {
        Tok::Num(number_token(src, index)?)
    } else if c == b'\'' {
        Tok::Ident(
            Cow::Owned(quoted_token(
                src,
                index,
                b'\'',
                "Add ' to close the sheet name.",
            )?),
            true,
        )
    } else if let Some((literal, error)) = (c == b'#')
        .then(|| {
            ERROR_LITERALS.iter().find(|(literal, _)| {
                bytes[*index..]
                    .get(..literal.len())
                    .is_some_and(|text| text.eq_ignore_ascii_case(literal.as_bytes()))
            })
        })
        .flatten()
    {
        *index += literal.len();
        Tok::Error(*error)
    } else if c == b'[' {
        Tok::Structured(structured_token(src, index)?)
    } else if c == b'$'
        || c == b'_'
        || c == b'\\'
        || c.is_ascii_alphabetic()
        || (!c.is_ascii()
            && src[*index..]
                .chars()
                .next()
                .is_some_and(char::is_alphabetic))
    {
        ident_token(src, index)
    } else if c == b'<' || c == b'>' || c == b'=' {
        comparison_token(bytes, index)
    } else if let Some(tok) = punctuation_token(c) {
        *index += 1;
        tok
    } else if !c.is_ascii() {
        let ch = src[*index..].chars().next().expect("valid UTF-8 source");
        if !ch.is_whitespace() {
            return Err(format!("{ch} is not allowed in a formula."));
        }
        *index += ch.len_utf8();
        return Ok(None);
    } else {
        return Err(format!("{} is not allowed in a formula.", c as char));
    };

    Ok(Some(tok))
}

/// The name at `*index`: letters, digits, `$`, `_`, `.` and `\`. ASCII
/// bytes, which most names are, are read without decoding a character.
fn ident_token<'a>(src: &'a str, index: &mut usize) -> Tok<'a> {
    let start = *index;
    let bytes = src.as_bytes();

    while let Some(&byte) = bytes.get(*index) {
        if byte.is_ascii() {
            if !(byte.is_ascii_alphanumeric() || matches!(byte, b'$' | b'_' | b'.' | b'\\')) {
                break;
            }
            *index += 1;
            continue;
        }

        let ch = src[*index..].chars().next().expect("valid UTF-8 source");
        if !ch.is_alphanumeric() {
            break;
        }
        *index += ch.len_utf8();
    }

    Tok::Ident(Cow::Borrowed(&src[start..*index]), false)
}

/// `<`, `<=`, `<>`, `>`, `>=` or `=` at `*index`.
fn comparison_token(bytes: &[u8], index: &mut usize) -> Tok<'static> {
    let (op, len) = match (bytes[*index], bytes.get(*index + 1)) {
        (b'<', Some(b'=')) => (CmpOp::Le, 2),
        (b'>', Some(b'=')) => (CmpOp::Ge, 2),
        (b'<', Some(b'>')) => (CmpOp::Ne, 2),
        (b'=', _) => (CmpOp::Eq, 1),
        (b'<', _) => (CmpOp::Lt, 1),
        _ => (CmpOp::Gt, 1),
    };

    *index += len;
    Tok::Cmp(op)
}

/// The `[...]` at `*index`, nested brackets included.
fn structured_token(src: &str, index: &mut usize) -> Result<String, String> {
    let bytes = src.as_bytes();
    let start = *index;
    let mut depth = 0usize;

    while *index < bytes.len() {
        match bytes[*index] {
            b'[' => depth += 1,
            b']' => depth -= 1,
            _ => {}
        }
        *index += 1;
        if depth == 0 {
            break;
        }
    }

    if depth != 0 {
        return Err("Add ] to close the table reference.".into());
    }
    Ok(src[start..*index].to_string())
}

/// The section and column name of a table reference.
type StructuredParts<'a> = (TableSection, &'a str);

/// The section and column name of a `[...]` table reference token.
pub(super) fn structured_parts(raw: &str) -> Result<StructuredParts<'_>, String> {
    if !raw.starts_with('[') || !raw.ends_with(']') {
        return Err("This table reference is not valid.".into());
    }
    let (section, column_name) = if raw.starts_with("[[") && raw.ends_with("]]") {
        let inner = &raw[2..raw.len() - 2];
        let Some((selector, column)) = inner.split_once("],[") else {
            return Err("Write a table reference with one section and one column.".into());
        };
        let section = if selector.eq_ignore_ascii_case("#Headers") {
            TableSection::Headers
        } else if selector.eq_ignore_ascii_case("#Totals") {
            TableSection::Totals
        } else {
            return Err("Use #Headers or #Totals as the section of a table reference.".into());
        };
        (section, column)
    } else {
        let inner = &raw[1..raw.len() - 1];
        if let Some(column) = inner.strip_prefix('@') {
            (TableSection::CurrentRow, column)
        } else {
            (TableSection::Body, inner)
        }
    };
    if column_name.is_empty() {
        return Err("Enter a column name in the table reference.".into());
    }
    Ok((section, column_name))
}

/// Most tokens the parser looks ahead of the next one: `Sheet1:Sheet3!`
/// is recognized from its first name. A power of two, so the ring wraps
/// with a mask.
const LOOKAHEAD: usize = 4;

/// The parser's tokens, lexed on demand from the formula text, or read from
/// formula help's token list. Lexing stops at the first lex error, which the
/// parse reports in place of any parse error, as a separate tokenizing step
/// would.
pub(super) struct Cursor<'a> {
    src: &'a str,
    index: usize,
    /// Formula help's tokens; `None` when lexing `src`.
    tokens: Option<std::vec::IntoIter<Tok<'a>>>,
    edge: ReferenceEdge,
    ahead: [Option<Tok<'a>>; LOOKAHEAD],
    ahead_start: usize,
    ahead_len: usize,
    /// Tokens the parser has read.
    pub(super) consumed: usize,
    lex_error: Option<String>,
}

impl<'a> Cursor<'a> {
    pub(super) const fn over_text(src: &'a str) -> Self {
        Self {
            src,
            index: 0,
            tokens: None,
            edge: ReferenceEdge::None,
            ahead: [None, None, None, None],
            ahead_start: 0,
            ahead_len: 0,
            consumed: 0,
            lex_error: None,
        }
    }

    pub(super) fn over_tokens(tokens: Vec<Tok<'a>>) -> Self {
        Self {
            tokens: Some(tokens.into_iter()),
            ..Self::over_text("")
        }
    }

    fn lex_next(&mut self) -> Option<Tok<'a>> {
        if let Some(tokens) = &mut self.tokens {
            return tokens.next();
        }

        if self.lex_error.is_some() {
            return None;
        }

        while self.index < self.src.len() {
            match lex_token_after(self.src, &mut self.index, self.edge) {
                Ok(Some(tok)) => {
                    self.edge = ReferenceEdge::after(Some(&tok));
                    return Some(tok);
                }
                Ok(None) => {}
                Err(error) => {
                    self.lex_error = Some(error);
                    return None;
                }
            }
        }

        None
    }

    /// Whether `count` tokens are ahead, lexing them when needed. Out of
    /// line so each peek and read inlines only the buffered case.
    #[inline(never)]
    fn fill(&mut self, count: usize) -> bool {
        while self.ahead_len < count {
            let Some(tok) = self.lex_next() else {
                return false;
            };
            self.ahead[(self.ahead_start + self.ahead_len) & (LOOKAHEAD - 1)] = Some(tok);
            self.ahead_len += 1;
        }

        true
    }

    #[inline(never)]
    pub(super) fn peek_at(&mut self, offset: usize) -> Option<&Tok<'a>> {
        if self.ahead_len <= offset && !self.fill(offset + 1) {
            return None;
        }

        self.ahead[(self.ahead_start + offset) & (LOOKAHEAD - 1)].as_ref()
    }

    /// Out of line: the parser reads tokens at many sites, and one copy of
    /// the ring step keeps the parser small.
    #[inline(never)]
    pub(super) fn next(&mut self) -> Option<Tok<'a>> {
        if self.ahead_len == 0 && !self.fill(1) {
            return None;
        }

        let tok = self.ahead[self.ahead_start].take();
        self.ahead_start = (self.ahead_start + 1) & (LOOKAHEAD - 1);
        self.ahead_len -= 1;
        self.consumed += 1;
        tok
    }

    /// The first lex error of the text, lexing whatever the parser left.
    pub(super) fn lex_error(&mut self) -> Option<String> {
        while self.lex_error.is_none() && self.lex_next().is_some() {}
        self.lex_error.take()
    }
}
