//! Iterative calculation, Excel's treatment of circular references when the
//! workbook turns it on.
//!
//! The depth walk already marks every formula on or behind a circular
//! reference with `#CYCLE!`, so workbooks without one never reach this module.
//! With iteration on, those formulas are split once into strongly connected
//! components and evaluated in dependency order: a circular component is swept
//! in row-major order, each member reading the latest value of the others,
//! until no member moves by more than the maximum change or the iteration
//! limit is spent. A component that does not converge keeps its last values,
//! as in Excel. Formulas behind a component run once, after it settles.
//!
//! Runtime references can close a cycle without a static edge. The evaluation
//! path identifies its members when the back edge is read. The head settles
//! that component before returning, so its downstream readers see final values.

use std::cell::RefCell;

use rustc_hash::FxHashSet;

use crate::sheet::formula_error_with_entry;
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};

use super::dependency::circular_components;
use super::value::cached_formula_value;
use super::EvalPass;
use crate::formula_slots::{FormulaBits, FormulaResults, FormulaWork};

/// Excel accepts 1 to 32,767 iterations.
const MAX_ITERATIONS: u32 = 32_767;

/// The limits of iterative calculation; the store keeps one only while
/// iteration is on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct IterationLimits {
    max_iterations: u32,
    max_change: f64,
}

impl IterationLimits {
    pub(crate) fn new(max_iterations: u32, max_change: f64) -> Option<Self> {
        let valid = (1..=MAX_ITERATIONS).contains(&max_iterations)
            && max_change.is_finite()
            && max_change >= 0.0;
        valid.then_some(Self {
            max_iterations,
            max_change,
        })
    }

    pub(crate) fn max_iterations(self) -> u32 {
        self.max_iterations
    }

    pub(crate) fn max_change(self) -> f64 {
        self.max_change
    }

    /// Whether a value moved by more than the maximum change. Only numbers
    /// have a distance; any other change keeps the sweep going.
    fn moved(self, previous_value: &Value, next_value: &Value) -> bool {
        match (previous_value, next_value) {
            (Value::Number(previous), Value::Number(next)) => {
                let change = (previous - next).abs();
                change > self.max_change || change.is_nan()
            }
            _ => previous_value != next_value,
        }
    }
}

/// Runtime cycle discovery is needed only while iteration is enabled.
#[derive(Default)]
struct BackEdges {
    path: Vec<AbsCellKey>,
    pending: FxHashSet<AbsCellKey>,
    active: Option<ActiveComponent>,
}

struct ActiveComponent {
    members: FxHashSet<AbsCellKey>,
    joined: Vec<AbsCellKey>,
}

thread_local! {
    /// `None` outside an iterating pass, so a back edge reports `#CYCLE!`.
    /// Only a back edge reads it: passes without a cycle never touch it.
    static BACK_EDGES: RefCell<Option<BackEdges>> = const { RefCell::new(None) };
}

/// Makes back edges read previous values for the lifetime of one pass.
pub(super) struct IterationPassGuard;

impl IterationPassGuard {
    pub(super) fn begin(iterating: bool) -> Option<Self> {
        iterating.then(|| {
            BACK_EDGES.with(|state| *state.borrow_mut() = Some(BackEdges::default()));
            Self
        })
    }
}

impl Drop for IterationPassGuard {
    fn drop(&mut self) {
        BACK_EDGES.with(|state| *state.borrow_mut() = None);
    }
}

/// Registers a formula before evaluating its body, including spill anchors.
pub(super) fn enter_runtime_formula(key: AbsCellKey) {
    BACK_EDGES.with(|state| {
        if let Some(edges) = state.borrow_mut().as_mut() {
            edges.path.push(key);
        }
    });
}

/// A formula pulled through a runtime read joins the active component only if
/// its evaluation reads a member back. Ordinary upstream formulas stay cached.
/// Only iterating passes call it, so it stays out of the read path.
#[inline(never)]
pub(super) fn record_iteration_read(key: AbsCellKey) {
    BACK_EDGES.with(|slot| {
        let mut state = slot.borrow_mut();
        let Some(edges) = state.as_mut() else {
            return;
        };
        let Some(active) = &mut edges.active else {
            return;
        };
        if active.members.contains(&key) {
            for &reader in &edges.path {
                if active.members.insert(reader) {
                    active.joined.push(reader);
                }
            }
        }
    });
}

impl CellStore {
    /// The value a runtime reference reads from a formula still on the
    /// evaluation path: its previous value while the pass iterates.
    pub(super) fn back_edge_value(&self, key: AbsCellKey) -> EvalResult {
        let iterating = BACK_EDGES.with(|slot| {
            let mut state = slot.borrow_mut();
            let Some(edges) = state.as_mut() else {
                return false;
            };
            if let Some(start) = edges.path.iter().position(|&member| member == key) {
                edges.pending.extend(edges.path[start..].iter().copied());
            }
            true
        });
        if iterating {
            self.starting_value(key)
        } else {
            Value::Error(FormulaError::Cycle)
        }
    }

    /// What a formula showed before this pass, where iteration starts. A
    /// `#CYCLE!` from a pass without iteration starts at zero, the value
    /// Excel shows for an unresolved circular reference.
    fn starting_value(&self, key: AbsCellKey) -> EvalResult {
        let local = key.local();
        let Some(sheet) = self.sheets.get(key.sheet as usize) else {
            return Value::Number(0.0);
        };
        let (row, col) = (local.0 as usize, local.1 as usize);
        if !sheet.cells.contains_cell(row, col) {
            return Value::Number(0.0);
        }

        let error =
            formula_error_with_entry(sheet, local, sheet.formulas.get(local, &self.formula_slots));
        let index = sheet.cells.idx(row, col);
        match cached_formula_value(sheet, &self.strings, index, error) {
            Value::Error(FormulaError::Cycle) => Value::Number(0.0),
            value => value,
        }
    }

    /// Whether the formula's result is one value. A spilling formula keeps
    /// the `#CYCLE!` the depth walk seeded: the spill loop installed its range
    /// before the scalar formulas settle. A runtime reference that resolved
    /// to one cell owns no range and iterates like any scalar formula.
    fn is_scalar_formula(&self, key: AbsCellKey) -> bool {
        let local = key.local();
        self.sheets.get(key.sheet as usize).is_some_and(|sheet| {
            sheet
                .formulas
                .get(local, &self.formula_slots)
                .is_some_and(|entry| {
                    !entry.produces_array()
                        || (entry.has_spill_refs() && sheet.spill.installed(local).is_none())
                })
        })
    }

    /// Before spill installation, settle cycles but leave ordinary readers
    /// unevaluated: they may read spill cells that do not exist yet. The
    /// depth walk's `#CYCLE!` results are still pulled, not written, so the
    /// cells hold the values each component starts from.
    #[inline(never)]
    pub(super) fn settle_circular_references(
        &mut self,
        affected: &FormulaWork,
        results: &mut FormulaResults,
        limits: IterationLimits,
        evaluate_readers: bool,
    ) {
        // Only the walk's `#CYCLE!` results wait in the pulled list here.
        let mut cyclic_ids = FormulaBits::default();
        while let Some((id, _)) = results.pop_pulled() {
            cyclic_ids.insert(id);
        }
        // Selection order, as the memo listed them.
        let cyclic: Vec<AbsCellKey> = affected
            .ids()
            .filter(|&id| cyclic_ids.contains(id))
            .filter_map(|id| self.formula_slots.location(id))
            .collect();

        // A pass applies the index before it seeds cycle errors.
        let Some(index) = self.graph.index() else {
            return;
        };
        let components = circular_components(&self.sheets, &self.formula_slots, index, &cyclic);
        for (members, circular) in components.iter() {
            if circular && members.iter().all(|&key| self.is_scalar_formula(key)) {
                self.iterate_component(members, affected, results, limits);
            } else if circular {
                for &key in members {
                    if let Some(id) = self.formula_id(key) {
                        self.settle_result(id, Value::Error(FormulaError::Cycle), results);
                    }
                }
            } else if evaluate_readers {
                for &key in members {
                    if self.is_scalar_formula(key) {
                        if let Some(id) = self.formula_id(key) {
                            self.evaluate_one(id, affected, results);
                        }
                    }
                }
            }
        }
    }

    /// Sweeps one circular component until it converges or the iteration
    /// limit is spent. Each member's new value is written before the next
    /// member reads it, so a sweep costs one evaluation per member.
    #[inline(never)]
    fn iterate_component(
        &mut self,
        component: &[AbsCellKey],
        affected: &FormulaWork,
        results: &mut FormulaResults,
        limits: IterationLimits,
    ) {
        let mut members = component.to_vec();
        BACK_EDGES.with(|state| {
            if let Some(edges) = state.borrow_mut().as_mut() {
                edges.active = Some(ActiveComponent {
                    members: members.iter().copied().collect(),
                    joined: Vec::new(),
                });
            }
        });
        for &key in &members {
            if let Some(id) = self.formula_id(key) {
                let start = self.starting_value(key);
                self.settle_result(id, start, results);
            }
        }

        for _ in 0..limits.max_iterations {
            let mut converged = true;
            for &key in &members {
                let Some(id) = self.formula_id(key) else {
                    continue;
                };
                let next = {
                    let mut pass = EvalPass { affected, results };
                    self.eval_formula_body(id, &mut pass, 0)
                };
                let (row, col) = key.local();
                let current = {
                    let mut pass = EvalPass { affected, results };
                    self.eval_at(key.sheet as usize, row as usize, col as usize, &mut pass, 0)
                };
                converged &= !limits.moved(&current, &next);
                self.flush_pulled(results);
                self.settle_result(id, next, results);
            }
            BACK_EDGES.with(|state| {
                if let Some(active) = state
                    .borrow_mut()
                    .as_mut()
                    .and_then(|edges| edges.active.as_mut())
                {
                    if !active.joined.is_empty() {
                        converged = false;
                        members.append(&mut active.joined);
                    }
                }
            });
            if converged {
                break;
            }
        }
        BACK_EDGES.with(|state| {
            if let Some(edges) = state.borrow_mut().as_mut() {
                edges.active = None;
            }
        });
    }

    /// A runtime component settles as its head unwinds, before any downstream
    /// reader returns. Discovery already evaluated each member once.
    pub(super) fn finish_runtime_formula(
        &self,
        key: AbsCellKey,
        pass: &mut EvalPass<'_>,
    ) -> Option<EvalResult> {
        let pending = BACK_EDGES.with(|slot| {
            let mut state = slot.borrow_mut();
            let edges = state.as_mut()?;
            let finished = edges.path.pop();
            debug_assert_eq!(finished, Some(key));
            if !edges.pending.contains(&key)
                || edges
                    .path
                    .iter()
                    .any(|member| edges.pending.contains(member))
            {
                return None;
            }
            Some(std::mem::take(&mut edges.pending))
        })?;
        let mut members: Vec<_> = pending.into_iter().collect();
        members.sort_unstable_by_key(|member| (member.sheet, member.row, member.col));
        let limits = self.iteration.as_deref().copied()?;
        for _ in 1..limits.max_iterations {
            let mut converged = true;
            for &member in &members {
                let id = self.formula_id(member)?;
                let next = self.eval_formula_body(id, pass, 0);
                if let Some(current) = pass.results.pulled_mut(id) {
                    converged &= !limits.moved(current, &next);
                    *current = next;
                }
            }
            if converged {
                break;
            }
        }
        pass.results.pulled(self.formula_id(key)?).cloned()
    }
}
