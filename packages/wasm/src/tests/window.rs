//! What the window view returns: cell styles and conditional format matches.

use super::*;

#[test]
fn skipped_and_unloaded_window_cells_have_no_style() {
    let styled_id = 7;
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 1);
    store.set_number(sheet, 0, 0, 1.0, styled_id);
    let windows = [
        store.get_window(sheet, 0, 1, &[0, 1]),
        store.get_window_rows(sheet, &[0, 9], &[0, 1]),
    ];
    for window in windows {
        let decoded = decode_window(window);
        let styles: Vec<u32> = decoded
            .style_index
            .iter()
            .map(|&slot| decoded.style_dict[slot as usize])
            .collect();
        assert_eq!(styles[0], styled_id);
        assert!(styles[1..].iter().all(|&style| style == 0));
    }

    let paged = store.add_paged_sheet(2, 1, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.set_number(paged, 0, 0, 1.0, styled_id);
    for window in [
        store.get_window(paged, 0, 1, &[0, 1]),
        store.get_window_rows(paged, &[0], &[0, 1]),
    ] {
        let decoded = decode_window(window);
        assert_eq!(
            decoded.style_dict[decoded.style_index[0] as usize],
            styled_id
        );
        assert_eq!(decoded.style_dict[decoded.style_index[1] as usize], 0);
        assert_eq!(
            decoded.strings[decoded.string_index[1] as usize],
            "#LOADING!"
        );
    }
}

#[test]
fn conditional_format_window_masks_cover_predicates_bounds_and_row_order() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 3);
    store.set_number(sheet, 0, 0, 5.0, 0);
    store.set_number(sheet, 1, 0, 10.0, 0);
    store.set_number(sheet, 2, 0, 20.0, 0);
    store.set_string(sheet, 0, 1, "Tokyo", 0);
    store.set_string(sheet, 1, 1, "Kyoto", 0);
    store.set_string(sheet, 2, 1, "TOKYO", 0);
    store.set_conditional_rules(
        sheet,
        &[0, 5, 1, 2, 3, 5],
        &[
            0, 0, 2, 0, // greater than 7
            0, 1, 2, 1, // case-insensitive contains "tokyo"
            0, 0, 2, 0, // less than 10
            0, 0, 2, 0, // numeric equality with 10
            0, 1, 2, 1, // string equality with "Tokyo"
            0, 1, 2, 1, // case-sensitive contains "TOK"
        ],
        &[7.0, 0.0, 10.0, 10.0, 0.0, 0.0],
        vec![
            String::new(),
            "tokyo".to_owned(),
            String::new(),
            String::new(),
            "Tokyo".to_owned(),
            "TOK".to_owned(),
        ],
        &[0, 0, 0, 0, 0, 1],
    );

    let contiguous = decode_window(store.get_window(sheet, 0, 3, &[0, 1]));
    assert_eq!(contiguous.cond_matches, vec![4, 18, 9, 0, 1, 34]);

    let reordered = decode_window(store.get_window_rows(sheet, &[2, 0, 1], &[1, 0]));
    assert_eq!(reordered.cond_matches, vec![34, 1, 18, 4, 0, 9]);
}

#[test]
fn conditional_formula_rules_shift_relative_refs_stop_and_follow_dependency_edits() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 3);
    for (row, value) in [1.0, 4.0, 6.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }
    store.set_number(sheet, 0, 1, 3.0, 0);
    store.set_conditional_rules(
        sheet,
        &[6, 6],
        &[0, 2, 2, 2, 0, 2, 2, 2],
        &[0.0, 0.0],
        vec!["=A1>$B$1".to_owned(), "=TRUE".to_owned()],
        &[2, 0],
    );

    let initial = decode_window(store.get_window(sheet, 0, 3, &[2]));
    assert_eq!(initial.cond_matches, vec![2, 1, 1]);

    store.set_number(sheet, 1, 0, 2.0, 0);
    store.recompute(sheet);
    let changed_dependency = decode_window(store.get_window(sheet, 0, 3, &[2]));
    assert_eq!(changed_dependency.cond_matches, vec![2, 2, 1]);
}

#[test]
fn conditional_formula_rules_read_computed_references_once() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 4);
    for (row, value) in [0.0, 1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }
    // Each rule holds in every row only if OFFSET's and INDIRECT's results
    // are read where they point, and each range end moves by its own `$`.
    store.set_conditional_rules(
        sheet,
        &[6, 6, 6],
        &[0, 1, 3, 1, 0, 1, 3, 1, 0, 1, 3, 1],
        &[0.0, 0.0, 0.0],
        vec![
            "=OFFSET(A1,0,0)=ROW()-1".to_owned(),
            "=INDIRECT(\"A\"&ROW())=ROW()-1".to_owned(),
            "=SUM($A$1:A1)=(ROW()-1)*ROW()/2".to_owned(),
        ],
        &[0, 0, 0],
    );

    let window = decode_window(store.get_window(sheet, 0, 4, &[1]));
    assert_eq!(window.cond_matches, vec![7, 7, 7, 7]);
}

#[test]
fn conditional_formula_rules_give_ref_errors_past_the_last_row() {
    let last_row = crate::calc::SHEET_ROWS - 1;
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, last_row as usize + 1);
    store.set_conditional_rules(
        sheet,
        &[6],
        &[last_row - 1, 0, last_row, 0],
        &[0.0],
        vec!["=ISERROR(A1048576)".to_owned()],
        &[0],
    );

    // The second row moves A1048576 past the sheet: #REF!, as when the
    // formula is written in that row.
    let window =
        decode_window(store.get_window(sheet, last_row as usize - 1, last_row as usize + 1, &[0]));
    assert_eq!(window.cond_matches, vec![0, 1]);
}
