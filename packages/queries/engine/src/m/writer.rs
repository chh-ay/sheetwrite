//! Writes the lane layout that `plan_wire` reads, so imported queries cross back to the host.

use crate::buffers::saturating_u32;
use crate::plan::{AggregateOp, CompareOp, ErrorPolicy, JoinKind, Literal, Predicate, Step};
use crate::plan_wire::{
    LITERAL_FALSE, LITERAL_NULL, LITERAL_NUMBER, LITERAL_TEXT, LITERAL_TRUE, NO_COLUMN,
    PREDICATE_AND, PREDICATE_COMPARE, PREDICATE_CONTAINS, PREDICATE_IS_NULL, PREDICATE_NOT,
    PREDICATE_OR, STEP_CHANGE_TYPE, STEP_FILTER, STEP_GROUP, STEP_JOIN, STEP_RENAME, STEP_SELECT,
    STEP_UNPIVOT,
};
use crate::wire::encode_type;

/// Code, literal and string lanes; equal strings share one table entry.
#[derive(Debug, Default)]
pub(crate) struct PlanWriter {
    pub codes: Vec<u32>,
    pub numbers: Vec<f64>,
    pub text: Vec<u8>,
    pub offsets: Vec<u32>,
    strings: Vec<String>,
}

// Operator codes are one-based positions in the decoder's tables (`plan_wire.rs`).
const fn compare_code(op: CompareOp) -> u32 {
    match op {
        CompareOp::Eq => 1,
        CompareOp::Neq => 2,
        CompareOp::Lt => 3,
        CompareOp::Lte => 4,
        CompareOp::Gt => 5,
        CompareOp::Gte => 6,
    }
}

const fn policy_code(policy: ErrorPolicy) -> u32 {
    match policy {
        ErrorPolicy::Error => 1,
        ErrorPolicy::Null => 2,
    }
}

const fn join_code(kind: JoinKind) -> u32 {
    match kind {
        JoinKind::Inner => 1,
        JoinKind::Left => 2,
        JoinKind::Right => 3,
        JoinKind::Full => 4,
        JoinKind::LeftSemi => 5,
        JoinKind::RightSemi => 6,
        JoinKind::LeftAnti => 7,
        JoinKind::RightAnti => 8,
    }
}

const fn aggregate_code(op: AggregateOp) -> u32 {
    match op {
        AggregateOp::CountRows => 1,
        AggregateOp::Count => 2,
        AggregateOp::Sum => 3,
        AggregateOp::Average => 4,
        AggregateOp::Min => 5,
        AggregateOp::Max => 6,
    }
}

impl PlanWriter {
    pub(crate) fn code(&mut self, code: u32) {
        self.codes.push(code);
    }

    /// Counts never exceed the decoder's u32 lanes; larger values saturate and fail decoding.
    pub(crate) fn code_usize(&mut self, value: usize) {
        self.codes.push(saturating_u32(value));
    }

    pub(crate) fn string(&mut self, value: &str) {
        let index = if let Some(index) = self.strings.iter().position(|entry| entry == value) {
            index
        } else {
            if self.offsets.is_empty() {
                self.offsets.push(0);
            }

            self.text.extend_from_slice(value.as_bytes());
            self.offsets.push(saturating_u32(self.text.len()));
            self.strings.push(value.to_owned());
            self.strings.len() - 1
        };

        self.code_usize(index);
    }

    pub(crate) fn optional_string(&mut self, value: Option<&str>) {
        match value {
            Some(text) => self.string(text),
            None => self.code(NO_COLUMN),
        }
    }

    pub(crate) fn strings(&mut self, values: &[String]) {
        self.code_usize(values.len());
        for value in values {
            self.string(value);
        }
    }

    fn pairs(&mut self, values: &[(String, String)]) {
        self.code_usize(values.len());
        for (left, right) in values {
            self.string(left);
            self.string(right);
        }
    }

    fn literal(&mut self, literal: &Literal) {
        match literal {
            Literal::Null => self.code(LITERAL_NULL),
            Literal::Logical(false) => self.code(LITERAL_FALSE),
            Literal::Logical(true) => self.code(LITERAL_TRUE),
            Literal::Number(number) => {
                self.code(LITERAL_NUMBER);
                self.code_usize(self.numbers.len());
                self.numbers.push(*number);
            }
            Literal::Text(text) => {
                self.code(LITERAL_TEXT);
                self.string(text);
            }
        }
    }

    fn predicate(&mut self, predicate: &Predicate) {
        match predicate {
            Predicate::Compare { column, op, value } => {
                self.code(PREDICATE_COMPARE);
                self.string(column);
                self.code(compare_code(*op));
                self.literal(value);
            }
            Predicate::IsNull { column } => {
                self.code(PREDICATE_IS_NULL);
                self.string(column);
            }
            Predicate::Contains { column, text } => {
                self.code(PREDICATE_CONTAINS);
                self.string(column);
                self.string(text);
            }
            Predicate::And { predicates } | Predicate::Or { predicates } => {
                let code = if matches!(predicate, Predicate::And { .. }) {
                    PREDICATE_AND
                } else {
                    PREDICATE_OR
                };
                self.code(code);
                self.code_usize(predicates.len());
                for child in predicates {
                    self.predicate(child);
                }
            }
            Predicate::Not { predicate: inner } => {
                self.code(PREDICATE_NOT);
                self.predicate(inner);
            }
        }
    }

    fn step(&mut self, step: &Step) {
        match step {
            Step::Filter { predicate } => {
                self.code(STEP_FILTER);
                self.predicate(predicate);
            }
            Step::Select { columns } => {
                self.code(STEP_SELECT);
                self.strings(columns);
            }
            Step::Rename { columns } => {
                self.code(STEP_RENAME);
                self.pairs(columns);
            }
            Step::ChangeType {
                column,
                column_type,
                on_error,
            } => {
                self.code(STEP_CHANGE_TYPE);
                self.string(column);
                self.code(u32::from(encode_type(*column_type)));
                self.code(policy_code(*on_error));
            }
            Step::Join { input, keys, join } => {
                self.code(STEP_JOIN);
                self.string(input);
                self.code(join_code(*join));
                self.pairs(keys);
            }
            Step::Group { keys, aggregates } => {
                self.code(STEP_GROUP);
                self.strings(keys);
                self.code_usize(aggregates.len());
                for aggregate in aggregates {
                    self.string(&aggregate.id);
                    self.string(&aggregate.name);
                    self.code(aggregate_code(aggregate.op));
                    self.optional_string(aggregate.column.as_deref());
                }
            }
            Step::Unpivot {
                columns,
                attribute,
                value,
            } => {
                self.code(STEP_UNPIVOT);
                self.strings(columns);
                self.string(&attribute.id);
                self.string(&attribute.name);
                self.string(&value.id);
                self.string(&value.name);
            }
        }
    }

    pub(crate) fn steps(&mut self, steps: &[Step]) {
        self.code_usize(steps.len());
        for step in steps {
            self.step(step);
        }
    }

    /// An empty table still has the leading zero offset the decoder requires.
    pub(crate) fn finish(mut self) -> Self {
        if self.offsets.is_empty() {
            self.offsets.push(0);
        }

        self
    }
}
