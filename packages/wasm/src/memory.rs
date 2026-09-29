//! Versioned, non-overlapping logical/capacity accounting for store-owned WASM data.
//!
//! Vector capacities are exact (`capacity * size_of::<T>()`). Hash-table bytes use
//! the stable v1 estimate `(key + value + one control byte) * reported capacity`;
//! allocator headers, alignment, and implementation-private group padding remain
//! outside the logical store contract and are reported by the host as allocator
//! margin rather than invented from `size_of_val`.

pub(crate) const STORE_MEMORY_SCHEMA_VERSION: u32 = 3;
pub(crate) const HASH_TABLE_ESTIMATE_VERSION: u32 = 1;
pub(crate) const STORE_MEMORY_OWNER_COUNT: usize = 19;

pub(crate) const DENSE_KINDS: usize = 0;
pub(crate) const DENSE_PAYLOADS: usize = 1;
pub(crate) const DENSE_STYLES: usize = 2;
pub(crate) const PAGED_KINDS: usize = 3;
pub(crate) const PAGED_PAYLOADS: usize = 4;
pub(crate) const PAGED_STYLES: usize = 5;
pub(crate) const PAGED_LOADED_BITMAPS: usize = 6;
pub(crate) const PAGED_DIRTY_BITMAPS: usize = 7;
pub(crate) const PAGED_INDEXES: usize = 8;
pub(crate) const STRING_POOL_UTF8: usize = 9;
pub(crate) const STRING_POOL_SPANS: usize = 10;
pub(crate) const STRING_INDEX: usize = 11;
pub(crate) const FORMULAS: usize = 12;
pub(crate) const DEPENDENCY_NODES: usize = 13;
pub(crate) const DEPENDENCY_EDGES: usize = 14;
pub(crate) const SHEET_INDEXES_METADATA: usize = 15;
pub(crate) const SPILL_RANGES: usize = 16;
pub(crate) const SPILL_OWNERS: usize = 17;
pub(crate) const SPILL_BLOCKERS: usize = 18;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct MemoryOwnerStats {
    pub(crate) logical_bytes: usize,
    pub(crate) allocated_bytes: usize,
    pub(crate) entries: usize,
}

impl MemoryOwnerStats {
    pub(crate) fn add(&mut self, other: Self) {
        self.logical_bytes = self.logical_bytes.saturating_add(other.logical_bytes);
        self.allocated_bytes = self.allocated_bytes.saturating_add(other.allocated_bytes);
        self.entries = self.entries.saturating_add(other.entries);
    }

    pub(crate) fn add_vec<T>(&mut self, len: usize, capacity: usize) {
        self.logical_bytes = self
            .logical_bytes
            .saturating_add(len.saturating_mul(std::mem::size_of::<T>()));
        self.allocated_bytes = self
            .allocated_bytes
            .saturating_add(capacity.saturating_mul(std::mem::size_of::<T>()));
        self.entries = self.entries.saturating_add(len);
    }

    pub(crate) fn add_hash_table<K, V>(&mut self, len: usize, capacity: usize) {
        let bucket_bytes = std::mem::size_of::<K>()
            .saturating_add(std::mem::size_of::<V>())
            .saturating_add(1);
        self.logical_bytes = self
            .logical_bytes
            .saturating_add(len.saturating_mul(bucket_bytes));
        self.allocated_bytes = self
            .allocated_bytes
            .saturating_add(capacity.saturating_mul(bucket_bytes));
        self.entries = self.entries.saturating_add(len);
    }

    pub(crate) fn add_payload(&mut self, logical_bytes: usize, allocated_bytes: usize) {
        self.logical_bytes = self.logical_bytes.saturating_add(logical_bytes);
        self.allocated_bytes = self.allocated_bytes.saturating_add(allocated_bytes);
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct StoreMemoryStats {
    pub(crate) owners: [MemoryOwnerStats; STORE_MEMORY_OWNER_COUNT],
}

impl Default for StoreMemoryStats {
    fn default() -> Self {
        Self {
            owners: [MemoryOwnerStats::default(); STORE_MEMORY_OWNER_COUNT],
        }
    }
}

impl StoreMemoryStats {
    pub(crate) fn owner_mut(&mut self, owner: usize) -> &mut MemoryOwnerStats {
        &mut self.owners[owner]
    }

    pub(crate) fn logical_bytes(&self) -> usize {
        self.owners.iter().fold(0usize, |total, owner| {
            total.saturating_add(owner.logical_bytes)
        })
    }

    pub(crate) fn allocated_bytes(&self) -> usize {
        self.owners.iter().fold(0usize, |total, owner| {
            total.saturating_add(owner.allocated_bytes)
        })
    }

    /// Flat protocol consumed by `packages/core/src/resource-accounting.ts`:
    /// `[schema, ownerCount, hashEstimateVersion, owner(logical, allocated, entries)*, totals]`.
    pub(crate) fn encode(&self) -> Vec<f64> {
        let mut encoded = Vec::with_capacity(5 + STORE_MEMORY_OWNER_COUNT * 3);
        encoded.push(STORE_MEMORY_SCHEMA_VERSION as f64);
        encoded.push(STORE_MEMORY_OWNER_COUNT as f64);
        encoded.push(HASH_TABLE_ESTIMATE_VERSION as f64);
        for owner in &self.owners {
            encoded.push(owner.logical_bytes as f64);
            encoded.push(owner.allocated_bytes as f64);
            encoded.push(owner.entries as f64);
        }
        encoded.push(self.logical_bytes() as f64);
        encoded.push(self.allocated_bytes() as f64);
        encoded
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CellStore;

    fn owner(encoded: &[f64], index: usize) -> (usize, usize, usize) {
        let at = 3 + index * 3;
        (
            encoded[at] as usize,
            encoded[at + 1] as usize,
            encoded[at + 2] as usize,
        )
    }

    #[test]
    fn encoded_totals_are_non_overlapping_sums() {
        let mut stats = StoreMemoryStats::default();
        stats.owner_mut(DENSE_KINDS).add_payload(3, 4);
        stats.owner_mut(DENSE_PAYLOADS).add_payload(8, 16);
        let encoded = stats.encode();
        assert_eq!(encoded.len(), 5 + STORE_MEMORY_OWNER_COUNT * 3);
        assert_eq!(encoded[encoded.len() - 2], 11.0);
        assert_eq!(encoded[encoded.len() - 1], 20.0);
    }

    #[test]
    fn bulk_string_compaction_releases_only_admitted_owner_slack() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(1, 3_000);
        for row in 0..3_000 {
            store.set_string(sheet, row, 0, &format!("unique-string-{row:04}"), 0);
        }
        let before = store.memory_stats();
        store.compact_string_storage();
        let after = store.memory_stats();
        for index in 0..STORE_MEMORY_OWNER_COUNT {
            assert_eq!(
                owner(&after, index).0,
                owner(&before, index).0,
                "owner {index} logical bytes changed during compaction"
            );
            assert!(owner(&after, index).1 <= owner(&before, index).1);
        }
        assert!(
            owner(&after, STRING_POOL_UTF8).1 < owner(&before, STRING_POOL_UTF8).1
                || owner(&after, STRING_POOL_SPANS).1 < owner(&before, STRING_POOL_SPANS).1
                || owner(&after, STRING_INDEX).1 < owner(&before, STRING_INDEX).1
        );
        assert_eq!(
            store.get_cell(sheet, 2_999, 0).string().as_deref(),
            Some("unique-string-2999")
        );
    }

    #[test]
    fn spill_anchors_owners_and_blockers_have_disjoint_capacity_owners() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, 3);
        for row in 0..3 {
            store.set_number(sheet, row, 0, (row + 1) as f64, 0);
        }
        store.set_formula(sheet, 0, 1, "=A1:A3", 0);
        store.recompute(sheet);
        let materialized = store.memory_stats();
        assert_eq!(owner(&materialized, SPILL_RANGES).2, 1);
        assert_eq!(owner(&materialized, SPILL_OWNERS).2, 3);
        assert_eq!(owner(&materialized, SPILL_BLOCKERS).2, 0);

        assert!(store.set_spill_blockers(sheet, &[1, 1, 1, 1]));
        store.recompute(sheet);
        let blocked = store.memory_stats();
        assert_eq!(owner(&blocked, SPILL_RANGES).2, 1);
        assert_eq!(owner(&blocked, SPILL_OWNERS).2, 0);
        assert_eq!(owner(&blocked, SPILL_BLOCKERS).2, 1);
    }

    #[test]
    fn formula_and_paged_fixtures_name_their_own_structures() {
        let mut formulas = CellStore::new();
        let sheet = formulas.add_sheet(1, 2);
        formulas.set_number(sheet, 0, 0, 1.0, 0);
        formulas.set_formula(sheet, 1, 0, "=A1+1", 0);
        formulas.recompute(sheet);
        let formula_stats = formulas.memory_stats();
        assert!(owner(&formula_stats, FORMULAS).0 > 0);
        assert!(owner(&formula_stats, DEPENDENCY_NODES).2 > 0);
        assert!(owner(&formula_stats, DEPENDENCY_EDGES).2 > 0);

        let mut paged = CellStore::new();
        let sheet = paged.add_paged_sheet(1, 100, 4, 4096, 1_000_000);
        paged.begin_page_load();
        paged.set_number(sheet, 0, 0, 2.0, 0);
        paged.end_page_load();
        let paged_stats = paged.memory_stats();
        assert_eq!(owner(&paged_stats, PAGED_KINDS).2, 4);
        assert_eq!(owner(&paged_stats, PAGED_PAYLOADS).2, 4);
        assert_eq!(owner(&paged_stats, PAGED_STYLES).2, 4);
        assert_eq!(owner(&paged_stats, PAGED_LOADED_BITMAPS).2, 1);
        assert_eq!(owner(&paged_stats, PAGED_DIRTY_BITMAPS).2, 0);
    }
}
