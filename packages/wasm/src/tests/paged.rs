//! Paged sheets: lazy chunks, eviction, pins, load state, formulas that
//! wait for pages, and parity with dense storage.

use super::*;

#[test]
fn paged_aggregate_counts_loaded_formula_before_first_recompute() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(1, 2, 1, 0, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.set_formula(sheet, 0, 0, "=7", 0);
    assert_close(store.aggregate(sheet, 0, 4), 1.0);
    assert_close(store.aggregate(sheet, 0, 0), 0.0);
    store.recompute(sheet);
    assert_close(store.aggregate(sheet, 0, 4), 1.0);
    assert_close(store.aggregate(sheet, 0, 0), 7.0);
}

#[test]
fn paged_text_collection_preserves_dirty_overlays_after_clean_eviction() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(1, 1_000_000, 4096, 110_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.begin_page_load();
    store.set_string(sheet, 0, 0, "clean old", 0);
    store.set_string(sheet, 4096, 0, "evicted", 0);
    store.commit_sources();
    store.set_string(sheet, 0, 0, "dirty survivor", 0);
    store.begin_page_load();
    store.set_string(sheet, 8192, 0, "clean survivor", 0);
    store.set_string(sheet, 12288, 0, "last survivor", 0);
    for edit in 0..4_000 {
        store.set_string(
            sheet,
            12288,
            0,
            &format!("hydration-{edit}-{}", "x".repeat(128)),
            0,
        );
    }
    store.set_string(sheet, 12288, 0, "last survivor", 0);
    store.commit_sources();
    assert_eq!(
        store.string_pool_epoch(),
        0,
        "page hydration must not collect"
    );
    store.compact_string_storage();
    assert_eq!(
        string(&store, sheet, 0, 0).as_deref(),
        Some("dirty survivor")
    );
    assert_eq!(
        string(&store, sheet, 8192, 0).as_deref(),
        Some("clean survivor")
    );
    assert_eq!(
        string(&store, sheet, 12288, 0).as_deref(),
        Some("last survivor")
    );
    assert_eq!(store.cell_state(sheet, 4096, 0), 0);
    store.mark_range_clean(sheet, 0, 1, 0, 1);
    store.compact_string_storage();
    assert_eq!(
        string(&store, sheet, 0, 0).as_deref(),
        Some("dirty survivor")
    );
}

#[test]
fn paged_sheet_allocates_lazily_and_evicts_only_clean_chunks() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(1, 1_000_000, 4096, 110_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    assert_eq!(store.paged_stats(sheet), vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    assert_eq!(store.cell_state(sheet, 0, 0), 0);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#LOADING!"));

    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 0, &[1.0]);
    crate::tests::write_number_column(&mut store, sheet, 0, 4096, &[2.0]);
    store.commit_sources();
    let loaded = store.paged_stats(sheet);
    assert_eq!(loaded[0], 2.0);
    assert_eq!(loaded[1], 2.0);
    assert_eq!(loaded[2], 0.0);

    // A local edit moves into the sparse overlay. Loading two more clean chunks
    // evicts the older clean chunk without affecting the local edit.
    store.set_number(sheet, 0, 0, 10.0, 0);
    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 8192, &[3.0]);
    crate::tests::write_number_column(&mut store, sheet, 0, 12288, &[4.0]);
    store.commit_sources();
    let evicted = store.paged_stats(sheet);
    assert_eq!(evicted[0], 2.0);
    assert_eq!(evicted[2], 1.0);
    assert_close(number(&store, sheet, 0, 0), 10.0);
    assert_eq!(store.cell_state(sheet, 4096, 0), 0);

    store.mark_range_clean(sheet, 0, 1, 0, 1);
    assert_eq!(store.paged_stats(sheet)[2], 0.0);
}

#[test]
fn viewport_and_mapped_read_pins_have_independent_lifetimes() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(1, 32, 4, 64, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.pin_viewport_bands(sheet, &[4, 5, 0, 1]);
    store.pin_read_window(sheet, 0, 1, &[8], &[0]);
    store.begin_page_load();
    for row in [4, 8] {
        crate::tests::write_number_column(&mut store, sheet, 0, row, &[row as f64 + 1.0]);
    }
    store.commit_sources();

    store.pin_read_window(sheet, 0, 0, &[], &[]);
    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 12, &[13.0]);
    store.commit_sources();
    assert_close(number(&store, sheet, 4, 0), 5.0);
    assert_eq!(store.cell_state(sheet, 8, 0), 0);

    store.pin_viewport_bands(sheet, &[]);
    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 16, &[17.0]);
    store.commit_sources();
    assert_eq!(store.cell_state(sheet, 4, 0), 0);
}

#[test]
fn columns_fully_loaded_tracks_disjoint_columns_holes_bounds_and_sparse_accounting() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(3, 8, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);

    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 0, &[1.0, 2.0, 3.0, 4.0]);
    crate::tests::write_number_column(&mut store, sheet, 2, 0, &[5.0, 6.0, 7.0, 8.0]);
    store.commit_sources();

    assert!(store.columns_fully_loaded(sheet, 0, 4, &[0]));
    assert!(store.columns_fully_loaded(sheet, 0, 4, &[2]));
    assert!(store.columns_fully_loaded(sheet, 0, 4, &[2, 0]));
    assert!(!store.columns_fully_loaded(sheet, 0, 4, &[1]));
    assert!(!store.columns_fully_loaded(sheet, 0, 4, &[0, 1, 2]));
    assert!(!store.columns_fully_loaded(sheet, 0, 5, &[0]));
    assert!(!store.columns_fully_loaded(sheet, 0, 9, &[0]));
    assert!(!store.columns_fully_loaded(sheet, 0, 4, &[3]));
    assert!(!store.columns_fully_loaded(usize::MAX, 0, 4, &[0]));
    assert!(store.columns_fully_loaded(sheet, 2, 2, &[0, 1, 2]));
    assert!(store.columns_fully_loaded(sheet, 0, 8, &[]));

    // Resident chunks, loaded cells, dirty cells and the fully-loaded flag.
    let stats = store.paged_stats(sheet);
    assert_eq!(
        [stats[0], stats[1], stats[2], stats[4]],
        [2.0, 8.0, 0.0, 0.0]
    );

    // Loading every remaining cell makes the sheet fully loaded.
    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 4, &[0.0; 4]);
    crate::tests::write_number_column(&mut store, sheet, 1, 0, &[0.0; 8]);
    crate::tests::write_number_column(&mut store, sheet, 2, 4, &[0.0; 4]);
    store.commit_sources();
    assert!(store.is_fully_loaded(sheet));
}

#[test]
fn scalar_index_only_waits_for_its_selected_paged_cell() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(3, 6000, 4096, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 0, &[17.0]);
    store.commit_sources();
    store.set_formula(sheet, 0, 1, "=INDEX(A1:A6000,1)", 0);
    store.set_formula(sheet, 0, 2, "=INDEX(A1:A6000,5001)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 17.0);
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("#LOADING!"));

    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 5000, &[41.0]);
    store.commit_sources();
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 17.0);
    assert_close(number(&store, sheet, 0, 2), 41.0);
}

#[test]
fn paged_formulas_propagate_loading_until_dependencies_arrive() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 6000, 4096, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.set_formula(sheet, 0, 1, "=A5001+1", 0);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("#LOADING!"));
    let loading_view = decode_window(store.get_window(sheet, 0, 1, &[1]));
    assert_eq!(loading_view.kinds, vec![KIND_STRING]);
    let loading_index = loading_view.string_index[0];
    assert_eq!(loading_view.strings[loading_index as usize], "#LOADING!");

    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 5000, &[41.0]);
    store.commit_sources();
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 42.0);
}

#[test]
fn formula_read_bands_follow_same_sheet_formula_chains_within_the_budget() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(8, 100, 16, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    let other = store.add_paged_sheet(2, 100, 16, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.set_sheet_name(sheet, "main", "Main");
    store.set_sheet_name(other, "other", "Other");
    // Column H reads C and D; the cross-sheet read is not reported.
    store.set_formula(sheet, 40, 7, "=C41*D41+Other!A1", 0);
    store.set_formula(sheet, 41, 7, "=C42*D42", 0);
    // D42 is a formula too, so the walk continues into E40:F42.
    store.set_formula(sheet, 41, 3, "=SUM(E40:F42)", 0);
    // A 100-cell read that does not fit the remaining budget is skipped.
    store.set_formula(sheet, 41, 6, "=SUM(A1:A100)", 0);

    assert_eq!(
        store.formula_read_bands(sheet, 40, 42, &[6, 7], 64),
        vec![40, 42, 2, 4, 39, 42, 4, 6],
    );
    assert_eq!(
        store.formula_read_bands(sheet, 40, 42, &[6, 7], 1_000),
        vec![0, 100, 0, 1, 40, 42, 2, 4, 39, 42, 4, 6],
    );
    assert!(store
        .formula_read_bands(sheet, 0, 40, &[6, 7], 1_000)
        .is_empty());
    assert!(store
        .formula_read_bands(usize::MAX, 40, 42, &[7], 1_000)
        .is_empty());
}

#[test]
fn host_source_hydration_obstructs_spills_without_erasing_the_source() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 4, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.begin_page_load();
    for row in 0..4 {
        store.clear_cell(sheet, row, 0, 0);
    }
    store.set_formula(sheet, 0, 0, "=SEQUENCE(3)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 1, 0), 2.0);

    assert_eq!(
        store.set_sparse_block(
            sheet,
            1,
            0,
            1,
            1,
            &[0],
            &[KIND_NUMBER],
            &[99.0],
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
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#SPILL!"));
    assert_close(number(&store, sheet, 1, 0), 99.0);
    assert_eq!(store.spill_anchor_row(sheet, 1, 0), u32::MAX);
    let sources = store.capture_range(sheet, 0, 0, 3, 1).unwrap();
    assert_eq!(sources.kinds(), vec![KIND_FORMULA, KIND_NUMBER, KIND_EMPTY]);

    store.set_number(sheet, 0, 0, 17.0, 0);
    store.set_formula(sheet, 0, 1, "=A1", 0);
    store.commit_sources();
    assert_close(number(&store, sheet, 0, 1), 17.0);
    assert_close(number(&store, sheet, 1, 0), 99.0);
}

#[test]
fn paged_spills_demand_unknown_output_destinations_and_child_anchor_inputs() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 8, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.set_formula(sheet, 0, 0, "=SEQUENCE(4)", 0);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#LOADING!"));
    assert_eq!(
        store.formula_read_bands(sheet, 0, 1, &[0], 8),
        vec![0, 4, 0, 1]
    );
    assert!(store.formula_read_bands(sheet, 0, 1, &[0], 3).is_empty());

    for row in 1..4 {
        store.clear_cell(sheet, row, 0, 0);
    }
    store.set_number(sheet, 7, 1, 4.0, 0);
    store.set_formula(sheet, 0, 0, "=SEQUENCE(B8)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 3, 0), 4.0);
    assert_eq!(
        store.formula_read_bands(sheet, 3, 4, &[0], 8),
        vec![0, 4, 0, 1, 7, 8, 1, 2],
    );
}

#[test]
fn persisted_cell_data_stays_sparse_at_one_billion_rows() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 1_000_000_000, 4096, 0, 16);
    let source = "=\"雪😀\"";
    store.set_formula(sheet, 999_999_999, 1, source, 7);

    let data = store.persisted_cell_data(sheet);
    assert_eq!(
        &data[..8],
        &[
            999_999_999.0,
            1.0,
            f64::from(KIND_FORMULA),
            0.0,
            7.0,
            -1.0,
            1.0,
            source.len() as f64,
        ]
    );
    assert_eq!(data.len(), 8 + source.len().div_ceil(4));
    let mut bytes = Vec::new();
    for word in &data[8..] {
        bytes.extend_from_slice(&(*word as u32).to_le_bytes());
    }
    bytes.truncate(source.len());
    assert_eq!(String::from_utf8(bytes).unwrap(), source);
}

#[test]
fn loaded_spans_match_per_row_loaded_probes() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(3, 8, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.begin_page_load();
    crate::tests::write_number_column(&mut store, sheet, 0, 0, &[1.0, 2.0, 3.0, 4.0]);
    crate::tests::write_number_column(&mut store, sheet, 1, 2, &[1.0, 2.0, 3.0, 4.0]);
    store.commit_sources();
    // A local edit is loaded but dirty; both states belong in a run.
    store.set_number(sheet, 7, 0, 9.0, 0);

    assert_eq!(store.loaded_spans(sheet, 0, 8, 0), vec![0, 4, 7, 8]);
    assert_eq!(store.loaded_spans(sheet, 0, 8, 1), vec![2, 6]);
    assert_eq!(store.loaded_spans(sheet, 0, 8, 2), Vec::<u32>::new());
    assert_eq!(store.loaded_spans(sheet, 3, 1, 0), Vec::<u32>::new());
    assert_eq!(store.loaded_spans(sheet, 0, 8, 9), Vec::<u32>::new());
    assert_eq!(store.loaded_spans(usize::MAX, 0, 8, 0), Vec::<u32>::new());
    // Rows past the sheet never join a run.
    assert_eq!(store.loaded_spans(sheet, 0, 20, 0), vec![0, 4, 7, 8]);

    let mut brute = CellStore::new();
    let brute_sheet = brute.add_paged_sheet(1, 64, 8, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    let mut state = 12_345u32;
    let mut loaded = Vec::with_capacity(64);
    for row in 0..64 {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let is_loaded = !state.is_multiple_of(3);
        loaded.push(is_loaded);
        if is_loaded {
            brute.set_number(brute_sheet, row, 0, row as f64, 0);
        }
    }
    for band_start in [0usize, 5, 17, 33] {
        for band_end in [band_start + 1, band_start + 9, 64] {
            let mut expected = Vec::new();
            let mut run: Option<usize> = None;
            for (row, &is_loaded) in loaded.iter().enumerate().take(band_end).skip(band_start) {
                if is_loaded {
                    run = run.or(Some(row));
                } else if let Some(start) = run.take() {
                    expected.push(start as u32);
                    expected.push(row as u32);
                }
            }
            if let Some(start) = run {
                expected.push(start as u32);
                expected.push(band_end as u32);
            }
            assert_eq!(
                brute.loaded_spans(brute_sheet, band_start, band_end, 0),
                expected,
                "band {band_start}..{band_end}"
            );
        }
    }
}

/// One column aggregate must give the same result on dense and paged
/// storage. Paged storage follows Excel: logical and blank formula results
/// are ignored, and spilled values count.
mod aggregate_storage_parity {
    use super::*;

    const ROWS: usize = 8;
    const COLS: usize = 2;
    const PAGE_ROWS: usize = 4;
    /// Large enough that no loaded page is evicted during a test.
    const PAGE_BYTE_BUDGET: usize = 1_000_000;
    const OPS: std::ops::RangeInclusive<u8> = 0..=4;

    /// The same column A on a dense and a paged sheet: a number literal and
    /// one formula, recomputed.
    fn dense_and_paged(formula: &str) -> [(CellStore, usize); 2] {
        let mut dense = CellStore::new();
        let dense_sheet = dense.add_sheet(COLS, ROWS);
        let mut paged = CellStore::new();
        let paged_sheet = paged.add_paged_sheet(
            COLS,
            ROWS,
            PAGE_ROWS,
            PAGE_BYTE_BUDGET,
            DEFAULT_MAX_PAGED_DIRTY_CELLS,
        );

        // Load every page as blank first: an unloaded paged cell reads as
        // #LOADING!, which would hide the spill.
        paged.begin_page_load();
        for col in 0..COLS {
            for row in 0..ROWS {
                paged.clear_cell(paged_sheet, row, col, 0);
            }
        }
        paged.commit_sources();

        for (store, sheet) in [(&mut dense, dense_sheet), (&mut paged, paged_sheet)] {
            store.set_number(sheet, 0, 0, 4.0, 0);
            store.set_formula(sheet, 1, 0, formula, 0);
            store.recompute(sheet);
        }
        [(dense, dense_sheet), (paged, paged_sheet)]
    }

    fn assert_dense_matches_paged(formula: &str, expected: [f64; 5]) {
        let [(dense, dense_sheet), (paged, paged_sheet)] = dense_and_paged(formula);
        for (op, expected) in OPS.zip(expected) {
            let dense_value = dense.aggregate(dense_sheet, 0, op);
            let paged_value = paged.aggregate(paged_sheet, 0, op);
            assert_eq!(
                dense_value.to_bits(),
                paged_value.to_bits(),
                "{formula} op {op}: dense {dense_value}, paged {paged_value}"
            );
            assert_close(dense_value, expected);
        }
    }

    #[test]
    fn a_formula_returning_a_blank_is_ignored() {
        assert_dense_matches_paged("=B1", [4.0, 4.0, 4.0, 4.0, 1.0]);
    }

    #[test]
    fn spilled_values_count() {
        assert_dense_matches_paged("=SEQUENCE(3)", [10.0, 2.5, 1.0, 4.0, 4.0]);
    }
}
