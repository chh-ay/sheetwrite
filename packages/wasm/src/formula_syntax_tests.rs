//! Formula syntax that Excel accepts: exponent numbers, whole columns and
//! rows, and the sheet limits of cell references.

use crate::calc::{parse, serialize, shift_cols, shift_rows, translate_relative_refs, Ast};

const SHEET: u32 = 0;

fn round_trip(source: &str) -> String {
    let ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
    let written = serialize(&ast);
    assert_eq!(parse(&written).as_ref(), Ok(&ast), "{source} -> {written}");
    written
}

fn after_row_edit(source: &str, at: u32, delta: i64) -> String {
    let mut ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
    shift_rows(&mut ast, at, delta, SHEET, SHEET);
    serialize(&ast)
}

fn after_col_edit(source: &str, at: u32, delta: i64) -> String {
    let mut ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
    shift_cols(&mut ast, at, delta, SHEET, SHEET);
    serialize(&ast)
}

#[test]
fn numbers_accept_an_exponent() {
    for (source, expected) in [
        ("=1E3", 1000.0),
        ("=1e3", 1000.0),
        ("=1.5E-3", 0.0015),
        ("=2E+2", 200.0),
        ("=.5E1", 5.0),
        ("=12.E1", 120.0),
    ] {
        assert_eq!(parse(source), Ok(Ast::Num(expected)), "{source}");
    }

    assert_eq!(round_trip("=SUM(1.5E-3,2)"), "=SUM(0.0015,2)");
    // An `E` without digits is not part of the number.
    for source in ["=1E", "=1E+", "=1E-x"] {
        assert!(parse(source).is_err(), "{source}");
    }
}

#[test]
fn references_stay_inside_the_sheet_limits() {
    for source in ["=XYZ1", "=XFE1", "=A1048577", "=A0"] {
        assert!(
            matches!(parse(source), Ok(Ast::Name(_))),
            "{source} must be a name"
        );
    }
    assert!(matches!(parse("=XFD1048576"), Ok(Ast::Cell(..))));

    assert_eq!(after_row_edit("=A1048576", 0, 1), "=#REF!");
    assert_eq!(after_col_edit("=XFD1", 0, 1), "=#REF!");
    assert_eq!(
        after_row_edit("=SUM(A5:A1048575)", 0, 5),
        "=SUM(A10:A1048576)"
    );

    let mut ast = parse("=A1048576").unwrap();
    translate_relative_refs(&mut ast, 1, 0);
    assert_eq!(serialize(&ast), "=#REF!");
}
