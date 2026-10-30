//! Functions that describe a referenced cell instead of computing with its
//! value: FORMULATEXT, ISFORMULA and CELL, plus HYPERLINK, which returns its
//! display value.

use super::matrix::{optional_ast, range_from_ast};
use super::{address_text, current_formula_origin, EvalPass};
use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{cell_key, AbsCellKey, EvalResult, FormulaError, Value};

/// Excel returns `#N/A` from FORMULATEXT for formulas longer than its
/// formula-length limit, in characters.
const MAX_FORMULA_TEXT_CHARS: usize = 8_192;

/// Absolute row and column markers, as in `ADDRESS(row, col, 1)`.
const ABSOLUTE_ADDRESS: i32 = 1;

impl CellStore {
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
            _ => unreachable!("eval_info_func handles only the information functions"),
        };

        result.unwrap_or_else(Value::Error)
    }

    /// The top-left cell of a reference argument. A deleted reference is
    /// `#REF!`; any other value is `#VALUE!`, after its own error, as Excel
    /// reports a non-reference argument.
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
            reference => match range_from_ast(reference, sheet) {
                Some(range) => range,
                None => {
                    return match self.eval_ast(reference, sheet, pass, depth + 1) {
                        Value::Error(error) => Err(error),
                        _ => Err(FormulaError::Value),
                    }
                }
            },
        };

        let target = range.sheet as usize;
        let in_bounds = self.sheet_alive.get(target).copied().unwrap_or(false)
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
            .and_then(|key| data.formulas.get(key))
            .filter(|entry| entry.is_formula())
            .map(|entry| entry.source.as_str());
        if func == Func::IsFormula {
            return Ok(Value::Bool(source.is_some()));
        }

        match source {
            Some(source) if source.chars().count() <= MAX_FORMULA_TEXT_CHARS => {
                Ok(Value::text(source))
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
        let (link, friendly) = match args {
            [link] => (link, None),
            [link, friendly] => (link, optional_ast(args, 1).map(|_| friendly)),
            _ => return Err(FormulaError::Value),
        };

        let link = self.eval_ast(link, sheet, pass, depth + 1);
        if let Value::Error(error) = link {
            return Err(error);
        }

        Ok(match friendly {
            Some(friendly) => self.eval_ast(friendly, sheet, pass, depth + 1),
            None => link,
        })
    }

    /// `CELL(info_type, [reference])` for the info types the engine knows
    /// exactly: `address`, `col`, `contents`, `row` and `type`. Number formats,
    /// widths, colors and file names live in the host, so those types are
    /// `#VALUE!`. Without a reference, CELL describes the formula's own cell,
    /// as LibreOffice does; Excel would use the last changed cell instead.
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
            _ => return Err(FormulaError::Value),
        };

        let cell = match optional_ast(args, 1) {
            Some(reference) => self.reference_cell(reference, sheet, pass, depth)?,
            None => {
                let (row, col) = current_formula_origin().ok_or(FormulaError::Value)?;
                AbsCellKey {
                    sheet: sheet as u32,
                    row,
                    col,
                }
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
                _ => "v",
            })),
            _ => Err(FormulaError::Value),
        }
    }
}
