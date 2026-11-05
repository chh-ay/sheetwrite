// Unless marked JS-only, these values cross the WASM boundary and must change
// together with their Rust owner. Cell kinds mirror packages/wasm/src/types.rs.
export const KIND_EMPTY = 0 as const;
export const KIND_NUMBER = 1 as const;
export const KIND_STRING = 2 as const;
export const KIND_BOOL = 3 as const;
export const KIND_FORMULA = 4 as const;

export const NO_STRING = 0xffffffff as const;

/** Missing row or column result of a spill-anchor lookup. */
export const NO_CELL_COORDINATE = 0xffffffff as const;
/** Paged cell states returned by `cell_state` in packages/wasm/src/store.rs. */
export const CELL_STATE_UNLOADED = 0 as const;
export const CELL_STATE_LOADED_EMPTY = 1 as const;
export const CELL_STATE_LOCAL_EDIT = 3 as const;

/** Rule kinds read by `set_conditional_rules` in packages/wasm/src/window.rs. */
export const CONDITIONAL_GREATER_THAN = 0 as const;
export const CONDITIONAL_LESS_THAN = 1 as const;
export const CONDITIONAL_EQUAL_NUMBER = 2 as const;
export const CONDITIONAL_EQUAL_STRING = 3 as const;
export const CONDITIONAL_EQUAL_EMPTY = 4 as const;
export const CONDITIONAL_CONTAINS = 5 as const;
export const CONDITIONAL_FORMULA = 6 as const;
/** Rule flag bits read by `set_conditional_rules` in packages/wasm/src/window.rs. */
export const CONDITIONAL_MATCH_CASE = 1 as const;
export const CONDITIONAL_STOP_IF_TRUE = 2 as const;
/** JS-only result bits of `syncConditionalRules`; they have no Rust counterpart. */
export const CONDITIONAL_HAS_RULES = 1 as const;
export const CONDITIONAL_RULES_UPDATED = 2 as const;
