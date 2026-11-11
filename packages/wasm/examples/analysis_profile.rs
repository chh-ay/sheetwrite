//! Throwaway: native loops over the analysis gate rows, for perf/sample.
use sheetwrite_wasm::CellStore;
use std::time::Instant;

const N: usize = 100_000;

fn grouping(store: &mut CellStore, formula: &str) -> usize {
    let sheet = store.add_sheet(12, N);
    let region: Vec<String> = (0..N).map(|r| format!("R{}", r % 10)).collect();
    let product: Vec<String> = (0..N).map(|r| format!("P{:02}", r % 100)).collect();
    let quarter: Vec<String> = (0..N).map(|r| format!("Q{}", (r / 7) % 4)).collect();
    store.set_column_strings(sheet, 0, 0, region, 0);
    store.set_column_strings(sheet, 1, 0, product, 0);
    store.set_column_numbers(sheet, 2, 0, &vec![1.0; N], 0);
    store.set_column_strings(sheet, 3, 0, quarter, 0);
    store.set_formula(sheet, 0, 5, formula, 0);
    store.recompute(sheet);
    sheet
}

fn pivot_source(store: &mut CellStore, rows: usize) -> usize {
    let sheet = store.add_sheet(6, rows + 1);
    for field in 0..6 {
        store.set_string(sheet, 0, field, &format!("Field{field}"), 0);
        let values: Vec<f64> = (0..rows)
            .map(|row| if field < 4 { ((row / 10usize.pow(field as u32)) % 10) as f64 } else { (row + field) as f64 })
            .collect();
        store.set_column_numbers(sheet, field, 1, &values, 0);
    }
    sheet
}

fn definition(source: usize, rows: usize, row_fields: &[f64], col_fields: &[f64], values: &[(f64, f64)]) -> Vec<f64> {
    let mut d = vec![0.0, 0.0, source as f64, 0.0, 0.0, rows as f64, 5.0, 0.0, 0.0, row_fields.len() as f64];
    d.extend_from_slice(row_fields);
    d.push(col_fields.len() as f64);
    d.extend_from_slice(col_fields);
    d.push(values.len() as f64);
    for &(f, a) in values { d.extend_from_slice(&[f, a, -1.0]); }
    d.extend_from_slice(&[0.0, 0.0, 7.0]);
    d
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let row = args.get(1).map(String::as_str).unwrap_or("groupby");
    let iterations: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(20);
    let mut store = CellStore::new();
    let mut edit: Box<dyn FnMut(&mut CellStore, usize)> = match row {
        "groupby" => {
            let sheet = grouping(&mut store, &format!("=GROUPBY(A1:B{N},C1:C{N},SUM,0,2)"));
            println!("check {}", store.get_cell(sheet, 110, 7).num());
            Box::new(move |s, i| { s.set_number(sheet, 0, 2, 1.0 + (i % 2) as f64, 0); s.recompute(sheet); })
        }
        "pivotby" => {
            let sheet = grouping(&mut store, &format!("=PIVOTBY(A1:B{N},D1:D{N},C1:C{N},PERCENTOF,0,2,,1,,,2)"));
            println!("check {}", store.get_cell(sheet, 111, 7).num());
            Box::new(move |s, i| { s.set_number(sheet, 0, 2, 1.0 + (i % 2) as f64, 0); s.recompute(sheet); })
        }
        "pivot" => {
            let source = pivot_source(&mut store, N);
            let output = store.add_sheet(32, 2000);
            store.commit_sources();
            let def = definition(source, N, &[0.0, 1.0, 2.0], &[3.0], &[(4.0, 0.0), (5.0, 2.0)]);
            Box::new(move |s, _| {
                assert!(s.set_pivots(output, &def, vec!["pivot".into()]));
                s.recompute(output);
                assert!(s.set_pivots(output, &[], vec![]));
                s.recompute(output);
            })
        }
        "gpd" => {
            let source = pivot_source(&mut store, 10_000);
            let pivot = store.add_sheet(32, 2000);
            let calc = store.add_sheet(2, 1000);
            store.set_sheet_name(pivot, "pivot", "Pivot");
            store.commit_sources();
            assert!(store.set_pivots(pivot, &definition(source, 10_000, &[0.0, 1.0], &[], &[(4.0, 0.0)]), vec!["pivot".into()]));
            store.recompute(pivot);
            for i in 0..1000 {
                store.set_formula(calc, i, 1, &format!("=GETPIVOTDATA(\"Sum of Field4\",Pivot!$A$1,\"Field0\",{},\"Field1\",{})", i % 10, (i / 10) % 10), 0);
            }
            store.recompute(calc);
            println!("check {}", store.get_cell(calc, 999, 1).num());
            Box::new(move |s, i| { s.set_number(calc, 0, 0, 1.0 + (i % 2) as f64, 0); s.recompute(calc); })
        }
        "analysis" => {
            let sheet = store.add_sheet(5, N + 3);
            let a: Vec<f64> = (0..N + 3).map(|r| (r + 1) as f64).collect();
            store.set_column_numbers(sheet, 0, 0, &a, 0);
            store.set_column_numbers(sheet, 3, 0, &[1.0, 3.0], 0);
            store.set_column_numbers(sheet, 4, 0, &[0.0, 1.0], 0);
            store.set_number(sheet, 0, 2, 2.0, 0);
            for r in 0..N {
                let c = r + 1;
                store.set_formula(sheet, r, 1, &format!("=SUMSQ(A{c},$C$1)+AGGREGATE(9,6,A{c},$C$1)+FORECAST.LINEAR(A{c},$D$1:$D$2,$E$1:$E$2)+LEN(TEXTBEFORE(\"ab-\"&A{c}&$C$1,\"-\"))"), 0);
            }
            store.recompute(sheet);
            println!("check {}", store.get_cell(sheet, N - 1, 1).num());
            Box::new(move |s, i| { s.set_number(sheet, 0, 2, 2.0 + (i % 2) as f64, 0); s.recompute(sheet); })
        }
        "history-bytes" => {
            // Writes the window bytes the history example reads.
            let dir = args.get(3).cloned().unwrap_or_else(|| "/tmp/ae-history".into());
            std::fs::create_dir_all(&dir).unwrap();
            for (name, changed) in [("before", false), ("after", true)] {
                let mut s = CellStore::new();
                let sheet = s.add_sheet(20, 5000);
                for col in 0..20 {
                    let v: Vec<f64> = (0..5000).map(|r| (r * 20 + col) as f64).collect();
                    s.set_column_numbers(sheet, col, 0, &v, 0);
                }
                if changed {
                    for k in 0..1000 { let (r, c) = (5 * k + 2, (k * 7) % 20); s.set_number(sheet, r, c, (r * 20 + c) as f64 + 0.5, 0); }
                }
                let window = 65_536 / 20;
                let mut row0 = 0;
                let mut i = 0;
                while row0 < 5000 {
                    let rows = window.min(5000 - row0);
                    let snap = s.capture_range(sheet, row0, 0, rows, 20).unwrap();
                    std::fs::write(format!("{dir}/{name}-{i}"), snap.export_memory_state(sheet as u32)).unwrap();
                    row0 += window; i += 1;
                }
            }
            return;
        }
        other => panic!("unknown row {other}"),
    };
    let start = Instant::now();
    for i in 0..iterations { edit(&mut store, i); }
    println!("{row}: {:.3} ms/iter", start.elapsed().as_secs_f64() * 1e3 / iterations as f64);
}
