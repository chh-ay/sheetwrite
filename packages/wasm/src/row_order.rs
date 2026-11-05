//! The row order of a `permuteRows` operation: target row offset `i` takes
//! source row offset `order[i]`. Core keeps it as base64 text in the
//! operation and passes the decoded values here.

/// Marks a target that no source row reached yet.
const UNSET: u32 = u32::MAX;

/// Where each row of `order` goes: entry `i` is the new row offset of source
/// row offset `i`, which is also the order that moves every row back.
/// `None` when `order` does not name each of `0..order.len()` exactly once.
/// Building the inverse checks the order too, so apply and undo share one
/// pass and one check.
pub(crate) fn order_targets(order: &[u32]) -> Option<Vec<u32>> {
    let mut targets = vec![UNSET; order.len()];
    for (target, &source) in order.iter().enumerate() {
        let slot = targets.get_mut(source as usize)?;
        if *slot != UNSET {
            return None;
        }
        *slot = u32::try_from(target).ok()?;
    }
    Some(targets)
}
