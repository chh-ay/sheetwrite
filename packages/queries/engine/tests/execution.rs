//! Plans run end to end on parsed sources: filters, projections, conversions and folds.

mod support;

use sheetwrite_queries::{
    execute, parse_source, AggregateOp, Batch, ColumnType, CompareOp, ErrorPolicy, Limits, Literal,
    Predicate, SourceSpec, Step, Value,
};
use support::{
    aggregate, change_type, column, compare, contains, filter, group, json_batch, rename, select,
    unpivot,
};

#[allow(
    clippy::unwrap_used,
    reason = "a test fixture; a plan that fails fails the test"
)]
fn query(source: &str, steps: &[Step]) -> Batch {
    let batch = json_batch(
        source.as_bytes(),
        vec![
            column("key", "Key", ColumnType::Text),
            column("value", "Value", ColumnType::Number),
        ],
    );

    execute(batch, steps, &[], &Limits::default()).unwrap()
}

#[test]
fn filter_project_rename_and_convert_preserve_identity() {
    let output = query(
        r#"[{"Key":"b","Value":2},{"Key":null,"Value":4},{"Key":"a","Value":3}]"#,
        &[
            filter(compare("value", CompareOp::Gt, Literal::Number(2.0))),
            select(&["value", "key"]),
            rename(&[("value", "Amount")]),
            change_type("value", ColumnType::Text, ErrorPolicy::Error),
        ],
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
        &[group(
            &["key"],
            vec![
                aggregate("sum", "Sum", AggregateOp::Sum, Some("value")),
                aggregate("avg", "Mean", AggregateOp::Average, Some("value")),
                aggregate("count", "Count", AggregateOp::CountRows, None),
                aggregate("nonNull", "NonNull", AggregateOp::Count, Some("value")),
                aggregate("min", "Minimum", AggregateOp::Min, Some("value")),
                aggregate("max", "Maximum", AggregateOp::Max, Some("value")),
            ],
        )],
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
        &[unpivot(
            &["key", "value"],
            ("attribute", "Attribute"),
            ("result", "Result"),
        )],
    );

    assert_eq!(output.row_count(), 2);
    assert_eq!(output.value(0, 0).unwrap(), Value::Text("Key"));
    assert_eq!(output.value(1, 0).unwrap(), Value::Text("a"));
    assert_eq!(output.value(0, 1).unwrap(), Value::Text("Value"));
    assert_eq!(output.value(1, 1).unwrap(), Value::Number(2.0));
}

#[test]
fn conversion_errors_are_values_unless_null_is_explicit() {
    for (policy, expected) in [
        (ErrorPolicy::Error, Value::Error("conversion")),
        (ErrorPolicy::Null, Value::Null),
    ] {
        let output = query(
            r#"[{"Key":"bad","Value":1}]"#,
            &[change_type("key", ColumnType::Number, policy)],
        );

        assert_eq!(output.value(0, 0).unwrap(), expected);
    }
}

#[test]
fn explicit_conversion_has_no_host_locale_or_time_zone() {
    for (kind, input, expected, text) in [
        (ColumnType::Number, "01.50", Value::Number(1.5), "1.5"),
        (ColumnType::Logical, "true", Value::Logical(true), "true"),
        (ColumnType::Logical, "false", Value::Logical(false), "false"),
        (ColumnType::Date, "1970-01-02", Value::Date(1), "1970-01-02"),
        (
            ColumnType::DateTime,
            "1969-12-31T23:59:59.999999",
            Value::DateTime(-1),
            "1969-12-31T23:59:59.999999",
        ),
        (
            ColumnType::DateTime,
            "1970-01-01T00:00:00.000000",
            Value::DateTime(0),
            "1970-01-01T00:00:00",
        ),
    ] {
        let source = format!(r#"[{{"Key":"{input}","Value":1}}]"#);
        let typed = query(&source, &[change_type("key", kind, ErrorPolicy::Error)]);

        assert_eq!(typed.value(0, 0).unwrap(), expected);

        let plan = [change_type("key", ColumnType::Text, ErrorPolicy::Error)];
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

    let plan = [group(
        &["key"],
        vec![
            aggregate("rows", "Rows", AggregateOp::CountRows, None),
            aggregate("sum", "Sum", AggregateOp::Sum, Some("value")),
        ],
    )];
    let output = execute(source, &plan, &[], &Limits::default()).unwrap();

    assert_eq!(output.value(1, 0).unwrap(), Value::Number(3.0));
    assert_eq!(output.value(2, 0).unwrap(), Value::Error("conversion"));
}

#[test]
fn nested_predicates_preserve_null_until_row_selection() {
    let output = query(
        r#"[{"Key":null,"Value":null},{"Key":"a","Value":1},{"Key":"b","Value":3}]"#,
        &[filter(Predicate::Not {
            predicate: Box::new(Predicate::Or {
                predicates: vec![
                    compare("value", CompareOp::Gt, Literal::Number(2.0)),
                    contains("key", "b"),
                ],
            }),
        })],
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

    assert_eq!(
        execute(batch, &[select(&["missing"])], &[], &Limits::default())
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

    let plan = [filter(compare(
        "value",
        CompareOp::Eq,
        Literal::Number(f64::INFINITY),
    ))];
    let source = json_batch(b"[]", vec![column("value", "Value", ColumnType::Number)]);
    let issue = execute(source, &plan, &[], &Limits::default()).unwrap_err();

    assert_eq!(issue.code, "definition");
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

    let issue = execute(source, &[], &[], &limits).unwrap_err();

    assert_eq!(issue.code, "limit");
}
