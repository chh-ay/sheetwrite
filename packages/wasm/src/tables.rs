//! The workbook's tables, kept in numbered slots. A bound table reference in
//! a formula names its table by slot, so the table and column names live
//! once, here, and an edit of a table finds the formulas that use it through
//! the store's users index instead of walking every formula.

use rustc_hash::FxHashMap;

use crate::calc::{external_name_key, StructuredRef, TableSection};
use crate::store::workbook_name_key;
use crate::types::AbsCellKey;

/// A table reference as it is written: its table name (`None` for
/// `[Column]`), its column name and its section.
#[derive(Clone, Copy)]
pub(crate) struct WrittenTableRef<'a> {
    pub(crate) table: Option<&'a str>,
    pub(crate) column: &'a str,
    pub(crate) section: TableSection,
}

#[derive(Clone, Debug)]
pub(crate) struct TableColumn {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) col: u32,
}

#[derive(Clone, Debug)]
pub(crate) struct Table {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) sheet: u32,
    pub(crate) row_start: u32,
    pub(crate) col_start: u32,
    pub(crate) row_end: u32,
    pub(crate) col_end: u32,
    pub(crate) header_row: bool,
    pub(crate) totals_row: bool,
    pub(crate) columns: Vec<TableColumn>,
}

/// Whether two table or column names are the same name: equal without
/// case, as `workbook_name_key` compares them, without building the keys
/// unless a name has the `Book!Name` form of a linked workbook.
fn same_name(left: &str, right: &str) -> bool {
    if left.contains('!') || right.contains('!') {
        return external_name_key(left).unwrap_or_else(|| left.to_uppercase())
            == external_name_key(right).unwrap_or_else(|| right.to_uppercase());
    }
    left.chars()
        .flat_map(char::to_uppercase)
        .eq(right.chars().flat_map(char::to_uppercase))
}

impl Table {
    /// The rows between the header row and the totals row, if any.
    pub(crate) fn body_rows(&self) -> Option<(u32, u32)> {
        let start = self.row_start + u32::from(self.header_row);
        let end = self.row_end.checked_sub(u32::from(self.totals_row))?;
        (start <= end).then_some((start, end))
    }

    /// The rows `section` covers; `row` is the formula's own row, which a
    /// `[@Column]` reads. `None` when the table has no such row.
    pub(crate) fn section_rows(&self, section: TableSection, row: u32) -> Option<(u32, u32)> {
        match section {
            TableSection::Headers => self.header_row.then_some((self.row_start, self.row_start)),
            TableSection::Totals => self.totals_row.then_some((self.row_end, self.row_end)),
            TableSection::Body => self.body_rows(),
            TableSection::CurrentRow => {
                let (start, end) = self.body_rows()?;
                (start..=end).contains(&row).then_some((row, row))
            }
        }
    }

    /// Whether cell `at` is in the table, header and totals included.
    pub(crate) fn contains(&self, at: AbsCellKey) -> bool {
        at.sheet == self.sheet
            && (self.row_start..=self.row_end).contains(&at.row)
            && (self.col_start..=self.col_end).contains(&at.col)
    }

    pub(crate) fn column_named(&self, name: &str) -> Option<&TableColumn> {
        self.columns
            .iter()
            .find(|column| same_name(&column.name, name))
    }

    pub(crate) fn column_at(&self, col: u32) -> Option<&TableColumn> {
        self.columns.iter().find(|column| column.col == col)
    }

    /// An unqualified reference to `column` of this table, in slot `slot`.
    /// `row` is the formula's row for a `[@Column]`; `None` when the table
    /// has no rows in `section` there.
    pub(crate) fn reference(
        &self,
        slot: u16,
        column: &TableColumn,
        section: TableSection,
        row: u32,
    ) -> Option<StructuredRef> {
        let (row_start, row_end) = self.section_rows(section, row)?;
        Some(StructuredRef {
            table: slot,
            section,
            qualified: false,
            sheet: self.sheet,
            row_start,
            row_end,
            col: column.col,
        })
    }
}

/// Tables by slot, and slots by name key. A removed table's slot is reused:
/// the formulas that used it no longer name it.
#[derive(Default)]
pub(crate) struct TableSlots {
    slots: Vec<Option<Table>>,
    by_name: FxHashMap<String, u16>,
}

impl TableSlots {
    pub(crate) fn len(&self) -> usize {
        self.by_name.len()
    }

    pub(crate) fn get(&self, slot: u16) -> Option<&Table> {
        self.slots.get(usize::from(slot))?.as_ref()
    }

    /// The table whose name has lookup key `key`.
    pub(crate) fn named(&self, key: &str) -> Option<(u16, &Table)> {
        let slot = *self.by_name.get(key)?;
        Some((slot, self.get(slot)?))
    }

    pub(crate) fn contains_name(&self, key: &str) -> bool {
        self.by_name.contains_key(key)
    }

    pub(crate) fn with_id(&self, id: &str) -> Option<(u16, &Table)> {
        self.iter().find(|(_, table)| table.id == id)
    }

    /// Live tables in slot order.
    pub(crate) fn iter(&self) -> impl Iterator<Item = (u16, &Table)> {
        self.slots
            .iter()
            .enumerate()
            .filter_map(|(slot, table)| Some((slot as u16, table.as_ref()?)))
    }

    /// Live tables in slot order, to move with a row or column edit. The
    /// names stay as they are.
    pub(crate) fn iter_mut(&mut self) -> impl Iterator<Item = (u16, &mut Table)> {
        self.slots
            .iter_mut()
            .enumerate()
            .filter_map(|(slot, table)| Some((slot as u16, table.as_mut()?)))
    }

    /// Live tables with their name keys, for the memory state.
    pub(crate) fn named_tables(&self) -> impl Iterator<Item = (&str, &Table)> {
        self.by_name
            .iter()
            .filter_map(|(key, &slot)| Some((key.as_str(), self.get(slot)?)))
    }

    /// Bind the table reference `written`, for a formula in the cell `at`.
    /// An unqualified reference names the one table that holds the cell, and
    /// a `[@Column]` reads the cell's row. `None` when no table or column
    /// matches, or the table has no rows in the section there.
    pub(crate) fn bind(
        &self,
        written: WrittenTableRef<'_>,
        at: AbsCellKey,
    ) -> Option<StructuredRef> {
        let (slot, table) = if let Some(name) = written.table {
            self.named(&workbook_name_key(name))?
        } else {
            let mut holding = self.iter().filter(|(_, table)| table.contains(at));
            let only = holding.next()?;
            if holding.next().is_some() {
                return None;
            }
            only
        };
        let column = table.column_named(written.column)?;
        if written.section == TableSection::CurrentRow && !table.contains(at) {
            return None;
        }
        let bound = table.reference(slot, column, written.section, at.row)?;
        Some(StructuredRef {
            qualified: written.table.is_some(),
            ..bound
        })
    }

    /// Store `table` under name key `key` in a free slot. The store's table
    /// limit keeps slots far below `u16::MAX`.
    pub(crate) fn insert(&mut self, key: String, table: Table) -> u16 {
        let index = if let Some(free) = self.slots.iter().position(Option::is_none) {
            self.slots[free] = Some(table);
            free
        } else {
            self.slots.push(Some(table));
            self.slots.len() - 1
        };
        let slot = index as u16;
        self.by_name.insert(key, slot);
        slot
    }

    /// Put `table` in place of the table in `slot`, now under name key
    /// `key`. Returns the table it replaced.
    pub(crate) fn replace(&mut self, slot: u16, key: String, table: Table) -> Option<Table> {
        let previous = self.slots.get_mut(usize::from(slot))?.replace(table);
        self.by_name.retain(|_, named| *named != slot);
        self.by_name.insert(key, slot);
        previous
    }

    pub(crate) fn remove(&mut self, slot: u16) -> Option<Table> {
        let table = self.slots.get_mut(usize::from(slot))?.take()?;
        self.by_name.retain(|_, named| *named != slot);
        if self.slots.iter().all(Option::is_none) {
            self.slots = Vec::new();
        }
        Some(table)
    }
}
