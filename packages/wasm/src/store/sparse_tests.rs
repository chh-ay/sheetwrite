//! Sparse writes preserve scalar source replacement and paged admission rules.

use super::*;

#[derive(Clone, Copy, Debug)]
enum Storage {
    Dense,
    Paged,
    Spill,
}

fn fixture(storage: Storage) -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = match storage {
        Storage::Dense | Storage::Spill => store.add_sheet(9, 21),
        Storage::Paged => store.add_paged_sheet(9, 21, 4, 1_000_000, 1_000),
    };
    store.set_number(sheet, 2, 1, -19.0, 8);
    store.set_formula(sheet, 3, 2, "=1/0", 9);
    store.set_formula(sheet, 20, 8, "=SUM(B3:H19)", 10);
    if matches!(storage, Storage::Spill) {
        store.set_formula(sheet, 5, 4, "=SEQUENCE(3)", 11);
    }
    store.commit_sources();
    (store, sheet)
}

fn assert_same_cells(left: &CellStore, right: &CellStore, sheet: usize) {
    for row in 0..21 {
        for col in 0..9 {
            let actual = left.get_cell(sheet, row, col);
            let expected = right.get_cell(sheet, row, col);
            assert_eq!(actual.kind(), expected.kind(), "kind at {row},{col}");
            assert_eq!(actual.num().to_bits(), expected.num().to_bits(), "number at {row},{col}");
            assert_eq!(actual.string(), expected.string(), "text at {row},{col}");
            assert_eq!(actual.style(), expected.style(), "style at {row},{col}");
            assert_eq!(left.formula_source(sheet, row, col), right.formula_source(sheet, row, col));
            assert_eq!(left.reference_target(sheet, row, col), right.reference_target(sheet, row, col));
            assert_eq!(left.cell_state(sheet, row, col), right.cell_state(sheet, row, col));
        }
    }
}

struct GeneratedBlock {
    offsets: Vec<u32>,
    kinds: Vec<u8>,
    numbers: Vec<f64>,
    styles: Vec<u32>,
    text: String,
    text_offsets: Vec<u32>,
}

impl GeneratedBlock {
    fn new(seed: u32) -> Self {
        // Multiplication by a coprime permutes 119 offsets, including both
        // sides of a bitset-word boundary and nonzero block origins.
        let offsets: Vec<u32> = (0..119)
            .map(|index| (index * 37 + seed) % 119)
            .filter(|offset| seed == 0 || (offset + seed) % 3 != 0)
            .collect();
        let mut block = Self {
            offsets, kinds: Vec::new(), numbers: Vec::new(), styles: Vec::new(),
            text: String::new(), text_offsets: vec![0],
        };
        for &offset in &block.offsets {
            let kind = match (offset + seed) % 5 {
                0 => KIND_NUMBER,
                1 => KIND_STRING,
                2 => KIND_BOOL,
                3 => KIND_EMPTY,
                _ => KIND_FORMULA, // Without a source, this clears the cell.
            };
            block.kinds.push(kind);
            block.numbers.push(if kind == KIND_BOOL {
                f64::from(offset % 2 != 0)
            } else if offset % 2 == 0 {
                -0.0
            } else {
                f64::from(offset) / 3.0
            });
            block.styles.push(offset + 1);
            if kind == KIND_STRING {
                block.text.push_str(if offset % 2 == 0 { "hé雪😀" } else { "" });
                block.text_offsets.push(block.text.len() as u32);
            }
        }
        block
    }

    fn write(&self, store: &mut CellStore, sheet: usize) -> u32 {
        store.set_sparse_block(
            sheet, 2, 1, 17, 7, &self.offsets, &self.kinds, &self.numbers,
            self.text.as_bytes(), &self.text_offsets, &self.styles,
            &[], Vec::new(), &[], &[],
        )
    }
}

#[test]
fn sparse_columns_match_old_source_replacement_over_generated_blocks() {
    for storage in [Storage::Dense, Storage::Paged, Storage::Spill] {
        for hydrating in [false, true] {
            for seed in 0..8u32 {
                let (mut columns, sheet) = fixture(storage);
                let (mut scalar, _) = fixture(storage);
                let block = GeneratedBlock::new(seed);
                if hydrating {
                    columns.begin_page_load();
                    scalar.begin_page_load();
                }
                let actual = block.write(&mut columns, sheet);
                SPARSE_COLUMNS_OFF.set(true);
                let expected = block.write(&mut scalar, sheet);
                SPARSE_COLUMNS_OFF.set(false);
                assert_eq!(actual, BLOCK_OK, "{storage:?}, hydration={hydrating}, seed={seed}");
                assert_eq!(actual, expected);
                columns.commit_sources();
                scalar.commit_sources();
                assert_same_cells(&columns, &scalar, sheet);
                // Revisit dependencies after retiring covered formula sources.
                columns.set_number(sheet, 2, 1, 42.0, 0);
                scalar.set_number(sheet, 2, 1, 42.0, 0);
                columns.commit_sources();
                scalar.commit_sources();
                assert_same_cells(&columns, &scalar, sheet);
            }
        }
    }
}

#[test]
fn sparse_invalid_offsets_reject_the_entire_dense_write() {
    for offsets in [&[0, 64, 0][..], &[0, 64, 70][..]] {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(7, 10);
        store.set_number(sheet, 0, 0, 7.0, 3);
        assert_eq!(store.set_sparse_block(
            sheet, 0, 0, 10, 7, offsets, &[KIND_NUMBER; 3], &[99.0; 3],
            &[], &[0], &[8; 3], &[], Vec::new(), &[], &[],
        ), BLOCK_INVALID);
        let retained = store.get_cell(sheet, 0, 0);
        assert_eq!(retained.num(), 7.0);
        assert_eq!(retained.style(), 3);
        assert_eq!(store.get_cell(sheet, 9, 1).kind(), KIND_EMPTY);
    }
}

#[test]
fn sparse_paged_preflight_rejects_without_overwriting_existing_edits() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(1, 3, 4, 1_000_000, 1);
    store.set_number(sheet, 0, 0, 7.0, 3);
    assert_eq!(store.set_sparse_block(
        sheet, 0, 0, 3, 1, &[0, 1], &[KIND_NUMBER; 2], &[99.0; 2],
        &[], &[0], &[8; 2], &[], Vec::new(), &[], &[],
    ), BLOCK_RESOURCE_LIMIT);
    assert_eq!(store.get_cell(sheet, 0, 0).num(), 7.0);
    assert_eq!(store.get_cell(sheet, 0, 0).style(), 3);
    assert_eq!(store.cell_state(sheet, 1, 0), 0);
    assert_eq!(store.paged_stats(sheet)[2], 1.0);
}

#[test]
fn sparse_page_load_skips_dirty_sources_and_keeps_mixed_entry_sources() {
    let mut store = CellStore::new();
    let sheet = store.add_paged_sheet(2, 4, 4, 1_000_000, 16);
    store.set_formula(sheet, 0, 0, "=17", 5);
    store.begin_page_load();
    assert_eq!(store.set_sparse_block(
        sheet, 0, 0, 4, 2, &[0, 1, 2, 3, 4],
        &[KIND_NUMBER, KIND_NUMBER, KIND_EMPTY, KIND_EMPTY, KIND_STRING],
        &[99.0, 6.0, 0.0, 0.0, 0.0], "雪".as_bytes(), &[0, 3], &[9; 5],
        &[2], vec!["=B1*2".into()], &[3], &[sheet as u32, 1, 0],
    ), BLOCK_OK);
    store.commit_sources();
    assert_eq!(store.formula_source(sheet, 0, 0).as_deref(), Some("=17"));
    assert_eq!(store.get_cell(sheet, 0, 0).num(), 17.0);
    assert_eq!(store.get_cell(sheet, 0, 0).style(), 5);
    assert_eq!(store.formula_source(sheet, 1, 0).as_deref(), Some("=B1*2"));
    assert_eq!(store.reference_target(sheet, 1, 1), Some(vec![sheet as u32, 1, 0]));
    assert_eq!(store.get_cell(sheet, 1, 0).num(), 12.0);
    assert_eq!(store.get_cell(sheet, 1, 1).num(), 12.0);
    assert_eq!(store.get_cell(sheet, 2, 0).string().as_deref(), Some("雪"));
}
