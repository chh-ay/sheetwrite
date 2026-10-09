//! Text functions for the full engine. Regex uses the bounded `regex-lite` syntax.
use std::collections::{HashMap, HashSet};

use regex_lite::{Captures, Regex, RegexBuilder};

use super::super::matrix::{optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_CELLS};
use super::super::value::{bool_from_value, number_from_value, text_from_value};
use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &[
    "ARRAYTOTEXT",
    "DOLLAR",
    "FIXED",
    "REGEXEXTRACT",
    "REGEXREPLACE",
    "REGEXTEST",
    "TEXTAFTER",
    "TEXTBEFORE",
    "TEXTSPLIT",
    "VALUETOTEXT",
];
const MAX_TEXT_CHARS: usize = 32_767;
const MAX_TEXT_BYTES: usize = MAX_TEXT_CHARS * 4;
const MAX_MATCH_WORK: usize = 2_000_000;
const MAX_REGEX_BYTES: usize = 2 * 1024 * 1024;
const MAX_DECIMALS: i64 = 127;

struct Context<'a> {
    store: &'a CellStore,
    sheet: usize,
    affected: &'a HashSet<AbsCellKey>,
    memo: &'a mut HashMap<AbsCellKey, EvalResult>,
    visiting: &'a mut HashSet<AbsCellKey>,
    depth: usize,
}
impl Context<'_> {
    fn scalar(&mut self, args: &[Ast], index: usize, default: Value) -> Value {
        optional_ast(args, index).map_or(default, |ast| {
            self.store.eval_ast(
                ast,
                self.sheet,
                self.affected,
                self.memo,
                self.visiting,
                self.depth + 1,
            )
        })
    }
    fn text(&mut self, args: &[Ast], index: usize, default: &str) -> Result<String, FormulaError> {
        let text = text_from_value(&self.scalar(args, index, Value::text(default)))?;
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
        if range_from_ast(ast, self.sheet).is_some() || super::super::array::ast_produces_array(ast)
        {
            self.store.eval_matrix_arg(
                ast,
                self.sheet,
                self.affected,
                self.memo,
                self.visiting,
                self.depth + 1,
            )
        } else {
            Ok(EvalMatrix::new(
                1,
                1,
                vec![self.store.eval_ast(
                    ast,
                    self.sheet,
                    self.affected,
                    self.memo,
                    self.visiting,
                    self.depth + 1,
                )],
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
            let delimiter = text_from_value(value)?;
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
fn arity(args: &[Ast], minimum: usize, maximum: usize) -> Result<(), FormulaError> {
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
        Ok(Value::text(text))
    }
}
fn mode(context: &mut Context<'_>, args: &[Ast], index: usize) -> Result<bool, FormulaError> {
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
    context: &mut Context<'_>,
    name: &str,
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
    let is_before = name == "TEXTBEFORE";
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
fn fixed(context: &mut Context<'_>, name: &str, args: &[Ast]) -> Result<Value, FormulaError> {
    arity(args, 1, if name == "FIXED" { 3 } else { 2 })?;
    let number = number_from_value(&context.scalar(args, 0, Value::Blank))?;
    let decimals = context.integer(args, 1, 2)?;
    if !(-MAX_DECIMALS..=MAX_DECIMALS).contains(&decimals) {
        return Err(FormulaError::Value);
    }
    let no_commas = name == "FIXED" && context.boolean(args, 2, false)?;
    let scale = 10f64.powi(decimals as i32);
    let rounded = (number * scale).round() / scale;
    if !rounded.is_finite() {
        return Err(FormulaError::Num);
    }
    let digits = format!("{:.*}", decimals.max(0) as usize, rounded.abs());
    let (whole, fraction) = digits.split_once('.').unwrap_or((&digits, ""));
    let mut output = String::new();
    if rounded < 0.0 {
        output.push(if name == "DOLLAR" { '(' } else { '-' });
    }
    if name == "DOLLAR" {
        output.push('$');
    }
    for (index, digit) in whole.chars().enumerate() {
        if !no_commas && index != 0 && (whole.len() - index).is_multiple_of(3) {
            output.push(',');
        }
        output.push(digit);
    }
    if !fraction.is_empty() {
        output.push('.');
        output.push_str(fraction);
    }
    if rounded < 0.0 && name == "DOLLAR" {
        output.push(')');
    }
    text_value(output)
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
        _ => output.push_str(&text_from_value(value)?),
    }
    Ok(())
}
fn to_text(context: &mut Context<'_>, name: &str, args: &[Ast]) -> Result<Value, FormulaError> {
    arity(args, 1, 2)?;
    let strict = mode(context, args, 1)?;
    if name == "VALUETOTEXT" {
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
/// `regex-lite` folds case for ASCII only, so a case-insensitive pattern with
/// a non-ASCII cased character or a code point escape could give a wrong match.
fn needs_unicode_case(pattern: &str, insensitive: bool) -> bool {
    let folds = insensitive
        || pattern.split("(?").skip(1).any(|group| {
            group
                .split(|c: char| !c.is_ascii_alphabetic())
                .next()
                .is_some_and(|flags| flags.contains('i'))
        });
    folds
        && (pattern
            .chars()
            .any(|c| !c.is_ascii() && (c.to_lowercase().ne([c]) || c.to_uppercase().ne([c])))
            || ["\\x", "\\u", "\\U"]
                .iter()
                .any(|escape| pattern.contains(escape)))
}

fn compile_regex(pattern: &str, insensitive: bool) -> Result<Regex, FormulaError> {
    if needs_unicode_case(pattern, insensitive) {
        return Err(FormulaError::Value);
    }
    RegexBuilder::new(pattern)
        .case_insensitive(insensitive)
        .size_limit(MAX_REGEX_BYTES)
        .build()
        .map_err(|_| FormulaError::Value)
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
    context: &mut Context<'_>,
    name: &str,
    args: &[Ast],
) -> Result<Value, FormulaError> {
    arity(
        args,
        if name == "REGEXREPLACE" { 3 } else { 2 },
        if name == "REGEXREPLACE" { 5 } else { 3 },
    )?;
    let text = context.text(args, 0, "")?;
    let pattern = context.text(args, 1, "")?;
    let insensitive = mode(context, args, if name == "REGEXREPLACE" { 4 } else { 2 })?;
    let regex = compile_regex(&pattern, insensitive)?;
    if name == "REGEXTEST" {
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
fn extract(context: &mut Context<'_>, args: &[Ast]) -> Result<EvalMatrix, FormulaError> {
    arity(args, 2, 4)?;
    let text = context.text(args, 0, "")?;
    let pattern = context.text(args, 1, "")?;
    let return_mode = number_from_value(&context.scalar(args, 2, Value::number(0.0)))?;
    if !matches!(return_mode, 0.0 | 1.0 | 2.0) {
        return Err(FormulaError::Value);
    }
    let insensitive = mode(context, args, 3)?;
    let regex = compile_regex(&pattern, insensitive)?;
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
fn text_split(context: &mut Context<'_>, args: &[Ast]) -> Result<EvalMatrix, FormulaError> {
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
    context: &mut Context<'_>,
    name: &str,
    args: &[Ast],
) -> Result<Value, FormulaError> {
    match name {
        "TEXTBEFORE" | "TEXTAFTER" => before_after(context, name, args),
        "FIXED" | "DOLLAR" => fixed(context, name, args),
        "VALUETOTEXT" | "ARRAYTOTEXT" => to_text(context, name, args),
        "REGEXTEST" | "REGEXREPLACE" => regex_scalar(context, name, args),
        "REGEXEXTRACT" => extract(context, args).map(EvalMatrix::into_first),
        "TEXTSPLIT" => text_split(context, args).map(EvalMatrix::into_first),
        _ => Err(FormulaError::Name),
    }
}
#[allow(clippy::too_many_arguments)]
pub(super) fn evaluate_ast(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> EvalResult {
    scalar_result(
        &mut Context {
            store,
            sheet,
            affected,
            memo,
            visiting,
            depth,
        },
        name,
        args,
    )
    .unwrap_or_else(Value::Error)
}
pub(super) fn produces_array(name: &str, _args: &[Ast]) -> bool {
    matches!(name, "TEXTSPLIT" | "REGEXEXTRACT")
}
#[allow(clippy::too_many_arguments)]
pub(super) fn evaluate_matrix(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> Result<EvalMatrix, FormulaError> {
    let mut context = Context {
        store,
        sheet,
        affected,
        memo,
        visiting,
        depth,
    };
    match name {
        "TEXTSPLIT" => text_split(&mut context, args),
        "REGEXEXTRACT" => extract(&mut context, args),
        _ => Err(FormulaError::Value),
    }
}
pub(super) fn shape(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
) -> Result<(usize, usize, usize), FormulaError> {
    let matrix = evaluate_matrix(
        store,
        name,
        args,
        sheet,
        &HashSet::new(),
        &mut HashMap::new(),
        &mut HashSet::new(),
        0,
    )?;
    Ok((matrix.rows, matrix.cols, matrix.values.len()))
}
pub(super) fn bound(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
) -> Result<usize, FormulaError> {
    shape(store, name, args, sheet).map(|shape| shape.2)
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    fn assert_formulas(cases: &[(&str, &str)]) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, cases.len());
        for (row, (formula, _)) in cases.iter().enumerate() {
            store.set_formula(sheet, row, 0, formula, 0);
        }
        store.recompute(sheet);
        for (row, (formula, expected)) in cases.iter().enumerate() {
            assert_eq!(
                store.get_cell(sheet, row, 0).string().as_deref(),
                Some(*expected),
                "{formula}"
            );
        }
    }

    #[test]
    fn published_text_examples_and_delimiter_options() {
        // https://support.microsoft.com/en-us/excel/functions/textbefore-function
        // https://support.microsoft.com/en-us/excel/functions/textafter-function
        // https://support.microsoft.com/en-us/excel/functions/fixed-function
        // https://support.microsoft.com/en-us/excel/functions/dollar-function
        assert_formulas(&[
            (
                r#"=TEXTBEFORE("Little red Riding Hood's red hood","red",2)"#,
                "Little red Riding Hood's ",
            ),
            (
                r#"=TEXTBEFORE("Little red Riding Hood's red hood","red",-2)"#,
                "Little ",
            ),
            (r#"=TEXTAFTER("a-b-c","-",-1)"#, "c"),
            (r#"=TEXTBEFORE("Socrates"," ",,,1)"#, "Socrates"),
            (r#"=TEXTAFTER("Socrates"," ",,,1)"#, ""),
            (r#"=TEXTBEFORE("ABCdef","c",,1)"#, "AB"),
            (r#"=TEXTAFTER("éÉend","é",2,1)"#, "end"),
            (r#"=TEXTBEFORE("abc","",-1)"#, "abc"),
            (r#"=TEXTAFTER("abc","",-1)"#, ""),
            (r#"=TEXTBEFORE("","x")"#, ""),
            (r#"=TEXTBEFORE("a","x",,,, "missing")"#, "missing"),
            (r#"=TEXTAFTER("a-b","-",,,,1/0)"#, "b"),
            ("=FIXED(1234.567,1)", "1,234.6"),
            ("=FIXED(1234.567,-1,TRUE)", "1230"),
            ("=DOLLAR(-1234.567,2)", "($1,234.57)"),
            (r#"=VALUETOTEXT("a""b",1)"#, "\"a\"\"b\""),
            ("=VALUETOTEXT(1/0)", "#DIV/0!"),
        ]);
    }

    #[test]
    fn documented_errors_and_unsupported_regex() {
        // https://support.microsoft.com/en-us/excel/functions/textbefore-function
        // https://support.microsoft.com/en-us/excel/functions/regexextract-function
        assert_formulas(&[
            (r#"=TEXTBEFORE("abc","x",0)"#, "#VALUE!"),
            (r#"=TEXTBEFORE("abc","x",4)"#, "#VALUE!"),
            (r#"=TEXTBEFORE("abc","x")"#, "#N/A"),
            (r#"=TEXTAFTER("a-b","-",2)"#, "#N/A"),
            (r#"=TEXTBEFORE("abc","b",,2)"#, "#VALUE!"),
            (r#"=TEXTAFTER("abc","b",,,2)"#, "#VALUE!"),
            (r#"=TEXTSPLIT("a","")"#, "#VALUE!"),
            (r#"=TEXTSPLIT("a",",",,,2)"#, "#VALUE!"),
            (r#"=REGEXEXTRACT("abc","[0-9]+")"#, "#N/A"),
            (r#"=REGEXEXTRACT("abc","a",3)"#, "#VALUE!"),
            (r#"=REGEXTEST("abc","[")"#, "#VALUE!"),
            (r#"=REGEXTEST("ab","a(?=b)")"#, "#VALUE!"),
            (r#"=REGEXEXTRACT("aa","(a)\1")"#, "#VALUE!"),
            (r#"=REGEXREPLACE("ab","(?<=a)b","c")"#, "#VALUE!"),
            (r#"=REGEXTEST("a","a",2)"#, "#VALUE!"),
            ("=FIXED(1,128)", "#VALUE!"),
            ("=DOLLAR(1,2,TRUE)", "#VALUE!"),
            ("=VALUETOTEXT(1,2)", "#VALUE!"),
            ("=VALUETOTEXT(1,0.5)", "#VALUE!"),
            (r#"=REGEXEXTRACT("a","a",1.5)"#, "#VALUE!"),
            (r#"=REGEXTEST("a","a",0.5)"#, "#VALUE!"),
            ("=ARRAYTOTEXT(A1:A2,2)", "#VALUE!"),
            (r#"=REGEXREPLACE("aaa","a",REPT("x",32767))"#, "#VALUE!"),
        ]);
    }

    #[test]
    fn regex_lite_limits_return_value_error() {
        // https://docs.rs/regex-lite/0.1.9/regex_lite/#differences-with-the-regex-crate
        assert_formulas(&[
            (r#"=REGEXTEST("é","\p{L}")"#, "#VALUE!"),
            (r#"=REGEXEXTRACT("é","\P{L}")"#, "#VALUE!"),
            (r#"=REGEXTEST("É","é",1)"#, "#VALUE!"),
            (r#"=REGEXTEST("É","(?i)é")"#, "#VALUE!"),
            (r#"=REGEXREPLACE("É","\x{e9}","e",,1)"#, "#VALUE!"),
            (r#"=VALUETOTEXT(REGEXTEST("é","é"))"#, "TRUE"),
            (r#"=VALUETOTEXT(REGEXTEST("É","é"))"#, "FALSE"),
            (r#"=VALUETOTEXT(REGEXTEST("AB","(?i)ab"))"#, "TRUE"),
            (r#"=VALUETOTEXT(REGEXTEST("Ab","(?-i)ab",1))"#, "FALSE"),
            (r#"=REGEXEXTRACT("Zé9","(?:[a-z]+)",0,1)"#, "Z"),
            (r#"=REGEXEXTRACT("éabc","\w+")"#, "abc"),
            (r#"=REGEXEXTRACT("١2","\d+")"#, "2"),
            (r#"=REGEXEXTRACT("  ","\s+")"#, " "),
        ]);
    }

    #[test]
    fn regex_results_and_spill_shapes() {
        // https://support.microsoft.com/en-us/excel/functions/regexextract-function
        // https://support.microsoft.com/en-us/excel/functions/regexreplace-function
        let mut store = CellStore::new();
        let sheet = store.add_sheet(6, 20);
        for (row, formula) in [
            (0, r#"=REGEXEXTRACT("DylanWilliams","[A-Z][a-z]+",1)"#),
            (3, r#"=REGEXEXTRACT("12-ab","([0-9]+)-([a-z]+)",2)"#),
            (6, r#"=REGEXEXTRACT("DylanWilliams","[A-Z][a-z]+")"#),
            (7, r#"=REGEXREPLACE("a1 a2 a3","a([0-9])","b$1",2)"#),
            (8, r#"=REGEXREPLACE("a1 a2 a3","a[0-9]","x",-1)"#),
            (9, r#"=REGEXREPLACE("a1 a2","a[0-9]","x")"#),
            (10, r#"=REGEXREPLACE("abc","x","y")"#),
            (11, r#"=VALUETOTEXT(REGEXTEST("Ab","ab"))"#),
            (12, r#"=VALUETOTEXT(REGEXTEST("Ab","ab",1))"#),
            (13, r#"=REGEXEXTRACT("ab","(a)(z)?(b)",2)"#),
            (
                14,
                r#"=REGEXREPLACE("SoniaBrown","([A-Z][a-z]+)([A-Z][a-z]+)","$2, $1")"#,
            ),
            (15, r#"=REGEXREPLACE("a2","a([0-9])","$1x")"#),
            (16, r#"=REGEXREPLACE("a2","a([0-9])","$$$1")"#),
        ] {
            store.set_formula(sheet, row, 2, formula, 0);
        }
        store.recompute(sheet);
        for (row, column, expected) in [
            (0, 2, "Dylan"),
            (1, 2, "Williams"),
            (3, 2, "12"),
            (3, 3, "ab"),
            (6, 2, "Dylan"),
            (7, 2, "a1 b2 a3"),
            (8, 2, "a1 a2 x"),
            (9, 2, "x x"),
            (10, 2, "abc"),
            (11, 2, "FALSE"),
            (12, 2, "TRUE"),
            (13, 2, "a"),
            (13, 3, ""),
            (13, 4, "b"),
            (14, 2, "Brown, Sonia"),
            (15, 2, "2x"),
            (16, 2, "$2"),
        ] {
            assert_eq!(
                store.get_cell(sheet, row, column).string().as_deref(),
                Some(expected)
            );
        }
        assert_eq!(store.get_cell(sheet, 2, 2).kind(), 0);
        assert_eq!(store.get_cell(sheet, 4, 2).kind(), 0);
    }

    #[test]
    fn textsplit_range_delimiters_padding_and_serialization() {
        // https://support.microsoft.com/en-us/excel/functions/textsplit-function
        // https://support.microsoft.com/en-us/excel/functions/arraytotext-function
        let mut store = CellStore::new();
        let sheet = store.add_sheet(7, 16);
        store.set_string(sheet, 0, 0, ",", 0);
        store.set_string(sheet, 1, 0, ";", 0);
        store.set_formula(sheet, 0, 2, r#"=TEXTSPLIT("a,b;c",A1:A2)"#, 0);
        store.set_formula(sheet, 3, 2, r#"=TEXTSPLIT("a,b;c",",",";")"#, 0);
        store.set_formula(
            sheet,
            6,
            2,
            r#"=TEXTSPLIT("a,,b;c",",",";",TRUE,0,"pad")"#,
            0,
        );
        store.set_formula(sheet, 9, 2, r#"=TEXTSPLIT("aXbxc","x",,FALSE,1)"#, 0);
        store.set_string(sheet, 12, 0, "say \"hi\"", 0);
        store.set_number(sheet, 12, 1, 2.0, 0);
        store.set_bool(sheet, 13, 0, true, 0);
        store.set_formula(sheet, 12, 2, "=ARRAYTOTEXT(A13:B14,1)", 0);
        store.set_formula(sheet, 13, 2, "=ARRAYTOTEXT(A13:B14)", 0);
        store.recompute(sheet);
        for (row, column, expected) in [
            (0, 2, "a"),
            (0, 3, "b"),
            (0, 4, "c"),
            (3, 2, "a"),
            (3, 3, "b"),
            (4, 2, "c"),
            (4, 3, "#N/A"),
            (6, 2, "a"),
            (6, 3, "b"),
            (7, 2, "c"),
            (7, 3, "pad"),
            (9, 2, "a"),
            (9, 3, "b"),
            (9, 4, "c"),
            (12, 2, "{\"say \"\"hi\"\"\",2;TRUE,\"\"}"),
            (13, 2, "say \"hi\", 2, TRUE, "),
        ] {
            assert_eq!(
                store.get_cell(sheet, row, column).string().as_deref(),
                Some(expected)
            );
        }
    }
}
