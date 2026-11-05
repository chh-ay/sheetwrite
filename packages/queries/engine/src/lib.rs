//! An opt-in columnar query engine with no worksheet evaluator or network access.

#![deny(clippy::indexing_slicing)]
#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

mod budget;
mod buffers;
mod calendar;
mod column;
mod column_input;
mod csv;
mod execute;
mod group;
mod join;
mod json;
mod keys;
mod mixed;
mod plan;
mod plan_wire;
mod predicate;
mod source;
mod source_json;
mod transport;
mod unpivot;
mod wire;

pub use column::{Batch, Column, Value};
pub use execute::execute;
pub use plan::{
    Aggregate, AggregateOp, ColumnSpec, ColumnType, CompareOp, Diagnostic, ErrorPolicy, JoinKind,
    Limits, Literal, OutputColumn, Plan, Predicate, SourceSpec, Step,
};
pub use plan_wire::{decode_plan, PlanWire};
pub use source::parse_source;
