//! A mixed error must select the same interned code as its sparse row record.

use super::{Column, ColumnBuffers};
use crate::mixed::ERROR_TAG;
use crate::plan::ColumnType;

#[test]
fn mixed_error_lane_and_sparse_record_must_select_the_same_code() {
    let buffers = ColumnBuffers {
        column_type: Some(ColumnType::Mixed),
        metadata: b"mixedMixedfirstsecond".to_vec(),
        metadata_offsets: vec![0, 5, 10, 15, 21],
        validity: vec![0],
        error_rows: vec![0],
        error_codes: vec![1],
        tags: vec![ERROR_TAG],
        indexes: vec![0],
        offsets: vec![0],
        ..ColumnBuffers::default()
    };

    assert_eq!(Column::from_buffers(buffers, 1).unwrap_err().code, "shape");
}
