//! Workbook-owned formula entries. Cell addresses locate slots; graph walks use ids.

use crate::memory::{StoreMemoryStats, FORMULAS};
use crate::types::{AbsCellKey, CellKey, EvalResult, FormulaEntry};

const NO_FREE_SLOT: u32 = u32::MAX;
const BITS_PER_WORD: usize = u64::BITS as usize;
const NO_RESULT_POSITION: u32 = u32::MAX;
const SLOT_CAPACITY_SLACK: usize = 4096;
const SLOT_GROWTH_DIVISOR: usize = 8;
const MIN_SLOT_GROWTH: usize = 1;

/// Below this many slots, location growth takes several steps at once.
const DOUBLING_SLOT_LIMIT: usize = 4096;

// One membership word of ids per page bounds moves of occupied entry storage.
const SLOT_PAGE_LEN: usize = BITS_PER_WORD;

/// The location capacity after `len` slots fill it. Every capacity is a step
/// of one eighth from the last, so a large store keeps the same bounded
/// slack. A small store takes several steps at once, until its capacity at
/// least doubles, so loading copies the array a few times instead of tens.
fn location_capacity_after(len: usize) -> usize {
    let target = if len < DOUBLING_SLOT_LIMIT {
        len.saturating_mul(2).max(SLOT_PAGE_LEN)
    } else {
        len + 1
    };

    let mut capacity = len;
    while capacity < target {
        capacity = capacity.saturating_add((capacity / SLOT_GROWTH_DIVISOR).max(MIN_SLOT_GROWTH));
    }
    capacity
}

/// Stable workbook identity; moving a cell changes its location, not this id.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub(crate) struct FormulaId(u32);

impl FormulaId {
    /// Locate dense state without hashing a cell address.
    #[inline]
    pub(crate) fn index(self) -> usize {
        self.0 as usize
    }
}

/// Primary membership bits shared by dirty work and active evaluation state.
#[derive(Default)]
pub(crate) struct FormulaBits {
    words: Vec<u64>,
    count: usize,
}

impl FormulaBits {
    /// Test membership without allocating words for an unseen id.
    #[inline]
    pub(crate) fn contains(&self, id: FormulaId) -> bool {
        let index = id.index();
        self.words
            .get(index / BITS_PER_WORD)
            .is_some_and(|word| word & (1u64 << (index % BITS_PER_WORD)) != 0)
    }

    /// Return whether this id is new, so a worklist can reject duplicates.
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

    /// Remove membership while keeping the empty check constant-time.
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

    /// Empty membership permits flag storage to be released.
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

    /// Do not retain a flag buffer after its last formula is removed.
    pub(crate) fn release_if_empty(&mut self) {
        if self.is_empty() {
            self.words = Vec::new();
        }
    }

    /// Count owned capacity separately from allocator-private overhead.
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

/// Own entries in small pages so growth never moves the whole formula table.
#[derive(Default)]
pub(crate) struct FormulaStore {
    locations: Vec<AbsCellKey>,
    entries: Vec<Vec<FormulaSlot>>,
    free_head: Option<FormulaId>,
    // Removed ids stay retired until the graph edit owns their old read sets.
    retired_head: Option<FormulaId>,
    retired_tail: Option<FormulaId>,
    volatile: FormulaBits,
    subtotals: FormulaBits,
}

impl FormulaStore {
    /// Include vacant slots because dense pass state uses the same id span.
    pub(crate) fn slots(&self) -> usize {
        self.locations.len()
    }

    fn slot(&self, id: FormulaId) -> Option<&FormulaSlot> {
        let index = id.index();
        self.entries
            .get(index / SLOT_PAGE_LEN)?
            .get(index % SLOT_PAGE_LEN)
    }

    fn slot_mut(&mut self, id: FormulaId) -> Option<&mut FormulaSlot> {
        let index = id.index();
        self.entries
            .get_mut(index / SLOT_PAGE_LEN)?
            .get_mut(index % SLOT_PAGE_LEN)
    }

    /// Check before a source write so an exhausted id space changes no cell.
    pub(crate) fn can_allocate(&self) -> bool {
        match self.free_head {
            Some(id) => {
                matches!(self.slot(id), Some(FormulaSlot::Vacant(_)))
                    && self.locations.get(id.index()).is_some()
            }
            None => self.locations.len() < NO_FREE_SLOT as usize,
        }
    }

    /// Resolve moved cells without keeping pointers in a pass worklist.
    #[inline]
    pub(crate) fn location(&self, id: FormulaId) -> Option<AbsCellKey> {
        self.locations.get(id.index()).copied()
    }

    /// A vacant id has no source, even before it returns to the free list.
    #[inline]
    pub(crate) fn get(&self, id: FormulaId) -> Option<&FormulaEntry> {
        match self.slot(id)? {
            FormulaSlot::Occupied(entry) => Some(entry),
            FormulaSlot::Vacant(_) => None,
        }
    }

    /// Let source edits update an entry without changing its stable id.
    pub(crate) fn get_mut(&mut self, id: FormulaId) -> Option<&mut FormulaEntry> {
        match self.slot_mut(id)? {
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

    /// Reuse a free slot or grow one page; source writes preflight id capacity.
    #[inline(never)]
    pub(crate) fn allocate(
        &mut self,
        location: AbsCellKey,
        entry: FormulaEntry,
    ) -> Option<FormulaId> {
        let id = if let Some(id) = self.free_head {
            self.reuse_slot_family(id, location, entry)?
        } else {
            self.grow_slot_family(location, entry)?
        };

        // A new or reused slot has no flag bits: retiring a slot clears them.
        if let Some(entry) = self.get(id) {
            let (volatile, subtotal) = (entry.volatile(), entry.calls_subtotal());
            if volatile {
                self.volatile.insert(id);
            }
            if subtotal {
                self.subtotals.insert(id);
            }
        }
        Some(id)
    }

    fn reuse_slot_family(
        &mut self,
        id: FormulaId,
        location: AbsCellKey,
        entry: FormulaEntry,
    ) -> Option<FormulaId> {
        let index = id.index();
        let location_slot = self.locations.get_mut(index)?;
        let entry_slot = self
            .entries
            .get_mut(index / SLOT_PAGE_LEN)?
            .get_mut(index % SLOT_PAGE_LEN)?;
        let FormulaSlot::Vacant(next) = entry_slot else {
            return None;
        };
        self.free_head = (*next != NO_FREE_SLOT).then_some(FormulaId(*next));
        *location_slot = location;
        *entry_slot = FormulaSlot::Occupied(entry);
        Some(id)
    }

    /// Loading grows the store by one slot per new formula.
    #[inline(never)]
    fn grow_slot_family(&mut self, location: AbsCellKey, entry: FormulaEntry) -> Option<FormulaId> {
        let index = self.locations.len();
        let id = u32::try_from(index).ok()?;
        if id == NO_FREE_SLOT {
            return None;
        }

        if index.is_multiple_of(SLOT_PAGE_LEN) {
            if self.entries.capacity() == 0 {
                self.entries.reserve_exact(MIN_SLOT_GROWTH);
            }

            // A small workbook grows its only page entry by entry. A workbook
            // that filled a page reserves each later page once, so loading
            // does not move entries through repeated page growth.
            let capacity = if self.entries.is_empty() {
                MIN_SLOT_GROWTH
            } else {
                SLOT_PAGE_LEN
            };
            self.entries.push(Vec::with_capacity(capacity));
        }

        let page = self.entries.last_mut()?;
        page.push(FormulaSlot::Occupied(entry));
        if index == self.locations.capacity() {
            self.locations
                .reserve_exact(location_capacity_after(index) - index);
        }
        self.locations.push(location);
        Some(FormulaId(id))
    }

    /// Return the old source so the graph can own its previous read set.
    pub(crate) fn replace(&mut self, id: FormulaId, entry: FormulaEntry) -> Option<FormulaEntry> {
        let previous = std::mem::replace(self.slot_mut(id)?, FormulaSlot::Occupied(entry));
        self.track(id);
        match previous {
            FormulaSlot::Occupied(entry) => Some(entry),
            FormulaSlot::Vacant(_) => None,
        }
    }

    /// Delay reuse until pending graph edits own the removed source's reads.
    #[inline(never)]
    pub(crate) fn retire(&mut self, id: FormulaId) -> Option<FormulaEntry> {
        let retired_head = self.retired_head.map_or(NO_FREE_SLOT, |head| head.0);
        let slot = self.slot_mut(id)?;
        if matches!(slot, FormulaSlot::Vacant(_)) {
            return None;
        }
        let previous = std::mem::replace(slot, FormulaSlot::Vacant(retired_head));
        self.track(id);
        self.retired_head = Some(id);
        self.retired_tail.get_or_insert(id);
        match previous {
            FormulaSlot::Occupied(entry) => Some(entry),
            FormulaSlot::Vacant(_) => None,
        }
    }

    /// Join the retired chain to the free chain without a heap worklist.
    pub(crate) fn release_retired(&mut self) {
        let Some(tail) = self.retired_tail else {
            return;
        };
        let free_head = self.free_head.map_or(NO_FREE_SLOT, |head| head.0);
        let Some(FormulaSlot::Vacant(next)) = self.slot_mut(tail) else {
            return;
        };
        *next = free_head;
        self.free_head = self.retired_head.take();
        self.retired_tail = None;
    }

    /// Structural edits move the address while keeping dependency identity.
    pub(crate) fn relocate(&mut self, id: FormulaId, location: AbsCellKey) {
        if let Some(slot) = self.locations.get_mut(id.index()) {
            *slot = location;
        }
    }

    /// Refresh membership after an in-place formula rewrite.
    pub(crate) fn refresh_flags(&mut self, id: FormulaId) {
        self.track(id);
    }

    /// Select edit-barrier seeds without walking the formula syntax tree.
    pub(crate) fn is_volatile(&self, id: FormulaId) -> bool {
        self.volatile.contains(id)
    }

    /// Select hidden-row dependents without scanning unrelated formulas.
    pub(crate) fn is_subtotal(&self, id: FormulaId) -> bool {
        self.subtotals.contains(id)
    }

    /// Enumerate volatile sources on one sheet for the edit barrier.
    pub(crate) fn volatile_keys(&self, sheet: Option<u32>) -> impl Iterator<Item = CellKey> + '_ {
        FormulaFlagKeys {
            ids: self.volatile.ids(),
            locations: &self.locations,
            sheet,
        }
    }

    /// Enumerate SUBTOTAL sources when row visibility changes.
    pub(crate) fn subtotal_keys(&self, sheet: Option<u32>) -> impl Iterator<Item = CellKey> + '_ {
        FormulaFlagKeys {
            ids: self.subtotals.ids(),
            locations: &self.locations,
            sheet,
        }
    }

    /// Include page tables and vacant capacity in the formula owner's bytes.
    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let formulas = stats.owner_mut(FORMULAS);
        formulas.add_vec::<AbsCellKey>(self.locations.len(), self.locations.capacity());
        formulas.add_vec::<Vec<FormulaSlot>>(self.entries.len(), self.entries.capacity());
        self.volatile.add_memory_stats(formulas);
        self.subtotals.add_memory_stats(formulas);
        for page in &self.entries {
            formulas.add_vec::<FormulaSlot>(page.len(), page.capacity());
            for slot in page {
                if let FormulaSlot::Occupied(entry) = slot {
                    entry.heap_memory_stats(formulas);
                }
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
    /// Select formula addresses; the dirty walk expands literal source seeds.
    pub(crate) fn select(&mut self, sheets: &[crate::sheet::SheetData], key: AbsCellKey) {
        if let Some(id) = sheets
            .get(key.sheet as usize)
            .and_then(|sheet| sheet.formulas.id(key.local()))
        {
            self.insert(id);
        }
    }

    /// Keep selection and queue insertion as one operation.
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

    /// References can test whether a formula belongs to this pass.
    #[inline]
    pub(crate) fn contains(&self, id: FormulaId) -> bool {
        self.bits.contains(id)
    }

    /// Count selected formulas for result reservation and seeded-error passes.
    pub(crate) fn len(&self) -> usize {
        self.ids.len()
    }

    /// Empty selection lets unrelated edits skip evaluation.
    pub(crate) fn is_empty(&self) -> bool {
        self.ids.is_empty()
    }

    /// Queue cursors remain valid while new readers append to the worklist.
    pub(crate) fn id_at(&self, offset: usize) -> Option<FormulaId> {
        self.ids.get(offset).copied()
    }

    /// Visit selected ids without a coordinate-to-id lookup.
    pub(crate) fn ids(&self) -> impl Iterator<Item = FormulaId> + '_ {
        self.ids.iter().copied()
    }

    /// Translate addresses only for operations that still use coordinates.
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

        // Wide passes must not pin their queue; small edits reuse one id page.
        if self.ids.capacity() > SLOT_PAGE_LEN {
            self.ids = Vec::new();
        }
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
    /// Active calls are separate from results so back edges do not recurse.
    pub(crate) visiting: FormulaBits,
}

impl FormulaResults {
    /// Reuse cleared work storage, never values from a previous pass.
    pub(crate) fn take_work(&mut self) -> FormulaWork {
        std::mem::take(&mut self.work)
    }

    /// Reserve values for selected ids, not for every formula in the workbook.
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

    /// Read only values calculated or seeded during the current pass.
    #[inline]
    pub(crate) fn get(&self, id: FormulaId) -> Option<&EvalResult> {
        self.values.get(self.position(id)?).and_then(Option::as_ref)
    }

    /// Iterative calculation updates a result without another allocation.
    pub(crate) fn get_mut(&mut self, id: FormulaId) -> Option<&mut EvalResult> {
        let position = self.position(id)?;
        self.values.get_mut(position).and_then(Option::as_mut)
    }

    /// A re-evaluated spill keeps its existing indexed result position.
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

    /// Consume write-back output without losing the id's pass position.
    pub(crate) fn remove(&mut self, id: FormulaId) -> Option<EvalResult> {
        let position = self.position(id)?;
        let value = self.values.get_mut(position)?.take()?;
        self.count -= 1;
        Some(value)
    }

    /// A fully seeded error pass can skip evaluator dispatch.
    pub(crate) fn len(&self) -> usize {
        self.count
    }

    /// Clear touched positions so a small edit does not scan all slots.
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

    /// Release wide result buffers before saving the cleared primary work space.
    pub(crate) fn finish(&mut self, mut work: FormulaWork) {
        self.clear();

        // Small edits reuse one page of empty buffers instead of two
        // allocations per pass; wide passes must not pin their size.
        if self.values.capacity() > SLOT_PAGE_LEN {
            self.values = Vec::new();
        }
        if self.used.capacity() > SLOT_PAGE_LEN {
            self.used = Vec::new();
        }

        // Reuse primary pass storage, never formula values or selected ids.
        work.clear();
        self.work = work;
    }

    /// Count buffers here; the store accounts for this workspace's boxed header.
    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let formulas = stats.owner_mut(FORMULAS);
        formulas.add_vec::<u32>(self.positions.len(), self.positions.capacity());
        formulas.add_vec::<Option<EvalResult>>(self.values.len(), self.values.capacity());
        formulas.add_vec::<FormulaId>(self.used.len(), self.used.capacity());
        self.visiting.add_memory_stats(formulas);
        self.work.add_memory_stats(formulas);
    }
}
