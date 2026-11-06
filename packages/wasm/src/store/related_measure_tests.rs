//! Measures over related tables and measure references in model pivots.
//! The expected values are computed here from the fixture data: a customer
//! row is visible in a cell when its region matches the cell's region label
//! and passes the region filter; the month axis and the month filter are on
//! the many side, so they put no condition on customers.

use super::*;
use crate::eval::settled_cell_value;
use crate::types::{FormulaError, Value};

const ORDERS: usize = 60;
const MONTHS: f64 = 4.0;
const KEPT_REGIONS: [&str; 2] = ["North", "South"];
const KEPT_MONTHS: [f64; 3] = [1.0, 2.0, 3.0];

const MODEL_SOURCE: f64 = 3.0;
const MEASURE_VALUE: f64 = 7.0;
const FILTER_NUMBER: f64 = 1.0;
const FILTER_TEXT: f64 = 2.0;
const NO_NAME: f64 = -1.0;
const ROW_TOTALS: u32 = 1;
const COLUMN_TOTALS: u32 = 1 << 1;

/// Measures as `(id, name, formula)`, in pivot value order.
const MEASURES: [(&str, &str, &str); 6] = [
    ("credit", "Credit", "=SUM(customers[credit])"),
    ("count", "Customers", "=COUNTA(customers[id])"),
    ("share", "Share", "=SUM(orders[amount])/[Credit]"),
    ("loop-a", "Loop A", "=[Loop B]+1"),
    ("loop-b", "Loop B", "=[loop a]+1"),
    ("unknown", "Unknown", "=[Nothing]"),
];
const CREDIT: usize = 0;
const COUNT: usize = 1;
const SHARE: usize = 2;
const LOOP: usize = 3;
const UNKNOWN: usize = 5;
/// Pivot values: every measure except `Loop B`.
const VALUES: [usize; 5] = [0, 1, 2, 3, 5];

struct Customer {
    id: String,
    region: &'static str,
    credit: f64,
}

struct Order {
    customer: String,
    month: f64,
    amount: f64,
}

struct Fixture {
    store: CellStore,
    customers_sheet: usize,
    output: usize,
    /// Months down and regions across, instead of regions down.
    transposed: bool,
    customers: Vec<Customer>,
    orders: Vec<Order>,
}

impl Fixture {
    fn new() -> Self {
        let mut store = CellStore::new();
        let orders_sheet = store.add_sheet(3, ORDERS + 1);
        let customers_sheet = store.add_sheet(3, 11);
        let output = store.add_sheet(40, 40);
        let regions = [
            "North", "South", "East", "North", "", "South", "East", "North", "South", "",
        ];
        let customers: Vec<Customer> = regions
            .iter()
            .enumerate()
            .map(|(index, region)| Customer {
                id: format!("C{index}"),
                region,
                credit: (index * 10 + 5) as f64,
            })
            .collect();
        // Keys c0..c11: C10 and C11 match no customer; every seventh is blank.
        let orders: Vec<Order> = (0..ORDERS)
            .map(|row| Order {
                customer: if row % 7 == 0 {
                    String::new()
                } else {
                    format!("c{}", row * 5 % 12)
                },
                month: (row % MONTHS as usize + 1) as f64,
                amount: (row * 3 % 17 + 1) as f64,
            })
            .collect();

        for (table, sheet, rows, ids) in [
            (
                "orders",
                orders_sheet,
                ORDERS,
                ["customer", "month", "amount"],
            ),
            (
                "customers",
                customers_sheet,
                customers.len(),
                ["id", "region", "credit"],
            ),
        ] {
            let names: Vec<String> = ids.map(String::from).to_vec();
            assert!(store.set_table(
                table,
                table,
                sheet,
                0,
                0,
                rows,
                2,
                true,
                false,
                names.clone(),
                names
            ));
            for (col, id) in ids.iter().enumerate() {
                store.set_string(sheet, 0, col, id, 0);
            }
        }
        for (row, order) in orders.iter().enumerate() {
            if !order.customer.is_empty() {
                store.set_string(orders_sheet, row + 1, 0, &order.customer, 0);
            }
            store.set_number(orders_sheet, row + 1, 1, order.month, 0);
            store.set_number(orders_sheet, row + 1, 2, order.amount, 0);
        }
        let mut fixture = Self {
            store,
            customers_sheet,
            output,
            transposed: false,
            customers,
            orders,
        };
        for row in 0..fixture.customers.len() {
            fixture.write_customer(row);
        }

        let mut model = vec!["r1", "orders", "customer", "customers", "id"]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>();
        for (id, name, formula) in MEASURES {
            model.extend([id, "customers", formula, "", name].map(String::from));
        }
        assert!(fixture.store.set_relationships(model));
        fixture.install();
        fixture
    }

    fn write_customer(&mut self, row: usize) {
        let customer = &self.customers[row];
        let sheet = self.customers_sheet;
        self.store.set_string(sheet, row + 1, 0, &customer.id, 0);
        if customer.region.is_empty() {
            self.store.clear_cell(sheet, row + 1, 1, 0);
        } else {
            self.store.set_string(sheet, row + 1, 1, customer.region, 0);
        }
        self.store.set_number(sheet, row + 1, 2, customer.credit, 0);
    }

    /// Regions down and months across (or transposed), with a region and a
    /// month filter.
    fn install(&mut self) {
        let mut strings: Vec<String> = ["pivot", "orders", "customers", "region", "month"]
            .map(String::from)
            .to_vec();
        let measure_strings = strings.len();
        strings.extend(VALUES.map(|index| MEASURES[index].0.to_string()));
        strings.extend(KEPT_REGIONS.map(String::from));
        let region_strings = measure_strings + VALUES.len();

        // Fields: 0 customers.region, 1 orders.month.
        let mut numbers = vec![0.0, MODEL_SOURCE, 1.0, 2.0, 2.0, 3.0, 1.0, 4.0];
        let (down, across) = if self.transposed {
            (1.0, 0.0)
        } else {
            (0.0, 1.0)
        };
        numbers.extend([0.0, 0.0, 1.0, down, 1.0, across]);
        numbers.push(VALUES.len() as f64);
        for index in 0..VALUES.len() {
            numbers.extend([(measure_strings + index) as f64, MEASURE_VALUE, NO_NAME]);
        }
        numbers.extend([2.0, 0.0, KEPT_REGIONS.len() as f64]);
        for index in 0..KEPT_REGIONS.len() {
            numbers.extend([FILTER_TEXT, (region_strings + index) as f64]);
        }
        numbers.extend([1.0, KEPT_MONTHS.len() as f64]);
        for month in KEPT_MONTHS {
            numbers.extend([FILTER_NUMBER, month]);
        }
        numbers.extend([0.0, f64::from(ROW_TOTALS | COLUMN_TOTALS)]);

        assert!(self.store.set_pivots(self.output, &numbers, strings));
        self.store.recompute_changed();
    }

    fn region_of(&self, key: &str) -> &'static str {
        self.customers
            .iter()
            .find(|customer| customer.id.eq_ignore_ascii_case(key))
            .map_or("", |customer| customer.region)
    }

    fn expected(&self, measure: usize, region: &Value, month: &Value) -> Value {
        let total = Value::text("Total");
        let in_region = |candidate: &str| {
            KEPT_REGIONS.contains(&candidate)
                && (*region == total || Value::text(candidate) == *region)
        };
        let visible: Vec<&Customer> = self
            .customers
            .iter()
            .filter(|customer| in_region(customer.region))
            .collect();
        let credit: f64 = visible.iter().map(|customer| customer.credit).sum();
        match measure {
            CREDIT => Value::Number(credit),
            COUNT => Value::Number(visible.len() as f64),
            SHARE => {
                let amounts: Vec<f64> = self
                    .orders
                    .iter()
                    .filter(|order| {
                        KEPT_MONTHS.contains(&order.month)
                            && (*month == total || Value::Number(order.month) == *month)
                            && in_region(self.region_of(&order.customer))
                    })
                    .map(|order| order.amount)
                    .collect();
                if amounts.is_empty() {
                    Value::Blank
                } else {
                    Value::Number(amounts.iter().sum::<f64>() / credit)
                }
            }
            LOOP => Value::Error(FormulaError::Value),
            UNKNOWN => Value::Error(FormulaError::Ref),
            _ => unreachable!("no other measure is a pivot value"),
        }
    }

    fn assert_matches(&self) {
        let status = self.store.pivot_status(self.output);
        assert_eq!(status[0], 0, "the pivot shows output");
        let (rows, cols) = (status[3] as usize, status[4] as usize);
        let mut checked = 0;
        for row in 2..rows {
            let row_label = settled(&self.store, self.output, row, 0);
            for col in 1..cols {
                let slot = (col - 1) % VALUES.len();
                let col_label = settled(&self.store, self.output, 0, col - slot);
                let (region, month) = if self.transposed {
                    (&col_label, &row_label)
                } else {
                    (&row_label, &col_label)
                };
                let actual = settled(&self.store, self.output, row, col);
                let expected = self.expected(VALUES[slot], region, month);
                match (&actual, &expected) {
                    (Value::Number(actual), Value::Number(expected)) => {
                        assert!(
                            (actual - expected).abs() < 1e-9,
                            "{region:?} {month:?} slot {slot}: {actual} vs {expected}"
                        );
                    }
                    _ => assert_eq!(actual, expected, "{region:?} {month:?} slot {slot}"),
                }
                checked += 1;
            }
        }
        assert!(checked >= VALUES.len() * 6, "the pivot has measure cells");
    }
}

fn settled(store: &CellStore, sheet: usize, row: usize, col: usize) -> Value {
    settled_cell_value(
        &store.sheets[sheet],
        &store.strings,
        row,
        col,
        &store.formula_slots,
    )
}

#[test]
fn related_table_measures_follow_one_way_filters_and_measure_references() {
    let fixture = Fixture::new();
    fixture.assert_matches();
}

#[test]
fn related_table_measures_follow_reachable_column_fields() {
    let mut fixture = Fixture::new();
    fixture.transposed = true;
    fixture.install();
    fixture.assert_matches();
}

#[test]
fn related_table_measures_recalculate_after_edits_to_that_table() {
    let mut fixture = Fixture::new();
    fixture.customers[0].credit = 1_000.0;
    fixture.customers[3].region = "South";
    fixture.write_customer(0);
    fixture.write_customer(3);
    fixture.store.recompute_changed();
    fixture.assert_matches();
}

/// GETPIVOTDATA reads a measure's value cell by the measure name, as for
/// any value field (Microsoft's GETPIVOTDATA page).
#[test]
fn getpivotdata_reads_measure_cells() {
    let mut fixture = Fixture::new();
    let report = fixture.store.add_sheet(2, 2);
    fixture
        .store
        .set_sheet_name(fixture.output, "output", "Output");
    let north = Value::text("North");
    let cases = [
        (
            "=GETPIVOTDATA(\"Credit\",Output!A1,\"region\",\"North\")",
            CREDIT,
        ),
        ("=GETPIVOTDATA(\"customers\",Output!A1)", COUNT),
    ];

    for (formula, measure) in cases {
        fixture.store.set_formula(report, 0, 0, formula, 0);
        fixture.store.recompute(report);
        let region = if measure == CREDIT {
            north.clone()
        } else {
            Value::text("Total")
        };
        let expected = fixture.expected(measure, &region, &Value::text("Total"));
        assert_eq!(settled(&fixture.store, report, 0, 0), expected, "{formula}");
    }
}
