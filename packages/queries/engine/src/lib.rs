//! An opt-in columnar query engine with no worksheet evaluator or network access.

#![deny(clippy::indexing_slicing)]
// The codec artifact builds without the engine bindings, so engine-only helpers are unused there.
#![cfg_attr(not(feature = "engine"), allow(dead_code))]
#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

mod budget;
mod buffers;
mod calendar;
mod column;
#[cfg(feature = "engine")]
mod column_input;
mod csv;
mod execute;
mod failure;
mod group;
mod join;
mod json;
mod keys;
mod m;
mod mixed;
mod plan;
mod plan_wire;
#[cfg(feature = "power-query")]
mod power_query;
mod predicate;
mod source;
mod source_json;
#[cfg(feature = "engine")]
mod transport;
mod unpivot;
mod wire;

pub use column::{Batch, Column, Value};
pub use execute::execute;
pub use m::{
    decode_queries, emit_section, import_section, MQuery, MSource, MSourceKind, Unsupported,
};
pub use plan::{
    Aggregate, AggregateOp, ColumnSpec, ColumnType, CompareOp, Diagnostic, ErrorPolicy, JoinKind,
    Limits, Literal, OutputColumn, Plan, Predicate, SourceSpec, Step,
};
pub use plan_wire::{decode_plan, PlanWire};
pub use source::parse_source;
