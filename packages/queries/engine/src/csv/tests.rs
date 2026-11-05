//! RFC 4180 quoting and record ends must survive every line-break convention.

use super::{Reader, Record};

fn records(bytes: &[u8], delimiter: u8) -> Result<Vec<Vec<String>>, String> {
    let mut reader = Reader::new(bytes, delimiter).map_err(|issue| issue.code)?;
    let mut record = Record::default();
    let mut output = Vec::new();

    while reader.read(&mut record).map_err(|issue| issue.code)? {
        output.push(record.fields().map(str::to_owned).collect());
    }

    Ok(output)
}

#[test]
fn quoted_fields_keep_delimiters_breaks_and_doubled_quotes() {
    let parsed = records(b"a,\"b,\"\"c\"\"\r\nd\",\n\r\n\"\",e\rf", b',').unwrap();

    assert_eq!(
        parsed,
        vec![
            vec!["a".to_owned(), "b,\"c\"\r\nd".to_owned(), String::new()],
            vec![String::new(), "e".to_owned()],
            vec!["f".to_owned()],
        ]
    );
}

#[test]
fn unquoted_quotes_are_literal_and_trailing_delimiters_add_an_empty_field() {
    let parsed = records("x\"y;é;\n".as_bytes(), b';').unwrap();

    assert_eq!(
        parsed,
        vec![vec!["x\"y".to_owned(), "é".to_owned(), String::new()]]
    );
}

#[test]
fn malformed_quoting_utf8_and_delimiters_are_rejected() {
    assert_eq!(records(b"\"open", b','), Err("csv".to_owned()));
    assert_eq!(records(b"\"a\"b,c", b','), Err("csv".to_owned()));
    assert_eq!(records(b"\xff", b','), Err("csv".to_owned()));

    for delimiter in [b'"', b'\n', b'\r', 0, 0xc3] {
        assert_eq!(records(b"a", delimiter), Err("csv-options".to_owned()));
    }
}
