//! OOXML spelling belongs beside the lexer, not in the workbook transport.

use crate::calc::Tok;
use crate::formula_tokens::{lex_tolerant, Spanned};
use wasm_bindgen::prelude::wasm_bindgen;

// MS-XLSX §2.2.3 and §2.2.2 extend ISO/IEC 29500-1 §18.17.2.4:
// future functions use `_xlfn.`, worksheet-only functions also use `_xlws.`,
// and LAMBDA parameter names use `_xlpm.` (lambda-parameter-name).
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/5d1b6d44-6fc1-4ecd-8fef-0b27406cc2bf
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/3d025add-118d-4413-9856-ab65712ec1b0
const FUTURE_FUNCTIONS: &str = "ACOT ACOTH AGGREGATE ANCHORARRAY ARABIC BASE BETA.DIST BETA.INV BINOM.DIST BINOM.DIST.RANGE BINOM.INV BITAND BITLSHIFT BITOR BITRSHIFT BITXOR BYCOL BYROW CEILING.MATH CEILING.PRECISE CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT CHISQ.TEST CHOOSECOLS CHOOSEROWS COMBINA CONCAT CONFIDENCE.NORM CONFIDENCE.T COT COTH COVARIANCE.P COVARIANCE.S CSC CSCH DAYS DECIMAL DROP ERF.PRECISE ERFC.PRECISE EXPAND EXPON.DIST F.DIST F.DIST.RT F.INV F.INV.RT F.TEST FIELDVALUE FILTERXML FLOOR.MATH FLOOR.PRECISE FORECAST.ETS FORECAST.ETS.CONFINT FORECAST.ETS.SEASONALITY FORECAST.ETS.STAT FORECAST.LINEAR FORMULATEXT GAMMA GAMMA.DIST GAMMA.INV GAMMALN.PRECISE GAUSS HSTACK HYPGEOM.DIST IFNA IFS IMCOSH IMCOT IMCSC IMCSCH IMSEC IMSECH IMSINH IMTAN ISFORMULA ISOMITTED ISOWEEKNUM LAMBDA LET LOGNORM.DIST LOGNORM.INV MAKEARRAY MAP MAXIFS MINIFS MODE.MULT MODE.SNGL MUNIT NEGBINOM.DIST NORM.DIST NORM.INV NORM.S.DIST NORM.S.INV NUMBERVALUE PDURATION PERCENTILE.EXC PERCENTILE.INC PERCENTRANK.EXC PERCENTRANK.INC PERMUTATIONA PHI POISSON.DIST PQSOURCE PYTHON_STR PYTHON_TYPE PYTHON_TYPENAME QUARTILE.EXC QUARTILE.INC QUERYSTRING RANDARRAY RANK.AVG RANK.EQ REDUCE RRI SCAN SEC SECH SEQUENCE SHEET SHEETS SKEW.P SORTBY STDEV.P STDEV.S SWITCH T.DIST T.DIST.2T T.DIST.RT T.INV T.INV.2T T.TEST TAKE TEXTAFTER TEXTBEFORE TEXTJOIN TEXTSPLIT TOCOL TOROW UNICHAR UNICODE UNIQUE VAR.P VAR.S VSTACK WEBSERVICE WEIBULL.DIST WRAPCOLS WRAPROWS XLOOKUP XMATCH XOR Z.TEST";

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
        Some(Ok(Tok::Bang))
    ) || index
        .checked_sub(1)
        .is_some_and(|previous| matches!(tokens[previous].tok, Ok(Tok::Bang)))
}

/// Remove only identifier prefixes. Quoted text, sheet names and structured
/// references are not function or parameter names and must remain unchanged.
#[wasm_bindgen(js_name = formulaFromXlsx)]
pub fn formula_from_xlsx(source: &str) -> String {
    let tokens = lex_tolerant(source);
    let mut result = String::with_capacity(source.len());
    let mut previous = 0;
    for (index, token) in tokens.iter().enumerate() {
        let Some(name) = identifier(token) else {
            continue;
        };
        if is_qualified(&tokens, index) {
            continue;
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
    lambda: bool,
}

struct Frame {
    start: usize,
    arguments: Vec<(usize, usize)>,
    argument_start: usize,
}

fn bindings<'a>(tokens: &'a [Spanned<'_>]) -> Vec<Binding<'a>> {
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
                        lambda,
                    });
                }
            }
            _ => {}
        }
    }
    bindings
}

/// Write the same future-function spelling for cell and defined-name formulas.
/// This is lexical: unknown future functions and incomplete formulas still
/// round-trip without a parse/serialize pass changing their source text.
#[wasm_bindgen(js_name = formulaToXlsx)]
pub fn formula_to_xlsx(source: &str) -> String {
    let tokens = lex_tolerant(source);
    let bindings = bindings(&tokens);
    let mut result = String::with_capacity(source.len());
    let mut previous = 0;
    for (index, token) in tokens.iter().enumerate() {
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
        let prefix = if let Some(binding) = binding {
            if binding.lambda {
                "_xlpm."
            } else {
                ""
            }
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
                .split_ascii_whitespace()
                .any(|function| function.eq_ignore_ascii_case(bare))
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

#[cfg(test)]
mod tests {
    use super::{formula_from_xlsx, formula_to_xlsx};

    #[test]
    fn future_functions_and_lambda_parameters_keep_lexical_scopes() {
        let cases = [
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
                "=_xlfn.LAMBDA(_xlpm.value,_xlfn.LET(value,2,value))+value",
            ),
            ("=LAMBDA(fn,fn(2))", "=_xlfn.LAMBDA(_xlpm.fn,_xlpm.fn(2))"),
            (
                "=SUM(A1)+FILTER(A1:A3,A1:A3>0)",
                "=SUM(A1)+_xlfn._xlws.FILTER(A1:A3,A1:A3>0)",
            ),
            (
                "=IFNA(XLOOKUP(1,A1:A3,B1:B3),0)",
                "=_xlfn.IFNA(_xlfn.XLOOKUP(1,A1:A3,B1:B3),0)",
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
