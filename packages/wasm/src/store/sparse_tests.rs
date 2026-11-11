//! Sparse writes preserve scalar source replacement and paged admission rules.

use super::*;

#[test]
fn sparse_dense_columns_retire_covered_formulas_and_recompute_readers() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 3);
    store.set_number(sheet, 0, 0, 1.0, 0);
    store.set_formula(sheet, 0, 1, "=A1*2", 0);
    store.set_formula(sheet, 1, 1, "=B1+A2", 0);
    store.set_formula(sheet, 2, 2, "=SUM(A1:B3)", 0);
    store.commit_sources();
    assert_eq!(store.get_cell(sheet, 2, 2).num(), 5.0);

    // Entries arrive out of column order and skip cells; B1's formula is
    // replaced by text, A2 gains a number, and unlisted cells stay put.
    assert_eq!(
        store.set_sparse_block(
            sheet,
            0,
            0,
            2,
            2,
            &[2, 1, 0],
            &[KIND_NUMBER, KIND_STRING, KIND_NUMBER],
            &[10.0, 0.0, 5.0],
            "雪".as_bytes(),
            &[0, 3],
            &[4, 6, 5],
            &[],
            Vec::new(),
            &[],
            &[],
        ),
        BLOCK_OK
    );
    store.commit_sources();
    assert!(
        store.formula_source(sheet, 0, 1).is_none(),
        "a literal entry retires the covered formula"
    );
    assert_eq!(store.get_cell(sheet, 0, 1).string().as_deref(), Some("雪"));
    assert_eq!(store.get_cell(sheet, 0, 1).style(), 6);
    assert_eq!(store.get_cell(sheet, 1, 0).num(), 10.0);
    assert_eq!(
        store.get_cell(sheet, 1, 1).string().as_deref(),
        Some("#VALUE!")
    );
    assert_eq!(
        store.get_cell(sheet, 2, 2).string().as_deref(),
        Some("#VALUE!")
    );

    // A fully covered block also recomputes every reader of its rectangle.
    assert_eq!(
        store.set_sparse_block(
            sheet,
            0,
            0,
            2,
            2,
            &[3, 2, 1, 0],
            &[KIND_NUMBER; 4],
            &[4.0, 3.0, 2.0, 1.0],
            &[],
            &[0],
            &[0; 4],
            &[],
            Vec::new(),
            &[],
            &[],
        ),
        BLOCK_OK
    );
    store.commit_sources();
    assert!(
        store.formula_source(sheet, 1, 1).is_none(),
        "a full block retires every covered formula"
    );
    assert_eq!(store.get_cell(sheet, 2, 2).num(), 10.0);
}

#[test]
fn sparse_invalid_offsets_reject_the_entire_dense_write() {
    for offsets in [&[0, 64, 0][..], &[0, 64, 70][..]] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(7, 10);
        store.set_number(sheet, 0, 0, 7.0, 3);
        assert_eq!(
            store.set_sparse_block(
                sheet,
                0,
                0,
                10,
                7,
                offsets,
                &[KIND_NUMBER; 3],
                &[99.0; 3],
                &[],
                &[0],
                &[8; 3],
                &[],
                Vec::new(),
                &[],
                &[],
            ),
            BLOCK_INVALID
        );
        let retained = store.get_cell(sheet, 0, 0);
        assert_eq!(retained.num(), 7.0);
        assert_eq!(retained.style(), 3);
        assert_eq!(store.get_cell(sheet, 9, 1).kind(), KIND_EMPTY);
    }
}

#[test]
fn sparse_paged_preflight_rejects_without_overwriting_existing_edits() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(1, 3, 4, 1_000_000, 1);
    store.set_number(sheet, 0, 0, 7.0, 3);
    assert_eq!(
        store.set_sparse_block(
            sheet,
            0,
            0,
            3,
            1,
            &[0, 1],
            &[KIND_NUMBER; 2],
            &[99.0; 2],
            &[],
            &[0],
            &[8; 2],
            &[],
            Vec::new(),
            &[],
            &[],
        ),
        BLOCK_RESOURCE_LIMIT
    );
    assert_eq!(store.get_cell(sheet, 0, 0).num(), 7.0);
    assert_eq!(store.get_cell(sheet, 0, 0).style(), 3);
    assert_eq!(store.cell_state(sheet, 1, 0), 0);
    assert_eq!(store.paged_stats(sheet)[2], 1.0);
}

#[test]
fn sparse_page_load_skips_dirty_sources_and_keeps_mixed_entry_sources() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 4, 4, 1_000_000, 16);
    store.set_formula(sheet, 0, 0, "=17", 5);
    store.begin_page_load();
    assert_eq!(
        store.set_sparse_block(
            sheet,
            0,
            0,
            4,
            2,
            &[0, 1, 2, 3, 4],
            &[
                KIND_NUMBER,
                KIND_NUMBER,
                KIND_EMPTY,
                KIND_EMPTY,
                KIND_STRING
            ],
            &[99.0, 6.0, 0.0, 0.0, 0.0],
            "雪".as_bytes(),
            &[0, 3],
            &[9; 5],
            &[2],
            vec!["=B1*2".into()],
            &[3],
            &[sheet as u32, 1, 0],
        ),
        BLOCK_OK
    );
    store.commit_sources();
    assert_eq!(store.formula_source(sheet, 0, 0).as_deref(), Some("=17"));
    assert_eq!(store.get_cell(sheet, 0, 0).num(), 17.0);
    assert_eq!(store.get_cell(sheet, 0, 0).style(), 5);
    assert_eq!(store.formula_source(sheet, 1, 0).as_deref(), Some("=B1*2"));
    assert_eq!(
        store.reference_target(sheet, 1, 1),
        Some(vec![sheet as u32, 1, 0])
    );
    assert_eq!(store.get_cell(sheet, 1, 0).num(), 12.0);
    assert_eq!(store.get_cell(sheet, 1, 1).num(), 12.0);
    assert_eq!(store.get_cell(sheet, 2, 0).string().as_deref(), Some("雪"));
}
