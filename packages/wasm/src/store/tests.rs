//! Pivot table tests for the store, through the `setPivots` wire format. The
//! file is named `tests.rs` so coverage leaves it out like the crate's other tests.

use super::pivots::STATUS_STRIDE;
use super::*;

// Wire codes of `setPivots` (see `CellStore::set_pivots`), pinned here so the
// tests fail when the format changes.
const SOURCE_RANGE: f64 = 0.0;
const FILTER_NUMBER: f64 = 1.0;
const SORT_ROWS: f64 = 0.0;
const DESCENDING: f64 = 1.0;
const NO_NAME: f64 = -1.0;
const ROW_TOTALS: u32 = 1;
const COLUMN_TOTALS: u32 = 1 << 1;
const SUBTOTALS: u32 = 1 << 2;
const TABULAR: u32 = 1 << 3;

/// Aggregation codes of a value field.
pub(super) const SUM: u32 = 0;
const COUNT: u32 = 1;
const AVERAGE: u32 = 2;
const MIN: u32 = 3;
const MAX: u32 = 4;
const COUNTA: u32 = 5;
const DISTINCT_COUNT: u32 = 6;

// Slots of one `pivotStatus` record.
const STATUS_ERROR: usize = 0;
const STATUS_ANCHOR: std::ops::Range<usize> = 1..3;
const STATUS_ROWS: usize = 3;
const STATUS_COLS: usize = 4;

/// The fixture's source fields.
const REGION: usize = 0;
const QUARTER: usize = 1;
const SALES: usize = 2;

/// Fixture sizes for work counts: an edit that costs the same on both proves
/// its work does not grow with the source.
const WORK_FIXTURE_ROWS: [usize; 2] = [60, 600];

/// One pivot in the `setPivots` wire layout: `[id, sourceKind, sourceSheet,
/// r0, c0, r1, c1, anchorRow, anchorCol, nRows, ...rowFields, nCols,
/// ...colFields, nValues, ...(field, aggregation, name), nFilters,
/// ...(field, nValues, ...(kind, value)), nSort, ...(axis, field,
/// descending), flags]`. The source is a range from A1 whose row 0 holds the
/// field headers; every value field reads `value_field` without a custom
/// name.
pub(super) struct PivotPayload<'a> {
    /// Index of the pivot id in the strings sent alongside.
    pub(super) id: u32,
    pub(super) source: usize,
    pub(super) last_row: usize,
    pub(super) last_col: usize,
    pub(super) anchor: (u32, u32),
    pub(super) rows: &'a [usize],
    pub(super) columns: &'a [usize],
    pub(super) value_field: usize,
    /// One value field per aggregation.
    pub(super) aggregations: &'a [u32],
    /// Number keep-lists per field.
    pub(super) filters: &'a [(usize, &'a [f64])],
    /// Row fields sorted descending; the rest sort ascending.
    pub(super) descending_rows: &'a [usize],
    pub(super) flags: u32,
}

impl Default for PivotPayload<'_> {
    fn default() -> Self {
        Self {
            id: 0,
            source: 0,
            last_row: 0,
            last_col: 0,
            anchor: (0, 0),
            rows: &[],
            columns: &[],
            value_field: 0,
            aggregations: &[],
            filters: &[],
            descending_rows: &[],
            flags: ROW_TOTALS | COLUMN_TOTALS,
        }
    }
}

impl PivotPayload<'_> {
    pub(super) fn numbers(&self) -> Vec<f64> {
        let mut numbers = vec![
            f64::from(self.id),
            SOURCE_RANGE,
            self.source as f64,
            0.0,
            0.0,
            self.last_row as f64,
            self.last_col as f64,
            f64::from(self.anchor.0),
            f64::from(self.anchor.1),
        ];

        for fields in [self.rows, self.columns] {
            numbers.push(fields.len() as f64);
            numbers.extend(fields.iter().map(|&field| field as f64));
        }

        numbers.push(self.aggregations.len() as f64);
        for &aggregation in self.aggregations {
            numbers.extend([self.value_field as f64, f64::from(aggregation), NO_NAME]);
        }

        numbers.push(self.filters.len() as f64);
        for &(field, keep) in self.filters {
            numbers.extend([field as f64, keep.len() as f64]);
            for &value in keep {
                numbers.extend([FILTER_NUMBER, value]);
            }
        }

        numbers.push(self.descending_rows.len() as f64);
        for &field in self.descending_rows {
            numbers.extend([SORT_ROWS, field as f64, DESCENDING]);
        }

        numbers.push(f64::from(self.flags));
        numbers
    }
}

/// The fixture pivot: regions down, quarters across and one sales value field
/// per aggregation, over `rows` data rows of `source`.
fn fixture_pivot(source: usize, rows: usize, aggregations: &[u32]) -> PivotPayload<'_> {
    PivotPayload {
        source,
        last_row: rows,
        last_col: SALES,
        rows: &[REGION],
        columns: &[QUARTER],
        value_field: SALES,
        aggregations,
        ..PivotPayload::default()
    }
}

/// A store whose `source` sheet holds `rows` data rows (row `r` is in region
/// `r % 2` and quarter `r % 3` and sells `r`), and an empty `output` sheet.
fn fixture(rows: usize) -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let source = store.add_sheet(3, rows + 1);
    let output = store.add_sheet(32, rows + 10);

    for (col, header) in ["Region", "Quarter", "Sales"].iter().enumerate() {
        store.set_string(source, 0, col, header, 0);
    }
    for row in 1..=rows {
        store.set_number(source, row, REGION, (row % 2) as f64, 0);
        store.set_number(source, row, QUARTER, (row % 3) as f64, 0);
        store.set_number(source, row, SALES, row as f64, 0);
    }
    store.commit_sources();

    (store, source, output)
}

/// Installs the fixture pivot at A1 of `output` and requires its output.
fn install(store: &mut CellStore, source: usize, output: usize, rows: usize, aggregations: &[u32]) {
    let payload = fixture_pivot(source, rows, aggregations).numbers();
    assert!(store.set_pivots(output, &payload, vec!["pivot".into()]));
    store.recompute(output);

    let status = store.pivot_status(output);
    assert_eq!(status[STATUS_ERROR], 0);
    assert!(status[STATUS_ROWS] > 0, "the pivot installed output");
}

/// The status of a pivot that shows `#SPILL!`.
fn spill_status() -> u32 {
    FormulaError::Spill.slot() as u32 + 1
}

/// The aggregate updates and output cell reads that `edit` costs the fixture
/// SUM pivot, for each size in [`WORK_FIXTURE_ROWS`].
fn edit_work(edit: impl Fn(&mut CellStore, usize)) -> [(usize, usize); 2] {
    WORK_FIXTURE_ROWS.map(|rows| {
        let (mut store, source, output) = fixture(rows);
        install(&mut store, source, output, rows, &[SUM]);
        let updates = store.pivot_aggregate_updates(output, 0);
        let reads = store.pivot_output_reads(output, 0);

        edit(&mut store, source);
        store.recompute(source);

        (
            store.pivot_aggregate_updates(output, 0) - updates,
            store.pivot_output_reads(output, 0) - reads,
        )
    })
}

#[test]
fn pivot_edit_work_does_not_grow_with_source_rows() {
    let sales_edit = edit_work(|store, source| store.set_number(source, 6, SALES, 106.0, 0));
    // Row 1 is the first member, so the label row, of region 1 and quarter 1;
    // both groups keep other rows that must name them without a rebuild.
    let key_edit = edit_work(|store, source| {
        store.set_number(source, 1, REGION, 0.0, 0);
        store.set_number(source, 1, QUARTER, 0.0, 0);
    });

    // A rebuild restarts the counter at its build count, so equal deltas alone
    // could hide one; an update touches fewer rows than the small fixture has.
    for (edit, [small, large]) in [("sales edit", sales_edit), ("key edit", key_edit)] {
        assert!(small.0 > 0 && small.1 > 0, "{edit}: the pivot updated");
        assert!(small.0 < WORK_FIXTURE_ROWS[0], "{edit}: no rebuild");
        assert_eq!(small, large, "{edit}: work per fixture size");
    }
}

#[test]
fn pivot_formula_free_output_survives_edits() {
    let (mut store, source, output) = fixture(600);
    install(&mut store, source, output, 600, &[SUM]);
    assert_eq!(store.get_cell(output, 2, 1).num(), 30_300.0);

    store.set_number(source, 6, SALES, 106.0, 0);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 2, 1).num(), 30_400.0);

    store.set_number(output, 9, 20, 7.0, 0);
    store.recompute(output);

    assert_eq!(store.get_cell(output, 2, 1).num(), 30_400.0);
    assert_eq!(store.formula_source(output, 0, 0), None);
    assert!(store.sheets[output].formulas.is_empty());
}

#[test]
fn pivot_fields_report_source_headers_and_types() {
    let (mut store, source, output) = fixture(12);
    install(&mut store, source, output, 12, &[SUM]);

    let fields = store.pivot_fields(output, 0);

    assert_eq!(fields.names(), ["Region", "Quarter", "Sales"]);
    assert_eq!(fields.types(), [1, 1, 1]);
}

#[test]
fn pivot_min_max_and_distinct_remove_old_contributions() {
    let (mut store, source, output) = fixture(12);
    install(&mut store, source, output, 12, &[MIN, MAX, DISTINCT_COUNT]);
    assert_eq!(store.get_cell(output, 2, 1).num(), 6.0);
    assert_eq!(store.get_cell(output, 2, 2).num(), 12.0);
    assert_eq!(store.get_cell(output, 2, 3).num(), 2.0);

    store.set_number(source, 6, SALES, 12.0, 0);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 2, 1).num(), 12.0);
    assert_eq!(store.get_cell(output, 2, 2).num(), 12.0);
    assert_eq!(store.get_cell(output, 2, 3).num(), 1.0);

    store.set_number(source, 12, SALES, 5.0, 0);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 2, 1).num(), 5.0);
    assert_eq!(store.get_cell(output, 2, 2).num(), 12.0);
    assert_eq!(store.get_cell(output, 2, 3).num(), 2.0);
}

#[test]
fn pivot_blocker_retry_and_own_source_overlap() {
    let (mut store, source, output) = fixture(12);
    store.set_number(output, 2, 1, 99.0, 0);
    let payload = fixture_pivot(source, 12, &[SUM]).numbers();

    assert!(store.set_pivots(output, &payload, vec!["pivot".into()]));
    store.recompute(output);
    assert_eq!(
        store.get_cell(output, 0, 0).string().as_deref(),
        Some("#SPILL!")
    );

    store.clear_cell(output, 2, 1, 0);
    store.recompute(output);
    assert_eq!(store.pivot_status(output)[STATUS_ERROR], 0);
    assert_eq!(store.get_cell(output, 2, 1).num(), 18.0);

    // Widen the source over five blank columns that no field reads, and
    // anchor there. Output into those cells would not change the pivot, so
    // only the own-source check, not a feedback loop, can refuse it.
    const BLANK_COLS: usize = 5;
    store.insert_cols(source, SALES + 1, BLANK_COLS);
    store.recompute(source);
    let overlap = PivotPayload {
        last_col: SALES + BLANK_COLS,
        anchor: (5, 3),
        ..fixture_pivot(source, 12, &[SUM])
    };

    assert!(store.set_pivots(source, &overlap.numbers(), vec!["overlap".into()]));
    store.recompute(source);

    assert_eq!(store.pivot_status(source)[STATUS_ERROR], spill_status());
    assert_eq!(
        store.get_cell(source, 5, 3).string().as_deref(),
        Some("#SPILL!")
    );
    assert_eq!(store.get_cell(source, 6, 4).kind(), KIND_EMPTY);
}

#[test]
fn pivot_formula_source_and_output_dependents_settle() {
    let (mut store, source, output) = fixture(12);
    store.set_number(source, 0, SALES, 10.0, 0);
    store.set_formula(source, 6, SALES, "=C1*2", 0);
    store.recompute(source);
    store.set_formula(output, 9, 20, "=B3*2", 0);
    install(&mut store, source, output, 12, &[SUM]);
    assert_eq!(store.get_cell(output, 9, 20).num(), 64.0);

    store.set_number(source, 0, SALES, 20.0, 0);
    store.recompute(source);

    assert_eq!(store.get_cell(output, 2, 1).num(), 52.0);
    assert_eq!(store.get_cell(output, 9, 20).num(), 104.0);
}

#[test]
fn pivot_structural_edits_shift_and_clamp_the_anchor() {
    let (mut store, source, output) = fixture(12);
    // `fixture(12)` gives the output sheet 22 rows; the pivot spills 5 rows
    // and 5 columns, with region 0, quarter 0 at offset (2, 1).
    let mut height = 22;
    let pivot = PivotPayload {
        anchor: (14, 2),
        ..fixture_pivot(source, 12, &[SUM])
    };
    assert!(store.set_pivots(output, &pivot.numbers(), vec!["pivot".into()]));
    store.recompute(output);
    assert_eq!(store.get_cell(output, 16, 3).num(), 18.0);

    store.add_rows(source, 6, 1);
    store.set_number(source, 6, REGION, 0.0, 0);
    store.set_number(source, 6, QUARTER, 0.0, 0);
    store.set_number(source, 6, SALES, 100.0, 0);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 16, 3).num(), 118.0);

    store.remove_rows(source, 6, 1);
    store.recompute(source);
    assert_eq!(store.get_cell(output, 16, 3).num(), 18.0);

    store.remove_rows(output, 0, 1);
    height -= 1;
    store.remove_cols(output, 0, 1);
    store.recompute(output);
    let anchor_row = 13;
    assert_eq!(&store.pivot_status(output)[STATUS_ANCHOR], &[anchor_row, 1]);
    assert_eq!(store.get_cell(output, 15, 2).num(), 18.0);

    // Deleting the trailing rows that hold the anchor leaves it on the new
    // last row, as core moves it, where the output no longer fits.
    store.remove_rows(output, anchor_row as usize, height - anchor_row as usize);
    store.recompute(output);

    let last_row = anchor_row - 1;
    let status = store.pivot_status(output);
    assert_eq!(&status[STATUS_ANCHOR], &[last_row, 1]);
    assert_eq!(status[STATUS_ERROR], spill_status());
    assert_eq!(
        store
            .get_cell(output, last_row as usize, 1)
            .string()
            .as_deref(),
        Some("#SPILL!")
    );
}

#[test]
fn pivot_aggregations_match_pivotby_with_shared_keys_and_totals() {
    for (aggregation, function) in [
        (SUM, "SUM"),
        (COUNT, "COUNT"),
        (AVERAGE, "AVERAGE"),
        (MIN, "MIN"),
        (MAX, "MAX"),
        (COUNTA, "COUNTA"),
    ] {
        let (mut store, source, output) = fixture(12);
        install(&mut store, source, output, 12, &[aggregation]);
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
    const SALES_VALUES: [f64; 12] = [
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
    for (aggregation, function, ulps) in [(SUM, "SUM", 1), (AVERAGE, "AVERAGE", 2)] {
        let (mut store, source, output) = fixture(12);
        for (row, sales) in SALES_VALUES.into_iter().enumerate() {
            store.set_number(source, row + 1, SALES, sales, 0);
        }
        store.commit_sources();
        install(&mut store, source, output, 12, &[aggregation]);
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
        let payload = fixture_pivot(source, 12, &[aggregation]).numbers();

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
                Some(sales) => store.set_number(source, row, SALES, sales, 0),
                None => store.clear_cell(source, row, SALES, 0),
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
        store.set_string(source, row + 1, REGION, key, 0);
    }
    store.commit_sources();
    install(&mut store, source, output, 6, &[SUM]);
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

    // The donor row leaves: the next remaining row names the group.
    store.set_string(source, 1, REGION, "banana", 0);
    store.recompute(source);
    assert_parity(&store, "donor left");

    // A lower row joins with other casing and names the group.
    store.set_string(source, 2, REGION, "PEAR", 0);
    store.recompute(source);
    store.set_string(source, 1, REGION, "aPPLE", 0);
    store.recompute(source);
    assert_parity(&store, "lower row joined");

    // The donor row changes only its casing.
    store.set_string(source, 1, REGION, "APPLE", 0);
    store.recompute(source);
    assert_parity(&store, "donor recased");
}

#[test]
fn pivot_donor_key_edit_moves_its_row_between_groups() {
    let (mut store, source, output) = fixture(12);
    install(&mut store, source, output, 12, &[SUM]);
    let fresh = store.add_sheet(32, 22);
    let total_col = store.pivot_status(output)[STATUS_COLS] as usize - 1;
    let (region_0_row, region_1_row) = (2, 3);
    let region_total = |store: &CellStore, row| store.get_cell(output, row, total_col).num();
    let (region_0, region_1) = (
        region_total(&store, region_0_row),
        region_total(&store, region_1_row),
    );

    // Row 1 is the first member, so the label row, of region 1 and quarter 1.
    // Both groups keep other rows with the same key.
    store.set_number(source, 1, REGION, 0.0, 0);
    store.set_number(source, 1, QUARTER, 0.0, 0);
    store.recompute(source);

    // Row 1 sells 1.
    assert_eq!(region_total(&store, region_0_row), region_0 + 1.0);
    assert_eq!(region_total(&store, region_1_row), region_1 - 1.0);
    assert_matches_fresh_build(
        &mut store,
        output,
        fresh,
        &fixture_pivot(source, 12, &[SUM]).numbers(),
        "donor key edit",
    );
}

#[test]
fn pivot_batch_moving_label_rows_together_keeps_groups_consistent() {
    let (mut store, source, output) = fixture(6);
    for (row, key) in ["apple", "apple", "Pear", "pear", "Apple", "Pear"]
        .into_iter()
        .enumerate()
    {
        store.set_string(source, row + 1, REGION, key, 0);
    }
    store.commit_sources();
    install(&mut store, source, output, 6, &[SUM]);
    let row_labels = |store: &CellStore| -> Vec<_> {
        (2..6)
            .map(|row| store.get_cell(output, row, 0).string())
            .collect()
    };

    // One pass moves the label row and the next member of `apple` together.
    store.set_string(source, 1, REGION, "banana", 0);
    store.set_string(source, 2, REGION, "BANANA", 0);
    store.recompute(source);

    assert_eq!(
        row_labels(&store),
        [
            Some("Apple".into()),
            Some("banana".into()),
            Some("Pear".into()),
            Some("Total".into())
        ]
    );

    // One pass moves both `banana` rows away, emptying that group after its
    // label row left. The group must leave its hash chain under its own key.
    store.set_string(source, 1, REGION, "kiwi", 0);
    store.set_string(source, 2, REGION, "KIWI", 0);
    store.recompute(source);

    assert_eq!(
        row_labels(&store),
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
    let (mut store, source, output) = fixture(12);
    store.set_number(output, 0, 0, 5.0, 0);
    let payload = fixture_pivot(source, 12, &[SUM]).numbers();

    assert!(store.set_pivots(output, &payload, vec!["pivot".into()]));
    store.recompute(output);

    let spill = spill_status();
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
    const ROWS: usize = 600;
    // Each source row keeps two group ids and one value contribution.
    const ROW_INDEX_BYTES: usize = 2 * 4 + 1 + 8;
    let (mut store, source, output) = fixture(ROWS);
    let metadata = |store: &CellStore| {
        store.store_memory_stats().owners[SHEET_INDEXES_METADATA].allocated_bytes
    };
    let before = metadata(&store);

    install(&mut store, source, output, ROWS, &[SUM]);

    let retained = metadata(&store);
    let cache_bytes = store
        .pivots
        .as_ref()
        .expect("installed registry")
        .retained_bytes();
    assert!(cache_bytes > ROWS * ROW_INDEX_BYTES);
    assert!(retained >= before + cache_bytes);

    assert!(store.set_pivots(output, &[], Vec::new()));
    store.recompute(output);

    assert!(store.pivots.is_none());
    // This owner also counts the dependency graph and sheet indexes, whose
    // capacity estimates can change when the removal recomputes, so require
    // only that most of the cache was released, not its exact size.
    assert!(metadata(&store) < retained - cache_bytes / 2);
    assert_eq!(store.get_cell(output, 2, 1).kind(), KIND_EMPTY);
}

#[test]
fn pivot_cross_sheet_formula_source_updates_from_external_input() {
    let (mut store, source, output) = fixture(12);
    let input = store.add_sheet(1, 1);
    store.set_sheet_name(input, "input", "Input");
    store.set_number(input, 0, 0, 20.0, 0);
    store.set_formula(source, 6, SALES, "=Input!A1", 0);
    store.recompute_changed();
    install(&mut store, source, output, 12, &[SUM]);
    assert_eq!(store.get_cell(output, 2, 1).num(), 32.0);

    store.set_number(input, 0, 0, 40.0, 0);
    store.recompute(input);

    assert_eq!(store.get_cell(source, 6, SALES).num(), 40.0);
    assert_eq!(store.get_cell(output, 2, 1).num(), 52.0);
}

#[test]
fn pivot_structural_clamp_preserves_both_colliding_anchors_and_recovers() {
    let (mut store, source, output) = fixture(12);
    let first = fixture_pivot(source, 12, &[SUM]);
    let second = PivotPayload {
        id: 1,
        anchor: (6, 0),
        ..fixture_pivot(source, 12, &[SUM])
    };
    let mut definitions = first.numbers();
    definitions.extend(second.numbers());
    let ids = vec!["pivot".into(), "other".into()];
    assert!(store.set_pivots(output, &definitions, ids.clone()));
    store.recompute(output);
    assert_eq!(store.pivot_status(output)[STATUS_ERROR], 0);
    assert_eq!(store.pivot_status(output)[STATUS_STRIDE + STATUS_ERROR], 0);

    store.remove_rows(output, 0, 7);
    store.recompute(output);

    let status = store.pivot_status(output);
    assert_eq!(status.len(), 2 * STATUS_STRIDE);
    assert_eq!(status[STATUS_ERROR], spill_status());
    assert_eq!(status[STATUS_STRIDE + STATUS_ERROR], status[STATUS_ERROR]);
    assert_eq!(
        store.get_cell(output, 0, 0).string().as_deref(),
        Some("#SPILL!")
    );

    // Core sends the clamped anchors back; the collision stays.
    let mut clamped = first.numbers();
    clamped.extend(
        PivotPayload {
            id: 1,
            ..fixture_pivot(source, 12, &[SUM])
        }
        .numbers(),
    );
    assert!(store.set_pivots(output, &clamped, ids.clone()));
    store.recompute(output);
    assert_eq!(store.pivot_status(output), status);

    assert!(store.set_pivots(output, &definitions, ids));
    store.recompute(output);

    assert_eq!(store.pivot_status(output)[STATUS_ERROR], 0);
    assert_eq!(store.pivot_status(output)[STATUS_STRIDE + STATUS_ERROR], 0);
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
const LEVEL_HEADERS: [&str; 6] = ["Region", "City", "Product", "Flag", "Quarter", "Sales"];
const LEVEL_FLAG: usize = 3;
const LEVEL_QUARTER: usize = 4;
const LEVEL_SALES: usize = 5;
/// The flags the multi-level filter keeps; flag 3 rows are filtered out.
const LEVEL_KEPT_FLAGS: [f64; 2] = [1.0, 2.0];
const LEVEL_SHEET_ROWS: usize = 40;
const LEVEL_SHEET_COLS: usize = 16;

/// One multi-level case over [`LEVEL_ROWS`]: all totals and subtotals, the
/// [`LEVEL_KEPT_FLAGS`] filter, and one descending row level.
struct LevelCase {
    row_fields: &'static [usize],
    descending_field: usize,
    aggregation: u32,
    /// The `PIVOTBY` function to compare with; `None` for an aggregation
    /// that only the fresh-build check covers.
    function: Option<&'static str>,
    tabular: bool,
}

impl LevelCase {
    fn label(&self) -> String {
        format!(
            "{} {:?} desc {} tabular {}",
            self.function.unwrap_or("DISTINCTCOUNT"),
            self.row_fields,
            self.descending_field,
            self.tabular
        )
    }

    fn payload(&self) -> Vec<f64> {
        let layout = if self.tabular { TABULAR } else { 0 };
        PivotPayload {
            last_row: LEVEL_ROWS.len(),
            last_col: LEVEL_SALES,
            rows: self.row_fields,
            columns: &[LEVEL_QUARTER],
            value_field: LEVEL_SALES,
            aggregations: &[self.aggregation],
            filters: &[(LEVEL_FLAG, &LEVEL_KEPT_FLAGS[..])],
            descending_rows: &[self.descending_field],
            flags: ROW_TOTALS | COLUMN_TOTALS | SUBTOTALS | layout,
            ..PivotPayload::default()
        }
        .numbers()
    }

    /// The `PIVOTBY` formula with the same levels, sort, totals and filter.
    fn pivotby(&self, function: &str) -> String {
        let depth = self.row_fields.len();
        let last_field = ["A", "B", "C"][depth - 1];
        let sort = -(self
            .row_fields
            .iter()
            .position(|&field| field == self.descending_field)
            .expect("the sorted field is a row field") as i32
            + 1);
        // A negative total depth puts subtotals above their children, as the
        // compact layout does.
        let total_depth = if self.tabular {
            depth as i32
        } else {
            -(depth as i32)
        };
        format!(
            "=PIVOTBY(Source!A2:{last_field}13,Source!E2:E13,Source!F2:F13,{function},0,{total_depth},{sort},1,1,Source!D2:D13<>3)"
        )
    }
}

/// The sheets of a multi-level case: [`LEVEL_ROWS`] on `source`, the pivot
/// on `output`, `PIVOTBY` on `formula_sheet`, and `fresh` for
/// [`assert_matches_fresh_build`].
struct LevelStore {
    store: CellStore,
    source: usize,
    output: usize,
    formula_sheet: usize,
    fresh: usize,
}

fn level_store() -> LevelStore {
    let mut store = CellStore::new();
    let source = store.add_sheet(LEVEL_HEADERS.len(), LEVEL_ROWS.len() + 1);
    let output = store.add_sheet(LEVEL_SHEET_COLS, LEVEL_SHEET_ROWS);
    let formula_sheet = store.add_sheet(LEVEL_SHEET_COLS, LEVEL_SHEET_ROWS);
    let fresh = store.add_sheet(LEVEL_SHEET_COLS, LEVEL_SHEET_ROWS);
    store.set_sheet_name(source, "source", "Source");

    for (col, header) in LEVEL_HEADERS.into_iter().enumerate() {
        store.set_string(source, 0, col, header, 0);
    }
    for (row, (region, city, product, flag, quarter, sales)) in LEVEL_ROWS.into_iter().enumerate() {
        store.set_string(source, row + 1, 0, region, 0);
        store.set_string(source, row + 1, 1, city, 0);
        store.set_string(source, row + 1, 2, product, 0);
        store.set_number(source, row + 1, LEVEL_FLAG, flag, 0);
        store.set_number(source, row + 1, LEVEL_QUARTER, quarter, 0);
        store.set_number(source, row + 1, LEVEL_SALES, sales, 0);
    }
    store.commit_sources();

    LevelStore {
        store,
        source,
        output,
        formula_sheet,
        fresh,
    }
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

/// Requires the pivot of `case` to match a fresh build and, when the case
/// has a `PIVOTBY` function, the formula's grid cell by cell.
fn assert_level_parity(level: &mut LevelStore, case: &LevelCase, step: &str) {
    let label = case.label();
    assert_matches_fresh_build(
        &mut level.store,
        level.output,
        level.fresh,
        &case.payload(),
        &format!("{label}, {step}"),
    );
    if case.function.is_none() {
        return;
    }

    let LevelStore {
        store,
        output,
        formula_sheet,
        ..
    } = level;
    let (output, formula_sheet) = (*output, *formula_sheet);
    let depth = case.row_fields.len();
    let status = store.pivot_status(output);
    assert_eq!(status[STATUS_ERROR], 0, "{label}, {step}");

    // The pivot's two header rows (column keys, value caption) precede its
    // data rows; PIVOTBY shows one header row.
    let data_rows = status[STATUS_ROWS] as usize - 2;
    let formula_rows = (1..LEVEL_SHEET_ROWS)
        .take_while(|&row| {
            (0..LEVEL_SHEET_COLS)
                .any(|col| store.get_cell(formula_sheet, row, col).kind() != KIND_EMPTY)
        })
        .count();
    assert_eq!(data_rows, formula_rows, "{label}, {step}: data rows");
    assert!(
        data_rows > depth,
        "{label}, {step}: the fixture shows groups"
    );

    let pivot_label_cols = if case.tabular { depth } else { 1 };
    let value_cols = LEVEL_SHEET_COLS - depth;
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
    let (rows, cols) = (status[STATUS_ROWS] as usize, status[STATUS_COLS] as usize);
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
    let case = |row_fields, descending_field, aggregation, function, tabular| LevelCase {
        row_fields,
        descending_field,
        aggregation,
        function,
        tabular,
    };
    let cases = [
        case(&[0, 1], 0, SUM, Some("SUM"), true),
        case(&[0, 1], 1, MAX, Some("MAX"), true),
        case(&[0, 1, 2], 1, SUM, Some("SUM"), true),
        case(&[0, 1, 2], 0, MIN, Some("MIN"), true),
        // The default layout: one label column, subtotals above their
        // children.
        case(&[0, 1], 0, SUM, Some("SUM"), false),
        case(&[0, 1, 2], 1, MAX, Some("MAX"), false),
        case(&[0, 1], 0, DISTINCT_COUNT, None, true),
        case(&[0, 1, 2], 1, DISTINCT_COUNT, None, false),
    ];
    let group_edits: [(&str, usize, usize, &str); 5] = [
        ("new leaf group", 2, 1, "Trondheim"),
        ("row moves to another parent", 6, 0, "South"),
        ("whole group emptied", 12, 0, "East"),
        ("new top-level group", 7, 0, "Central"),
        ("label row changes case", 1, 1, "OSLO"),
    ];
    // Emptying a group with no new group in the same edit is the only
    // change that needs the removal alone to lay the output out again.
    let filter_edits = [
        ("row filtered out", 3, 3.0),
        ("whole group filtered out", 8, 3.0),
        ("moved group filtered out", 12, 3.0),
        ("row filtered in", 4, 1.0),
    ];

    for case in cases {
        let mut level = level_store();
        if let Some(function) = case.function {
            let formula = case.pivotby(function);
            level
                .store
                .set_formula(level.formula_sheet, 0, 0, &formula, 0);
        }

        assert!(level
            .store
            .set_pivots(level.output, &case.payload(), vec!["pivot".into()]));
        level.store.recompute_changed();
        assert_level_parity(&mut level, &case, "build");

        for (step, row, col, text) in group_edits {
            level.store.set_string(level.source, row, col, text, 0);
            level.store.recompute_changed();
            assert_level_parity(&mut level, &case, step);
        }
        for (step, row, flag) in filter_edits {
            level
                .store
                .set_number(level.source, row, LEVEL_FLAG, flag, 0);
            level.store.recompute_changed();
            assert_level_parity(&mut level, &case, step);
        }
    }
}

/// A lookup-flattened range and model pivot over the same generated orders.
/// The oracle joins by a linear scan, independent of the engine's index.
struct RelatedFixture {
    store: CellStore,
    orders: usize,
    customers: usize,
    regions: usize,
    flat: usize,
    model_output: usize,
    flat_output: usize,
    keys: Vec<Option<usize>>,
    customer_regions: Vec<Option<usize>>,
}

impl RelatedFixture {
    fn new(rows: usize) -> Self {
        let mut store = CellStore::new();
        let orders = store.add_sheet(2, rows + 1);
        let customers = store.add_sheet(3, 10);
        let regions = store.add_sheet(2, 5);
        let flat = store.add_sheet(4, rows + 1);
        let model_output = store.add_sheet(32, 100);
        let flat_output = store.add_sheet(32, 100);
        let keys: Vec<_> = (0..rows)
            .map(|row| (row % 11 != 0).then_some(row * 7 % 12))
            .collect();
        let customer_regions: Vec<_> = (0..9)
            .map(|row| (row % 4 != 0).then_some(row % 5))
            .collect();

        for (table_id, sheet, last_row, ids) in [
            ("orders", orders, rows, vec!["customer", "amount"]),
            ("customers", customers, 9, vec!["id", "region", "credit"]),
            ("regions", regions, 4, vec!["id", "name"]),
        ] {
            assert!(store.set_table(
                table_id,
                table_id,
                sheet,
                0,
                0,
                last_row,
                ids.len() - 1,
                true,
                false,
                ids.iter().map(|id| id.to_string()).collect(),
                ids.iter().map(|id| id.to_string()).collect(),
            ));
        }
        for (row, key) in keys.iter().enumerate() {
            if let Some(key) = key {
                store.set_string(orders, row + 1, 0, &format!("c{key}"), 0);
            }
            store.set_number(orders, row + 1, 1, (row % 17) as f64, 0);
        }
        for (row, region) in customer_regions.iter().enumerate() {
            store.set_string(customers, row + 1, 0, &format!("C{row}"), 0);
            if let Some(region) = region {
                store.set_number(customers, row + 1, 1, *region as f64, 0);
            }
            store.set_number(customers, row + 1, 2, (row * 3) as f64, 0);
        }
        for row in 0..4 {
            store.set_number(regions, row + 1, 0, row as f64, 0);
            store.set_string(regions, row + 1, 1, &format!("Region {row}"), 0);
        }
        assert!(store.set_relationships(
            [
                "r1",
                "orders",
                "customer",
                "customers",
                "id",
                "r2",
                "customers",
                "region",
                "regions",
                "id"
            ]
            .map(String::from)
            .to_vec(),
        ));
        for (col, header) in ["name", "credit", "amount", "customer"].iter().enumerate() {
            store.set_string(flat, 0, col, header, 0);
        }
        let mut fixture = Self {
            store,
            orders,
            customers,
            regions,
            flat,
            model_output,
            flat_output,
            keys,
            customer_regions,
        };
        fixture.flatten();
        fixture
    }

    fn flatten(&mut self) {
        for (row, key) in self.keys.iter().enumerate() {
            let customer = key.and_then(|key| (0..9).find(|&candidate| candidate == key));
            let region = customer
                .and_then(|customer| self.customer_regions[customer])
                .and_then(|key| (0..4).find(|&candidate| candidate == key));
            for col in 0..4 {
                self.store.clear_cell(self.flat, row + 1, col, 0);
            }
            if let Some(region) = region {
                self.store
                    .set_string(self.flat, row + 1, 0, &format!("Region {region}"), 0);
            }
            if let Some(customer) = customer {
                self.store
                    .set_number(self.flat, row + 1, 1, (customer * 3) as f64, 0);
            }
            self.store
                .set_number(self.flat, row + 1, 2, (row % 17) as f64, 0);
            if let Some(key) = key {
                self.store
                    .set_string(self.flat, row + 1, 3, &format!("c{key}"), 0);
            }
        }
    }

    fn install(&mut self, value_field: usize, aggregations: &[u32]) {
        let payload = PivotPayload {
            source: self.flat,
            last_row: self.keys.len(),
            last_col: 3,
            rows: &[0],
            columns: &[],
            value_field,
            aggregations,
            ..PivotPayload::default()
        }
        .numbers();
        assert!(self
            .store
            .set_pivots(self.flat_output, &payload, vec!["flat".into()]));

        // Model source: kind 3, base table, field count, then table/column pairs.
        let mut model = payload;
        model.splice(
            1..7,
            [3.0, 1.0, 4.0, 2.0, 3.0, 4.0, 5.0, 1.0, 6.0, 1.0, 7.0],
        );
        assert!(self.store.set_pivots(
            self.model_output,
            &model,
            [
                "model",
                "orders",
                "regions",
                "name",
                "customers",
                "credit",
                "amount",
                "customer"
            ]
            .map(String::from)
            .to_vec()
        ));
        self.store.recompute_changed();
    }

    fn assert_equal(&self) {
        let actual = self.store.pivot_status(self.model_output);
        let expected = self.store.pivot_status(self.flat_output);
        assert_eq!(actual, expected);
        for row in 0..actual[STATUS_ROWS] as usize {
            for col in 0..actual[STATUS_COLS] as usize {
                let actual = self.store.get_cell(self.model_output, row, col);
                let expected = self.store.get_cell(self.flat_output, row, col);
                assert_eq!(
                    (actual.kind(), actual.num().to_bits(), actual.string()),
                    (expected.kind(), expected.num().to_bits(), expected.string()),
                    "at ({row}, {col})",
                );
            }
        }
    }
}

#[test]
fn related_pivots_equal_a_lookup_flattened_range_through_key_and_value_edits() {
    let mut fixture = RelatedFixture::new(199);
    for value_field in [1, 2] {
        fixture.install(
            value_field,
            &[SUM, COUNT, AVERAGE, MIN, MAX, COUNTA, DISTINCT_COUNT],
        );
        fixture.assert_equal();

        // A fact key moves between groups; a dimension key changes every fact that uses it.
        fixture.keys[13] = Some(3);
        fixture.store.set_string(fixture.orders, 14, 0, "c3", 0);
        fixture.flatten();
        fixture.store.recompute_changed();
        fixture.assert_equal();

        fixture.customer_regions[3] = Some(2);
        fixture.store.set_number(fixture.customers, 4, 1, 2.0, 0);
        fixture.flatten();
        fixture.store.recompute_changed();
        fixture.assert_equal();

        fixture
            .store
            .set_string(fixture.regions, 3, 1, "Renamed", 0);
        for row in 0..fixture.keys.len() {
            let customer = fixture.keys[row].filter(|&key| key < 9);
            if customer.is_some_and(|customer| fixture.customer_regions[customer] == Some(2)) {
                fixture
                    .store
                    .set_string(fixture.flat, row + 1, 0, "Renamed", 0);
            }
        }
        fixture.store.recompute_changed();
        fixture.assert_equal();
        fixture
            .store
            .set_string(fixture.regions, 3, 1, "Region 2", 0);
        fixture.flatten();
    }
}

#[test]
fn related_pivot_key_failures_recover_and_missing_relationships_show_ref() {
    let mut fixture = RelatedFixture::new(31);
    // An initially invalid key set must wake when a dimension key is repaired.
    fixture.store.set_string(fixture.customers, 9, 0, "c0", 0);
    fixture.install(2, &[SUM]);
    let value_error = FormulaError::Value.slot() as u32 + 1;
    assert_eq!(
        fixture.store.pivot_status(fixture.model_output)[0],
        value_error
    );

    fixture.store.set_string(fixture.customers, 9, 0, "C8", 0);
    fixture.store.recompute_changed();
    fixture.assert_equal();

    fixture.store.set_string(fixture.customers, 1, 1, "0", 0);
    fixture.store.recompute_changed();
    assert_eq!(
        fixture.store.pivot_status(fixture.model_output)[0],
        value_error
    );
    fixture.store.clear_cell(fixture.customers, 1, 1, 0);
    fixture.store.recompute_changed();
    fixture.assert_equal();

    // A many-side error is the related field's error, not a missing match.
    fixture.store.set_formula(fixture.orders, 2, 0, "=NA()", 0);
    fixture.store.set_formula(fixture.flat, 2, 0, "=NA()", 0);
    fixture.store.set_formula(fixture.flat, 2, 1, "=NA()", 0);
    fixture.store.recompute_changed();
    fixture.assert_equal();

    assert!(fixture.store.set_relationships(Vec::new()));
    let ref_error = FormulaError::Ref.slot() as u32 + 1;
    assert_eq!(
        fixture.store.pivot_status(fixture.model_output)[0],
        ref_error
    );
    assert!(fixture.store.set_relationships(
        [
            "r1",
            "orders",
            "customer",
            "customers",
            "id",
            "r2",
            "customers",
            "region",
            "regions",
            "id"
        ]
        .map(String::from)
        .to_vec(),
    ));
    fixture.assert_equal();

    // Malformed field indices must not access memory outside the virtual source.
    let payload = PivotPayload {
        source: fixture.flat,
        last_row: 31,
        last_col: 3,
        rows: &[0],
        value_field: 2,
        aggregations: &[SUM],
        anchor: (1, 0),
        ..PivotPayload::default()
    }
    .numbers();
    let mut model = payload;
    model.splice(1..7, [3.0, 1.0, 1.0, 2.0, 3.0]);
    assert!(fixture.store.set_pivots(
        fixture.regions,
        &model,
        ["overlap", "orders", "regions", "name"]
            .map(String::from)
            .to_vec()
    ));
    fixture.store.recompute_changed();
    // The field count is one but the value references field 2: reject as a
    // missing field, rather than accessing unrelated memory.
    assert_eq!(fixture.store.pivot_status(fixture.regions)[0], ref_error);
}
