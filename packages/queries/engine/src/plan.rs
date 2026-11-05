//! Serializable plans contain only data; executable callbacks and credentials are excluded.

use serde::Deserialize;

/// Default row bound applies to source admission and every expanding operation.
pub const DEFAULT_MAX_ROWS: usize = 1_000_000;

/// The cell bound prevents wide projections from bypassing the row bound.
pub const DEFAULT_MAX_CELLS: usize = 16_000_000;

/// Sources are rejected before parsing when their byte payload exceeds this bound.
pub const DEFAULT_MAX_SOURCE_BYTES: usize = 64 * 1024 * 1024;

/// A global payload bound prevents text-heavy Cartesian outputs from exhausting memory.
pub const DEFAULT_MAX_OUTPUT_BYTES: usize = 256 * 1024 * 1024;

/// A finite step count bounds plan preparation work before execution starts.
pub const DEFAULT_MAX_STEPS: usize = 256;

/// Predicate nesting is bounded independently of the number of steps.
pub const MAX_PREDICATE_DEPTH: usize = 64;

/// Refresh-local resource ceilings; exceeding one returns a diagnostic, not partial output.
#[derive(Clone, Debug)]
pub struct Limits {
    pub max_rows: usize,
    pub max_cells: usize,
    pub max_source_bytes: usize,
    pub max_output_bytes: usize,
    pub max_steps: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_rows: DEFAULT_MAX_ROWS,
            max_cells: DEFAULT_MAX_CELLS,
            max_source_bytes: DEFAULT_MAX_SOURCE_BYTES,
            max_output_bytes: DEFAULT_MAX_OUTPUT_BYTES,
            max_steps: DEFAULT_MAX_STEPS,
        }
    }
}

impl Limits {
    /// Checked multiplication prevents an expanding plan from wrapping its cell count.
    pub fn shape(&self, rows: usize, columns: usize) -> Result<(), Diagnostic> {
        let cells = rows.checked_mul(columns).ok_or_else(Diagnostic::limit)?;
        if rows > self.max_rows || cells > self.max_cells || u32::try_from(rows).is_err() {
            return Err(Diagnostic::limit());
        }

        Ok(())
    }
}

/// Stable machine-readable failure context; it never contains source values or secrets.
#[derive(Clone, Debug, PartialEq)]
pub struct Diagnostic {
    pub code: String,
    pub step: Option<usize>,
    pub column: Option<String>,
    pub row: Option<usize>,
}

impl Diagnostic {
    /// Creates a context-free code that the responsible step can enrich.
    pub fn new(code: &str) -> Self {
        Self {
            code: code.to_owned(),
            step: None,
            column: None,
            row: None,
        }
    }

    /// Resource failures share one code so callers do not depend on allocator wording.
    pub fn limit() -> Self {
        Self::new("limit")
    }

    /// Missing column failures retain stable identity instead of a display name.
    pub fn column(id: &str) -> Self {
        Self {
            column: Some(id.to_owned()),
            ..Self::new("column")
        }
    }
}

/// Physical payload type; mixed values use separate compact typed lanes.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ColumnType {
    Number,
    Logical,
    Text,
    Date,
    DateTime,
    Mixed,
}

/// Stable identity and display name are separate so rename cannot break later steps.
#[derive(Clone, Debug)]
pub struct ColumnSpec {
    pub id: String,
    pub name: String,
    pub column_type: ColumnType,
}

/// Parsing options and an explicit schema; no format or type sampling changes a refresh.
#[derive(Clone, Debug)]
pub enum SourceSpec {
    Json {
        columns: Vec<ColumnSpec>,
        path: Vec<String>,
    },
    Csv {
        columns: Vec<ColumnSpec>,
        delimiter: u8,
        headers: bool,
        empty_is_null: bool,
    },
}

/// Predicate literals are scalar data, never executable source expressions.
#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum Literal {
    Null,
    Logical(bool),
    Number(f64),
    Text(String),
}

/// Relational operators use M null semantics; equality keeps null equal to itself.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CompareOp {
    Eq,
    Neq,
    Lt,
    Lte,
    Gt,
    Gte,
}

/// Saved logical trees compile to checked column indexes before scanning rows.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Predicate {
    Compare {
        column: String,
        op: CompareOp,
        value: Literal,
    },
    IsNull {
        column: String,
    },
    Contains {
        column: String,
        text: String,
    },
    And {
        predicates: Vec<Predicate>,
    },
    Or {
        predicates: Vec<Predicate>,
    },
    Not {
        predicate: Box<Predicate>,
    },
}

/// Only new conversion failures use this policy; existing errors remain errors.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ErrorPolicy {
    Error,
    Null,
}

/// Semi/anti joins return only one side; outer joins fill absent cells with null.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JoinKind {
    Inner,
    Left,
    Right,
    Full,
    LeftSemi,
    RightSemi,
    LeftAnti,
    RightAnti,
}

/// Numeric folds ignore nulls; counts and extrema have explicit distinct behavior.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AggregateOp {
    CountRows,
    Count,
    Sum,
    Average,
    Min,
    Max,
}

/// A named aggregate refers to a stable input column except for row counts.
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Aggregate {
    pub id: String,
    pub name: String,
    pub op: AggregateOp,
    pub column: Option<String>,
}

/// Identity and display name for a column created by an expanding step.
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutputColumn {
    pub id: String,
    pub name: String,
}

/// Ordered transformations are plain data and can be saved without host callbacks.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Step {
    Filter {
        predicate: Predicate,
    },
    Select {
        columns: Vec<String>,
    },
    Rename {
        columns: Vec<(String, String)>,
    },
    ChangeType {
        column: String,
        #[serde(rename = "type")]
        column_type: ColumnType,
        #[serde(rename = "onError")]
        on_error: ErrorPolicy,
    },
    Join {
        input: String,
        keys: Vec<(String, String)>,
        join: JoinKind,
    },
    Group {
        keys: Vec<String>,
        aggregates: Vec<Aggregate>,
    },
    Unpivot {
        columns: Vec<String>,
        attribute: OutputColumn,
        value: OutputColumn,
    },
}

/// Execution order is list order; each error records its zero-based step index.
pub type Plan = Vec<Step>;
