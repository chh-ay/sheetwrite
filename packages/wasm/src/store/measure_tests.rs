//! Measures in model pivots against an independently flattened oracle: the
//! test selects each cell's rows itself and evaluates the same formula as an
//! ordinary cell formula over a scratch range holding only those rows.

use super::*;
use crate::eval::settled_cell_value;
use crate::types::{FormulaError, Value};

const ROWS: usize = 72;
const REGION: usize = 0;
const SEGMENT: usize = 1;
const QUARTER: usize = 2;
const CHANNEL: usize = 3;
const AMOUNT: usize = 4;
const QTY: usize = 5;
const COLUMN_IDS: [&str; 6] = ["region", "segment", "quarter", "channel", "amount", "qty"];
const REGIONS: [&str; 3] = ["North", "South", "East"];
const SEGMENTS: [&str; 2] = ["Retail", "Online"];
/// Channels a report filter keeps; channel 2 rows, including the error
/// row, stay outside every cell.
const KEPT_CHANNELS: [f64; 2] = [0.0, 1.0];
const ERROR_ROW: usize = 7;

const MODEL_SOURCE: f64 = 3.0;
const MEASURE_VALUE: f64 = 7.0;
const FILTER_NUMBER: f64 = 1.0;
const NO_NAME: f64 = -1.0;
const ROW_TOTALS: u32 = 1;
const COLUMN_TOTALS: u32 = 1 << 1;
const SUBTOTALS: u32 = 1 << 2;
const TABULAR: u32 = 1 << 3;

/// Measure formulas over the model, with the scratch-range form the oracle uses.
const MEASURES: [(&str, &str); 5] = [
    (
        "=SUM(orders[amount])/SUM(orders[qty])",
        "=SUM(A1:A{n})/SUM(B1:B{n})",
    ),
    (
        "=MAX(orders[amount])-MIN(orders[amount])",
        "=MAX(A1:A{n})-MIN(A1:A{n})",
    ),
    (
        "=SUMPRODUCT(orders[amount],orders[qty])",
        "=SUMPRODUCT(A1:A{n},B1:B{n})",
    ),
    ("=COUNTA(orders[amount])", "=COUNTA(A1:A{n})"),
    ("=AVERAGE(orders[amount])", "=AVERAGE(A1:A{n})"),
];

#[derive(Clone)]
enum Amount {
    Number(f64),
    Text,
    Blank,
    Error,
}

struct Order {
    region: usize,
    segment: usize,
    quarter: f64,
    channel: f64,
    amount: Amount,
    qty: f64,
}

struct MeasureFixture {
    store: CellStore,
    orders: usize,
    output: usize,
    scratch: usize,
    data: Vec<Order>,
    scratch_rows: usize,
}

/// One measure cell of a pivot output and the labels that select its rows.
struct LabeledCell {
    slot: usize,
    row_labels: Vec<Value>,
    col_labels: Vec<Value>,
    actual: Value,
    at: (usize, usize),
}

/// A small deterministic generator, so failures reproduce.
struct Lcg(u64);

impl Lcg {
    fn next(&mut self, bound: usize) -> usize {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        ((self.0 >> 33) % bound as u64) as usize
    }
}

impl MeasureFixture {
    fn new(seed: u64) -> Self {
        let mut store = CellStore::new();
        let orders = store.add_sheet(COLUMN_IDS.len(), ROWS + 1);
        let output = store.add_sheet(40, 80);
        let scratch = store.add_sheet(3, ROWS + 1);
        let ids: Vec<String> = COLUMN_IDS.map(String::from).to_vec();
        assert!(store.set_table(
            "orders",
            "orders",
            orders,
            0,
            0,
            ROWS,
            COLUMN_IDS.len() - 1,
            true,
            false,
            ids.clone(),
            ids
        ));
        for (col, header) in COLUMN_IDS.iter().enumerate() {
            store.set_string(orders, 0, col, header, 0);
        }

        let mut random = Lcg(seed);
        let data = (0..ROWS)
            .map(|row| Order {
                region: random.next(REGIONS.len()),
                segment: random.next(SEGMENTS.len()),
                quarter: (random.next(4) + 1) as f64,
                channel: if row == ERROR_ROW {
                    2.0
                } else {
                    random.next(3) as f64
                },
                amount: match (row == ERROR_ROW, random.next(10)) {
                    (true, _) => Amount::Error,
                    (false, 0) => Amount::Blank,
                    (false, 1) => Amount::Text,
                    (false, value) => Amount::Number((value * 7 + row % 5) as f64),
                },
                qty: (random.next(5) + 1) as f64,
            })
            .collect();

        let mut fixture = Self {
            store,
            orders,
            output,
            scratch,
            data,
            scratch_rows: 0,
        };
        for row in 0..ROWS {
            fixture.write_order(row);
        }
        fixture.set_measures(&MEASURES.map(|(formula, _)| formula));
        fixture
    }

    fn write_order(&mut self, row: usize) {
        let order = &self.data[row];
        let (sheet, cell_row) = (self.orders, row + 1);
        self.store
            .set_string(sheet, cell_row, REGION, REGIONS[order.region], 0);
        self.store
            .set_string(sheet, cell_row, SEGMENT, SEGMENTS[order.segment], 0);
        self.store
            .set_number(sheet, cell_row, QUARTER, order.quarter, 0);
        self.store
            .set_number(sheet, cell_row, CHANNEL, order.channel, 0);
        self.store.set_number(sheet, cell_row, QTY, order.qty, 0);
        let amount = order.amount.clone();
        write_amount(&mut self.store, sheet, cell_row, AMOUNT, &amount);
    }

    /// Sends measures `m0`, `m1`, … in the `setRelationships` measure record
    /// layout: `[id, homeTable, formula, "", name]`.
    fn set_measures(&mut self, formulas: &[&str]) {
        let strings = formulas
            .iter()
            .enumerate()
            .flat_map(|(index, formula)| {
                [
                    format!("m{index}"),
                    "orders".into(),
                    (*formula).into(),
                    String::new(),
                    format!("Measure {index}"),
                ]
            })
            .collect();
        assert!(self.store.set_relationships(strings));
    }

    /// Model pivot over `orders` with every measure as a value field.
    fn install(&mut self, rows: &[usize], columns: &[usize], flags: u32) {
        let mut strings: Vec<String> = vec!["pivot".into(), "orders".into()];
        strings.extend(COLUMN_IDS.map(String::from));
        let measure_strings = strings.len();
        strings.extend((0..MEASURES.len()).map(|index| format!("m{index}")));

        let mut numbers = vec![0.0, MODEL_SOURCE, 1.0, COLUMN_IDS.len() as f64];
        for column in 0..COLUMN_IDS.len() {
            numbers.extend([1.0, (2 + column) as f64]);
        }
        numbers.extend([0.0, 0.0]);
        for fields in [rows, columns] {
            numbers.push(fields.len() as f64);
            numbers.extend(fields.iter().map(|&field| field as f64));
        }
        numbers.push(MEASURES.len() as f64);
        for index in 0..MEASURES.len() {
            numbers.extend([(measure_strings + index) as f64, MEASURE_VALUE, NO_NAME]);
        }
        numbers.extend([1.0, CHANNEL as f64, KEPT_CHANNELS.len() as f64]);
        for channel in KEPT_CHANNELS {
            numbers.extend([FILTER_NUMBER, channel]);
        }
        numbers.extend([0.0, f64::from(flags)]);

        assert!(self.store.set_pivots(self.output, &numbers, strings));
        self.store.recompute_changed();
    }

    /// Every measure cell equals the same formula over the flattened rows
    /// that the cell's labels select.
    fn assert_matches_flattened(&mut self, rows: &[usize], columns: &[usize], flags: u32) {
        let cells = self.measure_cells(rows, columns, flags);
        for cell in &cells {
            let selected = self.select(rows, &cell.row_labels, columns, &cell.col_labels);
            let expected = if selected.is_empty() {
                Value::Blank
            } else {
                self.oracle(MEASURES[cell.slot].1, &selected)
            };
            assert_eq!(
                cell.actual, expected,
                "measure {} at {:?}",
                cell.slot, cell.at
            );
        }
        assert!(
            cells.len() > MEASURES.len() * 4,
            "the pivot has measure cells"
        );
    }

    /// Each measure cell of the output with the label paths of its row and
    /// column.
    fn measure_cells(&self, rows: &[usize], columns: &[usize], flags: u32) -> Vec<LabeledCell> {
        let status = self.store.pivot_status(self.output);
        assert_eq!(status[0], 0, "the pivot shows output");
        let (out_rows, out_cols) = (status[3] as usize, status[4] as usize);
        let label_cols = if flags & TABULAR != 0 { rows.len() } else { 1 };
        let header_rows = columns.len() + 1;
        let mut cells = Vec::new();
        let mut outer = Value::Blank;

        for out_row in header_rows..out_rows {
            let row_labels = if flags & TABULAR != 0 {
                (0..label_cols)
                    .map(|col| self.output_value(out_row, col))
                    .collect()
            } else {
                compact_path(rows, self.output_value(out_row, 0), &mut outer)
            };
            for out_col in label_cols..out_cols {
                let slot = (out_col - label_cols) % MEASURES.len();
                let col_labels = (0..columns.len())
                    .map(|row| self.output_value(row, out_col - slot))
                    .collect();
                cells.push(LabeledCell {
                    slot,
                    row_labels: row_labels.clone(),
                    col_labels,
                    actual: self.output_value(out_row, out_col),
                    at: (out_row, out_col),
                });
            }
        }
        cells
    }

    fn output_value(&self, row: usize, col: usize) -> Value {
        settled(&self.store, self.output, row, col)
    }

    /// Rows passing the report filter whose fields equal the labels, level
    /// by level, until a total label or a blank label ends the path.
    fn select(
        &self,
        rows: &[usize],
        row_labels: &[Value],
        columns: &[usize],
        col_labels: &[Value],
    ) -> Vec<usize> {
        (0..ROWS)
            .filter(|&row| KEPT_CHANNELS.contains(&self.data[row].channel))
            .filter(|&row| {
                matches_path(&self.data[row], rows, row_labels)
                    && matches_path(&self.data[row], columns, col_labels)
            })
            .collect()
    }

    fn oracle(&mut self, template: &str, selected: &[usize]) -> Value {
        for row in 0..self.scratch_rows.max(selected.len()) {
            for col in 0..2 {
                self.store.clear_cell(self.scratch, row, col, 0);
            }
        }
        for (target, &row) in selected.iter().enumerate() {
            let amount = self.data[row].amount.clone();
            write_amount(&mut self.store, self.scratch, target, 0, &amount);
            self.store
                .set_number(self.scratch, target, 1, self.data[row].qty, 0);
        }
        self.scratch_rows = selected.len();

        let formula = template.replace("{n}", &selected.len().to_string());
        self.store.set_formula(self.scratch, 0, 2, &formula, 0);
        self.store.recompute(self.scratch);
        settled(&self.store, self.scratch, 0, 2)
    }
}

/// The settled value of a cell: a formula's result or a pivot's output.
fn settled(store: &CellStore, sheet: usize, row: usize, col: usize) -> Value {
    settled_cell_value(
        &store.sheets[sheet],
        &store.strings,
        row,
        col,
        &store.formula_slots,
    )
}

fn write_amount(store: &mut CellStore, sheet: usize, row: usize, col: usize, amount: &Amount) {
    match amount {
        Amount::Number(number) => store.set_number(sheet, row, col, *number, 0),
        Amount::Text => store.set_string(sheet, row, col, "n/a", 0),
        Amount::Blank => store.clear_cell(sheet, row, col, 0),
        Amount::Error => {
            store.set_formula(sheet, row, col, "=1/0", 0);
        }
    }
}

fn field_value(order: &Order, field: usize) -> Value {
    match field {
        REGION => Value::text(REGIONS[order.region]),
        SEGMENT => Value::text(SEGMENTS[order.segment]),
        QUARTER => Value::Number(order.quarter),
        _ => Value::Number(order.channel),
    }
}

fn matches_path(order: &Order, fields: &[usize], labels: &[Value]) -> bool {
    for (&field, label) in fields.iter().zip(labels) {
        if *label == Value::Blank || *label == Value::text("Total") {
            return true;
        }
        if field_value(order, field) != *label {
            return false;
        }
    }
    true
}

/// The full label path of a compact row. Compact rows name only their own
/// level and list each outer group before its children, so the last outer
/// label is the parent of an inner one.
fn compact_path(rows: &[usize], label: Value, outer: &mut Value) -> Vec<Value> {
    let is_outer = REGIONS.iter().any(|region| Value::text(*region) == label);
    if rows.len() == 1 || is_outer || label == Value::text("Total") {
        *outer = label.clone();
        let mut path = vec![label];
        path.resize(rows.len(), Value::Blank);
        return path;
    }
    vec![outer.clone(), label]
}

#[test]
fn measures_equal_their_formula_over_each_cells_flattened_rows() {
    let layouts: [(&[usize], &[usize], u32); 3] = [
        (&[REGION], &[QUARTER], ROW_TOTALS | COLUMN_TOTALS),
        (
            &[REGION, SEGMENT],
            &[QUARTER],
            ROW_TOTALS | COLUMN_TOTALS | SUBTOTALS | TABULAR,
        ),
        (&[REGION, SEGMENT], &[], ROW_TOTALS | SUBTOTALS),
    ];
    for seed in [3, 29] {
        let mut fixture = MeasureFixture::new(seed);
        for (rows, columns, flags) in layouts {
            fixture.install(rows, columns, flags);
            fixture.assert_matches_flattened(rows, columns, flags);
        }
    }
}

#[test]
fn measure_errors_show_in_their_cells_and_a_missing_measure_at_the_anchor() {
    let mut fixture = MeasureFixture::new(5);
    fixture.set_measures(&[
        "=SUM(orders[amount]",
        "=SUM(orders[missing])",
        "=SUM(A1:A3)",
        "=SUM(orders[amount])",
        "=SUM(orders[qty])",
    ]);
    fixture.install(&[REGION], &[], ROW_TOTALS);
    assert_eq!(
        settled(&fixture.store, fixture.output, 0, 1),
        Value::text("Measure 0"),
        "the measure name heads its value column",
    );
    let errors: Vec<Value> = (1..=3)
        .map(|col| settled(&fixture.store, fixture.output, 2, col))
        .collect();
    assert_eq!(
        errors,
        [FormulaError::Name, FormulaError::Ref, FormulaError::Value]
            .map(Value::Error)
            .to_vec(),
    );

    fixture.set_measures(&["=SUM(orders[amount])"]);
    fixture.store.recompute_changed();
    assert_ne!(fixture.store.pivot_status(fixture.output)[0], 0);
}

/// Rows passing the report filter, unless `removed` holds its field, whose
/// fields equal the labels at every level of the paths except the
/// `removed` fields, until a total or blank label ends a path.
fn select_without(
    data: &[Order],
    paths: [(&[usize], &[Value]); 2],
    removed: &[usize],
) -> Vec<usize> {
    (0..ROWS)
        .filter(|&row| removed.contains(&CHANNEL) || KEPT_CHANNELS.contains(&data[row].channel))
        .filter(|&row| {
            paths.iter().all(|(fields, labels)| {
                fields
                    .iter()
                    .zip(labels.iter())
                    .take_while(|(_, label)| {
                        **label != Value::Blank && **label != Value::text("Total")
                    })
                    .all(|(&field, label)| {
                        removed.contains(&field) || field_value(&data[row], field) == *label
                    })
            })
        })
        .collect()
}

/// Errors inside `CALCULATE` reach the enclosing expression, so `IFERROR`
/// and `ISERROR` see them as in a cell formula: the error row of the base
/// table, which `ALL` of the channel brings back, and a division by zero.
const CALCULATE_ERROR_MEASURES: [&str; 5] = [
    "=CALCULATE(SUM(orders[amount]), ALL(orders[channel]))",
    "=IFERROR(CALCULATE(SUM(orders[amount]), ALL(orders[channel])), -1)",
    "=ISERROR(CALCULATE(SUM(orders[amount]), ALL(orders[channel])))",
    "=IFERROR(CALCULATE(SUM(orders[qty])/0, ALL(orders[region])), -2)",
    "=ISERROR(CALCULATE(SUM(orders[qty])/0, ALL(orders[region])))",
];

#[test]
fn errors_inside_calculate_reach_iferror_and_iserror() {
    let (rows, columns, flags): (&[usize], &[usize], u32) =
        (&[REGION], &[QUARTER], ROW_TOTALS | COLUMN_TOTALS);
    let mut fixture = MeasureFixture::new(23);
    fixture.set_measures(&CALCULATE_ERROR_MEASURES);
    fixture.install(rows, columns, flags);
    let mut errors = 0;

    for cell in fixture.measure_cells(rows, columns, flags) {
        let paths: [(&[usize], &[Value]); 2] =
            [(rows, &cell.row_labels), (columns, &cell.col_labels)];
        let context = select_without(&fixture.data, paths, &[CHANNEL]);
        let amount_error = context.contains(&ERROR_ROW);
        let amount: f64 = context
            .iter()
            .filter_map(|&row| match fixture.data[row].amount {
                Amount::Number(number) => Some(number),
                _ => None,
            })
            .sum();
        let expected = match (cell.slot, amount_error) {
            (0, true) => Value::Error(FormulaError::DivZero),
            (0, false) => Value::Number(amount),
            (1, true) => Value::Number(-1.0),
            (1, false) => Value::Number(amount),
            (2, error) => Value::Bool(error),
            (3, _) => Value::Number(-2.0),
            _ => Value::Bool(true),
        };
        errors += usize::from(amount_error && cell.slot == 0);
        assert_eq!(
            cell.actual, expected,
            "measure {} at {:?}",
            cell.slot, cell.at
        );
    }
    assert!(errors > 0, "some cells see the error row");
}
