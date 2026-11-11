//! Plans contain only data; executable callbacks and credentials are excluded.

/// Default row bound applies to source admission and every expanding operation.
pub(crate) const DEFAULT_MAX_ROWS: usize = 1_000_000;

/// The cell bound prevents wide projections from bypassing the row bound.
pub(crate) const DEFAULT_MAX_CELLS: usize = 16_000_000;

/// Sources are rejected before parsing when their byte payload exceeds this bound.
pub(crate) const DEFAULT_MAX_SOURCE_BYTES: usize = 64 * 1024 * 1024;

/// A global payload bound prevents text-heavy Cartesian outputs from exhausting memory.
pub(crate) const DEFAULT_MAX_OUTPUT_BYTES: usize = 256 * 1024 * 1024;

/// A finite step count bounds plan preparation work before execution starts.
pub(crate) const DEFAULT_MAX_STEPS: usize = 256;

/// Predicate nesting is bounded independently of the number of steps.
pub(crate) const MAX_PREDICATE_DEPTH: usize = 64;

/// Ordered string pairs, such as a stable id and its new display name.
pub(crate) type StringPairs = Vec<(String, String)>;

/// Refresh-local resource ceilings; exceeding one returns a diagnostic, not partial output.
#[derive(Clone, Debug)]
pub struct Limits {
    /// Most rows any source or step output may have.
    pub max_rows: usize,
    /// Most cells (rows times columns) any source or step output may have.
    pub max_cells: usize,
    /// Most bytes a source may have before it is parsed.
    pub max_source_bytes: usize,
    /// Most payload bytes one output may build, counted across all its columns.
    pub max_output_bytes: usize,
    /// Most steps a plan may have.
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
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Diagnostic {
    /// Stable failure code, such as `limit`, `type` or `column`.
    pub code: String,
    /// Zero-based index of the step that failed, when execution had reached a step.
    pub step: Option<usize>,
    /// Stable id of the column the failure belongs to, if any.
    pub column: Option<String>,
    /// Zero-based row the failure belongs to, if any.
    pub row: Option<usize>,
}

impl Diagnostic {
    /// Creates a context-free code that the responsible step can enrich.
    #[must_use]
    pub fn new(code: &str) -> Self {
        Self {
            code: code.to_owned(),
            step: None,
            column: None,
            row: None,
        }
    }

    /// Resource failures share one code so callers do not depend on allocator wording.
    #[must_use]
    pub fn limit() -> Self {
        Self::new("limit")
    }

    /// Missing column failures retain stable identity instead of a display name.
    #[must_use]
    pub fn column(id: &str) -> Self {
        Self {
            column: Some(id.to_owned()),
            ..Self::new("column")
        }
    }
}

/// Physical payload type; mixed values use separate compact typed lanes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColumnType {
    /// Finite `f64` values.
    Number,
    /// True or false values, packed one bit per row.
    Logical,
    /// UTF-8 strings.
    Text,
    /// Whole days since 1970-01-01.
    Date,
    /// Microseconds since 1970-01-01T00:00:00, without a time zone.
    DateTime,
    /// Any of the other types, chosen per row.
    Mixed,
}

/// Stable identity and display name are separate so rename cannot break later steps.
#[derive(Clone, Debug)]
pub struct ColumnSpec {
    /// Stable identity that plans refer to; renaming never changes it.
    pub id: String,
    /// Display name, matched against source headers and shown in output tables.
    pub name: String,
    /// Declared payload type; source values are converted to it.
    pub column_type: ColumnType,
}

/// Parsing options and an explicit schema; no format or type sampling changes a refresh.
#[derive(Clone, Debug)]
pub enum SourceSpec {
    /// A JSON document whose rows are the objects of one array.
    Json {
        /// Declared columns, matched to object members by name.
        columns: Vec<ColumnSpec>,
        /// Member names leading from the root to the row array; empty means the root.
        path: Vec<String>,
    },
    /// Comma-separated or other delimited text.
    Csv {
        /// Declared columns, matched to headers by name or else taken in order.
        columns: Vec<ColumnSpec>,
        /// Field separator; an ASCII byte other than a quote, a line break or zero.
        delimiter: u8,
        /// Whether the first record names the columns.
        headers: bool,
        /// Whether an empty field reads as null rather than empty text.
        empty_is_null: bool,
    },
}

/// Predicate literals are scalar data, never executable source expressions.
#[derive(Clone, Debug)]
pub enum Literal {
    /// The null value.
    Null,
    /// A true or false value.
    Logical(bool),
    /// A finite number.
    Number(f64),
    /// A string.
    Text(String),
}

/// Relational operators use M null semantics; equality keeps null equal to itself.
#[derive(Clone, Copy, Debug)]
pub enum CompareOp {
    /// Equal to.
    Eq,
    /// Not equal to.
    Neq,
    /// Less than.
    Lt,
    /// Less than or equal to.
    Lte,
    /// Greater than.
    Gt,
    /// Greater than or equal to.
    Gte,
}

/// Saved logical trees compile to checked column indexes before scanning rows.
#[derive(Clone, Debug)]
pub enum Predicate {
    /// Compares a column with a literal.
    Compare {
        /// Stable id of the column on the left.
        column: String,
        /// The comparison.
        op: CompareOp,
        /// The literal on the right.
        value: Literal,
    },
    /// True when the column is null.
    IsNull {
        /// Stable id of the column to test.
        column: String,
    },
    /// True when a text column contains the given text.
    Contains {
        /// Stable id of a text column.
        column: String,
        /// The text to look for.
        text: String,
    },
    /// True when every predicate is true.
    And {
        /// The predicates to combine.
        predicates: Vec<Self>,
    },
    /// True when any predicate is true.
    Or {
        /// The predicates to combine.
        predicates: Vec<Self>,
    },
    /// Negates a predicate; null stays null.
    Not {
        /// The predicate to negate.
        predicate: Box<Self>,
    },
}

/// Only new conversion failures use this policy; existing errors remain errors.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErrorPolicy {
    /// A value that cannot be converted becomes a `conversion` error.
    Error,
    /// A value that cannot be converted becomes null.
    Null,
}

/// Semi/anti joins return only one side; outer joins fill absent cells with null.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JoinKind {
    /// Rows whose keys match on both sides.
    Inner,
    /// Every left row, with matching right rows or nulls.
    Left,
    /// Every right row, with matching left rows or nulls.
    Right,
    /// Every row of both sides, matched where the keys match.
    Full,
    /// Left rows that have a match, with left columns only.
    LeftSemi,
    /// Right rows that have a match, with right columns only.
    RightSemi,
    /// Left rows that have no match.
    LeftAnti,
    /// Right rows that have no match.
    RightAnti,
}

/// Numeric folds ignore nulls; counts and extrema have explicit distinct behavior.
#[derive(Clone, Copy, Debug)]
pub enum AggregateOp {
    /// Number of rows in the group, nulls included.
    CountRows,
    /// Number of non-null values in the column.
    Count,
    /// Sum of the numbers; null when there are none.
    Sum,
    /// Mean of the numbers; null when there are none.
    Average,
    /// Smallest value.
    Min,
    /// Largest value.
    Max,
}

/// A named aggregate refers to a stable input column except for row counts.
#[derive(Clone, Debug)]
pub struct Aggregate {
    /// Stable id of the output column.
    pub id: String,
    /// Display name of the output column.
    pub name: String,
    /// The fold to apply to each group.
    pub op: AggregateOp,
    /// Stable id of the input column; `None` only for `CountRows`.
    pub column: Option<String>,
}

/// Identity and display name for a column created by an expanding step.
#[derive(Clone, Debug)]
pub struct OutputColumn {
    /// Stable id of the new column.
    pub id: String,
    /// Display name of the new column.
    pub name: String,
}

/// Ordered transformations are plain data and can be saved without host callbacks.
#[derive(Clone, Debug)]
pub enum Step {
    /// Keeps the rows for which the predicate is true.
    Filter {
        /// The row test.
        predicate: Predicate,
    },
    /// Keeps the listed columns, in the listed order.
    Select {
        /// Stable ids of the columns to keep.
        columns: Vec<String>,
    },
    /// Gives columns new display names.
    Rename {
        /// Pairs of stable id and new display name.
        columns: Vec<(String, String)>,
    },
    /// Converts a column to another type.
    ChangeType {
        /// Stable id of the column to convert.
        column: String,
        /// The new type.
        column_type: ColumnType,
        /// What a value that cannot be converted becomes.
        on_error: ErrorPolicy,
    },
    /// Joins the current table with a named input on equal keys.
    Join {
        /// Name of the input batch on the right.
        input: String,
        /// Pairs of left and right key column ids.
        keys: Vec<(String, String)>,
        /// Which rows and columns the join returns.
        join: JoinKind,
    },
    /// Groups rows with equal keys and folds each group into one row.
    Group {
        /// Stable ids of the key columns.
        keys: Vec<String>,
        /// The output columns computed for each group.
        aggregates: Vec<Aggregate>,
    },
    /// Turns the listed columns into attribute and value rows, skipping nulls.
    Unpivot {
        /// Stable ids of the columns to turn into rows.
        columns: Vec<String>,
        /// The new text column that holds each source column's name.
        attribute: OutputColumn,
        /// The new column that holds each cell.
        value: OutputColumn,
    },
}

/// Execution order is list order; each error records its zero-based step index.
pub type Plan = Vec<Step>;
