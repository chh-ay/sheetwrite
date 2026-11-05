//! An opt-in columnar query engine with no worksheet evaluator or network access.

#![deny(clippy::indexing_slicing)]
#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

mod budget;
mod buffers;
mod column;
mod column_input;
mod execute;
mod group;
mod join;
mod json;
mod keys;
mod mixed;
mod plan;
mod predicate;
mod source;
mod source_json;
mod transport;
mod unpivot;
mod wire;

pub use column::{Batch, Column, Value};
pub use execute::{execute, parse_plan};
pub use plan::{
    Aggregate, AggregateOp, ColumnSpec, ColumnType, CompareOp, Diagnostic, ErrorPolicy, JoinKind,
    Limits, Literal, OutputColumn, Plan, Predicate, SourceSpec, Step,
};
pub use source::parse_source;
