//! Recalculation results that must not drift when the pass order or the place
//! that holds results changes: dependency order against formula entry order,
//! cycles and depth errors, iteration, volatile draws, spills, runtime
//! references and text results. Formulas are entered after the formulas that
//! read them, so the pass cannot rely on entry order. Each scenario lists every
//! formula cell's shown value after the first recalculation and after an edit.

use crate::store::CellStore;
use crate::types::{KIND_BOOL, KIND_EMPTY};

/// Columns A-H, rows 1-12 of one sheet.
const COLS: usize = 8;
const ROWS: usize = 12;

/// A1-style address of a cell in the first 26 columns.
fn address(row: usize, col: usize) -> String {
    format!("{}{}", char::from(b'A' + col as u8), row + 1)
}

/// `"A1"` → `(row, col)` for the first 26 columns.
fn cell(name: &str) -> (usize, usize) {
    let col = usize::from(name.as_bytes()[0] - b'A');
    let row: usize = name[1..].parse().expect("row number");
    (row - 1, col)
}

fn shown(store: &CellStore, sheet: usize, row: usize, col: usize) -> String {
    let cell = store.get_cell(sheet, row, col);
    match cell.string() {
        Some(text) => text,
        None if cell.kind() == KIND_EMPTY => String::new(),
        None if cell.kind() == KIND_BOOL => if cell.num() != 0.0 { "TRUE" } else { "FALSE" }.into(),
        None => cell.num().to_string(),
    }
}

/// One workbook: literal numbers, formulas in entry order, then one number
/// edit. `iterate` turns on iterative calculation with 100 steps and 0.001.
struct Scenario {
    name: &'static str,
    iterate: bool,
    numbers: &'static [(&'static str, f64)],
    formulas: &'static [(&'static str, &'static str)],
    edit: (&'static str, f64),
    /// The cells to show, read after the first recalculation and after the edit.
    shown: &'static [&'static str],
    /// `cell=value` pairs and `#` formula evaluations, first recalculation
    /// then edit, separated by `|`.
    expected: &'static str,
}

fn run(scenario: &Scenario) -> String {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(COLS, ROWS);
    if scenario.iterate {
        assert!(store.set_iterative_calculation(true, 100, 0.001));
    }
    for &(name, value) in scenario.numbers {
        let (row, col) = cell(name);
        store.set_number(sheet, row, col, value, 0);
    }
    for &(name, source) in scenario.formulas {
        let (row, col) = cell(name);
        store.set_formula(sheet, row, col, source, 0);
    }
    let first_evaluations = evaluations(|| store.recompute(sheet));
    let first = snapshot(&store, sheet, scenario.shown);

    let (name, value) = scenario.edit;
    let (row, col) = cell(name);
    store.set_number(sheet, row, col, value, 0);
    let edit_evaluations = evaluations(|| store.recompute(sheet));
    format!(
        "{first} #{first_evaluations}|{} #{edit_evaluations}",
        snapshot(&store, sheet, scenario.shown)
    )
}

/// Formula evaluations that `recalculate` runs: each selected formula once,
/// even when another formula pulls it before its turn.
fn evaluations(recalculate: impl FnOnce()) -> usize {
    super::FORMULA_EVALUATIONS.with(|count| count.set(0));
    recalculate();
    super::FORMULA_EVALUATIONS.with(std::cell::Cell::get)
}

fn snapshot(store: &CellStore, sheet: usize, cells: &[&str]) -> String {
    cells
        .iter()
        .map(|&name| {
            let (row, col) = cell(name);
            debug_assert_eq!(address(row, col), name);
            format!("{name}={}", shown(store, sheet, row, col))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

const SCENARIOS: &[Scenario] = &[
    Scenario {
        name: "a chain entered from its last formula to its first",
        iterate: false,
        numbers: &[("A1", 1.0)],
        formulas: &[("B4", "=B3*2"), ("B3", "=B2+B1"), ("B2", "=B1+1"), ("B1", "=A1*10")],
        edit: ("A1", 2.0),
        shown: &["B1", "B2", "B3", "B4"],
        expected: "B1=10 B2=11 B3=21 B4=42 #4|B1=20 B2=21 B3=41 B4=82 #4",
    },
    Scenario {
        name: "a diamond whose join is entered first",
        iterate: false,
        numbers: &[("A1", 3.0)],
        formulas: &[("C1", "=B1+B2"), ("B2", "=A1*A1"), ("B1", "=A1+1")],
        edit: ("A1", -1.0),
        shown: &["B1", "B2", "C1"],
        expected: "B1=4 B2=9 C1=13 #3|B1=0 B2=1 C1=1 #3",
    },
    Scenario {
        name: "a range reader entered before the formulas inside its range",
        iterate: false,
        numbers: &[("A1", 1.0), ("A2", 2.0)],
        formulas: &[
            ("D1", "=SUM(C1:C3)"),
            ("D2", "=COUNT(C1:C3)"),
            ("C1", "=A1*2"),
            ("C2", "=A2*2"),
            ("C3", "=C1+C2"),
        ],
        edit: ("A2", 5.0),
        shown: &["C1", "C2", "C3", "D1", "D2"],
        expected: "C1=2 C2=4 C3=6 D1=12 D2=3 #5|C1=2 C2=10 C3=12 D1=24 D2=3 #4",
    },
    Scenario {
        name: "text, logical and blank results read by later formulas",
        iterate: false,
        numbers: &[("A1", 4.0)],
        formulas: &[
            ("C1", "=B1&\"!\""),
            ("C2", "=NOT(B2)"),
            ("C3", "=B3&\"x\""),
            ("C4", "=LEN(C1)"),
            ("B1", "=IF(A1>3,\"big\",\"small\")"),
            ("B2", "=A1>3"),
            ("B3", "=IF(A1>3,H12,\"\")"),
        ],
        edit: ("A1", 1.0),
        shown: &["B1", "B2", "B3", "C1", "C2", "C3", "C4"],
        expected: "B1=big B2=TRUE B3= C1=big! C2=FALSE C3=x C4=4 #7|B1=small B2=FALSE B3= C1=small! C2=TRUE C3=x C4=6 #7",
    },
    Scenario {
        name: "errors flow to readers in reading order",
        iterate: false,
        numbers: &[("A1", 0.0)],
        formulas: &[
            ("C1", "=B1+B2"),
            ("C2", "=IFERROR(B1,-1)"),
            ("C3", "=ISERROR(B2)"),
            ("B1", "=1/A1"),
            ("B2", "=NA()"),
        ],
        edit: ("A1", 4.0),
        shown: &["B1", "B2", "C1", "C2", "C3"],
        expected: "B1=#DIV/0! B2=#N/A C1=#DIV/0! C2=-1 C3=TRUE #5|B1=0.25 B2=#N/A C1=#N/A C2=0.25 C3=TRUE #3",
    },
    Scenario {
        name: "a cycle and the formulas reading it, without iteration",
        iterate: false,
        numbers: &[("A1", 1.0)],
        formulas: &[
            ("D1", "=B1+1"),
            ("B1", "=C1+A1"),
            ("C1", "=B1*2"),
            ("D2", "=A1*5"),
            ("D3", "=D2+1"),
        ],
        edit: ("A1", 2.0),
        shown: &["B1", "C1", "D1", "D2", "D3"],
        expected: "B1=#CYCLE! C1=#CYCLE! D1=#CYCLE! D2=5 D3=6 #2|B1=#CYCLE! C1=#CYCLE! D1=#CYCLE! D2=10 D3=11 #2",
    },
    Scenario {
        name: "a formula that reads itself",
        iterate: false,
        numbers: &[("A1", 1.0)],
        formulas: &[("B1", "=B1+A1"), ("B2", "=B1+1"), ("B3", "=A1+1")],
        edit: ("A1", 3.0),
        shown: &["B1", "B2", "B3"],
        expected: "B1=#CYCLE! B2=#CYCLE! B3=2 #1|B1=#CYCLE! B2=#CYCLE! B3=4 #1",
    },
    Scenario {
        name: "a cycle settled by iterative calculation",
        iterate: true,
        numbers: &[("A1", 10.0)],
        formulas: &[("C1", "=B1*2"), ("B1", "=A1+B2/2"), ("B2", "=B1/2")],
        edit: ("A1", 20.0),
        shown: &["B1", "B2", "C1"],
        expected: "B1=13.3331298828125 B2=6.66656494140625 C1=26.666259765625 #17|B1=26.666463213041425 B2=13.333231606520712 C1=53.33292642608285 #17",
    },
    Scenario {
        name: "volatile draws read by later formulas",
        iterate: false,
        numbers: &[("A1", 1.0)],
        formulas: &[
            ("C1", "=B1+B2+A1"),
            ("B2", "=RANDBETWEEN(1,1000)"),
            ("B1", "=RANDBETWEEN(1,1000)"),
            ("B3", "=ROUND(RAND()*1000,0)"),
        ],
        edit: ("A1", 2.0),
        shown: &["B1", "B2", "B3", "C1"],
        expected: "B1=985 B2=888 B3=153 C1=1874 #4|B1=674 B2=636 B3=39 C1=1312 #4",
    },
    Scenario {
        name: "a spill read by formulas entered before its anchor",
        iterate: false,
        numbers: &[("A1", 3.0)],
        formulas: &[
            ("D1", "=SUM(B1:B3)"),
            ("D2", "=B2*10"),
            ("D3", "=SUM(B1#)"),
            ("B1", "=SEQUENCE(A1)"),
        ],
        edit: ("A1", 2.0),
        shown: &["B1", "B2", "B3", "D1", "D2", "D3"],
        expected: "B1=1 B2=2 B3=3 D1=6 D2=20 D3=6 #4|B1=1 B2=2 B3= D1=3 D2=20 D3=3 #4",
    },
    Scenario {
        name: "INDIRECT and OFFSET into formulas entered after their readers",
        iterate: false,
        numbers: &[("A1", 2.0), ("A2", 7.0)],
        formulas: &[
            ("D1", "=INDIRECT(\"C\"&A1)+1"),
            ("D2", "=SUM(OFFSET(C1,0,0,A1,1))"),
            ("D3", "=INDIRECT(\"D1\")*2"),
            ("C1", "=A2+1"),
            ("C2", "=C1*3"),
            ("C3", "=C2-1"),
        ],
        edit: ("A1", 3.0),
        shown: &["C1", "C2", "C3", "D1", "D2", "D3"],
        expected: "C1=8 C2=24 C3=23 D1=25 D2=32 D3=50 #6|C1=8 C2=24 C3=23 D1=24 D2=55 D3=48 #3",
    },
    Scenario {
        name: "a runtime reference that closes a cycle",
        iterate: false,
        numbers: &[("A1", 1.0)],
        formulas: &[("B1", "=INDIRECT(\"B2\")+A1"), ("B2", "=B1+1"), ("B3", "=B2*2")],
        edit: ("A1", 5.0),
        shown: &["B1", "B2", "B3"],
        expected: "B1=#CYCLE! B2=#CYCLE! B3=#CYCLE! #3|B1=#CYCLE! B2=#CYCLE! B3=#CYCLE! #3",
    },
    Scenario {
        name: "INDIRECT pulls a chain whose formulas come later in reading order",
        iterate: false,
        numbers: &[("A1", 3.0)],
        formulas: &[
            ("B1", "=INDIRECT(\"C\"&A1)*2"),
            ("C1", "=A1+1"),
            ("C2", "=C1+1"),
            ("C3", "=C2+1"),
            ("D1", "=C3+B1"),
        ],
        edit: ("A1", 2.0),
        shown: &["B1", "C1", "C2", "C3", "D1"],
        expected: "B1=12 C1=4 C2=5 C3=6 D1=18 #5|B1=8 C1=3 C2=4 C3=5 D1=13 #5",
    },
    Scenario {
        name: "OFFSET over formulas that a later formula also reads",
        iterate: false,
        numbers: &[("A1", 2.0), ("A2", 4.0)],
        formulas: &[
            ("B1", "=SUM(OFFSET(C1,0,0,A1,1))"),
            ("C2", "=C1*A2"),
            ("C1", "=A2-1"),
            ("D1", "=B1+C2"),
        ],
        edit: ("A2", 6.0),
        shown: &["B1", "C1", "C2", "D1"],
        expected: "B1=15 C1=3 C2=12 D1=27 #4|B1=35 C1=5 C2=30 D1=65 #4",
    },
    Scenario {
        name: "a runtime cycle settled by iterative calculation, with readers",
        iterate: true,
        numbers: &[("A1", 8.0)],
        formulas: &[
            ("D1", "=B2*10"),
            ("B1", "=A1+INDIRECT(\"B2\")/2"),
            ("B2", "=B1/2"),
            ("D2", "=A1+1"),
        ],
        edit: ("A1", 4.0),
        shown: &["B1", "B2", "D1", "D2"],
        expected: "B1=10.66650390625 B2=5.333251953125 D1=53.33251953125 D2=9 #20|B1=5.333658844232559 B2=2.6668294221162796 D1=26.668294221162796 D2=5 #18",
    },
    Scenario {
        name: "an iterated cycle read by formulas upstream and downstream",
        iterate: true,
        numbers: &[("A1", 2.0)],
        formulas: &[
            ("E1", "=C1+C2"),
            ("C1", "=B1+C2/4"),
            ("C2", "=C1/4+B2"),
            ("B1", "=A1*3"),
            ("B2", "=A1-1"),
            ("E2", "=E1*2"),
        ],
        edit: ("A1", 5.0),
        shown: &["B1", "B2", "C1", "C2", "E1", "E2"],
        expected: "B1=6 B2=1 C1=6.666656494140625 C2=2.6666641235351563 E1=9.333320617675781 E2=18.666641235351563 #14|B1=15 B2=4 C1=17.066645304352278 C2=8.26666132608807 E1=25.333306630440347 E2=50.666613260880695 #14",
    },
    Scenario {
        name: "a spill anchor between a chain and its readers",
        iterate: false,
        numbers: &[("A1", 2.0)],
        formulas: &[
            ("E1", "=SUM(D1#)+C1"),
            ("D1", "=SEQUENCE(C1)"),
            ("C1", "=B1+1"),
            ("B1", "=A1*1"),
            ("E2", "=D2*2"),
        ],
        edit: ("A1", 3.0),
        shown: &["B1", "C1", "D1", "D2", "D3", "D4", "E1", "E2"],
        expected: "B1=2 C1=3 D1=1 D2=2 D3=3 D4= E1=9 E2=4 #5|B1=3 C1=4 D1=1 D2=2 D3=3 D4=4 E1=14 E2=4 #5",
    },
    Scenario {
        name: "an error read through a chain and caught at its end",
        iterate: false,
        numbers: &[("A1", 1.0)],
        formulas: &[("B3", "=IFERROR(B2,7)"), ("B2", "=B1+A1"), ("B1", "=1/(A1-1)")],
        edit: ("A1", 2.0),
        shown: &["B1", "B2", "B3"],
        expected: "B1=#DIV/0! B2=#DIV/0! B3=7 #3|B1=1 B2=3 B3=3 #3",
    },
];

#[test]
fn recalculation_results_match_the_recorded_rules() {
    let failures: Vec<String> = SCENARIOS
        .iter()
        .filter_map(|scenario| {
            let actual = run(scenario);
            (actual != scenario.expected).then(|| {
                format!(
                    "{}:\n  expected {:?}\n  got      {:?}",
                    scenario.name, scenario.expected, actual
                )
            })
        })
        .collect();
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
