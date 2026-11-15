//! Column metadata is a packed UTF-8 string table plus small typed code lanes.

use crate::buffers::row_index;
use crate::mixed::{DATE_TAG, DATE_TIME_TAG, LOGICAL_TAG, NUMBER_TAG, TEXT_TAG};
use crate::plan::{ColumnType, Diagnostic};

const MIXED_TYPE: u8 = 7;
const MAX_METADATA_BYTES: usize = 1024 * 1024;

/// String boundaries are checked once before the schema or code pool owns them.
pub(crate) fn decode_strings(bytes: &[u8], offsets: &[u32]) -> Result<Vec<String>, Diagnostic> {
    if bytes.len() > MAX_METADATA_BYTES {
        return Err(Diagnostic::limit());
    }

    if offsets.first() != Some(&0)
        || offsets.last().copied().map(row_index).transpose()? != Some(bytes.len())
    {
        return Err(Diagnostic::new("shape"));
    }

    let mut strings = Vec::with_capacity(offsets.len().saturating_sub(1));
    for range in offsets.windows(2) {
        let [start_offset, end_offset] = range else {
            return Err(Diagnostic::new("shape"));
        };
        let start = row_index(*start_offset)?;
        let end = row_index(*end_offset)?;
        let slice = bytes
            .get(start..end)
            .ok_or_else(|| Diagnostic::new("shape"))?;
        strings.push(std::str::from_utf8(slice)?.to_owned());
    }

    Ok(strings)
}

/// Type codes share primitive mixed tags; mixed itself has a separate schema code.
pub(crate) const fn encode_type(kind: ColumnType) -> u8 {
    match kind {
        ColumnType::Number => NUMBER_TAG,
        ColumnType::Logical => LOGICAL_TAG,
        ColumnType::Text => TEXT_TAG,
        ColumnType::Date => DATE_TAG,
        ColumnType::DateTime => DATE_TIME_TAG,
        ColumnType::Mixed => MIXED_TYPE,
    }
}

/// Unknown type codes fail before a column can allocate a payload lane.
pub(crate) fn decode_type(code: u8) -> Result<ColumnType, Diagnostic> {
    match code {
        NUMBER_TAG => Ok(ColumnType::Number),
        LOGICAL_TAG => Ok(ColumnType::Logical),
        TEXT_TAG => Ok(ColumnType::Text),
        DATE_TAG => Ok(ColumnType::Date),
        DATE_TIME_TAG => Ok(ColumnType::DateTime),
        MIXED_TYPE => Ok(ColumnType::Mixed),
        _ => Err(Diagnostic::new("type")),
    }
}
