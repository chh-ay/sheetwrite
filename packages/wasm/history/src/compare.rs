//! Compare one cell of the earlier version with the same cell of the later
//! version. Sources are compared, not calculated values: a formula whose
//! result changed but whose source did not is not a change.

use crate::transfer::{Block, KIND_EMPTY, KIND_FORMULA, KIND_STRING};

/// The literal value, or whether the cell holds a literal or a formula, changed.
pub(crate) const VALUE: u8 = 1;
/// A formula source was added, removed or changed.
pub(crate) const FORMULA: u8 = 2;
/// The style changed, compared by content.
pub(crate) const STYLE: u8 = 4;
/// The cell had no value or formula before and has one now.
pub(crate) const ADDED: u8 = 8;
/// The cell had a value or formula before and has none now.
pub(crate) const REMOVED: u8 = 16;

/// Style IDs are local to each store; `table` maps them to content IDs that
/// both versions share. An ID outside the table is compared as itself.
pub(crate) fn style(table: &[u32], id: u32) -> u32 {
    table.get(id as usize).map_or(id, |&content| content)
}

/// One cell of a decoded block.
#[derive(Clone, Copy)]
pub(crate) struct Cell<'a> {
    pub block: &'a Block,
    pub index: usize,
    pub style: u32,
}

impl Cell<'_> {
    fn kind(&self) -> u8 {
        self.block.kinds[self.index]
    }

    fn same_source(&self, other: &Cell<'_>) -> bool {
        let kind = self.kind();
        if kind != other.kind() {
            return false;
        }

        match kind {
            KIND_EMPTY => true,
            KIND_FORMULA => self.block.formula(self.index) == other.block.formula(other.index),
            KIND_STRING => {
                self.block.string(self.block.payloads[self.index])
                    == other.block.string(other.block.payloads[other.index])
            }
            _ => self.block.payloads[self.index] == other.block.payloads[other.index],
        }
    }
}

/// Change flags of `after` against `earlier`, the same cell in the earlier
/// version; `earlier` is `None` for a cell on a row or column that the earlier
/// version did not have. `0` means unchanged.
pub(crate) fn flags(earlier: Option<Cell<'_>>, after: Cell<'_>) -> u8 {
    let Some(before) = earlier else {
        let mut flags = if after.kind() == KIND_EMPTY { 0 } else { ADDED };
        if after.kind() == KIND_FORMULA {
            flags |= FORMULA;
        }
        if after.style != 0 {
            flags |= STYLE;
        }

        return flags;
    };

    let mut flags = 0;
    let had = before.kind() != KIND_EMPTY;
    let has = after.kind() != KIND_EMPTY;

    if !before.same_source(&after) {
        if !had {
            flags |= ADDED;
        } else if !has {
            flags |= REMOVED;
        }

        // A literal replaced by another literal, or a literal and a formula
        // swapped, is a value change; two formulas differ only in source.
        let formulas =
            u8::from(before.kind() == KIND_FORMULA) + u8::from(after.kind() == KIND_FORMULA);
        if formulas > 0 {
            flags |= FORMULA;
        }
        if formulas < 2 && had && has {
            flags |= VALUE;
        }
    }

    if before.style != after.style {
        flags |= STYLE;
    }

    flags
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transfer::read_block;
    use crate::transfer::tests::{block_bytes, Cell as Input};

    fn block(cells: &[Input]) -> Block {
        let mut block = Block::default();
        read_block(&block_bytes(1, cells.len(), cells, &[]), &mut block).unwrap();
        block
    }

    fn at(block: &Block, index: usize, style: u32) -> Cell<'_> {
        Cell {
            block,
            index,
            style,
        }
    }

    #[test]
    fn compares_sources_by_content_across_string_tables() {
        let before = block(&[Input::Text("b"), Input::Text("a"), Input::Formula("=A1")]);
        let after = block(&[Input::Text("a"), Input::Text("b"), Input::Formula("=A1")]);

        assert_eq!(flags(Some(at(&before, 1, 0)), at(&after, 0, 0)), 0);
        assert_eq!(flags(Some(at(&before, 0, 0)), at(&after, 0, 0)), VALUE);
        assert_eq!(flags(Some(at(&before, 2, 0)), at(&after, 2, 0)), 0);
    }

    #[test]
    fn names_added_removed_formula_and_style_changes() {
        let before = block(&[
            Input::Empty,
            Input::Number(1.0),
            Input::Number(2.0),
            Input::Formula("=1"),
        ]);
        let after = block(&[
            Input::Number(5.0),
            Input::Empty,
            Input::Formula("=2"),
            Input::Formula("=2"),
        ]);

        assert_eq!(flags(Some(at(&before, 0, 0)), at(&after, 0, 0)), ADDED);
        assert_eq!(flags(Some(at(&before, 1, 0)), at(&after, 1, 0)), REMOVED);
        assert_eq!(
            flags(Some(at(&before, 2, 0)), at(&after, 2, 0)),
            FORMULA | VALUE
        );
        assert_eq!(flags(Some(at(&before, 3, 0)), at(&after, 3, 0)), FORMULA);
        assert_eq!(flags(Some(at(&before, 1, 1)), at(&before, 1, 2)), STYLE);
        assert_eq!(flags(None, at(&after, 2, 0)), ADDED | FORMULA);
        assert_eq!(flags(None, at(&after, 1, 0)), 0);
    }
}
