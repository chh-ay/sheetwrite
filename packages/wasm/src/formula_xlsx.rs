//! OOXML spelling belongs beside the lexer, not in the workbook transport.

use crate::calc::{parse_a1, Tok};
use crate::formula_tokens::{lex_tolerant, Spanned};
use wasm_bindgen::prelude::wasm_bindgen;

// MS-XLSX §2.2.3 and §2.2.2 extend ISO/IEC 29500-1 §18.17.2.4:
// future functions use `_xlfn.`, worksheet-only functions also use `_xlws.`,
// and LET bindings and LAMBDA parameters use `_xlpm.` (parameter-name).
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/5d1b6d44-6fc1-4ecd-8fef-0b27406cc2bf
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/3d025add-118d-4413-9856-ab65712ec1b0
const FUTURE_FUNCTIONS: &[&str] = &[
    "ACOT",
    "ACOTH",
    "AGGREGATE",
    "ANCHORARRAY",
    "ARABIC",
    "ARRAYTOTEXT",
    "BASE",
    "BETA.DIST",
    "BETA.INV",
    "BINOM.DIST",
    "BINOM.DIST.RANGE",
    "BINOM.INV",
    "BITAND",
    "BITLSHIFT",
    "BITOR",
    "BITRSHIFT",
    "BITXOR",
    "BYCOL",
    "BYROW",
    "CEILING.MATH",
    "CEILING.PRECISE",
    "CHISQ.DIST",
    "CHISQ.DIST.RT",
    "CHISQ.INV",
    "CHISQ.INV.RT",
    "CHISQ.TEST",
    "CHOOSECOLS",
    "CHOOSEROWS",
    "COMBINA",
    "CONCAT",
    "CONFIDENCE.NORM",
    "CONFIDENCE.T",
    "COT",
    "COTH",
    "COVARIANCE.P",
    "COVARIANCE.S",
    "CSC",
    "CSCH",
    "DAYS",
    "DECIMAL",
    "DROP",
    "ERF.PRECISE",
    "ERFC.PRECISE",
    "EXPAND",
    "EXPON.DIST",
    "F.DIST",
    "F.DIST.RT",
    "F.INV",
    "F.INV.RT",
    "F.TEST",
    "FIELDVALUE",
    "FILTERXML",
    "FLOOR.MATH",
    "FLOOR.PRECISE",
    "FORECAST.ETS",
    "FORECAST.ETS.CONFINT",
    "FORECAST.ETS.SEASONALITY",
    "FORECAST.ETS.STAT",
    "FORECAST.LINEAR",
    "FORMULATEXT",
    "GAMMA",
    "GAMMA.DIST",
    "GAMMA.INV",
    "GAMMALN.PRECISE",
    "GAUSS",
    "GROUPBY",
    "HSTACK",
    "HYPGEOM.DIST",
    "IFNA",
    "IFS",
    "IMCOSH",
    "IMCOT",
    "IMCSC",
    "IMCSCH",
    "IMSEC",
    "IMSECH",
    "IMSINH",
    "IMTAN",
    "ISFORMULA",
    "ISOMITTED",
    "ISOWEEKNUM",
    "LAMBDA",
    "LET",
    "LOGNORM.DIST",
    "LOGNORM.INV",
    "MAKEARRAY",
    "MAP",
    "MAXIFS",
    "MINIFS",
    "MODE.MULT",
    "MODE.SNGL",
    "MUNIT",
    "NEGBINOM.DIST",
    "NORM.DIST",
    "NORM.INV",
    "NORM.S.DIST",
    "NORM.S.INV",
    "NUMBERVALUE",
    "PDURATION",
    "PERCENTILE.EXC",
    "PERCENTILE.INC",
    "PERCENTOF",
    "PERCENTRANK.EXC",
    "PERCENTRANK.INC",
    "PERMUTATIONA",
    "PHI",
    "PIVOTBY",
    "POISSON.DIST",
    "PQSOURCE",
    "PYTHON_STR",
    "PYTHON_TYPE",
    "PYTHON_TYPENAME",
    "QUARTILE.EXC",
    "QUARTILE.INC",
    "QUERYSTRING",
    "RANDARRAY",
    "RANK.AVG",
    "RANK.EQ",
    "REDUCE",
    "REGEXEXTRACT",
    "REGEXREPLACE",
    "REGEXTEST",
    "RRI",
    "SCAN",
    "SEC",
    "SECH",
    "SEQUENCE",
    "SHEET",
    "SHEETS",
    "SKEW.P",
    "SORTBY",
    "STDEV.P",
    "STDEV.S",
    "SWITCH",
    "T.DIST",
    "T.DIST.2T",
    "T.DIST.RT",
    "T.INV",
    "T.INV.2T",
    "T.TEST",
    "TAKE",
    "TEXTAFTER",
    "TEXTBEFORE",
    "TEXTJOIN",
    "TEXTSPLIT",
    "TOCOL",
    "TOROW",
    "UNICHAR",
    "UNICODE",
    "UNIQUE",
    "VALUETOTEXT",
    "VAR.P",
    "VAR.S",
    "VSTACK",
    "WEBSERVICE",
    "WEIBULL.DIST",
    "WRAPCOLS",
    "WRAPROWS",
    "XLOOKUP",
    "XMATCH",
    "XOR",
    "Z.TEST",
];

fn strip_prefix(name: &str) -> &str {
    let mut bare = name;
    for prefix in ["_xlfn.", "_xlws.", "_xlpm."] {
        if bare
            .get(..prefix.len())
            .is_some_and(|head| head.eq_ignore_ascii_case(prefix))
        {
            bare = &bare[prefix.len()..];
        }
    }
    bare
}

fn identifier<'a>(token: &'a Spanned<'_>) -> Option<&'a str> {
    match &token.tok {
        Ok(Tok::Ident(name, false)) => Some(name),
        _ => None,
    }
}

fn is_qualified(tokens: &[Spanned<'_>], index: usize) -> bool {
    matches!(
        tokens.get(index + 1).map(|token| &token.tok),
        Some(Ok(Tok::Bang | Tok::Structured(_)))
    ) || index
        .checked_sub(1)
        .is_some_and(|previous| matches!(tokens[previous].tok, Ok(Tok::Bang)))
}

/// Include a sheet qualifier without interpreting its spelling as a function.
fn reference_start(tokens: &[Spanned<'_>], cell: usize) -> Option<usize> {
    let token = tokens.get(cell)?;
    parse_a1(identifier(token)?)?;
    if cell >= 2 && matches!(tokens[cell - 1].tok, Ok(Tok::Bang)) {
        return matches!(tokens[cell - 2].tok, Ok(Tok::Ident(_, _)))
            .then_some(tokens[cell - 2].start);
    }
    Some(token.start)
}

fn anchor_reference(tokens: &[Spanned<'_>], function: usize) -> Option<(usize, usize, usize)> {
    if !matches!(tokens.get(function + 1)?.tok, Ok(Tok::LParen)) {
        return None;
    }
    let argument = function + 2;
    let cell = if matches!(tokens.get(argument + 1)?.tok, Ok(Tok::Bang)) {
        argument + 2
    } else {
        argument
    };
    let start = reference_start(tokens, cell)?;
    let end = tokens.get(cell)?;
    let close = tokens.get(cell + 1)?;
    matches!(close.tok, Ok(Tok::RParen)).then_some((start, end.end, close.end))
}

/// Remove only identifier prefixes. Quoted text, sheet names and structured
/// references are not function or parameter names and must remain unchanged.
pub fn formula_from_xlsx(source: &str) -> String {
    let tokens = lex_tolerant(source);
    let mut result = String::with_capacity(source.len());
    let mut previous = 0;
    for (index, token) in tokens.iter().enumerate() {
        if token.start < previous {
            continue;
        }
        let Some(name) = identifier(token) else {
            continue;
        };
        if is_qualified(&tokens, index) {
            continue;
        }
        if name.eq_ignore_ascii_case("_xlfn.ANCHORARRAY") {
            if let Some((start, end, close)) = anchor_reference(&tokens, index) {
                result.push_str(&source[previous..token.start]);
                result.push_str(&source[start..end]);
                result.push('#');
                previous = close;
                continue;
            }
        }
        let bare = strip_prefix(name);
        if bare.len() == name.len() {
            continue;
        }
        result.push_str(&source[previous..token.start]);
        result.push_str(bare);
        previous = token.end;
    }
    result.push_str(&source[previous..]);
    result
}

struct Binding<'a> {
    name: &'a str,
    declaration: usize,
    start: usize,
    end: usize,
}

struct Frame {
    start: usize,
    arguments: Vec<(usize, usize)>,
    argument_start: usize,
}

fn bindings<'a>(tokens: &'a [Spanned<'_>]) -> Vec<Binding<'a>> {
    if !tokens.iter().any(|token| {
        identifier(token).is_some_and(|name| {
            let bare = strip_prefix(name);
            bare.eq_ignore_ascii_case("LAMBDA") || bare.eq_ignore_ascii_case("LET")
        })
    }) {
        return Vec::new();
    }
    let mut frames: Vec<Frame> = Vec::new();
    let mut bindings = Vec::new();
    for (index, token) in tokens.iter().enumerate() {
        match token.tok {
            Ok(Tok::LParen | Tok::LBrace) => frames.push(Frame {
                start: index,
                arguments: Vec::new(),
                argument_start: index + 1,
            }),
            Ok(Tok::Comma | Tok::Semicolon) => {
                if let Some(frame) = frames.last_mut() {
                    frame.arguments.push((frame.argument_start, index));
                    frame.argument_start = index + 1;
                }
            }
            Ok(Tok::RParen | Tok::RBrace) => {
                let Some(mut frame) = frames.pop() else {
                    continue;
                };
                frame.arguments.push((frame.argument_start, index));
                let Some(name) = frame
                    .start
                    .checked_sub(1)
                    .and_then(|index| identifier(&tokens[index]))
                else {
                    continue;
                };
                let name = strip_prefix(name);
                let lambda = name.eq_ignore_ascii_case("LAMBDA");
                if !lambda && !name.eq_ignore_ascii_case("LET") {
                    continue;
                }
                let Some(body) = frame.arguments.last() else {
                    continue;
                };
                for (position, &(start, end)) in frame
                    .arguments
                    .iter()
                    .enumerate()
                    .take(frame.arguments.len() - 1)
                {
                    if (!lambda && position % 2 != 0) || end != start + 1 {
                        continue;
                    }
                    let Some(parameter) = identifier(&tokens[start]) else {
                        continue;
                    };
                    bindings.push(Binding {
                        name: strip_prefix(parameter),
                        declaration: start,
                        start: if lambda {
                            body.0
                        } else {
                            frame
                                .arguments
                                .get(position + 2)
                                .map_or(index, |argument| argument.0)
                        },
                        end: index,
                    });
                }
            }
            _ => {}
        }
    }
    bindings
}

/// Write future-function, local-binding and spill spellings for OOXML formulas.
/// This is lexical: unknown future functions and incomplete formulas still
/// round-trip without a parse/serialize pass changing their source text.
pub fn formula_to_xlsx(source: &str) -> String {
    let tokens = lex_tolerant(source);
    let bindings = bindings(&tokens);
    let mut result = String::with_capacity(source.len());
    let mut previous = 0;
    for (index, token) in tokens.iter().enumerate() {
        if token.start < previous {
            continue;
        }
        if matches!(
            tokens.get(index + 1).map(|token| &token.tok),
            Some(Ok(Tok::Hash))
        ) {
            if let Some(start) = reference_start(&tokens, index) {
                result.push_str(&source[previous..start]);
                result.push_str("_xlfn.ANCHORARRAY(");
                result.push_str(&source[start..token.end]);
                result.push(')');
                previous = tokens[index + 1].end;
                continue;
            }
        }
        let Some(name) = identifier(token) else {
            continue;
        };
        if is_qualified(&tokens, index) {
            continue;
        }
        let bare = strip_prefix(name);
        let binding = bindings
            .iter()
            .filter(|binding| {
                binding.name.eq_ignore_ascii_case(bare)
                    && (binding.declaration == index
                        || (index >= binding.start && index < binding.end))
            })
            .max_by_key(|binding| binding.declaration);
        let prefix = if binding.is_some() {
            "_xlpm."
        } else if matches!(
            tokens.get(index + 1).map(|token| &token.tok),
            Some(Ok(Tok::LParen))
        ) {
            if ["FILTER", "SORT", "PY"]
                .iter()
                .any(|function| function.eq_ignore_ascii_case(bare))
            {
                "_xlfn._xlws."
            } else if FUTURE_FUNCTIONS
                .binary_search_by(|function| {
                    function
                        .bytes()
                        .cmp(bare.bytes().map(|byte| byte.to_ascii_uppercase()))
                })
                .is_ok()
            {
                "_xlfn."
            } else {
                ""
            }
        } else {
            ""
        };
        if prefix.is_empty() || name.starts_with(prefix) {
            continue;
        }
        result.push_str(&source[previous..token.start]);
        result.push_str(prefix);
        result.push_str(bare);
        previous = token.end;
    }
    result.push_str(&source[previous..]);
    result
}

/// Convert a workbook's formula sources in one JavaScript-to-WASM call.
/// The consumed input vector can release each source as its result is produced.
#[wasm_bindgen(js_name = convertXlsxFormulas)]
pub fn convert_xlsx_formulas(sources: Vec<String>, exporting: bool) -> Vec<String> {
    let convert: fn(&str) -> String = if exporting {
        formula_to_xlsx
    } else {
        formula_from_xlsx
    };
    sources.into_iter().map(|source| convert(&source)).collect()
}

#[cfg(test)]
mod tests {
    use super::{formula_from_xlsx, formula_to_xlsx};

    #[test]
    fn future_functions_and_bindings_keep_lexical_scopes() {
        let cases = [
            ("=LET(x,1,x+1)", "=_xlfn.LET(_xlpm.x,1,_xlpm.x+1)"),
            ("=let(x,1,X+1)", "=_xlfn.let(_xlpm.x,1,_xlpm.X+1)"),
            ("=LET(x,x+1,x)+x", "=_xlfn.LET(_xlpm.x,x+1,_xlpm.x)+x"),
            (
                "=LET(x,1,LET(x,x+1,x))+x",
                "=_xlfn.LET(_xlpm.x,1,_xlfn.LET(_xlpm.x,_xlpm.x+1,_xlpm.x))+x",
            ),
            (
                "=LAMBDA(value,value+1)",
                "=_xlfn.LAMBDA(_xlpm.value,_xlpm.value+1)",
            ),
            (
                "=LAMBDA(value,LAMBDA(other,value+other))",
                "=_xlfn.LAMBDA(_xlpm.value,_xlfn.LAMBDA(_xlpm.other,_xlpm.value+_xlpm.other))",
            ),
            (
                "=LAMBDA(value,LET(value,2,value))+value",
                "=_xlfn.LAMBDA(_xlpm.value,_xlfn.LET(_xlpm.value,2,_xlpm.value))+value",
            ),
            ("=LAMBDA(fn,fn(2))", "=_xlfn.LAMBDA(_xlpm.fn,_xlpm.fn(2))"),
            (
                "=SUM(A1)+FILTER(A1:A3,A1:A3>0)",
                "=SUM(A1)+_xlfn._xlws.FILTER(A1:A3,A1:A3>0)",
            ),
            ("=sort(A1:A3)", "=_xlfn._xlws.sort(A1:A3)"),
            (
                "=IFNA(XLOOKUP(1,A1:A3,B1:B3),0)",
                "=_xlfn.IFNA(_xlfn.XLOOKUP(1,A1:A3,B1:B3),0)",
            ),
            (
                "=ifna(xlookup(1,A1:A3,B1:B3),0)",
                "=_xlfn.ifna(_xlfn.xlookup(1,A1:A3,B1:B3),0)",
            ),
            (
                "=LAMBDA(value,\"_xlpm.value\"&'value'!A1&Table[value])",
                "=_xlfn.LAMBDA(_xlpm.value,\"_xlpm.value\"&'value'!A1&Table[value])",
            ),
        ];
        for (plain, xlsx) in cases {
            assert_eq!(formula_to_xlsx(plain), xlsx);
            assert_eq!(formula_to_xlsx(xlsx), xlsx);
            assert_eq!(formula_from_xlsx(xlsx), plain);
        }
        assert_eq!(
            formula_from_xlsx("='_xlfn.Sheet'!A1+_xlfn.FUTURE(1)"),
            "='_xlfn.Sheet'!A1+FUTURE(1)"
        );
    }
}
