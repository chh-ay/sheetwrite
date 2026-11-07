//! Replay formula gate workloads natively.
//!
//! ```sh
//! formula-replay [--filter <text>]... [--min-ms <ms>] [--warmup <n>] [--counters] [--sample-each-run] <trace>...
//! ```
//!
//! Each trace comes from `bun bench/src/formula-bench.ts --trace <dir>` and holds
//! one fixture's engine calls. The replay follows the gate's sampling: warm-up
//! fixtures first, then timed runs until they add up to `--min-ms`, with edit
//! fixtures restored untimed between runs and the others rebuilt untimed. The
//! first warm-up and the last timed run are checked against the `getCell`
//! results recorded from the WASM engine.
//!
//! With `FORMULA_REPLAY_PERF_CONTROL=<control fifo>,<ack fifo>`, the replay
//! enables `perf record --control fifo:<control>,<ack> -D -1` only while it
//! runs timed work. Each toggle waits about a millisecond for perf, so only
//! rebuilt fixtures with runs of 5 ms or more toggle sampling around each run.
//! Edit fixtures sample the whole timed loop (their untimed restore repeats the
//! edit in reverse), and so do shorter rebuilt fixtures, whose setup samples
//! (parse and source writes) the phase split then leaves out. With
//! `--sample-each-run`, every fixture toggles sampling around each run, so a
//! profile holds only the timed calls; short runs then spend most of their wall
//! time waiting for perf, so pair it with a small sample period.
//!
//! Output is one tab-separated line per workload: key, timed runs, mean ns per
//! run, then per-run hardware counters (`--counters`, Linux) and heap
//! allocations (`--features count-allocations`).

mod counters;
mod trace;

use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::process::ExitCode;
use std::time::Instant;

use counters::{Counters, COUNTER_NAMES};
use sheetwrite_wasm::CellStore;
use trace::{Argument, Call, ExpectedCell, Workload};

/// Rebuilt fixtures whose run takes at least this long toggle perf sampling
/// around each run; a toggle costs about a millisecond.
const PER_RUN_SAMPLING_NS: u128 = 5_000_000;

#[cfg(feature = "count-allocations")]
mod allocations {
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::sync::atomic::{AtomicU64, Ordering};

    pub static COUNT: AtomicU64 = AtomicU64::new(0);
    pub static BYTES: AtomicU64 = AtomicU64::new(0);

    /// The system allocator, counting each allocation and reallocation.
    pub struct Counting;

    // SAFETY: every method forwards to `System` with the caller's arguments.
    unsafe impl GlobalAlloc for Counting {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            COUNT.fetch_add(1, Ordering::Relaxed);
            BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
            System.alloc(layout)
        }

        unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
            System.dealloc(pointer, layout);
        }

        unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
            COUNT.fetch_add(1, Ordering::Relaxed);
            BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
            System.alloc_zeroed(layout)
        }

        unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
            COUNT.fetch_add(1, Ordering::Relaxed);
            BYTES.fetch_add(new_size as u64, Ordering::Relaxed);
            System.realloc(pointer, layout, new_size)
        }
    }

    #[global_allocator]
    static ALLOCATOR: Counting = Counting;

    /// Allocations and bytes so far.
    pub fn totals() -> (u64, u64) {
        (COUNT.load(Ordering::Relaxed), BYTES.load(Ordering::Relaxed))
    }
}

/// Allocations and bytes so far; zero without `count-allocations`.
fn allocation_totals() -> (u64, u64) {
    #[cfg(feature = "count-allocations")]
    return allocations::totals();

    #[cfg(not(feature = "count-allocations"))]
    (0, 0)
}

/// A recorded call with its arguments decoded for the engine's native API.
enum Operation {
    NewStore,
    AddSheet {
        store: usize,
        columns: usize,
        rows: usize,
    },
    SetColumnNumbers {
        store: usize,
        sheet: usize,
        col: usize,
        start_row: usize,
        values: Vec<f64>,
        style: u32,
    },
    SetFormula {
        store: usize,
        sheet: usize,
        row: usize,
        col: usize,
        source: String,
        style: u32,
    },
    SetNumber {
        store: usize,
        sheet: usize,
        row: usize,
        col: usize,
        value: f64,
        style: u32,
    },
    SetString {
        store: usize,
        sheet: usize,
        row: usize,
        col: usize,
        value: String,
        style: u32,
    },
    SetBool {
        store: usize,
        sheet: usize,
        row: usize,
        col: usize,
        value: bool,
        style: u32,
    },
    ClearCell {
        store: usize,
        sheet: usize,
        row: usize,
        col: usize,
        style: u32,
    },
    Recompute {
        store: usize,
        sheet: usize,
    },
    GetCell {
        store: usize,
        sheet: usize,
        row: usize,
        col: usize,
        expected: Option<ExpectedCell>,
    },
    SetSheetName {
        store: usize,
        sheet: usize,
        id: String,
        name: String,
    },
    RemoveSheet {
        store: usize,
        sheet: usize,
    },
    SpillAnchorRow {
        store: usize,
        sheet: usize,
        row: usize,
        col: usize,
    },
    Free {
        store: usize,
    },
    /// Benchmark diagnostics with no engine work to time.
    Diagnostic,
}

fn number(arguments: &[Argument], index: usize, method: &str) -> Result<f64, String> {
    match arguments.get(index) {
        Some(Argument::Number(value)) => Ok(*value),
        other => Err(format!(
            "{method} argument {index} should be a number, found {other:?}"
        )),
    }
}

fn index(arguments: &[Argument], position: usize, method: &str) -> Result<usize, String> {
    number(arguments, position, method).map(|value| value as usize)
}

fn text(arguments: &[Argument], index: usize, method: &str) -> Result<String, String> {
    match arguments.get(index) {
        Some(Argument::Text(value)) => Ok(value.clone()),
        other => Err(format!(
            "{method} argument {index} should be text, found {other:?}"
        )),
    }
}

fn decode(call: &Call) -> Result<Operation, String> {
    let Call::Method {
        store,
        method,
        arguments,
        expected,
    } = call
    else {
        return Ok(Operation::NewStore);
    };

    let store = *store;
    let arguments = arguments.as_slice();
    let method = method.as_str();
    let at = |position| index(arguments, position, method);

    let operation = match method {
        "addSheet" => Operation::AddSheet {
            store,
            columns: at(0)?,
            rows: at(1)?,
        },
        "setColumnNumbers" => {
            let Some(Argument::Numbers(values)) = arguments.get(3) else {
                return Err("setColumnNumbers argument 3 should be a Float64Array".to_owned());
            };
            Operation::SetColumnNumbers {
                store,
                sheet: at(0)?,
                col: at(1)?,
                start_row: at(2)?,
                values: values.clone(),
                style: at(4)? as u32,
            }
        }
        "setFormula" => Operation::SetFormula {
            store,
            sheet: at(0)?,
            row: at(1)?,
            col: at(2)?,
            source: text(arguments, 3, method)?,
            style: at(4)? as u32,
        },
        "setNumber" => Operation::SetNumber {
            store,
            sheet: at(0)?,
            row: at(1)?,
            col: at(2)?,
            value: number(arguments, 3, method)?,
            style: at(4)? as u32,
        },
        "setString" => Operation::SetString {
            store,
            sheet: at(0)?,
            row: at(1)?,
            col: at(2)?,
            value: text(arguments, 3, method)?,
            style: at(4)? as u32,
        },
        "setBool" => {
            let Some(Argument::Bool(value)) = arguments.get(3) else {
                return Err("setBool argument 3 should be a boolean".to_owned());
            };
            Operation::SetBool {
                store,
                sheet: at(0)?,
                row: at(1)?,
                col: at(2)?,
                value: *value,
                style: at(4)? as u32,
            }
        }
        "clearCell" => Operation::ClearCell {
            store,
            sheet: at(0)?,
            row: at(1)?,
            col: at(2)?,
            style: at(3)? as u32,
        },
        "recompute" => Operation::Recompute {
            store,
            sheet: at(0)?,
        },
        "getCell" => Operation::GetCell {
            store,
            sheet: at(0)?,
            row: at(1)?,
            col: at(2)?,
            expected: expected.clone(),
        },
        "setSheetName" => Operation::SetSheetName {
            store,
            sheet: at(0)?,
            id: text(arguments, 1, method)?,
            name: text(arguments, 2, method)?,
        },
        "removeSheet" => Operation::RemoveSheet {
            store,
            sheet: at(0)?,
        },
        "spillAnchorRow" => Operation::SpillAnchorRow {
            store,
            sheet: at(0)?,
            row: at(1)?,
            col: at(2)?,
        },
        "free" => Operation::Free { store },
        "resetFormulaMatrixResourceStats" | "formulaMatrixResourceStats" | "memoryStats" => {
            Operation::Diagnostic
        }
        other => return Err(format!("the replay has no mapping for CellStore.{other}")),
    };

    Ok(operation)
}

fn decode_all(calls: &[Call]) -> Result<Vec<Operation>, String> {
    calls.iter().map(decode).collect()
}

fn same_number(left: f64, right: f64) -> bool {
    left == right || (left.is_nan() && right.is_nan())
}

/// Run `operations` against `stores`. With `verify`, compare every `getCell`
/// with its recorded result.
fn execute(
    stores: &mut Vec<Option<CellStore>>,
    operations: &[Operation],
    verify: bool,
) -> Result<(), String> {
    fn store(stores: &mut [Option<CellStore>], index: usize) -> Result<&mut CellStore, String> {
        stores
            .get_mut(index)
            .and_then(Option::as_mut)
            .ok_or_else(|| format!("store {index} is not live"))
    }

    for operation in operations {
        match operation {
            Operation::NewStore => stores.push(Some(CellStore::new())),
            Operation::AddSheet {
                store: id,
                columns,
                rows,
            } => {
                store(stores, *id)?.add_sheet(*columns, *rows);
            }
            Operation::SetColumnNumbers {
                store: id,
                sheet,
                col,
                start_row,
                values,
                style,
            } => {
                store(stores, *id)?.set_column_numbers(*sheet, *col, *start_row, values, *style);
            }
            Operation::SetFormula {
                store: id,
                sheet,
                row,
                col,
                source,
                style,
            } => {
                store(stores, *id)?.set_formula(*sheet, *row, *col, source, *style);
            }
            Operation::SetNumber {
                store: id,
                sheet,
                row,
                col,
                value,
                style,
            } => {
                store(stores, *id)?.set_number(*sheet, *row, *col, *value, *style);
            }
            Operation::SetString {
                store: id,
                sheet,
                row,
                col,
                value,
                style,
            } => {
                store(stores, *id)?.set_string(*sheet, *row, *col, value, *style);
            }
            Operation::SetBool {
                store: id,
                sheet,
                row,
                col,
                value,
                style,
            } => {
                store(stores, *id)?.set_bool(*sheet, *row, *col, *value, *style);
            }
            Operation::ClearCell {
                store: id,
                sheet,
                row,
                col,
                style,
            } => {
                store(stores, *id)?.clear_cell(*sheet, *row, *col, *style);
            }
            Operation::Recompute { store: id, sheet } => store(stores, *id)?.recompute(*sheet),
            Operation::GetCell {
                store: id,
                sheet,
                row,
                col,
                expected,
            } => {
                let cell = store(stores, *id)?.get_cell(*sheet, *row, *col);
                let Some(expected) = expected.as_ref().filter(|_| verify) else {
                    continue;
                };

                let matches = cell.kind() == expected.kind
                    && same_number(cell.num(), expected.number)
                    && cell.string() == expected.text;

                if !matches {
                    return Err(format!(
                        "getCell({sheet}, {row}, {col}) returned kind {} number {} text {:?}; WASM returned {expected:?}",
                        cell.kind(),
                        cell.num(),
                        cell.string()
                    ));
                }
            }
            Operation::SetSheetName {
                store: id,
                sheet,
                id: sheet_id,
                name,
            } => {
                store(stores, *id)?.set_sheet_name(*sheet, sheet_id, name);
            }
            Operation::RemoveSheet { store: id, sheet } => {
                store(stores, *id)?.remove_sheet(*sheet);
            }
            Operation::SpillAnchorRow {
                store: id,
                sheet,
                row,
                col,
            } => {
                std::hint::black_box(store(stores, *id)?.spill_anchor_row(*sheet, *row, *col));
            }
            Operation::Free { store: id } => {
                if let Some(slot) = stores.get_mut(*id) {
                    *slot = None;
                }
            }
            Operation::Diagnostic => {}
        }
    }

    Ok(())
}

/// The `perf record --control` fifos: enable and disable sampling, waiting for
/// perf's acknowledgement each time.
struct PerfControl {
    control: File,
    acknowledgement: BufReader<File>,
}

impl PerfControl {
    fn from_environment() -> Result<Option<Self>, String> {
        let Ok(paths) = std::env::var("FORMULA_REPLAY_PERF_CONTROL") else {
            return Ok(None);
        };

        let Some((control, acknowledgement)) = paths.split_once(',') else {
            return Err("FORMULA_REPLAY_PERF_CONTROL must be <control fifo>,<ack fifo>".to_owned());
        };

        let control = std::fs::OpenOptions::new()
            .write(true)
            .open(control)
            .map_err(|error| format!("opening {control}: {error}"))?;
        let acknowledgement = File::open(acknowledgement)
            .map_err(|error| format!("opening {acknowledgement}: {error}"))?;

        Ok(Some(Self {
            control,
            acknowledgement: BufReader::new(acknowledgement),
        }))
    }

    fn send(&mut self, command: &str) {
        let mut reply = String::new();

        if self.control.write_all(command.as_bytes()).is_err()
            || self.acknowledgement.read_line(&mut reply).is_err()
        {
            eprintln!("perf control fifo closed while sending {command:?}");
        }
    }
}

struct Options {
    filters: Vec<String>,
    minimum_ms: f64,
    warmup: usize,
    counters: bool,
    /// Toggle perf sampling around every timed run, whatever its length.
    sample_each_run: bool,
    traces: Vec<String>,
}

fn parse_options() -> Result<Options, String> {
    let mut options = Options {
        filters: Vec::new(),
        minimum_ms: 50.0,
        warmup: 3,
        counters: false,
        sample_each_run: false,
        traces: Vec::new(),
    };
    let mut arguments = std::env::args().skip(1);

    while let Some(argument) = arguments.next() {
        let mut value = |name: &str| {
            arguments
                .next()
                .ok_or_else(|| format!("{name} needs a value"))
        };

        match argument.as_str() {
            "--filter" => options.filters.push(value("--filter")?),
            "--min-ms" => {
                options.minimum_ms = value("--min-ms")?
                    .parse()
                    .map_err(|error| format!("--min-ms: {error}"))?;
            }
            "--warmup" => {
                options.warmup = value("--warmup")?
                    .parse()
                    .map_err(|error| format!("--warmup: {error}"))?;
            }
            "--counters" => options.counters = true,
            "--sample-each-run" => options.sample_each_run = true,
            _ => options.traces.push(argument),
        }
    }

    Ok(options)
}

/// The decoded phases of one workload.
struct Phases {
    setup: Vec<Operation>,
    run: Vec<Operation>,
    check: Vec<Operation>,
    restore: Vec<Operation>,
}

/// Bring a fixture to the state its next run expects: restore an edit fixture,
/// rebuild any other.
fn prepare(
    stores: &mut Vec<Option<CellStore>>,
    phases: &Phases,
    restores: bool,
    first: bool,
) -> Result<(), String> {
    if restores && !first {
        return execute(stores, &phases.restore, false);
    }

    stores.clear();
    execute(stores, &phases.setup, false)
}

fn replay(
    workload: &Workload,
    options: &Options,
    counters: Option<&Counters>,
    perf: &mut Option<PerfControl>,
) -> Result<String, String> {
    let phases = Phases {
        setup: decode_all(&workload.setup)?,
        run: decode_all(&workload.run)?,
        check: decode_all(&workload.check)?,
        restore: decode_all(&workload.restore)?,
    };
    let mut stores: Vec<Option<CellStore>> = Vec::new();
    let mut first = true;

    let mut warmup_ns = 0u128;

    for warmup in 0..options.warmup {
        prepare(&mut stores, &phases, workload.restores, first)?;
        first = false;
        let started = Instant::now();
        execute(&mut stores, &phases.run, false)?;
        warmup_ns = started.elapsed().as_nanos();
        execute(&mut stores, &phases.check, warmup == 0)?;
    }

    let minimum_ns = options.minimum_ms * 1e6;
    let mut total_ns = 0.0;
    let mut runs = 0u64;
    let mut counter_totals = vec![0u64; COUNTER_NAMES.len()];
    let mut allocations = (0u64, 0u64);

    // A perf toggle costs about a millisecond, so by default only runs well
    // above that toggle sampling; shorter rebuilt fixtures sample their setup
    // too, and the phase split drops its parse and source-write samples.
    let sample_each_run = options.sample_each_run
        || (!workload.restores && warmup_ns >= PER_RUN_SAMPLING_NS);

    if let Some(perf) = perf.as_mut().filter(|_| !sample_each_run) {
        perf.send("enable\n");
    }

    while total_ns < minimum_ns {
        prepare(&mut stores, &phases, workload.restores, first)?;
        first = false;

        if let Some(counters) = counters {
            counters.reset();
            counters.enable();
        }

        if let Some(perf) = perf.as_mut().filter(|_| sample_each_run) {
            perf.send("enable\n");
        }

        let allocations_before = allocation_totals();
        let started = Instant::now();
        execute(&mut stores, &phases.run, false)?;
        let elapsed = started.elapsed();
        let allocations_after = allocation_totals();

        if let Some(perf) = perf.as_mut().filter(|_| sample_each_run) {
            perf.send("disable\n");
        }

        if let Some(counters) = counters {
            counters.disable();
            for (total, value) in counter_totals.iter_mut().zip(counters.read()) {
                *total += value;
            }
        }

        allocations.0 += allocations_after.0 - allocations_before.0;
        allocations.1 += allocations_after.1 - allocations_before.1;
        total_ns += elapsed.as_nanos() as f64;
        runs += 1;
    }

    if let Some(perf) = perf.as_mut().filter(|_| !sample_each_run) {
        perf.send("disable\n");
    }

    execute(&mut stores, &phases.check, true)?;

    let mut fields = vec![
        workload.key(),
        runs.to_string(),
        format!("{:.0}", total_ns / runs as f64),
    ];

    if counters.is_some() {
        fields.extend(
            counter_totals
                .iter()
                .map(|total| format!("{:.0}", *total as f64 / runs as f64)),
        );
    }

    if cfg!(feature = "count-allocations") {
        fields.push(format!("{:.1}", allocations.0 as f64 / runs as f64));
        fields.push(format!("{:.0}", allocations.1 as f64 / runs as f64));
    }

    Ok(fields.join("\t"))
}

fn main() -> ExitCode {
    let options = match parse_options() {
        Ok(options) => options,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::FAILURE;
        }
    };

    let counters = if options.counters {
        Counters::open()
    } else {
        None
    };
    if options.counters && counters.is_none() {
        eprintln!("hardware counters are unavailable; timing only");
    }

    let mut perf = match PerfControl::from_environment() {
        Ok(perf) => perf,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::FAILURE;
        }
    };

    let mut header = vec!["key", "runs", "ns_per_run"];
    if counters.is_some() {
        header.extend(COUNTER_NAMES);
    }
    if cfg!(feature = "count-allocations") {
        header.extend(["allocations_per_run", "allocated_bytes_per_run"]);
    }
    println!("{}", header.join("\t"));

    let mut failed = false;

    for path in &options.traces {
        if !options.filters.is_empty()
            && !options
                .filters
                .iter()
                .any(|filter| path.contains(filter.as_str()))
        {
            continue;
        }

        let result = std::fs::read_to_string(path)
            .map_err(|error| format!("{path}: {error}"))
            .and_then(|text| trace::parse(&text).map_err(|error| format!("{path}: {error}")))
            .and_then(|workload| {
                replay(&workload, &options, counters.as_ref(), &mut perf)
                    .map_err(|error| format!("{}: {error}", workload.key()))
            });

        match result {
            Ok(line) => println!("{line}"),
            Err(error) => {
                eprintln!("{error}");
                failed = true;
            }
        }
    }

    if failed {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}
