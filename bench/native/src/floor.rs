//! Ideal-layout floors for the formula gate's top workloads.
//!
//! ```sh
//! formula-floor [--min-ms <ms>] [--filter <text>]...
//! ```
//!
//! Each floor does the same work as one gate workload's timed run, written as
//! a minimal engine with the layout a recalculation needs and nothing else:
//! typed number columns with a kind byte per cell, formulas compiled to a flat
//! op list, flat reader edges indexed by dense cell number, and a dirty bitset
//! with a pass-scoped topological order. Results are checked against the gate's
//! expected outputs. Output matches `formula-replay`: key, runs, mean ns/run.
//!
//! The floors are lower bounds for a general engine, not special cases: every
//! formula still goes through the same interpreter, dependency walk and result
//! write, so a gap of the engine over its floor measures design overhead.

use std::hint::black_box;
use std::time::Instant;

const KIND_EMPTY: u8 = 0;
const KIND_NUMBER: u8 = 1;
const KIND_TEXT: u8 = 2;
const KIND_BOOL: u8 = 3;
const KIND_ERROR: u8 = 4;

/// One typed sheet column: a number (or text id, or bool) and a kind per row.
#[derive(Clone)]
struct Column {
    numbers: Vec<f64>,
    kinds: Vec<u8>,
}

impl Column {
    fn new(rows: usize) -> Self {
        Self {
            numbers: vec![0.0; rows],
            kinds: vec![KIND_EMPTY; rows],
        }
    }

    fn numbers(values: impl Iterator<Item = f64>) -> Self {
        let numbers: Vec<f64> = values.collect();
        let kinds = vec![KIND_NUMBER; numbers.len()];
        Self { numbers, kinds }
    }
}

/// A sheet of typed columns; cell `(row, col)` has the dense index `col * rows + row`.
struct Sheet {
    rows: usize,
    columns: Vec<Column>,
}

impl Sheet {
    fn cell(&self, row: usize, col: usize) -> usize {
        col * self.rows + row
    }
}

/// One step of a compiled formula. Operands live on a small number stack.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Op {
    Cell { col: u16, row: u32 },
    Number(f64),
    Add,
    Subtract,
    Multiply,
    Divide,
}

/// Every formula's ops in one flat list, its output cell and the cells it reads.
#[derive(Default)]
struct Formulas {
    ops: Vec<Op>,
    op_starts: Vec<u32>,
    outputs: Vec<u32>,
    reads: Vec<u32>,
    read_starts: Vec<u32>,
    /// The source text of every formula, end to end.
    source_bytes: Vec<u8>,
    source_starts: Vec<u32>,
}

impl Formulas {
    fn len(&self) -> usize {
        self.outputs.len()
    }

    fn ops(&self, formula: usize) -> &[Op] {
        let start = self.op_starts[formula] as usize;
        let end = self
            .op_starts
            .get(formula + 1)
            .map_or(self.ops.len(), |end| *end as usize);
        &self.ops[start..end]
    }

    fn reads(&self, formula: usize) -> &[u32] {
        let start = self.read_starts[formula] as usize;
        let end = self
            .read_starts
            .get(formula + 1)
            .map_or(self.reads.len(), |end| *end as usize);
        &self.reads[start..end]
    }
}

/// Parse `=<expression>` with numbers, `A1`-style references (with optional
/// `$`), `+ - * /` and parentheses into postfix ops, recording each read.
struct Parser<'a> {
    bytes: &'a [u8],
    position: usize,
    rows: usize,
}

impl Parser<'_> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.position).copied()
    }

    fn expression(&mut self, formulas: &mut Formulas) -> Result<(), String> {
        self.term(formulas)?;

        while let Some(operator @ (b'+' | b'-')) = self.peek() {
            self.position += 1;
            self.term(formulas)?;
            formulas.ops.push(if operator == b'+' {
                Op::Add
            } else {
                Op::Subtract
            });
        }

        Ok(())
    }

    fn term(&mut self, formulas: &mut Formulas) -> Result<(), String> {
        self.atom(formulas)?;

        while let Some(operator @ (b'*' | b'/')) = self.peek() {
            self.position += 1;
            self.atom(formulas)?;
            formulas.ops.push(if operator == b'*' {
                Op::Multiply
            } else {
                Op::Divide
            });
        }

        Ok(())
    }

    fn atom(&mut self, formulas: &mut Formulas) -> Result<(), String> {
        match self.peek() {
            Some(b'(') => {
                self.position += 1;
                self.expression(formulas)?;
                if self.peek() != Some(b')') {
                    return Err("missing )".to_owned());
                }
                self.position += 1;
                Ok(())
            }
            Some(b'0'..=b'9' | b'.') => {
                let start = self.position;
                while matches!(self.peek(), Some(b'0'..=b'9' | b'.')) {
                    self.position += 1;
                }
                let text = std::str::from_utf8(&self.bytes[start..self.position])
                    .map_err(|error| error.to_string())?;
                let value = text.parse::<f64>().map_err(|error| error.to_string())?;
                formulas.ops.push(Op::Number(value));
                Ok(())
            }
            Some(b'$' | b'A'..=b'Z') => {
                if self.peek() == Some(b'$') {
                    self.position += 1;
                }
                let mut col = 0u32;
                while let Some(letter @ b'A'..=b'Z') = self.peek() {
                    col = col * 26 + u32::from(letter - b'A' + 1);
                    self.position += 1;
                }
                if self.peek() == Some(b'$') {
                    self.position += 1;
                }
                let mut row = 0u32;
                while let Some(digit @ b'0'..=b'9') = self.peek() {
                    row = row * 10 + u32::from(digit - b'0');
                    self.position += 1;
                }
                if col == 0 || row == 0 {
                    return Err("bad reference".to_owned());
                }
                let (col, row) = (col - 1, row - 1);
                formulas.ops.push(Op::Cell {
                    col: col as u16,
                    row,
                });
                formulas.reads.push(col * self.rows as u32 + row);
                Ok(())
            }
            other => Err(format!("unexpected {other:?}")),
        }
    }
}

/// Compile one formula into `formulas`, as `setFormula` would.
fn add_formula(
    formulas: &mut Formulas,
    rows: usize,
    output: usize,
    source: &str,
) -> Result<(), String> {
    formulas.op_starts.push(formulas.ops.len() as u32);
    formulas.read_starts.push(formulas.reads.len() as u32);
    formulas
        .source_starts
        .push(formulas.source_bytes.len() as u32);
    formulas.source_bytes.extend_from_slice(source.as_bytes());
    formulas.outputs.push(output as u32);

    let Some(body) = source.strip_prefix('=') else {
        return Err(format!("{source:?} is not a formula"));
    };

    let mut parser = Parser {
        bytes: body.as_bytes(),
        position: 0,
        rows,
    };
    parser.expression(formulas)?;

    if parser.position != parser.bytes.len() {
        return Err(format!("trailing text in {source:?}"));
    }

    Ok(())
}

/// Readers of every cell, compressed: `formulas[starts[cell]..starts[cell + 1]]`,
/// plus the formula that owns each cell (`u32::MAX` for none).
struct Readers {
    starts: Vec<u32>,
    formulas: Vec<u32>,
    owner: Vec<u32>,
}

impl Readers {
    fn build(formulas: &Formulas, cells: usize) -> Self {
        let clock = PhaseClock::start();
        let mut starts = vec![0u32; cells + 1];
        for &cell in &formulas.reads {
            starts[cell as usize + 1] += 1;
        }
        for cell in 0..cells {
            starts[cell + 1] += starts[cell];
        }

        let mut cursor = starts.clone();
        let mut readers = vec![0u32; formulas.reads.len()];
        for formula in 0..formulas.len() {
            for &cell in formulas.reads(formula) {
                readers[cursor[cell as usize] as usize] = formula as u32;
                cursor[cell as usize] += 1;
            }
        }

        let mut owner = vec![u32::MAX; cells];
        for (formula, &cell) in formulas.outputs.iter().enumerate() {
            owner[cell as usize] = formula as u32;
        }

        clock.lap(Phase::Index);

        Self {
            starts,
            formulas: readers,
            owner,
        }
    }

    fn of(&self, cell: u32) -> &[u32] {
        &self.formulas[self.starts[cell as usize] as usize..self.starts[cell as usize + 1] as usize]
    }
}

/// Pass-scoped scratch, cleared at the start of every recalculation.
struct Pass {
    dirty: Vec<u64>,
    queue: Vec<u32>,
    waiting: Vec<u32>,
    order: Vec<u32>,
}

impl Pass {
    fn new(formulas: usize) -> Self {
        Self {
            dirty: vec![0; formulas.div_ceil(64)],
            queue: Vec::with_capacity(formulas),
            waiting: vec![0; formulas],
            order: Vec::with_capacity(formulas),
        }
    }

    fn mark(&mut self, formula: u32) -> bool {
        let word = &mut self.dirty[formula as usize / 64];
        let bit = 1u64 << (formula % 64);
        let fresh = *word & bit == 0;
        *word |= bit;
        fresh
    }

    fn is_dirty(&self, formula: u32) -> bool {
        self.dirty[formula as usize / 64] & (1u64 << (formula % 64)) != 0
    }
}

fn evaluate(ops: &[Op], sheet: &Sheet) -> (u8, f64) {
    let mut stack = [0.0f64; 8];
    let mut depth = 0usize;

    for op in ops {
        match *op {
            Op::Cell { col, row } => {
                let column = &sheet.columns[col as usize];
                let kind = column.kinds[row as usize];
                stack[depth] = match kind {
                    KIND_NUMBER | KIND_BOOL => column.numbers[row as usize],
                    KIND_EMPTY => 0.0,
                    _ => return (KIND_ERROR, 0.0),
                };
                depth += 1;
            }
            Op::Number(value) => {
                stack[depth] = value;
                depth += 1;
            }
            Op::Add | Op::Subtract | Op::Multiply | Op::Divide => {
                depth -= 1;
                let right = stack[depth];
                let left = &mut stack[depth - 1];
                *left = match *op {
                    Op::Add => *left + right,
                    Op::Subtract => *left - right,
                    Op::Multiply => *left * right,
                    _ if right == 0.0 => return (KIND_ERROR, 0.0),
                    _ => *left / right,
                };
            }
        }
    }

    (KIND_NUMBER, stack[0])
}

/// Recalculate every formula reachable from `seeds` (cells) and the formulas
/// `seed_formulas` (edited or never calculated): dirty walk through the reader
/// edges, topological order of the dirty set (Kahn), evaluation and typed
/// result write.
fn recalculate(
    sheet: &mut Sheet,
    formulas: &Formulas,
    readers: &Readers,
    pass: &mut Pass,
    seeds: &[u32],
    seed_formulas: std::ops::Range<u32>,
) {
    let clock = PhaseClock::start();
    pass.dirty.fill(0);
    pass.queue.clear();
    pass.order.clear();

    for formula in seed_formulas {
        pass.mark(formula);
        pass.queue.push(formula);
    }

    for &cell in seeds {
        for &formula in readers.of(cell) {
            if pass.mark(formula) {
                pass.queue.push(formula);
            }
        }
    }

    let mut next = 0;
    while next < pass.queue.len() {
        let formula = pass.queue[next];
        next += 1;
        for &reader in readers.of(formulas.outputs[formula as usize]) {
            if pass.mark(reader) {
                pass.queue.push(reader);
            }
        }
    }
    let clock = clock.lap(Phase::Dirty);

    for &formula in &pass.queue {
        let mut waiting = 0;
        for &cell in formulas.reads(formula as usize) {
            let owner = readers.owner[cell as usize];
            if owner != u32::MAX && pass.is_dirty(owner) {
                waiting += 1;
            }
        }
        pass.waiting[formula as usize] = waiting;
        if waiting == 0 {
            pass.order.push(formula);
        }
    }
    let clock = clock.lap(Phase::Order);

    let mut next = 0;
    while next < pass.order.len() {
        let formula = pass.order[next] as usize;
        next += 1;

        let (kind, value) = evaluate(formulas.ops(formula), sheet);
        let output = formulas.outputs[formula] as usize;
        let column = &mut sheet.columns[output / sheet.rows];
        column.kinds[output % sheet.rows] = kind;
        column.numbers[output % sheet.rows] = value;

        for &reader in readers.of(output as u32) {
            let waiting = &mut pass.waiting[reader as usize];
            if pass.dirty[reader as usize / 64] & (1u64 << (reader % 64)) != 0 {
                *waiting -= 1;
                if *waiting == 0 {
                    pass.order.push(reader);
                }
            }
        }
    }
    clock.lap(Phase::Evaluate);
}

/// The floor's recalculation steps, for the per-phase gap against the engine.
#[derive(Clone, Copy)]
enum Phase {
    Index,
    Dirty,
    Order,
    Evaluate,
}

const PHASE_NAMES: [&str; 4] = [
    "dependency_index",
    "dirty_collection",
    "pass_ordering",
    "evaluation_and_write",
];

/// Phase clocks run only in the extra, untimed pass `measure` makes after the
/// timed runs, so reading the clock never adds to a floor's time.
static CLOCKS_ON: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

thread_local! {
    static PHASE_NS: std::cell::Cell<[f64; 4]> = const { std::cell::Cell::new([0.0; 4]) };
}

struct PhaseClock(Option<Instant>);

impl PhaseClock {
    fn start() -> Self {
        Self(
            CLOCKS_ON
                .load(std::sync::atomic::Ordering::Relaxed)
                .then(Instant::now),
        )
    }

    /// Charge the time since the last lap to `phase` and start the next one.
    fn lap(self, phase: Phase) -> Self {
        let Some(started) = self.0 else {
            return self;
        };

        let now = Instant::now();
        PHASE_NS.with(|totals| {
            let mut values = totals.get();
            values[phase as usize] += (now - started).as_nanos() as f64;
            totals.set(values);
        });
        Self(Some(now))
    }
}

/// A sheet with formula cells, its compiled formulas and their edges.
struct Workbook {
    sheet: Sheet,
    formulas: Formulas,
    readers: Readers,
    pass: Pass,
}

impl Workbook {
    fn new(sheet: Sheet, sources: &[(usize, usize, String)]) -> Self {
        let mut formulas = Formulas::default();
        for (row, col, source) in sources {
            let output = sheet.cell(*row, *col);
            if let Err(error) = add_formula(&mut formulas, sheet.rows, output, source) {
                panic!("floor formula {source:?} does not compile: {error}");
            }
        }
        let readers = Readers::build(&formulas, sheet.rows * sheet.columns.len());
        let pass = Pass::new(formulas.len());
        Self {
            sheet,
            formulas,
            readers,
            pass,
        }
    }

    fn recalculate(&mut self, seeds: &[u32], seed_formulas: std::ops::Range<u32>) {
        recalculate(
            &mut self.sheet,
            &self.formulas,
            &self.readers,
            &mut self.pass,
            seeds,
            seed_formulas,
        );
    }

    fn recalculate_all(&mut self) {
        let count = self.formulas.len() as u32;
        self.recalculate(&[], 0..count);
    }

    fn number(&self, row: usize, col: usize) -> f64 {
        self.sheet.columns[col].numbers[row]
    }

    fn set_number(&mut self, row: usize, col: usize, value: f64) {
        self.sheet.columns[col].numbers[row] = value;
        self.sheet.columns[col].kinds[row] = KIND_NUMBER;
    }
}

struct Options {
    minimum_ms: f64,
    filters: Vec<String>,
}

/// Time `run` like the gate: untimed `prepare` before each run, timed runs
/// until they add up to the minimum, then `check` on the last result.
fn measure<S>(
    options: &Options,
    key: &str,
    mut setup: impl FnMut() -> S,
    mut prepare: impl FnMut(&mut S),
    mut run: impl FnMut(&mut S),
    check: impl Fn(&S) -> Result<(), String>,
) {
    if !options.filters.is_empty()
        && !options
            .filters
            .iter()
            .any(|filter| key.contains(filter.as_str()))
    {
        return;
    }

    let mut state = setup();
    for _ in 0..3 {
        prepare(&mut state);
        run(&mut state);
    }
    if let Err(error) = check(&state) {
        eprintln!("{key}: {error}");
        std::process::exit(1);
    }

    let minimum_ns = options.minimum_ms * 1e6;
    let mut total_ns = 0.0;
    let mut runs = 0u64;

    while total_ns < minimum_ns {
        prepare(&mut state);
        let started = Instant::now();
        run(&mut state);
        total_ns += started.elapsed().as_nanos() as f64;
        runs += 1;
    }

    if let Err(error) = check(&state) {
        eprintln!("{key}: {error}");
        std::process::exit(1);
    }

    // An extra clocked pass splits the time across the recalculation phases;
    // the split is reported as shares of the unclocked mean.
    PHASE_NS.with(|totals| totals.set([0.0; 4]));
    CLOCKS_ON.store(true, std::sync::atomic::Ordering::Relaxed);
    for _ in 0..runs.min(1_000) {
        prepare(&mut state);
        run(&mut state);
    }
    CLOCKS_ON.store(false, std::sync::atomic::Ordering::Relaxed);

    let phases = PHASE_NS.with(|totals| totals.get());
    let clocked: f64 = phases.iter().sum();
    let mean = total_ns / runs as f64;
    let split: Vec<String> = PHASE_NAMES
        .iter()
        .zip(phases)
        .filter(|_| clocked > 0.0)
        .map(|(name, phase)| format!("{name}={:.0}", mean * phase / clocked))
        .collect();

    println!("{key}\t{runs}\t{mean:.0}\t{}", split.join(","));
}

fn expect(actual: f64, expected: f64) -> Result<(), String> {
    if actual == expected {
        Ok(())
    } else {
        Err(format!("expected {expected}, found {actual}"))
    }
}

fn independent_sources(count: usize) -> Vec<(usize, usize, String)> {
    (0..count)
        .map(|row| (row, 1, format!("=A{}+1", row + 1)))
        .collect()
}

fn fan_out_sources(count: usize) -> Vec<(usize, usize, String)> {
    (0..count)
        .map(|row| (row, 1, format!("=$A$1+{}", row + 1)))
        .collect()
}

fn floors_for_formula_passes(options: &Options) {
    for count in [1_000usize, 10_000, 100_000] {
        let sources = independent_sources(count);
        let base = || Sheet {
            rows: count,
            columns: vec![
                Column::numbers((0..count).map(|row| row as f64)),
                Column::new(count),
            ],
        };

        // Load: compile every source and store it, as setFormula does.
        measure(
            options,
            &format!("workload=independent-parse-load;size={count}"),
            || None::<Formulas>,
            |state| *state = None,
            |state| {
                let mut formulas = Formulas::default();
                for (row, col, source) in &sources {
                    if add_formula(&mut formulas, count, col * count + row, source).is_err() {
                        return;
                    }
                }
                *state = Some(black_box(formulas));
            },
            |state| match state {
                Some(formulas) if formulas.len() == count => Ok(()),
                _ => Err("load did not compile every formula".to_owned()),
            },
        );

        // First recalculation: build the reader edges, then evaluate every formula.
        measure(
            options,
            &format!("workload=independent-first-recompute;size={count}"),
            || {
                let mut formulas = Formulas::default();
                for (row, col, source) in &sources {
                    add_formula(&mut formulas, count, col * count + row, source).ok();
                }
                (base(), formulas, None::<(Readers, Pass)>)
            },
            |(sheet, _, edges)| {
                *edges = None;
                sheet.columns[1] = Column::new(count);
            },
            |(sheet, formulas, edges)| {
                let readers = Readers::build(formulas, sheet.rows * sheet.columns.len());
                let mut pass = Pass::new(formulas.len());
                recalculate(
                    sheet,
                    formulas,
                    &readers,
                    &mut pass,
                    &[],
                    0..formulas.len() as u32,
                );
                *edges = Some((readers, pass));
            },
            |(sheet, _, _)| expect(sheet.columns[1].numbers[count - 1], count as f64),
        );
    }

    for depth in [8usize, 16, 32, 64] {
        measure(
            options,
            &format!("workload=linear-chain;size={depth}"),
            || {
                let mut sheet = Sheet {
                    rows: depth,
                    columns: vec![Column::new(depth)],
                };
                sheet.columns[0].numbers[0] = 1.0;
                sheet.columns[0].kinds[0] = KIND_NUMBER;
                let sources: Vec<_> = (1..depth)
                    .map(|row| (row, 0, format!("=A{row}+1")))
                    .collect();
                Workbook::new(sheet, &sources)
            },
            |_| {},
            |workbook| workbook.recalculate_all(),
            |workbook| expect(workbook.number(depth - 1, 0), depth as f64),
        );
    }

    for (id, count) in [
        ("wide-fan-out-edit", 1_000usize),
        ("wide-fan-out-edit", 100_000),
        ("scalar-edit-affects-1000", 1_000),
        ("scalar-edit-affects-100000", 100_000),
        ("scalar-edit-affects-1", 1),
    ] {
        measure(
            options,
            &format!("workload={id};size={count}"),
            || {
                let mut sheet = Sheet {
                    rows: count,
                    columns: vec![Column::new(count), Column::new(count), Column::new(count)],
                };
                sheet.columns[0].numbers[0] = 1.0;
                sheet.columns[0].kinds[0] = KIND_NUMBER;
                let mut workbook = Workbook::new(sheet, &fan_out_sources(count));
                workbook.recalculate_all();
                workbook
            },
            |workbook| {
                workbook.set_number(0, 0, 1.0);
                workbook.recalculate(&[0], 0..0);
            },
            |workbook| {
                workbook.set_number(0, 0, 10.0);
                workbook.recalculate(&[0], 0..0);
            },
            |workbook| expect(workbook.number(count - 1, 1), (count + 10) as f64),
        );
    }

    let count = 100_000usize;
    measure(
        options,
        &format!("workload=formula-constant-edit;size={count}"),
        || {
            let sheet = Sheet {
                rows: count,
                columns: vec![
                    Column::numbers((0..count).map(|row| row as f64)),
                    Column::numbers((0..count).map(|_| 10.0)),
                    Column::new(count),
                ],
            };
            let sources: Vec<_> = (0..count)
                .map(|row| (row, 2, format!("=A{}+B{}+1", row + 1, row + 1)))
                .collect();
            let mut workbook = Workbook::new(sheet, &sources);
            workbook.recalculate_all();
            workbook
        },
        |workbook| {
            let start = workbook.formulas.op_starts[0] as usize;
            workbook.formulas.ops[start + 3] = Op::Number(1.0);
            workbook.recalculate(&[], 0..1);
        },
        |workbook| {
            // Recompile formula 0 from its new source in place (its op shape
            // is unchanged), then recalculate it and its readers.
            let mut compiled = Formulas::default();
            if add_formula(&mut compiled, count, 2 * count, "=A1+B1+2").is_err() {
                return;
            }
            let start = workbook.formulas.op_starts[0] as usize;
            workbook.formulas.ops[start..start + compiled.ops.len()].copy_from_slice(&compiled.ops);
            workbook.recalculate(&[], 0..1);
        },
        |workbook| expect(workbook.number(0, 2), 12.0),
    );
}

fn floors_for_ranges(options: &Options) {
    let count = 100_000usize;

    measure(
        options,
        &format!("workload=sum-multi-range;size={count}"),
        || {
            [
                Column::numbers((0..count).map(|row| row as f64)),
                Column::numbers((0..count).map(|_| 2.0)),
            ]
        },
        |_| {},
        |columns| {
            let mut total = 0.0;
            for column in columns.iter() {
                // Lanes let the compiler vectorise the kind check and the sum.
                let mut lanes = [0.0f64; 4];
                for (kinds, values) in column
                    .kinds
                    .chunks_exact(4)
                    .zip(column.numbers.chunks_exact(4))
                {
                    for lane in 0..4 {
                        lanes[lane] += if kinds[lane] == KIND_NUMBER {
                            values[lane]
                        } else {
                            0.0
                        };
                    }
                }
                total += lanes.iter().sum::<f64>();
            }
            black_box(total);
        },
        |columns| {
            let total: f64 = columns
                .iter()
                .flat_map(|column| column.numbers.iter())
                .sum();
            expect(total, (count * (count - 1) / 2 + count * 2) as f64)
        },
    );

    let threshold = (count / 2) as f64;
    measure(
        options,
        &format!("workload=countif-100k;size={count}"),
        || Column::numbers((0..count).map(|row| row as f64)),
        |_| {},
        |column| {
            // Branchless lanes let the compiler vectorise the kind check and comparison.
            let mut lanes = [0u32; 8];
            for (kinds, values) in column
                .kinds
                .chunks_exact(8)
                .zip(column.numbers.chunks_exact(8))
            {
                for lane in 0..8 {
                    lanes[lane] += u32::from(kinds[lane] == KIND_NUMBER)
                        & u32::from(values[lane] >= threshold);
                }
            }
            black_box(lanes.iter().sum::<u32>());
        },
        |_| Ok(()),
    );

    measure(
        options,
        &format!("workload=criteria-range-edit;size={count}"),
        || {
            [
                Column::numbers((0..count).map(|row| row as f64)),
                Column::numbers((0..count).map(|_| 1.0)),
            ]
        },
        |columns| columns[0].numbers[0] = 0.0,
        |columns| {
            columns[0].numbers[0] = count as f64;
            let mut lanes = [0.0f64; 4];
            let rows = columns[0]
                .numbers
                .chunks_exact(4)
                .zip(columns[0].kinds.chunks_exact(4))
                .zip(
                    columns[1]
                        .numbers
                        .chunks_exact(4)
                        .zip(columns[1].kinds.chunks_exact(4)),
                );
            for ((criteria, criteria_kinds), (sums, sum_kinds)) in rows {
                for lane in 0..4 {
                    let keep = (criteria_kinds[lane] == KIND_NUMBER)
                        & (criteria[lane] >= threshold)
                        & (sum_kinds[lane] == KIND_NUMBER);
                    lanes[lane] += if keep { sums[lane] } else { 0.0 };
                }
            }
            black_box(lanes.iter().sum::<f64>());
        },
        |_| Ok(()),
    );

    measure(
        options,
        &format!("workload=criteria-multi-range-edit;size={count}"),
        || {
            [
                Column::numbers((0..count).map(|row| row as f64)),
                Column::numbers((0..count).map(|row| (row % 2) as f64)),
                Column::numbers((0..count).map(|_| 2.0)),
            ]
        },
        |columns| columns[0].numbers[0] = 0.0,
        |columns| {
            columns[0].numbers[0] = count as f64;
            let (a, b, c) = (
                &columns[0].numbers,
                &columns[1].numbers,
                &columns[2].numbers,
            );
            let mut totals = [0.0f64; 4];
            let mut matches = [0u32; 4];
            for ((a, b), c) in a
                .chunks_exact(4)
                .zip(b.chunks_exact(4))
                .zip(c.chunks_exact(4))
            {
                for lane in 0..4 {
                    totals[lane] += if (a[lane] >= threshold) & (b[lane] == 1.0) {
                        c[lane]
                    } else {
                        0.0
                    };
                    matches[lane] += u32::from(a[lane] < threshold) & u32::from(b[lane] == 0.0);
                }
            }
            black_box(totals.iter().sum::<f64>() + f64::from(matches.iter().sum::<u32>()));
        },
        |_| Ok(()),
    );

    // Text cells hold interned ids; "keep" matches one id, resolved once per evaluation.
    let keep_id = 7.0;
    measure(
        options,
        &format!("workload=sumifs-3-criteria;size={count}"),
        || {
            let mut text =
                Column::numbers((0..count).map(|row| if row % 3 == 0 { keep_id } else { 8.0 }));
            text.kinds.fill(KIND_TEXT);
            [
                Column::numbers((0..count).map(|row| row as f64)),
                Column::numbers((0..count).map(|row| (row % 2) as f64)),
                text,
                Column::numbers((0..count).map(|row| (row + 1) as f64)),
            ]
        },
        |_| {},
        |columns| {
            let mut lanes = [0.0f64; 4];
            let rows = columns[0]
                .numbers
                .chunks_exact(4)
                .zip(columns[1].numbers.chunks_exact(4))
                .zip(
                    columns[2]
                        .numbers
                        .chunks_exact(4)
                        .zip(columns[2].kinds.chunks_exact(4)),
                )
                .zip(columns[3].numbers.chunks_exact(4));
            for (((a, b), (text, text_kinds)), sums) in rows {
                for lane in 0..4 {
                    let keep = (a[lane] >= threshold)
                        & (b[lane] == 1.0)
                        & (text_kinds[lane] == KIND_TEXT)
                        & (text[lane] == keep_id);
                    lanes[lane] += if keep { sums[lane] } else { 0.0 };
                }
            }
            black_box(lanes.iter().sum::<f64>());
        },
        |_| Ok(()),
    );

    measure(
        options,
        &format!("workload=sumproduct-vector-edit;size={count}"),
        || {
            [
                Column::numbers((0..count).map(|row| ((row % 10) + 1) as f64)),
                Column::numbers((0..count).map(|_| 2.0)),
            ]
        },
        |columns| columns[0].numbers[0] = 1.0,
        |columns| {
            columns[0].numbers[0] = 3.0;
            let mut lanes = [0.0f64; 4];
            for (left, right) in columns[0]
                .numbers
                .chunks_exact(4)
                .zip(columns[1].numbers.chunks_exact(4))
            {
                for lane in 0..4 {
                    lanes[lane] += left[lane] * right[lane];
                }
            }
            black_box(lanes.iter().sum::<f64>());
        },
        |_| Ok(()),
    );

    measure(
        options,
        &format!("workload=lookup-range-edit;size={count}"),
        || {
            [
                Column::numbers((0..count).map(|row| row as f64)),
                Column::numbers((0..count).map(|row| (row * 2) as f64)),
            ]
        },
        |_| {},
        |columns| {
            let key = (count - 1) as f64;
            let found = columns[0]
                .numbers
                .iter()
                .zip(&columns[0].kinds)
                .position(|(&value, &kind)| kind == KIND_NUMBER && value == key);
            black_box(found.map(|row| columns[1].numbers[row]));
        },
        |_| Ok(()),
    );

    measure(
        options,
        &format!("workload=percentile-covariance;size={count}"),
        || {
            [
                Column::numbers((0..count).map(|row| (row + 1) as f64)),
                Column::numbers((0..count).map(|row| (2 * (row + 1) + 3) as f64)),
            ]
        },
        |_| {},
        |columns| {
            // PERCENTILE.INC needs a sorted copy; COVARIANCE.P two passes.
            let mut sorted = columns[0].numbers.clone();
            sorted.sort_unstable_by(f64::total_cmp);
            let rank = 0.9 * (count - 1) as f64;
            let low = rank.floor() as usize;
            let percentile = sorted[low]
                + (rank - low as f64) * (sorted[(low + 1).min(count - 1)] - sorted[low]);
            let mean_a = columns[0].numbers.iter().sum::<f64>() / count as f64;
            let mean_b = columns[1].numbers.iter().sum::<f64>() / count as f64;
            let covariance = columns[0]
                .numbers
                .iter()
                .zip(&columns[1].numbers)
                .map(|(a, b)| (a - mean_a) * (b - mean_b))
                .sum::<f64>()
                / count as f64;
            black_box(percentile + covariance);
        },
        |_| Ok(()),
    );
}

fn floors_for_lookups(options: &Options) {
    let formulas = 1_000usize;
    let rows = formulas * 10;
    let keys = Column::numbers((0..rows).map(|row| (row + 1) as f64));
    let results = Column::numbers((0..rows).map(|row| ((row + 1) * 2) as f64));

    for (id, key, sorted) in [
        ("vlookup-many", 5.0, false),
        ("xlookup-many", 5.0, false),
        ("vlookup-many-sorted", 5.5, true),
        ("xlookup-many-sorted", 5.5, true),
    ] {
        measure(
            options,
            &format!("workload={id};size={formulas}"),
            || vec![0.0f64; formulas],
            |_| {},
            |outputs| {
                for output in outputs.iter_mut() {
                    let row = if sorted {
                        keys.numbers
                            .partition_point(|&value| value <= key)
                            .checked_sub(1)
                    } else {
                        keys.numbers
                            .iter()
                            .zip(&keys.kinds)
                            .position(|(&value, &kind)| kind == KIND_NUMBER && value == key)
                    };
                    *output = row.map_or(f64::NAN, |row| results.numbers[row]);
                }
                black_box(outputs);
            },
            |outputs| expect(outputs[formulas - 1], key.floor() * 2.0),
        );
    }

    let text_keys: Vec<String> = (0..rows).map(|row| format!("ITEM{row:06}")).collect();
    let query = "ItEm000012";
    measure(
        options,
        &format!("workload=text-lookup-many;size={formulas}"),
        || vec![0.0f64; formulas],
        |_| {},
        |outputs| {
            for output in outputs.iter_mut() {
                let row = text_keys
                    .iter()
                    .position(|key| key.eq_ignore_ascii_case(query));
                *output = row.map_or(f64::NAN, |row| results.numbers[row]);
            }
            black_box(outputs);
        },
        |outputs| expect(outputs[0], 26.0),
    );

    let between = "ItEm0000115";
    measure(
        options,
        &format!("workload=text-lookup-many-sorted;size={formulas}"),
        || vec![0.0f64; formulas],
        |_| {},
        |outputs| {
            for output in outputs.iter_mut() {
                let row = text_keys
                    .partition_point(|key| {
                        key.bytes()
                            .map(|byte| byte.to_ascii_lowercase())
                            .cmp(between.bytes().map(|byte| byte.to_ascii_lowercase()))
                            != std::cmp::Ordering::Greater
                    })
                    .checked_sub(1);
                *output = row.map_or(f64::NAN, |row| results.numbers[row]);
            }
            black_box(outputs);
        },
        |outputs| expect(outputs[0], 24.0),
    );
}

/// Days from 1899-12-30 (the spreadsheet serial epoch) to `year-month-day`.
fn date_serial(year: i64, month: i64, day: i64) -> i64 {
    let (year, month) = if month <= 2 {
        (year - 1, month + 12)
    } else {
        (year, month)
    };
    let days = 365 * year + year / 4 - year / 100 + year / 400 + (153 * (month - 3) + 2) / 5 + day;
    days - 693_899 - 1
}

fn floors_for_text(options: &Options) {
    let formulas = 1_000usize;
    measure(
        options,
        &format!("workload=unicode-text-date-edit;size={formulas}"),
        || (String::from("café😀-2024-02-29"), vec![0.0f64; formulas]),
        |(text, _)| *text = String::from("café😀-2024-02-29"),
        |(text, outputs)| {
            *text = String::from("naïv😀-2024-03-01");
            for output in outputs.iter_mut() {
                // UNICODE(MID($A$1,5,1)) + DATEVALUE(RIGHT($A$1,10))
                let code = text.chars().nth(4).map_or(0, |character| character as u32);
                let count = text.chars().count();
                let right: String = text.chars().skip(count.saturating_sub(10)).collect();
                let parts: Vec<i64> = right
                    .split('-')
                    .filter_map(|part| part.parse().ok())
                    .collect();
                let serial = match parts[..] {
                    [year, month, day] => date_serial(year, month, day),
                    _ => 0,
                };
                *output = f64::from(code) + serial as f64;
            }
            black_box(outputs);
        },
        |(_, outputs)| expect(outputs[0], 173_864.0),
    );
}

fn main() {
    let mut options = Options {
        minimum_ms: 300.0,
        filters: Vec::new(),
    };
    let mut arguments = std::env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match (argument.as_str(), arguments.next()) {
            ("--min-ms", Some(value)) => {
                options.minimum_ms = value.parse().unwrap_or(options.minimum_ms)
            }
            ("--filter", Some(value)) => options.filters.push(value),
            _ => {
                eprintln!("usage: formula-floor [--min-ms <ms>] [--filter <text>]...");
                std::process::exit(2);
            }
        }
    }

    println!("key\truns\tns_per_run\tphase_ns");
    floors_for_formula_passes(&options);
    floors_for_ranges(&options);
    floors_for_lookups(&options);
    floors_for_text(&options);
}
