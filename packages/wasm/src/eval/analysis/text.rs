//! Text functions for the full engine. Regex uses the bounded `regex-lite` syntax.
use crate::formula_slots::{FormulaResults, FormulaWork};
use std::rc::Rc;

use regex_lite::{Captures, Regex};

use super::super::regex_patterns::build_regex;

use super::super::lift::ValueArgs;
use super::super::matrix::{optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_CELLS};
use super::super::number_format::{format_number, general_text, round_decimal, Rounding};
use super::super::value::{bool_from_value, number_from_value, text_from_value};
use super::super::EvalPass;
use super::super::Shapes;
use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{EvalResult, FormulaError, Value};

family_functions! {
    ARRAYTOTEXT,
    DOLLAR,
    FIXED,
    REGEXEXTRACT,
    REGEXREPLACE,
    REGEXTEST,
    TEXTAFTER,
    TEXTBEFORE,
    TEXTSPLIT,
    VALUETOTEXT,
}

/// The arguments of `function` that take one value. The delimiters of
/// TEXTBEFORE and TEXTAFTER are a list to match any of, as in TEXTSPLIT;
/// ARRAYTOTEXT takes an array; REGEXEXTRACT and TEXTSPLIT return arrays of
/// their own.
pub(super) const fn value_args(function: Function) -> ValueArgs {
    match function {
        Function::DOLLAR
        | Function::FIXED
        | Function::REGEXREPLACE
        | Function::REGEXTEST
        | Function::VALUETOTEXT => ValueArgs::ALL,
        Function::TEXTAFTER | Function::TEXTBEFORE => ValueArgs::at(&[0, 2, 3, 4, 5]),
        Function::ARRAYTOTEXT | Function::REGEXEXTRACT | Function::TEXTSPLIT => ValueArgs::NONE,
    }
}
const MAX_TEXT_CHARS: usize = 32_767;
const MAX_TEXT_BYTES: usize = MAX_TEXT_CHARS * 4;
const MAX_MATCH_WORK: usize = 2_000_000;
const MAX_DECIMALS: i64 = 127;

struct Context<'a, 'p> {
    store: &'a CellStore,
    sheet: usize,
    pass: &'a mut EvalPass<'p>,
    /// Depth of the function call; its arguments evaluate one level deeper.
    depth: usize,
}

impl Context<'_, '_> {
    fn scalar(&mut self, args: &[Ast], index: usize, default: Value) -> Value {
        optional_ast(args, index).map_or(default, |ast| {
            self.store
                .eval_ast(ast, self.sheet, self.pass, self.depth + 1)
        })
    }

    fn text(&mut self, args: &[Ast], index: usize, default: &str) -> Result<String, FormulaError> {
        let text = text_from_value(&self.scalar(args, index, Value::text(default)))?.into_owned();
        if text.len() > MAX_TEXT_BYTES || text.chars().count() > MAX_TEXT_CHARS {
            return Err(FormulaError::Value);
        }
        Ok(text)
    }

    fn integer(&mut self, args: &[Ast], index: usize, default: i64) -> Result<i64, FormulaError> {
        let number = number_from_value(&self.scalar(args, index, Value::number(default as f64)))?;
        if number < i64::MIN as f64 || number >= i64::MAX as f64 {
            return Err(FormulaError::Value);
        }
        Ok(number.trunc() as i64)
    }

    fn boolean(&mut self, args: &[Ast], index: usize, default: bool) -> Result<bool, FormulaError> {
        bool_from_value(&self.scalar(args, index, Value::Bool(default)))
    }

    fn matrix(&mut self, ast: &Ast) -> Result<EvalMatrix, FormulaError> {
        let names = self.store.name_scope(self.sheet);
        if range_from_ast(ast, names).is_some()
            || super::super::array::ast_produces_array(ast, self.pass.shapes(names))
        {
            self.store
                .eval_matrix_arg(ast, self.sheet, self.pass, self.depth + 1)
        } else {
            Ok(EvalMatrix::new(
                1,
                1,
                vec![self
                    .store
                    .eval_ast(ast, self.sheet, self.pass, self.depth + 1)],
            ))
        }
    }

    fn delimiters(&mut self, args: &[Ast], index: usize) -> Result<Vec<String>, FormulaError> {
        let Some(ast) = optional_ast(args, index) else {
            return Ok(Vec::new());
        };
        let matrix = self.matrix(ast)?;
        let mut delimiters = Vec::new();
        let mut bytes = 0usize;
        for value in &matrix.values {
            let delimiter = text_from_value(value)?.into_owned();
            bytes = bytes
                .checked_add(delimiter.len())
                .ok_or(FormulaError::Num)?;
            if bytes > MAX_TEXT_BYTES {
                return Err(FormulaError::Num);
            }
            if delimiter.is_empty() {
                return Err(FormulaError::Value);
            }
            delimiters.push(delimiter);
        }
        Ok(delimiters)
    }
}

const fn arity(args: &[Ast], minimum: usize, maximum: usize) -> Result<(), FormulaError> {
    if args.len() < minimum || args.len() > maximum {
        Err(FormulaError::Value)
    } else {
        Ok(())
    }
}

fn text_value(text: String) -> Result<Value, FormulaError> {
    if text.len() > MAX_TEXT_BYTES || text.chars().count() > MAX_TEXT_CHARS {
        Err(FormulaError::Value)
    } else {
        super::super::preview_limits::text(text.len())?;
        Ok(Value::text(text))
    }
}

fn mode(context: &mut Context<'_, '_>, args: &[Ast], index: usize) -> Result<bool, FormulaError> {
    match number_from_value(&context.scalar(args, index, Value::number(0.0)))? {
        0.0 => Ok(false),
        1.0 => Ok(true),
        _ => Err(FormulaError::Value),
    }
}

// Compare original character spans so case folding cannot change byte offsets.
fn delimiter_length(
    text: &str,
    delimiter: &str,
    insensitive: bool,
    work: &mut usize,
) -> Result<Option<usize>, FormulaError> {
    *work = work.checked_add(delimiter.len()).ok_or(FormulaError::Num)?;
    if *work > MAX_MATCH_WORK {
        return Err(FormulaError::Num);
    }
    if !insensitive {
        return Ok(text.starts_with(delimiter).then_some(delimiter.len()));
    }
    let mut source = text.char_indices();
    let mut end = 0;
    for expected in delimiter.chars() {
        let Some((offset, actual)) = source.next() else {
            return Ok(None);
        };
        if !actual.to_lowercase().eq(expected.to_lowercase()) {
            return Ok(None);
        }
        end = offset + actual.len_utf8();
    }
    Ok(Some(end))
}

fn split_parts<'a>(
    text: &'a str,
    delimiters: &[String],
    insensitive: bool,
    ignore_empty: bool,
    work: &mut usize,
) -> Result<Vec<&'a str>, FormulaError> {
    if delimiters.is_empty() {
        return Ok(vec![text]);
    }
    if !insensitive && delimiters.len() == 1 && text.is_ascii() {
        let delimiter = &delimiters[0];
        let mut parts = Vec::new();
        let mut comparisons = 0usize;
        for (index, part) in text.split(delimiter).enumerate() {
            // ASCII byte lengths preserve the general scanner's comparison budget.
            comparisons += part.len() + usize::from(index != 0);
            if !ignore_empty || !part.is_empty() {
                parts.push(part);
            }
        }
        *work = comparisons
            .checked_mul(delimiter.len())
            .and_then(|cost| work.checked_add(cost))
            .ok_or(FormulaError::Num)?;
        if *work > MAX_MATCH_WORK {
            return Err(FormulaError::Num);
        }
        return Ok(parts);
    }
    let mut parts = Vec::new();
    let mut start = 0;
    let mut offset = 0;
    while offset < text.len() {
        let mut matched = None;
        for delimiter in delimiters {
            if let Some(length) = delimiter_length(&text[offset..], delimiter, insensitive, work)? {
                matched = Some(length);
                break;
            }
        }
        if let Some(length) = matched {
            if !ignore_empty || start != offset {
                parts.push(&text[start..offset]);
            }
            offset += length;
            start = offset;
        } else {
            offset += text[offset..]
                .chars()
                .next()
                .ok_or(FormulaError::Value)?
                .len_utf8();
        }
    }
    if !ignore_empty || start != text.len() {
        parts.push(&text[start..]);
    }
    Ok(parts)
}

fn before_after(
    context: &mut Context<'_, '_>,
    function: Function,
    args: &[Ast],
) -> Result<Value, FormulaError> {
    arity(args, 2, 6)?;
    let text = context.text(args, 0, "")?;
    let delimiter = context.text(args, 1, "")?;
    let instance = context.integer(args, 2, 1)?;
    let insensitive = mode(context, args, 3)?;
    let match_end = mode(context, args, 4)?;
    if instance == 0 || (!text.is_empty() && instance.unsigned_abs() > text.chars().count() as u64)
    {
        return Err(FormulaError::Value);
    }
    if text.is_empty() {
        return Ok(Value::text(""));
    }
    let is_before = function == Function::TEXTBEFORE;
    if delimiter.is_empty() {
        return text_value(if is_before == (instance > 0) {
            String::new()
        } else {
            text
        });
    }
    let mut matches = Vec::new();
    let mut work = 0;
    let mut offset = 0;
    if instance > 0 {
        while offset < text.len() {
            if let Some(length) =
                delimiter_length(&text[offset..], &delimiter, insensitive, &mut work)?
            {
                matches.push((offset, offset + length));
                offset += length;
            } else {
                offset += text[offset..]
                    .chars()
                    .next()
                    .ok_or(FormulaError::Value)?
                    .len_utf8();
            }
        }
        if match_end {
            matches.push((text.len(), text.len()));
        }
    } else {
        let mut boundary = text.len();
        for (position, _) in text.char_indices().rev() {
            if let Some(length) = delimiter_length(
                &text[position..boundary],
                &delimiter,
                insensitive,
                &mut work,
            )? {
                matches.push((position, position + length));
                boundary = position;
            }
        }
        if match_end {
            matches.push((0, 0));
        }
    }
    if let Some(&(start, end)) = matches.get(instance.unsigned_abs() as usize - 1) {
        text_value(if is_before {
            text[..start].to_string()
        } else {
            text[end..].to_string()
        })
    } else if optional_ast(args, 5).is_some() {
        Ok(context.scalar(args, 5, Value::Blank))
    } else {
        Err(FormulaError::Na)
    }
}

fn fixed(
    context: &mut Context<'_, '_>,
    function: Function,
    args: &[Ast],
) -> Result<Value, FormulaError> {
    arity(args, 1, if function == Function::FIXED { 3 } else { 2 })?;
    let number = number_from_value(&context.scalar(args, 0, Value::Blank))?;
    let decimals = context.integer(args, 1, 2)?;
    if !(-MAX_DECIMALS..=MAX_DECIMALS).contains(&decimals) {
        return Err(FormulaError::Value);
    }
    let no_commas = function == Function::FIXED && context.boolean(args, 2, false)?;
    let rounded = round_decimal(number, decimals as i32, Rounding::Nearest);
    if !rounded.is_finite() {
        return Err(FormulaError::Num);
    }
    let places = decimals.max(0) as usize;
    let digits = if places == 0 {
        String::from("0")
    } else {
        format!("0.{}", "0".repeat(places))
    };
    let code = if function == Function::DOLLAR {
        format!("$#,##{digits};($#,##{digits})")
    } else if no_commas {
        digits
    } else {
        format!("#,##{digits}")
    };
    text_value(format_number(rounded, &code)?.ok_or(FormulaError::Value)?)
}

/// Append directly so ARRAYTOTEXT does not allocate a string for each cell.
fn serialize(output: &mut String, value: &Value, strict: bool) -> Result<(), FormulaError> {
    match value {
        Value::Text(text) if strict => {
            output.push('"');
            for part in text.split_inclusive('"') {
                output.push_str(part);
                if part.ends_with('"') {
                    output.push('"');
                }
            }
            output.push('"');
        }
        Value::Text(text) => output.push_str(text),
        Value::Error(error) => output.push_str(error.sentinel()),
        Value::Blank if strict => output.push_str("\"\""),
        Value::Number(number) if number.is_finite() => {
            output.push_str(&general_text(*number));
        }
        Value::Number(_) => return Err(FormulaError::Num),
        Value::Bool(boolean) => output.push_str(if *boolean { "TRUE" } else { "FALSE" }),
        Value::Blank => {}
    }
    Ok(())
}

fn to_text(
    context: &mut Context<'_, '_>,
    function: Function,
    args: &[Ast],
) -> Result<Value, FormulaError> {
    arity(args, 1, 2)?;
    let strict = mode(context, args, 1)?;
    if function == Function::VALUETOTEXT {
        let mut output = String::new();
        serialize(&mut output, &context.scalar(args, 0, Value::Blank), strict)?;
        return text_value(output);
    }
    let matrix = context.matrix(&args[0])?;
    let mut output = String::new();
    if strict {
        output.push('{');
    }
    for row in 0..matrix.rows {
        if row != 0 {
            output.push_str(if strict { ";" } else { ", " });
        }
        for column in 0..matrix.cols {
            if column != 0 {
                output.push_str(if strict { "," } else { ", " });
            }
            serialize(
                &mut output,
                &matrix.values[row * matrix.cols + column],
                strict,
            )?;
            if output.len() > MAX_TEXT_BYTES {
                return Err(FormulaError::Value);
            }
        }
    }
    if strict {
        output.push('}');
    }
    text_value(output)
}

/// The compiled program for a REGEX call's pattern. A literal pattern uses
/// the program its formulas share. A computed pattern uses the program this
/// recalculation keeps for it, which the pass drops when it ends.
fn compile_regex(
    results: &mut FormulaResults,
    args: &[Ast],
    pattern: &str,
    insensitive: bool,
) -> Result<Rc<Regex>, FormulaError> {
    if let Some(Ast::RegexPattern(shared)) = args.get(1) {
        return shared.program(insensitive);
    }

    if let Some(regex) = results.pass_regex(pattern, insensitive) {
        return Ok(regex);
    }

    let regex = build_regex(pattern, insensitive)?;
    results.share_regex(pattern, insensitive, Rc::clone(&regex));
    Ok(regex)
}

fn append_text(output: &mut String, text: &str) -> Result<(), FormulaError> {
    if output
        .len()
        .checked_add(text.len())
        .is_none_or(|bytes| bytes > MAX_TEXT_BYTES)
    {
        return Err(FormulaError::Value);
    }
    output.push_str(text);
    Ok(())
}

fn append_replacement(
    output: &mut String,
    mut replacement: &str,
    captures: &Captures<'_>,
) -> Result<(), FormulaError> {
    while let Some(position) = replacement.find('$') {
        append_text(output, &replacement[..position])?;
        replacement = &replacement[position + 1..];
        if let Some(rest) = replacement.strip_prefix('$') {
            append_text(output, "$")?;
            replacement = rest;
            continue;
        }
        let reference_length = replacement.bytes().take_while(u8::is_ascii_digit).count();
        if reference_length == 0 {
            append_text(output, "$")?;
            continue;
        }
        let index = replacement[..reference_length]
            .parse::<usize>()
            .map_err(|_| FormulaError::Value)?;
        if let Some(capture) = captures.get(index) {
            append_text(output, capture.as_str())?;
        }
        replacement = &replacement[reference_length..];
    }
    append_text(output, replacement)
}

fn regex_scalar(
    context: &mut Context<'_, '_>,
    function: Function,
    args: &[Ast],
) -> Result<Value, FormulaError> {
    arity(
        args,
        if function == Function::REGEXREPLACE {
            3
        } else {
            2
        },
        if function == Function::REGEXREPLACE {
            5
        } else {
            3
        },
    )?;
    let text = context.text(args, 0, "")?;
    let pattern = context.text(args, 1, "")?;
    let insensitive = mode(
        context,
        args,
        if function == Function::REGEXREPLACE {
            4
        } else {
            2
        },
    )?;
    let regex = compile_regex(context.pass.results, args, &pattern, insensitive)?;
    if function == Function::REGEXTEST {
        return Ok(Value::Bool(regex.is_match(&text)));
    }
    let replacement = context.text(args, 2, "")?;
    let occurrence = context.integer(args, 3, 0)?;
    let selected = if occurrence < 0 {
        (regex.find_iter(&text).count() as i64).checked_add(occurrence)
    } else {
        occurrence.checked_sub(1)
    };
    let mut output = String::new();
    let mut offset = 0;
    for (index, captures) in regex.captures_iter(&text).enumerate() {
        if occurrence != 0 && selected != Some(index as i64) {
            continue;
        }
        let matched = captures.get(0).ok_or(FormulaError::Value)?;
        append_text(&mut output, &text[offset..matched.start()])?;
        append_replacement(&mut output, &replacement, &captures)?;
        offset = matched.end();
    }
    append_text(&mut output, &text[offset..])?;
    text_value(output)
}

fn extract(context: &mut Context<'_, '_>, args: &[Ast]) -> Result<EvalMatrix, FormulaError> {
    arity(args, 2, 4)?;
    let text = context.text(args, 0, "")?;
    let pattern = context.text(args, 1, "")?;
    let return_mode = number_from_value(&context.scalar(args, 2, Value::number(0.0)))?;
    if !matches!(return_mode, 0.0 | 1.0 | 2.0) {
        return Err(FormulaError::Value);
    }
    let insensitive = mode(context, args, 3)?;
    let regex = compile_regex(context.pass.results, args, &pattern, insensitive)?;
    let mut values = Vec::new();
    if return_mode == 1.0 {
        for matched in regex.find_iter(&text) {
            if values.len() >= SPILL_MAX_CELLS {
                return Err(FormulaError::Num);
            }
            values.push(Value::text(matched.as_str()));
        }
    } else {
        let captures = regex.captures(&text).ok_or(FormulaError::Na)?;
        if return_mode == 0.0 {
            values.push(Value::text(
                captures.get(0).ok_or(FormulaError::Na)?.as_str(),
            ));
        } else {
            for index in 1..captures.len() {
                values.push(Value::text(
                    captures.get(index).map_or("", |matched| matched.as_str()),
                ));
            }
        }
    }
    if values.is_empty() {
        return Err(FormulaError::Na);
    }
    let (rows, columns) = if return_mode == 2.0 {
        (1, values.len())
    } else {
        (values.len(), 1)
    };
    checked_matrix(rows, columns, values)
}

fn checked_matrix(
    rows: usize,
    columns: usize,
    values: Vec<Value>,
) -> Result<EvalMatrix, FormulaError> {
    EvalMatrix::validate_shape(rows, columns, 1, 0)?;
    let matrix = EvalMatrix::new(rows, columns, values);
    matrix.validate_bytes()?;
    Ok(matrix)
}

fn text_split(context: &mut Context<'_, '_>, args: &[Ast]) -> Result<EvalMatrix, FormulaError> {
    arity(args, 2, 6)?;
    let text = context.text(args, 0, "")?;
    let columns = context.delimiters(args, 1)?;
    let rows = context.delimiters(args, 2)?;
    if columns.is_empty() && rows.is_empty() {
        return Err(FormulaError::Value);
    }
    let ignore_empty = context.boolean(args, 3, false)?;
    let insensitive = mode(context, args, 4)?;
    let padding = context.scalar(args, 5, Value::Error(FormulaError::Na));
    let mut work = 0;
    let row_parts = split_parts(&text, &rows, insensitive, ignore_empty, &mut work)?;
    let mut parts = Vec::new();
    let mut column_count = 0;
    for row in row_parts {
        let row_columns = split_parts(row, &columns, insensitive, ignore_empty, &mut work)?;
        column_count = column_count.max(row_columns.len());
        parts.push(row_columns);
    }
    if parts.is_empty() || column_count == 0 {
        return Err(FormulaError::Calc);
    }
    let cells = EvalMatrix::validate_shape(parts.len(), column_count, 1, 0)?;
    let mut values = Vec::with_capacity(cells);
    for row in &parts {
        for column in 0..column_count {
            values.push(
                row.get(column)
                    .map_or_else(|| padding.clone(), |text| Value::text(*text)),
            );
        }
    }
    checked_matrix(parts.len(), column_count, values)
}

fn scalar_result(
    context: &mut Context<'_, '_>,
    function: Function,
    args: &[Ast],
) -> Result<Value, FormulaError> {
    match function {
        Function::TEXTBEFORE | Function::TEXTAFTER => before_after(context, function, args),
        Function::FIXED | Function::DOLLAR => fixed(context, function, args),
        Function::VALUETOTEXT | Function::ARRAYTOTEXT => to_text(context, function, args),
        Function::REGEXTEST | Function::REGEXREPLACE => regex_scalar(context, function, args),
        Function::REGEXEXTRACT => extract(context, args).map(EvalMatrix::into_first),
        Function::TEXTSPLIT => text_split(context, args).map(EvalMatrix::into_first),
    }
}

pub(super) fn evaluate_ast(
    store: &CellStore,
    function: Function,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> EvalResult {
    scalar_result(
        &mut Context {
            store,
            sheet,
            pass,
            depth,
        },
        function,
        args,
    )
    .unwrap_or_else(Value::Error)
}

pub(super) const fn produces_array(function: Function, _args: &[Ast], _: Shapes<'_>) -> bool {
    matches!(function, Function::TEXTSPLIT | Function::REGEXEXTRACT)
}

pub(super) fn evaluate_matrix(
    store: &CellStore,
    function: Function,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> Result<EvalMatrix, FormulaError> {
    let mut context = Context {
        store,
        sheet,
        pass,
        depth,
    };
    match function {
        Function::TEXTSPLIT => text_split(&mut context, args),
        Function::REGEXEXTRACT => extract(&mut context, args),
        Function::ARRAYTOTEXT
        | Function::DOLLAR
        | Function::FIXED
        | Function::REGEXREPLACE
        | Function::REGEXTEST
        | Function::TEXTAFTER
        | Function::TEXTBEFORE
        | Function::VALUETOTEXT => Err(FormulaError::Value),
    }
}

/// The shape of `function`'s result. It evaluates in a workspace of its own, which
/// borrows the pass's compiled regex programs so that sizing a spill and
/// evaluating it compile each pattern once.
pub(super) fn shape(
    store: &CellStore,
    function: Function,
    args: &[Ast],
    sheet: usize,
    outer: &mut EvalPass<'_>,
) -> Result<(usize, usize, usize), FormulaError> {
    let affected = FormulaWork::default();
    let mut results = FormulaResults::default();
    results.swap_scratch(outer.results);

    let mut pass = EvalPass {
        affected: &affected,
        results: &mut results,
    };
    let evaluated = evaluate_matrix(store, function, args, sheet, &mut pass, 0);

    results.swap_scratch(outer.results);
    let matrix = evaluated?;
    Ok((matrix.rows, matrix.cols, matrix.values.len()))
}

pub(super) fn bound(
    store: &CellStore,
    function: Function,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
) -> Result<usize, FormulaError> {
    shape(store, function, args, sheet, pass).map(|shape| shape.2)
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    /// Six patterns read from cells, each in both case modes, give every
    /// formula its own result, and an edited pattern recalculates each
    /// REGEX function and the wildcard criteria that read the same text.
    #[test]
    fn regex_and_wildcard_results_follow_their_own_patterns() {
        // https://support.microsoft.com/en-us/excel/functions/regextest-function
        // https://support.microsoft.com/en-us/excel/functions/countif-function
        let mut store = CellStore::new();
        let sheet = store.add_sheet(6, 8);
        let patterns = ["^a", "^b", "c$", "[0-9]+", "^AB", "x?y"];
        for (row, pattern) in patterns.into_iter().enumerate() {
            store.set_string(sheet, row, 0, pattern, 0);
            store.set_formula(
                sheet,
                row,
                1,
                &format!("=VALUETOTEXT(REGEXTEST(\"ab12c\",A{}))", row + 1),
                0,
            );
            store.set_formula(
                sheet,
                row,
                2,
                &format!("=VALUETOTEXT(REGEXTEST(\"ab12c\",A{},1))", row + 1),
                0,
            );
            store.set_formula(
                sheet,
                row,
                3,
                &format!("=REGEXREPLACE(\"ab12c\",A{},\"-\",,1)", row + 1),
                0,
            );
            store.set_formula(
                sheet,
                row,
                4,
                &format!("=IFNA(REGEXEXTRACT(\"ab12c\",A{},0,1),\"none\")", row + 1),
                0,
            );
        }
        store.set_formula(sheet, 6, 0, r#"=COUNTIF(A1:A6,"^?")"#, 0);
        store.set_formula(sheet, 7, 0, r#"=COUNTIF(A1:A6,"*$")"#, 0);
        store.recompute(sheet);

        let expected = [
            ["TRUE", "TRUE", "-b12c", "a"],
            ["FALSE", "FALSE", "ab12c", "none"],
            ["TRUE", "TRUE", "ab12-", "c"],
            ["TRUE", "TRUE", "ab-c", "12"],
            ["FALSE", "TRUE", "-12c", "ab"],
            ["FALSE", "FALSE", "ab12c", "none"],
        ];
        assert_rows(&store, sheet, &expected);
        assert_eq!(store.get_cell(sheet, 6, 0).num(), 2.0);
        assert_eq!(store.get_cell(sheet, 7, 0).num(), 1.0);

        store.set_string(sheet, 1, 0, "B1", 0);
        store.set_string(sheet, 2, 0, "^c", 0);
        store.recompute(sheet);

        let edited = [
            ["TRUE", "TRUE", "-b12c", "a"],
            ["FALSE", "TRUE", "a-2c", "b1"],
            ["FALSE", "FALSE", "ab12c", "none"],
            ["TRUE", "TRUE", "ab-c", "12"],
            ["FALSE", "TRUE", "-12c", "ab"],
            ["FALSE", "FALSE", "ab12c", "none"],
        ];
        assert_rows(&store, sheet, &edited);
        assert_eq!(store.get_cell(sheet, 6, 0).num(), 2.0);
        assert_eq!(store.get_cell(sheet, 7, 0).num(), 0.0);
    }

    fn assert_rows(store: &CellStore, sheet: usize, rows: &[[&str; 4]]) {
        for (row, columns) in rows.iter().enumerate() {
            for (offset, expected) in columns.iter().enumerate() {
                assert_eq!(
                    store.get_cell(sheet, row, offset + 1).string().as_deref(),
                    Some(*expected),
                    "row {row}, column {}",
                    offset + 1
                );
            }
        }
    }
}
