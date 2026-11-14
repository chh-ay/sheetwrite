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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Op {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
    Concat,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Func {
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
    Lookup,
    TrimRange,
    ErrorType,
    Info,
    IsEven,
    IsNonText,
    IsOdd,
    IsRef,
    Sheet,
    Sheets,
    AverageA,
    MaxA,
    MinA,
    StdevA,
    StdevPA,
    VarA,
    VarPA,
    Acos,
    Acosh,
    Acot,
    Acoth,
    Arabic,
    Asin,
    Asinh,
    Atan,
    Atan2,
    Atanh,
    Base,
    CeilingPrecise,
    Cos,
    Cosh,
    Cot,
    Coth,
    Csc,
    Csch,
    Decimal,
    Degrees,
    FloorPrecise,
    IsoCeiling,
    Radians,
    Roman,
    Sec,
    Sech,
    Sin,
    Sinh,
    Tan,
    Tanh,
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
        Cos => "COS";
        Cot => "COT";
        Csc => "CSC";
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
        Sec => "SEC";
        Sin => "SIN";
        Sum => "SUM";
        Tan => "TAN";
        Xor => "XOR";
        Acos => "ACOS";
        Acot => "ACOT";
        Asin => "ASIN";
        Atan => "ATAN";
        Base => "BASE";
        Cell => "CELL";
        Char => "CHAR";
        Code => "CODE";
        Cosh => "COSH";
        Coth => "COTH";
        Csch => "CSCH";
        Date => "DATE";
        Days => "DAYS";
        Drop => "DROP";
        Even => "EVEN";
        Find => "FIND";
        Hour => "HOUR";
        IfNa => "IFNA";
        Info => "INFO";
        Ipmt => "IPMT";
        IsNa => "ISNA";
        Left => "LEFT";
        MaxA => "MAXA";
        MinA => "MINA";
        Ppmt => "PPMT";
        Rand => "RAND";
        Rate => "RATE";
        Rept => "REPT";
        Rows => "ROWS";
        Sech => "SECH";
        Sign => "SIGN";
        Sinh => "SINH";
        Sort => "SORT";
        Sqrt => "SQRT";
        Take => "TAKE";
        Tanh => "TANH";
        Text => "TEXT";
        Time => "TIME";
        Trim => "TRIM";
        True => "TRUE";
        Type => "TYPE";
        VarA => "VARA";
        Year => "YEAR";
        Acosh => "ACOSH";
        Acoth => "ACOTH";
        Areas => "AREAS";
        Asinh => "ASINH";
        Atan2 => "ATAN2";
        Atanh => "ATANH";
        Clean => "CLEAN";
        Count => "COUNT";
        EDate => "EDATE";
        Exact => "EXACT";
        False => "FALSE";
        Floor => "FLOOR";
        Index => "INDEX";
        IsErr => "ISERR";
        IsOdd => "ISODD";
        IsRef => "ISREF";
        Large => "LARGE";
        Log10 => "LOG10";
        Lower => "LOWER";
        Match => "MATCH";
        Month => "MONTH";
        Power => "POWER";
        Right => "RIGHT";
        Roman => "ROMAN";
        Round => "ROUND";
        Sheet => "SHEET";
        Small => "SMALL";
        SumIf => "SUMIF";
        Today => "TODAY";
        Trunc => "TRUNC";
        Upper => "UPPER";
        Value => "VALUE";
        VarP => "VAR.P";
        VarS => "VAR.S";
        VarPA => "VARPA";
        Arabic => "ARABIC";
        Choose => "CHOOSE";
        Column => "COLUMN";
        Concat => "CONCAT";
        Correl => "CORREL";
        CountA => "COUNTA";
        Filter => "FILTER";
        IsEven => "ISEVEN";
        IsText => "ISTEXT";
        Lookup => "LOOKUP";
        MaxIfs => "MAXIFS";
        Median => "MEDIAN";
        MinIfs => "MINIFS";
        Minute => "MINUTE";
        MRound => "MROUND";
        Offset => "OFFSET";
        Proper => "PROPER";
        Search => "SEARCH";
        Second => "SECOND";
        Sheets => "SHEETS";
        StdevA => "STDEVA";
        SumIfs => "SUMIFS";
        Switch => "SWITCH";
        Unique => "UNIQUE";
        XMatch => "XMATCH";
        Address => "ADDRESS";
        Ceiling => "CEILING";
        Columns => "COLUMNS";
        CountIf => "COUNTIF";
        Days360 => "DAYS360";
        Decimal => "DECIMAL";
        Degrees => "DEGREES";
        EOMonth => "EOMONTH";
        GeoMean => "GEOMEAN";
        HLookup => "HLOOKUP";
        IfError => "IFERROR";
        IsBlank => "ISBLANK";
        IsError => "ISERROR";
        Product => "PRODUCT";
        Radians => "RADIANS";
        RankEq => "RANK.EQ";
        Replace => "REPLACE";
        RoundUp => "ROUNDUP";
        StdevP => "STDEV.P";
        StdevS => "STDEV.S";
        StdevPA => "STDEVPA";
        UniChar => "UNICHAR";
        Unicode => "UNICODE";
        VLookup => "VLOOKUP";
        Weekday => "WEEKDAY";
        WeekNum => "WEEKNUM";
        Workday => "WORKDAY";
        XLookup => "XLOOKUP";
        AverageA => "AVERAGEA";
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
        IsNonText => "ISNONTEXT";
        ModeSngl => "MODE.SNGL";
        RoundDown => "ROUNDDOWN";
        TimeValue => "TIMEVALUE";
        Transpose => "TRANSPOSE";
        TrimRange => "TRIMRANGE";
        AverageIfs => "AVERAGEIFS";
        ChooseCols => "CHOOSECOLS";
        ChooseRows => "CHOOSEROWS";
        CountBlank => "COUNTBLANK";
        ErrorType => "ERROR.TYPE";
        Substitute => "SUBSTITUTE";
        SumProduct => "SUMPRODUCT";
        Concatenate => "CONCATENATE";
        FormulaText => "FORMULATEXT";
        IsoCeiling => "ISO.CEILING";
        NetworkDays => "NETWORKDAYS";
        NumberValue => "NUMBERVALUE";
        RandBetween => "RANDBETWEEN";
        CovarianceP => "COVARIANCE.P";
        CovarianceS => "COVARIANCE.S";
        QuartileInc => "QUARTILE.INC";
        FloorPrecise => "FLOOR.PRECISE";
        PercentileInc => "PERCENTILE.INC";
        CeilingPrecise => "CEILING.PRECISE";
    }
    aliases {
        "AVERAGE" => Avg;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CmpOp {
    Eq,
    Ne,
    Lt,
    Gt,
    Le,
    Ge,
}

/// The `$` markers of a cell reference, and whether its sheet name is
/// written quoted: bit 0 absolute row, bit 1 absolute column, bit 2 quoted.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct RefFlags(u8);

impl RefFlags {
    /// Both axes `$`-fixed.
    pub(crate) const ABSOLUTE: Self = Self::new(true, true);

    pub(crate) const fn new(row_abs: bool, col_abs: bool) -> Self {
        Self((row_abs as u8) | ((col_abs as u8) << 1))
    }

    pub(crate) const fn row_abs(self) -> bool {
        self.0 & 1 != 0
    }

    pub(crate) const fn col_abs(self) -> bool {
        self.0 & 2 != 0
    }

    pub(crate) const fn quoted(self) -> bool {
        self.0 & 4 != 0
    }

    pub(crate) const fn with_quoted(self, quoted: bool) -> Self {
        Self((self.0 & !4) | ((quoted as u8) << 2))
    }

    fn set_row_abs(&mut self, absolute: bool) {
        self.0 = (self.0 & !1) | u8::from(absolute);
    }

    fn set_col_abs(&mut self, absolute: bool) {
        self.0 = (self.0 & !2) | (u8::from(absolute) << 1);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct SheetRef {
    pub handle: u32,
}

/// One end of a 3-D sheet span such as `Jan:Mar!A1`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SheetSpanEndpoint {
    pub(crate) handle: u32,
    /// Present only while this endpoint is detached from a workbook.
    pub(crate) name: Option<Box<str>>,
    pub(crate) quoted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct UnresolvedSheetRef {
    pub name: String,
    pub quoted: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct RangeFlags {
    pub start: RefFlags,
    pub end: RefFlags,
}

impl RangeFlags {
    /// Every axis of both ends `$`-fixed.
    pub(crate) const ABSOLUTE: Self = Self {
        start: RefFlags::ABSOLUTE,
        end: RefFlags::ABSOLUTE,
    };
}

/// The handle of a 3-D reference endpoint before ingest resolves its name.
pub(crate) const UNRESOLVED_SHEET: u32 = u32::MAX;

/// `Sheet1:Sheet3!A1:B2`: one range on every sheet from `first` to `last` in
/// tab order.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SheetSpanRef {
    pub first: SheetSpanEndpoint,
    pub last: SheetSpanEndpoint,
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

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NamedRangeRef {
    pub name: String,
    pub scope: Option<u32>,
    pub sheet: u32,
    pub row_start: u32,
    pub col_start: u32,
    pub row_end: u32,
    pub col_end: u32,
}

/// A use of a defined name that holds a formula: the name, for writing the
/// formula back, and the name's formula expanded for the formula that uses
/// it. Formulas share one expansion when it does not depend on where they
/// are; see `CellStore::name_target`.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct NamedFormulaRef {
    pub name: String,
    pub expression: Ast,
    /// Nodes of `expression`, counting each name in it at its own count:
    /// what one walk over the expansion visits.
    pub nodes: usize,
}

/// What a defined name stands for in one formula.
#[derive(Clone)]
pub(crate) enum NameTarget {
    Range(NamedRangeRef),
    Formula(std::rc::Rc<NamedFormulaRef>),
    /// A reference with no sheet inside another name's expansion. It is
    /// placed in the expansion as it is, so it reads the sheet of the formula
    /// that evaluates it and the expansion does not depend on that sheet.
    Reference(Ast),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TableSection {
    Body,
    Headers,
    Totals,
    CurrentRow,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct UnresolvedStructuredRef {
    pub table_name: Option<String>,
    pub column_name: String,
    pub section: TableSection,
}

impl UnresolvedStructuredRef {
    /// The reference as it is written, to bind it to a table.
    pub(crate) fn written(&self) -> WrittenTableRef<'_> {
        WrittenTableRef {
            table: self.table_name.as_deref(),
            column: &self.column_name,
            section: self.section,
        }
    }
}

/// A table reference bound to a table slot of the store. It holds the cells
/// it covers, so evaluation reads it like a range; the table's names live
/// once, in the slot, and an edit of the table refreshes the cells of only
/// the formulas that use it. The column is the one at `col` in the table.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct StructuredRef {
    pub(crate) table: u16,
    pub(crate) section: TableSection,
    /// Written with its table name (`Sales[Amount]`).
    pub(crate) qualified: bool,
    pub(crate) sheet: u32,
    pub(crate) row_start: u32,
    pub(crate) row_end: u32,
    pub(crate) col: u32,
}

/// A sheet-qualified cell whose sheet is not one of this workbook's: an
/// external link, a missing sheet, or standalone syntax. It keeps the
/// written sheet text so the formula writes back exactly.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct DetachedCellRef {
    pub(crate) sheet: UnresolvedSheetRef,
    pub(crate) row: u32,
    pub(crate) col: u32,
    pub(crate) flags: RefFlags,
}

/// A sheet-qualified range whose sheet is not one of this workbook's: an
/// external link, a missing sheet, or standalone syntax. It keeps the
/// written sheet text so the formula writes back exactly.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct DetachedRangeRef {
    pub(crate) sheet: UnresolvedSheetRef,
    pub(crate) row_start: u32,
    pub(crate) col_start: u32,
    pub(crate) row_end: u32,
    pub(crate) col_end: u32,
    pub(crate) flags: RangeFlags,
}

/// An uncommon call whose function name is not a built-in.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UnknownCall {
    pub(crate) name: String,
    pub(crate) args: Box<[Ast]>,
}

/// The row-major values of an array constant.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ArrayLiteral {
    pub(crate) cols: u32,
    pub(crate) values: Vec<Value>,
}

/// A well-formed LAMBDA after its parameters are numbered
/// (`eval::analysis::lambda::resolve_parameters`). It is shared, so a
/// closure that holds it clones a handle instead of the body.
#[cfg(feature = "analysis")]
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct LambdaDefinition {
    /// The parameter declarations as written (`Ast::Name`), for writing
    /// the formula back.
    pub(crate) parameters: Box<[Ast]>,
    pub(crate) body: Ast,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Ast {
    Num(f64),
    Str(Rc<str>),
    Bool(bool),
    Missing,
    /// A use of a LAMBDA parameter, numbered when the formula was entered
    /// (`eval::analysis::lambda::resolve_parameters`). `depth` counts the
    /// LAMBDAs between the use and the one that declares the parameter;
    /// `index` is the parameter's position. A call reads the value from the
    /// pass's call frame. The name stays for writing the formula back.
    #[cfg(feature = "analysis")]
    Parameter {
        depth: u16,
        index: u16,
        name: Box<str>,
    },
    /// A well-formed LAMBDA whose parameter uses are numbered. Calls and the
    /// closures they create share its body.
    #[cfg(feature = "analysis")]
    #[allow(
        private_interfaces,
        reason = "LAMBDA definitions are not part of the public AST API"
    )]
    Lambda(std::rc::Rc<LambdaDefinition>),
    /// The literal pattern of a REGEX call, shared by every formula in the
    /// store with the same pattern text. Its compiled programs live as long
    /// as the formulas that hold it.
    #[cfg(feature = "analysis")]
    #[allow(
        private_interfaces,
        reason = "shared patterns are not part of the public AST API"
    )]
    RegexPattern(std::rc::Rc<crate::eval::regex_patterns::SharedPattern>),
    Name(Box<str>),
    NamedRange(Box<NamedRangeRef>),
    /// A defined name that holds a formula. Shared, because one name can be
    /// used by many formulas; never mutated in place.
    NamedFormula(std::rc::Rc<NamedFormulaRef>),
    UnresolvedStructured(Box<UnresolvedStructuredRef>),
    Structured(StructuredRef),
    Cell(u32, u32, RefFlags),
    SheetCell(Box<DetachedCellRef>),
    AbsCell(SheetRef, u32, u32, RefFlags),
    Range(u32, u32, u32, u32, RangeFlags),
    SheetRange(Box<DetachedRangeRef>),
    AbsRange(SheetRef, u32, u32, u32, u32, RangeFlags),
    /// Boxed: a span holds two sheet names and its handles, which would
    /// otherwise grow every node of every formula.
    SheetSpan(Box<SheetSpanRef>),
    InvalidRef,
    Func(Func, Box<[Self]>),
    UnknownFunc(Box<UnknownCall>),
    Bin(Op, Box<Self>, Box<Self>),
    Cmp(CmpOp, Box<Self>, Box<Self>),
    Neg(Box<Self>),
    Pos(Box<Self>),
    Percent(Box<Self>),
    /// One use of a LET binding in an expanded tree. `slot` identifies the
    /// binding for the evaluation in progress, so its expression is evaluated
    /// at most once however many uses the expansion has; `expression` stays
    /// in the tree so dependency, volatility and array analysis of the
    /// expansion still see the reads and the arrays.
    LetSlot {
        slot: u32,
        expression: Box<Self>,
    },
    /// A use, or the binding name, of a LET binding resolved when the formula
    /// was entered. The name stays for writing the formula back; `slot`
    /// numbers the binding within the outermost resolved LET, and evaluation
    /// reads the binding's expression from the LET itself instead of a copy
    /// (`eval::let_slots`).
    LetName {
        slot: u32,
        name: Box<str>,
    },
    /// An array constant such as `{1,2;3,4}`: row-major values with `cols`
    /// values in each row.
    Array(Box<ArrayLiteral>),
}

// Every node of every parsed formula is an `Ast`; large or rare variants are
// boxed to keep it at this size on wasm32 and native targets alike.
const _: () = assert!(
    std::mem::size_of::<Ast>() == 24,
    "Ast changed size: measure, then update this number"
);

impl Ast {
    /// The expression that a LET binding's use or a defined name stands
    /// for, through any number of them: what a function argument such as
    /// `MAP(A1:A3,MYFN)` passes.
    #[cfg(feature = "analysis")]
    pub(crate) fn bound_value(&self) -> &Self {
        let mut expression = self;
        loop {
            expression = match expression {
                Self::LetSlot {
                    expression: bound, ..
                } => bound,
                Self::NamedFormula(named) => &named.expression,
                Self::Num(_)
                | Self::Str(_)
                | Self::Bool(_)
                | Self::Missing
                | Self::Parameter { .. }
                | Self::Lambda(_)
                | Self::RegexPattern(_)
                | Self::Name(_)
                | Self::NamedRange(_)
                | Self::UnresolvedStructured(_)
                | Self::Structured(_)
                | Self::Cell(..)
                | Self::SheetCell(..)
                | Self::AbsCell(..)
                | Self::Range(..)
                | Self::SheetRange(..)
                | Self::AbsRange(..)
                | Self::SheetSpan(_)
                | Self::InvalidRef
                | Self::Func(..)
                | Self::UnknownFunc(..)
                | Self::Bin(..)
                | Self::Cmp(..)
                | Self::Neg(_)
                | Self::Pos(_)
                | Self::Percent(_)
                | Self::LetName { .. }
                | Self::Array { .. } => return expression,
            };
        }
    }

    /// Whether `test` holds for a direct child expression: a function
    /// argument, an operand, or the expression a LET use stands for. A named
    /// formula's expression is its own definition, not a child; a walker that
    /// follows names matches `Ast::NamedFormula` itself. Every node kind is
    /// listed, so a new kind must say whether it has children.
    pub(crate) fn any_child(&self, test: &mut dyn FnMut(&Self) -> bool) -> bool {
        match self {
            Self::Func(_, args) => args.iter().any(test),
            Self::UnknownFunc(call) => {
                let args = &call.args;
                args.iter().any(test)
            }
            Self::Bin(_, left, right) | Self::Cmp(_, left, right) => test(left) || test(right),
            Self::Neg(inner) | Self::Pos(inner) | Self::Percent(inner) => test(inner),
            Self::LetSlot { expression, .. } => test(expression),
            #[cfg(feature = "analysis")]
            Self::Parameter { .. } => false,
            #[cfg(feature = "analysis")]
            Self::Lambda(definition) => test(&definition.body),
            #[cfg(feature = "analysis")]
            Self::RegexPattern(_) => false,
            Self::LetName { .. } => false,
            Self::Num(_)
            | Self::Str(_)
            | Self::Bool(_)
            | Self::Missing
            | Self::Name(_)
            | Self::NamedRange(_)
            | Self::NamedFormula(_)
            | Self::UnresolvedStructured(_)
            | Self::Structured(_)
            | Self::Cell(..)
            | Self::SheetCell(..)
            | Self::AbsCell(..)
            | Self::Range(..)
            | Self::SheetRange(..)
            | Self::AbsRange(..)
            | Self::SheetSpan(_)
            | Self::InvalidRef
            | Self::Array(_) => false,
        }
    }

    /// Run `visit` on every direct child expression, as [`Ast::any_child`]
    /// finds them, and return whether any visit reported a change. Every
    /// child is visited, so one rewrite does not stop the others. Every node
    /// kind is listed, so a new kind must say whether it has children.
    pub(crate) fn fold_children_mut(&mut self, visit: &mut dyn FnMut(&mut Self) -> bool) -> bool {
        match self {
            Self::Func(_, args) => args
                .iter_mut()
                .fold(false, |changed, arg| visit(arg) | changed),
            Self::UnknownFunc(call) => {
                let args = &mut call.args;
                args.iter_mut()
                    .fold(false, |changed, arg| visit(arg) | changed)
            }
            Self::Bin(_, left, right) | Self::Cmp(_, left, right) => visit(left) | visit(right),
            Self::Neg(inner) | Self::Pos(inner) | Self::Percent(inner) => visit(inner),
            Self::LetSlot { expression, .. } => visit(expression),
            #[cfg(feature = "analysis")]
            Self::Parameter { .. } => false,
            // Writing through a shared definition gives this formula its own
            // copy; outside evaluation no closure shares it.
            #[cfg(feature = "analysis")]
            Self::Lambda(definition) => visit(&mut std::rc::Rc::make_mut(definition).body),
            #[cfg(feature = "analysis")]
            Self::RegexPattern(_) => false,
            Self::LetName { .. } => false,
            Self::Num(_)
            | Self::Str(_)
            | Self::Bool(_)
            | Self::Missing
            | Self::Name(_)
            | Self::NamedRange(_)
            | Self::NamedFormula(_)
            | Self::UnresolvedStructured(_)
            | Self::Structured(_)
            | Self::Cell(..)
            | Self::SheetCell(..)
            | Self::AbsCell(..)
            | Self::Range(..)
            | Self::SheetRange(..)
            | Self::AbsRange(..)
            | Self::SheetSpan(_)
            | Self::InvalidRef
            | Self::Array(_) => false,
        }
    }

    /// Heap payload owned below an inline AST root. The root itself is already
    /// included in its formula hash-table bucket.
    pub(crate) fn heap_memory_stats(&self, out: &mut MemoryOwnerStats) {
        match self {
            #[cfg(feature = "analysis")]
            Self::Parameter { name, .. } => out.add_payload(name.len(), name.len()),
            #[cfg(feature = "analysis")]
            Self::Lambda(definition) => {
                // An `Rc` allocation holds its strong and weak counts first.
                const RC_COUNT_BYTES: usize = std::mem::size_of::<(usize, usize)>();
                let bytes = RC_COUNT_BYTES + std::mem::size_of::<LambdaDefinition>();
                out.add_payload(bytes, bytes);
                let LambdaDefinition { parameters, body } = &**definition;
                add_ast_slice_memory(parameters, out);
                body.heap_memory_stats(out);
            }
            // The store's pattern index counts each shared pattern once.
            #[cfg(feature = "analysis")]
            Self::RegexPattern(_) => {}
            Self::Str(value) => {
                // The shared string owns its strong and weak counts as well
                // as its UTF-8 bytes; the inline Rc handle is in the AST root.
                let allocated = value.len().saturating_add(2 * std::mem::size_of::<usize>());
                out.add_payload(value.len(), allocated);
            }
            Self::Name(value) => out.add_payload(value.len(), value.len()),
            Self::LetName { name, .. } => out.add_payload(name.len(), name.len()),
            Self::NamedRange(value) => {
                let bytes = std::mem::size_of::<NamedRangeRef>();
                out.add_payload(bytes, bytes);
                add_string_memory(&value.name, out);
            }
            // A shared expansion is counted once, by the store's cache that
            // also holds it; an expansion only this formula holds is its own.
            Self::NamedFormula(value) if std::rc::Rc::strong_count(value) == 1 => {
                let bytes = std::mem::size_of::<NamedFormulaRef>();
                out.add_payload(bytes, bytes);
                add_string_memory(&value.name, out);
                value.expression.heap_memory_stats(out);
            }
            Self::NamedFormula(_) => {}
            Self::UnresolvedStructured(value) => {
                let bytes = std::mem::size_of::<UnresolvedStructuredRef>();
                out.add_payload(bytes, bytes);
                if let Some(name) = &value.table_name {
                    add_string_memory(name, out);
                }
                add_string_memory(&value.column_name, out);
            }
            Self::Structured(_) | Self::AbsCell(..) | Self::AbsRange(..) => {}
            Self::SheetCell(reference) => {
                let bytes = std::mem::size_of::<DetachedCellRef>();
                out.add_payload(bytes, bytes);
                add_string_memory(&reference.sheet.name, out);
            }
            Self::SheetRange(reference) => {
                let bytes = std::mem::size_of::<DetachedRangeRef>();
                out.add_payload(bytes, bytes);
                add_string_memory(&reference.sheet.name, out);
            }
            Self::SheetSpan(span) => {
                let bytes = std::mem::size_of::<SheetSpanRef>();
                out.add_payload(bytes, bytes);
                for endpoint in [&span.first, &span.last] {
                    if let Some(name) = &endpoint.name {
                        out.add_payload(name.len(), name.len());
                    }
                }
                out.add_vec::<u32>(span.sheets.len(), span.sheets.capacity());
            }
            Self::Func(_, args) => add_ast_slice_memory(args, out),
            Self::UnknownFunc(call) => {
                let UnknownCall { name, args } = &**call;

                let bytes = std::mem::size_of::<UnknownCall>();
                out.add_payload(bytes, bytes);
                add_string_memory(name, out);
                add_ast_slice_memory(args, out);
            }
            Self::Bin(_, left, right) | Self::Cmp(_, left, right) => {
                add_boxed_ast_memory(left, out);
                add_boxed_ast_memory(right, out);
            }
            Self::Neg(inner) | Self::Pos(inner) | Self::Percent(inner) => {
                add_boxed_ast_memory(inner, out);
            }
            Self::LetSlot { expression, .. } => add_boxed_ast_memory(expression, out),
            Self::Array(array) => {
                let ArrayLiteral { values, .. } = &**array;

                let payload = std::mem::size_of::<ArrayLiteral>();
                out.add_payload(payload, payload);
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
            Self::Num(_)
            | Self::Bool(_)
            | Self::Missing
            | Self::Cell(..)
            | Self::Range(..)
            | Self::InvalidRef => {}
        }
    }
}

fn add_string_memory(value: &String, out: &mut MemoryOwnerStats) {
    out.add_payload(value.len(), value.capacity());
}

fn add_ast_slice_memory(values: &[Ast], out: &mut MemoryOwnerStats) {
    out.add_payload(
        values.len().saturating_mul(std::mem::size_of::<Ast>()),
        values.len().saturating_mul(std::mem::size_of::<Ast>()),
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
pub(crate) fn parse_a1(token: &str) -> Option<(u32, u32, RefFlags)> {
    let col_abs = token.starts_with('$');
    let unmarked = token.strip_prefix('$').unwrap_or(token);

    let mut letters_end = 0;

    for (idx, ch) in unmarked.char_indices() {
        if !ch.is_ascii_alphabetic() {
            break;
        }

        letters_end = idx + ch.len_utf8();
    }

    if letters_end == 0 {
        return None;
    }

    let letters = &unmarked[..letters_end];
    let row_token = &unmarked[letters_end..];
    let row_abs = row_token.starts_with('$');
    let digits = row_token.strip_prefix('$').unwrap_or(row_token);

    if digits.is_empty() || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    let col = parse_col(letters)?;
    let row = row_index(digits.parse().ok()?)?;

    (col < SHEET_COLS).then_some((row, col, RefFlags::new(row_abs, col_abs)))
}

/// The 0-based index of a 1-based row number inside the sheet.
fn row_index(row_number: u32) -> Option<u32> {
    (1..=SHEET_ROWS)
        .contains(&row_number)
        .then(|| row_number - 1)
}

/// One end of an area reference: a cell (`B2`), a whole column (`$B`) or a
/// whole row (`2`).
#[derive(Clone, Copy)]
pub(crate) enum AreaEnd {
    Cell(u32, u32, RefFlags),
    Column(u32, bool),
    Row(u32, bool),
}

impl AreaEnd {
    /// A row number arrives as a number token unless it has a `$` marker.
    pub(crate) fn of(token: &Tok<'_>) -> Option<Self> {
        match token {
            Tok::Ident(name, _) => Self::of_name(name),
            Tok::Num(number) if number.fract() == 0.0 && *number <= f64::from(SHEET_ROWS) => {
                row_index(*number as u32).map(|row| Self::Row(row, false))
            }
            Tok::Num(_)
            | Tok::Str(_)
            | Tok::Structured(_)
            | Tok::Op(_)
            | Tok::LParen
            | Tok::RParen
            | Tok::Comma
            | Tok::Semicolon
            | Tok::LBrace
            | Tok::RBrace
            | Tok::Colon
            | Tok::Bang
            | Tok::Cmp(_)
            | Tok::Error(_)
            | Tok::Hash
            | Tok::Intersect
            | Tok::End => None,
        }
    }

    fn of_name(name: &str) -> Option<Self> {
        if let Some((row, col, flags)) = parse_a1(name) {
            return Some(Self::Cell(row, col, flags));
        }

        let absolute = name.starts_with('$');
        let bare = name.strip_prefix('$').unwrap_or(name);
        if bare.bytes().all(|byte| byte.is_ascii_alphabetic()) {
            let col = parse_col(bare).filter(|&col| col < SHEET_COLS)?;
            return Some(Self::Column(col, absolute));
        }
        if !bare.is_empty() && bare.bytes().all(|byte| byte.is_ascii_digit()) {
            let row = row_index(bare.parse().ok()?)?;
            return Some(Self::Row(row, absolute));
        }
        None
    }
}

/// The range between two ends of one kind; `A:1` and `A1:B` have none.
pub(crate) fn area(start: AreaEnd, end: AreaEnd) -> Option<(u32, u32, u32, u32, RangeFlags)> {
    let whole_axis = |col_abs, row_abs| RefFlags::new(row_abs, col_abs);
    Some(match (start, end) {
        (AreaEnd::Cell(row, col, flags), AreaEnd::Cell(end_row, end_col, end_flags)) => {
            normalize_range(row, col, flags, end_row, end_col, end_flags)
        }
        (AreaEnd::Column(col, col_abs), AreaEnd::Column(end_col, end_abs)) => normalize_range(
            0,
            col,
            whole_axis(col_abs, true),
            SHEET_ROWS - 1,
            end_col,
            whole_axis(end_abs, true),
        ),
        (AreaEnd::Row(row, row_abs), AreaEnd::Row(end_row, end_abs)) => normalize_range(
            row,
            0,
            whole_axis(true, row_abs),
            end_row,
            SHEET_COLS - 1,
            whole_axis(true, end_abs),
        ),
        _ => return None,
    })
}

/// Whether a range spans every row of the sheet: a whole-column range.
const fn spans_all_rows(row_start: u32, row_end: u32) -> bool {
    row_start == 0 && row_end == SHEET_ROWS - 1
}

/// Whether a range spans every column of the sheet: a whole-row range.
const fn spans_all_cols(col_start: u32, col_end: u32) -> bool {
    col_start == 0 && col_end == SHEET_COLS - 1
}

fn normalize_range(
    row: u32,
    col: u32,
    flags: RefFlags,
    end_row: u32,
    end_col: u32,
    end_flags: RefFlags,
) -> (u32, u32, u32, u32, RangeFlags) {
    let start_flags = RefFlags::new(
        if row <= end_row {
            flags.row_abs()
        } else {
            end_flags.row_abs()
        },
        if col <= end_col {
            flags.col_abs()
        } else {
            end_flags.col_abs()
        },
    );

    let normalized_end_flags = RefFlags::new(
        if row <= end_row {
            end_flags.row_abs()
        } else {
            flags.row_abs()
        },
        if col <= end_col {
            end_flags.col_abs()
        } else {
            flags.col_abs()
        },
    );

    let mut range_flags = RangeFlags {
        start: start_flags,
        end: normalized_end_flags,
    };
    let (row_start, row_end) = (row.min(end_row), row.max(end_row));
    let (col_start, col_end) = (col.min(end_col), col.max(end_col));
    // The rows of a whole column, and the columns of a whole row, are fixed:
    // no edit or copy moves them, so they behave as absolute.
    if spans_all_rows(row_start, row_end) {
        range_flags.start.set_row_abs(true);
        range_flags.end.set_row_abs(true);
    }
    if spans_all_cols(col_start, col_end) {
        range_flags.start.set_col_abs(true);
        range_flags.end.set_col_abs(true);
    }

    (row_start, col_start, row_end, col_end, range_flags)
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Tok<'a> {
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
    /// The end of the text. Only the syntax check of formula help adds it
    /// (`first_parse_error`), so that an error can tell a missing token from
    /// a wrong one. The lexer never produces it.
    End,
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

/// What the last token means for spaces after it: they can be the
/// intersection operator only after a token that can end a reference.
#[derive(Clone, Copy)]
pub(crate) enum ReferenceEdge {
    /// Not a reference end: a separator, an operator or the start.
    None,
    /// A name: a reference end unless `(` follows, which makes it a call.
    Name,
    /// `)`, a table reference, a spill `#` or `#REF!`.
    Reference,
}

impl ReferenceEdge {
    /// `#REF!` is a reference operand too: a deleted operand serializes as
    /// it, and the formula must parse back to the same intersection.
    pub(crate) const fn after(previous: Option<&Tok<'_>>) -> Self {
        match previous {
            Some(Tok::Ident(..)) => Self::Name,
            Some(Tok::RParen | Tok::Structured(_) | Tok::Hash | Tok::Error(FormulaError::Ref)) => {
                Self::Reference
            }
            _ => Self::None,
        }
    }
}

/// Whether spaces between a token with `edge` and `rest` are the
/// intersection operator: they follow a token that can end a reference and
/// precede one that can start one. Spaces around other operators, after
/// separators and before `)` stay insignificant. A name followed by spaces
/// and `(` is a function call, not an intersection between a named range and
/// a parenthesized reference.
fn separates_references(edge: ReferenceEdge, rest: &str) -> bool {
    const DELETED_REFERENCE: &str = "#REF!";

    let Some(next) = rest.chars().next() else {
        return false;
    };
    let ends_reference = match edge {
        ReferenceEdge::Name => next != '(',
        ReferenceEdge::Reference => true,
        ReferenceEdge::None => false,
    };
    let starts_reference = next.is_alphabetic()
        || matches!(next, '$' | '_' | '\\' | '\'' | '(')
        || rest
            .get(..DELETED_REFERENCE.len())
            .is_some_and(|text| text.eq_ignore_ascii_case(DELETED_REFERENCE));
    ends_reference && starts_reference
}

/// Reads the number at `*index`: digits with one optional decimal point, then
/// an optional exponent (`E3`, `e-3`, `E+03`). An `E` without exponent digits
/// is left for the next token.
fn number_token(src: &str, index: &mut usize) -> Result<f64, String> {
    let bytes = src.as_bytes();
    let start = *index;
    let mut saw_decimal = false;
    while let Some(&byte) = bytes.get(*index) {
        if byte == b'.' && !saw_decimal {
            saw_decimal = true;
        } else if !byte.is_ascii_digit() {
            break;
        }
        *index += 1;
    }

    if matches!(bytes.get(*index), Some(b'e' | b'E')) {
        let signed = matches!(bytes.get(*index + 1), Some(b'+' | b'-'));
        let digits_start = *index + 1 + usize::from(signed);
        if bytes.get(digits_start).is_some_and(u8::is_ascii_digit) {
            *index = digits_start;
            while bytes.get(*index).is_some_and(u8::is_ascii_digit) {
                *index += 1;
            }
        }
    }

    let number = &src[start..*index];
    number
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .ok_or_else(|| format!("{number} is not a valid number."))
}

/// The token of one ASCII punctuation byte, or `None` for any other byte.
const fn punctuation_token(byte: u8) -> Option<Tok<'static>> {
    Some(match byte {
        b'+' | b'-' | b'*' | b'/' | b'^' | b'&' | b'%' => Tok::Op(byte as char),
        b'(' => Tok::LParen,
        b')' => Tok::RParen,
        b',' => Tok::Comma,
        b';' => Tok::Semicolon,
        b'{' => Tok::LBrace,
        b'}' => Tok::RBrace,
        b':' => Tok::Colon,
        b'!' => Tok::Bang,
        b'#' => Tok::Hash,
        _ => return None,
    })
}

/// Reads the token at `*index` and moves `*index` past it. Whitespace gives
/// `Ok(None)`, except where it is the intersection operator after `previous`.
/// The parser's cursor and every other reader of formula text lex with this
/// one step, so they cannot disagree about where a token ends. After an
/// error, `*index` is past the bad text when its end is known: an open quote
/// or bracket runs to the end of `src`; an unknown character is not consumed.
#[inline(always)]
pub(crate) fn lex_token<'a>(
    src: &'a str,
    index: &mut usize,
    previous: Option<&Tok<'a>>,
) -> Result<Option<Tok<'a>>, String> {
    lex_token_after(src, index, ReferenceEdge::after(previous))
}

/// [`lex_token`] after a token with `edge`.
#[inline(always)]
fn lex_token_after<'a>(
    src: &'a str,
    index: &mut usize,
    edge: ReferenceEdge,
) -> Result<Option<Tok<'a>>, String> {
    let bytes = src.as_bytes();
    let c = bytes[*index];

    let tok = if c.is_ascii_whitespace() {
        while bytes.get(*index).is_some_and(u8::is_ascii_whitespace) {
            *index += 1;
        }
        if !separates_references(edge, &src[*index..]) {
            return Ok(None);
        }
        Tok::Intersect
    } else if c == b'"' {
        Tok::Str(quoted_token(src, index, b'"', "Add \" to close the text.")?)
    } else if c.is_ascii_digit()
        || (c == b'.' && bytes.get(*index + 1).is_some_and(u8::is_ascii_digit))
    {
        Tok::Num(number_token(src, index)?)
    } else if c == b'\'' {
        Tok::Ident(
            Cow::Owned(quoted_token(
                src,
                index,
                b'\'',
                "Add ' to close the sheet name.",
            )?),
            true,
        )
    } else if let Some((literal, error)) = (c == b'#')
        .then(|| {
            ERROR_LITERALS.iter().find(|(literal, _)| {
                bytes[*index..]
                    .get(..literal.len())
                    .is_some_and(|text| text.eq_ignore_ascii_case(literal.as_bytes()))
            })
        })
        .flatten()
    {
        *index += literal.len();
        Tok::Error(*error)
    } else if c == b'[' {
        Tok::Structured(structured_token(src, index)?)
    } else if c == b'$'
        || c == b'_'
        || c == b'\\'
        || c.is_ascii_alphabetic()
        || (!c.is_ascii()
            && src[*index..]
                .chars()
                .next()
                .is_some_and(char::is_alphabetic))
    {
        ident_token(src, index)
    } else if c == b'<' || c == b'>' || c == b'=' {
        comparison_token(bytes, index)
    } else if let Some(tok) = punctuation_token(c) {
        *index += 1;
        tok
    } else if !c.is_ascii() {
        let ch = src[*index..].chars().next().expect("valid UTF-8 source");
        if !ch.is_whitespace() {
            return Err(format!("{ch} is not allowed in a formula."));
        }
        *index += ch.len_utf8();
        return Ok(None);
    } else {
        return Err(format!("{} is not allowed in a formula.", c as char));
    };

    Ok(Some(tok))
}

/// The name at `*index`: letters, digits, `$`, `_`, `.` and `\`. ASCII
/// bytes, which most names are, are read without decoding a character.
fn ident_token<'a>(src: &'a str, index: &mut usize) -> Tok<'a> {
    let start = *index;
    let bytes = src.as_bytes();

    while let Some(&byte) = bytes.get(*index) {
        if byte.is_ascii() {
            if !(byte.is_ascii_alphanumeric() || matches!(byte, b'$' | b'_' | b'.' | b'\\')) {
                break;
            }
            *index += 1;
            continue;
        }

        let ch = src[*index..].chars().next().expect("valid UTF-8 source");
        if !ch.is_alphanumeric() {
            break;
        }
        *index += ch.len_utf8();
    }

    Tok::Ident(Cow::Borrowed(&src[start..*index]), false)
}

/// `<`, `<=`, `<>`, `>`, `>=` or `=` at `*index`.
fn comparison_token(bytes: &[u8], index: &mut usize) -> Tok<'static> {
    let (op, len) = match (bytes[*index], bytes.get(*index + 1)) {
        (b'<', Some(b'=')) => (CmpOp::Le, 2),
        (b'>', Some(b'=')) => (CmpOp::Ge, 2),
        (b'<', Some(b'>')) => (CmpOp::Ne, 2),
        (b'=', _) => (CmpOp::Eq, 1),
        (b'<', _) => (CmpOp::Lt, 1),
        _ => (CmpOp::Gt, 1),
    };

    *index += len;
    Tok::Cmp(op)
}

/// The `[...]` at `*index`, nested brackets included.
fn structured_token(src: &str, index: &mut usize) -> Result<String, String> {
    let bytes = src.as_bytes();
    let start = *index;
    let mut depth = 0usize;

    while *index < bytes.len() {
        match bytes[*index] {
            b'[' => depth += 1,
            b']' => depth -= 1,
            _ => {}
        }
        *index += 1;
        if depth == 0 {
            break;
        }
    }

    if depth != 0 {
        return Err("Add ] to close the table reference.".into());
    }
    Ok(src[start..*index].to_string())
}

/// The section and column name of a table reference.
type StructuredParts<'a> = (TableSection, &'a str);

/// The section and column name of a `[...]` table reference token.
fn structured_parts(raw: &str) -> Result<StructuredParts<'_>, String> {
    if !raw.starts_with('[') || !raw.ends_with(']') {
        return Err("This table reference is not valid.".into());
    }
    let (section, column_name) = if raw.starts_with("[[") && raw.ends_with("]]") {
        let inner = &raw[2..raw.len() - 2];
        let Some((selector, column)) = inner.split_once("],[") else {
            return Err("Write a table reference with one section and one column.".into());
        };
        let section = if selector.eq_ignore_ascii_case("#Headers") {
            TableSection::Headers
        } else if selector.eq_ignore_ascii_case("#Totals") {
            TableSection::Totals
        } else {
            return Err("Use #Headers or #Totals as the section of a table reference.".into());
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
        return Err("Enter a column name in the table reference.".into());
    }
    Ok((section, column_name))
}

/// Most tokens the parser looks ahead of the next one: `Sheet1:Sheet3!`
/// is recognized from its first name. A power of two, so the ring wraps
/// with a mask.
const LOOKAHEAD: usize = 4;

/// The parser's tokens, lexed on demand from the formula text, or read from
/// formula help's token list. Lexing stops at the first lex error, which the
/// parse reports in place of any parse error, as a separate tokenizing step
/// would.
struct Cursor<'a> {
    src: &'a str,
    index: usize,
    /// Formula help's tokens; `None` when lexing `src`.
    tokens: Option<std::vec::IntoIter<Tok<'a>>>,
    edge: ReferenceEdge,
    ahead: [Option<Tok<'a>>; LOOKAHEAD],
    ahead_start: usize,
    ahead_len: usize,
    /// Tokens the parser has read.
    consumed: usize,
    lex_error: Option<String>,
}

impl<'a> Cursor<'a> {
    const fn over_text(src: &'a str) -> Self {
        Self {
            src,
            index: 0,
            tokens: None,
            edge: ReferenceEdge::None,
            ahead: [None, None, None, None],
            ahead_start: 0,
            ahead_len: 0,
            consumed: 0,
            lex_error: None,
        }
    }

    fn over_tokens(tokens: Vec<Tok<'a>>) -> Self {
        Self {
            tokens: Some(tokens.into_iter()),
            ..Self::over_text("")
        }
    }

    fn lex_next(&mut self) -> Option<Tok<'a>> {
        if let Some(tokens) = &mut self.tokens {
            return tokens.next();
        }

        if self.lex_error.is_some() {
            return None;
        }

        while self.index < self.src.len() {
            match lex_token_after(self.src, &mut self.index, self.edge) {
                Ok(Some(tok)) => {
                    self.edge = ReferenceEdge::after(Some(&tok));
                    return Some(tok);
                }
                Ok(None) => {}
                Err(error) => {
                    self.lex_error = Some(error);
                    return None;
                }
            }
        }

        None
    }

    /// Whether `count` tokens are ahead, lexing them when needed. Out of
    /// line so each peek and read inlines only the buffered case.
    #[inline(never)]
    fn fill(&mut self, count: usize) -> bool {
        while self.ahead_len < count {
            let Some(tok) = self.lex_next() else {
                return false;
            };
            self.ahead[(self.ahead_start + self.ahead_len) & (LOOKAHEAD - 1)] = Some(tok);
            self.ahead_len += 1;
        }

        true
    }

    #[inline(never)]
    fn peek_at(&mut self, offset: usize) -> Option<&Tok<'a>> {
        if self.ahead_len <= offset && !self.fill(offset + 1) {
            return None;
        }

        self.ahead[(self.ahead_start + offset) & (LOOKAHEAD - 1)].as_ref()
    }

    /// Out of line: the parser reads tokens at many sites, and one copy of
    /// the ring step keeps the parser small.
    #[inline(never)]
    fn next(&mut self) -> Option<Tok<'a>> {
        if self.ahead_len == 0 && !self.fill(1) {
            return None;
        }

        let tok = self.ahead[self.ahead_start].take();
        self.ahead_start = (self.ahead_start + 1) & (LOOKAHEAD - 1);
        self.ahead_len -= 1;
        self.consumed += 1;
        tok
    }

    /// The first lex error of the text, lexing whatever the parser left.
    fn lex_error(&mut self) -> Option<String> {
        while self.lex_error.is_none() && self.lex_next().is_some() {}
        self.lex_error.take()
    }
}

/// A parsed formula and the resolution steps it needs, or the parse error.
pub(crate) type ParseResult = Result<(Ast, ParseFeatures), String>;

/// Finds the handle of the workbook sheet a formula names.
pub(crate) type SheetResolver<'a> = dyn Fn(&str) -> Option<u32> + 'a;

/// Gives a 3-D reference with bound endpoints the sheets it spans; fails when
/// an endpoint is not in the tab order.
pub(crate) type SpanPlacer<'a> = dyn Fn(&mut SheetSpanRef) -> bool + 'a;

/// Binds a table reference to a table slot while the formula is parsed.
/// `None` keeps the reference unbound, an error when read, until a table
/// edit binds it.
pub(crate) type TableBinder<'a> = dyn Fn(WrittenTableRef<'_>) -> Option<StructuredRef> + 'a;

/// Which resolution steps a parsed formula needs: each is set when the
/// formula holds a node that the step rewrites, so ingest skips the others.
#[derive(Clone, Copy, Default)]
pub(crate) struct ParseFeatures {
    /// A sheet-qualified cell, range or 3-D reference.
    pub(crate) sheet_refs: bool,
    /// A bare name or an unknown function, which may name a defined name.
    pub(crate) names: bool,
    /// A table reference, bound or not.
    pub(crate) table_refs: bool,
    /// A sheet reference left detached: an external link or a sheet that the
    /// workbook does not have.
    pub(crate) detached_sheets: bool,
    /// A LAMBDA, whose parameter uses are numbered before the formula is
    /// stored.
    #[cfg(feature = "analysis")]
    pub(crate) lambdas: bool,
}

/// Binary operator levels, loosest first. A comparison does not chain.
const COMPARISON: u8 = 1;
const CONCATENATION: u8 = 2;
const ADDITION: u8 = 3;
const MULTIPLICATION: u8 = 4;
const POWER: u8 = 5;

#[derive(Clone, Copy)]
enum BinaryOperator {
    Cmp(CmpOp),
    Op(Op),
}

/// The level and operator of a binary operator token.
#[inline]
const fn binary_operator(tok: &Tok<'_>) -> Option<(u8, BinaryOperator)> {
    Some(match tok {
        Tok::Cmp(op) => (COMPARISON, BinaryOperator::Cmp(*op)),
        Tok::Op('&') => (CONCATENATION, BinaryOperator::Op(Op::Concat)),
        Tok::Op('+') => (ADDITION, BinaryOperator::Op(Op::Add)),
        Tok::Op('-') => (ADDITION, BinaryOperator::Op(Op::Sub)),
        Tok::Op('*') => (MULTIPLICATION, BinaryOperator::Op(Op::Mul)),
        Tok::Op('/') => (MULTIPLICATION, BinaryOperator::Op(Op::Div)),
        Tok::Op('^') => (POWER, BinaryOperator::Op(Op::Pow)),
        Tok::Num(_)
        | Tok::Str(_)
        | Tok::Ident(..)
        | Tok::Structured(_)
        | Tok::Op(_)
        | Tok::LParen
        | Tok::RParen
        | Tok::Comma
        | Tok::Semicolon
        | Tok::LBrace
        | Tok::RBrace
        | Tok::Colon
        | Tok::Bang
        | Tok::Error(_)
        | Tok::Hash
        | Tok::Intersect
        | Tok::End => return None,
    })
}

#[derive(Clone, Copy)]
struct SheetBinding<'a> {
    resolve: &'a SheetResolver<'a>,
    place_span: &'a SpanPlacer<'a>,
    bind_table: &'a TableBinder<'a>,
}

struct Parser<'a, 's> {
    cursor: Cursor<'a>,
    features: ParseFeatures,
    sheets: Option<SheetBinding<'s>>,
    /// The arguments of the calls being parsed, innermost last. Each call
    /// moves its own into one exact allocation when it closes.
    args: Vec<Ast>,
}

thread_local! {
    /// The argument stack, kept between parses so ingest does not allocate
    /// it for every formula.
    static PARSE_ARGS: std::cell::Cell<Vec<Ast>> = const { std::cell::Cell::new(Vec::new()) };
}

impl<'a> Parser<'a, '_> {
    #[inline]
    fn peek(&mut self) -> Option<&Tok<'a>> {
        self.cursor.peek_at(0)
    }

    #[inline]
    fn next(&mut self) -> Option<Tok<'a>> {
        self.cursor.next()
    }

    /// The `)` that closes a call or a group. A missing `)` at the end and a
    /// wrong token in its place get different messages.
    fn close_paren(&mut self) -> Result<(), String> {
        match self.next() {
            Some(Tok::RParen) => Ok(()),
            None | Some(Tok::End) => Err(MISSING_CLOSE_PAREN.into()),
            Some(_) => Err(NOT_EXPECTED.into()),
        }
    }

    fn guard_depth(depth: usize) -> Result<(), String> {
        if depth > PARSE_RECURSION_LIMIT {
            Err("The formula has too many nested levels.".into())
        } else {
            Ok(())
        }
    }

    fn expr(&mut self) -> Result<Ast, String> {
        self.expr_at(0)
    }

    fn expr_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;
        self.binary_at(COMPARISON, depth)
    }

    /// Operands joined by binary operators of level `min_level` or tighter.
    /// Each level is left-associative; a comparison takes one right operand
    /// and ends the expression.
    fn binary_at(&mut self, min_level: u8, depth: usize) -> Result<Ast, String> {
        let mut left = self.postfix_at(depth)?;

        while let Some((level, operator)) = self.peek().and_then(binary_operator) {
            if level < min_level {
                break;
            }

            let _ = self.next();
            let right = Box::new(self.binary_at(level + 1, depth)?);
            let left_operand = Box::new(left);
            left = match operator {
                BinaryOperator::Cmp(op) => Ast::Cmp(op, left_operand, right),
                BinaryOperator::Op(op) => Ast::Bin(op, left_operand, right),
            };

            if level == COMPARISON {
                break;
            }
        }

        Ok(left)
    }

    fn postfix_at(&mut self, depth: usize) -> Result<Ast, String> {
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
            self.close_paren()?;
            self.features.names = true;
            value = Ast::UnknownFunc(Box::new(UnknownCall {
                name: "$LAMBDA_CALL".into(),
                args: args.into(),
            }));
        }
        while self.peek() == Some(&Tok::Op('%')) {
            let _ = self.next();
            value = Ast::Percent(Box::new(value));
        }
        Ok(value)
    }

    fn unary_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        if let Some(Tok::Op(peeked @ ('+' | '-'))) = self.peek() {
            let sign = *peeked;
            let _ = self.next();
            let inner = Box::new(self.unary_at(depth + 1)?);
            return Ok(if sign == '-' {
                Ast::Neg(inner)
            } else {
                Ast::Pos(inner)
            });
        }
        // Intersection binds tighter than every operator except `:`.
        let value = self.primary_at(depth)?;
        if self.peek() == Some(&Tok::Intersect) {
            return self.intersection_at(value, depth);
        }
        Ok(value)
    }

    /// The rest of `A1:C3 B2:D4` after its first operand. A chain keeps one
    /// flat operand list, since the order of intersection does not change
    /// its cells.
    #[cold]
    fn intersection_at(&mut self, first: Ast, depth: usize) -> Result<Ast, String> {
        let mut operands = vec![first];
        while self.peek() == Some(&Tok::Intersect) {
            let _ = self.next();
            operands.push(self.primary_at(depth)?);
        }
        Ok(Ast::Func(Func::Intersect, operands.into()))
    }

    /// A number, or the first row of a whole-row range such as `1:3`.
    fn number_or_rows_at(&mut self, number: f64) -> Result<Ast, String> {
        if self.peek() == Some(&Tok::Colon) {
            if let Some(start) = AreaEnd::of(&Tok::Num(number)) {
                let _ = self.next();
                let (r0, c0, r1, c1, range_flags) = self.area_after_colon(start)?;
                return Ok(Ast::Range(r0, c0, r1, c1, range_flags));
            }
        }
        Ok(Ast::Num(number))
    }

    fn primary_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        match self.next() {
            Some(Tok::Num(n)) => self.number_or_rows_at(n),
            Some(Tok::Str(value)) => Ok(Ast::Str(value.into())),
            Some(Tok::LParen) => {
                let first = self.expr_at(depth + 1)?;
                let value = if self.peek() == Some(&Tok::Comma) {
                    let mut areas = vec![first];
                    while self.peek() == Some(&Tok::Comma) {
                        let _ = self.next();
                        areas.push(self.expr_at(depth + 1)?);
                    }
                    Ast::Func(Func::Union, areas.into())
                } else {
                    first
                };
                self.close_paren()?;
                Ok(value)
            }
            Some(Tok::Ident(name, quoted)) => self.ident_at(name, quoted, depth),
            Some(Tok::Structured(raw)) => self.structured_or_external_at(raw),
            Some(Tok::Error(FormulaError::Ref)) => Ok(Ast::InvalidRef),
            Some(Tok::LBrace) => self.array_constant(),
            None | Some(Tok::End) => Err("Enter a value to complete the formula.".into()),
            Some(_) => Err("Enter a value before this.".into()),
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
                        return Err(
                            "All rows of an array constant must have the same length.".into()
                        );
                    }
                    if separator == Tok::RBrace {
                        break;
                    }
                    row_len = 0;
                }
                None | Some(Tok::End) => return Err("Add } to close the array constant.".into()),
                _ => return Err("Use , ; or } between the values of an array constant.".into()),
            }
        }
        let width =
            u32::try_from(cols).map_err(|_| "The array constant is too wide.".to_owned())?;
        Ok(Ast::Array(Box::new(ArrayLiteral {
            cols: width,
            values,
        })))
    }

    /// One array-constant element: a number with an optional sign, text, a
    /// logical value, or an error. References and expressions are rejected.
    fn array_element(&mut self) -> Result<Value, String> {
        let value = match self.next() {
            Some(Tok::Num(number)) => Value::number(number),
            Some(Tok::Op(sign @ ('+' | '-'))) => match self.next() {
                Some(Tok::Num(number)) => Value::number(if sign == '-' { -number } else { number }),
                _ => return Err("Enter a number after the sign in an array constant.".into()),
            },
            Some(Tok::Str(text)) => Value::text(text),
            Some(Tok::Ident(name, false)) if name.eq_ignore_ascii_case("TRUE") => Value::Bool(true),
            Some(Tok::Ident(name, false)) if name.eq_ignore_ascii_case("FALSE") => {
                Value::Bool(false)
            }
            Some(Tok::Error(error)) => Value::Error(error),
            _ => {
                return Err(
                    "An array constant can contain only numbers, text, logical values and errors."
                        .into(),
                )
            }
        };
        Ok(value)
    }

    fn structured_ref(&mut self, raw: &str, table_name: Option<&str>) -> Result<Ast, String> {
        self.features.table_refs = true;
        let (section, column_name) = structured_parts(raw)?;
        let written = WrittenTableRef {
            table: table_name,
            column: column_name,
            section,
        };
        let bound = self
            .sheets
            .and_then(|binding| (binding.bind_table)(written));
        Ok(bound.map_or_else(
            || {
                Ast::UnresolvedStructured(Box::new(UnresolvedStructuredRef {
                    table_name: table_name.map(str::to_owned),
                    column_name: column_name.to_owned(),
                    section,
                }))
            },
            Ast::Structured,
        ))
    }

    /// A `[...]` that starts an operand. Before `Sheet1!`, it is the workbook
    /// of an external reference (`[Budget.xlsx]Annual!C10`), kept as a sheet
    /// reference whose name holds the workbook. Otherwise it is a table
    /// reference of the current table.
    fn structured_or_external_at(&mut self, raw: String) -> Result<Ast, String> {
        let names_sheet = matches!(self.cursor.peek_at(0), Some(Tok::Ident(_, false)))
            && matches!(self.cursor.peek_at(1), Some(Tok::Bang));
        if !names_sheet {
            // `[Budget.xlsx]!Total`: a defined name of the other workbook.
            let names_name = matches!(self.cursor.peek_at(0), Some(Tok::Bang))
                && matches!(self.cursor.peek_at(1), Some(Tok::Ident(_, false)));
            if names_name {
                let _ = self.next();
                return self.external_name_at(raw);
            }
            return self.structured_ref(&raw, None);
        }

        let Some(Tok::Ident(sheet, _)) = self.next() else {
            unreachable!("peeked external sheet name");
        };
        let _ = self.next();
        self.sheet_ref_at(format!("{raw}{sheet}").into(), false)
    }

    fn ident_at(&mut self, name: Cow<'a, str>, quoted: bool, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;
        match self.peek() {
            Some(Tok::Structured(_)) => {
                let Some(Tok::Structured(raw)) = self.next() else {
                    unreachable!("peeked structured token");
                };
                return self.structured_ref(&raw, Some(&name));
            }
            Some(Tok::Colon) => {
                let spans_sheets = matches!(self.cursor.peek_at(1), Some(Tok::Ident(..)))
                    && matches!(self.cursor.peek_at(2), Some(Tok::Bang));
                if spans_sheets {
                    let _ = self.next();
                    let Some(Tok::Ident(last, last_quoted)) = self.next() else {
                        unreachable!("peeked 3-D reference end");
                    };
                    let _ = self.next();
                    // Excel quotes a span as a whole, so either quoted end quotes both.
                    return self.sheet_span_at(
                        name.into_owned(),
                        last.into_owned(),
                        quoted || last_quoted,
                    );
                }
            }
            Some(Tok::Bang) => {
                let _ = self.next();
                return self.sheet_ref_at(name, quoted);
            }
            Some(Tok::LParen) => {
                let _ = self.next();
                return self.call_at(name, depth);
            }
            _ => {}
        }

        if name.eq_ignore_ascii_case("TRUE") {
            return Ok(Ast::Bool(true));
        }
        if name.eq_ignore_ascii_case("FALSE") {
            return Ok(Ast::Bool(false));
        }

        if self.peek() == Some(&Tok::Colon) {
            if let Some(start) = AreaEnd::of_name(name.as_ref()) {
                let _ = self.next();
                let (r0, c0, r1, c1, range_flags) = self.area_after_colon(start)?;
                return Ok(Ast::Range(r0, c0, r1, c1, range_flags));
            }
        }
        if let Some((row, col, flags)) = parse_a1(name.as_ref()) {
            Ok(self.spill_suffix(Ast::Cell(row, col, flags)))
        } else {
            self.features.names = true;
            Ok(Ast::Name((name.into_owned()).into()))
        }
    }

    /// The arguments of a call to `name` after its `(`.
    fn call_at(&mut self, name: Cow<'a, str>, depth: usize) -> Result<Ast, String> {
        let func = lookup_func(name.as_ref());
        #[cfg(feature = "analysis")]
        if func == Some(Func::Analysis(crate::eval::analysis::LAMBDA_ID)) {
            self.features.lambdas = true;
        }
        let first = self.args.len();
        if self.peek() != Some(&Tok::RParen) {
            loop {
                let arg = if matches!(self.peek(), Some(Tok::Comma | Tok::RParen)) {
                    Ast::Missing
                } else {
                    self.expr_at(depth + 1)?
                };
                self.args.push(arg);
                match self.peek() {
                    Some(Tok::Comma) => {
                        let _ = self.next();
                    }
                    _ => break,
                }
            }
        }
        self.close_paren()?;
        let args: Box<[Ast]> = self.args.drain(first..).collect();
        Ok(if let Some(known) = func {
            Ast::Func(known, args)
        } else {
            self.features.names = true;
            Ast::UnknownFunc(Box::new(UnknownCall {
                name: name.into_owned(),
                args,
            }))
        })
    }

    fn sheet_ref_at(&mut self, sheet_name: Cow<'a, str>, quoted: bool) -> Result<Ast, String> {
        if quoted && !is_external_sheet(&sheet_name) && !sheet_name.contains(['\\', '/']) {
            if let Some((first, last)) = sheet_name.split_once(':') {
                return self.sheet_span_at(first.to_owned(), last.to_owned(), true);
            }
        }
        let names_name = matches!(self.peek(), Some(Tok::Ident(name, false)) if parse_a1(name).is_none())
            && self.cursor.peek_at(1) != Some(&Tok::Colon)
            && names_workbook(&sheet_name);
        if names_name {
            let qualifier = if quoted {
                format!("'{}'", sheet_name.replace('\'', "''"))
            } else {
                sheet_name.into_owned()
            };
            return self.external_name_at(qualifier);
        }
        self.features.sheet_refs = true;
        let start = self.area_end("!")?;
        let bound = self
            .sheets
            .and_then(|binding| (binding.resolve)(&sheet_name));
        self.features.detached_sheets |= bound.is_none();
        if matches!(self.peek(), Some(Tok::Colon)) {
            let _ = self.next();
            let (end_sheet, end) = self.sheet_range_end(&sheet_name)?;
            if sheet_name_key(&end_sheet) != sheet_name_key(&sheet_name) {
                return Err("A range must stay on one sheet.".into());
            }
            let (r0, c0, r1, c1, mut flags) = area(start, end).ok_or(MIXED_AREA)?;
            flags.start = flags.start.with_quoted(quoted);
            return Ok(match bound {
                Some(handle) => Ast::AbsRange(SheetRef { handle }, r0, c0, r1, c1, flags),
                None => Ast::SheetRange(Box::new(DetachedRangeRef {
                    sheet: UnresolvedSheetRef {
                        name: sheet_name.into_owned(),
                        quoted,
                    },
                    row_start: r0,
                    col_start: c0,
                    row_end: r1,
                    col_end: c1,
                    flags,
                })),
            });
        }
        let AreaEnd::Cell(row, col, cell_flags) = start else {
            return Err(LONE_AXIS.into());
        };
        let flags = cell_flags.with_quoted(quoted);
        let reference = match bound {
            Some(handle) => Ast::AbsCell(SheetRef { handle }, row, col, flags),
            None => Ast::SheetCell(Box::new(DetachedCellRef {
                sheet: UnresolvedSheetRef {
                    name: sheet_name.into_owned(),
                    quoted,
                },
                row,
                col,
                flags,
            })),
        };
        Ok(self.spill_suffix(reference))
    }

    /// The cell or range after the `!` of a 3-D reference from sheet `first`
    /// to sheet `last`.
    #[cold]
    fn sheet_span_at(&mut self, first: String, last: String, quoted: bool) -> Result<Ast, String> {
        self.features.sheet_refs = true;
        let start = self.area_end("!")?;
        let (cell, (row_start, col_start, row_end, col_end, range_flags)) =
            if self.peek() == Some(&Tok::Colon) {
                let _ = self.next();
                (false, self.area_after_colon(start)?)
            } else if let AreaEnd::Cell(row, col, flags) = start {
                (true, normalize_range(row, col, flags, row, col, flags))
            } else {
                return Err(LONE_AXIS.into());
            };

        let endpoint = |name: String| match self.sheets.and_then(|binding| (binding.resolve)(&name))
        {
            Some(handle) => SheetSpanEndpoint {
                handle,
                name: None,
                quoted,
            },
            None => SheetSpanEndpoint {
                handle: UNRESOLVED_SHEET,
                name: Some(name.into_boxed_str()),
                quoted,
            },
        };
        let mut span = SheetSpanRef {
            first: endpoint(first),
            last: endpoint(last),
            sheets: Vec::new(),
            row_start,
            col_start,
            row_end,
            col_end,
            flags: range_flags,
            cell,
        };
        if span.first.handle == UNRESOLVED_SHEET || span.last.handle == UNRESOLVED_SHEET {
            self.features.detached_sheets = true;
        } else if let Some(binding) = self.sheets {
            (binding.place_span)(&mut span);
        }
        Ok(Ast::SheetSpan(Box::new(span)))
    }

    /// The defined name after `qualifier!`, where `qualifier` names another
    /// workbook as the formula writes it. The name keeps that text, which
    /// `external_name_key` reads to find the name in the link.
    #[cold]
    fn external_name_at(&mut self, qualifier: String) -> Result<Ast, String> {
        let Some(Tok::Ident(name, _)) = self.next() else {
            return Err(NOT_EXPECTED.into());
        };
        self.features.names = true;
        Ok(Ast::Name((format!("{qualifier}!{name}")).into()))
    }

    /// `A1#` refers to the whole spill of the formula in A1. It is stored as
    /// `ANCHORARRAY(A1)`, the form that XLSX files use.
    fn spill_suffix(&mut self, anchor: Ast) -> Ast {
        if self.peek() == Some(&Tok::Hash) {
            let _ = self.next();
            Ast::Func(Func::AnchorArray, (vec![anchor]).into())
        } else {
            anchor
        }
    }

    /// The end of `Sheet1!A1:B2` or of `Sheet1!A1:Sheet1!B2`, with the sheet
    /// the end names.
    fn sheet_range_end(&mut self, sheet_name: &str) -> Result<(String, AreaEnd), String> {
        let first = self.next();
        if let Some(Tok::Ident(end_sheet, _)) = &first {
            if self.peek() == Some(&Tok::Bang) {
                let end_sheet_name = end_sheet.to_string();
                let _ = self.next();
                return Ok((end_sheet_name, self.area_end("!")?));
            }
        }

        let end = first
            .as_ref()
            .and_then(AreaEnd::of)
            .ok_or_else(|| missing_area_end(":"))?;
        Ok((sheet_name.to_owned(), end))
    }

    /// The cell, column or row in the next token.
    fn area_end(&mut self, after: &str) -> Result<AreaEnd, String> {
        self.next()
            .as_ref()
            .and_then(AreaEnd::of)
            .ok_or_else(|| missing_area_end(after))
    }

    /// The range from `start` to the end after the `:` just read.
    fn area_after_colon(
        &mut self,
        start: AreaEnd,
    ) -> Result<(u32, u32, u32, u32, RangeFlags), String> {
        let end = self.area_end(":")?;
        area(start, end).ok_or_else(|| MIXED_AREA.into())
    }
}

const MIXED_AREA: &str = "A range joins two cells, two columns or two rows.";
const LONE_AXIS: &str = "A column or row needs a range such as A:A or 1:1.";
const NOT_EXPECTED: &str = "This is not expected here.";
const MISSING_CLOSE_PAREN: &str = "Add ) to close the (.";

fn missing_area_end(after: &str) -> String {
    format!("Enter a cell, column or row after {after}.")
}

/// The lookup key of a sheet name: the name without case. For a sheet of
/// another workbook, the folder before `[` is left out, so
/// `C:\Reports\[Budget.xlsx]Annual` finds the link `[Budget.xlsx]Annual`.
pub(crate) fn sheet_name_key(name: &str) -> String {
    let book_and_sheet = name.rfind('[').map_or(name, |start| &name[start..]);
    book_and_sheet
        .chars()
        .flat_map(char::to_lowercase)
        .collect()
}

/// The lookup key of a defined name of another workbook, from the text a
/// formula writes: `Budget.xlsx!Total`, `'C:\Reports\Budget.xlsx'!Total`,
/// `[Budget.xlsx]!Total` and `'C:\Reports\[Budget.xlsx]'!Total` all give
/// `[BUDGET.XLSX]!TOTAL`; the sheet-scoped `[Budget.xlsx]Annual!Total`
/// gives `[BUDGET.XLSX]ANNUAL!TOTAL`. The folder and the letter case are
/// left out, as for link sheets. A quote in a book or sheet name stays
/// doubled, as a quoted formula writes it. `None` for a name without a
/// workbook.
pub(crate) fn external_name_key(text: &str) -> Option<String> {
    let (quoted_qualifier, name) = text.rsplit_once('!')?;
    let qualifier = quoted_qualifier
        .strip_prefix('\'')
        .and_then(|inner| inner.strip_suffix('\''))
        .unwrap_or(quoted_qualifier);
    let key = if let Some(start) = qualifier.rfind('[') {
        format!("{}!{name}", &qualifier[start..])
    } else {
        let folder_end = qualifier.rfind('\\').max(qualifier.rfind('/'));
        let book = folder_end.map_or(qualifier, |at| &qualifier[at + 1..]);
        format!("[{book}]!{name}")
    };
    Some(key.to_uppercase())
}

/// Whether the text before `!` names another workbook: a sheet of it
/// (`[Budget.xlsx]Annual`), or its file (`Budget.xlsx`,
/// `C:\Reports\Budget.xlsx`). A file name has an extension, and a path
/// has a folder; Excel sheet names hold neither `\\` nor `/`.
fn names_workbook(qualifier: &str) -> bool {
    is_external_sheet(qualifier) || qualifier.contains(['.', '\\', '/'])
}

/// Whether a sheet reference names a sheet of another workbook:
/// `[Budget.xlsx]Annual` or `C:\Reports\[Budget.xlsx]Annual`. Excel sheet
/// names cannot hold `[` or `]`, so a bracket marks the workbook.
pub(crate) fn is_external_sheet(name: &str) -> bool {
    name.contains(']')
}

/// The error for a token after a complete formula.
fn trailing_token_error(tok: &Tok<'_>) -> String {
    if *tok == Tok::RParen {
        "This ) has no matching (.".into()
    } else {
        NOT_EXPECTED.into()
    }
}

/// Parse a formula source (with or without a leading `=`) into an AST.
pub(crate) fn parse(src: &str) -> Result<Ast, String> {
    parse_with_features(src).map(|(ast, _)| ast)
}

/// [`parse`], with the resolution steps the formula needs.
pub(crate) fn parse_with_features(src: &str) -> ParseResult {
    parse_source(src, None)
}

/// Bind a sheet token to its stable id while constructing its reference node.
pub(crate) fn parse_bound_with_features(
    src: &str,
    resolve: &SheetResolver<'_>,
    place_span: &SpanPlacer<'_>,
    bind_table: &TableBinder<'_>,
) -> ParseResult {
    parse_source(
        src,
        Some(SheetBinding {
            resolve,
            place_span,
            bind_table,
        }),
    )
}

fn parse_source(src: &str, sheets: Option<SheetBinding<'_>>) -> ParseResult {
    let trimmed = src.trim().strip_prefix('=').unwrap_or(src.trim());
    let mut parser = Parser {
        cursor: Cursor::over_text(trimmed),
        features: ParseFeatures::default(),
        sheets,
        args: PARSE_ARGS.take(),
    };
    let parsed = parser.expr();
    let trailing = match parsed {
        Ok(_) => parser.peek().map(trailing_token_error),
        Err(_) => None,
    };
    // A failed parse leaves the arguments of its open calls behind.
    parser.args.clear();
    PARSE_ARGS.set(std::mem::take(&mut parser.args));
    if let Some(error) = parser.cursor.lex_error() {
        return Err(error);
    }
    let ast = parsed?;
    if let Some(error) = trailing {
        return Err(error);
    }
    Ok((ast, parser.features))
}

/// The first error of the parser in `toks`, which end with [`Tok::End`], and
/// the index of the token it marks: the token that the parser read last, or
/// the first token after a complete formula. `None` when the tokens form one
/// formula. This is the parse of `parse` on tokens from formula help's
/// tolerant lexer, so formula help reports exactly what the parser rejects.
pub(crate) fn first_parse_error(toks: Vec<Tok<'_>>) -> Option<(String, usize)> {
    let mut parser = Parser {
        cursor: Cursor::over_tokens(toks),
        features: ParseFeatures::default(),
        sheets: None,
        args: Vec::new(),
    };

    let result = parser.expr();
    let read = parser.cursor.consumed;
    match result {
        Ok(_) => match parser.peek() {
            None | Some(Tok::End) => None,
            Some(tok) => Some((trailing_token_error(tok), read)),
        },
        Err(message) => Some((message, read.saturating_sub(1))),
    }
}

/// Resolve sheet-qualified refs to numeric sheet handles once, at formula ingest.
/// `place_span` gives a resolved 3-D reference the sheets it spans, and fails
/// when an endpoint is not in the tab order.
pub(crate) fn bind_sheet_refs(
    ast: &mut Ast,
    resolve: &SheetResolver<'_>,
    place_span: &SpanPlacer<'_>,
) -> bool {
    // Every node other than a sheet reference or a defined name's formula
    // binds through its children.
    if let Ast::SheetCell(reference) = ast {
        let Some(handle) = resolve(&reference.sheet.name) else {
            return false;
        };
        *ast = Ast::AbsCell(
            SheetRef { handle },
            reference.row,
            reference.col,
            reference.flags,
        );
        return true;
    }
    if let Ast::SheetRange(reference) = ast {
        let Some(handle) = resolve(&reference.sheet.name) else {
            return false;
        };
        *ast = Ast::AbsRange(
            SheetRef { handle },
            reference.row_start,
            reference.col_start,
            reference.row_end,
            reference.col_end,
            reference.flags,
        );
        return true;
    }
    if let Ast::SheetSpan(span) = ast {
        let mut changed = false;
        for endpoint in [&mut span.first, &mut span.last] {
            if let Some(name) = endpoint.name.as_deref() {
                if let Some(handle) = resolve(name) {
                    endpoint.handle = handle;
                    endpoint.name = None;
                    changed = true;
                }
            }
        }
        if span.first.handle != UNRESOLVED_SHEET && span.last.handle != UNRESOLVED_SHEET {
            changed |= place_span(span);
        }
        return changed;
    }
    if let Ast::NamedFormula(named) = ast {
        return bind_sheet_refs(
            &mut std::rc::Rc::make_mut(named).expression,
            resolve,
            place_span,
        );
    }
    ast.fold_children_mut(&mut |child| bind_sheet_refs(child, resolve, place_span))
}

pub(crate) fn has_unresolved_local_sheets(ast: &Ast) -> bool {
    // Other nodes hold sheet references only through their children.
    if let Ast::SheetCell(reference) = ast {
        return !is_external_sheet(&reference.sheet.name);
    }
    if let Ast::SheetRange(reference) = ast {
        return !is_external_sheet(&reference.sheet.name);
    }
    if let Ast::SheetSpan(span) = ast {
        return span.first.name.is_some() || span.last.name.is_some();
    }
    if let Ast::NamedFormula(named) = ast {
        return has_unresolved_local_sheets(&named.expression);
    }
    ast.any_child(&mut has_unresolved_local_sheets)
}

pub(crate) fn unresolved_sheet_names(ast: &Ast, out: &mut Vec<String>) {
    // Other nodes hold sheet references only through their children.
    if let Ast::SheetCell(reference) = ast {
        out.push(sheet_name_key(&reference.sheet.name));
    } else if let Ast::SheetRange(reference) = ast {
        out.push(sheet_name_key(&reference.sheet.name));
    } else if let Ast::SheetSpan(span) = ast {
        for endpoint in [&span.first, &span.last] {
            if let Some(name) = endpoint.name.as_deref() {
                out.push(sheet_name_key(name));
            }
        }
    } else if let Ast::NamedFormula(named) = ast {
        unresolved_sheet_names(&named.expression, out);
    } else {
        ast.any_child(&mut |child| {
            unresolved_sheet_names(child, out);
            false
        });
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

/// Whether the formula's own tree holds a 3-D reference; a defined name's
/// spans belong to the name, which `refresh_sheet_spans` does not rewrite.
pub(crate) fn ast_contains_sheet_span(ast: &Ast) -> bool {
    matches!(ast, Ast::SheetSpan(_)) || ast.any_child(&mut ast_contains_sheet_span)
}

/// Re-places every 3-D reference in `ast` after tabs were moved, inserted or
/// removed, as Excel does: removed sheets leave the span, a removed endpoint
/// gives way to its nearest surviving neighbour inside the span, and an
/// endpoint moved past the other endpoint leaves the span, so its inner
/// neighbour becomes the endpoint. A span without surviving sheets becomes
/// `#REF!`. `names` holds the sheet name of each handle.
pub(crate) fn refresh_sheet_spans(ast: &mut Ast, order: &[u32], names: &[String]) -> bool {
    match ast {
        Ast::SheetSpan(span) => {
            if let Some(changed) = refresh_span(span, order, names) {
                changed
            } else {
                *ast = Ast::InvalidRef;
                true
            }
        }
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::NamedRange(_)
        | Ast::NamedFormula(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(..)
        | Ast::AbsRange(..)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => {
            ast.fold_children_mut(&mut |child| refresh_sheet_spans(child, order, names))
        }
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => {
            ast.fold_children_mut(&mut |child| refresh_sheet_spans(child, order, names))
        }
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
            endpoint.name = None;
            endpoint.quoted = sheet_name_needs_quotes(name);
        }
    }
    span.sheets.clear();
    span.sheets.extend_from_slice(sheets);
    Some(true)
}

/// Resolve workbook/sheet-scoped defined names after sheet references have
/// stable handles. A LET or LAMBDA name shadows a defined name in its scope.
pub(crate) fn resolve_named_ranges<F>(ast: Ast, formula_sheet: u32, resolve: &F) -> Ast
where
    F: Fn(&str, u32) -> Option<NameTarget>,
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
    F: Fn(&str, u32) -> Option<NameTarget>,
{
    match ast {
        Ast::Name(name) if locals.iter().any(|local| local.eq_ignore_ascii_case(&name)) => {
            Ast::Name(name)
        }
        Ast::Name(name) => match resolve(&name, formula_sheet) {
            Some(NameTarget::Range(range)) => Ast::NamedRange(Box::new(range)),
            Some(NameTarget::Formula(formula)) => Ast::NamedFormula(formula),
            Some(NameTarget::Reference(reference)) => reference,
            None => Ast::Name(name),
        },
        Ast::Func(Func::Let, args) if args.len() >= 3 && args.len() % 2 == 1 => {
            let mut scoped = locals.to_vec();
            let mut resolved = Vec::with_capacity(args.len());
            let last = args.len() - 1;
            for (index, arg) in args.into_vec().into_iter().enumerate() {
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
                        scoped.push(name.to_string());
                    }
                }
            }
            Ast::Func(Func::Let, resolved.into())
        }
        #[cfg(feature = "analysis")]
        Ast::Func(Func::Analysis(crate::eval::analysis::LAMBDA_ID), lambda_args)
            if !lambda_args.is_empty() =>
        {
            let mut args = lambda_args.into_vec();
            let body = args.pop().expect("nonempty arguments");
            let mut scoped = locals.to_vec();
            scoped.extend(args.iter().filter_map(|parameter| {
                if let Ast::Name(name) = parameter {
                    Some(name.to_string())
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
            Ast::Func(
                Func::Analysis(crate::eval::analysis::LAMBDA_ID),
                args.into(),
            )
        }
        Ast::Func(func, args) => Ast::Func(
            func,
            (args
                .into_vec()
                .into_iter()
                .map(|arg| resolve_named_ranges_inner(arg, formula_sheet, resolve, locals))
                .collect::<Vec<_>>())
            .into(),
        ),
        Ast::UnknownFunc(call) => {
            let UnknownCall {
                name,
                args: unresolved_args,
            } = *call;

            let args = unresolved_args
                .into_vec()
                .into_iter()
                .map(|arg| resolve_named_ranges_inner(arg, formula_sheet, resolve, locals))
                .collect::<Box<[Ast]>>();
            // `MYFN(A1)` calls the LAMBDA that the defined name MYFN holds.
            // LAMBDA needs the full engine; the default engine leaves the call
            // unknown, so it returns #NAME? as LAMBDA itself does there.
            #[cfg(feature = "analysis")]
            if !locals.iter().any(|local| local.eq_ignore_ascii_case(&name)) {
                if let Some(NameTarget::Formula(formula)) = resolve(&name, formula_sheet) {
                    return named_lambda_call(formula, args);
                }
            }
            Ast::UnknownFunc(Box::new(UnknownCall { name, args }))
        }
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

/// A call of the LAMBDA that a defined name holds, in the form an immediate
/// `LAMBDA(…)(…)` call parses to: the function, then the arguments.
#[cfg(feature = "analysis")]
pub(crate) fn named_lambda_call(
    formula: std::rc::Rc<NamedFormulaRef>,
    arguments: Box<[Ast]>,
) -> Ast {
    let mut call = Vec::with_capacity(arguments.len() + 1);
    call.push(Ast::NamedFormula(formula));
    call.extend(arguments);
    Ast::UnknownFunc(Box::new(UnknownCall {
        name: crate::eval::analysis::lambda::CALL.into(),
        args: call.into(),
    }))
}

/// Resolves the table references in `ast` in place, for a formula in the
/// cell at (`formula_row`, `formula_col`) of `formula_sheet`. A reference
/// that `resolve` cannot place stays unresolved. Returns whether any
/// reference was bound.
pub(crate) fn resolve_structured_refs<F>(
    ast: &mut Ast,
    formula_sheet: u32,
    formula_row: u32,
    formula_col: u32,
    resolve: &F,
) -> bool
where
    F: Fn(&UnresolvedStructuredRef, u32, u32, u32) -> Option<StructuredRef> + ?Sized,
{
    // Every other node holds table references only through its children.
    if let Ast::UnresolvedStructured(reference) = ast {
        let Some(resolved) = resolve(reference, formula_sheet, formula_row, formula_col) else {
            return false;
        };
        *ast = Ast::Structured(resolved);
        return true;
    }
    ast.fold_children_mut(&mut |child| {
        resolve_structured_refs(child, formula_sheet, formula_row, formula_col, resolve)
    })
}

/// Translate relative A1 references from one formula origin to another.
///
/// Conditional-format expressions store one parsed AST at the rule range's
/// top-left. A window read evaluates it in place with a reference shift; it
/// translates a copy here only at a cell where [`relative_reach`] says the
/// shift could not keep every reference in the sheet. Absolute row/column
/// markers remain fixed.
pub(crate) fn translate_relative_refs(ast: &mut Ast, row_delta: i64, col_delta: i64) {
    if !translate_relative_refs_inner(ast, row_delta, col_delta, false) {
        *ast = Ast::InvalidRef;
    }
}

/// One past the largest row and column that a relative axis of a reference
/// in `ast` names, or 0 for an axis no reference leaves relative. Moving the
/// references by a shift keeps them in the sheet, exactly as
/// [`translate_relative_refs`] would, while `shift + reach` stays within the
/// sheet's rows and columns. A defined name's expansion is placed for its
/// formula and translation leaves it, so a relative reference inside one
/// reports a reach past the sheet: no shift reproduces it.
pub(crate) fn relative_reach(ast: &Ast) -> (u32, u32) {
    let mut reach = (0, 0);
    add_relative_reach(ast, 0, &mut reach);
    reach
}

/// Raise `reach` to cover the references in `ast`; see [`relative_reach`].
fn add_relative_reach(ast: &Ast, depth: usize, reach: &mut (u32, u32)) {
    const PAST_SHEET: (u32, u32) = (SHEET_ROWS + 1, SHEET_COLS + 1);
    if depth > FORMULA_RECURSION_LIMIT {
        *reach = PAST_SHEET;
        return;
    }
    match ast {
        Ast::Cell(row, col, flags) | Ast::AbsCell(_, row, col, flags) => {
            add_end_reach(reach, (*row, *col), *flags);
        }
        Ast::SheetCell(reference) => {
            add_end_reach(reach, (reference.row, reference.col), reference.flags);
        }
        Ast::Range(r0, c0, r1, c1, flags) | Ast::AbsRange(_, r0, c0, r1, c1, flags) => {
            add_end_reach(reach, (*r0, *c0), flags.start);
            add_end_reach(reach, (*r1, *c1), flags.end);
        }
        Ast::SheetRange(reference) => {
            let (start, end) = (reference.flags.start, reference.flags.end);
            add_end_reach(reach, (reference.row_start, reference.col_start), start);
            add_end_reach(reach, (reference.row_end, reference.col_end), end);
        }
        Ast::SheetSpan(span) => {
            add_end_reach(reach, (span.row_start, span.col_start), span.flags.start);
            add_end_reach(reach, (span.row_end, span.col_end), span.flags.end);
        }
        Ast::NamedFormula(named) => {
            let mut inside = (0, 0);
            add_relative_reach(&named.expression, depth + 1, &mut inside);
            if inside != (0, 0) {
                *reach = PAST_SHEET;
            }
        }
        // These hold no reference of their own; `any_child` visits the
        // children of those that have some.
        Ast::Func(..)
        | Ast::UnknownFunc(_)
        | Ast::LetSlot { .. }
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::LetName { .. }
        | Ast::NamedRange(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::InvalidRef
        | Ast::Array(_) => add_children_reach(ast, depth, reach),
        #[cfg(feature = "analysis")]
        Ast::Lambda(_) | Ast::Parameter { .. } | Ast::RegexPattern(_) => {
            add_children_reach(ast, depth, reach);
        }
    }
}

/// Raise `reach` to cover one reference end at (`row`, `col`).
fn add_end_reach(reach: &mut (u32, u32), (row, col): (u32, u32), flags: RefFlags) {
    if !flags.row_abs() {
        reach.0 = reach.0.max(row + 1);
    }
    if !flags.col_abs() {
        reach.1 = reach.1.max(col + 1);
    }
}

fn add_children_reach(ast: &Ast, depth: usize, reach: &mut (u32, u32)) {
    ast.any_child(&mut |child| {
        add_relative_reach(child, depth + 1, reach);
        false
    });
}

/// Move the relative references of a defined name's formula from cell A1,
/// which they are written relative to, to the cell (`row`, `col`) whose
/// formula uses the name. As in Excel, a reference that passes the last row
/// or column wraps around to the first, so a name can refer to cells above
/// or left of the cell that uses it.
pub(crate) fn translate_name_refs(ast: &mut Ast, row: u32, col: u32) {
    translate_relative_refs_inner(ast, i64::from(row), i64::from(col), true);
}

/// A coordinate moved by `delta` unless it is absolute. Past the sheet it is
/// `None`, or with `wrap` the coordinate it reaches from the other edge.
fn translated_coordinate(
    value: u32,
    delta: i64,
    absolute: bool,
    axis: Axis,
    wrap: bool,
) -> Option<u32> {
    if absolute {
        return Some(value);
    }
    let shifted = i64::from(value).checked_add(delta)?;
    let translated = if wrap {
        shifted.rem_euclid(i64::from(axis.len()))
    } else {
        shifted
    };
    u32::try_from(translated)
        .ok()
        .filter(|&index| index < axis.len())
}

/// Put one axis of a range back in order after a wrapping translation moved
/// one edge past the other; each edge keeps its `$` marker.
const fn order_wrapped_edges(start: &mut u32, end: &mut u32, flags: &mut RangeFlags, row: bool) {
    if *start > *end {
        std::mem::swap(start, end);
        let axis_mask = if row { 1 } else { 2 };
        let difference = (flags.start.0 ^ flags.end.0) & axis_mask;
        flags.start.0 ^= difference;
        flags.end.0 ^= difference;
    }
}

fn translate_relative_refs_inner(
    ast: &mut Ast,
    row_delta: i64,
    col_delta: i64,
    wrap: bool,
) -> bool {
    let row = |value, absolute| translated_coordinate(value, row_delta, absolute, Axis::Row, wrap);
    let col = |value, absolute| translated_coordinate(value, col_delta, absolute, Axis::Col, wrap);
    let inner = |ast: &mut Ast| {
        if !translate_relative_refs_inner(ast, row_delta, col_delta, wrap) {
            *ast = Ast::InvalidRef;
        }
    };
    match ast {
        Ast::Cell(r, c, flags) | Ast::AbsCell(_, r, c, flags) => {
            let (Some(next_row), Some(next_col)) =
                (row(*r, flags.row_abs()), col(*c, flags.col_abs()))
            else {
                return false;
            };
            *r = next_row;
            *c = next_col;
            true
        }
        Ast::SheetCell(reference) => {
            let DetachedCellRef {
                sheet: _,
                row: r,
                col: c,
                flags,
            } = &mut **reference;

            let (Some(next_row), Some(next_col)) =
                (row(*r, flags.row_abs()), col(*c, flags.col_abs()))
            else {
                return false;
            };
            *r = next_row;
            *c = next_col;
            true
        }
        Ast::Range(r0, c0, r1, c1, flags) | Ast::AbsRange(_, r0, c0, r1, c1, flags) => {
            let (Some(next_r0), Some(next_c0), Some(next_r1), Some(next_c1)) = (
                row(*r0, flags.start.row_abs()),
                col(*c0, flags.start.col_abs()),
                row(*r1, flags.end.row_abs()),
                col(*c1, flags.end.col_abs()),
            ) else {
                return false;
            };
            (*r0, *c0, *r1, *c1) = (next_r0, next_c0, next_r1, next_c1);
            if wrap {
                order_wrapped_edges(r0, r1, flags, true);
                order_wrapped_edges(c0, c1, flags, false);
            }
            true
        }
        Ast::SheetRange(reference) => {
            let DetachedRangeRef {
                sheet: _,
                row_start: r0,
                col_start: c0,
                row_end: r1,
                col_end: c1,
                flags,
            } = &mut **reference;

            let (Some(next_r0), Some(next_c0), Some(next_r1), Some(next_c1)) = (
                row(*r0, flags.start.row_abs()),
                col(*c0, flags.start.col_abs()),
                row(*r1, flags.end.row_abs()),
                col(*c1, flags.end.col_abs()),
            ) else {
                return false;
            };
            (*r0, *c0, *r1, *c1) = (next_r0, next_c0, next_r1, next_c1);
            if wrap {
                order_wrapped_edges(r0, r1, flags, true);
                order_wrapped_edges(c0, c1, flags, false);
            }
            true
        }
        Ast::SheetSpan(span) => {
            let (Some(row_start), Some(col_start), Some(row_end), Some(col_end)) = (
                row(span.row_start, span.flags.start.row_abs()),
                col(span.col_start, span.flags.start.col_abs()),
                row(span.row_end, span.flags.end.row_abs()),
                col(span.col_end, span.flags.end.col_abs()),
            ) else {
                return false;
            };
            (span.row_start, span.col_start) = (row_start, col_start);
            (span.row_end, span.col_end) = (row_end, col_end);
            if wrap {
                order_wrapped_edges(
                    &mut span.row_start,
                    &mut span.row_end,
                    &mut span.flags,
                    true,
                );
                order_wrapped_edges(
                    &mut span.col_start,
                    &mut span.col_end,
                    &mut span.flags,
                    false,
                );
            }
            true
        }
        Ast::Func(_, args) => {
            args.iter_mut().for_each(inner);
            true
        }
        Ast::UnknownFunc(call) => {
            let args = &mut call.args;

            args.iter_mut().for_each(inner);
            true
        }
        Ast::LetSlot { expression, .. } => {
            translate_relative_refs_inner(expression, row_delta, col_delta, wrap)
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            inner(left);
            inner(right);
            true
        }
        Ast::Neg(operand) | Ast::Pos(operand) | Ast::Percent(operand) => {
            inner(operand);
            true
        }
        // A defined name's expansion is already placed for its formula.
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::LetName { .. }
        | Ast::NamedRange(_)
        | Ast::NamedFormula(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::InvalidRef
        | Ast::Array(_) => true,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } => true,
        #[cfg(feature = "analysis")]
        Ast::Lambda(definition) => {
            inner(&mut std::rc::Rc::make_mut(definition).body);
            true
        }
        #[cfg(feature = "analysis")]
        Ast::RegexPattern(_) => true,
    }
}

#[derive(Clone, Copy)]
pub(crate) enum Axis {
    Row,
    Col,
}

impl Axis {
    /// The rows or columns of a sheet.
    const fn len(self) -> u32 {
        match self {
            Self::Row => SHEET_ROWS,
            Self::Col => SHEET_COLS,
        }
    }

    const fn pick<'a>(self, row: &'a mut u32, col: &'a mut u32) -> &'a mut u32 {
        match self {
            Self::Row => row,
            Self::Col => col,
        }
    }
}

/// What a row or column edit did to one reference.
#[derive(PartialEq)]
enum Moved {
    Unchanged,
    Changed,
    Deleted,
}

/// What a row or column edit does to the indices of its axis.
#[derive(Clone, Copy)]
pub(crate) enum AxisChange {
    /// `delta` rows or columns inserted (positive) or deleted (negative) at `at`.
    Shift { at: u32, delta: i64 },
    /// `count` rows or columns moved from `from`. `to` is the first index of
    /// the moved block after the move.
    Move { from: u32, count: u32, to: u32 },
}

/// One axis change on `edited_sheet`, applied to a formula on `formula_sheet`.
#[derive(Clone, Copy)]
struct AxisEdit {
    axis: Axis,
    change: AxisChange,
    formula_sheet: u32,
    edited_sheet: u32,
}

impl AxisEdit {
    /// A cell pushed past the last row or column is deleted, as in Excel.
    fn move_index(self, coord: &mut u32) -> Moved {
        let target = match self.change {
            AxisChange::Shift { at, delta } => shift_index(*coord, at, delta),
            AxisChange::Move { from, count, to } => Some(moved_index(*coord, from, count, to)),
        };
        match target.filter(|&index| index < self.axis.len()) {
            Some(shifted) if shifted == *coord => Moved::Unchanged,
            Some(shifted) => {
                *coord = shifted;
                Moved::Changed
            }
            None => Moved::Deleted,
        }
    }

    /// A whole column or row keeps spanning its axis. Another range whose
    /// end is pushed past the sheet edge stops at the last row or column.
    fn move_span(self, start: &mut u32, end: &mut u32) -> Moved {
        let last = self.axis.len() - 1;
        if *start == 0 && *end == last {
            return Moved::Unchanged;
        }

        let span = match self.change {
            AxisChange::Shift { at, delta } => shift_range(*start, *end, at, delta),
            AxisChange::Move { from, count, to } => moved_span(*start, *end, from, count, to),
        };
        match span {
            Some((shifted_start, unclamped_end)) if shifted_start <= last => {
                let shifted_end = unclamped_end.min(last);
                if (shifted_start, shifted_end) == (*start, *end) {
                    return Moved::Unchanged;
                }
                *start = shifted_start;
                *end = shifted_end;
                Moved::Changed
            }
            _ => Moved::Deleted,
        }
    }
}

/// Rewrite row references affected by an edit on `edited_sheet`. Returns
/// whether any reference changed.
pub(crate) fn shift_rows(
    ast: &mut Ast,
    at: u32,
    delta: i64,
    formula_sheet: u32,
    edited_sheet: u32,
) -> bool {
    rewrite_axis(
        ast,
        AxisEdit {
            axis: Axis::Row,
            change: AxisChange::Shift { at, delta },
            formula_sheet,
            edited_sheet,
        },
    )
}

/// Rewrite column references affected by an edit on `edited_sheet`. Returns
/// whether any reference changed.
pub(crate) fn shift_cols(
    ast: &mut Ast,
    at: u32,
    delta: i64,
    formula_sheet: u32,
    edited_sheet: u32,
) -> bool {
    rewrite_axis(
        ast,
        AxisEdit {
            axis: Axis::Col,
            change: AxisChange::Shift { at, delta },
            formula_sheet,
            edited_sheet,
        },
    )
}

/// Rewrite the references of a formula on the sheet that `change` edits.
/// Returns whether any reference changed.
pub(crate) fn rewrite_own_sheet_axis(ast: &mut Ast, axis: Axis, change: AxisChange) -> bool {
    rewrite_axis(
        ast,
        AxisEdit {
            axis,
            change,
            formula_sheet: 0,
            edited_sheet: 0,
        },
    )
}

/// Follow `count` rows or columns of `edited_sheet` moved from `from` to
/// `to`, in a formula on `formula_sheet`: references to moved cells and to
/// the cells the block passes over follow those cells. A defined name's
/// formula has no sheet: pass `u32::MAX`, so only the references that name
/// `edited_sheet` move. Returns whether any reference changed.
pub(crate) fn move_refs(
    ast: &mut Ast,
    edited_sheet: u32,
    formula_sheet: u32,
    columns: bool,
    (from, count, to): (u32, u32, u32),
) -> bool {
    rewrite_axis(
        ast,
        AxisEdit {
            axis: if columns { Axis::Col } else { Axis::Row },
            change: AxisChange::Move { from, count, to },
            formula_sheet,
            edited_sheet,
        },
    )
}

fn rewrite_axis(ast: &mut Ast, edit: AxisEdit) -> bool {
    let on_edited_sheet = edit.formula_sheet == edit.edited_sheet;
    let moved = match ast {
        Ast::Cell(row, col, _) if on_edited_sheet => edit.move_index(edit.axis.pick(row, col)),
        Ast::AbsCell(sheet, row, col, _) if sheet.handle == edit.edited_sheet => {
            edit.move_index(edit.axis.pick(row, col))
        }
        Ast::Range(r0, c0, r1, c1, _) if on_edited_sheet => {
            edit.move_span(edit.axis.pick(r0, c0), edit.axis.pick(r1, c1))
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, _) if sheet.handle == edit.edited_sheet => {
            edit.move_span(edit.axis.pick(r0, c0), edit.axis.pick(r1, c1))
        }
        Ast::Structured(reference) if reference.sheet == edit.edited_sheet => match edit.axis {
            Axis::Row => edit.move_span(&mut reference.row_start, &mut reference.row_end),
            Axis::Col => edit.move_index(&mut reference.col),
        },
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::NamedRange(_)
        | Ast::NamedFormula(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(..)
        | Ast::AbsRange(..)
        | Ast::SheetSpan(_)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => {
            return ast.fold_children_mut(&mut |child| rewrite_axis(child, edit))
        }
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => {
            return ast.fold_children_mut(&mut |child| rewrite_axis(child, edit))
        }
    };

    if moved == Moved::Deleted {
        *ast = Ast::InvalidRef;
    }
    moved != Moved::Unchanged
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

/// Where `index` is after `count` indices move from `from` to `to`; `to` is
/// the first index of the moved block after the move. A moved cell takes its
/// references along, so a reference to one cell follows it.
pub(crate) fn moved_index(index: u32, from: u32, count: u32, to: u32) -> u32 {
    let block_end = from.saturating_add(count);
    if (from..block_end).contains(&index) {
        return to + (index - from);
    }

    let without_block = if index < from { index } else { index - count };
    if without_block >= to {
        without_block + count
    } else {
        without_block
    }
}

/// The inclusive span `start..=end` after `count` indices move from `from`
/// to `to`, as Excel's Insert Cut Cells changes a range. A span inside the
/// moved block moves with it. Any other span changes as if the block were
/// deleted where it was and inserted where it lands: it loses the moved
/// indices it held, a cut corner included, and grows by the block when the
/// block lands after its first index and at or before its last.
pub(crate) fn moved_span(
    start: u32,
    end: u32,
    from: u32,
    count: u32,
    to: u32,
) -> Option<(u32, u32)> {
    if from <= start && end < from.saturating_add(count) {
        return Some((
            moved_index(start, from, count, to),
            moved_index(end, from, count, to),
        ));
    }

    let (closed_start, closed_end) = shift_range(start, end, from, -i64::from(count))?;
    shift_range(closed_start, closed_end, to, i64::from(count))
}

/// Shift or contract an inclusive range; deleting every target invalidates it.
pub(crate) fn shift_range(start: u32, end: u32, at: u32, delta: i64) -> Option<(u32, u32)> {
    if delta >= 0 {
        let shifted_start = if start >= at {
            clamp_index(i64::from(start) + delta)
        } else {
            start
        };
        let shifted_end = if end >= at {
            clamp_index(i64::from(end) + delta)
        } else {
            end
        };
        return Some((shifted_start, shifted_end));
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
#[cfg(test)]
pub(crate) fn serialize(ast: &Ast) -> String {
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
    match ast {
        Ast::AbsCell(sheet, _, _, flags) if sheet.handle == handle => {
            *flags = flags.with_quoted(sheet_name_needs_quotes(name));
            true
        }
        Ast::AbsRange(sheet, _, _, _, _, flags) if sheet.handle == handle => {
            flags.start = flags.start.with_quoted(sheet_name_needs_quotes(name));
            true
        }
        Ast::SheetSpan(span) => {
            let mut changed = false;
            for endpoint in [&mut span.first, &mut span.last] {
                if endpoint.handle == handle {
                    endpoint.quoted = sheet_name_needs_quotes(name);
                    changed = true;
                }
            }
            changed
        }
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::NamedRange(_)
        | Ast::NamedFormula(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(..)
        | Ast::AbsRange(..)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => {
            ast.fold_children_mut(&mut |child| rename_sheet_refs(child, handle, name))
        }
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => {
            ast.fold_children_mut(&mut |child| rename_sheet_refs(child, handle, name))
        }
    }
}

/// The cells of a table reference after an edit of its table; `None` when
/// the reference no longer reads anything.
pub(crate) type TableRefresh<'a> = dyn Fn(&StructuredRef) -> Option<StructuredRef> + 'a;

/// Refresh each reference to table slot `table` with `refresh`; a reference
/// it drops becomes `#REF!`. Returns whether the tree names the table.
pub(crate) fn refresh_table_refs(ast: &mut Ast, table: u16, refresh: &TableRefresh<'_>) -> bool {
    if let Ast::Structured(reference) = ast {
        if reference.table != table {
            return false;
        }
        *ast = refresh(reference).map_or(Ast::InvalidRef, Ast::Structured);
        return true;
    }
    ast.fold_children_mut(&mut |child| refresh_table_refs(child, table, refresh))
}

/// The slot and section of a bound table reference; `None` for one that no
/// table binds.
pub(crate) type TableUse = Option<(u16, TableSection)>;

/// Visit each table reference of `ast`: see [`TableUse`].
pub(crate) fn for_each_table_ref(ast: &Ast, visit: &mut dyn FnMut(TableUse)) {
    // Every other node holds table references only through its children.
    if let Ast::Structured(reference) = ast {
        visit(Some((reference.table, reference.section)));
    } else if let Ast::UnresolvedStructured(_) = ast {
        visit(None);
    } else {
        ast.any_child(&mut |child| {
            for_each_table_ref(child, visit);
            false
        });
    }
}

/// Replace every resolved cell/range reference to a removed stable handle with `#REF!`.
/// 3-D references are left to [`refresh_sheet_spans`]: removing one of their
/// sheets shrinks the span instead.
/// Point the references whose sheet name has the lookup `key` at `handle`,
/// or back to unresolved sheet references when `handle` is `None`. Only the
/// sheets of linked workbooks come and go this way; the text stays the same.
pub(crate) fn relink_sheet_refs(
    ast: &mut Ast,
    key: &str,
    handle: Option<u32>,
    names: &[String],
) -> bool {
    let relinked = match (&*ast, handle) {
        (Ast::SheetCell(reference), Some(linked))
            if sheet_name_key(&reference.sheet.name) == key =>
        {
            Some(Ast::AbsCell(
                SheetRef { handle: linked },
                reference.row,
                reference.col,
                reference.flags,
            ))
        }
        (Ast::SheetRange(reference), Some(linked))
            if sheet_name_key(&reference.sheet.name) == key =>
        {
            Some(Ast::AbsRange(
                SheetRef { handle: linked },
                reference.row_start,
                reference.col_start,
                reference.row_end,
                reference.col_end,
                reference.flags,
            ))
        }
        (Ast::AbsCell(sheet, row, col, flags), None)
            if names
                .get(sheet.handle as usize)
                .is_some_and(|name| sheet_name_key(name) == key) =>
        {
            Some(Ast::SheetCell(Box::new(DetachedCellRef {
                sheet: UnresolvedSheetRef {
                    name: names[sheet.handle as usize].clone(),
                    quoted: flags.quoted(),
                },
                row: *row,
                col: *col,
                flags: *flags,
            })))
        }
        (Ast::AbsRange(sheet, r0, c0, r1, c1, flags), None)
            if names
                .get(sheet.handle as usize)
                .is_some_and(|name| sheet_name_key(name) == key) =>
        {
            Some(Ast::SheetRange(Box::new(DetachedRangeRef {
                sheet: UnresolvedSheetRef {
                    name: names[sheet.handle as usize].clone(),
                    quoted: flags.start.quoted(),
                },
                row_start: *r0,
                col_start: *c0,
                row_end: *r1,
                col_end: *c1,
                flags: *flags,
            })))
        }
        _ => None,
    };
    if let Some(replacement) = relinked {
        *ast = replacement;
        true
    } else {
        ast.fold_children_mut(&mut |child| relink_sheet_refs(child, key, handle, names))
    }
}

pub(crate) fn invalidate_sheet_refs(ast: &mut Ast, handle: u32) -> bool {
    let invalid = matches!(
        ast,
        Ast::AbsCell(sheet, ..) | Ast::AbsRange(sheet, ..) if sheet.handle == handle
    ) || matches!(ast, Ast::Structured(reference) if reference.sheet == handle);
    if invalid {
        *ast = Ast::InvalidRef;
        return true;
    }

    ast.fold_children_mut(&mut |child| invalidate_sheet_refs(child, handle))
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

/// The written name of a 3-D endpoint: its own text while detached, else the
/// workbook's current name for its sheet.
fn span_endpoint_name<'a>(endpoint: &'a SheetSpanEndpoint, names: &'a [String]) -> Option<&'a str> {
    endpoint
        .name
        .as_deref()
        .or_else(|| names.get(endpoint.handle as usize).map(String::as_str))
}

/// What bound references write: the current name of each sheet handle, and
/// the table and column names of each table slot. Without tables, a bound
/// table reference writes `#REF!`.
#[derive(Clone, Copy)]
pub(crate) struct WrittenNames<'a> {
    pub(crate) sheets: &'a [String],
    pub(crate) tables: Option<&'a TableSlots>,
}

impl WrittenNames<'_> {
    /// For text written with no workbook: every bound reference is `#REF!`.
    pub(crate) const NONE: WrittenNames<'static> = WrittenNames {
        sheets: &[],
        tables: None,
    };
}

pub(crate) fn write_ast(ast: &Ast, out: &mut String) {
    write_ast_with_names(ast, out, &WrittenNames::NONE);
}

pub(crate) fn write_ast_with_names(ast: &Ast, out: &mut String, names: &WrittenNames<'_>) {
    match ast {
        Ast::Num(value) => out.push_str(NumberText::of(*value).as_str()),
        Ast::Str(value) => write_text(value, out),
        Ast::Bool(value) => out.push_str(if *value { "TRUE" } else { "FALSE" }),
        Ast::Name(name) => out.push_str(name),
        Ast::LetName { name, .. } => out.push_str(name),
        Ast::NamedRange(named) => out.push_str(&named.name),
        Ast::NamedFormula(named) => out.push_str(&named.name),
        Ast::UnresolvedStructured(reference) => write_structured_ref(
            reference.table_name.as_deref(),
            &reference.column_name,
            reference.section,
            out,
        ),
        Ast::Structured(reference) => {
            let bound = names.tables.and_then(|tables| {
                let table = tables.get(reference.table)?;
                Some((table.name.as_str(), table.column_at(reference.col)?))
            });
            let Some((table_name, column)) = bound else {
                out.push_str("#REF!");
                return;
            };
            write_structured_ref(
                reference.qualified.then_some(table_name),
                &column.name,
                reference.section,
                out,
            );
        }
        Ast::Cell(row, col, flags) => write_a1(*row, *col, *flags, out),
        Ast::SheetCell(reference) => {
            let DetachedCellRef {
                sheet,
                row,
                col,
                flags,
            } = &**reference;

            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_a1(*row, *col, *flags, out);
        }
        Ast::AbsCell(sheet, row, col, flags) => {
            let Some(name) = names.sheets.get(sheet.handle as usize) else {
                out.push_str("#REF!");
                return;
            };
            write_sheet_name(name, flags.quoted(), out);
            out.push('!');
            write_a1(*row, *col, *flags, out);
        }
        Ast::Range(r0, c0, r1, c1, flags) => write_area(*r0, *c0, *r1, *c1, flags, out),
        Ast::SheetRange(reference) => {
            let DetachedRangeRef {
                sheet,
                row_start: r0,
                col_start: c0,
                row_end: r1,
                col_end: c1,
                flags,
            } = &**reference;

            write_sheet_name(&sheet.name, sheet.quoted, out);
            out.push('!');
            write_area(*r0, *c0, *r1, *c1, flags, out);
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, flags) => {
            let Some(name) = names.sheets.get(sheet.handle as usize) else {
                out.push_str("#REF!");
                return;
            };
            write_sheet_name(name, flags.start.quoted(), out);
            out.push('!');
            write_area(*r0, *c0, *r1, *c1, flags, out);
        }
        Ast::SheetSpan(span) => {
            let (Some(first), Some(last)) = (
                span_endpoint_name(&span.first, names.sheets),
                span_endpoint_name(&span.last, names.sheets),
            ) else {
                out.push_str("#REF!");
                return;
            };
            // Excel quotes the whole span once: `'Sheet 1:Sheet 3'!A1`.
            if span.first.quoted || span.last.quoted {
                out.push('\'');
                out.push_str(&first.replace('\'', "''"));
                out.push(':');
                out.push_str(&last.replace('\'', "''"));
                out.push('\'');
            } else {
                out.push_str(first);
                out.push(':');
                out.push_str(last);
            }
            out.push('!');
            if span.cell {
                write_a1(span.row_start, span.col_start, span.flags.start, out);
            } else {
                write_area(
                    span.row_start,
                    span.col_start,
                    span.row_end,
                    span.col_end,
                    &span.flags,
                    out,
                );
            }
        }
        Ast::Missing => {}
        #[cfg(feature = "analysis")]
        Ast::Parameter { name, .. } => out.push_str(name),
        #[cfg(feature = "analysis")]
        Ast::Lambda(definition) => {
            out.push_str(func_name(Func::Analysis(crate::eval::analysis::LAMBDA_ID)));
            out.push('(');
            for parameter in &definition.parameters {
                write_ast_with_names(parameter, out, names);
                out.push(',');
            }
            write_ast_with_names(&definition.body, out, names);
            out.push(')');
        }
        #[cfg(feature = "analysis")]
        Ast::RegexPattern(pattern) => write_text(pattern.text(), out),
        Ast::InvalidRef => out.push_str("#REF!"),
        Ast::Array(array) => {
            let ArrayLiteral { cols, values } = &**array;

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
                    Value::Number(number) => out.push_str(NumberText::of(*number).as_str()),
                    Value::Text(text) => write_text(text, out),
                    Value::Bool(flag) => out.push_str(if *flag { "TRUE" } else { "FALSE" }),
                    Value::Error(error) => out.push_str(error.sentinel()),
                    Value::Blank => {}
                }
            }
            out.push('}');
        }
        Ast::LetSlot { expression, .. } => write_ast_with_names(expression, out, names),
        Ast::Func(Func::AnchorArray, args) if args.len() == 1 => {
            write_ast_with_names(&args[0], out, names);
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
                write_ast_with_names(area, out, names);
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
                write_ast_with_names(operand, out, names);
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
                write_ast_with_names(arg, out, names);
            }
            out.push(')');
        }
        #[cfg(feature = "analysis")]
        Ast::UnknownFunc(call) if call.name == crate::eval::analysis::lambda::CALL => {
            let UnknownCall { args, .. } = &**call;

            if let Some(callee) = args.first() {
                write_ast_with_names(callee, out, names);
            }
            out.push('(');
            for (index, argument) in args.iter().skip(1).enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast_with_names(argument, out, names);
            }
            out.push(')');
        }
        Ast::UnknownFunc(call) => {
            let UnknownCall { name, args } = &**call;

            out.push_str(name);
            out.push('(');
            for (index, arg) in args.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_ast_with_names(arg, out, names);
            }
            out.push(')');
        }
        Ast::Bin(op, left, right) => {
            out.push('(');
            write_ast_with_names(left, out, names);
            out.push(match op {
                Op::Add => '+',
                Op::Sub => '-',
                Op::Mul => '*',
                Op::Div => '/',
                Op::Pow => '^',
                Op::Concat => '&',
            });
            write_ast_with_names(right, out, names);
            out.push(')');
        }
        Ast::Cmp(op, left, right) => {
            out.push('(');
            write_ast_with_names(left, out, names);
            out.push_str(match op {
                CmpOp::Eq => "=",
                CmpOp::Ne => "<>",
                CmpOp::Lt => "<",
                CmpOp::Le => "<=",
                CmpOp::Gt => ">",
                CmpOp::Ge => ">=",
            });
            write_ast_with_names(right, out, names);
            out.push(')');
        }
        Ast::Neg(inner) => {
            out.push_str("-(");
            write_ast_with_names(inner, out, names);
            out.push(')');
        }
        Ast::Pos(inner) => {
            out.push_str("+(");
            write_ast_with_names(inner, out, names);
            out.push(')');
        }
        Ast::Percent(inner) => {
            out.push('(');
            write_ast_with_names(inner, out, names);
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

/// Writes a range, in the short form when it covers whole rows (`2:3`) or
/// whole columns (`B:C`). A range over every cell is written as rows, as
/// Excel writes `1:1048576`.
fn write_area(r0: u32, c0: u32, r1: u32, c1: u32, flags: &RangeFlags, out: &mut String) {
    if spans_all_cols(c0, c1) {
        write_absolute_marker(flags.start.row_abs(), out);
        out.push_str(&(u64::from(r0) + 1).to_string());
        out.push(':');
        write_absolute_marker(flags.end.row_abs(), out);
        out.push_str(&(u64::from(r1) + 1).to_string());
    } else if spans_all_rows(r0, r1) {
        write_absolute_marker(flags.start.col_abs(), out);
        write_col(c0, out);
        out.push(':');
        write_absolute_marker(flags.end.col_abs(), out);
        write_col(c1, out);
    } else {
        write_a1(r0, c0, flags.start, out);
        out.push(':');
        write_a1(r1, c1, flags.end, out);
    }
}

fn write_absolute_marker(absolute: bool, out: &mut String) {
    if absolute {
        out.push('$');
    }
}

fn write_a1(row: u32, col: u32, flags: RefFlags, out: &mut String) {
    if flags.col_abs() {
        out.push('$');
    }
    write_col(col, out);
    if flags.row_abs() {
        out.push('$');
    }
    out.push_str(&(u64::from(row) + 1).to_string());
}

/// Append the A1 letters of a 0-based column (`0` → `A`, `26` → `AA`).
pub(crate) fn write_col(mut col: u32, out: &mut String) {
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
            Ok(Ast::SheetSpan(span)) if span.cell && span.first.name.as_deref() == Some("Sheet1")
        ));
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
            let Ast::Array(array) = &ast else {
                panic!("{source} did not parse as an array constant");
            };
            let ArrayLiteral { cols, values } = &**array;
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
            Ok(Ast::Array(Box::new(ArrayLiteral {
                cols: 3,
                values: vec![
                    Value::text("x"),
                    Value::Bool(false),
                    Value::Error(FormulaError::Name),
                ],
            })))
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
            Ok(Ast::Name("Revenue_Q1".to_owned().into()))
        );
        assert_eq!(
            parse("=Sales.Data"),
            Ok(Ast::Name("Sales.Data".to_owned().into()))
        );

        let sheet_ref = parse("='North East'!a1").expect("quoted sheet ref should parse");
        assert_eq!(serialize(&sheet_ref), "='North East'!A1");
        assert_eq!(parse(&serialize(&sheet_ref)), Ok(sheet_ref));

        let unicode_sheet =
            parse("='München Süd'!b2").expect("UTF-8 quoted sheet ref should parse");
        assert_eq!(serialize(&unicode_sheet), "='München Süd'!B2");
        assert_eq!(parse(&serialize(&unicode_sheet)), Ok(unicode_sheet));
        assert_eq!(parse("=\"café\""), Ok(Ast::Str("café".to_owned().into())));
        assert_eq!(
            serialize(&parse("=1\u{2003}+2").expect("Unicode whitespace should parse")),
            "=(1+2)"
        );

        let unknown =
            parse("=MiXeD.Call(Revenue_Q1)").expect("unknown call should remain parseable");
        assert_eq!(
            unknown,
            Ast::UnknownFunc(Box::new(UnknownCall {
                name: "MiXeD.Call".to_owned(),
                args: (vec![Ast::Name("Revenue_Q1".to_owned().into())]).into()
            }))
        );
        assert_eq!(serialize(&unknown), "=MiXeD.Call(Revenue_Q1)");
    }

    #[test]
    fn text_literal_memory_counts_reference_counts() {
        let literal = parse("=\"abc\"").unwrap();
        let mut stats = MemoryOwnerStats::default();
        literal.heap_memory_stats(&mut stats);
        assert_eq!(stats.logical_bytes, 3);
        assert_eq!(stats.allocated_bytes, 3 + 2 * std::mem::size_of::<usize>());
        // A cloned tree shares the literal and writes it back unchanged.
        assert_eq!(serialize(&literal.clone()), "=\"abc\"");
    }

    #[test]
    fn heap_memory_stats_accounts_owning_ast_shapes() {
        let boxed = std::mem::size_of::<Ast>();
        let cases: Vec<(&str, Ast, usize)> = vec![
            ("string", Ast::Str("abc".to_owned().into()), 3),
            ("name", Ast::Name("Total".to_owned().into()), 5),
            (
                "named range",
                Ast::NamedRange(Box::new(NamedRangeRef {
                    name: "Band".to_owned(),
                    scope: None,
                    sheet: 1,
                    row_start: 0,
                    col_start: 0,
                    row_end: 4,
                    col_end: 0,
                })),
                std::mem::size_of::<NamedRangeRef>() + 4,
            ),
            (
                "unqualified structured ref",
                Ast::UnresolvedStructured(Box::new(UnresolvedStructuredRef {
                    table_name: None,
                    column_name: "Amount".to_owned(),
                    section: TableSection::Body,
                })),
                std::mem::size_of::<UnresolvedStructuredRef>() + 6,
            ),
            (
                "qualified structured ref",
                Ast::UnresolvedStructured(Box::new(UnresolvedStructuredRef {
                    table_name: Some("Table1".to_owned()),
                    column_name: "Amount".to_owned(),
                    section: TableSection::Body,
                })),
                std::mem::size_of::<UnresolvedStructuredRef>() + 12,
            ),
            (
                "bound structured ref, inline",
                Ast::Structured(StructuredRef {
                    table: 0,
                    section: TableSection::Body,
                    qualified: true,
                    sheet: 1,
                    row_start: 0,
                    row_end: 3,
                    col: 0,
                }),
                0,
            ),
            (
                "sheet cell",
                Ast::SheetCell(Box::new(DetachedCellRef {
                    sheet: UnresolvedSheetRef {
                        name: "Data".to_owned(),
                        quoted: false,
                    },
                    row: 0,
                    col: 0,
                    flags: RefFlags::default(),
                })),
                std::mem::size_of::<DetachedCellRef>() + 4,
            ),
            (
                "sheet range",
                Ast::SheetRange(Box::new(DetachedRangeRef {
                    sheet: UnresolvedSheetRef {
                        name: "Data".to_owned(),
                        quoted: false,
                    },
                    row_start: 0,
                    col_start: 0,
                    row_end: 1,
                    col_end: 1,
                    flags: RangeFlags::default(),
                })),
                std::mem::size_of::<DetachedRangeRef>() + 4,
            ),
            (
                "absolute cell",
                Ast::AbsCell(SheetRef { handle: 1 }, 0, 0, RefFlags::default()),
                0,
            ),
            (
                "absolute range",
                Ast::AbsRange(SheetRef { handle: 1 }, 0, 0, 1, 1, RangeFlags::default()),
                0,
            ),
            (
                "function arguments",
                Ast::Func(Func::Rept, (vec![Ast::Num(1.0)]).into()),
                boxed,
            ),
            (
                "unknown function",
                Ast::UnknownFunc(Box::new(UnknownCall {
                    name: "Foo".to_owned(),
                    args: (vec![Ast::Num(1.0), Ast::Num(2.0)]).into(),
                })),
                std::mem::size_of::<UnknownCall>() + 3 + boxed * 2,
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
}
