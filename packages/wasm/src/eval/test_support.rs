//! Argument setup that the function tests share. Each test module keeps its
//! own assertions and tolerances.

use crate::types::Value;

use super::functions::FuncAccumulator;

/// Arguments whose values all come from ranges, one column each.
pub(super) fn range_arguments(args: &[Vec<Value>]) -> FuncAccumulator {
    let mut values = FuncAccumulator::default();
    for arg in args {
        for value in arg {
            values.push_range(value.clone()).unwrap();
        }
        values.finish_arg(arg.len(), 1).unwrap();
    }
    values
}

/// Arguments that are each a range (`true`) or scalar values (`false`), one column each.
pub(super) fn mixed_arguments(arguments: Vec<(bool, Vec<Value>)>) -> FuncAccumulator {
    let mut values = FuncAccumulator::default();
    for (from_range, argument) in arguments {
        let cells = argument.len();
        for value in argument {
            if from_range {
                values.push_range(value).unwrap();
            } else {
                values.push_scalar(value).unwrap();
            }
        }
        values.finish_arg(cells, 1).unwrap();
    }
    values
}

/// One numeric range argument.
pub(super) fn scalar(value: f64) -> Vec<Value> {
    vec![Value::number(value)]
}
