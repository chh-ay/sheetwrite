//! TEXT against the shared number format cases in
//! `test/fixtures/number-format-cases.json`, which the TypeScript formatter's
//! tests read too, so the two formatters cannot drift apart.

use super::value::format_basic_text;
use crate::types::Value;

const CASES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../test/fixtures/number-format-cases.json"
));

/// One case: the value, the format code and the text Excel shows.
type Case = (f64, String, String);

/// Reads a JSON string starting at its opening quote; returns the string and
/// the rest of the input. The fixture escapes only quotes and backslashes.
fn json_string(input: &str) -> (String, &str) {
    let mut text = String::new();
    let mut chars = input.char_indices().skip(1);
    while let Some((index, ch)) = chars.next() {
        match ch {
            '"' => return (text, &input[index + 1..]),
            '\\' => text.push(chars.next().expect("escape").1),
            _ => text.push(ch),
        }
    }
    panic!("unterminated string");
}

/// The `[value, code, text, note]` rows of the fixture's `cases` array, each
/// on one line or, when long, one item per line.
fn cases() -> Vec<Case> {
    let start = CASES.find("\"cases\"").expect("cases");
    let mut rest = &CASES[start..];
    let mut rows = Vec::new();
    while let Some(open) = rest.find("\n    [") {
        rest = &rest[open + 6..];
        let comma = rest.find(',').expect("value");
        let value = rest[..comma].trim().parse().expect("number");
        rest = rest[comma + 1..].trim_start();
        let (code, after_code) = json_string(rest);
        let (text, after_text) =
            json_string(after_code.trim_start_matches(|ch: char| ch == ',' || ch.is_whitespace()));
        rows.push((value, code, text));
        rest = after_text;
    }
    rows
}

#[test]
fn text_matches_the_shared_cases() {
    let rows = cases();
    assert!(rows.len() > 300, "read {} cases", rows.len());
    let failures: Vec<String> = rows
        .iter()
        .filter_map(|(value, code, expected)| {
            let actual = format_basic_text(&Value::Number(*value), code).expect("text");
            (&actual != expected)
                .then(|| format!("TEXT({value}, {code:?}) = {actual:?}, expected {expected:?}"))
        })
        .collect();
    assert!(
        failures.is_empty(),
        "{} of {} cases differ:\n{}",
        failures.len(),
        rows.len(),
        failures.join("\n")
    );
}
