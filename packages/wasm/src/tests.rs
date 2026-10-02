use super::*;

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
    let i = sheet.idx(row, col);
    sheet.kind[i] = KIND_NUMBER;
    sheet.set_num(i, value);
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
    assert_eq!(at_limit.kind.len(), MAX_DENSE_CELLS);
    drop(at_limit);

    let mut bounded_store = CellStore::new();
    assert!(bounded_store.try_add_sheet(1, MAX_DENSE_CELLS + 1).is_err());
    assert!(bounded_store.sheets.is_empty());
    let mut dense = SheetData::new(2, 2);
    put_number(&mut dense, 1, 1, 9.0);
    dense.resize_rows(2);
    dense.insert_rows(0, 1, 0);
    dense.delete_rows(0, 2, 1);
    dense.delete_rows(0, 0, 0);
    dense.insert_cols(0, 1, 0);
    dense.delete_cols(0, 2, 1);
    dense.delete_cols(0, 0, 0);
    assert_close(dense.num_at(dense.idx(1, 1)), 9.0);

    dense.dirty_cells.extend((0..5_000).map(|row| (row, 0)));
    dense.clear_dirty();
    assert!(dense.dirty_cells.is_empty());

    let mut paged = SheetData::new_paged(2, 2, 1, 0, DEFAULT_MAX_PAGED_DIRTY_CELLS);
    assert!(!paged.is_fully_loaded());
    assert!(!paged.range_fully_loaded(0, 0, 1, 1));
    for col in 0..2 {
        for row in 0..2 {
            paged.mark_cell_loaded(row, col, true);
        }
    }
    assert!(paged.is_fully_loaded());
    assert!(paged.range_fully_loaded(0, 0, 1, 1));
    assert!(paged.is_cell_dirty(1, 1));
    paged.mark_range_clean(0, 2, 0, 2);
    assert!(!paged.is_cell_dirty(1, 1));
    paged.pin_range(1, 1, &[0]);
    paged.pin_range(0, 2, &[0, 1]);
    assert_eq!(paged.paged_stats().map(|stats| stats.1), Some(4));
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
    assert_eq!(store.sheets[first].spill_owners.capacity(), 0);
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
    assert_close(number(&store, sheet, 1, 0), 5.0);
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
        ("=CEILING(1,0)", "#DIV/0!"),
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
        ("=SUMIF(A1:A2,\">0\",B1:B3)", "#VALUE!"),
        ("=SUMIFS(A1:A2)", "#VALUE!"),
        ("=SUMIFS(A1:A2,B1:B3,\">0\")", "#VALUE!"),
        ("=AVERAGEIF(A1:A2,\">9\")", "#DIV/0!"),
        ("=INDEX(A1:B2)", "#VALUE!"),
        ("=INDEX(A1:B2,0,1)", "#VALUE!"),
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
    assert!(store.is_sheet_alive(source));
    assert!(store.is_sheet_alive(summary));
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
    assert!(!store.is_sheet_alive(source));
    assert!(store.is_sheet_alive(summary));
    assert_eq!(store.row_count(source), 0);

    let replacement = store.add_sheet(1, 1);
    assert_eq!(
        store.formula_source(summary, 0, 2).as_deref(),
        Some("=SUM(#REF!)")
    );
    assert_eq!(string(&store, summary, 0, 2).as_deref(), Some("#REF!"));
    assert_eq!(replacement, 2);
    assert!(store.is_sheet_alive(replacement));
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
        store.pin_range(99, 0, 1, &[0]);
        store.set_bool(99, 0, 0, true, 0);
        store.set_conditional_rules(99, &[], &[], &[], Vec::new(), &[]);
        store.end_page_load();

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
        assert_eq!(store.style_id_at(99, 0, 0), 0);
        assert_eq!(store.style_id_at(sheet, 9, 9), 0);
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
fn window_view_uses_error_strings_and_consuming_reads() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 1);
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
    assert_eq!(view.style_index, vec![0, 1, 0]);
    assert_eq!(view.style_dict, vec![7, 9]);
    assert_eq!(pooled[0], "hello");
    assert_eq!(view.strings[view.string_index[1] as usize], "#DIV/0!");

    let mut consumed = store.get_window(sheet, 0, 1, &[0, 1]);
    assert!(!consumed.take_packed().is_empty());
    assert!(consumed.take_packed().is_empty());

    store.sheets[sheet]
        .spill_errors
        .insert((0, 1), FormulaError::Spill);
    let spill_view = decode_window(store.get_window(sheet, 0, 1, &[1]));
    assert_eq!(spill_view.kinds, vec![KIND_STRING]);
    let spill_index = spill_view.string_index[0];
    assert_eq!(spill_view.strings[spill_index as usize], "#SPILL!");
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

    // Low-cardinality column: heavy cache reuse, every third row matches.
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
    // Column 0 occupancy: rows 0-2 run, gap, rows 6-7 run, gap to the edge.
    for row in [0, 1, 2, 6, 7] {
        store.set_string(sheet, row, 0, "x", 0);
    }
    // Row 1 occupancy across columns: 0 (from above), 2.
    store.set_number(sheet, 1, 2, 1.0, 0);

    // Inside a run → end of the run.
    assert_eq!(store.data_edge(sheet, 0, 0, 1, 0), 2);
    assert_eq!(store.data_edge(sheet, 7, 0, -1, 0), 6);
    // At a run end (next is empty) → next non-empty cell.
    assert_eq!(store.data_edge(sheet, 2, 0, 1, 0), 6);
    assert_eq!(store.data_edge(sheet, 6, 0, -1, 0), 2);
    // From an empty cell → next non-empty cell.
    assert_eq!(store.data_edge(sheet, 4, 0, 1, 0), 6);
    assert_eq!(store.data_edge(sheet, 4, 0, -1, 0), 2);
    // Nothing ahead → sheet edge.
    assert_eq!(store.data_edge(sheet, 7, 0, 1, 0), 11);
    assert_eq!(store.data_edge(sheet, 0, 0, -1, 0), 0);

    // Horizontal: from (1,0) right lands on the lone occupied col 2, then edge.
    assert_eq!(store.data_edge(sheet, 1, 0, 0, 1), 2);
    assert_eq!(store.data_edge(sheet, 1, 2, 0, 1), 2);
    // Out-of-range inputs bail to 0 without panicking.
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
        let index = sheet.idx(row, 0);
        assert_eq!(sheet.payload[index], encode_num(f64::NAN));
        assert!(!payload_is_str(sheet.payload[index]));
        assert_eq!(sheet.str_id_at(index), NO_STRING);
        assert!(sheet.num_at(index).is_nan());
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
        store.style_id_at(sheet, 0, 0),
        store.style_id_at(sheet, 1, 0),
        store.style_id_at(sheet, 2, 1),
    ];

    let snapshot = store.capture_range(sheet, 0, 0, 3, 2).unwrap();
    let snapshot_numbers = store.snapshot_numbers(&snapshot);
    assert_close(snapshot_numbers[0], 5.0);
    assert_close(snapshot_numbers[1], 6.0);
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
            store.style_id_at(sheet, 0, 0),
            store.style_id_at(sheet, 1, 0),
            store.style_id_at(sheet, 2, 1),
        ],
        styles_before
    );

    store.set_number(sheet, 0, 0, 8.0, styles_before[0]);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 1, 0), 9.0);
    assert_eq!(store.style_id_at(sheet, 1, 0), styles_before[1]);
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
    store.end_page_load();
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
    store.end_page_load();
    let evicted = store.paged_stats(sheet);
    assert_eq!(evicted[0], 2.0);
    assert_eq!(evicted[2], 1.0);
    assert_close(number(&store, sheet, 0, 0), 10.0);
    assert_eq!(store.cell_state(sheet, 4096, 0), 0);

    store.mark_range_clean(sheet, 0, 1, 0, 1);
    assert_eq!(store.paged_stats(sheet)[2], 0.0);
}

#[test]
fn columns_fully_loaded_tracks_disjoint_columns_holes_bounds_and_sparse_accounting() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(3, 8, 4, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);

    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 0, &[1.0, 2.0, 3.0, 4.0], 0);
    store.set_column_numbers(sheet, 2, 0, &[5.0, 6.0, 7.0, 8.0], 0);
    store.end_page_load();

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
    store.end_page_load();
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 1), 42.0);
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
    // Row 10 stays blank.
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

    let mut column = store.distinct_values(sheet, 0, 0);
    // Text, number, error text, boolean, `-0.0`, `0.0`, NaN, blank, the pooled
    // "Alpha" a formula also returns, false, then the numeric formula result.
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

    // Eight entries include the blank, the `-0.0`/`0.0` pair and NaN.
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

    // A limit past the distinct count returns the whole list.
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
    store.recompute_changed_sources();

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
    store.recompute_changed_sources();
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
    store.recompute_changed_sources();
    assert_close(number(&store, sheet, 2, 1), 9.0);

    store.add_rows(sheet, 0, 1);
    store.recompute_changed_sources();
    assert_eq!(
        store.reference_target(sheet, 3, 1),
        Some(vec![sheet as u32, 1, 0])
    );
    assert_close(number(&store, sheet, 3, 1), 9.0);

    store.remove_rows(sheet, 1, 1);
    store.recompute_changed_sources();
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
fn required_sequence_spill_regression_preserves_matrix_shape() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(6, 8);
    store.set_formula(sheet, 0, 0, "=SEQUENCE(2,3,10,2)", 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 0), 10.0);
    assert_close(number(&store, sheet, 0, 2), 14.0);
    assert_close(number(&store, sheet, 1, 0), 16.0);
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

/// Append the probe's string cells to a packed text payload in the given order.
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

    row_major.recompute_changed_sources();
    column_major.recompute_changed_sources();
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

/// Compact status the store returns for invalid or duplicate source metadata.
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
    store.end_page_load();
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
        let is_loaded = state % 3 != 0;
        loaded.push(is_loaded);
        if is_loaded {
            brute.set_number(brute_sheet, row, 0, row as f64, 0);
        }
    }
    for band_start in [0usize, 5, 17, 33] {
        for band_end in [band_start + 1, band_start + 9, 64] {
            let mut expected = Vec::new();
            let mut run: Option<usize> = None;
            for row in band_start..band_end {
                if loaded[row] {
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
        // Rows: both pooled text values, the text cell spelling TRUE, both real
        // booleans, and the error formula whose sentinel text is a pick.
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

    /// Two keys of five rows: (col0 text, col1 number).
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
        // Rows 1 and 3 share both keys, so the row id keeps them in order.
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[1, 1], &[]),
            vec![1, 3, 2, 0, 4]
        );
        // Descending leading key, ascending second key.
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[0, 1], &[]),
            vec![4, 2, 0, 1, 3]
        );
        // Both keys descending.
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[0, 0], &[]),
            vec![4, 0, 2, 1, 3]
        );
    }

    #[test]
    fn multi_key_sort_filters_candidates_and_keeps_their_order() {
        let (store, sheet) = text_number_fixture();
        // 99 is out of range and drops out; the rest sort as the full list does.
        assert_eq!(
            store.sort_rows_multi(sheet, &[0, 1], &[1, 1], &[0, 2, 3, 99]),
            vec![3, 2, 0]
        );
        // One key over a candidate list takes the multi-key path too.
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
        // Row 2 stays blank.
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

        let epoch_before = store.formula_epoch;
        store.set_formula(sheet, 0, 2, "=A1+B1+2", 0);
        assert_eq!(
            store.formula_epoch, epoch_before,
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
    fn formula_rewrite_with_new_reads_rebuilds_dependents() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 2);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_number(sheet, 0, 1, 2.0, 0);
        store.set_formula(sheet, 0, 2, "=A1", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 1.0);

        let epoch_before = store.formula_epoch;
        store.set_formula(sheet, 0, 2, "=B1", 0);
        assert!(
            store.formula_epoch > epoch_before,
            "a changed read set must invalidate the dependency index"
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
        let epoch_before = store.formula_epoch;
        store.set_formula(sheet, 0, 2, "=SORT(A1:A3)", 0);
        assert_eq!(store.formula_epoch, epoch_before);
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
                store.dep_index = None;
                store.sheets[sheet].all_dirty = true;
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
