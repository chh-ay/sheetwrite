//! LET names resolved to slots when a formula is entered, and the slot frame
//! a pass keeps for their values.
//!
//! A LET whose bindings are all plain scalar computations has every use of a
//! binding name rewritten in place to [`Ast::LetName`]: the name stays, so the
//! formula writes back unchanged, and the slot says which binding it reads.
//! Evaluation then reads the original tree. A use evaluates its binding's
//! expression the first time and keeps the value in the slot; it never copies
//! the binding into the use, as the expansion of any other LET does.
//!
//! Every shape check (`range_from_ast`, array bounds and shapes) treats a
//! scalar binding's use as a scalar, which is what it sees through the
//! expansion too: such a binding is never a range, a reference or an array.
//! A function call qualifies only when no shape check looks inside it
//! ([`call_has_scalar_result`]): those checks see through `INTERSECT`, the
//! array functions, `INDEX`, `CHOOSE`, `OFFSET`, `INDIRECT` and spill
//! references, and take the scalar path for every other call. So results do
//! not depend on which path a LET takes.

use std::ptr;

use crate::calc::{Ast, Func};
use crate::memory::MemoryOwnerStats;
use crate::types::EvalResult;

use super::reference::ast_contains_runtime_ref;
use super::{ast_produces_array, expand_let_ast, valid_let_name};

/// Rewrites, in place, the uses of the bindings of every LET in `ast` that
/// [`let_resolvable`] accepts. Each outermost such LET numbers its slots from
/// zero in tree order, nested LETs included.
pub(crate) fn resolve_let_names(ast: &mut Ast) {
    #[cfg(test)]
    if !RESOLVE_LET_NAMES.with(std::cell::Cell::get) {
        return;
    }

    match ast {
        Ast::Func(Func::Let, args) => {
            if let_resolvable(args) {
                let mut bindings = Vec::new();
                let mut next = 0;
                resolve_scope(args, &mut bindings, &mut next);
            }
        }
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                resolve_let_names(arg);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            resolve_let_names(left);
            resolve_let_names(right);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => resolve_let_names(inner),
        _ => {}
    }
}

#[cfg(test)]
thread_local! {
    /// Tests turn resolution off to compare the resolved path with the
    /// expanding path on the same formulas.
    pub(crate) static RESOLVE_LET_NAMES: std::cell::Cell<bool> = const { std::cell::Cell::new(true) };
}

/// Whether the LET with `args`, and every LET inside it, can read its
/// bindings through slots:
/// - its expansion succeeds, so the binding count, name and expanded-size
///   limits are the expansion's own;
/// - every binding of every LET in it is a scalar computation
///   ([`scalar_binding`]);
/// - nothing in it resolves references at run time (`OFFSET`, `INDIRECT`),
///   and on the full engine it calls no analysis function, so `LAMBDA`
///   capture and calls through bindings keep the expanding path.
pub(crate) fn let_resolvable(args: &[Ast]) -> bool {
    expand_let_ast(args).is_ok()
        && args.iter().all(|arg| !ast_contains_runtime_ref(arg))
        && lets_have_scalar_bindings(args)
}

/// Whether each LET call in `args` (the arguments of a LET) has only scalar
/// bindings, and nothing outside the core function set is called.
fn lets_have_scalar_bindings(args: &[Ast]) -> bool {
    let last = args.len().saturating_sub(1);
    args[..last]
        .chunks(2)
        .all(|pair| pair.get(1).is_some_and(scalar_binding))
        && args.get(last).is_some_and(nested_lets_scalar)
}

fn nested_lets_scalar(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::Let, args) => lets_have_scalar_bindings(args),
        #[cfg(feature = "analysis")]
        Ast::Func(Func::Analysis(_), _) | Ast::UnknownFunc(..) => false,
        Ast::Func(_, args) => args.iter().all(nested_lets_scalar),
        #[cfg(not(feature = "analysis"))]
        Ast::UnknownFunc(_, args) => args.iter().all(nested_lets_scalar),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            nested_lets_scalar(left) && nested_lets_scalar(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => nested_lets_scalar(inner),
        _ => true,
    }
}

/// Whether a binding expression is a scalar computation: a constant, another
/// binding's name, a call with a scalar result ([`call_has_scalar_result`]),
/// or an operator over constants, single cells, names and such calls. A bare
/// cell is not one, because a function reads it as a one-cell range.
pub(crate) fn scalar_binding(expression: &Ast) -> bool {
    match expression {
        Ast::Num(_) | Ast::Str(_) | Ast::Bool(_) | Ast::Name(_) => true,
        Ast::Bin(..) | Ast::Cmp(..) | Ast::Neg(_) | Ast::Pos(_) | Ast::Percent(_) => {
            scalar_operand(expression)
        }
        Ast::Func(..) => call_has_scalar_result(expression),
        _ => false,
    }
}

fn scalar_operand(ast: &Ast) -> bool {
    match ast {
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Name(_)
        | Ast::Cell(..)
        | Ast::AbsCell(..)
        | Ast::SheetCell(..) => true,
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            scalar_operand(left) && scalar_operand(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => scalar_operand(inner),
        Ast::Func(..) => call_has_scalar_result(ast),
        _ => false,
    }
}

/// Whether `call` is a scalar to every shape check, so a
/// name bound to it reads like the call itself. Excluded:
/// - calls that can return a reference or that shape checks see through:
///   `INTERSECT`, `UNION`, `INDEX`, `CHOOSE`, `OFFSET`, `INDIRECT`,
///   `ANCHORARRAY` (spill references) and `LET`;
/// - calls that produce an array ([`ast_produces_array`]): the array
///   functions and anything over them;
/// - on the full engine, analysis functions, whose array hooks decide their
///   shape;
/// - calls whose arguments hold a LET that cannot resolve.
fn call_has_scalar_result(call: &Ast) -> bool {
    let Ast::Func(func, args) = call else {
        return false;
    };
    #[cfg(feature = "analysis")]
    if matches!(func, Func::Analysis(_)) {
        return false;
    }
    if matches!(
        func,
        Func::Intersect
            | Func::Union
            | Func::Index
            | Func::Choose
            | Func::Offset
            | Func::Indirect
            | Func::AnchorArray
            | Func::Let
    ) {
        return false;
    }
    !ast_produces_array(call) && args.iter().all(nested_lets_scalar)
}

/// One visible binding while resolving: its name and slot.
type Binding = (String, u32);

/// Resolves the LET with `args`: each binding's expression sees the bindings
/// before it, the result expression sees all of them.
fn resolve_scope(args: &mut [Ast], bindings: &mut Vec<Binding>, next: &mut u32) {
    let outer = bindings.len();
    let last = args.len() - 1;
    for pair in args[..last].chunks_mut(2) {
        let [name, expression] = pair else {
            continue;
        };
        resolve_uses(expression, bindings, next);
        let Ast::Name(text) = name else {
            continue;
        };
        debug_assert!(valid_let_name(text));
        let slot = *next;
        *next += 1;
        bindings.push((text.clone(), slot));
        *name = Ast::LetName {
            slot,
            name: std::mem::take(text).into_boxed_str(),
        };
    }
    resolve_uses(&mut args[last], bindings, next);
    bindings.truncate(outer);
}

fn resolve_uses(ast: &mut Ast, bindings: &mut Vec<Binding>, next: &mut u32) {
    match ast {
        Ast::Name(name) => {
            if let Some(&(_, slot)) = bindings
                .iter()
                .rev()
                .find(|(binding, _)| binding.eq_ignore_ascii_case(name))
            {
                *ast = Ast::LetName {
                    slot,
                    name: std::mem::take(name).into_boxed_str(),
                };
            }
        }
        Ast::Func(Func::Let, args) => resolve_scope(args, bindings, next),
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
            for arg in args {
                resolve_uses(arg, bindings, next);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            resolve_uses(left, bindings, next);
            resolve_uses(right, bindings, next);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            resolve_uses(inner, bindings, next);
        }
        _ => {}
    }
}

/// The values of the LET slots of one pass, and the binding expression each
/// resolved slot reads.
///
/// Expanded LETs and resolved LETs each address their slots from a base:
/// - an expanded LET opens its own slots on top of the stack and drops them
///   when it ends ([`LetFrame::open_expanded`]);
/// - the outermost resolved LET of a formula opens the slots that all the
///   resolved LETs of that formula share, and restores the enclosing
///   formula's base when it ends ([`LetFrame::open_resolved`]). So a formula
///   that another formula's LET reads opens slots above the reader's and
///   drops them before the reader continues, and a formula without a LET
///   costs the frame nothing.
///
/// # Safety of the binding references
///
/// `bindings` holds raw pointers to binding expressions inside the tree of
/// the formula being evaluated. They are sound because:
/// - a pointer is stored only while the LET that owns the expression is being
///   evaluated, and that evaluation borrows the formula's tree;
/// - evaluation borrows the whole store immutably, so no formula tree can be
///   changed or dropped while a pointer into it exists;
/// - [`LetFrame::close_resolved`] drops the pointers of a formula's LETs when
///   its outermost resolved LET ends, and the pass clears the frame at its
///   end by dropping it, so no pointer outlives the evaluation that stored it;
/// - only [`LetFrame::binding`] reads them, for a slot of the formula being
///   evaluated.
#[derive(Default)]
pub(crate) struct LetFrame {
    values: Vec<Option<EvalResult>>,
    bindings: Vec<*const Ast>,
    /// Where the resolved slots of the formula being evaluated start, once
    /// its outermost resolved LET has opened them.
    resolved_base: Option<usize>,
    /// Where the slots of the expanded LET being evaluated start.
    expanded_base: usize,
}

/// Which resolved slots a LET opened: its own, above those of the formula
/// that was being evaluated, or none because it shares its enclosing LET's.
pub(crate) enum ResolvedScope {
    Outermost {
        /// The resolved base of the formula that was being evaluated.
        enclosing: Option<usize>,
    },
    Nested,
}

impl LetFrame {
    /// Opens `slots` empty slots for an expanded LET. Returns the enclosing
    /// expanded LET's base for [`LetFrame::close_expanded`].
    pub(crate) fn open_expanded(&mut self, slots: u32) -> usize {
        let enclosing = self.expanded_base;
        self.expanded_base = self.values.len();
        let len = self.expanded_base + slots as usize;
        self.values.resize(len, None);
        self.bindings.resize(len, ptr::null());
        enclosing
    }

    /// Drops the slots of the expanded LET that ends.
    pub(crate) fn close_expanded(&mut self, enclosing: usize) {
        self.truncate(self.expanded_base);
        self.expanded_base = enclosing;
    }

    /// The value of `slot` of the expanded LET being evaluated, once known.
    pub(crate) fn expanded_value(&self, slot: u32) -> Option<EvalResult> {
        self.values
            .get(self.expanded_base + slot as usize)
            .cloned()
            .flatten()
    }

    /// Keeps the value of `slot` of the expanded LET being evaluated.
    pub(crate) fn remember_expanded(&mut self, slot: u32, value: EvalResult) {
        if let Some(entry) = self.values.get_mut(self.expanded_base + slot as usize) {
            *entry = Some(value);
        }
    }

    /// Opens the resolved slots of a LET whose first binding has
    /// `first_slot`. Only a formula's outermost resolved LET numbers its
    /// first binding zero; it opens slots above any in use. A nested LET's
    /// slots follow its enclosing LET's, so it shares the open ones. Returns
    /// what [`LetFrame::close_resolved`] restores.
    pub(crate) fn open_resolved(&mut self, first_slot: u32) -> ResolvedScope {
        if first_slot != 0 {
            return ResolvedScope::Nested;
        }
        let enclosing = self.resolved_base.replace(self.values.len());
        ResolvedScope::Outermost { enclosing }
    }

    /// Drops the formula's resolved slots when the LET that opened them ends,
    /// and returns to the slots of the formula that was being evaluated.
    pub(crate) fn close_resolved(&mut self, scope: ResolvedScope) {
        let ResolvedScope::Outermost { enclosing } = scope else {
            return;
        };
        if let Some(base) = std::mem::replace(&mut self.resolved_base, enclosing) {
            self.truncate(base);
        }
    }

    /// Points resolved `slot` at its binding expression and forgets any value
    /// it held, so the LET evaluates its bindings afresh.
    pub(crate) fn bind(&mut self, slot: u32, expression: &Ast) {
        let Some(base) = self.resolved_base else {
            return;
        };
        let index = base + slot as usize;
        if self.values.len() <= index {
            self.values.resize(index + 1, None);
            self.bindings.resize(index + 1, ptr::null());
        }
        self.values[index] = None;
        self.bindings[index] = expression;
    }

    /// The value of resolved `slot`, once its binding has been evaluated.
    pub(crate) fn resolved_value(&self, slot: u32) -> Option<EvalResult> {
        let index = self.resolved_base? + slot as usize;
        self.values.get(index).cloned().flatten()
    }

    /// Keeps the value of resolved `slot`.
    pub(crate) fn remember_resolved(&mut self, slot: u32, value: EvalResult) {
        let Some(base) = self.resolved_base else {
            return;
        };
        if let Some(entry) = self.values.get_mut(base + slot as usize) {
            *entry = Some(value);
        }
    }

    /// The binding expression of resolved `slot`.
    ///
    /// # Safety
    ///
    /// The caller must use the reference only while the LET that bound `slot`
    /// is being evaluated; see the type's safety notes.
    #[allow(
        unsafe_code,
        reason = "LET bindings point into the formula's own tree; a safe version is not yet measured on both machines"
    )]
    pub(crate) unsafe fn binding<'tree>(&self, slot: u32) -> Option<&'tree Ast> {
        let index = self.resolved_base? + slot as usize;
        let pointer = *self.bindings.get(index)?;
        // SAFETY: a non-null pointer points into the tree of the formula
        // being evaluated, which the caller keeps borrowed (type notes).
        unsafe { pointer.as_ref() }
    }

    fn truncate(&mut self, len: usize) {
        self.values.truncate(len);
        self.bindings.truncate(len);
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut MemoryOwnerStats) {
        stats.add_vec::<Option<EvalResult>>(self.values.len(), self.values.capacity());
        stats.add_vec::<*const Ast>(self.bindings.len(), self.bindings.capacity());
    }
}

#[cfg(test)]
mod tests {
    use super::{let_resolvable, resolve_let_names, scalar_binding, RESOLVE_LET_NAMES};
    use crate::calc::{parse, Ast, Func};
    use crate::store::CellStore;

    fn let_args(source: &str) -> Vec<Ast> {
        match parse(source) {
            Ok(Ast::Func(Func::Let, args)) => args,
            other => panic!("{source} is not a LET: {other:?}"),
        }
    }

    #[test]
    fn scalar_bindings_are_constants_operators_cells_in_operators_and_names() {
        for source in [
            "1",
            "\"a\"",
            "TRUE",
            "x",
            "A1*2",
            "-A1",
            "A1&\" \"&B1",
            "(x+1)*y%",
            "A1>B1",
            "SUM(A1:A3)",
            "ROUND(A1,2)",
            "ROUND(x/3,2)*2+LEN(B1)",
            "XLOOKUP(2,A1:A3,B1:B3)",
            "IF(A1>1,A2,A3)",
            "RAND()",
        ] {
            assert!(scalar_binding(&parse(source).unwrap()), "{source}");
        }
        for source in ["A1", "A1:A3", "{1,2}", "A1:A3*2", "Sheet1!A1"] {
            assert!(!scalar_binding(&parse(source).unwrap()), "{source}");
        }
    }

    /// Each call that a shape check sees through, or that can return a
    /// reference or an array, keeps the expanding path, also inside an
    /// operator.
    #[test]
    fn calls_that_shape_checks_see_through_are_not_scalar() {
        for source in [
            "(A1:B2 B1:C2)",
            "(A1,B1)",
            "INDEX(A1:A3,1)",
            "CHOOSE(1,A1,A2)",
            "OFFSET(A1,0,0)",
            "INDIRECT(\"A1\")",
            "A1#",
            "LET(y,1,y)",
            "SEQUENCE(3)",
            "FILTER(A1:A3,A1:A3>1)",
            "SORT(A1:A3)",
            "UNIQUE(A1:A3)",
            "TRANSPOSE(A1:A3)",
            "TAKE(A1:A3,1)",
            "DROP(A1:A3,1)",
            "CHOOSECOLS(A1:B3,1)",
            "CHOOSEROWS(A1:B3,1)",
            "TRIMRANGE(A1:A3)",
            "INDEX(A1:A3,1)*2+1",
            "SUM(LET(y,A1:A3,y))",
        ] {
            assert!(!scalar_binding(&parse(source).unwrap()), "{source}");
        }
        #[cfg(feature = "analysis")]
        assert!(!scalar_binding(&parse("REGEXTEST(B1,\"a\")").unwrap()));
    }

    #[test]
    fn only_lets_with_scalar_bindings_within_the_limits_resolve() {
        for source in [
            "=LET(x,1,x+1)",
            "=LET(x,A1*$C$1,y,x+1,z,y*x,x+y+z)",
            "=LET(x,2,LET(y,3,x*y))",
            "=LET(x,1/0,x+1)",
            "=LET(x,1,x,2,x+10)",
            "=LET(x,2,SUM(A1:A3)*x)",
            "=LET(s,SUM(A1:A3),r,ROUND(s/7,2),s+r)",
            "=LET(x,SUM(A1:A3),LET(y,ROUND(x/7,3),x+y))",
            "=LET(v,XLOOKUP(2,A1:A3,A1:A3),v*10)",
        ] {
            assert!(let_resolvable(&let_args(source)), "{source}");
        }
        for source in [
            "=LET(x,A1:A3,SUM(x))",
            "=LET(x,A1,x+1)",
            "=LET(x,SEQUENCE(3),x)",
            "=LET(x,2,LET(y,A1:A3,SUM(y)*x))",
            "=LET(x,1,OFFSET(A1,1,1)+x)",
            "=LET(x,1)",
        ] {
            assert!(!let_resolvable(&let_args(source)), "{source}");
        }
    }

    #[test]
    fn resolution_keeps_the_written_formula() {
        let source = "=LET(x,A1*$C$1,y,x+1,LET(z,y*x,x+y+z))";
        let mut ast = parse(source).unwrap();
        resolve_let_names(&mut ast);
        let mut written = String::new();
        crate::calc::write_ast(&ast, &mut written);
        let mut original = String::new();
        crate::calc::write_ast(&parse(source).unwrap(), &mut original);
        assert_eq!(written, original);
        assert!(
            matches!(&ast, Ast::Func(Func::Let, args) if matches!(args[0], Ast::LetName { slot: 0, .. }))
        );
    }

    /// The LET formulas of the test suite and the gate rows, with cells that
    /// hold numbers, text, an error and formulas that use LET themselves.
    const FORMULAS: &[&str] = &[
        "=LET(x,1,x+1)",
        "=LET(x,1,y,x+1,x+y)",
        "=LET(x,A1*$C$1,x+x+x)",
        "=LET(x,A1*$C$1,y,x+1,z,y*x,x+y+z)",
        "=LET(x,2,LET(x,3,x*2))",
        "=LET(x,2,LET(x,3,x)+x)",
        "=LET(x,2,LET(y,3,x*y))",
        "=LET(x,1,LET(x,x+1,x))+x",
        "=LET(x,x+1,x)+x",
        "=LET(x,2,y,1/0,x+y)",
        "=LET(x,1/0,5)",
        "=LET(x,1/0,x+1)",
        "=LET(x,1,x,2,x+10)",
        "=LET(x,A1:A3,SUM(x))",
        "=LET(x,A1,x+1)",
        "=LET(x,SEQUENCE(3),SUM(x))",
        "=LET(a,1,b,C1,SEQUENCE(a+b))",
        "=LET(n,5,n+SUM(OFFSET(A1,0,0)))",
        "=LET(x,1,OFFSET(A1,1,1)+x)",
        "=SUM(LET(x,SEQUENCE(2),1),2)",
        "=LET(x,B1&\" \"&B2,LEN(x)+LEN(x))",
        "=LET(x,B1>B2,IF(x,1,2))",
        "=LET(x,A2*2,y,x/0,IFERROR(y,x))",
        "=LET(x,A3,y,x*2,INDEX(A1:A3,y/2))",
        "=LET(x,C2,x*2)",
        "=LET(x,C3+1,x*2)",
        "=LET(x,2,y,x*3,SUM(A1:A3)*y)",
        "=LET(total,A1+A2+A3,total*total)",
        "=-LET(x,SEQUENCE(3),1)",
        "=LET(x,SEQUENCE(3),25)%",
        // Aggregates.
        "=LET(s,SUM(A1:A3),a,AVERAGE(A1:A3),c,COUNTIF(A1:A3,\">1\"),s*a+c)",
        // Rounding and maths, and calls over earlier bindings.
        "=LET(r,ROUND(A2/3,2),m,MOD(A3,2),r+m)",
        "=LET(x,A1*2,y,ROUND(x/3,2),z,MAX(x,y),x+y+z)",
        "=LET(x,ROUND(A1,0)*2+LEN(B2),x*x)",
        "=LET(x,SUM(A1:A3),LET(y,ROUND(x/7,3),x+y))",
        // Lookups: one cell, a whole row, and the classic lookups.
        "=LET(v,XLOOKUP(2,A1:A3,A1:A3),v*10)",
        "=LET(v,XLOOKUP(2,A1:A3,A1:C3),v)",
        "=LET(v,XLOOKUP(2,A1:A3,A1:C3),SUM(v))",
        "=LET(v,VLOOKUP(3,A1:C3,1,FALSE),m,MATCH(2,A1:A3,0),v+m)",
        // Conditionals.
        "=LET(c,IF(A1>1,A2,A3),e,IFERROR(1/0,7),c+e)",
        // Text.
        "=LET(n,LEN(B1),t,TEXT(A3,\"0.0\"),j,CONCAT(B1,B2),n&t&j)",
        // A volatile binding is evaluated once per evaluation of its LET.
        "=LET(r,RAND(),r-r)",
        // Errors.
        "=LET(e,SQRT(-1),IFERROR(e,5)+ISERROR(e))",
        "=LET(e,1/0,n,ROUND(e,1),IFERROR(n,3))",
        // Bindings used where arrays are evaluated.
        "=LET(k,MAX(A1:A3),SUMPRODUCT((A1:A3<k)*A1:A3))",
        "=LET(k,MIN(A1:A3),FILTER(A1:A3,A1:A3>k))",
        "=LET(k,SUM(A1:A2),SEQUENCE(k))",
        "=LET(k,ROUND(A1,0),A1:A3*k)",
        "=LET(k,COUNT(A1:A3),INDEX(A1:A3,k))",
        "=LET(k,LEN(B1),ROWS(A1:A3)+k)",
    ];

    /// Values of `formula` in D1 of a small sheet, before and after an edit.
    fn evaluate(formula: &str, resolve: bool) -> Vec<String> {
        RESOLVE_LET_NAMES.with(|cell| cell.set(resolve));
        let mut store = CellStore::new();
        let sheet = store.add_sheet(5, 5);
        for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
            store.set_number(sheet, row, 0, value, 0);
        }
        store.set_string(sheet, 0, 1, "alpha", 0);
        store.set_string(sheet, 1, 1, "beta", 0);
        store.set_number(sheet, 0, 2, 2.0, 0);
        store.set_formula(sheet, 1, 2, "=LET(y,A1*10,y+1)", 0);
        store.set_formula(sheet, 2, 2, "=LET(z,C2*2,LET(w,z+1,w*z))", 0);
        store.set_formula(sheet, 0, 3, formula, 0);
        store.recompute(sheet);
        let mut seen = Vec::new();
        let mut read = |store: &CellStore| {
            for row in 0..3 {
                let cell = store.get_cell(sheet, row, 3);
                seen.push(format!(
                    "{}:{}:{:?}",
                    cell.kind(),
                    cell.num(),
                    cell.string()
                ));
            }
        };
        read(&store);
        store.set_number(sheet, 0, 0, 7.0, 0);
        store.set_number(sheet, 0, 2, 3.0, 0);
        store.recompute(sheet);
        read(&store);
        assert!(store
            .formula_results
            .as_ref()
            .is_none_or(|results| results.let_frame().is_none()));
        RESOLVE_LET_NAMES.with(|cell| cell.set(true));
        seen
    }

    #[test]
    fn resolved_and_expanded_lets_give_the_same_values() {
        for formula in FORMULAS {
            assert_eq!(
                evaluate(formula, true),
                evaluate(formula, false),
                "{formula}"
            );
        }
    }

    /// A LET whose binding reads cells holding LET formulas several formulas
    /// deep, and a cycle through two LETs.
    #[test]
    fn lets_that_read_other_lets_keep_their_own_slots() {
        let run = |resolve: bool| {
            RESOLVE_LET_NAMES.with(|cell| cell.set(resolve));
            let mut store = CellStore::new();
            let sheet = store.add_sheet(4, 4);
            store.set_number(sheet, 0, 0, 5.0, 0);
            store.set_formula(sheet, 1, 0, "=LET(x,A1+1,y,x*2,y+x)", 0);
            store.set_formula(sheet, 2, 0, "=LET(x,A2*3,y,x+A1,LET(z,y-x,z*y))", 0);
            store.set_formula(sheet, 3, 0, "=LET(x,A3+A2,y,x*A1,x+y)", 0);
            store.set_formula(sheet, 0, 1, "=LET(x,B2+1,x)", 0);
            store.set_formula(sheet, 1, 1, "=LET(y,B1+1,y)", 0);
            store.recompute(sheet);
            let values: Vec<String> = [(1, 0), (2, 0), (3, 0), (0, 1), (1, 1)]
                .into_iter()
                .map(|(row, col)| {
                    let cell = store.get_cell(sheet, row, col);
                    format!("{}:{}:{:?}", cell.kind(), cell.num(), cell.string())
                })
                .collect();
            RESOLVE_LET_NAMES.with(|cell| cell.set(true));
            values
        };
        assert_eq!(run(true), run(false));
    }
}
