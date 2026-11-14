//! Optional function families for the complete analysis engine.

/// Declares a family's functions once, in ASCII order of their names: the
/// `NAMES` the registry looks names up in, and the `Function` enum the
/// family's evaluators match. A name defaults to its variant's spelling; a
/// name with dots gives it after `=`. A function's registry index is its
/// position in both lists, so an id always names the same variant.
macro_rules! family_functions {
    ($($function:ident $(= $name:literal)?,)+) => {
        pub(crate) const NAMES: &[&str] = &[
            $(family_functions!(@name $function $(= $name)?)),+
        ];

        /// The functions of this family, in the order of [`NAMES`].
        #[allow(
            non_camel_case_types,
            clippy::upper_case_acronyms,
            reason = "variants spell the Excel names, with `_` for `.`"
        )]
        #[derive(Clone, Copy, PartialEq, Eq, Debug)]
        pub(crate) enum Function {
            $($function),+
        }

        impl Function {
            const ALL: &'static [Self] = &[$(Self::$function),+];

            /// The function a registry id of this family names. Every such
            /// id indexes this family's `NAMES`, so it indexes `ALL` too.
            pub(crate) fn of(id: u16) -> Self {
                Self::ALL[usize::from(id & super::NAME_MASK)]
            }

            /// The registered name: `NAMES` at this function's index.
            pub(crate) const fn name(self) -> &'static str {
                NAMES[self as usize]
            }
        }

        impl std::fmt::Display for Function {
            fn fmt(&self, out: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                out.write_str(self.name())
            }
        }
    };
    (@name $function:ident = $name:literal) => {
        $name
    };
    (@name $function:ident) => {
        stringify!($function)
    };
}

/// A scalar hook that passes `family`'s typed function to `evaluate`.
macro_rules! scalar_hook {
    ($family:ident::$evaluate:ident) => {
        |id, values| $family::$evaluate($family::Function::of(id), values)
    };
}

/// An AST hook that passes `family`'s typed function to `evaluate`. A family
/// whose hooks also take other input names that type (see
/// `lambda::Invocation`); it has an `of(id)` as `Function` does.
macro_rules! ast_hook {
    ($family:ident::$evaluate:ident) => {
        ast_hook!($family::$evaluate, $family::Function)
    };
    ($family:ident::$evaluate:ident, $input:ty) => {
        |store, id, args, sheet, pass, depth| {
            $family::$evaluate(store, <$input>::of(id), args, sheet, pass, depth)
        }
    };
}

/// The array hooks of `family`: its `produces_array`, `shape` and `bound`,
/// and `evaluate`, each given the typed function as `ast_hook!` gives it.
macro_rules! array_hooks {
    ($family:ident::$evaluate:ident) => {
        array_hooks!($family::$evaluate, $family::Function)
    };
    ($family:ident::$evaluate:ident, $input:ty) => {
        ArrayHooks {
            produces_array: |id, args, shapes| {
                $family::produces_array(<$input>::of(id), args, shapes)
            },
            shape: |store, id, args, sheet, pass| {
                $family::shape(store, <$input>::of(id), args, sheet, pass)
            },
            bound: |store, id, args, sheet, pass| {
                $family::bound(store, <$input>::of(id), args, sheet, pass)
            },
            evaluate: |store, id, args, sheet, pass, depth| {
                $family::$evaluate(store, <$input>::of(id), args, sheet, pass, depth)
            },
        }
    };
}

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

pub(super) type ScalarEvaluator = fn(u16, &FuncAccumulator) -> EvalResult;
pub(super) type AstEvaluator =
    fn(&CellStore, u16, &[Ast], usize, &mut EvalPass<'_>, usize) -> EvalResult;
pub(super) type MatrixEvaluator = fn(
    &CellStore,
    u16,
    &[Ast],
    usize,
    &mut EvalPass<'_>,
    usize,
) -> Result<EvalMatrix, FormulaError>;

/// Shape and bound hooks receive the pass that asks, so work they share with
/// the evaluation that follows, such as compiled regex programs, is done once.
pub(super) type ShapeEvaluator = fn(
    &CellStore,
    u16,
    &[Ast],
    usize,
    &mut EvalPass<'_>,
) -> Result<(usize, usize, usize), FormulaError>;
pub(super) type BoundEvaluator =
    fn(&CellStore, u16, &[Ast], usize, &mut EvalPass<'_>) -> Result<usize, FormulaError>;

/// Array hooks must use the same shape, byte and work limits as built-in arrays.
pub(super) struct ArrayHooks {
    pub(super) produces_array: for<'a> fn(u16, &[Ast], super::array::Shapes<'a>) -> bool,
    pub(super) shape: ShapeEvaluator,
    pub(super) bound: BoundEvaluator,
    pub(super) evaluate: MatrixEvaluator,
}

pub(super) struct Family {
    /// ASCII uppercase spellings in alphabetical order, including any aliases.
    pub(super) names: &'static [&'static str],
    /// Whether a function's single-cell arguments are references, like
    /// `SUM(A1)`: text and logical values in the cell are ignored instead of
    /// converted.
    pub(super) reference_cells: fn(u16) -> bool,
    pub(super) evaluate: Option<ScalarEvaluator>,
    /// Runs before accumulator coercion and retains the original arguments.
    pub(super) evaluate_ast: Option<AstEvaluator>,
    pub(super) array: Option<ArrayHooks>,
}

/// Whether no function of a family reads single-cell arguments as references.
const NO_REFERENCE_CELLS: fn(u16) -> bool = |_| false;

const FAMILIES: &[Family] = &[
    Family {
        names: groupby::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: None,
        evaluate_ast: Some(ast_hook!(groupby::evaluate_ast)),
        array: Some(array_hooks!(groupby::evaluate_matrix)),
    },
    Family {
        names: aggregate::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: None,
        evaluate_ast: Some(ast_hook!(aggregate::evaluate_ast)),
        array: None,
    },
    Family {
        names: database::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: None,
        evaluate_ast: Some(ast_hook!(database::evaluate_ast)),
        array: None,
    },
    Family {
        names: dates::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(dates::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: descriptive::NAMES,
        reference_cells: |id| descriptive::reads_cells_as_references(descriptive::Function::of(id)),
        evaluate: Some(scalar_hook!(descriptive::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: distributions::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(distributions::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: compatibility::NAMES,
        reference_cells: |id| {
            compatibility::reads_cells_as_references(compatibility::Function::of(id))
        },
        evaluate: Some(scalar_hook!(compatibility::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: discrete::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(discrete::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: hypothesis::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(hypothesis::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: engineering::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(engineering::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: complex::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(complex::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: bessel::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(bessel::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: units::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(units::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: bytes::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(bytes::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: finance::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(finance::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: depreciation::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(depreciation::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: securities::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(securities::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: math::NAMES,
        reference_cells: |id| math::reads_cells_as_references(math::Function::of(id)),
        evaluate: Some(scalar_hook!(math::evaluate)),
        evaluate_ast: None,
        array: None,
    },
    Family {
        names: matrices::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: None,
        evaluate_ast: Some(ast_hook!(matrices::evaluate_ast)),
        array: Some(array_hooks!(matrices::evaluate_matrix)),
    },
    Family {
        names: regression::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: Some(scalar_hook!(regression::evaluate)),
        evaluate_ast: None,
        array: Some(array_hooks!(regression::evaluate_array)),
    },
    Family {
        names: text::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: None,
        evaluate_ast: Some(ast_hook!(text::evaluate_ast)),
        array: Some(array_hooks!(text::evaluate_matrix)),
    },
    Family {
        names: reshape::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: None,
        evaluate_ast: None,
        array: Some(array_hooks!(reshape::evaluate)),
    },
    Family {
        names: pivot_data::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: None,
        evaluate_ast: Some(ast_hook!(pivot_data::evaluate_ast)),
        array: None,
    },
    Family {
        names: lambda::NAMES,
        reference_cells: NO_REFERENCE_CELLS,
        evaluate: None,
        evaluate_ast: Some(ast_hook!(lambda::evaluate, lambda::Invocation)),
        array: Some(array_hooks!(lambda::evaluate_matrix, lambda::Invocation)),
    },
];

const FAMILY_SHIFT: u32 = 8;
const NAME_MASK: u16 = 0xff;

const _: () = {
    assert!(
        FAMILIES.len() <= 256,
        "a family index fits in the 8 bits above FAMILY_SHIFT"
    );
    let mut family = 0;
    while family < FAMILIES.len() {
        assert!(
            FAMILIES[family].names.len() <= 256,
            "a name index fits in NAME_MASK"
        );
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
pub(crate) const SUMSQ_ID: u16 = known_id("SUMSQ");
pub(crate) const SUMX2MY2_ID: u16 = known_id("SUMX2MY2");
pub(crate) const SUMX2PY2_ID: u16 = known_id("SUMX2PY2");
pub(crate) const SUMXMY2_ID: u16 = known_id("SUMXMY2");
pub(crate) const LAMBDA_ID: u16 = known_id("LAMBDA");
/// `GETPIVOTDATA` is volatile: it reads pivot output through no reference.
pub(crate) const GETPIVOTDATA_ID: u16 = known_id("GETPIVOTDATA");
pub(crate) const PERCENTILE_EXC_ID: u16 = known_id("PERCENTILE.EXC");
pub(crate) const QUARTILE_EXC_ID: u16 = known_id("QUARTILE.EXC");
pub(crate) const REGEXEXTRACT_ID: u16 = known_id("REGEXEXTRACT");
pub(crate) const REGEXREPLACE_ID: u16 = known_id("REGEXREPLACE");
pub(crate) const REGEXTEST_ID: u16 = known_id("REGEXTEST");
const MODE_ID: u16 = known_id("MODE");
const STDEV_ID: u16 = known_id("STDEV");
const STDEVP_ID: u16 = known_id("STDEVP");
const VAR_ID: u16 = known_id("VAR");
const VARP_ID: u16 = known_id("VARP");

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

pub(super) fn family(id: u16) -> &'static Family {
    &FAMILIES[usize::from(id >> FAMILY_SHIFT)]
}

pub(super) fn evaluate_scalar(id: u16, values: &FuncAccumulator) -> EvalResult {
    family(id)
        .evaluate
        .map_or(Value::Error(FormulaError::Name), |evaluate| {
            evaluate(id, values)
        })
}

pub(super) fn treats_cell_as_reference(id: u16) -> bool {
    (family(id).reference_cells)(id)
}

/// Whether the function reads every sheet of a 3-D reference, as `STDEV.S`
/// does.
pub(crate) const fn accepts_sheet_span(id: u16) -> bool {
    matches!(id, STDEV_ID | STDEVP_ID | VAR_ID | VARP_ID)
}

/// Whether the function reads a union as one list of values, as `MODE.SNGL`
/// does.
pub(crate) const fn accepts_union(id: u16) -> bool {
    matches!(id, MODE_ID | STDEV_ID | STDEVP_ID | VAR_ID | VARP_ID)
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
