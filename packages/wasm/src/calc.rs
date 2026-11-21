//! Formula parser and reference rewriting for the formula engine.
//!
//! Grammar (A1 references with optional sheet qualifiers):
//!   expr       := concat (comparison concat)?
//!   concat     := additive ('&' additive)*
//!   additive   := term (('+' | '-') term)*
//!   term       := power (('*' | '/') power)*
//!   power      := postfix ('^' postfix)*
//!   postfix    := unary ('%')*
//!   unary      := ('+' | '-') unary | primary
//!   primary    := number | string | array | '(' expr ')' | func '(' args ')' | range | cell | name | `structured_ref`
//!   range      := cell ':' cell | letters ':' letters | digits ':' digits
//!   array      := '{' row (';' row)* '}'
//!   row        := constant (',' constant)*
//!   constant   := ('+' | '-')? number | string | TRUE | FALSE | error
//!   number     := digits ('.' digits?)? (('E' | 'e') ('+' | '-')? digits)?
//!
//! Every row of an array constant must have the same number of columns.
//!
//! Cell references accept optional absolute markers (`$A$1`, `A$1`, `$A1`).
//! A reference is a cell only inside the sheet's limits (`XFD1048576`); a
//! token past them, such as `XYZ1`, is a name. `A:C` and `1:3` are whole
//! columns and rows. They are stored as ranges that span the other axis, and
//! such a range is always written back in the short form, as Excel does.
//! Sheet-qualified references keep the sheet name until `CellStore` resolves it
//! to a sheet handle at formula-ingest time.
//!
//! The evaluator lives on `CellStore` (it needs cell access); this module is the
//! pure parse layer plus reference shifting for row/column insert/delete rewriting.

use crate::float_text::NumberText;
use crate::memory::MemoryOwnerStats;
use crate::tables::{TableSlots, WrittenTableRef};
use crate::types::{FormulaError, Value, FORMULA_RECURSION_LIMIT};
use std::{borrow::Cow, cmp::Ordering, rc::Rc};

/// Bounds syntax recursion below the evaluator limit because each parenthesized
/// expression traverses the complete precedence stack.
const PARSE_RECURSION_LIMIT: usize = 64;

/// The rows of a sheet: the last row is `1048576`.
pub(crate) const SHEET_ROWS: u32 = 1_048_576;
/// The columns of a sheet: the last column is `XFD`.
pub(crate) const SHEET_COLS: u32 = 16_384;

mod address;
mod ast;
mod binding;
mod functions;
mod lexer;
mod parser;
mod relative;
mod rename;
mod structural;
#[cfg(test)]
mod tests;
mod write;

pub(crate) use address::*;
pub(crate) use ast::*;
pub(crate) use binding::*;
pub(crate) use functions::*;
pub(crate) use lexer::*;
pub(crate) use parser::*;
pub(crate) use relative::*;
pub(crate) use rename::*;
pub(crate) use structural::*;
pub(crate) use write::*;
