//! Malformed plan lanes must fail as definitions or limits, never as panics or partial plans.

#![allow(
    clippy::indexing_slicing,
    reason = "a fixture index past the end fails the test, which is what it should do"
)]

use super::*;
use crate::buffers::TextParts;
use crate::plan::ColumnType;

fn table(strings: &[&str]) -> TextParts {
    let mut text = Vec::new();
    let mut offsets = vec![0];

    for string in strings {
        text.extend_from_slice(string.as_bytes());
        offsets.push(u32::try_from(text.len()).unwrap());
    }

    (text, offsets)
}

fn decode(codes: &[u32], numbers: &[f64], strings: &[&str]) -> Result<Plan, Diagnostic> {
    let (text, offsets) = table(strings);

    decode_plan(
        PlanWire {
            codes,
            numbers,
            text: &text,
            offsets: &offsets,
        },
        &Limits::default(),
    )
}

const STRINGS: [&str; 4] = ["value", "Total", "right", "Value"];

/// One plan with every step kind, over `STRINGS` and the number lane `[2.5]`.
const EVERY_STEP: [u32; 49] = [
    7,
    STEP_FILTER,
    PREDICATE_NOT,
    PREDICATE_AND,
    2,
    PREDICATE_COMPARE,
    0,
    5,
    LITERAL_NUMBER,
    0,
    PREDICATE_CONTAINS,
    0,
    1,
    STEP_SELECT,
    1,
    0,
    STEP_RENAME,
    1,
    0,
    1,
    STEP_CHANGE_TYPE,
    0,
    3,
    2,
    STEP_JOIN,
    2,
    8,
    1,
    0,
    2,
    STEP_GROUP,
    1,
    0,
    2,
    1,
    1,
    1,
    NO_COLUMN,
    1,
    3,
    6,
    0,
    STEP_UNPIVOT,
    1,
    0,
    1,
    3,
    2,
    3,
];

#[test]
fn every_step_kind_decodes_from_typed_lanes() {
    let plan = decode(&EVERY_STEP, &[2.5], &STRINGS).unwrap();

    assert_eq!(plan.len(), 7);
    let Step::Filter {
        predicate: Predicate::Not { predicate },
    } = &plan[0]
    else {
        panic!("expected a negated filter");
    };
    let Predicate::And { predicates } = predicate.as_ref() else {
        panic!("expected a conjunction");
    };
    assert!(matches!(
        &predicates[0],
        Predicate::Compare {
            op: CompareOp::Gt,
            value: Literal::Number(number),
            ..
        } if *number == 2.5
    ));
    assert!(matches!(
        &plan[3],
        Step::ChangeType {
            column_type: ColumnType::Text,
            on_error: ErrorPolicy::Null,
            ..
        }
    ));
    assert!(matches!(
        &plan[4],
        Step::Join {
            join: JoinKind::RightAnti,
            ..
        }
    ));
    let Step::Group { aggregates, .. } = &plan[5] else {
        panic!("expected a group");
    };
    assert!(aggregates[0].column.is_none());
    assert!(matches!(aggregates[1].op, AggregateOp::Max));
    assert_eq!(aggregates[1].column.as_deref(), Some("value"));
}

#[test]
fn truncated_padded_or_unknown_codes_are_definition_failures() {
    let valid = [1, STEP_SELECT, 1, 0];

    assert!(decode(&valid, &[], &STRINGS).is_ok());

    for codes in [
        &valid[..3],
        &[1, STEP_SELECT, 1, 0, 0][..],
        &[1, 99][..],
        &[1, STEP_SELECT, 1, 9][..],
        &[1, STEP_SELECT, u32::MAX - 1, 0][..],
        &[1, STEP_CHANGE_TYPE, 0, 99, 1][..],
        &[1, STEP_JOIN, 2, 0, 0][..],
        &[1, STEP_FILTER, PREDICATE_COMPARE, 0, 7, LITERAL_NULL][..],
        &[1, STEP_FILTER, PREDICATE_COMPARE, 0, 1, LITERAL_NUMBER, 1][..],
    ] {
        assert_eq!(
            decode(codes, &[1.0], &STRINGS).unwrap_err().code,
            "definition",
            "{codes:?}"
        );
    }
}

#[test]
fn non_finite_literals_and_deep_predicates_are_rejected() {
    let compare = [1, STEP_FILTER, PREDICATE_COMPARE, 0, 1, LITERAL_NUMBER, 0];

    for number in [f64::INFINITY, f64::NEG_INFINITY, f64::NAN] {
        assert_eq!(
            decode(&compare, &[number], &STRINGS).unwrap_err().code,
            "definition"
        );
    }

    let mut deep = vec![1, STEP_FILTER];
    deep.extend(std::iter::repeat_n(PREDICATE_NOT, MAX_PREDICATE_DEPTH));
    deep.extend([PREDICATE_IS_NULL, 0]);

    assert_eq!(decode(&deep, &[], &STRINGS).unwrap_err().code, "limit");
}

#[test]
fn step_count_respects_the_execution_step_limit() {
    let (text, offsets) = table(&STRINGS);
    let limits = Limits {
        max_steps: 1,
        ..Limits::default()
    };
    let wire = PlanWire {
        codes: &[2, STEP_SELECT, 1, 0, STEP_SELECT, 1, 0],
        numbers: &[],
        text: &text,
        offsets: &offsets,
    };

    assert_eq!(decode_plan(wire, &limits).unwrap_err().code, "limit");
}
