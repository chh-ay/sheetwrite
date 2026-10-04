//! Optional function families for the complete analysis engine.

mod dates;
mod descriptive;
mod distributions;
mod finance;
mod text;

use std::collections::{HashMap, HashSet};

use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};

use super::functions::FuncAccumulator;
use super::matrix::EvalMatrix;

pub(super) type ScalarEvaluator = fn(&str, &FuncAccumulator) -> EvalResult;
pub(super) type AstEvaluator = fn(
    &CellStore,
    &str,
    &[Ast],
    usize,
    &HashSet<AbsCellKey>,
    &mut HashMap<AbsCellKey, EvalResult>,
    &mut HashSet<AbsCellKey>,
    usize,
) -> EvalResult;

pub(super) type MatrixEvaluator = fn(
    &CellStore,
    &str,
    &[Ast],
    usize,
    &HashSet<AbsCellKey>,
    &mut HashMap<AbsCellKey, EvalResult>,
    &mut HashSet<AbsCellKey>,
    usize,
) -> Result<EvalMatrix, FormulaError>;

pub(super) type ShapeEvaluator =
    fn(&CellStore, &str, &[Ast], usize) -> Result<(usize, usize, usize), FormulaError>;
pub(super) type BoundEvaluator =
    fn(&CellStore, &str, &[Ast], usize) -> Result<usize, FormulaError>;

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
        names: finance::NAMES,
        reference_cells: &[],
        evaluate: Some(finance::evaluate),
        evaluate_ast: None,
        array: None,
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
];

pub(crate) fn lookup(input: &str) -> Option<&'static str> {
    // Compare bytes without allocating an uppercase copy of the input.
    FAMILIES.iter().find_map(|family| {
        family.names.binary_search_by(|name| {
            name.bytes().cmp(input.bytes().map(|byte| byte.to_ascii_uppercase()))
        }).ok().map(|index| family.names[index])
    })
}

pub(crate) fn names() -> impl Iterator<Item = &'static str> {
    FAMILIES.iter().flat_map(|family| family.names.iter().copied())
}

pub(super) fn family(name: &str) -> Option<&'static Family> {
    FAMILIES.iter().find(|family| family.names.binary_search(&name).is_ok())
}

pub(super) fn evaluate_scalar(name: &str, values: &FuncAccumulator) -> EvalResult {
    family(name).and_then(|family| family.evaluate)
        .map_or(Value::Error(FormulaError::Name), |evaluate| evaluate(name, values))
}

pub(super) fn treats_cell_as_reference(name: &str) -> bool {
    family(name).is_some_and(|family| family.reference_cells.contains(&name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn family_tables_are_sorted_and_each_name_has_one_owner() {
        for family in FAMILIES {
            // `lookup` and `family` use binary search over each table.
            assert!(family.names.windows(2).all(|pair| pair[0] < pair[1]), "{:?}", family.names);
            assert!(family.evaluate.is_some() || family.evaluate_ast.is_some() || family.array.is_some());
        }
        for name in names() {
            let owner = family(name).expect("every name has a family");
            assert!(owner.reference_cells.iter().all(|cell| owner.names.contains(cell)));
            let owners = FAMILIES.iter().filter(|family| family.names.contains(&name)).count();
            assert_eq!(owners, 1, "{name}");
            assert!(family(name).is_some_and(|owner| owner.names.contains(&name)), "{name}");
        }
    }
}
