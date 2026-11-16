//! Block writes and range snapshots: admission of malformed input, packed
//! text, sparse blocks and saved pivot text.

use super::*;

/// Joined text, its UTF-16 lengths and the cells it must produce.
#[cfg(not(feature = "analysis"))]
type SavedTextCase<'a> = (&'a str, &'a [u32], &'a [&'a str]);

#[cfg(not(feature = "analysis"))]
#[test]
fn saved_pivot_text_survives_hostile_utf16_lengths() {
    let cases: &[SavedTextCase<'_>] = &[
        ("abc", &[2, 5, 3], &["ab", "c", ""]),
        ("abcdef", &[2, 1], &["ab", "c"]),
        ("𝄞x", &[1, 1], &["𝄞", "x"]),
        ("é漢z", &[1, 1, 1], &["é", "漢", "z"]),
    ];
    for &(text, lengths, expected) in cases {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(1, expected.len());
        assert!(store.set_saved_pivots(
            sheet,
            &[0, 0, expected.len() as u32, 1],
            &vec![KIND_STRING; expected.len()],
            &vec![0.0; expected.len()],
            text.into(),
            lengths,
        ));
        store.recompute(sheet);
        for (row, value) in expected.iter().enumerate() {
            assert_eq!(string(&store, sheet, row, 0).as_deref(), Some(*value));
        }
    }
}

#[test]
fn opaque_range_snapshot_round_trip_preserves_cell_behavior() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 3);
    store.set_number(sheet, 0, 0, 5.0, 11);
    store.set_formula(sheet, 1, 0, "=A1+1", 12);
    store.set_string(sheet, 2, 1, "tail", 13);
    store.recompute(sheet);

    let number_before = number(&store, sheet, 0, 0);
    let formula_value_before = number(&store, sheet, 1, 0);
    let formula_source_before = store
        .formula_source(sheet, 1, 0)
        .expect("formula source should be available before capture");
    let text_before = string(&store, sheet, 2, 1);
    let styles_before = [
        store.get_cell(sheet, 0, 0).style(),
        store.get_cell(sheet, 1, 0).style(),
        store.get_cell(sheet, 2, 1).style(),
    ];

    let snapshot = store.capture_range(sheet, 0, 0, 3, 2).unwrap();
    let snapshot_numbers = store.snapshot_numbers(&snapshot);
    assert_close(snapshot_numbers[0], 5.0);
    // History captures the written source, never the calculated scalar.
    assert_close(snapshot_numbers[1], 0.0);
    assert_eq!(
        store.snapshot_texts(&snapshot),
        vec!["", "", "", "", "", "tail"]
    );
    assert!(store.range_fully_loaded(sheet, 0, 0, 2, 1));
    assert_eq!(snapshot.formula_offsets(), vec![1, 0]);
    assert_eq!(snapshot.kinds().len(), 6);
    assert_eq!(snapshot.style_ids(), vec![11, 12, 0, 0, 0, 13]);
    assert_eq!(
        snapshot.formula_sources(),
        vec![formula_source_before.clone()]
    );
    assert!(snapshot.byte_length() >= 6 + 6 * 8 + 6 * 4 + formula_source_before.len());
    assert_eq!(store.get_cell(sheet, 1, 0).style(), 12);
    assert!(store.clear_range(sheet, 0, 0, 2, 1, true, true));
    assert!(store.formula_source(sheet, 1, 0).is_none());
    assert!(string(&store, sheet, 2, 1).is_none());
    store.compact_string_storage();
    assert_eq!(store.snapshot_texts(&snapshot)[5], "tail");
    assert!(store.restore_range(sheet, 0, 0, &snapshot));
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 0), number_before);
    assert_close(number(&store, sheet, 1, 0), formula_value_before);
    assert_eq!(
        store.formula_source(sheet, 1, 0).as_deref(),
        Some(formula_source_before.as_str())
    );
    assert_eq!(string(&store, sheet, 2, 1), text_before);
    assert_eq!(
        [
            store.get_cell(sheet, 0, 0).style(),
            store.get_cell(sheet, 1, 0).style(),
            store.get_cell(sheet, 2, 1).style(),
        ],
        styles_before
    );

    store.set_number(sheet, 0, 0, 8.0, styles_before[0]);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 1, 0), 9.0);
    assert_eq!(store.get_cell(sheet, 1, 0).style(), styles_before[1]);
}

#[test]
fn mixed_block_owns_formula_and_reference_sources_and_recomputes_once() {
    let mut store = CellStore::new();
    let _earlier_sheet = store.add_sheet(1, 1);
    let sheet = store.add_sheet(2, 2);
    store.set_sheet_name(sheet, "s1", "Sheet 1");
    assert_eq!(
        store.set_block_packed(
            sheet,
            0,
            0,
            2,
            2,
            &[KIND_NUMBER, KIND_EMPTY, KIND_EMPTY, KIND_STRING],
            &[2.0, 0.0, 0.0, 0.0],
            b"tail",
            &[0, 4],
            &[1, 2, 3, 4],
            &[1],
            vec!["=A1*3".to_owned()],
            &[2],
            &[sheet as u32, 0, 1],
        ),
        0
    );
    store.commit_sources();

    assert_close(number(&store, sheet, 0, 1), 6.0);
    assert_close(number(&store, sheet, 1, 0), 6.0);
    assert_eq!(store.formula_source(sheet, 0, 1).as_deref(), Some("=A1*3"));
    assert!(store.formula_source(sheet, 1, 0).is_none());
    assert_eq!(
        store.reference_target(sheet, 1, 0),
        Some(vec![sheet as u32, 0, 1])
    );

    let sources = store.capture_sources(sheet, 0, 0, 2, 2).unwrap();
    assert_eq!(sources.formula_offsets(), vec![1]);
    assert_eq!(sources.formula_sources(), vec!["=A1*3"]);
    assert_eq!(sources.reference_offsets(), vec![2]);
    assert_eq!(sources.reference_targets(), vec![sheet as u32, 0, 1]);

    let reordered = store
        .capture_sources_for_rows(sheet, &[1, 0], &[1, 0])
        .unwrap();
    assert_eq!(reordered.formula_offsets(), vec![2]);
    assert_eq!(reordered.formula_sources(), vec!["=A1*3"]);
    assert_eq!(reordered.reference_offsets(), vec![1]);
    assert_eq!(reordered.reference_targets(), vec![sheet as u32, 0, 1]);
    assert!(store.capture_sources_for_rows(sheet, &[2], &[0]).is_none());

    assert_eq!(
        store.set_sparse_block(
            sheet,
            0,
            0,
            2,
            2,
            &[0],
            &[KIND_NUMBER],
            &[4.0],
            &[],
            &[0],
            &[1],
            &[],
            Vec::new(),
            &[],
            &[],
        ),
        0
    );
    store.commit_sources();
    assert_close(number(&store, sheet, 0, 1), 12.0);
    assert_close(number(&store, sheet, 1, 0), 12.0);
}

#[test]
fn sparse_block_reads_packed_text_for_string_entries_only() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 4);
    let text = "héllo日本";
    let split = "héllo".len() as u32;

    // Entries in offset order 3, 0, 1: a string, a number, a string.
    assert_eq!(
        store.set_sparse_block(
            sheet,
            0,
            0,
            4,
            1,
            &[3, 0, 1],
            &[KIND_STRING, KIND_NUMBER, KIND_STRING],
            &[0.0, 7.0, 0.0],
            text.as_bytes(),
            &[0, split, text.len() as u32],
            &[0, 0, 0],
            &[],
            Vec::new(),
            &[],
            &[],
        ),
        0
    );
    assert_eq!(string(&store, sheet, 3, 0).as_deref(), Some("héllo"));
    assert_close(number(&store, sheet, 0, 0), 7.0);
    assert_eq!(string(&store, sheet, 1, 0).as_deref(), Some("日本"));

    // A bound inside a multi-byte character is rejected before any write.
    assert_eq!(
        store.set_sparse_block(
            sheet,
            0,
            0,
            4,
            1,
            &[1, 2],
            &[KIND_STRING, KIND_STRING],
            &[0.0, 0.0],
            "é".as_bytes(),
            &[0, 1, 2],
            &[0, 0],
            &[],
            Vec::new(),
            &[],
            &[],
        ),
        2
    );
    assert_eq!(string(&store, sheet, 1, 0).as_deref(), Some("日本"));
    assert_eq!(string(&store, sheet, 2, 0), None);
}

const INVALID_SOURCE_STATUS: u32 = 2;

#[test]
fn column_major_block_input_rejects_metadata_that_row_major_rejects() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 2);
    // Two string cells but only one text boundary.
    assert_eq!(
        store.set_column_block_packed(
            sheet,
            0,
            0,
            2,
            1,
            &[KIND_STRING, KIND_STRING],
            &[0.0, 0.0],
            b"x",
            &[0, 1],
            &[0, 0],
            &[],
            Vec::new(),
            &[],
            &[],
        ),
        INVALID_SOURCE_STATUS
    );
    // Out-of-bounds formula offset.
    assert_eq!(
        store.set_column_block_packed(
            sheet,
            0,
            0,
            1,
            1,
            &[KIND_EMPTY],
            &[0.0],
            &[],
            &[0],
            &[0],
            &[4],
            vec!["=A1".to_owned()],
            &[],
            &[],
        ),
        INVALID_SOURCE_STATUS
    );
    // Duplicate source offset.
    assert_eq!(
        store.set_column_block_packed(
            sheet,
            0,
            0,
            2,
            1,
            &[KIND_EMPTY, KIND_EMPTY],
            &[0.0, 0.0],
            &[],
            &[0],
            &[0, 0],
            &[0, 0],
            vec!["=A1".to_owned(), "=A2".to_owned()],
            &[],
            &[],
        ),
        INVALID_SOURCE_STATUS
    );
}

#[test]
fn rejected_packed_text_adds_nothing_to_the_string_pool() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 8, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    let write = |store: &mut CellStore, text: &str, offsets: &[u32]| {
        store.set_block_packed(
            sheet,
            0,
            0,
            1,
            2,
            &[KIND_STRING, KIND_STRING],
            &[0.0, 0.0],
            text.as_bytes(),
            offsets,
            &[0, 0],
            &[],
            Vec::new(),
            &[],
            &[],
        )
    };
    // Two string cells but one packed string.
    assert_eq!(write(&mut store, "ab", &[0, 2]), 2);
    // A bound inside the two-byte `é`.
    assert_eq!(write(&mut store, "éa", &[0, 1, 3]), 2);
    assert!(
        store.strings.get(0).is_none(),
        "a rejected block interned text"
    );

    assert_eq!(write(&mut store, "éa", &[0, 2, 3]), 0);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("é"));
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("a"));
}
