//! Host functions: formula names that the host registers at run time on one
//! store. Formulas keep only their source text, so a workbook that names a
//! function the host did not register evaluates it to `#NAME?`.

use super::matrix::EvalMatrix;
use super::{ast_produces_array, range_from_ast, CellStore, EvalPass};
use crate::calc::{parse, Ast};
use crate::types::{FormulaError, Value};
use std::collections::HashMap;
use std::rc::Rc;

/// One evaluated argument: a scalar is a 1 x 1 block. Values are row-major.
/// It owns the evaluated matrix, so the matrix memory counter keeps the
/// values until the host function returns.
pub(crate) struct CustomArgument {
    block: EvalMatrix,
}

// The native build has no JavaScript adapter, so only the engine tests read
// the shape; the WASM adapter reads it to build nested arrays.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
impl CustomArgument {
    pub(crate) fn rows(&self) -> usize {
        self.block.rows
    }

    pub(crate) fn cols(&self) -> usize {
        self.block.cols
    }

    pub(crate) fn values(&self) -> &[Value] {
        &self.block.values
    }
}

pub(crate) type CustomImplementation = Rc<dyn Fn(&[CustomArgument]) -> Value>;

pub(crate) struct CustomFunction {
    pub(crate) implementation: CustomImplementation,
    /// A volatile function recalculates on every edit and on the host clock
    /// barrier, as RAND does.
    pub(crate) volatile: bool,
}

pub(crate) type CustomFunctions = HashMap<String, CustomFunction>;

impl CellStore {
    /// Adds or replaces a host function and recalculates the workbook.
    // Only the WASM adapter calls this outside the engine tests.
    #[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
    pub(crate) fn install_custom_function(&mut self, name: &str, function: CustomFunction) -> bool {
        let installed = self.insert_custom_function(name, function);
        if installed {
            self.recompute_after_custom_change();
        }

        installed
    }

    /// Adds or replaces a host function without recalculating. A store that
    /// replaces another after a memory release already holds the calculated
    /// values, and a recalculation would draw new values for volatile formulas.
    ///
    /// A name that the parser reads as a built-in function or as something
    /// other than a call is refused, so a host function never hides a built-in
    /// function. A name that is also a cell reference (`A1`, `R1C1`) is refused
    /// as in Excel, because a sheet with more columns would read it as a
    /// reference.
    #[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
    pub(crate) fn insert_custom_function(&mut self, name: &str, function: CustomFunction) -> bool {
        let name = name.to_ascii_uppercase();
        let is_call = matches!(
            parse(&format!("={name}()")),
            Ok(Ast::UnknownFunc(parsed, arguments)) if parsed == name && arguments.is_empty()
        );
        if !is_call || is_reference_like(&name) {
            return false;
        }

        self.custom_functions
            .get_or_insert_default()
            .insert(name, function);
        true
    }

    /// Removes a host function. Its callers then show `#NAME?`.
    #[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
    pub(crate) fn remove_custom_function(&mut self, name: &str) -> bool {
        let removed = self
            .custom_functions
            .as_mut()
            .is_some_and(|functions| functions.remove(&name.to_ascii_uppercase()).is_some());
        if removed {
            self.recompute_after_custom_change();
        }

        removed
    }

    /// The dependency graph does not record which formulas call which host
    /// function, so a change to the set recalculates every formula.
    fn recompute_after_custom_change(&mut self) {
        for sheet in &mut self.sheets {
            sheet.formulas.mark_all_dirty();
        }

        self.recompute_changed();
    }

    /// Marks the formulas that call a volatile host function as dirty and
    /// returns their sheets. A formula entry records built-in volatility when
    /// it is parsed, but host functions can change after that, so this check
    /// reads the current set. It visits every formula only while a volatile
    /// host function is registered.
    pub(super) fn mark_custom_volatile_dirty(&mut self) -> Vec<usize> {
        let mut marked = Vec::new();
        let Some(functions) = self.custom_functions.as_deref() else {
            return marked;
        };
        if !functions.values().any(|function| function.volatile) {
            return marked;
        }

        for (index, sheet) in self.sheets.iter_mut().enumerate() {
            let keys: Vec<_> = sheet
                .formulas
                .iter()
                .filter_map(|(key, entry)| {
                    entry
                        .ast
                        .as_ref()
                        .is_some_and(|ast| calls_volatile_custom(ast, functions))
                        .then_some(key)
                })
                .collect();
            if !keys.is_empty() {
                sheet.formulas.mark_cells_dirty(keys);
                marked.push(index);
            }
        }

        marked
    }

    /// Calls a host function. An error argument propagates without a call,
    /// as in most built-in functions, so the host never receives error values.
    pub(super) fn eval_custom_function(
        &self,
        name: &str,
        arguments: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Value {
        let Some(function) = self
            .custom_functions
            .as_deref()
            .and_then(|functions| functions.get(&name.to_ascii_uppercase()))
        else {
            return Value::Error(FormulaError::Name);
        };

        let mut evaluated = Vec::with_capacity(arguments.len());
        for argument in arguments {
            let block = if range_from_ast(argument, sheet).is_some() || ast_produces_array(argument)
            {
                match self.eval_matrix_arg(argument, sheet, pass, depth + 1) {
                    Ok(matrix) => matrix,
                    Err(error) => return Value::Error(error),
                }
            } else {
                EvalMatrix::new(1, 1, vec![self.eval_ast(argument, sheet, pass, depth + 1)])
            };
            if let Some(Value::Error(error)) = block
                .values
                .iter()
                .find(|value| matches!(value, Value::Error(_)))
            {
                return Value::Error(*error);
            }

            evaluated.push(CustomArgument { block });
        }

        (function.implementation)(&evaluated)
    }
}

/// `A1`-style names: one to three letters, then digits. `R1C1`-style names:
/// `R`, optional digits, `C`, optional digits.
fn is_reference_like(name: &str) -> bool {
    let bytes = name.as_bytes();
    let letters = bytes
        .iter()
        .take_while(|byte| byte.is_ascii_uppercase())
        .count();
    let a1 = (1..=3).contains(&letters)
        && bytes.len() > letters
        && bytes[letters..].iter().all(u8::is_ascii_digit);

    let r1c1 = name.strip_prefix('R').is_some_and(|rest| {
        let rest = rest.trim_start_matches(|character: char| character.is_ascii_digit());
        rest.strip_prefix('C')
            .is_some_and(|rest| rest.bytes().all(|byte| byte.is_ascii_digit()))
    });

    a1 || r1c1
}

fn calls_volatile_custom(ast: &Ast, functions: &CustomFunctions) -> bool {
    let any = |arguments: &[Ast]| {
        arguments
            .iter()
            .any(|argument| calls_volatile_custom(argument, functions))
    };
    match ast {
        Ast::UnknownFunc(name, arguments) => {
            functions
                .get(&name.to_ascii_uppercase())
                .is_some_and(|function| function.volatile)
                || any(arguments)
        }
        Ast::Func(_, arguments) => any(arguments),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            calls_volatile_custom(left, functions) || calls_volatile_custom(right, functions)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
            calls_volatile_custom(inner, functions)
        }
        Ast::LetSlot { expression, .. } => calls_volatile_custom(expression, functions),
        _ => false,
    }
}

#[cfg(target_arch = "wasm32")]
mod javascript {
    use super::{CellStore, CustomArgument, CustomFunction, FormulaError, Value};
    use std::rc::Rc;
    use wasm_bindgen::prelude::*;

    fn to_js(value: &Value) -> JsValue {
        match value {
            Value::Number(number) => JsValue::from_f64(*number),
            Value::Text(text) => JsValue::from_str(text),
            Value::Bool(boolean) => JsValue::from_bool(*boolean),
            Value::Blank => JsValue::NULL,
            // Errors propagate before the call, so no argument holds one.
            Value::Error(error) => JsValue::from_str(error.sentinel()),
        }
    }

    /// A block of more than one cell becomes nested row arrays; one cell
    /// becomes its scalar, so `F(A1)` and `F(1)` read the same.
    fn argument_to_js(argument: &CustomArgument) -> JsValue {
        let (row_count, col_count) = (argument.rows(), argument.cols());
        if row_count <= 1 && col_count <= 1 {
            return argument.values().first().map_or(JsValue::NULL, to_js);
        }

        let rows = js_sys::Array::new_with_length(row_count as u32);
        for (index, row) in argument.values().chunks(col_count).enumerate() {
            let cells = js_sys::Array::new_with_length(col_count as u32);
            for (column, value) in row.iter().enumerate() {
                cells.set(column as u32, to_js(value));
            }
            rows.set(index as u32, cells.into());
        }

        rows.into()
    }

    /// A thrown error, a promise, or any other non-scalar result is `#VALUE!`,
    /// so a host function can never stop recalculation.
    fn value_from_js(result: Result<JsValue, JsValue>) -> Value {
        let Ok(result) = result else {
            return Value::Error(FormulaError::Value);
        };

        if result.is_null() || result.is_undefined() {
            Value::Blank
        } else if let Some(number) = result.as_f64() {
            Value::number(number)
        } else if let Some(boolean) = result.as_bool() {
            Value::Bool(boolean)
        } else if let Some(text) = result.as_string() {
            Value::text(text)
        } else {
            Value::Error(FormulaError::Value)
        }
    }

    fn host_function(implementation: js_sys::Function, volatile: bool) -> CustomFunction {
        CustomFunction {
            volatile,
            implementation: Rc::new(move |arguments| {
                let values: js_sys::Array = arguments.iter().map(argument_to_js).collect();
                value_from_js(implementation.apply(&JsValue::UNDEFINED, &values))
            }),
        }
    }

    #[wasm_bindgen]
    impl CellStore {
        /// Registers a synchronous host function on this store and
        /// recalculates. Returns `false` when the name cannot be a host
        /// function name.
        #[wasm_bindgen(js_name = registerFunction)]
        pub fn register_function(
            &mut self,
            name: &str,
            implementation: js_sys::Function,
            volatile: bool,
        ) -> bool {
            self.install_custom_function(name, host_function(implementation, volatile))
        }

        /// Registers a host function without recalculating, for a store that
        /// takes over the calculated values of another after a memory release.
        #[wasm_bindgen(js_name = restoreFunction)]
        pub fn restore_function(
            &mut self,
            name: &str,
            implementation: js_sys::Function,
            volatile: bool,
        ) -> bool {
            self.insert_custom_function(name, host_function(implementation, volatile))
        }

        /// Removes a host function and recalculates its callers to `#NAME?`.
        #[wasm_bindgen(js_name = unregisterFunction)]
        pub fn unregister_function(&mut self, name: &str) -> bool {
            self.remove_custom_function(name)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CustomArgument, CustomFunction};
    use crate::eval::matrix_resource_stats;
    use crate::types::{FormulaError, Value};
    use crate::CellStore;
    use std::cell::{Cell, RefCell};
    use std::rc::Rc;

    fn function(implementation: impl Fn(&[CustomArgument]) -> Value + 'static) -> CustomFunction {
        CustomFunction {
            implementation: Rc::new(implementation),
            volatile: false,
        }
    }

    fn text(store: &CellStore, sheet: usize, row: usize, col: usize) -> Option<String> {
        store.get_cell(sheet, row, col).string()
    }

    #[test]
    fn a_registered_function_calculates_and_follows_its_inputs() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, 2);
        store.set_number(sheet, 0, 0, 3.0, 0);
        store.set_formula(sheet, 0, 1, "=taxrate(A1)*2", 0);
        store.commit_sources();
        assert_eq!(text(&store, sheet, 0, 1).as_deref(), Some("#NAME?"));

        assert!(store.install_custom_function(
            "TaxRate",
            function(|arguments| match arguments[0].values()[0] {
                Value::Number(number) => Value::Number(number / 10.0),
                _ => Value::Error(FormulaError::Value),
            }),
        ));
        assert!((store.get_cell(sheet, 0, 1).num() - 0.6).abs() < 1e-12);

        store.set_number(sheet, 0, 0, 5.0, 0);
        store.commit_sources();
        assert!((store.get_cell(sheet, 0, 1).num() - 1.0).abs() < 1e-12);

        assert!(store.remove_custom_function("TAXRATE"));
        assert_eq!(text(&store, sheet, 0, 1).as_deref(), Some("#NAME?"));
        assert_eq!(
            store.formula_source(sheet, 0, 1).as_deref(),
            Some("=taxrate(A1)*2")
        );
    }

    #[test]
    fn ranges_arrive_as_accounted_row_major_blocks_and_error_arguments_skip_the_call() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 3);
        for (row, value) in [1.0, 2.0, 3.0, 4.0].chunks(2).enumerate() {
            store.set_number(sheet, row, 0, value[0], 0);
            store.set_number(sheet, row, 1, value[1], 0);
        }
        let calls = Rc::new(Cell::new(0));
        let shapes = Rc::new(RefCell::new(Vec::new()));
        let live_bytes = Rc::new(Cell::new(0));
        let (seen_calls, seen_shapes, seen_bytes) = (
            Rc::clone(&calls),
            Rc::clone(&shapes),
            Rc::clone(&live_bytes),
        );
        store.install_custom_function(
            "SHAPE",
            function(move |arguments| {
                seen_calls.set(seen_calls.get() + 1);
                seen_bytes.set(matrix_resource_stats()[0]);
                seen_shapes
                    .borrow_mut()
                    .extend(arguments.iter().map(|argument| {
                        (argument.rows(), argument.cols(), argument.values().to_vec())
                    }));
                Value::Blank
            }),
        );

        let before = matrix_resource_stats()[0];
        store.set_formula(sheet, 2, 0, "=SHAPE(A1:B2)", 0);
        store.set_formula(sheet, 2, 1, "=SHAPE(1/0)", 0);
        store.commit_sources();

        assert_eq!(calls.get(), 1);
        let numbers = [1.0, 2.0, 3.0, 4.0].map(Value::Number).to_vec();
        assert_eq!(*shapes.borrow(), vec![(2, 2, numbers)]);
        assert_eq!(text(&store, sheet, 2, 1).as_deref(), Some("#DIV/0!"));

        // The 2 x 2 block stays counted while the host function runs, and the
        // count returns to its start once the call ends.
        let block_bytes = (4 * std::mem::size_of::<Value>()) as u64;
        assert!(live_bytes.get() >= before + block_bytes);
        assert_eq!(matrix_resource_stats()[0], before);
    }

    #[test]
    fn a_volatile_function_recalculates_on_every_edit_and_built_in_names_are_refused() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, 2);
        let draws = Rc::new(Cell::new(0.0));
        let next = Rc::clone(&draws);
        store.set_formula(sheet, 0, 0, "=TICK()", 0);
        store.install_custom_function(
            "TICK",
            CustomFunction {
                implementation: Rc::new(move |_| {
                    next.set(next.get() + 1.0);
                    Value::Number(next.get())
                }),
                volatile: true,
            },
        );
        let first = store.get_cell(sheet, 0, 0).num();

        store.set_number(sheet, 1, 1, 9.0, 0);
        store.commit_sources();
        assert_eq!(store.get_cell(sheet, 0, 0).num(), first + 1.0);
        assert!(store.recompute_volatile(45_000.0));
        assert_eq!(store.get_cell(sheet, 0, 0).num(), first + 2.0);

        for name in ["SUM", "A1", "xfd99", "R1C1", "RC", "1X", "BAD NAME", ""] {
            assert!(
                !store.install_custom_function(name, function(|_| Value::Blank)),
                "{name}"
            );
        }
        for name in ["TAX.RATE", "_HELPER", "ABCD1", "RATE2X"] {
            assert!(
                store.install_custom_function(name, function(|_| Value::Blank)),
                "{name}"
            );
        }
    }
}
