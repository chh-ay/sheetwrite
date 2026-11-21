//! Formula results checked against Excel: the examples Microsoft publishes
//! for each function, the remarks that give its error codes, and closed-form
//! values that pin an approximation. One table per function family; each
//! case is evaluated in its own cell. Rows that only restate the conformance
//! corpus (`scripts/conformance/formula-evidence.ts`) are left to it.

use crate::store::CellStore;
use crate::tests::support::{assert_formulas, assert_results_on, write_cells};

/// `Data!A1:A3` = 1, 2, 3; `B1:B3` = 10, 20, 30; `C1:C3` = 4, 5, 6;
/// `D1:D2` = 5 and "x"; `E3` = `=D1*2`. Every other cell is blank.
const DATA: &[&[&str]] = &[
    &["1", "10", "4", "5"],
    &["2", "20", "5", "x"],
    &["3", "30", "6", "", "=D1*2"],
];

/// Evaluates the cases in sheet `Report` of a workbook whose sheet `Data`
/// holds [`DATA`].
fn assert_results(cases: &[(&str, &str)]) {
    const DATA_COLS: usize = 6;
    const DATA_ROWS: usize = 12;
    let mut store = CellStore::new();
    let report = store.add_sheet(2, cases.len());
    let data = store.add_sheet(DATA_COLS, DATA_ROWS);
    store.set_sheet_name(report, "report", "Report");
    store.set_sheet_name(data, "data", "Data");
    write_cells(&mut store, data, DATA);
    assert_formulas(&mut store, report, 0, cases);
}

#[cfg(feature = "analysis")]
#[test]
fn lambda_arguments_can_be_errors_that_the_body_handles() {
    assert_results(&[
        ("=LAMBDA(x,IFERROR(x,0))(1/0)", "0"),
        ("=LAMBDA(x,ISERROR(x))(NA())", "TRUE"),
        ("=LAMBDA(x,x+1)(1/0)", "#DIV/0!"),
    ]);
}

/// The examples of the base, bit, step and error function pages, the
/// ten-digit two's-complement range, and arguments read from cells.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn engineering_functions() {
    assert_results(&[
        ("=BIN2DEC(1100100)", "100"),
        ("=BIN2DEC(1111111111)", "-1"),
        ("=BIN2HEX(11111011,4)", "00FB"),
        ("=BIN2HEX(1110)", "E"),
        ("=BIN2HEX(1111111111)", "FFFFFFFFFF"),
        ("=BIN2OCT(1001,3)", "011"),
        ("=BIN2OCT(1100100)", "144"),
        ("=BIN2OCT(1111111111)", "7777777777"),
        ("=DEC2BIN(9,4)", "1001"),
        ("=DEC2BIN(-100)", "1110011100"),
        ("=DEC2HEX(100,4)", "0064"),
        ("=DEC2HEX(-54)", "FFFFFFFFCA"),
        ("=DEC2HEX(28)", "1C"),
        ("=DEC2HEX(64,1)", "#NUM!"),
        ("=DEC2OCT(58,3)", "072"),
        ("=DEC2OCT(-100)", "7777777634"),
        ("=HEX2BIN(\"F\",8)", "00001111"),
        ("=HEX2BIN(\"B7\")", "10110111"),
        ("=HEX2BIN(\"FFFFFFFFFF\")", "1111111111"),
        ("=HEX2DEC(\"A5\")", "165"),
        ("=HEX2DEC(\"FFFFFFFF5B\")", "-165"),
        ("=HEX2DEC(\"3DA408B9\")", "1034160313"),
        ("=HEX2OCT(\"F\",3)", "017"),
        ("=HEX2OCT(\"3B4E\")", "35516"),
        ("=HEX2OCT(\"FFFFFFFF00\")", "7777777400"),
        ("=OCT2BIN(3,3)", "011"),
        ("=OCT2BIN(7777777000)", "1000000000"),
        ("=OCT2DEC(54)", "44"),
        ("=OCT2DEC(7777777533)", "-165"),
        ("=OCT2HEX(100,4)", "0040"),
        ("=OCT2HEX(7777777533)", "FFFFFFFF5B"),
        // Values outside the ten-digit range, places and digits.
        ("=BIN2DEC(12)", "#NUM!"),
        ("=BIN2DEC(\"10000000000\")", "#NUM!"),
        ("=DEC2BIN(512)", "#NUM!"),
        ("=DEC2BIN(-513)", "#NUM!"),
        ("=DEC2OCT(536870912)", "#NUM!"),
        ("=DEC2HEX(549755813888)", "#NUM!"),
        ("=DEC2BIN(1,0)", "#NUM!"),
        ("=DEC2BIN(1,11)", "#NUM!"),
        ("=HEX2BIN(\"200\")", "#NUM!"),
        ("=HEX2BIN(\"FFFFFFFDFF\")", "#NUM!"),
        ("=HEX2OCT(\"FFDFFFFFFF\")", "#NUM!"),
        ("=OCT2BIN(1000)", "#NUM!"),
        ("=HEX2DEC(\"G1\")", "#NUM!"),
        ("=BIN2DEC(1.5)", "#NUM!"),
        ("=BIN2DEC(TRUE)", "#VALUE!"),
        ("=DEC2BIN(\"x\")", "#VALUE!"),
        ("=HEX2DEC(\"ff\")", "255"),
        ("=DEC2BIN(9.9)", "1001"),
        ("=DEC2BIN(-1,2)", "1111111111"),
        ("=BIN2DEC(Data!A1&Data!A2-Data!A2)", "2"),
        ("=BITAND(1,5)", "1"),
        ("=BITAND(13,25)", "9"),
        ("=BITOR(23,10)", "31"),
        ("=BITXOR(5,3)", "6"),
        ("=BITLSHIFT(4,2)", "16"),
        ("=BITRSHIFT(13,2)", "3"),
        ("=BITLSHIFT(16,-2)", "4"),
        ("=BITRSHIFT(1,-3)", "8"),
        ("=BITAND(-1,5)", "#NUM!"),
        ("=BITOR(1.5,5)", "#NUM!"),
        ("=BITXOR(2^48,1)", "#NUM!"),
        ("=BITLSHIFT(1,54)", "#NUM!"),
        ("=BITLSHIFT(2^47,1)", "#NUM!"),
        ("=DELTA(5,4)", "0"),
        ("=DELTA(5,5)", "1"),
        ("=DELTA(0.5)", "0"),
        ("=GESTEP(5,4)", "1"),
        ("=GESTEP(-4,-5)", "1"),
        ("=GESTEP(-1)", "0"),
        ("=DELTA(\"a\",1)", "#VALUE!"),
        ("=ERF(0.745)", "~0.70792892"),
        ("=ERF(1,2)", "~0.15262147"),
        ("=ERF.PRECISE(0.745)", "~0.70792892"),
        ("=ERF.PRECISE(1)", "~0.84270079"),
        ("=ERFC(1)", "~0.15729921"),
        ("=ERFC.PRECISE(1)", "~0.15729921"),
        ("=ERF(Data!F1)", "0"),
    ]);
}

/// The IM function examples, parsed text forms and errors. Published
/// results with 15 significant digits can differ in the last digit with the
/// order of operations, so they match to 1E-13 of their size.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn complex_functions() {
    assert_results(&[
        ("=COMPLEX(3,4)", "3+4i"),
        ("=COMPLEX(3,4,\"j\")", "3+4j"),
        ("=COMPLEX(0,1)", "i"),
        ("=COMPLEX(1,0)", "1"),
        ("=IMABS(\"5+12i\")", "13"),
        ("=IMAGINARY(\"3+4i\")", "4"),
        ("=IMAGINARY(\"0-j\")", "-1"),
        ("=IMAGINARY(4)", "0"),
        ("=IMCONJUGATE(\"3+4i\")", "3-4i"),
        ("=IMDIV(\"-238+240i\",\"10+24i\")", "5+12i"),
        ("=IMPRODUCT(\"3+4i\",\"5-3i\")", "27+11i"),
        ("=IMPRODUCT(\"1+2i\",30)", "30+60i"),
        ("=IMREAL(\"6-9i\")", "6"),
        ("=IMSUB(\"13+4i\",\"5+3i\")", "8+i"),
        ("=IMSUM(\"3+4i\",\"5-3i\")", "8+i"),
        ("=IMARGUMENT(\"3+4i\")", "~0.92729522"),
        // The published IMCSCH and IMSECH examples share one real and one
        // imaginary part: IMCSCH has the right imaginary part and IMSECH the
        // right real part. The other parts are the reciprocals of the
        // published IMSINH and IMCOSH examples.
        (
            "=ABS(IMAGINARY(IMCSCH(\"4+3i\"))+0.0051744731840194)<=1E-15",
            "TRUE",
        ),
        (
            "=ABS(IMREAL(IMCSCH(\"4+3i\"))/IMREAL(IMDIV(1,\"-27.0168132580039+3.85373803791938i\"))-1)<=1E-13",
            "TRUE",
        ),
        (
            "=ABS(IMREAL(IMSECH(\"4+3i\"))+0.0362534969158689)<=1E-15",
            "TRUE",
        ),
        (
            "=ABS(IMAGINARY(IMSECH(\"4+3i\"))/IMAGINARY(IMDIV(1,\"-27.0349456030742+3.85115333481178i\"))-1)<=1E-13",
            "TRUE",
        ),
        ("=IMSUM(\"i\")", "i"),
        ("=IMSUM(\"-j\")", "-j"),
        ("=IMSUM(\"3\")", "3"),
        ("=IMSUM(\"2.5e3-1.5E-2i\")", "2500-0.015i"),
        ("=IMSUM(\"-4+i\")", "-4+i"),
        ("=IMSUM(\"1e+2+3i\")", "100+3i"),
        ("=IMSUM(\"3+4k\")", "#NUM!"),
        ("=IMSUM(\"3 + 4i\")", "#NUM!"),
        ("=IMSUM(\"i3\")", "#NUM!"),
        ("=IMSUM(\"--1\")", "#NUM!"),
        ("=IMSUM(\"1+2i+3i\")", "#NUM!"),
        ("=IMSUM(\"inf\")", "#NUM!"),
        ("=IMSUM(\"4I\")", "#NUM!"),
        ("=IMSUM(\"1+i\",\"1+j\")", "#VALUE!"),
        ("=IMSUM(\"1+j\",2)", "3+j"),
        ("=COMPLEX(1,1,\"k\")", "#VALUE!"),
        ("=IMABS(TRUE)", "#VALUE!"),
        ("=IMDIV(\"1\",\"0\")", "#NUM!"),
        ("=IMLN(\"0\")", "#NUM!"),
        ("=IMARGUMENT(\"0\")", "#DIV/0!"),
        ("=IMSUB(\"1+2i\",\"1+2i\")", "0"),
        ("=IMSUM(Data!A1:A3)", "6"),
        ("=IMSUM(Data!D1:D3)", "#NUM!"),
        ("=IMPRODUCT(Data!A2:A3,COMPLEX(0,1))", "6i"),
    ]);

    let rounded = [
        ("IMCOS(\"1+i\")", "0.833730025131149-0.988897705762865i"),
        ("IMCOSH(\"4+3i\")", "-27.0349456030742+3.85115333481178i"),
        ("IMCOT(\"4+3i\")", "0.0049011823943045-0.999266927805902i"),
        ("IMCSC(\"4+3i\")", "-0.0754898329158637+0.0648774713706355i"),
        ("IMEXP(\"1+i\")", "1.46869393991589+2.28735528717884i"),
        ("IMLN(\"3+4i\")", "1.6094379124341+0.927295218001612i"),
        ("IMLOG10(\"3+4i\")", "0.698970004336019+0.402719196273373i"),
        ("IMLOG2(\"3+4i\")", "2.32192809488736+1.33780421245098i"),
        ("IMPOWER(\"2+3i\",3)", "-46+9.00000000000001i"),
        ("IMSEC(\"4+3i\")", "-0.0652940278579471-0.0752249603027732i"),
        ("IMSIN(\"4+3i\")", "-7.61923172032141-6.548120040911i"),
        ("IMSINH(\"4+3i\")", "-27.0168132580039+3.85373803791938i"),
        ("IMSQRT(\"1+i\")", "1.09868411346781+0.455089860562227i"),
        ("IMTAN(\"4+3i\")", "0.00490825806749606+1.00070953606723i"),
    ];
    let cases: Vec<(String, &str)> = rounded
        .iter()
        .map(|(call, published)| {
            let near =
                format!("=IMABS(IMSUB({call},\"{published}\"))<=1E-13*IMABS(\"{published}\")");
            (near, "TRUE")
        })
        .collect();
    assert_results_on(&[], &cases);
}

/// The BESSEL examples, values from Abramowitz and Stegun (Tables 9.1 and
/// 9.8) on both sides of each approximation's branch limit, and the remarks.
#[cfg(feature = "analysis")]
#[test]
fn bessel_functions() {
    assert_results(&[
        ("=BESSELI(1.5,1)", "~0.981666428"),
        ("=BESSELJ(1.9,2)", "~0.329925829"),
        ("=BESSELK(1.5,1)", "~0.277387804"),
        ("=BESSELY(2.5,1)", "~0.145918138"),
        ("=BESSELJ(1,0)", "~0.7651977"),
        ("=BESSELJ(10,0)", "~-0.2459358"),
        ("=BESSELJ(10,3)", "~0.0583794"),
        ("=BESSELJ(1,10)", "~0.0000000"),
        ("=BESSELY(1,0)", "~0.0882570"),
        ("=BESSELY(1,1)", "~-0.7812128"),
        ("=BESSELY(10,1)", "~0.2490154"),
        ("=BESSELI(1,0)", "~1.2660659"),
        ("=BESSELI(10,1)", "~2670.9883"),
        ("=BESSELI(1,3)", "~0.0221684"),
        ("=BESSELK(1,0)", "~0.4210244"),
        ("=BESSELK(10,0)", "~0.0000178"),
        ("=BESSELK(0.5,2)", "~7.550184"),
        ("=BESSELJ(1.9,2.9)=BESSELJ(1.9,2)", "TRUE"),
        ("=BESSELJ(1,-1)", "#NUM!"),
        ("=BESSELY(0,1)", "#NUM!"),
        ("=BESSELK(-1,1)", "#NUM!"),
        ("=BESSELJ(0,2)", "0"),
        ("=BESSELI(0,2)", "0"),
        ("=BESSELJ(-2,1)=-BESSELJ(2,1)", "TRUE"),
        ("=BESSELI(-2,3)=-BESSELI(2,3)", "TRUE"),
        ("=BESSELI(-2,2)=BESSELI(2,2)", "TRUE"),
        ("=BESSELI(Data!F1,0)", "1"),
    ]);
}

/// The CONVERT examples.
#[cfg(feature = "analysis")]
#[test]
fn convert_function() {
    assert_results(&[
        ("=CONVERT(1,\"lbm\",\"kg\")", "~0.453592370000"),
        ("=CONVERT(68,\"F\",\"C\")", "~20.0000000000"),
        ("=CONVERT(2.5,\"ft\",\"sec\")", "#N/A"),
        (
            "=CONVERT(CONVERT(100,\"ft\",\"m\"),\"ft\",\"m\")",
            "~9.29030400000",
        ),
        ("=CONVERT(6,\"C\",\"F\")", "~42.8000000000"),
        ("=CONVERT(6,\"tsp\",\"tbs\")", "~2.00000000000"),
        ("=CONVERT(6,\"mi\",\"km\")", "~9.65606400000"),
        ("=CONVERT(6,\"km\",\"mi\")", "~3.72822715342"),
        ("=CONVERT(6,\"in\",\"ft\")", "~0.500000000000"),
        ("=CONVERT(6,\"cm\",\"in\")", "~2.36220472441"),
        ("=CONVERT(Data!A1,\"m\",\"cm\")", "100"),
    ]);
}

/// The legacy statistics names: their examples, closed forms worked by
/// hand, their remarks, and references read like their successors.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn legacy_statistics_names() {
    assert_results(&[
        ("=BETADIST(2,8,10,1,3)", "~0.6854706"),
        ("=BETAINV(0.685470581,8,10,1,3)", "~2"),
        ("=BINOMDIST(6,10,0.5,0)", "~0.2050781"),
        ("=CHIDIST(18.307,10)", "~0.0500006"),
        ("=CHIINV(0.050001,10)", "~18.306973"),
        ("=CONFIDENCE(0.05,2.5,50)", "~0.692951912"),
        ("=CRITBINOM(6,0.5,0.75)", "~4"),
        ("=EXPONDIST(0.2,10,1)", "~0.86466472"),
        ("=EXPONDIST(0.2,10,0)", "~1.35335283"),
        ("=FDIST(15.2069,6,4)", "~0.01"),
        ("=FINV(0.01,6,4)", "~15.206865"),
        ("=GAMMADIST(10.00001131,9,2,0)", "~0.032639"),
        ("=GAMMADIST(10.00001131,9,2,1)", "~0.068094"),
        ("=GAMMAINV(0.068094,9,2)", "~10.0000112"),
        ("=HYPGEOMDIST(1,4,8,20)", "~0.3633"),
        ("=LOGINV(0.039084,3.5,1.2)", "~4.0000252"),
        ("=LOGNORMDIST(4,3.5,1.2)", "~0.0390836"),
        ("=NEGBINOMDIST(10,5,0.25)", "~0.05504866"),
        ("=NORMDIST(42,40,1.5,1)", "~0.9087888"),
        ("=NORMDIST(42,40,1.5,0)", "~0.10934"),
        ("=NORMINV(0.908789,40,1.5)", "~42.000002"),
        ("=NORMSDIST(1.333333)", "~0.908788726"),
        ("=NORMSINV(0.908789)", "~1.3333347"),
        ("=POISSON(2,5,1)", "~0.124652"),
        ("=POISSON(2,5,0)", "~0.084224"),
        ("=TDIST(1.959999998,60,2)", "~0.054645"),
        ("=TDIST(1.959999998,60,1)", "~0.027322"),
        ("=TINV(0.05464493,60)", "~1.96"),
        ("=WEIBULL(105,20,100,1)", "~0.929581"),
        ("=WEIBULL(105,20,100,0)", "~0.035589"),
        // Tensile strength samples of the STDEV, STDEVP, VAR and VARP pages.
        (
            "=STDEV({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})",
            "~27.46392",
        ),
        (
            "=STDEVP({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})",
            "~26.05456",
        ),
        (
            "=VAR({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})",
            "~754.2667",
        ),
        (
            "=VARP({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})",
            "~678.84",
        ),
        ("=MODE({5.6,4,4,3,2,4})", "4"),
        // C(4,2) C(6,1) / C(10,3) = 36 / 120; one failure before the second
        // success is C(2,1) 0.5^3 = 1/4.
        ("=HYPGEOMDIST(2,3,4,10)", "~0.300000000000"),
        ("=NEGBINOMDIST(1,2,0.5)", "~0.250000000000"),
        ("=NEGBINOMDIST(0,3,1)", "1"),
        ("=NEGBINOMDIST(2,3,0)", "0"),
        // With probability 1/2 and 4 trials the cumulative probabilities are
        // 1/16, 5/16, 11/16, 15/16 and 1.
        ("=CRITBINOM(4,0.5,0)", "0"),
        ("=CRITBINOM(4,0.5,0.0625)", "0"),
        ("=CRITBINOM(4,0.5,0.07)", "1"),
        ("=CRITBINOM(4,0.5,0.7)", "3"),
        ("=CRITBINOM(4,0.5,1)", "4"),
        ("=CRITBINOM(1E9,0.5,0.5)", "500000000"),
        ("=BETADIST(0.5,0,2)", "#NUM!"),
        ("=BETADIST(0.5,2,2,1,1)", "#NUM!"),
        ("=BETADIST(3.5,8,10,1,3)", "#NUM!"),
        ("=CRITBINOM(-1,0.5,0.5)", "#NUM!"),
        ("=CRITBINOM(4,1.5,0.5)", "#NUM!"),
        ("=CRITBINOM(4,0.5,-0.5)", "#NUM!"),
        ("=HYPGEOMDIST(5,4,8,20)", "#NUM!"),
        ("=HYPGEOMDIST(1,21,8,20)", "#NUM!"),
        ("=HYPGEOMDIST(1,4,0,20)", "#NUM!"),
        ("=HYPGEOMDIST(0,15,8,20)", "#NUM!"),
        ("=LOGNORMDIST(0,3.5,1.2)", "#NUM!"),
        ("=LOGNORMDIST(4,3.5,0)", "#NUM!"),
        ("=NEGBINOMDIST(-1,5,0.25)", "#NUM!"),
        ("=NEGBINOMDIST(10,0.5,0.25)", "#NUM!"),
        ("=NEGBINOMDIST(10,5,1.5)", "#NUM!"),
        ("=TDIST(1,0.5,1)", "#NUM!"),
        ("=CHIDIST(-1,10)", "#NUM!"),
        ("=FINV(1.5,6,4)", "#NUM!"),
        ("=TINV(0,60)", "#NUM!"),
        ("=NORMSDIST(\"one\")", "#VALUE!"),
        ("=TDIST(1,2,TRUE)=TDIST(1,2,1)", "TRUE"),
        ("=STDEV({1})", "#DIV/0!"),
        ("=STDEV(Data!A1:A3)", "1"),
        ("=VAR(Report:Data!C1:C3)", "1"),
        ("=MODE((Data!A1:A2,Data!A2:A3))", "2"),
        ("=VARP(Data!D1:D3,Data!A1)", "4"),
        ("=ZTEST(Data!D2:D3,1)", "#N/A"),
        ("=CHITEST(Data!A1:A3,Data!B1:B2)", "#N/A"),
    ]);
}

/// The CHISQ.TEST, F.TEST, T.TEST and Z.TEST pages publish the same examples
/// as the Excel 2007 names, so each example checks both names.
#[cfg(feature = "analysis")]
#[test]
fn hypothesis_tests() {
    // A1:B3 observed and C1:D3 expected counts (CHITEST), E and F the FTEST
    // samples, G and H the TTEST samples, I the ZTEST sample.
    let data: &[&[&str]] = &[
        &["58", "35", "45.35", "47.65", "6", "20", "3", "6", "3"],
        &["11", "25", "17.56", "18.44", "7", "28", "4", "19", "6"],
        &["10", "23", "16.09", "16.91", "9", "31", "5", "3", "7"],
        &["", "", "", "", "15", "38", "8", "2", "8"],
        &["", "", "", "", "21", "40", "9", "14", "6"],
        &["", "", "", "", "", "", "1", "4", "5"],
        &["", "", "", "", "", "", "2", "5", "4"],
        &["", "", "", "", "", "", "4", "17", "2"],
        &["", "", "", "", "", "", "5", "1", "1"],
        &["", "", "", "", "", "", "", "", "9"],
    ];
    assert_results_on(
        data,
        &[
            ("=CHITEST(A1:B3,C1:D3)", "~0.0003082"),
            ("=CHISQ.TEST(A1:B3,C1:D3)", "~0.0003082"),
            ("=FTEST(E1:E5,F1:F5)", "~0.64831785"),
            ("=F.TEST(E1:E5,F1:F5)", "~0.64831785"),
            ("=TTEST(G1:G9,H1:H9,2,1)", "~0.196016"),
            ("=T.TEST(G1:G9,H1:H9,2,1)", "~0.196016"),
            ("=ZTEST(I1:I10,4)", "~0.090574"),
            ("=Z.TEST(I1:I10,4)", "~0.090574"),
            ("=ZTEST(I1:I10,6)", "~0.863043"),
            ("=Z.TEST(I1:I10,6)", "~0.863043"),
            // Means 2 and 5, variances 1 and 4: the pooled statistic 3 /
            // sqrt(5/3) has 4 degrees of freedom and Welch's 50/17. The
            // two-tailed values come from a quadrature of the t density.
            ("=TTEST({1,2,3},{3,5,7},2,2)", "~0.0808001372189"),
            ("=TTEST({1,2,3},{3,5,7},2,3)", "~0.1044788866847"),
            ("=TTEST({1,2,3},{1,2},2,1)", "#N/A"),
            ("=TTEST(G1:G9,H1:H9,3,1)", "#NUM!"),
            ("=TTEST(G1:G9,H1:H9,2,4)", "#NUM!"),
            ("=TTEST(G1:G9,H1:H9,0,2)", "#NUM!"),
            (
                "=CHITEST(A1:B3,{45.35,47.65,17.56;18.44,16.09,16.91})",
                "#N/A",
            ),
            ("=FTEST({1},F1:F5)", "#DIV/0!"),
            ("=FTEST({2,2},F1:F5)", "#DIV/0!"),
        ],
    );
}

/// The examples of every distribution function, closed forms in the far
/// tails and at inverse endpoints, and the domain rules of the remarks.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn distribution_functions() {
    assert_results(&[
        ("=BETA.DIST(2,8,10,1,1,3)", "~0.6854706"),
        ("=BETA.DIST(2,8,10,0,1,3)", "~1.4837646"),
        ("=BETA.INV(0.685470581,8,10,1,3)", "~2"),
        ("=BINOM.DIST(6,10,0.5,0)", "~0.2050781"),
        ("=CHISQ.DIST(0.5,1,1)", "~0.52049988"),
        ("=CHISQ.DIST(2,3,0)", "~0.20755375"),
        ("=CHISQ.DIST.RT(18.307,10)", "~0.0500006"),
        ("=CHISQ.INV(0.93,1)", "~3.283020286"),
        ("=CHISQ.INV(0.6,2)", "~1.832581464"),
        ("=CHISQ.INV.RT(0.050001,10)", "~18.306973"),
        ("=CONFIDENCE.NORM(0.05,2.5,50)", "~0.692952"),
        ("=CONFIDENCE.T(0.05,1,50)", "~0.284196855"),
        ("=EXPON.DIST(0.2,10,1)", "~0.86466472"),
        ("=EXPON.DIST(0.2,10,0)", "~1.35335283"),
        ("=F.DIST(15.2069,6,4,1)", "~0.99"),
        ("=F.DIST(15.2069,6,4,0)", "~0.0012238"),
        ("=F.DIST.RT(15.2068649,6,4)", "~0.01"),
        ("=F.INV(0.01,6,4)", "~0.10930991"),
        ("=F.INV.RT(0.01,6,4)", "~15.20686"),
        ("=FISHER(0.75)", "~0.9729551"),
        ("=FISHERINV(0.972955)", "~0.75"),
        ("=GAMMA(2.5)", "~1.329"),
        ("=GAMMA(-3.75)", "~0.268"),
        ("=GAMMA.DIST(10.00001131,9,2,0)", "~0.032639"),
        ("=GAMMA.DIST(10.00001131,9,2,1)", "~0.068094"),
        ("=GAMMA.INV(0.068094,9,2)", "~10.0000112"),
        ("=GAMMALN(4)", "~1.7917595"),
        ("=GAMMALN.PRECISE(4)", "~1.7917595"),
        ("=GAUSS(2)", "~0.47725"),
        ("=LOGNORM.DIST(4,3.5,1.2,1)", "~0.0390836"),
        ("=LOGNORM.DIST(4,3.5,1.2,0)", "~0.0176176"),
        ("=LOGNORM.INV(0.039084,3.5,1.2)", "~4.0000252"),
        ("=NORM.DIST(42,40,1.5,1)", "~0.9087888"),
        ("=NORM.DIST(42,40,1.5,0)", "~0.10934"),
        ("=NORM.INV(0.908789,40,1.5)", "~42.000002"),
        ("=NORM.S.DIST(1.333333,1)", "~0.908788726"),
        ("=NORM.S.DIST(1.333333,0)", "~0.164010148"),
        ("=NORM.S.INV(0.908789)", "~1.3333347"),
        ("=PHI(0.75)", "~0.301137432"),
        ("=POISSON.DIST(2,5,1)", "~0.124652"),
        ("=POISSON.DIST(2,5,0)", "~0.084224"),
        ("=STANDARDIZE(42,40,1.5)", "~1.33333333"),
        ("=T.DIST(60,1,1)", "~0.99469533"),
        ("=T.DIST(8,3,0)", "~0.00073691"),
        ("=T.DIST.2T(1.959999998,60)", "~0.054645"),
        ("=T.DIST.RT(1.959999998,60)", "~0.027322"),
        ("=T.INV(0.75,2)", "~0.8164966"),
        ("=T.INV.2T(0.546449,60)", "~0.606533076"),
        ("=WEIBULL.DIST(105,20,100,1)", "~0.929581"),
        ("=WEIBULL.DIST(105,20,100,0)", "~0.035589"),
        // Independent closed forms: df=2 chi-square and shape=1 gamma are
        // exponential; df=1 Student is Cauchy; unit beta parameters are uniform.
        ("=ABS(CHISQ.DIST.RT(100,2)-EXP(-50))<=1E-35", "TRUE"),
        ("=ABS(CHISQ.INV.RT(1E-20,2)+2*LN(1E-20))<=1E-11", "TRUE"),
        ("=ABS(GAMMA.INV(0.25,1,3)+3*LN(0.75))<=1E-12", "TRUE"),
        ("=ABS(T.INV(0.75,1)-1)<=1E-13", "TRUE"),
        ("=T.INV.2T(1,3)", "0"),
        ("=ABS(BETA.INV(1E-20,1,1)-1E-20)<=1E-32", "TRUE"),
        ("=NORM.S.INV(0.5)", "0"),
        ("=BETA.INV(1,2,4,3,8)", "8"),
        ("=ABS(GAMMA(-0.5)+2*SQRT(PI()))<=1E-13", "TRUE"),
        ("=ABS(BINOM.DIST(2.9,4.8,0.5,0)-0.375)<=1E-14", "TRUE"),
        ("=POISSON.DIST(0,0,1)", "1"),
        ("=WEIBULL.DIST(0,1,2,0)", "0.5"),
        ("=ABS(T.DIST.RT(-1,1)-0.75)<=1E-15", "TRUE"),
        ("=NORM.S.DIST(\"0\",\"TRUE\")", "0.5"),
        ("=PHI(#REF!)", "#REF!"),
        ("=NORM.S.DIST(\"one\",TRUE)", "#VALUE!"),
        ("=NORM.DIST(0,0,0,1)", "#NUM!"),
        ("=NORM.INV(1,0,1)", "#NUM!"),
        ("=T.DIST(1,0.5,1)", "#NUM!"),
        ("=T.DIST.2T(-1,3)", "#NUM!"),
        ("=T.INV(0,2)", "#NUM!"),
        ("=T.INV.2T(0,2)", "#NUM!"),
        ("=CHISQ.DIST(-1,2,1)", "#NUM!"),
        ("=CHISQ.DIST.RT(1,1E11)", "#NUM!"),
        ("=CHISQ.INV(1.5,2)", "#NUM!"),
        ("=CHISQ.INV.RT(-0.5,2)", "#NUM!"),
        ("=F.DIST(1,0.9,2,1)", "#NUM!"),
        ("=F.DIST.RT(-1,2,2)", "#NUM!"),
        ("=F.INV(1.5,2,2)", "#NUM!"),
        ("=F.INV.RT(0.5,2,0)", "#NUM!"),
        ("=BINOM.DIST(5,4,0.5,1)", "#NUM!"),
        ("=BINOM.DIST(1,4,1.5,1)", "#NUM!"),
        ("=POISSON.DIST(1,-1,1)", "#NUM!"),
        ("=EXPON.DIST(1,0,1)", "#NUM!"),
        ("=GAMMA.DIST(-1,1,1,1)", "#NUM!"),
        ("=GAMMA.INV(0.5,1,0)", "#NUM!"),
        ("=BETA.DIST(0.5,2,2)", "#VALUE!"),
        ("=BETA.DIST(0.5,2,2,1,1,1)", "#NUM!"),
        ("=BETA.INV(0,2,2)", "#NUM!"),
        ("=LOGNORM.DIST(0,0,1,1)", "#NUM!"),
        ("=LOGNORM.INV(1,0,1)", "#NUM!"),
        ("=WEIBULL.DIST(1,0,1,1)", "#NUM!"),
        ("=CONFIDENCE.NORM(1,1,10)", "#NUM!"),
        ("=CONFIDENCE.T(0.05,1,1)", "#DIV/0!"),
        ("=STANDARDIZE(1,0,0)", "#NUM!"),
        ("=FISHER(1)", "#NUM!"),
        ("=GAMMA(0)", "#NUM!"),
        ("=GAMMA(-2)", "#NUM!"),
        ("=GAMMALN(0)", "#NUM!"),
        ("=NORM.S.INV(0)", "#NUM!"),
    ]);
}

/// The BINOM.DIST.RANGE, BINOM.INV, HYPGEOM.DIST and NEGBINOM.DIST
/// examples, sums worked by hand (a fair coin tossed 4 times gives 1, 4, 6,
/// 4, 1 sixteenths for 0 to 4 heads) and the remarks.
#[cfg(feature = "analysis")]
#[test]
fn discrete_distribution_functions() {
    assert_results(&[
        ("=BINOM.DIST.RANGE(60,0.75,48)", "~0.084"),
        ("=BINOM.DIST.RANGE(60,0.75,45,50)", "~0.524"),
        ("=BINOM.INV(6,0.5,0.75)", "4"),
        ("=HYPGEOM.DIST(1,4,8,20,TRUE)", "~0.4654"),
        ("=HYPGEOM.DIST(1,4,8,20,FALSE)", "~0.3633"),
        ("=NEGBINOM.DIST(10,5,0.25,TRUE)", "~0.3135141"),
        ("=NEGBINOM.DIST(10,5,0.25,FALSE)", "~0.0550487"),
        ("=BINOM.DIST.RANGE(4,0.5,1,3)", "~0.875000000000"),
        ("=BINOM.DIST.RANGE(4,0.5,0,4)", "~1.000000000000"),
        ("=BINOM.DIST.RANGE(4,0,0)", "~1.000000000000"),
        ("=NEGBINOM.DIST(1,1,0.5,TRUE)", "~0.750000000000"),
        ("=HYPGEOM.DIST(2,2,2,4,TRUE)", "~1.000000000000"),
        ("=BINOM.DIST.RANGE(4,1.5,1)", "#NUM!"),
        ("=BINOM.DIST.RANGE(4,0.5,5)", "#NUM!"),
        ("=BINOM.DIST.RANGE(4,0.5,3,2)", "#NUM!"),
        ("=BINOM.INV(6,0,0.75)", "#NUM!"),
        ("=BINOM.INV(6,0.5,1)", "#NUM!"),
        ("=HYPGEOM.DIST(5,4,8,20,TRUE)", "#NUM!"),
        ("=NEGBINOM.DIST(1,0,0.5,TRUE)", "#NUM!"),
    ]);
}

/// The examples of SKEW to RANK.AVG, their domain and shape errors, and
/// SLOPE and INTERCEPT skipping pairs that hold a non-number.
#[cfg(feature = "analysis")]
#[test]
fn descriptive_statistics() {
    assert_results_on(
        &[&["2", "1"], &["n/a", "2"], &["6", "3"]],
        &[
            ("=SKEW({3,4,5,2,3,4,5,6,4,7})", "~0.359543"),
            ("=SKEW.P({3,4,5,2,3,4,5,6,4,7})", "~0.303193"),
            ("=KURT({3,4,5,2,3,4,5,6,4,7})", "~-0.151799637"),
            ("=AVEDEV({4,5,6,7,5,4,3})", "~1.020408163"),
            ("=DEVSQ({4,5,8,7,11,4,3})", "48"),
            ("=HARMEAN({4,5,8,7,11,4,3})", "~5.028376"),
            ("=TRIMMEAN({4,5,6,7,2,3,4,5,1,2,3},0.2)", "~3.777777778"),
            ("=SLOPE({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})", "~0.305556"),
            ("=RSQ({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})", "~0.05795"),
            ("=STEYX({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})", "~3.305719"),
            ("=INTERCEPT({2,3,9,1,8},{6,5,11,7,5})", "~0.0483871"),
            ("=PEARSON({9,7,5,3,1},{10,6,1,5,3})", "~0.699379"),
            (
                "=FORECAST.LINEAR(30,{6,7,9,15,21},{20,28,31,38,40})",
                "~10.607253",
            ),
            ("=PERCENTILE.EXC({1,2,3,6,6,6,7,8,9},0.25)", "2.5"),
            ("=QUARTILE.EXC({6,7,15,36,39,40,41,42,43,47,49},1)", "15"),
            ("=QUARTILE.EXC({6,7,15,36,39,40,41,42,43,47,49},3)", "43"),
            ("=PERCENTRANK.INC({13,12,11,8,4,3,2,1,1,1},2)", "0.333"),
            ("=PERCENTRANK.INC({13,12,11,8,4,3,2,1,1,1},4)", "0.555"),
            ("=PERCENTRANK.INC({13,12,11,8,4,3,2,1,1,1},8)", "0.666"),
            ("=PERCENTRANK.INC({13,12,11,8,4,3,2,1,1,1},5)", "0.583"),
            ("=PERCENTRANK.EXC({1,2,3,6,6,6,7,8,9},7)", "0.7"),
            ("=PERCENTRANK.EXC({1,2,3,6,6,6,7,8,9},5.43)", "0.381"),
            ("=PERCENTRANK.EXC({1,2,3,6,6,6,7,8,9},5.43,1)", "0.3"),
            ("=RANK.AVG(94,{89,88,92,101,94,97,95})", "4"),
            ("=SKEW({1,2})", "#DIV/0!"),
            ("=KURT({1,2,3})", "#DIV/0!"),
            ("=SKEW.P({4,4,4})", "#DIV/0!"),
            ("=HARMEAN({1,0})", "#NUM!"),
            ("=TRIMMEAN({1,2},1)", "#NUM!"),
            ("=PERCENTILE.EXC({1,2,3},0.1)", "#NUM!"),
            ("=QUARTILE.EXC({1,2,3},4)", "#NUM!"),
            ("=PERCENTRANK.INC({1,2},9)", "#N/A"),
            ("=PERCENTRANK.INC({1,2},1,0)", "#NUM!"),
            ("=RANK.AVG(9,{1,2})", "#N/A"),
            ("=SLOPE({1,2},{1})", "#N/A"),
            ("=SLOPE({1,2},{3,3})", "#DIV/0!"),
            ("=STEYX({1,2},{1,2})", "#DIV/0!"),
            // Only (1, 2) and (3, 6) remain: slope 2, intercept 0.
            ("=SLOPE(A1:A3,B1:B3)", "~2.000000000000"),
            ("=INTERCEPT(A1:A3,B1:B3)", "~0.000000000000"),
        ],
    );
}

/// The examples of the security and depreciation functions (dates are
/// serials) and the remarks.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn security_functions() {
    assert_results(&[
        ("=ACCRINT(39508,39691,39569,0.1,1000,2,0)", "~16.666667"),
        ("=ACCRINT(39512,39691,39569,0.1,1000,2,0,0)", "~15.555556"),
        ("=ACCRINT(39543,39691,39569,0.1,1000,2,0,1)", "~7.2222222"),
        ("=ACCRINTM(39539,39614,0.1,1000,3)", "~20.54794521"),
        ("=AMORDEGRC(2400,39679,39813,300,1,0.15,1)", "776"),
        ("=AMORLINC(2400,39679,39813,300,1,0.15,0.15)", "360"),
        ("=COUPDAYBS(40568,40862,2,1)", "71"),
        ("=COUPDAYS(40568,40862,2,1)", "181"),
        ("=COUPDAYSNC(40568,40862,2,1)", "110"),
        ("=COUPNCD(40568,40862,2,1)", "40678"),
        ("=COUPNUM(39107,39767,2,1)", "4"),
        ("=COUPPCD(40568,40862,2,1)", "40497"),
        // The page lists maturity 1/1/2048, but its result 0.001038 is the
        // result for 1/1/2038 (serial 50406); 1/1/2048 gives 0.000686. The
        // DURATION page uses the same dates with 1/1/2048, and that example
        // matches.
        ("=DISC(43282,50406,97.975,100,1)", "~0.001038"),
        ("=DOLLARDE(1.02,16)", "~1.125"),
        ("=DOLLARDE(1.1,32)", "~1.3125"),
        ("=DOLLARFR(1.125,16)", "~1.02"),
        ("=DOLLARFR(1.125,32)", "~1.04"),
        ("=DURATION(43282,54058,0.08,0.09,2,1)", "~10.9191453"),
        ("=INTRATE(39493,39583,1000000,1014420,2)", "~0.05768"),
        ("=MDURATION(39448,42370,0.08,0.09,2,1)", "~5.736"),
        (
            "=ODDFPRICE(39763,44256,39736,39873,0.0785,0.0625,100,2,1)",
            "~113.60",
        ),
        (
            "=ODDFYIELD(39763,44256,39736,39873,0.0575,84.5,100,2,0)",
            "~0.0772",
        ),
        (
            "=ODDLPRICE(39485,39614,39370,0.0375,0.0405,100,2,0)",
            "~99.88",
        ),
        (
            "=ODDLYIELD(39558,39614,39440,0.0375,99.875,100,2,0)",
            "~0.04519",
        ),
        ("=PRICE(39493,43054,0.0575,0.065,100,2,0)", "~94.63"),
        ("=PRICEDISC(39494,39508,0.0525,100,2)", "~99.80"),
        ("=PRICEMAT(39493,39551,39397,0.061,0.061,0)", "~99.98"),
        ("=RECEIVED(39493,39583,1000000,0.0575,2)", "~1014584.65"),
        ("=TBILLEQ(39538,39600,0.0914)", "~0.09415"),
        ("=TBILLPRICE(39538,39600,0.09)", "~98.45"),
        ("=TBILLYIELD(39538,39600,98.45)", "~0.0914"),
        ("=VDB(2400,300,3650,0,1)", "~1.32"),
        ("=VDB(2400,300,120,0,1)", "~40.00"),
        ("=VDB(2400,300,10,0,1)", "~480.00"),
        ("=VDB(2400,300,120,6,18)", "~396.31"),
        ("=VDB(2400,300,120,6,18,1.5)", "~311.81"),
        ("=VDB(2400,300,10,0,0.875,1.5)", "~315.00"),
        ("=YIELD(39493,42689,0.0575,95.04287,100,2,0)", "~0.065"),
        ("=YIELDDISC(39494,39508,99.795,100,2)", "~0.052823"),
        (
            "=YIELDMAT(39522,39755,39394,0.0625,100.0123,0)",
            "~0.060954",
        ),
        ("=ISPMT(Data!A1/10,Data!A1,Data!A3,Data!B3)", "-2"),
        (
            "=COUPDAYS(DATE(2011,1,25),DATE(2011,11,15),2,Data!F1)",
            "180",
        ),
        ("=COUPPCD(\"2011-01-25\",\"2011-11-15\",2,1)", "40497"),
        ("=COUPDAYS(40862,40568,2,1)", "#NUM!"),
        ("=COUPDAYS(40568,40862,3,1)", "#NUM!"),
        ("=COUPDAYS(40568,40862,2,5)", "#NUM!"),
        ("=COUPDAYS(-1,40862,2,1)", "#VALUE!"),
        ("=PRICE(39493,43054,-0.01,0.065,100,2)", "#NUM!"),
        ("=PRICE(39493,43054,0.0575,0.065,0,2)", "#NUM!"),
        ("=YIELD(39493,42689,0.0575,0,100,2)", "#NUM!"),
        ("=ACCRINT(39569,39691,39508,0.1,1000,2)", "#NUM!"),
        ("=ACCRINTM(39539,39614,0,1000)", "#NUM!"),
        ("=DISC(43282,54058,0,100)", "#NUM!"),
        ("=RECEIVED(39493,39583,1000,4,2)", "#NUM!"),
        ("=TBILLPRICE(39538,39904,0.09)", "#NUM!"),
        ("=TBILLYIELD(39538,39600,0)", "#NUM!"),
        (
            "=ODDFPRICE(39763,44256,39736,39872,0.0785,0.0625,100,2,1)",
            "#NUM!",
        ),
        ("=ODDLPRICE(39370,39614,39485,0.0375,0.0405,100,2)", "#NUM!"),
        ("=DOLLARDE(1.02,0.5)", "#DIV/0!"),
        ("=DOLLARFR(1.02,-1)", "#NUM!"),
        ("=ISPMT(0.1,1,0,1000)", "#DIV/0!"),
        ("=VDB(2400,300,10,2,1)", "#NUM!"),
        ("=AMORDEGRC(2400,39679,39813,300,1,0.22)", "#NUM!"),
        ("=AMORLINC(2400,39679,39813,300,1,0.15,2)", "#NUM!"),
    ]);
}

/// The examples of the annuity, depreciation and cash-flow functions,
/// dates and references read as numbers, and the domain and convergence
/// errors of the remarks.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn finance_functions() {
    assert_results(&[
        ("=NPER(0.12/12,-100,-1000,10000,1)", "~59.6738657"),
        ("=NPER(0.12/12,-100,-1000,10000)", "~60.0821229"),
        ("=NPER(0.12/12,-100,-1000)", "~-9.57859404"),
        ("=CUMIPMT(0.09/12,30*12,125000,13,24,0)", "~-11135.23213"),
        ("=CUMIPMT(0.09/12,30*12,125000,1,1,0)", "~-937.50000000"),
        ("=CUMPRINC(0.09/12,30*12,125000,13,24,0)", "~-934.1071234"),
        ("=CUMPRINC(0.09/12,30*12,125000,1,1,0)", "~-68.27827118"),
        ("=DB(1000000,100000,6,1,7)", "~186083.33"),
        ("=DB(1000000,100000,6,2,7)", "~259639.42"),
        ("=DB(1000000,100000,6,7,7)", "~15845.10"),
        ("=DDB(2400,300,10,1)", "~480.000000000000"),
        ("=DDB(2400,300,10,10)", "~22.1225472"),
        ("=EFFECT(0.0525,4)", "~0.0535427"),
        ("=NOMINAL(0.053543,4)", "~0.05250032"),
        ("=RRI(96,10000,11000)", "~0.0009933"),
        ("=PDURATION(0.025,2000,2200)", "~3.86"),
        ("=SLN(30000,7500,10)", "~2250.000000000000"),
        ("=SYD(30000,7500,10,1)", "~4090.91"),
        ("=SYD(30000,7500,10,10)", "~409.09"),
        ("=NPER(0,-10,100)", "~10.000000000000"),
        ("=EFFECT(0.0525,4.9)", "~0.0535427"),
        ("=CUMIPMT(0.1,3,100,1,1,1)", "~0.000000000000"),
        ("=DDB(100,20,2,2,4)", "~0.000000000000"),
        ("=RRI(2,-100,-121)", "~0.100000000000"),
        ("=NPER(0,0,100)", "#DIV/0!"),
        ("=NPER(0.1,0,100,100)", "#NUM!"),
        ("=CUMIPMT(0,12,100,1,12,0)", "#NUM!"),
        ("=CUMPRINC(0.1,0,100,1,1,0)", "#NUM!"),
        ("=CUMIPMT(0.1,12,-100,1,12,0)", "#NUM!"),
        ("=CUMPRINC(0.1,12,100,0,12,0)", "#NUM!"),
        ("=CUMIPMT(0.1,12,100,4,3,0)", "#NUM!"),
        ("=CUMPRINC(0.1,12,100,1,13,0)", "#NUM!"),
        ("=CUMIPMT(0.1,12,100,1,12,2)", "#NUM!"),
        ("=DB(100,10,5,1,13)", "#NUM!"),
        ("=DB(-100,10,5,1)", "#NUM!"),
        ("=DDB(100,10,5,6)", "#NUM!"),
        ("=DDB(100,10,5,1,0)", "#NUM!"),
        ("=EFFECT(0,4)", "#NUM!"),
        ("=NOMINAL(0.1,0.9)", "#NUM!"),
        ("=RRI(0,100,110)", "#NUM!"),
        ("=RRI(2,0,100)", "#DIV/0!"),
        ("=RRI(2,100,-110)", "#NUM!"),
        ("=PDURATION(0,100,110)", "#NUM!"),
        ("=PDURATION(0.1,100,0)", "#NUM!"),
        ("=SLN(100,10,0)", "#DIV/0!"),
        ("=SYD(100,10,5,6)", "#NUM!"),
        ("=EFFECT(\"bad\",4)", "#VALUE!"),
        ("=SLN(100,10)", "#VALUE!"),
    ]);
    // The XNPV, XIRR, MIRR and FVSCHEDULE examples.
    assert_results_on(
        &[
            &["-10000", "39448", "-120000", "0.09"],
            &["2750", "39508", "39000", "0.11"],
            &["4250", "39751", "30000", "0.1"],
            &["3250", "39859", "21000"],
            &["2750", "39904", "37000"],
            &["", "", "46000"],
        ],
        &[
            ("=XNPV(0.09,A1:A5,B1:B5)", "~2086.65"),
            ("=XIRR(A1:A5,B1:B5)", "~0.37336254"),
            ("=XIRR(A1:A5,B1:B5,0.1)", "~0.37336254"),
            ("=MIRR(C1:C6,0.1,0.12)", "~0.126094130"),
            ("=FVSCHEDULE(1,D1:D4)", "~1.33090"),
        ],
    );
    // Dates are truncated to whole days; text in a cash flow range is
    // skipped and a logical value is refused.
    assert_results_on(
        &[
            &["-100", "1.9", "-100", "1", "-100", "-100"],
            &["110", "366.9", "55", "366", "90", "ignored"],
            &["", "", "55", "366", "", "=TRUE()"],
            &["", "", "", "", "", "121"],
        ],
        &[
            ("=XNPV(0.1,A1:A2,B1:B2)", "~0.000000000"),
            ("=XNPV(0.1,C1:C3,D1:D3)", "~0.000000000"),
            ("=XIRR(E1:E2,D1:D2)", "~-0.100000000"),
            ("=MIRR(F1:F5,0.1,0.1)", "~0.210000000000"),
            ("=FVSCHEDULE(1,F1:F5)", "#VALUE!"),
        ],
    );
    assert_results_on(
        &[
            &["-100", "1", "2", "1", "1", "100", "1", "0.1", "", "0.1"],
            &[
                "110", "366", "1", "2958466", "bad", "110", "1", "=TRUE()", "", "=1/0",
            ],
        ],
        &[
            ("=FVSCHEDULE(1,H1:H2)", "#VALUE!"),
            ("=MIRR(F1:F2,0.1,0.1)", "#DIV/0!"),
            ("=XNPV(0.1,A1:A2,C1:C2)", "#NUM!"),
            ("=XNPV(0.1,A1:A2,B1)", "#NUM!"),
            ("=XNPV(0.1,A1:A2,D1:D2)", "#VALUE!"),
            ("=XNPV(0.1,A1:A2,E1:E2)", "#VALUE!"),
            ("=XIRR(F1:F2,B1:B2)", "#NUM!"),
            ("=XIRR(A1:A2,G1:G2)", "#NUM!"),
            ("=XIRR(A1:A2,B1:B2,-1)", "#NUM!"),
            ("=XIRR(A1:A2,B1:B2,10^100)", "#NUM!"),
            ("=FVSCHEDULE(1,J1:J2)", "#DIV/0!"),
        ],
    );
}

/// The examples of the rounding, factorial, combinatorics, sum-of-squares
/// and series functions, and results beyond the double range.
#[cfg(feature = "analysis")]
#[test]
fn analysis_math_functions() {
    assert_results(&[
        ("=CEILING.MATH(24.3,5)", "25"),
        ("=CEILING.MATH(6.7)", "7"),
        ("=CEILING.MATH(-8.1,2)", "-8"),
        ("=CEILING.MATH(-5.5,2,-1)", "-6"),
        ("=FLOOR.MATH(24.3,5)", "20"),
        ("=FLOOR.MATH(6.7)", "6"),
        ("=FLOOR.MATH(-8.1,2)", "-10"),
        ("=FLOOR.MATH(-5.5,2,-1)", "-4"),
        ("=FLOOR.MATH(7,0)", "0"),
        ("=SQRTPI(1)", "~1.772454"),
        ("=SQRTPI(2)", "~2.506628"),
        ("=SQRTPI(-1)", "#NUM!"),
        ("=FACT(5)", "120"),
        ("=FACT(1.9)", "1"),
        ("=FACT(0)", "1"),
        ("=FACT(1)", "1"),
        ("=FACT(-1)", "#NUM!"),
        ("=FACTDOUBLE(6)", "48"),
        ("=FACTDOUBLE(7)", "105"),
        ("=COMBIN(8,2)", "28"),
        ("=COMBIN(2,3)", "#NUM!"),
        ("=COMBINA(4,3)", "20"),
        ("=COMBINA(10,3)", "220"),
        ("=PERMUT(100,3)", "970200"),
        ("=PERMUT(3,2)", "6"),
        ("=PERMUT(2,3)", "#NUM!"),
        ("=PERMUTATIONA(3,2)", "9"),
        ("=PERMUTATIONA(2,2)", "4"),
        ("=MULTINOMIAL(2,3,4)", "1260"),
        ("=MULTINOMIAL(-1)", "#NUM!"),
        ("=FACT(170)", "~7.2574156153080E306"),
        ("=FACT(171)", "#NUM!"),
        ("=FACT()", "#VALUE!"),
        ("=FACTDOUBLE(301)", "#NUM!"),
        ("=COMBIN(1E9,5E8)", "#NUM!"),
        ("=PERMUT(1E9,1E6)", "#NUM!"),
        ("=PERMUTATIONA(10,400)", "#NUM!"),
        ("=SUMSQ(3,4)", "25"),
        ("=SUMX2MY2({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})", "-55"),
        ("=SUMX2PY2({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})", "521"),
        ("=SUMXMY2({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})", "79"),
        ("=SUMXMY2({2,\"skip\"},{6,5})", "16"),
        ("=SUMXMY2({2,3,9,1,8,7,5},{6,5,11,7,5,4})", "#N/A"),
        (
            "=SERIESSUM(PI()/4,0,2,{1,-0.5,0.0416666666666667,-0.00138888888888889})",
            "~0.707103",
        ),
    ]);
}

/// The ROMAN, ARABIC, BASE and DECIMAL examples, every Roman form read
/// back, and the remarks.
#[test]
fn numeral_functions() {
    assert_results(&[
        ("=ROMAN(499,0)", "CDXCIX"),
        ("=ROMAN(499,1)", "LDVLIV"),
        ("=ROMAN(499,2)", "XDIX"),
        ("=ROMAN(499,3)", "VDIV"),
        ("=ARABIC(\"mcmxii\")", "1912"),
        ("=ARABIC(\"mxmvii\")", "1997"),
        ("=BASE(100,16)", "64"),
        ("=BASE(16,2)", "10000"),
        ("=BASE(16,2,8)", "00010000"),
        ("=DECIMAL(\"zap\",36)", "45745"),
        ("=ROMAN(499,TRUE)", "CDXCIX"),
        ("=ROMAN(499,FALSE)", "ID"),
        ("=ROMAN(0)", ""),
        ("=ARABIC(\" -MMXI \")", "-2011"),
        ("=ROMAN(-1)", "#VALUE!"),
        ("=ROMAN(4000)", "#VALUE!"),
        ("=ARABIC(12)", "#VALUE!"),
        ("=ARABIC(\"XIIZ\")", "#VALUE!"),
        ("=ARABIC(REPT(\"M\",256))", "#VALUE!"),
        ("=BASE(-1,2)", "#NUM!"),
        ("=BASE(2^53,2)", "#NUM!"),
        ("=BASE(7,1)", "#NUM!"),
        ("=BASE(7,37)", "#NUM!"),
        ("=BASE(7,2,256)", "#NUM!"),
        ("=DECIMAL(\"2\",2)", "#NUM!"),
        ("=DECIMAL(\"FF\",37)", "#NUM!"),
        ("=BASE(Data!B2,16,4)", "0014"),
        ("=DECIMAL(\"ff\",Data!A2*8)", "255"),
    ]);
    // Every number from 0 to 3999 reads back from each of its five forms.
    let read_back: Vec<(String, &str)> = (0..=3999)
        .map(|number| {
            let forms: Vec<String> = (0..=4)
                .map(|form| format!("ARABIC(ROMAN({number},{form}))={number}"))
                .collect();
            (format!("=AND({})", forms.join(",")), "TRUE")
        })
        .collect();
    assert_results_on(&[], &read_back);
}

/// The examples of the trigonometric functions, rounded as published, and
/// the domain rules of the remarks.
#[test]
fn trigonometric_functions() {
    assert_results(&[
        ("=ACOS(-0.5)", "~2.094395102"),
        ("=ACOSH(10)", "~2.9932228"),
        ("=ACOT(2)", "~0.4636"),
        ("=ACOTH(6)", "~0.168"),
        ("=ASIN(-0.5)", "~-0.523598776"),
        ("=ASINH(-2.5)", "~-1.647231146"),
        ("=ASINH(10)", "~2.99822295"),
        ("=ATAN2(-1,-1)", "~-2.35619449"),
        ("=ATANH(0.76159416)", "~1.00000001"),
        ("=ATANH(-0.1)", "~-0.100335348"),
        ("=COS(1.047)", "~0.5001711"),
        ("=COS(60*PI()/180)", "~0.50000"),
        ("=COSH(4)", "~27.308233"),
        ("=COSH(EXP(1))", "~7.6101251"),
        ("=COT(30)", "~-0.156"),
        ("=COT(45)", "~0.617"),
        ("=COTH(2)", "~1.037"),
        ("=CSC(15)", "~1.538"),
        ("=CSCH(1.5)", "~0.4696"),
        ("=RADIANS(270)", "~4.712389"),
        ("=SEC(45)", "~1.90359"),
        ("=SEC(30)", "~6.48292"),
        ("=SIN(PI())", "~0.00000"),
        ("=SIN(30*PI()/180)", "~0.50000"),
        ("=TAN(0.785)", "~0.99920"),
        ("=TANH(-2)", "~-0.964028"),
        ("=TANH(0.5)", "~0.462117"),
        ("=ACOS(1.5)", "#NUM!"),
        ("=ASIN(-1.5)", "#NUM!"),
        ("=ACOSH(0.5)", "#NUM!"),
        ("=ATANH(1)", "#NUM!"),
        ("=ACOTH(0.5)", "#NUM!"),
        ("=ACOTH(-1)", "#NUM!"),
        ("=ATAN2(0,0)", "#DIV/0!"),
        ("=COT(0)", "#DIV/0!"),
        ("=CSC(0)", "#DIV/0!"),
        ("=COTH(0)", "#DIV/0!"),
        ("=CSCH(0)", "#DIV/0!"),
        ("=COT(2^27)", "#NUM!"),
        ("=SEC(-2^27)", "#NUM!"),
        ("=SECH(2^27)", "#NUM!"),
        ("=SINH(1000)", "#NUM!"),
        ("=COSH(-1000)", "#NUM!"),
        ("=SIN(Data!F1)", "0"),
        ("=CEILING.PRECISE(-Data!A3-0.5,Data!A2)", "-2"),
    ]);
}

/// Domains, arities, rounding with negative and extreme digits, PRODUCT and
/// SUMPRODUCT over scalars and ranges, and parity and multiple rounding at
/// the integer limits.
#[test]
fn math_functions() {
    assert_results_on(
        &[
            &["2", "3", "1", "1"],
            &["=TRUE()", "4", "2", "=#REF!"],
            &["'9", "5", "", ""],
            &["", "6"],
            &["'4"],
        ],
        &[
            ("=LN(0)", "#NUM!"),
            ("=LOG(10,1)", "#NUM!"),
            ("=LOG(100)", "2"),
            ("=QUOTIENT(1,0)", "#DIV/0!"),
            ("=POWER(-2,0.5)", "#NUM!"),
            ("=EXP(1000)", "#NUM!"),
            ("=ROUNDUP(149,-2)", "200"),
            ("=ROUNDDOWN(-149,-2)", "-100"),
            ("=ROUNDDOWN(2,308)", "2"),
            ("=ROUNDUP(1,309)", "#NUM!"),
            // Scalar TRUE and "3" count; logical and text cells do not.
            ("=PRODUCT(TRUE,\"3\",A1:A4)", "6"),
            ("=SUMPRODUCT(A1:A4,B1:B4)", "6"),
            ("=SUMPRODUCT(C1:C2,B1)", "#VALUE!"),
            ("=SUMPRODUCT(C1:D1,C1:C2)", "#VALUE!"),
            ("=SUMPRODUCT(D1:D2,C1:C2)", "#REF!"),
            ("=MROUND(0,-3)", "0"),
            ("=MROUND(6,4)", "8"),
            ("=MROUND(6,-4)", "#NUM!"),
            ("=EVEN(9223372036854775808)", "#NUM!"),
            ("=ODD(-9223372036854775808)", "#NUM!"),
            ("=MROUND(1E308,1E-308)=1E308", "TRUE"),
        ],
    );
}

/// PV, FV, PMT, NPV, IRR, RATE, IPMT and PPMT, at zero and near-zero rates
/// and payments at the beginning of a period, and roots that do not
/// converge.
#[test]
fn financial_functions() {
    assert_results(&[
        ("=PV(0.1,5,100)", "~-379.07867694"),
        ("=FV(0.1,5,100)", "~-610.51000000"),
        ("=PMT(0.1,5,1000)", "~-263.797480795"),
        ("=NPV(0.1,100,200)", "~256.198347107"),
        (
            "=IRR({-70000,12000,15000,18000,21000,26000})",
            "~0.0866309480",
        ),
        ("=RATE(10,-150,1000)", "~0.0814416565"),
        ("=IPMT(0.1,1,10,1000)", "~-100.00000000"),
        ("=PPMT(0.1,1,10,1000)", "~-62.745394883"),
        ("=IPMT(0.1,1.5,10,1000)", "~-96.937469548"),
        ("=PPMT(0.1,1.5,10,1000)", "~-65.807925335"),
        ("=PV(0,10,100,500)", "~-1500.0000000"),
        ("=FV(0,10,100,500)", "~-1500.0000000"),
        ("=PMT(1E-14,360,250000)", "~-694.44444444"),
        ("=IPMT(0.1,1,10,1000,0,7)", "~0.0000000000"),
        ("=NPV(-1,100)", "#DIV/0!"),
        ("=PMT(0,0,1000)", "#DIV/0!"),
        ("=IRR({-100,50,-10})", "#NUM!"),
        ("=RATE(10,100,1000)", "#NUM!"),
        ("=IRR({-100,110},-1)", "#NUM!"),
    ]);
}

/// AVERAGEA to VARPA count text as 0 and logical values in ranges; their
/// examples, order statistics and conditional extremes.
#[test]
fn statistics_functions() {
    assert_results_on(
        &[
            &["10", "1345", "0", "=FALSE()", "5", "-4", "west"],
            &["7", "1301", "0.2", "0.2", "3", "8", "east"],
            &["9", "1368", "0.5", "0.5", "1", "3", "west"],
            &["2", "1322", "0.4", "0.4", "", "", ""],
            &["Not available", "1310", "=TRUE()", "0.8"],
            &["", "1370"],
            &["", "1318"],
            &["", "1350"],
            &["", "1303"],
            &["", "1299"],
        ],
        &[
            ("=AVERAGEA(A1:A5)", "~5.600000000000"),
            // The page shows 5.6 for AVERAGEA(A2:A5,A7) with A7 empty, but
            // its remarks say empty cells are skipped, which gives 28 / 4.
            ("=AVERAGEA(A1:A4,A7)", "~7.000000000000"),
            ("=MAXA(C1:C5)", "1"),
            ("=MINA(D1:D5)", "0"),
            ("=STDEVA(B1:B10)", "~27.46391572"),
            ("=STDEVPA(B1:B10)", "~26.05456"),
            ("=VARA(B1:B10)", "~754.26667"),
            ("=VARPA(B1:B10)", "~678.84"),
            ("=MEDIAN({5,1,3,3})", "3"),
            ("=MODE.SNGL({5,1,3,3})", "3"),
            ("=LARGE({5,1,3,3},2)", "3"),
            ("=LARGE({5,1,3,3},0)", "#NUM!"),
            ("=SMALL({5,1,3,3},9223372036854775807)", "#NUM!"),
            ("=PERCENTILE.INC({5,1,3,3},0.25)", "2.5"),
            ("=QUARTILE.INC({5,1,3,3},3)", "3.5"),
            ("=RANK.EQ(3,E1:E3,1)", "2"),
            ("=RANK.EQ(4,E1:E3)", "#N/A"),
            ("=RANK.EQ(4,E1:E3,1)", "#N/A"),
            ("=MAXIFS(F1:F3,G1:G3,\"w*\")", "3"),
            ("=MINIFS(F1:F3,G1:G3,\"w*\")", "-4"),
            ("=MAXIFS(F1,F1:F2,1)", "#VALUE!"),
            ("=MAXIFS(E1:F2,A1:D1,\"x\")", "#VALUE!"),
        ],
    );
    assert_results(&[
        ("=AVERAGEA(Data!D1:D3)", "2.5"),
        ("=MAXA(Data!D2,-1)", "0"),
        ("=VARPA(Data!A1:A3,TRUE)", "0.6875"),
        ("=ROUND(STDEVA(\"2\",4),6)", "1.414214"),
    ]);
}

/// SUBTOTAL applies each function's own error and coercion rules to the
/// cells it reads.
#[test]
fn subtotal_function_rules() {
    assert_results_on(
        &[
            &["2", "2", "1E308", "1", "1"],
            &["4", "4", "1E308", "2", "=1/0"],
            &["'6", "4"],
            &["=TRUE()", "4"],
            &["", "5"],
            &["", "5"],
            &["", "7"],
            &["", "9"],
        ],
        &[
            ("=SUBTOTAL(2,A1:A5)", "2"),
            ("=SUBTOTAL(3,A1:A5)", "4"),
            ("=SUBTOTAL(9,E1:E2)", "#DIV/0!"),
            ("=SUBTOTAL(11,B1:B8)", "4"),
            ("=SUBTOTAL(1,C1:C2)=1E308", "TRUE"),
            ("=SUBTOTAL(12,D1)", "#VALUE!"),
            ("=SUBTOTAL(109,D1:D2)", "3"),
            ("=SUBTOTAL(112,D1)", "#VALUE!"),
        ],
    );
}

/// Text functions count code points, not bytes; their boundaries, locale
/// rules and output limit.
#[test]
fn text_functions() {
    let over_limit = "a".repeat(16 * 1024 * 1024 + 1);
    assert_results_on(
        &[
            &["a", "=#REF!", over_limit.as_str()],
            &[""],
            &["=TRUE()"],
            &["2"],
        ],
        &[
            ("=TEXTJOIN(\"|\",TRUE,A1:A4)", "a|TRUE|2"),
            ("=TEXTJOIN(\",\",FALSE,B1)", "#REF!"),
            ("=LEFT(\"café😀ü\",4)", "café"),
            ("=LEFT(\"café😀ü\",0)", ""),
            ("=LEFT(\"café😀ü\",99)", "café😀ü"),
            ("=LEFT(\"café😀ü\")", "c"),
            ("=RIGHT(\"café😀ü\",2)", "😀ü"),
            ("=RIGHT(\"café😀ü\")", "ü"),
            ("=MID(\"café😀ü\",4,2)", "é😀"),
            ("=MID(\"café😀ü\",6,9)", "ü"),
            ("=MID(\"café😀ü\",7,1)", ""),
            ("=MID(12.5,2,2)", "2."),
            ("=SUBSTITUTE(\"😀a😀a\",\"😀\",\"é\",2)", "😀aéa"),
            ("=REPLACE(\"a😀ç\",2,1,\"ZZ\")", "aZZç"),
            ("=REPLACE(\"a😀ç\",4,99,\"!\")", "a😀ç!"),
            ("=SUBSTITUTE(\"abc\",\"\",\"x\")", "abc"),
            ("=SUBSTITUTE(\"abc\",\"a\",\"x\",0)", "#VALUE!"),
            ("=FIND(\"😀\",\"é😀z\")", "2"),
            ("=SEARCH(\"BAR\",\"xxBarista\")", "3"),
            ("=SEARCH(\"a?c\",\"--A😀C--\")", "3"),
            ("=SEARCH(\"~*\",\"a*b\")", "2"),
            ("=SEARCH(\"b*r\",\"xxBarista\")", "3"),
            ("=FIND(\"a\",\"abc\",5)", "#VALUE!"),
            ("=FIND(\"\",\"abc\",4)", "4"),
            ("=FIND(\"bar\",\"Bar\")", "#VALUE!"),
            ("=FIND(\"abcdef\",\"abc\")", "#VALUE!"),
            // 2,000 x 2,001 comparisons is past the search budget.
            ("=FIND(REPT(\"b\",2000),REPT(\"a\",2001))", "#NUM!"),
            ("=VALUE(\"1,234.5%\")", "~12.3450000000"),
            (
                "=NUMBERVALUE(\" 1.234,5 %% \",\",\",\".\")",
                "~0.123450000000",
            ),
            ("=NUMBERVALUE(\"1 234,5\",\",\",\" \")", "~1234.50000000"),
            ("=NUMBERVALUE(\"1,2,3\",\",\",\".\")", "#VALUE!"),
            ("=NUMBERVALUE(\"1.2\",\".\",\".\")", "#VALUE!"),
            ("=NUMBERVALUE(\"1,2.3\",\",\",\".\")", "#VALUE!"),
            (
                "=CLEAN(\"a\"&CHAR(1)&\"b\"&CHAR(31)&\"c\"&CHAR(127))",
                "abc\u{7f}",
            ),
            ("=CLEAN(C1)", "#NUM!"),
            ("=REPT(\"\",9223372036854775807)", ""),
            ("=REPT(\"ab\",8388609)", "#NUM!"),
            ("=REPT(\"a\",-1)", "#VALUE!"),
            ("=CHAR(0)", "#VALUE!"),
            ("=CHAR(256)", "#VALUE!"),
            ("=UNICHAR(128512)", "😀"),
            ("=UNICHAR(55296)", "#VALUE!"),
            ("=CODE(\"é\")", "233"),
            ("=CODE(\"\")", "#VALUE!"),
            ("=UNICODE(\"😀\")", "128512"),
            ("=CODE(CHAR(1))", "1"),
            ("=CODE(CHAR(233))", "233"),
            ("=CODE(CHAR(255))", "255"),
            ("=UNICODE(UNICHAR(1114111))", "1114111"),
            ("=UPPER(\"straße\")", "STRASSE"),
            ("=LOWER(\"İ\")", "i\u{307}"),
            ("=CONCAT(\"A\",1,TRUE)", "A1TRUE"),
            ("=CONCATENATE(\"x\",\"y\")", "xy"),
            ("=\"Hello \"\"Q\"\"\"", "Hello \"Q\""),
        ],
    );
}

/// Serials keep Excel's 1900 leap day; times wrap and parse with a meridiem
/// or a date; month arithmetic clamps; weekday, week number and workday
/// tables; day-count conventions.
#[test]
fn date_and_time_functions() {
    assert_results_on(
        &[&["=DATE(2024,1,8)"], &["=DATE(2024,1,8)"]],
        &[
            ("=DAY(59)", "28"),
            ("=DAY(60)", "29"),
            ("=MONTH(60)", "2"),
            ("=DAY(61)", "1"),
            ("=DAY(9223372036854775807)", "#NUM!"),
            ("=DATE(1900,1,1)", "1"),
            ("=DATE(1900,2,29)", "60"),
            ("=DATE(1900,3,1)", "61"),
            ("=DATE(1900,1,60)", "60"),
            ("=DATE(2024,2,29)", "45351"),
            ("=DATE(2024,13,1)", "45658"),
            ("=DATEVALUE(\"2024-02-29\")", "45351"),
            ("=TEXT(DATE(2024,2,29),\"yyyy-mm-dd\")", "2024-02-29"),
            ("=YEAR(DATE(9999,12,31))", "9999"),
            ("=DAY(DATE(9999,12,31))", "31"),
            ("=DATE(9.2E18,-9.2E18,-9.2E18)", "#NUM!"),
            ("=TIME(25,1,2)", "~0.0423842592593"),
            ("=TIME(-1,0,0)", "#NUM!"),
            ("=TIMEVALUE(\"12:30 PM\")", "~0.520833333333333"),
            ("=HOUR(\"12:30 AM\")", "0"),
            ("=MINUTE(\"23:59:58\")", "59"),
            ("=SECOND(\"23:59:58\")", "58"),
            ("=HOUR(\"2024-06-01 14:00\")", "14"),
            ("=TIMEVALUE(\"2024-06-01T14:00\")", "~0.583333333333333"),
            ("=TIMEVALUE(\"not-a-date 14:00\")", "#VALUE!"),
            ("=TIMEVALUE(\"2024-02-30 14:00\")", "#VALUE!"),
            ("=TIMEVALUE(\"2024-06-01 junk 14:00\")", "#VALUE!"),
            ("=HOUR(\"not-a-date 14:00\")", "#VALUE!"),
            ("=HOUR(\"2024-02-30 14:00\")", "#VALUE!"),
            ("=HOUR(\"2024-06-01 junk 14:00\")", "#VALUE!"),
            ("=EDATE(DATE(2024,1,31),1)=DATE(2024,2,29)", "TRUE"),
            ("=EOMONTH(DATE(2024,1,31),1)=DATE(2024,2,29)", "TRUE"),
            ("=EDATE(0,-1)", "#NUM!"),
            ("=WEEKDAY(DATE(2024,1,1),2)", "1"),
            ("=WEEKDAY(DATE(2024,1,1),3)", "0"),
            ("=WEEKDAY(DATE(2024,1,1),12)", "7"),
            ("=WEEKDAY(DATE(2024,1,1),4)", "#NUM!"),
            ("=WEEKDAY(1)", "1"),
            ("=WEEKDAY(59)", "3"),
            ("=WEEKDAY(60)", "4"),
            ("=WEEKDAY(61)", "5"),
            ("=WORKDAY(1,1)", "2"),
            ("=WORKDAY(59,1)", "60"),
            ("=WEEKNUM(1)", "1"),
            ("=WEEKNUM(60)", "9"),
            ("=WEEKNUM(DATE(2024,1,1),21)", "1"),
            ("=NETWORKDAYS(59,61)", "3"),
            // A1:A2 hold the same holiday twice: Monday, January 8, 2024.
            ("=WORKDAY(DATE(2024,1,5),1,A1:A2)=DATE(2024,1,9)", "TRUE"),
            ("=WORKDAY(DATE(2024,1,9),-1,A1:A2)=DATE(2024,1,5)", "TRUE"),
            ("=NETWORKDAYS(DATE(2024,1,5),DATE(2024,1,9),A1:A2)", "2"),
            ("=NETWORKDAYS(DATE(2024,1,9),DATE(2024,1,5),A1:A2)", "-2"),
            ("=WORKDAY(DATE(2024,1,5),3000000)", "#NUM!"),
            ("=DAYS(DATE(2024,2,28),DATE(2023,2,28))", "365"),
            (
                "=YEARFRAC(DATE(2023,2,28),DATE(2024,2,28),1)",
                "~1.00000000000000",
            ),
            ("=DAYS360(DATE(2023,2,28),DATE(2024,2,28))", "358"),
            ("=DAYS360(DATE(2024,1,31),DATE(2024,2,29),TRUE)", "29"),
        ],
    );
}

/// The NETWORKDAYS.INTL, WORKDAY.INTL, ISOWEEKNUM and DATEDIF examples,
/// holidays, weekend masks, reversed dates, the 1900 leap day and errors.
#[cfg(feature = "analysis")]
#[test]
fn calendar_functions() {
    assert_results_on(
        &[&["62", "-1"], &["62"], &["64"]],
        &[
            ("=NETWORKDAYS.INTL(DATE(2006,1,1),DATE(2006,1,31))", "22"),
            ("=NETWORKDAYS.INTL(DATE(2006,1,1),DATE(2006,1,31),7)", "23"),
            ("=WORKDAY.INTL(DATE(2012,1,1),90,11)", "41013"),
            ("=ISOWEEKNUM(DATE(2012,3,9))", "10"),
            ("=DATEDIF(DATE(2001,1,1),DATE(2003,1,1),\"Y\")", "2"),
            ("=DATEDIF(DATE(2001,6,1),DATE(2002,8,15),\"D\")", "440"),
            ("=NETWORKDAYS.INTL(61,67,\"0000011\",A1:A3)", "4"),
            ("=NETWORKDAYS.INTL(67,61,1,A1:A3)", "-4"),
            ("=WORKDAY.INTL(61,1,1,A1:A3)", "65"),
            ("=WORKDAY.INTL(65,-1,1,A1:A3)", "61"),
            ("=NETWORKDAYS.INTL(59,61,\"0000000\")", "3"),
            ("=DATEDIF(59,61,\"D\")", "2"),
            ("=DATEDIF(60,61,\"MD\")", "1"),
            ("=ISOWEEKNUM(DATE(2021,1,1))", "53"),
            ("=DATEDIF(DATE(2020,2,29),DATE(2021,2,28),\"M\")", "11"),
            ("=DATEDIF(DATE(2020,2,29),DATE(2021,3,1),\"YM\")", "0"),
            ("=DATEDIF(DATE(2020,6,1),DATE(2022,8,15),\"YD\")", "75"),
            ("=DATEDIF(\"2001/6/1\",\"2002/8/15\",\"YD\")", "75"),
            ("=ISOWEEKNUM(0)", "52"),
            ("=NETWORKDAYS.INTL(1,7,\"1111111\")", "0"),
            ("=DATEDIF(0,366,\"YD\")", "0"),
            ("=NETWORKDAYS.INTL(1,5,0)", "#NUM!"),
            ("=NETWORKDAYS.INTL(1,5,\"000001\")", "#VALUE!"),
            ("=WORKDAY.INTL(1,1,\"1111111\")", "#VALUE!"),
            ("=WORKDAY.INTL(1,-2)", "#NUM!"),
            ("=DATEDIF(2,1,\"D\")", "#NUM!"),
            ("=DATEDIF(1,2,\"Q\")", "#NUM!"),
            ("=ISOWEEKNUM(-1)", "#NUM!"),
            ("=NETWORKDAYS.INTL(1,5,1,B1)", "#NUM!"),
        ],
    );
}

/// The TEXTBEFORE, TEXTAFTER, FIXED, DOLLAR, VALUETOTEXT, ARRAYTOTEXT,
/// TEXTSPLIT and REGEX examples, delimiter options, documented errors, and
/// the regex-lite features the engine refuses.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn analysis_text_functions() {
    assert_results_on(
        &[&[",", "say \"hi\"", "2"], &[";", "=TRUE()"]],
        &[
            (
                r#"=TEXTBEFORE("Little red Riding Hood's red hood","red",2)"#,
                "Little red Riding Hood's ",
            ),
            (
                r#"=TEXTBEFORE("Little red Riding Hood's red hood","red",-2)"#,
                "Little ",
            ),
            (r#"=TEXTAFTER("a-b-c","-",-1)"#, "c"),
            (r#"=TEXTBEFORE("Socrates"," ",,,1)"#, "Socrates"),
            (r#"=TEXTAFTER("Socrates"," ",,,1)"#, ""),
            (r#"=TEXTBEFORE("ABCdef","c",,1)"#, "AB"),
            (r#"=TEXTAFTER("éÉend","é",2,1)"#, "end"),
            (r#"=TEXTBEFORE("abc","",-1)"#, "abc"),
            (r#"=TEXTAFTER("abc","",-1)"#, ""),
            (r#"=TEXTBEFORE("","x")"#, ""),
            (r#"=TEXTBEFORE("a","x",,,, "missing")"#, "missing"),
            (r#"=TEXTAFTER("a-b","-",,,,1/0)"#, "b"),
            ("=FIXED(1234.567,1)", "1,234.6"),
            ("=FIXED(1234.567,-1,TRUE)", "1230"),
            ("=DOLLAR(-1234.567,2)", "($1,234.57)"),
            ("=FIXED(1.005,2)", "1.01"),
            ("=DOLLAR(2.675)", "$2.68"),
            (r#"=VALUETOTEXT("a""b",1)"#, "\"a\"\"b\""),
            ("=VALUETOTEXT(1/0)", "#DIV/0!"),
            (r#"=TEXTBEFORE("abc","x",0)"#, "#VALUE!"),
            (r#"=TEXTBEFORE("abc","x",4)"#, "#VALUE!"),
            (r#"=TEXTBEFORE("abc","x")"#, "#N/A"),
            (r#"=TEXTAFTER("a-b","-",2)"#, "#N/A"),
            (r#"=TEXTBEFORE("abc","b",,2)"#, "#VALUE!"),
            (r#"=TEXTAFTER("abc","b",,,2)"#, "#VALUE!"),
            (r#"=TEXTSPLIT("a","")"#, "#VALUE!"),
            (r#"=TEXTSPLIT("a",",",,,2)"#, "#VALUE!"),
            (r#"=REGEXEXTRACT("abc","[0-9]+")"#, "#N/A"),
            (r#"=REGEXEXTRACT("abc","a",3)"#, "#VALUE!"),
            (r#"=REGEXTEST("abc","[")"#, "#VALUE!"),
            (r#"=REGEXTEST("ab","a(?=b)")"#, "#VALUE!"),
            (r#"=REGEXEXTRACT("aa","(a)\1")"#, "#VALUE!"),
            (r#"=REGEXREPLACE("ab","(?<=a)b","c")"#, "#VALUE!"),
            (r#"=REGEXTEST("a","a",2)"#, "#VALUE!"),
            ("=FIXED(1,128)", "#VALUE!"),
            ("=DOLLAR(1,2,TRUE)", "#VALUE!"),
            ("=VALUETOTEXT(1,2)", "#VALUE!"),
            ("=VALUETOTEXT(1,0.5)", "#VALUE!"),
            (r#"=REGEXEXTRACT("a","a",1.5)"#, "#VALUE!"),
            (r#"=REGEXTEST("a","a",0.5)"#, "#VALUE!"),
            ("=ARRAYTOTEXT(A1:A2,2)", "#VALUE!"),
            (r#"=REGEXREPLACE("aaa","a",REPT("x",32767))"#, "#VALUE!"),
            // regex-lite has no Unicode classes or Unicode case folding:
            // https://docs.rs/regex-lite/0.1.9/regex_lite/#differences-with-the-regex-crate
            (r#"=REGEXTEST("é","\p{L}")"#, "#VALUE!"),
            (r#"=REGEXEXTRACT("é","\P{L}")"#, "#VALUE!"),
            (r#"=REGEXTEST("É","é",1)"#, "#VALUE!"),
            (r#"=REGEXTEST("É","(?i)é")"#, "#VALUE!"),
            (r#"=REGEXREPLACE("É","\x{e9}","e",,1)"#, "#VALUE!"),
            (r#"=REGEXTEST("é","é")"#, "TRUE"),
            (r#"=REGEXTEST("É","é")"#, "FALSE"),
            (r#"=REGEXTEST("AB","(?i)ab")"#, "TRUE"),
            (r#"=REGEXTEST("Ab","(?-i)ab",1)"#, "FALSE"),
            (r#"=REGEXEXTRACT("Zé9","(?:[a-z]+)",0,1)"#, "Z"),
            (r#"=REGEXEXTRACT("éabc","\w+")"#, "abc"),
            (r#"=REGEXEXTRACT("١2","\d+")"#, "2"),
            ("=REGEXEXTRACT(\"\u{a0} \",\"\\s+\")", " "),
            (
                r#"=ARRAYTOTEXT(REGEXEXTRACT("DylanWilliams","[A-Z][a-z]+",1),1)"#,
                r#"{"Dylan";"Williams"}"#,
            ),
            (
                r#"=ARRAYTOTEXT(REGEXEXTRACT("12-ab","([0-9]+)-([a-z]+)",2),1)"#,
                r#"{"12","ab"}"#,
            ),
            (r#"=REGEXEXTRACT("DylanWilliams","[A-Z][a-z]+")"#, "Dylan"),
            (
                r#"=REGEXREPLACE("a1 a2 a3","a([0-9])","b$1",2)"#,
                "a1 b2 a3",
            ),
            (r#"=REGEXREPLACE("a1 a2 a3","a[0-9]","x",-1)"#, "a1 a2 x"),
            (r#"=REGEXREPLACE("a1 a2","a[0-9]","x")"#, "x x"),
            (r#"=REGEXREPLACE("abc","x","y")"#, "abc"),
            (r#"=REGEXTEST("Ab","ab")"#, "FALSE"),
            (r#"=REGEXTEST("Ab","ab",1)"#, "TRUE"),
            (
                r#"=ARRAYTOTEXT(REGEXEXTRACT("ab","(a)(z)?(b)",2),1)"#,
                r#"{"a","","b"}"#,
            ),
            (
                r#"=REGEXREPLACE("SoniaBrown","([A-Z][a-z]+)([A-Z][a-z]+)","$2, $1")"#,
                "Brown, Sonia",
            ),
            (r#"=REGEXREPLACE("a2","a([0-9])","$1x")"#, "2x"),
            (r#"=REGEXREPLACE("a2","a([0-9])","$$$1")"#, "$2"),
            (
                r#"=ARRAYTOTEXT(TEXTSPLIT("a,b;c",A1:A2),1)"#,
                r#"{"a","b","c"}"#,
            ),
            (
                r#"=ARRAYTOTEXT(TEXTSPLIT("a,b;c",",",";"),1)"#,
                r#"{"a","b";"c",#N/A}"#,
            ),
            (
                r#"=ARRAYTOTEXT(TEXTSPLIT("a,,b;c",",",";",TRUE,0,"pad"),1)"#,
                r#"{"a","b";"c","pad"}"#,
            ),
            (
                r#"=ARRAYTOTEXT(TEXTSPLIT("aXbxc","x",,FALSE,1),1)"#,
                r#"{"a","b","c"}"#,
            ),
            ("=ARRAYTOTEXT(B1:C2,1)", r#"{"say ""hi""",2;TRUE,""}"#),
            ("=ARRAYTOTEXT(B1:C2)", "say \"hi\", 2, TRUE, "),
        ],
    );
}

/// The TOCOL, TOROW, WRAPROWS, WRAPCOLS, EXPAND, HSTACK, VSTACK and SORTBY
/// examples, their documented errors, and results read by other functions.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn reshape_functions() {
    let names = r#"{"Ben";"Peter";"Mary";"Sam";"John";"Hillary";"Jenny";"James";"Agnes";"Harry""#;
    let tocol = format!("{names};\"Felicity\";\"Joe\"}}");
    let tocol_blanks = format!("{names};0;0}}");
    let tocol_skip = format!("{names}}}");
    let by_column =
        r#"{"Ben";"John";"Agnes";"Peter";"Hillary";"Harry";"Mary";"Jenny";"Sam";"James"}"#;
    let by_row = by_column.replace(';', ",");
    assert_results_on(
        &[
            &["Ben", "Peter", "Mary", "Sam", "Ben", "Peter", "Mary", "Sam"],
            &[
                "John", "Hillary", "Jenny", "James", "John", "Hillary", "Jenny", "James",
            ],
            &["Agnes", "Harry", "Felicity", "Joe", "Agnes", "Harry"],
        ],
        &[
            ("=ARRAYTOTEXT(TOCOL(A1:D3),1)", tocol.as_str()),
            ("=ARRAYTOTEXT(TOCOL(E1:H3),1)", tocol_blanks.as_str()),
            ("=ARRAYTOTEXT(TOCOL(E1:H3,1),1)", tocol_skip.as_str()),
            ("=ARRAYTOTEXT(TOCOL(E1:H3,1,TRUE),1)", by_column),
            ("=ARRAYTOTEXT(TOROW(E1:H3,1,TRUE),1)", by_row.as_str()),
        ],
    );
    assert_results_on(
        &[
            &["A", "B", "C", "D", "E", "F", "G"],
            &["1", "2", "A", "B", "X", "Y", ""],
            &["3", "4", "C", "D", "", "", ""],
            &["5", "6", "", "", "", "", ""],
            &["A", "B", "C", "", "AA", "BB", "CC"],
            &["D", "E", "F", "", "DD", "EE", "FF"],
            &["1", "2", "A", "B", "C", "=1/0"],
            &["3", "4", "D", "E", "F"],
            &["5", "6"],
        ],
        &[
            (
                "=ARRAYTOTEXT(WRAPROWS(A1:G1,3),1)",
                r#"{"A","B","C";"D","E","F";"G",#N/A,#N/A}"#,
            ),
            (
                "=ARRAYTOTEXT(WRAPROWS(A1:G1,3,\"x\"),1)",
                r#"{"A","B","C";"D","E","F";"G","x","x"}"#,
            ),
            (
                "=ARRAYTOTEXT(WRAPCOLS(A1:G1,3,\"x\"),1)",
                r#"{"A","D","G";"B","E","x";"C","F","x"}"#,
            ),
            ("=ARRAYTOTEXT(WRAPROWS(A1:C1,5),1)", r#"{"A","B","C"}"#),
            (
                "=ARRAYTOTEXT(EXPAND(A3:B4,3,3),1)",
                "{3,4,#N/A;5,6,#N/A;#N/A,#N/A,#N/A}",
            ),
            (
                "=ARRAYTOTEXT(EXPAND(A3,3,3,\"-\"),1)",
                r#"{3,"-","-";"-","-","-";"-","-","-"}"#,
            ),
            ("=ARRAYTOTEXT(EXPAND(A3:B4,,3),1)", "{3,4,#N/A;5,6,#N/A}"),
            ("=ARRAYTOTEXT(EXPAND(A3:B4,G3,G3),1)", "{3,4;5,6}"),
            (
                "=ARRAYTOTEXT(HSTACK(A5:C6,E5:G6),1)",
                r#"{"A","B","C","AA","BB","CC";"D","E","F","DD","EE","FF"}"#,
            ),
            (
                "=ARRAYTOTEXT(HSTACK(A2:B4,C2:D3,E2:F2),1)",
                r#"{1,2,"A","B","X","Y";3,4,"C","D",#N/A,#N/A;5,6,#N/A,#N/A,#N/A,#N/A}"#,
            ),
            (
                "=ARRAYTOTEXT(VSTACK(A5:C6,E5:G6),1)",
                r#"{"A","B","C";"D","E","F";"AA","BB","CC";"DD","EE","FF"}"#,
            ),
            (
                "=ARRAYTOTEXT(VSTACK(A2:B4,C2:D3,E2:F2),1)",
                r#"{1,2;3,4;5,6;"A","B";"C","D";"X","Y"}"#,
            ),
            (
                "=ARRAYTOTEXT(VSTACK(A7:B9,C7:E8,F7),1)",
                r#"{1,2,#N/A;3,4,#N/A;5,6,#N/A;"A","B","C";"D","E","F";#DIV/0!,#N/A,#N/A}"#,
            ),
            ("=ARRAYTOTEXT(HSTACK(1,\"two\"),1)", r#"{1,"two"}"#),
            ("=WRAPROWS(A3:B4,2)", "#VALUE!"),
            ("=WRAPCOLS(A3:B4,2)", "#VALUE!"),
            ("=WRAPROWS(A3:A4,0)", "#NUM!"),
            ("=WRAPCOLS(A3:A4,-1)", "#NUM!"),
            ("=WRAPROWS(A3:A4,\"two\")", "#VALUE!"),
            ("=EXPAND(A3:B4,1)", "#VALUE!"),
            ("=EXPAND(A3:B4,2,1)", "#VALUE!"),
            ("=EXPAND(A3:B4,2000000,2)", "#NUM!"),
            ("=TOCOL(A3:B4,4)", "#VALUE!"),
            ("=TOROW(A3:B4,-1)", "#VALUE!"),
            ("=TOCOL(E3:F3,1)", "#CALC!"),
            ("=TOCOL()", "#VALUE!"),
            ("=WRAPROWS(A3:A4)", "#VALUE!"),
            ("=EXPAND(A3:B4)", "#VALUE!"),
            ("=HSTACK()", "#VALUE!"),
            ("=SUM(TOCOL(A3:B4))", "18"),
            ("=SUM(EXPAND(A3:B4,3,3,1))", "23"),
            ("=SUM(HSTACK(A3:B4,A3:B4))", "36"),
            ("=ARRAYTOTEXT(VSTACK(B4,A3)+0,1)", "{6;3}"),
            ("=ARRAYTOTEXT(TRANSPOSE(TOCOL(A3:B4)),1)", "{3,4,5,6}"),
            (
                "=ARRAYTOTEXT(TAKE(VSTACK(A3:B4,A3:B4),3),1)",
                "{3,4;5,6;3,4}",
            ),
            (
                "=ARRAYTOTEXT(TOROW(HSTACK(A3:A4,B3:B4),0,TRUE),1)",
                "{3,5,4,6}",
            ),
        ],
    );
    // https://support.microsoft.com/en-us/office/sortby-function-cd2d7a62-1b93-435c-b561-d6a35134f28f
    assert_results_on(
        &[
            &["Tom", "East", "30", "", "x", "y", "z"],
            &["Amy", "West", "20", "", "1", "3", "2"],
            &["Sal", "East", "20"],
            &["Bob", "West", "30"],
            &["Eve", "East", "10"],
        ],
        &[
            (
                "=ARRAYTOTEXT(SORTBY(A1:A5,C1:C5),1)",
                r#"{"Eve";"Amy";"Sal";"Tom";"Bob"}"#,
            ),
            (
                "=ARRAYTOTEXT(SORTBY(A1:C5,B1:B5,1,C1:C5,-1),1)",
                r#"{"Tom","East",30;"Sal","East",20;"Eve","East",10;"Bob","West",30;"Amy","West",20}"#,
            ),
            ("=ARRAYTOTEXT(SORTBY(E1:G1,E2:G2,-1),1)", r#"{"y","z","x"}"#),
            ("=SORTBY(A1:A5,C1:C4)", "#VALUE!"),
            ("=SORTBY(A1:A5,C1:C5,2)", "#VALUE!"),
            ("=SORTBY(A1:A5,C1:C5,1,E1:G1)", "#VALUE!"),
        ],
    );
}

/// The LINEST, LOGEST, TREND, GROWTH, FREQUENCY, PROB, MODE.MULT examples,
/// collinear and horizontal inputs, domains and the size limits, and the
/// legacy names that read like their successors.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn regression_functions() {
    assert_results_on(
        &[
            &["1", "0", "6", "1", "3", "1", "2", "6", "1", "0"],
            &["9", "4", "12", "2", "5", "2", "4", "48", "2", "1"],
            &["5", "2", "24", "3", "7", "3", "6", "24", "3", "0"],
            &["7", "3", "48", "4", "9", "4", "8", "192", "4", "1"],
        ],
        &[
            ("=INDEX(LINEST(A1:A4,B1:B4,,FALSE),1,1)", "~2.000000000000"),
            ("=INDEX(LINEST(A1:A4,B1:B4,,FALSE),1,2)", "~1.000000000000"),
            ("=SUMXMY2(TREND(A1:A4,B1:B4,B1:B4),{1;9;5;7})<1E-24", "TRUE"),
            // LOGEST fits y=b*m^x; GROWTH evaluates the same curve.
            ("=INDEX(LOGEST(C1:C4,D1:D4,TRUE,TRUE),1,1)", "~2.000000000000"),
            ("=INDEX(LOGEST(C1:C4,D1:D4,TRUE,TRUE),1,2)", "~3.000000000000"),
            ("=SUMXMY2(GROWTH(C1:C4,D1:D4,D1:D4),{6;12;24;48})<1E-20", "TRUE"),
            ("=INDEX(LINEST(D1:D4,,FALSE,TRUE),1,1)", "~1.000000000000"),
            ("=INDEX(LINEST(D1:D4,,FALSE,TRUE),1,2)", "0"),
            ("=INDEX(LINEST(D1:D4,,FALSE,TRUE),2,2)", "#N/A"),
            ("=INDEX(LINEST(D1:D4,,FALSE,TRUE),4,2)", "3"),
            ("=INDEX(LOGEST(C1:C4,D1:D4,FALSE,TRUE),1,1)", "~2.884499140615"),
            ("=INDEX(LOGEST(C1:C4,D1:D4,FALSE,TRUE),1,2)", "1"),
            // LINEST documents zero coefficients and errors for redundant
            // columns.
            ("=INDEX(LINEST(E1:E4,F1:G4,TRUE,TRUE),1,1)", "0"),
            ("=INDEX(LINEST(E1:E4,F1:G4,TRUE,TRUE),2,1)", "0"),
            ("=INDEX(LINEST(E1:E4,F1:G4,TRUE,TRUE),1,2)", "~2.000000000000"),
            ("=INDEX(LINEST(E1:E4,F1:G4,TRUE,TRUE),4,2)", "2"),
            (
                "=SUMXMY2(TREND(TRANSPOSE(E1:E4),TRANSPOSE(F1:G4),TRANSPOSE(F1:G4)),{3,5,7,9})<1E-24",
                "TRUE",
            ),
            // The LOGEST model with two predictors is b*m1^x1*m2^x2.
            ("=SUMXMY2(LOGEST(H1:H4,I1:J4),{4,2,3})<1E-24", "TRUE"),
            ("=SUMXMY2(GROWTH(H1:H4,I1:J4,I1:J4),{6;48;24;192})<1E-20", "TRUE"),
            // A two-dimensional range is one predictor when both shapes agree.
            ("=SUMXMY2(TREND(I1:J4,I1:J4),{1,0;2,1;3,0;4,1})<1E-24", "TRUE"),
        ],
    );
    // Microsoft LINEST example 3 publishes the first column of all five rows.
    assert_results_on(
        &[
            &["2310", "2", "2", "20", "142000"],
            &["2333", "2", "2", "12", "144000"],
            &["2356", "3", "1.5", "33", "151000"],
            &["2379", "3", "2", "43", "150000"],
            &["2402", "2", "3", "53", "139000"],
            &["2425", "4", "2", "23", "169000"],
            &["2448", "2", "1.5", "99", "126000"],
            &["2471", "2", "2", "34", "142900"],
            &["2494", "3", "3", "23", "163000"],
            &["2517", "4", "4", "55", "169000"],
            &["2540", "2", "3", "22", "149000"],
        ],
        &[
            (
                "=INDEX(LINEST(E1:E11,A1:D11,TRUE,TRUE),1,1)",
                "~-234.237165",
            ),
            ("=INDEX(LINEST(E1:E11,A1:D11,TRUE,TRUE),2,1)", "~13.2680115"),
            (
                "=INDEX(LINEST(E1:E11,A1:D11,TRUE,TRUE),3,1)",
                "~0.996747993",
            ),
            ("=INDEX(LINEST(E1:E11,A1:D11,TRUE,TRUE),4,1)", "~459.753674"),
            ("=INDEX(LINEST(E1:E11,A1:D11,TRUE,TRUE),5,1)", "~1732393319"),
            ("=INDEX(LINEST(E1:E11,A1:D11,TRUE,TRUE),4,2)", "6"),
            ("=INDEX(LINEST(E1:E11,A1:D11,TRUE,TRUE),3,3)", "#N/A"),
        ],
    );
    // https://support.microsoft.com/en-us/office/frequency-function-44e3be2b-eca0-42cd-a3f7-fd9ea898fdb9
    // https://support.microsoft.com/en-us/office/prob-function-9ac30561-c81c-4259-8253-34f0a238fc49
    // https://support.microsoft.com/en-us/office/mode-mult-function-50fd9464-b2ba-4191-b57a-39446689ae8c
    assert_results_on(
        &[
            &["79", "70", "0", "0.2", "1", "7", "1", "", "13", "1", "2"],
            &[
                "85", "79", "1", "0.3", "2", "8", "'1", "", "12", "2", "ignored",
            ],
            &["78", "89", "2", "0.1", "3", "9", "2", "", "11", "3"],
            &["85", "", "3", "0.4", "4", "", "2", "", "8", "4"],
            &["50", "", "", "", "3", "", "", "", "4"],
            &["81", "", "", "", "2", "", "", "", "3"],
            &["95", "", "", "", "1", "", "", "", "2"],
            &["88", "", "", "", "2", "", "", "", "1"],
            &["97", "", "", "", "3", "", "", "", "1"],
            &["", "", "", "", "5", "", "", "", "1"],
            &["", "", "", "", "6"],
            &["", "", "", "", "1"],
        ],
        &[
            ("=ARRAYTOTEXT(FREQUENCY(A1:A9,B1:B3),1)", "{1;2;4;2}"),
            ("=PROB(C1:C4,D1:D4,2)", "~0.100000000000"),
            ("=PROB(C1:C4,D1:D4,1,3)", "~0.800000000000"),
            ("=RANK(85,A1:A9)", "4"),
            ("=PERCENTILE(C1:C4,0.5)", "~1.500000000000"),
            ("=QUARTILE(C1:C4,2)", "~1.500000000000"),
            ("=PERCENTRANK(C1:C4,1)", "~0.333000000000"),
            // Text in the bins is skipped.
            ("=ARRAYTOTEXT(FREQUENCY(J1:J4,K1:K3),1)", "{2;2}"),
            ("=ARRAYTOTEXT(MODE.MULT(E1:E12),1)", "{1;2;3}"),
            ("=MODE.MULT(F1:F3)", "#N/A"),
            // Typed TRUE and "1" count as 1; a text "1" in a cell does not.
            ("=MODE.MULT(1,\"1\",TRUE,2)", "1"),
            ("=MODE.MULT(G1:G4)", "2"),
            ("=MODE.MULT(E1:E3,1/0)", "#DIV/0!"),
            ("=MODE.MULT(0,-0,5)", "0"),
            ("=PERCENTILE(I1:I10,0.3)=PERCENTILE.INC(I1:I10,0.3)", "TRUE"),
            ("=QUARTILE(I1:I10,3)=QUARTILE.INC(I1:I10,3)", "TRUE"),
            ("=QUARTILE(I1:I10,5)", "#NUM!"),
            ("=QUARTILE.INC(I1:I10,5)", "#NUM!"),
            ("=RANK(8,I1:I10,1)=RANK.EQ(8,I1:I10,1)", "TRUE"),
            ("=RANK(1,I1:I10)=RANK.EQ(1,I1:I10)", "TRUE"),
            ("=PERCENTRANK(I1:I10,5)=PERCENTRANK.INC(I1:I10,5)", "TRUE"),
        ],
    );
    assert_results_on(
        &[&["1", "1", "0.2"], &["0", "2", "0.3"], &["3", "3", "0.4"]],
        &[
            ("=LOGEST(A1:A3,B1:B3)", "#NUM!"),
            ("=GROWTH(A1:A3,B1:B3)", "#NUM!"),
            ("=LINEST(A1:A3,B1:B2)", "#REF!"),
            ("=PROB(A1:A3,C1:C2,1)", "#N/A"),
            ("=PROB(A1:A3,C1:C3,1)", "#NUM!"),
            ("=RANK(8,A1:A3)", "#N/A"),
            ("=PERCENTILE(A1:A3,2)", "#NUM!"),
            ("=FREQUENCY(A1:A3,SEQUENCE(1000000))", "#NUM!"),
            ("=LINEST(SEQUENCE(300000))", "#NUM!"),
            ("=TREND(B1:B3,B1:B3,SEQUENCE(1000001))", "#NUM!"),
        ],
    );
    assert_results_on(
        &[&["1", "0"], &["9", "4"], &["5", "text"], &["7", "3"]],
        &[
            ("=LINEST(A1:A5,B1:B5)", "#VALUE!"),
            ("=TREND(A1:A4,B1:B4,B1:B4)", "#VALUE!"),
            ("=LOGEST(A1:A4,B1:B4)", "#VALUE!"),
        ],
    );
}

/// The MDETERM, MINVERSE, MMULT and MUNIT examples, singular and
/// non-square matrices, text and blank cells, and the size limit.
#[cfg(feature = "analysis")]
#[test]
fn matrix_functions() {
    assert_results_on(
        &[&["1", "3", "", "", "3"], &["7", "2", "", ""]],
        &[
            ("=MDETERM({1,3,8,5;1,3,6,1;1,1,1,0;7,3,10,2})", "~88.000000000"),
            ("=MDETERM({3,6,1;1,1,0;3,10,2})", "~1.000000000"),
            ("=MDETERM({3,6;1,1})", "~-3.000000000"),
            ("=MDETERM({1,3,8,5;1,3,6,1})", "#VALUE!"),
            ("=MDETERM({1,2;2,4})", "~0.000000000"),
            ("=MDETERM({1,\"text\";1,1})", "#VALUE!"),
            ("=MDETERM(MUNIT(3))", "~1.000000000"),
            ("=SUMXMY2(MINVERSE({4,-1;2,0}),{0,0.5;-1,2})<1E-18", "TRUE"),
            (
                "=SUMXMY2(MINVERSE({1,2,1;3,4,-1;0,2,0}),{0.25,0.25,-0.75;0,0,0.5;0.75,-0.25,-0.25})<1E-18",
                "TRUE",
            ),
            ("=MINVERSE({1,2;2,4})", "#NUM!"),
            ("=MINVERSE({1,3,8;1,3,6})", "#VALUE!"),
            ("=ARRAYTOTEXT(MMULT(A1:B2,{2,0;0,2}),1)", "{2,6;14,4}"),
            ("=ARRAYTOTEXT(MUNIT(3),1)", "{1,0,0;0,1,0;0,0,1}"),
            ("=ARRAYTOTEXT(MMULT({1,2,3},MUNIT(3)),1)", "{1,2,3}"),
            ("=ARRAYTOTEXT(MUNIT(E1),1)", "{1,0,0;0,1,0;0,0,1}"),
            ("=MMULT(A1:B2,{1,2,3})", "#VALUE!"),
            ("=MMULT(A1:B2,C1:D2)", "#VALUE!"),
            ("=MUNIT(0)", "#VALUE!"),
            ("=MUNIT(2000)", "#NUM!"),
        ],
    );
}

/// The orchard table of the database function pages: criteria `A1:F3`
/// ask for apple trees from 10 to 16 high, or pear trees.
#[cfg(feature = "analysis")]
const ORCHARD: &[&[&str]] = &[
    &["Tree", "Height", "Age", "Yield", "Profit", "Height"],
    &["'=Apple", ">10", "<16", "", "", "<16"],
    &["'=Pear"],
    &["Tree", "Height", "Age", "Yield", "Profit"],
    &["Apple", "18", "20", "14", "105"],
    &["Pear", "12", "12", "10", "96"],
    &["Cherry", "13", "14", "9", "105"],
    &["Apple", "14", "15", "10", "75"],
    &["Pear", "9", "8", "8", "77"],
    &["Apple", "8", "9", "6", "45"],
];

/// [`ORCHARD`] with `edits` applied: `(row, col, input)` from 0.
#[cfg(feature = "analysis")]
fn orchard_with(edits: &[(usize, usize, &'static str)]) -> Vec<Vec<&'static str>> {
    const ROWS: usize = 16;
    const COLS: usize = 6;
    let mut grid = vec![vec![""; COLS]; ROWS];
    for (row, cells) in ORCHARD.iter().enumerate() {
        grid[row][..cells.len()].copy_from_slice(cells);
    }
    for &(row, col, input) in edits {
        grid[row][col] = input;
    }
    grid
}

#[cfg(feature = "analysis")]
fn rows<'a>(grid: &'a [Vec<&'a str>]) -> Vec<&'a [&'a str]> {
    grid.iter().map(Vec::as_slice).collect()
}

/// The D-function examples, numeric and non-empty counts, DGET, field and
/// criteria errors, and error, empty and text fields.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn database_functions() {
    let examples = orchard_with(&[(2, 1, ">12"), (12, 0, "Tree"), (13, 0, "'=Absent")]);
    assert_results_on(
        &rows(&orchard_with(&[])),
        &[
            ("=DAVERAGE(A4:E10,\"Yield\",A1:B2)", "~12.000000000000"),
            ("=DAVERAGE(A4:E10,3,A4:E10)", "~13.000000000000"),
            ("=DSUM(A4:E10,\"Profit\",A1:A2)", "~225.000000000000"),
            ("=DSUM(A4:E10,\"Profit\",A1:F3)", "~248.000000000000"),
            ("=DPRODUCT(A4:E10,\"Yield\",A1:F3)", "~800.000000000000"),
            ("=DMAX(A4:E10,\"Profit\",A1:F3)", "~96.000000000000"),
            ("=DMIN(A4:E10,\"Profit\",A1:F3)", "~75.000000000000"),
            ("=DVAR(A4:E10,\"Yield\",A1:A3)", "~8.800000000000"),
            ("=DVARP(A4:E10,\"Yield\",A1:A3)", "~7.040000000000"),
            ("=DSTDEV(A4:E10,\"Yield\",A1:A3)", "~2.96648"),
            ("=DSTDEVP(A4:E10,\"Yield\",A1:A3)", "~2.6533"),
            ("=DCOUNTA(A4:E10,\"Profit\",A1:F2)", "1"),
        ],
    );
    // Filter height, not age, so the counts can tell text ages apart.
    assert_results_on(
        &rows(&orchard_with(&[
            (1, 2, ""),
            (7, 2, "N/A"),
            (9, 1, "12"),
            (9, 2, "11"),
        ])),
        &[
            ("=DCOUNT(A4:E10,\"Age\",A1:F2)", "1"),
            ("=DCOUNTA(A4:E10,\"Age\",A1:F2)", "2"),
            ("=DCOUNT(A4:E10,,A1:F2)", "2"),
            ("=DCOUNTA(A4:E10,\"\",A1:F2)", "2"),
        ],
    );
    // https://support.microsoft.com/en-us/excel/functions/dget-function
    assert_results_on(
        &rows(&examples),
        &[
            ("=DGET(A4:E10,\"Yield\",A1:F3)", "10"),
            ("=DGET(A4:E10,\"Yield\",A1:A3)", "#NUM!"),
            ("=DGET(A4:E10,\"Yield\",A13:A14)", "#VALUE!"),
            ("=DSUM(A4:E10,0,A1:A2)", "#VALUE!"),
            ("=DSUM(A4:E10,6,A1:A2)", "#VALUE!"),
            ("=DSUM(A4:E10,1.5,A1:A2)", "#VALUE!"),
            ("=DSUM(A4:E10,\"Unknown\",A1:A2)", "#VALUE!"),
            ("=DSUM(A4:E10,1,A1:A1)", "#VALUE!"),
            ("=DAVERAGE(A4:E10,4,A13:A14)", "#DIV/0!"),
            ("=DVAR(A4:E10,4,A1:F3)", "#DIV/0!"),
            ("=DSTDEV(A4:E10,4,A1:F3)", "#DIV/0!"),
            ("=DVARP(A4:E10,4,A13:A14)", "#DIV/0!"),
            ("=DSTDEVP(A4:E10,4,A13:A14)", "#DIV/0!"),
            ("=DSUM(A4:E10,4)", "#VALUE!"),
        ],
    );
    let fields = orchard_with(&[
        (12, 0, "Tree"),
        (13, 0, "'=Cherry"),
        (6, 3, "=1/0"),
        (14, 0, "Tree"),
        (15, 0, "'=Absent"),
        (3, 5, "Optional"),
    ]);
    assert_results_on(
        &rows(&fields),
        &[
            ("=DSUM(A4:E10,4,A1:A2)", "30"),
            ("=DSUM(A4:E10,4,A13:A14)", "#DIV/0!"),
            ("=DGET(A4:E10,4,A13:A14)", "#DIV/0!"),
            ("=DCOUNT(A4:E10,4,A13:A14)", "0"),
            ("=DCOUNTA(A4:E10,4,A13:A14)", "1"),
            ("=DGET(A4:E10,1,A13:A14)", "Cherry"),
            ("=DSUM(A4:E10,4,A15:A16)", "0"),
            ("=DMAX(A4:E10,4,A15:A16)", "0"),
            ("=DMIN(A4:E10,4,A15:A16)", "0"),
            ("=DPRODUCT(A4:E10,4,A15:A16)", "0"),
            ("=DGET(A4:F10,6,A13:A14)", "0"),
            ("=DCOUNTA(A4:F10,6,A13:A14)", "0"),
            ("=DSUM(A4:E10,1,A13:A14)", "0"),
            ("=DVAR(A4:E10,1,A13:A14)", "#DIV/0!"),
        ],
    );
}

/// The AGGREGATE example (errors in A1 and A4), each function number
/// against its named function, and options for errors and nested
/// subtotals.
#[cfg(feature = "analysis")]
#[test]
fn aggregate_function() {
    assert_results_on(
        &[
            &["=1/0", "82", "10"],
            &["72", "65", "20"],
            &["30", "95", "=SUBTOTAL(9,C1:C2)*2"],
            &["=SQRT(-1)", "63", "=AGGREGATE(9,4,C1:C2)"],
            &["31", "53", "=1/0"],
            &["96", "71"],
            &["32", "55"],
            &["81", "83"],
            &["33", "100"],
            &["53", "91"],
            &["34", "89"],
        ],
        &[
            ("=AGGREGATE(4,6,A1:A11)", "96"),
            ("=AGGREGATE(14,6,A1:A11,3)", "72"),
            ("=AGGREGATE(15,6,A1:A11)", "#VALUE!"),
            ("=AGGREGATE(12,6,A1:A11,B1:B11)", "68"),
            ("=MAX(A1:A2)", "#DIV/0!"),
            ("=AGGREGATE(1,6,B1:B11)=AVERAGE(B1:B11)", "TRUE"),
            ("=AGGREGATE(2,6,B1:B11)=COUNT(B1:B11)", "TRUE"),
            ("=AGGREGATE(3,6,B1:B11)=COUNTA(B1:B11)", "TRUE"),
            ("=AGGREGATE(4,6,B1:B11)=MAX(B1:B11)", "TRUE"),
            ("=AGGREGATE(5,6,B1:B11)=MIN(B1:B11)", "TRUE"),
            ("=AGGREGATE(6,6,B1:B11)=PRODUCT(B1:B11)", "TRUE"),
            ("=AGGREGATE(7,6,B1:B11)=STDEV.S(B1:B11)", "TRUE"),
            ("=AGGREGATE(8,6,B1:B11)=STDEV.P(B1:B11)", "TRUE"),
            ("=AGGREGATE(9,6,B1:B11)=SUM(B1:B11)", "TRUE"),
            ("=AGGREGATE(10,6,B1:B11)=VAR.S(B1:B11)", "TRUE"),
            ("=AGGREGATE(11,6,B1:B11)=VAR.P(B1:B11)", "TRUE"),
            ("=AGGREGATE(12,6,B1:B11)=MEDIAN(B1:B11)", "TRUE"),
            ("=AGGREGATE(13,6,B1:B11)", "#N/A"),
            ("=AGGREGATE(14,6,B1:B11,2)=LARGE(B1:B11,2)", "TRUE"),
            ("=AGGREGATE(15,6,B1:B11,3)=SMALL(B1:B11,3)", "TRUE"),
            (
                "=AGGREGATE(16,6,B1:B11,0.3)=PERCENTILE.INC(B1:B11,0.3)",
                "TRUE",
            ),
            ("=AGGREGATE(17,6,B1:B11,1)=QUARTILE.INC(B1:B11,1)", "TRUE"),
            (
                "=AGGREGATE(18,6,B1:B11,0.7)=PERCENTILE.EXC(B1:B11,0.7)",
                "TRUE",
            ),
            ("=AGGREGATE(19,6,B1:B11,3)=QUARTILE.EXC(B1:B11,3)", "TRUE"),
            ("=AGGREGATE(9,2,C1:C5)", "30"),
            ("=AGGREGATE(9,,C1:C4)", "30"),
            ("=AGGREGATE(9,6,C1:C5)", "120"),
            ("=AGGREGATE(9,4,C1:C5)", "#DIV/0!"),
            ("=AGGREGATE(3,2,C1:C5)", "2"),
            ("=AGGREGATE(9,6,C1:C2,C5)", "30"),
            ("=AGGREGATE(20,6,C1:C2)", "#VALUE!"),
            ("=AGGREGATE(9,8,C1:C2)", "#VALUE!"),
            ("=AGGREGATE(9,6,5)", "#VALUE!"),
            ("=AGGREGATE(9,6)", "#VALUE!"),
        ],
    );
}

/// Sales by product and year, as in the GROUPBY and PIVOTBY examples.
#[cfg(feature = "analysis")]
const SALES: &[&[&str]] = &[
    &["Pear", "2024", "10", "1"],
    &["Apple", "2023", "20", "1"],
    &["pear", "2023", "30", "0"],
    &["Apple", "2024", "40", "0"],
];

/// GROUPBY and PIVOTBY: subtotals, sort orders, filters, headers, several
/// value columns, relative totals with PERCENTOF or a two-parameter LAMBDA,
/// and their errors.
#[cfg(feature = "analysis")]
#[allow(clippy::too_many_lines, reason = "one table of formula cases")]
#[test]
fn group_and_pivot_functions() {
    assert_results_on(
        SALES,
        &[
            (
                "=ARRAYTOTEXT(CHOOSECOLS(GROUPBY(A1:B4,C1:C4,SUM,0,2),3),1)",
                "{20;40;60;30;10;40;100}",
            ),
            (
                "=ARRAYTOTEXT(CHOOSECOLS(GROUPBY(A1:B4,C1:C4,SUM,0,-2),3),1)",
                "{100;60;20;40;40;30;10}",
            ),
            (
                "=ARRAYTOTEXT(CHOOSECOLS(GROUPBY(A1:B4,C1:C4,SUM,0,0,HSTACK(-1,-2)),3),1)",
                "{10;30;40;20}",
            ),
            (
                "=ARRAYTOTEXT(CHOOSECOLS(GROUPBY(A1:B4,C1:C4,SUM,0,2,-3),3),1)",
                "{40;20;60;30;10;40;100}",
            ),
            (
                "=ARRAYTOTEXT(CHOOSECOLS(GROUPBY(A1:B4,C1:C4,SUM,0,,-2,,1),3),1)",
                "{10;40;20;30;100}",
            ),
            ("=ISTEXT(INDEX(GROUPBY(A1:A4,C1:D4,SUM,2,0),1,1))", "TRUE"),
            ("=INDEX(GROUPBY(A1:A4,C1:D4,SUM,2,0),2,2)", "60"),
            ("=INDEX(GROUPBY(A1:A4,C1:D4,SUM,2,0),2,3)", "1"),
            ("=PERCENTOF(C1:C2,C1:C4)", "0.3"),
            (
                "=GROUPBY(A1:A4,C1:C4,LAMBDA(subset,subset,SUM(subset)))",
                "#VALUE!",
            ),
            (
                "=PIVOTBY(SEQUENCE(1001),SEQUENCE(1001),SEQUENCE(1001),SUM,0,0,,0)",
                "#NUM!",
            ),
            ("=GROUPBY(A1:A3,C1:C4,SUM)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,ABS)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,HSTACK(SUM,AVERAGE))", "#VALUE!"),
            ("=PIVOTBY(A1:A4,B1:B4,C1:C4,HSTACK(SUM,AVERAGE))", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,LAMBDA(subset,subset),0,0)", "#CALC!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,0,,D1:D3)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,0,,D3:D6)", "#CALC!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,4)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,2)", "#VALUE!"),
            ("=GROUPBY(A1:B4,C1:C4,SUM,0,2,,,1)", "#VALUE!"),
            ("=GROUPBY(A1:A4,C1:C4,SUM,0,0,3)", "#VALUE!"),
            ("=PIVOTBY(A1:A4,B1:B3,C1:C4,SUM)", "#VALUE!"),
            ("=PIVOTBY(A1:A4,B1:B4,C1:C4,SUM,0,0,,0,,,5)", "#VALUE!"),
            ("=PERCENTOF(C1:C4,D3:D4)", "#DIV/0!"),
        ],
    );
    let shares = [
        (0, "~0.4000000000"),
        (1, "~0.3333333333"),
        (2, "~0.2000000000"),
        (3, "~0.3333333333"),
        (4, "~0.4000000000"),
    ];
    let relative_totals: Vec<(String, &str)> = shares
        .into_iter()
        .flat_map(|(relative, share)| {
            [
                "PERCENTOF",
                "LAMBDA(subset,totalset,SUM(subset)/SUM(totalset))",
            ]
            .map(move |function| {
                let formula = format!(
                    "=INDEX(PIVOTBY(A1:A4,B1:B4,C1:C4,{function},0,0,,0,,,{relative}),2,2)"
                );
                (formula, share)
            })
        })
        .collect();
    assert_results_on(SALES, &relative_totals);
    // A header row of "Product" and "Sales" replaces the first sale.
    let mut headed: Vec<&[&str]> = SALES.to_vec();
    headed[0] = &["Product", "2024", "Sales", "1"];
    assert_results_on(
        &headed,
        &[
            ("=INDEX(GROUPBY(A1:A4,C1:C4,SUM,1,0),1,2)", "60"),
            ("=INDEX(GROUPBY(A1:A4,C1:C4,SUM,1,0),2,2)", "30"),
            ("=INDEX(GROUPBY(A1:A4,C1:C4,SUM,3,0),1,1)", "Product"),
            ("=INDEX(GROUPBY(A1:A4,C1:C4,SUM,3,0),1,2)", "Sales"),
            ("=INDEX(GROUPBY(A1:A4,C1:C4,SUM,3,0),2,2)", "60"),
            ("=INDEX(GROUPBY(A1:A4,C1:C4,SUM,3,0),3,2)", "30"),
        ],
    );
}

/// The vector example of the LOOKUP page on Microsoft Support, the array
/// form in both orientations, and TRIMRANGE on a column with blank rows.
#[test]
fn lookup_and_trimrange_follow_the_microsoft_rules() {
    assert_results(&[
        (
            "=LOOKUP(4.19,{4.14;4.19;5.17;5.77;6.39},{\"red\";\"orange\";\"yellow\";\"green\";\"blue\"})",
            "orange",
        ),
        (
            "=LOOKUP(5.75,{4.14;4.19;5.17;5.77;6.39},{\"red\";\"orange\";\"yellow\";\"green\";\"blue\"})",
            "yellow",
        ),
        (
            "=LOOKUP(7.66,{4.14;4.19;5.17;5.77;6.39},{\"red\";\"orange\";\"yellow\";\"green\";\"blue\"})",
            "blue",
        ),
        (
            "=LOOKUP(0,{4.14;4.19;5.17;5.77;6.39},{\"red\";\"orange\";\"yellow\";\"green\";\"blue\"})",
            "#N/A",
        ),
        ("=LOOKUP(2.5,Data!A1:A3,Data!B1:B3)", "20"),
        ("=LOOKUP(3,Data!A1:A3)", "3"),
        ("=LOOKUP(2,Data!A1:B3)", "20"),
        ("=LOOKUP(15,{10,20,30;1,2,3})", "1"),
        ("=ROWS(TRIMRANGE(Data!A1:A10))", "3"),
        ("=ROWS(TRIMRANGE(Data!A1:A10,1))", "10"),
        ("=SUM(TRIMRANGE(Data!A1:B10))", "66"),
        ("=TRIMRANGE(Data!F1:F3)", "#REF!"),
        ("=TRIMRANGE(Data!A1:A3,4)", "#VALUE!"),
        ("=TRIMRANGE(Data!A2)", "2"),
        ("=TRIMRANGE(Data!F1)", "#REF!"),
    ]);
}

/// The byte functions count one byte per character; ASC and DBCS change
/// character width, splitting and joining voiced katakana and leaving
/// other text alone; BAHTTEXT shows the example of its Microsoft page.
#[cfg(feature = "analysis")]
#[test]
fn byte_width_and_baht_functions() {
    assert_results(&[
        ("=LENB(Data!D2)", "1"),
        ("=LEFTB(Data!A3&\"ab\",2)", "3a"),
        ("=FINDB(\"x\",Data!D2)", "1"),
        ("=DBCS(Data!D2)", "ｘ"),
        ("=ASC(DBCS(Data!D2&Data!A1))", "x1"),
        ("=ASC(\"ガパヴァン\")", "ｶﾞﾊﾟｳﾞｧﾝ"),
        ("=DBCS(\"ｶﾞﾊﾟｳﾞｧﾝ\")", "ガパヴァン"),
        ("=DBCS(\"ｱﾞ\")", "ア゛"),
        ("=ASC(\"日本 ヰ\")", "日本 ヰ"),
        ("=DBCS(\"日本\")", "日本"),
        ("=BAHTTEXT(1234)", "หนึ่งพันสองร้อยสามสิบสี่บาทถ้วน"),
    ]);
}

/// The examples of the IS, SHEET, SHEETS, INFO, FORMULATEXT, ISFORMULA,
/// HYPERLINK and CELL pages.
#[test]
fn information_functions() {
    assert_results(&[
        // The reference is a dependency, so a self-reference is a cycle.
        ("=FORMULATEXT(A1)", "#CYCLE!"),
        ("=ISEVEN(-1)", "FALSE"),
        ("=ISEVEN(0)", "TRUE"),
        ("=ISEVEN(DATE(2011,12,23))", "TRUE"),
        ("=ISODD(-1)", "TRUE"),
        ("=ISEVEN(TRUE)", "#VALUE!"),
        ("=ISNONTEXT(Data!F1)", "TRUE"),
        ("=ISNONTEXT(Data!D2)", "FALSE"),
        ("=ISREF(Data!A1:B2)", "TRUE"),
        ("=ISREF(INDIRECT(\"Data!A1\"))", "TRUE"),
        ("=ISREF(\"A1\")", "FALSE"),
        ("=SHEET(Data!A1)", "2"),
        ("=SHEET(\"data\")", "2"),
        ("=SHEET(\"Missing\")", "#N/A"),
        ("=SHEETS()", "2"),
        ("=SHEETS(Report:Data!B1)", "2"),
        ("=INFO(\"numfile\")", "2"),
        ("=INFO(\"RECALC\")", "Automatic"),
        ("=INFO(\"osversion\")", "#N/A"),
        ("=INFO(\"memavail\")", "#N/A"),
        ("=INFO(\"colour\")", "#VALUE!"),
        ("=FORMULATEXT(Data!E3)", "=D1*2"),
        ("=FORMULATEXT(Data!D1)", "#N/A"),
        ("=FORMULATEXT(Data!F1)", "#N/A"),
        ("=FORMULATEXT(1)", "#VALUE!"),
        ("=FORMULATEXT(1/0)", "#DIV/0!"),
        ("=FORMULATEXT(Data!E3:E4)", "=D1*2"),
        ("=ISFORMULA(\"A1\")", "#VALUE!"),
        ("=ISFORMULA(Data!E3)", "TRUE"),
        ("=ISFORMULA(Data!D1)", "FALSE"),
        ("=ISFORMULA(Data!F1)", "FALSE"),
        ("=ISFORMULA(Data!E3:E4)", "TRUE"),
        ("=HYPERLINK(1/0,\"Docs\")", "#DIV/0!"),
        ("=HYPERLINK()", "#VALUE!"),
        ("=HYPERLINK(\"https://example.com\",Data!D1)", "5"),
        ("=CELL(\"address\",Data!B3)", "'Data'!$B$3"),
        ("=CELL(\"Address\",B3)", "$B$3"),
        ("=CELL(\"type\",Data!D2)", "l"),
        ("=CELL(\"type\",Data!D1)", "v"),
        ("=CELL(\"format\",Data!D1)", "#VALUE!"),
        ("=CELL(1,B1)", "#VALUE!"),
        ("=CELL(\"bogus\",B1)", "#VALUE!"),
        ("=CELL(\" row\",B1)", "#VALUE!"),
        ("=CELL(\"row\",Data!B3)", "3"),
        ("=CELL(\"col\",Data!B3)", "2"),
        ("=CELL(\"contents\",Data!E3)", "10"),
        ("=CELL(\"col\")", "1"),
    ]);
}

/// RANDBETWEEN rounds its bounds inward and refuses an empty interval.
#[test]
fn random_bounds() {
    assert_results(&[
        ("=RANDBETWEEN(2.2,2.8)", "#NUM!"),
        ("=RANDBETWEEN(-2.5,-2.5)", "#NUM!"),
        ("=RANDBETWEEN(7,7)", "7"),
        ("=OR(RANDBETWEEN(1.2,3.8)={2,3})", "TRUE"),
    ]);
}

#[test]
fn whole_columns_and_rows_read_the_used_part_of_the_sheet() {
    assert_results(&[
        ("=SUM(Data!C:C)", "15"),
        ("=SUM(Data!$C:$C)", "15"),
        ("=SUM(Data!A:B)", "66"),
        ("=SUM(Data!1:1)", "20"),
        ("=SUM(Data!$1:$2)", "47"),
        ("=COUNT(Data!A:A)", "3"),
        ("=SUMIF(Data!A:A,\">1\",Data!B:B)", "50"),
        ("=ROWS(Data!A:A)", "1048576"),
        ("=COLUMNS(Data!1:1)", "16384"),
        ("=SUM(2.5e+2,1E1)", "260"),
    ]);
}

#[test]
fn numbers_convert_to_text_with_fifteen_significant_digits() {
    assert_results(&[
        ("=(0.1+0.2)&\"\"", "0.3"),
        ("=1/3&\"\"", "0.333333333333333"),
        ("=2/3&\"\"", "0.666666666666667"),
        ("=LEN(0.1+0.2)", "3"),
        ("=CONCAT(0.1+0.2,\"!\")", "0.3!"),
        ("=-1.5&\"\"", "-1.5"),
        ("=123456789012345&\"\"", "123456789012345"),
        ("=1E+15&\"\"", "1E+15"),
        ("=12345678901234567890&\"\"", "1.23456789012346E+19"),
        ("=0.000001&\"\"", "0.000001"),
        ("=1E-10&\"\"", "1E-10"),
    ]);
}

#[test]
fn rounding_uses_the_decimal_value_that_excel_shows() {
    assert_results(&[
        ("=ROUND(1.005,2)", "1.01"),
        ("=ROUND(2.675,2)", "2.68"),
        ("=ROUND(-1.005,2)", "-1.01"),
        ("=ROUND(0.285,2)", "0.29"),
        ("=ROUND(1234.5,-2)", "1200"),
        ("=ROUND(2.5,0)", "3"),
        ("=ROUNDUP(1.001,2)", "1.01"),
        ("=ROUNDDOWN(1.009,2)", "1"),
        ("=ROUNDUP(-1.001,2)", "-1.01"),
    ]);
}

#[test]
fn text_applies_the_number_format_codes() {
    assert_results(&[
        ("=TEXT(0.5,\"0%\")", "50%"),
        ("=TEXT(0.125,\"0.0%\")", "12.5%"),
        ("=TEXT(2.5,\"0\")", "3"),
        ("=TEXT(1234.5,\"#,##0.00\")", "1,234.50"),
        ("=TEXT(-1234.5,\"#,##0\")", "-1,235"),
        ("=TEXT(1234567,\"#,##0\")", "1,234,567"),
        ("=TEXT(3,\"000\")", "003"),
        ("=TEXT(0.25,\"0.0#\")", "0.25"),
        ("=TEXT(0.2,\"0.0#\")", "0.2"),
        ("=TEXT(12345,\"0.00E+00\")", "1.23E+04"),
        ("=TEXT(5,\"$0.00\")", "$5.00"),
        ("=TEXT(-5,\"0;(0)\")", "(5)"),
        ("=TEXT(0,\"0;-0;\"\"zero\"\"\")", "zero"),
        ("=TEXT(1234,\"0,\")", "1"),
        ("=TEXT(7,\"0 \"\"units\"\"\")", "7 units"),
        ("=TEXT(1234.5,\"General\")", "1234.5"),
        ("=TEXT(45000,\"yyyy-mm-dd\")", "2023-03-15"),
        // A percent code that takes the number past the largest double
        // overflows: #NUM!, as for Excel's numeric functions (#433).
        ("=TEXT(9.99999999999999E+307,\"0%\")", "#NUM!"),
        ("=TEXT(-9.99999999999999E+307,\"0.0%;(0.0%)\")", "#NUM!"),
        ("=TEXT(1E+305,\"0%%\")", "#NUM!"),
    ]);
}

#[test]
fn index_arguments_truncate_fractions() {
    assert_results(&[
        ("=CHOOSE(1.5,\"a\",\"b\")", "a"),
        ("=CHOOSE(2.9,\"a\",\"b\")", "b"),
        ("=CHOOSE(0.5,\"a\",\"b\")", "#VALUE!"),
        ("=INDEX(Data!A1:A3,2.9)", "2"),
        ("=INDEX(Data!A1:B3,2.5,1.5)", "2"),
        ("=ADDRESS(2.5,1)", "$A$2"),
    ]);
}

#[test]
fn index_zero_selects_a_whole_row_or_column() {
    assert_results(&[
        ("=SUM(INDEX(Data!A1:B3,0,1))", "6"),
        ("=SUM(INDEX(Data!A1:B3,1,0))", "11"),
        ("=SUM(INDEX(Data!A1:B3,0,0))", "66"),
        ("=INDEX(Data!A1:B1,0,2)", "10"),
    ]);
}

#[test]
fn argument_errors_are_returned_unchanged() {
    assert_results(&[
        ("=ADDRESS(1,1,NA())", "#N/A"),
        ("=ADDRESS(1,1,1/0)", "#DIV/0!"),
        ("=MATCH(1,Data!A1:A3,NA())", "#N/A"),
        ("=XMATCH(1,Data!A1:A3,NA())", "#N/A"),
        ("=XMATCH(1,Data!A1:A3,0,NA())", "#N/A"),
        ("=XLOOKUP(1,Data!A1:A3,Data!B1:B3,,NA())", "#N/A"),
        ("=ADDRESS(1,1,5)", "#VALUE!"),
    ]);
}

#[test]
fn not_equal_criteria_match_values_of_another_type() {
    assert_results(&[
        ("=COUNTIF(Data!D1:D3,\"<>\")", "2"),
        ("=COUNTIF(Data!D1:D3,\"<>5\")", "2"),
        ("=COUNTIF(Data!D1:D3,\"<>x\")", "2"),
        ("=COUNTIFS(Data!D1:D3,\"<>\")", "2"),
        ("=COUNTIF(Data!D1:D3,\"=\")", "1"),
    ]);
}

#[test]
fn sum_if_ranges_take_their_extent_from_the_criteria_range() {
    assert_results(&[
        ("=SUMIF(Data!A1:A3,\">1\",Data!B1)", "50"),
        ("=SUMIF(Data!A1:A3,\">1\",Data!B1:B2)", "50"),
        ("=AVERAGEIF(Data!A1:A3,\">1\",Data!B1)", "25"),
    ]);
}

#[test]
fn date_parts_follow_the_excel_serial_domain() {
    assert_results(&[
        ("=YEAR(0)", "1900"),
        ("=MONTH(0)", "1"),
        ("=DAY(0)", "0"),
        ("=YEAR(Data!F1)", "1900"),
        ("=DAY(0.75)", "0"),
        ("=DATE(1900,1,0)", "0"),
        ("=DATE(1900,1,-1)", "#NUM!"),
        ("=YEAR(-1)", "#NUM!"),
        ("=DAY(-0.5)", "#NUM!"),
        ("=TEXT(0,\"yyyy-mm-dd\")", "1900-01-00"),
    ]);
}

#[test]
fn floor_and_ceiling_follow_the_significance_rules() {
    assert_results(&[
        ("=FLOOR(0.3,0.1)", "0.3"),
        ("=CEILING(0.3,0.1)", "0.3"),
        ("=CEILING(0.234,0.01)", "0.24"),
        ("=FLOOR(2.5,-2)", "#NUM!"),
        ("=CEILING(2.5,-2)", "#NUM!"),
        ("=FLOOR(-2.5,-2)", "-2"),
        ("=CEILING(-2.5,-2)", "-4"),
        ("=FLOOR(-2.5,2)", "-4"),
        ("=CEILING(-2.5,2)", "-2"),
        ("=FLOOR(3.7,2)", "2"),
        ("=CEILING(2.5,1)", "3"),
        ("=FLOOR(5,0)", "#DIV/0!"),
        ("=CEILING(5,0)", "0"),
        ("=FLOOR(2.5)", "#VALUE!"),
        ("=CEILING(2.5)", "#VALUE!"),
    ]);
}

#[test]
fn text_functions_follow_excel_edge_rules() {
    assert_results(&[
        ("=REPLACE(\"abc\",5,1,\"X\")", "abcX"),
        ("=REPLACE(\"abc\",4,0,\"X\")", "abcX"),
        ("=REPLACE(\"abc\",2,1,\"X\")", "aXc"),
        ("=TRIM(\"  a   b  \")", "a b"),
        ("=LEN(TRIM(\"a\"&CHAR(10)&\"b\"))", "3"),
        ("=CODE(MID(TRIM(\"a\"&CHAR(10)&\"b\"),2,1))", "10"),
        ("=LEN(TRIM(\"a\"&CHAR(9)&\"  b\"))", "4"),
    ]);
}
