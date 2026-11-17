//! Cell storage invariants: sheet limits, NaN boxing, string collection and
//! bounds checks on the public interface.

use super::*;

fn put_number(sheet: &mut SheetData, row: usize, col: usize, value: f64) {
    assert!(
        sheet.write_cell(row, col, KIND_NUMBER, encode_num(value), 0, None),
        "the number is written"
    );
}

#[test]
fn sheet_noops_dense_limits_and_paged_load_state_preserve_invariants() {
    assert_eq!(
        checked_dense_cell_count(1, MAX_DENSE_CELLS),
        Some(MAX_DENSE_CELLS)
    );
    assert_eq!(checked_dense_cell_count(1, MAX_DENSE_CELLS + 1), None);
    assert_eq!(checked_dense_cell_count(usize::MAX, 2), None);
    assert!(
        SheetData::try_new(usize::MAX, 2).is_err(),
        "a dense sheet past the cap is refused; the store places it in local pages"
    );
    let at_limit = SheetData::try_new(1, MAX_DENSE_CELLS).expect("limit must be accepted");
    assert_eq!(
        at_limit.cells.source_kind_at(MAX_DENSE_CELLS - 1),
        KIND_EMPTY
    );
    drop(at_limit);

    let mut bounded_store = CellStore::new();
    assert!(bounded_store
        .try_add_sheet(1, crate::cells::MAX_LOCAL_PAGED_CELLS + 1)
        .is_err());
    assert!(bounded_store.sheets.is_empty());
    let mut dense = SheetData::new(2, 2);
    put_number(&mut dense, 1, 1, 9.0);
    let mut slots = crate::formula_slots::FormulaStore::default();
    let names = bounded_store.name_scope(0);
    assert!(dense.insert_rows(names, 1, 0, &mut slots).is_ok());
    assert!(dense.delete_rows(names, 2, 1, &mut slots).is_ok());
    assert!(dense.delete_rows(names, 0, 0, &mut slots).is_ok());
    assert!(dense.insert_cols(names, 1, 0, &mut slots).is_ok());
    assert!(dense.delete_cols(names, 2, 1, &mut slots).is_ok());
    assert!(dense.delete_cols(names, 0, 0, &mut slots).is_ok());
    assert_close(dense.cells.num_at(dense.cells.idx(1, 1)), 9.0);

    dense.formulas.clear_dirty();
    dense
        .formulas
        .mark_cells_dirty((0..5_000).map(|row| (row, 0)));
    dense.formulas.clear_dirty();
    assert!(!dense.formulas.has_dirty());

    let mut paged = SheetData::new_paged(2, 2, 1, 0, DEFAULT_MAX_PAGED_DIRTY_CELLS).unwrap();
    assert!(!paged.cells.is_fully_loaded());
    assert!(!paged.cells.range_fully_loaded(0, 0, 1, 1));
    for col in 0..2 {
        for row in 0..2 {
            assert!(paged.write_cell(row, col, KIND_EMPTY, 0, 0, Some(1)));
        }
    }
    assert!(paged.cells.is_fully_loaded());
    assert!(paged.cells.range_fully_loaded(0, 0, 1, 1));
    assert!(paged.cells.is_cell_dirty(1, 1));
    paged.cells.mark_range_clean(0, 2, 0, 2);
    assert!(!paged.cells.is_cell_dirty(1, 1));
    assert_eq!(paged.cells.paged_stats().map(|stats| stats.1), Some(4));
}

#[test]
fn public_api_bounds_checks_do_not_panic() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 2);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let snapshot = store.capture_range(sheet, 0, 0, 1, 1).unwrap();
        store.set_number(99, 0, 0, 1.0, 0);
        store.set_number(sheet, 9, 0, 1.0, 0);
        store.set_number(sheet, usize::MAX, 0, 1.0, 0);
        store.set_bool(sheet, usize::MAX, 0, true, 0);
        store.set_string(sheet, 0, 9, "x", 0);
        store.clear_cell(sheet, 9, 9, 0);
        store.set_formula(sheet, 9, 0, "=A1", 0);
        store.add_rows(99, 0, 1);
        store.remove_rows(99, 0, 1);

        assert_eq!(store.get_cell(99, 0, 0).kind(), KIND_EMPTY);
        store.insert_cols(99, 0, 1);
        store.remove_cols(99, 0, 1);
        store.set_sheet_name(99, "missing", "Missing");
        store.mark_range_clean(99, 0, 1, 0, 1);
        store.set_bool(99, 0, 0, true, 0);
        store.set_conditional_rules(99, &[], &[], &[], Vec::new(), &[]);
        store.commit_sources();

        assert!(!store.is_paged(99));
        assert_eq!(store.paged_stats(99), vec![0.0; 6]);
        assert_eq!(store.paged_stats(sheet), vec![0.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
        assert_eq!(store.cell_state(99, 0, 0), 0);
        assert_eq!(store.cell_state(sheet, 9, 9), 0);
        assert!(!store.is_fully_loaded(99));
        assert!(store.is_fully_loaded(sheet));
        assert!(!store.range_fully_loaded(99, 0, 0, 0, 0));
        assert_eq!(store.row_count(99), 0);
        assert_eq!(store.col_count(99), 0);
        assert_ne!(
            store.set_block_packed(
                99,
                0,
                0,
                1,
                1,
                &[KIND_EMPTY],
                &[0.0],
                &[],
                &[0],
                &[0],
                &[],
                Vec::new(),
                &[],
                &[],
            ),
            0
        );
        assert!(!store.clear_range(99, 0, 0, 0, 0, true, true));
        assert!(store.range_style_ids(99, 0, 0, 0, 0).is_empty());
        assert!(!store.remap_range_styles(99, 0, 0, 0, 0, &[], &[]));
        assert!(store.capture_range(99, 0, 0, 1, 1).is_none());
        assert!(!store.restore_range(99, 0, 0, &snapshot));
        assert!(!store.rename_sheet(99, "missing", "Missing"));
        assert!(!store.remove_sheet(99));
        assert!(!store.set_named_range("", -1, sheet, 0, 0, 0, 0));
        assert!(!store.remove_named_range("missing", -1));
        assert!(!store.recompute_volatile(f64::NAN));
        assert!(store.set_formula(99, 0, 0, "=1", 0).is_nan());
        assert_eq!(store.formula_source(99, 0, 0), None);
        assert_eq!(
            store.pool_strings(&[NO_STRING, u32::MAX]),
            vec![String::new(), String::new()]
        );
        assert_eq!(store.get_cell(sheet, 9, 0).kind(), KIND_EMPTY);
        assert_eq!(store.aggregate(99, 0, 0), 0.0);
        assert_eq!(store.aggregate(sheet, 9, 0), 0.0);
        assert!(store.sort_rows(99, 0, true).is_empty());
        assert!(store.sort_rows(sheet, 9, true).is_empty());
        assert!(store.filter_rows(99, 0, "x").is_empty());
        assert!(store.filter_rows(sheet, 9, "x").is_empty());
        assert!(store.search(99, &[0], "x", true, false, false).is_empty());
        assert_eq!(store.get_window(99, 0, 1, &[0]).n_rows(), 0);
    }));

    assert!(result.is_ok());
}

#[test]
fn nan_box_canonicalizes_hostile_string_tag_patterns() {
    let hostile = [
        0xFFFC_0000_0000_0000,
        0xFFFC_0000_0000_0001,
        0xFFFC_0000_FFFF_FFFE,
        0xFFFC_FFFF_1234_5678,
    ];
    let mut sheet = SheetData::new(1, hostile.len());
    for (row, bits) in hostile.into_iter().enumerate() {
        let value = f64::from_bits(bits);
        assert!(value.is_nan());
        put_number(&mut sheet, row, 0, value);
        let index = sheet.cells.idx(row, 0);
        let payload = sheet.cells.source_payload_at(index);
        assert_eq!(payload, encode_num(f64::NAN));
        assert!(!payload_is_str(payload));
        assert_eq!(sheet.cells.str_id_at(index), NO_STRING);
        assert!(sheet.cells.num_at(index).is_nan());
    }
}

#[test]
fn string_collection_bounds_committed_overwrites_and_preserves_derived_text() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 3);
    store.set_string(sheet, 0, 0, "literal survivor", 0);
    store.set_formula(sheet, 0, 1, "=\"formula survivor\"", 0);
    store.set_formula(sheet, 1, 1, "={\"spill anchor\";\"spill child\"}", 0);
    store.recompute(sheet);
    let snapshot = store.capture_range(sheet, 0, 0, 3, 3).unwrap();
    store.begin_mutation();
    for edit in 0..4_000 {
        store.set_string(
            sheet,
            2,
            0,
            &format!("uncommitted-{edit}-{}", "x".repeat(128)),
            0,
        );
    }
    store.compact_string_storage();
    assert_eq!(store.string_pool_epoch(), 0);
    store.commit_sources();
    assert!(store.string_pool_epoch() > 0);
    for cycle in 0..4 {
        for edit in 0..4_000 {
            store.begin_mutation();
            store.set_string(
                sheet,
                2,
                0,
                &format!("{cycle}-{edit}-{}", "x".repeat(128)),
                0,
            );
            store.commit_sources();
        }
        let memory = store.memory_stats();
        let utf8_bytes = memory[3 + crate::memory::STRING_POOL_UTF8 * 3];
        let span_bytes = memory[3 + crate::memory::STRING_POOL_SPANS * 3];
        assert!(utf8_bytes + span_bytes < 600_000.0);
        store.begin_mutation();
        store.clear_cell(sheet, 2, 0, 0);
        store.commit_sources();
    }
    assert!(store.string_pool_epoch() > 0);
    store.compact_string_storage();
    assert_eq!(
        string(&store, sheet, 0, 0).as_deref(),
        Some("literal survivor")
    );
    assert_eq!(
        string(&store, sheet, 0, 1).as_deref(),
        Some("formula survivor")
    );
    assert_eq!(string(&store, sheet, 1, 1).as_deref(), Some("spill anchor"));
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("spill child"));
    let redo = store.capture_range(sheet, 0, 0, 3, 3).unwrap();
    store.clear_range(sheet, 0, 0, 2, 2, true, true);
    store.compact_string_storage();
    assert!(store.restore_range(sheet, 0, 0, &snapshot));
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("spill child"));
    store.compact_string_storage();
    assert!(store.restore_range(sheet, 0, 0, &redo));
    store.recompute(sheet);
    assert_eq!(
        string(&store, sheet, 0, 1).as_deref(),
        Some("formula survivor")
    );
}
