//! Functions that describe a referenced cell instead of computing with its
//! value: FORMULATEXT, ISFORMULA and CELL, plus HYPERLINK, which returns its
//! display value.

use super::matrix::{optional_ast, range_from_ast};
use super::{address_text, current_formula_origin, EvalPass};
use crate::calc::{sheet_name_key, Ast, Func};
use crate::store::CellStore;
use crate::types::{cell_key, AbsCellKey, EvalResult, FormulaError, Value};

/// Excel returns `#N/A` from FORMULATEXT for formulas longer than its
/// formula-length limit, in characters.
const MAX_FORMULA_TEXT_CHARS: usize = 8_192;

/// Absolute row and column markers, as in `ADDRESS(row, col, 1)`.
const ABSOLUTE_ADDRESS: i32 = 1;

impl CellStore {
    #[allow(
        clippy::wildcard_enum_match_arm,
        reason = "callers pass only the functions matched here; listing the 200 other Func variants adds nothing"
    )]
    pub(super) fn eval_info_func(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        let result = match func {
            Func::FormulaText | Func::IsFormula => match args {
                [reference] => self.formula_at_reference(func, reference, sheet, pass, depth),
                _ => Err(FormulaError::Value),
            },
            Func::Hyperlink => self.hyperlink_value(args, sheet, pass, depth),
            Func::Cell => self.cell_info(args, sheet, pass, depth),
            Func::ErrorType | Func::IsNonText => match args {
                [value] => Ok(value_information(
                    func,
                    self.eval_ast(value, sheet, pass, depth + 1),
                )),
                _ => Err(FormulaError::Value),
            },
            Func::IsRef => match args {
                [value] => Ok(Value::Bool(self.is_reference(value, sheet, pass, depth))),
                _ => Err(FormulaError::Value),
            },
            Func::Info => match args {
                [type_text] => self.environment_info(type_text, sheet, pass, depth),
                _ => Err(FormulaError::Value),
            },
            Func::Sheet => self.sheet_number(args, sheet, pass, depth),
            Func::Sheets => self.sheet_count(args, sheet, pass, depth),
            _ => unreachable!("eval_info_func handles only the information functions"),
        };

        result.unwrap_or_else(Value::Error)
    }

    /// The top-left cell of a reference argument. A deleted reference is
    /// `#REF!`; any other value is `#VALUE!`, after its own error, as Excel
    /// reports a non-reference argument.
    #[allow(
        clippy::wildcard_enum_match_arm,
        reason = "two Ast variants exist only with the analysis feature, so a full list differs by build; every other reference shape takes the last arm"
    )]
    fn reference_cell(
        &self,
        reference: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<AbsCellKey, FormulaError> {
        let range = match reference {
            Ast::InvalidRef | Ast::SheetCell(..) | Ast::SheetRange(..) => {
                return Err(FormulaError::Ref)
            }
            expression => match range_from_ast(expression, self.name_scope(sheet)) {
                Some(range) => range,
                None => {
                    return match self.eval_ast(reference, sheet, pass, depth + 1) {
                        Value::Error(error) => Err(error),
                        Value::Number(_) | Value::Text(_) | Value::Bool(_) | Value::Blank => {
                            Err(FormulaError::Value)
                        }
                    }
                }
            },
        };

        let target = range.sheet as usize;
        let in_bounds = self.sheet_alive.get(target).copied().unwrap_or_default()
            && self.sheets[target]
                .cells
                .contains_cell(range.row_start as usize, range.col_start as usize);
        if !in_bounds {
            return Err(FormulaError::Ref);
        }

        Ok(AbsCellKey {
            sheet: range.sheet,
            row: range.row_start,
            col: range.col_start,
        })
    }

    /// FORMULATEXT and ISFORMULA read the formula entry only, never the
    /// referenced value. The reference is still a dependency, so a formula
    /// that reads its own cell is a cycle. Host-linked reference cells and
    /// spilled cells hold no formula source.
    fn formula_at_reference(
        &self,
        func: Func,
        reference: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        let cell = self.reference_cell(reference, sheet, pass, depth)?;
        let data = &self.sheets[cell.sheet as usize];
        if !data.cells.is_loaded(cell.row as usize, cell.col as usize) {
            return Err(FormulaError::Loading);
        }

        let source = cell_key(cell.row as usize, cell.col as usize)
            .and_then(|key| data.formulas.get(key, &self.formula_slots))
            .filter(|entry| entry.is_formula())
            .map(|entry| entry.source(&self.written_names()));
        if func == Func::IsFormula {
            return Ok(Value::Bool(source.is_some()));
        }

        match source {
            Some(formula_text) if formula_text.chars().count() <= MAX_FORMULA_TEXT_CHARS => {
                Ok(Value::text(&*formula_text))
            }
            _ => Err(FormulaError::Na),
        }
    }

    /// `HYPERLINK(link, [friendly])` evaluates to its display value: the
    /// friendly name when given, otherwise the link. An error in the link is
    /// the result even when a friendly name is given, as in Excel.
    fn hyperlink_value(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        let (link_ast, friendly) = match args {
            [link] => (link, None),
            [link, friendly] => (link, optional_ast(args, 1).map(|_| friendly)),
            _ => return Err(FormulaError::Value),
        };

        let link = self.eval_ast(link_ast, sheet, pass, depth + 1);
        if let Value::Error(error) = link {
            return Err(error);
        }

        Ok(match friendly {
            Some(friendly_ast) => self.eval_ast(friendly_ast, sheet, pass, depth + 1),
            None => link,
        })
    }

    /// `CELL(info_type, [reference])` for the info types the engine knows
    /// exactly: `address`, `col`, `contents`, `row` and `type`. Number formats,
    /// widths, colors and file names live in the host, so those types are
    /// `#VALUE!`. Without a reference, CELL describes the formula's own cell,
    /// as `LibreOffice` does; Excel would use the last changed cell instead.
    fn cell_info(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        if !(1..=2).contains(&args.len()) {
            return Err(FormulaError::Value);
        }

        let info_type = match self.eval_ast(&args[0], sheet, pass, depth + 1) {
            Value::Text(text) => text,
            Value::Error(error) => return Err(error),
            Value::Number(_) | Value::Bool(_) | Value::Blank => return Err(FormulaError::Value),
        };

        let cell = if let Some(reference) = optional_ast(args, 1) {
            self.reference_cell(reference, sheet, pass, depth)?
        } else {
            let (row, col) = current_formula_origin().ok_or(FormulaError::Value)?;
            AbsCellKey {
                sheet: sheet as u32,
                row,
                col,
            }
        };

        let contents = |pass: &mut EvalPass<'_>| {
            self.eval_at(
                cell.sheet as usize,
                cell.row as usize,
                cell.col as usize,
                pass,
                depth + 1,
            )
        };

        match info_type.to_ascii_lowercase().as_str() {
            "address" => {
                let other_sheet = (cell.sheet as usize != sheet)
                    .then(|| self.sheet_names[cell.sheet as usize].as_str());
                address_text(
                    cell.row as usize,
                    cell.col as usize,
                    ABSOLUTE_ADDRESS,
                    true,
                    other_sheet,
                )
                .map(Value::text)
            }
            "row" => Ok(Value::number(f64::from(cell.row) + 1.0)),
            "col" => Ok(Value::number(f64::from(cell.col) + 1.0)),
            "contents" => Ok(contents(pass)),
            "type" => Ok(Value::text(match contents(pass) {
                Value::Blank => "b",
                Value::Text(_) => "l",
                Value::Number(_) | Value::Bool(_) | Value::Error(_) => "v",
            })),
            _ => Err(FormulaError::Value),
        }
    }

    /// ISREF: a cell, range, 3-D, union or intersection reference, or an
    /// OFFSET or INDIRECT call that resolves to one.
    fn is_reference(
        &self,
        value: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> bool {
        matches!(value, Ast::SheetSpan(_)) || self.area_count(value, sheet, pass, depth + 1).is_ok()
    }

    /// SHEET([value]): the tab position of the formula's sheet, of a
    /// referenced sheet, or of the sheet with a given name. Hidden sheets
    /// count. An unknown name is `#N/A`.
    fn sheet_number(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        let target = match args {
            [] => sheet,
            [Ast::InvalidRef] => return Err(FormulaError::Ref),
            [Ast::SheetSpan(span)] => *span.sheets.first().ok_or(FormulaError::Ref)? as usize,
            [value] => match range_from_ast(value, self.name_scope(sheet)) {
                Some(range) => range.sheet as usize,
                None => match self.eval_ast(value, sheet, pass, depth + 1) {
                    Value::Error(error) => return Err(error),
                    Value::Text(name) => self.sheet_named(&name).ok_or(FormulaError::Na)?,
                    Value::Number(_) | Value::Bool(_) | Value::Blank => {
                        return Err(FormulaError::Na)
                    }
                },
            },
            _ => return Err(FormulaError::Value),
        };

        self.tab_order()
            .iter()
            .position(|&handle| handle as usize == target)
            .map(|index| Value::number((index + 1) as f64))
            .ok_or(FormulaError::Ref)
    }

    /// The live sheet whose name matches `name`, ignoring case as Excel
    /// does.
    fn sheet_named(&self, name: &str) -> Option<usize> {
        self.sheet_lookup
            .get(&sheet_name_key(name))
            .copied()
            .filter(|&handle| self.sheet_alive.get(handle).copied().unwrap_or_default())
    }

    /// SHEETS([reference]): every sheet of the workbook, or the sheets a
    /// reference covers. A value that is not a reference is `#REF!`.
    fn sheet_count(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        let count = match args {
            [] => self.tab_order().len(),
            [Ast::SheetSpan(span)] => span.sheets.len(),
            [value] => {
                if self.is_reference(value, sheet, pass, depth) {
                    1
                } else {
                    return match self.eval_ast(value, sheet, pass, depth + 1) {
                        Value::Error(error) => Err(error),
                        Value::Number(_) | Value::Text(_) | Value::Bool(_) | Value::Blank => {
                            Err(FormulaError::Ref)
                        }
                    };
                }
            }
            _ => return Err(FormulaError::Value),
        };

        Ok(Value::number(count as f64))
    }

    /// `INFO(type_text)`, for the types that do not depend on the program
    /// that runs the workbook: "numfile" is the number of sheets and
    /// "recalc" is "Automatic", since the engine always recalculates.
    /// "memavail", "memused" and "totmem" are `#N/A`, as in current Excel.
    /// "directory", "origin", "osversion", "release" and "system" describe
    /// the desktop program and its window, so they are `#N/A` here. Other
    /// text is `#VALUE!`.
    fn environment_info(
        &self,
        type_text: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        let kind = match self.eval_ast(type_text, sheet, pass, depth + 1) {
            Value::Error(error) => return Err(error),
            Value::Text(text) => text.to_ascii_lowercase(),
            Value::Number(_) | Value::Bool(_) | Value::Blank => return Err(FormulaError::Value),
        };

        match kind.as_str() {
            "numfile" => Ok(Value::number(self.tab_order().len() as f64)),
            "recalc" => Ok(Value::text("Automatic")),
            "directory" | "origin" | "osversion" | "release" | "system" | "memavail"
            | "memused" | "totmem" => Err(FormulaError::Na),
            _ => Err(FormulaError::Value),
        }
    }
}

/// ERROR.TYPE and ISNONTEXT read error values instead of passing them on.
/// ERROR.TYPE numbers errors as Excel does; a value that is not an error,
/// or an error Excel does not number, is `#N/A`.
fn value_information(func: Func, value: Value) -> Value {
    if func == Func::IsNonText {
        return Value::Bool(!matches!(value, Value::Text(_)));
    }

    let number = match value {
        Value::Error(FormulaError::Null) => 1.0,
        Value::Error(FormulaError::DivZero) => 2.0,
        Value::Error(FormulaError::Value) => 3.0,
        Value::Error(FormulaError::Ref) => 4.0,
        Value::Error(FormulaError::Name) => 5.0,
        Value::Error(FormulaError::Num) => 6.0,
        Value::Error(FormulaError::Na) => 7.0,
        Value::Error(FormulaError::Loading) => 8.0,
        Value::Error(FormulaError::Spill) => 9.0,
        Value::Error(FormulaError::Calc) => 14.0,
        Value::Number(_) | Value::Text(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => {
            return Value::Error(FormulaError::Na)
        }
    };

    Value::number(number)
}

impl CellStore {
    /// The `IS*` tests, `TYPE`, `N`, `T`, and the cell information functions.
    #[inline(never)]
    #[allow(
        clippy::wildcard_enum_match_arm,
        reason = "callers pass only the functions matched here; listing the 200 other Func variants adds nothing"
    )]
    pub(super) fn eval_information_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if matches!(
            func,
            Func::IsBlank
                | Func::IsNumber
                | Func::IsText
                | Func::IsLogical
                | Func::IsError
                | Func::IsErr
                | Func::IsNa
                | Func::Type
                | Func::N
                | Func::T
        ) {
            if args.len() != 1 {
                return Value::Error(FormulaError::Value);
            }
            let value = self.eval_ast(&args[0], sheet, pass, depth + 1);
            return match func {
                Func::IsBlank => Value::Bool(matches!(value, Value::Blank)),
                Func::IsNumber => Value::Bool(matches!(value, Value::Number(_))),
                Func::IsText => Value::Bool(matches!(value, Value::Text(_))),
                Func::IsLogical => Value::Bool(matches!(value, Value::Bool(_))),
                Func::IsError => Value::Bool(matches!(value, Value::Error(_))),
                Func::IsErr => Value::Bool(matches!(
                    value,
                    Value::Error(error) if error != FormulaError::Na
                )),
                Func::IsNa => Value::Bool(value == Value::Error(FormulaError::Na)),
                Func::Type => Value::number(match value {
                    Value::Number(_) | Value::Blank => 1.0,
                    Value::Text(_) => 2.0,
                    Value::Bool(_) => 4.0,
                    Value::Error(_) => 16.0,
                }),
                Func::N => match value {
                    Value::Number(number) => Value::number(number),
                    Value::Bool(flag) => Value::number(if flag { 1.0 } else { 0.0 }),
                    Value::Error(error) => Value::Error(error),
                    Value::Text(_) | Value::Blank => Value::Number(0.0),
                },
                Func::T => match value {
                    Value::Text(text) => Value::Text(text),
                    Value::Error(error) => Value::Error(error),
                    Value::Number(_) | Value::Bool(_) | Value::Blank => Value::text(""),
                },
                _ => unreachable!(),
            };
        }
        self.eval_info_func(func, args, sheet, pass, depth + 1)
    }
}

/// FORMULATEXT, ISFORMULA, HYPERLINK and CELL describe a referenced cell or
/// return a display value.
#[cfg(test)]
mod tests {
    use crate::store::CellStore;
    use crate::tests::support::{assert_close, number, string};
    use crate::types::KIND_BOOL;

    fn bool_at(store: &CellStore, sheet: usize, col: usize) -> bool {
        assert_eq!(store.get_cell(sheet, 0, col).kind(), KIND_BOOL, "col {col}");
        number(store, sheet, 0, col) != 0.0
    }

    #[test]
    fn information_functions_read_formula_sources_and_cell_facts() {
        let mut store = CellStore::new();
        let data = store.add_sheet(2, 4);
        store.set_sheet_name(data, "data", "Data");
        let main = store.add_sheet(32, 3);
        store.set_sheet_name(main, "main", "Main");
        store.set_number(data, 0, 0, 5.0, 0);
        store.set_formula(data, 1, 0, "=A1*2", 0);
        store.set_string(data, 2, 0, "label", 0);

        let texts = [
            (0, "=FORMULATEXT(Data!A2)", "=A1*2"),
            (1, "=FORMULATEXT(Data!A1)", "#N/A"),
            (2, "=FORMULATEXT(Data!A4)", "#N/A"),
            (3, "=FORMULATEXT(1)", "#VALUE!"),
            (4, "=FORMULATEXT(1/0)", "#DIV/0!"),
            (5, "=FORMULATEXT(Data!A2:A3)", "=A1*2"),
            // The reference is a dependency, so a self-reference is a cycle.
            (6, "=FORMULATEXT(G1)", "#CYCLE!"),
            (7, "=ISFORMULA(\"A1\")", "#VALUE!"),
            (
                8,
                "=HYPERLINK(\"https://example.com\")",
                "https://example.com",
            ),
            (9, "=HYPERLINK(\"https://example.com\",\"Docs\")", "Docs"),
            (10, "=HYPERLINK(1/0,\"Docs\")", "#DIV/0!"),
            (11, "=HYPERLINK()", "#VALUE!"),
            (12, "=CELL(\"address\",Data!B3)", "'Data'!$B$3"),
            (13, "=CELL(\"Address\",B3)", "$B$3"),
            (14, "=CELL(\"type\",Data!A3)", "l"),
            (15, "=CELL(\"type\",Data!A4)", "b"),
            (16, "=CELL(\"type\",Data!A1)", "v"),
            (17, "=CELL(\"format\",Data!A1)", "#VALUE!"),
            (18, "=CELL(1,A1)", "#VALUE!"),
            (19, "=CELL(\"bogus\",A1)", "#VALUE!"),
            (29, "=CELL(\" row\",A1)", "#VALUE!"),
        ];
        let numbers = [
            (20, "=HYPERLINK(\"https://example.com\",Data!A1)", 5.0),
            (21, "=CELL(\"row\",Data!B3)", 3.0),
            (22, "=CELL(\"col\",Data!B3)", 2.0),
            (23, "=CELL(\"contents\",Data!A2)", 10.0),
            (24, "=CELL(\"col\")", 25.0),
        ];
        let bools = [
            (25, "=ISFORMULA(Data!A2)", true),
            (26, "=ISFORMULA(Data!A1)", false),
            (27, "=ISFORMULA(Data!A4)", false),
            (28, "=ISFORMULA(Data!A2:A3)", true),
        ];
        for (col, formula, _) in texts {
            store.set_formula(main, 0, col, formula, 0);
        }
        for (col, formula, _) in numbers {
            store.set_formula(main, 0, col, formula, 0);
        }
        for (col, formula, _) in bools {
            store.set_formula(main, 0, col, formula, 0);
        }
        store.commit_sources();

        for (col, formula, expected) in texts {
            assert_eq!(
                string(&store, main, 0, col).as_deref(),
                Some(expected),
                "{formula}"
            );
        }
        for (col, _, expected) in numbers {
            assert_close(number(&store, main, 0, col), expected);
        }
        for (col, formula, expected) in bools {
            assert_eq!(bool_at(&store, main, col), expected, "{formula}");
        }
    }
}
