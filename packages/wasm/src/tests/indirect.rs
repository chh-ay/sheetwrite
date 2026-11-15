//! OFFSET and INDIRECT: address text, runtime cycles, structural edits and
//! spills of references known only after evaluation.

use super::*;

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
