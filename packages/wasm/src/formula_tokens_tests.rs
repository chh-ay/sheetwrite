//! Formula help's tokens and syntax errors (`formula_tokens.rs`).

use crate::calc::parse;
use crate::formula_tokens::{check_formula_syntax, formula_tokens, TokenKind};

/// One decoded token: kind, UTF-16 `from` and `to`, and whitespace before it.
type Token = (TokenKind, u32, u32, bool);

const KINDS: [TokenKind; 18] = [
    TokenKind::Number,
    TokenKind::String,
    TokenKind::Bool,
    TokenKind::ErrorLiteral,
    TokenKind::Ident,
    TokenKind::QuotedSheet,
    TokenKind::StructuredRef,
    TokenKind::Operator,
    TokenKind::Colon,
    TokenKind::Bang,
    TokenKind::Hash,
    TokenKind::Comma,
    TokenKind::Semicolon,
    TokenKind::LParen,
    TokenKind::RParen,
    TokenKind::LBrace,
    TokenKind::RBrace,
    TokenKind::Bad,
];

fn tokens(src: &str) -> Vec<Token> {
    let packed = formula_tokens(src);
    let (fields, rest) = packed.as_chunks::<4>();
    assert!(rest.is_empty(), "{src}: a partial token");

    fields
        .iter()
        .map(|&[kind, from, to, space]| (KINDS[kind as usize], from, to, space == 1))
        .collect()
}

fn kinds(src: &str) -> Vec<TokenKind> {
    tokens(src).into_iter().map(|(kind, ..)| kind).collect()
}

/// The error as `(from, to, incomplete, message)`.
fn error(src: &str) -> Option<(u32, u32, bool, String)> {
    check_formula_syntax(src).map(|error| {
        (
            error.from(),
            error.to(),
            error.incomplete(),
            error.message(),
        )
    })
}

#[test]
fn counts_offsets_in_utf16_units_past_non_bmp_text() {
    use TokenKind::*;

    // The emoji takes two UTF-16 units and four UTF-8 bytes.
    assert_eq!(
        tokens("=\"😀\"&A1"),
        vec![
            (String, 1, 5, false),
            (Operator, 5, 6, false),
            (Ident, 6, 8, false),
        ]
    );
    assert_eq!(
        error("=\"😀\"&)"),
        Some((6, 7, false, "Enter a value before this.".into()))
    );
}

#[test]
fn skips_leading_space_and_one_equals_sign() {
    assert_eq!(tokens("  =1"), vec![(TokenKind::Number, 3, 4, false)]);
    assert_eq!(tokens("= 1"), vec![(TokenKind::Number, 2, 3, true)]);
    assert_eq!(
        kinds("1+2"),
        vec![TokenKind::Number, TokenKind::Operator, TokenKind::Number]
    );
}

#[test]
fn tells_logical_values_from_calls_and_sheets() {
    use TokenKind::*;

    assert_eq!(kinds("=TRUE"), vec![Bool]);
    assert_eq!(kinds("=false"), vec![Bool]);
    assert_eq!(kinds("=TRUE()"), vec![Ident, LParen, RParen]);
    assert_eq!(kinds("=TRUE!A1"), vec![Ident, Bang, Ident]);
}

#[test]
fn goes_on_after_text_it_cannot_read() {
    use TokenKind::*;

    assert_eq!(
        tokens("=1 @ 2"),
        vec![
            (Number, 1, 2, false),
            (Bad, 3, 4, true),
            (Number, 5, 6, true)
        ]
    );
    assert_eq!(
        error("=1 @ 2"),
        Some((3, 4, false, "@ is not allowed in a formula.".into()))
    );
}

#[test]
fn runs_an_open_quote_or_bracket_to_the_end_as_incomplete() {
    use TokenKind::*;

    assert_eq!(
        tokens("=1&\"ab"),
        vec![
            (Number, 1, 2, false),
            (Operator, 2, 3, false),
            (Bad, 3, 6, false)
        ]
    );
    assert_eq!(
        error("=1&\"ab"),
        Some((3, 6, true, "Add \" to close the text.".into()))
    );
    assert_eq!(
        error("='Q1"),
        Some((1, 4, true, "Add ' to close the sheet name.".into()))
    );
    assert_eq!(
        error("=T[Col"),
        Some((2, 6, true, "Add ] to close the table reference.".into()))
    );
}

#[test]
fn rejects_exactly_what_the_parser_rejects() {
    let sources = [
        "=SUM(A1:B2)",
        "=IF(A1>0,\"yes\",)",
        "=Sheet1!A1:Sheet1!B2",
        "='Q 1:Q 3'!A1",
        "=Sheet1:Sheet3!A1",
        "=A1#",
        "=(A1,B2)",
        "={1,-2;\"a\",TRUE}",
        "=Table1[[#Headers],[Col]]",
        "=1%%",
        "=-+-1",
        "=SUM(",
        "=SUM(1,,",
        "=)",
        "={1,2;3}",
        "={A1}",
        "=Sheet1!A1:Sheet2!B2",
        "=Sheet1!A",
        "=1 2",
        "=\"a\"\"b\"",
        "=1E999",
    ];

    for src in sources {
        assert_eq!(error(src).is_none(), parse(src).is_ok(), "{src}");
        if let (Some(found), Err(message)) = (error(src), parse(src)) {
            assert_eq!(found.3, message, "{src}");
        }
    }
}
