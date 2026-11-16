//! Iterative calculation of cycles.

use super::*;

/// Excel's default iterative calculation limits.
const EXCEL_MAX_ITERATIONS: u32 = 100;
const EXCEL_MAX_CHANGE: f64 = 0.001;

#[test]
fn iterative_calculation_converges_a_self_reference_and_off_restores_cycle_errors() {
    // A spill anywhere in the workbook sends the pass through the spill loop.
    for with_spill in [false, true] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 2);
        if with_spill {
            store.set_formula(sheet, 0, 2, "=SEQUENCE(2)", 0);
        }
        store.set_formula(sheet, 0, 0, "=A1/2+1", 0);
        store.recompute(sheet);
        assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#CYCLE!"));

        // x = x/2 + 1 settles at 2; sweeps stop at the first step of at most
        // the maximum change, which is also the remaining distance.
        assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, EXCEL_MAX_CHANGE));
        let settled = number(&store, sheet, 0, 0);
        assert!((settled - 2.0).abs() <= EXCEL_MAX_CHANGE, "got {settled}");

        assert!(store.set_iterative_calculation(false, EXCEL_MAX_ITERATIONS, EXCEL_MAX_CHANGE));
        assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#CYCLE!"));
    }
}

#[test]
fn iterative_calculation_matches_closed_forms_for_interest_and_newton_steps() {
    const PRINCIPAL: f64 = 1000.0;
    const RATE: f64 = 0.1;
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 2);
    store.set_number(sheet, 0, 0, PRINCIPAL, 0);
    store.set_number(sheet, 0, 1, RATE, 0);
    // Interest charged on a balance that includes it:
    // interest = rate * (principal + interest) = rate * principal / (1 - rate).
    store.set_formula(sheet, 0, 2, "=B1*D1", 0);
    store.set_formula(sheet, 0, 3, "=A1+C1", 0);
    // Newton's method for the square root of 2, stepping from its own value.
    store.set_formula(sheet, 1, 0, "=IF(A2=0,1,A2-(A2^2-2)/(2*A2))", 0);

    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, 1e-12));
    assert_close(number(&store, sheet, 0, 2), RATE * PRINCIPAL / (1.0 - RATE));
    assert_close(number(&store, sheet, 0, 3), PRINCIPAL / (1.0 - RATE));
    assert_close(number(&store, sheet, 1, 0), 2f64.sqrt());
}

#[test]
fn iterative_calculation_keeps_the_last_values_of_a_cycle_that_does_not_converge() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 1);
    store.set_number(sheet, 0, 1, 1.0, 0);
    store.set_formula(sheet, 0, 0, "=A1+B1", 0);

    // Excel's running total: every calculation runs all iterations from the
    // cell's own last value.
    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, EXCEL_MAX_CHANGE));
    assert_close(number(&store, sheet, 0, 0), 100.0);
    store.set_number(sheet, 0, 1, 2.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 0), 300.0);
}

#[test]
fn iterative_calculation_joins_runtime_readers_back_into_a_static_component() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 1);
    store.set_formula(sheet, 0, 0, "=A1/4+INDIRECT(\"B1\")/4+1", 0);
    store.set_formula(sheet, 0, 1, "=A1", 0);
    store.set_formula(sheet, 0, 2, "=B1*2", 0);

    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, 1e-12));
    assert_close(number(&store, sheet, 0, 0), 2.0);
    assert_close(number(&store, sheet, 0, 1), 2.0);
    assert_close(number(&store, sheet, 0, 2), 4.0);
}

#[test]
fn iterative_calculation_settles_inputs_before_installing_downstream_spills() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 2);
    store.set_formula(sheet, 0, 0, "=IF(A1<2,A1+1,A1)", 0);
    store.set_formula(sheet, 0, 1, "=SEQUENCE(A1)", 0);
    store.set_formula(sheet, 0, 2, "=SUM(B1:B2)", 0);

    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, EXCEL_MAX_CHANGE));
    assert_close(number(&store, sheet, 0, 0), 2.0);
    assert_close(number(&store, sheet, 0, 1), 1.0);
    assert_close(number(&store, sheet, 1, 1), 2.0);
    assert_close(number(&store, sheet, 0, 2), 3.0);
}

#[test]
fn iterative_calculation_sweeps_a_long_cycle_without_deep_recursion() {
    const MEMBERS: usize = 10_000;
    const MAX_CHANGE: f64 = 1e-6;
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, MEMBERS);
    store.set_formula(sheet, 0, 0, &format!("=A{MEMBERS}/2+1"), 0);
    for row in 1..MEMBERS {
        store.set_formula(sheet, row, 0, &format!("=A{row}"), 0);
    }

    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, MAX_CHANGE));
    for row in [0, MEMBERS - 1] {
        let settled = number(&store, sheet, row, 0);
        assert!((settled - 2.0).abs() <= MAX_CHANGE, "row {row}: {settled}");
    }
}

#[test]
fn iterative_calculation_rejects_limits_excel_does_not_accept() {
    let mut store = CellStore::new();
    for (iterations, change) in [
        (0, EXCEL_MAX_CHANGE),
        (32_768, EXCEL_MAX_CHANGE),
        (EXCEL_MAX_ITERATIONS, -0.5),
        (EXCEL_MAX_ITERATIONS, f64::NAN),
        (EXCEL_MAX_ITERATIONS, f64::INFINITY),
    ] {
        assert!(!store.set_iterative_calculation(true, iterations, change));
    }
    assert!(store.set_iterative_calculation(true, 32_767, 0.0));
}
