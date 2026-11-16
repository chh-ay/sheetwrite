//! Formula regressions end to end: named ranges, evaluation limits, LET and
//! array operators.

use super::*;

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
        let src = format!("=A{row}+1");
        store.set_formula(sheet, row, 0, &src, 0);
    }
    store.recompute(sheet);

    assert_eq!(
        string(&store, sheet, FORMULA_RECURSION_LIMIT + 3, 0).as_deref(),
        Some("#NUM!")
    );
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
