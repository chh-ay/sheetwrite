//! Function results through formulas in cells, for the rules that cross
//! function families: argument errors in many families at once, branches
//! that are never evaluated, criteria with lookups, and number text and
//! wildcards that every function reads alike. A table of one family lives
//! in `eval/excel_results_tests.rs`.

use super::*;

/// Argument errors keep their code across families, and the empty
/// aggregates, lazy branches and arity rules give Excel's results.
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn argument_errors_and_lazy_branches_in_every_family() {
    assert_results_on(
        &[&["1", "10"], &["2", "20"], &["3", "30"]],
        &[
            ("=ROUND(\"x\",2)", "#VALUE!"),
            ("=ROUND(1,\"x\")", "#VALUE!"),
            ("=ROUND(1,400)", "#NUM!"),
            ("=MOD(\"x\",2)", "#VALUE!"),
            ("=MOD(1,\"x\")", "#VALUE!"),
            ("=POW(\"x\",2)", "#VALUE!"),
            ("=POW(2,\"x\")", "#VALUE!"),
            ("=FLOOR(\"x\",1)", "#VALUE!"),
            ("=FLOOR(1,\"x\")", "#VALUE!"),
            ("=CEILING(\"x\",1)", "#VALUE!"),
            ("=CEILING(1,\"x\")", "#VALUE!"),
            ("=TRUNC(\"x\",1)", "#VALUE!"),
            ("=TRUNC(1,\"x\")", "#VALUE!"),
            ("=TRUNC(1,400)", "#NUM!"),
            ("=AND(TRUE,\"not-bool\")", "#VALUE!"),
            ("=OR(FALSE,\"not-bool\")", "#VALUE!"),
            ("=NOT(\"not-bool\")", "#VALUE!"),
            ("=LEN(1/0)", "#DIV/0!"),
            ("=LEFT(\"abc\",-1)", "#VALUE!"),
            ("=RIGHT(\"abc\",-1)", "#VALUE!"),
            ("=MID(\"abc\",0,1)", "#VALUE!"),
            ("=MID(\"abc\",1,-1)", "#VALUE!"),
            ("=CONCAT(\"ok\",1/0)", "#DIV/0!"),
            ("=UPPER(1/0)", "#DIV/0!"),
            ("=LOWER(1/0)", "#DIV/0!"),
            ("=TRIM(1/0)", "#DIV/0!"),
            ("=TEXT(1,1/0)", "#DIV/0!"),
            ("=DATE(\"x\",1,1)", "#VALUE!"),
            ("=DATE(2024,\"x\",1)", "#VALUE!"),
            ("=DATE(2024,1,\"x\")", "#VALUE!"),
            ("=DATEVALUE(\"not-a-date\")", "#VALUE!"),
            ("=DAY(1/0)", "#DIV/0!"),
            ("=EXACT(1/0,\"x\")", "#DIV/0!"),
            ("=EXACT(\"x\",1/0)", "#DIV/0!"),
            ("=LEFT(1/0,1)", "#DIV/0!"),
            ("=RIGHT(1/0,1)", "#DIV/0!"),
            ("=MID(1/0,1,1)", "#DIV/0!"),
            ("=MID(\"x\",1,1/0)", "#DIV/0!"),
            ("=AVG(\"x\")", "#VALUE!"),
            ("=MIN(\"x\")", "#VALUE!"),
            ("=MAX(\"x\")", "#VALUE!"),
            ("=MIN()", "0"),
            ("=MAX()", "0"),
            ("=AND()", "TRUE"),
            ("=OR()", "FALSE"),
            ("=SIGN(0)", "0"),
            ("=POWER(2)", "#VALUE!"),
            ("=PRODUCT()", "#VALUE!"),
            ("=SUMPRODUCT()", "#VALUE!"),
            ("=IFERROR(1/0)", "0"),
            ("=IFNA(2,1/0)", "2"),
            ("=IFS(FALSE,1/0,TRUE,8)", "8"),
            ("=SWITCH(2,1,1/0,2,9,1/0)", "9"),
            ("=ISERR(NA())", "FALSE"),
            ("=XOR(TRUE,FALSE,TRUE)", "FALSE"),
            ("=TODAY(1)", "#VALUE!"),
            ("=COUNTIF(A1:A2)", "#VALUE!"),
            ("=COUNTIF(1,\">0\")", "#VALUE!"),
            ("=COUNTIF(A1:A2,1/0)", "#DIV/0!"),
            ("=COUNTIFS()", "#VALUE!"),
            ("=COUNTIFS(A1:A2,\">0\",B1:B3,\">0\")", "#VALUE!"),
            ("=SUMIF(A1:A2)", "#VALUE!"),
            ("=SUMIF(1,\">0\")", "#VALUE!"),
            ("=SUMIFS(A1:A2)", "#VALUE!"),
            ("=SUMIFS(A1:A2,B1:B3,\">0\")", "#VALUE!"),
            ("=AVERAGEIF(A1:A2,\">9\")", "#DIV/0!"),
            ("=INDEX(A1:B2)", "#VALUE!"),
            ("=INDEX(A1:B2,-1,1)", "#VALUE!"),
            ("=INDEX(A1:B2,1)", "#VALUE!"),
            ("=INDEX(A1:B2,9,1)", "#REF!"),
            ("=MATCH(1,A1:A2,9)", "#VALUE!"),
            ("=MATCH(1,1)", "#VALUE!"),
            ("=VLOOKUP(1,A1:B2)", "#VALUE!"),
            ("=VLOOKUP(1/0,A1:B2,2)", "#DIV/0!"),
            ("=VLOOKUP(1,1,2)", "#VALUE!"),
            ("=VLOOKUP(1,A1:B2,2,\"bad\")", "#VALUE!"),
            ("=XLOOKUP(1,A1:A2)", "#VALUE!"),
            ("=XLOOKUP(1,1,B1:B2)", "#VALUE!"),
            ("=XLOOKUP(1,A1:A2,B1:B2,,9)", "#VALUE!"),
            ("=XLOOKUP(1,A1:A2,B1:B2,,,0)", "#VALUE!"),
        ],
    );
}

/// Number text and wildcards each have one rule, so every function that reads
/// them answers alike: arithmetic and SUM read text the way VALUE does, and
/// criteria, wildcard lookups and SEARCH match patterns the same way.
#[test]
fn number_text_and_wildcards_read_the_same_in_every_function() {
    assert_results_on(
        &[
            &["Alpha", "1", "4", "İ", "café", "inf"],
            &["a*", "2", "3"],
            &["ax", "3", "2"],
            &["a~b", "4", "1"],
        ],
        &[
            // A group separator, a percent and a date read alike everywhere.
            ("=VALUE(\"1,000\")", "1000"),
            ("=\"1,000\"+0", "1000"),
            ("=SUM(\"1,000\",1)", "1001"),
            ("=VALUE(\"50%\")*2", "1"),
            ("=\"50%\"*2", "1"),
            ("=VALUE(\"2024-01-31\")", "45322"),
            ("=\"2024-01-31\"+0", "45322"),
            // A date must be the whole text; a time may follow it, or stand alone.
            ("=\"2024-01-31 notes\"+0", "#VALUE!"),
            ("=VALUE(\"2024-01-31 notes\")", "#VALUE!"),
            ("=DAY(\"2024-01-31 notes\")", "#VALUE!"),
            ("=\"2024-01-31 12:00\"+0", "45322.5"),
            ("=VALUE(\"2024-01-31T06:00\")", "45322.25"),
            ("=\"12:00\"*2", "1"),
            // A space inside a number is text, as in Excel's VALUE.
            ("=VALUE(\"1 234\")", "#VALUE!"),
            ("=\"1 234\"+0", "#VALUE!"),
            // `inf` is text to Excel, not an infinite number.
            ("=\"inf\"+0", "#VALUE!"),
            ("=DAY(\"inf\")", "#VALUE!"),
            ("=COUNTIF(F1,\"inf\")", "1"),
            // `?` is one character as written, and case folds per character.
            ("=SEARCH(\"?\",D1)", "1"),
            ("=COUNTIF(D1,\"?\")", "1"),
            ("=XMATCH(\"?\",D1:D1,2)", "1"),
            ("=SEARCH(\"CAFÉ\",E1)", "1"),
            ("=COUNTIF(E1,\"CAF?\")", "1"),
            ("=XMATCH(\"CAFÉ\",E1:E1,2)", "1"),
            // A wildcard match after multi-byte text is counted in characters.
            ("=SEARCH(\"z?\",\"ééz!\")", "3"),
            // `~` escapes a wildcard, and stands for itself before anything else.
            ("=COUNTIF(A1:A4,\"a?\")", "2"),
            ("=COUNTIF(A1:A4,\"a~*\")", "1"),
            ("=COUNTIF(A1:A4,\"a~b\")", "1"),
            ("=XMATCH(\"a~~b\",A1:A4,2)", "4"),
            ("=XMATCH(\"*a*a*\",{\"banana\"},2)", "1"),
            ("=XMATCH(\"*x*\",{\"banana\"},2)", "#N/A"),
            ("=XMATCH(\"\",{\"\"},2)", "1"),
            ("=XMATCH(\"\",{\"a\"},2)", "#N/A"),
            ("=XMATCH(\"**\",{\"\"},2)", "1"),
            ("=XMATCH(\"a?\",{\"a\"},2)", "#N/A"),
            ("=XMATCH(\"a~b\",A1:A4,2)", "4"),
            ("=SUMIF(B1:B4,\">2\")", "7"),
            ("=XLOOKUP(\"a*\",A1:A4,B1:B4,,2)", "1"),
            ("=XLOOKUP(2.5,B1:B4,B1:B4,,-1,2)", "2"),
            ("=XLOOKUP(2.5,B1:B4,B1:B4,,1,2)", "3"),
            ("=MATCH(2.5,C1:C4,-1)", "2"),
        ],
    );
}
