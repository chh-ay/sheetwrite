//! Optional function families for the complete analysis engine.

mod aggregate;
mod bessel;
mod bytes;
mod compatibility;
mod complex;
mod database;
mod dates;
mod depreciation;
mod descriptive;
mod discrete;
mod distributions;
mod engineering;
mod finance;
mod groupby;
mod hypothesis;
pub(crate) use groupby::grouping;
pub(crate) use pivot_data::ast_calls_pivot_data;
pub(crate) mod lambda;
pub(super) mod math;
mod matrices;
mod pivot_data;
mod regression;
mod reshape;
mod securities;
mod text;
mod units;

use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{EvalResult, FormulaError, Value};

use super::functions::FuncAccumulator;
use super::matrix::EvalMatrix;
use super::EvalPass;

pub(super) type ScalarEvaluator = fn(&str, &FuncAccumulator) -> EvalResult;
pub(super) type AstEvaluator =
    fn(&CellStore, &str, &[Ast], usize, &mut EvalPass<'_>, usize) -> EvalResult;
pub(super) type MatrixEvaluator = fn(
    &CellStore,
    &str,
    &[Ast],
    usize,
    &mut EvalPass<'_>,
    usize,
) -> Result<EvalMatrix, FormulaError>;

/// Shape and bound hooks receive the pass that asks, so work they share with
/// the evaluation that follows, such as compiled regex programs, is done once.
pub(super) type ShapeEvaluator = fn(
    &CellStore,
    &str,
    &[Ast],
    usize,
    &mut EvalPass<'_>,
) -> Result<(usize, usize, usize), FormulaError>;
pub(super) type BoundEvaluator =
    fn(&CellStore, &str, &[Ast], usize, &mut EvalPass<'_>) -> Result<usize, FormulaError>;

/// Array hooks must use the same shape, byte and work limits as built-in arrays.
pub(super) struct ArrayHooks {
    pub(super) produces_array: fn(&str, &[Ast]) -> bool,
    pub(super) shape: ShapeEvaluator,
    pub(super) bound: BoundEvaluator,
    pub(super) evaluate: MatrixEvaluator,
}

pub(super) struct Family {
    /// ASCII uppercase spellings in alphabetical order, including any aliases.
    pub(super) names: &'static [&'static str],
    /// Names whose single-cell arguments are references, like `SUM(A1)`: text
    /// and logical values in the cell are ignored instead of converted.
    pub(super) reference_cells: &'static [&'static str],
    pub(super) evaluate: Option<ScalarEvaluator>,
    /// Runs before accumulator coercion and retains the original arguments.
    pub(super) evaluate_ast: Option<AstEvaluator>,
    pub(super) array: Option<ArrayHooks>,
}

const FAMILIES: &[Family] = &[
    Family {
        names: groupby::NAMES,
        reference_cells: &[],
        evaluate: None,
        evaluate_ast: Some(groupby::evaluate_ast),
        array: Some(ArrayHooks {
            produces_array: groupby::produces_array,
            shape: groupby::shape,
            bound: groupby::bound,
            evaluate: groupby::evaluate_matrix,
        }),
    },
    Family {
        names: aggregate::NAMES,
        reference_cells: &[],
        evaluate: None,
        evaluate_ast: Some(aggregate::evaluate_ast),
        array: None,
    },
    Family {
        names: database::NAMES,
        reference_cells: &[],
        evaluate: None,
        evaluate_ast: Some(database::evaluate_ast),
        array: None,
    },
    Family {
        names: dates::NAMES,
        reference_cells: &[],
        evaluate: Some(dates::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: descriptive::NAMES,
        reference_cells: descriptive::REFERENCE_CELLS,
        evaluate: Some(descriptive::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: distributions::NAMES,
        reference_cells: &[],
        evaluate: Some(distributions::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: compatibility::NAMES,
        reference_cells: compatibility::REFERENCE_CELLS,
        evaluate: Some(compatibility::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: discrete::NAMES,
        reference_cells: &[],
        evaluate: Some(discrete::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: hypothesis::NAMES,
        reference_cells: &[],
        evaluate: Some(hypothesis::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: engineering::NAMES,
        reference_cells: &[],
        evaluate: Some(engineering::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: complex::NAMES,
        reference_cells: &[],
        evaluate: Some(complex::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: bessel::NAMES,
        reference_cells: &[],
        evaluate: Some(bessel::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: units::NAMES,
        reference_cells: &[],
        evaluate: Some(units::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: bytes::NAMES,
        reference_cells: &[],
        evaluate: Some(bytes::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: finance::NAMES,
        reference_cells: &[],
        evaluate: Some(finance::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: depreciation::NAMES,
        reference_cells: &[],
        evaluate: Some(depreciation::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: securities::NAMES,
        reference_cells: &[],
        evaluate: Some(securities::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: math::NAMES,
        reference_cells: math::REFERENCE_CELLS,
        evaluate: Some(math::evaluate),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: matrices::NAMES,
        reference_cells: &[],
        evaluate: None,
        evaluate_ast: Some(matrices::evaluate_ast),
        array: Some(ArrayHooks {
            produces_array: matrices::produces_array,
            shape: matrices::shape,
            bound: matrices::bound,
            evaluate: matrices::evaluate_matrix,
        }),
    },
    Family {
        names: regression::NAMES,
        reference_cells: &[],
        evaluate: Some(regression::evaluate),
        evaluate_ast: None,
        array: Some(ArrayHooks {
            produces_array: regression::produces_array,
            shape: regression::shape,
            bound: regression::bound,
            evaluate: regression::evaluate_array,
        }),
    },
    Family {
        names: text::NAMES,
        reference_cells: &[],
        evaluate: None,
        evaluate_ast: Some(text::evaluate_ast),
        array: Some(ArrayHooks {
            produces_array: text::produces_array,
            shape: text::shape,
            bound: text::bound,
            evaluate: text::evaluate_matrix,
        }),
    },
    Family {
        names: reshape::NAMES,
        reference_cells: &[],
        evaluate: None,
        evaluate_ast: None,
        array: Some(ArrayHooks {
            produces_array: reshape::produces_array,
            shape: reshape::shape,
            bound: reshape::bound,
            evaluate: reshape::evaluate,
        }),
    },
    Family {
        names: pivot_data::NAMES,
        reference_cells: &[],
        evaluate: None,
        evaluate_ast: Some(pivot_data::evaluate_ast),
        array: None,
    },
    Family {
        names: lambda::NAMES,
        reference_cells: &[],
        evaluate: None,
        evaluate_ast: Some(lambda::evaluate),
        array: Some(ArrayHooks {
            produces_array: lambda::produces_array,
            shape: lambda::shape,
            bound: lambda::bound,
            evaluate: lambda::evaluate_matrix,
        }),
    },
];

const FAMILY_SHIFT: u32 = 8;
const NAME_MASK: u16 = 0xff;

const _: () = {
    assert!(FAMILIES.len() <= 256);
    let mut family = 0;
    while family < FAMILIES.len() {
        assert!(FAMILIES[family].names.len() <= 256);
        family += 1;
    }
};

// Keep named IDs tied to the registry when families or names move.
const fn known_id(input: &str) -> u16 {
    let mut family = 0;

    while family < FAMILIES.len() {
        let mut index = 0;

        while index < FAMILIES[family].names.len() {
            let candidate = FAMILIES[family].names[index].as_bytes();
            let requested = input.as_bytes();
            let mut byte = 0;

            while byte < candidate.len()
                && byte < requested.len()
                && candidate[byte] == requested[byte]
            {
                byte += 1;
            }

            if byte == candidate.len() && byte == requested.len() {
                return ((family as u16) << FAMILY_SHIFT) | index as u16;
            }

            index += 1;
        }

        family += 1;
    }

    panic!("analysis name is not registered");
}

pub(crate) const AGGREGATE_ID: u16 = known_id("AGGREGATE");
pub(crate) const LAMBDA_ID: u16 = known_id("LAMBDA");
/// `GETPIVOTDATA` reads pivot output through no reference; a pivot update
/// recalculates it (see `CellStore::settle_pivots`).
pub(crate) const GETPIVOTDATA_ID: u16 = known_id("GETPIVOTDATA");
pub(crate) const PERCENTILE_EXC_ID: u16 = known_id("PERCENTILE.EXC");
pub(crate) const QUARTILE_EXC_ID: u16 = known_id("QUARTILE.EXC");

pub(crate) fn name(id: u16) -> &'static str {
    FAMILIES[usize::from(id >> FAMILY_SHIFT)].names[usize::from(id & NAME_MASK)]
}

pub(crate) fn lookup(input: &str) -> Option<u16> {
    // Compare bytes without allocating an uppercase copy of the input.
    FAMILIES
        .iter()
        .enumerate()
        .find_map(|(family_index, family)| {
            family
                .names
                .binary_search_by(|name| {
                    name.bytes()
                        .cmp(input.bytes().map(|byte| byte.to_ascii_uppercase()))
                })
                .ok()
                .map(|index| ((family_index as u16) << FAMILY_SHIFT) | index as u16)
        })
}

pub(crate) fn names() -> impl Iterator<Item = &'static str> {
    FAMILIES
        .iter()
        .flat_map(|family| family.names.iter().copied())
}

pub(super) fn family(name: &str) -> Option<&'static Family> {
    FAMILIES
        .iter()
        .find(|family| family.names.binary_search(&name).is_ok())
}

pub(super) fn evaluate_scalar(name: &str, values: &FuncAccumulator) -> EvalResult {
    family(name)
        .and_then(|family| family.evaluate)
        .map_or(Value::Error(FormulaError::Name), |evaluate| {
            evaluate(name, values)
        })
}

pub(super) fn treats_cell_as_reference(name: &str) -> bool {
    family(name).is_some_and(|family| family.reference_cells.contains(&name))
}

/// Whether the function reads every sheet of a 3-D reference.
pub(crate) fn accepts_sheet_span(id: u16) -> bool {
    compatibility::SHEET_SPAN_READERS.contains(&name(id))
}

/// Whether the function reads a union as one list of values.
pub(crate) fn accepts_union(id: u16) -> bool {
    compatibility::UNION_READERS.contains(&name(id))
}

/// Returns the positions `0..count` in stable sorted order.
///
/// Family position sorts use one shared implementation. The comparison is a
/// trait object, so the binary holds one copy of the stable sort. Plain f64
/// sorts can reuse the default engine's smaller unstable sort instead.
pub(super) fn sorted_positions(
    count: usize,
    compare: &mut dyn FnMut(usize, usize) -> std::cmp::Ordering,
) -> Vec<usize> {
    let mut positions: Vec<usize> = (0..count).collect();
    positions.sort_by(|&left, &right| compare(left, right));
    positions
}
