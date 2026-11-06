//! Workbook-owned formula entries. Cell addresses locate slots; graph walks use ids.

use crate::memory::{StoreMemoryStats, FORMULAS};
use crate::types::{AbsCellKey, CellKey, CellRange, EvalResult, FormulaEntry, FormulaError};

const NO_FREE_SLOT: u32 = u32::MAX;
const BITS_PER_WORD: usize = u64::BITS as usize;
/// Pass order entries kept between passes: 16 KB, enough for the formulas
/// a typical edit reaches, so those passes allocate no order list.
const RETAINED_ORDER_CAPACITY: usize = 4096;
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

    /// Clears every bit in one pass over the words, keeping their storage.
    pub(crate) fn clear_all(&mut self) {
        if self.count != 0 {
            self.words.fill(0);
            self.count = 0;
        }
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

    /// Whether any formula calls a volatile function, including the runtime
    /// references `OFFSET` and `INDIRECT`.
    pub(crate) fn has_volatile(&self) -> bool {
        !self.volatile.is_empty()
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

/// Pass-scoped evaluation state. Results are not kept here: the pass writes
/// each formula's result to its cell and marks it settled, and readers read
/// it from storage. A formula that a runtime reference (`OFFSET`,
/// `INDIRECT`) or a runtime cycle pulls in the middle of another formula's
/// evaluation cannot be written from there, so its result waits in `pulled`
/// until the pass writes it after that formula.
#[derive(Default)]
pub(crate) struct FormulaResults {
    /// Formulas whose result this pass has written to storage.
    settled: FormulaBits,
    /// Results not yet written, at most the formulas pulled during one
    /// top-level evaluation plus the errors the depth walk seeded.
    pulled: Vec<(FormulaId, EvalResult)>,
    pulled_bits: FormulaBits,
    /// Formulas in dependency order, from the depth walk.
    pub(crate) order: Vec<FormulaId>,
    /// Depth and cycle errors the walk found, written before evaluation.
    pub(crate) seeded: Vec<(FormulaId, FormulaError)>,
    /// Whether the depth walk ran and `order` lists the pass.
    pub(crate) ordered: bool,
    work: FormulaWork,
    /// Active calls are separate from results so back edges do not recurse.
    pub(crate) visiting: FormulaBits,
    range_sums: RangeSums,
    lookups: crate::eval::LookupStates,
    /// Boxed, so the pass workspace the store keeps between passes grows by
    /// one pointer, not by the whole table.
    #[cfg(feature = "analysis")]
    regexes: Option<Box<PassRegexes>>,
}

/// Compiled regex programs one pass keeps at once. Formulas that alternate
/// between a few patterns still share their programs, while a pass holds at
/// most this many of them.
#[cfg(feature = "analysis")]
const PASS_REGEX_CAPACITY: usize = 4;

/// The regex patterns this pass compiled, with their case modes. A new
/// pattern replaces the oldest entry; the whole table is dropped when the
/// pass ends.
#[cfg(feature = "analysis")]
#[derive(Default)]
struct PassRegexes {
    entries: [Option<PassRegex>; PASS_REGEX_CAPACITY],
    /// The entry the next new pattern replaces.
    next: usize,
}

#[cfg(feature = "analysis")]
struct PassRegex {
    pattern: String,
    insensitive: bool,
    regex: std::rc::Rc<regex_lite::Regex>,
}

/// The sums of single-range `SUM` formulas in one pass, by range group id.
/// Formulas over the same literal-only range read one ordered scan, so each
/// gets the same additions in the same order. A range with formula or spill
/// cells is not kept: its values can change within the pass.
///
/// `slots` maps a group to its entry and is valid only where `sums` holds that
/// group, so a pass clears only `sums`.
#[derive(Default)]
struct RangeSums {
    slots: Vec<u32>,
    sums: Vec<(u32, Result<f64, FormulaError>)>,
    /// The range of the last shared sum read or stored. Readers of one range
    /// usually evaluate in a row, so they skip the group lookup.
    last: Option<(CellRange, Result<f64, FormulaError>)>,
}

impl RangeSums {
    fn get(&self, group: usize) -> Option<Result<f64, FormulaError>> {
        let slot = *self.slots.get(group)? as usize;
        self.sums
            .get(slot)
            .filter(|&&(stored, _)| stored as usize == group)
            .map(|&(_, sum)| sum)
    }

    fn insert(&mut self, group: usize, groups: usize, sum: Result<f64, FormulaError>) {
        if self.slots.len() != groups {
            self.slots.resize(groups, 0);
            self.slots.shrink_to_fit();
        }
        let Some(slot) = self.slots.get_mut(group) else {
            return;
        };
        *slot = self.sums.len() as u32;
        self.sums.push((group as u32, sum));
    }
}

impl FormulaResults {
    /// Reuse cleared work storage, never values from a previous pass.
    pub(crate) fn take_work(&mut self) -> FormulaWork {
        std::mem::take(&mut self.work)
    }

    /// Whether this pass has a result for `id`, stored or pulled.
    #[inline]
    pub(crate) fn has(&self, id: FormulaId) -> bool {
        self.settled.contains(id) || self.pulled_bits.contains(id)
    }

    /// Whether `id`'s result for this pass is in storage.
    #[inline]
    pub(crate) fn is_settled(&self, id: FormulaId) -> bool {
        self.settled.contains(id)
    }

    /// Records that `id`'s result for this pass is in storage.
    #[inline]
    pub(crate) fn settle(&mut self, id: FormulaId) {
        self.settled.insert(id);
    }

    /// Forgets `id`'s result for this pass, so it is evaluated again.
    pub(crate) fn unsettle(&mut self, id: FormulaId) {
        self.settled.remove(id);
        if self.pulled_bits.remove(id) {
            self.pulled.retain(|&(pulled, _)| pulled != id);
        }
    }

    /// A result waiting to be written. The list is short, so it is searched
    /// from its newest entry.
    #[inline]
    pub(crate) fn pulled(&self, id: FormulaId) -> Option<&EvalResult> {
        if !self.pulled_bits.contains(id) {
            return None;
        }
        self.pulled
            .iter()
            .rev()
            .find(|&&(pulled, _)| pulled == id)
            .map(|(_, value)| value)
    }

    /// Iterative calculation updates a pulled result in place.
    pub(crate) fn pulled_mut(&mut self, id: FormulaId) -> Option<&mut EvalResult> {
        if !self.pulled_bits.contains(id) {
            return None;
        }
        self.pulled
            .iter_mut()
            .rev()
            .find(|(pulled, _)| *pulled == id)
            .map(|(_, value)| value)
    }

    /// Keeps `id`'s result until the pass writes it to storage. Only runtime
    /// pulls, iteration and spill anchors use it, so it stays out of line.
    #[inline(never)]
    pub(crate) fn pull(&mut self, id: FormulaId, value: EvalResult) {
        self.settled.remove(id);
        if self.pulled_bits.insert(id) {
            self.pulled.push((id, value));
        } else if let Some(current) = self.pulled_mut(id) {
            *current = value;
        }
    }

    /// The oldest waiting result, which the pass writes next.
    pub(crate) fn pop_pulled(&mut self) -> Option<(FormulaId, EvalResult)> {
        if self.pulled.is_empty() {
            return None;
        }
        let (id, value) = self.pulled.swap_remove(0);
        self.pulled_bits.remove(id);
        Some((id, value))
    }

    /// Whether any result waits to be written.
    #[inline]
    pub(crate) fn has_pulled(&self) -> bool {
        !self.pulled.is_empty()
    }

    /// The error the depth walk seeded for `id`, as its pass result.
    #[cfg(test)]
    pub(crate) fn seeded_result(&self, id: FormulaId) -> Option<EvalResult> {
        self.seeded
            .iter()
            .find(|&&(seeded, _)| seeded == id)
            .map(|&(_, error)| crate::types::Value::Error(error))
    }

    /// The shared sum of `range` when it was the last range shared.
    #[inline]
    pub(crate) fn last_range_sum(&self, range: CellRange) -> Option<Result<f64, FormulaError>> {
        self.range_sums
            .last
            .filter(|&(last, _)| last == range)
            .map(|(_, sum)| sum)
    }

    /// The shared sum of range group `group` in this pass, which becomes the
    /// last shared range.
    pub(crate) fn range_sum(
        &mut self,
        range: CellRange,
        group: usize,
    ) -> Option<Result<f64, FormulaError>> {
        let sum = self.range_sums.get(group)?;
        self.range_sums.last = Some((range, sum));
        Some(sum)
    }

    /// Shares the sum of a literal-only range group for the rest of the pass;
    /// `groups` is the index's group count.
    pub(crate) fn share_range_sum(
        &mut self,
        range: CellRange,
        group: usize,
        groups: usize,
        sum: Result<f64, FormulaError>,
    ) {
        self.range_sums.insert(group, groups, sum);
        self.range_sums.last = Some((range, sum));
    }

    /// The search states of lookup ranges in this pass.
    pub(crate) fn lookup_states(&mut self) -> &mut crate::eval::LookupStates {
        &mut self.lookups
    }

    /// The program this pass compiled for exactly `pattern` in this case mode.
    #[cfg(feature = "analysis")]
    pub(crate) fn pass_regex(
        &self,
        pattern: &str,
        insensitive: bool,
    ) -> Option<std::rc::Rc<regex_lite::Regex>> {
        self.regexes
            .as_ref()?
            .entries
            .iter()
            .flatten()
            .find(|entry| entry.insensitive == insensitive && entry.pattern == pattern)
            .map(|entry| std::rc::Rc::clone(&entry.regex))
    }

    /// Keeps `regex` for later formulas of this pass that use the same
    /// pattern, in place of the oldest program when the table is full.
    #[cfg(feature = "analysis")]
    pub(crate) fn share_regex(
        &mut self,
        pattern: &str,
        insensitive: bool,
        regex: std::rc::Rc<regex_lite::Regex>,
    ) {
        let table = self.regexes.get_or_insert_with(Box::default);
        table.entries[table.next] = Some(PassRegex {
            pattern: pattern.to_owned(),
            insensitive,
            regex,
        });
        table.next = (table.next + 1) % PASS_REGEX_CAPACITY;
    }

    /// Exchanges this workspace's regex programs with `other`'s. A nested
    /// evaluation with its own workspace borrows the pass programs this way
    /// and gives them back when it ends.
    #[cfg(feature = "analysis")]
    pub(crate) fn swap_regexes(&mut self, other: &mut FormulaResults) {
        std::mem::swap(&mut self.regexes, &mut other.regexes);
    }

    /// Clears this pass's pulled results and any bits left set. A finished
    /// pass has already cleared its own settled bits, so a small edit does
    /// not touch every word.
    #[inline(never)]
    pub(crate) fn clear(&mut self) {
        for &(id, _) in &self.pulled {
            self.pulled_bits.remove(id);
        }
        self.pulled.clear();
        self.settled.clear_all();
        self.visiting.clear_all();
        self.pulled_bits.clear_all();
        self.order.clear();
        self.seeded.clear();
        self.ordered = false;
        self.range_sums.sums.clear();
        self.range_sums.last = None;
        self.lookups.clear();
        #[cfg(feature = "analysis")]
        {
            self.regexes = None;
        }
    }

    /// Release wide result buffers before saving the cleared primary work space.
    pub(crate) fn finish(&mut self, mut work: FormulaWork) {
        // Settled formulas are selected ones, so the selection clears them.
        for id in work.ids() {
            self.settled.remove(id);
        }
        self.clear();

        // Small edits reuse one page of empty buffers instead of two
        // allocations per pass; wide passes must not pin their size.
        if self.pulled.capacity() > SLOT_PAGE_LEN {
            self.pulled = Vec::new();
        }
        // A medium pass reuses its order list; a wide one must not pin it.
        if self.order.capacity() > RETAINED_ORDER_CAPACITY {
            self.order = Vec::new();
        }
        if self.seeded.capacity() > SLOT_PAGE_LEN {
            self.seeded = Vec::new();
        }
        if self.range_sums.sums.capacity() > SLOT_PAGE_LEN {
            self.range_sums.sums = Vec::new();
        }
        self.lookups.release();

        // Reuse primary pass storage, never formula values or selected ids.
        work.clear();
        self.work = work;
    }

    /// Count buffers here; the store accounts for this workspace's boxed header.
    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let formulas = stats.owner_mut(FORMULAS);
        self.settled.add_memory_stats(formulas);
        self.pulled_bits.add_memory_stats(formulas);
        formulas.add_vec::<(FormulaId, EvalResult)>(self.pulled.len(), self.pulled.capacity());
        formulas.add_vec::<FormulaId>(self.order.len(), self.order.capacity());
        formulas.add_vec::<(FormulaId, FormulaError)>(self.seeded.len(), self.seeded.capacity());
        self.visiting.add_memory_stats(formulas);
        self.work.add_memory_stats(formulas);
        self.lookups.add_memory_stats(formulas);
        formulas.add_vec::<u32>(
            self.range_sums.slots.len(),
            self.range_sums.slots.capacity(),
        );
        formulas.add_vec::<(u32, Result<f64, FormulaError>)>(
            self.range_sums.sums.len(),
            self.range_sums.sums.capacity(),
        );
    }
}
