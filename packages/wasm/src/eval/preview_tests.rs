//! Result previews: values, refusals, limits, and a store left as it was.

use super::preview::{FormulaPreview, FormulaPreviewKind, FormulaPreviewStatus};
use crate::store::CellStore;

fn preview(store: &CellStore, sheet: usize, source: &str) -> FormulaPreview {
    store.preview_formula(sheet, 4, 2, source)
}

fn number(preview: &FormulaPreview) -> f64 {
    assert_eq!(preview.status(), FormulaPreviewStatus::Value);
    assert_eq!(preview.kind(), FormulaPreviewKind::Number);
    preview.number()
}

/// A1:A3 hold 1, 2, 3; B1 holds `=SUM(A1:A3)`.
fn small_store() -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 20);
    for row in 0..3 {
        store.set_number(sheet, row, 0, (row + 1) as f64, 0);
    }
    store.set_formula(sheet, 0, 1, "=SUM(A1:A3)", 0);
    store.commit_sources();
    (store, sheet)
}

#[test]
fn values_errors_text_and_the_editing_position() {
    let (store, sheet) = small_store();
    assert_eq!(number(&preview(&store, sheet, "=SUM(A1:A3)*2")), 12.0);
    // ROW() and COLUMN() read the cell being edited, row 5 and column C.
    assert_eq!(number(&preview(&store, sheet, "=ROW()*10+COLUMN()")), 53.0);
    // A relative reference is relative to that cell too.
    assert_eq!(number(&preview(&store, sheet, "=OFFSET(A1,1,0)")), 2.0);
    assert_eq!(number(&preview(&store, sheet, "=INDIRECT(\"A3\")")), 3.0);

    let text = preview(&store, sheet, "=\"n=\"&B1");
    assert_eq!(text.kind(), FormulaPreviewKind::Text);
    assert_eq!(text.text(), Some("n=6"));

    let error = preview(&store, sheet, "=1/0");
    assert_eq!(error.kind(), FormulaPreviewKind::Error);
    assert_eq!(error.text(), Some("#DIV/0!"));

    assert_eq!(
        preview(&store, sheet, "=SUM(").status(),
        FormulaPreviewStatus::Syntax
    );
}

#[test]
fn an_array_reports_its_shape_and_first_value() {
    let (store, sheet) = small_store();
    let array = preview(&store, sheet, "=SEQUENCE(3,2,7)");
    assert_eq!(array.status(), FormulaPreviewStatus::Array);
    assert_eq!((array.rows(), array.cols()), (3, 2));
    assert_eq!(array.number(), 7.0);

    let range = preview(&store, sheet, "=A2:A3");
    assert_eq!(range.status(), FormulaPreviewStatus::Array);
    assert_eq!((range.rows(), range.cols(), range.number()), (2, 1, 2.0));
}

#[test]
fn referenced_formulas_give_their_stored_results_without_recalculating() {
    let (mut store, sheet) = small_store();
    // A changed input that has not been recalculated yet: B1 still holds 6.
    store.set_number(sheet, 0, 0, 100.0, 0);
    assert_eq!(number(&preview(&store, sheet, "=B1")), 6.0);
    // The input itself reads its new value.
    assert_eq!(number(&preview(&store, sheet, "=A1")), 100.0);
}

#[test]
fn the_store_is_left_exactly_as_it_was() {
    let (mut store, sheet) = small_store();
    store.set_number(sheet, 1, 0, 50.0, 0);
    let before = store.export_memory_state();

    for source in [
        "=SEQUENCE(4)",
        "=SUM(A1:A3)&\"new text\"",
        "=LET(x,A1:A3,SUM(x*2))",
        "=TODAY()+NOW()*0",
        "=OFFSET(A1,0,0,3,1)",
        "=B1",
        "=XLOOKUP(2,A1:A3,A1:A3)",
    ] {
        let _ = preview(&store, sheet, source);
    }

    assert_eq!(store.export_memory_state(), before);
    // A nested preview must not add its dynamic references to the enclosing
    // formula's runtime dependency recording.
    let enclosing = super::reference::start_runtime_reads();
    assert_eq!(number(&preview(&store, sheet, r#"=SUM(INDIRECT("A1:A3"))"#)), 54.0);
    let reads = super::reference::finish_runtime_reads(enclosing);
    assert!(reads.ranges.is_empty());
    // The pending edit still recalculates as it would have.
    store.commit_sources();
    assert_eq!(store.get_cell(sheet, 0, 1).num(), 54.0);
}

#[test]
fn functions_that_change_state_are_refused_before_anything_runs() {
    let (store, sheet) = small_store();
    for source in [
        "=RAND()",
        "=RANDBETWEEN(1,6)",
        // An unchosen branch is refused too: the walk does not evaluate.
        "=IF(TRUE,1,RAND())",
        "=IFERROR(1,RANDBETWEEN(1,2))",
    ] {
        assert_eq!(
            preview(&store, sheet, source).status(),
            FormulaPreviewStatus::UnsafeFunction,
            "{source}"
        );
    }
}

#[test]
fn a_defined_name_that_draws_a_random_number_is_refused() {
    let (mut store, sheet) = small_store();
    assert!(store.set_named_formula("Dice", -1, "=RANDBETWEEN(1,6)"));
    assert!(store.set_named_formula("Safe", -1, "=$A$1+1"));
    assert_eq!(
        preview(&store, sheet, "=Safe+Dice").status(),
        FormulaPreviewStatus::UnsafeFunction
    );
    assert_eq!(number(&preview(&store, sheet, "=Safe*Safe")), 4.0);
}

#[test]
fn a_cell_that_is_not_loaded_makes_the_preview_wait() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 8, 4, 0, 0);
    store.begin_page_load();
    store.set_column_numbers(sheet, 0, 0, &[1.0, 2.0, 3.0, 4.0], 0);
    store.commit_sources();

    assert_eq!(number(&preview(&store, sheet, "=SUM(A1:A4)")), 10.0);
    assert_eq!(
        preview(&store, sheet, "=SUM(A1:A8)").status(),
        FormulaPreviewStatus::Loading
    );
}

#[test]
fn typed_range_reads_reach_a_million_cells_and_no_further() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 1_000_001);
    store.set_column_numbers(sheet, 0, 0, &vec![1.0; 1_000_001], 0);
    store.commit_sources();

    assert_eq!(
        number(&preview(&store, sheet, "=SUM(A1:A1000000)")),
        1_000_000.0
    );
    // The scans of one formula share one budget.
    for source in [
        "=SUM(A1:A600000)+SUM(A2:A600001)",
        "=SUM(A1:A600000,A2:A600001)",
        "=COUNT(A1:A600000)+COUNTIF(A2:A600001,1)",
    ] {
        assert_eq!(
            preview(&store, sheet, source).status(),
            FormulaPreviewStatus::CostLimit,
            "{source}"
        );
    }
}

#[test]
fn cell_by_cell_reads_and_arrays_have_smaller_limits() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(3, 60_001);
    store.set_column_numbers(sheet, 0, 0, &vec![1.0; 60_001], 0);
    store.commit_sources();

    // Copying a range into an array reads each cell; 50,000 at most.
    assert_eq!(
        preview(&store, sheet, "=ROWS(A1:A60000*1)").status(),
        FormulaPreviewStatus::CostLimit
    );
    // An array holds 10,000 cells at most, even when IFERROR catches the
    // refusal: no partial answer is shown.
    assert_eq!(
        preview(&store, sheet, "=SEQUENCE(10001)").status(),
        FormulaPreviewStatus::CostLimit
    );
    assert_eq!(
        preview(&store, sheet, "=IFERROR(ROWS(SEQUENCE(20000)),0)").status(),
        FormulaPreviewStatus::CostLimit
    );
    assert_eq!(
        number(&preview(&store, sheet, "=ROWS(SEQUENCE(10000))")),
        10_000.0
    );
    #[cfg(feature = "analysis")]
    {
        // SUMSQ scans numeric payloads directly, but evaluates logical cells
        // individually; these must use the smaller read budget.
        for row in 0..50_001 {
            store.set_bool(sheet, row, 0, true, 0);
        }
        store.commit_sources();
        assert_eq!(
            preview(&store, sheet, "=SUMSQ(A1:A50001)").status(),
            FormulaPreviewStatus::CostLimit
        );
    }
    // Ordinary evaluation keeps its own, larger limits.
    store.set_formula(sheet, 0, 1, "=ROWS(SEQUENCE(20000))", 0);
    store.commit_sources();
    assert_eq!(store.get_cell(sheet, 0, 1).num(), 20_000.0);
}

#[test]
fn text_output_has_a_limit() {
    let (store, sheet) = small_store();
    assert_eq!(
        preview(&store, sheet, "=LEN(REPT(\"ab\",600000))").status(),
        FormulaPreviewStatus::CostLimit
    );
    assert_eq!(
        number(&preview(&store, sheet, "=LEN(REPT(\"ab\",1000))")),
        2_000.0
    );
}

#[test]
fn long_sources_are_not_previewed() {
    let (store, sheet) = small_store();
    let long = format!("={}", "1+".repeat(4_100) + "1");
    assert_eq!(
        preview(&store, sheet, &long).status(),
        FormulaPreviewStatus::CostLimit
    );
}

#[cfg(feature = "analysis")]
mod full_engine {
    use std::rc::Rc;

    use super::{number, preview, small_store};
    use crate::eval::custom::CustomFunction;
    use crate::eval::preview::FormulaPreviewStatus;
    use crate::types::Value;

    #[test]
    fn lambdas_preview_within_the_call_budget() {
        let (store, sheet) = small_store();
        assert_eq!(number(&preview(&store, sheet, "=LAMBDA(x,x+1)(2)")), 3.0);
        assert_eq!(
            number(&preview(&store, sheet, "=REDUCE(0,A1:A3,LAMBDA(a,b,a+b))")),
            6.0
        );
        // 60,000 calls over arrays of at most 600 cells: past the preview's
        // 50,000 calls, well within the normal limits.
        let calls = "=SUM(MAP(SEQUENCE(100),LAMBDA(x,REDUCE(0,SEQUENCE(600),LAMBDA(a,b,a+b)))))";
        assert_eq!(
            preview(&store, sheet, calls).status(),
            FormulaPreviewStatus::CostLimit
        );
        assert_eq!(
            number(&preview(
                &store,
                sheet,
                "=SUM(MAP(SEQUENCE(10),LAMBDA(x,REDUCE(0,SEQUENCE(600),LAMBDA(a,b,a+b)))))"
            )),
            1_803_000.0
        );
        assert_eq!(
            preview(&store, sheet, "=MAP(A1:A3,LAMBDA(x,x*RAND()))").status(),
            FormulaPreviewStatus::UnsafeFunction
        );
    }

    #[test]
    fn a_host_function_is_refused_and_never_called() {
        let (mut store, sheet) = small_store();
        let calls = Rc::new(std::cell::Cell::new(0));
        let counted = Rc::clone(&calls);
        assert!(store.insert_custom_function(
            "HOSTVALUE",
            CustomFunction {
                implementation: Rc::new(move |_| {
                    counted.set(counted.get() + 1);
                    Value::Number(1.0)
                }),
                volatile: false,
            },
        ));
        assert_eq!(
            preview(&store, sheet, "=IF(FALSE,HOSTVALUE(),2)").status(),
            FormulaPreviewStatus::UnsafeFunction
        );
        assert_eq!(calls.get(), 0);
    }
}
