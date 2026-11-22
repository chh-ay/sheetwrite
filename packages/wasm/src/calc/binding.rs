//! Binding parsed names to sheets, spans, defined names and tables.

use super::*;

/// Resolve sheet-qualified refs to numeric sheet handles once, at formula ingest.
/// `place_span` gives a resolved 3-D reference the sheets it spans, and fails
/// when an endpoint is not in the tab order.
pub(crate) fn bind_sheet_refs(
    ast: &mut Ast,
    resolve: &SheetResolver<'_>,
    place_span: &SpanPlacer<'_>,
) -> bool {
    // Every node other than a sheet reference binds through its children. A
    // defined name's formula binds its sheets when it is defined.
    if let Ast::SheetCell(reference) = ast {
        let Some(handle) = resolve(&reference.sheet.name) else {
            return false;
        };
        *ast = Ast::AbsCell(
            SheetRef { handle },
            reference.row,
            reference.col,
            reference.flags,
        );
        return true;
    }
    if let Ast::SheetRange(reference) = ast {
        let Some(handle) = resolve(&reference.sheet.name) else {
            return false;
        };
        *ast = Ast::AbsRange(
            SheetRef { handle },
            reference.row_start,
            reference.col_start,
            reference.row_end,
            reference.col_end,
            reference.flags,
        );
        return true;
    }
    if let Ast::SheetSpan(span) = ast {
        let mut changed = false;
        for endpoint in [&mut span.first, &mut span.last] {
            if let Some(name) = endpoint.name.as_deref() {
                if let Some(handle) = resolve(name) {
                    endpoint.handle = handle;
                    endpoint.name = None;
                    changed = true;
                }
            }
        }
        if span.first.handle != UNRESOLVED_SHEET && span.last.handle != UNRESOLVED_SHEET {
            changed |= place_span(span);
        }
        return changed;
    }
    ast.fold_children_mut(&mut |child| bind_sheet_refs(child, resolve, place_span))
}

pub(crate) fn has_unresolved_local_sheets(ast: &Ast) -> bool {
    // Other nodes hold sheet references only through their children.
    if let Ast::SheetCell(reference) = ast {
        return !is_external_sheet(&reference.sheet.name);
    }
    if let Ast::SheetRange(reference) = ast {
        return !is_external_sheet(&reference.sheet.name);
    }
    if let Ast::SheetSpan(span) = ast {
        return span.first.name.is_some() || span.last.name.is_some();
    }
    ast.any_child(&mut has_unresolved_local_sheets)
}

pub(crate) fn unresolved_sheet_names(ast: &Ast, out: &mut Vec<String>) {
    // Other nodes hold sheet references only through their children.
    if let Ast::SheetCell(reference) = ast {
        out.push(sheet_name_key(&reference.sheet.name));
    } else if let Ast::SheetRange(reference) = ast {
        out.push(sheet_name_key(&reference.sheet.name));
    } else if let Ast::SheetSpan(span) = ast {
        for endpoint in [&span.first, &span.last] {
            if let Some(name) = endpoint.name.as_deref() {
                out.push(sheet_name_key(name));
            }
        }
    } else {
        ast.any_child(&mut |child| {
            unresolved_sheet_names(child, out);
            false
        });
    }
}

fn tab_position(order: &[u32], handle: u32) -> Option<usize> {
    order.iter().position(|&tab| tab == handle)
}

/// Gives a span with resolved endpoints the sheets between them in tab
/// order. Endpoints written in reverse tab order are swapped, so `first` is
/// always the earlier tab. Fails when an endpoint is not in `order`.
pub(crate) fn place_span(span: &mut SheetSpanRef, order: &[u32]) -> bool {
    let (Some(mut start), Some(mut end)) = (
        tab_position(order, span.first.handle),
        tab_position(order, span.last.handle),
    ) else {
        return false;
    };
    if start > end {
        std::mem::swap(&mut span.first, &mut span.last);
        std::mem::swap(&mut start, &mut end);
    }

    span.sheets.clear();
    span.sheets.extend_from_slice(&order[start..=end]);
    true
}

/// Whether the formula's own tree holds a 3-D reference; a defined name's
/// spans belong to the name, which `refresh_sheet_spans` does not rewrite.
pub(crate) fn ast_contains_sheet_span(ast: &Ast) -> bool {
    matches!(ast, Ast::SheetSpan(_)) || ast.any_child(&mut ast_contains_sheet_span)
}

/// Re-places every 3-D reference in `ast` after tabs were moved, inserted or
/// removed, as Excel does: removed sheets leave the span, a removed endpoint
/// gives way to its nearest surviving neighbour inside the span, and an
/// endpoint moved past the other endpoint leaves the span, so its inner
/// neighbour becomes the endpoint. A span without surviving sheets becomes
/// `#REF!`. `names` holds the sheet name of each handle.
pub(crate) fn refresh_sheet_spans(ast: &mut Ast, order: &[u32], names: &[String]) -> bool {
    match ast {
        Ast::SheetSpan(span) => {
            if let Some(changed) = refresh_span(span, order, names) {
                changed
            } else {
                *ast = Ast::InvalidRef;
                true
            }
        }
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::DefinedName(..)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(..)
        | Ast::AbsRange(..)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(..)
        | Ast::Pos(..)
        | Ast::Percent(..)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => {
            ast.fold_children_mut(&mut |child| refresh_sheet_spans(child, order, names))
        }
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => {
            ast.fold_children_mut(&mut |child| refresh_sheet_spans(child, order, names))
        }
    }
}

/// Whether `span` changed, or `None` when none of its sheets is left.
fn refresh_span(span: &mut SheetSpanRef, order: &[u32], names: &[String]) -> Option<bool> {
    let survivors: Vec<(u32, usize)> = span
        .sheets
        .iter()
        .filter_map(|&handle| tab_position(order, handle).map(|position| (handle, position)))
        .collect();
    let mut low = 0;
    let mut high = survivors.len().checked_sub(1)?;

    // Only one tab moves at a time, so the endpoint that now sits beyond its
    // own inner neighbour is the one that moved.
    while survivors[low].1 > survivors[high].1 {
        if survivors[low].1 > survivors[low + 1].1 {
            low += 1;
        } else {
            high -= 1;
        }
    }

    let (first, start) = survivors[low];
    let (last, end) = survivors[high];
    let sheets = &order[start..=end];
    if first == span.first.handle && last == span.last.handle && span.sheets == sheets {
        return Some(false);
    }

    for (endpoint, handle) in [(&mut span.first, first), (&mut span.last, last)] {
        if endpoint.handle != handle {
            let name = names.get(handle as usize).map_or("", String::as_str);
            endpoint.handle = handle;
            endpoint.name = None;
            endpoint.quoted = sheet_name_needs_quotes(name);
        }
    }
    span.sheets.clear();
    span.sheets.extend_from_slice(sheets);
    Some(true)
}

/// Gives a name of a formula what it binds to: `call` says the name is
/// called (`MYFN(A1)`). `None` leaves the name as written.
pub(crate) type NameBinder<'a> = dyn FnMut(&str, bool) -> Option<Ast> + 'a;

/// Bind the defined names of a parsed formula in place, after its sheet
/// references have stable handles: each name becomes what `resolve` gives
/// it, and on the full engine a call of a name that `resolve` binds becomes
/// a call of the name's value. A LET or LAMBDA name shadows a defined name
/// in its scope and stays as written.
pub(crate) fn bind_defined_names(mut ast: Ast, resolve: &mut NameBinder<'_>) -> Ast {
    bind_names_in(&mut ast, resolve, &mut Vec::new());
    ast
}

fn is_local(locals: &[Box<str>], name: &str) -> bool {
    locals.iter().any(|local| local.eq_ignore_ascii_case(name))
}

#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node binds through its children"
)]
fn bind_names_in(ast: &mut Ast, resolve: &mut NameBinder<'_>, locals: &mut Vec<Box<str>>) {
    match ast {
        Ast::Name(name) => {
            if !is_local(locals, name) {
                if let Some(bound) = resolve(name, false) {
                    *ast = bound;
                }
            }
        }
        Ast::Func(Func::Let, args, _) if args.len() >= 3 && args.len() % 2 == 1 => {
            let outer = locals.len();
            let last = args.len() - 1;
            for index in (1..last).step_by(2) {
                bind_names_in(&mut args[index], resolve, locals);
                if let Ast::Name(name) = &args[index - 1] {
                    locals.push(name.clone());
                }
            }
            bind_names_in(&mut args[last], resolve, locals);
            locals.truncate(outer);
        }
        #[cfg(feature = "analysis")]
        Ast::Func(Func::Analysis(crate::eval::analysis::LAMBDA_ID), args, _) => {
            let outer = locals.len();
            if let Some((body, parameters)) = args.split_last_mut() {
                locals.extend(parameters.iter().filter_map(|parameter| match parameter {
                    Ast::Name(name) => Some(name.clone()),
                    _ => None,
                }));
                bind_names_in(body, resolve, locals);
            }
            locals.truncate(outer);
        }
        Ast::UnknownFunc(call) => {
            for arg in &mut call.args {
                bind_names_in(arg, resolve, locals);
            }
            // `MYFN(A1)` calls the LAMBDA that the defined name MYFN holds.
            // LAMBDA needs the full engine; the default engine leaves the call
            // unknown, so it returns #NAME? as LAMBDA itself does there.
            #[cfg(feature = "analysis")]
            if !is_local(locals, &call.name) {
                if let Some(callee) = resolve(&call.name, true) {
                    let arguments = std::mem::take(&mut call.args);
                    *ast = named_lambda_call(callee, arguments);
                }
            }
        }
        _ => {
            ast.fold_children_mut(&mut |child| {
                bind_names_in(child, resolve, locals);
                false
            });
        }
    }
}

/// A call of the LAMBDA that a defined name holds, in the form an immediate
/// `LAMBDA(…)(…)` call parses to: the function, then the arguments.
#[cfg(feature = "analysis")]
pub(crate) fn named_lambda_call(callee: Ast, arguments: Box<[Ast]>) -> Ast {
    let mut call = Vec::with_capacity(arguments.len() + 1);
    call.push(callee);
    call.extend(arguments);
    Ast::UnknownFunc(Box::new(UnknownCall {
        name: crate::eval::analysis::lambda::CALL.into(),
        args: call.into(),
    }))
}

/// Resolves the table references in `ast` in place, for a formula in the
/// cell at (`formula_row`, `formula_col`) of `formula_sheet`. A reference
/// that `resolve` cannot place stays unresolved. Returns whether any
/// reference was bound.
pub(crate) fn resolve_structured_refs<F>(
    ast: &mut Ast,
    formula_sheet: u32,
    formula_row: u32,
    formula_col: u32,
    resolve: &F,
) -> bool
where
    F: Fn(&UnresolvedStructuredRef, u32, u32, u32) -> Option<StructuredRef> + ?Sized,
{
    // Every other node holds table references only through its children.
    if let Ast::UnresolvedStructured(reference) = ast {
        let Some(resolved) = resolve(reference, formula_sheet, formula_row, formula_col) else {
            return false;
        };
        *ast = Ast::Structured(resolved);
        return true;
    }
    ast.fold_children_mut(&mut |child| {
        resolve_structured_refs(child, formula_sheet, formula_row, formula_col, resolve)
    })
}
