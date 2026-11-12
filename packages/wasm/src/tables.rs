//! The workbook's tables, kept in numbered slots. A bound table reference in
//! a formula names its table by slot, so the table and column names live
//! once, here, and an edit of a table finds the formulas that use it through
//! the store's users index instead of walking every formula.

use std::cell::Cell;

use crate::calc::{external_name_key, StructuredRef, TableSection};
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

/// Tables by slot. A removed table's slot is reused: the formulas that used
/// it no longer name it. Names are found by scanning the few tables of a
/// workbook, the last table found first, so a column of formulas that name
/// one table builds no name key; the store keeps the same size it had with
/// a map by name.
#[derive(Default)]
pub(crate) struct TableSlots {
    slots: Vec<Option<Table>>,
    last_named: Cell<Option<u16>>,
}

impl TableSlots {
    /// The number of live tables.
    pub(crate) fn len(&self) -> usize {
        self.iter().count()
    }

    pub(crate) fn get(&self, slot: u16) -> Option<&Table> {
        self.slots.get(usize::from(slot))?.as_ref()
    }

    /// The table named `name`, compared as `workbook_name_key` compares.
    pub(crate) fn named(&self, name: &str) -> Option<(u16, &Table)> {
        let last = self
            .last_named
            .get()
            .and_then(|slot| Some((slot, self.get(slot)?)));
        if let Some(found) = last.filter(|(_, table)| same_name(&table.name, name)) {
            return Some(found);
        }
        let found = self
            .iter()
            .find(|(_, table)| same_name(&table.name, name))?;
        self.last_named.set(Some(found.0));
        Some(found)
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
            self.named(name)?
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

    /// Store `table` in a free slot. The store's table limit keeps slots far
    /// below `u16::MAX`.
    pub(crate) fn insert(&mut self, table: Table) -> u16 {
        let index = if let Some(free) = self.slots.iter().position(Option::is_none) {
            self.slots[free] = Some(table);
            free
        } else {
            self.slots.push(Some(table));
            self.slots.len() - 1
        };
        index as u16
    }

    /// Put `table` in place of the table in `slot`. Returns the table it
    /// replaced.
    pub(crate) fn replace(&mut self, slot: u16, table: Table) -> Option<Table> {
        self.slots.get_mut(usize::from(slot))?.replace(table)
    }

    pub(crate) fn remove(&mut self, slot: u16) -> Option<Table> {
        let table = self.slots.get_mut(usize::from(slot))?.take()?;
        if self.slots.iter().all(Option::is_none) {
            self.slots = Vec::new();
        }
        Some(table)
    }
}
