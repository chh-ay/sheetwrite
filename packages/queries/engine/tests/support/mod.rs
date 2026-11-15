//! Source fixtures share the public parsing interface, not a second execution model.
//!
//! Plan builders construct the same data the wire decoder produces, so each test reads as
//! its step list. Each integration test uses a subset of the builders.

#![allow(
    dead_code,
    reason = "each integration test uses a subset of the builders"
)]

use sheetwrite_queries::{
    parse_source, Aggregate, AggregateOp, Batch, ColumnSpec, ColumnType, CompareOp, ErrorPolicy,
    JoinKind, Limits, Literal, OutputColumn, Predicate, SourceSpec, Step,
};

/// Stable ids remain separate from field names in every source fixture.
pub(crate) fn column(id: &str, name: &str, column_type: ColumnType) -> ColumnSpec {
    ColumnSpec {
        id: id.to_owned(),
        name: name.to_owned(),
        column_type,
    }
}

/// Input records always pass through the production schema converter.
#[allow(
    clippy::unwrap_used,
    reason = "a test fixture; a source that does not parse fails the test"
)]
pub(crate) fn json_batch(bytes: &[u8], columns: Vec<ColumnSpec>) -> Batch {
    let source = SourceSpec::Json {
        columns,
        path: Vec::new(),
    };

    parse_source(bytes, &source, &Limits::default()).unwrap()
}

fn owned(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

fn owned_pairs(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
    pairs
        .iter()
        .map(|(left, right)| ((*left).to_owned(), (*right).to_owned()))
        .collect()
}

pub(crate) fn compare(column: &str, op: CompareOp, value: Literal) -> Predicate {
    Predicate::Compare {
        column: column.to_owned(),
        op,
        value,
    }
}

pub(crate) fn contains(column: &str, text: &str) -> Predicate {
    Predicate::Contains {
        column: column.to_owned(),
        text: text.to_owned(),
    }
}

pub(crate) const fn filter(predicate: Predicate) -> Step {
    Step::Filter { predicate }
}

pub(crate) fn select(columns: &[&str]) -> Step {
    Step::Select {
        columns: owned(columns),
    }
}

pub(crate) fn rename(columns: &[(&str, &str)]) -> Step {
    Step::Rename {
        columns: owned_pairs(columns),
    }
}

pub(crate) fn change_type(column: &str, column_type: ColumnType, on_error: ErrorPolicy) -> Step {
    Step::ChangeType {
        column: column.to_owned(),
        column_type,
        on_error,
    }
}

pub(crate) fn join(input: &str, keys: &[(&str, &str)], join: JoinKind) -> Step {
    Step::Join {
        input: input.to_owned(),
        keys: owned_pairs(keys),
        join,
    }
}

pub(crate) fn aggregate(id: &str, name: &str, op: AggregateOp, column: Option<&str>) -> Aggregate {
    Aggregate {
        id: id.to_owned(),
        name: name.to_owned(),
        op,
        column: column.map(str::to_owned),
    }
}

pub(crate) fn group(keys: &[&str], aggregates: Vec<Aggregate>) -> Step {
    Step::Group {
        keys: owned(keys),
        aggregates,
    }
}

pub(crate) fn unpivot(columns: &[&str], attribute: (&str, &str), value: (&str, &str)) -> Step {
    Step::Unpivot {
        columns: owned(columns),
        attribute: OutputColumn {
            id: attribute.0.to_owned(),
            name: attribute.1.to_owned(),
        },
        value: OutputColumn {
            id: value.0.to_owned(),
            name: value.1.to_owned(),
        },
    }
}
