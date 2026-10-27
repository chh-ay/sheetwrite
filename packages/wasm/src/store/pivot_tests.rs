use super::*;

fn payload(rows: usize, anchor: (u32, u32), aggregations: &[u32]) -> Vec<f64> {
    let mut numbers = vec![
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        rows as f64,
        2.0,
        f64::from(anchor.0),
        f64::from(anchor.1),
        1.0,
        0.0,
        1.0,
        1.0,
        aggregations.len() as f64,
    ];
    for &aggregation in aggregations {
        numbers.extend([2.0, f64::from(aggregation), -1.0]);
    }
    numbers.extend([0.0, 0.0, 3.0]);
    numbers
}

fn fixture(rows: usize) -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let source = store.add_sheet(3, rows + 1);
    let output = store.add_sheet(32, rows + 10);
    for (col, header) in ["Region", "Quarter", "Sales"].iter().enumerate() {
        store.set_string(source, 0, col, header, 0);
    }
    for row in 1..=rows {
        store.set_number(source, row, 0, (row % 2) as f64, 0);
        store.set_number(source, row, 1, (row % 3) as f64, 0);
        store.set_number(source, row, 2, row as f64, 0);
    }
    store.commit_sources();
    (store, source, output)
}

fn install(store: &mut CellStore, output: usize, rows: usize, aggregations: &[u32]) {
    assert!(store.set_pivots(
        output,
        &payload(rows, (0, 0), aggregations),
        vec!["pivot".into()]
    ));
    store.recompute(output);
    let status = store.pivot_status(output);
    assert_eq!(status[0], 0);
    assert!(status[3] > 0, "the pivot installed output");
}

#[test]
fn pivot_incremental_work_and_formula_free_output_survive_edits() {
    let (mut store, source, output) = fixture(600);
    install(&mut store, output, 600, &[0]);
    let before = store.pivot_aggregate_updates(output, 0);
    let output_before = store.pivot_output_reads(output, 0);
    assert_eq!(store.get_cell(output, 2, 1).num(), 30_300.0);
    store.set_number(source, 6, 2, 106.0, 0);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 2, 1).num(), 30_400.0);
    assert_eq!(store.pivot_aggregate_updates(output, 0) - before, 8);
    assert_eq!(store.pivot_output_reads(output, 0) - output_before, 4);
    store.set_number(output, 9, 20, 7.0, 0);
    store.recompute(output);
    assert_eq!(store.get_cell(output, 2, 1).num(), 30_400.0);
    assert_eq!(store.formula_source(output, 0, 0), None);
    assert!(store.sheets[output].formulas.is_empty());
    let fields = store.pivot_fields(output, 0);
    assert_eq!(fields.names(), ["Region", "Quarter", "Sales"]);
    assert_eq!(fields.types(), [1, 1, 1]);
}

#[test]
fn pivot_min_max_and_distinct_remove_old_contributions() {
    let (mut store, source, output) = fixture(12);
    install(&mut store, output, 12, &[3, 4, 6]);
    assert_eq!(store.get_cell(output, 2, 1).num(), 6.0);
    assert_eq!(store.get_cell(output, 2, 2).num(), 12.0);
    assert_eq!(store.get_cell(output, 2, 3).num(), 2.0);
    store.set_number(source, 6, 2, 12.0, 0);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 2, 1).num(), 12.0);
    assert_eq!(store.get_cell(output, 2, 2).num(), 12.0);
    assert_eq!(store.get_cell(output, 2, 3).num(), 1.0);
    store.set_number(source, 12, 2, 5.0, 0);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 2, 1).num(), 5.0);
    assert_eq!(store.get_cell(output, 2, 2).num(), 12.0);
    assert_eq!(store.get_cell(output, 2, 3).num(), 2.0);
}

#[test]
fn pivot_blocker_retry_and_own_source_overlap() {
    let (mut store, _, output) = fixture(12);
    store.set_number(output, 2, 1, 99.0, 0);
    assert!(store.set_pivots(output, &payload(12, (0, 0), &[0]), vec!["pivot".into()]));
    store.recompute(output);
    assert_eq!(
        store.get_cell(output, 0, 0).string().as_deref(),
        Some("#SPILL!")
    );
    store.clear_cell(output, 2, 1, 0);
    store.recompute(output);
    assert_eq!(store.pivot_status(output)[0], 0);
    assert_eq!(store.get_cell(output, 2, 1).num(), 18.0);

    // Widen the source over five blank columns that no field reads, and
    // anchor there. Output into those cells would not change the pivot, so
    // only the own-source check, not a feedback loop, can refuse it.
    store.insert_cols(0, 3, 5);
    store.recompute(0);
    let mut overlap = payload(12, (5, 3), &[0]);
    const SOURCE_LAST_COL: usize = 6;
    overlap[SOURCE_LAST_COL] = 7.0;
    assert!(store.set_pivots(0, &overlap, vec!["overlap".into()]));
    store.recompute(0);
    assert_eq!(
        store.pivot_status(0)[0],
        FormulaError::Spill.slot() as u32 + 1
    );
    assert_eq!(store.get_cell(0, 5, 3).string().as_deref(), Some("#SPILL!"));
    assert_eq!(store.get_cell(0, 6, 4).kind(), KIND_EMPTY);
}

#[test]
fn pivot_formula_source_and_output_dependents_settle() {
    let (mut store, source, output) = fixture(12);
    store.set_sheet_name(source, "source", "Source");
    store.set_sheet_name(output, "output", "Output");
    store.set_number(source, 0, 2, 10.0, 0);
    store.set_formula(source, 6, 2, "=C1*2", 0);
    store.recompute(source);
    store.set_formula(output, 9, 20, "=B3*2", 0);
    install(&mut store, output, 12, &[0]);
    assert_eq!(store.get_cell(output, 9, 20).num(), 64.0);
    store.set_number(source, 0, 2, 20.0, 0);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 2, 1).num(), 52.0);
    assert_eq!(store.get_cell(output, 9, 20).num(), 104.0);
}

#[test]
fn pivot_structural_source_edits_and_deleted_anchor_move() {
    let (mut store, source, output) = fixture(12);
    install(&mut store, output, 12, &[0]);
    store.add_rows(source, 6, 1);
    store.set_number(source, 6, 0, 0.0, 0);
    store.set_number(source, 6, 1, 0.0, 0);
    store.set_number(source, 6, 2, 100.0, 0);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 2, 1).num(), 118.0);
    store.remove_rows(source, 6, 1);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 2, 1).num(), 18.0);
    store.remove_rows(output, 0, 1);
    store.recompute(output);
    assert_eq!(&store.pivot_status(output)[1..3], &[0, 0]);
    assert_eq!(store.get_cell(output, 2, 1).num(), 18.0);
    store.remove_cols(output, 0, 1);
    store.recompute(output);
    assert_eq!(&store.pivot_status(output)[1..3], &[0, 0]);
    assert_eq!(store.get_cell(output, 2, 1).num(), 18.0);
}

#[test]
fn pivot_aggregations_match_pivotby_with_shared_keys_and_totals() {
    for (aggregation, function) in [
        (0, "SUM"),
        (1, "COUNT"),
        (2, "AVERAGE"),
        (3, "MIN"),
        (4, "MAX"),
        (5, "COUNTA"),
    ] {
        let (mut store, _, output) = fixture(12);
        install(&mut store, output, 12, &[aggregation]);
        let formula_sheet = store.add_sheet(10, 20);
        store.set_sheet_name(0, "source", "Source");
        store.set_formula(
            formula_sheet,
            0,
            0,
            &format!("=PIVOTBY(Source!A2:A13,Source!B2:B13,Source!C2:C13,{function},0,1,,1)"),
            0,
        );
        store.recompute(formula_sheet);
        for row in 0..3 {
            for col in 0..4 {
                let pivot = store.get_cell(output, row + 2, col + 1);
                let formula = store.get_cell(formula_sheet, row + 1, col + 1);
                assert_eq!(pivot.string(), formula.string(), "{function}, {row}, {col}");
                assert_eq!(pivot.num(), formula.num(), "{function}, {row}, {col}");
            }
        }
    }
}

/// Whether `a` and `b` are at most `ulps` adjacent numbers apart.
fn within_ulps(a: f64, b: f64, ulps: u64) -> bool {
    a == b || (a.signum() == b.signum() && a.to_bits().abs_diff(b.to_bits()) <= ulps)
}

#[test]
fn pivot_sums_stay_exact_through_edits_and_match_pivotby() {
    // `fixture` row r is in region r % 2 and quarter r % 3, so rows r and
    // r + 6 share a pair: rows 2 and 8 hold 0.1 and 0.2, rows 6 and 12 hold
    // 1.5 and the edited number.
    const SALES: [f64; 12] = [
        19.99, 0.1, 0.2, 0.3, 0.1, 1.5, 0.3, 0.2, 0.1, 19.99, 0.2, 0.3,
    ];
    const LARGE: f64 = 1e16;
    // Row 12 is the last row, so PIVOTBY's running sum adds the edited
    // number last.
    let steps: [(&str, usize, Option<f64>); 8] = [
        ("0.1 leaves its pair", 2, None),
        ("a large number joins", 12, Some(LARGE)),
        ("the large number leaves", 12, None),
        ("0.1 returns", 2, Some(0.1)),
        ("the largest number joins", 6, Some(f64::MAX)),
        ("the pair overflows", 12, Some(f64::MAX)),
        ("one largest number leaves", 6, None),
        ("the other largest number leaves", 12, None),
    ];
    // The pivot rounds the exact sum once. PIVOTBY rounds after each row,
    // which in general can drift far ({1e16, 0.5, -1e16} gives 0, not 0.5);
    // with this data its sums stay within one ULP of the exact ones. An
    // average divides that difference by the count, which leaves less than
    // two ULPs of the average.
    for (aggregation, function, ulps) in [(0, "SUM", 1), (2, "AVERAGE", 2)] {
        let (mut store, source, output) = fixture(12);
        for (row, sales) in SALES.into_iter().enumerate() {
            store.set_number(source, row + 1, 2, sales, 0);
        }
        store.commit_sources();
        install(&mut store, output, 12, &[aggregation]);
        let fresh = store.add_sheet(32, 22);
        let formula_sheet = store.add_sheet(10, 20);
        store.set_sheet_name(source, "source", "Source");
        store.set_formula(
            formula_sheet,
            0,
            0,
            &format!("=PIVOTBY(Source!A2:A13,Source!B2:B13,Source!C2:C13,{function},0,1,,1)"),
            0,
        );
        store.recompute(formula_sheet);
        let payload = payload(12, (0, 0), &[aggregation]);

        let assert_near_pivotby = |store: &CellStore, step: &str| {
            for row in 0..3 {
                for col in 0..4 {
                    let pivot = store.get_cell(output, row + 2, col + 1);
                    let formula = store.get_cell(formula_sheet, row + 1, col + 1);
                    let context = format!("{function}, {step}, {row}, {col}");
                    assert_eq!(pivot.string(), formula.string(), "{context}");
                    assert!(
                        within_ulps(pivot.num(), formula.num(), ulps),
                        "{context}: pivot {} PIVOTBY {}",
                        pivot.num(),
                        formula.num()
                    );
                }
            }
        };
        assert_near_pivotby(&store, "build");
        for (step, row, sales) in steps {
            match sales {
                Some(sales) => store.set_number(source, row, 2, sales, 0),
                None => store.clear_cell(source, row, 2, 0),
            }
            store.recompute_changed();
            assert_matches_fresh_build(
                &mut store,
                output,
                fresh,
                &payload,
                &format!("{function}, {step}"),
            );
            assert_near_pivotby(&store, step);
        }
    }
}

#[test]
fn pivot_text_key_labels_follow_first_remaining_row_like_pivotby() {
    let (mut store, source, output) = fixture(6);
    for (row, key) in ["apple", "Pear", "zebra", "pear", "Apple", "Pear"]
        .into_iter()
        .enumerate()
    {
        store.set_string(source, row + 1, 0, key, 0);
    }
    store.commit_sources();
    install(&mut store, output, 6, &[0]);
    let formula_sheet = store.add_sheet(10, 20);
    store.set_sheet_name(source, "source", "Source");
    store.set_formula(
        formula_sheet,
        0,
        0,
        "=PIVOTBY(Source!A2:A7,Source!B2:B7,Source!C2:C7,SUM,0,1,,1)",
        0,
    );
    store.recompute(formula_sheet);
    let assert_parity = |store: &CellStore, step: &str| {
        for row in 0..6 {
            for col in 0..5 {
                let pivot = store.get_cell(output, row + 2, col);
                let formula = store.get_cell(formula_sheet, row + 1, col);
                assert_eq!(pivot.string(), formula.string(), "{step}, {row}, {col}");
                assert_eq!(pivot.num(), formula.num(), "{step}, {row}, {col}");
            }
        }
    };
    assert_parity(&store, "build");

    // The donor row leaves: the next remaining row names the group, found
    // without a rebuild (one row out of four pairs, one row into four).
    let updates = store.pivot_aggregate_updates(output, 0);
    store.set_string(source, 1, 0, "banana", 0);
    store.recompute(source);
    assert_parity(&store, "donor left");
    assert_eq!(store.pivot_aggregate_updates(output, 0) - updates, 8);

    // A lower row joins with other casing and names the group.
    store.set_string(source, 2, 0, "PEAR", 0);
    store.recompute(source);
    store.set_string(source, 1, 0, "aPPLE", 0);
    store.recompute(source);
    assert_parity(&store, "lower row joined");

    // The donor row changes only its casing.
    store.set_string(source, 1, 0, "APPLE", 0);
    store.recompute(source);
    assert_parity(&store, "donor recased");
}

#[test]
fn pivot_donor_key_edit_updates_groups_without_rebuild() {
    let (mut store, source, output) = fixture(600);
    install(&mut store, output, 600, &[0]);
    let updates = store.pivot_aggregate_updates(output, 0);

    // Row 1 is the first member, so the label row, of region 1 and quarter 1.
    // Both groups keep 299 other rows with the same key.
    store.set_number(source, 1, 0, 0.0, 0);
    store.set_number(source, 1, 1, 0.0, 0);
    store.recompute(source);
    assert_eq!(store.pivot_aggregate_updates(output, 0) - updates, 8);
    assert_eq!(store.get_cell(output, 3, 0).num(), 1.0);
    assert_eq!(store.get_cell(output, 0, 2).num(), 1.0);
}

#[test]
fn pivot_batch_moving_label_rows_together_keeps_groups_consistent() {
    let (mut store, source, output) = fixture(6);
    for (row, key) in ["apple", "apple", "Pear", "pear", "Apple", "Pear"]
        .into_iter()
        .enumerate()
    {
        store.set_string(source, row + 1, 0, key, 0);
    }
    store.commit_sources();
    install(&mut store, output, 6, &[0]);

    // One pass moves the label row and the next member of `apple` together.
    store.set_string(source, 1, 0, "banana", 0);
    store.set_string(source, 2, 0, "BANANA", 0);
    store.recompute(source);
    let labels: Vec<_> = (2..6)
        .map(|row| store.get_cell(output, row, 0).string())
        .collect();
    assert_eq!(
        labels,
        [
            Some("Apple".into()),
            Some("banana".into()),
            Some("Pear".into()),
            Some("Total".into())
        ]
    );

    // One pass moves both `banana` rows away, emptying that group after its
    // label row left. The group must leave its hash chain under its own key.
    store.set_string(source, 1, 0, "kiwi", 0);
    store.set_string(source, 2, 0, "KIWI", 0);
    store.recompute(source);
    let labels: Vec<_> = (2..6)
        .map(|row| store.get_cell(output, row, 0).string())
        .collect();
    assert_eq!(
        labels,
        [
            Some("Apple".into()),
            Some("kiwi".into()),
            Some("Pear".into()),
            Some("Total".into())
        ]
    );
}

#[test]
fn pivot_status_reports_no_output_when_a_source_cell_blocks_the_anchor() {
    let (mut store, _, output) = fixture(12);
    store.set_number(output, 0, 0, 5.0, 0);
    assert!(store.set_pivots(output, &payload(12, (0, 0), &[0]), vec!["pivot".into()]));
    store.recompute(output);
    let spill = FormulaError::Spill.slot() as u32 + 1;
    assert_eq!(store.pivot_status(output), [spill, 0, 0, 0, 0, 0, 0]);
    assert_eq!(store.get_cell(output, 0, 0).num(), 5.0);

    // An empty anchor shows the error itself, so the engine owns that cell.
    store.clear_cell(output, 0, 0, 0);
    store.set_number(output, 2, 1, 9.0, 0);
    store.recompute(output);
    assert_eq!(store.pivot_status(output), [spill, 0, 0, 1, 1, 0, 0]);
}

#[test]
fn pivot_memory_stats_release_cache_when_definition_is_removed() {
    let (mut store, _, output) = fixture(600);
    let metadata = |store: &CellStore| {
        store.store_memory_stats().owners[SHEET_INDEXES_METADATA].allocated_bytes
    };
    let before = metadata(&store);
    install(&mut store, output, 600, &[0]);
    let retained = metadata(&store);
    let cache_bytes = store
        .pivots
        .as_ref()
        .expect("installed registry")
        .retained_bytes();
    // Each source row keeps two group ids and one value contribution.
    const ROW_INDEX_BYTES: usize = 2 * 4 + 1 + 8;
    assert!(cache_bytes > 600 * ROW_INDEX_BYTES);
    assert!(retained >= before + cache_bytes);
    assert!(store.set_pivots(output, &[], Vec::new()));
    store.recompute(output);
    assert!(store.pivots.is_none());
    assert!(metadata(&store) < retained - cache_bytes / 2);
    assert_eq!(store.get_cell(output, 2, 1).kind(), KIND_EMPTY);
}

#[test]
fn pivot_cross_sheet_formula_source_updates_from_external_input() {
    let (mut store, source, output) = fixture(12);
    let input = store.add_sheet(1, 1);
    store.set_sheet_name(input, "input", "Input");
    store.set_number(input, 0, 0, 20.0, 0);
    store.set_formula(source, 6, 2, "=Input!A1", 0);
    store.recompute_changed();
    install(&mut store, output, 12, &[0]);
    assert_eq!(store.get_cell(output, 2, 1).num(), 32.0);
    store.set_number(input, 0, 0, 40.0, 0);
    store.recompute(input);
    assert_eq!(store.get_cell(source, 6, 2).num(), 40.0);
    assert_eq!(store.get_cell(output, 2, 1).num(), 52.0);
}

#[test]
fn pivot_structural_clamp_preserves_both_colliding_anchors_and_recovers() {
    let (mut store, _, output) = fixture(12);
    let mut definitions = payload(12, (0, 0), &[0]);
    let mut second = payload(12, (6, 0), &[0]);
    second[0] = 1.0;
    definitions.extend(second);
    let ids = vec!["pivot".into(), "other".into()];
    assert!(store.set_pivots(output, &definitions, ids.clone()));
    store.recompute(output);
    assert_eq!(store.pivot_status(output)[0], 0);
    assert_eq!(store.pivot_status(output)[7], 0);
    store.remove_rows(output, 0, 7);
    store.recompute(output);
    let status = store.pivot_status(output);
    assert_eq!(status.len(), 14);
    assert_eq!(status[0], FormulaError::Spill.slot() as u32 + 1);
    assert_eq!(status[7], status[0]);
    assert_eq!(
        store.get_cell(output, 0, 0).string().as_deref(),
        Some("#SPILL!")
    );
    let mut clamped = payload(12, (0, 0), &[0]);
    let mut duplicate = clamped.clone();
    duplicate[0] = 1.0;
    clamped.extend(duplicate);
    assert!(store.set_pivots(output, &clamped, ids.clone()));
    store.recompute(output);
    assert_eq!(store.pivot_status(output), status);
    assert!(store.set_pivots(output, &definitions, ids));
    store.recompute(output);
    assert_eq!(store.pivot_status(output)[0], 0);
    assert_eq!(store.pivot_status(output)[7], 0);
    assert_eq!(store.get_cell(output, 2, 1).num(), 18.0);
    assert_eq!(store.get_cell(output, 8, 1).num(), 18.0);
}

/// Source for the multi-level cases: region, city, product, flag (the
/// filter field), quarter (the column field) and sales.
const LEVEL_ROWS: [(&str, &str, &str, f64, f64, f64); 12] = [
    ("North", "Oslo", "Pen", 1.0, 1.0, 10.0),
    ("North", "Bergen", "Ink", 2.0, 2.0, 20.0),
    ("South", "Rome", "Pen", 1.0, 1.0, 30.0),
    ("South", "Rome", "Ink", 3.0, 2.0, 40.0),
    ("North", "oslo", "Pen", 2.0, 2.0, 50.0),
    ("East", "Tokyo", "Ink", 1.0, 1.0, 60.0),
    ("East", "Kyoto", "Pen", 2.0, 2.0, 70.0),
    ("South", "Milan", "Ink", 1.0, 1.0, 80.0),
    ("North", "Bergen", "Pen", 3.0, 1.0, 90.0),
    ("East", "Tokyo", "Pen", 2.0, 2.0, 100.0),
    ("South", "Rome", "Pen", 2.0, 1.0, 110.0),
    ("West", "Lima", "Ink", 1.0, 2.0, 120.0),
];

/// A pivot over [`LEVEL_ROWS`] with all totals and subtotals, a keep-list
/// of flags 1 and 2, and one descending row level.
fn level_payload(
    row_fields: &[usize],
    descending_field: usize,
    aggregation: u32,
    tabular: bool,
) -> Vec<f64> {
    const QUARTER: f64 = 4.0;
    const SALES: f64 = 5.0;
    const FLAG: f64 = 3.0;
    const ALL_TOTALS: f64 = 7.0;
    const TABULAR: f64 = 8.0;
    let mut numbers = vec![0.0, 0.0, 0.0, 0.0, 0.0, 12.0, 5.0, 0.0, 0.0];
    numbers.push(row_fields.len() as f64);
    numbers.extend(row_fields.iter().map(|&field| field as f64));
    numbers.extend([1.0, QUARTER, 1.0, SALES, f64::from(aggregation), -1.0]);
    numbers.extend([1.0, FLAG, 2.0, 1.0, 1.0, 1.0, 2.0]);
    numbers.extend([1.0, 0.0, descending_field as f64, 1.0]);
    numbers.push(ALL_TOTALS + if tabular { TABULAR } else { 0.0 });
    numbers
}

/// The compact label that a `PIVOTBY` row shows across its label columns:
/// `Total` in the first column is the grand total; `Total` after a key marks
/// that key's subtotal; otherwise the row is a leaf.
fn compact_label(formula: &[Option<String>]) -> Option<String> {
    match formula
        .iter()
        .position(|cell| cell.as_deref() == Some("Total"))
    {
        Some(0) => Some("Total".into()),
        Some(level) => formula[level - 1].clone(),
        None => formula.last().cloned().flatten(),
    }
}

/// Installs `payload` on the empty sheet `fresh` as a new pivot, so it is
/// built from scratch, and requires it to match the incremental pivot on
/// `output` cell by cell. This covers what no `PIVOTBY` grid shows, such as
/// DISTINCTCOUNT.
fn assert_matches_fresh_build(
    store: &mut CellStore,
    output: usize,
    fresh: usize,
    payload: &[f64],
    context: &str,
) {
    assert!(store.set_pivots(fresh, &[], Vec::new()));
    store.recompute(fresh);
    assert!(store.set_pivots(fresh, payload, vec!["pivot".into()]));
    store.recompute(fresh);
    let status = store.pivot_status(output);
    assert_eq!(status, store.pivot_status(fresh), "{context}: status");
    let (rows, cols) = (status[3] as usize, status[4] as usize);
    for row in 0..rows {
        for col in 0..cols {
            let incremental = store.get_cell(output, row, col);
            let built = store.get_cell(fresh, row, col);
            assert_eq!(
                incremental.string(),
                built.string(),
                "{context}, {row}, {col}"
            );
            assert_eq!(incremental.num(), built.num(), "{context}, {row}, {col}");
        }
    }
}

#[test]
fn pivot_multi_level_layout_matches_pivotby_through_group_edits() {
    struct Case {
        row_fields: &'static [usize],
        descending_field: usize,
        aggregation: u32,
        /// The `PIVOTBY` function to compare with; `None` for an aggregation
        /// that only the fresh-build check covers.
        function: Option<&'static str>,
        tabular: bool,
    }
    let case = |row_fields, descending_field, aggregation, function, tabular| Case {
        row_fields,
        descending_field,
        aggregation,
        function,
        tabular,
    };
    const DISTINCT_COUNT: u32 = 6;
    let cases = [
        case(&[0, 1], 0, 0, Some("SUM"), true),
        case(&[0, 1], 1, 4, Some("MAX"), true),
        case(&[0, 1, 2], 1, 0, Some("SUM"), true),
        case(&[0, 1, 2], 0, 3, Some("MIN"), true),
        // The default layout: one label column, subtotals above their
        // children, which PIVOTBY shows with a negative total depth.
        case(&[0, 1], 0, 0, Some("SUM"), false),
        case(&[0, 1, 2], 1, 4, Some("MAX"), false),
        case(&[0, 1], 0, DISTINCT_COUNT, None, true),
        case(&[0, 1, 2], 1, DISTINCT_COUNT, None, false),
    ];
    for case in cases {
        let mut store = CellStore::new();
        let source = store.add_sheet(6, 13);
        let output = store.add_sheet(16, 40);
        let formula_sheet = store.add_sheet(16, 40);
        let fresh = store.add_sheet(16, 40);
        store.set_sheet_name(source, "source", "Source");
        for (col, header) in ["Region", "City", "Product", "Flag", "Quarter", "Sales"]
            .into_iter()
            .enumerate()
        {
            store.set_string(source, 0, col, header, 0);
        }
        for (row, (region, city, product, flag, quarter, sales)) in
            LEVEL_ROWS.into_iter().enumerate()
        {
            store.set_string(source, row + 1, 0, region, 0);
            store.set_string(source, row + 1, 1, city, 0);
            store.set_string(source, row + 1, 2, product, 0);
            store.set_number(source, row + 1, 3, flag, 0);
            store.set_number(source, row + 1, 4, quarter, 0);
            store.set_number(source, row + 1, 5, sales, 0);
        }
        store.commit_sources();

        let depth = case.row_fields.len();
        let last_field = ["A", "B", "C"][depth - 1];
        let sort = -(case
            .row_fields
            .iter()
            .position(|&field| field == case.descending_field)
            .expect("the sorted field is a row field") as i32
            + 1);
        let total_depth = if case.tabular {
            depth as i32
        } else {
            -(depth as i32)
        };
        if let Some(function) = case.function {
            store.set_formula(
                formula_sheet,
                0,
                0,
                &format!(
                    "=PIVOTBY(Source!A2:{last_field}13,Source!E2:E13,Source!F2:F13,{function},0,{total_depth},{sort},1,1,Source!D2:D13<>3)"
                ),
                0,
            );
        }
        let payload = level_payload(
            case.row_fields,
            case.descending_field,
            case.aggregation,
            case.tabular,
        );
        assert!(store.set_pivots(output, &payload, vec!["pivot".into()]));
        store.recompute_changed();

        let label = format!(
            "{} {:?} desc {} tabular {}",
            case.function.unwrap_or("DISTINCTCOUNT"),
            case.row_fields,
            case.descending_field,
            case.tabular
        );
        let assert_parity = |store: &CellStore, step: &str| {
            if case.function.is_none() {
                return;
            }
            let status = store.pivot_status(output);
            assert_eq!(status[0], 0, "{label}, {step}");
            let data_rows = status[3] as usize - 2;
            let formula_rows = (1..40)
                .take_while(|&row| {
                    (0..16).any(|col| store.get_cell(formula_sheet, row, col).kind() != KIND_EMPTY)
                })
                .count();
            assert_eq!(data_rows, formula_rows, "{label}, {step}: data rows");
            assert!(
                data_rows > depth,
                "{label}, {step}: the fixture shows groups"
            );

            let pivot_label_cols = if case.tabular { depth } else { 1 };
            let value_cols = 16 - depth;
            // Pivot row 0 holds column keys; row 1 the value caption, which
            // PIVOTBY without field headers does not show.
            for col in 0..value_cols {
                let pivot = store.get_cell(output, 0, pivot_label_cols + col);
                let formula = store.get_cell(formula_sheet, 0, depth + col);
                assert_eq!(
                    pivot.string(),
                    formula.string(),
                    "{label}, {step}, header {col}"
                );
                assert_eq!(pivot.num(), formula.num(), "{label}, {step}, header {col}");
            }
            for row in 0..data_rows {
                // Compact rows list the grand total last; PIVOTBY with totals
                // on top lists it first.
                let formula_row = if case.tabular {
                    row + 1
                } else if row + 1 == data_rows {
                    1
                } else {
                    row + 2
                };
                let formula_labels: Vec<_> = (0..depth)
                    .map(|col| store.get_cell(formula_sheet, formula_row, col).string())
                    .collect();
                let pivot_labels: Vec<_> = (0..pivot_label_cols)
                    .map(|col| store.get_cell(output, row + 2, col).string())
                    .collect();
                let expected = if case.tabular {
                    formula_labels
                } else {
                    vec![compact_label(&formula_labels)]
                };
                assert_eq!(pivot_labels, expected, "{label}, {step}, row {row} labels");
                for col in 0..value_cols {
                    let pivot = store.get_cell(output, row + 2, pivot_label_cols + col);
                    let formula = store.get_cell(formula_sheet, formula_row, depth + col);
                    assert_eq!(
                        pivot.string(),
                        formula.string(),
                        "{label}, {step}, {row}, {col}"
                    );
                    assert_eq!(pivot.num(), formula.num(), "{label}, {step}, {row}, {col}");
                }
            }
        };
        assert_parity(&store, "build");
        assert_matches_fresh_build(
            &mut store,
            output,
            fresh,
            &payload,
            &format!("{label}, build"),
        );

        let steps: [(&str, usize, usize, &str); 5] = [
            ("new leaf group", 2, 1, "Trondheim"),
            ("row moves to another parent", 6, 0, "South"),
            ("whole group emptied", 12, 0, "East"),
            ("new top-level group", 7, 0, "Central"),
            ("label row changes case", 1, 1, "OSLO"),
        ];
        for (step, row, col, text) in steps {
            store.set_string(source, row, col, text, 0);
            store.recompute_changed();
            assert_parity(&store, step);
            assert_matches_fresh_build(
                &mut store,
                output,
                fresh,
                &payload,
                &format!("{label}, {step}"),
            );
        }
        // Emptying a group with no new group in the same edit is the only
        // change that needs the removal alone to lay the output out again.
        for (step, row, flag) in [
            ("row filtered out", 3, 3.0),
            ("whole group filtered out", 8, 3.0),
            ("moved group filtered out", 12, 3.0),
            ("row filtered in", 4, 1.0),
        ] {
            store.set_number(source, row, 3, flag, 0);
            store.recompute_changed();
            assert_parity(&store, step);
            assert_matches_fresh_build(
                &mut store,
                output,
                fresh,
                &payload,
                &format!("{label}, {step}"),
            );
        }
    }
}
