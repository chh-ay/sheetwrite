//! Formula recompute: dependency index, affected-set growth, evaluation.

#[cfg(feature = "analysis")]
pub(crate) mod analysis;
mod array;
mod criteria;
mod date;
mod dependency;
mod financial;
mod functions;
mod lookup;
mod math;
mod matrix;
mod operators;
mod range_reader;
mod statistics;
mod text;
mod value;

use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use crate::calc::{Ast, Func};
use crate::sheet::{spill_ownership_within_budget, SheetData, SpillRange};
use crate::store::CellStore;
use crate::types::{
    cell_key, string_from_pool_ref, AbsCellKey, CellRange, EvalResult, FormulaError,
    FormulaValueKind, StringPool, Value, FORMULA_RECURSION_LIMIT, KIND_BOOL, KIND_EMPTY,
    KIND_FORMULA, KIND_NUMBER, KIND_STRING, RANGE_CELL_LIMIT,
};

pub(crate) use array::ast_produces_array;
use array::dynamic_recompute_within_limit;
use criteria::{aggregate_if, extreme_if, Criterion, IfExtreme, IfSum};
pub(crate) use dependency::DepIndex;
use dependency::{
    build_dep_index, collect_affected_formulas, direct_readers, seed_dependency_depth_errors,
};
use functions::{apply_func, treats_cell_as_reference, FuncAccumulator, ReductionFold};
use lookup::{
    find_match_index_indexed, integer_arg, list_reuse, positive_index, remember_list, remember_result,
    remember_table, result_reuse, table_reuse, CachedList, CachedResult, CachedTable, LookupPassGuard,
    ReuseEntry, TablePart,
};
pub(crate) use matrix::{matrix_resource_stats, reset_matrix_resource_stats};
use matrix::{optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_BYTES};
use range_reader::RangeReader;
use value::{
    aggregate_number, bool_from_value, cached_formula_value, compare_values, text_from_value,
};

const LET_BINDING_LIMIT: usize = 126;
const LET_EXPANDED_NODE_LIMIT: usize = 16_384;

thread_local! {
    static FORMULA_ORIGINS: RefCell<Vec<(u32, u32)>> = const { RefCell::new(Vec::new()) };
    static RANGE_SUM_CACHE: RefCell<HashMap<CellRange, EvalResult>> =
        RefCell::new(HashMap::new());
    /// Values of the LET bindings of the evaluation in progress, indexed by
    /// the slots of its expanded expression. Empty while no LET is running,
    /// which leaves a slot use to evaluate its expression directly.
    static LET_SLOT_VALUES: RefCell<Vec<Option<EvalResult>>> = const { RefCell::new(Vec::new()) };
}

/// Runs `evaluate` with one empty slot per binding of a LET expansion and
/// restores the slots of the enclosing evaluation afterwards.
pub(super) fn with_let_slots<Output>(slots: u32, evaluate: impl FnOnce() -> Output) -> Output {
    let previous = LET_SLOT_VALUES
        .with(|values| std::mem::replace(&mut *values.borrow_mut(), vec![None; slots as usize]));
    let result = evaluate();
    LET_SLOT_VALUES.with(|values| *values.borrow_mut() = previous);
    result
}

/// The value a binding slot already produced in this evaluation.
fn cached_let_slot(slot: u32) -> Option<EvalResult> {
    LET_SLOT_VALUES.with(|values| values.borrow().get(slot as usize).cloned().flatten())
}

/// Keeps a binding's value for the rest of the evaluation.
fn remember_let_slot(slot: u32, value: EvalResult) {
    LET_SLOT_VALUES.with(|values| {
        if let Some(entry) = values.borrow_mut().get_mut(slot as usize) {
            *entry = Some(value);
        }
    });
}

struct FormulaOriginGuard;

impl FormulaOriginGuard {
    fn push(origin: (u32, u32)) -> Self {
        FORMULA_ORIGINS.with(|origins| origins.borrow_mut().push(origin));
        Self
    }
}

impl Drop for FormulaOriginGuard {
    fn drop(&mut self) {
        FORMULA_ORIGINS.with(|origins| {
            origins.borrow_mut().pop();
        });
    }
}

fn current_formula_origin() -> Option<(u32, u32)> {
    FORMULA_ORIGINS.with(|origins| origins.borrow().last().copied())
}

/// The value of a cell whose stored kind is not `KIND_FORMULA`.
fn literal_cell_value(data: &SheetData, strings: &StringPool, index: usize, kind: u8) -> Value {
    match kind {
        KIND_NUMBER => Value::number(data.num_at(index)),
        KIND_STRING => string_from_pool_ref(strings, data.str_id_at(index))
            .map(Value::text)
            .unwrap_or(Value::Error(FormulaError::Ref)),
        KIND_BOOL => Value::Bool(data.num_at(index) != 0.0),
        _ => Value::Blank,
    }
}

/// One LET binding: its name, its expression, how many earlier bindings its
/// expression can see, and the slot its value is kept in.
type LetBinding<'a> = (&'a str, &'a Ast, usize, u32);

/// Expands a LET call into an expression tree where every binding use carries
/// the slot its value is kept in, and reports how many slots the tree holds.
pub(super) fn expand_let_ast(args: &[Ast]) -> Result<(Ast, u32), FormulaError> {
    let mut bindings = Vec::new();
    bindings
        .try_reserve(args.len() / 2)
        .map_err(|_| FormulaError::Num)?;
    let mut nodes = 0usize;
    let mut next_slot = 0u32;
    let expanded = expand_let_args(args, &mut bindings, &mut nodes, &mut next_slot)?;
    Ok((expanded, next_slot))
}

/// Expands every LET reachable from `ast`, for the analysis passes that read
/// the expansion: dependency collection, volatility and array bounds.
pub(crate) fn expand_let_reachable_ast(ast: &Ast) -> Result<Ast, FormulaError> {
    let mut bindings = Vec::new();
    bindings.try_reserve(4).map_err(|_| FormulaError::Num)?;
    let mut nodes = 0usize;
    let mut next_slot = 0u32;
    expand_let_node(ast, &mut bindings, &mut nodes, &mut next_slot)
}

fn expand_let_args<'a>(
    args: &'a [Ast],
    bindings: &mut Vec<LetBinding<'a>>,
    nodes: &mut usize,
    next_slot: &mut u32,
) -> Result<Ast, FormulaError> {
    if args.len() < 3 || args.len().is_multiple_of(2) || args.len() / 2 > LET_BINDING_LIMIT {
        return Err(FormulaError::Value);
    }
    let original_len = bindings.len();
    for pair in args[..args.len() - 1].as_chunks::<2>().0 {
        let Ast::Name(name) = &pair[0] else {
            bindings.truncate(original_len);
            return Err(FormulaError::Value);
        };
        if !valid_let_name(name) {
            bindings.truncate(original_len);
            return Err(FormulaError::Value);
        }
        let visible = bindings.len();
        let slot = *next_slot;
        *next_slot = next_slot.checked_add(1).ok_or(FormulaError::Num)?;
        bindings.push((name.as_str(), &pair[1], visible, slot));
    }
    let result = expand_let_node(&args[args.len() - 1], bindings, nodes, next_slot);
    bindings.truncate(original_len);
    result
}

fn valid_let_name(name: &str) -> bool {
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

fn expand_let_node<'a>(
    ast: &'a Ast,
    bindings: &mut Vec<LetBinding<'a>>,
    nodes: &mut usize,
    next_slot: &mut u32,
) -> Result<Ast, FormulaError> {
    if let Ast::Name(name) = ast {
        if let Some((_, expression, visible, slot)) = bindings
            .iter()
            .rev()
            .find(|(binding, _, _, _)| binding.eq_ignore_ascii_case(name))
            .copied()
        {
            let hidden = bindings.split_off(visible);
            let result = expand_let_node(expression, bindings, nodes, next_slot);
            bindings.extend(hidden);
            return Ok(Ast::LetSlot {
                slot,
                expression: Box::new(result?),
            });
        }
    }
    count_let_node(nodes)?;
    #[cfg(feature = "analysis")]
    if let Ast::UnknownFunc(name, args) = ast {
        if let Some((_, expression, visible, _)) = bindings.iter().rev()
            .find(|(binding, ..)| binding.eq_ignore_ascii_case(name)).copied()
        {
            let hidden = bindings.split_off(visible);
            let callee = expand_let_node(expression, bindings, nodes, next_slot);
            bindings.extend(hidden);
            let callee = callee?;
            let mut invocation = vec![callee];
            invocation.extend(args.iter().map(|argument| {
                expand_let_node(argument, bindings, nodes, next_slot)
            }).collect::<Result<Vec<_>, _>>()?);
            return Ok(Ast::UnknownFunc(analysis::lambda::CALL.into(), invocation));
        }
    }
    Ok(match ast {
        #[cfg(feature = "analysis")]
        Ast::Func(Func::Analysis(analysis::LAMBDA_ID), args) if !args.is_empty() => {
            let mut captured = Vec::with_capacity(bindings.len());
            for (name, expression, visible, slot) in bindings.iter().copied() {
                if args[..args.len() - 1].iter().any(|parameter| {
                    matches!(parameter, Ast::Name(parameter) if parameter.eq_ignore_ascii_case(name))
                }) { continue; }
                let mut earlier = bindings[..visible].to_vec();
                let expanded = expand_let_node(expression, &mut earlier, nodes, next_slot)?;
                captured.push((name, Ast::LetSlot { slot, expression: Box::new(expanded) }));
            }
            let mut definition = args[..args.len() - 1].to_vec();
            definition.push(analysis::lambda::capture(&args[args.len() - 1], &captured)?);
            Ast::Func(Func::Analysis(analysis::LAMBDA_ID), definition)
        }
        Ast::Func(Func::Let, args) => return expand_let_args(args, bindings, nodes, next_slot),
        Ast::Func(func, args) => Ast::Func(
            *func,
            args.iter()
                .map(|arg| expand_let_node(arg, bindings, nodes, next_slot))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        Ast::UnknownFunc(name, args) => Ast::UnknownFunc(
            name.clone(),
            args.iter()
                .map(|arg| expand_let_node(arg, bindings, nodes, next_slot))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        Ast::Bin(op, left, right) => Ast::Bin(
            *op,
            Box::new(expand_let_node(left, bindings, nodes, next_slot)?),
            Box::new(expand_let_node(right, bindings, nodes, next_slot)?),
        ),
        Ast::Cmp(op, left, right) => Ast::Cmp(
            *op,
            Box::new(expand_let_node(left, bindings, nodes, next_slot)?),
            Box::new(expand_let_node(right, bindings, nodes, next_slot)?),
        ),
        Ast::Neg(inner) => Ast::Neg(Box::new(expand_let_node(
            inner, bindings, nodes, next_slot,
        )?)),
        Ast::Pos(inner) => Ast::Pos(Box::new(expand_let_node(
            inner, bindings, nodes, next_slot,
        )?)),
        Ast::Percent(inner) => Ast::Percent(Box::new(expand_let_node(
            inner, bindings, nodes, next_slot,
        )?)),
        other => other.clone(),
    })
}

fn address_text(
    row: usize,
    col: usize,
    abs: i32,
    a1: bool,
    sheet: Option<&str>,
) -> Result<String, FormulaError> {
    if row >= 1_048_576 || col >= 16_384 {
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
        let mut value = col + 1;
        let mut reversed = [0u8; 3];
        let mut length = 0;
        while value > 0 {
            value -= 1;
            reversed[length] = b'A' + (value % 26) as u8;
            length += 1;
            value /= 26;
        }
        for byte in reversed[..length].iter().rev() {
            output.push(char::from(*byte));
        }
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

/// Cells that one spill install or clear changed, and when it happened.
struct SpillChange {
    sheet: usize,
    sequence: usize,
    cells: Vec<(u32, u32)>,
}

impl CellStore {
    pub(crate) fn recompute_sheet(&mut self, sheet: usize) {
        self.recompute_seed_sheets(&[sheet]);
    }

    pub(crate) fn recompute_changed(&mut self) {
        let seeds: Vec<usize> = self
            .sheets
            .iter()
            .enumerate()
            .filter_map(|(sheet, data)| {
                (!data.dirty_cells.is_empty() || data.all_dirty).then_some(sheet)
            })
            .collect();
        self.recompute_seed_sheets(&seeds);
    }

    fn recompute_seed_sheets(&mut self, seeds: &[usize]) {
        if seeds.is_empty() {
            return;
        }
        RANGE_SUM_CACHE.with(|cache| cache.borrow_mut().clear());
        let _lookup_pass = LookupPassGuard::begin();
        if self.sheets.iter().all(|sheet| sheet.formulas.is_empty()) {
            for &sheet in seeds {
                if let Some(data) = self.sheets.get_mut(sheet) {
                    data.clear_dirty();
                }
            }
            return;
        }

        let dep_index_stale = self
            .dep_index
            .as_ref()
            .is_none_or(|index| index.epoch != self.formula_epoch);
        if dep_index_stale {
            self.dep_index = Some(build_dep_index(&self.sheets, self.formula_epoch));
        }
        let Some(index) = self.dep_index.as_ref() else {
            return;
        };
        let mut affected = HashSet::new();
        for &sheet in seeds {
            affected.extend(collect_affected_formulas(&self.sheets, sheet, index));
            let data = &self.sheets[sheet];
            if data.spill_ranges.is_empty() {
                continue;
            }
            if data.all_dirty {
                affected.extend(
                    data.spill_ranges
                        .keys()
                        .map(|&anchor| AbsCellKey::from_local(sheet, anchor)),
                );
                continue;
            }
            // A dirty cell that lands inside a spilled range invalidates that
            // anchor, so scan the dirty cells once and mark every range they
            // fall inside, rather than rescanning the whole dirty set for each
            // range. Stop as soon as every range has been hit.
            let mut hit = vec![false; data.spill_ranges.len()];
            let mut unhit_ranges = hit.len();
            for &cell in &data.dirty_cells {
                for (range_index, (_, range)) in data.spill_ranges.iter().enumerate() {
                    if !hit[range_index] && range.contains(cell) {
                        hit[range_index] = true;
                        unhit_ranges -= 1;
                    }
                }
                if unhit_ranges == 0 {
                    break;
                }
            }
            for (range_index, (&anchor, _)) in data.spill_ranges.iter().enumerate() {
                if hit[range_index] {
                    affected.insert(AbsCellKey::from_local(sheet, anchor));
                }
            }
        }
        if affected.is_empty() {
            for &sheet in seeds {
                if let Some(data) = self.sheets.get_mut(sheet) {
                    data.clear_dirty();
                }
            }
            return;
        }

        let mut memo: HashMap<AbsCellKey, EvalResult> = HashMap::with_capacity(affected.len());
        if let Some(index) = self.dep_index.as_ref() {
            seed_dependency_depth_errors(&self.sheets, &affected, index, &mut memo);
        }
        let mut visiting: HashSet<AbsCellKey> = HashSet::new();
        let mut processed_arrays: HashSet<AbsCellKey> = HashSet::new();
        if self
            .dep_index
            .as_ref()
            .is_some_and(|index| !index.has_dynamic_arrays)
        {
            for key in &affected {
                let _ = self.eval_formula_cell(*key, &affected, &mut memo, &mut visiting, 0);
            }
            for key in &affected {
                if let Some(result) = memo.remove(key) {
                    self.store_formula_result(*key, result);
                }
            }
            for &sheet in seeds {
                self.sheets[sheet].clear_dirty();
            }
            return;
        }

        let mut seeded_sheets: HashSet<usize> = seeds.iter().copied().collect();
        let mut spill_work = 0usize;
        // Spills are evaluated in cell order, so a spill can read another
        // spill before that one is installed. `evaluated_at` and the change
        // log find readers that ran before a spill they read changed, and the
        // next pass evaluates them again. A reader that keeps coming back
        // reads its own output through other spills: that is a cycle.
        let mut sequence = 0usize;
        let mut evaluated_at: HashMap<AbsCellKey, usize> = HashMap::new();
        let mut requeued: HashMap<AbsCellKey, usize> = HashMap::new();
        let mut cyclic: HashSet<AbsCellKey> = HashSet::new();

        loop {
            let mut pending: Vec<(AbsCellKey, Ast, bool)> = affected
                .iter()
                .filter(|key| !processed_arrays.contains(key))
                .filter_map(|&key| {
                    let entry = self
                        .sheets
                        .get(key.sheet as usize)?
                        .formulas
                        .get(&key.local())?;
                    if !entry.produces_array {
                        return None;
                    }
                    let ast = entry.ast.as_ref()?;
                    self.dynamic_array_bound(ast, key.sheet as usize)
                        .is_some()
                        .then(|| (key, ast.clone(), entry.has_spill_refs))
                })
                .collect();
            if pending.is_empty() {
                break;
            }
            pending.sort_unstable_by_key(|(key, ..)| (key.sheet, key.row, key.col));

            let mut changed_sheets = HashSet::new();
            let mut spill_changes: Vec<SpillChange> = Vec::new();
            for (key, ast, has_spill_refs) in pending {
                // Spill references read the spills installed so far in this pass.
                let ast = if has_spill_refs {
                    self.resolve_spill_refs(&ast, key.sheet as usize)
                } else {
                    ast
                };
                processed_arrays.insert(key);
                sequence += 1;
                evaluated_at.insert(key, sequence);
                let local = key.local();
                let output_sheet = key.sheet as usize;
                let vacated_range = self.sheets[output_sheet].installed_spill(local);
                let cleared = self.sheets[output_sheet].clear_spill(local);
                if !cleared.is_empty() {
                    spill_changes.push(SpillChange {
                        sheet: output_sheet,
                        sequence,
                        cells: cleared.clone(),
                    });
                    self.sheets[output_sheet].dirty_cells.extend(cleared);
                    changed_sheets.insert(output_sheet);
                    seeded_sheets.insert(output_sheet);
                }
                if let Some(vacated) = vacated_range {
                    let collision_dependents: Vec<AbsCellKey> = self.sheets[output_sheet]
                        .spill_ranges
                        .iter()
                        .filter(|&(&anchor, &attempt)| {
                            anchor != local && attempt.intersects(vacated)
                        })
                        .map(|(&anchor, &_attempt)| AbsCellKey::from_local(output_sheet, anchor))
                        .collect();
                    for dependent in collision_dependents {
                        affected.insert(dependent);
                        processed_arrays.remove(&dependent);
                    }
                }
                memo.remove(&key);

                let evaluated = match self.dynamic_array_bound(&ast, output_sheet) {
                    _ if cyclic.contains(&key) => Err(FormulaError::Cycle),
                    Some(Ok(bound)) => match dynamic_recompute_within_limit(spill_work, bound) {
                        Some(total) => {
                            spill_work = total;
                            let _origin = FormulaOriginGuard::push(local);
                            self.eval_dynamic_array(
                                &ast,
                                output_sheet,
                                &affected,
                                &mut memo,
                                &mut visiting,
                                0,
                            )
                            .unwrap_or(Err(FormulaError::Value))
                        }
                        None => Err(FormulaError::Num),
                    },
                    Some(Err(error)) => Err(error),
                    // Resolving a missing spill removes its array marker.
                    // Keep the scalar expression's error instead of replacing it.
                    None => match self.eval_ast(
                        &ast, output_sheet, &affected, &mut memo, &mut visiting, 0,
                    ) {
                        Value::Error(error) => Err(error),
                        _ => Err(FormulaError::Value),
                    },
                };
                let changed = self.install_spill_result(key, evaluated, &mut memo);
                // Formulas that use `A1#` read only the anchor cell. The anchor
                // counts as changed when its spill range or spilled cells
                // changed. A new anchor value alone needs no notice: a reader
                // evaluates the anchor formula on demand when it reads it.
                let installed_range = self.sheets[output_sheet].installed_spill(local);
                if installed_range != vacated_range || !changed.is_empty() {
                    let mut cells = changed.clone();
                    cells.push(local);
                    spill_changes.push(SpillChange {
                        sheet: output_sheet,
                        sequence,
                        cells,
                    });
                }
                if !changed.is_empty() {
                    self.sheets[output_sheet].dirty_cells.extend(changed);
                    changed_sheets.insert(output_sheet);
                    seeded_sheets.insert(output_sheet);
                }
            }

            let Some(index) = self.dep_index.as_ref() else {
                return;
            };
            for changed_sheet in changed_sheets {
                affected.extend(collect_affected_formulas(
                    &self.sheets,
                    changed_sheet,
                    index,
                ));
            }
            for change in spill_changes {
                for reader in direct_readers(index, change.sheet, &change.cells) {
                    let is_stale = evaluated_at
                        .get(&reader)
                        .is_some_and(|&evaluated| evaluated < change.sequence);
                    if !is_stale || cyclic.contains(&reader) {
                        continue;
                    }
                    let count = requeued.entry(reader).or_insert(0);
                    *count += 1;
                    // Without a cycle, a reader comes back at most once per
                    // spill in front of it.
                    if *count > affected.len() {
                        cyclic.insert(reader);
                    }
                    processed_arrays.remove(&reader);
                }
            }
            seed_dependency_depth_errors(&self.sheets, &affected, index, &mut memo);
        }

        if let Some(index) = self.dep_index.as_ref() {
            seed_dependency_depth_errors(&self.sheets, &affected, index, &mut memo);
        }
        for key in &affected {
            let _ = self.eval_formula_cell(*key, &affected, &mut memo, &mut visiting, 0);
        }
        for key in &affected {
            if let Some(result) = memo.remove(key) {
                self.store_formula_result(*key, result);
            }
        }
        for seeded_sheet in seeded_sheets {
            self.sheets[seeded_sheet].clear_dirty();
        }
    }

    fn spill_collision(&self, sheet: usize, range: SpillRange) -> Result<(), FormulaError> {
        let Some(data) = self.sheets.get(sheet) else {
            return Err(FormulaError::Ref);
        };
        if range.row_end as usize >= data.row_count || range.col_end as usize >= data.n_cols {
            return Err(FormulaError::Spill);
        }
        if data.spill_blockers.iter().any(|blocker| {
            let row_start = blocker.row_start.max(range.anchor.0);
            let col_start = blocker.col_start.max(range.anchor.1);
            let row_end = blocker.row_end.min(range.row_end);
            let col_end = blocker.col_end.min(range.col_end);
            row_start <= row_end
                && col_start <= col_end
                && !(row_start == range.anchor.0
                    && row_end == range.anchor.0
                    && col_start == range.anchor.1
                    && col_end == range.anchor.1)
        }) {
            return Err(FormulaError::Spill);
        }
        for row in range.anchor.0..=range.row_end {
            for col in range.anchor.1..=range.col_end {
                let cell = (row, col);
                if cell == range.anchor {
                    continue;
                }
                if !data.is_loaded(row as usize, col as usize) {
                    return Err(FormulaError::Loading);
                }
                let index = data.idx(row as usize, col as usize);
                if data.spill_owners.contains_key(&cell)
                    || data.formulas.contains_key(&cell)
                    || data.kind_at(index) != KIND_EMPTY
                {
                    return Err(FormulaError::Spill);
                }
            }
        }
        Ok(())
    }

    fn install_spill_result(
        &mut self,
        key: AbsCellKey,
        result: Result<EvalMatrix, FormulaError>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
    ) -> Vec<(u32, u32)> {
        let sheet = key.sheet as usize;
        let local = key.local();
        let matrix = match result {
            Ok(matrix) => matrix,
            Err(error) => {
                self.sheets[sheet].spill_ranges.remove(&local);
                self.sheets[sheet].compact_spill_metadata();
                memo.insert(key, Value::Error(error));
                return Vec::new();
            }
        };
        let Some(range) = SpillRange::new(local, matrix.rows, matrix.cols) else {
            self.sheets[sheet].spill_ranges.remove(&local);
            self.sheets[sheet].compact_spill_metadata();
            memo.insert(key, Value::Error(FormulaError::Num));
            return Vec::new();
        };
        self.sheets[sheet].spill_ranges.insert(local, range);
        if let Err(error) = self.spill_collision(sheet, range) {
            self.sheets[sheet].compact_spill_metadata();
            memo.insert(key, Value::Error(error));
            return Vec::new();
        }

        let additional_errors = matrix
            .values
            .iter()
            .skip(1)
            .filter(|value| matches!(value, Value::Error(_)))
            .count();
        let current_owner_cells = self.sheets.iter().try_fold(0usize, |total, data| {
            total.checked_add(data.spill_owners.len())
        });
        let current_error_cells = self.sheets.iter().try_fold(0usize, |total, data| {
            total.checked_add(data.spill_errors.len())
        });
        let within_budget = current_owner_cells
            .and_then(|total| total.checked_add(matrix.values.len()))
            .zip(current_error_cells.and_then(|total| total.checked_add(additional_errors)))
            .is_some_and(|(owners, errors)| {
                owners <= self.spill_owner_cell_limit
                    && spill_ownership_within_budget(owners, errors)
            });
        if !within_budget {
            self.sheets[sheet].compact_spill_metadata();
            memo.insert(key, Value::Error(FormulaError::Num));
            return Vec::new();
        }
        let data = &mut self.sheets[sheet];
        if data.spill_owners.try_reserve(matrix.values.len()).is_err()
            || data.spill_errors.try_reserve(additional_errors).is_err()
        {
            data.compact_spill_metadata();
            memo.insert(key, Value::Error(FormulaError::Num));
            return Vec::new();
        }

        let first = matrix.values.first().cloned().unwrap_or(Value::Blank);
        memo.insert(key, first);
        let mut changed = Vec::with_capacity(matrix.values.len().saturating_sub(1));
        for row_offset in 0..matrix.rows {
            for col_offset in 0..matrix.cols {
                let cell = (local.0 + row_offset as u32, local.1 + col_offset as u32);
                self.sheets[sheet].spill_owners.insert(cell, local);
                if cell == local {
                    continue;
                }
                let value = &matrix.values[row_offset * matrix.cols + col_offset];
                let interned = match value {
                    Value::Text(text) => Some(self.intern(text)),
                    _ => None,
                };
                let data = &mut self.sheets[sheet];
                let index = data.idx(cell.0 as usize, cell.1 as usize);
                match value {
                    Value::Number(number) => {
                        data.set_kind(index, KIND_NUMBER);
                        data.set_num(index, *number);
                    }
                    Value::Text(_) => {
                        data.set_kind(index, KIND_STRING);
                        if let Some(id) = interned {
                            data.set_str(index, id);
                        }
                    }
                    Value::Bool(value) => {
                        data.set_kind(index, KIND_BOOL);
                        data.set_num(index, f64::from(*value));
                    }
                    Value::Blank => {
                        data.set_kind(index, KIND_EMPTY);
                        data.clear_payload(index);
                    }
                    Value::Error(error) => {
                        data.set_kind(index, KIND_FORMULA);
                        data.clear_payload(index);
                        data.spill_errors.insert(cell, *error);
                    }
                }
                data.mark_cell_loaded(cell.0 as usize, cell.1 as usize, false);
                changed.push(cell);
            }
        }
        self.sheets[sheet].compact_spill_metadata();
        changed
    }

    fn store_formula_result(&mut self, key: AbsCellKey, result: EvalResult) {
        let interned = match &result {
            Value::Text(text) => Some(self.intern(text)),
            _ => None,
        };
        let sheet = key.sheet as usize;
        let Some(data) = self.sheets.get_mut(sheet) else {
            return;
        };
        let (row, col) = key.local();
        if !data.contains_cell(row as usize, col as usize) {
            return;
        }
        let index = data.idx(row as usize, col as usize);
        let Some(entry) = data.formulas.get_mut(&key.local()) else {
            return;
        };
        match &result {
            Value::Number(_) => {
                entry.error = None;
                entry.value_kind = FormulaValueKind::Number;
            }
            Value::Text(_) => {
                entry.error = None;
                entry.value_kind = FormulaValueKind::Text;
            }
            Value::Bool(_) => {
                entry.error = None;
                entry.value_kind = FormulaValueKind::Bool;
            }
            Value::Blank => {
                entry.error = None;
                entry.value_kind = FormulaValueKind::Blank;
            }
            Value::Error(error) => {
                entry.error = Some(*error);
                entry.value_kind = FormulaValueKind::Number;
            }
        }
        match result {
            Value::Number(value) => data.set_num(index, value),
            Value::Text(_) => match interned {
                Some(id) => data.set_str(index, id),
                None => data.clear_payload(index),
            },
            Value::Bool(value) => data.set_num(index, f64::from(value)),
            Value::Blank | Value::Error(_) => data.clear_payload(index),
        }
    }

    pub(crate) fn eval_at(
        &self,
        sheet: usize,
        row: usize,
        col: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }

        let Some(s) = self.sheets.get(sheet) else {
            return Value::Error(FormulaError::Ref);
        };
        if !s.contains_cell(row, col) {
            return Value::Error(FormulaError::Ref);
        }
        if !s.is_loaded(row, col) {
            return Value::Error(FormulaError::Loading);
        }

        // 2026-06 release harness: unchecked cell access was 1.13x here,
        // below the 2x threshold; keep the safe indexing.
        let i = s.idx(row, col);
        let kind = s.kind_at(i);
        // Formula, reference and spill-error cells are always stored as
        // `KIND_FORMULA`, so any other kind is a plain value and needs neither
        // the formula-map nor the spill-error lookup. Range reads hit this for
        // every literal cell.
        if kind != KIND_FORMULA {
            debug_assert!(cell_key(row, col).is_none_or(|key| {
                !s.formulas.contains_key(&key) && !s.spill_errors.contains_key(&key)
            }));
            return literal_cell_value(s, &self.strings, i, kind);
        }
        if let Some(key) = cell_key(row, col) {
            let abs_key = AbsCellKey::from_local(sheet, key);
            if let Some(entry) = s.formulas.get(&key) {
                if affected.contains(&abs_key) {
                    return self.eval_formula_cell(abs_key, affected, memo, visiting, depth + 1);
                }
                return cached_formula_value(s, &self.strings, i, entry);
            }
            if let Some(error) = s.spill_errors.get(&key) {
                return Value::Error(*error);
            }
        }

        // A `KIND_FORMULA` cell without a formula entry keeps its last number.
        Value::number(s.num_at(i))
    }

    pub(crate) fn eval_formula_cell(
        &self,
        key: AbsCellKey,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }
        if let Some(result) = memo.get(&key) {
            return result.clone();
        }
        if !visiting.insert(key) {
            return Value::Error(FormulaError::Cycle);
        }

        let sheet = key.sheet as usize;
        let local = key.local();
        let result = match self.sheets.get(sheet).and_then(|s| s.formulas.get(&local)) {
            Some(entry) => match &entry.ast {
                Some(ast) => {
                    let _origin = FormulaOriginGuard::push(local);
                    if entry.has_spill_refs {
                        let resolved = self.resolve_spill_refs(ast, sheet);
                        self.eval_ast(&resolved, sheet, affected, memo, visiting, depth + 1)
                    } else {
                        self.eval_ast(ast, sheet, affected, memo, visiting, depth + 1)
                    }
                }
                None => Value::Error(entry.error.unwrap_or(FormulaError::Value)),
            },
            None => Value::Number(0.0),
        };

        visiting.remove(&key);
        memo.insert(key, result.clone());
        result
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
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
    ) -> EvalResult {
        let affected = HashSet::new();
        let _origin = FormulaOriginGuard::push((row, col));
        self.eval_ast(ast, sheet, &affected, memo, visiting, 0)
    }

    pub(crate) fn eval_ast(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }

        match ast {
            #[cfg(feature = "analysis")]
            Ast::BoundMatrix { values, .. } => values.first().cloned().unwrap_or(Value::Blank),
            #[cfg(feature = "analysis")]
            Ast::UnknownFunc(name, args) if name == analysis::lambda::CALL => {
                analysis::lambda::evaluate(self, analysis::lambda::CALL, args, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Num(n) => Value::number(*n),
            Ast::Str(text) => Value::text(text.as_str()),
            Ast::Bool(value) => Value::Bool(*value),
            Ast::Missing => Value::Blank,
            // A scalar position uses the first element, as other array results do.
            Ast::Array { values, .. } => values.first().cloned().unwrap_or(Value::Blank),
            Ast::Cell(row, col, _) => self.eval_at(
                sheet,
                *row as usize,
                *col as usize,
                affected,
                memo,
                visiting,
                depth + 1,
            ),
            Ast::AbsCell(sheet_ref, row, col, _) => self.eval_at(
                sheet_ref.handle as usize,
                *row as usize,
                *col as usize,
                affected,
                memo,
                visiting,
                depth + 1,
            ),
            Ast::SheetCell(..) | Ast::InvalidRef => Value::Error(FormulaError::Ref),
            Ast::LetSlot { slot, expression } => match cached_let_slot(*slot) {
                Some(value) => value,
                None => {
                    let value = self.eval_ast(expression, sheet, affected, memo, visiting, depth);
                    remember_let_slot(*slot, value.clone());
                    value
                }
            },
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
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                )
            }
            Ast::Structured(reference) if reference.row_start == reference.row_end => self.eval_at(
                reference.sheet as usize,
                reference.row_start as usize,
                reference.col as usize,
                affected,
                memo,
                visiting,
                depth + 1,
            ),
            Ast::Structured(_)
            | Ast::NamedRange(_)
            | Ast::Range(..)
            | Ast::AbsRange(..)
            | Ast::SheetRange(..) => Value::Error(FormulaError::Value),
            Ast::Neg(expr) | Ast::Pos(expr) | Ast::Percent(expr) => {
                let op = match ast {
                    Ast::Neg(_) => operators::UnaryOp::Neg,
                    Ast::Pos(_) => operators::UnaryOp::Pos,
                    _ => operators::UnaryOp::Percent,
                };
                operators::unary(
                    op,
                    &self.eval_ast(expr, sheet, affected, memo, visiting, depth + 1),
                )
            }
            Ast::Bin(op, left, right) => {
                let left = self.eval_ast(left, sheet, affected, memo, visiting, depth + 1);
                operators::binary(*op, &left, || {
                    self.eval_ast(right, sheet, affected, memo, visiting, depth + 1)
                })
            }
            Ast::Cmp(op, left, right) => {
                let left = self.eval_ast(left, sheet, affected, memo, visiting, depth + 1);
                let right = self.eval_ast(right, sheet, affected, memo, visiting, depth + 1);
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
                | Func::ChooseRows,
                _,
            ) => {
                match self
                    .eval_dynamic_array(ast, sheet, affected, memo, visiting, depth + 1)
                    .unwrap_or(Err(FormulaError::Value))
                {
                    Ok(matrix) => matrix.into_first(),
                    Err(error) => Value::Error(error),
                }
            }
            Ast::Func(func, args) => {
                self.eval_func(*func, args, sheet, affected, memo, visiting, depth + 1)
            }
        }
    }

    fn eval_func(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
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
                    if (hooks.produces_array)(name, args) {
                        return match (hooks.evaluate)(
                            self, name, args, sheet, affected, memo, visiting, depth,
                        )
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
                    return evaluate(self, name, args, sheet, affected, memo, visiting, depth);
                }
            }
        }

        if func == Func::Let {
            return match expand_let_ast(args) {
                Ok((expanded, slots)) => with_let_slots(slots, || {
                    self.eval_ast(&expanded, sheet, affected, memo, visiting, depth + 1)
                }),
                Err(error) => Value::Error(error),
            };
        }

        if func == Func::Choose {
            if args.len() < 2 {
                return Value::Error(FormulaError::Value);
            }
            let index = self.eval_ast(&args[0], sheet, affected, memo, visiting, depth + 1);
            let index = match positive_index(&index) {
                Ok(index) if index + 1 < args.len() => index + 1,
                Ok(_) => return Value::Error(FormulaError::Value),
                Err(error) => return Value::Error(error),
            };
            let selected = &args[index];
            if range_from_ast(selected, sheet).is_some() {
                return match self.eval_matrix_arg(
                    selected,
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(matrix) => matrix.into_first(),
                    Err(error) => Value::Error(error),
                };
            }
            if let Some(result) =
                self.eval_dynamic_array(selected, sheet, affected, memo, visiting, depth + 1)
            {
                return result.map_or_else(Value::Error, EvalMatrix::into_first);
            }
            return self.eval_ast(selected, sheet, affected, memo, visiting, depth + 1);
        }

        if matches!(func, Func::Row | Func::Column) {
            if args.len() > 1 {
                return Value::Error(FormulaError::Value);
            }
            let coordinate = if let Some(reference) = args.first() {
                let Some(range) = range_from_ast(reference, sheet) else {
                    return Value::Error(FormulaError::Value);
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
            let matrix =
                match self.eval_matrix_arg(&args[0], sheet, affected, memo, visiting, depth + 1) {
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
            let scalar = |ast: &Ast,
                          memo: &mut HashMap<AbsCellKey, EvalResult>,
                          visiting: &mut HashSet<AbsCellKey>| {
                self.eval_ast(ast, sheet, affected, memo, visiting, depth + 1)
            };
            let row = match positive_index(&scalar(&args[0], memo, visiting)) {
                Ok(row) => row,
                Err(error) => return Value::Error(error),
            };
            let col = match positive_index(&scalar(&args[1], memo, visiting)) {
                Ok(col) => col,
                Err(error) => return Value::Error(error),
            };
            let abs = match optional_ast(args, 2) {
                Some(ast) => match integer_arg(&scalar(ast, memo, visiting)) {
                    Ok(value @ 1..=4) => value,
                    _ => return Value::Error(FormulaError::Value),
                },
                None => 1,
            };
            let a1 = match optional_ast(args, 3) {
                Some(ast) => match bool_from_value(&scalar(ast, memo, visiting)) {
                    Ok(value) => value,
                    Err(error) => return Value::Error(error),
                },
                None => true,
            };
            let sheet_name = match optional_ast(args, 4) {
                Some(ast) => match text_from_value(&scalar(ast, memo, visiting)) {
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

        if func == Func::If {
            if !(2..=3).contains(&args.len()) {
                return Value::Error(FormulaError::Value);
            }
            let condition = &args[0];
            let condition = self.eval_ast(condition, sheet, affected, memo, visiting, depth + 1);
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
                self.eval_ast(branch, sheet, affected, memo, visiting, depth + 1)
            } else {
                Value::Number(0.0)
            };
        }

        if func == Func::IfError {
            if !(1..=2).contains(&args.len()) {
                return Value::Error(FormulaError::Value);
            }
            let primary = &args[0];
            let value = self.eval_ast(primary, sheet, affected, memo, visiting, depth + 1);
            return if matches!(value, Value::Error(_)) {
                if let Some(fallback) = args.get(1) {
                    self.eval_ast(fallback, sheet, affected, memo, visiting, depth + 1)
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
            let value = self.eval_ast(&args[0], sheet, affected, memo, visiting, depth + 1);
            return if value == Value::Error(FormulaError::Na) {
                self.eval_ast(&args[1], sheet, affected, memo, visiting, depth + 1)
            } else {
                value
            };
        }

        if func == Func::Ifs {
            if args.len() < 2 || !args.len().is_multiple_of(2) {
                return Value::Error(FormulaError::Value);
            }
            for pair in args.as_chunks::<2>().0 {
                let condition = self.eval_ast(&pair[0], sheet, affected, memo, visiting, depth + 1);
                match bool_from_value(&condition) {
                    Ok(true) => {
                        return self.eval_ast(&pair[1], sheet, affected, memo, visiting, depth + 1);
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
            let expression = self.eval_ast(&args[0], sheet, affected, memo, visiting, depth + 1);
            if let Value::Error(error) = expression {
                return Value::Error(error);
            }
            let pairs_end = if args.len().is_multiple_of(2) {
                args.len() - 1
            } else {
                args.len()
            };
            for pair in args[1..pairs_end].as_chunks::<2>().0 {
                let case = self.eval_ast(&pair[0], sheet, affected, memo, visiting, depth + 1);
                match compare_values(&expression, &case) {
                    Ok(Ordering::Equal) => {
                        return self.eval_ast(&pair[1], sheet, affected, memo, visiting, depth + 1);
                    }
                    Ok(_) => {}
                    Err(error) => return Value::Error(error),
                }
            }
            return if pairs_end < args.len() {
                self.eval_ast(&args[pairs_end], sheet, affected, memo, visiting, depth + 1)
            } else {
                Value::Error(FormulaError::Na)
            };
        }

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
            let value = self.eval_ast(&args[0], sheet, affected, memo, visiting, depth + 1);
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

        if matches!(
            func,
            Func::CountIf
                | Func::CountIfs
                | Func::SumIf
                | Func::SumIfs
                | Func::AverageIfs
                | Func::AverageIf
                | Func::MaxIfs
                | Func::MinIfs
        ) {
            return self.eval_criteria_func(func, args, sheet, affected, memo, visiting, depth + 1);
        }

        if matches!(
            func,
            Func::Index
                | Func::Match
                | Func::VLookup
                | Func::HLookup
                | Func::XLookup
                | Func::XMatch
        ) {
            return self.eval_lookup_func(func, args, sheet, affected, memo, visiting, depth + 1);
        }

        if func == Func::Sum && args.len() == 1 {
            let range = match &args[0] {
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
                _ => None,
            };
            if let Some(range) = range {
                return self.eval_sum_range(range, affected, memo, visiting, depth + 1);
            }
        }

        if let Some(result) =
            self.streamed_reduction(func, args, sheet, affected, memo, visiting, depth + 1)
        {
            return result;
        }

        #[cfg(feature = "analysis")]
        if let Func::Analysis(id) = func {
            let name = analysis::name(id);
            let result = match name {
                "SUMSQ" => analysis::math::streamed_sum_squares(
                    self, args, sheet, affected, memo, visiting, depth + 1,
                ),
                "SUMX2MY2" | "SUMX2PY2" | "SUMXMY2" => analysis::math::streamed_paired_squares(
                    self, name, args, sheet, affected, memo, visiting, depth + 1,
                ),
                _ => None,
            };
            if let Some(result) = result {
                return result;
            }
        }

        let mut values = FuncAccumulator::default();
        for arg in args {
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
                _ => None,
            };
            let shape = if let Some(range) = range {
                match self.eval_range_values(
                    range,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                    &mut values,
                ) {
                    Ok(shape) => shape,
                    Err(error) => return Value::Error(error),
                }
            } else if ast_produces_array(arg) {
                match self.eval_dynamic_array(arg, sheet, affected, memo, visiting, depth + 1) {
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
                        let value = self.eval_ast(arg, sheet, affected, memo, visiting, depth + 1);
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
                let value = self.eval_ast(arg, sheet, affected, memo, visiting, depth + 1);
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
    fn eval_matrix_arg(
        &self,
        ast: &Ast,
        formula_sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if range_from_ast(ast, formula_sheet).is_none() {
            let Some(result) =
                self.eval_dynamic_array(ast, formula_sheet, affected, memo, visiting, depth + 1)
            else {
                return Err(FormulaError::Value);
            };
            let matrix = result?;
            matrix.validate_copies(2)?;
            return Ok(matrix);
        }
        let range = range_from_ast(ast, formula_sheet).ok_or(FormulaError::Value)?;
        let sheet = range.sheet as usize;
        let Some(data) = self.sheets.get(sheet) else {
            return Err(FormulaError::Ref);
        };
        if data.row_count == 0
            || data.n_cols == 0
            || range.row_start as usize >= data.row_count
            || range.col_start as usize >= data.n_cols
        {
            return Err(FormulaError::Ref);
        }
        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(data.row_count - 1);
        let col_end = (range.col_end as usize).min(data.n_cols - 1);
        let rows = row_end - row_start + 1;
        let cols = col_end - col_start + 1;
        let total = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
        let mut payload_bytes = total
            .checked_mul(std::mem::size_of::<Value>())
            .ok_or(FormulaError::Num)?;
        for row in row_start..=row_end {
            for col in col_start..=col_end {
                let index = data.idx(row, col);
                if matches!(data.kind_at(index), KIND_STRING | KIND_FORMULA) {
                    if let Some(text) = string_from_pool_ref(&self.strings, data.str_id_at(index)) {
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
        for row in row_start..=row_end {
            for col in col_start..=col_end {
                if !data.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }
                values.push(self.eval_at(sheet, row, col, affected, memo, visiting, depth + 1));
            }
        }
        Ok(EvalMatrix::new(rows, cols, values))
    }

    fn eval_criterion(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<Criterion, FormulaError> {
        let value = self.eval_ast(ast, sheet, affected, memo, visiting, depth + 1);
        if let Value::Error(error) = value {
            return Err(error);
        }
        Ok(Criterion::parse(value))
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
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Option<EvalResult> {
        let mut fold = ReductionFold::new(func)?;
        let mut ranges = Vec::with_capacity(args.len());
        for arg in args {
            ranges.push(range_from_ast(arg, sheet)?);
        }
        for range in ranges {
            let mut reader = match RangeReader::new(self, range, depth) {
                Ok(reader) => reader,
                Err(error) => return Some(Value::Error(error)),
            };
            loop {
                match reader.next(affected, memo, visiting) {
                    Ok(Some(value)) => {
                        if let Err(error) = fold.push(&value) {
                            return Some(Value::Error(error));
                        }
                    }
                    Ok(None) => break,
                    Err(error) => return Some(Value::Error(error)),
                }
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
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Option<EvalResult> {
        match func {
            Func::CountIf => self.streamed_count_if(args, sheet, affected, memo, visiting, depth),
            Func::CountIfs => self.streamed_count_ifs(args, sheet, affected, memo, visiting, depth),
            Func::SumIf | Func::AverageIf => {
                self.streamed_sum_if(func, args, sheet, affected, memo, visiting, depth)
            }
            Func::SumIfs | Func::AverageIfs | Func::MaxIfs | Func::MinIfs => {
                self.streamed_sum_ifs_or_extreme(func, args, sheet, affected, memo, visiting, depth)
            }
            _ => None,
        }
    }

    fn streamed_count_if(
        &self,
        args: &[Ast],
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Option<EvalResult> {
        if args.len() != 2 {
            return None;
        }
        let range = range_from_ast(&args[0], sheet)?;
        let mut reader = match RangeReader::new(self, range, depth + 1) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        let criterion =
            match self.eval_criterion(&args[1], sheet, affected, memo, visiting, depth + 1) {
                Ok(criterion) => criterion,
                Err(error) => return Some(Value::Error(error)),
            };
        let mut matches = 0.0;
        loop {
            match reader.next_allow_errors(affected, memo, visiting) {
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

    fn streamed_count_ifs(
        &self,
        args: &[Ast],
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
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
            let criterion =
                match self.eval_criterion(&pair[1], sheet, affected, memo, visiting, depth + 1) {
                    Ok(criterion) => criterion,
                    Err(error) => return Some(Value::Error(error)),
                };
            readers.push(reader);
            criteria.push(criterion);
        }
        let mut matches = 0.0;
        loop {
            let first = match readers[0].next_allow_errors(affected, memo, visiting) {
                Ok(Some(value)) => value,
                Ok(None) => break,
                Err(error) => return Some(Value::Error(error)),
            };
            let mut row_matches = criteria[0].matches(&first);
            for index in 1..readers.len() {
                let candidate = match readers[index].next_allow_errors(affected, memo, visiting) {
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
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
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
        let criterion =
            match self.eval_criterion(&args[1], sheet, affected, memo, visiting, depth + 1) {
                Ok(criterion) => criterion,
                Err(error) => return Some(Value::Error(error)),
            };
        let value_range = match args.get(2) {
            Some(ast) => range_from_ast(ast, sheet)?,
            None => criteria_range,
        };
        let mut value_reader = match RangeReader::new(self, value_range, depth + 1) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        if criteria_reader.shape() != value_reader.shape() {
            return Some(Value::Error(FormulaError::Value));
        }
        let mut fold = IfSum::new();
        loop {
            let candidate = match criteria_reader.next_allow_errors(affected, memo, visiting) {
                Ok(Some(value)) => value,
                Ok(None) => break,
                Err(error) => return Some(Value::Error(error)),
            };
            let value = match value_reader.next_allow_errors(affected, memo, visiting) {
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
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
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
            let criterion =
                match self.eval_criterion(&pair[1], sheet, affected, memo, visiting, depth + 1) {
                    Ok(criterion) => criterion,
                    Err(error) => return Some(Value::Error(error)),
                };
            readers.push(reader);
            criteria.push(criterion);
        }
        let extreme = matches!(func, Func::MaxIfs | Func::MinIfs);
        let mut sums = IfSum::new();
        let mut extremes = IfExtreme::new(func == Func::MaxIfs);
        loop {
            let value = match value_reader.next_allow_errors(affected, memo, visiting) {
                Ok(Some(value)) => value,
                Ok(None) => break,
                Err(error) => return Some(Value::Error(error)),
            };
            let mut row_matches = true;
            for index in 0..readers.len() {
                let candidate = match readers[index].next_allow_errors(affected, memo, visiting) {
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

    fn eval_criteria_func(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        if let Some(result) =
            self.streamed_criteria(func, args, sheet, affected, memo, visiting, depth)
        {
            return result;
        }
        let result = match func {
            Func::CountIf => {
                if args.len() != 2 {
                    return Value::Error(FormulaError::Value);
                }
                let range = match self.eval_matrix_arg(
                    &args[0],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let criterion =
                    match self.eval_criterion(&args[1], sheet, affected, memo, visiting, depth + 1)
                    {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                Ok((
                    range
                        .values
                        .iter()
                        .filter(|value| criterion.matches(value))
                        .count() as f64,
                    0,
                ))
            }
            Func::CountIfs => {
                if args.is_empty() || !args.len().is_multiple_of(2) {
                    return Value::Error(FormulaError::Value);
                }
                let mut ranges = Vec::with_capacity(args.len() / 2);
                let mut criteria = Vec::with_capacity(args.len() / 2);
                for pair in args.as_chunks::<2>().0 {
                    let range = match self.eval_matrix_arg(
                        &pair[0],
                        sheet,
                        affected,
                        memo,
                        visiting,
                        depth + 1,
                    ) {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    };
                    if ranges
                        .first()
                        .is_some_and(|first: &EvalMatrix| !first.same_shape(&range))
                    {
                        return Value::Error(FormulaError::Value);
                    }
                    let criterion = match self.eval_criterion(
                        &pair[1],
                        sheet,
                        affected,
                        memo,
                        visiting,
                        depth + 1,
                    ) {
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
                Ok((count as f64, 0))
            }
            Func::SumIf | Func::AverageIf => {
                if !(2..=3).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let criteria_range = match self.eval_matrix_arg(
                    &args[0],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let criterion =
                    match self.eval_criterion(&args[1], sheet, affected, memo, visiting, depth + 1)
                    {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                let value_range = if let Some(ast) = args.get(2) {
                    match self.eval_matrix_arg(ast, sheet, affected, memo, visiting, depth + 1) {
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
                aggregate_if(&value_range, &[(&criteria_range, &criterion)])
            }
            Func::SumIfs | Func::AverageIfs | Func::MaxIfs | Func::MinIfs => {
                if args.len() < 3 || args.len().is_multiple_of(2) {
                    return Value::Error(FormulaError::Value);
                }
                let value_range = match self.eval_matrix_arg(
                    &args[0],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let mut ranges = Vec::with_capacity((args.len() - 1) / 2);
                let mut criteria = Vec::with_capacity((args.len() - 1) / 2);
                for pair in args[1..].as_chunks::<2>().0 {
                    let range = match self.eval_matrix_arg(
                        &pair[0],
                        sheet,
                        affected,
                        memo,
                        visiting,
                        depth + 1,
                    ) {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    };
                    if !value_range.same_shape(&range) {
                        return Value::Error(FormulaError::Value);
                    }
                    let criterion = match self.eval_criterion(
                        &pair[1],
                        sheet,
                        affected,
                        memo,
                        visiting,
                        depth + 1,
                    ) {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                    ranges.push(range);
                    criteria.push(criterion);
                }
                let pairs: Vec<_> = ranges.iter().zip(&criteria).collect();
                if matches!(func, Func::MaxIfs | Func::MinIfs) {
                    extreme_if(&value_range, &pairs, func == Func::MaxIfs).map(|value| (value, 0))
                } else {
                    aggregate_if(&value_range, &pairs)
                }
            }
            _ => return Value::Error(FormulaError::Value),
        };
        match result {
            Ok((sum_or_count, numeric_count)) => {
                if matches!(func, Func::AverageIf | Func::AverageIfs) {
                    if numeric_count == 0 {
                        Value::Error(FormulaError::DivZero)
                    } else {
                        Value::number(sum_or_count / numeric_count as f64)
                    }
                } else {
                    Value::number(sum_or_count)
                }
            }
            Err(error) => Value::Error(error),
        }
    }

    /// The table for a `VLOOKUP`/`HLOOKUP` argument.
    fn lookup_table_argument(
        &self,
        ast: &Ast,
        sheet: usize,
        part: TablePart,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<Rc<CachedTable>, FormulaError> {
        let range = range_from_ast(ast, sheet);
        let previous = range.and_then(|range| table_reuse(range, part));
        self.reused_lookup_range(
            ast,
            sheet,
            range,
            previous,
            |rows, cols, values| match part {
                TablePart::FirstColumn => CachedTable::from_column(rows, cols, values),
                TablePart::FirstRow => CachedTable::from_row(rows, cols, values),
            },
            |range, state| remember_table(range, part, state),
            affected,
            memo,
            visiting,
            depth,
        )
    }

    /// The search list for a `MATCH`, `XMATCH` or `XLOOKUP` argument.
    fn lookup_list_argument(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<Rc<CachedList>, FormulaError> {
        let range = range_from_ast(ast, sheet);
        let previous = range.and_then(list_reuse);
        self.reused_lookup_range(
            ast,
            sheet,
            range,
            previous,
            CachedList::new,
            remember_list,
            affected,
            memo,
            visiting,
            depth,
        )
    }

    /// The result range for an `XLOOKUP` argument.
    fn lookup_result_argument(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<Rc<CachedResult>, FormulaError> {
        let range = range_from_ast(ast, sheet);
        let previous = range.and_then(result_reuse);
        self.reused_lookup_range(
            ast,
            sheet,
            range,
            previous,
            |_, _, values| CachedResult::new(values),
            remember_result,
            affected,
            memo,
            visiting,
            depth,
        )
    }

    /// Materializes a lookup range and records what this pass may reuse.
    ///
    /// A range is materialized once per pass. The first lookup only records
    /// that the range was seen; the second pays one reusability scan and,
    /// when nothing in the range can change mid-pass, every later lookup
    /// reuses the entry. A range searched once therefore costs exactly what
    /// it did before.
    fn reused_lookup_range<Materialized>(
        &self,
        ast: &Ast,
        sheet: usize,
        range: Option<CellRange>,
        previous: Option<ReuseEntry<Materialized>>,
        build: impl FnOnce(usize, usize, Vec<Value>) -> Materialized,
        remember: impl FnOnce(CellRange, ReuseEntry<Materialized>),
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<Rc<Materialized>, FormulaError> {
        if let Some(ReuseEntry::Reusable(entry)) = &previous {
            return Ok(Rc::clone(entry));
        }
        let (rows, cols, values) =
            self.eval_matrix_values(ast, sheet, affected, memo, visiting, depth)?;
        let entry = Rc::new(build(rows, cols, values));
        if let Some(range) = range {
            match previous {
                None => remember(range, ReuseEntry::Seen),
                Some(ReuseEntry::Seen) => {
                    let state = if self.range_is_reusable(range) {
                        ReuseEntry::Reusable(Rc::clone(&entry))
                    } else {
                        ReuseEntry::Blocked
                    };
                    remember(range, state);
                }
                Some(ReuseEntry::Blocked) | Some(ReuseEntry::Reusable(_)) => {}
            }
        }
        Ok(entry)
    }

    /// Materializes a range into its shape and row-major values, exactly as
    /// `eval_matrix_arg` returns them.
    fn eval_matrix_values(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<(usize, usize, Vec<Value>), FormulaError> {
        let mut matrix = self.eval_matrix_arg(ast, sheet, affected, memo, visiting, depth)?;
        let rows = matrix.rows;
        let cols = matrix.cols;
        let values = std::mem::take(&mut matrix.values);
        Ok((rows, cols, values))
    }

    /// True when a lookup may keep a range's decoded cells for the rest of
    /// the pass: the sheet is fully resident, and no cell of the range is a
    /// formula or a spilled value, so nothing in it can change mid-pass.
    fn range_is_reusable(&self, range: CellRange) -> bool {
        let Some(data) = self.sheets.get(range.sheet as usize) else {
            return false;
        };
        if data.is_paged() {
            return false;
        }
        let has_spills = !data.spill_owners.is_empty();
        let row_end = (range.row_end as usize).min(data.row_count.saturating_sub(1));
        let col_end = (range.col_end as usize).min(data.n_cols.saturating_sub(1));
        for col in range.col_start as usize..=col_end {
            for row in range.row_start as usize..=row_end {
                let index = data.idx(row, col);
                if data.kind_at(index) == KIND_FORMULA {
                    return false;
                }
                if has_spills && data.spill_owner((row as u32, col as u32)).is_some() {
                    return false;
                }
            }
        }
        true
    }

    fn eval_lookup_func(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        let scalar = |ast: &Ast,
                      memo: &mut HashMap<AbsCellKey, EvalResult>,
                      visiting: &mut HashSet<AbsCellKey>| {
            self.eval_ast(ast, sheet, affected, memo, visiting, depth + 1)
        };
        match func {
            Func::Index => {
                if !(2..=3).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let matrix = match self.eval_matrix_arg(
                    &args[0],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(matrix) => matrix,
                    Err(error) => return Value::Error(error),
                };
                let first = scalar(&args[1], memo, visiting);
                let first = match positive_index(&first) {
                    Ok(index) => index,
                    Err(error) => return Value::Error(error),
                };
                let (row, col) = if matrix.rows == 1 && args.len() == 2 {
                    (0, first)
                } else if matrix.cols == 1 && args.len() == 2 {
                    (first, 0)
                } else {
                    let Some(col_arg) = args.get(2) else {
                        return Value::Error(FormulaError::Value);
                    };
                    let col = scalar(col_arg, memo, visiting);
                    let col = match positive_index(&col) {
                        Ok(index) => index,
                        Err(error) => return Value::Error(error),
                    };
                    (first, col)
                };
                matrix
                    .get(row, col)
                    .cloned()
                    .unwrap_or(Value::Error(FormulaError::Ref))
            }
            Func::Match => {
                if !(2..=3).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let key = scalar(&args[0], memo, visiting);
                if let Value::Error(error) = key {
                    return Value::Error(error);
                }
                let lookup = match self.lookup_list_argument(
                    &args[1],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(list) => list,
                    Err(error) => return Value::Error(error),
                };
                let (lookup_rows, lookup_cols) = lookup.shape();
                if lookup_rows != 1 && lookup_cols != 1 {
                    return Value::Error(FormulaError::Na);
                }
                let mode = optional_ast(args, 2)
                    .map(|arg| scalar(arg, memo, visiting))
                    .map_or(Ok(1), |value| integer_arg(&value));
                let mode = match mode {
                    Ok(mode @ (-1..=1)) => mode,
                    _ => return Value::Error(FormulaError::Value),
                };
                let (match_mode, search_mode) = match mode {
                    1 => (-1, 2),
                    -1 => (1, -2),
                    _ => (0, 1),
                };
                match find_match_index_indexed(lookup.search(), &key, match_mode, search_mode) {
                    Ok(Some(index)) => Value::number((index + 1) as f64),
                    Ok(None) => Value::Error(FormulaError::Na),
                    Err(error) => Value::Error(error),
                }
            }
            Func::XMatch => {
                if !(2..=4).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let key = scalar(&args[0], memo, visiting);
                if let Value::Error(error) = key {
                    return Value::Error(error);
                }
                let lookup = match self.lookup_list_argument(
                    &args[1],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(list) => list,
                    Err(error) => return Value::Error(error),
                };
                let (lookup_rows, lookup_cols) = lookup.shape();
                if lookup_rows != 1 && lookup_cols != 1 {
                    return Value::Error(FormulaError::Value);
                }
                let match_mode = match optional_ast(args, 2) {
                    Some(arg) => match integer_arg(&scalar(arg, memo, visiting)) {
                        Ok(mode @ (-1..=2)) => mode,
                        _ => return Value::Error(FormulaError::Value),
                    },
                    None => 0,
                };
                let search_mode = match optional_ast(args, 3) {
                    Some(arg) => match integer_arg(&scalar(arg, memo, visiting)) {
                        Ok(mode @ (-2 | -1 | 1 | 2)) => mode,
                        _ => return Value::Error(FormulaError::Value),
                    },
                    None => 1,
                };
                match find_match_index_indexed(lookup.search(), &key, match_mode, search_mode) {
                    Ok(Some(index)) => Value::number((index + 1) as f64),
                    Ok(None) => Value::Error(FormulaError::Na),
                    Err(error) => Value::Error(error),
                }
            }
            Func::VLookup | Func::HLookup => {
                if !(3..=4).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let key = scalar(&args[0], memo, visiting);
                if let Value::Error(error) = key {
                    return Value::Error(error);
                }
                let part = if func == Func::VLookup {
                    TablePart::FirstColumn
                } else {
                    TablePart::FirstRow
                };
                let table = match self.lookup_table_argument(
                    &args[1],
                    sheet,
                    part,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(table) => table,
                    Err(error) => return Value::Error(error),
                };
                let result_index = match positive_index(&scalar(&args[2], memo, visiting)) {
                    Ok(index) => index,
                    Err(error) => return Value::Error(error),
                };
                let sorted = match optional_ast(args, 3) {
                    Some(arg) => match bool_from_value(&scalar(arg, memo, visiting)) {
                        Ok(value) => value,
                        Err(error) => return Value::Error(error),
                    },
                    None => true,
                };
                let found = match find_match_index_indexed(
                    table.search(),
                    &key,
                    if sorted { -1 } else { 0 },
                    if sorted { 2 } else { 1 },
                ) {
                    Ok(Some(index)) => index,
                    Ok(None) => return Value::Error(FormulaError::Na),
                    Err(error) => return Value::Error(error),
                };
                let value = if func == Func::VLookup {
                    table.cell(found, result_index)
                } else {
                    table.cell(result_index, found)
                };
                value.cloned().unwrap_or(Value::Error(FormulaError::Ref))
            }
            Func::XLookup => {
                if !(3..=6).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let key = scalar(&args[0], memo, visiting);
                if let Value::Error(error) = key {
                    return Value::Error(error);
                }
                let lookup = match self.lookup_list_argument(
                    &args[1],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(list) => list,
                    Err(error) => return Value::Error(error),
                };
                let result = match self.lookup_result_argument(
                    &args[2],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let (lookup_rows, lookup_cols) = lookup.shape();
                if lookup.search().values().len() != result.len()
                    || (lookup_rows != 1 && lookup_cols != 1)
                {
                    return Value::Error(FormulaError::Value);
                }
                let match_mode = match optional_ast(args, 4) {
                    Some(arg) => match integer_arg(&scalar(arg, memo, visiting)) {
                        Ok(mode @ (-1..=2)) => mode,
                        _ => return Value::Error(FormulaError::Value),
                    },
                    None => 0,
                };
                let search_mode = match optional_ast(args, 5) {
                    Some(arg) => match integer_arg(&scalar(arg, memo, visiting)) {
                        Ok(mode @ (-2 | -1 | 1 | 2)) => mode,
                        _ => return Value::Error(FormulaError::Value),
                    },
                    None => 1,
                };
                match find_match_index_indexed(lookup.search(), &key, match_mode, search_mode) {
                    Ok(Some(index)) => result
                        .value(index)
                        .cloned()
                        .unwrap_or(Value::Error(FormulaError::Ref)),
                    Ok(None) => optional_ast(args, 3)
                        .map_or(Value::Error(FormulaError::Na), |arg| {
                            scalar(arg, memo, visiting)
                        }),
                    Err(error) => Value::Error(error),
                }
            }
            _ => Value::Error(FormulaError::Value),
        }
    }

    fn eval_sum_range(
        &self,
        range: CellRange,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }
        let sheet = range.sheet as usize;
        let Some(data) = self.sheets.get(sheet) else {
            return Value::Error(FormulaError::Ref);
        };
        if data.row_count == 0
            || data.n_cols == 0
            || range.row_start as usize >= data.row_count
            || range.col_start as usize >= data.n_cols
        {
            return Value::Error(FormulaError::Ref);
        }
        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(data.row_count - 1);
        let col_end = (range.col_end as usize).min(data.n_cols - 1);
        let total = (row_end - row_start + 1) as u64 * (col_end - col_start + 1) as u64;
        if total > RANGE_CELL_LIMIT {
            return Value::Error(FormulaError::Num);
        }
        if let Some(cached) = RANGE_SUM_CACHE.with(|cache| cache.borrow().get(&range).cloned()) {
            return cached;
        }

        let mut sum: f64 = 0.0;
        let mut cacheable = true;
        let has_spill_cells = !data.spill_owners.is_empty();
        for row in row_start..=row_end {
            for col in col_start..=col_end {
                if !data.is_loaded(row, col) {
                    return Value::Error(FormulaError::Loading);
                }
                let index = data.idx(row, col);
                let kind = data.kind_at(index);
                // A sum over formula cells or spilled output can change without a
                // write to this range, so only plain values are cached. Formula
                // cells are exactly the `KIND_FORMULA` ones.
                if cacheable
                    && (kind == KIND_FORMULA
                        || (has_spill_cells
                            && data.spill_owner((row as u32, col as u32)).is_some()))
                {
                    cacheable = false;
                }
                let value = if kind == KIND_EMPTY {
                    Value::Blank
                } else {
                    self.eval_at(sheet, row, col, affected, memo, visiting, depth + 1)
                };
                match aggregate_number(&value, true) {
                    Ok(Some(number)) => sum += number,
                    Ok(None) => {}
                    Err(error) => return Value::Error(error),
                }
            }
        }
        let result = if sum.is_finite() {
            Value::Number(sum)
        } else {
            Value::Error(FormulaError::Num)
        };
        if cacheable {
            RANGE_SUM_CACHE.with(|cache| {
                cache.borrow_mut().insert(range, result.clone());
            });
        }
        result
    }

    fn eval_range_values(
        &self,
        range: CellRange,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
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
        if s.row_count == 0
            || s.n_cols == 0
            || range.row_start as usize >= s.row_count
            || range.col_start as usize >= s.n_cols
        {
            return Err(FormulaError::Ref);
        }

        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(s.row_count - 1);
        let col_end = (range.col_end as usize).min(s.n_cols - 1);

        let row_len = row_end - row_start + 1;
        let col_len = col_end - col_start + 1;
        let total = (row_len as u64).saturating_mul(col_len as u64);
        if total > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }

        values.reserve(total as usize)?;

        for row in row_start..=row_end {
            for col in col_start..=col_end {
                if !s.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }
                let i = s.idx(row, col);
                let value = if s.kind_at(i) == KIND_EMPTY {
                    Value::Blank
                } else {
                    self.eval_at(sheet, row, col, affected, memo, visiting, depth + 1)
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
