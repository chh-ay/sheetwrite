//! Full-engine lexical functions and bounded array helpers.
//!
//! A LAMBDA's parameters are numbered when its formula is entered
//! ([`resolve_parameters`]): each use becomes an [`Ast::Parameter`] that says
//! how many LAMBDAs out its declaration is and which parameter it is. A call
//! binds its argument values in the pass's [`CallFrame`] and evaluates the
//! LAMBDA's own body; nothing is copied. Each call record links to the call
//! its LAMBDA was created in, so a nested LAMBDA reads its enclosing
//! parameters through those links. No LAMBDA outlives that call: a cell
//! cannot hold one (`#CALC!`), a LET-bound one is called only inside its LET,
//! and a named one has no enclosing parameters.
//!
//! Whether a parameter is an array is a property of the call, so shape
//! checks read it through [`Shapes`]: the frame while a call runs, and the
//! arguments' shapes when a call's own shape is decided before it runs.

use crate::formula_slots::{FormulaResults, FormulaWork};
use std::rc::Rc;

use super::super::array::ast_produces_array;
use super::super::matrix::{
    range_from_ast, EvalMatrix, SPILL_MAX_RECOMPUTE_CELLS, UNKNOWN_SIZE_PRECHARGE,
};
use super::super::value::number_from_value;
use super::super::{settled_cell_value, EvalPass};
use crate::calc::{Ast, Func, LambdaDefinition};
use crate::memory::MemoryOwnerStats;
use crate::store::CellStore;
use crate::types::{EvalResult, FormulaError, Value, FORMULA_RECURSION_LIMIT};

pub(crate) const NAMES: &[&str] = &[
    "BYCOL",
    "BYROW",
    "ISOMITTED",
    "LAMBDA",
    "MAKEARRAY",
    "MAP",
    "REDUCE",
    "SCAN",
];
pub(crate) const CALL: &str = "$LAMBDA_CALL";
const PARAMETER_LIMIT: usize = 253;
/// Helper and call evaluations nested inside one another.
const CALL_DEPTH_LIMIT: usize = 64;
/// LAMBDA calls under one outermost helper or call.
const CALL_WORK_LIMIT: usize = 2_000_000;
/// The call record of no call: a LAMBDA created outside every call.
const NO_CALL: u32 = u32::MAX;

type Shape = (usize, usize, usize);

/// What one parameter holds during a call.
#[derive(Clone)]
pub(crate) enum Slot {
    /// A value every shape check sees as a scalar.
    Value(Value),
    /// A blank or an error: one value to read, a one-cell array to shape
    /// checks, as LAMBDA arguments have always been.
    OneCell(Value),
    Array {
        rows: usize,
        cols: usize,
        values: Rc<[Value]>,
    },
    /// One table column at a list of its rows, read in place: a measure's
    /// column in one pivot cell. No rows read as one blank, as a range with
    /// no cells does.
    Rows {
        sheet: u32,
        col: u32,
        /// The sheet row of the table's first data row.
        first_row: u32,
        /// Data rows, ascending.
        rows: Rc<[u32]>,
    },
    /// A LAMBDA and the call record it was created in. The definition is
    /// shared with the tree that wrote it, so a closure costs one handle.
    Closure {
        definition: Rc<LambdaDefinition>,
        link: u32,
    },
    /// An argument left out (`ISOMITTED` is TRUE); it reads as a blank.
    Missing,
    /// Shape analysis only: an argument's shape, known without evaluating
    /// it. Its value is not known, so reading it is `#VALUE!`.
    Shaped {
        rows: usize,
        cols: usize,
        is_array: bool,
    },
}

impl Slot {
    /// A computed value as an argument: blanks and errors are one-cell arrays.
    pub(crate) const fn element(value: Value) -> Self {
        match value {
            Value::Blank | Value::Error(_) => Self::OneCell(value),
            other @ (Value::Number(_) | Value::Text(_) | Value::Bool(_)) => Self::Value(other),
        }
    }

    pub(in crate::eval) fn array(mut matrix: EvalMatrix) -> Self {
        Self::Array {
            rows: matrix.rows,
            cols: matrix.cols,
            values: std::mem::take(&mut matrix.values).into(),
        }
    }
}

#[derive(Clone, Copy)]
struct CallRecord {
    base: u32,
    link: u32,
}

/// The parameter values of the calls in progress in one pass, and the call
/// budget of the outermost helper.
#[derive(Default)]
pub(crate) struct CallFrame {
    calls: Vec<CallRecord>,
    slots: Vec<Slot>,
    /// Helper and call evaluations in progress.
    nesting: usize,
    /// Calls made since the outermost of them began.
    work: usize,
}

impl CallFrame {
    fn top(&self) -> u32 {
        self.calls
            .len()
            .checked_sub(1)
            .map_or(NO_CALL, |top| top as u32)
    }

    /// The slot of parameter `index` declared `depth` LAMBDAs out from the
    /// call `from`.
    fn slot_from(&self, from: u32, depth: u16, index: u16) -> Option<&Slot> {
        let mut call = *self.calls.get(from as usize)?;
        for _ in 0..depth {
            call = *self.calls.get(call.link as usize)?;
        }
        self.slots.get(call.base as usize + usize::from(index))
    }

    pub(crate) fn slot(&self, depth: u16, index: u16) -> Option<&Slot> {
        self.slot_from(self.top(), depth, index)
    }

    /// Starts a call record over `slots`, which it takes and leaves empty.
    fn push(&mut self, link: u32, slots: &mut Vec<Slot>) {
        let base = self.slots.len() as u32;
        self.calls.push(CallRecord { base, link });
        self.slots.append(slots);
    }

    fn pop(&mut self) {
        if let Some(call) = self.calls.pop() {
            self.slots.truncate(call.base as usize);
        }
    }

    /// Enters a helper or call evaluation; the outermost one starts a new
    /// work budget.
    const fn enter(&mut self) -> Result<(), FormulaError> {
        if self.nesting >= CALL_DEPTH_LIMIT || self.work >= CALL_WORK_LIMIT {
            return Err(FormulaError::Num);
        }
        if self.nesting == 0 {
            self.work = 0;
        }
        self.nesting += 1;
        Ok(())
    }

    const fn exit(&mut self) {
        self.nesting -= 1;
        if self.nesting == 0 {
            self.work = 0;
        }
    }

    const fn charge(&mut self) -> Result<(), FormulaError> {
        self.work += 1;
        if self.work > CALL_WORK_LIMIT {
            Err(FormulaError::Num)
        } else {
            Ok(())
        }
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut MemoryOwnerStats) {
        stats.add_vec::<CallRecord>(self.calls.len(), self.calls.capacity());
        stats.add_vec::<Slot>(self.slots.len(), self.slots.capacity());
    }
}

/// What shape checks know about parameters: the frame of the calls in
/// progress, and the argument shapes of calls whose shape is being decided.
#[derive(Clone, Copy)]
pub(crate) struct Shapes<'a> {
    frame: Option<&'a CallFrame>,
    /// The call record parameters resolve from; [`NO_CALL`] for the top.
    call: u32,
    scope: Option<&'a ShapeScope<'a>>,
    /// Calls whose shape is being decided, nested.
    nesting: usize,
}

/// The argument shapes of one call whose shape is being decided.
pub(crate) struct ShapeScope<'a> {
    kinds: &'a [Kind<'a>],
    /// Where the called LAMBDA was created.
    outer: Shapes<'a>,
}

#[derive(Clone, Copy)]
enum Kind<'a> {
    Scalar,
    Array,
    Closure(&'a LambdaDefinition, Shapes<'a>),
}

impl<'a> Shapes<'a> {
    /// No parameters are bound: a formula's own shape, outside every call.
    pub(crate) const NONE: Shapes<'static> = Shapes {
        frame: None,
        call: NO_CALL,
        scope: None,
        nesting: 0,
    };

    pub(crate) const fn of(frame: Option<&'a CallFrame>) -> Self {
        Shapes {
            frame,
            call: NO_CALL,
            scope: None,
            nesting: 0,
        }
    }

    fn kind(self, depth: u16, index: u16) -> Option<Kind<'a>> {
        if let Some(scope) = self.scope {
            return match depth.checked_sub(1) {
                None => scope.kinds.get(usize::from(index)).copied(),
                Some(outer) => scope.outer.kind(outer, index),
            };
        }
        let frame = self.frame?;
        let from = if self.call == NO_CALL {
            frame.top()
        } else {
            self.call
        };
        Some(match frame.slot_from(from, depth, index)? {
            Slot::Value(_)
            | Slot::Missing
            | Slot::Shaped {
                is_array: false, ..
            } => Kind::Scalar,
            Slot::Shaped { is_array: true, .. }
            | Slot::OneCell(_)
            | Slot::Array { .. }
            | Slot::Rows { .. } => Kind::Array,
            Slot::Closure { definition, link } => Kind::Closure(
                definition,
                Shapes {
                    frame: Some(frame),
                    call: *link,
                    scope: None,
                    nesting: self.nesting,
                },
            ),
        })
    }

    /// Whether parameter `index`, declared `depth` LAMBDAs out, is an array.
    /// A parameter nothing binds is taken as one, so its formula still
    /// decides its shape when it runs.
    pub(crate) fn parameter_is_array(self, depth: u16, index: u16) -> bool {
        !matches!(
            self.kind(depth, index),
            Some(Kind::Scalar | Kind::Closure(..))
        )
    }

    /// The LAMBDA `function` calls and the shapes it was created in.
    fn callee(self, function: &'a Ast) -> Option<(&'a LambdaDefinition, Self)> {
        if let Ast::Parameter { depth, index, .. } = function {
            match self.kind(*depth, *index)? {
                Kind::Closure(definition, created) => Some((definition, created)),
                Kind::Scalar | Kind::Array => None,
            }
        } else {
            definition(function).ok().map(|shared| (&**shared, self))
        }
    }

    fn argument_kind(self, argument: &'a Ast) -> Kind<'a> {
        if let Ast::Parameter { depth, index, .. } = argument {
            if let Some(kind @ Kind::Closure(..)) = self.kind(*depth, *index) {
                return kind;
            }
        }
        if let Ok(shared) = definition(argument) {
            return Kind::Closure(shared, self);
        }
        if ast_produces_array(argument, self) {
            Kind::Array
        } else {
            Kind::Scalar
        }
    }
}

/// Numbers the parameter uses of every LAMBDA in `ast` (see
/// [`Ast::Parameter`]). A LET name hides a parameter of the same name, and a
/// call of a parameter, `f(2)`, becomes a call of its value. Parameters of a
/// LAMBDA that is not well formed stay names; its call reports the error.
pub(crate) fn resolve_parameters(ast: &mut Ast) {
    resolve_in(ast, &mut Vec::new());
}

/// A scope while resolving: a LAMBDA's parameters, or the names a LET binds.
struct Scope {
    names: Vec<Box<str>>,
    is_lambda: bool,
}

/// Where parameter `name` is declared, or `None` when no LAMBDA declares it
/// or a LET binding of that name hides it.
fn lookup(scopes: &[Scope], name: &str) -> Option<(u16, u16)> {
    let mut depth = 0u16;
    for scope in scopes.iter().rev() {
        if let Some(index) = scope
            .names
            .iter()
            .position(|declared| declared.eq_ignore_ascii_case(name))
        {
            return scope.is_lambda.then_some((depth, index as u16));
        }
        if scope.is_lambda {
            depth += 1;
        }
    }
    None
}

fn parameter(name: &str, (depth, index): (u16, u16)) -> Ast {
    Ast::Parameter {
        depth,
        index,
        name: name.into(),
    }
}

fn resolve_in(ast: &mut Ast, scopes: &mut Vec<Scope>) {
    match ast {
        Ast::Name(name) => {
            if let Some(found) = lookup(scopes, name) {
                *ast = parameter(name, found);
            }
        }
        Ast::Func(Func::Analysis(super::LAMBDA_ID), arguments) => {
            if let Some(definition) = resolve_lambda(arguments, scopes) {
                *ast = definition;
            }
        }
        // Already numbered when its own formula was entered.
        Ast::Lambda(_) => {}
        Ast::Func(Func::Let, arguments) => resolve_let(arguments, scopes),
        Ast::UnknownFunc(call) => {
            let crate::calc::UnknownCall {
                name,
                args: arguments,
            } = &mut **call;
            for argument in arguments.iter_mut() {
                resolve_in(argument, scopes);
            }
            if let Some(found) = lookup(scopes, name) {
                let mut call = Vec::with_capacity(arguments.len() + 1);
                call.push(parameter(name, found));
                call.extend(std::mem::take(arguments));
                *ast = Ast::UnknownFunc(Box::new(crate::calc::UnknownCall {
                    name: CALL.into(),
                    args: call.into(),
                }));
            }
        }
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Parameter { .. }
        | Ast::RegexPattern(_)
        | Ast::NamedRange(_)
        | Ast::NamedFormula(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(_)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(_)
        | Ast::AbsRange(..)
        | Ast::SheetSpan(_)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array(_) => {
            ast.fold_children_mut(&mut |child| {
                resolve_in(child, scopes);
                false
            });
        }
    }
}

/// The shared definition of a well-formed LAMBDA, its body numbered; `None`
/// when its parameters cannot declare one, so it stays as written.
fn resolve_lambda(arguments: &mut Box<[Ast]>, scopes: &mut Vec<Scope>) -> Option<Ast> {
    let (body, declared) = arguments.split_last_mut()?;
    if !valid_parameters(declared) {
        return None;
    }
    let names = declared
        .iter()
        .filter_map(|parameter| {
            if let Ast::Name(name) = parameter {
                Some(name.clone())
            } else {
                None
            }
        })
        .collect();
    scopes.push(Scope {
        names,
        is_lambda: true,
    });
    resolve_in(body, scopes);
    scopes.pop();
    let mut parameters = std::mem::take(arguments).into_vec();
    let body = parameters.pop()?;
    Some(Ast::Lambda(Rc::new(LambdaDefinition {
        parameters: parameters.into(),
        body,
    })))
}

/// Numbers the parameter uses in a LET's arguments; each binding hides a
/// parameter of its name from the bindings after it and the result.
fn resolve_let(arguments: &mut [Ast], scopes: &mut Vec<Scope>) {
    let outer = scopes.len();
    scopes.push(Scope {
        names: Vec::new(),
        is_lambda: false,
    });
    let last = arguments.len().saturating_sub(1);
    for pair in arguments[..last].chunks_mut(2) {
        if let [declaration, expression] = pair {
            resolve_in(expression, scopes);
            let bound = if let Ast::Name(name) | Ast::LetName { name, .. } = declaration {
                Some(name.clone())
            } else {
                None
            };
            if let (Some(local), Some(scope)) = (bound, scopes.last_mut()) {
                scope.names.push(local);
            }
        }
    }
    if let Some(result) = arguments.last_mut() {
        resolve_in(result, scopes);
    }
    scopes.truncate(outer);
}

/// Whether `parameters` can declare a LAMBDA: names without a period, none
/// repeated, at most [`PARAMETER_LIMIT`].
fn valid_parameters(parameters: &[Ast]) -> bool {
    parameters.len() <= PARAMETER_LIMIT
        && parameters.iter().enumerate().all(|(index, parameter)| {
            let Ast::Name(name) = parameter else {
                return false;
            };
            !name.contains('.')
                && !parameters[..index].iter().any(
                    |earlier| matches!(earlier, Ast::Name(other) if other.eq_ignore_ascii_case(name)),
                )
        })
}

fn definition(expression: &Ast) -> Result<&Rc<LambdaDefinition>, FormulaError> {
    if let Ast::Lambda(definition) = expression.bound_value() {
        Ok(definition)
    } else {
        Err(FormulaError::Value)
    }
}

pub(crate) fn parameter_count(expression: &Ast) -> Result<usize, FormulaError> {
    definition(expression).map(|shared| shared.parameters.len())
}

/// The value a parameter use reads.
pub(crate) fn parameter_value(
    store: &CellStore,
    frame: Option<&CallFrame>,
    depth: u16,
    index: u16,
) -> Value {
    match frame.and_then(|active| active.slot(depth, index)) {
        Some(Slot::Value(value) | Slot::OneCell(value)) => value.clone(),
        Some(Slot::Array { values, .. }) => values.first().cloned().unwrap_or(Value::Blank),
        Some(
            rows @ Slot::Rows {
                rows: positions, ..
            },
        ) => positions
            .first()
            .map_or(Value::Blank, |&row| row_value(store, rows, row)),
        Some(Slot::Missing) => Value::Blank,
        // Shape analysis binds shapes only; it never reads a value.
        Some(Slot::Shaped { .. }) => Value::Error(FormulaError::Value),
        // A LAMBDA is not a value, as `=LAMBDA(x,x)` is not.
        Some(Slot::Closure { .. }) => Value::Error(FormulaError::Calc),
        None => Value::Error(FormulaError::Name),
    }
}

/// The settled value of data row `row` of a [`Slot::Rows`] column.
fn row_value(store: &CellStore, slot: &Slot, row: u32) -> Value {
    let Slot::Rows {
        sheet,
        col,
        first_row,
        ..
    } = slot
    else {
        return Value::Error(FormulaError::Value);
    };
    store
        .sheets
        .get(*sheet as usize)
        .map_or(Value::Error(FormulaError::Ref), |data| {
            settled_cell_value(
                data,
                &store.strings,
                *first_row as usize + row as usize,
                *col as usize,
                &store.formula_slots,
            )
        })
}

/// Takes one value of an array argument; an error stops the reading.
pub(in crate::eval) type ReadValue<'a> = dyn FnMut(Value) -> Result<(), FormulaError> + 'a;
/// Rows and columns of an array.
pub(in crate::eval) type ArrayShape = (usize, usize);

/// Calls `read` with each value of an array, one-cell or row-list
/// parameter in row-major order, without copying the array, and returns
/// its shape. `None` when `argument` is not such a parameter.
pub(in crate::eval) fn read_parameter_values(
    store: &CellStore,
    frame: Option<&CallFrame>,
    argument: &Ast,
    read: &mut ReadValue<'_>,
) -> Option<Result<ArrayShape, FormulaError>> {
    let Ast::Parameter { depth, index, .. } = argument else {
        return None;
    };
    let slot = frame?.slot(*depth, *index)?;
    let shape = parameter_slot_shape(slot)?;
    Some(read_slot_values(store, slot, read).map(|()| shape))
}

/// Calls `read` with each value of an array-like slot in row-major order.
/// A slot with no values to read is `#VALUE!`.
fn read_slot_values(
    store: &CellStore,
    slot: &Slot,
    read: &mut ReadValue<'_>,
) -> Result<(), FormulaError> {
    match slot {
        Slot::OneCell(value) => read(value.clone()),
        Slot::Array { values, .. } => values.iter().try_for_each(|value| read(value.clone())),
        Slot::Rows { rows, .. } if rows.is_empty() => read(Value::Blank),
        Slot::Rows { rows, .. } => rows
            .iter()
            .try_for_each(|&row| read(row_value(store, slot, row))),
        Slot::Value(_) | Slot::Missing | Slot::Closure { .. } | Slot::Shaped { .. } => {
            Err(FormulaError::Value)
        }
    }
}

/// The values of an array, one-cell or row-list parameter.
pub(in crate::eval) fn parameter_matrix(
    store: &CellStore,
    frame: Option<&CallFrame>,
    depth: u16,
    index: u16,
) -> Option<EvalMatrix> {
    let slot = frame?.slot(depth, index)?;
    let (rows, cols) = parameter_slot_shape(slot)?;
    let mut values = Vec::with_capacity(rows * cols);
    read_slot_values(store, slot, &mut |value| {
        values.push(value);
        Ok(())
    })
    .ok()?;
    Some(EvalMatrix::new(rows, cols, values))
}

/// The shape of an array, one-cell or row-list parameter.
pub(crate) fn parameter_shape(
    frame: Option<&CallFrame>,
    depth: u16,
    index: u16,
) -> Option<(usize, usize)> {
    parameter_slot_shape(frame?.slot(depth, index)?)
}

fn parameter_slot_shape(slot: &Slot) -> Option<(usize, usize)> {
    match slot {
        Slot::OneCell(_) => Some((1, 1)),
        Slot::Rows { rows, .. } => Some((rows.len().max(1), 1)),
        Slot::Array { rows, cols, .. }
        | Slot::Shaped {
            rows,
            cols,
            is_array: true,
        } => Some((*rows, *cols)),
        Slot::Value(_) | Slot::Missing | Slot::Closure { .. } | Slot::Shaped { .. } => None,
    }
}

pub(crate) fn produces_array(name: &str, arguments: &[Ast], shapes: Shapes<'_>) -> bool {
    match name {
        "MAP" | "SCAN" | "BYROW" | "BYCOL" | "MAKEARRAY" => true,
        CALL => call_produces_array(arguments, shapes),
        _ => false,
    }
}

/// Whether a call's body produces an array with these arguments: each
/// parameter is an array exactly when its argument is.
fn call_produces_array<'a>(arguments: &'a [Ast], shapes: Shapes<'a>) -> bool {
    if shapes.nesting >= CALL_DEPTH_LIMIT {
        return false;
    }
    let Some((function, supplied)) = arguments.split_first() else {
        return false;
    };
    let Some((callee, created)) = shapes.callee(function) else {
        return false;
    };
    let LambdaDefinition { parameters, body } = callee;
    if parameters.len() != supplied.len() {
        return false;
    }
    let kinds: Vec<Kind<'a>> = supplied
        .iter()
        .map(|argument| {
            if matches!(argument, Ast::Missing) {
                Kind::Scalar
            } else {
                shapes.argument_kind(argument)
            }
        })
        .collect();
    let scope = ShapeScope {
        kinds: &kinds,
        outer: created,
    };
    ast_produces_array(
        body,
        Shapes {
            frame: shapes.frame,
            call: shapes.call,
            scope: Some(&scope),
            nesting: shapes.nesting + 1,
        },
    )
}

fn source_shape(context: &mut Context<'_, '_>, expression: &Ast) -> Result<Shape, FormulaError> {
    if ast_produces_array(expression, context.shapes()) {
        context
            .store
            .matrix_shape(expression, context.sheet, context.pass)
    } else {
        Ok((1, 1, 1))
    }
}

pub(crate) fn shape(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
) -> Result<Shape, FormulaError> {
    pass.results.call_frame_mut().enter()?;
    let mut context = Context {
        store,
        sheet,
        pass,
        depth: 0,
    };
    let result = helper_shape(&mut context, name, arguments);
    context.pass.results.call_frame_mut().exit();
    result
}

fn helper_shape(
    context: &mut Context<'_, '_>,
    name: &str,
    arguments: &[Ast],
) -> Result<Shape, FormulaError> {
    let (rows, cols) = match name {
        // The body's shape with each parameter's shape and no values. A
        // shape that needs a value, such as `SEQUENCE(x)`, comes from the
        // evaluation instead: this is the only place that evaluates a call
        // to size it, for an operator that needs both shapes first.
        CALL => {
            if let Some(shape) = context.static_call_shape(arguments)? {
                return Ok(shape);
            }
            let matrix = context.call_matrix(arguments)?;
            let cells = EvalMatrix::validate_shape(matrix.rows, matrix.cols, 1, 0)?;
            return Ok((matrix.rows, matrix.cols, cells));
        }
        "MAKEARRAY" => {
            if arguments.len() != 3 {
                return Err(FormulaError::Value);
            }
            let affected = FormulaWork::default();
            let mut results = FormulaResults::default();
            let mut dimensions = EvalPass {
                affected: &affected,
                results: &mut results,
            };
            let mut sizes = Context {
                store: context.store,
                sheet: context.sheet,
                pass: &mut dimensions,
                depth: 0,
            };
            (
                sizes.dimension(&arguments[0])?,
                sizes.dimension(&arguments[1])?,
            )
        }
        "MAP" => {
            if arguments.len() < 2 {
                return Err(FormulaError::Value);
            }
            let (rows, cols, _) = source_shape(context, &arguments[0])?;
            (rows, cols)
        }
        "SCAN" => {
            if arguments.len() != 3 {
                return Err(FormulaError::Value);
            }
            let (rows, cols, _) = source_shape(context, &arguments[1])?;
            (rows, cols)
        }
        "BYROW" | "BYCOL" => {
            if arguments.len() != 2 {
                return Err(FormulaError::Value);
            }
            let (rows, cols, _) = source_shape(context, &arguments[0])?;
            if name == "BYROW" {
                (rows, 1)
            } else {
                (1, cols)
            }
        }
        _ => return Err(FormulaError::Value),
    };
    Ok((rows, cols, EvalMatrix::validate_shape(rows, cols, 2, 0)?))
}

pub(crate) fn bound(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
) -> Result<usize, FormulaError> {
    if name == CALL {
        // A call is sized from its parameters' shapes when that is enough;
        // otherwise the spill is charged for what the call's own evaluation
        // produces, so the body runs once.
        pass.results.call_frame_mut().enter()?;
        let mut context = Context {
            store,
            sheet,
            pass,
            depth: 0,
        };
        let shape = context.static_call_shape(arguments);
        context.pass.results.call_frame_mut().exit();
        return Ok(shape?.map_or(UNKNOWN_SIZE_PRECHARGE, |(_, _, cells)| cells));
    }
    shape(store, name, arguments, sheet, pass).map(|(_, _, cells)| cells)
}

/// The LAMBDA a call runs and the call record it was created in.
struct Callee {
    definition: Rc<LambdaDefinition>,
    link: u32,
}

pub(in crate::eval) struct Context<'a, 'p> {
    store: &'a CellStore,
    sheet: usize,
    pass: &'a mut EvalPass<'p>,
    /// Depth of the function call; its arguments evaluate one level deeper.
    depth: usize,
}

impl<'a, 'p> Context<'a, 'p> {
    /// The store, sheet and pass in which a grouping invokes its function.
    pub(in crate::eval) const fn new(
        store: &'a CellStore,
        sheet: usize,
        pass: &'a mut EvalPass<'p>,
        depth: usize,
    ) -> Self {
        Self {
            store,
            sheet,
            pass,
            depth,
        }
    }

    fn shapes(&self) -> Shapes<'_> {
        Shapes::of(self.pass.results.call_frame())
    }

    fn slot(&self, depth: u16, index: u16) -> Option<&Slot> {
        self.pass.results.call_frame()?.slot(depth, index)
    }

    fn top(&self) -> u32 {
        self.pass
            .results
            .call_frame()
            .map_or(NO_CALL, CallFrame::top)
    }

    fn scalar(&mut self, expression: &Ast) -> Value {
        self.store
            .eval_ast(expression, self.sheet, self.pass, self.depth + 1)
    }

    fn matrix(&mut self, expression: &Ast) -> Result<EvalMatrix, FormulaError> {
        self.store
            .eval_matrix_arg(expression, self.sheet, self.pass, self.depth + 1)
    }

    fn dimension(&mut self, expression: &Ast) -> Result<usize, FormulaError> {
        let number = number_from_value(&self.scalar(expression))?;
        if !number.is_finite() || number < 1.0 || number.fract() != 0.0 {
            return Err(FormulaError::Value);
        }
        Ok(number as usize)
    }

    fn is_omitted(&self, argument: &Ast) -> bool {
        matches!(argument, Ast::Missing)
            || matches!(argument, Ast::Parameter { depth, index, .. }
                if matches!(self.slot(*depth, *index), Some(Slot::Missing)))
    }

    /// The LAMBDA `function` names: one written in place, one a name or a
    /// LET binding holds, or one a parameter holds.
    fn callee(&self, function: &Ast) -> Result<Callee, FormulaError> {
        let (shared, link) = if let Ast::Parameter { depth, index, .. } = function {
            let Some(Slot::Closure { definition, link }) = self.slot(*depth, *index) else {
                return Err(FormulaError::Value);
            };
            (definition, *link)
        } else {
            (definition(function)?, self.top())
        };
        Ok(Callee {
            definition: Rc::clone(shared),
            link,
        })
    }

    /// An argument's value as a parameter, evaluated in the caller's call.
    fn bind(&mut self, argument: &Ast) -> Result<Slot, FormulaError> {
        if matches!(argument, Ast::Missing) {
            return Ok(Slot::Missing);
        }
        if let Ast::Parameter { depth, index, .. } = argument {
            if let Some(closure @ Slot::Closure { .. }) = self.slot(*depth, *index) {
                return Ok(closure.clone());
            }
        }
        if let Ok(shared) = definition(argument) {
            return Ok(Slot::Closure {
                definition: Rc::clone(shared),
                link: self.top(),
            });
        }
        if ast_produces_array(argument, self.shapes()) {
            return self.matrix(argument).map(Slot::array);
        }
        // An error argument is bound as a value, so the body can handle it
        // (`LAMBDA(x,IFERROR(x,0))(1/0)` is 0).
        Ok(Slot::element(self.scalar(argument)))
    }

    /// Starts a call of `callee` with `slots` bound to its parameters; the
    /// caller evaluates the body and then calls [`Context::leave_call`].
    /// `slots` is left empty, so a helper reuses it for its next element.
    fn enter_call(&mut self, callee: &Callee, slots: &mut Vec<Slot>) -> Result<(), FormulaError> {
        // A result preview counts calls, not the nodes each call evaluates.
        if let Err(error) = super::super::preview_limits::work(1) {
            slots.clear();
            return Err(error);
        }
        let frame = self.pass.results.call_frame_mut();
        if let Err(error) = frame.charge() {
            slots.clear();
            return Err(error);
        }
        if self.depth >= FORMULA_RECURSION_LIMIT {
            slots.clear();
            return Err(FormulaError::Num);
        }
        frame.push(callee.link, slots);
        Ok(())
    }

    fn leave_call(&mut self) {
        self.pass.results.call_frame_mut().pop();
    }

    /// Starts `LAMBDA(…)(…)`, a named LAMBDA's call or a call of a
    /// parameter, with the function first: binds its arguments in the
    /// caller's call and enters the call.
    fn enter_arguments(&mut self, arguments: &[Ast]) -> Result<Callee, FormulaError> {
        let (function, supplied) = arguments.split_first().ok_or(FormulaError::Value)?;
        let callee = self.callee(function)?;
        if callee.definition.parameters.len() != supplied.len() {
            return Err(FormulaError::Value);
        }
        let mut slots = supplied
            .iter()
            .map(|argument| self.bind(argument))
            .collect::<Result<Vec<_>, _>>()?;
        self.enter_call(&callee, &mut slots)?;
        Ok(callee)
    }

    /// A call's value as a scalar.
    fn call_value(&mut self, arguments: &[Ast]) -> Result<Value, FormulaError> {
        let callee = self.enter_arguments(arguments)?;
        let value = self.scalar(&callee.definition.body);
        self.leave_call();
        Ok(value)
    }

    /// A call's value as an array.
    fn call_matrix(&mut self, arguments: &[Ast]) -> Result<EvalMatrix, FormulaError> {
        let callee = self.enter_arguments(arguments)?;
        let matrix = self.matrix(&callee.definition.body);
        self.leave_call();
        matrix
    }

    /// A helper's call of its function with one element's values.
    fn invoke(&mut self, callee: &Callee, slots: &mut Vec<Slot>) -> Result<Value, FormulaError> {
        if callee.definition.parameters.len() != slots.len() {
            slots.clear();
            return Err(FormulaError::Value);
        }
        self.enter_call(callee, slots)?;
        let value = self.single_value(&callee.definition.body);
        self.leave_call();
        value
    }

    /// The one value of a body: an array body must produce one cell.
    fn single_value(&mut self, body: &Ast) -> Result<Value, FormulaError> {
        if ast_produces_array(body, self.shapes()) {
            let matrix = self.matrix(body)?;
            if matrix.values.len() != 1 {
                return Err(FormulaError::Calc);
            }
            Ok(matrix.into_first())
        } else {
            match self.scalar(body) {
                Value::Error(error) => Err(error),
                value @ (Value::Number(_) | Value::Text(_) | Value::Bool(_) | Value::Blank) => {
                    Ok(value)
                }
            }
        }
    }
}

pub(crate) fn evaluate(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> EvalResult {
    if let Err(error) = pass.results.call_frame_mut().enter() {
        return Value::Error(error);
    }
    let mut context = Context {
        store,
        sheet,
        pass,
        depth,
    };
    let result = match name {
        "LAMBDA" => match arguments.split_last() {
            Some((_, parameters)) if valid_parameters(parameters) => Err(FormulaError::Calc),
            _ => Err(FormulaError::Value),
        },
        "ISOMITTED" if arguments.len() == 1 => Ok(Value::Bool(context.is_omitted(&arguments[0]))),
        "ISOMITTED" => Err(FormulaError::Value),
        CALL => context.call_value(arguments),
        "REDUCE" => reduce(&mut context, arguments, false).map(EvalMatrix::into_first),
        _ => evaluate_with_context(&mut context, name, arguments).map(EvalMatrix::into_first),
    };
    context.pass.results.call_frame_mut().exit();
    result.unwrap_or_else(Value::Error)
}

pub(in crate::eval) fn evaluate_matrix(
    store: &CellStore,
    name: &str,
    arguments: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> Result<EvalMatrix, FormulaError> {
    if depth > FORMULA_RECURSION_LIMIT {
        return Err(FormulaError::Num);
    }
    pass.results.call_frame_mut().enter()?;
    let mut context = Context {
        store,
        sheet,
        pass,
        depth,
    };
    let result = evaluate_with_context(&mut context, name, arguments);
    context.pass.results.call_frame_mut().exit();
    result
}

fn reduce(
    context: &mut Context<'_, '_>,
    arguments: &[Ast],
    scan: bool,
) -> Result<EvalMatrix, FormulaError> {
    if arguments.len() != 3 {
        return Err(FormulaError::Value);
    }
    let array = context.matrix(&arguments[1])?;
    let mut accumulator = context.scalar(&arguments[0]);
    let callee = context.callee(&arguments[2])?;
    let mut results = Vec::with_capacity(if scan { array.values.len() } else { 0 });
    let mut slots = Vec::with_capacity(2);
    for value in &array.values {
        slots.push(Slot::element(accumulator));
        slots.push(Slot::element(value.clone()));
        accumulator = context.invoke(&callee, &mut slots)?;
        if scan {
            results.push(accumulator.clone());
        }
    }
    if scan {
        Ok(EvalMatrix::new(array.rows, array.cols, results))
    } else {
        Ok(EvalMatrix::new(1, 1, vec![accumulator]))
    }
}

fn evaluate_with_context(
    context: &mut Context<'_, '_>,
    name: &str,
    arguments: &[Ast],
) -> Result<EvalMatrix, FormulaError> {
    match name {
        CALL => context.call_matrix(arguments),
        "SCAN" => reduce(context, arguments, true),
        "MAKEARRAY" => {
            if arguments.len() != 3 {
                return Err(FormulaError::Value);
            }
            let rows = context.dimension(&arguments[0])?;
            let cols = context.dimension(&arguments[1])?;
            let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
            let callee = context.callee(&arguments[2])?;
            let mut values = Vec::with_capacity(cells);
            let mut slots = Vec::with_capacity(2);
            for row in 1..=rows {
                for col in 1..=cols {
                    slots.push(Slot::Value(Value::number(row as f64)));
                    slots.push(Slot::Value(Value::number(col as f64)));
                    values.push(context.invoke(&callee, &mut slots)?);
                }
            }
            Ok(EvalMatrix::new(rows, cols, values))
        }
        "MAP" => {
            if arguments.len() < 2 {
                return Err(FormulaError::Value);
            }
            let function = arguments.last().ok_or(FormulaError::Value)?;
            let arrays = arguments[..arguments.len() - 1]
                .iter()
                .map(|argument| context.matrix(argument))
                .collect::<Result<Vec<_>, _>>()?;
            let first = arrays.first().ok_or(FormulaError::Value)?;
            if arrays.iter().any(|array| !first.same_shape(array)) {
                return Err(FormulaError::Value);
            }
            if first
                .values
                .len()
                .checked_mul(arrays.len())
                .is_none_or(|work| work > SPILL_MAX_RECOMPUTE_CELLS)
            {
                return Err(FormulaError::Num);
            }
            EvalMatrix::validate_shape(first.rows, first.cols, arrays.len() + 1, 0)?;
            let callee = context.callee(function)?;
            let mut values = Vec::with_capacity(first.values.len());
            let mut slots = Vec::with_capacity(arrays.len());
            for index in 0..first.values.len() {
                slots.extend(
                    arrays
                        .iter()
                        .map(|array| Slot::element(array.values[index].clone())),
                );
                values.push(context.invoke(&callee, &mut slots)?);
            }
            Ok(EvalMatrix::new(first.rows, first.cols, values))
        }
        "BYROW" | "BYCOL" => {
            if arguments.len() != 2 {
                return Err(FormulaError::Value);
            }
            let array = context.matrix(&arguments[0])?;
            let by_row = name == "BYROW";
            let count = if by_row { array.rows } else { array.cols };
            let callee = context.callee(&arguments[1])?;
            let mut values = Vec::with_capacity(count);
            let mut slots = Vec::with_capacity(1);
            for index in 0..count {
                let line: Rc<[Value]> = if by_row {
                    array.values[index * array.cols..(index + 1) * array.cols].into()
                } else {
                    (0..array.rows)
                        .map(|row| array.values[row * array.cols + index].clone())
                        .collect()
                };
                slots.push(Slot::Array {
                    rows: if by_row { 1 } else { array.rows },
                    cols: if by_row { array.cols } else { 1 },
                    values: line,
                });
                values.push(context.invoke(&callee, &mut slots)?);
            }
            Ok(EvalMatrix::new(
                if by_row { count } else { 1 },
                if by_row { 1 } else { count },
                values,
            ))
        }
        _ => Err(FormulaError::Value),
    }
}

impl Context<'_, '_> {
    /// A call's shape from its arguments' shapes, without evaluating the
    /// call or its arguments: `None` when the shape is not written in the
    /// formula. Shape hooks are not used, because some of them evaluate
    /// (`TEXTSPLIT`, `SEQUENCE(TICK())`), and the call would then run twice.
    fn static_call_shape(&mut self, arguments: &[Ast]) -> Result<Option<Shape>, FormulaError> {
        let (function, supplied) = arguments.split_first().ok_or(FormulaError::Value)?;
        let callee = self.callee(function)?;
        if callee.definition.parameters.len() != supplied.len() {
            return Err(FormulaError::Value);
        }
        let mut slots = Vec::with_capacity(supplied.len());
        for argument in supplied {
            let slot = if matches!(argument, Ast::Missing) {
                Slot::Missing
            } else if definition(argument).is_ok()
                || matches!(argument, Ast::Parameter { depth, index, .. }
                    if matches!(self.slot(*depth, *index), Some(Slot::Closure { .. })))
            {
                self.bind(argument)?
            } else if ast_produces_array(argument, self.shapes()) {
                let Some((rows, cols)) = self.written_shape(argument, 0) else {
                    return Ok(None);
                };
                Slot::Shaped {
                    rows,
                    cols,
                    is_array: true,
                }
            } else {
                Slot::Shaped {
                    rows: 1,
                    cols: 1,
                    is_array: false,
                }
            };
            slots.push(slot);
        }
        self.pass
            .results
            .call_frame_mut()
            .push(callee.link, &mut slots);
        let inferred = self.written_shape(&callee.definition.body, 0);
        self.pass.results.call_frame_mut().pop();
        inferred
            .map(|(rows, cols)| {
                EvalMatrix::validate_shape(rows, cols, 1, 0).map(|cells| (rows, cols, cells))
            })
            .transpose()
    }

    /// The shape `expression` has from what is written and the parameters'
    /// shapes alone: references, array constants, parameters, operators over
    /// them, and scalars. `None` for anything whose shape needs a value.
    fn written_shape(&self, expression: &Ast, depth: usize) -> Option<(usize, usize)> {
        if depth >= FORMULA_RECURSION_LIMIT {
            return None;
        }
        if let Some(range) = range_from_ast(expression, self.sheet) {
            return Some((
                (range.row_end - range.row_start) as usize + 1,
                (range.col_end - range.col_start) as usize + 1,
            ));
        }
        if !ast_produces_array(expression, self.shapes()) {
            return Some((1, 1));
        }
        if let Ast::Parameter {
            depth: outer,
            index,
            ..
        } = expression
        {
            return parameter_shape(self.pass.results.call_frame(), *outer, *index);
        }
        if let Ast::Array(array) = expression {
            let cols = array.cols as usize;
            return array
                .values
                .len()
                .checked_div(cols)
                .map(|rows| (rows, cols));
        }
        if let Ast::LetSlot {
            expression: bound, ..
        } = expression
        {
            return self.written_shape(bound, depth + 1);
        }
        if let Ast::NamedFormula(named) = expression {
            return self.written_shape(&named.expression, depth + 1);
        }
        if let Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) = expression {
            return self.written_shape(inner, depth + 1);
        }
        if let Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) = expression {
            let (left_rows, left_cols) = self.written_shape(left, depth + 1)?;
            let (right_rows, right_cols) = self.written_shape(right, depth + 1)?;
            // Sizes that do not broadcast are left to the evaluation.
            let broadcasts = |left: usize, right: usize| left == right || left == 1 || right == 1;
            return (broadcasts(left_rows, right_rows) && broadcasts(left_cols, right_cols))
                .then(|| (left_rows.max(right_rows), left_cols.max(right_cols)));
        }
        None
    }

    /// One aggregation's value: an array must hold one cell; a scalar is
    /// kept, errors included.
    fn aggregation_value(&mut self, expression: &Ast) -> Result<Value, FormulaError> {
        if ast_produces_array(expression, self.shapes()) {
            let matrix = self.matrix(expression)?;
            if matrix.values.len() != 1 {
                return Err(FormulaError::Calc);
            }
            Ok(matrix.into_first())
        } else {
            Ok(self.scalar(expression))
        }
    }
}

/// Calls `function`, a LAMBDA, with `slots`, as GROUPBY and PIVOTBY call a
/// LAMBDA aggregation.
pub(in crate::eval) fn call_with_slots(
    mut context: Context<'_, '_>,
    function: &Ast,
    mut slots: Vec<Slot>,
) -> Result<Value, FormulaError> {
    context.pass.results.call_frame_mut().enter()?;
    let result = context.callee(function).and_then(|callee| {
        if callee.definition.parameters.len() != slots.len() {
            return Err(FormulaError::Value);
        }
        context.enter_call(&callee, &mut slots)?;
        let value = context.aggregation_value(&callee.definition.body);
        context.leave_call();
        value
    });
    context.pass.results.call_frame_mut().exit();
    result
}

/// Evaluates `expression`, whose parameter uses at depth 0 read `slots`, as
/// GROUPBY and PIVOTBY call a built-in aggregation with arrays.
pub(in crate::eval) fn evaluate_with_slots(
    mut context: Context<'_, '_>,
    expression: &Ast,
    mut slots: Vec<Slot>,
) -> Result<Value, FormulaError> {
    context
        .pass
        .results
        .call_frame_mut()
        .push(NO_CALL, &mut slots);
    let result = context.aggregation_value(expression);
    context.pass.results.call_frame_mut().pop();
    result
}

/// Binds `slots` as the parameters of a call made outside every LAMBDA, for
/// the measures of a pivot cell; [`unbind_slots`] ends it.
pub(crate) fn bind_slots(results: &mut FormulaResults, mut slots: Vec<Slot>) {
    results.call_frame_mut().push(NO_CALL, &mut slots);
}

pub(crate) fn unbind_slots(results: &mut FormulaResults) {
    results.call_frame_mut().pop();
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    fn calculate(formula: &str) -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(32, 16);
        for row in 0..2 {
            for col in 0..3 {
                store.set_number(sheet, row, col, (row * 3 + col + 1) as f64, 0);
            }
        }
        store.set_formula(sheet, 4, 4, formula, 0);
        store.recompute(sheet);
        (store, sheet)
    }

    fn number(formula: &str) -> f64 {
        let (store, sheet) = calculate(formula);
        let cell = store.get_cell(sheet, 4, 4);
        assert_eq!(cell.string(), None, "{formula}");
        cell.num()
    }

    #[test]
    fn microsoft_helper_examples() {
        // Microsoft Support examples, with A1:C2 = 1,2,3;4,5,6.
        // https://support.microsoft.com/en-us/excel/functions/map-function
        // https://support.microsoft.com/en-us/excel/functions/reduce-function
        // https://support.microsoft.com/en-us/excel/functions/scan-function
        // https://support.microsoft.com/en-us/excel/functions/byrow-function
        // https://support.microsoft.com/en-us/excel/functions/bycol-function
        // https://support.microsoft.com/en-us/excel/functions/makearray-function
        // https://support.microsoft.com/en-us/excel/functions/lambda-function
        // https://support.microsoft.com/en-us/excel/functions/isomitted-function
        let examples = [
            ("=LAMBDA(number,number+1)(2)", 1, 1, vec![3.0]),
            (
                "=MAP(A1:C2,LAMBDA(a,IF(a>4,a*a,a)))",
                2,
                3,
                vec![1.0, 2.0, 3.0, 4.0, 25.0, 36.0],
            ),
            ("=REDUCE(,A1:C2,LAMBDA(a,b,a+b^2))", 1, 1, vec![91.0]),
            (
                "=SCAN(1,A1:C2,LAMBDA(a,b,a*b))",
                2,
                3,
                vec![1.0, 2.0, 6.0, 24.0, 120.0, 720.0],
            ),
            (
                "=BYROW(A1:C2,LAMBDA(array,MAX(array)))",
                2,
                1,
                vec![3.0, 6.0],
            ),
            (
                "=BYCOL(A1:C2,LAMBDA(array,MAX(array)))",
                1,
                3,
                vec![4.0, 5.0, 6.0],
            ),
            (
                "=MAKEARRAY(3,3,LAMBDA(r,c,r*c))",
                3,
                3,
                vec![1.0, 2.0, 3.0, 2.0, 4.0, 6.0, 3.0, 6.0, 9.0],
            ),
            ("=LAMBDA(x,y,IF(ISOMITTED(y),x,x+y))(10,)", 1, 1, vec![10.0]),
        ];
        for (formula, rows, cols, expected) in examples {
            let (store, sheet) = calculate(formula);
            for row in 0..rows {
                for col in 0..cols {
                    let cell = store.get_cell(sheet, 4 + row, 4 + col);
                    assert_eq!(cell.string(), None, "{formula}: {:?}", cell.string());
                    assert_eq!(
                        cell.num(),
                        expected[row * cols + col],
                        "{formula} at {row},{col}"
                    );
                }
            }
        }
    }

    #[test]
    fn helper_errors_and_bounded_recursion() {
        let cases = [
            ("=LAMBDA(x,x+1)", "#CALC!"),
            ("=LAMBDA(x,x+1)(1,2)", "#VALUE!"),
            ("=LAMBDA(x,x,x)(1,2)", "#VALUE!"),
            ("=LAMBDA(a.b,a.b)(1)", "#VALUE!"),
            ("=MAP(A1:C2,LAMBDA(a,b,a+b))", "#VALUE!"),
            ("=MAP(A1:C2,A1:A2,LAMBDA(a,b,a+b))", "#VALUE!"),
            ("=REDUCE(0,A1:C2,LAMBDA(a,a))", "#VALUE!"),
            ("=SCAN(0,A1:C2,LAMBDA(a,a))", "#VALUE!"),
            ("=BYROW(A1:C2,LAMBDA(a,b,a))", "#VALUE!"),
            ("=BYCOL(A1:C2,LAMBDA(a,b,a))", "#VALUE!"),
            ("=BYROW(A1:C2,LAMBDA(a,a))", "#CALC!"),
            ("=MAKEARRAY(0,3,LAMBDA(r,c,r*c))", "#VALUE!"),
            ("=MAKEARRAY(3,3,LAMBDA(r,r))", "#VALUE!"),
            ("=MAKEARRAY(1001,1000,LAMBDA(r,c,r*c))", "#NUM!"),
            ("=ISOMITTED()", "#VALUE!"),
            ("=LAMBDA(x,x)()", "#VALUE!"),
            ("=LAMBDA(f,f)(LAMBDA(x,x))", "#CALC!"),
            ("=LAMBDA(f,f(1))(2)", "#VALUE!"),
            // Deep recursion still stops: by depth, and by the call budget.
            ("=LAMBDA(self,self(self))(LAMBDA(self,self(self)))", "#NUM!"),
            ("=LAMBDA(self,n,IF(n=0,0,self(self,n-1)+self(self,n-1)))(LAMBDA(self,n,IF(n=0,0,self(self,n-1)+self(self,n-1))),30)", "#NUM!"),
        ];
        for (formula, expected) in cases {
            let (store, sheet) = calculate(formula);
            assert_eq!(
                store.get_cell(sheet, 4, 4).string().as_deref(),
                Some(expected),
                "{formula}"
            );
        }
    }

    #[test]
    fn lexical_binding_omission_and_array_invocation() {
        let cases = [
            ("=LET(x,7,f,LAMBDA(x,x+1),f(2))", 3.0),
            ("=LET(x,7,f,LAMBDA(y,x+y),f(2))", 9.0),
            ("=LET(f,LAMBDA(x,x+1),MAP(A1:C2,f))", 2.0),
            ("=LAMBDA(x,LET(x,5,x))(2)", 5.0),
            ("=LAMBDA(x,LAMBDA(x,x+1)(4)+x)(2)", 7.0),
            ("=LAMBDA(x,IF(ISOMITTED(x),1,2))(A10)", 2.0),
            ("=LAMBDA(x,SUM(x))(A1:C2)", 21.0),
            ("=LAMBDA(self,n,IF(n=0,1,n*self(self,n-1)))(LAMBDA(self,n,IF(n=0,1,n*self(self,n-1))),6)", 720.0),
        ];
        for (formula, expected) in cases {
            assert_eq!(number(formula), expected, "{formula}");
        }
        let (store, sheet) = calculate("=LAMBDA(x,SEQUENCE(x))(3)");
        assert_eq!(store.get_cell(sheet, 6, 4).num(), 3.0);
    }

    /// A LAMBDA inside another reads the outer parameters of the call it was
    /// created in, wherever it runs: written in place, bound by a LET and
    /// called under further LAMBDAs, or passed as an argument.
    #[test]
    fn nested_lambdas_read_their_enclosing_parameters() {
        let cases = [
            ("=SUM(LAMBDA(y,MAP(A1:C2,LAMBDA(x,x+y)))(10))", 81.0),
            (
                "=LAMBDA(y,LET(f,LAMBDA(x,x+y),SUM(MAP(A1:C2,LAMBDA(z,f(z))))))(1)",
                27.0,
            ),
            (
                "=LAMBDA(y,LET(a,y*2,SUM(MAP(A1:C2,LAMBDA(x,x+a)))))(1)",
                33.0,
            ),
            ("=LAMBDA(f,f(2))(LAMBDA(x,x*3))", 6.0),
            ("=LAMBDA(n,LAMBDA(f,f(n))(LAMBDA(x,x+n)))(4)", 8.0),
            ("=REDUCE(0,A1:C2,LAMBDA(a,v,a+LAMBDA(w,w*v)(2)))", 42.0),
            (
                "=LAMBDA(x,y,LAMBDA(z,LAMBDA(w,x*1000+y*100+z*10+w)(4))(3))(1,2)",
                1234.0,
            ),
        ];
        for (formula, expected) in cases {
            assert_eq!(number(formula), expected, "{formula}");
        }
    }

    /// Whether a call spills follows its arguments: an array argument makes
    /// the parameter an array, a single cell keeps it a value.
    #[test]
    fn a_call_spills_when_an_array_reaches_its_result() {
        let (store, sheet) = calculate("=LAMBDA(x,x*2)(A1:A2)");
        assert_eq!(store.get_cell(sheet, 4, 4).num(), 2.0);
        assert_eq!(store.get_cell(sheet, 5, 4).num(), 8.0);
        let (store, sheet) = calculate("=LAMBDA(x,x*2)(A2)");
        assert_eq!(store.get_cell(sheet, 4, 4).num(), 8.0);
        assert_eq!(store.get_cell(sheet, 5, 4).kind(), 0);
    }

    /// A call that spills is sized from its parameters' shapes, or charged
    /// for what its one evaluation produces: its body runs once per call,
    /// whether its shape is static (`x*TICK()`) or needs a value
    /// (`SEQUENCE(x)`). TICK is a host function that counts its calls.
    #[test]
    fn a_spilling_call_runs_its_body_once() {
        use crate::eval::custom::CustomFunction;
        use crate::types::Value;
        use std::cell::Cell;
        use std::rc::Rc;

        for (formula, cells) in [
            ("=LAMBDA(x,x*TICK())(A1:A3)", 3),
            ("=LAMBDA(x,SEQUENCE(x)*TICK())(A3)", 3),
            (
                "=LAMBDA(x,TRANSPOSE(--TEXTSPLIT(TICK()&\",2,3\",\",\")))(0)",
                3,
            ),
            ("=LAMBDA(x,x*2)(SEQUENCE(TICK()+2))", 3),
            ("=LAMBDA(x,y,x+y*TICK())(A1:A3,B1)", 3),
        ] {
            let calls = Rc::new(Cell::new(0));
            let counter = Rc::clone(&calls);
            let mut store = CellStore::new();
            let sheet = store.add_sheet(8, 8);
            for row in 0..3 {
                store.set_number(sheet, row, 0, (row + 1) as f64, 0);
            }
            store.set_number(sheet, 0, 1, 1.0, 0);
            assert!(store.install_custom_function(
                "TICK",
                CustomFunction {
                    implementation: Rc::new(move |_| {
                        counter.set(counter.get() + 1);
                        Value::number(1.0)
                    }),
                    volatile: false,
                }
            ));
            store.set_formula(sheet, 0, 4, formula, 0);
            store.recompute(sheet);
            assert!(
                store.get_cell(sheet, cells - 1, 4).num() >= 3.0,
                "{formula} spills"
            );
            assert_eq!(
                calls.get(),
                1,
                "{formula} ran its body {} times",
                calls.get()
            );
        }
    }

    /// A shared LAMBDA definition follows value changes, written in a cell or
    /// held by a defined name, and a cell's LAMBDA follows row edits. (The
    /// engine does not move defined names on row edits; core redefines them.)
    #[test]
    fn shared_lambda_references_follow_value_and_row_edits() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        store.set_number(sheet, 0, 0, 7.0, 0);
        assert!(store.set_named_formula("Add", -1, "=LAMBDA(x,x+$A$1)"));
        store.set_formula(sheet, 2, 1, "= LAMBDA(x, x + A1)(2)", 0);
        store.set_formula(sheet, 2, 2, "=Add(3)", 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 2, 1).num(), 9.0);
        assert_eq!(store.get_cell(sheet, 2, 2).num(), 10.0);

        store.set_number(sheet, 0, 0, 11.0, 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 2, 1).num(), 13.0);
        assert_eq!(store.get_cell(sheet, 2, 2).num(), 14.0);

        assert!(store.add_rows(sheet, 0, 1));
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 3, 1).num(), 13.0);
        assert_eq!(
            store.formula_source(sheet, 3, 1).as_deref(),
            Some("= LAMBDA(x, x + A2)(2)")
        );
    }

    #[test]
    fn named_lambdas_call_themselves_and_keep_their_text() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 4);
        assert!(store.set_named_formula("Fact", -1, "=LAMBDA(n,IF(n<=1,1,n*Fact(n-1)))"));
        store.set_formula(sheet, 0, 0, "=Fact(5)", 0);
        store.set_formula(sheet, 1, 0, "=LAMBDA(Total,x,Total+x)(1,2)", 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 0, 0).num(), 120.0);
        assert_eq!(store.get_cell(sheet, 1, 0).num(), 3.0);
        assert_eq!(
            store.formula_source(sheet, 1, 0).as_deref(),
            Some("=LAMBDA(Total,x,Total+x)(1,2)")
        );
    }
}
