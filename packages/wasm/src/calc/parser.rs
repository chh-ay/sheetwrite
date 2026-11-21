//! Formula text to `Ast`.

use super::*;

/// A parsed formula and the resolution steps it needs, or the parse error.
pub(crate) type ParseResult = Result<(Ast, ParseFeatures), String>;

/// Finds the handle of the workbook sheet a formula names.
pub(crate) type SheetResolver<'a> = dyn Fn(&str) -> Option<u32> + 'a;

/// Gives a 3-D reference with bound endpoints the sheets it spans; fails when
/// an endpoint is not in the tab order.
pub(crate) type SpanPlacer<'a> = dyn Fn(&mut SheetSpanRef) -> bool + 'a;

/// Binds a table reference to a table slot while the formula is parsed.
/// `None` keeps the reference unbound, an error when read, until a table
/// edit binds it.
pub(crate) type TableBinder<'a> = dyn Fn(WrittenTableRef<'_>) -> Option<StructuredRef> + 'a;

/// Which resolution steps a parsed formula needs: each is set when the
/// formula holds a node that the step rewrites, so ingest skips the others.
#[derive(Clone, Copy, Default)]
pub(crate) struct ParseFeatures {
    /// A sheet-qualified cell, range or 3-D reference.
    pub(crate) sheet_refs: bool,
    /// A bare name or an unknown function, which may name a defined name.
    pub(crate) names: bool,
    /// A table reference, bound or not.
    pub(crate) table_refs: bool,
    /// A sheet reference left detached: an external link or a sheet that the
    /// workbook does not have.
    pub(crate) detached_sheets: bool,
    /// A LAMBDA, whose parameter uses are numbered before the formula is
    /// stored.
    #[cfg(feature = "analysis")]
    pub(crate) lambdas: bool,
}

/// Binary operator levels, loosest first. A comparison does not chain.
const COMPARISON: u8 = 1;
const CONCATENATION: u8 = 2;
const ADDITION: u8 = 3;
const MULTIPLICATION: u8 = 4;
const POWER: u8 = 5;

#[derive(Clone, Copy)]
enum BinaryOperator {
    Cmp(CmpOp),
    Op(Op),
}

/// The level and operator of a binary operator token.
#[inline]
const fn binary_operator(tok: &Tok<'_>) -> Option<(u8, BinaryOperator)> {
    Some(match tok {
        Tok::Cmp(op) => (COMPARISON, BinaryOperator::Cmp(*op)),
        Tok::Op('&') => (CONCATENATION, BinaryOperator::Op(Op::Concat)),
        Tok::Op('+') => (ADDITION, BinaryOperator::Op(Op::Add)),
        Tok::Op('-') => (ADDITION, BinaryOperator::Op(Op::Sub)),
        Tok::Op('*') => (MULTIPLICATION, BinaryOperator::Op(Op::Mul)),
        Tok::Op('/') => (MULTIPLICATION, BinaryOperator::Op(Op::Div)),
        Tok::Op('^') => (POWER, BinaryOperator::Op(Op::Pow)),
        Tok::Num(_)
        | Tok::Str(_)
        | Tok::Ident(..)
        | Tok::Structured(_)
        | Tok::Op(_)
        | Tok::LParen
        | Tok::RParen
        | Tok::Comma
        | Tok::Semicolon
        | Tok::LBrace
        | Tok::RBrace
        | Tok::Colon
        | Tok::Bang
        | Tok::Error(_)
        | Tok::Hash
        | Tok::Intersect
        | Tok::End => return None,
    })
}

#[derive(Clone, Copy)]
struct SheetBinding<'a> {
    resolve: &'a SheetResolver<'a>,
    place_span: &'a SpanPlacer<'a>,
    bind_table: &'a TableBinder<'a>,
}

struct Parser<'a, 's> {
    cursor: Cursor<'a>,
    features: ParseFeatures,
    sheets: Option<SheetBinding<'s>>,
    /// The arguments of the calls being parsed, innermost last. Each call
    /// moves its own into one exact allocation when it closes.
    args: Vec<Ast>,
}

thread_local! {
    /// The argument stack, kept between parses so ingest does not allocate
    /// it for every formula.
    static PARSE_ARGS: std::cell::Cell<Vec<Ast>> = const { std::cell::Cell::new(Vec::new()) };
}

impl<'a> Parser<'a, '_> {
    #[inline]
    fn peek(&mut self) -> Option<&Tok<'a>> {
        self.cursor.peek_at(0)
    }

    #[inline]
    fn next(&mut self) -> Option<Tok<'a>> {
        self.cursor.next()
    }

    /// The `)` that closes a call or a group. A missing `)` at the end and a
    /// wrong token in its place get different messages.
    fn close_paren(&mut self) -> Result<(), String> {
        match self.next() {
            Some(Tok::RParen) => Ok(()),
            None | Some(Tok::End) => Err(MISSING_CLOSE_PAREN.into()),
            Some(_) => Err(NOT_EXPECTED.into()),
        }
    }

    fn guard_depth(depth: usize) -> Result<(), String> {
        if depth > PARSE_RECURSION_LIMIT {
            Err("The formula has too many nested levels.".into())
        } else {
            Ok(())
        }
    }

    fn expr(&mut self) -> Result<Ast, String> {
        self.expr_at(0)
    }

    fn expr_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;
        self.binary_at(COMPARISON, depth)
    }

    /// Operands joined by binary operators of level `min_level` or tighter.
    /// Each level is left-associative; a comparison takes one right operand
    /// and ends the expression.
    fn binary_at(&mut self, min_level: u8, depth: usize) -> Result<Ast, String> {
        let mut left = self.postfix_at(depth)?;

        while let Some((level, operator)) = self.peek().and_then(binary_operator) {
            if level < min_level {
                break;
            }

            let _ = self.next();
            let right = Box::new(self.binary_at(level + 1, depth)?);
            let left_operand = Box::new(left);
            left = match operator {
                BinaryOperator::Cmp(op) => Ast::Cmp(op, left_operand, right),
                BinaryOperator::Op(op) => Ast::Bin(op, left_operand, right),
            };

            if level == COMPARISON {
                break;
            }
        }

        Ok(left)
    }

    fn postfix_at(&mut self, depth: usize) -> Result<Ast, String> {
        let mut value = self.unary_at(depth)?;
        #[cfg(feature = "analysis")]
        while matches!(self.peek(), Some(Tok::LParen)) {
            let _ = self.next();
            let mut args = vec![value];
            if !matches!(self.peek(), Some(Tok::RParen)) {
                loop {
                    args.push(if matches!(self.peek(), Some(Tok::Comma | Tok::RParen)) {
                        Ast::Missing
                    } else {
                        self.expr_at(depth + 1)?
                    });
                    if !matches!(self.peek(), Some(Tok::Comma)) {
                        break;
                    }
                    let _ = self.next();
                }
            }
            self.close_paren()?;
            self.features.names = true;
            value = Ast::UnknownFunc(Box::new(UnknownCall {
                name: "$LAMBDA_CALL".into(),
                args: args.into(),
            }));
        }
        while matches!(self.peek(), Some(Tok::Op('%'))) {
            let _ = self.next();
            value = Ast::Percent(Box::new(value));
        }
        Ok(value)
    }

    fn unary_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        if let Some(Tok::Op(peeked @ ('+' | '-'))) = self.peek() {
            let sign = *peeked;
            let _ = self.next();
            let inner = Box::new(self.unary_at(depth + 1)?);
            return Ok(if sign == '-' {
                Ast::Neg(inner)
            } else {
                Ast::Pos(inner)
            });
        }
        // Intersection binds tighter than every operator except `:`.
        let value = self.primary_at(depth)?;
        if matches!(self.peek(), Some(Tok::Intersect)) {
            return self.intersection_at(value, depth);
        }
        Ok(value)
    }

    /// The rest of `A1:C3 B2:D4` after its first operand. A chain keeps one
    /// flat operand list, since the order of intersection does not change
    /// its cells.
    #[cold]
    fn intersection_at(&mut self, first: Ast, depth: usize) -> Result<Ast, String> {
        let mut operands = vec![first];
        while matches!(self.peek(), Some(Tok::Intersect)) {
            let _ = self.next();
            operands.push(self.primary_at(depth)?);
        }
        Ok(Ast::Func(Func::Intersect, operands.into()))
    }

    /// A number, or the first row of a whole-row range such as `1:3`.
    fn number_or_rows_at(&mut self, number: f64) -> Result<Ast, String> {
        if matches!(self.peek(), Some(Tok::Colon)) {
            if let Some(start) = AreaEnd::of(&Tok::Num(number)) {
                let _ = self.next();
                let (r0, c0, r1, c1, range_flags) = self.area_after_colon(start)?;
                return Ok(Ast::Range(r0, c0, r1, c1, range_flags));
            }
        }
        Ok(Ast::Num(number))
    }

    fn primary_at(&mut self, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;

        match self.next() {
            Some(Tok::Num(n)) => self.number_or_rows_at(n),
            Some(Tok::Str(value)) => Ok(Ast::Str(value.into())),
            Some(Tok::LParen) => {
                let first = self.expr_at(depth + 1)?;
                let value = if matches!(self.peek(), Some(Tok::Comma)) {
                    let mut areas = vec![first];
                    while matches!(self.peek(), Some(Tok::Comma)) {
                        let _ = self.next();
                        areas.push(self.expr_at(depth + 1)?);
                    }
                    Ast::Func(Func::Union, areas.into())
                } else {
                    first
                };
                self.close_paren()?;
                Ok(value)
            }
            Some(Tok::Ident(name, quoted)) => self.ident_at(name, quoted, depth),
            Some(Tok::Structured(raw)) => self.structured_or_external_at(raw),
            Some(Tok::Error(FormulaError::Ref)) => Ok(Ast::InvalidRef),
            Some(Tok::LBrace) => self.array_constant(),
            None | Some(Tok::End) => Err("Enter a value to complete the formula.".into()),
            Some(_) => Err("Enter a value before this.".into()),
        }
    }

    fn array_constant(&mut self) -> Result<Ast, String> {
        let mut values = Vec::new();
        let mut cols = 0usize;
        let mut row_len = 0usize;
        loop {
            values.push(self.array_element()?);
            row_len += 1;
            match self.next() {
                Some(Tok::Comma) => continue,
                Some(separator @ (Tok::Semicolon | Tok::RBrace)) => {
                    if cols == 0 {
                        cols = row_len;
                    } else if row_len != cols {
                        return Err(
                            "All rows of an array constant must have the same length.".into()
                        );
                    }
                    if matches!(separator, Tok::RBrace) {
                        break;
                    }
                    row_len = 0;
                }
                None | Some(Tok::End) => return Err("Add } to close the array constant.".into()),
                _ => return Err("Use , ; or } between the values of an array constant.".into()),
            }
        }
        let width =
            u32::try_from(cols).map_err(|_| "The array constant is too wide.".to_owned())?;
        Ok(Ast::Array(Box::new(ArrayLiteral {
            cols: width,
            values: values.into(),
        })))
    }

    /// One array-constant element: a number with an optional sign, text, a
    /// logical value, or an error. References and expressions are rejected.
    fn array_element(&mut self) -> Result<Value, String> {
        let value = match self.next() {
            Some(Tok::Num(number)) => Value::number(number),
            Some(Tok::Op(sign @ ('+' | '-'))) => match self.next() {
                Some(Tok::Num(number)) => Value::number(if sign == '-' { -number } else { number }),
                _ => return Err("Enter a number after the sign in an array constant.".into()),
            },
            Some(Tok::Str(text)) => Value::text(text),
            Some(Tok::Ident(name, false)) if name.eq_ignore_ascii_case("TRUE") => Value::Bool(true),
            Some(Tok::Ident(name, false)) if name.eq_ignore_ascii_case("FALSE") => {
                Value::Bool(false)
            }
            Some(Tok::Error(error)) => Value::Error(error),
            _ => {
                return Err(
                    "An array constant can contain only numbers, text, logical values and errors."
                        .into(),
                )
            }
        };
        Ok(value)
    }

    fn structured_ref(&mut self, raw: &str, table_name: Option<&str>) -> Result<Ast, String> {
        self.features.table_refs = true;
        let (section, column_name) = structured_parts(raw)?;
        let written = WrittenTableRef {
            table: table_name,
            column: column_name,
            section,
        };
        let bound = self
            .sheets
            .and_then(|binding| (binding.bind_table)(written));
        Ok(bound.map_or_else(
            || {
                Ast::UnresolvedStructured(Box::new(UnresolvedStructuredRef {
                    table_name: table_name.map(str::to_owned),
                    column_name: column_name.to_owned(),
                    section,
                }))
            },
            Ast::Structured,
        ))
    }

    /// A `[...]` that starts an operand. Before `Sheet1!`, it is the workbook
    /// of an external reference (`[Budget.xlsx]Annual!C10`), kept as a sheet
    /// reference whose name holds the workbook. Otherwise it is a table
    /// reference of the current table.
    fn structured_or_external_at(&mut self, raw: String) -> Result<Ast, String> {
        let names_sheet = matches!(self.cursor.peek_at(0), Some(Tok::Ident(_, false)))
            && matches!(self.cursor.peek_at(1), Some(Tok::Bang));
        if !names_sheet {
            // `[Budget.xlsx]!Total`: a defined name of the other workbook.
            let names_name = matches!(self.cursor.peek_at(0), Some(Tok::Bang))
                && matches!(self.cursor.peek_at(1), Some(Tok::Ident(_, false)));
            if names_name {
                let _ = self.next();
                return self.external_name_at(raw);
            }
            return self.structured_ref(&raw, None);
        }

        let Some(Tok::Ident(sheet, _)) = self.next() else {
            unreachable!("peeked external sheet name");
        };
        let _ = self.next();
        self.sheet_ref_at(format!("{raw}{sheet}").into(), false)
    }

    fn ident_at(&mut self, name: Cow<'a, str>, quoted: bool, depth: usize) -> Result<Ast, String> {
        Self::guard_depth(depth)?;
        match self.peek() {
            Some(Tok::Structured(_)) => {
                let Some(Tok::Structured(raw)) = self.next() else {
                    unreachable!("peeked structured token");
                };
                return self.structured_ref(&raw, Some(&name));
            }
            Some(Tok::Colon) => {
                let spans_sheets = matches!(self.cursor.peek_at(1), Some(Tok::Ident(..)))
                    && matches!(self.cursor.peek_at(2), Some(Tok::Bang));
                if spans_sheets {
                    let _ = self.next();
                    let Some(Tok::Ident(last, last_quoted)) = self.next() else {
                        unreachable!("peeked 3-D reference end");
                    };
                    let _ = self.next();
                    // Excel quotes a span as a whole, so either quoted end quotes both.
                    return self.sheet_span_at(
                        name.into_owned(),
                        last.into_owned(),
                        quoted || last_quoted,
                    );
                }
            }
            Some(Tok::Bang) => {
                let _ = self.next();
                return self.sheet_ref_at(name, quoted);
            }
            Some(Tok::LParen) => {
                let _ = self.next();
                return self.call_at(name, depth);
            }
            _ => {}
        }

        if name.eq_ignore_ascii_case("TRUE") {
            return Ok(Ast::Bool(true));
        }
        if name.eq_ignore_ascii_case("FALSE") {
            return Ok(Ast::Bool(false));
        }

        if matches!(self.peek(), Some(Tok::Colon)) {
            if let Some(start) = AreaEnd::of_name(name.as_ref()) {
                let _ = self.next();
                let (r0, c0, r1, c1, range_flags) = self.area_after_colon(start)?;
                return Ok(Ast::Range(r0, c0, r1, c1, range_flags));
            }
        }
        if let Some((row, col, flags)) = parse_a1(name.as_ref()) {
            Ok(self.spill_suffix(Ast::Cell(row, col, flags)))
        } else {
            self.features.names = true;
            Ok(Ast::Name((name.into_owned()).into()))
        }
    }

    /// The arguments of a call to `name` after its `(`.
    fn call_at(&mut self, name: Cow<'a, str>, depth: usize) -> Result<Ast, String> {
        let func = lookup_func(name.as_ref());
        #[cfg(feature = "analysis")]
        if func == Some(Func::Analysis(crate::eval::analysis::LAMBDA_ID)) {
            self.features.lambdas = true;
        }
        let first = self.args.len();
        if !matches!(self.peek(), Some(Tok::RParen)) {
            loop {
                let arg = if matches!(self.peek(), Some(Tok::Comma | Tok::RParen)) {
                    Ast::Missing
                } else {
                    self.expr_at(depth + 1)?
                };
                self.args.push(arg);
                match self.peek() {
                    Some(Tok::Comma) => {
                        let _ = self.next();
                    }
                    _ => break,
                }
            }
        }
        self.close_paren()?;
        let args: Box<[Ast]> = self.args.drain(first..).collect();
        Ok(if let Some(known) = func {
            Ast::Func(known, args)
        } else {
            self.features.names = true;
            Ast::UnknownFunc(Box::new(UnknownCall {
                name: name.into_owned(),
                args,
            }))
        })
    }

    fn sheet_ref_at(&mut self, sheet_name: Cow<'a, str>, quoted: bool) -> Result<Ast, String> {
        if quoted && !is_external_sheet(&sheet_name) && !sheet_name.contains(['\\', '/']) {
            if let Some((first, last)) = sheet_name.split_once(':') {
                return self.sheet_span_at(first.to_owned(), last.to_owned(), true);
            }
        }
        let names_name = matches!(self.peek(), Some(Tok::Ident(name, false)) if parse_a1(name).is_none())
            && !matches!(self.cursor.peek_at(1), Some(Tok::Colon))
            && names_workbook(&sheet_name);
        if names_name {
            let qualifier = if quoted {
                format!("'{}'", sheet_name.replace('\'', "''"))
            } else {
                sheet_name.into_owned()
            };
            return self.external_name_at(qualifier);
        }
        self.features.sheet_refs = true;
        let start = self.area_end("!")?;
        let bound = self
            .sheets
            .and_then(|binding| (binding.resolve)(&sheet_name));
        self.features.detached_sheets |= bound.is_none();
        if matches!(self.peek(), Some(Tok::Colon)) {
            let _ = self.next();
            let (end_sheet, end) = self.sheet_range_end(&sheet_name)?;
            if sheet_name_key(&end_sheet) != sheet_name_key(&sheet_name) {
                return Err("A range must stay on one sheet.".into());
            }
            let (r0, c0, r1, c1, mut flags) = area(start, end).ok_or(MIXED_AREA)?;
            flags.start = flags.start.with_quoted(quoted);
            return Ok(match bound {
                Some(handle) => Ast::AbsRange(SheetRef { handle }, r0, c0, r1, c1, flags),
                None => Ast::SheetRange(Box::new(DetachedRangeRef {
                    sheet: UnresolvedSheetRef {
                        name: sheet_name.into_owned(),
                        quoted,
                    },
                    row_start: r0,
                    col_start: c0,
                    row_end: r1,
                    col_end: c1,
                    flags,
                })),
            });
        }
        let AreaEnd::Cell(row, col, cell_flags) = start else {
            return Err(LONE_AXIS.into());
        };
        let flags = cell_flags.with_quoted(quoted);
        let reference = match bound {
            Some(handle) => Ast::AbsCell(SheetRef { handle }, row, col, flags),
            None => Ast::SheetCell(Box::new(DetachedCellRef {
                sheet: UnresolvedSheetRef {
                    name: sheet_name.into_owned(),
                    quoted,
                },
                row,
                col,
                flags,
            })),
        };
        Ok(self.spill_suffix(reference))
    }

    /// The cell or range after the `!` of a 3-D reference from sheet `first`
    /// to sheet `last`.
    #[cold]
    fn sheet_span_at(&mut self, first: String, last: String, quoted: bool) -> Result<Ast, String> {
        self.features.sheet_refs = true;
        let start = self.area_end("!")?;
        let (cell, (row_start, col_start, row_end, col_end, range_flags)) =
            if matches!(self.peek(), Some(Tok::Colon)) {
                let _ = self.next();
                (false, self.area_after_colon(start)?)
            } else if let AreaEnd::Cell(row, col, flags) = start {
                (true, normalize_range(row, col, flags, row, col, flags))
            } else {
                return Err(LONE_AXIS.into());
            };

        let endpoint = |name: String| match self.sheets.and_then(|binding| (binding.resolve)(&name))
        {
            Some(handle) => SheetSpanEndpoint {
                handle,
                name: None,
                quoted,
            },
            None => SheetSpanEndpoint {
                handle: UNRESOLVED_SHEET,
                name: Some(name.into_boxed_str()),
                quoted,
            },
        };
        let mut span = SheetSpanRef {
            first: endpoint(first),
            last: endpoint(last),
            sheets: Vec::new(),
            row_start,
            col_start,
            row_end,
            col_end,
            flags: range_flags,
            cell,
        };
        if span.first.handle == UNRESOLVED_SHEET || span.last.handle == UNRESOLVED_SHEET {
            self.features.detached_sheets = true;
        } else if let Some(binding) = self.sheets {
            (binding.place_span)(&mut span);
        }
        Ok(Ast::SheetSpan(Box::new(span)))
    }

    /// The defined name after `qualifier!`, where `qualifier` names another
    /// workbook as the formula writes it. The name keeps that text, which
    /// `external_name_key` reads to find the name in the link.
    #[cold]
    fn external_name_at(&mut self, qualifier: String) -> Result<Ast, String> {
        let Some(Tok::Ident(name, _)) = self.next() else {
            return Err(NOT_EXPECTED.into());
        };
        self.features.names = true;
        Ok(Ast::Name((format!("{qualifier}!{name}")).into()))
    }

    /// `A1#` refers to the whole spill of the formula in A1. It is stored as
    /// `ANCHORARRAY(A1)`, the form that XLSX files use.
    fn spill_suffix(&mut self, anchor: Ast) -> Ast {
        if matches!(self.peek(), Some(Tok::Hash)) {
            let _ = self.next();
            Ast::Func(Func::AnchorArray, (vec![anchor]).into())
        } else {
            anchor
        }
    }

    /// The end of `Sheet1!A1:B2` or of `Sheet1!A1:Sheet1!B2`, with the sheet
    /// the end names.
    fn sheet_range_end(&mut self, sheet_name: &str) -> Result<(String, AreaEnd), String> {
        let first = self.next();
        if let Some(Tok::Ident(end_sheet, _)) = &first {
            if matches!(self.peek(), Some(Tok::Bang)) {
                let end_sheet_name = end_sheet.to_string();
                let _ = self.next();
                return Ok((end_sheet_name, self.area_end("!")?));
            }
        }

        let end = first
            .as_ref()
            .and_then(AreaEnd::of)
            .ok_or_else(|| missing_area_end(":"))?;
        Ok((sheet_name.to_owned(), end))
    }

    /// The cell, column or row in the next token.
    fn area_end(&mut self, after: &str) -> Result<AreaEnd, String> {
        self.next()
            .as_ref()
            .and_then(AreaEnd::of)
            .ok_or_else(|| missing_area_end(after))
    }

    /// The range from `start` to the end after the `:` just read.
    fn area_after_colon(
        &mut self,
        start: AreaEnd,
    ) -> Result<(u32, u32, u32, u32, RangeFlags), String> {
        let end = self.area_end(":")?;
        area(start, end).ok_or_else(|| MIXED_AREA.into())
    }
}

const MIXED_AREA: &str = "A range joins two cells, two columns or two rows.";
const LONE_AXIS: &str = "A column or row needs a range such as A:A or 1:1.";
const NOT_EXPECTED: &str = "This is not expected here.";
const MISSING_CLOSE_PAREN: &str = "Add ) to close the (.";

fn missing_area_end(after: &str) -> String {
    format!("Enter a cell, column or row after {after}.")
}

/// The lookup key of a sheet name: the name without case. For a sheet of
/// another workbook, the folder before `[` is left out, so
/// `C:\Reports\[Budget.xlsx]Annual` finds the link `[Budget.xlsx]Annual`.
pub(crate) fn sheet_name_key(name: &str) -> String {
    let book_and_sheet = name.rfind('[').map_or(name, |start| &name[start..]);
    book_and_sheet
        .chars()
        .flat_map(char::to_lowercase)
        .collect()
}

/// The lookup key of a defined name of another workbook, from the text a
/// formula writes: `Budget.xlsx!Total`, `'C:\Reports\Budget.xlsx'!Total`,
/// `[Budget.xlsx]!Total` and `'C:\Reports\[Budget.xlsx]'!Total` all give
/// `[BUDGET.XLSX]!TOTAL`; the sheet-scoped `[Budget.xlsx]Annual!Total`
/// gives `[BUDGET.XLSX]ANNUAL!TOTAL`. The folder and the letter case are
/// left out, as for link sheets. A quote in a book or sheet name stays
/// doubled, as a quoted formula writes it. `None` for a name without a
/// workbook.
pub(crate) fn external_name_key(text: &str) -> Option<String> {
    let (quoted_qualifier, name) = text.rsplit_once('!')?;
    let qualifier = quoted_qualifier
        .strip_prefix('\'')
        .and_then(|inner| inner.strip_suffix('\''))
        .unwrap_or(quoted_qualifier);
    let key = if let Some(start) = qualifier.rfind('[') {
        format!("{}!{name}", &qualifier[start..])
    } else {
        let folder_end = qualifier.rfind('\\').max(qualifier.rfind('/'));
        let book = folder_end.map_or(qualifier, |at| &qualifier[at + 1..]);
        format!("[{book}]!{name}")
    };
    Some(key.to_uppercase())
}

/// Whether the text before `!` names another workbook: a sheet of it
/// (`[Budget.xlsx]Annual`), or its file (`Budget.xlsx`,
/// `C:\Reports\Budget.xlsx`). A file name has an extension, and a path
/// has a folder; Excel sheet names hold neither `\\` nor `/`.
fn names_workbook(qualifier: &str) -> bool {
    is_external_sheet(qualifier) || qualifier.contains(['.', '\\', '/'])
}

/// Whether a sheet reference names a sheet of another workbook:
/// `[Budget.xlsx]Annual` or `C:\Reports\[Budget.xlsx]Annual`. Excel sheet
/// names cannot hold `[` or `]`, so a bracket marks the workbook.
pub(crate) fn is_external_sheet(name: &str) -> bool {
    name.contains(']')
}

/// The error for a token after a complete formula.
fn trailing_token_error(tok: &Tok<'_>) -> String {
    if matches!(tok, Tok::RParen) {
        "This ) has no matching (.".into()
    } else {
        NOT_EXPECTED.into()
    }
}

/// Parse a formula source (with or without a leading `=`) into an AST.
pub(crate) fn parse(src: &str) -> Result<Ast, String> {
    parse_with_features(src).map(|(ast, _)| ast)
}

/// [`parse`], with the resolution steps the formula needs.
pub(crate) fn parse_with_features(src: &str) -> ParseResult {
    parse_source(src, None)
}

/// Bind a sheet token to its stable id while constructing its reference node.
/// A formula of the same shape as one parsed before it gets a copy of that
/// tree instead of a parse (`template`).
pub(crate) fn parse_bound_with_features(
    src: &str,
    resolve: &SheetResolver<'_>,
    place_span: &SpanPlacer<'_>,
    bind_table: &TableBinder<'_>,
) -> ParseResult {
    parse_source(
        src,
        Some(SheetBinding {
            resolve,
            place_span,
            bind_table,
        }),
    )
}

fn parse_source(src: &str, sheets: Option<SheetBinding<'_>>) -> ParseResult {
    let trimmed = src.trim();
    let body = trimmed.strip_prefix('=').unwrap_or(trimmed);
    // Only ingest binds references, and only ingest meets long runs of
    // formulas of one shape, so only its parses look for a kept tree.
    if sheets.is_some() && looks_for_shapes() {
        return reuse_or_parse(body, || parse_body(body, sheets));
    }
    parse_body(body, sheets)
}

/// Parses formula text without its `=`.
fn parse_body(body: &str, sheets: Option<SheetBinding<'_>>) -> ParseResult {
    let mut parser = Parser {
        cursor: Cursor::over_text(body),
        features: ParseFeatures::default(),
        sheets,
        args: PARSE_ARGS.take(),
    };
    let parsed = parser.expr();
    let trailing = match parsed {
        Ok(_) => parser.peek().map(trailing_token_error),
        Err(_) => None,
    };
    // A failed parse leaves the arguments of its open calls behind.
    parser.args.clear();
    PARSE_ARGS.set(std::mem::take(&mut parser.args));
    if let Some(error) = parser.cursor.lex_error() {
        return Err(error);
    }
    let ast = parsed?;
    if let Some(error) = trailing {
        return Err(error);
    }
    Ok((ast, parser.features))
}

/// The first error of the parser in `toks`, which end with [`Tok::End`], and
/// the index of the token it marks: the token that the parser read last, or
/// the first token after a complete formula. `None` when the tokens form one
/// formula. This is the parse of `parse` on tokens from formula help's
/// tolerant lexer, so formula help reports exactly what the parser rejects.
pub(crate) fn first_parse_error(toks: Vec<Tok<'_>>) -> Option<(String, usize)> {
    let mut parser = Parser {
        cursor: Cursor::over_tokens(toks),
        features: ParseFeatures::default(),
        sheets: None,
        args: Vec::new(),
    };

    let result = parser.expr();
    let read = parser.cursor.consumed;
    match result {
        Ok(_) => match parser.peek() {
            None | Some(Tok::End) => None,
            Some(tok) => Some((trailing_token_error(tok), read)),
        },
        Err(message) => Some((message, read.saturating_sub(1))),
    }
}
