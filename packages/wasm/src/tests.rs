use super::*;
use crate::cells::{
    checked_dense_cell_count, encode_num, payload_is_str, DEFAULT_MAX_PAGED_DIRTY_CELLS,
    MAX_DENSE_CELLS,
};
use crate::memory::{StoreMemoryStats, SPILL_OWNERS};

fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1e-9,
        "expected {expected}, got {actual}"
    );
}

fn number(store: &CellStore, sheet: usize, row: usize, col: usize) -> f64 {
    store.get_cell(sheet, row, col).num()
}

fn string(store: &CellStore, sheet: usize, row: usize, col: usize) -> Option<String> {
    store.get_cell(sheet, row, col).string()
}

fn put_number(sheet: &mut SheetData, row: usize, col: usize, value: f64) {
    assert!(sheet.write_cell(row, col, KIND_NUMBER, encode_num(value), 0, None));
}

struct DecodedWindow {
    kinds: Vec<u8>,
    numbers: Vec<f64>,
    string_index: Vec<i32>,
    string_ids: Vec<u32>,
    style_index: Vec<u32>,
    style_dict: Vec<u32>,
    cond_matches: Vec<u32>,
    strings: Vec<String>,
}

fn decode_window(mut view: WindowView) -> DecodedWindow {
    let packed = view.take_packed();
    assert!(packed.len() >= 40);
    let word = |index: usize| {
        u32::from_le_bytes(
            packed[index * 4..index * 4 + 4]
                .try_into()
                .expect("complete packed header word"),
        )
    };
    assert_eq!(word(0), 0x3157_4e53);
    assert_eq!(word(1), 1);
    assert_eq!(word(2), 40);
    assert_eq!(word(3) as usize, packed.len());
    let rows = word(4) as usize;
    let cols = word(5) as usize;
    let cells = word(6) as usize;
    let styles = word(7) as usize;
    let cond_matches = word(8) as usize;
    let strings = word(9) as usize;
    assert_eq!(rows.checked_mul(cols), Some(cells));
    assert!(cond_matches == 0 || cond_matches == cells);

    let kinds_start = 40;
    let numbers_start = (kinds_start + cells + 7) & !7;
    let string_ids_start = numbers_start + cells * 8;
    let string_index_start = string_ids_start + cells * 4;
    let style_index_start = string_index_start + cells * 4;
    let style_dict_start = style_index_start + cells * 4;
    let cond_matches_start = style_dict_start + styles * 4;
    assert_eq!(cond_matches_start + cond_matches * 4, packed.len());

    let decode_u32 = |start: usize, len: usize| {
        (0..len)
            .map(|index| {
                u32::from_le_bytes(
                    packed[start + index * 4..start + index * 4 + 4]
                        .try_into()
                        .expect("complete packed u32"),
                )
            })
            .collect::<Vec<_>>()
    };
    let decoded_strings = view.take_strings();
    assert_eq!(decoded_strings.len(), strings);
    DecodedWindow {
        kinds: packed[kinds_start..kinds_start + cells].to_vec(),
        numbers: (0..cells)
            .map(|index| {
                f64::from_le_bytes(
                    packed[numbers_start + index * 8..numbers_start + index * 8 + 8]
                        .try_into()
                        .expect("complete packed f64"),
                )
            })
            .collect(),
        string_ids: decode_u32(string_ids_start, cells),
        string_index: decode_u32(string_index_start, cells)
            .into_iter()
            .map(|value| value as i32)
            .collect(),
        style_index: decode_u32(style_index_start, cells),
        style_dict: decode_u32(style_dict_start, styles),
        cond_matches: decode_u32(cond_matches_start, cond_matches),
        strings: decoded_strings,
    }
}

#[test]
fn sheet_noops_dense_limits_and_paged_load_state_preserve_invariants() {
    assert_eq!(
        checked_dense_cell_count(1, MAX_DENSE_CELLS),
        Some(MAX_DENSE_CELLS)
    );
    assert_eq!(checked_dense_cell_count(1, MAX_DENSE_CELLS + 1), None);
    assert_eq!(checked_dense_cell_count(usize::MAX, 2), None);
    assert!(SheetData::try_new(usize::MAX, 2).is_err());
    let at_limit = SheetData::try_new(1, MAX_DENSE_CELLS).expect("limit must be accepted");
    assert_eq!(
        at_limit.cells.source_kind_at(MAX_DENSE_CELLS - 1),
        KIND_EMPTY
    );
    drop(at_limit);

    let mut bounded_store = CellStore::new();
    assert!(bounded_store.try_add_sheet(1, MAX_DENSE_CELLS + 1).is_err());
    assert!(bounded_store.sheets.is_empty());
    let mut dense = SheetData::new(2, 2);
    put_number(&mut dense, 1, 1, 9.0);
    assert!(dense.insert_rows(0, 1, 0).is_ok());
    assert!(dense.delete_rows(0, 2, 1).is_ok());
    assert!(dense.delete_rows(0, 0, 0).is_ok());
    assert!(dense.insert_cols(0, 1, 0).is_ok());
    assert!(dense.delete_cols(0, 2, 1).is_ok());
    assert!(dense.delete_cols(0, 0, 0).is_ok());
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
fn incumbent_operators_cover_precedence_coercion_errors_and_unicode() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 12);
    store.set_number(sheet, 0, 0, 7.0, 0);
    let formulas = [
        (0, "=2^3^2"),
        (1, "=-2^2"),
        (2, "=-(2^2)"),
        (3, "=2^3%"),
        (4, "=50%%"),
        (5, "=1&2+3"),
        (6, "=\"漢\"&TRUE&\"🙂\""),
        (7, "=\"2\"^3"),
        (8, "=0^-1"),
        (9, "=(-1)^0.5"),
    ];
    for (row, source) in formulas {
        store.set_formula(sheet, row, 1, source, 0);
    }
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 1), 64.0);
    assert_close(number(&store, sheet, 1, 1), 4.0);
    assert_close(number(&store, sheet, 2, 1), -4.0);
    assert_close(number(&store, sheet, 3, 1), 2.0f64.powf(0.03));
    assert_close(number(&store, sheet, 4, 1), 0.005);
    assert_eq!(string(&store, sheet, 5, 1).as_deref(), Some("15"));
    assert_eq!(string(&store, sheet, 6, 1).as_deref(), Some("漢TRUE🙂"));
    assert_close(number(&store, sheet, 7, 1), 8.0);
    assert_eq!(string(&store, sheet, 8, 1).as_deref(), Some("#DIV/0!"));
    assert_eq!(string(&store, sheet, 9, 1).as_deref(), Some("#NUM!"));
}

#[test]
fn formula_ingest_preserves_original_source_until_a_structural_rewrite() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 2);
    let source = " =  A1 & \" λ \"  ";
    store.set_formula(sheet, 0, 1, source, 0);
    assert_eq!(store.formula_source(sheet, 0, 1).as_deref(), Some(source));

    store.add_rows(sheet, 0, 1);
    assert_eq!(
        store.formula_source(sheet, 1, 1).as_deref(),
        Some("=(A2&\" λ \")")
    );
}

#[test]
fn dynamic_arrays_spill_resize_obstruct_persist_and_invalidate_dependents() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(9, 12);
    for (row, value) in [3.0, 1.0, 3.0, 2.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }
    for (row, value) in [true, false, true, true].into_iter().enumerate() {
        store.set_bool(sheet, row, 1, value, 0);
    }
    store.set_number(sheet, 2, 7, 99.0, 0);
    store.set_formula(sheet, 0, 3, "=FILTER(A1:A4,B1:B4)", 11);
    store.set_formula(sheet, 0, 4, "=SORT(A1:A4)", 12);
    store.set_formula(sheet, 0, 5, "=UNIQUE(A1:A4)", 13);
    store.set_formula(sheet, 0, 6, "=A1:A4", 14);
    store.set_formula(sheet, 0, 7, "=A1:A4", 15);
    store.set_formula(sheet, 7, 2, "=D3", 0);
    store.recompute(sheet);

    assert_eq!(
        [0, 1, 2].map(|row| number(&store, sheet, row, 3)),
        [3.0, 3.0, 2.0]
    );
    assert_eq!(
        [0, 1, 2, 3].map(|row| number(&store, sheet, row, 4)),
        [1.0, 2.0, 3.0, 3.0]
    );
    assert_eq!(
        [0, 1, 2].map(|row| number(&store, sheet, row, 5)),
        [3.0, 1.0, 2.0]
    );
    assert_eq!(
        [0, 1, 2, 3].map(|row| number(&store, sheet, row, 6)),
        [3.0, 1.0, 3.0, 2.0]
    );
    assert_eq!(store.formula_source(sheet, 1, 3), None);
    assert_eq!(store.spill_anchor_row(sheet, 2, 3), 0);
    assert_eq!(store.spill_anchor_col(sheet, 2, 3), 3);
    assert_eq!(string(&store, sheet, 0, 7).as_deref(), Some("#SPILL!"));
    assert_close(number(&store, sheet, 2, 7), 99.0);
    assert_close(number(&store, sheet, 7, 2), 2.0);

    store.set_bool(sheet, 3, 1, false, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 3), 3.0);
    assert_close(number(&store, sheet, 1, 3), 3.0);
    assert_eq!(store.get_cell(sheet, 2, 3).kind(), KIND_EMPTY);
    assert_close(number(&store, sheet, 7, 2), 0.0);

    store.clear_cell(sheet, 2, 7, 0);
    store.recompute(sheet);
    assert_eq!(
        [0, 1, 2, 3].map(|row| number(&store, sheet, row, 7)),
        [3.0, 1.0, 3.0, 2.0]
    );

    let snapshot = store
        .capture_range(sheet, 0, 3, 3, 1)
        .expect("spill history should capture");
    assert_eq!(snapshot.kinds(), vec![KIND_FORMULA, KIND_EMPTY, KIND_EMPTY]);
    assert_eq!(snapshot.formula_sources(), vec!["=FILTER(A1:A4,B1:B4)"]);
    assert!(store.clear_range(sheet, 0, 3, 2, 3, true, false));
    store.recompute(sheet);
    assert!(store.restore_range(sheet, 0, 3, &snapshot));
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 3), 3.0);
    assert_close(number(&store, sheet, 1, 3), 3.0);
    assert_eq!(store.get_cell(sheet, 2, 3).kind(), KIND_EMPTY);
}

#[test]
fn dynamic_array_errors_and_resource_caps_fail_closed() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 4);
    for row in 0..4 {
        store.set_number(sheet, row, 0, row as f64, 0);
        store.set_bool(sheet, row, 1, false, 0);
    }
    store.set_formula(sheet, 0, 2, "=FILTER(A1:A4,B1:B4)", 0);
    store.set_formula(sheet, 1, 2, "=FILTER(A1:A4,B1:B4,\"none\")", 0);
    store.set_formula(sheet, 2, 2, "=SORT(A1:A4,0)", 0);
    store.set_formula(sheet, 3, 2, "=UNIQUE(A1:A4,FALSE,TRUE)", 0);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("#CALC!"));
    assert_eq!(string(&store, sheet, 1, 2).as_deref(), Some("none"));
    assert_eq!(string(&store, sheet, 2, 2).as_deref(), Some("#VALUE!"));
    assert_eq!(string(&store, sheet, 3, 2).as_deref(), Some("#SPILL!"));

    let paged = store.add_paged_sheet(2, 1_000_001, 256, 1_000_000, 1_000_000);
    store.set_formula(paged, 0, 1, "=SORT(A1:A1000001)", 0);
    store.recompute(paged);
    assert_eq!(string(&store, paged, 0, 1).as_deref(), Some("#NUM!"));
}

#[test]
fn spill_ownership_budget_is_store_wide_atomic_and_released() {
    let mut store = CellStore::new();
    store.set_spill_owner_limit_for_test(5);
    let first = store.add_sheet(2, 3);
    let second = store.add_sheet(2, 3);
    for sheet in [first, second] {
        for row in 0..3 {
            store.set_number(sheet, row, 0, row as f64 + 1.0, 0);
        }
        store.set_formula(sheet, 0, 1, "=A1:A3", 0);
    }
    store.recompute(first);
    store.recompute(second);
    assert_eq!(string(&store, second, 0, 1).as_deref(), Some("#NUM!"));
    assert_eq!(store.get_cell(second, 1, 1).kind(), KIND_EMPTY);
    assert_eq!(store.spill_anchor_row(second, 1, 1), u32::MAX);

    store.clear_cell(first, 0, 1, 0);
    store.recompute(first);
    let mut stats = StoreMemoryStats::default();
    store.sheets[first].add_memory_stats(&mut stats);
    assert_eq!(stats.owners[SPILL_OWNERS].allocated_bytes, 0);
    store.set_number(second, 0, 0, 1.0, 0);
    store.recompute(second);
    assert_eq!(
        [0, 1, 2].map(|row| number(&store, second, row, 1)),
        [1.0, 2.0, 3.0]
    );
}

#[test]
fn text_functions_surface_string_and_boolean_values() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 16);
    let formulas = [
        (0, r#"="Hello ""Q""""#),
        (1, r#"=LEN("Hello")"#),
        (2, r#"=LEFT("abcdef",3)"#),
        (3, r#"=RIGHT("abcdef",3)"#),
        (4, r#"=MID("abcdef",2,3)"#),
        (5, r#"=CONCAT("A",1,TRUE)"#),
        (6, r#"=CONCATENATE("x","y")"#),
        (7, r#"=UPPER("MiX")"#),
        (8, r#"=LOWER("MiX")"#),
        (9, r#"=TRIM("  a   b  ")"#),
        (10, r#"=TEXT(12.345,"0.00")"#),
        (11, r#"=EXACT("Hi","Hi")"#),
        (12, r#"=EXACT("Hi","hi")"#),
    ];
    for (row, src) in formulas {
        store.set_formula(sheet, row, 0, src, 0);
    }
    store.recompute(sheet);

    assert_eq!(store.get_cell(sheet, 0, 0).kind(), KIND_STRING);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("Hello \"Q\""));

    let length = store.get_cell(sheet, 1, 0);
    assert_eq!((length.kind(), length.num()), (KIND_FORMULA, 5.0));

    assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some("abc"));
    assert_eq!(string(&store, sheet, 3, 0).as_deref(), Some("def"));
    assert_eq!(string(&store, sheet, 4, 0).as_deref(), Some("bcd"));
    assert_eq!(string(&store, sheet, 5, 0).as_deref(), Some("A1TRUE"));
    assert_eq!(string(&store, sheet, 6, 0).as_deref(), Some("xy"));
    assert_eq!(string(&store, sheet, 7, 0).as_deref(), Some("MIX"));
    assert_eq!(string(&store, sheet, 8, 0).as_deref(), Some("mix"));
    assert_eq!(string(&store, sheet, 9, 0).as_deref(), Some("a b"));
    assert_eq!(string(&store, sheet, 10, 0).as_deref(), Some("12.35"));
    assert_eq!(store.get_cell(sheet, 11, 0).kind(), KIND_BOOL);
    assert_close(number(&store, sheet, 11, 0), 1.0);
    assert_eq!(store.get_cell(sheet, 12, 0).kind(), KIND_BOOL);
    assert_close(number(&store, sheet, 12, 0), 0.0);
}

#[test]
fn aggregate_functions_distinguish_direct_values_from_range_values() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 9);
    store.set_number(sheet, 0, 0, 2.0, 0);
    store.set_string(sheet, 1, 0, "3", 0);
    store.set_string(sheet, 2, 0, "x", 0);
    store.set_formula(sheet, 3, 0, "=TRUE", 0);
    store.set_formula(sheet, 5, 0, "=1/0", 0);

    let formulas = [
        (0, "=SUM(A1:A4)"),
        (1, r#"=SUM("3")"#),
        (2, r#"=SUM("x")"#),
        (3, "=COUNT(A1:A4)"),
        (4, "=COUNTA(A1:A5)"),
        (5, "=COUNTA(A5)"),
        (6, "=LEN(A5)"),
        (7, "=A5+1"),
        (8, "=SUM(A6:A6)"),
    ];
    for (row, src) in formulas {
        store.set_formula(sheet, row, 1, src, 0);
    }
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 1), 2.0);
    assert_close(number(&store, sheet, 1, 1), 3.0);
    assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("#VALUE!"));
    assert_close(number(&store, sheet, 3, 1), 1.0);
    assert_close(number(&store, sheet, 4, 1), 4.0);
    assert_close(number(&store, sheet, 5, 1), 0.0);
    assert_close(number(&store, sheet, 6, 1), 0.0);
    assert_close(number(&store, sheet, 7, 1), 1.0);
    assert_eq!(string(&store, sheet, 8, 1).as_deref(), Some("#DIV/0!"));
}

#[test]
fn builtin_argument_errors_and_numeric_boundaries_propagate_without_panics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(48, 1);
    let error_formulas = [
        ("=ROUND(\"x\",2)", "#VALUE!"),
        ("=ROUND(1,\"x\")", "#VALUE!"),
        ("=ROUND(1,400)", "#NUM!"),
        ("=MOD(\"x\",2)", "#VALUE!"),
        ("=MOD(1,\"x\")", "#VALUE!"),
        ("=POW(\"x\",2)", "#VALUE!"),
        ("=POW(2,\"x\")", "#VALUE!"),
        ("=FLOOR(\"x\",1)", "#VALUE!"),
        ("=FLOOR(1,\"x\")", "#VALUE!"),
        ("=FLOOR(1,0)", "#DIV/0!"),
        ("=CEILING(\"x\",1)", "#VALUE!"),
        ("=CEILING(1,\"x\")", "#VALUE!"),
        ("=FLOOR(1,0)", "#DIV/0!"),
        ("=TRUNC(\"x\",1)", "#VALUE!"),
        ("=TRUNC(1,\"x\")", "#VALUE!"),
        ("=TRUNC(1,400)", "#NUM!"),
        ("=AND(TRUE,\"not-bool\")", "#VALUE!"),
        ("=OR(FALSE,\"not-bool\")", "#VALUE!"),
        ("=NOT(\"not-bool\")", "#VALUE!"),
        ("=LEN(1/0)", "#DIV/0!"),
        ("=LEFT(\"abc\",-1)", "#VALUE!"),
        ("=RIGHT(\"abc\",-1)", "#VALUE!"),
        ("=MID(\"abc\",0,1)", "#VALUE!"),
        ("=MID(\"abc\",1,-1)", "#VALUE!"),
        ("=CONCAT(\"ok\",1/0)", "#DIV/0!"),
        ("=UPPER(1/0)", "#DIV/0!"),
        ("=LOWER(1/0)", "#DIV/0!"),
        ("=TRIM(1/0)", "#DIV/0!"),
        ("=TEXT(1,1/0)", "#DIV/0!"),
        ("=DATE(\"x\",1,1)", "#VALUE!"),
        ("=DATE(2024,\"x\",1)", "#VALUE!"),
        ("=DATE(2024,1,\"x\")", "#VALUE!"),
        ("=DATEVALUE(\"not-a-date\")", "#VALUE!"),
        ("=DAY(1/0)", "#DIV/0!"),
        ("=EXACT(1/0,\"x\")", "#DIV/0!"),
        ("=EXACT(\"x\",1/0)", "#DIV/0!"),
    ];
    for (col, (formula, _)) in error_formulas.iter().enumerate() {
        store.set_formula(sheet, 0, col, formula, 0);
    }
    store.set_formula(sheet, 0, 36, "=AVG()", 0);
    store.set_formula(sheet, 0, 37, "=MIN()", 0);
    store.set_formula(sheet, 0, 38, "=MAX()", 0);
    store.set_formula(sheet, 0, 39, "=SIGN(9)", 0);
    store.set_formula(sheet, 0, 40, "=SIGN(0)", 0);
    store.recompute(sheet);

    for (col, (formula, expected)) in error_formulas.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 0, col).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
    for col in 36..=38 {
        assert_close(number(&store, sheet, 0, col), 0.0);
    }
    assert_close(number(&store, sheet, 0, 39), 1.0);
    assert_close(number(&store, sheet, 0, 40), 0.0);
}

#[test]
fn date_time_functions_use_excel_serials_and_controlled_volatile_inputs() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(13, 1);
    let formulas = [
        (0, "=DATE(2024,2,29)"),
        (1, "=DATEVALUE(\"2024-02-29\")"),
        (2, "=DAY(A1)"),
        (3, "=MONTH(A1)"),
        (4, "=YEAR(A1)"),
        (5, "=TEXT(A1,\"yyyy-mm-dd\")"),
        (6, "=TODAY()"),
        (7, "=NOW()"),
        (8, "=DATE(1900,1,1)"),
        (9, "=DATE(1900,2,29)"),
        (10, "=DATE(1900,3,1)"),
        (11, "=DATE(2024,13,1)"),
        (12, "=DATE(1900,1,60)"),
    ];
    for (col, source) in formulas {
        store.set_formula(sheet, 0, col, source, 0);
    }
    store.recompute_volatile(46_000.75);

    assert_close(number(&store, sheet, 0, 0), 45_351.0);
    assert_close(number(&store, sheet, 0, 1), 45_351.0);
    assert_close(number(&store, sheet, 0, 2), 29.0);
    assert_close(number(&store, sheet, 0, 3), 2.0);
    assert_close(number(&store, sheet, 0, 4), 2024.0);
    assert_eq!(string(&store, sheet, 0, 5).as_deref(), Some("2024-02-29"));
    assert_close(number(&store, sheet, 0, 6), 46_000.0);
    assert_close(number(&store, sheet, 0, 7), 46_000.75);
    assert_close(number(&store, sheet, 0, 8), 1.0);
    assert_close(number(&store, sheet, 0, 9), 60.0);
    assert_close(number(&store, sheet, 0, 10), 61.0);
    assert_close(number(&store, sheet, 0, 11), 45_658.0);
    assert_close(number(&store, sheet, 0, 12), 60.0);
}

#[test]
fn information_and_control_functions_preserve_types_errors_and_lazy_branches() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(24, 1);
    let formulas = [
        "=ISBLANK(A1)",
        "=ISNUMBER(1)",
        "=ISTEXT(\"x\")",
        "=ISLOGICAL(TRUE)",
        "=ISERROR(1/0)",
        "=ISERR(NA())",
        "=ISNA(NA())",
        "=TYPE(\"x\")",
        "=TYPE(1/0)",
        "=N(TRUE)",
        "=T(\"kept\")",
        "=T(7)",
        "=IFNA(NA(),7)",
        "=IFNA(2,1/0)",
        "=IFS(FALSE,1/0,TRUE,8)",
        "=SWITCH(2,1,1/0,2,9,1/0)",
        "=XOR(TRUE,FALSE,TRUE)",
        "=TRUE()",
        "=FALSE()",
    ];
    for (col, source) in formulas.into_iter().enumerate() {
        store.set_formula(sheet, 0, col + 1, source, 0);
    }
    store.recompute(sheet);

    for col in [1, 2, 3, 4, 5, 7, 18] {
        assert_eq!(store.get_cell(sheet, 0, col).kind(), KIND_BOOL);
        assert_close(number(&store, sheet, 0, col), 1.0);
    }
    for col in [6, 17, 19] {
        assert_eq!(store.get_cell(sheet, 0, col).kind(), KIND_BOOL);
        assert_close(number(&store, sheet, 0, col), 0.0);
    }
    assert_close(number(&store, sheet, 0, 8), 2.0);
    assert_close(number(&store, sheet, 0, 9), 16.0);
    assert_close(number(&store, sheet, 0, 10), 1.0);
    assert_eq!(string(&store, sheet, 0, 11).as_deref(), Some("kept"));
    assert_eq!(string(&store, sheet, 0, 12).as_deref(), Some(""));
    assert_close(number(&store, sheet, 0, 13), 7.0);
    assert_close(number(&store, sheet, 0, 14), 2.0);
    assert_close(number(&store, sheet, 0, 15), 8.0);
    assert_close(number(&store, sheet, 0, 16), 9.0);
}

#[test]
fn lookup_functions_cover_exact_approximate_reverse_and_not_found_paths() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(11, 6);
    for (row, (key, value)) in [(1.0, 10.0), (2.0, 20.0), (3.0, 30.0)]
        .into_iter()
        .enumerate()
    {
        store.set_number(sheet, row, 0, key, 0);
        store.set_number(sheet, row, 1, value, 0);
    }
    for (col, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, 4, col, value, 0);
        store.set_number(sheet, 5, col, value * 10.0, 0);
    }
    let formulas = [
        (2, "=INDEX(A1:B3,2,2)"),
        (3, "=MATCH(2.5,A1:A3,1)"),
        (4, "=VLOOKUP(2.5,A1:B3,2,TRUE)"),
        (5, "=HLOOKUP(2.5,A5:C6,2,TRUE)"),
        (6, "=XLOOKUP(2,A1:A3,B1:B3,\"missing\")"),
        (7, "=XLOOKUP(9,A1:A3,B1:B3,\"missing\")"),
        (8, "=MATCH(9,A1:A3,0)"),
        (9, "=XLOOKUP(2.5,A1:A3,B1:B3,,1,-1)"),
        (10, "=XLOOKUP(9,A1:A3,B1:B3,,0)"),
    ];
    for (col, source) in formulas {
        store.set_formula(sheet, 0, col, source, 0);
    }
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 2), 20.0);
    assert_close(number(&store, sheet, 0, 3), 2.0);
    assert_close(number(&store, sheet, 0, 4), 20.0);
    assert_close(number(&store, sheet, 0, 5), 20.0);
    assert_close(number(&store, sheet, 0, 6), 20.0);
    assert_eq!(string(&store, sheet, 0, 7).as_deref(), Some("missing"));
    assert_eq!(string(&store, sheet, 0, 8).as_deref(), Some("#N/A"));
    assert_close(number(&store, sheet, 0, 9), 30.0);
    assert_eq!(string(&store, sheet, 0, 10).as_deref(), Some("#N/A"));
}

#[test]
fn criteria_and_lookup_validation_preserves_error_precedence_and_shapes() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(48, 3);
    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
        store.set_number(sheet, row, 1, value * 10.0, 0);
    }
    let errors = [
        ("=TODAY(1)", "#VALUE!"),
        ("=COUNTIF(A1:A2)", "#VALUE!"),
        ("=COUNTIF(1,\">0\")", "#VALUE!"),
        ("=COUNTIF(A1:A2,1/0)", "#DIV/0!"),
        ("=COUNTIFS()", "#VALUE!"),
        ("=COUNTIFS(A1:A2,\">0\",B1:B3,\">0\")", "#VALUE!"),
        ("=SUMIF(A1:A2)", "#VALUE!"),
        ("=SUMIF(1,\">0\")", "#VALUE!"),
        ("=SUMIFS(A1:A2)", "#VALUE!"),
        ("=SUMIFS(A1:A2,B1:B3,\">0\")", "#VALUE!"),
        ("=AVERAGEIF(A1:A2,\">9\")", "#DIV/0!"),
        ("=INDEX(A1:B2)", "#VALUE!"),
        ("=INDEX(A1:B2,-1,1)", "#VALUE!"),
        ("=INDEX(A1:B2,1)", "#VALUE!"),
        ("=INDEX(A1:B2,9,1)", "#REF!"),
        ("=MATCH(1,A1:B2,0)", "#N/A"),
        ("=MATCH(1,A1:A2,9)", "#VALUE!"),
        ("=MATCH(1/0,A1:A2)", "#DIV/0!"),
        ("=MATCH(1,1)", "#VALUE!"),
        ("=VLOOKUP(1,A1:B2)", "#VALUE!"),
        ("=VLOOKUP(1/0,A1:B2,2)", "#DIV/0!"),
        ("=VLOOKUP(1,1,2)", "#VALUE!"),
        ("=VLOOKUP(1,A1:B2,0)", "#VALUE!"),
        ("=VLOOKUP(1,A1:B2,2,\"bad\")", "#VALUE!"),
        ("=VLOOKUP(9,A1:B2,2,FALSE)", "#N/A"),
        ("=VLOOKUP(1,A1:B2,9,FALSE)", "#REF!"),
        ("=XLOOKUP(1,A1:A2)", "#VALUE!"),
        ("=XLOOKUP(1/0,A1:A2,B1:B2)", "#DIV/0!"),
        ("=XLOOKUP(1,1,B1:B2)", "#VALUE!"),
        ("=XLOOKUP(1,A1:A2,B1:B3)", "#VALUE!"),
        ("=XLOOKUP(1,A1:A2,B1:B2,,9)", "#VALUE!"),
        ("=XLOOKUP(1,A1:A2,B1:B2,,,0)", "#VALUE!"),
        ("=XLOOKUP(9,A1:A2,B1:B2)", "#N/A"),
    ];
    for (offset, (formula, _)) in errors.iter().enumerate() {
        store.set_formula(sheet, 0, offset + 2, formula, 0);
    }
    store.set_formula(sheet, 0, 36, "=IF(FALSE,1)", 0);
    store.set_formula(sheet, 0, 37, "=IFERROR(1/0)", 0);
    store.recompute(sheet);

    for (offset, (formula, expected)) in errors.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 0, offset + 2).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
    assert_close(number(&store, sheet, 0, 36), 0.0);
    assert_close(number(&store, sheet, 0, 37), 0.0);
}
#[test]
fn criteria_wildcards_approximate_lookup_and_empty_logic_follow_spreadsheet_semantics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(24, 4);
    for (row, value) in ["Alpha", "a*", "ax", "a~b"].into_iter().enumerate() {
        store.set_string(sheet, row, 0, value, 0);
    }
    for (row, value) in [1.0, 2.0, 3.0, 4.0].into_iter().enumerate() {
        store.set_number(sheet, row, 1, value, 0);
        store.set_number(sheet, row, 2, 4.0 - row as f64, 0);
    }
    let numeric_formulas = [
        "=COUNTIF(A1:A4,\"a?\")",
        "=COUNTIF(A1:A4,\"a~*\")",
        "=COUNTIF(A1:A4,\"a~b\")",
        "=COUNTIF(B1:B4,\">=2\")",
        "=COUNTIF(B1:B4,\"<=2\")",
        "=COUNTIF(B1:B4,\"<>2\")",
        "=COUNTIF(B1:B4,\"=2\")",
        "=SUMIF(B1:B4,\">2\")",
        "=XLOOKUP(\"a*\",A1:A4,B1:B4,,2)",
        "=XLOOKUP(2.5,B1:B4,B1:B4,,-1,2)",
        "=XLOOKUP(2.5,B1:B4,B1:B4,,1,2)",
        "=MATCH(2.5,C1:C4,-1)",
        "=AND()",
        "=OR()",
    ];
    for (offset, formula) in numeric_formulas.iter().enumerate() {
        store.set_formula(sheet, 0, offset + 3, formula, 0);
    }
    let errors = [
        ("=AVG(\"x\")", "#VALUE!"),
        ("=MIN(\"x\")", "#VALUE!"),
        ("=MAX(\"x\")", "#VALUE!"),
        ("=LEFT(1/0,1)", "#DIV/0!"),
        ("=RIGHT(1/0,1)", "#DIV/0!"),
        ("=MID(1/0,1,1)", "#DIV/0!"),
        ("=MID(\"x\",1,1/0)", "#DIV/0!"),
        ("=NA()", "#N/A"),
    ];
    for (offset, (formula, _)) in errors.iter().enumerate() {
        store.set_formula(sheet, 1, offset + 3, formula, 0);
    }
    store.recompute(sheet);

    let expected = [
        2.0, 1.0, 1.0, 3.0, 2.0, 3.0, 1.0, 7.0, 1.0, 2.0, 3.0, 2.0, 1.0, 0.0,
    ];
    for (offset, value) in expected.into_iter().enumerate() {
        let actual = number(&store, sheet, 0, offset + 3);
        assert!(
            (actual - value).abs() < 1e-9,
            "{} expected {value}, got {actual}",
            numeric_formulas[offset]
        );
    }
    for (offset, (formula, expected)) in errors.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 1, offset + 3).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
}

#[test]
fn named_ranges_resolve_scope_rebase_delete_cycle_and_preserve_unknown_sources() {
    let mut store = CellStore::new();

    let data = store.add_sheet(2, 4);
    let summary = store.add_sheet(4, 2);
    let other = store.add_sheet(1, 1);
    store.set_sheet_name(data, "data", "Data");
    store.set_sheet_name(summary, "summary", "Summary");
    store.set_sheet_name(other, "other", "Other");
    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(data, row, 0, value, 0);
        store.set_number(data, row, 1, value * 10.0, 0);
    }
    store.set_formula(summary, 0, 0, "=SUM(Values)", 0);
    store.set_formula(other, 0, 0, "=SUM(Values)", 0);
    assert!(store.set_named_range("Values", -1, data, 0, 0, 2, 0));
    assert!(store.set_named_range("Values", summary as i32, data, 0, 1, 2, 1));
    assert_close(number(&store, summary, 0, 0), 60.0);
    assert_close(number(&store, other, 0, 0), 6.0);

    assert!(store.set_named_range("Self", summary as i32, summary, 0, 1, 0, 1));
    store.set_formula(summary, 0, 1, "=SUM(Self)", 0);
    store.set_formula(summary, 0, 2, "=UNSUPPORTED(A1)", 0);
    store.recompute(summary);
    assert_eq!(string(&store, summary, 0, 1).as_deref(), Some("#CYCLE!"));
    assert_eq!(string(&store, summary, 0, 2).as_deref(), Some("#NAME?"));
    assert_eq!(
        store.formula_source(summary, 0, 2).as_deref(),
        Some("=UNSUPPORTED(A1)")
    );

    store.add_rows(data, 1, 1);
    store.recompute(other);
    assert_close(number(&store, other, 0, 0), 6.0);
    store.remove_rows(data, 0, 4);
    store.recompute(other);
    assert_eq!(string(&store, other, 0, 0).as_deref(), Some("#NAME?"));
}

#[test]
fn rename_sheet_rewrites_canonical_sources_and_quoting_without_changing_handles() {
    let mut store = CellStore::new();
    let source = store.add_sheet(1, 2);
    let summary = store.add_sheet(2, 2);
    store.set_sheet_name(source, "sales", "Sales");
    store.set_sheet_name(summary, "summary", "Summary");
    store.set_number(source, 0, 0, 4.0, 0);
    store.set_number(source, 1, 0, 6.0, 0);
    store.set_formula(summary, 0, 0, "=Sales!A1+1", 0);
    store.set_formula(summary, 0, 1, "=SUM(Sales!A1:A2)", 0);
    store.recompute(summary);

    assert!(store.rename_sheet(source, "sales", "Sales Data"));
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=('Sales Data'!A1+1)")
    );
    assert_eq!(
        store.formula_source(summary, 0, 1).as_deref(),
        Some("=SUM('Sales Data'!A1:A2)")
    );
    assert_close(number(&store, summary, 0, 0), 5.0);
    assert_close(number(&store, summary, 0, 1), 10.0);

    assert!(store.rename_sheet(source, "sales", "O'Brien"));
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=('O''Brien'!A1+1)")
    );
    assert!(store.sheet_alive[source]);
    assert!(store.sheet_alive[summary]);
}

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
        Some("=(#REF!+1)")
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
fn oversized_range_returns_num_without_expansion() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, RANGE_CELL_LIMIT as usize + 1);
    store.set_formula(sheet, 0, 1, "=SUM(A1:A1000001)", 0);
    store.recompute(sheet);

    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("#NUM!"));
}

#[test]
fn deep_formula_evaluation_returns_num_error() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, FORMULA_RECURSION_LIMIT + 5);
    store.set_number(sheet, 0, 0, 1.0, 0);
    for row in 1..FORMULA_RECURSION_LIMIT + 4 {
        let src = format!("=A{}+1", row);
        store.set_formula(sheet, row, 0, &src, 0);
    }
    store.recompute(sheet);

    assert_eq!(
        string(&store, sheet, FORMULA_RECURSION_LIMIT + 3, 0).as_deref(),
        Some("#NUM!")
    );
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
        store.set_column_numbers(sheet, 9, 0, &[1.0, 2.0], 0);
        store.set_column_strings(sheet, 9, 0, vec!["x".to_string()], 0);
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
        assert!(store.search(99, &[0], "x", true, false).is_empty());
        assert_eq!(store.get_window(99, 0, 1, &[0]).n_rows(), 0);
    }));

    assert!(result.is_ok());
}

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
fn window_view_uses_error_strings_and_consuming_reads() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 2);
    store.set_string(sheet, 0, 0, "hello", 7);
    store.set_formula(sheet, 0, 1, "=1/0", 9);
    store.recompute(sheet);

    let view = store.get_window(sheet, 0, 1, &[0, 1, u32::MAX]);
    assert_eq!(view.n_rows(), 1);
    assert_eq!(view.n_cols(), 3);

    let view = decode_window(view);
    let pooled = store.pool_strings(&view.string_ids);

    assert_eq!(view.kinds, vec![KIND_STRING, KIND_STRING, KIND_EMPTY]);
    assert_eq!(view.numbers, vec![0.0, 0.0, 0.0]);
    let styles: Vec<u32> = view
        .style_index
        .iter()
        .map(|&index| view.style_dict[index as usize])
        .collect();
    assert_eq!(styles, vec![7, 9, 0]);
    assert_eq!(pooled[0], "hello");
    assert_eq!(view.strings[view.string_index[1] as usize], "#DIV/0!");

    let mut consumed = store.get_window(sheet, 0, 1, &[0, 1]);
    assert!(!consumed.take_packed().is_empty());
    assert!(consumed.take_packed().is_empty());

    store.set_formula(sheet, 1, 0, "=A1:B1", 0);
    store.recompute(sheet);
    let spill_view = decode_window(store.get_window(sheet, 1, 2, &[1]));
    assert_eq!(spill_view.kinds, vec![KIND_STRING]);
    let spill_index = spill_view.string_index[0];
    assert_eq!(spill_view.strings[spill_index as usize], "#DIV/0!");
}

#[test]
fn match_cache_handles_repeats_eviction_and_collisions() {
    let mut store = CellStore::new();
    // More distinct values than MATCH_CACHE_SLOTS (1024) so str_ids collide
    // mod slot count and evict each other mid-scan.
    let rows = 3000usize;
    let sheet = store.add_sheet(2, rows);
    for r in 0..rows {
        store.set_string(sheet, r, 0, &format!("item{r}"), 0);
        store.set_string(sheet, r, 1, if r % 3 == 0 { "Tokyo" } else { "Berlin" }, 0);
    }

    // Unique column: a colliding/evicting cache must still equal a brute scan.
    let expected: Vec<u32> = (0..rows)
        .filter(|r| format!("item{r}").contains('7'))
        .map(|r| r as u32)
        .collect();
    assert_eq!(store.filter_rows(sheet, 0, "7"), expected);

    let tokyo: Vec<u32> = (0..rows).step_by(3).map(|r| r as u32).collect();
    assert_eq!(store.filter_rows(sheet, 1, "tokyo"), tokyo);
}

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
fn pure_string_filter_fast_path_matches_mixed_and_unicode_fallbacks() {
    let mut store = CellStore::new();
    let rows = 5_000usize;
    let sheet = store.add_sheet(3, rows);
    for row in 0..rows {
        let text = if row % 11 == 0 {
            "Needle"
        } else if row % 17 == 0 {
            "CAFÉ"
        } else {
            "haystack"
        };
        store.set_string(sheet, row, 0, text, 0);
        if row % 5 == 0 {
            store.set_number(sheet, row, 1, 12_345.0, 0);
        } else {
            store.set_string(sheet, row, 1, text, 0);
        }
        store.set_string(sheet, row, 2, text, 0);
    }

    let needle: Vec<u32> = (0..rows)
        .filter(|row| row % 11 == 0)
        .map(|row| row as u32)
        .collect();
    assert_eq!(store.filter_rows(sheet, 0, "needle"), needle);
    assert_eq!(store.filter_rows(sheet, 2, "NEEDLE"), needle);

    let mixed: Vec<u32> = (0..rows)
        .filter(|row| row % 5 != 0 && row % 11 == 0)
        .map(|row| row as u32)
        .collect();
    assert_eq!(store.filter_rows(sheet, 1, "needle"), mixed);

    let unicode: Vec<u32> = (0..rows)
        .filter(|row| row % 17 == 0 && row % 11 != 0)
        .map(|row| row as u32)
        .collect();
    assert_eq!(store.filter_rows(sheet, 0, "café"), unicode);
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
fn packed_string_loader_survives_hostile_utf16_lengths() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 6);
    store.set_column_strings_packed(sheet, 0, 0, "abc".to_string(), &[2, 5, 3], 0);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("ab"));
    assert_eq!(string(&store, sheet, 1, 0).as_deref(), Some("c"));
    assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some(""));
    store.set_column_strings_packed(sheet, 1, 0, "abcdef".to_string(), &[2, 1], 0);
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("ab"));
    assert_eq!(string(&store, sheet, 1, 1).as_deref(), Some("c"));
    assert_eq!(string(&store, sheet, 2, 1), None);
    store.set_column_strings_packed(sheet, 2, 0, "𝄞x".to_string(), &[1, 1], 0);
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("𝄞"));
    assert_eq!(string(&store, sheet, 1, 2).as_deref(), Some("x"));
    store.set_column_strings_packed(sheet, 3, 0, "é漢z".to_string(), &[1, 1, 1], 0);
    assert_eq!(string(&store, sheet, 0, 3).as_deref(), Some("é"));
    assert_eq!(string(&store, sheet, 1, 3).as_deref(), Some("漢"));
    assert_eq!(string(&store, sheet, 2, 3).as_deref(), Some("z"));
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
            "tokyo".to_string(),
            String::new(),
            String::new(),
            "Tokyo".to_string(),
            "TOK".to_string(),
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
        vec!["=A1>$B$1".to_string(), "=TRUE".to_string()],
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

    assert_eq!(store.sort_rows(sheet, 0, true), vec![4, 0, 3, 1, 2, 5]);
    assert_eq!(store.sort_rows(sheet, 0, false), vec![5, 2, 1, 3, 0, 4]);
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
fn scoped_clear_preserves_unrelated_calculated_values_and_recomputes_readers() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 3);
    store.set_number(sheet, 0, 0, 5.0, 7);
    store.set_formula(sheet, 0, 1, "=A1+1", 9);
    store.set_formula(sheet, 0, 2, "=\"survivor\"", 0);
    store.set_formula(sheet, 1, 2, "=SEQUENCE(2,1,10)", 0);
    store.recompute(sheet);

    assert!(store.clear_range(sheet, 0, 0, 0, 0, false, true));
    assert_close(number(&store, sheet, 0, 1), 6.0);
    assert_eq!(store.get_cell(sheet, 0, 0).style(), 0);
    assert!(store.clear_range(sheet, 0, 0, 0, 0, true, false));
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("survivor"));
    assert_close(number(&store, sheet, 2, 2), 11.0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 1.0);

    assert!(store.clear_range(sheet, 1, 2, 1, 2, true, false));
    store.recompute(sheet);
    assert_eq!(store.get_cell(sheet, 2, 2).kind(), KIND_EMPTY);
}

#[test]
fn rectangle_writes_preserve_unrelated_results_and_recompute_registered_readers() {
    const EDIT_ROWS: usize = 5000;
    for write_kind in 0..6 {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, EDIT_ROWS + 4);
        let other = store.add_sheet(2, 2);
        store.set_sheet_name(sheet, "source", "Source");
        store.set_number(sheet, 0, 0, 5.0, 0);
        store.set_number(sheet, EDIT_ROWS - 1, 0, 7.0, 0);
        store.set_formula(sheet, 0, 1, "=A1+1", 0);
        store.set_formula(sheet, 1, 1, "=SUM(A1:A5000)", 0);
        store.set_formula(sheet, 0, 2, "=\"survivor\"", 0);
        store.set_formula(sheet, 1, 2, "=SEQUENCE(2,1,10)", 0);
        store.set_formula(other, 0, 0, "=Source!A5000+2", 0);
        store.set_formula(other, 1, 0, "=Source!B2+3", 0);
        store.commit_sources();

        // A prior scalar edit must survive the Cells -> Ranges transition.
        store.set_number(sheet, EDIT_ROWS + 1, 3, 8.0, 0);
        store.set_formula(sheet, EDIT_ROWS + 1, 4, "=D5002+1", 0);
        let expected_source = match write_kind {
            0 => {
                assert!(store.clear_range(sheet, 0, 0, EDIT_ROWS - 1, 0, true, false));
                0.0
            }
            1 => {
                store.set_column_numbers(sheet, 0, 0, &vec![2.0; EDIT_ROWS], 0);
                2.0
            }
            2 => {
                store.set_column_strings(sheet, 0, 0, vec!["2".into(); EDIT_ROWS], 0);
                2.0
            }
            3 => {
                store.set_column_strings_packed(
                    sheet,
                    0,
                    0,
                    "2".repeat(EDIT_ROWS),
                    &vec![1; EDIT_ROWS],
                    0,
                );
                2.0
            }
            4 | 5 => {
                let kinds = vec![KIND_NUMBER; EDIT_ROWS];
                let numbers = vec![2.0; EDIT_ROWS];
                let styles = vec![0; EDIT_ROWS];
                let status = if write_kind == 4 {
                    store.set_block_packed(
                        sheet,
                        0,
                        0,
                        EDIT_ROWS,
                        1,
                        &kinds,
                        &numbers,
                        b"",
                        &[0],
                        &styles,
                        &[],
                        vec![],
                        &[],
                        &[],
                    )
                } else {
                    store.set_column_block_packed(
                        sheet,
                        0,
                        0,
                        EDIT_ROWS,
                        1,
                        &kinds,
                        &numbers,
                        b"",
                        &[0],
                        &styles,
                        &[],
                        vec![],
                        &[],
                        &[],
                    )
                };
                assert_eq!(status, 0);
                2.0
            }
            _ => unreachable!(),
        };

        assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("survivor"));
        assert_close(number(&store, sheet, 2, 2), 11.0);
        store.commit_sources();
        assert_close(number(&store, sheet, 0, 1), expected_source + 1.0);
        // SUM ignores strings, whereas arithmetic coerces numeric text.
        let expected_sum = if matches!(write_kind, 2 | 3) {
            0.0
        } else {
            expected_source * EDIT_ROWS as f64
        };
        assert_close(number(&store, sheet, 1, 1), expected_sum);
        assert_close(number(&store, other, 0, 0), expected_source + 2.0);
        assert_close(number(&store, other, 1, 0), expected_sum + 3.0);
        assert_close(number(&store, sheet, EDIT_ROWS + 1, 4), 9.0);
        assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("survivor"));
        assert_close(number(&store, sheet, 2, 2), 11.0);
    }
}

#[test]
fn many_scalar_writes_before_a_bulk_write_recompute_every_reader() {
    // More written cells than registered formulas and read keys make the
    // pass scan the registered sources instead of walking each small
    // dirty rectangle cell by cell.
    const WRITTEN_ROWS: usize = 300;
    const ROW_STEP: usize = 3;
    const BULK_ROWS: usize = 50;
    const SCALAR_COL: usize = 2;
    const BULK_COL: usize = 0;
    const FORMULA_COL: usize = 4;
    const INITIAL_VALUE: f64 = 1.0;
    const WRITTEN_VALUE: f64 = 4.0;
    const BULK_VALUE: f64 = 3.0;

    let mut store = CellStore::new();
    let sheet = store.add_sheet(8, WRITTEN_ROWS * ROW_STEP + 1);
    let other = store.add_sheet(2, 2);
    store.set_sheet_name(sheet, "source", "Source");
    for index in 0..WRITTEN_ROWS {
        store.set_number(sheet, index * ROW_STEP, SCALAR_COL, INITIAL_VALUE, 0);
    }
    store.set_formula(sheet, 0, FORMULA_COL, "=C4*2", 0);
    store.set_formula(sheet, 1, FORMULA_COL, "=SUM(C1:C900)", 0);
    store.set_formula(sheet, 2, FORMULA_COL, "=SUM(A1:A50)", 0);
    store.set_formula(other, 0, 0, "=Source!C7+1", 0);
    store.commit_sources();
    assert_close(number(&store, sheet, 0, FORMULA_COL), INITIAL_VALUE * 2.0);

    // Reverse order keeps the dirty cells from arriving as one sorted run.
    for index in (0..WRITTEN_ROWS).rev() {
        store.set_number(sheet, index * ROW_STEP, SCALAR_COL, WRITTEN_VALUE, 0);
    }

    // A scalar written into the formula column is a dirty formula reader too.
    store.set_formula(sheet, 3, FORMULA_COL, "=C10+1", 0);
    store.set_column_numbers(sheet, BULK_COL, 0, &[BULK_VALUE; BULK_ROWS], 0);
    store.commit_sources();

    assert_close(number(&store, sheet, 0, FORMULA_COL), WRITTEN_VALUE * 2.0);
    assert_close(
        number(&store, sheet, 1, FORMULA_COL),
        WRITTEN_VALUE * WRITTEN_ROWS as f64,
    );
    assert_close(
        number(&store, sheet, 2, FORMULA_COL),
        BULK_VALUE * BULK_ROWS as f64,
    );
    assert_close(number(&store, sheet, 3, FORMULA_COL), WRITTEN_VALUE + 1.0);
    assert_close(number(&store, other, 0, 0), WRITTEN_VALUE + 1.0);
}

#[test]
fn rectangle_clear_releases_attempted_spill_without_disturbing_other_spills() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 6000);
    store.set_number(sheet, 4999, 0, 1.0, 0);
    store.set_formula(sheet, 0, 0, "=SEQUENCE(5000)", 0);
    store.set_formula(sheet, 0, 2, "=SEQUENCE(2,1,20)", 0);
    store.commit_sources();
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#SPILL!"));

    assert!(store.clear_range(sheet, 1, 0, 5000, 0, true, false));
    assert_close(number(&store, sheet, 1, 2), 21.0);
    store.commit_sources();
    assert_close(number(&store, sheet, 4999, 0), 5000.0);
    assert_close(number(&store, sheet, 1, 2), 21.0);
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

#[test]
fn paged_derived_text_is_remapped_by_collection_but_not_captured_as_source() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 3, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    for row in 0..3 {
        store.clear_cell(sheet, row, 0, 0);
    }
    for edit in 0..100 {
        store.set_string(sheet, 0, 1, &format!("obsolete-{edit}"), 0);
    }
    store.set_formula(
        sheet,
        0,
        0,
        "={\"anchor\";\"first child\";\"second child\"}",
        0,
    );
    store.commit_sources();
    store.clear_cell(sheet, 0, 1, 0);
    store.compact_string_storage();
    assert!(store.string_pool_epoch() > 0);
    assert_eq!(
        [0, 1, 2].map(|row| string(&store, sheet, row, 0)),
        [
            Some("anchor".into()),
            Some("first child".into()),
            Some("second child".into())
        ],
    );
    let snapshot = store.capture_range(sheet, 0, 0, 3, 1).unwrap();
    assert_eq!(store.snapshot_texts(&snapshot), vec!["", "", ""]);
    assert_eq!(snapshot.kinds(), vec![KIND_FORMULA, KIND_EMPTY, KIND_EMPTY]);
}

#[test]
fn paged_text_collection_preserves_dirty_overlays_after_clean_eviction() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(1, 1_000_000, 4096, 110_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.begin_page_load();
    store.set_column_strings(sheet, 0, 0, vec!["clean old".into()], 0);
    store.set_column_strings(sheet, 0, 4096, vec!["evicted".into()], 0);
    store.commit_sources();
    store.set_string(sheet, 0, 0, "dirty survivor", 0);
    store.begin_page_load();
    store.set_column_strings(sheet, 0, 8192, vec!["clean survivor".into()], 0);
    store.set_column_strings(sheet, 0, 12288, vec!["last survivor".into()], 0);
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
    store.set_column_numbers(sheet, 0, 0, &[1.0], 0);
    store.set_column_numbers(sheet, 0, 4096, &[2.0], 0);
    store.commit_sources();
    let loaded = store.paged_stats(sheet);
    assert_eq!(loaded[0], 2.0);
    assert_eq!(loaded[1], 2.0);
    assert_eq!(loaded[2], 0.0);

    // A local edit moves into the sparse overlay. Loading two more clean chunks
    // evicts the older clean chunk without affecting the local edit.
    store.set_number(sheet, 0, 0, 10.0, 0);
    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 8192, &[3.0], 0);
    store.set_column_numbers(sheet, 0, 12288, &[4.0], 0);
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
        store.set_column_numbers(sheet, 0, row, &[row as f64 + 1.0], 0);
    }
    store.commit_sources();

    store.pin_read_window(sheet, 0, 0, &[], &[]);
    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 12, &[13.0], 0);
    store.commit_sources();
    assert_close(number(&store, sheet, 4, 0), 5.0);
    assert_eq!(store.cell_state(sheet, 8, 0), 0);

    store.pin_viewport_bands(sheet, &[]);
    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 16, &[17.0], 0);
    store.commit_sources();
    assert_eq!(store.cell_state(sheet, 4, 0), 0);
}

#[test]
fn columns_fully_loaded_tracks_disjoint_columns_holes_bounds_and_sparse_accounting() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(3, 8, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);

    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 0, &[1.0, 2.0, 3.0, 4.0], 0);
    store.set_column_numbers(sheet, 2, 0, &[5.0, 6.0, 7.0, 8.0], 0);
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

    let stats = store.paged_stats(sheet);
    assert_eq!(stats[0], 2.0);
    assert_eq!(stats[1], 8.0);
    assert_eq!(stats[2], 0.0);
    assert_eq!(stats[4], 0.0);
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
    store.set_column_numbers(sheet, 0, 5000, &[41.0], 0);
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
            vec![String::new()],
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
            vec!["Alpha".to_string()],
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
            vec!["\0TRUE".to_string()],
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
            vec!["div/0".to_string()],
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
fn distinct_values_keep_first_seen_order_across_mixed_kinds() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, 16);
    fill_mixed_distinct_column(&mut store, sheet);
    store.compact_string_storage();

    let mut column = store.distinct_values(sheet, 0, 0);
    assert_eq!(column.take_kinds(), vec![2, 1, 2, 3, 1, 1, 1, 0, 2, 3, 1]);
    assert_eq!(
        distinct_number_bits(&mut column),
        vec![
            2.0f64.to_bits(),
            1.0f64.to_bits(),
            (-0.0f64).to_bits(),
            0.0f64.to_bits(),
            f64::NAN.to_bits(),
            0.0f64.to_bits(),
            1.0f64.to_bits(),
        ]
    );
    assert_eq!(column.take_texts(), vec!["Beta", "#DIV/0!", "Alpha"]);
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
            vec!["=A1*3".to_string()],
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
            vec![String::new()],
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
            vec![String::new(), String::new()],
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

#[test]
fn required_formula_regressions_cover_let_lookup_and_criteria_shape() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(6, 10);
    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
        store.set_number(sheet, row, 1, value * 10.0, 0);
    }
    store.set_formula(sheet, 0, 3, "=LET(x,2,LET(x,3,x)+x)", 0);
    store.set_formula(sheet, 0, 2, "=SUM(LET(x,SEQUENCE(2),1),2)", 0);
    store.set_formula(sheet, 0, 4, "=XMATCH(2,A1:A3,0)", 0);
    store.set_formula(sheet, 0, 5, "=MAXIFS(A1:B1,A1:A2,\">0\")", 0);
    store.set_formula(
        sheet,
        1,
        3,
        "=MAXIFS(CHOOSE(1,B1:B3),CHOOSE(1,A1:A3),\">1\")",
        0,
    );
    store.set_formula(
        sheet,
        1,
        4,
        "=MAXIFS(CHOOSE(1,B1:B3),CHOOSE(1,A1:B2),\">1\")",
        0,
    );
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 3), 5.0);
    assert_close(number(&store, sheet, 0, 2), 3.0);
    assert_close(number(&store, sheet, 0, 4), 2.0);
    assert_eq!(string(&store, sheet, 0, 5).as_deref(), Some("#VALUE!"));
    assert_close(number(&store, sheet, 1, 3), 30.0);
    assert_eq!(string(&store, sheet, 1, 4).as_deref(), Some("#VALUE!"));
}

#[test]
fn required_control_lookup_reference_and_aggregate_targets_execute_end_to_end() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(20, 20);
    for (row, (left, right)) in [(1.0, 10.0), (2.0, 20.0), (3.0, 30.0)]
        .into_iter()
        .enumerate()
    {
        store.set_number(sheet, row, 0, left, 0);
        store.set_number(sheet, row, 1, right, 0);
    }
    store.set_number(sheet, 0, 3, 1.0, 0);
    store.set_number(sheet, 1, 3, 2.0, 0);
    store.set_number(sheet, 2, 3, 2.0, 0);
    store.set_string(sheet, 0, 4, "alpha", 0);
    store.set_string(sheet, 1, 4, "a*", 0);
    store.set_string(sheet, 2, 4, ">abc", 0);
    let formulas = [
        (10, 0, "=ROW()"),
        (10, 1, "=COLUMN()"),
        (10, 2, "=ROWS(CHOOSE(1,A1:B2))"),
        (10, 3, "=COLUMNS(CHOOSE(1,A1:B2))"),
        (10, 4, "=ADDRESS(3,4)"),
        (10, 5, "=COUNTBLANK(C1:C3)"),
        (10, 6, "=SUBTOTAL(9,A1:A3)"),
        (10, 7, "=SUMPRODUCT(A1:A3,B1:B3)"),
        (10, 8, "=MAXIFS(B1:B3,A1:A3,\">1\")"),
        (10, 9, "=MINIFS(B1:B3,A1:A3,\">1\")"),
        (10, 10, "=XMATCH(2,D1:D3,0,-1)"),
        (10, 11, "=XMATCH(2.5,A1:A3,-1)"),
        (10, 12, "=CHOOSE(2,1/0,7)"),
        (10, 13, "=LET(x,1/0,7)"),
        (10, 14, "=LET(x,A1,x+1)"),
        (10, 15, "=SUMPRODUCT(A1:B1,A1:A2)"),
        (10, 16, "=LOG(100,)"),
        (10, 17, "=XMATCH(\"a*\",E1:E3,2)"),
        (10, 18, "=XMATCH(\"a~*\",E1:E3,2)"),
        (10, 19, "=XMATCH(\">*\",E1:E3,2)"),
    ];
    for (row, col, source) in formulas {
        store.set_formula(sheet, row, col, source, 0);
    }
    store.recompute(sheet);

    for (col, expected) in [
        (0, 11.0),
        (1, 2.0),
        (2, 2.0),
        (3, 2.0),
        (5, 3.0),
        (6, 6.0),
        (7, 140.0),
        (8, 30.0),
        (9, 20.0),
        (10, 3.0),
        (11, 2.0),
        (12, 7.0),
        (13, 7.0),
        (14, 2.0),
        (16, 2.0),
        (17, 1.0),
        (18, 2.0),
        (19, 3.0),
    ] {
        assert_close(number(&store, sheet, 10, col), expected);
    }
    assert_eq!(string(&store, sheet, 10, 4).as_deref(), Some("$D$3"));
    assert_eq!(string(&store, sheet, 10, 15).as_deref(), Some("#VALUE!"));

    store.set_number(sheet, 0, 0, 5.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 10, 14), 6.0);
}

#[test]
fn let_binding_and_expansion_limits_are_deterministic() {
    fn bindings(count: usize) -> String {
        let mut source = String::from("=LET(");
        for index in 0..count {
            source.push_str(&format!("name_{index},{index},"));
        }
        source.push_str(&format!("name_{}", count - 1));
        source.push(')');
        source
    }

    fn doubling(depth: usize) -> String {
        let mut source = String::from("=LET(value_0,1");
        for index in 1..=depth {
            source.push_str(&format!(
                ",value_{index},value_{}+value_{}",
                index - 1,
                index - 1
            ));
        }
        source.push_str(&format!(",value_{depth})"));
        source
    }

    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 4);
    store.set_formula(sheet, 0, 0, &bindings(126), 0);
    store.set_formula(sheet, 0, 1, &bindings(127), 0);
    store.set_formula(sheet, 0, 2, &doubling(13), 0);
    store.set_formula(sheet, 0, 3, &doubling(14), 0);
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 0), 125.0);
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("#VALUE!"));
    assert_close(number(&store, sheet, 0, 2), 8192.0);
    assert_eq!(string(&store, sheet, 0, 3).as_deref(), Some("#NUM!"));
}

#[test]
fn array_constants_spill_with_their_shape_and_keep_element_types() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(8, 8);
    store.set_formula(sheet, 0, 0, "={1,2;3,4}", 0);
    store.set_formula(sheet, 3, 0, "={10;20;30}", 0);
    store.set_formula(sheet, 3, 2, "={\"a\",TRUE,#N/A,-2.5}", 0);
    store.set_formula(sheet, 6, 2, "={#NULL!,#VALUE!,#NUM!,#NAME?}", 0);
    store.recompute(sheet);

    assert_close(number(&store, sheet, 0, 0), 1.0);
    assert_close(number(&store, sheet, 0, 1), 2.0);
    assert_close(number(&store, sheet, 1, 0), 3.0);
    assert_close(number(&store, sheet, 1, 1), 4.0);
    assert_eq!(store.get_cell(sheet, 0, 2).kind(), KIND_EMPTY);
    assert_eq!(store.get_cell(sheet, 2, 0).kind(), KIND_EMPTY);
    assert_eq!(
        (
            store.spill_anchor_row(sheet, 1, 1),
            store.spill_anchor_col(sheet, 1, 1)
        ),
        (0, 0)
    );

    assert_close(number(&store, sheet, 5, 0), 30.0);
    assert_eq!(store.get_cell(sheet, 6, 0).kind(), KIND_EMPTY);

    assert_eq!(string(&store, sheet, 3, 2).as_deref(), Some("a"));
    let logical = store.get_cell(sheet, 3, 3);
    assert_eq!((logical.kind(), logical.num()), (KIND_BOOL, 1.0));
    assert_eq!(string(&store, sheet, 3, 4).as_deref(), Some("#N/A"));
    assert_close(number(&store, sheet, 3, 5), -2.5);
    for (col, expected) in [(2, "#NULL!"), (3, "#VALUE!"), (4, "#NUM!"), (5, "#NAME?")] {
        assert_eq!(string(&store, sheet, 6, col).as_deref(), Some(expected));
    }
}

#[test]
fn array_constants_act_as_array_arguments() {
    let cases = [
        ("=SUM({1,2,3})", 6.0),
        ("=SUM({1,\"a\",TRUE;4,5,6})", 16.0),
        ("=AVERAGE({1,2;3,6})", 3.0),
        ("=COUNT({1,\"a\",TRUE,2})", 2.0),
        ("=MAX({-4,7,2})", 7.0),
        ("=INDEX({1,2;3,4},2,1)", 3.0),
        ("=INDEX({5,6,7},3)", 7.0),
        ("=ROWS({1,2;3,4;5,6})", 3.0),
        ("=COLUMNS({1,2;3,4;5,6})", 2.0),
        ("=MATCH(\"b\",{\"a\",\"b\",\"c\"},0)", 2.0),
        ("=VLOOKUP(2,{1,10;2,20},2,FALSE)", 20.0),
        ("=SUMPRODUCT({1,2},{3,4})", 11.0),
        ("=SUM(TRANSPOSE({1;2;3}))", 6.0),
    ];
    for (source, expected) in cases {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 4);
        store.set_formula(sheet, 0, 0, source, 0);
        store.recompute(sheet);
        assert_eq!(string(&store, sheet, 0, 0), None, "{source}");
        assert_close(number(&store, sheet, 0, 0), expected);
    }

    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 4);
    store.set_formula(sheet, 0, 0, "=SUM({1,#DIV/0!})", 0);
    store.set_formula(sheet, 1, 0, "={1,2;3}", 0);
    store.set_formula(sheet, 2, 0, "={A2,1}", 0);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#DIV/0!"));
    assert_eq!(string(&store, sheet, 1, 0).as_deref(), Some("#VALUE!"));
    assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some("#VALUE!"));
}

#[test]
fn array_operators_broadcast_each_axis_and_keep_element_errors() {
    let cases: &[(&str, usize, &[&str])] = &[
        ("={1,2,3}+{10;20}", 3, &["11", "12", "13", "21", "22", "23"]),
        ("={1;2}+{10;20;30}", 1, &["11", "22", "#N/A"]),
        ("={1,2}+{10,20,30}", 3, &["11", "22", "#N/A"]),
        ("={1,2,3}-{1;2}", 3, &["0", "1", "2", "-1", "0", "1"]),
        ("={1,2,3}*10", 3, &["10", "20", "30"]),
        ("={4,6,8}/{2,0,4}", 3, &["2", "#DIV/0!", "2"]),
        ("={2,0,3}^{3,-1,2}", 3, &["8", "#DIV/0!", "9"]),
        ("={\"a\",\"b\"}&{1;2}", 2, &["a1", "b1", "a2", "b2"]),
        ("=-{1,-2,3}%", 3, &["-0.01", "0.02", "-0.03"]),
        ("=+{1,\"2\",TRUE}", 3, &["1", "2", "1"]),
        ("={1,#N/A,\"bad\",4}+1", 4, &["2", "#N/A", "#VALUE!", "5"]),
        ("=SEQUENCE(2,2)*2", 2, &["2", "4", "6", "8"]),
        ("=FILTER({1;2;3},{TRUE;FALSE;TRUE})+10", 1, &["11", "13"]),
        ("=-LET(x,SEQUENCE(3),1)", 1, &["-1"]),
        ("=+LET(x,SEQUENCE(3),2)", 1, &["2"]),
        ("=LET(x,SEQUENCE(3),25)%", 1, &["0.25"]),
        ("=H1#*10", 1, &["#REF!"]),
        ("=-H1#", 1, &["#REF!"]),
    ];
    for &(source, cols, expected) in cases {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 8);
        store.set_formula(sheet, 0, 0, source, 0);
        store.recompute(sheet);
        for (index, expected) in expected.iter().enumerate() {
            let row = index / cols;
            let col = index % cols;
            if let Ok(expected) = expected.parse::<f64>() {
                assert_eq!(string(&store, sheet, row, col), None, "{source}");
                assert_close(number(&store, sheet, row, col), expected);
            } else {
                assert_eq!(
                    string(&store, sheet, row, col).as_deref(),
                    Some(*expected),
                    "{source}"
                );
            }
        }
    }
}

#[test]
fn array_operators_compare_elements_and_feed_array_functions() {
    for (source, expected) in [
        ("=SUM(A1:A3*B1:B3)", 140.0),
        ("=SUMPRODUCT((A1:A5>2)*B1:B5)", 120.0),
        ("=MAX(A1:A3*2)", 6.0),
        ("=AVERAGE(A1:A3*2)", 4.0),
        ("=COUNT(A1:A3*2)", 3.0),
        ("=INDEX(A1:A3*2,2)", 4.0),
        ("=ROWS(A1:A3*2)", 3.0),
        ("=IF(TRUE,SUM(A1:A3*2),0)", 12.0),
    ] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 8);
        for row in 0..5 {
            store.set_number(sheet, row, 0, (row + 1) as f64, 0);
            store.set_number(sheet, row, 1, ((row + 1) * 10) as f64, 0);
        }
        store.set_formula(sheet, 0, 3, source, 0);
        store.recompute(sheet);
        assert_eq!(string(&store, sheet, 0, 3), None, "{source}");
        assert_close(number(&store, sheet, 0, 3), expected);
    }
    for (operator, expected) in [
        ("=", [false, true, false]),
        ("<>", [true, false, true]),
        ("<", [true, false, false]),
        (">", [false, false, true]),
        ("<=", [true, true, false]),
        (">=", [false, true, true]),
    ] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 4);
        store.set_formula(sheet, 0, 0, &format!("={{1,2,3}}{operator}2"), 0);
        store.recompute(sheet);
        for (col, expected) in expected.into_iter().enumerate() {
            let value = store.get_cell(sheet, 0, col);
            assert_eq!(
                (value.kind(), value.num()),
                (KIND_BOOL, f64::from(expected))
            );
        }
    }
}

#[test]
fn array_operators_refresh_range_and_spill_dependencies_and_obstructions() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(12, 12);
    for row in 0..5 {
        store.set_number(sheet, row, 0, (row + 1) as f64, 0);
        store.set_number(sheet, row, 1, (row + 1) as f64, 0);
    }
    store.set_formula(sheet, 0, 3, "=A1:A3*10", 0);
    store.set_formula(sheet, 0, 4, "=D1#*2", 0);
    store.set_formula(sheet, 0, 5, "=FILTER(A1:A5,B1:B5>2)", 0);
    store.set_formula(sheet, 0, 6, "=A1+B1", 0);
    store.recompute(sheet);
    for row in 0..3 {
        assert_close(number(&store, sheet, row, 3), ((row + 1) * 10) as f64);
        assert_close(number(&store, sheet, row, 4), ((row + 1) * 20) as f64);
        assert_close(number(&store, sheet, row, 5), (row + 3) as f64);
    }
    assert_close(number(&store, sheet, 0, 6), 2.0);
    store.set_number(sheet, 1, 0, 9.0, 0);
    store.set_number(sheet, 0, 1, 4.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 1, 3), 90.0);
    assert_close(number(&store, sheet, 1, 4), 180.0);
    assert_close(number(&store, sheet, 0, 5), 1.0);
    assert_close(number(&store, sheet, 3, 5), 5.0);
    assert_close(number(&store, sheet, 0, 6), 5.0);
    store.set_number(sheet, 6, 8, 42.0, 0);
    store.set_formula(sheet, 5, 8, "={1;2}*10", 0);
    store.set_formula(sheet, 5, 10, "=SEQUENCE(1001)*SEQUENCE(1,1000)", 0);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 5, 8).as_deref(), Some("#SPILL!"));
    assert_close(number(&store, sheet, 6, 8), 42.0);
    assert_eq!(string(&store, sheet, 5, 10).as_deref(), Some("#NUM!"));
}

#[cfg(feature = "analysis")]
#[test]
fn array_operators_feed_analysis_array_hooks() {
    for (source, expected) in [
        ("=INDEX(SORTBY({1;2;3},{1;2;3}*-1),1)", 3.0),
        ("=SUM(MMULT({1,2}*2,{3;4}))", 22.0),
        ("=SUM(TOCOL({1,2;3,4}+10))", 50.0),
        ("=SUM(MAP({1;2;3}*2,LAMBDA(x,x+1)))", 15.0),
    ] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 8);
        store.set_formula(sheet, 0, 0, source, 0);
        store.recompute(sheet);
        assert_eq!(string(&store, sheet, 0, 0), None, "{source}");
        assert_close(number(&store, sheet, 0, 0), expected);
    }
}

#[test]
fn array_constants_survive_structural_rewrites() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 4);
    store.set_number(sheet, 0, 0, 5.0, 0);
    store.set_formula(sheet, 0, 1, "=SUM({1,2;3,4})+A1", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 15.0);

    store.add_rows(sheet, 0, 1);
    store.recompute(sheet);
    assert_eq!(
        store.formula_source(sheet, 1, 1).as_deref(),
        Some("=(SUM({1,2;3,4})+A2)")
    );
    assert_close(number(&store, sheet, 1, 1), 15.0);
}

#[test]
fn every_indexed_array_producer_reinstalls_spills_after_dependency_edits() {
    let cases = [
        ("=A1:A3", 0, 9.0, 2, 0, 3.0),
        ("=$A$1:$A$3", 0, 9.0, 2, 0, 3.0),
        ("=Rows", 0, 9.0, 2, 0, 3.0),
        ("=FILTER(A1:A3,A1:A3)", 0, 9.0, 2, 0, 3.0),
        ("=SORT(A1:A3)", 0, 2.0, 2, 0, 9.0),
        ("=UNIQUE(A1:A3)", 0, 9.0, 2, 0, 3.0),
        ("=SEQUENCE(3,1,A1,1)", 0, 9.0, 2, 0, 11.0),
        ("=TRANSPOSE(A1:A3)", 0, 9.0, 0, 2, 3.0),
        ("=TAKE(A1:A3,2)", 0, 9.0, 1, 0, 2.0),
        ("=DROP(A1:A3,1)", 1, 20.0, 1, 0, 3.0),
        ("=CHOOSECOLS(A1:B3,1)", 0, 9.0, 2, 0, 3.0),
        ("=CHOOSEROWS(A1:A3,2,3)", 1, 20.0, 1, 0, 3.0),
        ("=LET(x,A1:A3,x)", 0, 9.0, 2, 0, 3.0),
        ("=CHOOSE(1,A1:A3,SEQUENCE(3))", 0, 9.0, 2, 0, 3.0),
        ("=LET(x,CHOOSE(1,A1:A3,SEQUENCE(3)),x)", 0, 9.0, 2, 0, 3.0),
    ];

    for (source, edit_row, anchor, probe_row, probe_col, probe) in cases {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 8);
        for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
            store.set_number(sheet, row, 0, value, 0);
            store.set_number(sheet, row, 1, value * 10.0, 0);
        }
        if source == "=Rows" {
            assert!(store.set_named_range("Rows", -1, sheet, 0, 0, 2, 0));
        }
        store.set_formula(sheet, 0, 4, "=0", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 4), 0.0);
        store.set_formula(sheet, 0, 4, source, 0);
        store.recompute(sheet);
        store.set_number(
            sheet,
            edit_row,
            0,
            if edit_row == 0 { 9.0 } else { 20.0 },
            0,
        );
        store.recompute(sheet);

        assert_close(number(&store, sheet, 0, 4), anchor);
        assert_close(number(&store, sheet, probe_row, 4 + probe_col), probe);
    }
}

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
    assert!(store.set_table(
        "table-id",
        "Sales",
        sheet,
        0,
        0,
        2,
        1,
        true,
        false,
        vec!["amount-id".into(), "calc-id".into()],
        vec!["Amount".into(), "Calc".into()],
    ));
    store.set_formula(sheet, 0, 2, "=SUM(Sales[Amount])", 0);
    store.set_formula(sheet, 1, 1, "=[@Amount]*2", 0);
    store.recompute(sheet);

    assert!(store.set_table(
        "other-id",
        "Archive",
        sheet,
        3,
        0,
        3,
        0,
        true,
        false,
        vec!["archive-id".into()],
        vec!["Archived".into()],
    ));
    assert!(!store.set_table(
        "table-id",
        "archive",
        sheet,
        0,
        0,
        2,
        1,
        true,
        false,
        vec!["amount-id".into(), "calc-id".into()],
        vec!["Value".into(), "Calc".into()],
    ));
    assert_eq!(
        store.formula_source(sheet, 0, 2).as_deref(),
        Some("=SUM(Sales[Amount])")
    );
    assert_close(number(&store, sheet, 0, 2), 7.0);

    assert!(store.set_table(
        "table-id",
        "Revenue",
        sheet,
        0,
        0,
        2,
        1,
        true,
        false,
        vec!["amount-id".into(), "calc-id".into()],
        vec!["Value".into(), "Calc".into()],
    ));
    assert_eq!(
        store.formula_source(sheet, 0, 2).as_deref(),
        Some("=SUM(Revenue[Value])")
    );
    assert_eq!(
        store.formula_source(sheet, 1, 1).as_deref(),
        Some("=([@Value]*2)")
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
    assert!(store.set_table(
        "first",
        "Café",
        sheet,
        0,
        0,
        1,
        0,
        true,
        false,
        vec!["value".into()],
        vec!["Wert".into()],
    ));
    store.set_number(sheet, 1, 0, 9.0, 0);
    store.set_formula(sheet, 0, 1, "=SUM(café[wert])", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 9.0);
    assert!(!store.set_named_range("CAFÉ", -1, sheet, 0, 1, 1, 1));
    assert!(!store.set_table(
        "second",
        "café",
        sheet,
        2,
        0,
        3,
        0,
        true,
        false,
        vec!["value-2".into()],
        vec!["Other".into()],
    ));
    assert!(!store.set_table(
        "bad-column",
        "Other",
        sheet,
        2,
        1,
        3,
        1,
        true,
        false,
        vec!["bad".into()],
        vec!["@Value".into()],
    ));
    assert!(!store.set_table(
        "duplicate-column-id",
        "Other",
        sheet,
        2,
        0,
        3,
        1,
        true,
        false,
        vec!["Å-id".into(), "å-ID".into()],
        vec!["Left".into(), "Right".into()],
    ));
    assert!(!store.set_table(
        "oversized",
        "Third",
        sheet,
        2,
        1,
        3,
        1,
        true,
        false,
        vec!["x".repeat(129)],
        vec!["Value".into()],
    ));
    let mut named_first = CellStore::new();
    let named_sheet = named_first.add_sheet(1, 2);
    assert!(named_first.set_named_range("Sales", -1, named_sheet, 0, 0, 1, 0));
    assert!(!named_first.set_table(
        "table-after-name",
        "sales",
        named_sheet,
        0,
        0,
        1,
        0,
        true,
        false,
        vec!["value".into()],
        vec!["Value".into()],
    ));
}

/// One cell of the input-order equivalence probe, described in row-major order.
struct ProbeCell {
    kind: u8,
    number: f64,
    text: &'static str,
    style: u32,
    formula_source: Option<String>,
    is_reference: bool,
}

fn push_probe_text(
    cells: &[ProbeCell],
    order: impl Iterator<Item = usize>,
    text: &mut Vec<u8>,
    offsets: &mut Vec<u32>,
) {
    for index in order {
        let cell = &cells[index];
        if cell.kind == KIND_STRING {
            text.extend_from_slice(cell.text.as_bytes());
            offsets.push(text.len() as u32);
        }
    }
}

#[test]
fn column_major_block_input_matches_row_major_for_mixed_cells() {
    const ROWS: usize = 6;
    const COLS: usize = 4;
    const TEXT_POOL: [&str; 4] = ["", "alpha", "雪😀", "omega"];
    let mut cells = Vec::with_capacity(ROWS * COLS);
    for index in 0..ROWS * COLS {
        let formula_source = (index % 7 == 3).then(|| format!("=A1+{index}"));
        let is_reference = formula_source.is_none() && index % 11 == 5;
        // Formula cells carry a string kind and text so the packed payload has
        // to consume their slot without interning it.
        let kind = if formula_source.is_some() {
            KIND_STRING
        } else {
            match index % 5 {
                0 => KIND_EMPTY,
                1 | 4 => KIND_NUMBER,
                2 => KIND_BOOL,
                _ => KIND_STRING,
            }
        };
        cells.push(ProbeCell {
            kind,
            number: index as f64 + 0.5,
            text: TEXT_POOL[index % TEXT_POOL.len()],
            style: index as u32 % 3 + 1,
            formula_source,
            is_reference,
        });
    }

    let mut row_kinds = Vec::with_capacity(cells.len());
    let mut row_numbers = Vec::with_capacity(cells.len());
    let mut row_styles = Vec::with_capacity(cells.len());
    let mut column_kinds = vec![KIND_EMPTY; cells.len()];
    let mut column_numbers = vec![0.0; cells.len()];
    let mut column_styles = vec![0u32; cells.len()];
    for (index, cell) in cells.iter().enumerate() {
        row_kinds.push(cell.kind);
        row_numbers.push(cell.number);
        row_styles.push(cell.style);
        let column_index = (index % COLS) * ROWS + index / COLS;
        column_kinds[column_index] = cell.kind;
        column_numbers[column_index] = cell.number;
        column_styles[column_index] = cell.style;
    }

    let mut row_text = Vec::new();
    let mut row_text_offsets = vec![0u32];
    let mut column_text = Vec::new();
    let mut column_text_offsets = vec![0u32];
    push_probe_text(&cells, 0..cells.len(), &mut row_text, &mut row_text_offsets);
    push_probe_text(
        &cells,
        (0..COLS).flat_map(|col| (0..ROWS).map(move |row| row * COLS + col)),
        &mut column_text,
        &mut column_text_offsets,
    );
    assert_ne!(
        row_text, column_text,
        "the probe must exercise both text orders"
    );

    let mut row_formula_offsets = Vec::new();
    let mut row_formula_sources = Vec::new();
    for (index, cell) in cells.iter().enumerate() {
        if let Some(source) = &cell.formula_source {
            row_formula_offsets.push(index as u32);
            row_formula_sources.push(source.clone());
        }
    }
    let mut column_formula_offsets = Vec::new();
    let mut column_formula_sources = Vec::new();
    for col in 0..COLS {
        for row in 0..ROWS {
            let index = row * COLS + col;
            if let Some(source) = &cells[index].formula_source {
                column_formula_offsets.push((col * ROWS + row) as u32);
                column_formula_sources.push(source.clone());
            }
        }
    }
    let mut row_reference_offsets = Vec::new();
    let mut column_reference_offsets = Vec::new();
    for (index, cell) in cells.iter().enumerate() {
        if cell.is_reference {
            row_reference_offsets.push(index as u32);
            column_reference_offsets.push(((index % COLS) * ROWS + index / COLS) as u32);
        }
    }

    let mut row_major = CellStore::new();
    let row_sheet = row_major.add_sheet(COLS, ROWS);
    let row_targets: Vec<u32> = row_reference_offsets
        .iter()
        .flat_map(|_| [row_sheet as u32, 0, 0])
        .collect();
    assert_eq!(
        row_major.set_block_packed(
            row_sheet,
            0,
            0,
            ROWS,
            COLS,
            &row_kinds,
            &row_numbers,
            &row_text,
            &row_text_offsets,
            &row_styles,
            &row_formula_offsets,
            row_formula_sources,
            &row_reference_offsets,
            &row_targets,
        ),
        0
    );

    let mut column_major = CellStore::new();
    let column_sheet = column_major.add_sheet(COLS, ROWS);
    let column_targets: Vec<u32> = column_reference_offsets
        .iter()
        .flat_map(|_| [column_sheet as u32, 0, 0])
        .collect();
    assert_eq!(
        column_major.set_column_block_packed(
            column_sheet,
            0,
            0,
            ROWS,
            COLS,
            &column_kinds,
            &column_numbers,
            &column_text,
            &column_text_offsets,
            &column_styles,
            &column_formula_offsets,
            column_formula_sources,
            &column_reference_offsets,
            &column_targets,
        ),
        0
    );

    row_major.commit_sources();
    column_major.commit_sources();
    for row in 0..ROWS {
        for col in 0..COLS {
            let expected = row_major.get_cell(row_sheet, row, col);
            let actual = column_major.get_cell(column_sheet, row, col);
            assert_eq!(actual.kind(), expected.kind(), "kind at {row}:{col}");
            assert_close(actual.num(), expected.num());
            assert_eq!(actual.string(), expected.string(), "text at {row}:{col}");
            assert_eq!(actual.style(), expected.style(), "style at {row}:{col}");
        }
    }

    let row_sources = row_major
        .capture_sources(row_sheet, 0, 0, ROWS, COLS)
        .expect("row-major sources");
    let column_sources = column_major
        .capture_sources(column_sheet, 0, 0, ROWS, COLS)
        .expect("column-major sources");
    assert_eq!(
        row_sources.formula_offsets(),
        column_sources.formula_offsets()
    );
    assert_eq!(
        row_sources.formula_sources(),
        column_sources.formula_sources()
    );
    assert_eq!(
        row_sources.reference_offsets(),
        column_sources.reference_offsets()
    );
    assert_eq!(
        row_sources.reference_targets(),
        column_sources.reference_targets()
    );
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
            vec!["=A1".to_string()],
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
            vec!["=A1".to_string(), "=A2".to_string()],
            &[],
            &[],
        ),
        INVALID_SOURCE_STATUS
    );
}

#[test]
fn loaded_spans_match_per_row_loaded_probes() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(3, 8, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 0, &[1.0, 2.0, 3.0, 4.0], 0);
    store.set_column_numbers(sheet, 1, 2, &[1.0, 2.0, 3.0, 4.0], 0);
    store.commit_sources();
    // A local edit is loaded but dirty; both states belong in a run.
    store.set_number(sheet, 7, 0, 9.0, 0);

    assert_eq!(store.loaded_spans(sheet, 0, 8, 0), vec![0, 4, 7, 8]);
    assert_eq!(store.loaded_spans(sheet, 1, 6, 0), vec![1, 4]);
    assert_eq!(store.loaded_spans(sheet, 4, 8, 0), vec![7, 8]);
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
            texts.iter().map(|text| (*text).to_string()).collect(),
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
    fn value_lookup_matches_the_linear_scan_for_text_and_error_cells() {
        let (store, sheet) = mixed_column_store();
        let long = [
            PICKED_TRUE,
            PICKED_FALSE,
            "Alpha",
            "Beta",
            "Gamma",
            "#DIV/0!",
            "TRUE",
            "delta",
            "delta",
        ];
        let short = [
            PICKED_TRUE,
            PICKED_FALSE,
            "Alpha",
            "Beta",
            "Gamma",
            "#DIV/0!",
            "TRUE",
            "delta",
        ];
        let expected = vec![5, 6, 7, 8, 9, 11, 12];
        assert_eq!(filter_values(&store, sheet, &[], &long, false), expected);
        assert_eq!(filter_values(&store, sheet, &[], &short, false), expected);
    }

    #[test]
    fn boolean_picks_match_boolean_cells_only() {
        let (store, sheet) = mixed_column_store();
        let picks = [PICKED_TRUE, PICKED_FALSE, "a", "b", "c", "d", "e", "f", "g"];
        // The text cell in row 7 spells TRUE but is not a boolean.
        assert_eq!(filter_values(&store, sheet, &[], &picks, false), vec![8, 9]);
    }

    #[test]
    fn value_lookup_includes_blanks_only_when_asked() {
        let (store, sheet) = mixed_column_store();
        let picks = [
            "Alpha", "Beta", "Gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota",
        ];
        // Row 12 is the text formula resolving to "Alpha".
        assert_eq!(
            filter_values(&store, sheet, &[], &picks, false),
            vec![5, 6, 12]
        );
        assert_eq!(
            filter_values(&store, sheet, &[], &picks, true),
            vec![5, 6, 10, 12]
        );
    }
}

/// Multi-key sort coverage over hand-written fixtures: ties keep the row id,
/// keys can descend, candidate lists drop out-of-range rows, kinds order as
/// numbers, text, booleans, blanks, and `-0.0` compares equal to `0.0`.
mod multi_key_sort_fixtures {
    use super::*;

    fn text_number_fixture() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, 5);
        store.set_string(sheet, 0, 0, "b", 0);
        store.set_number(sheet, 0, 1, 2.0, 0);
        store.set_string(sheet, 1, 0, "a", 0);
        store.set_number(sheet, 1, 1, 5.0, 0);
        store.set_string(sheet, 2, 0, "b", 0);
        store.set_number(sheet, 2, 1, 1.0, 0);
        store.set_string(sheet, 3, 0, "a", 0);
        store.set_number(sheet, 3, 1, 5.0, 0);
        store.set_string(sheet, 4, 0, "c", 0);
        store.set_number(sheet, 4, 1, 3.0, 0);
        (store, sheet)
    }

    #[test]
    fn multi_key_sort_ties_keep_the_row_id() {
        let (store, sheet) = text_number_fixture();
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[1, 1], &[]),
            vec![1, 3, 2, 0, 4]
        );

        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[0, 1], &[]),
            vec![4, 2, 0, 1, 3]
        );

        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[0, 0], &[]),
            vec![4, 0, 2, 1, 3]
        );
    }

    #[test]
    fn multi_key_sort_filters_candidates_and_keeps_their_order() {
        let (store, sheet) = text_number_fixture();
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[1, 1], &[0, 2, 3, 99]),
            vec![3, 2, 0]
        );

        assert_eq!(
            store.sort_rows_multi(sheet, &[1], &[0], &[0, 2, 3]),
            vec![3, 0, 2]
        );
    }

    /// Column 0 mixes a number, text, a blank, booleans, an error formula and a
    /// numeric formula; column 1 is constant so equal keys fall to the row id.
    fn mixed_kind_fixture() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, 9);
        store.set_number(sheet, 0, 0, 2.0, 0);
        store.set_string(sheet, 1, 0, "a", 0);
        store.set_bool(sheet, 3, 0, true, 0);
        store.set_number(sheet, 4, 0, 1.0, 0);
        store.set_string(sheet, 5, 0, "b", 0);
        store.set_bool(sheet, 6, 0, false, 0);
        store.set_formula(sheet, 7, 0, "=1/0", 0);
        store.set_formula(sheet, 8, 0, "=2+1", 0);
        for row in 0..9 {
            store.set_string(sheet, row, 1, "const", 0);
        }
        store.recompute(sheet);
        (store, sheet)
    }

    #[test]
    fn multi_key_sort_orders_kinds_numbers_text_booleans_blanks() {
        let (store, sheet) = mixed_kind_fixture();
        // Ascending: numbers 1.0, 2.0, 3.0; then error text, "a", "b"; then
        // false, true; the blank sorts last. Descending reverses each group.
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[1, 1], &[]),
            vec![4, 0, 8, 7, 1, 5, 6, 3, 2]
        );
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[0, 1], &[]),
            vec![2, 3, 6, 5, 1, 7, 8, 0, 4]
        );
        // Candidates restrict the same order to the picked rows.
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[1, 1], &[1, 3, 8, 12]),
            vec![8, 1, 3]
        );
    }

    #[test]
    fn multi_key_sort_compares_negative_zero_as_equal_to_zero() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, 4);
        store.set_number(sheet, 0, 0, 0.0, 0);
        store.set_number(sheet, 1, 0, -0.0, 0);
        store.set_number(sheet, 2, 0, 1.0, 0);
        store.set_number(sheet, 3, 0, -0.0, 0);
        for row in 0..4 {
            store.set_string(sheet, row, 1, "k", 0);
        }
        // `-0.0 == 0.0`, so the three equal keys keep row-id order.
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[1, 1], &[]),
            vec![0, 1, 3, 2]
        );
    }
}

mod formula_dependency_epoch {
    use super::*;

    #[test]
    fn constant_only_formula_rewrite_keeps_the_dependency_index() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 4);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_number(sheet, 0, 1, 10.0, 0);
        store.set_formula(sheet, 0, 2, "=A1+B1+1", 0);
        store.set_formula(sheet, 1, 2, "=C1*2", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 12.0);
        assert_close(number(&store, sheet, 1, 2), 24.0);

        let epoch_before = store.graph.epoch();
        assert_eq!(
            store.set_sparse_block(
                sheet,
                0,
                2,
                1,
                1,
                &[0],
                &[KIND_EMPTY],
                &[0.0],
                vec![String::new()],
                &[0],
                &[0],
                vec!["=A1+B1+2".into()],
                &[],
                &[],
            ),
            0,
        );
        assert_eq!(
            store.graph.epoch(),
            epoch_before,
            "a constant-only rewrite must keep the cached dependency index"
        );
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 13.0);
        assert_close(number(&store, sheet, 1, 2), 26.0);

        // The cached index still routes read-cell edits to the rewritten cell
        // and onward to its dependents.
        store.set_number(sheet, 0, 0, 5.0, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 17.0);
        assert_close(number(&store, sheet, 1, 2), 34.0);
    }

    #[test]
    fn formula_rewrite_with_new_reads_patches_the_dependency_index() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 2);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_number(sheet, 0, 1, 2.0, 0);
        store.set_formula(sheet, 0, 2, "=A1", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 1.0);

        let epoch_before = store.graph.epoch();
        store.set_formula(sheet, 0, 2, "=B1", 0);
        assert_eq!(
            store.graph.epoch(),
            epoch_before,
            "a changed read set must patch the dependency index, not rebuild it"
        );
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 2.0);

        store.set_number(sheet, 0, 0, 9.0, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 2.0);
        store.set_number(sheet, 0, 1, 7.0, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 7.0);
    }

    #[test]
    fn formula_rewrite_across_scalar_and_array_shapes_keeps_spills_consistent() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 3);
        for row in 0..3 {
            store.set_number(sheet, row, 0, row as f64 + 1.0, 0);
        }
        store.set_formula(sheet, 0, 2, "=A1", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 1.0);
        assert_eq!(store.get_cell(sheet, 1, 2).kind(), KIND_EMPTY);

        // Scalar to array: the spill arrives.
        store.set_formula(sheet, 0, 2, "=A1:A3", 0);
        store.recompute(sheet);
        assert_eq!(
            [0, 1, 2].map(|row| number(&store, sheet, row, 2)),
            [1.0, 2.0, 3.0]
        );

        // Array to a different array with the same reads and shape: the index
        // survives the rewrite and the spill is re-materialized.
        let epoch_before = store.graph.epoch();
        store.set_formula(sheet, 0, 2, "=SORT(A1:A3)", 0);
        assert_eq!(store.graph.epoch(), epoch_before);
        store.recompute(sheet);
        assert_eq!(
            [0, 1, 2].map(|row| number(&store, sheet, row, 2)),
            [1.0, 2.0, 3.0]
        );

        // Array back to scalar: the spill is released.
        store.set_formula(sheet, 0, 2, "=A1+A2+A3", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 6.0);
        assert_eq!(store.get_cell(sheet, 1, 2).kind(), KIND_EMPTY);
        assert_eq!(store.get_cell(sheet, 2, 2).kind(), KIND_EMPTY);
    }

    #[test]
    fn batch_edits_refresh_spill_anchors_only_when_they_hit_the_range() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(6, 8);
        for row in 0..4 {
            store.set_number(sheet, row, 0, row as f64 + 1.0, 0);
        }
        store.set_formula(sheet, 0, 2, "=A1:A4", 0);
        store.set_formula(sheet, 0, 3, "=A1:A4", 0);
        store.set_formula(sheet, 6, 2, "=C3*10", 0);
        store.recompute(sheet);
        assert_eq!(
            [0, 1, 2, 3].map(|row| number(&store, sheet, row, 2)),
            [1.0, 2.0, 3.0, 4.0]
        );
        assert_eq!(
            [0, 1, 2, 3].map(|row| number(&store, sheet, row, 3)),
            [1.0, 2.0, 3.0, 4.0]
        );
        assert_close(number(&store, sheet, 6, 2), 30.0);

        // Dirty cells outside every spilled range leave the spills as they are.
        for row in 0..4 {
            store.set_number(sheet, row, 5, 100.0 + row as f64, 0);
        }
        store.recompute(sheet);
        assert_eq!(
            [0, 1, 2, 3].map(|row| number(&store, sheet, row, 2)),
            [1.0, 2.0, 3.0, 4.0]
        );

        // A read-cell edit inside both spilled source ranges refreshes every
        // dependent, including the formula that reads a spill cell whose value
        // changed.
        store.set_number(sheet, 2, 0, 30.0, 0);
        store.recompute(sheet);
        assert_eq!(
            [0, 1, 2, 3].map(|row| number(&store, sheet, row, 2)),
            [1.0, 2.0, 30.0, 4.0]
        );
        assert_eq!(
            [0, 1, 2, 3].map(|row| number(&store, sheet, row, 3)),
            [1.0, 2.0, 30.0, 4.0]
        );
        assert_close(number(&store, sheet, 6, 2), 300.0);
    }

    fn next_rand(state: &mut u64) -> u64 {
        *state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        *state >> 33
    }

    fn snapshot_cells(store: &CellStore, sheet: usize, rows: usize, cols: usize) -> Vec<(u8, f64)> {
        let mut cells = Vec::with_capacity(rows * cols);
        for row in 0..rows {
            for col in 0..cols {
                let cell = store.get_cell(sheet, row, col);
                cells.push((cell.kind(), cell.num()));
            }
        }
        cells
    }

    /// A randomized edit sequence must land on exactly the values a rebuild
    /// produces. A dependency index that survives an edit it should not, or a
    /// spill anchor the dirty scan misses, would leave stale cells behind and
    /// fail the comparison.
    #[test]
    fn random_edit_sequences_match_a_full_rebuild() {
        const ROWS: usize = 10;
        const COLS: usize = 5;
        const EDITS: usize = 60;
        let array_sources = ["=A1:A5", "=A1:A3", "=A1:A5+1", "=SUM(A1:A5)", "=SUM(A1:B5)"];
        let dependent_sources = ["=C3*2", "=C4*2", "=SUM(A1:B5)"];
        for seed in [1_u64, 7, 99] {
            let mut store = CellStore::new();
            let sheet = store.add_sheet(COLS, ROWS);
            let mut state = seed;
            for row in 0..ROWS {
                for col in 0..2 {
                    let value = (next_rand(&mut state) % 100) as f64;
                    store.set_number(sheet, row, col, value, 0);
                }
            }
            store.set_formula(sheet, 0, 2, array_sources[0], 0);
            store.set_formula(sheet, 0, 3, "=SUM(A1:A5)", 0);
            store.set_formula(sheet, 5, 4, dependent_sources[0], 0);
            store.recompute(sheet);
            for edit in 0..EDITS {
                match next_rand(&mut state) % 5 {
                    // Rewrite the spilled formula between shapes that read the
                    // same cells and shapes that do not.
                    0 => {
                        let source = array_sources[(next_rand(&mut state) % 5) as usize];
                        store.set_formula(sheet, 0, 2, source, 0);
                    }
                    // Edit a source cell of the spilled range.
                    1 => {
                        let row = (next_rand(&mut state) % ROWS as u64) as usize;
                        let col = (next_rand(&mut state) % 2) as usize;
                        let value = (next_rand(&mut state) % 1000) as f64;
                        store.set_number(sheet, row, col, value, 0);
                    }
                    // Overwrite a cell inside a spilled block.
                    2 => {
                        let row = (next_rand(&mut state) % 5) as usize;
                        let col = 2 + (next_rand(&mut state) % 2) as usize;
                        let value = (next_rand(&mut state) % 1000) as f64;
                        store.set_number(sheet, row, col, value, 0);
                    }
                    // Edit an unrelated cell.
                    3 => {
                        let row = (next_rand(&mut state) % ROWS as u64) as usize;
                        if row != 5 {
                            let value = (next_rand(&mut state) % 1000) as f64;
                            store.set_number(sheet, row, 4, value, 0);
                        }
                    }
                    // Rewrite a formula that reads a cell of the spilled block.
                    _ => {
                        let source = dependent_sources[(next_rand(&mut state) % 3) as usize];
                        store.set_formula(sheet, 5, 4, source, 0);
                    }
                }
                store.recompute(sheet);
                let incremental = snapshot_cells(&store, sheet, ROWS, COLS);
                // Drop every cache and dirty the whole sheet: the next pass
                // must produce the same values from scratch.
                store.graph.invalidate();
                store.sheets[sheet].formulas.mark_all_dirty();
                store.recompute(sheet);
                assert_eq!(
                    snapshot_cells(&store, sheet, ROWS, COLS),
                    incremental,
                    "seed={seed} edit={edit}"
                );
            }
        }
    }
}

/// Lookups that share a range reuse one decode; the reuse must not survive
/// the recalculation, so an edit to the table has to show up.
mod lookup_reuse {
    use super::{assert_close, number};
    use crate::CellStore;

    #[test]
    fn reused_lookups_notice_table_edits() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        for row in 0..6 {
            store.set_number(sheet, row, 0, row as f64 + 1.0, 0);
            store.set_number(sheet, row, 1, (row as f64 + 1.0) * 10.0, 0);
        }
        store.set_formula(sheet, 0, 2, "=VLOOKUP(4,A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 1, 2, "=VLOOKUP(4,A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 2, 2, "=MATCH(4,A1:A6,0)", 0);
        store.set_formula(sheet, 3, 2, "=XLOOKUP(4,A1:A6,B1:B6)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 40.0);
        assert_close(number(&store, sheet, 1, 2), 40.0);
        assert_close(number(&store, sheet, 2, 2), 4.0);
        assert_close(number(&store, sheet, 3, 2), 40.0);

        store.set_number(sheet, 3, 1, 400.0, 0);
        store.set_number(sheet, 0, 0, 9.0, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 400.0);
        assert_close(number(&store, sheet, 1, 2), 400.0);
        assert_close(number(&store, sheet, 2, 2), 4.0);
        assert_close(number(&store, sheet, 3, 2), 400.0);
    }

    /// A table that holds formulas changes during the pass, so it keeps the
    /// plain materialization path and still answers with the fresh values.
    #[test]
    fn lookup_tables_holding_formulas_stay_correct() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 8);
        for row in 0..6 {
            store.set_number(sheet, row, 0, row as f64 + 1.0, 0);
        }
        store.set_number(sheet, 7, 7, 4.0, 0);
        store.set_formula(sheet, 3, 1, "=H8*10", 0);
        store.set_formula(sheet, 0, 2, "=VLOOKUP(4,A1:B6,2,FALSE)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 40.0);

        store.set_number(sheet, 7, 7, 8.0, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 80.0);
    }
}

/// Lookup results through the public formula surface: duplicates, sorted-mode
/// validation, the blank/zero/empty/`FALSE` equivalences, case folding and
/// error precedence.
mod lookup_results {
    use super::{assert_close, number, string};
    use crate::CellStore;

    #[test]
    fn duplicates_and_sorted_modes_follow_the_lookup_rules() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        for (row, (key, result)) in [
            (1.0, 10.0),
            (2.0, 20.0),
            (2.0, 200.0),
            (3.0, 30.0),
            (4.0, 40.0),
        ]
        .iter()
        .enumerate()
        {
            store.set_number(sheet, row, 0, *key, 0);
            store.set_number(sheet, row, 1, *result, 0);
        }
        store.set_formula(sheet, 0, 2, "=VLOOKUP(2,A1:B5,2,FALSE)", 0);
        store.set_formula(sheet, 1, 2, "=VLOOKUP(2.5,A1:B5,2,TRUE)", 0);
        store.set_formula(sheet, 2, 2, "=VLOOKUP(0,A1:B5,2,TRUE)", 0);
        store.set_formula(sheet, 3, 2, "=MATCH(2,A1:A5,0)", 0);
        store.set_formula(sheet, 4, 2, "=XMATCH(2,A1:A5,0,-1)", 0);
        store.set_formula(sheet, 5, 2, "=XLOOKUP(2,A1:A5,B1:B5,,-1,-1)", 0);
        store.set_formula(sheet, 6, 2, "=XLOOKUP(9,A1:A5,B1:B5,,0)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 20.0);
        assert_close(number(&store, sheet, 1, 2), 20.0);
        assert_eq!(string(&store, sheet, 2, 2).as_deref(), Some("#N/A"));
        assert_close(number(&store, sheet, 3, 2), 2.0);
        assert_close(number(&store, sheet, 4, 2), 3.0);
        assert_close(number(&store, sheet, 5, 2), 200.0);
        assert_eq!(string(&store, sheet, 6, 2).as_deref(), Some("#N/A"));
    }

    #[test]
    fn sorted_lookup_modes_refuse_an_unsorted_key_column() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        for (row, key) in [3.0, 1.0, 2.0, 4.0].iter().enumerate() {
            store.set_number(sheet, row, 0, *key, 0);
            store.set_number(sheet, row, 1, *key * 10.0, 0);
        }
        store.set_formula(sheet, 0, 2, "=VLOOKUP(3,A1:B4,2,FALSE)", 0);
        store.set_formula(sheet, 1, 2, "=VLOOKUP(3,A1:B4,2,TRUE)", 0);
        store.set_formula(sheet, 2, 2, "=MATCH(3,A1:A4,1)", 0);
        store.set_formula(sheet, 3, 2, "=XLOOKUP(3,A1:A4,B1:B4,,0,2)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 30.0);
        assert_eq!(string(&store, sheet, 1, 2).as_deref(), Some("#N/A"));
        assert_eq!(string(&store, sheet, 2, 2).as_deref(), Some("#N/A"));
        assert_eq!(string(&store, sheet, 3, 2).as_deref(), Some("#N/A"));
    }

    #[test]
    fn keys_compare_like_the_engine_for_blank_zero_empty_and_case() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        store.set_number(sheet, 0, 0, 0.0, 0);
        store.set_string(sheet, 2, 0, "", 0);
        store.set_bool(sheet, 3, 0, false, 0);
        store.set_string(sheet, 4, 0, "café", 0);
        store.set_string(sheet, 5, 0, "Key", 0);
        for row in 0..6 {
            store.set_number(sheet, row, 1, (row + 1) as f64, 0);
        }
        store.set_formula(sheet, 0, 2, "=VLOOKUP(0,A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 1, 2, "=VLOOKUP(\"\",A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 2, 2, "=VLOOKUP(FALSE,A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 3, 2, "=VLOOKUP(\"CAFÉ\",A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 4, 2, "=VLOOKUP(\"key\",A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 5, 2, "=XMATCH(\"k*\",A1:A6,2)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 1.0);
        assert_close(number(&store, sheet, 1, 2), 2.0);
        assert_close(number(&store, sheet, 2, 2), 2.0);
        assert_close(number(&store, sheet, 3, 2), 5.0);
        assert_close(number(&store, sheet, 4, 2), 6.0);
        assert_close(number(&store, sheet, 5, 2), 6.0);
    }

    #[test]
    fn lookup_error_cells_keep_their_precedence() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_formula(sheet, 1, 0, "=1/0", 0);
        store.set_number(sheet, 2, 0, 3.0, 0);
        store.set_number(sheet, 0, 1, 10.0, 0);
        store.set_number(sheet, 1, 1, 20.0, 0);
        store.set_number(sheet, 2, 1, 30.0, 0);
        store.set_formula(sheet, 0, 2, "=VLOOKUP(1,A1:B3,2,FALSE)", 0);
        store.set_formula(sheet, 1, 2, "=VLOOKUP(3,A1:B3,2,FALSE)", 0);
        store.set_formula(sheet, 2, 2, "=VLOOKUP(99,A1:B3,2,FALSE)", 0);
        store.set_formula(sheet, 3, 2, "=VLOOKUP(1,A1:B3,9,FALSE)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 10.0);
        assert_eq!(string(&store, sheet, 1, 2).as_deref(), Some("#DIV/0!"));
        assert_eq!(string(&store, sheet, 2, 2).as_deref(), Some("#DIV/0!"));
        assert_eq!(string(&store, sheet, 3, 2).as_deref(), Some("#REF!"));
    }
}

/// Reductions and criteria functions over their ranges, through the public
/// formula surface: multi-range folds, matching rows and error precedence.
mod streamed_reductions {
    use super::{assert_close, number, string};
    use crate::CellStore;

    #[test]
    fn multi_range_reductions_fold_every_argument() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_number(sheet, 1, 0, 2.0, 0);
        store.set_string(sheet, 2, 0, "text", 0);
        store.set_bool(sheet, 3, 0, true, 0);
        store.set_number(sheet, 0, 1, 10.0, 0);
        store.set_number(sheet, 1, 1, 20.0, 0);
        store.set_number(sheet, 2, 1, 30.0, 0);
        store.set_number(sheet, 3, 1, 40.0, 0);
        store.set_formula(sheet, 0, 2, "=SUM(A1:A4,B1:B4)", 0);
        store.set_formula(sheet, 1, 2, "=AVERAGE(A1:A4)", 0);
        store.set_formula(sheet, 2, 2, "=COUNT(A1:A4,B1:B4)", 0);
        store.set_formula(sheet, 3, 2, "=COUNTA(A1:A4)", 0);
        store.set_formula(sheet, 4, 2, "=MIN(A1:A4,B1:B4)", 0);
        store.set_formula(sheet, 5, 2, "=MAX(A1:A4,B1:B4)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 103.0);
        assert_close(number(&store, sheet, 1, 2), 1.5);
        assert_close(number(&store, sheet, 2, 2), 6.0);
        assert_close(number(&store, sheet, 3, 2), 4.0);
        assert_close(number(&store, sheet, 4, 2), 1.0);
        assert_close(number(&store, sheet, 5, 2), 40.0);
    }

    #[test]
    fn streamed_reductions_keep_argument_error_order() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_formula(sheet, 1, 0, "=1/0", 0);
        store.set_number(sheet, 0, 1, 2.0, 0);
        store.set_formula(sheet, 1, 1, "=NA()", 0);
        store.set_number(sheet, 0, 2, 5.0, 0);
        store.set_formula(sheet, 0, 3, "=SUM(A1:A3,B1:B3)", 0);
        store.set_formula(sheet, 1, 3, "=SUM(B1:B3,A1:A3)", 0);
        store.set_formula(sheet, 2, 3, "=AVERAGE(A1:A3)", 0);
        store.set_formula(sheet, 3, 3, "=COUNT(C1:C3)", 0);
        store.set_formula(sheet, 4, 3, "=COUNTA(C1:C3)", 0);
        store.recompute(sheet);
        assert_eq!(string(&store, sheet, 0, 3).as_deref(), Some("#DIV/0!"));
        assert_eq!(string(&store, sheet, 1, 3).as_deref(), Some("#N/A"));
        assert_eq!(string(&store, sheet, 2, 3).as_deref(), Some("#DIV/0!"));
        assert_close(number(&store, sheet, 3, 3), 1.0);
        assert_close(number(&store, sheet, 4, 3), 1.0);
    }

    #[test]
    fn criteria_functions_walk_matching_rows() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 8);
        for row in 0..5 {
            store.set_string(sheet, row, 0, ["a", "b", "a", "b", "a"][row], 0);
            store.set_number(sheet, row, 1, (row + 1) as f64, 0);
            store.set_number(sheet, row, 2, ((row + 1) * 10) as f64, 0);
        }
        store.set_formula(sheet, 0, 3, "=COUNTIF(A1:A5,\"a\")", 0);
        store.set_formula(sheet, 1, 3, "=SUMIF(A1:A5,\"a\",B1:B5)", 0);
        store.set_formula(sheet, 2, 3, "=SUMIFS(B1:B5,A1:A5,\"b\",C1:C5,\">20\")", 0);
        store.set_formula(sheet, 3, 3, "=COUNTIFS(A1:A5,\"b\",B1:B5,\">1\")", 0);
        store.set_formula(sheet, 4, 3, "=AVERAGEIF(A1:A5,\"b\",B1:B5)", 0);
        store.set_formula(sheet, 5, 3, "=MAXIFS(B1:B5,A1:A5,\"a\")", 0);
        store.set_formula(sheet, 6, 3, "=MINIFS(B1:B5,A1:A5,\"a\")", 0);
        store.set_formula(sheet, 7, 3, "=SUMIF(A1:A5,\"z\",B1:B5)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 3), 3.0);
        assert_close(number(&store, sheet, 1, 3), 9.0);
        assert_close(number(&store, sheet, 2, 3), 4.0);
        assert_close(number(&store, sheet, 3, 3), 2.0);
        assert_close(number(&store, sheet, 4, 3), 3.0);
        assert_close(number(&store, sheet, 5, 3), 5.0);
        assert_close(number(&store, sheet, 6, 3), 1.0);
        assert_close(number(&store, sheet, 7, 3), 0.0);
    }

    #[test]
    fn criteria_wildcards_and_empty_matches_keep_their_results() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(6, 8);
        for row in 0..4 {
            store.set_string(sheet, row, 0, ["Key", "key", "Other", "Key"][row], 0);
            store.set_number(sheet, row, 1, (row + 1) as f64, 0);
        }
        store.set_formula(sheet, 0, 2, "=COUNTIF(A1:A4,\"k*\")", 0);
        store.set_formula(sheet, 1, 2, "=SUMIF(A1:A4,\"k?y\",B1:B4)", 0);
        store.set_formula(sheet, 2, 2, "=AVERAGEIF(A1:A4,\"z\",B1:B4)", 0);
        store.set_formula(sheet, 3, 2, "=MAXIFS(B1:B4,A1:A4,\"z\")", 0);
        store.set_formula(sheet, 4, 2, "=COUNTIFS(A1:A4,\"k*\",B1:B4,\">1\")", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 3.0);
        assert_close(number(&store, sheet, 1, 2), 1.0 + 2.0 + 4.0);
        assert_eq!(string(&store, sheet, 2, 2).as_deref(), Some("#DIV/0!"));
        assert_close(number(&store, sheet, 3, 2), 0.0);
        assert_close(number(&store, sheet, 4, 2), 2.0);
    }
}

/// LET bindings through the public formula surface: unused bindings stay
/// unevaluated, errors and shadowing behave as before, and range and array
/// bindings keep their value shape.
mod let_bindings {
    use super::{assert_close, number, string};
    use crate::CellStore;

    #[test]
    fn unused_bindings_are_not_evaluated_and_used_errors_propagate() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        store.set_formula(sheet, 0, 0, "=LET(x,1/0,5)", 0);
        store.set_formula(sheet, 1, 0, "=LET(x,1/0,x+1)", 0);
        store.set_formula(sheet, 2, 0, "=LET(x,2,y,1/0,x+y)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 0), 5.0);
        assert_eq!(string(&store, sheet, 1, 0).as_deref(), Some("#DIV/0!"));
        assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some("#DIV/0!"));
    }

    #[test]
    fn bindings_keep_shadowing_and_visibility_rules() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        store.set_formula(sheet, 0, 0, "=LET(x,1,x,2,x+10)", 0);
        store.set_formula(sheet, 1, 0, "=LET(x,1,y,x+1,x+y)", 0);
        store.set_formula(sheet, 2, 0, "=LET(x,2,LET(y,3,x*y))", 0);
        store.set_formula(sheet, 3, 0, "=LET(x,2,LET(x,3,x*2))", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 0), 12.0);
        assert_close(number(&store, sheet, 1, 0), 3.0);
        assert_close(number(&store, sheet, 2, 0), 6.0);
        assert_close(number(&store, sheet, 3, 0), 6.0);
    }

    #[test]
    fn range_and_array_bindings_keep_their_value_shape() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(6, 8);
        for row in 0..3 {
            store.set_number(sheet, row, 0, row as f64 + 1.0, 0);
        }
        store.set_formula(sheet, 0, 1, "=LET(x,A1:A3,SUM(x))", 0);
        store.set_formula(sheet, 1, 1, "=LET(x,A1:A3,SUM(x)+SUM(x))", 0);
        store.set_formula(sheet, 2, 1, "=LET(x,A1:A3,MATCH(2,x,0))", 0);
        store.set_formula(sheet, 3, 1, "=LET(x,SEQUENCE(3),SUM(x))", 0);
        store.set_formula(sheet, 0, 3, "=LET(x,SEQUENCE(3),x)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 1), 6.0);
        assert_close(number(&store, sheet, 1, 1), 12.0);
        assert_close(number(&store, sheet, 2, 1), 2.0);
        assert_close(number(&store, sheet, 3, 1), 6.0);
        assert_close(number(&store, sheet, 0, 3), 1.0);
        assert_close(number(&store, sheet, 1, 3), 2.0);
        assert_close(number(&store, sheet, 2, 3), 3.0);
    }
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

#[test]
fn spill_that_reads_a_later_spill_sees_its_current_values() {
    // B1 is evaluated before C1 in cell order, but must read C1's new spill.
    let mut store = CellStore::new();
    let sheet = store.add_sheet(6, 8);
    store.set_number(sheet, 0, 0, 3.0, 0);
    store.set_formula(sheet, 0, 2, "=SEQUENCE(A1)", 0);
    store.set_formula(sheet, 0, 1, "=C1:C5", 0);
    store.recompute(sheet);
    let column_b = |store: &CellStore| -> Vec<f64> {
        (0..5)
            .map(|row| store.get_cell(sheet, row, 1).num())
            .collect()
    };
    assert_eq!(column_b(&store), [1.0, 2.0, 3.0, 0.0, 0.0]);
    store.set_number(sheet, 0, 0, 4.0, 0);
    store.recompute(sheet);
    assert_eq!(column_b(&store), [1.0, 2.0, 3.0, 4.0, 0.0]);
}

#[test]
fn spills_that_read_each_other_end_as_a_cycle() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(6, 8);
    store.set_formula(sheet, 0, 0, "=C1:C2", 0);
    store.set_formula(sheet, 0, 2, "=A1:A2", 0);
    store.recompute(sheet);
    let shown = |col| store.get_cell(sheet, 0, col).string();
    assert_eq!(shown(0).as_deref(), Some("#CYCLE!"));
    assert_eq!(shown(2).as_deref(), Some("#CYCLE!"));
}

#[test]
fn spill_references_follow_the_current_spill_of_their_anchor() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(12, 12);
    store.set_number(sheet, 0, 9, 3.0, 0);
    store.set_formula(sheet, 0, 0, "=SEQUENCE(J1)", 0);
    store.set_formula(sheet, 0, 1, "=A1#", 0);
    store.set_formula(sheet, 0, 2, "=SUM(A1#)", 0);
    store.set_formula(sheet, 0, 3, "=ROWS(A1#)", 0);
    store.set_formula(sheet, 0, 4, "=INDEX(A1#,2)", 0);
    store.set_formula(sheet, 0, 5, "=COUNTIF(A1#,\">1\")", 0);
    store.set_formula(sheet, 0, 6, "=SUM(J1#)", 0);
    store.set_formula(sheet, 0, 7, "=J1#", 0);
    store.recompute(sheet);
    let column_b = |store: &CellStore| -> Vec<f64> {
        (0..6)
            .map(|row| store.get_cell(sheet, row, 1).num())
            .collect()
    };
    assert_eq!(column_b(&store), [1.0, 2.0, 3.0, 0.0, 0.0, 0.0]);
    let results = |store: &CellStore| -> Vec<f64> {
        (2..=5)
            .map(|col| store.get_cell(sheet, 0, col).num())
            .collect()
    };
    assert_eq!(results(&store), [6.0, 3.0, 2.0, 2.0]);
    // J1 holds a value, not a spill.
    assert_eq!(string(&store, sheet, 0, 6).as_deref(), Some("#REF!"));
    assert_eq!(string(&store, sheet, 0, 7).as_deref(), Some("#REF!"));

    store.set_number(sheet, 0, 9, 5.0, 0);
    store.recompute(sheet);
    assert_eq!(column_b(&store), [1.0, 2.0, 3.0, 4.0, 5.0, 0.0]);
    assert_eq!(results(&store), [15.0, 5.0, 2.0, 4.0]);
}

#[test]
fn spill_references_shift_with_their_anchor_and_break_when_it_is_deleted() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(6, 12);
    store.set_formula(sheet, 2, 0, "=SEQUENCE(2)", 0);
    store.set_formula(sheet, 0, 2, "=SUM(A3#)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 2), 3.0);

    store.remove_rows(sheet, 1, 1);
    store.recompute(sheet);
    assert_eq!(
        store.formula_source(sheet, 0, 2).as_deref(),
        Some("=SUM(A2#)")
    );
    assert_close(number(&store, sheet, 0, 2), 3.0);

    store.remove_rows(sheet, 1, 1);
    store.recompute(sheet);
    assert_eq!(
        store.formula_source(sheet, 0, 2).as_deref(),
        Some("=SUM(#REF!)")
    );
    assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("#REF!"));
}

#[test]
fn a_spill_that_reads_a_later_anchor_follows_its_resize() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(10, 10);
    store.set_number(sheet, 0, 9, 2.0, 0);
    store.set_formula(sheet, 0, 1, "=SORT(A3#,1,-1)", 0);
    store.set_formula(sheet, 2, 0, "=SEQUENCE(J1)", 0);
    store.recompute(sheet);
    let column_b = |store: &CellStore| -> Vec<f64> {
        (0..5)
            .map(|row| store.get_cell(sheet, row, 1).num())
            .collect()
    };
    assert_eq!(column_b(&store), [2.0, 1.0, 0.0, 0.0, 0.0]);

    store.set_number(sheet, 0, 9, 4.0, 0);
    store.recompute(sheet);
    assert_eq!(column_b(&store), [4.0, 3.0, 2.0, 1.0, 0.0]);
}

#[test]
fn a_spill_that_reads_a_later_one_cell_spill_sees_it() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(10, 10);
    store.set_number(sheet, 0, 9, 1.0, 0);
    store.set_formula(sheet, 0, 1, "=SORT(A3#,1,-1)", 0);
    store.set_formula(sheet, 2, 0, "=SEQUENCE(J1)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 1.0);

    // Growing from one cell to two and shrinking back both reach the reader.
    store.set_number(sheet, 0, 9, 2.0, 0);
    store.recompute(sheet);
    assert_eq!(
        (number(&store, sheet, 0, 1), number(&store, sheet, 1, 1)),
        (2.0, 1.0)
    );
    store.set_number(sheet, 0, 9, 1.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 1.0);
    assert_eq!(store.get_cell(sheet, 1, 1).kind(), KIND_EMPTY);
}

#[test]
fn a_spill_that_reads_a_later_one_cell_spill_sees_its_new_value() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(10, 10);
    store.set_number(sheet, 0, 9, 1.0, 0);
    store.set_formula(sheet, 0, 1, "=SORT(A3#)", 0);
    store.set_formula(sheet, 2, 0, "=SEQUENCE(1,1,J1)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 1.0);

    store.set_number(sheet, 0, 9, 2.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 2.0);
}

/// A workbook without formulas or pivot tables has nothing to calculate, so an
/// edit barrier ends without the formula pass. The pass is the largest
/// function of the engine: a WebAssembly runtime that sees it run on every
/// value edit compiles it while the host edits a data grid.
#[test]
fn a_value_edit_in_a_formula_free_workbook_skips_the_formula_pass() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 2);
    store.set_number(sheet, 0, 0, 1.0, 0);
    store.commit_sources();
    store.set_number(sheet, 0, 0, 2.0, 0);
    store.commit_sources();
    assert_eq!(store.formula_passes, 0);
    assert_close(number(&store, sheet, 0, 0), 2.0);

    // One formula makes the next value edit run the pass again.
    store.set_formula(sheet, 0, 1, "=A1*10", 0);
    store.commit_sources();
    let passes = store.formula_passes;
    store.set_number(sheet, 0, 0, 3.0, 0);
    store.commit_sources();
    assert_eq!(store.formula_passes, passes + 1);
    assert_close(number(&store, sheet, 0, 1), 30.0);
}

/// Volatile formulas (RAND, RANDBETWEEN, NOW, TODAY) recalculate with their
/// dependents at every edit barrier, as in Excel; every other formula
/// recalculates only when something it reads changed.
mod volatile_recalculation {
    use super::*;

    /// Formulas the recompute passes selected since the previous call.
    fn recomputed_since(store: &CellStore, mark: &mut usize) -> usize {
        let selected = store.recomputed_formulas - *mark;
        *mark = store.recomputed_formulas;
        selected
    }

    #[test]
    fn an_unrelated_edit_recalculates_only_volatile_formulas_and_their_dependents() {
        const INPUT_ROWS: usize = 100;
        let mut store = CellStore::new();
        let report = store.add_sheet(2, 2);
        let inputs = store.add_sheet(2, INPUT_ROWS);
        for row in 0..INPUT_ROWS {
            store.set_number(inputs, row, 0, row as f64, 0);
            store.set_formula(inputs, row, 1, &format!("=A{}+1", row + 1), 0);
        }
        store.commit_sources();
        let mut mark = store.recomputed_formulas;

        store.set_number(inputs, 0, 0, 10.0, 0);
        store.commit_sources();
        assert_eq!(recomputed_since(&store, &mut mark), 1);
        assert_close(number(&store, inputs, 0, 1), 11.0);

        store.set_formula(report, 0, 0, "=RAND()", 0);
        store.set_formula(report, 0, 1, "=A1*10", 0);
        store.set_formula(report, 1, 0, "=NOW()", 0);
        store.set_formula(report, 1, 1, "=A2+1", 0);
        store.commit_sources();
        recomputed_since(&store, &mut mark);
        let first_draw = number(&store, report, 0, 0);

        // An edit on another sheet adds the four volatile cells and their
        // dependents to its own dependent, and nothing else.
        store.set_number(inputs, 0, 0, 20.0, 0);
        store.commit_sources();
        assert_eq!(recomputed_since(&store, &mut mark), 1 + 4);
        let second_draw = number(&store, report, 0, 0);
        assert_ne!(first_draw, second_draw);
        assert_close(number(&store, report, 0, 1), second_draw * 10.0);
        assert_close(number(&store, inputs, 0, 1), 21.0);

        store.commit_sources();
        assert_eq!(recomputed_since(&store, &mut mark), 0);
        assert_eq!(number(&store, report, 0, 0), second_draw);

        store.set_number(report, 0, 0, 0.5, 0);
        store.set_formula(report, 1, 0, "=1", 0);
        store.commit_sources();
        // Removing the last volatile formula frees the sheet's volatile set.
        assert!(!store.sheets[report].formulas.has_volatile());
        recomputed_since(&store, &mut mark);
        store.set_number(inputs, 0, 0, 30.0, 0);
        store.commit_sources();
        assert_eq!(recomputed_since(&store, &mut mark), 1);
    }

    const FIRST_INSTANT: f64 = 46_000.25;
    const SECOND_INSTANT: f64 = 46_001.75;
    const HOST_INSTANT: f64 = 40_000.5;

    /// Clock reads by the fixed clocks below. The override is per thread,
    /// so parallel tests cannot disturb the count.
    static CLOCK_READS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

    fn first_clock() -> f64 {
        CLOCK_READS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        FIRST_INSTANT
    }

    fn second_clock() -> f64 {
        CLOCK_READS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        SECOND_INSTANT
    }

    fn clock_reads() -> usize {
        CLOCK_READS.swap(0, std::sync::atomic::Ordering::Relaxed)
    }

    #[test]
    fn now_and_today_read_the_clock_once_per_recalculation_pass() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(5, 1);
        crate::eval::set_test_clock(Some(first_clock));
        store.set_formula(sheet, 0, 0, "=NOW()", 0);
        store.set_formula(sheet, 0, 1, "=NOW()", 0);
        store.set_formula(sheet, 0, 2, "=TODAY()", 0);
        store.set_formula(sheet, 0, 3, "=A1-B1", 0);
        store.commit_sources();

        assert_eq!(clock_reads(), 1);
        assert_close(number(&store, sheet, 0, 0), FIRST_INSTANT);
        assert_close(number(&store, sheet, 0, 2), FIRST_INSTANT.floor());
        assert_close(number(&store, sheet, 0, 3), 0.0);

        crate::eval::set_test_clock(Some(second_clock));
        store.commit_sources();
        assert_eq!(clock_reads(), 0);
        assert_close(number(&store, sheet, 0, 0), FIRST_INSTANT);

        store.set_number(sheet, 0, 4, 1.0, 0);
        store.commit_sources();
        assert_eq!(clock_reads(), 1);
        assert_close(number(&store, sheet, 0, 1), SECOND_INSTANT);
        assert_close(number(&store, sheet, 0, 2), SECOND_INSTANT.floor());

        // The host barrier supplies the instant itself.
        store.recompute_volatile(HOST_INSTANT);
        assert_eq!(clock_reads(), 0);
        assert_close(number(&store, sheet, 0, 0), HOST_INSTANT);
        crate::eval::set_test_clock(None);
    }

    #[test]
    fn moved_volatile_formulas_keep_recalculating_at_their_new_cells() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 2);
        store.set_formula(sheet, 0, 0, "=RAND()", 0);
        store.commit_sources();

        store.insert_cols(sheet, 0, 1);
        store.commit_sources();
        let moved_draw = number(&store, sheet, 0, 1);
        store.set_number(sheet, 1, 3, 1.0, 0);
        store.commit_sources();

        assert_ne!(number(&store, sheet, 0, 1), moved_draw);
        assert_eq!(store.get_cell(sheet, 0, 0).kind(), KIND_EMPTY);
    }

    #[test]
    fn rand_and_randbetween_draw_inside_their_bounds_and_reject_invalid_ones() {
        const DRAWS: usize = 200;
        const EDIT_COL: usize = 12;
        let mut store = CellStore::new();
        let sheet = store.add_sheet(13, 1);
        let errors = [
            (3, "=RANDBETWEEN(-3.5,-3.2)", "#NUM!"),
            (4, "=RANDBETWEEN(5,1)", "#NUM!"),
            (5, "=RANDBETWEEN(\"a\",2)", "#VALUE!"),
            (6, "=RANDBETWEEN(1)", "#VALUE!"),
            (7, "=RAND(1)", "#VALUE!"),
            (8, "=RANDBETWEEN(1/0,2)", "#DIV/0!"),
            (9, "=RANDBETWEEN(1,NA())", "#N/A"),
            (10, "=RANDBETWEEN(A1:A1,2)", "#VALUE!"),
            (11, "=RANDBETWEEN(\"\",5)", "#VALUE!"),
        ];
        store.set_formula(sheet, 0, 0, "=RAND()", 0);
        store.set_formula(sheet, 0, 1, "=RANDBETWEEN(1,6)", 0);
        store.set_formula(sheet, 0, 2, "=RANDBETWEEN(2.2,3)", 0);
        for (col, formula, _) in errors {
            store.set_formula(sheet, 0, col, formula, 0);
        }

        let mut faces = [false; 6];
        for draw in 0..DRAWS {
            store.set_number(sheet, 0, EDIT_COL, draw as f64, 0);
            store.commit_sources();

            let unit = number(&store, sheet, 0, 0);
            assert!((0.0..1.0).contains(&unit), "RAND() = {unit}");
            let face = number(&store, sheet, 0, 1);
            assert!(face.fract() == 0.0 && (1.0..=6.0).contains(&face), "{face}");
            faces[face as usize - 1] = true;
            assert_close(number(&store, sheet, 0, 2), 3.0);
        }

        assert_eq!(faces, [true; 6]);
        for (col, formula, expected) in errors {
            assert_eq!(
                string(&store, sheet, 0, col).as_deref(),
                Some(expected),
                "{formula}"
            );
        }
    }

    #[test]
    fn a_volatile_spill_that_comes_back_unchanged_does_not_recalculate_its_readers() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(6, 2);
        store.set_number(sheet, 0, 0, 7.0, 0);
        store.set_number(sheet, 0, 1, 8.0, 0);
        // C1 spills A1:B1 into C1:D1; F1 reads the spilled D1.
        store.set_formula(sheet, 0, 2, "=OFFSET($A$1,0,0,1,2)", 0);
        store.set_formula(sheet, 0, 5, "=D1*2", 0);
        store.commit_sources();
        let mut mark = store.recomputed_formulas;

        // OFFSET is volatile, so an unrelated edit evaluates it again. Its
        // spill holds the same values, so F1 is not selected.
        store.set_number(sheet, 1, 4, 1.0, 0);
        store.commit_sources();
        assert_eq!(recomputed_since(&store, &mut mark), 1);
        assert_close(number(&store, sheet, 0, 5), 16.0);

        // A changed spilled value still reaches its reader.
        store.set_number(sheet, 0, 1, 9.0, 0);
        store.commit_sources();
        assert_close(number(&store, sheet, 0, 3), 9.0);
        assert_close(number(&store, sheet, 0, 5), 18.0);
    }
}

/// FORMULATEXT, ISFORMULA, HYPERLINK and CELL describe a referenced cell or
/// return a display value.
mod cell_information {
    use super::*;

    fn bool_at(store: &CellStore, sheet: usize, col: usize) -> bool {
        assert_eq!(store.get_cell(sheet, 0, col).kind(), KIND_BOOL, "col {col}");
        number(store, sheet, 0, col) != 0.0
    }

    #[test]
    fn information_functions_read_formula_sources_and_cell_facts() {
        let mut store = CellStore::new();
        let data = store.add_sheet(2, 4);
        store.set_sheet_name(data, "data", "Data");
        let main = store.add_sheet(32, 3);
        store.set_sheet_name(main, "main", "Main");
        store.set_number(data, 0, 0, 5.0, 0);
        store.set_formula(data, 1, 0, "=A1*2", 0);
        store.set_string(data, 2, 0, "label", 0);

        let texts = [
            (0, "=FORMULATEXT(Data!A2)", "=A1*2"),
            (1, "=FORMULATEXT(Data!A1)", "#N/A"),
            (2, "=FORMULATEXT(Data!A4)", "#N/A"),
            (3, "=FORMULATEXT(1)", "#VALUE!"),
            (4, "=FORMULATEXT(1/0)", "#DIV/0!"),
            (5, "=FORMULATEXT(Data!A2:A3)", "=A1*2"),
            // The reference is a dependency, so a self-reference is a cycle.
            (6, "=FORMULATEXT(G1)", "#CYCLE!"),
            (7, "=ISFORMULA(\"A1\")", "#VALUE!"),
            (
                8,
                "=HYPERLINK(\"https://example.com\")",
                "https://example.com",
            ),
            (9, "=HYPERLINK(\"https://example.com\",\"Docs\")", "Docs"),
            (10, "=HYPERLINK(1/0,\"Docs\")", "#DIV/0!"),
            (11, "=HYPERLINK()", "#VALUE!"),
            (12, "=CELL(\"address\",Data!B3)", "'Data'!$B$3"),
            (13, "=CELL(\"Address\",B3)", "$B$3"),
            (14, "=CELL(\"type\",Data!A3)", "l"),
            (15, "=CELL(\"type\",Data!A4)", "b"),
            (16, "=CELL(\"type\",Data!A1)", "v"),
            (17, "=CELL(\"format\",Data!A1)", "#VALUE!"),
            (18, "=CELL(1,A1)", "#VALUE!"),
            (19, "=CELL(\"bogus\",A1)", "#VALUE!"),
            (29, "=CELL(\" row\",A1)", "#VALUE!"),
        ];
        let numbers = [
            (20, "=HYPERLINK(\"https://example.com\",Data!A1)", 5.0),
            (21, "=CELL(\"row\",Data!B3)", 3.0),
            (22, "=CELL(\"col\",Data!B3)", 2.0),
            (23, "=CELL(\"contents\",Data!A2)", 10.0),
            (24, "=CELL(\"col\")", 25.0),
        ];
        let bools = [
            (25, "=ISFORMULA(Data!A2)", true),
            (26, "=ISFORMULA(Data!A1)", false),
            (27, "=ISFORMULA(Data!A4)", false),
            (28, "=ISFORMULA(Data!A2:A3)", true),
        ];
        for (col, formula, _) in texts {
            store.set_formula(main, 0, col, formula, 0);
        }
        for (col, formula, _) in numbers {
            store.set_formula(main, 0, col, formula, 0);
        }
        for (col, formula, _) in bools {
            store.set_formula(main, 0, col, formula, 0);
        }
        store.commit_sources();

        for (col, formula, expected) in texts {
            assert_eq!(
                string(&store, main, 0, col).as_deref(),
                Some(expected),
                "{formula}"
            );
        }
        for (col, _, expected) in numbers {
            assert_close(number(&store, main, 0, col), expected);
        }
        for (col, formula, expected) in bools {
            assert_eq!(bool_at(&store, main, col), expected, "{formula}");
        }
    }

    #[test]
    fn formula_checks_follow_a_referenced_cell_that_becomes_a_formula() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 1);
        store.set_number(sheet, 0, 0, 5.0, 0);
        store.set_formula(sheet, 0, 1, "=ISFORMULA(A1)", 0);
        store.set_formula(sheet, 0, 2, "=FORMULATEXT(A1)", 0);
        store.commit_sources();
        assert!(!bool_at(&store, sheet, 1));
        assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("#N/A"));

        store.set_formula(sheet, 0, 0, "=2+3", 0);
        store.commit_sources();

        assert!(bool_at(&store, sheet, 1));
        assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("=2+3"));
    }
}

#[test]
fn offset_indirect_values_preserve_reference_shapes_in_sums_and_spills() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(14, 12);
    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
        store.set_number(sheet, row, 1, value * 10.0, 0);
    }
    store.set_number(sheet, 0, 9, 2.0, 0);
    let scalar_cases = [
        ("=OFFSET(A1,1,1)", 20.0),
        ("=SUM(OFFSET(A1:B2,1,0))", 55.0),
        ("=SUM(OFFSET(A1,1,1,2,1))", 50.0),
        ("=SUM(INDIRECT(\"A1:B3\"))", 66.0),
        ("=SUM(OFFSET(INDIRECT(\"A1:B2\"),1,0))", 55.0),
        ("=SUM(INDIRECT(\"$A$1:$A$3\",TRUE))", 6.0),
        ("=SUM(OFFSET(OFFSET(A1,1,0),0,1))", 20.0),
        ("=SUM(LET(anchor,A1,OFFSET(anchor,1,1)))", 20.0),
        ("=LET(address,\"B2\",INDIRECT(address))", 20.0),
        ("=(OFFSET(A1,1,1)=20)+1", 2.0),
        ("=INDIRECT(\"B2\")+1", 21.0),
        ("=LET(v,INDIRECT(\"B2\"),v)", 20.0),
        ("=LET(x,1,OFFSET(A1,1,1)+x)", 21.0),
    ];
    for (col, (formula, _)) in scalar_cases.iter().enumerate() {
        store.set_formula(sheet, 8, col, formula, 0);
    }
    store.set_formula(sheet, 0, 3, "=OFFSET(A1,0,0,J1,2)", 0);
    store.set_formula(sheet, 0, 6, "=INDIRECT(\"A1:B3\")", 0);
    store.set_formula(sheet, 9, 0, "=SUM(D1#)", 0);
    store.recompute(sheet);
    for (col, (formula, expected)) in scalar_cases.iter().enumerate() {
        assert_eq!(number(&store, sheet, 8, col), *expected, "{formula}");
    }
    assert_eq!(
        [(0, 3), (0, 4), (1, 3), (1, 4)].map(|(row, col)| number(&store, sheet, row, col)),
        [1.0, 10.0, 2.0, 20.0]
    );
    assert_eq!(
        [(0, 6), (0, 7), (1, 6), (1, 7), (2, 6), (2, 7)]
            .map(|(row, col)| number(&store, sheet, row, col)),
        [1.0, 10.0, 2.0, 20.0, 3.0, 30.0]
    );
    assert_close(number(&store, sheet, 9, 0), 33.0);

    store.set_number(sheet, 0, 9, 3.0, 0);
    store.set_number(sheet, 2, 1, 40.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 2, 4), 40.0);
    assert_close(number(&store, sheet, 2, 7), 40.0);
    assert_close(number(&store, sheet, 9, 0), 76.0);
    store.set_number(sheet, 0, 9, 1.0, 0);
    store.recompute(sheet);
    assert_eq!(store.get_cell(sheet, 1, 3).kind(), KIND_EMPTY);
    assert_eq!(store.get_cell(sheet, 2, 4).kind(), KIND_EMPTY);
    assert_close(number(&store, sheet, 9, 0), 11.0);
}

#[test]
fn offset_indirect_a1_and_r1c1_resolve_absolute_relative_and_quoted_sheet_addresses() {
    let mut store = CellStore::new();
    let source = store.add_sheet(4, 4);
    let report = store.add_sheet(12, 8);
    store.set_sheet_name(source, "source", "O'Brien Data");
    store.set_number(source, 0, 0, 5.0, 0);
    store.set_number(source, 1, 0, 7.0, 0);
    store.set_number(source, 1, 1, 19.0, 0);
    store.set_number(report, 1, 0, 17.0, 0);
    let cases = [
        ("=INDIRECT(\"'O''Brien Data'!$B$2\")", 19.0),
        ("=INDIRECT(\"'O''Brien Data'!R2C2\",FALSE)", 19.0),
        ("=SUM(INDIRECT(\"'O''Brien Data'!R1C1:R2C1\",FALSE))", 12.0),
        ("=INDIRECT(\"R[-2]C[-3]\",FALSE)", 17.0),
        ("=INDIRECT(\"R2C[-4]\",FALSE)", 17.0),
        ("=INDIRECT(\"R[-2]C1\",FALSE)", 17.0),
        ("=OFFSET('O''Brien Data'!B2,-1,-1)", 5.0),
    ];
    for (col, (formula, _)) in cases.iter().enumerate() {
        store.set_formula(report, 3, col, formula, 0);
    }
    store.recompute(report);
    for (col, (formula, expected)) in cases.iter().enumerate() {
        assert_eq!(number(&store, report, 3, col), *expected, "{formula}");
    }
}

#[test]
fn offset_indirect_names_and_tables_resolve_in_the_calling_sheet_scope() {
    let mut store = CellStore::new();
    let source = store.add_sheet(4, 6);
    let report = store.add_sheet(8, 4);
    store.set_sheet_name(source, "source", "Source Sheet");
    for (row, value) in [10.0, 20.0, 30.0].into_iter().enumerate() {
        store.set_number(source, row + 1, 0, value, 0);
        store.set_number(source, row + 1, 1, value * 2.0, 0);
    }
    assert!(store.set_named_range("Values", -1, source, 1, 0, 3, 0));
    assert!(store.set_named_range("Values", report as i32, source, 1, 1, 3, 1));
    assert!(store.set_table(
        "sales-id",
        "Sales",
        source,
        0,
        0,
        3,
        1,
        true,
        false,
        vec!["amount-id".into(), "double-id".into()],
        vec!["Amount".into(), "Double".into()],
    ));
    store.set_formula(source, 0, 3, "=SUM(INDIRECT(\"Values\"))", 0);
    let cases = [
        ("=SUM(INDIRECT(\"Values\"))", 120.0),
        ("=SUM(OFFSET(Values,0,-1))", 60.0),
        ("=SUM(INDIRECT(\"Sales[Amount]\"))", 60.0),
        ("=SUM(OFFSET(Sales[Amount],0,1))", 120.0),
        ("=SUM(INDIRECT(\"Values\",FALSE))", 120.0),
        ("=SUM(INDIRECT(\"'Source Sheet'!Values\"))", 60.0),
    ];
    for (col, (formula, _)) in cases.iter().enumerate() {
        store.set_formula(report, 0, col, formula, 0);
    }
    store.recompute(report);
    store.recompute(source);
    assert_close(number(&store, source, 0, 3), 60.0);
    for (col, (formula, expected)) in cases.iter().enumerate() {
        assert_eq!(number(&store, report, 0, col), *expected, "{formula}");
    }
    store.set_number(source, 2, 0, 25.0, 0);
    store.set_number(source, 2, 1, 50.0, 0);
    store.recompute(report);
    assert_eq!(
        [0, 1, 2, 3, 4, 5].map(|col| number(&store, report, 0, col)),
        [130.0, 65.0, 65.0, 130.0, 130.0, 65.0]
    );
}

#[test]
fn offset_indirect_errors_reject_invalid_references_and_propagate_input_errors() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 24);
    let cases = [
        ("=OFFSET(A1,-1,0)", "#REF!"),
        ("=OFFSET(A1,0,-1)", "#REF!"),
        ("=OFFSET(A1,0,0,0,1)", "#VALUE!"),
        ("=OFFSET(A1,0,0,1,-1)", "#VALUE!"),
        ("=OFFSET(42,0,0)", "#VALUE!"),
        ("=OFFSET(A1,\"bad\",0)", "#VALUE!"),
        ("=OFFSET(A1,1/0,0)", "#DIV/0!"),
        ("=OFFSET(A1,1048576,0)", "#REF!"),
        ("=INDIRECT(\"not a reference\")", "#REF!"),
        ("=INDIRECT(\"Missing!A1\")", "#REF!"),
        ("=INDIRECT(\"A0\")", "#REF!"),
        ("=INDIRECT(\"XFE1\")", "#REF!"),
        ("=INDIRECT(\"R0C1\",FALSE)", "#REF!"),
        ("=INDIRECT(\"R[-99]C1\",FALSE)", "#REF!"),
        ("=INDIRECT(\"A1+1\")", "#REF!"),
        ("=INDIRECT(1/0)", "#DIV/0!"),
        ("=INDIRECT(\"A1\",1/0)", "#DIV/0!"),
        ("=INDIRECT(\"=A1\")", "#REF!"),
        ("=INDIRECT(\" A1\")", "#REF!"),
        ("=INDIRECT(\"((A1))\")", "#REF!"),
        ("=ROWS(OFFSET(A1,-1,0))", "#REF!"),
        ("=COLUMNS(INDIRECT(\"bad\"))", "#REF!"),
        ("=ROWS(OFFSET(A1,0,0,0,1))", "#VALUE!"),
        ("=ROW(OFFSET(A1,-1,0))", "#REF!"),
    ];
    for (row, (formula, _)) in cases.iter().enumerate() {
        store.set_formula(sheet, row, 3, formula, 0);
    }
    store.recompute(sheet);
    for (row, (formula, expected)) in cases.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, row, 3).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
}

#[test]
fn offset_indirect_dynamic_target_edits_refresh_values_and_downstream_dependents() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(8, 4);
    store.set_string(sheet, 0, 0, "B1", 0);
    store.set_number(sheet, 1, 0, 0.0, 0);
    store.set_number(sheet, 0, 1, 5.0, 0);
    store.set_number(sheet, 1, 1, 11.0, 0);
    store.set_number(sheet, 0, 2, 9.0, 0);
    store.set_formula(sheet, 0, 3, "=INDIRECT(A1)", 0);
    store.set_formula(sheet, 0, 4, "=OFFSET(B1,A2,0)", 0);
    store.set_formula(sheet, 0, 5, "=D1+E1", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 5), 10.0);
    store.set_number(sheet, 0, 1, 7.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 5), 14.0);

    store.set_string(sheet, 0, 0, "C1", 0);
    store.set_number(sheet, 1, 0, 1.0, 0);
    store.recompute(sheet);
    assert_eq!(
        [3, 4, 5].map(|col| number(&store, sheet, 0, col)),
        [9.0, 11.0, 20.0]
    );
    store.set_number(sheet, 0, 1, 100.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 5), 20.0);
    store.set_number(sheet, 0, 2, 13.0, 0);
    store.set_number(sheet, 1, 1, 17.0, 0);
    store.recompute(sheet);
    assert_eq!(
        [3, 4, 5].map(|col| number(&store, sheet, 0, col)),
        [13.0, 17.0, 30.0]
    );
}

#[test]
fn offset_indirect_structural_edits_rebase_references_but_not_address_text() {
    for edit_rows in [true, false] {
        let mut store = CellStore::new();
        let source = store.add_sheet(5, 5);
        let report = store.add_sheet(2, 2);
        store.set_sheet_name(source, "source", "Source");
        store.set_number(source, 1, 1, 10.0, 0);
        store.set_number(source, 2, 1, 30.0, 0);
        store.set_number(source, 1, 2, 20.0, 0);
        store.set_formula(report, 0, 0, "=OFFSET(Source!B2,0,0)", 0);
        store.set_formula(report, 0, 1, "=INDIRECT(\"Source!B2\")", 0);
        store.recompute(report);
        assert_close(number(&store, report, 0, 0), 10.0);
        assert_close(number(&store, report, 0, 1), 10.0);
        if edit_rows {
            store.add_rows(source, 1, 1);
        } else {
            store.insert_cols(source, 1, 1);
        }
        store.recompute(report);
        assert_close(number(&store, report, 0, 0), 10.0);
        assert_close(number(&store, report, 0, 1), 0.0);
        if edit_rows {
            store.remove_rows(source, 1, 1);
        } else {
            store.remove_cols(source, 1, 1);
        }
        store.recompute(report);
        assert_close(number(&store, report, 0, 0), 10.0);
        assert_close(number(&store, report, 0, 1), 10.0);
        if edit_rows {
            store.remove_rows(source, 1, 1);
        } else {
            store.remove_cols(source, 1, 1);
        }
        store.recompute(report);
        assert_eq!(string(&store, report, 0, 0).as_deref(), Some("#REF!"));
        assert_close(
            number(&store, report, 0, 1),
            if edit_rows { 30.0 } else { 20.0 },
        );
    }
}

#[test]
fn offset_indirect_runtime_self_cycles_fail_and_recover_when_the_target_changes() {
    for (formula, initial_target, recovered_target) in [
        ("=INDIRECT(C1)", "A1", "B1"),
        ("=SUM(INDIRECT(C1))", "A1:A2", "B1:B2"),
    ] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 4);
        store.set_number(sheet, 0, 1, 7.0, 0);
        store.set_string(sheet, 0, 2, initial_target, 0);
        store.set_formula(sheet, 0, 0, formula, 0);
        store.recompute(sheet);
        assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#CYCLE!"));
        store.set_string(sheet, 0, 2, recovered_target, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 0), 7.0);
    }
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 4);
    store.set_number(sheet, 0, 1, 7.0, 0);
    store.set_number(sheet, 0, 2, -1.0, 0);
    store.set_formula(sheet, 0, 0, "=OFFSET(B1,0,C1)", 0);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#CYCLE!"));
    store.set_number(sheet, 0, 2, 0.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 0), 7.0);
}

#[test]
fn offset_indirect_runtime_mutual_cycles_propagate_and_recover() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(5, 4);
    store.set_formula(sheet, 0, 0, "=INDIRECT(\"B1\")", 0);
    store.set_formula(sheet, 0, 1, "=OFFSET(C1,0,-2)", 0);
    store.set_formula(sheet, 0, 3, "=A1+1", 0);
    store.recompute(sheet);
    for col in [0, 1, 3] {
        assert_eq!(string(&store, sheet, 0, col).as_deref(), Some("#CYCLE!"));
    }
    store.set_number(sheet, 0, 1, 7.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 0), 7.0);
    assert_close(number(&store, sheet, 0, 3), 8.0);
}

#[test]
fn offset_indirect_spill_obstructions_preserve_sources_and_clear_on_retry() {
    for formula in ["=OFFSET(A1,0,0,2,1)", "=INDIRECT(\"A1:A2\")"] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 4);
        store.set_number(sheet, 0, 0, 5.0, 0);
        store.set_number(sheet, 1, 0, 9.0, 0);
        store.set_number(sheet, 1, 2, 99.0, 0);
        store.set_formula(sheet, 0, 2, formula, 0);
        store.recompute(sheet);
        assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("#SPILL!"));
        assert_close(number(&store, sheet, 1, 2), 99.0);
        assert_close(number(&store, sheet, 1, 0), 9.0);
        store.clear_cell(sheet, 1, 2, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 5.0);
        assert_close(number(&store, sheet, 1, 2), 9.0);
        assert_eq!(store.formula_source(sheet, 0, 2).as_deref(), Some(formula));
    }
}

#[test]
fn offset_indirect_runtime_cycles_across_sheets_recover_after_source_edits() {
    let mut store = CellStore::new();
    let first = store.add_sheet(3, 3);
    let second = store.add_sheet(3, 3);
    store.set_sheet_name(first, "first", "First");
    store.set_sheet_name(second, "second", "Second");
    store.set_formula(first, 0, 0, "=INDIRECT(\"Second!A1\")", 0);
    store.set_formula(second, 0, 0, "=OFFSET(First!B1,0,-1)", 0);
    store.recompute(first);
    store.recompute(second);
    assert_eq!(string(&store, first, 0, 0).as_deref(), Some("#CYCLE!"));
    assert_eq!(string(&store, second, 0, 0).as_deref(), Some("#CYCLE!"));
    store.set_number(second, 0, 0, 13.0, 0);
    store.recompute(first);
    assert_close(number(&store, first, 0, 0), 13.0);
}

/// Excel's default iterative calculation limits.
const EXCEL_MAX_ITERATIONS: u32 = 100;
const EXCEL_MAX_CHANGE: f64 = 0.001;

#[test]
fn iterative_calculation_converges_a_self_reference_and_off_restores_cycle_errors() {
    // A spill anywhere in the workbook sends the pass through the spill loop.
    for with_spill in [false, true] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 2);
        if with_spill {
            store.set_formula(sheet, 0, 2, "=SEQUENCE(2)", 0);
        }
        store.set_formula(sheet, 0, 0, "=A1/2+1", 0);
        store.recompute(sheet);
        assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#CYCLE!"));

        // x = x/2 + 1 settles at 2; sweeps stop at the first step of at most
        // the maximum change, which is also the remaining distance.
        assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, EXCEL_MAX_CHANGE));
        let settled = number(&store, sheet, 0, 0);
        assert!((settled - 2.0).abs() <= EXCEL_MAX_CHANGE, "got {settled}");

        assert!(store.set_iterative_calculation(false, EXCEL_MAX_ITERATIONS, EXCEL_MAX_CHANGE));
        assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#CYCLE!"));
    }
}

#[test]
fn iterative_calculation_matches_closed_forms_for_interest_and_newton_steps() {
    const PRINCIPAL: f64 = 1000.0;
    const RATE: f64 = 0.1;
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 2);
    store.set_number(sheet, 0, 0, PRINCIPAL, 0);
    store.set_number(sheet, 0, 1, RATE, 0);
    // Interest charged on a balance that includes it:
    // interest = rate * (principal + interest) = rate * principal / (1 - rate).
    store.set_formula(sheet, 0, 2, "=B1*D1", 0);
    store.set_formula(sheet, 0, 3, "=A1+C1", 0);
    // Newton's method for the square root of 2, stepping from its own value.
    store.set_formula(sheet, 1, 0, "=IF(A2=0,1,A2-(A2^2-2)/(2*A2))", 0);

    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, 1e-12));
    assert_close(number(&store, sheet, 0, 2), RATE * PRINCIPAL / (1.0 - RATE));
    assert_close(number(&store, sheet, 0, 3), PRINCIPAL / (1.0 - RATE));
    assert_close(number(&store, sheet, 1, 0), 2f64.sqrt());
}

#[test]
fn iterative_calculation_keeps_the_last_values_of_a_cycle_that_does_not_converge() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 1);
    store.set_number(sheet, 0, 1, 1.0, 0);
    store.set_formula(sheet, 0, 0, "=A1+B1", 0);

    // Excel's running total: every calculation runs all iterations from the
    // cell's own last value.
    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, EXCEL_MAX_CHANGE));
    assert_close(number(&store, sheet, 0, 0), 100.0);
    store.set_number(sheet, 0, 1, 2.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 0), 300.0);
}

#[test]
fn iterative_calculation_evaluates_formulas_behind_a_cycle_once_after_it_settles() {
    const SWEEPS: u32 = 10;
    for formula in ["=A1+1", "=INDIRECT(\"A1\")+1"] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 1);
        store.set_formula(sheet, 0, 0, formula, 0);
        store.set_formula(sheet, 0, 1, "=A1*2", 0);
        store.set_formula(sheet, 0, 2, "=B1+1", 0);

        crate::eval::FORMULA_EVALUATIONS.with(|count| count.set(0));
        assert!(store.set_iterative_calculation(true, SWEEPS, 0.0));
        let evaluations = crate::eval::FORMULA_EVALUATIONS.with(|count| count.get());

        assert_close(number(&store, sheet, 0, 0), 10.0);
        assert_close(number(&store, sheet, 0, 1), 20.0);
        assert_close(number(&store, sheet, 0, 2), 21.0);
        assert_eq!(evaluations, SWEEPS as usize + 2, "{formula}");
    }
}

#[test]
fn iterative_calculation_settles_cycles_through_runtime_references_and_volatile_calls() {
    // Each row settles at 2: two cells closed only by runtime references, a
    // static self-reference read again through OFFSET, and a volatile member.
    let rows: [(&str, &str); 3] = [
        ("=INDIRECT(\"B1\")/2+1", "=OFFSET(C1,0,-2)"),
        ("=OFFSET(A2,0,0)/2+1", "=A2"),
        ("=A3/2+1+NOW()*0", "=A3"),
    ];
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, rows.len());
    for (row, (first, second)) in rows.iter().enumerate() {
        store.set_formula(sheet, row, 0, first, 0);
        store.set_formula(sheet, row, 1, second, 0);
    }
    store.recompute(sheet);
    for row in 0..rows.len() {
        assert_eq!(string(&store, sheet, row, 0).as_deref(), Some("#CYCLE!"));
    }

    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, 1e-9));
    for row in 0..rows.len() {
        for col in [0, 1] {
            let settled = number(&store, sheet, row, col);
            assert!(
                (settled - 2.0).abs() < 1e-6,
                "row {row} column {col}: {settled}"
            );
        }
    }
}

#[test]
fn iterative_calculation_joins_runtime_readers_back_into_a_static_component() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 1);
    store.set_formula(sheet, 0, 0, "=A1/4+INDIRECT(\"B1\")/4+1", 0);
    store.set_formula(sheet, 0, 1, "=A1", 0);
    store.set_formula(sheet, 0, 2, "=B1*2", 0);

    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, 1e-12));
    assert_close(number(&store, sheet, 0, 0), 2.0);
    assert_close(number(&store, sheet, 0, 1), 2.0);
    assert_close(number(&store, sheet, 0, 2), 4.0);
}

#[test]
fn iterative_calculation_settles_inputs_before_installing_downstream_spills() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 2);
    store.set_formula(sheet, 0, 0, "=IF(A1<2,A1+1,A1)", 0);
    store.set_formula(sheet, 0, 1, "=SEQUENCE(A1)", 0);
    store.set_formula(sheet, 0, 2, "=SUM(B1:B2)", 0);

    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, EXCEL_MAX_CHANGE));
    assert_close(number(&store, sheet, 0, 0), 2.0);
    assert_close(number(&store, sheet, 0, 1), 1.0);
    assert_close(number(&store, sheet, 1, 1), 2.0);
    assert_close(number(&store, sheet, 0, 2), 3.0);
}

#[test]
fn iterative_calculation_sweeps_a_long_cycle_without_deep_recursion() {
    const MEMBERS: usize = 10_000;
    const MAX_CHANGE: f64 = 1e-6;
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, MEMBERS);
    store.set_formula(sheet, 0, 0, &format!("=A{MEMBERS}/2+1"), 0);
    for row in 1..MEMBERS {
        store.set_formula(sheet, row, 0, &format!("=A{row}"), 0);
    }

    assert!(store.set_iterative_calculation(true, EXCEL_MAX_ITERATIONS, MAX_CHANGE));
    for row in [0, MEMBERS - 1] {
        let settled = number(&store, sheet, row, 0);
        assert!((settled - 2.0).abs() <= MAX_CHANGE, "row {row}: {settled}");
    }
}

#[test]
fn iterative_calculation_rejects_limits_excel_does_not_accept() {
    let mut store = CellStore::new();
    for (iterations, change) in [
        (0, EXCEL_MAX_CHANGE),
        (32_768, EXCEL_MAX_CHANGE),
        (EXCEL_MAX_ITERATIONS, -0.5),
        (EXCEL_MAX_ITERATIONS, f64::NAN),
        (EXCEL_MAX_ITERATIONS, f64::INFINITY),
    ] {
        assert!(!store.set_iterative_calculation(true, iterations, change));
    }
    assert!(store.set_iterative_calculation(true, 32_767, 0.0));
}

#[test]
fn offset_indirect_scalar_contexts_and_reference_consumers_use_resolved_cells() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(8, 8);
    store.set_number(sheet, 0, 0, 5.0, 0);
    store.set_number(sheet, 0, 1, 0.0, 0);
    store.set_string(sheet, 0, 2, "A1", 0);
    let numeric_cases = [
        ("=IFERROR(INDIRECT(\"A1\"),0)", 5.0),
        ("=LET(v,INDIRECT(\"A1\"),IF(v>0,v,0))", 5.0),
        ("=INDIRECT(INDIRECT(\"C1\"))", 5.0),
        ("=OFFSET(A1,INDIRECT(\"B1\"),0)", 5.0),
        ("=ROWS(OFFSET(A1,0,0,3,2))", 3.0),
    ];
    for (row, (formula, _)) in numeric_cases.iter().enumerate() {
        store.set_formula(sheet, row + 1, 4, formula, 0);
    }
    store.set_formula(sheet, 1, 5, "=ISERROR(OFFSET(A1,0,0))", 0);
    store.set_formula(sheet, 2, 5, "=IF(INDIRECT(\"A1\")>0,\"y\",\"n\")", 0);
    store.recompute(sheet);
    for (row, (formula, expected)) in numeric_cases.iter().enumerate() {
        assert_eq!(number(&store, sheet, row + 1, 4), *expected, "{formula}");
    }
    assert_eq!(store.get_cell(sheet, 1, 5).kind(), KIND_BOOL);
    assert_close(number(&store, sheet, 1, 5), 0.0);
    assert_eq!(string(&store, sheet, 2, 5).as_deref(), Some("y"));

    #[cfg(feature = "analysis")]
    {
        let lambda_cases = [
            ("=LAMBDA(r,OFFSET(A1,r,0))(0)", 5.0),
            ("=LAMBDA(address,INDIRECT(address))(\"A1\")", 5.0),
            ("=SUM(MAP({0;0},LAMBDA(r,OFFSET(A1,r,0))))", 10.0),
        ];
        for (row, (formula, _)) in lambda_cases.iter().enumerate() {
            store.set_formula(sheet, row + 1, 6, formula, 0);
        }

        // Array helpers over a runtime reference spill its evaluated shape:
        // A1:A2 is {5;0} and A1:B2 is {5,0;0,0}.
        let spill_cases = [
            ("=MAP(OFFSET(A1,0,0,2),LAMBDA(x,x*2))", [10.0, 0.0]),
            ("=BYROW(OFFSET(A1,0,0,2,2),LAMBDA(r,SUM(r)))", [5.0, 0.0]),
        ];
        for (index, (formula, _)) in spill_cases.iter().enumerate() {
            store.set_formula(sheet, 1 + index * 2, 7, formula, 0);
        }

        store.recompute(sheet);
        for (row, (formula, expected)) in lambda_cases.iter().enumerate() {
            assert_eq!(number(&store, sheet, row + 1, 6), *expected, "{formula}");
        }
        for (index, (formula, expected)) in spill_cases.iter().enumerate() {
            let anchor = 1 + index * 2;
            assert_eq!(number(&store, sheet, anchor, 7), expected[0], "{formula}");
            assert_eq!(
                number(&store, sheet, anchor + 1, 7),
                expected[1],
                "{formula}"
            );
        }
    }
}

#[test]
fn offset_indirect_let_scopes_and_runtime_spill_readers_follow_current_values() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(24, 20);
    store.set_number(sheet, 0, 0, 5.0, 0);
    store.set_formula(sheet, 1, 0, "=LET(x,RAND(),SUM(OFFSET(A1,0,0))+x-x)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 1, 0), 5.0);

    store.set_number(sheet, 0, 0, 10.0, 0);
    store.set_formula(sheet, 0, 2, "=LET(n,5,n+SUM(OFFSET(A1,0,0)))", 0);
    store.set_formula(sheet, 0, 23, "=LET(a,1,b,C1,SEQUENCE(a+b))", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 1, 0), 10.0);
    assert_close(number(&store, sheet, 0, 2), 15.0);
    assert_close(number(&store, sheet, 15, 23), 16.0);
    assert_eq!(store.get_cell(sheet, 16, 23).kind(), KIND_EMPTY);

    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 4);
    store.set_formula(sheet, 0, 0, "=INDIRECT(\"C1:C3\")", 0);
    store.set_formula(sheet, 0, 2, "=SEQUENCE(3)", 0);
    store.recompute(sheet);
    assert_eq!(
        [0, 1, 2].map(|row| number(&store, sheet, row, 0)),
        [1.0, 2.0, 3.0]
    );
    store.set_formula(sheet, 0, 2, "=SEQUENCE(3,1,10)", 0);
    store.recompute(sheet);
    assert_eq!(
        [0, 1, 2].map(|row| number(&store, sheet, row, 0)),
        [10.0, 11.0, 12.0]
    );
}

#[test]
fn offset_indirect_one_cell_results_are_values_outside_the_spill_owner_budget() {
    const OWNER_LIMIT: usize = 2;
    const FORMULAS: usize = 6;

    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, FORMULAS);
    store.set_spill_owner_limit_for_test(OWNER_LIMIT);
    store.set_number(sheet, 0, 0, 7.0, 0);
    store.set_number(sheet, 1, 0, 3.0, 0);
    for row in 0..FORMULAS {
        let formula = if row % 2 == 0 {
            "=OFFSET($A$1,0,0)"
        } else {
            "=INDIRECT(\"A1\")"
        };
        store.set_formula(sheet, row, 1, formula, 0);
    }
    // A real two-cell spill still fits the owner budget beside them.
    store.set_formula(sheet, 0, 2, "=OFFSET($A$1,0,0,2,1)", 0);
    store.recompute(sheet);

    for row in 0..FORMULAS {
        assert_eq!(number(&store, sheet, row, 1), 7.0, "row {row}");
    }
    assert_eq!(number(&store, sheet, 0, 2), 7.0);
    assert_eq!(number(&store, sheet, 1, 2), 3.0);
}

#[cfg(feature = "analysis")]
#[test]
fn offset_indirect_merged_reads_do_not_report_a_false_cycle() {
    // More reads than one anchor keeps apart, so they merge into A2:C301,
    // which covers column B without reading it.
    const READS: usize = 300;

    let mut store = CellStore::new();
    let sheet = store.add_sheet(5, READS + 2);
    store.set_formula(
        sheet,
        0,
        4,
        "=MAP(SEQUENCE(300),LAMBDA(i,OFFSET($A$1,i,MOD(i,2)*2)+RAND()))",
        0,
    );
    // Spills into column B and reads the MAP, whose values change on every
    // evaluation: only the merged range makes the MAP look like its reader.
    store.set_formula(sheet, 1, 1, "=E1#*1", 0);
    store.recompute(sheet);

    for row in [0, READS / 2, READS - 1] {
        for (reader_row, col) in [(row, 4), (row + 1, 1)] {
            assert_eq!(string(&store, sheet, reader_row, col), None);
        }
        let map_value = number(&store, sheet, row, 4);
        assert!((0.0..1.0).contains(&map_value), "E{}: {map_value}", row + 1);
        assert_eq!(number(&store, sheet, row + 1, 1), map_value, "B{}", row + 2);
    }
}

#[test]
fn offset_indirect_stale_reader_check_grows_with_readers_not_their_product() {
    // Volatile two-cell spills on two sheets. Each reads the row between
    // two spills: inside the area of all changed spills, but meeting none.
    const SPILLS: usize = 2_000;
    const ROWS: usize = SPILLS * 2;
    // Work per read is a few index nodes per tree level.
    const STEPS_PER_READ_LEVEL: usize = 4;

    let mut store = CellStore::new();
    let sheets = [store.add_sheet(6, ROWS), store.add_sheet(6, ROWS)];
    for sheet in sheets {
        for index in 0..SPILLS {
            store.set_formula(sheet, index * 2, 0, "=OFFSET(B2,0,0,1,2)+RAND()", 0);
        }
    }
    // D1 reads the last spill of the first sheet, which is installed after
    // it. Only its runtime read links them, so the check must find that one
    // change among all of them.
    let last = ROWS - 2;
    store.set_formula(
        sheets[0],
        0,
        3,
        &format!("=INDIRECT(\"B{0}:C{0}\")", last + 1),
        0,
    );
    store.commit_sources();

    let before = store.stale_reader_visits;
    store.set_number(sheets[0], 1, 5, 1.0, 0);
    store.commit_sources();
    let steps = store.stale_reader_visits - before;

    let changes = SPILLS * sheets.len();
    let levels = changes.next_power_of_two().trailing_zeros() as usize + 1;
    let bound = STEPS_PER_READ_LEVEL * (changes + 1) * levels;
    assert!(steps <= bound, "{steps} steps, bound {bound}");
    assert_eq!(
        number(&store, sheets[0], 0, 3),
        number(&store, sheets[0], last, 1)
    );
}

#[test]
fn offset_indirect_sheet_rename_and_removal_refresh_text_addresses() {
    let mut store = CellStore::new();
    let data = store.add_sheet(1, 1);
    let report = store.add_sheet(2, 1);
    store.set_sheet_name(data, "data", "Data");
    store.set_sheet_name(report, "report", "Report");
    store.set_number(data, 0, 0, 7.0, 0);
    store.set_formula(report, 0, 0, "=INDIRECT(\"Data!A1\")", 0);
    store.set_formula(report, 0, 1, "=INDIRECT(\"New!A1\")", 0);
    store.recompute(report);
    assert_close(number(&store, report, 0, 0), 7.0);
    assert_eq!(string(&store, report, 0, 1).as_deref(), Some("#REF!"));

    assert!(store.rename_sheet(data, "data", "New"));
    assert_eq!(string(&store, report, 0, 0).as_deref(), Some("#REF!"));
    assert_close(number(&store, report, 0, 1), 7.0);

    assert!(store.remove_sheet(data));
    assert_eq!(string(&store, report, 0, 1).as_deref(), Some("#REF!"));
}

#[test]
fn offset_indirect_spills_with_evaluated_shapes_share_the_spill_budget_by_size() {
    // Shapes known only after evaluation must not charge the whole spill
    // budget each, or a few rows of them would turn into #NUM!.
    let patterns = [
        "=LET(h,2,OFFSET($A$1,0,0,h,1))",
        "=LET(a,ADDRESS(1,1)&\":\"&ADDRESS(2,1),INDIRECT(a))",
        "=LET(n,COUNTA($A$1:$A$2),OFFSET($A$1,0,0,n,1))",
        "=LET(r,OFFSET($A$1,0,0,2,1),r*1)",
    ];
    for pattern in patterns {
        for rows in [2, 3] {
            let mut store = CellStore::new();
            let sheet = store.add_sheet(rows + 1, rows * 3 + 1);
            store.set_number(sheet, 0, 0, 4.0, 0);
            store.set_number(sheet, 1, 0, 6.0, 0);
            let anchors: Vec<usize> = (0..rows).map(|index| 2 + index * 3).collect();
            for (col, &row) in anchors.iter().enumerate() {
                store.set_formula(sheet, row, col + 1, pattern, 0);
            }
            store.recompute(sheet);
            for (col, &row) in anchors.iter().enumerate() {
                assert_eq!(
                    [row, row + 1].map(|row| number(&store, sheet, row, col + 1)),
                    [4.0, 6.0],
                    "{pattern} with {rows} anchors"
                );
            }
        }
    }
}

/// The reference operators: intersection (space), union (comma inside
/// parentheses) and 3-D references across a span of sheet tabs.
mod reference_operators {
    use super::*;

    fn recomputed_since(store: &CellStore, mark: &mut usize) -> usize {
        let selected = store.recomputed_formulas - *mark;
        *mark = store.recomputed_formulas;
        selected
    }

    /// A1:E4 hold `10 * row + column`, both counted from 1: B2 is 22.
    fn grid_sheet(store: &mut CellStore, formula_rows: usize) -> usize {
        let sheet = store.add_sheet(7, 4.max(formula_rows));
        for row in 0..4 {
            for col in 0..5 {
                store.set_number(sheet, row, col, ((row + 1) * 10 + col + 1) as f64, 0);
            }
        }
        sheet
    }

    fn assert_results(store: &CellStore, sheet: usize, col: usize, cases: &[(&str, &str)]) {
        for (row, (formula, expected)) in cases.iter().enumerate() {
            let actual = match string(store, sheet, row, col) {
                Some(text) => text,
                None => number(store, sheet, row, col).to_string(),
            };
            assert_eq!(&actual, expected, "{formula}");
        }
    }

    fn set_formulas(store: &mut CellStore, sheet: usize, col: usize, cases: &[(&str, &str)]) {
        for (row, (formula, _)) in cases.iter().enumerate() {
            store.set_formula(sheet, row, col, formula, 0);
        }
        store.recompute(sheet);
    }

    #[test]
    fn a_space_between_references_intersects_them_and_other_spaces_stay_insignificant() {
        let cases = [
            ("=SUM(A1:C3 B2:D4)", "110"),
            ("=A1:C3 C3:D4", "33"),
            ("=SUM(A1:C3 B1:D4 C2:C9)", "56"),
            ("=ROWS(A1:C3 B2:D4)", "2"),
            ("=SUM(A1:A2 C1:C2)", "#NULL!"),
            ("=A1:B2 C3:D4", "#NULL!"),
            ("=SUM(A1:C3 \"x\")", "#VALUE!"),
            ("=SUM( A1:A2 , B1 )", "44"),
            ("= A1 + B1 ", "23"),
            ("=IF( A1 > 5 , \"big\" , \"small\" )", "big"),
            ("=SUM (A1:A2)", "32"),
        ];
        let mut store = CellStore::new();
        let sheet = grid_sheet(&mut store, cases.len());
        set_formulas(&mut store, sheet, 6, &cases);
        assert_results(&store, sheet, 6, &cases);
        assert_eq!(
            store.formula_source(sheet, 0, 6).as_deref(),
            Some("=SUM(A1:C3 B2:D4)")
        );
    }

    #[test]
    fn an_intersection_reads_only_the_shared_cells() {
        let mut store = CellStore::new();
        let sheet = grid_sheet(&mut store, 4);
        store.set_formula(sheet, 0, 6, "=SUM(A1:C3 B2:D4)", 0);
        store.commit_sources();
        let mut mark = store.recomputed_formulas;

        // A1 is inside A1:C3 but outside the intersection B2:C3.
        store.set_number(sheet, 0, 0, 1000.0, 0);
        store.commit_sources();
        assert_eq!(recomputed_since(&store, &mut mark), 0);

        store.set_number(sheet, 1, 1, 1022.0, 0);
        store.commit_sources();
        assert_eq!(recomputed_since(&store, &mut mark), 1);
        assert_close(number(&store, sheet, 0, 6), 1110.0);
    }

    #[test]
    fn an_intersection_with_a_deleted_operand_parses_back_as_ref_error() {
        let mut store = CellStore::new();
        let data = store.add_sheet(4, 4);
        store.set_sheet_name(data, "Data", "Data");
        let main = grid_sheet(&mut store, 4);
        store.set_sheet_name(main, "Main", "Main");
        store.set_formula(main, 0, 6, "=SUM(Data!A1:C3 B2:D4)", 0);
        store.recompute(main);

        assert!(store.remove_sheet(data));
        let source = store.formula_source(main, 0, 6).unwrap_or_default();
        assert_eq!(source, "=SUM(#REF! B2:D4)");

        // A reload parses the stored text again.
        store.set_formula(main, 0, 6, &source, 0);
        store.recompute(main);
        assert_eq!(string(&store, main, 0, 6).as_deref(), Some("#REF!"));
    }

    #[test]
    fn a_comma_inside_parentheses_unites_references_for_the_functions_that_take_them() {
        let cases = [
            ("=SUM((A1:A2,C1:C2))", "68"),
            ("=SUM(A1:A2,C1:C2)", "68"),
            ("=COUNT((A1,B2,C3))", "3"),
            ("=INDEX((A1:B2,D1:E2),1,1,2)", "14"),
            ("=INDEX((A1:B2,D1:E2),2,2)", "22"),
            ("=INDEX((A1:B2,D1:E2),1,1,3)", "#REF!"),
            ("=INDEX(A1:B2,1,1,2)", "#REF!"),
            ("=AREAS((A1:B2,D1:E2,E4))", "3"),
            ("=AREAS(A1:C3 B2:D4)", "1"),
            ("=AREAS(A1:G20)", "1"),
            ("=SMALL((A1:A2,C1:C2),2)", "13"),
            ("=LARGE((A1:A2,C1:C2),1)", "23"),
            ("=(A1,B1)", "#VALUE!"),
            ("=VLOOKUP(11,(A1:B2,D1:E2),2)", "#VALUE!"),
            ("=ROWS((A1:A2,C1:C2))", "#VALUE!"),
            ("=SUM((A1,1))", "#VALUE!"),
            ("=SUMPRODUCT((A1:A2,C1:C2))", "#VALUE!"),
            ("=CORREL((A1:A2,C1:C2),A1:B2)", "#VALUE!"),
        ];
        let mut store = CellStore::new();
        let sheet = grid_sheet(&mut store, cases.len());
        set_formulas(&mut store, sheet, 6, &cases);
        assert_results(&store, sheet, 6, &cases);

        store.set_number(sheet, 1, 2, 100.0, 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 6), 145.0);
        assert_eq!(
            store.formula_source(sheet, 0, 6).as_deref(),
            Some("=SUM((A1:A2,C1:C2))")
        );
    }

    /// Sheets First, Middle and Last hold 1, 10 and 100 in A1; Summary is
    /// the fourth tab.
    fn span_workbook() -> (CellStore, [usize; 4]) {
        let mut store = CellStore::new();
        let mut sheets = [0; 4];
        for (index, (name, value)) in [("First", 1.0), ("Middle", 10.0), ("Last", 100.0)]
            .into_iter()
            .enumerate()
        {
            sheets[index] = store.add_sheet(2, 2);
            store.set_sheet_name(sheets[index], name, name);
            store.set_number(sheets[index], 0, 0, value, 0);
        }
        sheets[3] = store.add_sheet(3, 3);
        store.set_sheet_name(sheets[3], "Summary", "Summary");
        (store, sheets)
    }

    fn order(handles: &[usize]) -> Vec<u32> {
        handles.iter().map(|&handle| handle as u32).collect()
    }

    #[test]
    fn a_three_d_reference_aggregates_the_same_cells_on_every_sheet_of_the_span() {
        let (mut store, [_, middle, last, summary]) = span_workbook();
        let cases = [
            ("=SUM(First:Last!A1)", "111"),
            ("=COUNT(First:Last!A1:B2)", "3"),
            ("=MAX('First:Last'!A1)", "100"),
            ("=AVERAGE(Last:First!A1)", "37"),
            ("=VLOOKUP(1,First:Last!A1:B2,1)", "#VALUE!"),
            ("=First:Last!A1", "#VALUE!"),
            ("=SUM(First:Missing!A1)", "#REF!"),
        ];
        for (row, (formula, _)) in cases.iter().enumerate() {
            store.set_formula(summary, row % 3, row / 3, formula, 0);
        }
        store.recompute(summary);
        for (row, (formula, expected)) in cases.iter().enumerate() {
            let (row, col) = (row % 3, row / 3);
            let actual = string(&store, summary, row, col)
                .unwrap_or_else(|| number(&store, summary, row, col).to_string());
            assert_eq!(&actual, expected, "{formula}");
        }

        store.set_number(middle, 0, 0, 20.0, 0);
        store.recompute(middle);
        assert_close(number(&store, summary, 0, 0), 121.0);

        assert!(store.rename_sheet(last, "Last", "Last Tab"));
        assert_eq!(
            store.formula_source(summary, 0, 0).as_deref(),
            Some("=SUM('First:Last Tab'!A1)")
        );
        assert_close(number(&store, summary, 0, 0), 121.0);
    }

    #[test]
    fn inserting_moving_and_removing_tabs_inside_a_span_patches_its_dependencies() {
        let (mut store, [first, middle, last, summary]) = span_workbook();
        store.set_formula(summary, 0, 0, "=SUM(First:Last!A1)", 0);
        store.commit_sources();
        assert_close(number(&store, summary, 0, 0), 111.0);

        let inserted = store.add_sheet(2, 2);
        store.set_sheet_name(inserted, "Inserted", "Inserted");
        store.set_number(inserted, 0, 0, 1000.0, 0);
        store.commit_sources();
        assert_close(number(&store, summary, 0, 0), 111.0);

        let epoch = store.graph.epoch();
        assert!(store.set_sheet_order(&order(&[first, inserted, middle, last, summary])));
        assert_eq!(store.graph.epoch(), epoch, "a tab move patches the index");
        assert_close(number(&store, summary, 0, 0), 1111.0);

        // The new reads are in the index: an edit on the inserted tab reaches
        // the formula without any rebuild.
        store.set_number(inserted, 0, 0, 2000.0, 0);
        store.commit_sources();
        assert_close(number(&store, summary, 0, 0), 2111.0);

        assert!(store.set_sheet_order(&order(&[first, inserted, last, summary, middle])));
        assert_close(number(&store, summary, 0, 0), 2101.0);
        store.set_number(middle, 0, 0, 5000.0, 0);
        store.commit_sources();
        assert_close(number(&store, summary, 0, 0), 2101.0);

        assert!(store.remove_sheet(inserted));
        assert_close(number(&store, summary, 0, 0), 101.0);
        assert_eq!(
            store.formula_source(summary, 0, 0).as_deref(),
            Some("=SUM(First:Last!A1)")
        );

        assert!(!store.set_sheet_order(&order(&[first, last, summary])));
        assert!(!store.set_sheet_order(&order(&[first, last, summary, middle, middle])));
        assert!(!store.set_sheet_order(&order(&[first, last, summary, inserted])));
    }

    #[test]
    fn moving_or_removing_an_endpoint_moves_the_span_edge_as_excel_does() {
        let (mut store, [first, middle, last, summary]) = span_workbook();
        store.set_formula(summary, 0, 0, "=SUM(First:Last!A1)", 0);
        store.set_formula(summary, 1, 0, "=SUM(First:Middle!A1)", 0);
        store.commit_sources();
        // Summary moves out of the way first; it never enters a span, which
        // would make the formulas read themselves.
        assert!(store.set_sheet_order(&order(&[summary, first, middle, last])));
        assert_close(number(&store, summary, 0, 0), 111.0);

        // Moving the first endpoint past the last one drops it: its inner
        // neighbour becomes the endpoint.
        assert!(store.set_sheet_order(&order(&[summary, middle, last, first])));
        let source = |store: &CellStore, row| store.formula_source(summary, row, 0);
        assert_eq!(source(&store, 0).as_deref(), Some("=SUM(Middle:Last!A1)"));
        assert_close(number(&store, summary, 0, 0), 110.0);
        assert_eq!(source(&store, 1).as_deref(), Some("=SUM(Middle:Middle!A1)"));
        assert_close(number(&store, summary, 1, 0), 10.0);

        // Moving an endpoint outward widens the span over the tab it passes.
        assert!(store.set_sheet_order(&order(&[summary, middle, first, last])));
        assert_eq!(source(&store, 0).as_deref(), Some("=SUM(Middle:Last!A1)"));
        assert_close(number(&store, summary, 0, 0), 111.0);

        // Removing an endpoint gives way to its inner neighbour.
        assert!(store.remove_sheet(last));
        assert_eq!(source(&store, 0).as_deref(), Some("=SUM(Middle:First!A1)"));
        assert_close(number(&store, summary, 0, 0), 11.0);

        // Removing every sheet of a span leaves #REF!.
        assert!(store.remove_sheet(middle));
        assert_eq!(source(&store, 0).as_deref(), Some("=SUM(First:First!A1)"));
        assert_close(number(&store, summary, 0, 0), 1.0);
        assert_eq!(source(&store, 1).as_deref(), Some("=SUM(#REF!)"));
        assert_eq!(string(&store, summary, 1, 0).as_deref(), Some("#REF!"));
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
    const BLANK_ROWS: [usize; 3] = [3, 12, 13];

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

    #[test]
    fn range_style_ids_match_get_cell_styles_with_formulas_and_spills() {
        let (store, sheet) = formula_column();
        let ranges = [(0, ROWS - 1), (4, 6), (SPILL_ANCHOR_ROW, 9), (2, 3)];
        for (first, last) in ranges {
            let mut expected: Vec<u32> = (first..=last)
                .map(|row| store.get_cell(sheet, row, 0).style())
                .collect();
            expected.sort_unstable();
            expected.dedup();
            assert_eq!(
                store.range_style_ids(sheet, first, 0, last, 0),
                expected,
                "rows {first}..={last}"
            );
        }
    }

    #[test]
    fn aggregate_counts_number_formulas_and_skips_text_and_error_results() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(1, ROWS);
        store.set_number(sheet, 0, 0, 5.0, 0);
        store.set_string(sheet, 1, 0, "Needle 7", 0);
        store.set_bool(sheet, 2, 0, true, 0);
        store.set_formula(sheet, 4, 0, "=2+3", 0);
        store.set_formula(sheet, 5, 0, "=\"needle\"", 0);
        store.set_formula(sheet, 6, 0, "=1/0", 0);
        store.set_formula(sheet, 10, 0, "=12345", 0);
        store.recompute(sheet);
        for row in BLANK_ROWS {
            assert_eq!(store.get_cell(sheet, row, 0).kind(), KIND_EMPTY);
        }

        assert_close(store.aggregate(sheet, 0, 0), 12_355.0);
        assert_close(store.aggregate(sheet, 0, 1), 12_355.0 / 3.0);
        assert_close(store.aggregate(sheet, 0, 2), 5.0);
        assert_close(store.aggregate(sheet, 0, 3), 12_345.0);
        assert_close(store.aggregate(sheet, 0, 4), 3.0);
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
    fn a_formula_returning_true_is_ignored() {
        assert_dense_matches_paged("=TRUE", [4.0, 4.0, 4.0, 4.0, 1.0]);
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
