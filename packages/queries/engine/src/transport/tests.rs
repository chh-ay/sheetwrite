//! The unpivot boundary must retain the mixed error tag and transfer buffers once.

use super::QueryColumn;
use crate::{
    execute, parse_source, ColumnSpec, ColumnType, Limits, OutputColumn, SourceSpec, Step,
};

#[test]
fn unpivot_error_has_a_distinct_mixed_transport_tag() {
    let spec = SourceSpec::Json {
        columns: vec![ColumnSpec {
            id: String::from("value"),
            name: String::from("Value"),
            column_type: ColumnType::Number,
        }],
        path: Vec::new(),
    };
    let source = parse_source(
        br#"[{"Value":"invalid"},{"Value":null}]"#,
        &spec,
        &Limits::default(),
    )
    .unwrap();
    let plan = [Step::Unpivot {
        columns: vec![String::from("value")],
        attribute: OutputColumn {
            id: String::from("name"),
            name: String::from("Name"),
        },
        value: OutputColumn {
            id: String::from("result"),
            name: String::from("Result"),
        },
    }];

    let output = execute(source, &plan, &[], &Limits::default()).unwrap();
    let column = output.columns.into_iter().nth(1).unwrap();
    let mut transport = QueryColumn {
        buffers: column.into_buffers().unwrap(),
    };

    assert_eq!(transport.take_tags(), vec![6]);
    assert_eq!(transport.take_tags(), Vec::<u8>::new());
    assert_eq!(transport.take_error_rows(), vec![0]);
    assert_eq!(transport.take_error_codes(), vec![0]);
    assert_eq!(transport.take_metadata(), b"resultResultconversion");
}
