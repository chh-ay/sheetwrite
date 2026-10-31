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
fn kind_numbers_follow_the_declaration_order() {
    for (index, kind) in KINDS.iter().enumerate() {
        assert_eq!(*kind as usize, index, "{kind:?}");
    }
}

#[test]
fn reads_a_call_with_spans_and_spaces() {
    use TokenKind::*;

    assert_eq!(
        tokens("=SUM(A1:B2, \"x\")"),
        vec![
            (Ident, 1, 4, false),
            (LParen, 4, 5, false),
            (Ident, 5, 7, false),
            (Colon, 7, 8, false),
            (Ident, 8, 10, false),
            (Comma, 10, 11, false),
            (String, 12, 15, true),
            (RParen, 15, 16, false),
        ]
    );
    assert_eq!(error("=SUM(A1:B2, \"x\")"), None);
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
fn reads_exponents_whole_axes_and_names_past_the_sheet_as_the_parser_does() {
    use TokenKind::*;

    assert_eq!(tokens("=1E3"), vec![(Number, 1, 4, false)]);
    assert_eq!(kinds("=A:A"), vec![Ident, Colon, Ident]);
    assert_eq!(kinds("=1:1"), vec![Number, Colon, Number]);
    assert_eq!(kinds("=XYZ1"), vec![Ident]);
    for src in ["=1E3", "=A:A", "=1:1", "=XYZ1"] {
        assert_eq!(error(src), None, "{src}");
    }
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
fn reads_every_other_kind() {
    use TokenKind::*;

    assert_eq!(
        kinds("='My sheet'!A1#+Table1[Col]&#N/A"),
        vec![
            QuotedSheet,
            Bang,
            Ident,
            Hash,
            Operator,
            Ident,
            StructuredRef,
            Operator,
            ErrorLiteral
        ]
    );
    assert_eq!(
        kinds("={1,2;3,4}<>1"),
        vec![
            LBrace, Number, Comma, Number, Semicolon, Number, Comma, Number, RBrace, Operator,
            Number
        ]
    );
}

#[test]
fn marks_the_space_of_an_intersection_on_the_next_token() {
    use TokenKind::*;

    assert_eq!(
        tokens("=A1:A3 B2"),
        vec![
            (Ident, 1, 3, false),
            (Colon, 3, 4, false),
            (Ident, 4, 6, false),
            (Ident, 7, 9, true),
        ]
    );
    assert_eq!(error("=A1:A3 B2"), None);
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
fn reports_a_missing_end_as_incomplete_at_the_end_of_the_text() {
    assert_eq!(
        error("=SUM(1"),
        Some((6, 6, true, "Add ) to close the (.".into()))
    );
    assert_eq!(
        error("=1+"),
        Some((3, 3, true, "Enter a value to complete the formula.".into()))
    );
    assert_eq!(
        error("="),
        Some((1, 1, true, "Enter a value to complete the formula.".into()))
    );
    assert_eq!(
        error("={1,2"),
        Some((5, 5, true, "Add } to close the array constant.".into()))
    );
    assert_eq!(
        error("=A1:"),
        Some((4, 4, true, "Enter a cell, column or row after :.".into()))
    );
}

#[test]
fn marks_the_wrong_token_of_a_complete_text() {
    assert_eq!(
        error("=SUM(1))"),
        Some((7, 8, false, "This ) has no matching (.".into()))
    );
    assert_eq!(
        error("=SUM(1 2)"),
        Some((7, 8, false, "This is not expected here.".into()))
    );
    assert_eq!(
        error("=(1 2)"),
        Some((4, 5, false, "This is not expected here.".into()))
    );
    assert_eq!(
        error("=A1:1"),
        Some((
            4,
            5,
            false,
            "A range joins two cells, two columns or two rows.".into()
        ))
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
