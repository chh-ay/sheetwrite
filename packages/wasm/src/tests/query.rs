//! Column queries: sort, filter, distinct values, data edges, aggregates and
//! style ids.

use super::*;

#[test]
fn numeric_sort_radix_boundary_matches_comparison_contract() {
    let mut store = CellStore::new();
    let rows = 4_096usize;
    let sheet = store.add_sheet(1, rows);
    let values: Vec<f64> = (0..rows)
        .map(|row| match row % 8 {
            0 => -0.0,
            1 => 0.0,
            2 => f64::MIN_POSITIVE,
            3 => -f64::MIN_POSITIVE,
            4 => f64::MAX,
            5 => -f64::MAX,
            _ => (row as i64 - 2_048) as f64,
        })
        .collect();
    for (row, &value) in values.iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }

    let mut expected: Vec<u32> = (0..rows as u32).collect();
    expected.sort_unstable_by(|&left, &right| {
        values[left as usize]
            .partial_cmp(&values[right as usize])
            .unwrap()
            .then_with(|| left.cmp(&right))
    });
    assert_eq!(store.sort_rows(sheet, 0, true), expected);

    expected.sort_unstable_by(|&left, &right| {
        values[right as usize]
            .partial_cmp(&values[left as usize])
            .unwrap()
            .then_with(|| left.cmp(&right))
    });
    assert_eq!(store.sort_rows(sheet, 0, false), expected);
}

#[test]
fn data_edge_follows_google_ctrl_arrow_semantics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 12);
    for row in [0, 1, 2, 6, 7] {
        store.set_string(sheet, row, 0, "x", 0);
    }
    store.set_number(sheet, 1, 2, 1.0, 0);

    assert_eq!(store.data_edge(sheet, 0, 0, 1, 0), 2);
    assert_eq!(store.data_edge(sheet, 7, 0, -1, 0), 6);

    assert_eq!(store.data_edge(sheet, 2, 0, 1, 0), 6);
    assert_eq!(store.data_edge(sheet, 6, 0, -1, 0), 2);

    assert_eq!(store.data_edge(sheet, 4, 0, 1, 0), 6);
    assert_eq!(store.data_edge(sheet, 4, 0, -1, 0), 2);

    assert_eq!(store.data_edge(sheet, 7, 0, 1, 0), 11);
    assert_eq!(store.data_edge(sheet, 0, 0, -1, 0), 0);

    assert_eq!(store.data_edge(sheet, 1, 0, 0, 1), 2);
    assert_eq!(store.data_edge(sheet, 1, 2, 0, 1), 2);

    assert_eq!(store.data_edge(99, 0, 0, 1, 0), 0);
    assert_eq!(store.data_edge(sheet, 50, 0, 1, 0), 0);
}

#[test]
fn mixed_formula_queries_order_errors_text_booleans_and_empty_aggregates() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 6);
    store.set_formula(sheet, 0, 0, "=1/0", 0);
    store.set_formula(sheet, 1, 0, "=\"beta\"", 0);
    store.set_formula(sheet, 2, 0, "=TRUE", 0);
    store.set_string(sheet, 3, 0, "alpha", 0);
    store.set_number(sheet, 4, 0, 7.0, 0);

    store.set_formula(sheet, 0, 1, "=1/0", 0);
    store.set_formula(sheet, 1, 1, "=2+3", 0);
    store.set_number(sheet, 2, 1, 7.0, 0);
    store.recompute(sheet);

    assert_eq!(store.sort_rows(sheet, 0, true), vec![4, 3, 1, 2, 0, 5]);
    assert_eq!(store.sort_rows(sheet, 0, false), vec![0, 2, 1, 3, 4, 5]);
    assert_close(store.aggregate(sheet, 1, 0), 12.0);
    assert_close(store.aggregate(sheet, 1, 1), 6.0);
    assert_close(store.aggregate(sheet, 1, 2), 5.0);
    assert_eq!(
        store.search(sheet, &[0], "#DIV/0!", false, true),
        vec![0, 0]
    );
    assert_eq!(store.search(sheet, &[0], "beta", false, true), vec![1, 0]);
    assert!(store
        .search(sheet, &[u32::MAX], "x", true, false)
        .is_empty());
    assert!(store.search(sheet, &[0], "", true, false).is_empty());
    assert_close(store.aggregate(sheet, 1, 3), 7.0);
    assert_close(store.aggregate(sheet, 1, 4), 2.0);

    let general_sum = store.aggregate(sheet, 1, 1) * store.aggregate(sheet, 1, 4);
    assert_close(store.aggregate(sheet, 1, 0), general_sum);

    for op in 0..=4 {
        assert_close(store.aggregate(sheet, 2, op), 0.0);
    }
}

#[test]
fn range_style_remap_bounds_output_by_distinct_ids_and_rejects_invalid_tables() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 4);
    for row in 0..4 {
        store.set_number(sheet, row, 0, row as f64, 4);
        store.set_number(sheet, row, 1, row as f64, if row % 2 == 0 { 7 } else { 4 });
        store.set_number(sheet, row, 2, row as f64, 7);
    }

    assert_eq!(store.range_style_ids(sheet, 0, 0, 3, 2), vec![4, 7]);
    assert!(store.remap_range_styles(sheet, 0, 0, 3, 2, &[4, 7], &[40, 70]));
    assert_eq!(store.range_style_ids(sheet, 0, 0, 3, 2), vec![40, 70]);
    assert!(store.remap_range_styles(sheet, 0, 0, 3, 2, &[40, 70], &[0, 0]));
    assert_eq!(store.range_style_ids(sheet, 0, 0, 3, 2), vec![0]);

    assert!(store.range_style_ids(sheet, 2, 0, 1, 2).is_empty());
    assert!(store.range_style_ids(sheet + 1, 0, 0, 0, 0).is_empty());
    assert!(!store.remap_range_styles(sheet, 2, 0, 1, 2, &[0], &[1]));
    assert!(!store.remap_range_styles(sheet, 0, 0, 3, 2, &[0], &[]));
    assert!(!store.remap_range_styles(sheet, 0, 0, 4, 2, &[0], &[1]));
}

#[test]
fn multi_filter_kinds_match_resolved_cell_values() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 6);
    store.set_number(sheet, 0, 0, 1.0, 0);
    store.set_number(sheet, 1, 0, 2.0, 0);
    store.set_string(sheet, 2, 0, "Alpha", 0);
    store.set_bool(sheet, 3, 0, true, 0);
    store.set_formula(sheet, 5, 0, "=1/0", 0);
    store.recompute(sheet);

    assert_eq!(
        store.filter_rows_multi(sheet, &[0], &[0], &[0], &[], &[1], &[0], &[2.0], vec![]),
        vec![1]
    );
    assert_eq!(
        store.filter_rows_multi(
            sheet,
            &[0],
            &[0],
            &[0],
            &[],
            &[0],
            &[1],
            &[],
            vec!["Alpha".to_owned()],
        ),
        vec![2]
    );
    assert_eq!(
        store.filter_rows_multi(
            sheet,
            &[0],
            &[0],
            &[0],
            &[],
            &[0],
            &[1],
            &[],
            vec!["\0TRUE".to_owned()],
        ),
        vec![3]
    );
    assert_eq!(
        store.filter_rows_multi(sheet, &[0], &[0], &[1], &[], &[0], &[0], &[], vec![]),
        vec![4]
    );
    assert_eq!(
        store.filter_rows_multi(
            sheet,
            &[0],
            &[1],
            &[0],
            &[],
            &[0],
            &[1],
            &[],
            vec!["div/0".to_owned()],
        ),
        vec![5]
    );

    assert_eq!(
        store.filter_rows_multi(sheet, &[0], &[3], &[], &[], &[], &[], &[], vec![]),
        vec![4]
    );
    assert_eq!(
        store.filter_rows_multi(sheet, &[0], &[4], &[], &[], &[], &[], &[], vec![]),
        vec![0, 1, 2, 3, 5]
    );
    assert!(store
        .filter_rows_multi(sheet, &[0], &[99], &[], &[], &[], &[], &[], vec![])
        .is_empty());

    let mut limited = store.distinct_values(sheet, 0, 2);
    assert_eq!(limited.take_kinds().len(), 2);
    assert_eq!(
        store.sort_rows_multi(sheet, &[0], &[], &[u32::MAX, 1, 0]),
        vec![0, 1]
    );
    assert_eq!(store.data_edge_ordered(sheet, &[0, 1], 0, 0, 0, 1), 0);
}

/// A COUNTIF criterion and the rows a custom filter with it keeps.
type CriterionCase = (&'static str, &'static [u32]);

/// Excel's custom `AutoFilter` matches as COUNTIF criteria do: each row of the
/// table is a condition, as the filter dialog writes it, and the rows it keeps.
#[test]
fn custom_filters_match_as_countif_criteria() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 10);
    store.set_number(sheet, 0, 0, 5.0, 0);
    store.set_number(sheet, 1, 0, 10.0, 0);
    store.set_string(sheet, 2, 0, "apple", 0);
    store.set_string(sheet, 3, 0, "Apricot", 0);
    store.set_string(sheet, 4, 0, "banana", 0);
    // Row 5 stays blank.
    store.set_bool(sheet, 6, 0, true, 0);
    store.set_string(sheet, 7, 0, "a*b", 0);
    store.set_string(sheet, 8, 0, "grape", 0);
    store.set_formula(sheet, 9, 0, "=1/0", 0);
    store.recompute(sheet);

    let custom = |criteria: &[&str], any: bool| {
        store.filter_rows_multi(
            sheet,
            &[0],
            &[5],
            &[u8::from(any)],
            &[],
            &[0],
            &[criteria.len() as u32],
            &[],
            criteria.iter().map(|text| (*text).to_owned()).collect(),
        )
    };

    let table: &[CriterionCase] = &[
        // Numbers compare with numbers only.
        ("=5", &[0]),
        (">5", &[1]),
        (">=5", &[0, 1]),
        ("<10", &[0]),
        ("<=10", &[0, 1]),
        // Does not equal keeps every other cell, blanks and errors included.
        ("<>5", &[1, 2, 3, 4, 5, 6, 7, 8, 9]),
        // Text compares without case.
        ("=APPLE", &[2]),
        (">b", &[4, 8]),
        // Begins with, ends with, contains and does not contain are wildcards.
        ("=a*", &[2, 3, 7]),
        ("=*na", &[4]),
        ("=*an*", &[4]),
        ("<>*an*", &[0, 1, 2, 3, 5, 6, 7, 8, 9]),
        ("=?pple", &[2]),
        // `~` escapes a wildcard.
        ("=a~*b", &[7]),
        // Equals nothing keeps blanks; does not equal nothing keeps the rest.
        ("=", &[5]),
        ("<>", &[0, 1, 2, 3, 4, 6, 7, 8, 9]),
        ("=TRUE", &[6]),
        ("=#DIV/0!", &[9]),
    ];
    for (criterion, expected) in table {
        assert_eq!(
            custom(&[criterion], false),
            expected.to_vec(),
            "{criterion}"
        );
    }

    assert_eq!(custom(&[">=5", "<10"], false), vec![0]);
    assert_eq!(custom(&[">=10", "=apple"], true), vec![1, 2]);
}

/// Column 0 of 16 rows covering every kind the distinct scan distinguishes:
/// numbers (`-0.0`, `0.0` and NaN included), pooled text with repeats, a blank,
/// booleans, an error formula whose text carries no pool id, and a text formula
/// whose result equals a stored string.
fn fill_mixed_distinct_column(store: &mut CellStore, sheet: usize) {
    store.set_string(sheet, 0, 0, "Beta", 0);
    store.set_number(sheet, 1, 0, 2.0, 0);
    store.set_string(sheet, 2, 0, "Beta", 0);
    store.set_formula(sheet, 3, 0, "=1/0", 0);
    store.set_number(sheet, 4, 0, 2.0, 0);
    store.set_bool(sheet, 5, 0, true, 0);
    store.set_number(sheet, 6, 0, -0.0, 0);
    store.set_number(sheet, 7, 0, 0.0, 0);
    store.set_number(sheet, 8, 0, f64::NAN, 0);
    store.set_number(sheet, 9, 0, f64::NAN, 0);
    store.set_string(sheet, 11, 0, "Alpha", 0);
    store.set_formula(sheet, 12, 0, "=\"Alpha\"", 0);
    store.set_string(sheet, 13, 0, "Beta", 0);
    store.set_bool(sheet, 14, 0, false, 0);
    store.set_formula(sheet, 15, 0, "=1+0", 0);
    store.recompute(sheet);
}

fn distinct_number_bits(column: &mut crate::query::DistinctColumn) -> Vec<u64> {
    column
        .take_numbers()
        .into_iter()
        .map(f64::to_bits)
        .collect()
}

#[test]
fn distinct_values_limit_stops_the_first_seen_scan() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 16);
    fill_mixed_distinct_column(&mut store, sheet);

    // The error formula at row 3 restarts the scan on content hashing, so a
    // limit that lands past it still returns identical values.
    let mut three = store.distinct_values(sheet, 0, 3);
    assert_eq!(three.take_kinds(), vec![2, 1, 2]);
    assert_eq!(distinct_number_bits(&mut three), vec![2.0f64.to_bits()]);
    assert_eq!(three.take_texts(), vec!["Beta", "#DIV/0!"]);

    let mut eight = store.distinct_values(sheet, 0, 8);
    assert_eq!(eight.take_kinds(), vec![2, 1, 2, 3, 1, 1, 1, 0]);
    assert_eq!(
        distinct_number_bits(&mut eight),
        vec![
            2.0f64.to_bits(),
            1.0f64.to_bits(),
            (-0.0f64).to_bits(),
            0.0f64.to_bits(),
            f64::NAN.to_bits(),
        ]
    );
    assert_eq!(eight.take_texts(), vec!["Beta", "#DIV/0!"]);

    let mut all = store.distinct_values(sheet, 0, 64);
    assert_eq!(all.take_kinds().len(), 11);
    assert_eq!(all.take_texts(), vec!["Beta", "#DIV/0!", "Alpha"]);
}

#[test]
fn distinct_values_in_rows_reads_only_the_row_range() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 16);
    fill_mixed_distinct_column(&mut store, sheet);

    // Rows 11..14 hold "Alpha", a formula that evaluates to "Alpha", and "Beta".
    let mut middle = store.distinct_values_in_rows(sheet, 0, 11, 14, 0);
    assert_eq!(middle.take_kinds(), vec![2, 2]);
    assert_eq!(middle.take_texts(), vec!["Alpha", "Beta"]);

    // A range past the last row is clipped to the sheet.
    let mut tail = store.distinct_values_in_rows(sheet, 0, 14, 100, 0);
    assert_eq!(tail.take_kinds(), vec![3, 1]);
    assert_eq!(
        distinct_number_bits(&mut tail),
        vec![0.0f64.to_bits(), 1.0f64.to_bits()]
    );
}

/// "Values" filter coverage: the per-column lookup must answer exactly what the
/// linear scan answered, including NaN, `-0.0`, blanks, booleans and text.
mod value_set_filter {
    use crate::*;

    /// Sentinel the view layer sends for a picked boolean; the `\0` prefix keeps
    /// it distinct from a cell holding the text `TRUE`.
    const PICKED_TRUE: &str = "\0TRUE";
    /// Sentinel for a picked `FALSE`; see [`PICKED_TRUE`].
    const PICKED_FALSE: &str = "\0FALSE";

    /// One column of 15 rows covering every kind the filter distinguishes:
    /// numbers (`-0.0` and NaN included), pooled text, a text cell that spells a
    /// boolean, real booleans, a blank, an error formula and a text formula.
    fn mixed_column_store() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(1, 15);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_number(sheet, 1, 0, -0.0, 0);
        store.set_number(sheet, 2, 0, 0.0, 0);
        store.set_number(sheet, 3, 0, f64::NAN, 0);
        store.set_number(sheet, 4, 0, 2.0, 0);
        store.set_string(sheet, 5, 0, "Alpha", 0);
        store.set_string(sheet, 6, 0, "Beta", 0);
        store.set_string(sheet, 7, 0, "TRUE", 0);
        store.set_bool(sheet, 8, 0, true, 0);
        store.set_bool(sheet, 9, 0, false, 0);
        // Row 10 stays blank.
        store.set_formula(sheet, 11, 0, "=1/0", 0);
        store.set_formula(sheet, 12, 0, "=\"Alpha\"", 0);
        store.set_number(sheet, 13, 0, 3.0, 0);
        store.set_number(sheet, 14, 0, 7.0, 0);
        store.recompute(sheet);
        (store, sheet)
    }

    /// Runs a "values" filter over column 0; nine or more picks take the lookup
    /// path, eight or fewer the linear scan.
    fn filter_values(
        store: &CellStore,
        sheet: usize,
        numbers: &[f64],
        texts: &[&str],
        include_blank: bool,
    ) -> Vec<u32> {
        store.filter_rows_multi(
            sheet,
            &[0],
            &[0],
            &[u8::from(include_blank)],
            &[],
            &[numbers.len() as u32],
            &[texts.len() as u32],
            numbers,
            texts.iter().map(|text| (*text).to_owned()).collect(),
        )
    }

    #[test]
    fn value_lookup_matches_the_linear_scan_for_numbers_with_nan_and_negative_zero() {
        let (store, sheet) = mixed_column_store();
        let long = [1.0, 0.0, -0.0, f64::NAN, 2.0, 3.0, 4.0, 5.0, 5.0];
        let short = [1.0, 0.0, -0.0, f64::NAN, 2.0, 3.0, 4.0, 5.0];
        // NaN is never equal to anything, and `-0.0` equals `0.0`; the NaN cell
        // in row 3 and the unpicked 7.0 in row 14 stay out either way.
        let expected = vec![0, 1, 2, 4, 13];
        assert_eq!(filter_values(&store, sheet, &long, &[], false), expected);
        assert_eq!(filter_values(&store, sheet, &short, &[], false), expected);
    }

    #[test]
    fn boolean_picks_match_boolean_cells_only() {
        let (store, sheet) = mixed_column_store();
        let picks = [PICKED_TRUE, PICKED_FALSE, "a", "b", "c", "d", "e", "f", "g"];
        // The text cell in row 7 spells TRUE but is not a boolean.
        assert_eq!(filter_values(&store, sheet, &[], &picks, false), vec![8, 9]);
    }
}

/// The dense column scans in `filterRows`, `dataEdgeOrdered`, `rangeStyleIds`
/// and `aggregate` classify literals from the raw kind byte. These tests put
/// formula results and calculated spill cells in the same column, so the
/// branches that resolve a calculated slot are covered too.
mod dense_reader_fast_paths {
    use super::*;

    const ROWS: usize = 14;
    const SPILL_ANCHOR_ROW: usize = 7;
    const SPILL_CHILD_ROWS: [usize; 2] = [8, 9];

    /// Column A: a literal of each kind, formulas with number, text, error
    /// and boolean results, and `=SEQUENCE(3)`, whose rows 8 and 9 are
    /// calculated cells with no source. Every written cell has its own style.
    fn formula_column() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, ROWS);
        store.set_number(sheet, 0, 0, 5.0, 1);
        store.set_string(sheet, 1, 0, "Needle 7", 2);
        store.set_bool(sheet, 2, 0, true, 3);
        store.set_formula(sheet, 4, 0, "=2+3", 4);
        store.set_formula(sheet, 5, 0, "=\"needle\"", 5);
        store.set_formula(sheet, 6, 0, "=1/0", 6);
        store.set_formula(sheet, SPILL_ANCHOR_ROW, 0, "=SEQUENCE(3)", 7);
        store.set_formula(sheet, 10, 0, "=12345", 8);
        store.set_formula(sheet, 11, 0, "=TRUE", 9);
        store.recompute(sheet);

        for (row, value) in SPILL_CHILD_ROWS.into_iter().zip([2.0, 3.0]) {
            assert_close(store.get_cell(sheet, row, 0).num(), value);
        }
        (store, sheet)
    }

    #[test]
    fn filter_rows_matches_formula_results_and_spilled_values() {
        let (store, sheet) = formula_column();
        let cases: [(&str, &[u32]); 6] = [
            ("needle", &[1, 5]),
            ("5", &[0, 4, 10]),
            ("2", &[8, 10]),
            ("3", &[9, 10]),
            ("true", &[2, 11]),
            ("#div/0", &[6]),
        ];
        for (needle, rows) in cases {
            assert_eq!(
                store.filter_rows(sheet, 0, needle),
                rows,
                "needle {needle:?}"
            );
        }
    }

    #[test]
    fn data_edge_ordered_treats_formula_and_spilled_cells_as_data() {
        let (store, sheet) = formula_column();
        // View order puts blank row 3 first and blank row 12 after the literals.
        let order: Vec<u32> = [3, 0, 1, 2, 12, 4, 5, 6, 7, 8, 9, 10, 11, 13]
            .into_iter()
            .collect();
        let last_view = (order.len() - 1) as u32;
        let cases = [
            (0, 1, 1),
            (1, 1, 3),
            (3, 1, 5),
            (5, 1, 12),
            (12, 1, last_view),
            (12, -1, 5),
            (5, -1, 3),
        ];
        for (view, step, expected) in cases {
            assert_eq!(
                store.data_edge_ordered(sheet, &order, view, 0, step, 0),
                expected,
                "from view {view} by {step}"
            );
        }
    }
}
