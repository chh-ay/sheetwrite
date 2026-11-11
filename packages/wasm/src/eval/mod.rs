//! Formula recompute: dependency index, affected-set growth, evaluation.

#[cfg(feature = "analysis")]
pub(crate) mod analysis;
mod areas;
mod array;
mod criteria;
#[cfg(feature = "host-functions")]
pub(crate) mod custom;
mod date;
mod dependency;
#[cfg(test)]
mod excel_results_tests;
mod financial;
mod functions;
mod index;
mod info;
mod iteration;
mod let_slots;
mod literal_criteria;
mod literal_products;
mod literal_statistics;
mod lookup;
#[cfg(test)]
mod lookup_rule_tests;
mod math;
mod matrix;
mod number_format;
#[cfg(test)]
mod number_format_corpus_tests;
mod operators;
#[cfg(test)]
mod pass_rule_tests;
mod random;
mod range_fold;
mod range_reader;
mod reference;
#[cfg(feature = "analysis")]
pub(crate) mod regex_patterns;
mod statistics;
mod subtotal;
#[cfg(test)]
mod subtotal_tests;
#[cfg(test)]
mod test_support;
mod text;
mod value;
mod wildcard;

use rustc_hash::{FxHashMap, FxHashSet};
use std::cell::Cell;
use std::cmp::Ordering;

use crate::calc::{write_col, Ast, Func, SHEET_COLS, SHEET_ROWS};
use crate::cells::{encode_num, encode_str_id, payload_num, payload_str_id, DenseSourceRun};
use crate::formula_slots::{FormulaId, FormulaResults, FormulaStore, FormulaWork};
use crate::graph::DirtySeeds;
use crate::row_visibility::SkippedRows;
use crate::sheet::{formula_error_with_entry, SheetData};
use crate::spill::{spill_ownership_within_budget, SpillRange};
use crate::store::CellStore;
use crate::types::{
    cell_key, string_from_pool_ref, AbsCellKey, CellRange, EvalResult, FormulaError, StringStorage,
    Value, FORMULA_RECURSION_LIMIT, KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING,
    RANGE_CELL_LIMIT,
};

use array::dynamic_recompute_within_limit;
pub(crate) use array::{ast_produces_array, Shapes};
pub(crate) use criteria::sum_range_extent;
use criteria::{aggregate_if, extreme_if, Criterion, IfExtreme, IfSum};
use date::host_clock_serial;
pub(crate) use dependency::{build_dep_index, DepIndex};
use dependency::{
    collect_affected_formulas, direct_readers, seed_additional_depth_errors,
    seed_dependency_depth_errors,
};
use functions::{apply_func, treats_cell_as_reference, FuncAccumulator, ReductionFold};
pub(crate) use iteration::IterationLimits;
use iteration::IterationPassGuard;
pub(crate) use let_slots::{resolve_let_names, LetFrame};
use literal_criteria::CriteriaFold;
pub(crate) use lookup::LookupStates;
use lookup::{option_code, positive_index};
pub(crate) use matrix::range_from_ast as static_range;
pub(crate) use matrix::{intersection_range, matrix_resource_stats, reset_matrix_resource_stats};
use matrix::{optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_BYTES};
#[cfg(feature = "analysis")]
pub(crate) use operators::comparison;
pub(crate) use random::RandomSource;
use range_reader::RangeReader;
use reference::{finish_runtime_reads, start_runtime_reads, RewriteScope, RuntimeReads};
pub(crate) use subtotal::ast_calls_subtotal;
use subtotal::SkippedCells;
use value::{bool_from_value, cached_formula_value, compare_values, text_from_value};

const LET_BINDING_LIMIT: usize = 126;
const LET_EXPANDED_NODE_LIMIT: usize = 16_384;

thread_local! {
    /// The cell whose formula is being evaluated. Each evaluation sets it and
    /// its guard restores the enclosing value, so nested evaluations keep a
    /// stack on the native stack without a heap list.
    static FORMULA_ORIGIN: Cell<Option<(u32, u32)>> = const { Cell::new(None) };
}

#[cfg(test)]
thread_local! {
    /// Formula evaluations on this thread. Tests read it to count how often a
    /// formula ran, which no value can show.
    pub(crate) static FORMULA_EVALUATIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

/// Sets the formula origin for one evaluation and restores the enclosing
/// origin when dropped.
struct FormulaOriginGuard {
    enclosing: Option<(u32, u32)>,
}

impl FormulaOriginGuard {
    fn push(origin: (u32, u32)) -> Self {
        let enclosing = FORMULA_ORIGIN.with(|current| current.replace(Some(origin)));
        Self { enclosing }
    }
}

impl Drop for FormulaOriginGuard {
    fn drop(&mut self) {
        let enclosing = self.enclosing;
        FORMULA_ORIGIN.with(|current| current.set(enclosing));
    }
}

/// The cell whose formula is being evaluated, or nothing outside a formula.
pub(crate) fn current_formula_origin() -> Option<(u32, u32)> {
    FORMULA_ORIGIN.with(Cell::get)
}

/// State shared by every evaluation in one recompute pass: the formulas the
/// pass recomputes, the results computed so far, and the formulas on the
/// current evaluation path, which detect cycles.
pub(crate) struct EvalPass<'a> {
    /// Selection is immutable while this evaluation reads indexed results.
    pub(crate) affected: &'a FormulaWork,
    /// Results and active-call bits exist only for this pass.
    pub(crate) results: &'a mut FormulaResults,
}

impl EvalPass<'_> {
    /// What shape checks know about the LAMBDA parameters of the calls in
    /// progress.
    #[cfg(feature = "analysis")]
    pub(crate) fn shapes(&self) -> Shapes<'_> {
        Shapes::of(self.results.call_frame())
    }

    #[cfg(not(feature = "analysis"))]
    pub(crate) fn shapes(&self) -> Shapes<'static> {
        Shapes::NONE
    }
}

fn literal_cell_value(strings: &StringStorage, kind: u8, payload: u64) -> Value {
    match kind {
        KIND_NUMBER => Value::number(payload_num(payload)),
        KIND_STRING => string_from_pool_ref(strings, payload_str_id(payload))
            .map(Value::text)
            .unwrap_or(Value::Error(FormulaError::Ref)),
        KIND_BOOL => Value::Bool(payload_num(payload) != 0.0),
        _ => Value::Blank,
    }
}

/// The calculated-slot encoding of a result value; text joins the pool.
pub(crate) fn calculated_slot(strings: &mut StringStorage, value: &Value) -> (u8, u64) {
    match value {
        Value::Number(number) => (KIND_NUMBER, encode_num(*number)),
        Value::Text(text) => (KIND_STRING, encode_str_id(strings.intern(text))),
        Value::Bool(value) => (KIND_BOOL, encode_num(f64::from(*value))),
        Value::Blank => (KIND_EMPTY, 0),
        Value::Error(error) => (KIND_FORMULA, error.slot() as u64),
    }
}

/// A cell's value as a formula reads it between passes: its literal source,
/// or the stored result of its formula or of the spill that covers it.
#[cfg(feature = "analysis")]
pub(crate) fn settled_cell_value(
    sheet: &SheetData,
    strings: &StringStorage,
    row: usize,
    col: usize,
    slots: &FormulaStore,
) -> Value {
    if !sheet.cells.contains_cell(row, col) {
        return Value::Error(FormulaError::Ref);
    }
    if !sheet.cells.is_loaded(row, col) {
        return Value::Error(FormulaError::Loading);
    }

    let index = sheet.cells.idx(row, col);
    let source_kind = sheet.cells.source_kind_at(index);
    let (kind, payload) = if source_kind == KIND_EMPTY {
        sheet
            .cells
            .calculated_cell_at(index)
            .unwrap_or((KIND_EMPTY, 0))
    } else {
        (source_kind, sheet.cells.source_payload_at(index))
    };
    if kind != KIND_FORMULA {
        return literal_cell_value(strings, kind, payload);
    }

    if let Some(key) = cell_key(row, col) {
        if let Some(entry) = sheet.formulas.get(key, slots) {
            let error = formula_error_with_entry(sheet, key, Some(entry));
            return cached_formula_value(sheet, strings, index, error);
        }
    }
    match sheet.cells.calculated_error_at(index) {
        Some(error) => Value::Error(error),
        None => Value::number(sheet.cells.num_at(index)),
    }
}

/// Dense literal reads use one whole-grid source run; paged sources go through
/// `eval_at`, which owns their load-state checks.
#[derive(Clone, Copy)]
struct LiteralSources<'a> {
    sources: DenseSourceRun<'a>,
}

impl<'a> LiteralSources<'a> {
    fn new(sheet: &'a SheetData, depth: usize) -> Option<Self> {
        if depth >= FORMULA_RECURSION_LIMIT {
            return None;
        }

        sheet.cells.dense_sources().map(|sources| Self { sources })
    }

    #[inline]
    fn value_at(self, strings: &StringStorage, index: usize) -> Option<Value> {
        let (kind, payload) = self.sources.literal(index)?;
        Some(literal_cell_value(strings, kind, payload))
    }
}

/// One LET binding: its name, its expression, how many earlier bindings its
/// expression can see, the slot its value is kept in, and how many LAMBDAs
/// enclose it inside the expansion.
type LetBinding<'a> = (&'a str, &'a Ast, usize, u32, u16);

/// Expands a LET call into an expression tree where every binding use carries
/// the slot its value is kept in, and reports how many slots the tree holds.
pub(super) fn expand_let_ast(args: &[Ast]) -> Result<(Ast, u32), FormulaError> {
    let mut bindings = Vec::new();
    bindings
        .try_reserve(args.len() / 2)
        .map_err(|_| FormulaError::Num)?;
    let mut nodes = 0usize;
    let mut next_slot = 0u32;
    let expanded = expand_let_args(args, &mut bindings, &mut nodes, &mut next_slot, 0)?;
    Ok((expanded, next_slot))
}

/// Expands every LET reachable from `ast`, for the analysis passes that read
/// the expansion: dependency collection, volatility and array bounds.
pub(crate) fn expand_let_reachable_ast(ast: &Ast) -> Result<Ast, FormulaError> {
    let mut bindings = Vec::new();
    bindings.try_reserve(4).map_err(|_| FormulaError::Num)?;
    let mut nodes = 0usize;
    let mut next_slot = 0u32;
    expand_let_node(ast, &mut bindings, &mut nodes, &mut next_slot, 0)
}

fn expand_let_args<'a>(
    args: &'a [Ast],
    bindings: &mut Vec<LetBinding<'a>>,
    nodes: &mut usize,
    next_slot: &mut u32,
    lambdas: u16,
) -> Result<Ast, FormulaError> {
    if args.len() < 3 || args.len().is_multiple_of(2) || args.len() / 2 > LET_BINDING_LIMIT {
        return Err(FormulaError::Value);
    }
    let original_len = bindings.len();
    for pair in args[..args.len() - 1].as_chunks::<2>().0 {
        // A resolved LET keeps each binding's name in its `LetName`.
        let name = match &pair[0] {
            Ast::Name(name) => name.as_str(),
            Ast::LetName { name, .. } => &**name,
            _ => {
                bindings.truncate(original_len);
                return Err(FormulaError::Value);
            }
        };
        if !valid_let_name(name) {
            bindings.truncate(original_len);
            return Err(FormulaError::Value);
        }
        let visible = bindings.len();
        let slot = *next_slot;
        *next_slot = next_slot.checked_add(1).ok_or(FormulaError::Num)?;
        bindings.push((name, &pair[1], visible, slot, lambdas));
    }
    let result = expand_let_node(&args[args.len() - 1], bindings, nodes, next_slot, lambdas);
    bindings.truncate(original_len);
    result
}

pub(super) fn valid_let_name(name: &str) -> bool {
    let mut chars = name.chars();
    chars
        .next()
        .is_some_and(|first| first == '_' || first.is_ascii_alphabetic())
        && chars.all(|ch| ch == '_' || ch == '.' || ch.is_ascii_alphanumeric())
}

fn count_let_node(nodes: &mut usize) -> Result<(), FormulaError> {
    *nodes = nodes.checked_add(1).ok_or(FormulaError::Num)?;
    if *nodes > LET_EXPANDED_NODE_LIMIT {
        Err(FormulaError::Num)
    } else {
        Ok(())
    }
}

/// Expands the LET bindings `ast` uses. `lambdas` counts the LAMBDAs around
/// `ast` inside the expansion: a binding copied under more LAMBDAs than it
/// was written under has its parameter uses reach that many further out.
fn expand_let_node<'a>(
    ast: &'a Ast,
    bindings: &mut Vec<LetBinding<'a>>,
    nodes: &mut usize,
    next_slot: &mut u32,
    lambdas: u16,
) -> Result<Ast, FormulaError> {
    // A resolved use expands like the name it keeps.
    let used_name = match ast {
        Ast::Name(name) => Some(name.as_str()),
        Ast::LetName { name, .. } => Some(&**name),
        _ => None,
    };
    if let Some(name) = used_name {
        if let Some((_, expression, visible, slot, bound_in)) = bindings
            .iter()
            .rev()
            .find(|(binding, ..)| binding.eq_ignore_ascii_case(name))
            .copied()
        {
            let hidden = bindings.split_off(visible);
            let result = expand_let_node(expression, bindings, nodes, next_slot, bound_in);
            bindings.extend(hidden);
            let mut result = result?;
            shift_parameters(&mut result, lambdas - bound_in);
            return Ok(Ast::LetSlot {
                slot,
                expression: Box::new(result),
            });
        }
    }
    count_let_node(nodes)?;
    #[cfg(feature = "analysis")]
    if let Ast::UnknownFunc(name, args) = ast {
        if let Some((_, expression, visible, _, bound_in)) = bindings
            .iter()
            .rev()
            .find(|(binding, ..)| binding.eq_ignore_ascii_case(name))
            .copied()
        {
            let hidden = bindings.split_off(visible);
            let callee = expand_let_node(expression, bindings, nodes, next_slot, bound_in);
            bindings.extend(hidden);
            let mut callee = callee?;
            shift_parameters(&mut callee, lambdas - bound_in);
            let mut invocation = vec![callee];
            invocation.extend(
                args.iter()
                    .map(|argument| expand_let_node(argument, bindings, nodes, next_slot, lambdas))
                    .collect::<Result<Vec<_>, _>>()?,
            );
            return Ok(Ast::UnknownFunc(analysis::lambda::CALL.into(), invocation));
        }
    }
    let expand =
        |arg: &'a Ast,
         bindings: &mut Vec<LetBinding<'a>>,
         nodes: &mut usize,
         next_slot: &mut u32| { expand_let_node(arg, bindings, nodes, next_slot, lambdas) };
    Ok(match ast {
        // The parameters stay as declared; the body sits one LAMBDA deeper.
        #[cfg(feature = "analysis")]
        Ast::Func(Func::Analysis(analysis::LAMBDA_ID), args) if !args.is_empty() => {
            let (body, parameters) = args.split_last().expect("checked non-empty");
            let mut definition = parameters.to_vec();
            definition.push(expand_let_node(
                body,
                bindings,
                nodes,
                next_slot,
                lambdas + 1,
            )?);
            Ast::Func(Func::Analysis(analysis::LAMBDA_ID), definition)
        }
        Ast::Func(Func::Let, args) => {
            return expand_let_args(args, bindings, nodes, next_slot, lambdas)
        }
        Ast::Func(func, args) => Ast::Func(
            *func,
            args.iter()
                .map(|arg| expand(arg, bindings, nodes, next_slot))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        Ast::UnknownFunc(name, args) => Ast::UnknownFunc(
            name.clone(),
            args.iter()
                .map(|arg| expand(arg, bindings, nodes, next_slot))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        Ast::Bin(op, left, right) => Ast::Bin(
            *op,
            Box::new(expand(left, bindings, nodes, next_slot)?),
            Box::new(expand(right, bindings, nodes, next_slot)?),
        ),
        Ast::Cmp(op, left, right) => Ast::Cmp(
            *op,
            Box::new(expand(left, bindings, nodes, next_slot)?),
            Box::new(expand(right, bindings, nodes, next_slot)?),
        ),
        Ast::Neg(inner) => Ast::Neg(Box::new(expand(inner, bindings, nodes, next_slot)?)),
        Ast::Pos(inner) => Ast::Pos(Box::new(expand(inner, bindings, nodes, next_slot)?)),
        Ast::Percent(inner) => Ast::Percent(Box::new(expand(inner, bindings, nodes, next_slot)?)),
        other => other.clone(),
    })
}

/// Makes the parameter uses in `ast` that reach outside it reach `by`
/// LAMBDAs further out, for a copy placed under `by` more LAMBDAs.
#[cfg(feature = "analysis")]
fn shift_parameters(ast: &mut Ast, by: u16) {
    fn shift(ast: &mut Ast, by: u16, inside: u16) {
        match ast {
            Ast::Parameter { depth, .. } if *depth >= inside => *depth += by,
            Ast::Func(Func::Analysis(analysis::LAMBDA_ID), args) => {
                if let Some(body) = args.last_mut() {
                    shift(body, by, inside + 1);
                }
            }
            _ => {
                ast.fold_children_mut(&mut |child| {
                    shift(child, by, inside);
                    false
                });
            }
        }
    }
    if by > 0 {
        shift(ast, by, 0);
    }
}

#[cfg(not(feature = "analysis"))]
fn shift_parameters(_ast: &mut Ast, _by: u16) {}

/// The match and search modes of XMATCH and XLOOKUP. A missing argument takes
/// its default, and an argument error is returned unchanged.
fn lookup_modes(
    match_mode: Option<Value>,
    search_mode: Option<Value>,
) -> Result<(i32, i32), FormulaError> {
    let match_mode = match match_mode.as_ref().map(option_code).transpose()? {
        None => 0,
        Some(mode @ -1..=2) => mode,
        Some(_) => return Err(FormulaError::Value),
    };
    let search_mode = match search_mode.as_ref().map(option_code).transpose()? {
        None => 1,
        Some(mode @ (-2 | -1 | 1 | 2)) => mode,
        Some(_) => return Err(FormulaError::Value),
    };
    Ok((match_mode, search_mode))
}

fn address_text(
    row: usize,
    col: usize,
    abs: i32,
    a1: bool,
    sheet: Option<&str>,
) -> Result<String, FormulaError> {
    if row >= SHEET_ROWS as usize || col >= SHEET_COLS as usize {
        return Err(FormulaError::Value);
    }
    let mut output = String::new();
    if let Some(sheet) = sheet {
        output.push('\'');
        output.push_str(&sheet.replace('\'', "''"));
        output.push_str("'!");
    }
    let row_absolute = matches!(abs, 1 | 2);
    let col_absolute = matches!(abs, 1 | 3);
    if a1 {
        if col_absolute {
            output.push('$');
        }
        // The check above keeps the column inside the sheet, so it fits in `u32`.
        write_col(col as u32, &mut output);
        if row_absolute {
            output.push('$');
        }
        output.push_str(&(row + 1).to_string());
    } else {
        if row_absolute {
            output.push('R');
            output.push_str(&(row + 1).to_string());
        } else {
            output.push_str("R[");
            output.push_str(&(row + 1).to_string());
            output.push(']');
        }
        if col_absolute {
            output.push('C');
            output.push_str(&(col + 1).to_string());
        } else {
            output.push_str("C[");
            output.push_str(&(col + 1).to_string());
            output.push(']');
        }
    }
    Ok(output)
}

struct SpillChange {
    sheet: usize,
    sequence: usize,
    cells: Vec<(u32, u32)>,
    /// How many leading `cells` are spill output. The rest is the anchor,
    /// which a reader evaluates on demand, so runtime readers ignore it.
    output_cells: usize,
}

/// The bounding range of some cells of one sheet, or `None` without cells.
fn cells_bounds(sheet: usize, cells: &[(u32, u32)]) -> Option<CellRange> {
    let (&(row, col), rest) = cells.split_first()?;
    let first = CellRange::new(sheet as u32, row, col, row, col);
    Some(rest.iter().fold(first, |bounds, &(row, col)| {
        range_union(bounds, CellRange::new(sheet as u32, row, col, row, col))
    }))
}

/// The bounding range of two ranges on the same sheet.
fn range_union(left: CellRange, right: CellRange) -> CellRange {
    CellRange::new(
        left.sheet,
        left.row_start.min(right.row_start),
        left.col_start.min(right.col_start),
        left.row_end.max(right.row_end),
        left.col_end.max(right.col_end),
    )
}

fn ranges_intersect(left: CellRange, right: CellRange) -> bool {
    left.sheet == right.sheet
        && left.row_start <= right.row_end
        && right.row_start <= left.row_end
        && left.col_start <= right.col_end
        && right.col_start <= left.col_end
}

/// One bounding range per sheet that covers every range of `ranges`.
fn sheet_envelopes(ranges: impl IntoIterator<Item = CellRange>) -> Vec<CellRange> {
    let mut envelopes: Vec<CellRange> = Vec::new();
    for range in ranges {
        match envelopes
            .iter_mut()
            .find(|envelope| envelope.sheet == range.sheet)
        {
            Some(envelope) => *envelope = range_union(*envelope, range),
            None => envelopes.push(range),
        }
    }
    envelopes
}

/// A formula that may have read a spill output changed after it was
/// evaluated.
struct StaleReader {
    reader: AbsCellKey,
    /// The sequence of the latest such change.
    changed_at: usize,
    /// Only merged runtime reads cover the change, so the reader may not
    /// have read it.
    approximate: bool,
}

/// The spill outputs changed in one round, sorted by sheet and first row,
/// with a max tree over their last rows. A read visits only outputs whose
/// row band meets its own, so checking n readers against m changes costs
/// about (n + k) log m for k row-overlapping pairs instead of n * m.
struct ChangedOutputs {
    outputs: Vec<(CellRange, usize)>,
    /// Node `i` holds the largest last row below it; its children are `2i`
    /// and `2i + 1`, and leaf `leaves + k` is output `k`.
    last_rows: Vec<u32>,
    leaves: usize,
}

impl ChangedOutputs {
    fn new(changes: &[SpillChange]) -> Self {
        let mut outputs: Vec<(CellRange, usize)> = changes
            .iter()
            .filter_map(|change| {
                let bounds = cells_bounds(change.sheet, &change.cells[..change.output_cells])?;
                Some((bounds, change.sequence))
            })
            .collect();
        outputs.sort_unstable_by_key(|(bounds, _)| (bounds.sheet, bounds.row_start));

        let leaves = outputs.len().next_power_of_two();
        let mut last_rows = vec![0; leaves * 2];
        for (index, (bounds, _)) in outputs.iter().enumerate() {
            last_rows[leaves + index] = bounds.row_end;
        }
        for node in (1..leaves).rev() {
            last_rows[node] = last_rows[2 * node].max(last_rows[2 * node + 1]);
        }

        Self {
            outputs,
            last_rows,
            leaves,
        }
    }

    /// The latest change among the outputs that meet `read`.
    fn latest_meeting(&self, read: CellRange) -> Option<usize> {
        // Outputs of the read's sheet that start at or above its last row;
        // the tree then skips those that end above its first row.
        let first = self
            .outputs
            .partition_point(|(bounds, _)| bounds.sheet < read.sheet);
        let end = self.outputs.partition_point(|(bounds, _)| {
            (bounds.sheet, bounds.row_start) <= (read.sheet, read.row_end)
        });

        let mut latest = None;
        if first < end {
            self.visit(1, (0, self.leaves), (first, end), read, &mut latest);
        }
        latest
    }

    fn visit(
        &self,
        node: usize,
        (start, stop): (usize, usize),
        (first, end): (usize, usize),
        read: CellRange,
        latest: &mut Option<usize>,
    ) {
        if stop <= first || end <= start || self.last_rows[node] < read.row_start {
            return;
        }

        if stop - start == 1 {
            let (bounds, sequence) = self.outputs[start];
            if ranges_intersect(read, bounds) {
                *latest = (*latest).max(Some(sequence));
            }
            return;
        }

        let middle = start + (stop - start) / 2;
        self.visit(2 * node, (start, middle), (first, end), read, latest);
        self.visit(2 * node + 1, (middle, stop), (first, end), read, latest);
    }
}

/// Runtime readers whose recorded reads meet a spill output changed in this
/// round, each with the latest such change.
fn stale_runtime_readers(
    readers: &FxHashMap<AbsCellKey, RuntimeReads>,
    outputs: &ChangedOutputs,
) -> Vec<StaleReader> {
    readers
        .iter()
        .filter_map(|(&reader, reads)| {
            reads
                .ranges
                .iter()
                .filter_map(|&read| outputs.latest_meeting(read))
                .max()
                .map(|changed_at| StaleReader {
                    reader,
                    changed_at,
                    approximate: reads.merged,
                })
        })
        .collect()
}

impl CellStore {
    pub(crate) fn recompute_sheet(&mut self, sheet: usize) {
        self.recompute_seed_sheets(&[sheet]);
    }

    /// The edit barrier. Any source change recalculates every volatile formula
    /// in the workbook, host functions registered as volatile included, so
    /// sheets that hold volatile formulas join the seeds even when only
    /// another sheet changed. A barrier without changes does no work,
    /// volatile formulas included.
    pub(crate) fn recompute_changed(&mut self) {
        let mut seeds: Vec<usize> = self
            .sheets
            .iter()
            .enumerate()
            .filter_map(|(sheet, data)| data.formulas.has_dirty().then_some(sheet))
            .collect();

        if !seeds.is_empty() {
            seeds.extend(self.sheets.iter().enumerate().filter_map(|(sheet, data)| {
                (data.formulas.has_volatile() && !data.formulas.has_dirty()).then_some(sheet)
            }));
            #[cfg(feature = "host-functions")]
            {
                seeds = self.with_custom_volatile_seeds(seeds);
            }
        }

        self.recompute_seed_sheets(&seeds);
    }

    /// The host clock barrier: recalculates every volatile formula and its
    /// dependents at the instant the host already stored. Pending source
    /// changes of those sheets join the same pass.
    pub(crate) fn recompute_volatile_formulas(&mut self) {
        let seeds: Vec<usize> = self
            .sheets
            .iter()
            .enumerate()
            .filter_map(|(sheet, data)| data.formulas.has_volatile().then_some(sheet))
            .collect();
        #[cfg(feature = "host-functions")]
        let seeds = self.with_custom_volatile_seeds(seeds);

        self.recompute_at_volatile_serial(&seeds);
    }

    /// Every other recalculation reads the clock once, as Excel does, so all
    /// NOW and TODAY formulas of one pass see the same instant. A pass without
    /// volatile formulas never reads it.
    pub(crate) fn recompute_seed_sheets(&mut self, seeds: &[usize]) {
        // Without formulas or pivot tables an edit can change no calculated
        // value, so the barrier only ends the pass. Doing that here keeps the
        // formula pass, the largest function of the engine, out of plain value
        // edits: a WebAssembly runtime that sees it run on every edit compiles
        // it while the host edits a data grid.
        if self.pivots.is_none() && !self.has_formulas() {
            self.finish_formula_free_pass(seeds);
            return;
        }

        let has_volatile = seeds.iter().any(|&sheet| {
            self.sheets
                .get(sheet)
                .is_some_and(|data| data.formulas.has_volatile())
        });
        if has_volatile {
            let serial = host_clock_serial();
            if serial.is_finite() {
                self.volatile_serial = serial;
            }

            // Runtime references can reach another volatile sheet without a
            // static graph edge. Evaluate both in one pass to expose cycles.
            let mut volatile_seeds = seeds.to_vec();
            volatile_seeds.extend(self.sheets.iter().enumerate().filter_map(|(sheet, data)| {
                (data.formulas.has_volatile() && !seeds.contains(&sheet)).then_some(sheet)
            }));
            self.recompute_at_volatile_serial(&volatile_seeds);
            return;
        }

        self.recompute_at_volatile_serial(seeds);
    }

    /// Recalculates the formulas of `seeds`, then the pivot tables whose
    /// sources or outputs the pass changed (the default engine places saved
    /// output). A workbook without pivots skips the pivot step entirely.
    fn recompute_at_volatile_serial(&mut self, seeds: &[usize]) {
        self.recompute_formulas(seeds);

        if self.pivots.is_some() {
            self.settle_pivots();
        }
    }

    /// Ends a pass for `sheets`. The pivot step first records which source
    /// rows and output blockers the pass changed, because finishing clears
    /// the dirty seeds.
    fn finish_recompute<I>(&mut self, sheets: I, affected: Option<&FormulaWork>)
    where
        I: IntoIterator<Item = usize> + Clone,
    {
        if self.pivots.is_some() {
            self.capture_pivot_changes(sheets.clone(), affected);
        }

        for sheet in sheets {
            if let Some(data) = self.sheets.get_mut(sheet) {
                data.finish_recompute();
            }
        }
    }

    fn has_formulas(&self) -> bool {
        self.sheets.iter().any(|sheet| !sheet.formulas.is_empty())
    }

    /// Ends a pass of a workbook without formulas. No formula reads the edited
    /// values, so only the sums cached by the last pass and the dirty seeds go.
    fn finish_formula_free_pass(&mut self, seeds: &[usize]) {
        self.finish_recompute(seeds.iter().copied(), None);
        self.graph.invalidate();
        self.formula_slots = FormulaStore::default();
        self.formula_results = None;
    }

    /// Recalculates the formulas that the dirty cells of the `seeds` sheets
    /// affect. It does not settle pivot tables, which is why the pivot settle
    /// loops call it between their own steps.
    pub(crate) fn recompute_formulas(&mut self, seeds: &[usize]) {
        if seeds.is_empty() {
            return;
        }

        if !self.has_formulas() {
            self.finish_formula_free_pass(seeds);
            return;
        }

        let _iteration_pass = IterationPassGuard::begin(self.iteration.is_some());

        let mut memo = self.formula_results.take().unwrap_or_default();
        let index = self.graph.ensure_index(&self.sheets, &self.formula_slots);
        self.formula_slots.release_retired();
        let mut affected = collect_affected_formulas(
            &self.sheets,
            &self.formula_slots,
            seeds,
            index,
            memo.take_work(),
        );

        for &sheet in seeds {
            let data = &self.sheets[sheet];

            // A dirty cell inside a spilled range invalidates that anchor.
            match data.formulas.dirty_seeds() {
                DirtySeeds::All => {
                    for anchor in data.spill.anchors() {
                        affected.select(&self.sheets, AbsCellKey::from_local(sheet, anchor));
                    }
                }
                DirtySeeds::Cells(cells) => data.spill.for_each_anchor_covering(cells, |anchor| {
                    affected.select(&self.sheets, AbsCellKey::from_local(sheet, anchor));
                }),
                DirtySeeds::Ranges(rects) => {
                    data.spill.for_each_anchor_intersecting(rects, |anchor| {
                        affected.select(&self.sheets, AbsCellKey::from_local(sheet, anchor));
                    })
                }
            }
        }

        if affected.is_empty() {
            self.finish_recompute(seeds.iter().copied(), None);
            memo.finish(affected);
            self.formula_results = Some(memo);
            return;
        }

        let found_cycle = self.graph.index().is_some_and(|index| {
            seed_dependency_depth_errors(
                &self.sheets,
                &self.formula_slots,
                &affected,
                index,
                &mut memo,
            )
        });

        let mut processed_arrays: FxHashSet<AbsCellKey> = FxHashSet::default();

        if self
            .graph
            .index()
            .is_some_and(|index| !index.has_dynamic_arrays())
        {
            if self.independent_pass() {
                self.evaluate_independent_pass(&affected, &mut memo);
            } else {
                self.evaluate_selected(&affected, &mut memo, found_cycle);
            }

            self.finish_recompute(seeds.iter().copied(), Some(&affected));
            memo.finish(affected);
            self.formula_results = Some(memo);

            return;
        }

        self.flush_seeded(&mut memo);
        if let Some(limits) = self.iteration.as_deref().copied().filter(|_| found_cycle) {
            self.settle_circular_references(&affected, &mut memo, limits, false);
        }

        let mut seeded_sheets: FxHashSet<usize> = seeds.iter().copied().collect();
        let mut spill_work = 0usize;

        // Spills are evaluated in cell order, so a spill can read another
        // spill before that one is installed. `evaluated_at` and the change
        // log find readers that ran before a spill they read changed, and the
        // next pass evaluates them again. A reader that keeps coming back
        // reads its own output through other spills: that is a cycle.
        let mut sequence = 0usize;
        let mut evaluated_at: FxHashMap<AbsCellKey, usize> = FxHashMap::default();
        let mut requeued: FxHashMap<AbsCellKey, usize> = FxHashMap::default();
        // Requeues caused only by merged runtime reads cannot prove a cycle;
        // they are capped per reader instead.
        let mut approximately_requeued: FxHashMap<AbsCellKey, usize> = FxHashMap::default();
        let mut approximate_requeues = 0usize;
        let mut cyclic: FxHashSet<AbsCellKey> = FxHashSet::default();
        // Ranges that OFFSET and INDIRECT resolved to in each anchor's last
        // evaluation of this pass. The graph does not list them, so a spill
        // change inside one makes that anchor stale. Dropped with the pass.
        let mut runtime_readers: FxHashMap<AbsCellKey, RuntimeReads> = FxHashMap::default();

        loop {
            let mut pending: Vec<(AbsCellKey, Ast, bool)> = affected
                .keys(&self.formula_slots)
                .filter(|key| !processed_arrays.contains(key))
                .filter_map(|key| {
                    let entry = self
                        .sheets
                        .get(key.sheet as usize)?
                        .formulas
                        .get(key.local(), &self.formula_slots)?;

                    if !entry.produces_array() {
                        return None;
                    }

                    let ast = entry.ast.as_ref()?;
                    let mut pass = EvalPass {
                        affected: &affected,
                        results: &mut memo,
                    };
                    self.dynamic_array_bound(ast, key.sheet as usize, &mut pass)
                        .is_some()
                        .then(|| (key, ast.clone(), entry.has_spill_refs()))
                })
                .collect();

            if pending.is_empty() {
                break;
            }

            pending.sort_unstable_by_key(|(key, ..)| (key.sheet, key.row, key.col));

            let mut changed_sheets = FxHashSet::default();
            let mut spill_changes: Vec<SpillChange> = Vec::new();

            for (key, ast, has_spill_refs) in pending {
                let Some(id) = self.formula_id(key) else {
                    continue;
                };
                processed_arrays.insert(key);
                sequence += 1;
                evaluated_at.insert(key, sequence);

                let local = key.local();
                let output_sheet = key.sheet as usize;
                let data = &mut self.sheets[output_sheet];
                let vacated_range = data.spill.installed(local);
                let vacated = data.spill.clear_keeping_values(local, &mut data.cells);

                memo.unsettle(id);
                let mut pass = EvalPass {
                    affected: &affected,
                    results: &mut memo,
                };
                let _origin = FormulaOriginGuard::push(local);
                pass.results.visiting.insert(id);
                if self.iteration.is_some() {
                    iteration::enter_runtime_formula(key);
                }
                #[cfg(test)]
                FORMULA_EVALUATIONS.with(|count| count.set(count.get() + 1));
                let enclosing_reads = has_spill_refs.then(start_runtime_reads);
                let ast = if has_spill_refs {
                    self.resolve_spill_refs(&ast, output_sheet, &mut pass, 0)
                } else {
                    ast
                };

                let evaluated = match self.dynamic_array_bound(&ast, output_sheet, &mut pass) {
                    _ if cyclic.contains(&key) => Err(FormulaError::Cycle),
                    Some(Ok(bound)) => match dynamic_recompute_within_limit(spill_work, bound) {
                        Some(total) => {
                            spill_work = total;
                            let _origin = FormulaOriginGuard::push(local);
                            // A LET that resolves to one cell leaves no array
                            // expression; its scalar value is the result.
                            let evaluated =
                                match self.eval_dynamic_array(&ast, output_sheet, &mut pass, 0) {
                                    Some(result) => result,
                                    None if has_spill_refs => {
                                        match self.eval_ast(&ast, output_sheet, &mut pass, 0) {
                                            Value::Error(error) => Err(error),
                                            value => Ok(EvalMatrix::new(1, 1, vec![value])),
                                        }
                                    }
                                    None => Err(FormulaError::Value),
                                };

                            // A bound is an upper limit except for shapes known
                            // only after evaluation (OFFSET, INDIRECT); charge
                            // whatever the result holds beyond it. An overrun
                            // spends the whole budget, so later formulas of the
                            // pass fail before reading their ranges.
                            evaluated.and_then(|matrix| {
                                let excess = matrix.values.len().saturating_sub(bound);
                                if let Some(total) =
                                    dynamic_recompute_within_limit(spill_work, excess)
                                {
                                    spill_work = total
                                } else {
                                    spill_work = usize::MAX;
                                    return Err(FormulaError::Num);
                                }
                                Ok(matrix)
                            })
                        }
                        None => Err(FormulaError::Num),
                    },
                    Some(Err(error)) => Err(error),
                    // Resolving a missing spill removes its array marker.
                    // Keep the scalar expression's error instead of replacing it.
                    None => match self.eval_ast(&ast, output_sheet, &mut pass, 0) {
                        Value::Error(error) => Err(error),
                        // A runtime reference that resolved to one cell can
                        // leave a scalar expression; its value is the result.
                        value if has_spill_refs => Ok(EvalMatrix::new(1, 1, vec![value])),
                        _ => Err(FormulaError::Value),
                    },
                };
                pass.results.visiting.remove(id);
                if let Some(enclosing) = enclosing_reads {
                    let reads = finish_runtime_reads(enclosing);
                    if reads.ranges.is_empty() {
                        runtime_readers.remove(&key);
                    } else {
                        runtime_readers.insert(key, reads);
                    }
                }

                let mut changed = match evaluated {
                    // A reference that resolved to one cell is a plain value,
                    // as in Excel: it owns no spill cell and spends none of
                    // the spill-owner budget.
                    Ok(matrix) if has_spill_refs && matrix.values.len() == 1 => {
                        let data = &mut self.sheets[output_sheet];
                        if data.spill.attempt(local).is_some() {
                            data.spill.forget(local, &mut data.cells);
                        }
                        pass.results.pull(id, matrix.into_first());
                        Vec::new()
                    }
                    evaluated => self.install_spill_result(key, evaluated, pass.results),
                };
                if self.iteration.is_some() {
                    if let Some(value) = self.finish_runtime_formula(key, &mut pass) {
                        pass.results.pull(id, value);
                    }
                }
                // The anchor and any formula it pulled are written before the
                // next anchor runs, after its spill is installed.
                self.flush_pulled(&mut memo);

                // Formulas that use `A1#` read only the anchor cell. The anchor
                // counts as changed when its spill range or spilled cells
                // changed. A new anchor value alone needs no notice: a reader
                // evaluates the anchor formula on demand when it reads it.
                let installed_range = self.sheets[output_sheet].spill.installed(local);

                // Attempts blocked by the vacated range may spill now. A spill
                // that comes back over the same range blocks them exactly as
                // before, and a one-cell spill vacates only its anchor, which
                // keeps its formula; skipping the scan then keeps recalculating
                // many volatile spills (OFFSET, INDIRECT) linear.
                if let Some(vacated) = vacated_range
                    .filter(|range| installed_range != Some(*range) && !range.is_anchor_only())
                {
                    let colliding = self.sheets[output_sheet]
                        .spill
                        .anchors_colliding_with(local, vacated);

                    for anchor in colliding {
                        let dependent = AbsCellKey::from_local(output_sheet, anchor);
                        affected.select(&self.sheets, dependent);
                        processed_arrays.remove(&dependent);
                    }
                }

                // A spill that comes back over the same cells reports only the
                // cells whose value changed. Otherwise every vacated cell
                // changed too, before the new spill was installed.
                let reinstalled = installed_range == vacated_range
                    && vacated.len() == changed.len()
                    && vacated
                        .iter()
                        .zip(&changed)
                        .all(|((vacated_cell, _), cell)| vacated_cell == cell);
                if reinstalled {
                    let cells = &self.sheets[output_sheet].cells;
                    let mut previous = vacated.iter().map(|&(_, value)| value);
                    changed.retain(|&(row, col)| {
                        let current =
                            cells.calculated_cell_at(cells.idx(row as usize, col as usize));
                        previous.next().flatten() != current
                    });
                } else if !vacated.is_empty() {
                    let cleared: Vec<(u32, u32)> = vacated.iter().map(|&(cell, _)| cell).collect();
                    spill_changes.push(SpillChange {
                        sheet: output_sheet,
                        sequence,
                        output_cells: cleared.len(),
                        cells: cleared.clone(),
                    });
                    self.sheets[output_sheet].formulas.mark_cells_dirty(cleared);
                    changed_sheets.insert(output_sheet);
                    seeded_sheets.insert(output_sheet);
                }

                if installed_range != vacated_range || !changed.is_empty() {
                    let mut cells = changed.clone();
                    cells.push(local);
                    spill_changes.push(SpillChange {
                        sheet: output_sheet,
                        sequence,
                        cells,
                        output_cells: changed.len(),
                    });
                }

                if !changed.is_empty() {
                    self.sheets[output_sheet].formulas.mark_cells_dirty(changed);
                    changed_sheets.insert(output_sheet);
                    seeded_sheets.insert(output_sheet);
                }
            }

            let Some(index) = self.graph.index() else {
                self.flush_pulled(&mut memo);
                memo.finish(affected);
                self.formula_results = Some(memo);
                return;
            };

            for changed_sheet in changed_sheets {
                affected.extend(collect_affected_formulas(
                    &self.sheets,
                    &self.formula_slots,
                    &[changed_sheet],
                    index,
                    FormulaWork::default(),
                ));
            }

            let mut stale_readers = Vec::new();
            if !runtime_readers.is_empty() {
                let outputs = ChangedOutputs::new(&spill_changes);
                stale_readers.extend(stale_runtime_readers(&runtime_readers, &outputs));
            }
            for change in spill_changes {
                stale_readers.extend(
                    direct_readers(index, &self.formula_slots, change.sheet, &change.cells)
                        .into_iter()
                        .map(|reader| StaleReader {
                            reader,
                            changed_at: change.sequence,
                            approximate: false,
                        }),
                );
            }

            for stale in stale_readers {
                let reader = stale.reader;
                let is_stale = evaluated_at
                    .get(&reader)
                    .is_some_and(|&evaluated| evaluated < stale.changed_at);

                if !is_stale || cyclic.contains(&reader) || !processed_arrays.contains(&reader) {
                    continue;
                }

                if stale.approximate {
                    let count = approximately_requeued.entry(reader).or_insert(0);
                    if *count >= affected.len() {
                        continue;
                    }
                    *count += 1;
                    approximate_requeues += 1;
                } else {
                    let count = requeued.entry(reader).or_insert(0);
                    *count += 1;

                    // Without a cycle, a reader comes back at most once per
                    // spill in front of it, plus once per approximate
                    // requeue, whose new output it may read.
                    if *count > affected.len() + approximate_requeues {
                        cyclic.insert(reader);
                    }
                }

                processed_arrays.remove(&reader);
            }

            if self.iteration.is_some() {
                seed_additional_depth_errors(
                    &self.sheets,
                    &self.formula_slots,
                    &affected,
                    index,
                    &mut memo,
                );
            } else {
                seed_dependency_depth_errors(
                    &self.sheets,
                    &self.formula_slots,
                    &affected,
                    index,
                    &mut memo,
                );
            }
            self.flush_seeded(&mut memo);
        }

        let found_cycle = self.graph.index().is_some_and(|index| {
            if self.iteration.is_some() {
                seed_additional_depth_errors(
                    &self.sheets,
                    &self.formula_slots,
                    &affected,
                    index,
                    &mut memo,
                )
            } else {
                seed_dependency_depth_errors(
                    &self.sheets,
                    &self.formula_slots,
                    &affected,
                    index,
                    &mut memo,
                )
            }
        });

        self.evaluate_selected(&affected, &mut memo, found_cycle);

        self.finish_recompute(seeded_sheets.iter().copied(), Some(&affected));
        memo.finish(affected);
        self.formula_results = Some(memo);
    }

    fn install_spill_result(
        &mut self,
        key: AbsCellKey,
        result: Result<EvalMatrix, FormulaError>,
        results: &mut FormulaResults,
    ) -> Vec<(u32, u32)> {
        let sheet = key.sheet as usize;
        let local = key.local();
        let Some(id) = self.formula_id(key) else {
            return Vec::new();
        };
        let matrix = match result {
            Ok(matrix) => matrix,
            Err(error) => {
                let data = &mut self.sheets[sheet];
                data.spill.forget(local, &mut data.cells);
                results.pull(id, Value::Error(error));
                return Vec::new();
            }
        };
        let Some(range) = SpillRange::new(local, matrix.rows, matrix.cols) else {
            let data = &mut self.sheets[sheet];
            data.spill.forget(local, &mut data.cells);
            results.pull(id, Value::Error(FormulaError::Num));
            return Vec::new();
        };
        let data = &mut self.sheets[sheet];
        if let Err(error) = data.spill.admit(range, &mut data.cells, &data.formulas) {
            results.pull(id, Value::Error(error));
            return Vec::new();
        }

        let current_owner_cells = self.sheets.iter().try_fold(0usize, |total, data| {
            total.checked_add(data.spill.owner_count())
        });
        let within_budget = current_owner_cells
            .and_then(|total| total.checked_add(matrix.values.len()))
            .is_some_and(|owners| {
                owners <= self.spill_owner_cell_limit && spill_ownership_within_budget(owners)
            });
        let data = &mut self.sheets[sheet];
        if !within_budget {
            data.spill.compact(&mut data.cells);
            results.pull(id, Value::Error(FormulaError::Num));
            return Vec::new();
        }
        if !data.spill.reserve(range, &mut data.cells) {
            results.pull(id, Value::Error(FormulaError::Num));
            return Vec::new();
        }

        let first = matrix.values.first().cloned().unwrap_or(Value::Blank);
        results.pull(id, first);
        let strings = &mut self.strings;
        data.spill.install(range, &mut data.cells, |offset| {
            calculated_slot(strings, &matrix.values[offset])
        })
    }

    /// Whether no selected formula can read another one during the pass: no
    /// static formula-to-formula reads, no runtime references (`OFFSET` and
    /// `INDIRECT` are volatile) and no iteration. Each formula then reads
    /// only stored values, so its result can go to storage at once.
    fn independent_pass(&self) -> bool {
        self.iteration.is_none()
            && !self.formula_slots.has_volatile()
            && self
                .graph
                .index()
                .is_some_and(|index| !index.has_formula_dependencies())
    }

    /// Evaluates each selected formula once and writes its result to storage
    /// at once: no pass result table, active-call bits or second write loop.
    fn evaluate_independent_pass(&mut self, affected: &FormulaWork, memo: &mut FormulaResults) {
        for id in affected.ids() {
            let mut pass = EvalPass {
                affected,
                results: memo,
            };
            let result = self.eval_formula_body(id, &mut pass, 0);
            self.store_formula_result(id, result);
        }
    }

    /// Writes the pulled results to storage and marks them settled. Most
    /// formulas pull nothing, so the check stays inline and the loop does not.
    #[inline]
    pub(super) fn flush_pulled(&mut self, results: &mut FormulaResults) {
        if results.has_pulled() {
            self.write_pulled(results);
        }
    }

    #[inline(never)]
    fn write_pulled(&mut self, results: &mut FormulaResults) {
        while let Some((id, result)) = results.pop_pulled() {
            self.settle_result(id, result, results);
        }
    }

    /// Writes the errors the depth walk seeded. With iteration on, `#CYCLE!`
    /// results wait in the pulled list: the component pass replaces them and
    /// starts from the values the cells held before this pass.
    fn flush_seeded(&mut self, results: &mut FormulaResults) {
        if !results.seeded.is_empty() {
            self.write_seeded(results);
        }
    }

    #[inline(never)]
    fn write_seeded(&mut self, results: &mut FormulaResults) {
        let mut seeded = std::mem::take(&mut results.seeded);
        let iterating = self.iteration.is_some();
        for (id, error) in seeded.drain(..) {
            if iterating && error == FormulaError::Cycle {
                results.pull(id, Value::Error(error));
            } else {
                self.settle_result(id, Value::Error(error), results);
            }
        }
        results.seeded = seeded;
    }

    /// Evaluates every selected formula once, each after the formulas it
    /// reads, and writes its result before the next one runs.
    fn evaluate_selected(
        &mut self,
        affected: &FormulaWork,
        results: &mut FormulaResults,
        found_cycle: bool,
    ) {
        self.flush_seeded(results);
        match self.iteration.as_deref().copied() {
            Some(limits) if found_cycle => {
                self.settle_circular_references(affected, results, limits, true)
            }
            _ => self.flush_pulled(results),
        }
        if results.ordered {
            // The walk lists every selected formula it did not resolve to an
            // error, and those errors are already written.
            let order = std::mem::take(&mut results.order);
            for &id in &order {
                self.evaluate_one(id, affected, results);
            }
            results.order = order;
        } else {
            for id in affected.ids() {
                self.evaluate_one(id, affected, results);
            }
        }
    }

    /// Evaluates `id` unless this pass already has its result, then writes it
    /// and any formula it pulled.
    pub(super) fn evaluate_one(
        &mut self,
        id: FormulaId,
        affected: &FormulaWork,
        results: &mut FormulaResults,
    ) {
        // Between top-level formulas only iteration's seeded cycles wait in
        // the pulled list, so most checks need only the settled bit.
        if results.is_settled(id) || (results.has_pulled() && results.has(id)) {
            return;
        }
        let mut pass = EvalPass { affected, results };
        if self.iteration.is_some() {
            let _ = self.eval_formula_id(id, &mut pass, 0);
        } else {
            // Without iteration nothing on the evaluation path needs this
            // result before it is written, so it goes straight to the cell.
            pass.results.visiting.insert(id);
            let result = self.eval_formula_body(id, &mut pass, 0);
            pass.results.visiting.remove(id);
            self.settle_result(id, result, results);
        }
        self.flush_pulled(results);
    }

    /// Writes `id`'s result and marks it settled for this pass. One
    /// out-of-line copy serves every writer; the call is small next to the
    /// evaluation it follows.
    #[inline(never)]
    pub(super) fn settle_result(
        &mut self,
        id: FormulaId,
        result: EvalResult,
        results: &mut FormulaResults,
    ) {
        self.store_formula_result(id, result);
        results.settle(id);
    }

    fn store_formula_result(&mut self, id: FormulaId, result: EvalResult) {
        // A pass already owns the id; only liveness needs checking at write-back.
        if self.formula_slots.get(id).is_none() {
            return;
        }

        let Some(key) = self.formula_slots.location(id) else {
            return;
        };

        let interned = match &result {
            Value::Text(text) => Some(self.intern(text)),
            _ => None,
        };
        let sheet = key.sheet as usize;
        let Some(data) = self.sheets.get_mut(sheet) else {
            return;
        };

        let (row, col) = key.local();
        if !data.cells.contains_cell(row as usize, col as usize) {
            return;
        }

        let index = data.cells.idx(row as usize, col as usize);

        let (kind, payload) = match result {
            Value::Number(value) => (KIND_NUMBER, encode_num(value)),
            Value::Text(_) => (KIND_STRING, interned.map_or(0, encode_str_id)),
            Value::Bool(value) => (KIND_BOOL, encode_num(f64::from(value))),
            Value::Blank => (KIND_EMPTY, 0),
            Value::Error(error) => (KIND_FORMULA, error.slot() as u64),
        };

        assert!(
            data.cells.set_derived(index, kind, payload),
            "calculated overlay allocation failed"
        );
    }

    pub(crate) fn eval_at(
        &self,
        sheet: usize,
        row: usize,
        col: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }

        let Some(s) = self.sheets.get(sheet) else {
            return Value::Error(FormulaError::Ref);
        };
        if !s.cells.contains_cell(row, col) {
            return Value::Error(FormulaError::Ref);
        }

        if !s.cells.is_loaded(row, col) {
            return Value::Error(FormulaError::Loading);
        }

        let i = s.cells.idx(row, col);
        // Literal sources cannot be shadowed by calculated output. Decode their
        // payload directly instead of resolving the overlay a second time.
        let source_kind = s.cells.source_kind_at(i);
        let (kind, payload) = if source_kind == KIND_EMPTY {
            s.cells.calculated_cell_at(i).unwrap_or((KIND_EMPTY, 0))
        } else {
            (source_kind, s.cells.source_payload_at(i))
        };

        // Literal range scans avoid per-cell formula and calculated-error lookups.
        if kind != KIND_FORMULA {
            debug_assert!(cell_key(row, col).is_none_or(|key| { !s.formulas.contains(key) }));
            return literal_cell_value(&self.strings, kind, payload);
        }

        if let Some(key) = cell_key(row, col) {
            if let Some(id) = s.formulas.id(key) {
                // A settled formula's result is already in its cell, read as
                // a clean formula is; iteration still records the read.
                if pass.affected.contains(id) {
                    if !pass.results.is_settled(id) {
                        return self.eval_formula_id(id, pass, depth + 1);
                    }
                    if self.iteration.is_some() {
                        iteration::record_iteration_read(AbsCellKey::from_local(sheet, key));
                    }
                    // This pass wrote the whole result, errors included, to
                    // the calculated slot, so no source-error lookup is needed.
                    return match s.cells.calculated_cell_at(i) {
                        Some((KIND_FORMULA, payload)) => Value::Error(
                            FormulaError::from_slot(payload).unwrap_or(FormulaError::Ref),
                        ),
                        Some((kind, payload)) => literal_cell_value(&self.strings, kind, payload),
                        None => Value::number(s.cells.num_at(i)),
                    };
                }

                return cached_formula_value(
                    s,
                    &self.strings,
                    i,
                    formula_error_with_entry(s, key, self.formula_slots.get(id)),
                );
            }
            if let Some(error) = s.cells.calculated_error_at(i) {
                return Value::Error(error);
            }
        }

        // A `KIND_FORMULA` cell without a formula entry keeps its last number.
        Value::number(s.cells.num_at(i))
    }

    /// Evaluate a selected id without repeating its address-index lookup.
    pub(crate) fn eval_formula_id(
        &self,
        id: FormulaId,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }
        let Some(key) = self.formula_slots.location(id) else {
            return Value::Error(FormulaError::Ref);
        };
        if pass.results.is_settled(id) {
            let (row, col) = key.local();
            return self.eval_at(key.sheet as usize, row as usize, col as usize, pass, depth);
        }
        if let Some(result) = pass.results.pulled(id) {
            if self.iteration.is_some() {
                iteration::record_iteration_read(key);
            }
            return result.clone();
        }
        if !pass.results.visiting.insert(id) {
            return self.back_edge_value(key);
        }

        if self.iteration.is_some() {
            iteration::enter_runtime_formula(key);
        }
        let result = self.eval_formula_body(id, pass, depth);
        pass.results.visiting.remove(id);
        pass.results.pull(id, result.clone());
        if self.iteration.is_some() {
            self.finish_runtime_formula(key, pass).unwrap_or(result)
        } else {
            result
        }
    }

    /// Evaluates a formula without consulting or filling its pass result.
    fn eval_formula_body(
        &self,
        id: FormulaId,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        #[cfg(test)]
        FORMULA_EVALUATIONS.with(|count| count.set(count.get() + 1));
        let Some(key) = self.formula_slots.location(id) else {
            return Value::Error(FormulaError::Ref);
        };

        let sheet = key.sheet as usize;
        let local = key.local();
        match self.formula_slots.get(id) {
            Some(entry) => match &entry.ast {
                Some(ast) => {
                    let _origin = FormulaOriginGuard::push(local);
                    if entry.has_spill_refs() {
                        let resolved = self.resolve_spill_refs(ast, sheet, pass, depth + 1);
                        if range_from_ast(&resolved, sheet).is_some() {
                            self.eval_matrix_arg(&resolved, sheet, pass, depth + 1)
                                .map(EvalMatrix::into_first)
                                .unwrap_or_else(Value::Error)
                        } else {
                            self.eval_ast(&resolved, sheet, pass, depth + 1)
                        }
                    } else {
                        self.eval_ast(ast, sheet, pass, depth + 1)
                    }
                }
                None => Value::Error(entry.source_error().unwrap_or(FormulaError::Value)),
            },
            None => Value::Number(0.0),
        }
    }

    /// Evaluate a parsed conditional-format expression at one target cell.
    /// Referenced formula cells use their recomputed cache; the origin guard
    /// gives zero-argument ROW/COLUMN the target cell's coordinates.
    pub(crate) fn eval_conditional_ast(
        &self,
        ast: &Ast,
        sheet: usize,
        row: u32,
        col: u32,
        results: &mut FormulaResults,
    ) -> EvalResult {
        let affected = FormulaWork::default();
        let mut pass = EvalPass {
            affected: &affected,
            results,
        };
        let _origin = FormulaOriginGuard::push((row, col));
        self.eval_ast(ast, sheet, &mut pass, 0)
    }

    pub(crate) fn eval_ast(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }

        match ast {
            #[cfg(feature = "analysis")]
            Ast::Parameter { depth, index, .. } => {
                analysis::lambda::parameter_value(pass.results.call_frame(), *depth, *index)
            }
            #[cfg(feature = "analysis")]
            Ast::RegexPattern(pattern) => Value::text(pattern.text()),
            #[cfg(feature = "analysis")]
            Ast::UnknownFunc(name, args) if name == analysis::lambda::CALL => {
                analysis::lambda::evaluate(
                    self,
                    analysis::lambda::CALL,
                    args,
                    sheet,
                    pass,
                    depth + 1,
                )
            }
            Ast::Num(n) => Value::number(*n),
            Ast::Str(text) => Value::text(text.as_str()),
            Ast::Bool(value) => Value::Bool(*value),
            Ast::Missing => Value::Blank,
            Ast::Array { values, .. } => values.first().cloned().unwrap_or(Value::Blank),
            Ast::Cell(row, col, _) => {
                self.eval_at(sheet, *row as usize, *col as usize, pass, depth + 1)
            }
            Ast::AbsCell(sheet_ref, row, col, _) => self.eval_at(
                sheet_ref.handle as usize,
                *row as usize,
                *col as usize,
                pass,
                depth + 1,
            ),
            // A sheet reference that ingest did not resolve names another
            // workbook, which has no values here.
            Ast::SheetCell(..) | Ast::SheetRange(..) | Ast::InvalidRef => {
                Value::Error(FormulaError::Ref)
            }
            Ast::LetSlot { slot, expression } => {
                let known = pass
                    .results
                    .let_frame()
                    .and_then(|frame| frame.expanded_value(*slot));
                if let Some(value) = known {
                    value
                } else {
                    let value = self.eval_ast(expression, sheet, pass, depth);
                    if let Some(frame) = pass.results.existing_let_frame_mut() {
                        frame.remember_expanded(*slot, value.clone());
                    }
                    value
                }
            }
            Ast::LetName { slot, .. } => self.eval_let_name_family(*slot, sheet, pass, depth),
            Ast::NamedFormula(named) => self.eval_named_formula_family(named, sheet, pass, depth),
            #[cfg(feature = "host-functions")]
            Ast::UnknownFunc(name, arguments) => {
                self.eval_custom_function(name, arguments, sheet, pass, depth + 1)
            }
            // With host functions the arm above takes every unknown call; the
            // default engine keeps this arm as it was, so its binary does not
            // change.
            #[cfg_attr(feature = "host-functions", allow(unreachable_patterns))]
            Ast::Name(_) | Ast::UnresolvedStructured(_) | Ast::UnknownFunc(..) => {
                Value::Error(FormulaError::Name)
            }
            Ast::NamedRange(named)
                if named.row_start == named.row_end && named.col_start == named.col_end =>
            {
                self.eval_at(
                    named.sheet as usize,
                    named.row_start as usize,
                    named.col_start as usize,
                    pass,
                    depth + 1,
                )
            }
            Ast::Structured(reference) if reference.row_start == reference.row_end => self.eval_at(
                reference.sheet as usize,
                reference.row_start as usize,
                reference.col as usize,
                pass,
                depth + 1,
            ),
            Ast::Structured(_)
            | Ast::NamedRange(_)
            | Ast::Range(..)
            | Ast::AbsRange(..)
            | Ast::SheetSpan(_) => Value::Error(FormulaError::Value),
            Ast::Neg(expr) | Ast::Pos(expr) | Ast::Percent(expr) => {
                let op = match ast {
                    Ast::Neg(_) => operators::UnaryOp::Neg,
                    Ast::Pos(_) => operators::UnaryOp::Pos,
                    _ => operators::UnaryOp::Percent,
                };
                operators::unary(op, &self.eval_ast(expr, sheet, pass, depth + 1))
            }
            Ast::Bin(op, left, right) => {
                let left = self.eval_ast(left, sheet, pass, depth + 1);
                operators::binary(*op, &left, || self.eval_ast(right, sheet, pass, depth + 1))
            }
            Ast::Cmp(op, left, right) => {
                let left = self.eval_ast(left, sheet, pass, depth + 1);
                let right = self.eval_ast(right, sheet, pass, depth + 1);
                operators::comparison(*op, &left, &right)
            }
            Ast::Func(
                Func::Filter
                | Func::Sort
                | Func::Unique
                | Func::Transpose
                | Func::Sequence
                | Func::Take
                | Func::Drop
                | Func::ChooseCols
                | Func::ChooseRows
                | Func::TrimRange,
                _,
            ) => {
                match self
                    .eval_dynamic_array(ast, sheet, pass, depth + 1)
                    .unwrap_or(Err(FormulaError::Value))
                {
                    Ok(matrix) => matrix.into_first(),
                    Err(error) => Value::Error(error),
                }
            }
            Ast::Func(func, args) => self.eval_func(*func, args, sheet, pass, depth + 1),
        }
    }

    /// Evaluates a LET whose names were resolved to slots when the formula
    /// was entered: binds each slot to its expression in the original tree,
    /// then evaluates the result expression. A binding is evaluated on its
    /// first use, as the expansion does.
    #[inline(never)]
    fn eval_let_family(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        let Some((result, bindings)) = args.split_last() else {
            return Value::Error(FormulaError::Value);
        };
        let first_slot = match bindings.first() {
            Some(Ast::LetName { slot, .. }) => *slot,
            _ => return Value::Error(FormulaError::Value),
        };
        let frame = pass.results.let_frame_mut();
        let opened = frame.open_resolved(first_slot);
        for pair in bindings.chunks(2) {
            if let [Ast::LetName { slot, .. }, expression] = pair {
                frame.bind(*slot, expression);
            }
        }
        let value = self.eval_ast(result, sheet, pass, depth + 1);
        pass.results.let_frame_mut().close_resolved(opened);
        value
    }

    /// The value of a resolved LET name: its slot's value, or its binding's
    /// value on first use, kept in the slot.
    #[inline(never)]
    fn eval_let_name_family(
        &self,
        slot: u32,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        let Some(frame) = pass.results.let_frame() else {
            return Value::Error(FormulaError::Name);
        };
        if let Some(value) = frame.resolved_value(slot) {
            return value;
        }
        // SAFETY: a resolved name occurs only inside its LET, which binds the
        // slot before evaluating anything in it and is still being evaluated.
        #[allow(unsafe_code, reason = "calls `LetFrame::binding`; see its reason")]
        let Some(expression) = (unsafe { frame.binding(slot) }) else {
            return Value::Error(FormulaError::Name);
        };
        let value = self.eval_ast(expression, sheet, pass, depth);
        if let Some(frame) = pass.results.existing_let_frame_mut() {
            frame.remember_resolved(slot, value.clone());
        }
        value
    }

    /// The value of a defined name's formula. Out of line, so the name adds
    /// one call to `eval_ast`, which must stay under the size above which
    /// JavaScriptCore does not optimize a function; the `_family` suffix
    /// keeps wasm-opt from inlining it back.
    #[inline(never)]
    fn eval_named_formula_family(
        &self,
        named: &crate::calc::NamedFormulaRef,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        self.eval_ast(&named.expression, sheet, pass, depth + 1)
    }

    /// Routes a function call. Only the hottest calls run here: `LET`, `IF`,
    /// `IFERROR`, `IFNA`, `SUM` over one range, streamed reductions and the
    /// argument collection of scalar functions, plus the text and date
    /// families in `apply_func` (out of line, they slowed the paired gate's
    /// unicode-text-date-edit row 1.64×). Every other family runs in an
    /// out-of-line `*_family` handler.
    ///
    /// `eval_func` and its one-caller callees are inlined into `eval_ast`.
    /// JavaScriptCore never compiles a WebAssembly function of 100,000 bytes or
    /// more with its optimizing tier, and `eval_ast` reached that size when
    /// every family was inlined into it. `#[inline(never)]` keeps the handlers
    /// out of line in LLVM. wasm-opt inlines one-caller functions again
    /// afterwards, so `packages/wasm/Cargo.toml` passes it `--no-inline=*_family`.
    fn eval_func(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }

        #[cfg(feature = "analysis")]
        if let Func::Analysis(id) = func {
            let name = analysis::name(id);
            if let Some(family) = analysis::family(name) {
                if let Some(hooks) = &family.array {
                    if (hooks.produces_array)(name, args, pass.shapes()) {
                        return match (hooks.evaluate)(self, name, args, sheet, pass, depth)
                            .and_then(|matrix| {
                                matrix.validate_bytes()?;
                                Ok(matrix)
                            }) {
                            Ok(matrix) => matrix.into_first(),
                            Err(error) => Value::Error(error),
                        };
                    }
                }
                if let Some(evaluate) = family.evaluate_ast {
                    return evaluate(self, name, args, sheet, pass, depth);
                }
            }
        }

        if func == Func::Let {
            if matches!(args.first(), Some(Ast::LetName { .. })) {
                return self.eval_let_family(args, sheet, pass, depth);
            }
            return match expand_let_ast(args) {
                Ok((expanded, slots)) => {
                    let enclosing = pass.results.let_frame_mut().open_expanded(slots);
                    let expanded = self.resolve_let_runtime_refs(
                        args,
                        expanded,
                        sheet,
                        pass,
                        depth + 1,
                        RewriteScope::Nested,
                    );
                    let value = self.eval_ast(&expanded, sheet, pass, depth + 1);
                    pass.results.let_frame_mut().close_expanded(enclosing);
                    value
                }
                Err(error) => Value::Error(error),
            };
        }

        match func {
            Func::Offset
            | Func::Indirect
            | Func::Intersect
            | Func::Union
            | Func::Areas
            | Func::Choose
            | Func::Row
            | Func::Column
            | Func::Rows
            | Func::Columns
            | Func::Address => return self.eval_reference_family(func, args, sheet, pass, depth),
            _ => {}
        }

        if func == Func::If {
            if !(2..=3).contains(&args.len()) {
                return Value::Error(FormulaError::Value);
            }
            let condition = &args[0];
            let condition = self.eval_ast(condition, sheet, pass, depth + 1);
            let use_true_branch = match bool_from_value(&condition) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let branch = if use_true_branch {
                args.get(1)
            } else {
                args.get(2)
            };
            return if let Some(branch) = branch {
                self.eval_ast(branch, sheet, pass, depth + 1)
            } else {
                Value::Number(0.0)
            };
        }

        if func == Func::IfError {
            if !(1..=2).contains(&args.len()) {
                return Value::Error(FormulaError::Value);
            }
            let primary = &args[0];
            let value = self.eval_ast(primary, sheet, pass, depth + 1);
            return if matches!(value, Value::Error(_)) {
                if let Some(fallback) = args.get(1) {
                    self.eval_ast(fallback, sheet, pass, depth + 1)
                } else {
                    Value::Number(0.0)
                }
            } else {
                value
            };
        }

        if func == Func::IfNa {
            if args.len() != 2 {
                return Value::Error(FormulaError::Value);
            }
            let value = self.eval_ast(&args[0], sheet, pass, depth + 1);
            return if value == Value::Error(FormulaError::Na) {
                self.eval_ast(&args[1], sheet, pass, depth + 1)
            } else {
                value
            };
        }

        match func {
            Func::Ifs | Func::Switch => {
                return self.eval_conditional_family(func, args, sheet, pass, depth)
            }
            Func::IsBlank
            | Func::IsNumber
            | Func::IsText
            | Func::IsLogical
            | Func::IsError
            | Func::IsErr
            | Func::IsNa
            | Func::Type
            | Func::N
            | Func::T
            | Func::FormulaText
            | Func::IsFormula
            | Func::Hyperlink
            | Func::Cell
            | Func::ErrorType
            | Func::Info
            | Func::IsNonText
            | Func::IsRef
            | Func::Sheet
            | Func::Sheets => return self.eval_information_family(func, args, sheet, pass, depth),
            Func::Today | Func::Now | Func::Rand | Func::RandBetween => {
                return self.eval_volatile_family(func, args, sheet, pass, depth)
            }
            Func::CountIf
            | Func::CountIfs
            | Func::SumIf
            | Func::SumIfs
            | Func::AverageIfs
            | Func::AverageIf
            | Func::MaxIfs
            | Func::MinIfs => return self.eval_criteria_family(func, args, sheet, pass, depth + 1),
            Func::Lookup => return self.eval_vector_lookup(args, sheet, pass, depth + 1),
            Func::Index
            | Func::Match
            | Func::VLookup
            | Func::HLookup
            | Func::XLookup
            | Func::XMatch => return self.eval_lookup_family(func, args, sheet, pass, depth + 1),
            _ => {}
        }

        if func == Func::SumProduct {
            if let Some(result) = self.literal_sum_product_family(args, sheet, depth + 1) {
                return result;
            }
        }

        if matches!(
            func,
            Func::PercentileInc | Func::Correl | Func::CovarianceS | Func::CovarianceP
        ) {
            if let Some(result) = self.literal_statistics_family(func, args, sheet, depth + 1) {
                return result;
            }
        }

        if func == Func::Sum {
            if let Some(result) = self.eval_sum_family(args, sheet, pass, depth + 1) {
                return result;
            }
        }

        if let Some(result) = self.streamed_reduction(func, args, sheet, pass, depth + 1) {
            return result;
        }

        #[cfg(feature = "analysis")]
        if let Func::Analysis(id) = func {
            let name = analysis::name(id);
            let result = match name {
                "SUMSQ" => analysis::math::streamed_sum_squares(self, args, sheet, pass, depth + 1),
                "SUMX2MY2" | "SUMX2PY2" | "SUMXMY2" => analysis::math::streamed_paired_squares(
                    self,
                    name,
                    args,
                    sheet,
                    pass,
                    depth + 1,
                ),
                _ => None,
            };
            if let Some(result) = result {
                return result;
            }
        }

        let mut values = FuncAccumulator::default();
        for (index, arg) in args.iter().enumerate() {
            let range = match arg {
                Ast::Range(row_start, col_start, row_end, col_end, _) => Some(CellRange::new(
                    sheet as u32,
                    *row_start,
                    *col_start,
                    *row_end,
                    *col_end,
                )),
                Ast::AbsRange(sheet_ref, row_start, col_start, row_end, col_end, _) => Some(
                    CellRange::new(sheet_ref.handle, *row_start, *col_start, *row_end, *col_end),
                ),
                Ast::NamedRange(named) => Some(CellRange::new(
                    named.sheet,
                    named.row_start,
                    named.col_start,
                    named.row_end,
                    named.col_end,
                )),
                Ast::Structured(reference) => Some(CellRange::new(
                    reference.sheet,
                    reference.row_start,
                    reference.col,
                    reference.row_end,
                    reference.col,
                )),
                Ast::Func(Func::Intersect, operands) => intersection_range(operands, sheet).ok(),
                // SUBTOTAL reads a cell argument as a one-cell reference, so
                // the cell's row can be hidden.
                Ast::Cell(row, col, _) if func == Func::Subtotal && index > 0 => {
                    Some(CellRange::new(sheet as u32, *row, *col, *row, *col))
                }
                Ast::AbsCell(sheet_ref, row, col, _) if func == Func::Subtotal && index > 0 => {
                    Some(CellRange::new(sheet_ref.handle, *row, *col, *row, *col))
                }
                _ => None,
            };
            let shape = if let Some(range) = range {
                let skipped = (func == Func::Subtotal && index > 0).then(|| SkippedCells {
                    rows: Some(
                        math::subtotal_function(&values)
                            .map_or(SkippedRows::Filtered, |(_, rows)| rows),
                    ),
                    nested_subtotals: true,
                });
                match self.push_range_values(range, skipped, pass, depth + 1, &mut values) {
                    Ok(shape) => shape,
                    Err(error) => return Value::Error(error),
                }
            } else if matches!(arg, Ast::Func(Func::Union, _) | Ast::SheetSpan(_)) {
                match self.eval_area_values(func, arg, sheet, pass, depth + 1, &mut values) {
                    Ok(shape) => shape,
                    Err(error) => return Value::Error(error),
                }
            } else if ast_produces_array(arg, pass.shapes()) {
                match self.eval_dynamic_array(arg, sheet, pass, depth + 1) {
                    Some(Ok(matrix)) => {
                        if let Err(error) = matrix.validate_copies(2) {
                            return Value::Error(error);
                        }
                        let shape = (matrix.rows, matrix.cols);
                        for value in &matrix.values {
                            if let Value::Error(error) = value {
                                return Value::Error(*error);
                            }
                            if let Err(error) = values.push_range(value.clone()) {
                                return Value::Error(error);
                            }
                        }
                        shape
                    }
                    Some(Err(error)) => return Value::Error(error),
                    None => {
                        let value = self.eval_ast(arg, sheet, pass, depth + 1);
                        if let Value::Error(error) = value {
                            return Value::Error(error);
                        }
                        let pushed = if treats_cell_as_reference(func)
                            && matches!(arg, Ast::Cell(..) | Ast::AbsCell(..))
                        {
                            values.push_range(value)
                        } else {
                            values.push_scalar(value)
                        };
                        if let Err(error) = pushed {
                            return Value::Error(error);
                        }
                        (1, 1)
                    }
                }
            } else {
                let value = self.eval_ast(arg, sheet, pass, depth + 1);
                if let Value::Error(error) = value {
                    return Value::Error(error);
                }
                let pushed = if treats_cell_as_reference(func)
                    && matches!(arg, Ast::Cell(..) | Ast::AbsCell(..))
                {
                    values.push_range(value)
                } else {
                    values.push_scalar(value)
                };
                if let Err(error) = pushed {
                    return Value::Error(error);
                }
                (1, 1)
            };
            if let Err(error) =
                values.finish_arg_with_missing(shape.0, shape.1, matches!(arg, Ast::Missing))
            {
                return Value::Error(error);
            }
        }

        apply_func(func, &values)
    }

    /// `OFFSET`, `INDIRECT`, reference operators, `CHOOSE`, `ROW(S)`,
    /// `COLUMN(S)` and `ADDRESS`. See `eval_func` for why families live in
    /// out-of-line `*_family` handlers.
    #[inline(never)]
    fn eval_reference_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if matches!(func, Func::Offset | Func::Indirect) {
            return self.eval_runtime_reference(func, args, sheet, pass, depth);
        }

        match func {
            Func::Intersect => return self.eval_intersection(args, sheet, pass, depth),
            // A union has several areas, and a value position takes one.
            Func::Union => return Value::Error(FormulaError::Value),
            Func::Areas => return self.eval_areas(args, sheet, pass, depth),
            _ => {}
        }

        if func == Func::Choose {
            if args.len() < 2 {
                return Value::Error(FormulaError::Value);
            }
            let index = self.eval_ast(&args[0], sheet, pass, depth + 1);
            let index = match positive_index(&index) {
                Ok(index) if index + 1 < args.len() => index + 1,
                Ok(_) => return Value::Error(FormulaError::Value),
                Err(error) => return Value::Error(error),
            };
            let selected = &args[index];
            if range_from_ast(selected, sheet).is_some() {
                return match self.eval_matrix_arg(selected, sheet, pass, depth + 1) {
                    Ok(matrix) => matrix.into_first(),
                    Err(error) => Value::Error(error),
                };
            }
            if let Some(result) = self.eval_dynamic_array(selected, sheet, pass, depth + 1) {
                return result.map_or_else(Value::Error, EvalMatrix::into_first);
            }
            return self.eval_ast(selected, sheet, pass, depth + 1);
        }

        if matches!(func, Func::Row | Func::Column) {
            if args.len() > 1 {
                return Value::Error(FormulaError::Value);
            }
            let coordinate = if let Some(reference) = args.first() {
                let range = match (range_from_ast(reference, sheet), reference) {
                    (Some(range), _) => range,
                    (None, Ast::Func(func @ (Func::Offset | Func::Indirect), args)) => {
                        match self.runtime_range(*func, args, sheet, pass, depth + 1) {
                            Ok(range) => range,
                            Err(error) => return Value::Error(error),
                        }
                    }
                    (None, Ast::InvalidRef) => return Value::Error(FormulaError::Ref),
                    (None, _) => return Value::Error(FormulaError::Value),
                };
                if func == Func::Row {
                    range.row_start
                } else {
                    range.col_start
                }
            } else {
                let Some((row, col)) = current_formula_origin() else {
                    return Value::Error(FormulaError::Value);
                };
                if func == Func::Row {
                    row
                } else {
                    col
                }
            };
            return Value::number(coordinate as f64 + 1.0);
        }

        if matches!(func, Func::Rows | Func::Columns) {
            if args.len() != 1 {
                return Value::Error(FormulaError::Value);
            }
            // A written reference has its shape without its cells, which
            // keeps `ROWS(A:A)` at 1048576 instead of the used rows.
            if let Some(range) = range_from_ast(&args[0], sheet) {
                if self.sheets.get(range.sheet as usize).is_none() {
                    return Value::Error(FormulaError::Ref);
                }
                let (start, end) = if func == Func::Rows {
                    (range.row_start, range.row_end)
                } else {
                    (range.col_start, range.col_end)
                };
                return Value::number(f64::from(end - start) + 1.0);
            }
            let matrix = match self.eval_matrix_arg(&args[0], sheet, pass, depth + 1) {
                Ok(matrix) => matrix,
                Err(error) => return Value::Error(error),
            };
            return Value::number(if func == Func::Rows {
                matrix.rows as f64
            } else {
                matrix.cols as f64
            });
        }

        if func == Func::Address {
            if !(2..=5).contains(&args.len()) {
                return Value::Error(FormulaError::Value);
            }
            let scalar =
                |ast: &Ast, pass: &mut EvalPass<'_>| self.eval_ast(ast, sheet, pass, depth + 1);
            let row = match positive_index(&scalar(&args[0], pass)) {
                Ok(row) => row,
                Err(error) => return Value::Error(error),
            };
            let col = match positive_index(&scalar(&args[1], pass)) {
                Ok(col) => col,
                Err(error) => return Value::Error(error),
            };
            let abs = match optional_ast(args, 2) {
                Some(ast) => match option_code(&scalar(ast, pass)) {
                    Ok(value @ 1..=4) => value,
                    Ok(_) => return Value::Error(FormulaError::Value),
                    Err(error) => return Value::Error(error),
                },
                None => 1,
            };
            let a1 = match optional_ast(args, 3) {
                Some(ast) => match bool_from_value(&scalar(ast, pass)) {
                    Ok(value) => value,
                    Err(error) => return Value::Error(error),
                },
                None => true,
            };
            let sheet_name = match optional_ast(args, 4) {
                Some(ast) => match text_from_value(&scalar(ast, pass)) {
                    Ok(value) => Some(value),
                    Err(error) => return Value::Error(error),
                },
                None => None,
            };
            return match address_text(row, col, abs, a1, sheet_name.as_deref()) {
                Ok(text) => Value::text(text),
                Err(error) => Value::Error(error),
            };
        }
        Value::Error(FormulaError::Value)
    }

    /// `IFS` and `SWITCH`; `IF`, `IFERROR` and `IFNA` stay in `eval_func`.
    #[inline(never)]
    fn eval_conditional_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if func == Func::Ifs {
            if args.len() < 2 || !args.len().is_multiple_of(2) {
                return Value::Error(FormulaError::Value);
            }
            for pair in args.as_chunks::<2>().0 {
                let condition = self.eval_ast(&pair[0], sheet, pass, depth + 1);
                match bool_from_value(&condition) {
                    Ok(true) => {
                        return self.eval_ast(&pair[1], sheet, pass, depth + 1);
                    }
                    Ok(false) => {}
                    Err(error) => return Value::Error(error),
                }
            }
            return Value::Error(FormulaError::Na);
        }

        if func == Func::Switch {
            if args.len() < 3 {
                return Value::Error(FormulaError::Value);
            }
            let expression = self.eval_ast(&args[0], sheet, pass, depth + 1);
            if let Value::Error(error) = expression {
                return Value::Error(error);
            }
            let pairs_end = if args.len().is_multiple_of(2) {
                args.len() - 1
            } else {
                args.len()
            };
            for pair in args[1..pairs_end].as_chunks::<2>().0 {
                let case = self.eval_ast(&pair[0], sheet, pass, depth + 1);
                match compare_values(&expression, &case) {
                    Ok(Ordering::Equal) => {
                        return self.eval_ast(&pair[1], sheet, pass, depth + 1);
                    }
                    Ok(_) => {}
                    Err(error) => return Value::Error(error),
                }
            }
            return if pairs_end < args.len() {
                self.eval_ast(&args[pairs_end], sheet, pass, depth + 1)
            } else {
                Value::Error(FormulaError::Na)
            };
        }
        Value::Error(FormulaError::Value)
    }

    /// The `IS*` tests, `TYPE`, `N`, `T`, and the cell information functions.
    #[inline(never)]
    fn eval_information_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if matches!(
            func,
            Func::IsBlank
                | Func::IsNumber
                | Func::IsText
                | Func::IsLogical
                | Func::IsError
                | Func::IsErr
                | Func::IsNa
                | Func::Type
                | Func::N
                | Func::T
        ) {
            if args.len() != 1 {
                return Value::Error(FormulaError::Value);
            }
            let value = self.eval_ast(&args[0], sheet, pass, depth + 1);
            return match func {
                Func::IsBlank => Value::Bool(matches!(value, Value::Blank)),
                Func::IsNumber => Value::Bool(matches!(value, Value::Number(_))),
                Func::IsText => Value::Bool(matches!(value, Value::Text(_))),
                Func::IsLogical => Value::Bool(matches!(value, Value::Bool(_))),
                Func::IsError => Value::Bool(matches!(value, Value::Error(_))),
                Func::IsErr => Value::Bool(matches!(
                    value,
                    Value::Error(error) if error != FormulaError::Na
                )),
                Func::IsNa => Value::Bool(value == Value::Error(FormulaError::Na)),
                Func::Type => Value::number(match value {
                    Value::Number(_) | Value::Blank => 1.0,
                    Value::Text(_) => 2.0,
                    Value::Bool(_) => 4.0,
                    Value::Error(_) => 16.0,
                }),
                Func::N => match value {
                    Value::Number(value) => Value::number(value),
                    Value::Bool(value) => Value::number(if value { 1.0 } else { 0.0 }),
                    Value::Error(error) => Value::Error(error),
                    Value::Text(_) | Value::Blank => Value::Number(0.0),
                },
                Func::T => match value {
                    Value::Text(value) => Value::Text(value),
                    Value::Error(error) => Value::Error(error),
                    Value::Number(_) | Value::Bool(_) | Value::Blank => Value::text(""),
                },
                _ => unreachable!(),
            };
        }
        self.eval_info_func(func, args, sheet, pass, depth + 1)
    }

    /// `TODAY`, `NOW`, `RAND` and `RANDBETWEEN`.
    #[cold]
    #[inline(never)]
    fn eval_volatile_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if matches!(func, Func::Today | Func::Now) {
            if !args.is_empty() {
                return Value::Error(FormulaError::Value);
            }
            return Value::number(if func == Func::Today {
                self.volatile_serial.floor()
            } else {
                self.volatile_serial
            });
        }

        if matches!(func, Func::Rand | Func::RandBetween) {
            return self.eval_random_func(func == Func::RandBetween, args, sheet, pass, depth + 1);
        }
        Value::Error(FormulaError::Value)
    }

    fn eval_matrix_arg(
        &self,
        ast: &Ast,
        formula_sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        let Some(range) = range_from_ast(ast, formula_sheet) else {
            let Some(result) = self.eval_dynamic_array(ast, formula_sheet, pass, depth + 1) else {
                return Err(FormulaError::Value);
            };
            let matrix = result?;
            matrix.validate_copies(2)?;
            return Ok(matrix);
        };
        self.eval_range_matrix(range, pass, depth)
    }

    /// The values of a written range, up to the sheet's used extent.
    fn eval_range_matrix(
        &self,
        range: CellRange,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        let sheet = range.sheet as usize;
        let Some(data) = self.sheets.get(sheet) else {
            return Err(FormulaError::Ref);
        };
        if data.cells.row_count() == 0
            || data.cells.n_cols() == 0
            || range.row_start as usize >= data.cells.row_count()
            || range.col_start as usize >= data.cells.n_cols()
        {
            return Err(FormulaError::Ref);
        }
        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(data.cells.row_count() - 1);
        let col_end = (range.col_end as usize).min(data.cells.n_cols() - 1);
        let rows = row_end - row_start + 1;
        let cols = col_end - col_start + 1;
        let total = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
        let mut payload_bytes = total
            .checked_mul(std::mem::size_of::<Value>())
            .ok_or(FormulaError::Num)?;
        for row in row_start..=row_end {
            for col in col_start..=col_end {
                let index = data.cells.idx(row, col);
                if matches!(data.cells.kind_at(index), KIND_STRING | KIND_FORMULA) {
                    if let Some(text) =
                        string_from_pool_ref(&self.strings, data.cells.str_id_at(index))
                    {
                        payload_bytes = payload_bytes
                            .checked_add(text.len())
                            .ok_or(FormulaError::Num)?;
                        if payload_bytes > SPILL_MAX_BYTES {
                            return Err(FormulaError::Num);
                        }
                    }
                }
            }
        }
        let mut values = Vec::with_capacity(total);
        let literals = LiteralSources::new(data, depth);
        for row in row_start..=row_end {
            for col in col_start..=col_end {
                if !data.cells.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }
                let index = data.cells.idx(row, col);
                let value = literals
                    .and_then(|sources| sources.value_at(&self.strings, index))
                    .unwrap_or_else(|| self.eval_at(sheet, row, col, pass, depth + 1));
                values.push(value);
            }
        }
        Ok(EvalMatrix::new(rows, cols, values))
    }

    fn eval_criterion(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Criterion, FormulaError> {
        let value = self.eval_ast(ast, sheet, pass, depth + 1);
        if let Value::Error(error) = value {
            return Err(error);
        }
        Criterion::parse(value)
    }

    /// Folds the reduction functions straight from their ranges instead of
    /// materializing every cell first. `None` keeps the accumulator path,
    /// which also handles computed arguments, missing arguments and the
    /// functions that need their whole input.
    fn streamed_reduction(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        let mut fold = ReductionFold::new(func)?;
        let mut ranges = Vec::with_capacity(args.len());
        for arg in args {
            ranges.push(range_from_ast(arg, sheet)?);
        }
        for range in ranges {
            if let Err(error) = self.fold_range(range, &mut fold, false, pass, depth) {
                return Some(Value::Error(error));
            }
        }
        Some(fold.finish())
    }

    /// Walks the criteria functions over their ranges instead of
    /// materializing them. `None` keeps the materialized path, which also
    /// handles computed arguments, missing arguments and dynamic arrays.
    fn streamed_criteria(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        match func {
            Func::CountIf => self.streamed_count_if(args, sheet, pass, depth),
            Func::CountIfs => self.streamed_count_ifs(args, sheet, pass, depth),
            Func::SumIf | Func::AverageIf => self.streamed_sum_if(func, args, sheet, pass, depth),
            Func::SumIfs | Func::AverageIfs | Func::MaxIfs | Func::MinIfs => {
                self.streamed_sum_ifs_or_extreme(func, args, sheet, pass, depth)
            }
            _ => None,
        }
    }

    fn streamed_count_if(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if args.len() != 2 {
            return None;
        }
        let range = range_from_ast(&args[0], sheet)?;
        let reader_depth = depth + 1;
        let mut reader = match RangeReader::new(self, range, reader_depth) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        let criterion = match self.eval_criterion(&args[1], sheet, pass, depth + 1) {
            Ok(criterion) => criterion,
            Err(error) => return Some(Value::Error(error)),
        };
        if let Some(count) = self.dense_number_count_if_family(range, &criterion, reader_depth) {
            return Some(Value::number(count as f64));
        }
        if let Some(cells) = reader.literal_columns() {
            return Some(self.literal_criteria_family(
                CriteriaFold::Count,
                None,
                &[(cells, &criterion)],
            ));
        }
        let mut matches = 0.0;
        loop {
            match reader.next_allow_errors(pass) {
                Ok(Some(value)) => {
                    if criterion.matches(&value) {
                        matches += 1.0;
                    }
                }
                Ok(None) => break,
                Err(error) => return Some(Value::Error(error)),
            }
        }
        Some(Value::number(matches))
    }

    /// COUNTIF with a numeric criterion over dense columns that hold only
    /// number literals: it compares the stored payloads directly instead of
    /// reading each cell as a `Value`. `None` sends the caller to the cell
    /// reader, for paged storage, any other cell kind or any other criterion.
    /// Call it only after `RangeReader::new` accepted `range`: it clamps the
    /// range to the used extent the same way.
    ///
    /// Out of line, and named `*_family`, so neither LLVM nor wasm-opt puts
    /// its loops into `eval_ast`. The scan is scalar: enabling `simd128` for
    /// one function enables it for the whole module, which makes other range
    /// formulas up to 1.8x slower on x86-64 (#342).
    #[inline(never)]
    fn dense_number_count_if_family(
        &self,
        range: CellRange,
        criterion: &Criterion,
        reader_depth: usize,
    ) -> Option<usize> {
        // At the depth limit the reader reads literals through `eval_at`,
        // which fails; see `LiteralSources::new`.
        if reader_depth >= FORMULA_RECURSION_LIMIT {
            return None;
        }

        let cells = &self.sheets.get(range.sheet as usize)?.cells;
        let row_start = range.row_start as usize;
        let row_end = (range.row_end as usize).min(cells.row_count().checked_sub(1)?);
        let col_end = (range.col_end as usize).min(cells.n_cols().checked_sub(1)?);

        let mut count = 0;
        for col in range.col_start as usize..=col_end {
            let column = cells.dense_column(col)?;
            let (kinds, numbers) = column.raw_slices();
            let kinds = kinds.get(row_start..=row_end)?;
            // A literal's raw kind is its kind, and a number's payload is its
            // `f64` bits. Formulas and blanks have other raw kinds.
            if kinds.iter().any(|&kind| kind != KIND_NUMBER) {
                return None;
            }
            count += criterion.count_numbers(&numbers[row_start..=row_end])?;
        }
        Some(count)
    }

    fn streamed_count_ifs(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if args.is_empty() || !args.len().is_multiple_of(2) {
            return None;
        }
        let mut readers = Vec::with_capacity(args.len() / 2);
        let mut criteria = Vec::with_capacity(args.len() / 2);
        for pair in args.as_chunks::<2>().0 {
            let range = range_from_ast(&pair[0], sheet)?;
            let reader = match RangeReader::new(self, range, depth + 1) {
                Ok(reader) => reader,
                Err(error) => return Some(Value::Error(error)),
            };
            if readers
                .first()
                .is_some_and(|first: &RangeReader<'_>| first.shape() != reader.shape())
            {
                return Some(Value::Error(FormulaError::Value));
            }
            let criterion = match self.eval_criterion(&pair[1], sheet, pass, depth + 1) {
                Ok(criterion) => criterion,
                Err(error) => return Some(Value::Error(error)),
            };
            readers.push(reader);
            criteria.push(criterion);
        }
        if let Some(ranges) = readers
            .iter()
            .map(RangeReader::literal_columns)
            .collect::<Option<Vec<_>>>()
        {
            let pairs: Vec<_> = ranges.into_iter().zip(&criteria).collect();
            return Some(self.literal_criteria_family(CriteriaFold::Count, None, &pairs));
        }
        let mut matches = 0.0;
        loop {
            let first = match readers[0].next_allow_errors(pass) {
                Ok(Some(value)) => value,
                Ok(None) => break,
                Err(error) => return Some(Value::Error(error)),
            };
            let mut row_matches = criteria[0].matches(&first);
            for index in 1..readers.len() {
                let candidate = match readers[index].next_allow_errors(pass) {
                    Ok(Some(value)) => value,
                    // The shapes are checked equal, so every reader ends on
                    // the same row.
                    Ok(None) => return Some(Value::Error(FormulaError::Value)),
                    Err(error) => return Some(Value::Error(error)),
                };
                if !criteria[index].matches(&candidate) {
                    row_matches = false;
                }
            }
            if row_matches {
                matches += 1.0;
            }
        }
        Some(Value::number(matches))
    }

    fn streamed_sum_if(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if !(2..=3).contains(&args.len()) {
            return None;
        }
        let criteria_range = range_from_ast(&args[0], sheet)?;
        let mut criteria_reader = match RangeReader::new(self, criteria_range, depth + 1) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        let criterion = match self.eval_criterion(&args[1], sheet, pass, depth + 1) {
            Ok(criterion) => criterion,
            Err(error) => return Some(Value::Error(error)),
        };
        let value_range = match args.get(2) {
            Some(ast) => sum_range_extent(
                range_from_ast(ast, sheet)?,
                criteria_range.row_end - criteria_range.row_start + 1,
                criteria_range.col_end - criteria_range.col_start + 1,
            ),
            None => criteria_range,
        };
        let mut value_reader = match RangeReader::new(self, value_range, depth + 1) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        if criteria_reader.shape() != value_reader.shape() {
            return Some(Value::Error(FormulaError::Value));
        }
        if let (Some(cells), Some(values)) = (
            criteria_reader.literal_columns(),
            value_reader.literal_columns(),
        ) {
            let fold = CriteriaFold::Sum {
                average: func == Func::AverageIf,
            };
            return Some(self.literal_criteria_family(fold, Some(&values), &[(cells, &criterion)]));
        }
        let mut fold = IfSum::new();
        loop {
            let candidate = match criteria_reader.next_allow_errors(pass) {
                Ok(Some(value)) => value,
                Ok(None) => break,
                Err(error) => return Some(Value::Error(error)),
            };
            let value = match value_reader.next_allow_errors(pass) {
                Ok(Some(value)) => value,
                // The shapes are checked equal, so both readers end together.
                Ok(None) => return Some(Value::Error(FormulaError::Value)),
                Err(error) => return Some(Value::Error(error)),
            };
            if criterion.matches(&candidate) {
                if let Err(error) = fold.add(&value) {
                    return Some(Value::Error(error));
                }
            }
        }
        Some(fold.finish(func == Func::AverageIf))
    }

    fn streamed_sum_ifs_or_extreme(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if args.len() < 3 || args.len().is_multiple_of(2) {
            return None;
        }
        let value_range = range_from_ast(&args[0], sheet)?;
        let mut value_reader = match RangeReader::new(self, value_range, depth + 1) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        let mut readers = Vec::with_capacity((args.len() - 1) / 2);
        let mut criteria = Vec::with_capacity((args.len() - 1) / 2);
        for pair in args[1..].as_chunks::<2>().0 {
            let range = range_from_ast(&pair[0], sheet)?;
            let reader = match RangeReader::new(self, range, depth + 1) {
                Ok(reader) => reader,
                Err(error) => return Some(Value::Error(error)),
            };
            if value_reader.shape() != reader.shape() {
                return Some(Value::Error(FormulaError::Value));
            }
            let criterion = match self.eval_criterion(&pair[1], sheet, pass, depth + 1) {
                Ok(criterion) => criterion,
                Err(error) => return Some(Value::Error(error)),
            };
            readers.push(reader);
            criteria.push(criterion);
        }
        let extreme = matches!(func, Func::MaxIfs | Func::MinIfs);
        if let (Some(values), Some(ranges)) = (
            value_reader.literal_columns(),
            readers
                .iter()
                .map(RangeReader::literal_columns)
                .collect::<Option<Vec<_>>>(),
        ) {
            let fold = if extreme {
                CriteriaFold::Extreme {
                    maximum: func == Func::MaxIfs,
                }
            } else {
                CriteriaFold::Sum {
                    average: func == Func::AverageIfs,
                }
            };
            let pairs: Vec<_> = ranges.into_iter().zip(&criteria).collect();
            return Some(self.literal_criteria_family(fold, Some(&values), &pairs));
        }
        let mut sums = IfSum::new();
        let mut extremes = IfExtreme::new(func == Func::MaxIfs);
        loop {
            let value = match value_reader.next_allow_errors(pass) {
                Ok(Some(value)) => value,
                Ok(None) => break,
                Err(error) => return Some(Value::Error(error)),
            };
            let mut row_matches = true;
            for index in 0..readers.len() {
                let candidate = match readers[index].next_allow_errors(pass) {
                    Ok(Some(value)) => value,
                    // The shapes are checked equal, so every reader ends on
                    // the same row.
                    Ok(None) => return Some(Value::Error(FormulaError::Value)),
                    Err(error) => return Some(Value::Error(error)),
                };
                if !criteria[index].matches(&candidate) {
                    row_matches = false;
                }
            }
            if row_matches {
                let folded = if extreme {
                    extremes.add(&value)
                } else {
                    sums.add(&value)
                };
                if let Err(error) = folded {
                    return Some(Value::Error(error));
                }
            }
        }
        Some(if extreme {
            extremes.finish()
        } else {
            sums.finish(func == Func::AverageIfs)
        })
    }

    #[inline(never)]
    fn eval_criteria_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if let Some(result) = self.streamed_criteria(func, args, sheet, pass, depth) {
            return result;
        }
        match func {
            Func::CountIf => {
                if args.len() != 2 {
                    return Value::Error(FormulaError::Value);
                }
                let range = match self.eval_matrix_arg(&args[0], sheet, pass, depth + 1) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let criterion = match self.eval_criterion(&args[1], sheet, pass, depth + 1) {
                    Ok(criterion) => criterion,
                    Err(error) => return Value::Error(error),
                };
                Value::number(
                    range
                        .values
                        .iter()
                        .filter(|value| criterion.matches(value))
                        .count() as f64,
                )
            }
            Func::CountIfs => {
                if args.is_empty() || !args.len().is_multiple_of(2) {
                    return Value::Error(FormulaError::Value);
                }
                let mut ranges = Vec::with_capacity(args.len() / 2);
                let mut criteria = Vec::with_capacity(args.len() / 2);
                for pair in args.as_chunks::<2>().0 {
                    let range = match self.eval_matrix_arg(&pair[0], sheet, pass, depth + 1) {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    };
                    if ranges
                        .first()
                        .is_some_and(|first: &EvalMatrix| !first.same_shape(&range))
                    {
                        return Value::Error(FormulaError::Value);
                    }
                    let criterion = match self.eval_criterion(&pair[1], sheet, pass, depth + 1) {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                    ranges.push(range);
                    criteria.push(criterion);
                }
                let count = (0..ranges[0].values.len())
                    .filter(|&index| {
                        ranges
                            .iter()
                            .zip(&criteria)
                            .all(|(range, criterion)| criterion.matches(&range.values[index]))
                    })
                    .count();
                Value::number(count as f64)
            }
            Func::SumIf | Func::AverageIf => {
                if !(2..=3).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let criteria_range = match self.eval_matrix_arg(&args[0], sheet, pass, depth + 1) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let criterion = match self.eval_criterion(&args[1], sheet, pass, depth + 1) {
                    Ok(criterion) => criterion,
                    Err(error) => return Value::Error(error),
                };
                let value_range = if let Some(ast) = args.get(2) {
                    let matrix = match range_from_ast(ast, sheet) {
                        Some(range) => {
                            let (rows, cols) = match range_from_ast(&args[0], sheet) {
                                Some(criteria) => (
                                    criteria.row_end - criteria.row_start + 1,
                                    criteria.col_end - criteria.col_start + 1,
                                ),
                                None => (criteria_range.rows as u32, criteria_range.cols as u32),
                            };
                            let range = sum_range_extent(range, rows, cols);
                            self.eval_range_matrix(range, pass, depth + 1)
                        }
                        None => self.eval_matrix_arg(ast, sheet, pass, depth + 1),
                    };
                    match matrix {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    }
                } else {
                    EvalMatrix::new(
                        criteria_range.rows,
                        criteria_range.cols,
                        criteria_range.values.clone(),
                    )
                };
                if !criteria_range.same_shape(&value_range) {
                    return Value::Error(FormulaError::Value);
                }
                aggregate_if(
                    &value_range,
                    &[(&criteria_range, &criterion)],
                    func == Func::AverageIf,
                )
            }
            Func::SumIfs | Func::AverageIfs | Func::MaxIfs | Func::MinIfs => {
                if args.len() < 3 || args.len().is_multiple_of(2) {
                    return Value::Error(FormulaError::Value);
                }
                let value_range = match self.eval_matrix_arg(&args[0], sheet, pass, depth + 1) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let mut ranges = Vec::with_capacity((args.len() - 1) / 2);
                let mut criteria = Vec::with_capacity((args.len() - 1) / 2);
                for pair in args[1..].as_chunks::<2>().0 {
                    let range = match self.eval_matrix_arg(&pair[0], sheet, pass, depth + 1) {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    };
                    if !value_range.same_shape(&range) {
                        return Value::Error(FormulaError::Value);
                    }
                    let criterion = match self.eval_criterion(&pair[1], sheet, pass, depth + 1) {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                    ranges.push(range);
                    criteria.push(criterion);
                }
                let pairs: Vec<_> = ranges.iter().zip(&criteria).collect();
                if matches!(func, Func::MaxIfs | Func::MinIfs) {
                    extreme_if(&value_range, &pairs, func == Func::MaxIfs)
                } else {
                    aggregate_if(&value_range, &pairs, func == Func::AverageIfs)
                }
            }
            _ => Value::Error(FormulaError::Value),
        }
    }

    fn eval_range_values(
        &self,
        range: CellRange,
        pass: &mut EvalPass<'_>,
        depth: usize,
        values: &mut FuncAccumulator,
    ) -> Result<(usize, usize), FormulaError> {
        self.push_range_values(range, None, pass, depth, values)
    }

    /// Pushes the cells of `range` as one argument. A cell that `skipped`
    /// names is pushed as blank without evaluation, which keeps the shape.
    fn push_range_values(
        &self,
        range: CellRange,
        skipped: Option<SkippedCells>,
        pass: &mut EvalPass<'_>,
        depth: usize,
        values: &mut FuncAccumulator,
    ) -> Result<(usize, usize), FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }

        let sheet = range.sheet as usize;
        let Some(s) = self.sheets.get(sheet) else {
            return Err(FormulaError::Ref);
        };
        if s.cells.row_count() == 0
            || s.cells.n_cols() == 0
            || range.row_start as usize >= s.cells.row_count()
            || range.col_start as usize >= s.cells.n_cols()
        {
            return Err(FormulaError::Ref);
        }

        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(s.cells.row_count() - 1);
        let col_end = (range.col_end as usize).min(s.cells.n_cols() - 1);

        let row_len = row_end - row_start + 1;
        let col_len = col_end - col_start + 1;
        let total = (row_len as u64).saturating_mul(col_len as u64);
        if total > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }

        values.reserve(total as usize)?;
        let literals = LiteralSources::new(s, depth);

        for row in row_start..=row_end {
            if skipped.is_some_and(|skipped| skipped.skips_row(s, row as u32)) {
                for _ in col_start..=col_end {
                    values.push_range(Value::Blank)?;
                }
                continue;
            }

            for col in col_start..=col_end {
                if !s.cells.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }
                if skipped.is_some_and(|skipped| {
                    skipped.skips_cell(s, row as u32, col as u32, &self.formula_slots)
                }) {
                    values.push_range(Value::Blank)?;
                    continue;
                }

                let i = s.cells.idx(row, col);
                let value = if let Some(value) =
                    literals.and_then(|sources| sources.value_at(&self.strings, i))
                {
                    value
                } else if s.cells.kind_at(i) == KIND_EMPTY {
                    Value::Blank
                } else {
                    self.eval_at(sheet, row, col, pass, depth + 1)
                };
                if let Value::Error(error) = value {
                    return Err(error);
                }
                values.push_range(value)?;
            }
        }

        Ok((row_len, col_len))
    }
}
