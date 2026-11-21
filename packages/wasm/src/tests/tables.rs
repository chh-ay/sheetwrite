//! Tables: structured references, stable identities and the table registry.

use super::*;

#[test]
fn structured_references_cover_body_headers_totals_current_row_and_dependencies() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 6);
    store.set_sheet_name(sheet, "data", "Data");
    store.set_string(sheet, 0, 0, "Amount", 0);
    store.set_string(sheet, 0, 1, "Calc", 0);
    for (row, value) in [10.0, 20.0, 30.0].into_iter().enumerate() {
        store.set_number(sheet, row + 1, 0, value, 0);
    }
    store.set_number(sheet, 4, 0, 60.0, 0);
    assert!(store.set_table(
        "table-id",
        "Sales",
        sheet,
        0,
        0,
        4,
        1,
        true,
        true,
        vec!["amount-id".into(), "calc-id".into()],
        vec!["Amount".into(), "Calc".into()],
    ));

    store.set_formula(sheet, 0, 2, "=SUM(Sales[Amount])", 0);
    store.set_formula(sheet, 1, 2, "=Sales[[#Headers],[Amount]]", 0);
    store.set_formula(sheet, 2, 2, "=Sales[[#Totals],[Amount]]", 0);
    store.set_formula(sheet, 1, 1, "=[@Amount]*2", 0);
    store.set_formula(sheet, 2, 1, "=[@Amount]*2", 0);
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 2), 60.0);
    assert_eq!(string(&store, sheet, 1, 2).as_deref(), Some("Amount"));
    assert_close(number(&store, sheet, 2, 2), 60.0);
    assert_close(number(&store, sheet, 1, 1), 20.0);
    assert_close(number(&store, sheet, 2, 1), 40.0);
    for (row, col) in [(1, 1), (2, 1), (1, 2), (2, 2)] {
        assert_eq!(store.spill_anchor_row(sheet, row, col), u32::MAX);
    }

    assert!(store.set_named_range("Scale", -1, sheet, 1, 0, 1, 0));
    store.set_formula(sheet, 3, 2, "=Scale*2", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 3, 2), 20.0);
    assert_eq!(store.spill_anchor_row(sheet, 3, 2), u32::MAX);

    store.set_number(sheet, 1, 0, 15.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 2), 65.0);
    assert_close(number(&store, sheet, 1, 1), 30.0);
}

#[test]
fn stable_table_and_column_identities_rewrite_formula_source_on_rename_and_removal() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 4);
    store.set_number(sheet, 1, 0, 7.0, 0);
    let sales = [0, 0, 2, 1];
    let columns = |amount| [("amount-id", amount), ("calc-id", "Calc")];
    assert!(set_header_table(
        &mut store,
        ("table-id", "Sales"),
        sheet,
        sales,
        &columns("Amount")
    ));
    store.set_formula(sheet, 0, 2, "=SUM(Sales[Amount])", 0);
    store.set_formula(sheet, 1, 1, "=[@Amount]*2", 0);
    store.recompute(sheet);

    assert!(set_header_table(
        &mut store,
        ("other-id", "Archive"),
        sheet,
        [3, 0, 3, 0],
        &[("archive-id", "Archived")]
    ));
    assert!(!set_header_table(
        &mut store,
        ("table-id", "archive"),
        sheet,
        sales,
        &columns("Value")
    ));
    assert_eq!(
        store.formula_source(sheet, 0, 2).as_deref(),
        Some("=SUM(Sales[Amount])")
    );
    assert_close(number(&store, sheet, 0, 2), 7.0);

    assert!(set_header_table(
        &mut store,
        ("table-id", "Revenue"),
        sheet,
        sales,
        &columns("Value")
    ));
    assert_eq!(
        store.formula_source(sheet, 0, 2).as_deref(),
        Some("=SUM(Revenue[Value])")
    );
    assert_eq!(
        store.formula_source(sheet, 1, 1).as_deref(),
        Some("=[@Value]*2")
    );
    assert_close(number(&store, sheet, 0, 2), 7.0);
    assert_close(number(&store, sheet, 1, 1), 14.0);

    assert!(store.remove_table("table-id"));
    assert_eq!(
        store.formula_source(sheet, 0, 2).as_deref(),
        Some("=SUM(#REF!)")
    );
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("#REF!"));
}

#[test]
fn table_registry_rejects_ambiguous_names_columns_and_resource_overflow() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 4);
    assert!(set_header_table(
        &mut store,
        ("first", "Café"),
        sheet,
        [0, 0, 1, 0],
        &[("value", "Wert")]
    ));
    store.set_number(sheet, 1, 0, 9.0, 0);
    store.set_formula(sheet, 0, 1, "=SUM(café[wert])", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 9.0);
    assert!(!store.set_named_range("CAFÉ", -1, sheet, 0, 1, 1, 1));
    let oversized_id = "x".repeat(129);
    for (table, cells, columns) in [
        (
            ("second", "café"),
            [2, 0, 3, 0],
            &[("value-2", "Other")][..],
        ),
        (("bad-column", "Other"), [2, 1, 3, 1], &[("bad", "@Value")]),
        (
            ("duplicate-column-id", "Other"),
            [2, 0, 3, 1],
            &[("Å-id", "Left"), ("å-ID", "Right")],
        ),
        (
            ("oversized", "Third"),
            [2, 1, 3, 1],
            &[(oversized_id.as_str(), "Value")],
        ),
    ] {
        assert!(
            !set_header_table(&mut store, table, sheet, cells, columns),
            "{table:?}"
        );
    }
    let mut named_first = CellStore::new();
    let named_sheet = named_first.add_sheet(1, 2);
    assert!(named_first.set_named_range("Sales", -1, named_sheet, 0, 0, 1, 0));
    assert!(!set_header_table(
        &mut named_first,
        ("table-after-name", "sales"),
        named_sheet,
        [0, 0, 1, 0],
        &[("value", "Value")]
    ));
}
