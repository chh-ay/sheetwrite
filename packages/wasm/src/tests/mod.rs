//! Engine tests through the `CellStore` interface, one file per behaviour
//! owner. `support` holds the fixtures they share.

use super::*;
use crate::cells::{
    checked_dense_cell_count, encode_num, payload_is_str, DEFAULT_MAX_PAGED_DIRTY_CELLS,
    MAX_DENSE_CELLS,
};
use crate::memory::{StoreMemoryStats, SPILL_OWNERS};

pub(crate) mod support;
use support::*;

mod formulas_e2e;
mod functions;
mod indirect;
mod iteration;
mod paged;
mod query;
mod recalculation;
mod reference_operators;
mod spill;
mod storage;
mod structural;
mod tables;
mod transfer;
mod window;
