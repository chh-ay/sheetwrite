//! Saved plans cross the host seam as typed lanes: `u32` codes, `f64` literals and a string table.
//!
//! The first code is the step count. Each step is a step code and its operands, in the order
//! below. A string operand is an index into the string table; a number literal is an index into
//! the literal lane. Every count is checked against the remaining codes before allocation, and
//! every code must be consumed, so a truncated or padded plan is a definition failure.

use crate::buffers::row_index;
use crate::plan::{
    Aggregate, AggregateOp, CompareOp, Diagnostic, ErrorPolicy, JoinKind, Limits, Literal,
    OutputColumn, Plan, Predicate, Step, MAX_PREDICATE_DEPTH,
};
use crate::wire::{decode_strings, decode_type};

/// Code lanes above this length are rejected before decoding; saved plans are small.
const MAX_PLAN_CODES: usize = 256 * 1024;

/// Step codes. `filter`: predicate. `select`: count, ids. `rename`: count, id/name pairs.
/// `changeType`: id, type, policy. `join`: input, kind, count, left/right pairs. `group`: count,
/// ids, count, aggregates as id, name, op, column or `NO_COLUMN`. `unpivot`: count, ids,
/// attribute id/name, value id/name.
pub const STEP_FILTER: u32 = 1;
pub const STEP_SELECT: u32 = 2;
pub const STEP_RENAME: u32 = 3;
pub const STEP_CHANGE_TYPE: u32 = 4;
pub const STEP_JOIN: u32 = 5;
pub const STEP_GROUP: u32 = 6;
pub const STEP_UNPIVOT: u32 = 7;

/// Predicate codes. `compare`: column, op, literal. `isNull`: column. `contains`: column, text.
/// `and`/`or`: count, predicates. `not`: predicate.
pub const PREDICATE_COMPARE: u32 = 1;
pub const PREDICATE_IS_NULL: u32 = 2;
pub const PREDICATE_CONTAINS: u32 = 3;
pub const PREDICATE_AND: u32 = 4;
pub const PREDICATE_OR: u32 = 5;
pub const PREDICATE_NOT: u32 = 6;

/// Literal codes; `number` and `text` are followed by a lane or string-table index.
pub const LITERAL_NULL: u32 = 0;
pub const LITERAL_FALSE: u32 = 1;
pub const LITERAL_TRUE: u32 = 2;
pub const LITERAL_NUMBER: u32 = 3;
pub const LITERAL_TEXT: u32 = 4;

/// A row-count aggregate has no source column.
pub const NO_COLUMN: u32 = u32::MAX;

/// Operator codes are one-based positions in these tables; zero is never valid.
const COMPARE_OPS: [CompareOp; 6] = [
    CompareOp::Eq,
    CompareOp::Neq,
    CompareOp::Lt,
    CompareOp::Lte,
    CompareOp::Gt,
    CompareOp::Gte,
];
const ERROR_POLICIES: [ErrorPolicy; 2] = [ErrorPolicy::Error, ErrorPolicy::Null];
const JOIN_KINDS: [JoinKind; 8] = [
    JoinKind::Inner,
    JoinKind::Left,
    JoinKind::Right,
    JoinKind::Full,
    JoinKind::LeftSemi,
    JoinKind::RightSemi,
    JoinKind::LeftAnti,
    JoinKind::RightAnti,
];
const AGGREGATE_OPS: [AggregateOp; 6] = [
    AggregateOp::CountRows,
    AggregateOp::Count,
    AggregateOp::Sum,
    AggregateOp::Average,
    AggregateOp::Min,
    AggregateOp::Max,
];

/// Borrowed host lanes for one plan; the decoder copies only the strings it keeps.
pub struct PlanWire<'a> {
    pub codes: &'a [u32],
    pub numbers: &'a [f64],
    pub text: &'a [u8],
    pub offsets: &'a [u32],
}

/// Reads typed lanes in order; the Power Query codec reuses it for query lists.
pub(crate) struct Cursor<'a> {
    codes: &'a [u32],
    position: usize,
    numbers: &'a [f64],
    strings: Vec<String>,
}

pub(crate) fn definition() -> Diagnostic {
    Diagnostic::new("definition")
}

impl<'a> Cursor<'a> {
    pub(crate) fn new(wire: PlanWire<'a>) -> Result<Self, Diagnostic> {
        Ok(Self {
            codes: wire.codes,
            position: 0,
            numbers: wire.numbers,
            strings: decode_strings(wire.text, wire.offsets)?,
        })
    }

    /// Whether every code was read; a padded lane is a definition failure.
    pub(crate) fn finished(&self) -> bool {
        self.position == self.codes.len()
    }

    pub(crate) fn code(&mut self) -> Result<u32, Diagnostic> {
        let code = *self.codes.get(self.position).ok_or_else(definition)?;
        self.position += 1;

        Ok(code)
    }

    /// Each counted item uses at least one code, so a larger count cannot be valid.
    pub(crate) fn count(&mut self) -> Result<usize, Diagnostic> {
        let count = row_index(self.code()?)?;
        if count > self.codes.len() - self.position {
            return Err(definition());
        }

        Ok(count)
    }

    pub(crate) fn string(&mut self) -> Result<String, Diagnostic> {
        let index = row_index(self.code()?)?;

        self.strings.get(index).cloned().ok_or_else(definition)
    }

    pub(crate) fn strings(&mut self) -> Result<Vec<String>, Diagnostic> {
        let count = self.count()?;

        (0..count).map(|_| self.string()).collect()
    }

    fn pairs(&mut self) -> Result<Vec<(String, String)>, Diagnostic> {
        let count = self.count()?;

        (0..count)
            .map(|_| Ok((self.string()?, self.string()?)))
            .collect()
    }

    fn output(&mut self) -> Result<OutputColumn, Diagnostic> {
        Ok(OutputColumn {
            id: self.string()?,
            name: self.string()?,
        })
    }

    fn literal(&mut self) -> Result<Literal, Diagnostic> {
        Ok(match self.code()? {
            LITERAL_NULL => Literal::Null,
            LITERAL_FALSE => Literal::Logical(false),
            LITERAL_TRUE => Literal::Logical(true),
            LITERAL_NUMBER => {
                let number = *self
                    .numbers
                    .get(row_index(self.code()?)?)
                    .ok_or_else(definition)?;

                // Number lanes store finite values only.
                if !number.is_finite() {
                    return Err(definition());
                }

                Literal::Number(number)
            }
            LITERAL_TEXT => Literal::Text(self.string()?),
            _ => return Err(definition()),
        })
    }

    /// Nesting is bounded here so a hostile plan cannot exhaust the native stack.
    fn predicate(&mut self, depth: usize) -> Result<Predicate, Diagnostic> {
        if depth >= MAX_PREDICATE_DEPTH {
            return Err(Diagnostic::limit());
        }

        Ok(match self.code()? {
            PREDICATE_COMPARE => Predicate::Compare {
                column: self.string()?,
                op: compare_op(self.code()?)?,
                value: self.literal()?,
            },
            PREDICATE_IS_NULL => Predicate::IsNull {
                column: self.string()?,
            },
            PREDICATE_CONTAINS => Predicate::Contains {
                column: self.string()?,
                text: self.string()?,
            },
            code @ (PREDICATE_AND | PREDICATE_OR) => {
                let count = self.count()?;
                let predicates = (0..count)
                    .map(|_| self.predicate(depth + 1))
                    .collect::<Result<_, _>>()?;

                if code == PREDICATE_AND {
                    Predicate::And { predicates }
                } else {
                    Predicate::Or { predicates }
                }
            }
            PREDICATE_NOT => Predicate::Not {
                predicate: Box::new(self.predicate(depth + 1)?),
            },
            _ => return Err(definition()),
        })
    }

    fn aggregate(&mut self) -> Result<Aggregate, Diagnostic> {
        let id = self.string()?;
        let name = self.string()?;
        let op = aggregate_op(self.code()?)?;
        let column = match self.code()? {
            NO_COLUMN => None,
            index => Some(
                self.strings
                    .get(row_index(index)?)
                    .cloned()
                    .ok_or_else(definition)?,
            ),
        };

        Ok(Aggregate {
            id,
            name,
            op,
            column,
        })
    }

    pub(crate) fn step(&mut self) -> Result<Step, Diagnostic> {
        Ok(match self.code()? {
            STEP_FILTER => Step::Filter {
                predicate: self.predicate(0)?,
            },
            STEP_SELECT => Step::Select {
                columns: self.strings()?,
            },
            STEP_RENAME => Step::Rename {
                columns: self.pairs()?,
            },
            STEP_CHANGE_TYPE => Step::ChangeType {
                column: self.string()?,
                column_type: decode_type(u8::try_from(self.code()?).map_err(|_| definition())?)
                    .map_err(|_| definition())?,
                on_error: error_policy(self.code()?)?,
            },
            STEP_JOIN => Step::Join {
                input: self.string()?,
                join: join_kind(self.code()?)?,
                keys: self.pairs()?,
            },
            STEP_GROUP => {
                let keys = self.strings()?;
                let count = self.count()?;
                let aggregates = (0..count)
                    .map(|_| self.aggregate())
                    .collect::<Result<_, _>>()?;

                Step::Group { keys, aggregates }
            }
            STEP_UNPIVOT => Step::Unpivot {
                columns: self.strings()?,
                attribute: self.output()?,
                value: self.output()?,
            },
            _ => return Err(definition()),
        })
    }
}

fn one_based<T: Copy>(table: &[T], code: u32) -> Result<T, Diagnostic> {
    let index = row_index(code)?.checked_sub(1).ok_or_else(definition)?;

    table.get(index).copied().ok_or_else(definition)
}

fn compare_op(code: u32) -> Result<CompareOp, Diagnostic> {
    one_based(&COMPARE_OPS, code)
}

fn error_policy(code: u32) -> Result<ErrorPolicy, Diagnostic> {
    one_based(&ERROR_POLICIES, code)
}

fn join_kind(code: u32) -> Result<JoinKind, Diagnostic> {
    one_based(&JOIN_KINDS, code)
}

fn aggregate_op(code: u32) -> Result<AggregateOp, Diagnostic> {
    one_based(&AGGREGATE_OPS, code)
}

impl Cursor<'_> {
    /// A step count, then that many steps; the count respects the execution step limit.
    pub(crate) fn steps(&mut self, limits: &Limits) -> Result<Plan, Diagnostic> {
        let count = self.count()?;
        if count > limits.max_steps {
            return Err(Diagnostic::limit());
        }

        (0..count).map(|_| self.step()).collect()
    }
}

impl Cursor<'_> {
    /// The string-table entry at an index that was already read from the code lane.
    pub(crate) fn string_at(&self, index: u32) -> Result<String, Diagnostic> {
        self.strings
            .get(row_index(index)?)
            .cloned()
            .ok_or_else(definition)
    }
}

/// Decodes a bounded saved step list; schema-dependent validation happens in execution.
pub fn decode_plan(wire: PlanWire<'_>, limits: &Limits) -> Result<Plan, Diagnostic> {
    if wire.codes.len() > MAX_PLAN_CODES || wire.numbers.len() > MAX_PLAN_CODES {
        return Err(Diagnostic::limit());
    }

    let mut cursor = Cursor::new(wire)?;
    let plan = cursor.steps(limits)?;

    if !cursor.finished() {
        return Err(definition());
    }

    Ok(plan)
}

#[cfg(test)]
mod tests;
