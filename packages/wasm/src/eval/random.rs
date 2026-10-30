//! RAND and RANDBETWEEN, and the generator behind them.

use std::cell::Cell;

use super::value::number_from_value;
use super::EvalPass;
use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{EvalResult, FormulaError, Value};

/// SplitMix64 increment and output mixers (Steele, Lea and Flood, 2014).
const GOLDEN_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;
const MIX_MULTIPLIER_1: u64 = 0xBF58_476D_1CE4_E5B9;
const MIX_MULTIPLIER_2: u64 = 0x94D0_49BB_1331_11EB;

/// A unit draw keeps the top 53 bits, the binary64 significand width, so
/// every result is an exact multiple of 2^-53 and strictly below 1.
const UNIT_BITS: u32 = 53;
const UNIT_SCALE: f64 = 1.0 / (1u64 << UNIT_BITS) as f64;

/// Native builds start from this seed, so Rust tests are deterministic.
#[cfg(not(target_arch = "wasm32"))]
const NATIVE_SEED: u64 = 0x5EED_5EED_5EED_5EED;

/// SplitMix64: one word of state, a handful of integer operations per draw,
/// and a full 2^64 period. Any seed is valid, including zero, because the
/// state advances by an odd constant before mixing. It is not a
/// cryptographic generator; spreadsheet RAND makes no such promise.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    pub(crate) const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    pub(crate) const fn state(self) -> u64 {
        self.state
    }

    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(GOLDEN_GAMMA);
        let mut mixed = self.state;
        mixed = (mixed ^ (mixed >> 30)).wrapping_mul(MIX_MULTIPLIER_1);
        mixed = (mixed ^ (mixed >> 27)).wrapping_mul(MIX_MULTIPLIER_2);
        mixed ^ (mixed >> 31)
    }

    /// A uniform draw in `[0, 1)`.
    pub(crate) fn next_unit(&mut self) -> f64 {
        (self.next_u64() >> (u64::BITS - UNIT_BITS)) as f64 * UNIT_SCALE
    }
}

/// The store's generator. Evaluation borrows the store immutably, so the
/// state lives in a `Cell`; a draw is a copy, an advance and a write back.
pub(crate) struct RandomSource(Cell<SplitMix64>);

impl RandomSource {
    /// Each WASM instance seeds itself from the host, so two workbooks do not
    /// share one sequence. `Math.random` gives 53 bits; SplitMix64 spreads
    /// them over the whole state on the first draw.
    #[cfg(target_arch = "wasm32")]
    pub(crate) fn from_host() -> Self {
        let seed = (js_sys::Math::random() * (1u64 << UNIT_BITS) as f64) as u64;
        Self::from_state(seed)
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn from_host() -> Self {
        Self::from_state(NATIVE_SEED)
    }

    pub(crate) fn from_state(state: u64) -> Self {
        Self(Cell::new(SplitMix64::new(state)))
    }

    /// Memory release carries the state, so the replacement instance
    /// continues the same sequence.
    pub(crate) fn state(&self) -> u64 {
        self.0.get().state()
    }

    fn next_unit(&self) -> f64 {
        let mut generator = self.0.get();
        let unit = generator.next_unit();
        self.0.set(generator);
        unit
    }
}

/// RANDBETWEEN's integer bounds: Excel rounds `bottom` up and `top` down, and
/// rejects an empty interval with `#NUM!`.
fn integer_bounds(bottom: f64, top: f64) -> Result<(f64, f64), FormulaError> {
    let (bottom, top) = (bottom.ceil(), top.floor());
    if bottom > top {
        return Err(FormulaError::Num);
    }

    Ok((bottom, top))
}

/// An integer drawn uniformly from `bottom..=top`. An interval wider than
/// binary64 can count is `#NUM!`; the `min` guards the one case where rounding
/// the scaled draw reaches `top + 1` on a huge interval.
fn draw_between(unit: f64, bottom: f64, top: f64) -> Result<f64, FormulaError> {
    let span = top - bottom + 1.0;
    if !span.is_finite() {
        return Err(FormulaError::Num);
    }

    Ok((bottom + (unit * span).floor()).min(top))
}

impl CellStore {
    /// `RAND()` and `RANDBETWEEN(bottom, top)`. Arguments evaluate before the
    /// draw, so an argument error leaves the sequence untouched.
    pub(super) fn eval_random_func(
        &self,
        between: bool,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if !between {
            if !args.is_empty() {
                return Value::Error(FormulaError::Value);
            }
            return Value::number(self.random.next_unit());
        }

        let [bottom, top] = args else {
            return Value::Error(FormulaError::Value);
        };
        let bound =
            |ast: &Ast, pass: &mut EvalPass<'_>| match self.eval_ast(ast, sheet, pass, depth + 1) {
                // Excel rejects text that is empty, where the shared number
                // coercion would read zero.
                Value::Text(text) if text.trim().is_empty() => Err(FormulaError::Value),
                value => number_from_value(&value),
            };
        let bounds =
            bound(bottom, pass).and_then(|bottom| integer_bounds(bottom, bound(top, pass)?));

        match bounds.and_then(|(bottom, top)| draw_between(self.random.next_unit(), bottom, top)) {
            Ok(value) => Value::number(value),
            Err(error) => Value::Error(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{draw_between, integer_bounds, SplitMix64};
    use crate::types::FormulaError;

    const SAMPLE_DRAWS: usize = 10_000;

    #[test]
    fn seeded_generators_repeat_and_distinct_seeds_diverge() {
        let mut first = SplitMix64::new(42);
        let mut second = SplitMix64::new(42);
        let mut other = SplitMix64::new(43);
        let draws: Vec<f64> = (0..8).map(|_| first.next_unit()).collect();

        assert_eq!(
            draws,
            (0..8).map(|_| second.next_unit()).collect::<Vec<_>>()
        );
        assert_ne!(draws, (0..8).map(|_| other.next_unit()).collect::<Vec<_>>());
    }

    #[test]
    fn unit_draws_stay_in_the_half_open_interval_and_cover_it() {
        let mut generator = SplitMix64::new(0);
        let mut low = false;
        let mut high = false;
        for _ in 0..SAMPLE_DRAWS {
            let unit = generator.next_unit();
            assert!((0.0..1.0).contains(&unit));
            low |= unit < 0.01;
            high |= unit > 0.99;
        }

        assert!(low && high, "draws should reach both ends of [0, 1)");
    }

    #[test]
    fn randbetween_rounds_bounds_inward_and_rejects_empty_intervals() {
        assert_eq!(integer_bounds(1.2, 3.8), Ok((2.0, 3.0)));
        assert_eq!(integer_bounds(-2.5, -2.5), Err(FormulaError::Num));
        assert_eq!(integer_bounds(5.0, 4.0), Err(FormulaError::Num));
        assert_eq!(integer_bounds(7.0, 7.0), Ok((7.0, 7.0)));
    }

    #[test]
    fn randbetween_draws_every_integer_of_the_interval_and_nothing_else() {
        let mut generator = SplitMix64::new(7);
        let mut seen = [false; 5];
        for _ in 0..SAMPLE_DRAWS {
            let value = draw_between(generator.next_unit(), -2.0, 2.0).expect("finite interval");
            assert_eq!(value, value.trunc());
            seen[(value + 2.0) as usize] = true;
        }

        assert_eq!(seen, [true; 5]);
        assert_eq!(
            draw_between(0.5, -f64::MAX, f64::MAX),
            Err(FormulaError::Num)
        );
    }
}
