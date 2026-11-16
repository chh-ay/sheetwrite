//! Dynamic array spills: placement, obstruction, the spill owner budget,
//! spill references and spills sized from cells.

use super::*;

#[test]
fn dynamic_arrays_spill_resize_obstruct_persist_and_invalidate_dependents() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(9, 12);
    for (row, value) in [3.0, 1.0, 3.0, 2.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }
    for (row, value) in [true, false, true, true].into_iter().enumerate() {
        store.set_bool(sheet, row, 1, value, 0);
    }
    store.set_number(sheet, 2, 7, 99.0, 0);
    store.set_formula(sheet, 0, 3, "=FILTER(A1:A4,B1:B4)", 11);
    store.set_formula(sheet, 0, 4, "=SORT(A1:A4)", 12);
    store.set_formula(sheet, 0, 5, "=UNIQUE(A1:A4)", 13);
    store.set_formula(sheet, 0, 6, "=A1:A4", 14);
    store.set_formula(sheet, 0, 7, "=A1:A4", 15);
    store.set_formula(sheet, 7, 2, "=D3", 0);
    store.recompute(sheet);

    assert_eq!(
        [0, 1, 2].map(|row| number(&store, sheet, row, 3)),
        [3.0, 3.0, 2.0]
    );
    assert_eq!(
        [0, 1, 2, 3].map(|row| number(&store, sheet, row, 4)),
        [1.0, 2.0, 3.0, 3.0]
    );
    assert_eq!(
        [0, 1, 2].map(|row| number(&store, sheet, row, 5)),
        [3.0, 1.0, 2.0]
    );
    assert_eq!(
        [0, 1, 2, 3].map(|row| number(&store, sheet, row, 6)),
        [3.0, 1.0, 3.0, 2.0]
    );
    assert_eq!(store.formula_source(sheet, 1, 3), None);
    assert_eq!(store.spill_anchor_row(sheet, 2, 3), 0);
    assert_eq!(store.spill_anchor_col(sheet, 2, 3), 3);
    assert_eq!(string(&store, sheet, 0, 7).as_deref(), Some("#SPILL!"));
    assert_close(number(&store, sheet, 2, 7), 99.0);
    assert_close(number(&store, sheet, 7, 2), 2.0);

    store.set_bool(sheet, 3, 1, false, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 3), 3.0);
    assert_close(number(&store, sheet, 1, 3), 3.0);
    assert_eq!(store.get_cell(sheet, 2, 3).kind(), KIND_EMPTY);
    assert_close(number(&store, sheet, 7, 2), 0.0);

    store.clear_cell(sheet, 2, 7, 0);
    store.recompute(sheet);
    assert_eq!(
        [0, 1, 2, 3].map(|row| number(&store, sheet, row, 7)),
        [3.0, 1.0, 3.0, 2.0]
    );

    let snapshot = store
        .capture_range(sheet, 0, 3, 3, 1)
        .expect("spill history should capture");
    assert_eq!(snapshot.kinds(), vec![KIND_FORMULA, KIND_EMPTY, KIND_EMPTY]);
    assert_eq!(snapshot.formula_sources(), vec!["=FILTER(A1:A4,B1:B4)"]);
    assert!(store.clear_range(sheet, 0, 3, 2, 3, true, false));
    store.recompute(sheet);
    assert!(store.restore_range(sheet, 0, 3, &snapshot));
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 3), 3.0);
    assert_close(number(&store, sheet, 1, 3), 3.0);
    assert_eq!(store.get_cell(sheet, 2, 3).kind(), KIND_EMPTY);
}

#[test]
fn dynamic_array_errors_and_resource_caps_fail_closed() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 4);
    for row in 0..4 {
        store.set_number(sheet, row, 0, row as f64, 0);
        store.set_bool(sheet, row, 1, false, 0);
    }
    store.set_formula(sheet, 0, 2, "=FILTER(A1:A4,B1:B4)", 0);
    store.set_formula(sheet, 1, 2, "=FILTER(A1:A4,B1:B4,\"none\")", 0);
    store.set_formula(sheet, 2, 2, "=SORT(A1:A4,0)", 0);
    store.set_formula(sheet, 3, 2, "=UNIQUE(A1:A4,FALSE,TRUE)", 0);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("#CALC!"));
    assert_eq!(string(&store, sheet, 1, 2).as_deref(), Some("none"));
    assert_eq!(string(&store, sheet, 2, 2).as_deref(), Some("#VALUE!"));
    assert_eq!(string(&store, sheet, 3, 2).as_deref(), Some("#SPILL!"));

    let paged = store.add_paged_sheet(2, 1_000_001, 256, 1_000_000, 1_000_000);
    store.set_formula(paged, 0, 1, "=SORT(A1:A1000001)", 0);
    store.recompute(paged);
    assert_eq!(string(&store, paged, 0, 1).as_deref(), Some("#NUM!"));
}

#[test]
fn spill_ownership_budget_is_store_wide_atomic_and_released() {
    let mut store = CellStore::new();
    store.set_spill_owner_limit_for_test(5);
    let first = store.add_sheet(2, 3);
    let second = store.add_sheet(2, 3);
    for sheet in [first, second] {
        for row in 0..3 {
            store.set_number(sheet, row, 0, row as f64 + 1.0, 0);
        }
        store.set_formula(sheet, 0, 1, "=A1:A3", 0);
    }
    store.recompute(first);
    store.recompute(second);
    assert_eq!(string(&store, second, 0, 1).as_deref(), Some("#NUM!"));
    assert_eq!(store.get_cell(second, 1, 1).kind(), KIND_EMPTY);
    assert_eq!(store.spill_anchor_row(second, 1, 1), u32::MAX);

    store.clear_cell(first, 0, 1, 0);
    store.recompute(first);
    let mut stats = StoreMemoryStats::default();
    store.sheets[first].add_memory_stats(&mut stats);
    assert_eq!(stats.owners[SPILL_OWNERS].allocated_bytes, 0);
    store.set_number(second, 0, 0, 1.0, 0);
    store.recompute(second);
    assert_eq!(
        [0, 1, 2].map(|row| number(&store, second, row, 1)),
        [1.0, 2.0, 3.0]
    );
}

#[test]
fn rectangle_clear_releases_attempted_spill_without_disturbing_other_spills() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 6000);
    store.set_number(sheet, 4999, 0, 1.0, 0);
    store.set_formula(sheet, 0, 0, "=SEQUENCE(5000)", 0);
    store.set_formula(sheet, 0, 2, "=SEQUENCE(2,1,20)", 0);
    store.commit_sources();
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#SPILL!"));

    assert!(store.clear_range(sheet, 1, 0, 5000, 0, true, false));
    assert_close(number(&store, sheet, 1, 2), 21.0);
    store.commit_sources();
    assert_close(number(&store, sheet, 4999, 0), 5000.0);
    assert_close(number(&store, sheet, 1, 2), 21.0);
}

#[test]
fn every_indexed_array_producer_reinstalls_spills_after_dependency_edits() {
    let cases = [
        ("=A1:A3", 0, 9.0, 2, 0, 3.0),
        ("=$A$1:$A$3", 0, 9.0, 2, 0, 3.0),
        ("=Rows", 0, 9.0, 2, 0, 3.0),
        ("=FILTER(A1:A3,A1:A3)", 0, 9.0, 2, 0, 3.0),
        ("=SORT(A1:A3)", 0, 2.0, 2, 0, 9.0),
        ("=UNIQUE(A1:A3)", 0, 9.0, 2, 0, 3.0),
        ("=SEQUENCE(3,1,A1,1)", 0, 9.0, 2, 0, 11.0),
        ("=TRANSPOSE(A1:A3)", 0, 9.0, 0, 2, 3.0),
        ("=TAKE(A1:A3,2)", 0, 9.0, 1, 0, 2.0),
        ("=DROP(A1:A3,1)", 1, 20.0, 1, 0, 3.0),
        ("=CHOOSECOLS(A1:B3,1)", 0, 9.0, 2, 0, 3.0),
        ("=CHOOSEROWS(A1:A3,2,3)", 1, 20.0, 1, 0, 3.0),
        ("=LET(x,A1:A3,x)", 0, 9.0, 2, 0, 3.0),
        ("=CHOOSE(1,A1:A3,SEQUENCE(3))", 0, 9.0, 2, 0, 3.0),
        ("=LET(x,CHOOSE(1,A1:A3,SEQUENCE(3)),x)", 0, 9.0, 2, 0, 3.0),
    ];

    for (source, edit_row, anchor, probe_row, probe_col, probe) in cases {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 8);
        for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
            store.set_number(sheet, row, 0, value, 0);
            store.set_number(sheet, row, 1, value * 10.0, 0);
        }
        if source == "=Rows" {
            assert!(store.set_named_range("Rows", -1, sheet, 0, 0, 2, 0));
        }
        store.set_formula(sheet, 0, 4, "=0", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 4), 0.0);
        store.set_formula(sheet, 0, 4, source, 0);
        store.recompute(sheet);
        store.set_number(
            sheet,
            edit_row,
            0,
            if edit_row == 0 { 9.0 } else { 20.0 },
            0,
        );
        store.recompute(sheet);

        assert_close(number(&store, sheet, 0, 4), anchor);
        assert_close(number(&store, sheet, probe_row, 4 + probe_col), probe);
    }
}

mod spill_query_fixtures {
    use super::*;

    #[test]
    fn spill_multi_key_sort_reads_each_output_column_and_preserves_ties() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, 4);
        store.set_formula(sheet, 0, 0, "={2,4;1,7;2,3;1,7}", 0);
        store.recompute(sheet);

        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[1, 1], &[]),
            vec![1, 3, 2, 0]
        );
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[0, 1], &[]),
            vec![2, 0, 1, 3]
        );
    }

    #[test]
    fn spill_sort_at_radix_size_includes_anchor_and_child_only_columns() {
        const ROWS: usize = 4096;
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, ROWS);
        store.set_formula(sheet, 0, 0, "=SEQUENCE(4096,2,8192,-1)", 0);
        store.recompute(sheet);
        let ascending: Vec<u32> = (0..ROWS as u32).rev().collect();
        let descending: Vec<u32> = (0..ROWS as u32).collect();

        for col in [0, 1] {
            assert_eq!(store.sort_rows_multi(sheet, &[col], &[1], &[]), ascending);
            assert_eq!(store.sort_rows_multi(sheet, &[col], &[0], &[]), descending);
        }
    }
}

#[test]
fn spill_references_follow_the_current_spill_of_their_anchor() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(12, 12);
    store.set_number(sheet, 0, 9, 3.0, 0);
    store.set_formula(sheet, 0, 0, "=SEQUENCE(J1)", 0);
    store.set_formula(sheet, 0, 1, "=A1#", 0);
    store.set_formula(sheet, 0, 2, "=SUM(A1#)", 0);
    store.set_formula(sheet, 0, 3, "=ROWS(A1#)", 0);
    store.set_formula(sheet, 0, 4, "=INDEX(A1#,2)", 0);
    store.set_formula(sheet, 0, 5, "=COUNTIF(A1#,\">1\")", 0);
    store.set_formula(sheet, 0, 6, "=SUM(J1#)", 0);
    store.set_formula(sheet, 0, 7, "=J1#", 0);
    store.recompute(sheet);
    let column_b = |store: &CellStore| -> Vec<f64> {
        (0..6)
            .map(|row| store.get_cell(sheet, row, 1).num())
            .collect()
    };
    assert_eq!(column_b(&store), [1.0, 2.0, 3.0, 0.0, 0.0, 0.0]);
    let results = |store: &CellStore| -> Vec<f64> {
        (2..=5)
            .map(|col| store.get_cell(sheet, 0, col).num())
            .collect()
    };
    assert_eq!(results(&store), [6.0, 3.0, 2.0, 2.0]);
    // J1 holds a value, not a spill.
    assert_eq!(string(&store, sheet, 0, 6).as_deref(), Some("#REF!"));
    assert_eq!(string(&store, sheet, 0, 7).as_deref(), Some("#REF!"));

    store.set_number(sheet, 0, 9, 5.0, 0);
    store.recompute(sheet);
    assert_eq!(column_b(&store), [1.0, 2.0, 3.0, 4.0, 5.0, 0.0]);
    assert_eq!(results(&store), [15.0, 5.0, 2.0, 4.0]);
}

#[test]
fn spill_references_shift_with_their_anchor_and_break_when_it_is_deleted() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(6, 12);
    store.set_formula(sheet, 2, 0, "=SEQUENCE(2)", 0);
    store.set_formula(sheet, 0, 2, "=SUM(A3#)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 2), 3.0);

    store.remove_rows(sheet, 1, 1);
    store.recompute(sheet);
    assert_eq!(
        store.formula_source(sheet, 0, 2).as_deref(),
        Some("=SUM(A2#)")
    );
    assert_close(number(&store, sheet, 0, 2), 3.0);

    store.remove_rows(sheet, 1, 1);
    store.recompute(sheet);
    assert_eq!(
        store.formula_source(sheet, 0, 2).as_deref(),
        Some("=SUM(#REF!)")
    );
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("#REF!"));
}

#[test]
fn a_spill_that_reads_a_later_one_cell_spill_sees_it() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(10, 10);
    store.set_number(sheet, 0, 9, 1.0, 0);
    store.set_formula(sheet, 0, 1, "=SORT(A3#,1,-1)", 0);
    store.set_formula(sheet, 2, 0, "=SEQUENCE(J1)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 1.0);

    // Growing from one cell to two and shrinking back both reach the reader.
    store.set_number(sheet, 0, 9, 2.0, 0);
    store.recompute(sheet);
    assert_eq!(
        (number(&store, sheet, 0, 1), number(&store, sheet, 1, 1)),
        (2.0, 1.0)
    );
    store.set_number(sheet, 0, 9, 1.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 1.0);
    assert_eq!(store.get_cell(sheet, 1, 1).kind(), KIND_EMPTY);
}

/// Array formulas whose size comes from a cell all spill in one pass: each is
/// charged against the pass budget for what it produces, not for the largest
/// possible spill (#569).
#[test]
fn array_sizes_read_from_cells_spill_in_every_formula_of_a_pass() {
    let mut sources = vec![
        "=SEQUENCE($J$1)",
        "=SEQUENCE($J$1)*2",
        "=SEQUENCE($J$1,1,10)+0",
        "=CHOOSEROWS($I$1:$I$20,$J$1,1)",
        "=CHOOSECOLS($I$1:$I$3,$J$1/$J$1)",
        "=INDEX(SEQUENCE($J$1,2),0,1)",
    ];
    if cfg!(feature = "analysis") {
        sources.extend([
            "=MUNIT($J$1)",
            "=EXPAND($I$1:$I$2,$J$1)",
            "=MAKEARRAY($J$1,1,LAMBDA(r,c,r))",
            "=WRAPROWS($I$1:$I$6,$J$1)",
        ]);
    }

    for source in sources {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(10, 60);
        store.set_number(sheet, 0, 9, 3.0, 0);
        for row in 0..20 {
            store.set_number(sheet, row, 8, (row + 1) as f64, 0);
        }
        // Six copies stacked in column A, far enough apart to spill freely.
        for copy in 0..6 {
            store.set_formula(sheet, copy * 8, 0, source, 0);
        }
        store.recompute(sheet);

        for copy in 0..6 {
            let anchor = copy * 8;
            assert_eq!(
                string(&store, sheet, anchor, 0),
                None,
                "{source} copy {copy}"
            );
            assert_eq!(
                store.spill_anchor_row(sheet, anchor + 1, 0),
                anchor as u32,
                "{source} copy {copy}"
            );
        }
    }
}

/// The pass budget still stops a pass whose arrays really pass it: three
/// arrays of 900,000 cells sized from a cell, each obstructed so that none
/// installs, spend it with the third (#569).
#[test]
fn array_sizes_read_from_cells_still_spend_the_pass_budget() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 1_000_000);
    store.set_number(sheet, 0, 3, 900_000.0, 0);
    for col in 0..3 {
        store.set_formula(sheet, 0, col, "=SEQUENCE($D$1)", 0);
        store.set_number(sheet, 5, col, 1.0, 0);
    }
    store.recompute(sheet);

    let errors = (0..3)
        .map(|col| string(&store, sheet, 0, col))
        .collect::<Vec<_>>();
    assert_eq!(
        errors,
        ["#SPILL!", "#SPILL!", "#NUM!"].map(|error| Some(error.to_owned()))
    );
}
