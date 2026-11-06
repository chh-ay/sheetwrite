//! Numeric cells in search and filter: the needle check that skips writing
//! the number out must give the same answer as matching its text.

use crate::float_text::NumberText;
use crate::query::{matches_needle, number_matches_text};

#[test]
fn numeric_matches_equal_matching_the_number_text() {
    let numbers = [
        0.0,
        -0.0,
        7.0,
        -7.0,
        17.25,
        0.07,
        1e21,
        1e-7,
        0.1 + 0.2,
        f64::MAX,
        f64::from_bits(1),
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NAN,
    ];
    let needles = [
        "",
        "7",
        "-7",
        "17",
        ".25",
        "0.07",
        "x7",
        "7x",
        "INF",
        "inf",
        "nan",
        "NaN",
        "1e21",
        "1E-7",
        "e",
        " 7",
        "７",
        "17,25",
        "-",
        ".",
        "0.30000000000000004",
    ];
    for number in numbers {
        let text = NumberText::of(number);
        for needle in needles {
            for case_insensitive in [false, true] {
                for whole_cell in [false, true] {
                    assert_eq!(
                        number_matches_text(number, needle, case_insensitive, whole_cell),
                        matches_needle(text.as_str(), needle, case_insensitive, whole_cell),
                        "{number:?} {needle:?} case_insensitive={case_insensitive} whole_cell={whole_cell}"
                    );
                }
            }
        }
    }
}
