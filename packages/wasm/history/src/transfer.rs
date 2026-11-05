//! Reader for the bytes of `RangeSnapshot.exportMemoryState` from the document
//! engine. The layout is the engine's range transfer format: a tag, the block
//! size, run-length coded columns of source kinds, payloads and style IDs, a
//! block-local string table and the formula entries of the block.
//!
//! The reader decodes into buffers that the caller reuses, so a scan of many
//! windows allocates only when a window is larger than any before it.

const RANGE_TAG: u32 = 0x3248_4d53;

/// Source kinds, as the engine stores them.
pub const KIND_EMPTY: u8 = 0;
pub const KIND_STRING: u8 = 2;
pub const KIND_FORMULA: u8 = 4;

/// High word of a payload that holds a block-local string ID.
const STRING_TAG_HIGH: u64 = 0xFFFC_0000;

/// Error slot of a formula entry without a source error.
const NO_ERROR: u32 = u32::MAX;

/// One decoded block. Cells are column-major: cell `(row, col)` is at
/// `col * rows + row`, as the engine captures them.
#[derive(Default)]
pub struct Block {
    pub rows: usize,
    pub cols: usize,
    pub kinds: Vec<u8>,
    pub payloads: Vec<u64>,
    pub styles: Vec<u32>,
    /// UTF-8 bytes of the block's strings and formula sources, back to back.
    pub text: Vec<u8>,
    /// `[start, end)` byte ranges in `text`, one per block-local string ID.
    pub strings: Vec<(u32, u32)>,
    /// Formula source per cell index, as a `[start, end)` range in `text`;
    /// `(0, 0)` for cells without a formula entry.
    pub formulas: Vec<(u32, u32)>,
}

impl Block {
    /// Text of a string payload, or `None` when the payload is not a string.
    pub fn string(&self, payload: u64) -> Option<&[u8]> {
        if payload >> 32 != STRING_TAG_HIGH {
            return None;
        }

        let (start, end) = *self.strings.get(payload as u32 as usize)?;

        Some(&self.text[start as usize..end as usize])
    }

    /// Formula source of a cell; empty when the cell has no formula entry.
    pub fn formula(&self, cell: usize) -> &[u8] {
        let (start, end) = self.formulas[cell];

        &self.text[start as usize..end as usize]
    }
}

/// A transfer that does not match the engine's range layout.
#[derive(Debug, PartialEq, Eq)]
pub struct InvalidTransfer;

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, count: usize) -> Result<&'a [u8], InvalidTransfer> {
        let end = self.at.checked_add(count).ok_or(InvalidTransfer)?;
        let slice = self.bytes.get(self.at..end).ok_or(InvalidTransfer)?;
        self.at = end;

        Ok(slice)
    }

    fn u8(&mut self) -> Result<u8, InvalidTransfer> {
        Ok(self.take(1)?[0])
    }

    fn u32(&mut self) -> Result<u32, InvalidTransfer> {
        let bytes = self.take(4)?;

        Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn count(&mut self) -> Result<usize, InvalidTransfer> {
        let count = self.u32()? as usize;
        if count > self.bytes.len() - self.at {
            return Err(InvalidTransfer);
        }

        Ok(count)
    }

    /// Decode one run-length coded byte array: runs of zero bytes are not stored.
    fn runs(&mut self, out: &mut Vec<u8>) -> Result<(), InvalidTransfer> {
        let length = self.u32()? as usize;
        let start = out.len();
        out.resize(start.checked_add(length).ok_or(InvalidTransfer)?, 0);

        let mut offset = 0;
        while offset < length {
            let run = self.u32()?;
            let count = (run >> 1) as usize;
            if count == 0 || count > length - offset {
                return Err(InvalidTransfer);
            }

            if run & 1 != 0 {
                let bytes = self.take(count)?;
                out[start + offset..start + offset + count].copy_from_slice(bytes);
            }

            offset += count;
        }

        Ok(())
    }

    /// Append one text to `text` and return its byte range.
    fn text(&mut self, text: &mut Vec<u8>) -> Result<(u32, u32), InvalidTransfer> {
        let start = text.len();
        self.runs(text)?;

        if std::str::from_utf8(&text[start..]).is_err() {
            return Err(InvalidTransfer);
        }

        let start = u32::try_from(start).map_err(|_| InvalidTransfer)?;
        let end = u32::try_from(text.len()).map_err(|_| InvalidTransfer)?;

        Ok((start, end))
    }

    fn skip_words(&mut self, count: usize) -> Result<(), InvalidTransfer> {
        self.take(count.checked_mul(4).ok_or(InvalidTransfer)?)?;

        Ok(())
    }
}

/// Decode `bytes` into `block`, reusing its buffers.
pub fn read_block(bytes: &[u8], block: &mut Block) -> Result<(), InvalidTransfer> {
    let mut input = Reader { bytes, at: 0 };
    if input.u32()? != RANGE_TAG {
        return Err(InvalidTransfer);
    }

    block.rows = input.u32()? as usize;
    block.cols = input.u32()? as usize;
    let cells = block.rows.checked_mul(block.cols).ok_or(InvalidTransfer)?;

    block.kinds.clear();
    input.runs(&mut block.kinds)?;

    block.payloads.clear();
    block.styles.clear();
    block.text.clear();

    // The scratch byte vector is reused for both word arrays.
    let mut words = std::mem::take(&mut block.text);
    input.runs(&mut words)?;
    block.payloads.extend(
        words
            .as_chunks::<8>()
            .0
            .iter()
            .map(|chunk| u64::from_le_bytes(*chunk)),
    );
    let payload_bytes = words.len();

    words.clear();
    input.runs(&mut words)?;
    block.styles.extend(
        words
            .as_chunks::<4>()
            .0
            .iter()
            .map(|chunk| u32::from_le_bytes(*chunk)),
    );
    let style_bytes = words.len();

    words.clear();
    block.text = words;

    if block.kinds.len() != cells || payload_bytes != cells * 8 || style_bytes != cells * 4 {
        return Err(InvalidTransfer);
    }

    block.strings.clear();
    for _ in 0..input.count()? {
        let range = input.text(&mut block.text)?;
        block.strings.push(range);
    }

    // String table epoch.
    input.u32()?;

    block.formulas.clear();
    block.formulas.resize(cells, (0, 0));

    for _ in 0..input.count()? {
        let row = input.u32()? as usize;
        let col = input.u32()? as usize;
        if row >= block.rows || col >= block.cols {
            return Err(InvalidTransfer);
        }

        let source = input.text(&mut block.text)?;
        block.formulas[col * block.rows + row] = source;

        skip_formula_tail(&mut input)?;
    }

    if input.at != bytes.len() {
        return Err(InvalidTransfer);
    }

    Ok(())
}

/// Skip the fields after a formula source: reference target, compile state and
/// read set. The diff compares sources only.
fn skip_formula_tail(input: &mut Reader<'_>) -> Result<(), InvalidTransfer> {
    if input.u8()? != 0 {
        input.skip_words(3)?;
    }

    // Compiled flag, error slot, volatile, spill references and array flags.
    input.u8()?;
    let error = input.u32()?;
    if error != NO_ERROR && error > 10 {
        return Err(InvalidTransfer);
    }
    input.take(3)?;

    let cells = input.count()?;
    input.skip_words(cells.checked_mul(3).ok_or(InvalidTransfer)?)?;

    let ranges = input.count()?;
    input.skip_words(ranges.checked_mul(5).ok_or(InvalidTransfer)?)?;

    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Writer for the engine layout, used to build test blocks.
    #[derive(Default)]
    pub struct Writer(pub Vec<u8>);

    impl Writer {
        pub fn u32(&mut self, value: u32) {
            self.0.extend_from_slice(&value.to_le_bytes());
        }

        pub fn runs(&mut self, value: &[u8]) {
            self.u32(value.len() as u32);
            if !value.is_empty() {
                self.u32((value.len() as u32) << 1 | 1);
                self.0.extend_from_slice(value);
            }
        }
    }

    /// One test cell: kind, payload and style.
    #[derive(Clone)]
    pub enum Cell {
        Empty,
        Number(f64),
        Text(&'static str),
        Formula(&'static str),
    }

    /// Engine bytes of a block given row-major `cells` and `styles`.
    pub fn block_bytes(rows: usize, cols: usize, cells: &[Cell], styles: &[u32]) -> Vec<u8> {
        let mut kinds = vec![0u8; rows * cols];
        let mut payloads = vec![0u64; rows * cols];
        let mut style_ids = vec![0u32; rows * cols];
        let mut strings: Vec<&str> = Vec::new();
        let mut formulas = Vec::new();

        for row in 0..rows {
            for col in 0..cols {
                let at = col * rows + row;
                let input = row * cols + col;
                style_ids[at] = styles.get(input).copied().unwrap_or(0);

                match cells[input] {
                    Cell::Empty => {}
                    Cell::Number(value) => {
                        kinds[at] = 1;
                        payloads[at] = value.to_bits();
                    }
                    Cell::Text(text) => {
                        kinds[at] = KIND_STRING;
                        let id = strings
                            .iter()
                            .position(|known| *known == text)
                            .unwrap_or_else(|| {
                                strings.push(text);
                                strings.len() - 1
                            });
                        payloads[at] = STRING_TAG_HIGH << 32 | id as u64;
                    }
                    Cell::Formula(source) => {
                        kinds[at] = KIND_FORMULA;
                        formulas.push((row as u32, col as u32, source));
                    }
                }
            }
        }

        let mut out = Writer::default();
        out.u32(RANGE_TAG);
        out.u32(rows as u32);
        out.u32(cols as u32);
        out.runs(&kinds);
        out.runs(
            &payloads
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect::<Vec<_>>(),
        );
        out.runs(
            &style_ids
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect::<Vec<_>>(),
        );
        out.u32(strings.len() as u32);
        for text in &strings {
            out.runs(text.as_bytes());
        }
        out.u32(7);
        out.u32(formulas.len() as u32);
        for (row, col, source) in formulas {
            out.u32(row);
            out.u32(col);
            out.runs(source.as_bytes());
            out.0.push(0);
            out.0.push(1);
            out.u32(NO_ERROR);
            out.0.extend_from_slice(&[0, 0, 0]);
            out.u32(1);
            out.0.extend_from_slice(&[0; 12]);
            out.u32(0);
        }

        out.0
    }

    #[test]
    fn reads_values_strings_styles_and_formula_sources() {
        let bytes = block_bytes(
            2,
            2,
            &[
                Cell::Number(1.5),
                Cell::Text("north"),
                Cell::Formula("=A1*2"),
                Cell::Empty,
            ],
            &[0, 3, 0, 0],
        );

        let mut block = Block::default();
        read_block(&bytes, &mut block).unwrap();

        assert_eq!((block.rows, block.cols), (2, 2));
        assert_eq!(block.kinds, vec![1, KIND_FORMULA, KIND_STRING, KIND_EMPTY]);
        assert_eq!(f64::from_bits(block.payloads[0]), 1.5);
        assert_eq!(block.string(block.payloads[2]), Some(&b"north"[..]));
        assert_eq!(block.styles[2], 3);
        assert_eq!(block.formula(1), b"=A1*2");
        assert_eq!(block.formula(0), b"");
    }

    #[test]
    fn rejects_a_truncated_or_mislabelled_transfer() {
        let bytes = block_bytes(1, 1, &[Cell::Number(2.0)], &[]);
        let mut block = Block::default();

        assert_eq!(
            read_block(&bytes[..bytes.len() - 1], &mut block),
            Err(InvalidTransfer)
        );

        let mut wrong = bytes.clone();
        wrong[0] ^= 1;
        assert_eq!(read_block(&wrong, &mut block), Err(InvalidTransfer));
    }
}
