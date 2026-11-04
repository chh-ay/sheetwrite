//! Workbook-owned formula entries. Cell addresses locate slots; graph walks use ids.

use crate::memory::{StoreMemoryStats, FORMULAS};
use crate::types::{AbsCellKey, CellKey, EvalResult, FormulaEntry};

const NO_FREE_SLOT: u32 = u32::MAX;
const BITS_PER_WORD: usize = u64::BITS as usize;
const NO_RESULT_POSITION: u32 = u32::MAX;
const SLOT_CAPACITY_SLACK: usize = 4096;
const SLOT_GROWTH_DIVISOR: usize = 8;
const MIN_SLOT_GROWTH: usize = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub(crate) struct FormulaId(pub(crate) u32);

impl FormulaId {
    #[inline]
    pub(crate) fn index(self) -> usize {
        self.0 as usize
    }
}

#[derive(Default)]
pub(crate) struct FormulaBits {
    words: Vec<u64>,
    count: usize,
}

impl FormulaBits {
    #[inline]
    pub(crate) fn contains(&self, id: FormulaId) -> bool {
        let index = id.index();
        self.words
            .get(index / BITS_PER_WORD)
            .is_some_and(|word| word & (1u64 << (index % BITS_PER_WORD)) != 0)
    }

    pub(crate) fn insert(&mut self, id: FormulaId) -> bool {
        let index = id.index();
        let word = index / BITS_PER_WORD;
        if self.words.len() <= word {
            if self.words.capacity() == 0 {
                self.words.reserve_exact(word + 1);
            }
            self.words.resize(word + 1, 0);
        }
        let mask = 1u64 << (index % BITS_PER_WORD);
        let Some(word) = self.words.get_mut(word) else {
            return false;
        };
        if *word & mask != 0 {
            return false;
        }
        *word |= mask;
        self.count += 1;
        true
    }

    pub(crate) fn remove(&mut self, id: FormulaId) -> bool {
        let index = id.index();
        let Some(word) = self.words.get_mut(index / BITS_PER_WORD) else {
            return false;
        };
        let mask = 1u64 << (index % BITS_PER_WORD);
        if *word & mask == 0 {
            return false;
        }
        *word &= !mask;
        self.count -= 1;
        true
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.count == 0
    }

    fn ids(&self) -> FormulaBitIds<'_> {
        FormulaBitIds {
            words: self.words.iter(),
            base: 0,
            remaining: 0,
        }
    }

    pub(crate) fn release_if_empty(&mut self) {
        if self.is_empty() {
            self.words = Vec::new();
        }
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut crate::memory::MemoryOwnerStats) {
        stats.add_vec::<u64>(self.words.len(), self.words.capacity());
    }
}

struct FormulaBitIds<'a> {
    words: std::slice::Iter<'a, u64>,
    base: usize,
    remaining: u64,
}

impl Iterator for FormulaBitIds<'_> {
    type Item = FormulaId;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.remaining != 0 {
                let bit = self.remaining.trailing_zeros() as usize;
                self.remaining &= self.remaining - 1;
                return Some(FormulaId((self.base - BITS_PER_WORD + bit) as u32));
            }

            self.remaining = *self.words.next()?;
            self.base += BITS_PER_WORD;
        }
    }
}

struct FormulaFlagKeys<'a> {
    ids: FormulaBitIds<'a>,
    locations: &'a [AbsCellKey],
    sheet: Option<u32>,
}

impl FormulaFlagKeys<'_> {
    #[inline(never)]
    fn next_flag_family(&mut self) -> Option<CellKey> {
        let sheet = self.sheet?;
        loop {
            let id = self.ids.next()?;
            let key = self.locations.get(id.index())?;
            if key.sheet == sheet {
                return Some(key.local());
            }
        }
    }
}

impl Iterator for FormulaFlagKeys<'_> {
    type Item = CellKey;

    fn next(&mut self) -> Option<Self::Item> {
        self.next_flag_family()
    }
}

enum FormulaSlot {
    Occupied(FormulaEntry),
    Vacant(u32),
}

// A vacant slot holds its link without adding bytes per live formula.
const _: () =
    assert!(std::mem::size_of::<FormulaSlot>() == std::mem::size_of::<Option<FormulaEntry>>());

#[derive(Default)]
pub(crate) struct FormulaStore {
    locations: Vec<AbsCellKey>,
    entries: Vec<FormulaSlot>,
    free_head: Option<FormulaId>,
    // Removed ids stay retired until the graph edit owns their old read sets.
    retired_head: Option<FormulaId>,
    retired_tail: Option<FormulaId>,
    volatile: FormulaBits,
    subtotals: FormulaBits,
}

impl FormulaStore {
    pub(crate) fn slots(&self) -> usize {
        self.entries.len()
    }

    pub(crate) fn compact(&mut self) {
        let retained = self
            .entries
            .len()
            .saturating_add(self.entries.len() / SLOT_GROWTH_DIVISOR);
        if self.entries.capacity() > retained.saturating_add(SLOT_CAPACITY_SLACK) {
            self.entries.shrink_to(retained);
            self.locations.shrink_to(retained);
        }
    }

    #[inline]
    pub(crate) fn location(&self, id: FormulaId) -> Option<AbsCellKey> {
        self.locations.get(id.index()).copied()
    }

    #[inline]
    pub(crate) fn get(&self, id: FormulaId) -> Option<&FormulaEntry> {
        match self.entries.get(id.index())? {
            FormulaSlot::Occupied(entry) => Some(entry),
            FormulaSlot::Vacant(_) => None,
        }
    }

    pub(crate) fn get_mut(&mut self, id: FormulaId) -> Option<&mut FormulaEntry> {
        match self.entries.get_mut(id.index())? {
            FormulaSlot::Occupied(entry) => Some(entry),
            FormulaSlot::Vacant(_) => None,
        }
    }

    fn track(&mut self, id: FormulaId) {
        let (volatile, subtotal) = self.get(id).map_or((false, false), |entry| {
            (entry.volatile(), entry.calls_subtotal())
        });
        if volatile {
            self.volatile.insert(id);
        } else {
            self.volatile.remove(id);
            self.volatile.release_if_empty();
        }
        if subtotal {
            self.subtotals.insert(id);
        } else {
            self.subtotals.remove(id);
            self.subtotals.release_if_empty();
        }
    }

    #[inline(never)]
    pub(crate) fn allocate(&mut self, location: AbsCellKey, entry: FormulaEntry) -> FormulaId {
        let id = if let Some(id) = self.free_head {
            self.reuse_slot_family(id, location, entry)
                .expect("invalid free formula slot")
        } else {
            self.grow_slot_family(location, entry)
        };
        self.track(id);
        id
    }

    fn reuse_slot_family(
        &mut self,
        id: FormulaId,
        location: AbsCellKey,
        entry: FormulaEntry,
    ) -> Option<FormulaId> {
        let index = id.index();
        let location_slot = self.locations.get_mut(index)?;
        let entry_slot = self.entries.get_mut(index)?;
        let FormulaSlot::Vacant(next) = entry_slot else {
            return None;
        };
        self.free_head = (*next != NO_FREE_SLOT).then_some(FormulaId(*next));
        *location_slot = location;
        *entry_slot = FormulaSlot::Occupied(entry);
        Some(id)
    }

    // Most source writes replace a live formula or reuse a slot.
    #[cold]
    #[inline(never)]
    fn grow_slot_family(&mut self, location: AbsCellKey, entry: FormulaEntry) -> FormulaId {
        let index = self.entries.len();
        assert!(
            index < NO_FREE_SLOT as usize,
            "formula slot count exceeds u32"
        );
        if index == self.entries.capacity() {
            // Bound unused entry storage without adding copies on replacement.
            let growth = (index / SLOT_GROWTH_DIVISOR).max(MIN_SLOT_GROWTH);
            self.entries.reserve_exact(growth);
            self.locations.reserve_exact(growth);
        }
        self.locations.push(location);
        self.entries.push(FormulaSlot::Occupied(entry));
        FormulaId(index as u32)
    }

    pub(crate) fn replace(&mut self, id: FormulaId, entry: FormulaEntry) -> Option<FormulaEntry> {
        let previous = std::mem::replace(
            self.entries.get_mut(id.index())?,
            FormulaSlot::Occupied(entry),
        );
        self.track(id);
        match previous {
            FormulaSlot::Occupied(entry) => Some(entry),
            FormulaSlot::Vacant(_) => None,
        }
    }

    #[inline(never)]
    pub(crate) fn retire(&mut self, id: FormulaId) -> Option<FormulaEntry> {
        let slot = self.entries.get_mut(id.index())?;
        if matches!(slot, FormulaSlot::Vacant(_)) {
            return None;
        }
        let previous = std::mem::replace(
            slot,
            FormulaSlot::Vacant(self.retired_head.map_or(NO_FREE_SLOT, |head| head.0)),
        );
        self.track(id);
        self.retired_head = Some(id);
        self.retired_tail.get_or_insert(id);
        match previous {
            FormulaSlot::Occupied(entry) => Some(entry),
            FormulaSlot::Vacant(_) => None,
        }
    }

    pub(crate) fn release_retired(&mut self) {
        let Some(tail) = self.retired_tail else {
            return;
        };
        let Some(FormulaSlot::Vacant(next)) = self.entries.get_mut(tail.index()) else {
            return;
        };
        *next = self.free_head.map_or(NO_FREE_SLOT, |head| head.0);
        self.free_head = self.retired_head.take();
        self.retired_tail = None;
    }

    pub(crate) fn relocate(&mut self, id: FormulaId, location: AbsCellKey) {
        if let Some(slot) = self.locations.get_mut(id.index()) {
            *slot = location;
        }
    }

    pub(crate) fn refresh_flags(&mut self, id: FormulaId) {
        self.track(id);
    }

    pub(crate) fn is_volatile(&self, id: FormulaId) -> bool {
        self.volatile.contains(id)
    }

    pub(crate) fn is_subtotal(&self, id: FormulaId) -> bool {
        self.subtotals.contains(id)
    }

    pub(crate) fn volatile_keys(&self, sheet: Option<u32>) -> impl Iterator<Item = CellKey> + '_ {
        FormulaFlagKeys {
            ids: self.volatile.ids(),
            locations: &self.locations,
            sheet,
        }
    }

    pub(crate) fn subtotal_keys(&self, sheet: Option<u32>) -> impl Iterator<Item = CellKey> + '_ {
        FormulaFlagKeys {
            ids: self.subtotals.ids(),
            locations: &self.locations,
            sheet,
        }
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let formulas = stats.owner_mut(FORMULAS);
        formulas.add_vec::<AbsCellKey>(self.locations.len(), self.locations.capacity());
        formulas.add_vec::<FormulaSlot>(self.entries.len(), self.entries.capacity());
        self.volatile.add_memory_stats(formulas);
        self.subtotals.add_memory_stats(formulas);
        for slot in &self.entries {
            if let FormulaSlot::Occupied(entry) = slot {
                entry.heap_memory_stats(formulas);
            }
        }
    }
}

/// The selected ids are also the queue, so each formula enters the pass once.
#[derive(Default)]
pub(crate) struct FormulaWork {
    bits: FormulaBits,
    ids: Vec<FormulaId>,
}

impl FormulaWork {
    pub(crate) fn select(&mut self, sheets: &[crate::sheet::SheetData], key: AbsCellKey) {
        if let Some(id) = sheets
            .get(key.sheet as usize)
            .and_then(|sheet| sheet.formulas.id(key.local()))
        {
            self.insert(id);
        }
    }

    pub(crate) fn insert(&mut self, id: FormulaId) -> bool {
        if !self.bits.insert(id) {
            return false;
        }
        if self.ids.capacity() == 0 {
            self.ids.reserve_exact(MIN_SLOT_GROWTH);
        }
        self.ids.push(id);
        true
    }

    #[inline]
    pub(crate) fn contains(&self, id: FormulaId) -> bool {
        self.bits.contains(id)
    }

    pub(crate) fn len(&self) -> usize {
        self.ids.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.ids.is_empty()
    }

    pub(crate) fn id_at(&self, offset: usize) -> Option<FormulaId> {
        self.ids.get(offset).copied()
    }

    pub(crate) fn ids(&self) -> impl Iterator<Item = FormulaId> + '_ {
        self.ids.iter().copied()
    }

    pub(crate) fn keys<'a>(
        &'a self,
        slots: &'a FormulaStore,
    ) -> impl Iterator<Item = AbsCellKey> + 'a {
        self.ids.iter().filter_map(|&id| slots.location(id))
    }

    fn clear(&mut self) {
        if self.ids.len() < self.bits.words.len() {
            for &id in &self.ids {
                self.bits.remove(id);
            }
        } else {
            self.bits.words.fill(0);
            self.bits.count = 0;
        }
        self.ids.clear();
    }

    fn add_memory_stats(&self, stats: &mut crate::memory::MemoryOwnerStats) {
        self.bits.add_memory_stats(stats);
        stats.add_vec::<FormulaId>(self.ids.len(), self.ids.capacity());
    }
}

impl Extend<FormulaId> for FormulaWork {
    fn extend<Ids: IntoIterator<Item = FormulaId>>(&mut self, ids: Ids) {
        for id in ids {
            self.insert(id);
        }
    }
}

impl IntoIterator for FormulaWork {
    type Item = FormulaId;
    type IntoIter = std::vec::IntoIter<FormulaId>;

    fn into_iter(self) -> Self::IntoIter {
        self.ids.into_iter()
    }
}

/// Results exist only during a pass. The retained id-to-position array lets a
/// small edit clear only its own slots instead of initializing the whole sheet.
#[derive(Default)]
pub(crate) struct FormulaResults {
    positions: Vec<u32>,
    values: Vec<Option<EvalResult>>,
    used: Vec<FormulaId>,
    work: FormulaWork,
    count: usize,
    pub(crate) visiting: FormulaBits,
}

impl FormulaResults {
    pub(crate) fn take_work(&mut self) -> FormulaWork {
        std::mem::take(&mut self.work)
    }

    pub(crate) fn prepare(&mut self, slots: usize, selected: usize) {
        self.clear();
        let retained = slots.saturating_add(slots / SLOT_GROWTH_DIVISOR);
        if self.positions.capacity() < slots {
            self.positions
                .reserve_exact(retained.saturating_sub(self.positions.len()));
        }
        self.positions.resize(slots, NO_RESULT_POSITION);
        if self.positions.capacity() > retained.saturating_add(SLOT_CAPACITY_SLACK) {
            self.positions.shrink_to(retained);
        }
        self.values.reserve_exact(selected);
        self.used.reserve_exact(selected);
    }

    #[inline]
    fn position(&self, id: FormulaId) -> Option<usize> {
        let position = *self.positions.get(id.index())?;
        (position != NO_RESULT_POSITION).then_some(position as usize)
    }

    #[inline]
    pub(crate) fn get(&self, id: FormulaId) -> Option<&EvalResult> {
        self.values.get(self.position(id)?).and_then(Option::as_ref)
    }

    pub(crate) fn get_mut(&mut self, id: FormulaId) -> Option<&mut EvalResult> {
        let position = self.position(id)?;
        self.values.get_mut(position).and_then(Option::as_mut)
    }

    pub(crate) fn insert(&mut self, id: FormulaId, value: EvalResult) {
        if self.positions.len() <= id.index() {
            self.positions.resize(id.index() + 1, NO_RESULT_POSITION);
        }
        if let Some(position) = self.position(id) {
            let Some(slot) = self.values.get_mut(position) else {
                return;
            };
            self.count += usize::from(slot.replace(value).is_none());
        } else {
            let Some(position) = self.positions.get_mut(id.index()) else {
                return;
            };
            // There is at most one position per allocated FormulaId.
            *position = self.values.len() as u32;
            self.used.push(id);
            self.values.push(Some(value));
            self.count += 1;
        }
    }

    pub(crate) fn remove(&mut self, id: FormulaId) -> Option<EvalResult> {
        let position = self.position(id)?;
        let value = self.values.get_mut(position)?.take()?;
        self.count -= 1;
        Some(value)
    }

    pub(crate) fn len(&self) -> usize {
        self.count
    }

    pub(crate) fn clear(&mut self) {
        for id in self.used.drain(..) {
            if let Some(position) = self.positions.get_mut(id.index()) {
                *position = NO_RESULT_POSITION;
            }
            self.visiting.remove(id);
        }
        self.values.clear();
        self.count = 0;
    }

    pub(crate) fn finish(&mut self, mut work: FormulaWork) {
        self.clear();
        self.values = Vec::new();
        self.used = Vec::new();
        // Reuse primary pass storage, never formula values or selected ids.
        work.clear();
        self.work = work;
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let formulas = stats.owner_mut(FORMULAS);
        formulas.add_vec::<u32>(self.positions.len(), self.positions.capacity());
        formulas.add_vec::<Option<EvalResult>>(self.values.len(), self.values.capacity());
        formulas.add_vec::<FormulaId>(self.used.len(), self.used.capacity());
        self.visiting.add_memory_stats(formulas);
        self.work.add_memory_stats(formulas);
    }
}
