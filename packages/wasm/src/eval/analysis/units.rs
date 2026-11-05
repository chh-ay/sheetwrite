//! `CONVERT(number, from_unit, to_unit)`: measurement units in Excel's 13
//! unit groups.
//!
//! Each factor is the exact definition of the unit in its group's SI unit:
//! the international foot and pound, the U.S. survey foot, the IT calorie and
//! BTU, the Julian year and the 2019 SI values of the electronvolt and the
//! atomic mass unit. Metric units take decimal prefixes; `bit` and `byte`
//! also take binary prefixes.

use super::super::functions::{number_arg, require_arity, text_arg, FuncAccumulator};
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &["CONVERT"];

#[derive(Clone, Copy, Debug, PartialEq)]
enum Group {
    Mass,
    Distance,
    Time,
    Pressure,
    Force,
    Energy,
    Power,
    Magnetism,
    Temperature,
    Volume,
    Area,
    Information,
    Speed,
}

/// The prefixes a unit accepts.
#[derive(Clone, Copy, PartialEq)]
enum Prefixes {
    None,
    Decimal,
    DecimalAndBinary,
}

/// One unit spelling. `power` is 2 or 3 for square and cubic metric units,
/// whose prefix is squared or cubed: `km2` is 1E6 `m2`.
struct Unit {
    symbol: &'static str,
    group: Group,
    factor: f64,
    prefixes: Prefixes,
    power: i32,
}

const fn unit(symbol: &'static str, group: Group, factor: f64) -> Unit {
    Unit {
        symbol,
        group,
        factor,
        prefixes: Prefixes::None,
        power: 1,
    }
}

const fn metric(symbol: &'static str, group: Group, factor: f64) -> Unit {
    Unit {
        symbol,
        group,
        factor,
        prefixes: Prefixes::Decimal,
        power: 1,
    }
}

const fn metric_power(symbol: &'static str, group: Group, factor: f64, power: i32) -> Unit {
    Unit {
        symbol,
        group,
        factor,
        prefixes: Prefixes::Decimal,
        power,
    }
}

const fn information(symbol: &'static str, factor: f64) -> Unit {
    Unit {
        symbol,
        group: Group::Information,
        factor,
        prefixes: Prefixes::DecimalAndBinary,
        power: 1,
    }
}

const INCH: f64 = 0.0254;
const FOOT: f64 = 0.3048;
const MILE: f64 = 1_609.344;
const NAUTICAL_MILE: f64 = 1_852.0;
const PICA_POINT: f64 = INCH / 72.0;
const LIGHT_YEAR: f64 = 9_460_730_472_580_800.0;
/// 648000 / pi astronomical units of 149,597,870,700 m.
const PARSEC: f64 = 30_856_775_814_913_673.0;
/// 1200 / 3937 m.
const SURVEY_FOOT: f64 = 1_200.0 / 3_937.0;
const POUND_GRAMS: f64 = 453.592_37;
const STANDARD_GRAVITY: f64 = 9.806_65;
const POUND_FORCE: f64 = POUND_GRAMS / 1_000.0 * STANDARD_GRAVITY;
const US_GALLON: f64 = 0.003_785_411_784;
const UK_GALLON: f64 = 0.004_546_09;
const HORSEPOWER: f64 = 550.0 * FOOT * POUND_FORCE;
const ATMOSPHERE: f64 = 101_325.0;

/// Spellings in Excel's documented groups. Temperatures use their own
/// conversion; their factor is unused.
const UNITS: &[Unit] = &[
    metric("g", Group::Mass, 1.0),
    unit("sg", Group::Mass, POUND_FORCE / FOOT * 1_000.0),
    unit("lbm", Group::Mass, POUND_GRAMS),
    metric("u", Group::Mass, 1.660_539_066_60e-24),
    unit("ozm", Group::Mass, POUND_GRAMS / 16.0),
    unit("grain", Group::Mass, POUND_GRAMS / 7_000.0),
    unit("cwt", Group::Mass, POUND_GRAMS * 100.0),
    unit("shweight", Group::Mass, POUND_GRAMS * 100.0),
    unit("uk_cwt", Group::Mass, POUND_GRAMS * 112.0),
    unit("lcwt", Group::Mass, POUND_GRAMS * 112.0),
    unit("hweight", Group::Mass, POUND_GRAMS * 112.0),
    unit("stone", Group::Mass, POUND_GRAMS * 14.0),
    unit("ton", Group::Mass, POUND_GRAMS * 2_000.0),
    unit("uk_ton", Group::Mass, POUND_GRAMS * 2_240.0),
    unit("LTON", Group::Mass, POUND_GRAMS * 2_240.0),
    unit("brton", Group::Mass, POUND_GRAMS * 2_240.0),
    metric("m", Group::Distance, 1.0),
    unit("mi", Group::Distance, MILE),
    unit("Nmi", Group::Distance, NAUTICAL_MILE),
    unit("in", Group::Distance, INCH),
    unit("ft", Group::Distance, FOOT),
    unit("yd", Group::Distance, 3.0 * FOOT),
    metric("ang", Group::Distance, 1e-10),
    unit("ell", Group::Distance, 45.0 * INCH),
    metric("ly", Group::Distance, LIGHT_YEAR),
    metric("parsec", Group::Distance, PARSEC),
    metric("pc", Group::Distance, PARSEC),
    unit("Picapt", Group::Distance, PICA_POINT),
    unit("Pica", Group::Distance, PICA_POINT),
    unit("pica", Group::Distance, INCH / 6.0),
    unit("survey_mi", Group::Distance, 5_280.0 * SURVEY_FOOT),
    unit("yr", Group::Time, 31_557_600.0),
    unit("day", Group::Time, 86_400.0),
    unit("d", Group::Time, 86_400.0),
    unit("hr", Group::Time, 3_600.0),
    unit("mn", Group::Time, 60.0),
    unit("min", Group::Time, 60.0),
    metric("sec", Group::Time, 1.0),
    metric("s", Group::Time, 1.0),
    metric("Pa", Group::Pressure, 1.0),
    metric("p", Group::Pressure, 1.0),
    metric("atm", Group::Pressure, ATMOSPHERE),
    metric("at", Group::Pressure, ATMOSPHERE),
    metric("mmHg", Group::Pressure, 133.322_387_415),
    unit("psi", Group::Pressure, POUND_FORCE / (INCH * INCH)),
    unit("Torr", Group::Pressure, ATMOSPHERE / 760.0),
    metric("N", Group::Force, 1.0),
    metric("dyn", Group::Force, 1e-5),
    metric("dy", Group::Force, 1e-5),
    unit("lbf", Group::Force, POUND_FORCE),
    metric("J", Group::Energy, 1.0),
    metric("e", Group::Energy, 1e-7),
    metric("c", Group::Energy, 4.184),
    metric("cal", Group::Energy, 4.186_8),
    metric("eV", Group::Energy, 1.602_176_634e-19),
    metric("ev", Group::Energy, 1.602_176_634e-19),
    unit("HPh", Group::Energy, HORSEPOWER * 3_600.0),
    unit("hh", Group::Energy, HORSEPOWER * 3_600.0),
    metric("Wh", Group::Energy, 3_600.0),
    metric("wh", Group::Energy, 3_600.0),
    unit("flb", Group::Energy, FOOT * POUND_FORCE),
    unit("BTU", Group::Energy, 1_055.055_852_62),
    unit("btu", Group::Energy, 1_055.055_852_62),
    unit("HP", Group::Power, HORSEPOWER),
    unit("h", Group::Power, HORSEPOWER),
    unit("PS", Group::Power, 735.498_75),
    metric("W", Group::Power, 1.0),
    metric("w", Group::Power, 1.0),
    metric("T", Group::Magnetism, 1.0),
    metric("ga", Group::Magnetism, 1e-4),
    unit("C", Group::Temperature, 0.0),
    unit("cel", Group::Temperature, 0.0),
    unit("F", Group::Temperature, 0.0),
    unit("fah", Group::Temperature, 0.0),
    metric("K", Group::Temperature, 0.0),
    metric("kel", Group::Temperature, 0.0),
    unit("Rank", Group::Temperature, 0.0),
    unit("Reau", Group::Temperature, 0.0),
    unit("tsp", Group::Volume, US_GALLON / 768.0),
    unit("tspm", Group::Volume, 5e-6),
    unit("tbs", Group::Volume, US_GALLON / 256.0),
    unit("oz", Group::Volume, US_GALLON / 128.0),
    unit("cup", Group::Volume, US_GALLON / 16.0),
    unit("pt", Group::Volume, US_GALLON / 8.0),
    unit("us_pt", Group::Volume, US_GALLON / 8.0),
    unit("uk_pt", Group::Volume, UK_GALLON / 8.0),
    unit("qt", Group::Volume, US_GALLON / 4.0),
    unit("uk_qt", Group::Volume, UK_GALLON / 4.0),
    unit("gal", Group::Volume, US_GALLON),
    unit("uk_gal", Group::Volume, UK_GALLON),
    metric("l", Group::Volume, 1e-3),
    metric("L", Group::Volume, 1e-3),
    metric("lt", Group::Volume, 1e-3),
    metric_power("ang3", Group::Volume, 1e-30, 3),
    metric_power("ang^3", Group::Volume, 1e-30, 3),
    unit("barrel", Group::Volume, 42.0 * US_GALLON),
    unit("bushel", Group::Volume, 0.035_239_070_166_88),
    unit("ft3", Group::Volume, FOOT * FOOT * FOOT),
    unit("ft^3", Group::Volume, FOOT * FOOT * FOOT),
    unit("in3", Group::Volume, INCH * INCH * INCH),
    unit("in^3", Group::Volume, INCH * INCH * INCH),
    unit("ly3", Group::Volume, LIGHT_YEAR * LIGHT_YEAR * LIGHT_YEAR),
    unit("ly^3", Group::Volume, LIGHT_YEAR * LIGHT_YEAR * LIGHT_YEAR),
    metric_power("m3", Group::Volume, 1.0, 3),
    metric_power("m^3", Group::Volume, 1.0, 3),
    unit("mi3", Group::Volume, MILE * MILE * MILE),
    unit("mi^3", Group::Volume, MILE * MILE * MILE),
    unit("yd3", Group::Volume, 27.0 * FOOT * FOOT * FOOT),
    unit("yd^3", Group::Volume, 27.0 * FOOT * FOOT * FOOT),
    unit(
        "Nmi3",
        Group::Volume,
        NAUTICAL_MILE * NAUTICAL_MILE * NAUTICAL_MILE,
    ),
    unit(
        "Nmi^3",
        Group::Volume,
        NAUTICAL_MILE * NAUTICAL_MILE * NAUTICAL_MILE,
    ),
    unit(
        "Picapt3",
        Group::Volume,
        PICA_POINT * PICA_POINT * PICA_POINT,
    ),
    unit(
        "Picapt^3",
        Group::Volume,
        PICA_POINT * PICA_POINT * PICA_POINT,
    ),
    unit("Pica3", Group::Volume, PICA_POINT * PICA_POINT * PICA_POINT),
    unit(
        "Pica^3",
        Group::Volume,
        PICA_POINT * PICA_POINT * PICA_POINT,
    ),
    unit("GRT", Group::Volume, 100.0 * FOOT * FOOT * FOOT),
    unit("regton", Group::Volume, 100.0 * FOOT * FOOT * FOOT),
    unit("MTON", Group::Volume, 40.0 * FOOT * FOOT * FOOT),
    unit("uk_acre", Group::Area, 4_840.0 * 9.0 * FOOT * FOOT),
    unit("us_acre", Group::Area, 43_560.0 * SURVEY_FOOT * SURVEY_FOOT),
    metric_power("ang2", Group::Area, 1e-20, 2),
    metric_power("ang^2", Group::Area, 1e-20, 2),
    metric("ar", Group::Area, 100.0),
    unit("ft2", Group::Area, FOOT * FOOT),
    unit("ft^2", Group::Area, FOOT * FOOT),
    unit("ha", Group::Area, 10_000.0),
    unit("in2", Group::Area, INCH * INCH),
    unit("in^2", Group::Area, INCH * INCH),
    unit("ly2", Group::Area, LIGHT_YEAR * LIGHT_YEAR),
    unit("ly^2", Group::Area, LIGHT_YEAR * LIGHT_YEAR),
    metric_power("m2", Group::Area, 1.0, 2),
    metric_power("m^2", Group::Area, 1.0, 2),
    unit("Morgen", Group::Area, 2_500.0),
    unit("mi2", Group::Area, MILE * MILE),
    unit("mi^2", Group::Area, MILE * MILE),
    unit("Nmi2", Group::Area, NAUTICAL_MILE * NAUTICAL_MILE),
    unit("Nmi^2", Group::Area, NAUTICAL_MILE * NAUTICAL_MILE),
    unit("Picapt2", Group::Area, PICA_POINT * PICA_POINT),
    unit("Picapt^2", Group::Area, PICA_POINT * PICA_POINT),
    unit("Pica2", Group::Area, PICA_POINT * PICA_POINT),
    unit("Pica^2", Group::Area, PICA_POINT * PICA_POINT),
    unit("yd2", Group::Area, 9.0 * FOOT * FOOT),
    unit("yd^2", Group::Area, 9.0 * FOOT * FOOT),
    information("bit", 1.0),
    information("byte", 8.0),
    unit("admkn", Group::Speed, 6_080.0 * FOOT / 3_600.0),
    unit("kn", Group::Speed, NAUTICAL_MILE / 3_600.0),
    metric("m/h", Group::Speed, 1.0 / 3_600.0),
    metric("m/hr", Group::Speed, 1.0 / 3_600.0),
    metric("m/s", Group::Speed, 1.0),
    metric("m/sec", Group::Speed, 1.0),
    unit("mph", Group::Speed, MILE / 3_600.0),
];

const DECIMAL_PREFIXES: &[(&str, f64)] = &[
    ("Y", 1e24),
    ("Z", 1e21),
    ("E", 1e18),
    ("P", 1e15),
    ("T", 1e12),
    ("G", 1e9),
    ("M", 1e6),
    ("k", 1e3),
    ("h", 1e2),
    ("da", 1e1),
    ("e", 1e1),
    ("d", 1e-1),
    ("c", 1e-2),
    ("m", 1e-3),
    ("u", 1e-6),
    ("n", 1e-9),
    ("p", 1e-12),
    ("f", 1e-15),
    ("a", 1e-18),
    ("z", 1e-21),
    ("y", 1e-24),
];

const BINARY_PREFIXES: &[(&str, f64)] = &[
    ("Yi", 1_208_925_819_614_629_174_706_176.0),
    ("Zi", 1_180_591_620_717_411_303_424.0),
    ("Ei", 1_152_921_504_606_846_976.0),
    ("Pi", 1_125_899_906_842_624.0),
    ("Ti", 1_099_511_627_776.0),
    ("Gi", 1_073_741_824.0),
    ("Mi", 1_048_576.0),
    ("ki", 1_024.0),
];

/// Kelvins at 0 degrees Celsius.
const CELSIUS_ZERO: f64 = 273.15;
/// Fahrenheit and Rankine degrees per Celsius degree.
const FAHRENHEIT_SCALE: f64 = 1.8;
const FAHRENHEIT_ZERO: f64 = 32.0;
/// Reaumur degrees per Celsius degree.
const REAUMUR_SCALE: f64 = 0.8;

/// A unit spelling with its prefix multiplier.
struct Resolved {
    unit: &'static Unit,
    scale: f64,
}

pub(crate) fn evaluate(_name: &str, values: &FuncAccumulator) -> EvalResult {
    convert(values).map_or_else(Value::Error, Value::number)
}

fn convert(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 3)?;
    let number = number_arg(values, 0, None)?;
    let from = resolve(&text_arg(values, 1, None)?).ok_or(FormulaError::Na)?;
    let to = resolve(&text_arg(values, 2, None)?).ok_or(FormulaError::Na)?;

    if from.unit.group != to.unit.group {
        return Err(FormulaError::Na);
    }

    if from.unit.group == Group::Temperature {
        let kelvins = to_kelvin(number * from.scale, from.unit.symbol);

        return Ok(from_kelvin(kelvins, to.unit.symbol) / to.scale);
    }

    Ok(number * (from.unit.factor * from.scale) / (to.unit.factor * to.scale))
}

/// The unit for an exact spelling, or a prefix followed by a unit that
/// accepts it. Spellings are case-sensitive.
fn resolve(spelling: &str) -> Option<Resolved> {
    if let Some(unit) = find(spelling) {
        return Some(Resolved { unit, scale: 1.0 });
    }

    let binary = BINARY_PREFIXES.iter().find_map(|&(prefix, multiplier)| {
        let unit = find(spelling.strip_prefix(prefix)?)?;
        (unit.prefixes == Prefixes::DecimalAndBinary).then_some(Resolved {
            unit,
            scale: multiplier,
        })
    });

    binary.or_else(|| {
        DECIMAL_PREFIXES.iter().find_map(|&(prefix, multiplier)| {
            let unit = find(spelling.strip_prefix(prefix)?)?;
            (unit.prefixes != Prefixes::None).then(|| Resolved {
                unit,
                scale: multiplier.powi(unit.power),
            })
        })
    })
}

fn find(symbol: &str) -> Option<&'static Unit> {
    UNITS.iter().find(|unit| unit.symbol == symbol)
}

/// Converting through Celsius keeps exact results such as 68 F = 20 C.
fn to_kelvin(degrees: f64, symbol: &str) -> f64 {
    let celsius = match symbol {
        "F" | "fah" => (degrees - FAHRENHEIT_ZERO) / FAHRENHEIT_SCALE,
        "K" | "kel" => degrees - CELSIUS_ZERO,
        "Rank" => degrees / FAHRENHEIT_SCALE - CELSIUS_ZERO,
        "Reau" => degrees / REAUMUR_SCALE,
        _ => degrees,
    };

    celsius + CELSIUS_ZERO
}

fn from_kelvin(kelvins: f64, symbol: &str) -> f64 {
    let celsius = kelvins - CELSIUS_ZERO;

    match symbol {
        "F" | "fah" => celsius * FAHRENHEIT_SCALE + FAHRENHEIT_ZERO,
        "K" | "kel" => kelvins,
        "Rank" => kelvins * FAHRENHEIT_SCALE,
        "Reau" => celsius * REAUMUR_SCALE,
        _ => celsius,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(number: f64, from: &str, to: &str) -> Value {
        let mut values = FuncAccumulator::default();

        for argument in [Value::number(number), Value::text(from), Value::text(to)] {
            values.push_scalar(argument).unwrap();
            values.finish_arg(1, 1).unwrap();
        }

        evaluate("CONVERT", &values)
    }

    fn assert_close(number: f64, from: &str, to: &str, expected: f64) {
        let Value::Number(actual) = call(number, from, to) else {
            panic!("CONVERT({number},{from},{to}) returned an error");
        };

        assert!(
            (actual - expected).abs() <= 1e-12 * expected.abs().max(1e-300),
            "CONVERT({number},{from},{to}): {actual} != {expected}"
        );
    }

    /// Results from the Microsoft Support page for CONVERT.
    #[test]
    fn microsoft_published_examples() {
        assert_close(1.0, "lbm", "kg", 0.453_592_37);
        assert_close(68.0, "F", "C", 20.0);
        assert_eq!(call(2.5, "ft", "sec"), Value::Error(FormulaError::Na));
        assert_close(100.0 * FOOT, "ft", "m", 9.290_304);
        assert_close(6.0, "C", "F", 42.8);
        assert_close(6.0, "tsp", "tbs", 2.0);
        assert_close(6.0, "mi", "km", 9.656_064);
        assert_close(6.0, "km", "mi", 3.728_227_153_424_004);
        assert_close(6.0, "in", "ft", 0.5);
        assert_close(6.0, "cm", "in", 2.362_204_724_409_449);
    }

    #[test]
    fn prefixes_follow_the_unit_rules() {
        assert_close(1.0, "km2", "m2", 1e6);
        assert_close(1.0, "m^3", "cm3", 1e6);
        assert_close(1.0, "ml", "l", 1e-3);
        assert_close(1.0, "dam", "m", 10.0);
        assert_close(1.0, "kibyte", "bit", 8_192.0);
        assert_close(1.0, "Mibit", "kbit", 1_048.576);
        assert_close(1.0, "kK", "K", 1_000.0);
        assert_close(1.0, "km/h", "m/s", 1.0 / 3.6);
        assert_close(1.0, "mi", "ft", 5_280.0);
        assert_close(1.0, "Nmi", "m", 1_852.0);
        assert_close(1.0, "ozm", "g", 28.349_523_125);
        assert_close(1.0, "hh", "Wh", HORSEPOWER);
        assert_close(1.0, "atm", "mmHg", ATMOSPHERE / 133.322_387_415);

        for (from, to) in [
            ("kft", "m"),
            ("Kim", "m"),
            ("kim", "m"),
            ("LBM", "kg"),
            ("x", "m"),
            ("kg", "m"),
        ] {
            assert_eq!(
                call(1.0, from, to),
                Value::Error(FormulaError::Na),
                "{from}"
            );
        }
    }

    #[test]
    fn temperatures_convert_through_celsius() {
        assert_close(0.0, "C", "K", 273.15);
        assert_close(100.0, "C", "F", 212.0);
        assert_close(491.67, "Rank", "F", 32.0);
        assert_close(80.0, "Reau", "C", 100.0);
        assert_close(0.0, "K", "Rank", 0.0);
    }

    #[test]
    fn every_spelling_is_unique() {
        for (index, unit) in UNITS.iter().enumerate() {
            assert!(
                UNITS[index + 1..]
                    .iter()
                    .all(|other| other.symbol != unit.symbol),
                "{} is listed twice",
                unit.symbol
            );
        }
    }
}
