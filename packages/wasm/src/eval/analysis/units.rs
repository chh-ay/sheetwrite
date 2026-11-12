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

/// Excel's unit groups. Units of different groups do not convert.
#[derive(Clone, Copy)]
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
#[derive(Clone, Copy)]
enum Prefixes {
    None,
    Decimal,
    DecimalAndBinary,
}

const GROUP_MASK: u8 = 0x0f;
const PREFIX_SHIFT: u8 = 4;
const PREFIX_MASK: u8 = 0x03;
const POWER_SHIFT: u8 = 6;

/// Packs a unit's group (bits 0-3), accepted prefixes (bits 4-5) and prefix
/// power (bits 6-7). The power is 2 or 3 for square and cubic metric units,
/// whose prefix is squared or cubed: `km2` is 1E6 `m2`.
const fn kind(group: Group, prefixes: Prefixes, power: u8) -> u8 {
    group as u8 | (prefixes as u8) << PREFIX_SHIFT | power << POWER_SHIFT
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

/// Unit spellings separated by spaces. Position `i` here is entry `i` of
/// `UNIT_KINDS` and `UNIT_FACTORS`.
const UNIT_SYMBOLS: &str = "g sg lbm u ozm grain cwt shweight uk_cwt lcwt hweight stone ton uk_ton LTON brton m mi Nmi in ft yd ang ell ly parsec pc Picapt Pica pica survey_mi yr day d hr mn min sec s Pa p atm at mmHg psi Torr N dyn dy lbf J e c cal eV ev HPh hh Wh wh flb BTU btu HP h PS W w T ga C cel F fah K kel Rank Reau tsp tspm tbs oz cup pt us_pt uk_pt qt uk_qt gal uk_gal l L lt ang3 ang^3 barrel bushel ft3 ft^3 in3 in^3 ly3 ly^3 m3 m^3 mi3 mi^3 yd3 yd^3 Nmi3 Nmi^3 Picapt3 Picapt^3 Pica3 Pica^3 GRT regton MTON uk_acre us_acre ang2 ang^2 ar ft2 ft^2 ha in2 in^2 ly2 ly^2 m2 m^2 Morgen mi2 mi^2 Nmi2 Nmi^2 Picapt2 Picapt^2 Pica2 Pica^2 yd2 yd^2 bit byte admkn kn m/h m/hr m/s m/sec mph";

/// The group, accepted prefixes and prefix power of each unit, packed by `kind`.
const UNIT_KINDS: [u8; 152] = [
    kind(Group::Mass, Prefixes::Decimal, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::Decimal, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Mass, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::Decimal, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::Decimal, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::Decimal, 1),
    kind(Group::Distance, Prefixes::Decimal, 1),
    kind(Group::Distance, Prefixes::Decimal, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Distance, Prefixes::None, 1),
    kind(Group::Time, Prefixes::None, 1),
    kind(Group::Time, Prefixes::None, 1),
    kind(Group::Time, Prefixes::None, 1),
    kind(Group::Time, Prefixes::None, 1),
    kind(Group::Time, Prefixes::None, 1),
    kind(Group::Time, Prefixes::None, 1),
    kind(Group::Time, Prefixes::Decimal, 1),
    kind(Group::Time, Prefixes::Decimal, 1),
    kind(Group::Pressure, Prefixes::Decimal, 1),
    kind(Group::Pressure, Prefixes::Decimal, 1),
    kind(Group::Pressure, Prefixes::Decimal, 1),
    kind(Group::Pressure, Prefixes::Decimal, 1),
    kind(Group::Pressure, Prefixes::Decimal, 1),
    kind(Group::Pressure, Prefixes::None, 1),
    kind(Group::Pressure, Prefixes::None, 1),
    kind(Group::Force, Prefixes::Decimal, 1),
    kind(Group::Force, Prefixes::Decimal, 1),
    kind(Group::Force, Prefixes::Decimal, 1),
    kind(Group::Force, Prefixes::None, 1),
    kind(Group::Energy, Prefixes::Decimal, 1),
    kind(Group::Energy, Prefixes::Decimal, 1),
    kind(Group::Energy, Prefixes::Decimal, 1),
    kind(Group::Energy, Prefixes::Decimal, 1),
    kind(Group::Energy, Prefixes::Decimal, 1),
    kind(Group::Energy, Prefixes::Decimal, 1),
    kind(Group::Energy, Prefixes::None, 1),
    kind(Group::Energy, Prefixes::None, 1),
    kind(Group::Energy, Prefixes::Decimal, 1),
    kind(Group::Energy, Prefixes::Decimal, 1),
    kind(Group::Energy, Prefixes::None, 1),
    kind(Group::Energy, Prefixes::None, 1),
    kind(Group::Energy, Prefixes::None, 1),
    kind(Group::Power, Prefixes::None, 1),
    kind(Group::Power, Prefixes::None, 1),
    kind(Group::Power, Prefixes::None, 1),
    kind(Group::Power, Prefixes::Decimal, 1),
    kind(Group::Power, Prefixes::Decimal, 1),
    kind(Group::Magnetism, Prefixes::Decimal, 1),
    kind(Group::Magnetism, Prefixes::Decimal, 1),
    kind(Group::Temperature, Prefixes::None, 1),
    kind(Group::Temperature, Prefixes::None, 1),
    kind(Group::Temperature, Prefixes::None, 1),
    kind(Group::Temperature, Prefixes::None, 1),
    kind(Group::Temperature, Prefixes::Decimal, 1),
    kind(Group::Temperature, Prefixes::Decimal, 1),
    kind(Group::Temperature, Prefixes::None, 1),
    kind(Group::Temperature, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::Decimal, 1),
    kind(Group::Volume, Prefixes::Decimal, 1),
    kind(Group::Volume, Prefixes::Decimal, 1),
    kind(Group::Volume, Prefixes::Decimal, 3),
    kind(Group::Volume, Prefixes::Decimal, 3),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::Decimal, 3),
    kind(Group::Volume, Prefixes::Decimal, 3),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Volume, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::Decimal, 2),
    kind(Group::Area, Prefixes::Decimal, 2),
    kind(Group::Area, Prefixes::Decimal, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::Decimal, 2),
    kind(Group::Area, Prefixes::Decimal, 2),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Area, Prefixes::None, 1),
    kind(Group::Information, Prefixes::DecimalAndBinary, 1),
    kind(Group::Information, Prefixes::DecimalAndBinary, 1),
    kind(Group::Speed, Prefixes::None, 1),
    kind(Group::Speed, Prefixes::None, 1),
    kind(Group::Speed, Prefixes::Decimal, 1),
    kind(Group::Speed, Prefixes::Decimal, 1),
    kind(Group::Speed, Prefixes::Decimal, 1),
    kind(Group::Speed, Prefixes::Decimal, 1),
    kind(Group::Speed, Prefixes::None, 1),
];

/// The value of each unit in its group's SI unit. Temperatures convert
/// with offsets instead; their factor is unused.
const UNIT_FACTORS: [f64; 152] = [
    1.0,
    POUND_FORCE / FOOT * 1_000.0,
    POUND_GRAMS,
    1.660_539_066_60e-24,
    POUND_GRAMS / 16.0,
    POUND_GRAMS / 7_000.0,
    POUND_GRAMS * 100.0,
    POUND_GRAMS * 100.0,
    POUND_GRAMS * 112.0,
    POUND_GRAMS * 112.0,
    POUND_GRAMS * 112.0,
    POUND_GRAMS * 14.0,
    POUND_GRAMS * 2_000.0,
    POUND_GRAMS * 2_240.0,
    POUND_GRAMS * 2_240.0,
    POUND_GRAMS * 2_240.0,
    1.0,
    MILE,
    NAUTICAL_MILE,
    INCH,
    FOOT,
    3.0 * FOOT,
    1e-10,
    45.0 * INCH,
    LIGHT_YEAR,
    PARSEC,
    PARSEC,
    PICA_POINT,
    PICA_POINT,
    INCH / 6.0,
    5_280.0 * SURVEY_FOOT,
    31_557_600.0,
    86_400.0,
    86_400.0,
    3_600.0,
    60.0,
    60.0,
    1.0,
    1.0,
    1.0,
    1.0,
    ATMOSPHERE,
    ATMOSPHERE,
    133.322_387_415,
    POUND_FORCE / (INCH * INCH),
    ATMOSPHERE / 760.0,
    1.0,
    1e-5,
    1e-5,
    POUND_FORCE,
    1.0,
    1e-7,
    4.184,
    4.186_8,
    1.602_176_634e-19,
    1.602_176_634e-19,
    HORSEPOWER * 3_600.0,
    HORSEPOWER * 3_600.0,
    3_600.0,
    3_600.0,
    FOOT * POUND_FORCE,
    1_055.055_852_62,
    1_055.055_852_62,
    HORSEPOWER,
    HORSEPOWER,
    735.498_75,
    1.0,
    1.0,
    1.0,
    1e-4,
    0.0,
    0.0,
    0.0,
    0.0,
    0.0,
    0.0,
    0.0,
    0.0,
    US_GALLON / 768.0,
    5e-6,
    US_GALLON / 256.0,
    US_GALLON / 128.0,
    US_GALLON / 16.0,
    US_GALLON / 8.0,
    US_GALLON / 8.0,
    UK_GALLON / 8.0,
    US_GALLON / 4.0,
    UK_GALLON / 4.0,
    US_GALLON,
    UK_GALLON,
    1e-3,
    1e-3,
    1e-3,
    1e-30,
    1e-30,
    42.0 * US_GALLON,
    0.035_239_070_166_88,
    FOOT * FOOT * FOOT,
    FOOT * FOOT * FOOT,
    INCH * INCH * INCH,
    INCH * INCH * INCH,
    LIGHT_YEAR * LIGHT_YEAR * LIGHT_YEAR,
    LIGHT_YEAR * LIGHT_YEAR * LIGHT_YEAR,
    1.0,
    1.0,
    MILE * MILE * MILE,
    MILE * MILE * MILE,
    27.0 * FOOT * FOOT * FOOT,
    27.0 * FOOT * FOOT * FOOT,
    NAUTICAL_MILE * NAUTICAL_MILE * NAUTICAL_MILE,
    NAUTICAL_MILE * NAUTICAL_MILE * NAUTICAL_MILE,
    PICA_POINT * PICA_POINT * PICA_POINT,
    PICA_POINT * PICA_POINT * PICA_POINT,
    PICA_POINT * PICA_POINT * PICA_POINT,
    PICA_POINT * PICA_POINT * PICA_POINT,
    100.0 * FOOT * FOOT * FOOT,
    100.0 * FOOT * FOOT * FOOT,
    40.0 * FOOT * FOOT * FOOT,
    4_840.0 * 9.0 * FOOT * FOOT,
    43_560.0 * SURVEY_FOOT * SURVEY_FOOT,
    1e-20,
    1e-20,
    100.0,
    FOOT * FOOT,
    FOOT * FOOT,
    10_000.0,
    INCH * INCH,
    INCH * INCH,
    LIGHT_YEAR * LIGHT_YEAR,
    LIGHT_YEAR * LIGHT_YEAR,
    1.0,
    1.0,
    2_500.0,
    MILE * MILE,
    MILE * MILE,
    NAUTICAL_MILE * NAUTICAL_MILE,
    NAUTICAL_MILE * NAUTICAL_MILE,
    PICA_POINT * PICA_POINT,
    PICA_POINT * PICA_POINT,
    PICA_POINT * PICA_POINT,
    PICA_POINT * PICA_POINT,
    9.0 * FOOT * FOOT,
    9.0 * FOOT * FOOT,
    1.0,
    8.0,
    6_080.0 * FOOT / 3_600.0,
    NAUTICAL_MILE / 3_600.0,
    1.0 / 3_600.0,
    1.0 / 3_600.0,
    1.0,
    1.0,
    MILE / 3_600.0,
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
    symbol: &'static str,
    kind: u8,
    factor: f64,
    scale: f64,
}

impl Resolved {
    fn group(&self) -> u8 {
        self.kind & GROUP_MASK
    }
}

pub(crate) fn evaluate(_name: &str, values: &FuncAccumulator) -> EvalResult {
    convert(values).map_or_else(Value::Error, Value::number)
}

fn convert(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 3)?;
    let number = number_arg(values, 0, None)?;
    let from = resolve(&text_arg(values, 1, None)?).ok_or(FormulaError::Na)?;
    let to = resolve(&text_arg(values, 2, None)?).ok_or(FormulaError::Na)?;

    if from.group() != to.group() {
        return Err(FormulaError::Na);
    }

    if from.group() == Group::Temperature as u8 {
        let kelvins = to_kelvin(number * from.scale, from.symbol);

        return Ok(from_kelvin(kelvins, to.symbol) / to.scale);
    }

    Ok(number * (from.factor * from.scale) / (to.factor * to.scale))
}

/// The unit for an exact spelling, or a prefix followed by a unit that
/// accepts it. Spellings are case-sensitive.
fn resolve(spelling: &str) -> Option<Resolved> {
    if let Some(unit) = find(spelling, 1.0) {
        return Some(unit);
    }

    let binary = BINARY_PREFIXES.iter().find_map(|&(prefix, multiplier)| {
        let unit = find(spelling.strip_prefix(prefix)?, multiplier)?;
        let prefixes = unit.kind >> PREFIX_SHIFT & PREFIX_MASK;

        (prefixes == Prefixes::DecimalAndBinary as u8).then_some(unit)
    });

    binary.or_else(|| {
        DECIMAL_PREFIXES.iter().find_map(|&(prefix, multiplier)| {
            let mut unit = find(spelling.strip_prefix(prefix)?, 1.0)?;
            let prefixes = unit.kind >> PREFIX_SHIFT & PREFIX_MASK;

            if prefixes == Prefixes::None as u8 {
                return None;
            }

            unit.scale = multiplier.powi(i32::from(unit.kind >> POWER_SHIFT));

            Some(unit)
        })
    })
}

fn find(symbol: &str, scale: f64) -> Option<Resolved> {
    let (index, known) = UNIT_SYMBOLS
        .split(' ')
        .enumerate()
        .find(|&(_, candidate)| candidate == symbol)?;

    Some(Resolved {
        symbol: known,
        kind: UNIT_KINDS[index],
        factor: UNIT_FACTORS[index],
        scale,
    })
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
}
