//! The number formatter over a generated corpus of numbers and format codes:
//! negatives, halfway and carry cases, tiny, huge and subnormal numbers, date
//! serials, and random numbers with up to 17 significant digits. Each digest
//! pins every output of one view of the corpus, so a change in any single
//! result fails the test and names the view.

use super::number_format::{general_text, round_decimal, significant, Rounding};
use super::value::format_basic_text;
use crate::store::CellStore;
use crate::types::Value;

/// Random corpus numbers on top of the fixed edge cases.
const RANDOM_NUMBERS: usize = 1_500;
const SEED: u64 = 0x2545_f491_4f6c_dd1d;
/// Decimal places for ROUND, ROUNDUP and ROUNDDOWN, including negative ones.
const ROUND_PLACES: std::ops::RangeInclusive<i32> = -6..=12;

/// Format codes for TEXT: number placeholders, grouping and scaling commas,
/// percent, scientific, sections, colours and conditions, quoted and escaped
/// text, padding and fill, fraction-like codes, dates and times, and codes
/// with no placeholder at all.
const CODES: &[&str] = &[
    "General",
    "0",
    "0.0",
    "0.00",
    "0.000000",
    "0.##########",
    "#",
    "#.##",
    "#,##0",
    "#,##0.00",
    "#,###.##",
    "0,000.00",
    "#,##0,",
    "#,##0,,",
    "0.0,,\"M\"",
    "0%",
    "0.00%",
    "0.0%%",
    "0.00E+00",
    "0.0E+0",
    "0E-0",
    "##0.0E+0",
    "0.000E-00",
    "0e+0",
    "$#,##0.00;($#,##0.00)",
    "$#,##0;($#,##0)",
    "#,##0.00;-#,##0.00;\"zero\"",
    "0;-0;0;@",
    "0.0;;",
    ";;;",
    "[Red]0.00;[Blue]-0.00",
    "[>=100]0;0.00",
    "\"Total: \"0.00",
    "0.00\" units\"",
    "\\$0.00",
    "_(0.00_)",
    "* #,##0",
    "?.??",
    "??0.0?",
    "000-00-0000",
    "(000) 000-0000",
    "00000",
    ".00",
    "0.",
    "#,",
    "# ?/?",
    "# ??/??",
    "General\" items\"",
    "@",
    "",
    "yyyy-mm-dd",
    "mm/dd/yyyy",
    "dd/mm/yyyy",
    "m/d/yyyy",
    "yyyy-mm-dd hh:mm:ss",
    "hh:mm",
    "d-mmm-yy",
    "[h]:mm",
    "0 \"pcs\";\"-\"0",
    "0.00;(0.00);\"-\"",
];

/// Numbers where rounding, carrying and the plain-or-scientific switch are
/// easy to get wrong, with both signs.
fn edge_numbers() -> Vec<f64> {
    let positive = [
        0.0,
        1.0,
        0.5,
        1.5,
        2.5,
        0.005,
        0.015,
        0.025,
        0.045,
        1.005,
        2.675,
        9.995,
        999.995,
        1234.5,
        0.000_123_4,
        123_456_789.123,
        0.1 + 0.2,
        1.0 / 3.0,
        2.0 / 3.0,
        123_456_789_012_345.0,
        999_999_999_999_999.0,
        1e15,
        1e-9,
        1e-10,
        1.234_567_890_123_456_7e19,
        45_000.0,
        45_000.75,
        60.0,
        61.0,
        1e300,
        1e-300,
        // The largest magnitude whose `0.0%%` scaling stays finite.
        1.7e304,
        f64::MIN_POSITIVE,
        f64::from_bits(1),
    ];
    positive
        .iter()
        .flat_map(|&number| [number, -number])
        .collect()
}

/// A deterministic xorshift generator, so a failure reproduces.
struct Corpus(u64);

impl Corpus {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    /// Random digits at a random decimal scale and sign: up to 17
    /// significant digits, sometimes ending in a 5 to land on a halfway case.
    fn number(&mut self) -> f64 {
        const SCALES: u64 = 25;
        const SCALE_OFFSET: i32 = 12;
        const MAX_DIGITS: u32 = 17;
        let digit_count = 1 + (self.next() % u64::from(MAX_DIGITS)) as u32;
        let mut digits = self.next() % 10u64.pow(digit_count);
        if self.next().is_multiple_of(3) {
            digits = digits / 10 * 10 + 5;
        }
        let scale = (self.next() % SCALES) as i32 - SCALE_OFFSET;
        let magnitude = digits as f64 * 10f64.powi(scale);
        if self.next().is_multiple_of(2) {
            -magnitude
        } else {
            magnitude
        }
    }
}

fn corpus() -> Vec<f64> {
    let mut random = Corpus(SEED);
    let mut numbers = edge_numbers();
    numbers.extend((0..RANDOM_NUMBERS).map(|_| random.number()));
    numbers
}

/// FNV-1a over every output, each followed by a separator.
fn digest<'a>(outputs: impl IntoIterator<Item = &'a str>) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0100_0000_01b3;
    let mut hash = OFFSET;
    for output in outputs {
        for &byte in output.as_bytes().iter().chain(b"\n") {
            hash = (hash ^ u64::from(byte)).wrapping_mul(PRIME);
        }
    }
    hash
}

fn text_outputs(numbers: &[f64], code: &str) -> Vec<String> {
    numbers
        .iter()
        .map(
            |&number| match format_basic_text(&Value::Number(number), code) {
                Ok(text) => text,
                Err(error) => error.sentinel().to_owned(),
            },
        )
        .collect()
}

/// Every view of the corpus and its digest.
fn views(numbers: &[f64]) -> Vec<(String, u64)> {
    let mut views = Vec::new();

    let general: Vec<String> = numbers.iter().map(|&number| general_text(number)).collect();
    views.push((
        "general text".to_owned(),
        digest(general.iter().map(String::as_str)),
    ));

    let shown: Vec<String> = numbers
        .iter()
        .map(|&number| significant(number).to_bits().to_string())
        .collect();
    views.push((
        "significant".to_owned(),
        digest(shown.iter().map(String::as_str)),
    ));

    for places in ROUND_PLACES {
        for (name, rounding) in [
            ("nearest", Rounding::Nearest),
            ("away", Rounding::Away),
            ("toward", Rounding::Toward),
        ] {
            let rounded: Vec<String> = numbers
                .iter()
                .map(|&number| {
                    round_decimal(number, places, rounding)
                        .to_bits()
                        .to_string()
                })
                .collect();
            views.push((
                format!("round {name} {places}"),
                digest(rounded.iter().map(String::as_str)),
            ));
        }
    }

    for code in CODES {
        let outputs = text_outputs(numbers, code);
        views.push((
            format!("TEXT {code:?}"),
            digest(outputs.iter().map(String::as_str)),
        ));
    }
    views
}

#[test]
fn formatted_corpus_matches_its_digests() {
    let views = views(&corpus());
    let changed: Vec<String> = views
        .iter()
        .filter(|(name, actual)| {
            !EXPECTED
                .iter()
                .any(|(expected_name, expected)| expected_name == name && expected == actual)
        })
        .map(|(name, actual)| format!("({name:?}, {actual:#018x}),"))
        .collect();
    assert!(changed.is_empty(), "changed views:\n{}", changed.join("\n"));
    assert_eq!(views.len(), EXPECTED.len(), "one digest per view");
}

/// Evaluates each formula template for the first corpus numbers in column A
/// and every decimal count from -3 to 6, and digests the results: text as
/// written, numbers by their bits.
fn formula_digest(templates: &[&str]) -> String {
    const FORMULA_ROWS: usize = 200;
    const DECIMALS: std::ops::RangeInclusive<i32> = -3..=6;
    let numbers: Vec<f64> = corpus().into_iter().take(FORMULA_ROWS).collect();
    let columns = 1 + templates.len() * DECIMALS.count();

    let mut store = CellStore::new();
    let sheet = store.add_sheet(columns, numbers.len());
    for (row, &number) in numbers.iter().enumerate() {
        store.set_number(sheet, row, 0, number, 0);
        let mut col = 1;
        for template in templates {
            for decimals in DECIMALS {
                let source = template
                    .replace("{row}", &(row + 1).to_string())
                    .replace("{decimals}", &decimals.to_string());
                store.set_formula(sheet, row, col, &format!("={source}"), 0);
                col += 1;
            }
        }
    }
    store.recompute(sheet);

    let mut outputs = Vec::new();
    for row in 0..numbers.len() {
        for col in 1..columns {
            let cell = store.get_cell(sheet, row, col);
            outputs.push(
                cell.string()
                    .unwrap_or_else(|| cell.num().to_bits().to_string()),
            );
        }
    }
    format!("{:#018x}", digest(outputs.iter().map(String::as_str)))
}

#[test]
fn rounding_and_text_formulas_match_their_digest() {
    let templates = [
        "ROUND(A{row},{decimals})",
        "ROUNDUP(A{row},{decimals})",
        "ROUNDDOWN(A{row},{decimals})",
        "A{row}&\"\"",
        "TEXT(A{row},\"#,##0.000\")",
        "TEXT(A{row},\"0.00E+00\")",
    ];
    assert_eq!(formula_digest(&templates), "0x43d2d5ea2fbb4268");
}

/// FIXED and DOLLAR round first and then format with a generated code;
/// BAHTTEXT reads the number at two fixed decimals.
#[cfg(feature = "analysis")]
#[test]
fn full_engine_number_text_formulas_match_their_digest() {
    let templates = [
        "FIXED(A{row},{decimals})",
        "FIXED(A{row},{decimals},TRUE)",
        "DOLLAR(A{row},{decimals})",
        "BAHTTEXT(A{row}*10^{decimals})",
    ];
    assert_eq!(formula_digest(&templates), "0xb776ab5ef26c3496");
}

/// The digest of every view in `views`, in order.
const EXPECTED: &[(&str, u64)] = &[
    ("general text", 0xb9f4b156515a176b),
    ("significant", 0xc23e671419c9b950),
    ("round nearest -6", 0x8622fdd8a3ac1992),
    ("round away -6", 0x47ff248d5d7ad502),
    ("round toward -6", 0x9f4203674bd2d753),
    ("round nearest -5", 0x51e9d20d0791940e),
    ("round away -5", 0x518c8aa84b9c9ca6),
    ("round toward -5", 0x7f5bebb161da0582),
    ("round nearest -4", 0x6cb61bf7dee8fa4f),
    ("round away -4", 0x157fe25922f4c668),
    ("round toward -4", 0x074854ac527129cf),
    ("round nearest -3", 0xb87acd254cedce72),
    ("round away -3", 0xb72a23ae08b19a64),
    ("round toward -3", 0x3cde27c61b373bf2),
    ("round nearest -2", 0x7afafa7ff1aa6aaa),
    ("round away -2", 0x43090da5877f5f64),
    ("round toward -2", 0x23ef20bc37a73d4c),
    ("round nearest -1", 0x98dbb2e18bc4bac5),
    ("round away -1", 0x92b2cc9a16e4816a),
    ("round toward -1", 0x32ceb4100cea5051),
    ("round nearest 0", 0x1933d4ba62135baf),
    ("round away 0", 0xec8af6836479fff1),
    ("round toward 0", 0x2f35ac6110195b70),
    ("round nearest 1", 0x719cde4623b65d8c),
    ("round away 1", 0x8d03f2f1d67b9110),
    ("round toward 1", 0xc8160be30f964283),
    ("round nearest 2", 0xf98ffe1f62bf0860),
    ("round away 2", 0xc78333e1c77402e4),
    ("round toward 2", 0xac9ee50bac80dd20),
    ("round nearest 3", 0x37329f8424411d7d),
    ("round away 3", 0xe67e40daeb36fa23),
    ("round toward 3", 0xeab79726661528e6),
    ("round nearest 4", 0x01f8d11553a78ca4),
    ("round away 4", 0x25b369b8c36611f9),
    ("round toward 4", 0x880eaa536e21f11a),
    ("round nearest 5", 0xa45176ab9dc09c51),
    ("round away 5", 0xd8688251bc408e12),
    ("round toward 5", 0xa22e94f7b0dfad5b),
    ("round nearest 6", 0x829c270823ebc503),
    ("round away 6", 0x729430de55036d70),
    ("round toward 6", 0x11500912b3a56974),
    ("round nearest 7", 0xac07d8f20a7f9624),
    ("round away 7", 0x65b4f3dc3ff05e47),
    ("round toward 7", 0x18d20083d5cc0d35),
    ("round nearest 8", 0xe6b2ee00ffe591ff),
    ("round away 8", 0x0c90c2dc6e449333),
    ("round toward 8", 0x3ab8daadf83f638a),
    ("round nearest 9", 0xebbdf482c0a84436),
    ("round away 9", 0x9796561c9e30ee5d),
    ("round toward 9", 0x470b4519448d753f),
    ("round nearest 10", 0xca1b36b888a2c5af),
    ("round away 10", 0xeb07efa8619e7ea1),
    ("round toward 10", 0xa4f64862ca9ff22a),
    ("round nearest 11", 0xa9596f069043c93b),
    ("round away 11", 0x30616cb869fa01c1),
    ("round toward 11", 0x8768f76c91d394dc),
    ("round nearest 12", 0x58303f6841c0fb89),
    ("round away 12", 0xed24e742e7a5d25c),
    ("round toward 12", 0x9fd8aceb77a6def6),
    ("TEXT \"General\"", 0xb9f4b156515a176b),
    ("TEXT \"0\"", 0x8fa03c80ec9c10ee),
    ("TEXT \"0.0\"", 0x28334e8a8413f90a),
    ("TEXT \"0.00\"", 0xa09b01b40ac4c5ac),
    ("TEXT \"0.000000\"", 0xb2ffd685681fa245),
    ("TEXT \"0.##########\"", 0xeb4f5ee26b5c14e7),
    ("TEXT \"#\"", 0x84292fae1581fa86),
    ("TEXT \"#.##\"", 0x021051b25570f36c),
    ("TEXT \"#,##0\"", 0x3ca2ff6e1e499974),
    ("TEXT \"#,##0.00\"", 0x3ef2aea1f5f1e5d8),
    ("TEXT \"#,###.##\"", 0x9ebc9ddce464ef14),
    ("TEXT \"0,000.00\"", 0x8f9810b2f8db99b6),
    ("TEXT \"#,##0,\"", 0xcd3c3d4684bfb11c),
    ("TEXT \"#,##0,,\"", 0x76ca551199961fbe),
    ("TEXT \"0.0,,\\\"M\\\"\"", 0xc6c736717da87934),
    ("TEXT \"0%\"", 0x9a93bae4d98b158b),
    ("TEXT \"0.00%\"", 0x98aac6c8eeca3dd7),
    ("TEXT \"0.0%%\"", 0xfe6d2c119108d2d2),
    ("TEXT \"0.00E+00\"", 0x9a322948647feedd),
    ("TEXT \"0.0E+0\"", 0x6a61c67771e43a2f),
    ("TEXT \"0E-0\"", 0xa79b9a4c91446a36),
    ("TEXT \"##0.0E+0\"", 0x6a61c67771e43a2f),
    ("TEXT \"0.000E-00\"", 0xee2bb7a4a73442c6),
    ("TEXT \"0e+0\"", 0x694b0b0a5d6d4f4d),
    ("TEXT \"$#,##0.00;($#,##0.00)\"", 0x51536bc25c6f2dce),
    ("TEXT \"$#,##0;($#,##0)\"", 0x1f480a2675d1a776),
    (
        "TEXT \"#,##0.00;-#,##0.00;\\\"zero\\\"\"",
        0x4a2b3c9c9b72fa36,
    ),
    ("TEXT \"0;-0;0;@\"", 0x2d46b65d9b5621ce),
    ("TEXT \"0.0;;\"", 0x0c2489c1e3ed3c3d),
    ("TEXT \";;;\"", 0x3bba588d58c8da25),
    ("TEXT \"[Red]0.00;[Blue]-0.00\"", 0x87d74831d63b4124),
    ("TEXT \"[>=100]0;0.00\"", 0x91a3f9e3d9861317),
    ("TEXT \"\\\"Total: \\\"0.00\"", 0xd85867f1f0f972a2),
    ("TEXT \"0.00\\\" units\\\"\"", 0xc4888698210097dc),
    ("TEXT \"\\\\$0.00\"", 0x38fa39184bef19aa),
    ("TEXT \"_(0.00_)\"", 0x5ecb948f687e5394),
    ("TEXT \"* #,##0\"", 0x3ca2ff6e1e499974),
    ("TEXT \"?.??\"", 0xfbc4e87949ac211c),
    ("TEXT \"??0.0?\"", 0xf270da55802e85a2),
    ("TEXT \"000-00-0000\"", 0xa9a3a12f2958d352),
    ("TEXT \"(000) 000-0000\"", 0xe493ce352a25792c),
    ("TEXT \"00000\"", 0x56e0072885f79d34),
    ("TEXT \".00\"", 0x3272da45d745e82c),
    ("TEXT \"0.\"", 0x8fa03c80ec9c10ee),
    ("TEXT \"#,\"", 0xdd0eab8f907958ea),
    ("TEXT \"# ?/?\"", 0x81b9c1c45f166d38),
    ("TEXT \"# ??/??\"", 0xfe79714af2947746),
    ("TEXT \"General\\\" items\\\"\"", 0xad2c41994e9dc17f),
    ("TEXT \"@\"", 0xfc6433ebca210d9e),
    ("TEXT \"\"", 0x4739d0fc15085a4c),
    ("TEXT \"yyyy-mm-dd\"", 0x8d0f75934d1f6221),
    ("TEXT \"mm/dd/yyyy\"", 0xcde41c6a7bebe44d),
    ("TEXT \"dd/mm/yyyy\"", 0x0b81404950d5e6d9),
    ("TEXT \"m/d/yyyy\"", 0x7ca0fd7245fdb1f7),
    ("TEXT \"yyyy-mm-dd hh:mm:ss\"", 0x10cd3bdd2a77673f),
    ("TEXT \"hh:mm\"", 0x279f8af883556c78),
    ("TEXT \"d-mmm-yy\"", 0xb9f4b156515a176b),
    ("TEXT \"[h]:mm\"", 0xb9f4b156515a176b),
    ("TEXT \"0 \\\"pcs\\\";\\\"-\\\"0\"", 0x36ed1f976e9d164c),
    ("TEXT \"0.00;(0.00);\\\"-\\\"\"", 0xd43e66432741f1d7),
];
