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
//!   primary    := number | string | array | '(' expr ')' | func '(' args ')' | range | cell | name | structured_ref
//!   range      := cell ':' cell
//!   array      := '{' row (';' row)* '}'
//!   row        := constant (',' constant)*
//!   constant   := ('+' | '-')? number | string | TRUE | FALSE | error
//!
//! Every row of an array constant must have the same number of columns.
//!
//! Cell references accept optional absolute markers (`$A$1`, `A$1`, `$A1`).
//! Sheet-qualified references keep the sheet name until `CellStore` resolves it
//! to a sheet handle at formula-ingest time.
//!
//! The evaluator lives on `CellStore` (it needs cell access); this module is the
//! pure parse layer plus reference shifting for row/column insert/delete rewriting.

use crate::memory::MemoryOwnerStats;
use crate::types::{FormulaError, Value};
use std::{borrow::Cow, cmp::Ordering};

/// Bounds syntax recursion below the evaluator limit because each parenthesized
/// expression traverses the complete precedence stack.
const PARSE_RECURSION_LIMIT: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Op {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
    Concat,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Func {
    Sum,
    Avg,
    Min,
    Max,
    Count,
    If,
    Abs,
    Round,
    Sqrt,
    Mod,
    Pow,
    And,
    Or,
    Not,
    Floor,
    Ceiling,
    Int,
    Trunc,
    Sign,
    Pi,
    IfError,
    IfNa,
    Ifs,
    Switch,
    Xor,
    True,
    False,
    IsBlank,
    IsNumber,
    IsText,
    IsLogical,
    IsError,
    IsErr,
    IsNa,
    Type,
    N,
    T,
    CountA,
    Len,
    Left,
    Right,
    Mid,
    Concat,
    Concatenate,
    Upper,
    Lower,
    Trim,
    Text,
    Exact,
    Date,
    DateValue,
    Day,
    Month,
    Year,
    Today,
    Now,
    CountIf,
    CountIfs,
    SumIf,
    SumIfs,
    AverageIf,
    AverageIfs,
    Index,
    Match,
    VLookup,
    HLookup,
    XLookup,
    Na,
    Filter,
    Sort,
    Unique,
    Let,
    Product,
    SumProduct,
    Power,
    Exp,
    Ln,
    Log,
    Log10,
    RoundUp,
    RoundDown,
    MRound,
    Even,
    Odd,
    Quotient,
    Gcd,
    Lcm,
    Subtotal,
    TextJoin,
    Substitute,
    Replace,
    Find,
    Search,
    Value,
    Clean,
    Rept,
    Char,
    Code,
    UniChar,
    Unicode,
    Proper,
    NumberValue,
    Time,
    TimeValue,
    Hour,
    Minute,
    Second,
    Days,
    EDate,
    EOMonth,
    Weekday,
    WeekNum,
    Workday,
    NetworkDays,
    YearFrac,
    Days360,
    Median,
    ModeSngl,
    Large,
    Small,
    RankEq,
    PercentileInc,
    QuartileInc,
    StdevS,
    StdevP,
    VarS,
    VarP,
    GeoMean,
    Correl,
    CovarianceS,
    CovarianceP,
    CountBlank,
    MaxIfs,
    MinIfs,
    XMatch,
    Choose,
    Row,
    Rows,
    Column,
    Columns,
    Address,
    Transpose,
    Sequence,
    Take,
    Drop,
    ChooseCols,
    ChooseRows,
    Pv,
    Fv,
    Pmt,
    Npv,
    Irr,
    Rate,
    Ipmt,
    Ppmt,
    Rand,
    RandBetween,
    FormulaText,
    IsFormula,
    Hyperlink,
    Cell,
    Offset,
    Indirect,
    Areas,
    /// `A1#`: the current spill of the anchor cell. Only `#` after a cell
    /// reference makes it; the name is not in the function table.
    AnchorArray,
    /// `(A1:B2,D1)`: the union of the references inside parentheses that do
    /// not belong to a call. Only that comma makes it; the name is not in the
    /// function table.
    Union,
    /// `A1:C3 B2:D4`: the cells that every reference covers. Only a space
    /// between two references makes it; the name is not in the function table.
    Intersect,
    #[cfg(feature = "analysis")]
    Analysis(u16),
}

const fn ascii_upper(byte: u8) -> u8 {
    if byte >= b'a' && byte <= b'z' {
        byte - (b'a' - b'A')
    } else {
        byte
    }
}

fn registered_name_cmp(registered: &str, input: &str) -> Ordering {
    let length_order = registered.len().cmp(&input.len());

    if length_order != Ordering::Equal {
        return length_order;
    }

    for (&expected, &actual) in registered.as_bytes().iter().zip(input.as_bytes()) {
        let byte_order = expected.cmp(&ascii_upper(actual));

        if byte_order != Ordering::Equal {
            return byte_order;
        }
    }

    Ordering::Equal
}

macro_rules! define_function_registry {
    (
        canonical { $($variant:ident => $canonical:literal;)+ }
        aliases { $($alias:literal => $alias_variant:ident;)* }
    ) => {
        const FUNCTION_NAMES: &[(&str, Func)] = &[
            $(($canonical, Func::$variant),)+
        ];
        const FUNCTION_ALIASES: &[(&str, Func)] = &[
            $(($alias, Func::$alias_variant),)*
        ];

        #[inline(never)]
        fn lookup_func(name: &str) -> Option<Func> {
            if let Ok(index) = FUNCTION_NAMES
                .binary_search_by(|(registered, _)| registered_name_cmp(registered, name))
            {
                return Some(FUNCTION_NAMES[index].1);
            }

            #[cfg(feature = "analysis")]
            if let Some(id) = crate::eval::analysis::lookup(name) {
                return Some(Func::Analysis(id));
            }

            FUNCTION_ALIASES
                .binary_search_by(|(registered, _)| registered_name_cmp(registered, name))
                .ok()
                .map(|index| FUNCTION_ALIASES[index].1)
        }

        fn func_name(func: Func) -> &'static str {
            match func {
                $(Func::$variant => $canonical,)+
                Func::AnchorArray => "ANCHORARRAY",
                Func::Union => "UNION",
                Func::Intersect => "INTERSECT",
                #[cfg(feature = "analysis")]
                Func::Analysis(id) => crate::eval::analysis::name(id),
            }
        }
    };
}

#[cfg(feature = "analysis")]
pub(crate) fn function_names() -> Vec<String> {
    let mut names: Vec<String> = FUNCTION_NAMES
        .iter()
        .chain(FUNCTION_ALIASES.iter())
        .map(|(name, _)| (*name).to_owned())
        .chain(crate::eval::analysis::names().map(str::to_owned))
        .collect();

    names.sort_unstable();
    names.dedup();

    names
}

define_function_registry! {
    canonical {
        N => "N";
        T => "T";
        Fv => "FV";
        If => "IF";
        Ln => "LN";
        Na => "NA";
        Or => "OR";
        Pi => "PI";
        Pv => "PV";
        Abs => "ABS";
        And => "AND";
        Avg => "AVG";
        Day => "DAY";
        Exp => "EXP";
        Gcd => "GCD";
        Ifs => "IFS";
        Int => "INT";
        Irr => "IRR";
        Lcm => "LCM";
        Len => "LEN";
        Let => "LET";
        Log => "LOG";
        Max => "MAX";
        Mid => "MID";
        Min => "MIN";
        Mod => "MOD";
        Not => "NOT";
        Now => "NOW";
        Npv => "NPV";
        Odd => "ODD";
        Pmt => "PMT";
        Pow => "POW";
        Row => "ROW";
        Sum => "SUM";
        Xor => "XOR";
        Cell => "CELL";
        Char => "CHAR";
        Code => "CODE";
        Date => "DATE";
        Days => "DAYS";
        Drop => "DROP";
        Even => "EVEN";
        Find => "FIND";
        Hour => "HOUR";
        IfNa => "IFNA";
        Ipmt => "IPMT";
        IsNa => "ISNA";
        Left => "LEFT";
        Ppmt => "PPMT";
        Rand => "RAND";
        Rate => "RATE";
        Rept => "REPT";
        Rows => "ROWS";
        Sign => "SIGN";
        Sort => "SORT";
        Sqrt => "SQRT";
        Take => "TAKE";
        Text => "TEXT";
        Time => "TIME";
        Trim => "TRIM";
        True => "TRUE";
        Type => "TYPE";
        Year => "YEAR";
        Areas => "AREAS";
        Clean => "CLEAN";
        Count => "COUNT";
        EDate => "EDATE";
        Exact => "EXACT";
        False => "FALSE";
        Floor => "FLOOR";
        Index => "INDEX";
        IsErr => "ISERR";
        Large => "LARGE";
        Log10 => "LOG10";
        Lower => "LOWER";
        Match => "MATCH";
        Month => "MONTH";
        Power => "POWER";
        Right => "RIGHT";
        Round => "ROUND";
        Small => "SMALL";
        SumIf => "SUMIF";
        Today => "TODAY";
        Trunc => "TRUNC";
        Upper => "UPPER";
        Value => "VALUE";
        VarP => "VAR.P";
        VarS => "VAR.S";
        Choose => "CHOOSE";
        Column => "COLUMN";
        Concat => "CONCAT";
        Correl => "CORREL";
        CountA => "COUNTA";
        Filter => "FILTER";
        IsText => "ISTEXT";
        MaxIfs => "MAXIFS";
        Median => "MEDIAN";
        MinIfs => "MINIFS";
        Minute => "MINUTE";
        MRound => "MROUND";
        Offset => "OFFSET";
        Proper => "PROPER";
        Search => "SEARCH";
        Second => "SECOND";
        SumIfs => "SUMIFS";
        Switch => "SWITCH";
        Unique => "UNIQUE";
        XMatch => "XMATCH";
        Address => "ADDRESS";
        Ceiling => "CEILING";
        Columns => "COLUMNS";
        CountIf => "COUNTIF";
        Days360 => "DAYS360";
        EOMonth => "EOMONTH";
        GeoMean => "GEOMEAN";
        HLookup => "HLOOKUP";
        IfError => "IFERROR";
        IsBlank => "ISBLANK";
        IsError => "ISERROR";
        Product => "PRODUCT";
        RankEq => "RANK.EQ";
        Replace => "REPLACE";
        RoundUp => "ROUNDUP";
        StdevP => "STDEV.P";
        StdevS => "STDEV.S";
        UniChar => "UNICHAR";
        Unicode => "UNICODE";
        VLookup => "VLOOKUP";
        Weekday => "WEEKDAY";
        WeekNum => "WEEKNUM";
        Workday => "WORKDAY";
        XLookup => "XLOOKUP";
        CountIfs => "COUNTIFS";
        Indirect => "INDIRECT";
        IsNumber => "ISNUMBER";
        Quotient => "QUOTIENT";
        Sequence => "SEQUENCE";
        Subtotal => "SUBTOTAL";
        TextJoin => "TEXTJOIN";
        YearFrac => "YEARFRAC";
        AverageIf => "AVERAGEIF";
        DateValue => "DATEVALUE";
        Hyperlink => "HYPERLINK";
        IsFormula => "ISFORMULA";
        IsLogical => "ISLOGICAL";
        ModeSngl => "MODE.SNGL";
        RoundDown => "ROUNDDOWN";
        TimeValue => "TIMEVALUE";
        Transpose => "TRANSPOSE";
        AverageIfs => "AVERAGEIFS";
        ChooseCols => "CHOOSECOLS";
        ChooseRows => "CHOOSEROWS";
        CountBlank => "COUNTBLANK";
        Substitute => "SUBSTITUTE";
        SumProduct => "SUMPRODUCT";
        Concatenate => "CONCATENATE";
        FormulaText => "FORMULATEXT";
        NetworkDays => "NETWORKDAYS";
        NumberValue => "NUMBERVALUE";
        RandBetween => "RANDBETWEEN";
        CovarianceP => "COVARIANCE.P";
        CovarianceS => "COVARIANCE.S";
        QuartileInc => "QUARTILE.INC";
        PercentileInc => "PERCENTILE.INC";
    }
    aliases {
        "AVERAGE" => Avg;
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CmpOp {
    Eq,
    Ne,
    Lt,
    Gt,
    Le,
    Ge,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RefFlags {
    pub row_abs: bool,
    pub col_abs: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SheetRef {
    pub handle: u32,
    pub name: String,
    pub quoted: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UnresolvedSheetRef {
    pub name: String,
    pub quoted: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RangeFlags {
    pub start: RefFlags,
    pub end: RefFlags,
}

/// The handle of a 3-D reference endpoint before ingest resolves its name.
pub(crate) const UNRESOLVED_SHEET: u32 = u32::MAX;

/// `Sheet1:Sheet3!A1:B2`: one range on every sheet from `first` to `last` in
/// tab order.
#[derive(Clone, Debug, PartialEq)]
pub struct SheetSpanRef {
    pub first: SheetRef,
    pub last: SheetRef,
    /// The handles from `first` to `last` in tab order when the span was last
    /// placed. Reads and evaluation use them without the tab order, and a
    /// removed endpoint is replaced by its nearest surviving neighbour here.
    /// Empty until ingest resolves the names.
    pub sheets: Vec<u32>,
    pub row_start: u32,
    pub col_start: u32,
    pub row_end: u32,
    pub col_end: u32,
    pub flags: RangeFlags,
    /// Written as one cell (`A1`) rather than a range.
    pub cell: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NamedRangeRef {
    pub name: String,
    pub scope: Option<u32>,
    pub sheet: u32,
    pub row_start: u32,
    pub col_start: u32,
    pub row_end: u32,
    pub col_end: u32,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TableSection {
    Body,
    Headers,
    Totals,
    CurrentRow,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UnresolvedStructuredRef {
    pub table_name: Option<String>,
    pub column_name: String,
    pub section: TableSection,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StructuredRef {
    pub table_id: String,
    pub table_name: String,
    pub column_id: String,
    pub column_name: String,
    pub sheet: u32,
    pub row_start: u32,
    pub row_end: u32,
    pub col: u32,
    pub section: TableSection,
    pub qualified: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Ast {
    Num(f64),
    Str(String),
    Bool(bool),
    Missing,
    /// A helper parameter value. It exists only during full-engine evaluation.
    #[cfg(feature = "analysis")]
    #[allow(private_interfaces)] // Transient values are not part of the public AST API.
    BoundMatrix {
        rows: usize,
        cols: usize,
        values: std::rc::Rc<Vec<crate::types::Value>>,
    },
    Name(String),
    NamedRange(NamedRangeRef),
    UnresolvedStructured(UnresolvedStructuredRef),
    Structured(Box<StructuredRef>),
    Cell(u32, u32, RefFlags),
    SheetCell(UnresolvedSheetRef, u32, u32, RefFlags),
    AbsCell(SheetRef, u32, u32, RefFlags),
    Range(u32, u32, u32, u32, RangeFlags),
    SheetRange(UnresolvedSheetRef, u32, u32, u32, u32, RangeFlags),
    AbsRange(SheetRef, u32, u32, u32, u32, RangeFlags),
    /// Boxed: a span holds two sheet names and its handles, which would
    /// otherwise grow every node of every formula.
    SheetSpan(Box<SheetSpanRef>),
    InvalidRef,
    Func(Func, Vec<Ast>),
    UnknownFunc(String, Vec<Ast>),
    Bin(Op, Box<Ast>, Box<Ast>),
    Cmp(CmpOp, Box<Ast>, Box<Ast>),
    Neg(Box<Ast>),
    Pos(Box<Ast>),
    Percent(Box<Ast>),
    /// One use of a LET binding in an expanded tree. `slot` identifies the
    /// binding for the evaluation in progress, so its expression is evaluated
    /// at most once however many uses the expansion has; `expression` stays
    /// in the tree so dependency, volatility and array analysis of the
    /// expansion still see the reads and the arrays.
    LetSlot {
        slot: u32,
        expression: Box<Ast>,
    },
    /// An array constant such as `{1,2;3,4}`: row-major values with `cols`
    /// values in each row.
    Array {
        cols: u32,
        values: Vec<Value>,
    },
}
impl Ast {
    /// Heap payload owned below an inline AST root. The root itself is already
    /// included in its formula hash-table bucket.
    pub(crate) fn heap_memory_stats(&self, out: &mut MemoryOwnerStats) {
        match self {
            #[cfg(feature = "analysis")]
            Ast::BoundMatrix { values, .. } => {
                out.add_vec::<crate::types::Value>(values.len(), values.capacity());
            }
            Ast::Str(value) | Ast::Name(value) => add_string_memory(value, out),
            Ast::NamedRange(value) => add_string_memory(&value.name, out),
            Ast::UnresolvedStructured(value) => {
                if let Some(name) = &value.table_name {
                    add_string_memory(name, out);
                }
                add_string_memory(&value.column_name, out);
            }
            Ast::Structured(value) => {
                let bytes = std::mem::size_of::<StructuredRef>();
                out.add_payload(bytes, bytes);
                add_string_memory(&value.table_id, out);
                add_string_memory(&value.table_name, out);
                add_string_memory(&value.column_id, out);
                add_string_memory(&value.column_name, out);
            }
            Ast::SheetCell(sheet, ..) | Ast::SheetRange(sheet, ..) => {
                add_string_memory(&sheet.name, out);
            }
            Ast::AbsCell(sheet, ..) | Ast::AbsRange(sheet, ..) => {
                add_string_memory(&sheet.name, out);
            }
            Ast::SheetSpan(span) => {
                let bytes = std::mem::size_of::<SheetSpanRef>();
                out.add_payload(bytes, bytes);
                add_string_memory(&span.first.name, out);
                add_string_memory(&span.last.name, out);
                out.add_vec::<u32>(span.sheets.len(), span.sheets.capacity());
            }
            Ast::Func(_, args) => add_ast_vec_memory(args, out),
            Ast::UnknownFunc(name, args) => {
                add_string_memory(name, out);
                add_ast_vec_memory(args, out);
            }
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                add_boxed_ast_memory(left, out);
                add_boxed_ast_memory(right, out);
            }
            Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
                add_boxed_ast_memory(inner, out);
            }
            Ast::LetSlot { expression, .. } => add_boxed_ast_memory(expression, out),
            Ast::Array { values, .. } => {
                let bytes = std::mem::size_of::<Value>();
                out.add_payload(
                    values.len().saturating_mul(bytes),
                    values.capacity().saturating_mul(bytes),
                );
                for value in values {
                    if let Value::Text(text) = value {
                        out.add_payload(text.len(), text.len());
                    }
                }
            }
            Ast::Num(_)
            | Ast::Bool(_)
            | Ast::Missing
            | Ast::Cell(..)
            | Ast::Range(..)
            | Ast::InvalidRef => {}
        }
    }
}

fn add_string_memory(value: &String, out: &mut MemoryOwnerStats) {
    out.add_payload(value.len(), value.capacity());
}

fn add_ast_vec_memory(values: &Vec<Ast>, out: &mut MemoryOwnerStats) {
    out.add_payload(
        values.len().saturating_mul(std::mem::size_of::<Ast>()),
        values.capacity().saturating_mul(std::mem::size_of::<Ast>()),
    );
    for value in values {
        value.heap_memory_stats(out);
    }
}

fn add_boxed_ast_memory(value: &Ast, out: &mut MemoryOwnerStats) {
    out.add_payload(std::mem::size_of::<Ast>(), std::mem::size_of::<Ast>());
    value.heap_memory_stats(out);
}

/// Parse column letters (A, B, ..., Z, AA, ...) to a 0-based column index.
fn parse_col(letters: &str) -> Option<u32> {
    if letters.is_empty() {
        return None;
    }

    let mut col: u32 = 0;

    for ch in letters.chars() {
        if !ch.is_ascii_alphabetic() {
            return None;
        }

        col = col
            .checked_mul(26)?
            .checked_add((ch.to_ascii_uppercase() as u32) - ('A' as u32) + 1)?;
    }

    Some(col - 1)
}

/// Parse an A1 token like `B12` or `$B$12`, preserving absolute markers.
fn parse_a1(token: &str) -> Option<(u32, u32, RefFlags)> {
    let col_abs = token.starts_with('$');
    let token = token.strip_prefix('$').unwrap_or(token);

    let mut letters_end = 0;

    for (idx, ch) in token.char_indices() {
        if !ch.is_ascii_alphabetic() {
            break;
        }

        letters_end = idx + ch.len_utf8();
    }

    if letters_end == 0 {
        return None;
    }

    let letters = &token[..letters_end];
    let row_token = &token[letters_end..];
    let row_abs = row_token.starts_with('$');
    let digits = row_token.strip_prefix('$').unwrap_or(row_token);

    if digits.is_empty() || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    let col = parse_col(letters)?;
    let row: u32 = digits.parse().ok()?;

    if row == 0 {
        return None;
    }

    Some((row - 1, col, RefFlags { row_abs, col_abs }))
}

fn normalize_range(
    row: u32,
    col: u32,
    flags: RefFlags,
    end_row: u32,
    end_col: u32,
    end_flags: RefFlags,
) -> (u32, u32, u32, u32, RangeFlags) {
    let start_flags = RefFlags {
        row_abs: if row <= end_row {
            flags.row_abs
        } else {
            end_flags.row_abs
        },
        col_abs: if col <= end_col {
            flags.col_abs
        } else {
            end_flags.col_abs
        },
    };

    let normalized_end_flags = RefFlags {
        row_abs: if row <= end_row {
            end_flags.row_abs
        } else {
            flags.row_abs
        },
        col_abs: if col <= end_col {
            end_flags.col_abs
        } else {
            flags.col_abs
        },
    };

    (
        row.min(end_row),
        col.min(end_col),
        row.max(end_row),
        col.max(end_col),
        RangeFlags {
            start: start_flags,
            end: normalized_end_flags,
        },
    )
}

#[derive(Clone, Debug, PartialEq)]
enum Tok<'a> {
    Num(f64),
    Str(String),
    Ident(Cow<'a, str>, bool),
    Structured(String),
    Op(char),
    LParen,
    RParen,
    Comma,
    Semicolon,
    LBrace,
    RBrace,
    Colon,
    Bang,
    Cmp(CmpOp),
    Error(FormulaError),
    /// The `#` after a cell reference: the whole spill of that anchor.
    Hash,
    /// Spaces between two references: the intersection operator.
    Intersect,
}

/// Error constants a formula can contain. `#REF!` parses as an invalid
/// reference; the others are accepted only inside array constants.
const ERROR_LITERALS: [(&str, FormulaError); 9] = [
    ("#DIV/0!", FormulaError::DivZero),
    ("#NULL!", FormulaError::Null),
    ("#SPILL!", FormulaError::Spill),
    ("#CALC!", FormulaError::Calc),
    ("#VALUE!", FormulaError::Value),
    ("#REF!", FormulaError::Ref),
    ("#NAME?", FormulaError::Name),
    ("#NUM!", FormulaError::Num),
    ("#N/A", FormulaError::Na),
];

fn quoted_token(
    src: &str,
    index: &mut usize,
    quote: u8,
    unterminated: &str,
) -> Result<String, String> {
    let bytes = src.as_bytes();
    *index += 1;
    let mut segment = *index;
    let mut value = String::new();
    loop {
        if *index >= bytes.len() {
            return Err(unterminated.into());
        }
        if bytes[*index] != quote {
            *index += 1;
            continue;
        }

        value.push_str(&src[segment..*index]);
        if bytes.get(*index + 1) == Some(&quote) {
            value.push(quote as char);
            *index += 2;
            segment = *index;
        } else {
            *index += 1;
            return Ok(value);
        }
    }
}

/// Whether spaces between `previous` and `rest` are the intersection operator:
/// they follow a token that can end a reference and precede one that can start
/// one. Spaces around other operators, after separators and before `)` stay
/// insignificant. A name followed by spaces and `(` stays a call, as before.
/// `#REF!` is a reference operand too: a deleted operand serializes as it, and
/// the formula must parse back to the same intersection.
fn separates_references(previous: Option<&Tok<'_>>, rest: &str) -> bool {
    const DELETED_REFERENCE: &str = "#REF!";

    let Some(next) = rest.chars().next() else {
        return false;
    };
    let ends_reference = match previous {
        Some(Tok::Ident(..)) => next != '(',
        Some(Tok::RParen | Tok::Structured(_) | Tok::Hash | Tok::Error(FormulaError::Ref)) => true,
        _ => false,
    };
    let starts_reference = next.is_alphabetic()
        || matches!(next, '$' | '_' | '\\' | '\'' | '(')
        || rest
            .get(..DELETED_REFERENCE.len())
            .is_some_and(|text| text.eq_ignore_ascii_case(DELETED_REFERENCE));
    ends_reference && starts_reference
}

fn tokenize(src: &str) -> Result<Vec<Tok<'_>>, String> {
    let mut toks = Vec::new();
    let bytes = src.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        let c = bytes[i];
        if c.is_ascii_whitespace() {
            while bytes.get(i).is_some_and(u8::is_ascii_whitespace) {
                i += 1;
            }
            if separates_references(toks.last(), &src[i..]) {
                toks.push(Tok::Intersect);
            }
        } else if c == b'"' {
            toks.push(Tok::Str(quoted_token(
                src,
                &mut i,
                b'"',
                "unterminated string literal",
            )?));
        } else if c.is_ascii_digit()
            || (c == b'.' && bytes.get(i + 1).is_some_and(u8::is_ascii_digit))
        {
            let start = i;
            let mut saw_decimal = false;
            while i < bytes.len() {
                if bytes[i].is_ascii_digit() {
                    i += 1;
                } else if bytes[i] == b'.' && !saw_decimal {
                    saw_decimal = true;
                    i += 1;
                } else {
                    break;
                }
            }
            let number = &src[start..i];
            toks.push(Tok::Num(
                number
                    .parse()
                    .map_err(|_| format!("bad number: {number}"))?,
            ));
        } else if c == b'\'' {
            toks.push(Tok::Ident(
                Cow::Owned(quoted_token(src, &mut i, b'\'', "unterminated sheet name")?),
                true,
            ));
        } else if let Some((literal, error)) = ERROR_LITERALS.iter().find(|(literal, _)| {
            bytes[i..]
                .get(..literal.len())
                .is_some_and(|text| text.eq_ignore_ascii_case(literal.as_bytes()))
        }) {
            toks.push(Tok::Error(*error));
            i += literal.len();
        } else if c == b'[' {
            let start = i;
            let mut depth = 0usize;
            while i < bytes.len() {
                match bytes[i] {
                    b'[' => depth += 1,
                    b']' => {
                        if depth == 0 {
                            return Err("unexpected ]".into());
                        }
                        depth -= 1;
                    }
                    _ => {}
                }
                i += 1;
                if depth == 0 {
                    break;
                }
            }
            if depth != 0 {
                return Err("unterminated structured reference".into());
            }
            toks.push(Tok::Structured(src[start..i].to_string()));
        } else if c == b'$'
            || c == b'_'
            || c == b'\\'
            || c.is_ascii_alphabetic()
            || (!c.is_ascii() && src[i..].chars().next().is_some_and(char::is_alphabetic))
        {
            let start = i;
            while i < bytes.len() {
                let ch = src[i..].chars().next().expect("valid UTF-8 source");
                if ch.is_alphanumeric() || matches!(ch, '$' | '_' | '.' | '\\') {
                    i += ch.len_utf8();
                } else {
                    break;
                }
            }
            toks.push(Tok::Ident(Cow::Borrowed(&src[start..i]), false));
        } else if c == b'!' {
            toks.push(Tok::Bang);
            i += 1;
        } else if c == b'<' || c == b'>' || c == b'=' {
            let next = bytes.get(i + 1).copied();
            let (op, len) = match (c, next) {
                (b'<', Some(b'=')) => (CmpOp::Le, 2),
                (b'>', Some(b'=')) => (CmpOp::Ge, 2),
                (b'<', Some(b'>')) => (CmpOp::Ne, 2),
                (b'=', _) => (CmpOp::Eq, 1),
                (b'<', _) => (CmpOp::Lt, 1),
                _ => (CmpOp::Gt, 1),
            };
            toks.push(Tok::Cmp(op));
            i += len;
        } else {
            match c {
                b'+' | b'-' | b'*' | b'/' | b'^' | b'&' | b'%' => {
                    toks.push(Tok::Op(c as char));
                    i += 1;
                }
                b'(' => {
                    toks.push(Tok::LParen);
                    i += 1;
                }
                b')' => {
                    toks.push(Tok::RParen);
                    i += 1;
                }
                b',' => {
                    toks.push(Tok::Comma);
                    i += 1;
                }
                b';' => {
                    toks.push(Tok::Semicolon);
                    i += 1;
                }
                b'{' => {
                    toks.push(Tok::LBrace);
                    i += 1;
                }
                b'}' => {
                    toks.push(Tok::RBrace);
                    i += 1;
                }
                b':' => {
                    toks.push(Tok::Colon);
                    i += 1;
                }
                b'#' => {
                    toks.push(Tok::Hash);
                    i += 1;
                }
                _ if !c.is_ascii() => {
                    let ch = src[i..].chars().next().expect("valid UTF-8 source");
                    if ch.is_whitespace() {
                        i += ch.len_utf8();
                    } else {
                        return Err(format!("unexpected char: {ch}"));
                    }
                }
                _ => return Err(format!("unexpected char: {}", c as char)),
            }
        }
    }

    Ok(toks)
}

fn parse_structured_ref(raw: String, table_name: Option<String>) -> Result<Ast, String> {
    if !raw.starts_with('[') || !raw.ends_with(']') {
        return Err("malformed structured reference".into());
    }
    let (section, column_name) = if raw.starts_with("[[") && raw.ends_with("]]") {
        let inner = &raw[2..raw.len() - 2];
        let Some((selector, column)) = inner.split_once("],[") else {
            return Err("structured reference requires one section and one column".into());
        };
        let section = if selector.eq_ignore_ascii_case("#Headers") {
            TableSection::Headers
        } else if selector.eq_ignore_ascii_case("#Totals") {
            TableSection::Totals
        } else {
            return Err("unsupported structured-reference section".into());
        };
        (section, column)
    } else {
        let inner = &raw[1..raw.len() - 1];
        if let Some(column) = inner.strip_prefix('@') {
            (TableSection::CurrentRow, column)
        } else {
            (TableSection::Body, inner)
        }
    };
    if column_name.is_empty() {
        return Err("structured reference column is empty".into());
    }
    Ok(Ast::UnresolvedStructured(UnresolvedStructuredRef {
        table_name,
        column_name: column_name.to_string(),
        section,
    }))
}

struct Parser<'a> {
    toks: std::vec::IntoIter<Tok<'a>>,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<&Tok<'a>> {
        self.toks.as_slice().first()
    }

    fn next(&mut self) -> Option<Tok<'a>> {
        self.toks.next()
    }

    fn guard_depth(depth: usize) -> Result<(), String> {
        if depth > PARSE_RECURSION_LIMIT {
            Err("formula nesting is too deep".into())
        } else {
            Ok(())
        }
    }

    fn expr(&mut self) -> Result<Ast, String> {
        self.expr_at(0)
    }

    fn expr_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let left = self.concat_at(depth)?;
        if let Some(Tok::Cmp(op)) = self.peek() {
            let op = *op;
            let _ = self.next();
            let right = self.concat_at(depth)?;
            return Ok(Ast::Cmp(op, Box::new(left), Box::new(right)));
        }
        Ok(left)
    }

    fn concat_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.additive_at(depth)?;
        while self.peek() == Some(&Tok::Op('&')) {
            let _ = self.next();
            let right = self.additive_at(depth)?;
            left = Ast::Bin(Op::Concat, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn additive_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.term_at(depth)?;
        while let Some(Tok::Op(c @ ('+' | '-'))) = self.peek() {
            let op = if *c == '+' { Op::Add } else { Op::Sub };
            let _ = self.next();
            let right = self.term_at(depth)?;
            left = Ast::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn term_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.power_at(depth)?;
        while let Some(Tok::Op(c @ ('*' | '/'))) = self.peek() {
            let op = if *c == '*' { Op::Mul } else { Op::Div };
            let _ = self.next();
            let right = self.power_at(depth)?;
            left = Ast::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn power_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut left = self.postfix_at(depth)?;
        while self.peek() == Some(&Tok::Op('^')) {
            let _ = self.next();
            let right = self.postfix_at(depth)?;
            left = Ast::Bin(Op::Pow, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn postfix_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut value = self.unary_at(depth)?;
        #[cfg(feature = "analysis")]
        while self.peek() == Some(&Tok::LParen) {
            let _ = self.next();
            let mut args = vec![value];
            if self.peek() != Some(&Tok::RParen) {
                loop {
                    args.push(if matches!(self.peek(), Some(Tok::Comma | Tok::RParen)) {
                        Ast::Missing
                    } else {
                        self.expr_at(depth + 1)?
                    });
                    if self.peek() != Some(&Tok::Comma) {
                        break;
                    }
                    let _ = self.next();
                }
            }
            if self.next() != Some(Tok::RParen) {
                return Err("expected )".into());
            }
            value = Ast::UnknownFunc("$LAMBDA_CALL".into(), args);
        }
        while self.peek() == Some(&Tok::Op('%')) {
            let _ = self.next();
            value = Ast::Percent(Box::new(value));
        }
        Ok(value)
    }

    fn unary_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        if let Some(Tok::Op(sign @ ('+' | '-'))) = self.peek() {
            let sign = *sign;
            let _ = self.next();
            let inner = Box::new(self.unary_at(depth + 1)?);
            return Ok(if sign == '-' {
                Ast::Neg(inner)
            } else {
                Ast::Pos(inner)
            });
        }
        self.intersection_at(depth)
    }

    /// `A1:C3 B2:D4`: intersection binds tighter than every other operator
    /// except `:`. A chain keeps one flat operand list, since the order of
    /// intersection does not change its cells.
    fn intersection_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        let mut value = self.primary_at(depth)?;
        while self.peek() == Some(&Tok::Intersect) {
            let _ = self.next();
            let right = self.primary_at(depth)?;
            match &mut value {
                Ast::Func(Func::Intersect, operands) => operands.push(right),
                _ => value = Ast::Func(Func::Intersect, vec![value, right]),
            }
        }
        Ok(value)
    }

    fn primary_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        match self.next() {
            Some(Tok::Num(n)) => Ok(Ast::Num(n)),
            Some(Tok::Str(value)) => Ok(Ast::Str(value)),
            Some(Tok::LParen) => {
                let first = self.expr_at(depth + 1)?;
                let value = if self.peek() == Some(&Tok::Comma) {
                    let mut areas = vec![first];
                    while self.peek() == Some(&Tok::Comma) {
                        let _ = self.next();
                        areas.push(self.expr_at(depth + 1)?);
                    }
                    Ast::Func(Func::Union, areas)
                } else {
                    first
                };
                match self.next() {
                    Some(Tok::RParen) => Ok(value),
                    _ => Err("expected )".into()),
                }
            }
            Some(Tok::Ident(name, quoted)) => self.ident_at(name, quoted, depth),
            Some(Tok::Structured(raw)) => parse_structured_ref(raw, None),
            Some(Tok::Error(FormulaError::Ref)) => Ok(Ast::InvalidRef),
            Some(Tok::LBrace) => self.array_constant(),
            other => Err(if other.is_some() {
                "unexpected token".into()
            } else {
                "unexpected end".into()
            }),
        }
    }

    fn array_constant(&mut self) -> Result<Ast, String> {
        let mut values = Vec::new();
        let mut cols = 0usize;
        let mut row_len = 0usize;
        loop {
            values.push(self.array_element()?);
            row_len += 1;
            match self.next() {
                Some(Tok::Comma) => continue,
                Some(separator @ (Tok::Semicolon | Tok::RBrace)) => {
                    if cols == 0 {
                        cols = row_len;
                    } else if row_len != cols {
                        return Err("array constant rows must have the same length".into());
                    }
                    if separator == Tok::RBrace {
                        break;
                    }
                    row_len = 0;
                }
                _ => return Err("expected , ; or } in array constant".into()),
            }
        }
        let cols = u32::try_from(cols).map_err(|_| "array constant is too wide".to_string())?;
        Ok(Ast::Array { cols, values })
    }

    /// One array-constant element: a number with an optional sign, text, a
    /// logical value, or an error. References and expressions are rejected.
    fn array_element(&mut self) -> Result<Value, String> {
        let value = match self.next() {
            Some(Tok::Num(number)) => Value::number(number),
            Some(Tok::Op(sign @ ('+' | '-'))) => match self.next() {
                Some(Tok::Num(number)) => Value::number(if sign == '-' { -number } else { number }),
                _ => return Err("expected number after sign in array constant".into()),
            },
            Some(Tok::Str(text)) => Value::text(text),
            Some(Tok::Ident(name, false)) if name.eq_ignore_ascii_case("TRUE") => Value::Bool(true),
            Some(Tok::Ident(name, false)) if name.eq_ignore_ascii_case("FALSE") => {
                Value::Bool(false)
            }
            Some(Tok::Error(error)) => Value::Error(error),
            _ => {
                return Err(
                    "array constants accept only numbers, text, logical values and errors".into(),
                )
            }
        };
        Ok(value)
    }

    fn ident_at(&mut self, name: Cow<'a, str>, quoted: bool, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;
        if let Some(Tok::Structured(_)) = self.peek() {
            let Some(Tok::Structured(raw)) = self.next() else {
                unreachable!("peeked structured token");
            };
            return parse_structured_ref(raw, Some(name.into_owned()));
        }

        if self.peek() == Some(&Tok::Colon)
            && matches!(
                self.toks.as_slice().get(1..3),
                Some([Tok::Ident(..), Tok::Bang])
            )
        {
            let _ = self.next();
            let Some(Tok::Ident(last, last_quoted)) = self.next() else {
                unreachable!("peeked 3-D reference end");
            };
            let _ = self.next();
            // Excel quotes a span as a whole, so either quoted end quotes both.
            return self.sheet_span_at(name.into_owned(), last.into_owned(), quoted || last_quoted);
        }

        if let Some(Tok::Bang) = self.peek() {
            let _ = self.next();
            return self.sheet_ref_at(name.into_owned(), quoted);
        }

        if let Some(Tok::LParen) = self.peek() {
            let _ = self.next();
            let func = lookup_func(name.as_ref());
            let mut args = Vec::new();
            if self.peek() != Some(&Tok::RParen) {
                loop {
                    if matches!(self.peek(), Some(Tok::Comma | Tok::RParen)) {
                        args.push(Ast::Missing);
                    } else {
                        args.push(self.expr_at(depth + 1)?);
                    }
                    match self.peek() {
                        Some(Tok::Comma) => {
                            let _ = self.next();
                        }
                        _ => break,
                    }
                }
            }
            match self.next() {
                Some(Tok::RParen) => Ok(match func {
                    Some(func) => Ast::Func(func, args),
                    None => Ast::UnknownFunc(name.into_owned(), args),
                }),
                _ => Err("expected )".into()),
            }
        } else {
            if name.eq_ignore_ascii_case("TRUE") {
                return Ok(Ast::Bool(true));
            }
            if name.eq_ignore_ascii_case("FALSE") {
                return Ok(Ast::Bool(false));
            }

            let Some((row, col, flags)) = parse_a1(name.as_ref()) else {
                return Ok(Ast::Name(name.into_owned()));
            };
            if let Some(Tok::Colon) = self.peek() {
                let _ = self.next();
                match self.next() {
                    Some(Tok::Ident(end, _)) => {
                        let (r1, c1, end_flags) =
                            parse_a1(&end).ok_or_else(|| format!("bad cell ref: {end}"))?;
                        let (r0, c0, r1, c1, range_flags) =
                            normalize_range(row, col, flags, r1, c1, end_flags);
                        Ok(Ast::Range(r0, c0, r1, c1, range_flags))
                    }
                    _ => Err("expected cell after :".into()),
                }
            } else {
                Ok(self.spill_suffix(Ast::Cell(row, col, flags)))
            }
        }
    }

    fn sheet_ref_at(&mut self, sheet_name: String, quoted: bool) -> Result<Ast, String> {
        // Sheet names cannot contain `:`, so a quoted name with one is the
        // Excel form of a 3-D reference: `'Sheet 1:Sheet 3'!A1`.
        if quoted {
            if let Some((first, last)) = sheet_name.split_once(':') {
                return self.sheet_span_at(first.to_string(), last.to_string(), true);
            }
        }

        let Some(Tok::Ident(start, _)) = self.next() else {
            return Err("expected cell after !".into());
        };
        let (row, col, flags) = parse_a1(&start).ok_or_else(|| format!("bad cell ref: {start}"))?;
        let qualifier = UnresolvedSheetRef {
            name: sheet_name.clone(),
            quoted,
        };

        if let Some(Tok::Colon) = self.peek() {
            let _ = self.next();
            let (end_sheet, r1, c1, end_flags) = self.sheet_range_end(&sheet_name)?;
            if sheet_name_key(&end_sheet) != sheet_name_key(&sheet_name) {
                return Err("cross-sheet ranges must stay on one sheet".into());
            }
            let (r0, c0, r1, c1, range_flags) = normalize_range(row, col, flags, r1, c1, end_flags);
            return Ok(Ast::SheetRange(qualifier, r0, c0, r1, c1, range_flags));
        }

        Ok(self.spill_suffix(Ast::SheetCell(qualifier, row, col, flags)))
    }

    /// The cell or range after the `!` of a 3-D reference from sheet `first`
    /// to sheet `last`.
    fn sheet_span_at(&mut self, first: String, last: String, quoted: bool) -> Result<Ast, String> {
        let Some(Tok::Ident(start, _)) = self.next() else {
            return Err("expected cell after !".into());
        };
        let (row, col, flags) = parse_a1(&start).ok_or_else(|| format!("bad cell ref: {start}"))?;

        let (cell, (row_start, col_start, row_end, col_end, range_flags)) =
            if self.peek() == Some(&Tok::Colon) {
                let _ = self.next();
                let Some(Tok::Ident(end, _)) = self.next() else {
                    return Err("expected cell after :".into());
                };
                let (end_row, end_col, end_flags) =
                    parse_a1(&end).ok_or_else(|| format!("bad cell ref: {end}"))?;
                (
                    false,
                    normalize_range(row, col, flags, end_row, end_col, end_flags),
                )
            } else {
                (true, normalize_range(row, col, flags, row, col, flags))
            };

        let endpoint = |name: String| SheetRef {
            handle: UNRESOLVED_SHEET,
            name,
            quoted,
        };
        Ok(Ast::SheetSpan(Box::new(SheetSpanRef {
            first: endpoint(first),
            last: endpoint(last),
            sheets: Vec::new(),
            row_start,
            col_start,
            row_end,
            col_end,
            flags: range_flags,
            cell,
        })))
    }

    /// `A1#` refers to the whole spill of the formula in A1. It is stored as
    /// `ANCHORARRAY(A1)`, the form that XLSX files use.
    fn spill_suffix(&mut self, anchor: Ast) -> Ast {
        if self.peek() == Some(&Tok::Hash) {
            let _ = self.next();
            Ast::Func(Func::AnchorArray, vec![anchor])
        } else {
            anchor
        }
    }

    fn sheet_range_end(
        &mut self,
        sheet_name: &str,
    ) -> Result<(String, u32, u32, RefFlags), String> {
        let Some(Tok::Ident(first, _)) = self.next() else {
            return Err("expected cell after :".into());
        };

        if let Some(Tok::Bang) = self.peek() {
            let _ = self.next();
            let Some(Tok::Ident(end, _)) = self.next() else {
                return Err("expected cell after !".into());
            };
            let (row, col, flags) = parse_a1(&end).ok_or_else(|| format!("bad cell ref: {end}"))?;
            return Ok((first.into_owned(), row, col, flags));
        }

        let (row, col, flags) = parse_a1(&first).ok_or_else(|| format!("bad cell ref: {first}"))?;
        Ok((sheet_name.to_string(), row, col, flags))
    }
}

pub(crate) fn sheet_name_key(name: &str) -> String {
    name.chars().flat_map(char::to_lowercase).collect()
}

/// Parse a formula source (with or without a leading `=`) into an AST.
pub fn parse(src: &str) -> Result<Ast, String> {
    let trimmed = src.trim().strip_prefix('=').unwrap_or(src.trim());
    let toks = tokenize(trimmed)?;
    let mut parser = Parser {
        toks: toks.into_iter(),
    };
    let ast = parser.expr()?;
    if parser.peek().is_some() {
        return Err("trailing tokens".into());
    }
    Ok(ast)
}

/// Resolve sheet-qualified refs to numeric sheet handles once, at formula ingest.
/// `place_span` gives a resolved 3-D reference the sheets it spans, and fails
/// when an endpoint is not in the tab order.
pub fn resolve_sheet_refs<F, S>(ast: Ast, resolve: &F, place_span: &S) -> Result<Ast, String>
where
    F: Fn(&str) -> Option<u32>,
    S: Fn(&mut SheetSpanRef) -> bool,
{
    match ast {
        Ast::SheetSpan(mut span) => {
            for endpoint in [&mut span.first, &mut span.last] {
                endpoint.handle = resolve(&endpoint.name)
                    .ok_or_else(|| format!("unknown sheet: {}", endpoint.name))?;
            }
            if !place_span(&mut span) {
                return Err(format!("unknown sheet: {}", span.first.name));
            }
            Ok(Ast::SheetSpan(span))
        }
        Ast::SheetCell(sheet_ref, row, col, flags) => resolve(&sheet_ref.name)
            .map(|handle| {
                Ast::AbsCell(
                    SheetRef {
                        handle,
                        name: sheet_ref.name.clone(),
                        quoted: sheet_ref.quoted,
                    },
                    row,
                    col,
                    flags,
                )
            })
            .ok_or_else(|| format!("unknown sheet: {}", sheet_ref.name)),
        Ast::SheetRange(sheet_ref, r0, c0, r1, c1, flags) => resolve(&sheet_ref.name)
            .map(|handle| {
                Ast::AbsRange(
                    SheetRef {
                        handle,
                        name: sheet_ref.name.clone(),
                        quoted: sheet_ref.quoted,
                    },
                    r0,
                    c0,
                    r1,
                    c1,
                    flags,
                )
            })
            .ok_or_else(|| format!("unknown sheet: {}", sheet_ref.name)),
        Ast::Func(func, args) => {
            let resolved = args
                .into_iter()
                .map(|arg| resolve_sheet_refs(arg, resolve, place_span))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Ast::Func(func, resolved))
        }
        Ast::UnknownFunc(name, args) => {
            let resolved = args
                .into_iter()
                .map(|arg| resolve_sheet_refs(arg, resolve, place_span))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Ast::UnknownFunc(name, resolved))
        }
        Ast::Bin(op, left, right) => Ok(Ast::Bin(
            op,
            Box::new(resolve_sheet_refs(*left, resolve, place_span)?),
            Box::new(resolve_sheet_refs(*right, resolve, place_span)?),
        )),
        Ast::Cmp(op, left, right) => Ok(Ast::Cmp(
            op,
            Box::new(resolve_sheet_refs(*left, resolve, place_span)?),
            Box::new(resolve_sheet_refs(*right, resolve, place_span)?),
        )),
        Ast::Neg(inner) => Ok(Ast::Neg(Box::new(resolve_sheet_refs(
            *inner, resolve, place_span,
        )?))),
        Ast::Pos(inner) => Ok(Ast::Pos(Box::new(resolve_sheet_refs(
            *inner, resolve, place_span,
        )?))),
        Ast::Percent(inner) => Ok(Ast::Percent(Box::new(resolve_sheet_refs(
            *inner, resolve, place_span,
        )?))),
        other => Ok(other),
    }
}

fn tab_position(order: &[u32], handle: u32) -> Option<usize> {
    order.iter().position(|&tab| tab == handle)
}

/// Gives a span with resolved endpoints the sheets between them in tab
/// order. Endpoints written in reverse tab order are swapped, so `first` is
/// always the earlier tab. Fails when an endpoint is not in `order`.
pub(crate) fn place_span(span: &mut SheetSpanRef, order: &[u32]) -> bool {
    let (Some(mut start), Some(mut end)) = (
        tab_position(order, span.first.handle),
        tab_position(order, span.last.handle),
    ) else {
        return false;
    };
    if start > end {
        std::mem::swap(&mut span.first, &mut span.last);
        std::mem::swap(&mut start, &mut end);
    }

    span.sheets.clear();
    span.sheets.extend_from_slice(&order[start..=end]);
    true
}

pub(crate) fn ast_contains_sheet_span(ast: &Ast) -> bool {
    match ast {
        Ast::SheetSpan(_) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(ast_contains_sheet_span),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            ast_contains_sheet_span(left) || ast_contains_sheet_span(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => ast_contains_sheet_span(inner),
        _ => false,
    }
}

/// Re-places every 3-D reference in `ast` after tabs were moved, inserted or
/// removed, as Excel does: removed sheets leave the span, a removed endpoint
/// gives way to its nearest surviving neighbour inside the span, and an
/// endpoint moved past the other endpoint leaves the span, so its inner
/// neighbour becomes the endpoint. A span without surviving sheets becomes
/// `#REF!`. `names` holds the sheet name of each handle.
pub(crate) fn refresh_sheet_spans(ast: &mut Ast, order: &[u32], names: &[String]) -> bool {
    match ast {
        Ast::SheetSpan(span) => match refresh_span(span, order, names) {
            Some(changed) => changed,
            None => {
                *ast = Ast::InvalidRef;
                true
            }
        },
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            let mut changed = false;
            for arg in args {
                changed |= refresh_sheet_spans(arg, order, names);
            }
            changed
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            let left_changed = refresh_sheet_spans(left, order, names);
            refresh_sheet_spans(right, order, names) || left_changed
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            refresh_sheet_spans(inner, order, names)
        }
        _ => false,
    }
}

/// Whether `span` changed, or `None` when none of its sheets is left.
fn refresh_span(span: &mut SheetSpanRef, order: &[u32], names: &[String]) -> Option<bool> {
    let survivors: Vec<(u32, usize)> = span
        .sheets
        .iter()
        .filter_map(|&handle| tab_position(order, handle).map(|position| (handle, position)))
        .collect();
    let mut low = 0;
    let mut high = survivors.len().checked_sub(1)?;

    // Only one tab moves at a time, so the endpoint that now sits beyond its
    // own inner neighbour is the one that moved.
    while survivors[low].1 > survivors[high].1 {
        if survivors[low].1 > survivors[low + 1].1 {
            low += 1;
        } else {
            high -= 1;
        }
    }

    let (first, start) = survivors[low];
    let (last, end) = survivors[high];
    let sheets = &order[start..=end];
    if first == span.first.handle && last == span.last.handle && span.sheets == sheets {
        return Some(false);
    }

    for (endpoint, handle) in [(&mut span.first, first), (&mut span.last, last)] {
        if endpoint.handle != handle {
            let name = names.get(handle as usize).map_or("", String::as_str);
            endpoint.handle = handle;
            endpoint.name = name.to_string();
            endpoint.quoted = sheet_name_needs_quotes(name);
        }
    }
    span.sheets.clear();
    span.sheets.extend_from_slice(sheets);
    Some(true)
}

/// Resolve workbook/sheet-scoped names after sheet references have stable handles.
pub fn resolve_named_ranges<F>(ast: Ast, formula_sheet: u32, resolve: &F) -> Ast
where
    F: Fn(&str, u32) -> Option<NamedRangeRef>,
{
    resolve_named_ranges_inner(ast, formula_sheet, resolve, &[])
}

fn resolve_named_ranges_inner<F>(
    ast: Ast,
    formula_sheet: u32,
    resolve: &F,
    locals: &[String],
) -> Ast
where
    F: Fn(&str, u32) -> Option<NamedRangeRef>,
{
    match ast {
        Ast::Name(name) if locals.iter().any(|local| local.eq_ignore_ascii_case(&name)) => {
            Ast::Name(name)
        }
        Ast::Name(name) => resolve(&name, formula_sheet).map_or(Ast::Name(name), Ast::NamedRange),
        Ast::Func(Func::Let, args) if args.len() >= 3 && args.len() % 2 == 1 => {
            let mut scoped = locals.to_vec();
            let mut resolved = Vec::with_capacity(args.len());
            let last = args.len() - 1;
            for (index, arg) in args.into_iter().enumerate() {
                if index == last {
                    resolved.push(resolve_named_ranges_inner(
                        arg,
                        formula_sheet,
                        resolve,
                        &scoped,
                    ));
                } else if index % 2 == 0 {
                    resolved.push(arg);
                } else {
                    resolved.push(resolve_named_ranges_inner(
                        arg,
                        formula_sheet,
                        resolve,
                        &scoped,
                    ));
                    if let Some(Ast::Name(name)) = resolved.get(index - 1) {
                        scoped.push(name.clone());
                    }
                }
            }
            Ast::Func(Func::Let, resolved)
        }
        #[cfg(feature = "analysis")]
        Ast::Func(Func::Analysis(crate::eval::analysis::LAMBDA_ID), mut args)
            if !args.is_empty() =>
        {
            let body = args.pop().expect("nonempty arguments");
            let mut scoped = locals.to_vec();
            scoped.extend(args.iter().filter_map(|parameter| {
                if let Ast::Name(name) = parameter {
                    Some(name.clone())
                } else {
                    None
                }
            }));
            args.push(resolve_named_ranges_inner(
                body,
                formula_sheet,
                resolve,
                &scoped,
            ));
            Ast::Func(Func::Analysis(crate::eval::analysis::LAMBDA_ID), args)
        }
        Ast::Func(func, args) => Ast::Func(
            func,
            args.into_iter()
                .map(|arg| resolve_named_ranges_inner(arg, formula_sheet, resolve, locals))
                .collect(),
        ),
        Ast::UnknownFunc(name, args) => Ast::UnknownFunc(
            name,
            args.into_iter()
                .map(|arg| resolve_named_ranges_inner(arg, formula_sheet, resolve, locals))
                .collect(),
        ),
        Ast::Bin(op, left, right) => Ast::Bin(
            op,
            Box::new(resolve_named_ranges_inner(
                *left,
                formula_sheet,
                resolve,
                locals,
            )),
            Box::new(resolve_named_ranges_inner(
                *right,
                formula_sheet,
                resolve,
                locals,
            )),
        ),
        Ast::Cmp(op, left, right) => Ast::Cmp(
            op,
            Box::new(resolve_named_ranges_inner(
                *left,
                formula_sheet,
                resolve,
                locals,
            )),
            Box::new(resolve_named_ranges_inner(
                *right,
                formula_sheet,
                resolve,
                locals,
            )),
        ),
        Ast::Neg(inner) => Ast::Neg(Box::new(resolve_named_ranges_inner(
            *inner,
            formula_sheet,
            resolve,
            locals,
        ))),
        Ast::Pos(inner) => Ast::Pos(Box::new(resolve_named_ranges_inner(
            *inner,
            formula_sheet,
            resolve,
            locals,
        ))),
        Ast::Percent(inner) => Ast::Percent(Box::new(resolve_named_ranges_inner(
            *inner,
            formula_sheet,
            resolve,
            locals,
        ))),
        other => other,
    }
}
pub fn resolve_structured_refs<F>(
    ast: Ast,
    formula_sheet: u32,
    formula_row: u32,
    formula_col: u32,
    resolve: &F,
) -> Ast
where
    F: Fn(&UnresolvedStructuredRef, u32, u32, u32) -> Option<StructuredRef>,
{
    match ast {
        Ast::UnresolvedStructured(reference) => {
            resolve(&reference, formula_sheet, formula_row, formula_col)
                .map_or(Ast::UnresolvedStructured(reference), |reference| {
                    Ast::Structured(Box::new(reference))
                })
        }
        Ast::Func(func, args) => Ast::Func(
            func,
            args.into_iter()
                .map(|arg| {
                    resolve_structured_refs(arg, formula_sheet, formula_row, formula_col, resolve)
                })
                .collect(),
        ),
        Ast::UnknownFunc(name, args) => Ast::UnknownFunc(
            name,
            args.into_iter()
                .map(|arg| {
                    resolve_structured_refs(arg, formula_sheet, formula_row, formula_col, resolve)
                })
                .collect(),
        ),
        Ast::Bin(op, left, right) => Ast::Bin(
            op,
            Box::new(resolve_structured_refs(
                *left,
                formula_sheet,
                formula_row,
                formula_col,
                resolve,
            )),
            Box::new(resolve_structured_refs(
                *right,
                formula_sheet,
                formula_row,
                formula_col,
                resolve,
            )),
        ),
        Ast::Cmp(op, left, right) => Ast::Cmp(
            op,
            Box::new(resolve_structured_refs(
                *left,
                formula_sheet,
                formula_row,
                formula_col,
                resolve,
            )),
            Box::new(resolve_structured_refs(
                *right,
                formula_sheet,
                formula_row,
                formula_col,
                resolve,
            )),
        ),
        Ast::Neg(inner) => Ast::Neg(Box::new(resolve_structured_refs(
            *inner,
            formula_sheet,
            formula_row,
            formula_col,
            resolve,
        ))),
        Ast::Pos(inner) => Ast::Pos(Box::new(resolve_structured_refs(
            *inner,
            formula_sheet,
            formula_row,
            formula_col,
            resolve,
        ))),
        Ast::Percent(inner) => Ast::Percent(Box::new(resolve_structured_refs(
            *inner,
            formula_sheet,
            formula_row,
            formula_col,
            resolve,
        ))),
        other => other,
    }
}

/// Translate relative A1 references from one formula origin to another.
///
/// Conditional-format expressions store one parsed AST at the rule range's
/// top-left. Window evaluation clones that bounded AST and applies the target
/// cell delta here; absolute row/column markers remain fixed.
pub fn translate_relative_refs(ast: &mut Ast, row_delta: i64, col_delta: i64) {
    if !translate_relative_refs_inner(ast, row_delta, col_delta) {
        *ast = Ast::InvalidRef;
    }
}

fn translated_coordinate(value: u32, delta: i64, absolute: bool) -> Option<u32> {
    if absolute {
        return Some(value);
    }
    let translated = i64::from(value).checked_add(delta)?;
    u32::try_from(translated).ok()
}

fn translate_relative_refs_inner(ast: &mut Ast, row_delta: i64, col_delta: i64) -> bool {
    match ast {
        Ast::Cell(row, col, flags)
        | Ast::SheetCell(_, row, col, flags)
        | Ast::AbsCell(_, row, col, flags) => {
            let (Some(next_row), Some(next_col)) = (
                translated_coordinate(*row, row_delta, flags.row_abs),
                translated_coordinate(*col, col_delta, flags.col_abs),
            ) else {
                return false;
            };
            *row = next_row;
            *col = next_col;
            true
        }
        Ast::Range(r0, c0, r1, c1, flags)
        | Ast::SheetRange(_, r0, c0, r1, c1, flags)
        | Ast::AbsRange(_, r0, c0, r1, c1, flags) => {
            let (Some(next_r0), Some(next_c0), Some(next_r1), Some(next_c1)) = (
                translated_coordinate(*r0, row_delta, flags.start.row_abs),
                translated_coordinate(*c0, col_delta, flags.start.col_abs),
                translated_coordinate(*r1, row_delta, flags.end.row_abs),
                translated_coordinate(*c1, col_delta, flags.end.col_abs),
            ) else {
                return false;
            };
            *r0 = next_r0;
            *c0 = next_c0;
            *r1 = next_r1;
            *c1 = next_c1;
            true
        }
        Ast::SheetSpan(span) => {
            let (Some(row_start), Some(col_start), Some(row_end), Some(col_end)) = (
                translated_coordinate(span.row_start, row_delta, span.flags.start.row_abs),
                translated_coordinate(span.col_start, col_delta, span.flags.start.col_abs),
                translated_coordinate(span.row_end, row_delta, span.flags.end.row_abs),
                translated_coordinate(span.col_end, col_delta, span.flags.end.col_abs),
            ) else {
                return false;
            };
            span.row_start = row_start;
            span.col_start = col_start;
            span.row_end = row_end;
            span.col_end = col_end;
            true
        }
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                if !translate_relative_refs_inner(arg, row_delta, col_delta) {
                    *arg = Ast::InvalidRef;
                }
            }
            true
        }
        Ast::LetSlot { expression, .. } => {
            translate_relative_refs_inner(expression, row_delta, col_delta)
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            if !translate_relative_refs_inner(left, row_delta, col_delta) {
                **left = Ast::InvalidRef;
            }
            if !translate_relative_refs_inner(right, row_delta, col_delta) {
                **right = Ast::InvalidRef;
            }
            true
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            if !translate_relative_refs_inner(inner, row_delta, col_delta) {
                **inner = Ast::InvalidRef;
            }
            true
        }
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::NamedRange(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::InvalidRef
        | Ast::Array { .. } => true,
        #[cfg(feature = "analysis")]
        Ast::BoundMatrix { .. } => true,
    }
}

#[derive(Clone, Copy)]
enum Axis {
    Row,
    Col,
}

/// Rewrite row references affected by an edit on `edited_sheet`.
pub fn shift_rows(ast: &mut Ast, at: u32, delta: i64, formula_sheet: u32, edited_sheet: u32) {
    rewrite_axis(ast, Axis::Row, at, delta, formula_sheet, edited_sheet);
}

/// Rewrite column references affected by an edit on `edited_sheet`.
pub fn shift_cols(ast: &mut Ast, at: u32, delta: i64, formula_sheet: u32, edited_sheet: u32) {
    rewrite_axis(ast, Axis::Col, at, delta, formula_sheet, edited_sheet);
}

fn rewrite_axis(
    ast: &mut Ast,
    axis: Axis,
    at: u32,
    delta: i64,
    formula_sheet: u32,
    edited_sheet: u32,
) {
    match ast {
        Ast::Cell(row, col, _) if formula_sheet == edited_sheet => {
            let coord = match axis {
                Axis::Row => row,
                Axis::Col => col,
            };
            if let Some(shifted) = shift_index(*coord, at, delta) {
                *coord = shifted;
            } else {
                *ast = Ast::InvalidRef;
            }
        }
        Ast::AbsCell(sheet, row, col, _) if sheet.handle == edited_sheet => {
            let coord = match axis {
                Axis::Row => row,
                Axis::Col => col,
            };
            if let Some(shifted) = shift_index(*coord, at, delta) {
                *coord = shifted;
            } else {
                *ast = Ast::InvalidRef;
            }
        }
        Ast::Range(r0, c0, r1, c1, _) if formula_sheet == edited_sheet => {
            let (start, end) = match axis {
                Axis::Row => (r0, r1),
                Axis::Col => (c0, c1),
            };
            if let Some((shifted_start, shifted_end)) = shift_range(*start, *end, at, delta) {
                *start = shifted_start;
                *end = shifted_end;
            } else {
                *ast = Ast::InvalidRef;
            }
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, _) if sheet.handle == edited_sheet => {
            let (start, end) = match axis {
                Axis::Row => (r0, r1),
                Axis::Col => (c0, c1),
            };
            if let Some((shifted_start, shifted_end)) = shift_range(*start, *end, at, delta) {
                *start = shifted_start;
                *end = shifted_end;
            } else {
                *ast = Ast::InvalidRef;
            }
        }
        Ast::Structured(reference) if reference.sheet == edited_sheet => match axis {
            Axis::Row => {
                if let Some((start, end)) =
                    shift_range(reference.row_start, reference.row_end, at, delta)
                {
                    reference.row_start = start;
                    reference.row_end = end;
                } else {
                    *ast = Ast::InvalidRef;
                }
            }
            Axis::Col => {
                if let Some(col) = shift_index(reference.col, at, delta) {
                    reference.col = col;
                } else {
                    *ast = Ast::InvalidRef;
                }
            }
        },
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                rewrite_axis(arg, axis, at, delta, formula_sheet, edited_sheet);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            rewrite_axis(left, axis, at, delta, formula_sheet, edited_sheet);
            rewrite_axis(right, axis, at, delta, formula_sheet, edited_sheet);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            rewrite_axis(inner, axis, at, delta, formula_sheet, edited_sheet);
        }
        _ => {}
    }
}

/// Shift one coordinate. Deleting its target produces an explicit invalid ref.
fn shift_index(index: u32, at: u32, delta: i64) -> Option<u32> {
    if index < at {
        return Some(index);
    }
    if delta < 0 && index < at.saturating_add((-delta) as u32) {
        return None;
    }
    Some(clamp_index(i64::from(index) + delta))
}

/// Shift or contract an inclusive range; deleting every target invalidates it.
pub(crate) fn shift_range(start: u32, end: u32, at: u32, delta: i64) -> Option<(u32, u32)> {
    if delta >= 0 {
        let start = if start >= at {
            clamp_index(i64::from(start) + delta)
        } else {
            start
        };
        let end = if end >= at {
            clamp_index(i64::from(end) + delta)
        } else {
            end
        };
        return Some((start, end));
    }

    let count = (-delta) as u32;
    let deleted_end = at.saturating_add(count);
    if end < at {
        return Some((start, end));
    }
    if start >= deleted_end {
        return Some((start - count, end - count));
    }

    match (start < at, end >= deleted_end) {
        (true, true) => Some((start, end - count)),
        (true, false) => Some((start, at.saturating_sub(1))),
        (false, true) => Some((at, end - count)),
        (false, false) => None,
    }
}

fn clamp_index(shifted: i64) -> u32 {
    if shifted <= 0 {
        0
    } else if shifted >= i64::from(u32::MAX) {
        u32::MAX
    } else {
        shifted as u32
    }
}

/// Serialize the authoritative AST into parseable formula source.
pub fn serialize(ast: &Ast) -> String {
    let mut out = String::from("=");
    write_ast(ast, &mut out);
    out
}

fn sheet_name_needs_quotes(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return true;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return true;
    }
    if chars.any(|ch| !(ch.is_ascii_alphanumeric() || ch == '_')) {
        return true;
    }
    parse_a1(name).is_some()
}

/// Rewrite resolved references by stable numeric handle and regenerate quoting metadata.
pub(crate) fn rename_sheet_refs(ast: &mut Ast, handle: u32, name: &str) -> bool {
    let mut changed = false;
    match ast {
        Ast::AbsCell(sheet, ..) | Ast::AbsRange(sheet, ..) if sheet.handle == handle => {
            sheet.name = name.to_string();
            sheet.quoted = sheet_name_needs_quotes(name);
            changed = true;
        }
        Ast::SheetSpan(span) => {
            for endpoint in [&mut span.first, &mut span.last] {
                if endpoint.handle == handle {
                    endpoint.name = name.to_string();
                    endpoint.quoted = sheet_name_needs_quotes(name);
                    changed = true;
                }
            }
        }
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                changed |= rename_sheet_refs(arg, handle, name);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            changed |= rename_sheet_refs(left, handle, name);
            changed |= rename_sheet_refs(right, handle, name);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            changed |= rename_sheet_refs(inner, handle, name);
        }
        _ => {}
    }
    changed
}

pub(crate) fn update_structured_refs<F>(ast: &mut Ast, table_id: &str, resolve: &F) -> bool
where
    F: Fn(&StructuredRef) -> Option<StructuredRef>,
{
    if let Ast::Structured(reference) = ast {
        if reference.table_id == table_id {
            *ast = resolve(reference).map_or(Ast::InvalidRef, |reference| {
                Ast::Structured(Box::new(reference))
            });
            return true;
        }
    }
    let mut changed = false;
    match ast {
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                changed |= update_structured_refs(arg, table_id, resolve);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            changed |= update_structured_refs(left, table_id, resolve);
            changed |= update_structured_refs(right, table_id, resolve);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            changed |= update_structured_refs(inner, table_id, resolve);
        }
        _ => {}
    }
    changed
}

/// Replace every resolved cell/range reference to a removed stable handle with `#REF!`.
/// 3-D references are left to [`refresh_sheet_spans`]: removing one of their
/// sheets shrinks the span instead.
pub(crate) fn invalidate_sheet_refs(ast: &mut Ast, handle: u32) -> bool {
    let invalid = matches!(
        ast,
        Ast::AbsCell(sheet, ..) | Ast::AbsRange(sheet, ..) if sheet.handle == handle
    ) || matches!(ast, Ast::Structured(reference) if reference.sheet == handle);
    if invalid {
        *ast = Ast::InvalidRef;
        return true;
    }

    let mut changed = false;
    match ast {
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                changed |= invalidate_sheet_refs(arg, handle);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            changed |= invalidate_sheet_refs(left, handle);
            changed |= invalidate_sheet_refs(right, handle);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            changed |= invalidate_sheet_refs(inner, handle);
        }
        _ => {}
    }
    changed
}

fn write_structured_ref(
    table_name: Option<&str>,
    column_name: &str,
    section: TableSection,
    out: &mut String,
) {
    if let Some(name) = table_name {
        out.push_str(name);
    }
    match section {
        TableSection::Body => {
            out.push('[');
            out.push_str(column_name);
            out.push(']');
        }
        TableSection::CurrentRow => {
            out.push_str("[@");
            out.push_str(column_name);
            out.push(']');
        }
        TableSection::Headers | TableSection::Totals => {
            out.push_str("[[");
            out.push_str(if section == TableSection::Headers {
                "#Headers"
            } else {
                "#Totals"
            });
            out.push_str("],[");
            out.push_str(column_name);
            out.push_str("]]");
        }
    }
}

fn write_ast(ast: &Ast, out: &mut String) {
    match ast {
        Ast::Num(value) => out.push_str(&value.to_string()),
        Ast::Str(value) => write_text(value, out),
        Ast::Bool(value) => out.push_str(if *value { "TRUE" } else { "FALSE" }),
        Ast::Name(name) => out.push_str(name),
        Ast::NamedRange(named) => out.push_str(&named.name),
        Ast::UnresolvedStructured(reference) => write_structured_ref(
            reference.table_name.as_deref(),
            &reference.column_name,
            reference.section,
            out,
        ),
        Ast::Structured(reference) => write_structured_ref(
            reference.qualified.then_some(reference.table_name.as_str()),
            &reference.column_name,
            reference.section,
            out,
        ),
        Ast::Cell(row, col, flags) => write_a1(*row, *col, *flags, out),
        Ast::SheetCell(sheet, row, col, flags) => {
            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*row, *col, *flags, out);
        }
        Ast::AbsCell(sheet, row, col, flags) => {
            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*row, *col, *flags, out);
        }
        Ast::Range(r0, c0, r1, c1, flags) => {
            write_a1(*r0, *c0, flags.start, out);
            out.push(':');
            write_a1(*r1, *c1, flags.end, out);
        }
        Ast::SheetRange(sheet, r0, c0, r1, c1, flags) => {
            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*r0, *c0, flags.start, out);
            out.push(':');
            write_a1(*r1, *c1, flags.end, out);
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, flags) => {
            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*r0, *c0, flags.start, out);
            out.push(':');
            write_a1(*r1, *c1, flags.end, out);
        }
        Ast::SheetSpan(span) => {
            // Excel quotes the whole span once: `'Sheet 1:Sheet 3'!A1`.
            if span.first.quoted || span.last.quoted {
                out.push('\'');
                out.push_str(&span.first.name.replace('\'', "''"));
                out.push(':');
                out.push_str(&span.last.name.replace('\'', "''"));
                out.push('\'');
            } else {
                out.push_str(&span.first.name);
                out.push(':');
                out.push_str(&span.last.name);
            }
            out.push('!');
            write_a1(span.row_start, span.col_start, span.flags.start, out);
            if !span.cell {
                out.push(':');
                write_a1(span.row_end, span.col_end, span.flags.end, out);
            }
        }
        Ast::Missing => {}
        #[cfg(feature = "analysis")]
        Ast::BoundMatrix { .. } => out.push_str("#CALC!"),
        Ast::InvalidRef => out.push_str("#REF!"),
        Ast::Array { cols, values } => {
            out.push('{');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    out.push(if index % *cols as usize == 0 {
                        ';'
                    } else {
                        ','
                    });
                }
                match value {
                    Value::Number(number) => out.push_str(&number.to_string()),
                    Value::Text(text) => write_text(text, out),
                    Value::Bool(value) => out.push_str(if *value { "TRUE" } else { "FALSE" }),
                    Value::Error(error) => out.push_str(error.sentinel()),
                    Value::Blank => {}
                }
            }
            out.push('}');
        }
        Ast::LetSlot { expression, .. } => write_ast(expression, out),
        Ast::Func(Func::AnchorArray, args) if args.len() == 1 => {
            write_ast(&args[0], out);
            // A deleted anchor writes as #REF!, which has no spill suffix.
            if !matches!(args[0], Ast::InvalidRef) {
                out.push('#');
            }
        }
        Ast::Func(Func::Union, areas) => {
            out.push('(');
            for (index, area) in areas.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast(area, out);
            }
            out.push(')');
        }
        Ast::Func(Func::Intersect, operands) => {
            for (index, operand) in operands.iter().enumerate() {
                if index > 0 {
                    out.push(' ');
                }
                // A signed operand needs its own parentheses, or the sign
                // would apply to the whole intersection when parsed again.
                let signed = matches!(operand, Ast::Neg(_) | Ast::Pos(_) | Ast::Percent(_));
                if signed {
                    out.push('(');
                }
                write_ast(operand, out);
                if signed {
                    out.push(')');
                }
            }
        }
        Ast::Func(func, args) => {
            out.push_str(func_name(*func));
            out.push('(');
            for (index, arg) in args.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast(arg, out);
            }
            out.push(')');
        }
        #[cfg(feature = "analysis")]
        Ast::UnknownFunc(name, args) if name == crate::eval::analysis::lambda::CALL => {
            if let Some(callee) = args.first() {
                write_ast(callee, out);
            }
            out.push('(');
            for (index, argument) in args.iter().skip(1).enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast(argument, out);
            }
            out.push(')');
        }
        Ast::UnknownFunc(name, args) => {
            out.push_str(name);
            out.push('(');
            for (index, arg) in args.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast(arg, out);
            }
            out.push(')');
        }
        Ast::Bin(op, left, right) => {
            out.push('(');
            write_ast(left, out);
            out.push(match op {
                Op::Add => '+',
                Op::Sub => '-',
                Op::Mul => '*',
                Op::Div => '/',
                Op::Pow => '^',
                Op::Concat => '&',
            });
            write_ast(right, out);
            out.push(')');
        }
        Ast::Cmp(op, left, right) => {
            out.push('(');
            write_ast(left, out);
            out.push_str(match op {
                CmpOp::Eq => "=",
                CmpOp::Ne => "<>",
                CmpOp::Lt => "<",
                CmpOp::Le => "<=",
                CmpOp::Gt => ">",
                CmpOp::Ge => ">=",
            });
            write_ast(right, out);
            out.push(')');
        }
        Ast::Neg(inner) => {
            out.push_str("-(");
            write_ast(inner, out);
            out.push(')');
        }
        Ast::Pos(inner) => {
            out.push_str("+(");
            write_ast(inner, out);
            out.push(')');
        }
        Ast::Percent(inner) => {
            out.push('(');
            write_ast(inner, out);
            out.push_str(")%");
        }
    }
}

fn write_text(value: &str, out: &mut String) {
    out.push('"');
    out.push_str(&value.replace('"', "\"\""));
    out.push('"');
}

fn write_sheet_name(name: &str, quoted: bool, out: &mut String) {
    if quoted {
        out.push('\'');
        out.push_str(&name.replace('\'', "''"));
        out.push('\'');
    } else {
        out.push_str(name);
    }
}

fn write_a1(row: u32, col: u32, flags: RefFlags, out: &mut String) {
    if flags.col_abs {
        out.push('$');
    }
    write_col(col, out);
    if flags.row_abs {
        out.push('$');
    }
    out.push_str(&(u64::from(row) + 1).to_string());
}

fn write_col(mut col: u32, out: &mut String) {
    let mut letters = [0u8; 7];
    let mut index = letters.len();
    loop {
        index -= 1;
        letters[index] = b'A' + (col % 26) as u8;
        if col < 26 {
            break;
        }
        col = col / 26 - 1;
    }
    out.push_str(std::str::from_utf8(&letters[index..]).expect("ASCII column letters"));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reference_operators_serialize_to_text_that_parses_back_to_the_same_tree() {
        for (source, expected) in [
            ("=SUM(A1:C3 B2:D4)", "=SUM(A1:C3 B2:D4)"),
            ("=a1   b2  c3", "=A1 B2 C3"),
            ("=(-A1) B1", "=(-(A1)) B1"),
            ("=A1:B2 'Other Sheet'!B1", "=A1:B2 'Other Sheet'!B1"),
            ("=SUM((A1:A2,C1:C2))", "=SUM((A1:A2,C1:C2))"),
            ("=INDEX(( A1:B2 , D1 ),1,1,2)", "=INDEX((A1:B2,D1),1,1,2)"),
            ("=SUM(Sheet1:Sheet3!A1:B2)", "=SUM(Sheet1:Sheet3!A1:B2)"),
            ("=SUM('My Sheet:Other'!$A$1)", "=SUM('My Sheet:Other'!$A$1)"),
            ("=SUM('My Sheet':Other!A1)", "=SUM('My Sheet:Other'!A1)"),
            ("=SUM('O''Brien:Last'!A1)", "=SUM('O''Brien:Last'!A1)"),
            ("=SUM(A1 + B1)", "=SUM((A1+B1))"),
            ("=SUM(#REF! B2:D4)", "=SUM(#REF! B2:D4)"),
            ("=SUM(B2:D4 #ref!)", "=SUM(B2:D4 #REF!)"),
        ] {
            let ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
            assert_eq!(serialize(&ast), expected, "{source}");
            assert_eq!(parse(expected).as_ref(), Ok(&ast), "{source}");
        }

        assert!(matches!(
            parse("=A1 B1"),
            Ok(Ast::Func(Func::Intersect, operands)) if operands.len() == 2
        ));
        assert!(matches!(parse("=SUM (A1)"), Ok(Ast::Func(Func::Sum, _))));
        assert!(matches!(
            parse("=Sheet1:Sheet3!A1"),
            Ok(Ast::SheetSpan(span)) if span.cell && span.first.name == "Sheet1"
        ));
    }

    #[test]
    fn spill_references_parse_and_serialize_with_a_hash_suffix() {
        for (source, expected) in [
            ("=A1#", "=A1#"),
            ("=sum($b$2#)", "=SUM($B$2#)"),
            ("=ROWS('My Sheet'!C3#)", "=ROWS('My Sheet'!C3#)"),
        ] {
            assert_eq!(serialize(&parse(source).unwrap()), expected, "{source}");
        }
        assert_eq!(
            parse("=A1#").unwrap(),
            Ast::Func(
                Func::AnchorArray,
                vec![Ast::Cell(0, 0, RefFlags::default())]
            )
        );
        // `#` only follows a cell, and the function name cannot be typed.
        for source in ["=A1:B2#", "=#", "=1#"] {
            assert!(parse(source).is_err(), "{source}");
        }
        assert!(matches!(
            parse("=ANCHORARRAY(A1)"),
            Ok(Ast::UnknownFunc(..))
        ));
    }

    #[test]
    fn parse_a1_accepts_absolute_markers() {
        assert_eq!(parse_a1("A1"), Some((0, 0, RefFlags::default())));
        assert_eq!(
            parse_a1("$A1"),
            Some((
                0,
                0,
                RefFlags {
                    row_abs: false,
                    col_abs: true
                }
            ))
        );
        assert_eq!(
            parse_a1("A$1"),
            Some((
                0,
                0,
                RefFlags {
                    row_abs: true,
                    col_abs: false
                }
            ))
        );
        assert_eq!(
            parse_a1("$A$1"),
            Some((
                0,
                0,
                RefFlags {
                    row_abs: true,
                    col_abs: true
                }
            ))
        );
        assert_eq!(
            parse_a1("aa$10"),
            Some((
                9,
                26,
                RefFlags {
                    row_abs: true,
                    col_abs: false
                }
            ))
        );

        assert_eq!(parse_a1("A0"), None);
        assert_eq!(parse_a1("$1"), None);
        assert_eq!(parse_a1("A$"), None);
    }

    #[test]
    fn operator_precedence_is_excel_compatible_and_errors_stay_explicit() {
        assert_eq!(serialize(&parse("=-1^2").unwrap()), "=(-(1)^2)");
        assert_eq!(serialize(&parse("=2^3^2").unwrap()), "=((2^3)^2)");
        assert_eq!(serialize(&parse("=1&2+3").unwrap()), "=(1&(2+3))");
        assert_eq!(serialize(&parse("=2^2%").unwrap()), "=(2^(2)%)");
        assert!(parse("=%2").is_err());
        assert!(parse("=2^").is_err());
        assert!(parse("=2&&3").is_err());
    }

    #[test]
    fn array_constants_parse_rows_and_columns_and_round_trip() {
        let shapes = [
            ("={1,2,3}", 3, 3, "={1,2,3}"),
            ("={1;2;3}", 1, 3, "={1;2;3}"),
            ("={1,2;3,4}", 2, 4, "={1,2;3,4}"),
            ("={ -1.5 , +2 }", 2, 2, "={-1.5,2}"),
            (
                "={\"a\"\"b\",true,False;#n/a,#DIV/0!,#REF!}",
                3,
                6,
                "={\"a\"\"b\",TRUE,FALSE;#N/A,#DIV/0!,#REF!}",
            ),
        ];
        for (source, expected_cols, expected_len, expected_text) in shapes {
            let ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
            let Ast::Array { cols, values } = &ast else {
                panic!("{source} did not parse as an array constant");
            };
            assert_eq!(
                (*cols, values.len()),
                (expected_cols, expected_len),
                "{source}"
            );
            assert_eq!(serialize(&ast), expected_text, "{source}");
            assert_eq!(parse(&serialize(&ast)).as_ref(), Ok(&ast), "{source}");
        }

        assert_eq!(
            parse("={\"x\",FALSE,#NAME?}"),
            Ok(Ast::Array {
                cols: 3,
                values: vec![
                    Value::text("x"),
                    Value::Bool(false),
                    Value::Error(FormulaError::Name),
                ],
            })
        );
        assert_eq!(
            serialize(&parse("=SUM({1,2},A1)").unwrap()),
            "=SUM({1,2},A1)"
        );
    }

    #[test]
    fn array_constants_reject_ragged_rows_references_and_expressions() {
        for source in [
            "={1,2;3}",
            "={1;2,3}",
            "={}",
            "={1,}",
            "={1;}",
            "={1,,2}",
            "={A1,2}",
            "={1+1}",
            "={(1)}",
            "={SUM(1)}",
            "={-\"a\"}",
            "={1,{2}}",
            "={1,2",
            "=1;2",
        ] {
            assert!(parse(source).is_err(), "{source} should not parse");
        }
    }

    #[test]
    fn seeded_operator_ast_round_trip_property() {
        fn generated(seed: &mut u64, depth: usize) -> Ast {
            *seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
            if depth == 0 {
                return Ast::Num(((*seed >> 32) % 10_000) as f64 / 100.0);
            }
            match *seed % 9 {
                0 => Ast::Neg(Box::new(generated(seed, depth - 1))),
                1 => Ast::Pos(Box::new(generated(seed, depth - 1))),
                2 => Ast::Percent(Box::new(generated(seed, depth - 1))),
                operator => {
                    let op = match operator {
                        3 => Op::Add,
                        4 => Op::Sub,
                        5 => Op::Mul,
                        6 => Op::Div,
                        7 => Op::Pow,
                        _ => Op::Concat,
                    };
                    Ast::Bin(
                        op,
                        Box::new(generated(seed, depth - 1)),
                        Box::new(generated(seed, depth - 1)),
                    )
                }
            }
        }

        let mut seed = 0x05ee_d070_u64;
        for _ in 0..512 {
            let ast = generated(&mut seed, 5);
            let source = serialize(&ast);
            assert_eq!(parse(&source), Ok(ast), "failed source: {source}");
        }
    }

    #[test]
    fn parse_rejects_deeply_nested_parentheses() {
        let mut src = String::new();
        for _ in 0..=PARSE_RECURSION_LIMIT {
            src.push('(');
        }
        src.push('1');
        for _ in 0..=PARSE_RECURSION_LIMIT {
            src.push(')');
        }

        assert!(parse(&src).is_err());
    }

    #[test]
    fn names_sheet_refs_and_unknown_calls_preserve_source_case() {
        assert_eq!(
            parse("=Revenue_Q1"),
            Ok(Ast::Name("Revenue_Q1".to_string()))
        );
        assert_eq!(
            parse("=Sales.Data"),
            Ok(Ast::Name("Sales.Data".to_string()))
        );

        let sheet_ref = parse("='North East'!a1").expect("quoted sheet ref should parse");
        assert_eq!(serialize(&sheet_ref), "='North East'!A1");
        assert_eq!(parse(&serialize(&sheet_ref)), Ok(sheet_ref));

        let unicode_sheet =
            parse("='München Süd'!b2").expect("UTF-8 quoted sheet ref should parse");
        assert_eq!(serialize(&unicode_sheet), "='München Süd'!B2");
        assert_eq!(parse(&serialize(&unicode_sheet)), Ok(unicode_sheet));
        assert_eq!(parse("=\"café\""), Ok(Ast::Str("café".to_string())));
        assert_eq!(
            serialize(&parse("=1\u{2003}+2").expect("Unicode whitespace should parse")),
            "=(1+2)"
        );

        let unknown =
            parse("=MiXeD.Call(Revenue_Q1)").expect("unknown call should remain parseable");
        assert_eq!(
            unknown,
            Ast::UnknownFunc(
                "MiXeD.Call".to_string(),
                vec![Ast::Name("Revenue_Q1".to_string())]
            )
        );
        assert_eq!(serialize(&unknown), "=MiXeD.Call(Revenue_Q1)");
    }

    #[test]
    fn heap_memory_stats_accounts_owning_ast_shapes() {
        let boxed = std::mem::size_of::<Ast>();
        let cases: Vec<(&str, Ast, usize)> = vec![
            ("string", Ast::Str("abc".to_string()), 3),
            ("name", Ast::Name("Total".to_string()), 5),
            (
                "named range",
                Ast::NamedRange(NamedRangeRef {
                    name: "Band".to_string(),
                    scope: None,
                    sheet: 1,
                    row_start: 0,
                    col_start: 0,
                    row_end: 4,
                    col_end: 0,
                }),
                4,
            ),
            (
                "unqualified structured ref",
                Ast::UnresolvedStructured(UnresolvedStructuredRef {
                    table_name: None,
                    column_name: "Amount".to_string(),
                    section: TableSection::Body,
                }),
                6,
            ),
            (
                "qualified structured ref",
                Ast::UnresolvedStructured(UnresolvedStructuredRef {
                    table_name: Some("Table1".to_string()),
                    column_name: "Amount".to_string(),
                    section: TableSection::Body,
                }),
                12,
            ),
            (
                "resolved structured ref",
                Ast::Structured(Box::new(StructuredRef {
                    table_id: "t1".to_string(),
                    table_name: "Table1".to_string(),
                    column_id: "c1".to_string(),
                    column_name: "Amount".to_string(),
                    sheet: 1,
                    row_start: 0,
                    row_end: 3,
                    col: 0,
                    section: TableSection::Body,
                    qualified: true,
                })),
                std::mem::size_of::<StructuredRef>() + 16,
            ),
            (
                "sheet cell",
                Ast::SheetCell(
                    UnresolvedSheetRef {
                        name: "Data".to_string(),
                        quoted: false,
                    },
                    0,
                    0,
                    RefFlags::default(),
                ),
                4,
            ),
            (
                "sheet range",
                Ast::SheetRange(
                    UnresolvedSheetRef {
                        name: "Data".to_string(),
                        quoted: false,
                    },
                    0,
                    0,
                    1,
                    1,
                    RangeFlags::default(),
                ),
                4,
            ),
            (
                "absolute cell",
                Ast::AbsCell(
                    SheetRef {
                        handle: 1,
                        name: "Wide".to_string(),
                        quoted: false,
                    },
                    0,
                    0,
                    RefFlags::default(),
                ),
                4,
            ),
            (
                "absolute range",
                Ast::AbsRange(
                    SheetRef {
                        handle: 1,
                        name: "Wide".to_string(),
                        quoted: false,
                    },
                    0,
                    0,
                    1,
                    1,
                    RangeFlags::default(),
                ),
                4,
            ),
            (
                "function arguments",
                Ast::Func(Func::Rept, vec![Ast::Num(1.0)]),
                boxed,
            ),
            (
                "unknown function",
                Ast::UnknownFunc("Foo".to_string(), vec![Ast::Num(1.0), Ast::Num(2.0)]),
                3 + boxed * 2,
            ),
            (
                "binary",
                Ast::Bin(Op::Add, Box::new(Ast::Num(1.0)), Box::new(Ast::Num(2.0))),
                boxed * 2,
            ),
            (
                "comparison",
                Ast::Cmp(CmpOp::Eq, Box::new(Ast::Num(1.0)), Box::new(Ast::Num(2.0))),
                boxed * 2,
            ),
            ("negation", Ast::Neg(Box::new(Ast::Num(1.0))), boxed),
            ("unary plus", Ast::Pos(Box::new(Ast::Num(1.0))), boxed),
            ("percent", Ast::Percent(Box::new(Ast::Num(1.0))), boxed),
            ("inline leaf", Ast::Cell(2, 3, RefFlags::default()), 0),
            ("invalid reference", Ast::InvalidRef, 0),
        ];
        for (label, ast, expected_logical) in cases {
            let mut stats = MemoryOwnerStats::default();
            ast.heap_memory_stats(&mut stats);
            assert_eq!(stats.logical_bytes, expected_logical, "{label}");
            assert!(stats.allocated_bytes >= stats.logical_bytes, "{label}");
        }
        assert_eq!(parse_col(""), None);
        assert_eq!(parse_col("A1"), None);
    }

    #[cfg(feature = "analysis")]
    #[test]
    fn analysis_names_resolve_to_their_family_without_shadowing_built_ins() {
        let names: Vec<&str> = crate::eval::analysis::names().collect();
        for name in &names {
            assert!(
                name.bytes().all(|byte| !byte.is_ascii_lowercase()),
                "{name} must be uppercase"
            );
            // A built-in or alias with the same spelling would win the lookup.
            let id = crate::eval::analysis::lookup(name).expect("registered analysis name");
            assert_eq!(lookup_func(name), Some(Func::Analysis(id)), "{name}");
            assert_eq!(
                lookup_func(&name.to_ascii_lowercase()),
                Some(Func::Analysis(id))
            );
            assert_eq!(func_name(Func::Analysis(id)), *name);
        }
        let listed = function_names();
        assert_eq!(
            listed.len(),
            FUNCTION_NAMES.len() + FUNCTION_ALIASES.len() + names.len(),
            "every spelling is listed once"
        );
        assert!(listed.windows(2).all(|pair| pair[0] < pair[1]));
    }
}
