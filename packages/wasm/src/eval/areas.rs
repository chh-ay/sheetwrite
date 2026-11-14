//! Multi-area references: unions `(A1,C3)`, intersections `A1:C3 B2:D4` and
//! 3-D references `Sheet1:Sheet3!A1`.
//!
//! An intersection of single-area references is itself a single area, so
//! `range_from_ast` resolves it and every range consumer accepts it. Unions
//! and 3-D references have several areas: the aggregate functions read them
//! area by area here, INDEX picks one area of a union, AREAS counts areas, and
//! every other position gives `#VALUE!`, as a union does in Excel.

use crate::calc::{Ast, Func, SheetSpanRef};
use crate::store::CellStore;
use crate::types::{CellRange, FormulaError, Value, FORMULA_RECURSION_LIMIT};

use super::functions::FuncAccumulator;
use super::lookup::positive_index;
use super::matrix::{intersection_range, range_from_ast};
use super::{placed_range, EvalPass};

/// One range of a multi-area reference and the depth to read it at, or the
/// error of a part that can't be read.
pub(super) type AreaRange = Result<(CellRange, usize), FormulaError>;

/// The functions that Excel lets read a 3-D reference.
fn accepts_sheet_span(func: Func) -> bool {
    match func {
        Func::Sum
        | Func::Avg
        | Func::Count
        | Func::CountA
        | Func::Max
        | Func::Min
        | Func::Product
        | Func::StdevS
        | Func::StdevP
        | Func::VarS
        | Func::VarP
        | Func::AverageA
        | Func::MaxA
        | Func::MinA
        | Func::StdevA
        | Func::StdevPA
        | Func::VarA
        | Func::VarPA => true,
        #[cfg(feature = "analysis")]
        Func::Analysis(id) => super::analysis::accepts_sheet_span(id),
        _ => false,
    }
}

/// The functions that read a union as one list of values. Functions that pair
/// cells by position, such as SUMPRODUCT and CORREL, need one range, so a
/// union there is `#VALUE!`, as in Excel.
fn accepts_union(func: Func) -> bool {
    match func {
        Func::Small
        | Func::Large
        | Func::RankEq
        | Func::Median
        | Func::ModeSngl
        | Func::PercentileInc
        | Func::QuartileInc
        | Func::GeoMean => true,
        #[cfg(feature = "analysis")]
        Func::Analysis(id) => super::analysis::accepts_union(id),
        _ => accepts_sheet_span(func),
    }
}

impl CellStore {
    /// A value position reads a one-cell intersection as that cell. A larger
    /// intersection is `#VALUE!` there, as a written range is.
    pub(super) fn eval_intersection(
        &self,
        operands: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Value {
        match intersection_range(operands, sheet) {
            Ok(range) if range.row_start == range.row_end && range.col_start == range.col_end => {
                self.eval_at(
                    range.sheet as usize,
                    range.row_start as usize,
                    range.col_start as usize,
                    pass,
                    depth + 1,
                )
            }
            Ok(_) => Value::Error(FormulaError::Value),
            Err(error) => Value::Error(error),
        }
    }

    pub(super) fn eval_areas(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Value {
        let [reference] = args else {
            return Value::Error(FormulaError::Value);
        };
        match self.area_count(reference, sheet, pass, depth + 1) {
            Ok(count) => Value::number(count as f64),
            Err(error) => Value::Error(error),
        }
    }

    pub(super) fn area_count(
        &self,
        reference: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<usize, FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }

        match reference {
            Ast::Func(Func::Union, areas) => {
                let mut count = 0;
                for area in areas {
                    count += self.area_count(area, sheet, pass, depth + 1)?;
                }
                Ok(count)
            }
            Ast::Func(Func::Intersect, operands) => intersection_range(operands, sheet).map(|_| 1),
            // Inside LET and LAMBDA these calls are still unresolved here.
            Ast::Func(func @ (Func::Offset | Func::Indirect), args) => self
                .runtime_range(*func, args, sheet, pass, depth + 1)
                .map(|_| 1),
            Ast::InvalidRef => Err(FormulaError::Ref),
            other @ (Ast::Num(_)
            | Ast::Str(_)
            | Ast::Bool(_)
            | Ast::Missing
            | Ast::Name(_)
            | Ast::NamedRange(_)
            | Ast::NamedFormula(_)
            | Ast::UnresolvedStructured(_)
            | Ast::Structured(_)
            | Ast::Cell(..)
            | Ast::SheetCell(..)
            | Ast::AbsCell(..)
            | Ast::Range(..)
            | Ast::SheetRange(..)
            | Ast::AbsRange(..)
            | Ast::SheetSpan(_)
            | Ast::Func(..)
            | Ast::UnknownFunc(..)
            | Ast::Bin(..)
            | Ast::Cmp(..)
            | Ast::Neg(_)
            | Ast::Pos(_)
            | Ast::Percent(_)
            | Ast::LetSlot { .. }
            | Ast::LetName { .. }
            | Ast::Array { .. }) => range_from_ast(other, sheet)
                .map(|_| 1)
                .ok_or(FormulaError::Value),
            #[cfg(feature = "analysis")]
            other @ (Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_)) => {
                range_from_ast(other, sheet)
                    .map(|_| 1)
                    .ok_or(FormulaError::Value)
            }
        }
    }

    /// Pushes every cell of a union or 3-D reference as one argument of an
    /// aggregate function, area by area. Its shape is one column of all
    /// those cells, since the areas need not line up.
    pub(super) fn eval_area_values(
        &self,
        func: Func,
        reference: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
        values: &mut FuncAccumulator,
    ) -> Result<(usize, usize), FormulaError> {
        let start = values.len();
        self.push_area_values(func, reference, sheet, pass, depth, values)?;

        let cells = values.len() - start;
        if cells == 0 {
            // Every sheet of the span is smaller than the range. One blank
            // keeps the argument, and the aggregates skip blank cells.
            values.push_range(Value::Blank)?;
            return Ok((1, 1));
        }
        Ok((cells, 1))
    }

    fn push_area_values(
        &self,
        func: Func,
        reference: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
        values: &mut FuncAccumulator,
    ) -> Result<(), FormulaError> {
        for area in self.area_ranges(func, reference, sheet, depth) {
            let (range, range_depth) = area?;
            self.eval_range_values(range, pass, range_depth, values)?;
        }
        Ok(())
    }

    /// The ranges of a union or 3-D reference that `func` reads, in order,
    /// each with the depth to read it at. A part that `func` can't read ends
    /// the list with its error, so the ranges before it are still read first.
    pub(super) fn area_ranges(
        &self,
        func: Func,
        reference: &Ast,
        sheet: usize,
        depth: usize,
    ) -> Vec<AreaRange> {
        if depth > FORMULA_RECURSION_LIMIT {
            return vec![Err(FormulaError::Num)];
        }

        match reference {
            Ast::Func(Func::Union, areas) if accepts_union(func) => {
                let mut ranges = Vec::new();
                for area in areas {
                    if let Some(range) = range_from_ast(area, sheet) {
                        ranges.push(Ok((range, depth + 1)));
                        continue;
                    }

                    ranges.extend(self.area_ranges(func, area, sheet, depth + 1));
                    if ranges.last().is_some_and(Result::is_err) {
                        break;
                    }
                }
                ranges
            }
            Ast::SheetSpan(span) if accepts_sheet_span(func) => self.sheet_span_ranges(span, depth),
            // A resolvable intersection never reaches here: it is one range.
            Ast::Func(Func::Intersect, operands) => vec![Err(intersection_range(operands, sheet)
                .err()
                .unwrap_or(FormulaError::Value))],
            Ast::InvalidRef => vec![Err(FormulaError::Ref)],
            Ast::Num(_)
            | Ast::Str(_)
            | Ast::Bool(_)
            | Ast::Missing
            | Ast::Name(_)
            | Ast::NamedRange(_)
            | Ast::NamedFormula(_)
            | Ast::UnresolvedStructured(_)
            | Ast::Structured(_)
            | Ast::Cell(..)
            | Ast::SheetCell(..)
            | Ast::AbsCell(..)
            | Ast::Range(..)
            | Ast::SheetRange(..)
            | Ast::AbsRange(..)
            | Ast::SheetSpan(_)
            | Ast::Func(..)
            | Ast::UnknownFunc(..)
            | Ast::Bin(..)
            | Ast::Cmp(..)
            | Ast::Neg(_)
            | Ast::Pos(_)
            | Ast::Percent(_)
            | Ast::LetSlot { .. }
            | Ast::LetName { .. }
            | Ast::Array { .. } => vec![Err(FormulaError::Value)],
            #[cfg(feature = "analysis")]
            Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => {
                vec![Err(FormulaError::Value)]
            }
        }
    }

    /// The range of a 3-D reference on each of its sheets, each with the
    /// depth to read it at.
    fn sheet_span_ranges(&self, span: &SheetSpanRef, depth: usize) -> Vec<AreaRange> {
        let placed = placed_range(
            0,
            (span.row_start, span.col_start),
            (span.row_end, span.col_end),
            span.flags,
        );
        span.sheets
            .iter()
            .filter(|&&handle| {
                // Sheets here have their own sizes, unlike Excel's fixed
                // grid: cells beyond a smaller sheet are blank, so they
                // add nothing instead of turning the span into #REF!.
                self.sheets.get(handle as usize).is_some_and(|data| {
                    (placed.row_start as usize) < data.cells.row_count()
                        && (placed.col_start as usize) < data.cells.n_cols()
                })
            })
            .map(|&handle| {
                Ok((
                    CellRange {
                        sheet: handle,
                        ..placed
                    },
                    depth + 1,
                ))
            })
            .collect()
    }

    /// The area that INDEX reads: area `area_num` (from 1, default 1) of a
    /// union, or the reference itself, which has only area 1.
    pub(super) fn index_area<'a>(
        &self,
        reference: &'a Ast,
        area_num: Option<&Ast>,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<&'a Ast, FormulaError> {
        let index = match area_num {
            None | Some(Ast::Missing) => 0,
            Some(area_ast) => positive_index(&self.eval_ast(area_ast, sheet, pass, depth + 1))?,
        };
        match reference {
            Ast::Func(Func::Union, areas) => areas.get(index).ok_or(FormulaError::Ref),
            _ if index == 0 => Ok(reference),
            Ast::Num(_)
            | Ast::Str(_)
            | Ast::Bool(_)
            | Ast::Missing
            | Ast::Name(_)
            | Ast::NamedRange(_)
            | Ast::NamedFormula(_)
            | Ast::UnresolvedStructured(_)
            | Ast::Structured(_)
            | Ast::Cell(..)
            | Ast::SheetCell(..)
            | Ast::AbsCell(..)
            | Ast::Range(..)
            | Ast::SheetRange(..)
            | Ast::AbsRange(..)
            | Ast::SheetSpan(_)
            | Ast::InvalidRef
            | Ast::Func(..)
            | Ast::UnknownFunc(..)
            | Ast::Bin(..)
            | Ast::Cmp(..)
            | Ast::Neg(_)
            | Ast::Pos(_)
            | Ast::Percent(_)
            | Ast::LetSlot { .. }
            | Ast::LetName { .. }
            | Ast::Array { .. } => Err(FormulaError::Ref),
            #[cfg(feature = "analysis")]
            Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => Err(FormulaError::Ref),
        }
    }
}
