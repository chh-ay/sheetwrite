//! Which formulas a pass recalculates: scoped clears, bulk writes, the
//! dependency index and volatile functions.

use super::*;

#[test]
fn scoped_clear_preserves_unrelated_calculated_values_and_recomputes_readers() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 3);
    store.set_number(sheet, 0, 0, 5.0, 7);
    store.set_formula(sheet, 0, 1, "=A1+1", 9);
    store.set_formula(sheet, 0, 2, "=\"survivor\"", 0);
    store.set_formula(sheet, 1, 2, "=SEQUENCE(2,1,10)", 0);
    store.recompute(sheet);

    assert!(store.clear_range(sheet, 0, 0, 0, 0, false, true));
    assert_close(number(&store, sheet, 0, 1), 6.0);
    assert_eq!(store.get_cell(sheet, 0, 0).style(), 0);
    assert!(store.clear_range(sheet, 0, 0, 0, 0, true, false));
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("survivor"));
    assert_close(number(&store, sheet, 2, 2), 11.0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 1.0);

    assert!(store.clear_range(sheet, 1, 2, 1, 2, true, false));
    store.recompute(sheet);
    assert_eq!(store.get_cell(sheet, 2, 2).kind(), KIND_EMPTY);
}

#[test]
fn many_scalar_writes_before_a_bulk_write_recompute_every_reader() {
    // More written cells than registered formulas and read keys make the
    // pass scan the registered sources instead of walking each small
    // dirty rectangle cell by cell.
    const WRITTEN_ROWS: usize = 300;
    const ROW_STEP: usize = 3;
    const BULK_ROWS: usize = 50;
    const SCALAR_COL: usize = 2;
    const BULK_COL: usize = 0;
    const FORMULA_COL: usize = 4;
    const INITIAL_VALUE: f64 = 1.0;
    const WRITTEN_VALUE: f64 = 4.0;
    const BULK_VALUE: f64 = 3.0;

    let mut store = CellStore::new();
    let sheet = store.add_sheet(8, WRITTEN_ROWS * ROW_STEP + 1);
    let other = store.add_sheet(2, 2);
    store.set_sheet_name(sheet, "source", "Source");
    for index in 0..WRITTEN_ROWS {
        store.set_number(sheet, index * ROW_STEP, SCALAR_COL, INITIAL_VALUE, 0);
    }
    store.set_formula(sheet, 0, FORMULA_COL, "=C4*2", 0);
    store.set_formula(sheet, 1, FORMULA_COL, "=SUM(C1:C900)", 0);
    store.set_formula(sheet, 2, FORMULA_COL, "=SUM(A1:A50)", 0);
    store.set_formula(other, 0, 0, "=Source!C7+1", 0);
    store.commit_sources();
    assert_close(number(&store, sheet, 0, FORMULA_COL), INITIAL_VALUE * 2.0);

    // Reverse order keeps the dirty cells from arriving as one sorted run.
    for index in (0..WRITTEN_ROWS).rev() {
        store.set_number(sheet, index * ROW_STEP, SCALAR_COL, WRITTEN_VALUE, 0);
    }

    // A formula set by a single-cell write in the formula column is a dirty reader too.
    store.set_formula(sheet, 3, FORMULA_COL, "=C10+1", 0);
    crate::tests::write_number_column(&mut store, sheet, BULK_COL, 0, &[BULK_VALUE; BULK_ROWS]);
    store.commit_sources();

    assert_close(number(&store, sheet, 0, FORMULA_COL), WRITTEN_VALUE * 2.0);
    assert_close(
        number(&store, sheet, 1, FORMULA_COL),
        WRITTEN_VALUE * WRITTEN_ROWS as f64,
    );
    assert_close(
        number(&store, sheet, 2, FORMULA_COL),
        BULK_VALUE * BULK_ROWS as f64,
    );
    assert_close(number(&store, sheet, 3, FORMULA_COL), WRITTEN_VALUE + 1.0);
    assert_close(number(&store, other, 0, 0), WRITTEN_VALUE + 1.0);
}

mod formula_dependency_epoch {
    use super::*;

    #[test]
    fn constant_only_formula_rewrite_keeps_the_dependency_index() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 4);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_number(sheet, 0, 1, 10.0, 0);
        store.set_formula(sheet, 0, 2, "=A1+B1+1", 0);
        store.set_formula(sheet, 1, 2, "=C1*2", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 12.0);
        assert_close(number(&store, sheet, 1, 2), 24.0);

        let epoch_before = store.graph.epoch();
        assert_eq!(
            store.set_sparse_block(
                sheet,
                0,
                2,
                1,
                1,
                &[0],
                &[KIND_EMPTY],
                &[0.0],
                &[],
                &[0],
                &[0],
                &[0],
                vec!["=A1+B1+2".into()],
                &[],
                &[],
            ),
            0,
        );
        assert_eq!(
            store.graph.epoch(),
            epoch_before,
            "a constant-only rewrite must keep the cached dependency index"
        );
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 13.0);
        assert_close(number(&store, sheet, 1, 2), 26.0);

        // The cached index still routes read-cell edits to the rewritten cell
        // and onward to its dependents.
        store.set_number(sheet, 0, 0, 5.0, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 17.0);
        assert_close(number(&store, sheet, 1, 2), 34.0);
    }
}

#[test]
fn dirty_formula_work_survives_replacement_before_the_pass() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 4);
    store.set_number(sheet, 0, 0, 2.0, 0);
    store.set_formula(sheet, 0, 1, "=A1+1", 0);
    store.set_formula(sheet, 0, 2, "=B1*10", 0);
    store.commit_sources();

    // A replaced formula's dependency reads must leave the index before
    // another formula reuses its slot.
    store.set_number(sheet, 0, 1, 7.0, 0);
    store.set_formula(sheet, 1, 1, "=A1+100", 0);
    store.set_formula(sheet, 0, 1, "=A1+5", 0);
    store.set_number(sheet, 0, 0, 3.0, 0);
    store.commit_sources();
    assert_eq!(number(&store, sheet, 0, 1), 8.0);
    assert_eq!(number(&store, sheet, 0, 2), 80.0);
    assert_eq!(number(&store, sheet, 1, 1), 103.0);

    store.set_number(sheet, 0, 0, 4.0, 0);
    store.commit_sources();
    assert_eq!(number(&store, sheet, 0, 2), 90.0);
    assert_eq!(number(&store, sheet, 1, 1), 104.0);
}

/// Volatile formulas, such as RAND, RANDBETWEEN, NOW and TODAY, recalculate
/// with their dependents at every edit barrier, as in Excel; every other
/// formula recalculates only when something it reads changed.
mod volatile_recalculation {
    use super::*;

    #[test]
    fn moved_volatile_formulas_keep_recalculating_at_their_new_cells() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 2);
        store.set_formula(sheet, 0, 0, "=RAND()", 0);
        store.commit_sources();

        store.insert_cols(sheet, 0, 1);
        store.commit_sources();
        let moved_draw = number(&store, sheet, 0, 1);
        store.set_number(sheet, 1, 3, 1.0, 0);
        store.commit_sources();

        assert_ne!(number(&store, sheet, 0, 1), moved_draw);
        assert_eq!(store.get_cell(sheet, 0, 0).kind(), KIND_EMPTY);
    }

    #[test]
    fn rand_and_randbetween_draw_inside_their_bounds_and_reject_invalid_ones() {
        const DRAWS: usize = 200;
        const EDIT_COL: usize = 12;
        let mut store = CellStore::new();
        let sheet = store.add_sheet(13, 1);
        let errors = [
            (3, "=RANDBETWEEN(-3.5,-3.2)", "#NUM!"),
            (4, "=RANDBETWEEN(5,1)", "#NUM!"),
            (5, "=RANDBETWEEN(\"a\",2)", "#VALUE!"),
            (6, "=RANDBETWEEN(1)", "#VALUE!"),
            (7, "=RAND(1)", "#VALUE!"),
            (8, "=RANDBETWEEN(1/0,2)", "#DIV/0!"),
            (9, "=RANDBETWEEN(1,NA())", "#N/A"),
            (11, "=RANDBETWEEN(\"\",5)", "#VALUE!"),
        ];
        store.set_formula(sheet, 0, 0, "=RAND()", 0);
        store.set_formula(sheet, 0, 1, "=RANDBETWEEN(1,6)", 0);
        store.set_formula(sheet, 0, 2, "=RANDBETWEEN(2.2,3)", 0);
        for (col, formula, _) in errors {
            store.set_formula(sheet, 0, col, formula, 0);
        }

        let mut faces = [false; 6];
        for draw in 0..DRAWS {
            store.set_number(sheet, 0, EDIT_COL, draw as f64, 0);
            store.commit_sources();

            let unit = number(&store, sheet, 0, 0);
            assert!((0.0..1.0).contains(&unit), "RAND() = {unit}");
            let face = number(&store, sheet, 0, 1);
            assert!(face.fract() == 0.0 && (1.0..=6.0).contains(&face), "{face}");
            faces[face as usize - 1] = true;
            assert_close(number(&store, sheet, 0, 2), 3.0);
        }

        assert_eq!(faces, [true; 6]);
        for (col, formula, expected) in errors {
            assert_eq!(
                string(&store, sheet, 0, col).as_deref(),
                Some(expected),
                "{formula}"
            );
        }
    }
}
