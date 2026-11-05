mod support;

use sheetwrite_queries::{
    execute, parse_plan, parse_source, ColumnType, Limits, SourceSpec, Value,
};
use support::{column, json_batch};

#[test]
fn all_join_kinds_match_null_and_duplicate_composite_keys() {
    let left_json =
        br#"[{"Key":null,"N":0},{"Key":"a","N":1},{"Key":"a","N":1},{"Key":"z","N":2}]"#;
    let right_json = br#"[{"RightKey":null,"RightN":0},{"RightKey":"a","RightN":1},{"RightKey":"a","RightN":1},{"RightKey":"a","RightN":3}]"#;

    for (kind, rows, width) in [
        ("inner", 5, 4),
        ("left", 6, 4),
        ("right", 6, 4),
        ("full", 7, 4),
        ("leftSemi", 3, 2),
        ("rightSemi", 3, 2),
        ("leftAnti", 1, 2),
        ("rightAnti", 1, 2),
    ] {
        let steps = format!(
            r#"[{{"kind":"join","input":"right","keys":[["key","rk"],["n","rn"]],"join":"{kind}"}}]"#
        );
        let plan = parse_plan(steps.as_bytes(), &Limits::default()).unwrap();
        let right = json_batch(
            right_json,
            vec![
                column("rk", "RightKey", ColumnType::Text),
                column("rn", "RightN", ColumnType::Number),
            ],
        );
        let left = json_batch(
            left_json,
            vec![
                column("key", "Key", ColumnType::Text),
                column("n", "N", ColumnType::Number),
            ],
        );
        let inputs = vec![("right".to_owned(), right)];
        let output = execute(left, &plan, &inputs, &Limits::default()).unwrap();

        assert_eq!(
            (output.row_count(), output.columns().len()),
            (rows, width),
            "{kind}"
        );

        if kind == "inner" || kind == "full" {
            assert_eq!(output.value(0, 0).unwrap(), Value::Null);
        }

        if kind == "leftAnti" {
            assert_eq!(output.value(0, 0).unwrap(), Value::Text("z"));
        }

        if kind == "rightAnti" {
            assert_eq!(output.value(1, 0).unwrap(), Value::Number(3.0));
        }
    }
}

#[test]
fn join_growth_and_error_keys_fail_before_output() {
    let plan = parse_plan(
        br#"[{"kind":"join","input":"right","keys":[["key","right"]],"join":"inner"}]"#,
        &Limits::default(),
    )
    .unwrap();
    let right = json_batch(
        br#"[{"Right":1},{"Right":1}]"#,
        vec![column("right", "Right", ColumnType::Number)],
    );
    let inputs = vec![("right".to_owned(), right)];
    let limits = Limits {
        max_rows: 2,
        ..Limits::default()
    };
    let left = json_batch(
        br#"[{"Key":1},{"Key":1}]"#,
        vec![column("key", "Key", ColumnType::Number)],
    );

    assert_eq!(
        execute(left, &plan, &inputs, &limits).unwrap_err().code,
        "limit"
    );

    let byte_limits = Limits {
        max_output_bytes: 32,
        ..Limits::default()
    };
    let left = json_batch(
        br#"[{"Key":1},{"Key":1}]"#,
        vec![column("key", "Key", ColumnType::Number)],
    );

    assert_eq!(
        execute(left, &plan, &inputs, &byte_limits)
            .unwrap_err()
            .code,
        "limit"
    );

    let left = json_batch(
        br#"[{"Key":"bad"}]"#,
        vec![column("key", "Key", ColumnType::Number)],
    );
    let error = execute(left, &plan, &inputs, &Limits::default()).unwrap_err();

    assert_eq!(
        (error.code.as_str(), error.step, error.row),
        ("key-error", Some(0), Some(0))
    );
}

#[test]
fn join_byte_budget_counts_text_across_all_output_columns() {
    let limits = Limits {
        max_output_bytes: 300,
        ..Limits::default()
    };
    let text = "x".repeat(64);
    let bytes = format!(r#"[{{"Key":1,"A":"{text}","B":"{text}"}}]"#);
    let spec = SourceSpec::Json {
        columns: vec![
            column("key", "Key", ColumnType::Number),
            column("a", "A", ColumnType::Text),
            column("b", "B", ColumnType::Text),
        ],
        path: Vec::new(),
    };
    let left = parse_source(bytes.as_bytes(), &spec, &limits).unwrap();
    let right = json_batch(
        br#"[{"Right":1},{"Right":1}]"#,
        vec![column("right", "Right", ColumnType::Number)],
    );
    let plan = parse_plan(
        br#"[{"kind":"join","input":"right","keys":[["key","right"]],"join":"inner"}]"#,
        &limits,
    )
    .unwrap();

    let error = execute(left, &plan, &[("right".to_owned(), right)], &limits).unwrap_err();

    assert_eq!(error.code, "limit");
}

#[test]
fn csv_quoting_json_path_dates_and_missing_fields_follow_schema() {
    let csv_schema = SourceSpec::Csv {
        columns: vec![
            column("name", "Name", ColumnType::Text),
            column("number", "Value", ColumnType::Number),
        ],
        delimiter: b',',
        headers: true,
        empty_is_null: true,
    };
    let csv = parse_source(
        b"Name,Value\r\n\"a,b\",2\r\n\"line\nnext\",\r\n",
        &csv_schema,
        &Limits::default(),
    )
    .unwrap();

    assert_eq!(csv.value(0, 0).unwrap(), Value::Text("a,b"));
    assert_eq!(csv.value(0, 1).unwrap(), Value::Text("line\nnext"));
    assert_eq!(csv.value(1, 1).unwrap(), Value::Null);

    let json_schema = SourceSpec::Json {
        columns: vec![
            column("date", "Date", ColumnType::Date),
            column("time", "Time", ColumnType::DateTime),
        ],
        path: vec![String::from("result"), String::from("records")],
    };
    let json = parse_source(
        br#"{"ignored":[1,2],"result":{"records":[{"Date":"1970-01-02","Time":"1970-01-01T00:00:00.000001"},{}]}}"#,
        &json_schema,
        &Limits::default(),
    ).unwrap();

    assert_eq!(json.value(0, 0).unwrap(), Value::Date(1));
    assert_eq!(json.value(1, 0).unwrap(), Value::DateTime(1));
    assert_eq!(json.value(0, 1).unwrap(), Value::Null);
}

#[test]
fn malformed_sources_and_duplicate_definitions_are_rejected() {
    let schema = SourceSpec::Json {
        columns: vec![column("key", "Key", ColumnType::Text)],
        path: Vec::new(),
    };

    for bytes in [
        br#"[{"Key":"a","Key":"b"}]"#.as_slice(),
        br#"[] trailing"#.as_slice(),
        br#"[null]"#.as_slice(),
    ] {
        assert!(parse_source(bytes, &schema, &Limits::default()).is_err());
    }

    let batch = parse_source(br#"[{"Key":"a"}]"#, &schema, &Limits::default()).unwrap();
    let plan = parse_plan(
        br#"[{"kind":"select","columns":["key","key"]}]"#,
        &Limits::default(),
    )
    .unwrap();

    assert_eq!(
        execute(batch, &plan, &[], &Limits::default())
            .unwrap_err()
            .code,
        "duplicate-column"
    );
}

#[test]
fn unicode_escapes_numeric_grammar_and_invalid_utf8_are_checked() {
    let schema = SourceSpec::Json {
        columns: vec![
            column("text", "Text", ColumnType::Text),
            column("number", "Number", ColumnType::Number),
        ],
        path: Vec::new(),
    };
    let batch = parse_source(
        br#"[{"Text":"\uD83D\uDE00\n\"","Number":-1.25e2}]"#,
        &schema,
        &Limits::default(),
    )
    .unwrap();

    assert_eq!(batch.value(0, 0).unwrap(), Value::Text("\u{1f600}\n\""));
    assert_eq!(batch.value(1, 0).unwrap(), Value::Number(-125.0));

    for bytes in [
        br#"[{"Text":"\uD800"}]"#.as_slice(),
        br#"[{"Number":01}]"#.as_slice(),
        br#"[{"Number":1.}]"#.as_slice(),
        br#"[{"Number":1},]"#.as_slice(),
        br#"[{"ignored":{1:true}}]"#.as_slice(),
        b"[{\"Text\":\"\xff\"}]".as_slice(),
    ] {
        assert!(parse_source(bytes, &schema, &Limits::default()).is_err());
    }
}
