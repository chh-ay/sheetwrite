//! Sheet removal and row and column edits rewrite the references that
//! formulas hold.

use super::*;

#[test]
fn remove_sheet_tombstones_handle_and_invalidates_transitive_formula_dependencies() {
    let mut store = CellStore::new();
    let source = store.add_sheet(1, 2);
    let summary = store.add_sheet(3, 2);
    store.set_sheet_name(source, "source", "Source");
    store.set_sheet_name(summary, "summary", "Summary");
    store.set_number(source, 0, 0, 4.0, 0);
    store.set_formula(summary, 0, 0, "=Source!A1+1", 0);
    store.set_formula(summary, 0, 1, "=A1+1", 0);
    store.recompute(summary);
    assert_close(number(&store, summary, 0, 1), 6.0);

    store.set_formula(summary, 0, 2, "=SUM(Source!A1:A2)", 0);
    assert!(store.remove_sheet(source));

    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=#REF!+1")
    );
    assert_eq!(string(&store, summary, 0, 0).as_deref(), Some("#REF!"));
    assert_eq!(string(&store, summary, 0, 1).as_deref(), Some("#REF!"));
    assert!(!store.sheet_alive[source]);
    assert!(store.sheet_alive[summary]);
    assert_eq!(store.row_count(source), 0);

    let replacement = store.add_sheet(1, 1);
    assert_eq!(
        store.formula_source(summary, 0, 2).as_deref(),
        Some("=SUM(#REF!)")
    );
    assert_eq!(string(&store, summary, 0, 2).as_deref(), Some("#REF!"));
    assert_eq!(replacement, 2);
    assert!(store.sheet_alive[replacement]);
    assert!(!store.remove_sheet(source));
}

#[test]
fn structural_edits_rewrite_cross_sheet_targets_and_preserve_qualifiers() {
    let mut store = CellStore::new();
    let source = store.add_sheet(2, 5);
    let other = store.add_sheet(2, 5);
    let summary = store.add_sheet(3, 5);
    store.set_sheet_name(source, "source", "Source Data");
    store.set_sheet_name(other, "other", "Other");
    store.set_sheet_name(summary, "summary", "Summary");
    store.set_number(source, 1, 0, 9.0, 0);
    store.set_number(other, 0, 0, 7.0, 0);
    store.set_formula(summary, 0, 0, "='Source Data'!$A$2", 0);
    store.set_formula(summary, 1, 0, "=Other!A1", 0);
    // A reference without a sheet name on another sheet does not move.
    store.set_formula(summary, 2, 0, "=A2+B2*2", 0);
    store.recompute(summary);

    store.add_rows(source, 1, 1);
    store.recompute(source);
    store.recompute(summary);
    assert_close(number(&store, summary, 0, 0), 9.0);
    assert_close(number(&store, summary, 1, 0), 7.0);
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("='Source Data'!$A$3")
    );
    assert_eq!(
        store.formula_source(summary, 1, 0).as_deref(),
        Some("=Other!A1")
    );
    assert_eq!(formula_text(&store, summary, 2, 0), "=A2+B2*2");

    store.remove_rows(source, 2, 1);
    store.recompute(source);
    store.recompute(summary);
    assert_eq!(string(&store, summary, 0, 0).as_deref(), Some("#REF!"));
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=#REF!")
    );
    assert_close(number(&store, summary, 1, 0), 7.0);
}

#[test]
fn plain_reference_targets_follow_structural_edits_and_drop_on_target_delete() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 3);
    store.set_sheet_name(sheet, "s1", "Sheet 1");
    assert_eq!(
        store.set_sparse_block(
            sheet,
            0,
            0,
            3,
            2,
            &[0, 5],
            &[KIND_NUMBER, KIND_EMPTY],
            &[9.0, 0.0],
            &[],
            &[0],
            &[0, 0],
            &[],
            Vec::new(),
            &[5],
            &[sheet as u32, 0, 0],
        ),
        0
    );
    store.commit_sources();
    assert_close(number(&store, sheet, 2, 1), 9.0);

    store.add_rows(sheet, 0, 1);
    store.commit_sources();
    assert_eq!(
        store.reference_target(sheet, 3, 1),
        Some(vec![sheet as u32, 1, 0])
    );
    assert_close(number(&store, sheet, 3, 1), 9.0);

    store.remove_rows(sheet, 1, 1);
    store.commit_sources();
    assert!(store.reference_target(sheet, 2, 1).is_none());
    assert_eq!(store.get_cell(sheet, 2, 1).kind(), KIND_EMPTY);
}
