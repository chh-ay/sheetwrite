mod support;

use sheetwrite_queries::{
    execute, parse_plan, parse_source, Batch, ColumnType, CompareOp, Limits, Literal, Predicate,
    SourceSpec, Step, Value,
};
use support::{column, json_batch};

fn query(source: &str, steps: &str) -> Batch {
    let batch = json_batch(
        source.as_bytes(),
        vec![
            column("key", "Key", ColumnType::Text),
            column("value", "Value", ColumnType::Number),
        ],
    );
    let plan = parse_plan(steps.as_bytes(), &Limits::default()).unwrap();

    execute(batch, &plan, &[], &Limits::default()).unwrap()
}

#[test]
fn filter_project_rename_and_convert_preserve_identity() {
    let output = query(
        r#"[{"Key":"b","Value":2},{"Key":null,"Value":4},{"Key":"a","Value":3}]"#,
        r#"[
          {"kind":"filter","predicate":{"kind":"compare","column":"value","op":"gt","value":2}},
          {"kind":"select","columns":["value","key"]},
          {"kind":"rename","columns":[["value","Amount"]]},
          {"kind":"changeType","column":"value","type":"text","onError":"error"}
        ]"#,
    );

    assert_eq!(output.row_count(), 2);
    assert_eq!(output.columns()[0].id(), "value");
    assert_eq!(output.columns()[0].name(), "Amount");
    assert_eq!(output.value(0, 0).unwrap(), Value::Text("4"));
    assert_eq!(output.value(1, 0).unwrap(), Value::Null);
    assert_eq!(output.value(1, 1).unwrap(), Value::Text("a"));
}

#[test]
fn grouping_keeps_null_keys_and_empty_aggregates() {
    let output = query(
        r#"[{"Key":null,"Value":null},{"Key":null,"Value":null},{"Key":"a","Value":2},{"Key":"a","Value":4}]"#,
        r#"[{
          "kind":"group","keys":["key"],"aggregates":[
            {"id":"sum","name":"Sum","op":"sum","column":"value"},
            {"id":"avg","name":"Mean","op":"average","column":"value"},
            {"id":"count","name":"Count","op":"countRows"},
            {"id":"nonNull","name":"NonNull","op":"count","column":"value"},
            {"id":"min","name":"Minimum","op":"min","column":"value"},
            {"id":"max","name":"Maximum","op":"max","column":"value"}
          ]
        }]"#,
    );

    assert_eq!(output.row_count(), 2);
    assert_eq!(output.value(0, 0).unwrap(), Value::Null);
    assert_eq!(output.value(1, 0).unwrap(), Value::Null);
    assert_eq!(output.value(2, 0).unwrap(), Value::Null);
    assert_eq!(output.value(3, 0).unwrap(), Value::Number(2.0));
    assert_eq!(output.value(1, 1).unwrap(), Value::Number(6.0));
    assert_eq!(output.value(2, 1).unwrap(), Value::Number(3.0));
    assert_eq!(output.value(4, 0).unwrap(), Value::Number(0.0));
    assert_eq!(output.value(5, 0).unwrap(), Value::Null);
    assert_eq!(output.value(6, 0).unwrap(), Value::Null);
    assert_eq!(output.value(4, 1).unwrap(), Value::Number(2.0));
    assert_eq!(output.value(5, 1).unwrap(), Value::Number(2.0));
    assert_eq!(output.value(6, 1).unwrap(), Value::Number(4.0));
}

#[test]
fn unpivot_omits_nulls_and_preserves_mixed_types() {
    let output = query(
        r#"[{"Key":"a","Value":2},{"Key":null,"Value":null}]"#,
        r#"[{
          "kind":"unpivot","columns":["key","value"],
          "attribute":{"id":"attribute","name":"Attribute"},
          "value":{"id":"result","name":"Result"}
        }]"#,
    );

    assert_eq!(output.row_count(), 2);
    assert_eq!(output.value(0, 0).unwrap(), Value::Text("Key"));
    assert_eq!(output.value(1, 0).unwrap(), Value::Text("a"));
    assert_eq!(output.value(0, 1).unwrap(), Value::Text("Value"));
    assert_eq!(output.value(1, 1).unwrap(), Value::Number(2.0));
}

#[test]
fn conversion_errors_are_values_unless_null_is_explicit() {
    for (policy, expected) in [("error", Value::Error("conversion")), ("null", Value::Null)] {
        let steps = format!(
            r#"[{{"kind":"changeType","column":"key","type":"number","onError":"{policy}"}}]"#
        );
        let output = query(r#"[{"Key":"bad","Value":1}]"#, &steps);

        assert_eq!(output.value(0, 0).unwrap(), expected);
    }
}

#[test]
fn explicit_conversion_has_no_host_locale_or_time_zone() {
    for (kind, input, expected, text) in [
        ("number", "01.50", Value::Number(1.5), "1.5"),
        ("logical", "true", Value::Logical(true), "true"),
        ("logical", "false", Value::Logical(false), "false"),
        ("date", "1970-01-02", Value::Date(1), "1970-01-02"),
        (
            "dateTime",
            "1969-12-31T23:59:59.999999",
            Value::DateTime(-1),
            "1969-12-31T23:59:59.999999",
        ),
        (
            "dateTime",
            "1970-01-01T00:00:00.000000",
            Value::DateTime(0),
            "1970-01-01T00:00:00",
        ),
    ] {
        let source = format!(r#"[{{"Key":"{input}","Value":1}}]"#);
        let steps = format!(
            r#"[{{"kind":"changeType","column":"key","type":"{kind}","onError":"error"}}]"#
        );
        let typed = query(&source, &steps);

        assert_eq!(typed.value(0, 0).unwrap(), expected);

        let plan = parse_plan(
            br#"[{"kind":"changeType","column":"key","type":"text","onError":"error"}]"#,
            &Limits::default(),
        )
        .unwrap();
        let output = execute(typed, &plan, &[], &Limits::default()).unwrap();

        assert_eq!(output.value(0, 0).unwrap(), Value::Text(text));
    }
}

#[test]
fn incompatible_json_cells_remain_errors_when_aggregated() {
    let source = json_batch(
        br#"[{"Key":"a","Value":{"nested":1}},{"Key":"a","Value":[1]},{"Key":"a","Value":true}]"#,
        vec![
            column("key", "Key", ColumnType::Text),
            column("value", "Value", ColumnType::Number),
        ],
    );

    for row in 0..3 {
        assert_eq!(source.value(1, row).unwrap(), Value::Error("conversion"));
    }

    let plan = parse_plan(
        br#"[{"kind":"group","keys":["key"],"aggregates":[{"id":"rows","name":"Rows","op":"countRows"},{"id":"sum","name":"Sum","op":"sum","column":"value"}]}]"#,
        &Limits::default(),
    )
    .unwrap();
    let output = execute(source, &plan, &[], &Limits::default()).unwrap();

    assert_eq!(output.value(1, 0).unwrap(), Value::Number(3.0));
    assert_eq!(output.value(2, 0).unwrap(), Value::Error("conversion"));
}

#[test]
fn nested_predicates_preserve_null_until_row_selection() {
    let output = query(
        r#"[{"Key":null,"Value":null},{"Key":"a","Value":1},{"Key":"b","Value":3}]"#,
        r#"[{
          "kind":"filter","predicate":{"kind":"not","predicate":{
            "kind":"or","predicates":[
              {"kind":"compare","column":"value","op":"gt","value":2},
              {"kind":"contains","column":"key","text":"b"}
            ]
          }}
        }]"#,
    );

    assert_eq!(output.row_count(), 1);
    assert_eq!(output.value(0, 0).unwrap(), Value::Text("a"));
}

#[test]
fn invalid_columns_and_output_growth_are_rejected() {
    let source = SourceSpec::Json {
        columns: vec![column("key", "Key", ColumnType::Text)],
        path: Vec::new(),
    };
    let batch = parse_source(br#"[{"Key":"a"}]"#, &source, &Limits::default()).unwrap();
    let plan = parse_plan(
        br#"[{"kind":"select","columns":["missing"]}]"#,
        &Limits::default(),
    )
    .unwrap();

    assert_eq!(
        execute(batch, &plan, &[], &Limits::default())
            .unwrap_err()
            .code,
        "column"
    );

    let limits = Limits {
        max_rows: 0,
        ..Limits::default()
    };
    assert_eq!(
        parse_source(br#"[{"Key":"a"}]"#, &source, &limits)
            .unwrap_err()
            .code,
        "limit"
    );
}

#[test]
fn non_finite_sources_are_cell_errors_but_predicate_literals_are_fatal() {
    let source = json_batch(
        br#"[{"Value":1e309}]"#,
        vec![column("value", "Value", ColumnType::Number)],
    );

    assert_eq!(source.value(0, 0).unwrap(), Value::Error("conversion"));

    let mut plans = vec![vec![Step::Filter {
        predicate: Predicate::Compare {
            column: String::from("value"),
            op: CompareOp::Eq,
            value: Literal::Number(f64::INFINITY),
        },
    }]];
    match parse_plan(
        br#"[{"kind":"filter","predicate":{"kind":"compare","column":"value","op":"eq","value":1e309}}]"#,
        &Limits::default(),
    ) {
        Ok(plan) => plans.push(plan),
        Err(issue) => assert_eq!(issue.code, "definition"),
    }

    for plan in plans {
        let source = json_batch(b"[]", vec![column("value", "Value", ColumnType::Number)]);
        let issue = execute(source, &plan, &[], &Limits::default()).unwrap_err();

        assert_eq!(issue.code, "definition");
    }
}

#[test]
fn an_identity_plan_still_enforces_execution_shape_limits() {
    let source = json_batch(
        br#"[{"Value":1},{"Value":2}]"#,
        vec![column("value", "Value", ColumnType::Number)],
    );
    let limits = Limits {
        max_rows: 1,
        ..Limits::default()
    };

    let issue = execute(source, &Vec::new(), &[], &limits).unwrap_err();

    assert_eq!(issue.code, "limit");
}
