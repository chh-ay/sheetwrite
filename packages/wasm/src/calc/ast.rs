//! The parsed formula tree and the reference values it holds.

use super::*;

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
pub(crate) struct RefFlags(pub(super) u8);

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

    pub(super) fn set_row_abs(&mut self, absolute: bool) {
        self.0 = (self.0 & !1) | u8::from(absolute);
    }

    pub(super) fn set_col_abs(&mut self, absolute: bool) {
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

/// A named range as the store defines it: `name` is the definition's
/// spelling, which formulas that use it write back.
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

/// A defined name's index in the store's name table, which holds one entry
/// per name without case and that name's definition in each scope. A
/// formula that uses the name holds its id ([`Ast::DefinedName`]) and reads
/// the definition for its own sheet through the table, so a definition
/// change rewrites no formula.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) struct NameId(std::num::NonZeroU32);

impl NameId {
    /// The id of the table entry at `index`; `None` past `u32::MAX - 1`.
    pub(crate) fn at(index: usize) -> Option<Self> {
        u32::try_from(index)
            .ok()
            .and_then(|narrow| narrow.checked_add(1))
            .and_then(std::num::NonZeroU32::new)
            .map(Self)
    }

    /// The table entry's index.
    pub(crate) const fn index(self) -> usize {
        (self.0.get() - 1) as usize
    }
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
    /// Shared with the arrays that read the constant, so a read copies none.
    pub(crate) values: Rc<[Value]>,
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
    /// A name the store does not bind: as parsed, a LET or LAMBDA name, or
    /// a defined name before binding.
    Name(Box<str>),
    /// A use of a defined name, bound to its id in the store's name table.
    /// It reads the name's definition for its formula's sheet through the
    /// table (`NameScope::read`), defined yet or not. The flag records
    /// whether the name evaluates to an array there, so shape checks need no
    /// name table (`store::names::shapes`).
    DefinedName(NameId, bool),
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
    /// Whether `test` holds for a direct child expression: a function
    /// argument, an operand, or the expression a LET use stands for. A
    /// defined name's formula lives in the store's name table, not in the
    /// tree; a walker that follows names reads it there
    /// (`NameScope::read`). Every node kind is listed, so a new kind
    /// must say whether it has children.
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
            | Self::DefinedName(..)
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
            | Self::DefinedName(..)
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
            // The store's name table holds the name's definitions.
            Self::DefinedName(..) => {}
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
                let values_bytes = values.len().saturating_mul(bytes);
                out.add_payload(values_bytes, values_bytes);
                for value in &**values {
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
