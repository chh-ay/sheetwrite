//! Formula help's tokens and syntax errors (`formula_tokens.rs`).

use crate::calc::parse;
use crate::formula_tokens::{check_formula_syntax, formula_tokens, TokenKind};

/// One decoded token: kind, UTF-16 `from` and `to`, and whitespace before it.
type Token = (TokenKind, u32, u32, bool);
/// A source and the tokens it gives.
type TokenCase = (&'static str, &'static [Token]);
/// A source and the kinds of the tokens it gives.
type KindCase = (&'static str, &'static [TokenKind]);

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

/// Offsets count UTF-16 units (the emoji takes two, and four UTF-8 bytes);
/// leading space and one `=` are skipped; text that cannot be read is one
/// `Bad` token, and an open quote runs it to the end.
#[test]
fn tokens_carry_utf16_offsets_and_the_space_before_them() {
    use TokenKind::*;

    let cases: &[TokenCase] = &[
        (
            "=\"😀\"&A1",
            &[
                (String, 1, 5, false),
                (Operator, 5, 6, false),
                (Ident, 6, 8, false),
            ],
        ),
        ("  =1", &[(Number, 3, 4, false)]),
        ("= 1", &[(Number, 2, 3, true)]),
        (
            "=1 @ 2",
            &[
                (Number, 1, 2, false),
                (Bad, 3, 4, true),
                (Number, 5, 6, true),
            ],
        ),
        (
            "=1&\"ab",
            &[
                (Number, 1, 2, false),
                (Operator, 2, 3, false),
                (Bad, 3, 6, false),
            ],
        ),
    ];
    for &(src, expected) in cases {
        assert_eq!(tokens(src), expected, "{src}");
    }
}

#[test]
fn tells_every_kind_apart() {
    use TokenKind::*;

    let cases: &[KindCase] = &[
        ("1+2", &[Number, Operator, Number]),
        ("=TRUE", &[Bool]),
        ("=false", &[Bool]),
        ("=TRUE()", &[Ident, LParen, RParen]),
        ("=TRUE!A1", &[Ident, Bang, Ident]),
        (
            "='My sheet'!A1#+Table1[Col]&#N/A",
            &[
                QuotedSheet,
                Bang,
                Ident,
                Hash,
                Operator,
                Ident,
                StructuredRef,
                Operator,
                ErrorLiteral,
            ],
        ),
        (
            "={1,2;3,4}<>1",
            &[
                LBrace, Number, Comma, Number, Semicolon, Number, Comma, Number, RBrace, Operator,
                Number,
            ],
        ),
    ];
    for &(src, expected) in cases {
        assert_eq!(kinds(src), expected, "{src}");
    }
}

/// An open quote or bracket and a missing end are incomplete; the end of
/// the text is where the missing part goes.
#[test]
fn reports_the_span_and_message_of_a_syntax_error() {
    let cases = [
        ("=\"😀\"&)", (6, 7, false, "Enter a value before this.")),
        ("=1 @ 2", (3, 4, false, "@ is not allowed in a formula.")),
        ("=1&\"ab", (3, 6, true, "Add \" to close the text.")),
        ("='Q1", (1, 4, true, "Add ' to close the sheet name.")),
        (
            "=T[Col",
            (2, 6, true, "Add ] to close the table reference."),
        ),
        ("=SUM(1", (6, 6, true, "Add ) to close the (.")),
        (
            "=1+",
            (3, 3, true, "Enter a value to complete the formula."),
        ),
        ("=", (1, 1, true, "Enter a value to complete the formula.")),
        ("={1,2", (5, 5, true, "Add } to close the array constant.")),
        ("=A1:", (4, 4, true, "Enter a cell, column or row after :.")),
    ];
    for (src, (from, to, incomplete, message)) in cases {
        assert_eq!(
            error(src),
            Some((from, to, incomplete, message.to_owned())),
            "{src}"
        );
    }
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
