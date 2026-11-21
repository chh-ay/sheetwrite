//! Rewriting references when sheets or tables are renamed, moved or removed.

use super::*;

/// Rewrite resolved references by stable numeric handle and regenerate quoting metadata.
pub(crate) fn rename_sheet_refs(ast: &mut Ast, handle: u32, name: &str) -> bool {
    match ast {
        Ast::AbsCell(sheet, _, _, flags) if sheet.handle == handle => {
            *flags = flags.with_quoted(sheet_name_needs_quotes(name));
            true
        }
        Ast::AbsRange(sheet, _, _, _, _, flags) if sheet.handle == handle => {
            flags.start = flags.start.with_quoted(sheet_name_needs_quotes(name));
            true
        }
        Ast::SheetSpan(span) => {
            let mut changed = false;
            for endpoint in [&mut span.first, &mut span.last] {
                if endpoint.handle == handle {
                    endpoint.quoted = sheet_name_needs_quotes(name);
                    changed = true;
                }
            }
            changed
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
        | Ast::Neg(_)
        | Ast::Pos(_)
        | Ast::Percent(_)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => {
            ast.fold_children_mut(&mut |child| rename_sheet_refs(child, handle, name))
        }
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => {
            ast.fold_children_mut(&mut |child| rename_sheet_refs(child, handle, name))
        }
    }
}

/// The cells of a table reference after an edit of its table; `None` when
/// the reference no longer reads anything.
pub(crate) type TableRefresh<'a> = dyn Fn(&StructuredRef) -> Option<StructuredRef> + 'a;

/// Refresh each reference to table slot `table` with `refresh`; a reference
/// it drops becomes `#REF!`. Returns whether the tree names the table.
pub(crate) fn refresh_table_refs(ast: &mut Ast, table: u16, refresh: &TableRefresh<'_>) -> bool {
    if let Ast::Structured(reference) = ast {
        if reference.table != table {
            return false;
        }
        *ast = refresh(reference).map_or(Ast::InvalidRef, Ast::Structured);
        return true;
    }
    ast.fold_children_mut(&mut |child| refresh_table_refs(child, table, refresh))
}

/// The slot and section of a bound table reference; `None` for one that no
/// table binds.
pub(crate) type TableUse = Option<(u16, TableSection)>;

/// Visit each table reference of `ast`: see [`TableUse`].
pub(crate) fn for_each_table_ref(ast: &Ast, visit: &mut dyn FnMut(TableUse)) {
    // Every other node holds table references only through its children.
    if let Ast::Structured(reference) = ast {
        visit(Some((reference.table, reference.section)));
    } else if let Ast::UnresolvedStructured(_) = ast {
        visit(None);
    } else {
        ast.any_child(&mut |child| {
            for_each_table_ref(child, visit);
            false
        });
    }
}

/// Replace every resolved cell/range reference to a removed stable handle with `#REF!`.
/// 3-D references are left to [`refresh_sheet_spans`]: removing one of their
/// sheets shrinks the span instead.
/// Point the references whose sheet name has the lookup `key` at `handle`,
/// or back to unresolved sheet references when `handle` is `None`. Only the
/// sheets of linked workbooks come and go this way; the text stays the same.
pub(crate) fn relink_sheet_refs(
    ast: &mut Ast,
    key: &str,
    handle: Option<u32>,
    names: &[String],
) -> bool {
    let relinked = match (&*ast, handle) {
        (Ast::SheetCell(reference), Some(linked))
            if sheet_name_key(&reference.sheet.name) == key =>
        {
            Some(Ast::AbsCell(
                SheetRef { handle: linked },
                reference.row,
                reference.col,
                reference.flags,
            ))
        }
        (Ast::SheetRange(reference), Some(linked))
            if sheet_name_key(&reference.sheet.name) == key =>
        {
            Some(Ast::AbsRange(
                SheetRef { handle: linked },
                reference.row_start,
                reference.col_start,
                reference.row_end,
                reference.col_end,
                reference.flags,
            ))
        }
        (Ast::AbsCell(sheet, row, col, flags), None)
            if names
                .get(sheet.handle as usize)
                .is_some_and(|name| sheet_name_key(name) == key) =>
        {
            Some(Ast::SheetCell(Box::new(DetachedCellRef {
                sheet: UnresolvedSheetRef {
                    name: names[sheet.handle as usize].clone(),
                    quoted: flags.quoted(),
                },
                row: *row,
                col: *col,
                flags: *flags,
            })))
        }
        (Ast::AbsRange(sheet, r0, c0, r1, c1, flags), None)
            if names
                .get(sheet.handle as usize)
                .is_some_and(|name| sheet_name_key(name) == key) =>
        {
            Some(Ast::SheetRange(Box::new(DetachedRangeRef {
                sheet: UnresolvedSheetRef {
                    name: names[sheet.handle as usize].clone(),
                    quoted: flags.start.quoted(),
                },
                row_start: *r0,
                col_start: *c0,
                row_end: *r1,
                col_end: *c1,
                flags: *flags,
            })))
        }
        _ => None,
    };
    if let Some(replacement) = relinked {
        *ast = replacement;
        true
    } else {
        ast.fold_children_mut(&mut |child| relink_sheet_refs(child, key, handle, names))
    }
}

pub(crate) fn invalidate_sheet_refs(ast: &mut Ast, handle: u32) -> bool {
    let invalid = matches!(
        ast,
        Ast::AbsCell(sheet, ..) | Ast::AbsRange(sheet, ..) if sheet.handle == handle
    ) || matches!(ast, Ast::Structured(reference) if reference.sheet == handle);
    if invalid {
        *ast = Ast::InvalidRef;
        return true;
    }

    ast.fold_children_mut(&mut |child| invalidate_sheet_refs(child, handle))
}
