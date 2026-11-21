//! Fixtures shared by the engine tests and by unit tests elsewhere in the
//! crate that need loaded data.

use super::*;

/// Load numeric fixture data through the retained packed column writer.
pub(crate) fn write_number_column(
    store: &mut CellStore,
    sheet: usize,
    col: usize,
    row: usize,
    values: &[f64],
) {
    assert_eq!(
        store.set_column_block_packed(
            sheet,
            row,
            col,
            values.len(),
            1,
            &vec![KIND_NUMBER; values.len()],
            values,
            &[],
            &[0],
            &vec![0; values.len()],
            &[],
            Vec::new(),
            &[],
            &[],
        ),
        crate::store::BLOCK_OK,
        "numeric fixture column must load",
    );
}

pub(crate) fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1e-9,
        "expected {expected}, got {actual}"
    );
}

pub(crate) fn number(store: &CellStore, sheet: usize, row: usize, col: usize) -> f64 {
    store.get_cell(sheet, row, col).num()
}

pub(crate) fn string(store: &CellStore, sheet: usize, row: usize, col: usize) -> Option<String> {
    store.get_cell(sheet, row, col).string()
}

pub(super) struct DecodedWindow {
    pub(super) kinds: Vec<u8>,
    pub(super) string_index: Vec<i32>,
    pub(super) style_index: Vec<u32>,
    pub(super) style_dict: Vec<u32>,
    pub(super) cond_matches: Vec<u32>,
    pub(super) strings: Vec<String>,
}

pub(super) fn decode_window(mut view: WindowView) -> DecodedWindow {
    let packed = view.take_packed();
    assert!(
        packed.len() >= 40,
        "the packed window holds its 40-byte header"
    );
    let word = |index: usize| {
        u32::from_le_bytes(
            packed[index * 4..index * 4 + 4]
                .try_into()
                .expect("complete packed header word"),
        )
    };
    assert_eq!(word(0), 0x3157_4e53, "the packed window magic");
    assert_eq!(word(1), 1, "the packed window version");
    assert_eq!(word(2), 40, "the packed window header length");
    assert_eq!(
        word(3) as usize,
        packed.len(),
        "the packed window total length"
    );
    let rows = word(4) as usize;
    let cols = word(5) as usize;
    let cells = word(6) as usize;
    let styles = word(7) as usize;
    let cond_matches = word(8) as usize;
    let strings = word(9) as usize;
    assert_eq!(
        rows.checked_mul(cols),
        Some(cells),
        "the cell count is rows times columns"
    );
    assert!(
        cond_matches == 0 || cond_matches == cells,
        "conditional matches are absent or one per cell"
    );

    let kinds_start = 40;
    let numbers_start = (kinds_start + cells + 7) & !7;
    let string_ids_start = numbers_start + cells * 8;
    let string_index_start = string_ids_start + cells * 4;
    let style_index_start = string_index_start + cells * 4;
    let style_dict_start = style_index_start + cells * 4;
    let cond_matches_start = style_dict_start + styles * 4;
    assert_eq!(
        cond_matches_start + cond_matches * 4,
        packed.len(),
        "the conditional matches end the buffer"
    );

    let decode_u32 = |start: usize, len: usize| {
        (0..len)
            .map(|index| {
                u32::from_le_bytes(
                    packed[start + index * 4..start + index * 4 + 4]
                        .try_into()
                        .expect("complete packed u32"),
                )
            })
            .collect::<Vec<_>>()
    };
    let decoded_strings = view.take_strings();
    assert_eq!(
        decoded_strings.len(),
        strings,
        "one decoded string per string id"
    );
    DecodedWindow {
        kinds: packed[kinds_start..kinds_start + cells].to_vec(),
        string_index: decode_u32(string_index_start, cells)
            .into_iter()
            .map(|value| value as i32)
            .collect(),
        style_index: decode_u32(style_index_start, cells),
        style_dict: decode_u32(style_dict_start, styles),
        cond_matches: decode_u32(cond_matches_start, cond_matches),
        strings: decoded_strings,
    }
}
