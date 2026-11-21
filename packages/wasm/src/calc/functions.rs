//! Built-in function names: the `Func` registry and name lookup.

use super::*;

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
        pub(super) fn lookup_func(name: &str) -> Option<Func> {
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

        pub(super) fn func_name(func: Func) -> &'static str {
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
