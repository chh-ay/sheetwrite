//! Throwaway: native loop over the history-diff gate row, for perf/sample.
use sheetwrite_history::DiffKernel;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dir = args.get(1).cloned().unwrap_or_else(|| "/tmp/ae-history".into());
    let iterations: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(200);
    let windows: Vec<(Vec<u8>, Vec<u8>)> = (0..)
        .map_while(|i| Some((std::fs::read(format!("{dir}/before-{i}")).ok()?, std::fs::read(format!("{dir}/after-{i}")).ok()?)))
        .collect();
    let window_rows = 65_536 / 20;
    let mut writes = Vec::new();
    for i in 0..11_000u32 { writes.push(((i * 7919) % 5000, i % 20, i % 8)); }
    for k in 0..1000u32 { writes.push((5 * k + 2, (k * 7) % 20, k % 8)); }
    let start = Instant::now();
    let mut checksum = 0u64;
    for _ in 0..iterations {
        let mut kernel = DiffKernel::new(1000);
        let slot = kernel.add_sheet(5000, 20, true);
        for &(r, c, a) in &writes { kernel.touch(slot, r, c, r, c, a); }
        kernel.set_styles(&[], &[]);
        for (i, (before, after)) in windows.iter().enumerate() {
            assert!(kernel.load_after(after) && kernel.load_before(before));
            let row0 = (i * window_rows) as u32;
            let rows = (5000 - row0).min(window_rows as u32);
            let next = kernel.compare(slot, true, 0, 0, rows, 20, row0, 0, row0, 0, 0);
            if next < rows * 20 { break; }
        }
        let rows = kernel.page_rows();
        let cols = kernel.page_cols();
        let authors = kernel.page_authors();
        let _ = (kernel.page_sheets(), kernel.page_before_rows(), kernel.page_before_cols(), kernel.page_flags());
        checksum = rows.iter().zip(&cols).zip(&authors).map(|((&r, &c), &a)| u64::from(r * 20 + c) + u64::from(a) * 100_000).sum();
    }
    println!("history: {:.3} ms/iter checksum {checksum}", start.elapsed().as_secs_f64() * 1e3 / iterations as f64);
}
