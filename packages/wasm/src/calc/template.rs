//! Formula trees built from a kept formula of the same shape.
//!
//! A filled column or row of formulas repeats one formula whose cell
//! references name other cells: `=A1*2`, `=A2*2`, `=A3*2`. Without a sheet,
//! table or defined name, a formula's tree depends on its text alone, and
//! two such texts that differ only in the cells their references name lex to
//! the same tokens and parse along the same path. Their trees then differ
//! only in those references. So ingest keeps the last few parsed formulas
//! with the places of their references in the text, and builds the tree of
//! a formula of the same shape by copying the kept tree and writing the new
//! references into it, without lexing or parsing it.
//!
//! The kept formulas are parse scratch, like the parser's argument stack:
//! a kept tree depends on text alone, so every store on the thread shares
//! them. Dropping a store drops them, so a store's formulas leave nothing
//! behind on the thread.

use super::*;
use std::hash::Hasher;

/// Where an `Ast::Cell` or `Ast::Range` of a parsed tree came from, found by
/// [`scan_sites`] in the order the parser makes those nodes, which is the
/// order of the text and of a walk over the tree's children.
#[derive(Clone, Copy)]
pub(super) enum RefSite {
    /// A cell reference: the token at this span.
    Cell(TokenSpan),
    /// A range between the cell references of these two tokens.
    Range(TokenSpan, TokenSpan),
    /// Whole rows or columns, which a formula of the same shape writes the
    /// same way.
    Fixed,
}

/// The value one site has in a formula of a kept formula's shape.
#[derive(Clone, Copy)]
enum SiteValue {
    Cell(u32, u32, RefFlags),
    Range(u32, u32, u32, u32, RangeFlags),
    Fixed,
}

/// A parsed formula kept for the formulas after it.
#[derive(Default)]
struct Template {
    /// [`shape_hash`] of `text`: a formula is compared with this one only
    /// when its hash is the same.
    hash: u64,
    /// The formula's text, trimmed and without its `=`.
    text: String,
    sites: Vec<RefSite>,
    /// The tree, kept once a second formula of this shape arrived. A
    /// formula that no other repeats costs one text copy, not a tree copy.
    tree: Option<Ast>,
}

/// How many shapes ingest keeps: a block written row by row meets the
/// formulas of each column in turn. Every lookup compares its shape hash
/// with each of them, so the count stays small.
const KEPT_SHAPES: usize = 4;

/// The kept formulas and the scratch buffers of a lookup.
#[derive(Default)]
struct Templates {
    kept: Vec<Template>,
    /// The template the next new shape replaces once `kept` is full.
    next: usize,
    /// The sites [`scan_sites`] lists for the formula being kept.
    sites: Vec<RefSite>,
    values: Vec<SiteValue>,
}

thread_local! {
    static TEMPLATES: std::cell::Cell<Templates> = const {
        std::cell::Cell::new(Templates {
            kept: Vec::new(),
            next: 0,
            sites: Vec::new(),
            values: Vec::new(),
        })
    };
    static BACKOFF: std::cell::Cell<Backoff> = const {
        std::cell::Cell::new(Backoff::START)
    };
}

/// Misses in a row after which ingest stops looking for kept shapes.
const MISS_LIMIT: u16 = 8;
/// Formulas the first pause skips; each pause in a row is twice as long.
const FIRST_PAUSE: u16 = 16;
/// The longest pause: a run of formulas of one shape that starts in a pause
/// is parsed in full for at most this many formulas.
const LONGEST_PAUSE: u16 = 1024;

/// When ingest looks for kept shapes. Formulas that repeat no shape, such as
/// ones that differ in a number or name a sheet, would pay for the lookup and
/// the copy of their text every time; after [`MISS_LIMIT`] misses in a row,
/// ingest parses the next formulas without either, for a pause that doubles
/// while the misses go on and resets at the first match.
#[derive(Clone, Copy)]
struct Backoff {
    misses: u16,
    /// Formulas left to parse without looking for a kept shape.
    paused: u16,
    next_pause: u16,
}

impl Backoff {
    /// Looking for kept shapes, with no misses yet.
    const START: Self = Self {
        misses: 0,
        paused: 0,
        next_pause: FIRST_PAUSE,
    };

    fn missed(self) -> Self {
        let misses = self.misses + 1;
        if misses < MISS_LIMIT {
            return Self { misses, ..self };
        }
        Self {
            misses: 0,
            paused: self.next_pause,
            next_pause: self.next_pause.saturating_mul(2).min(LONGEST_PAUSE),
        }
    }
}

/// A store's hold on the kept formulas: dropping it drops them and their
/// buffers, and starts the next store's lookups afresh. It has no size, so
/// the store does not grow.
pub(crate) struct FormulaTemplatesHold;

impl Drop for FormulaTemplatesHold {
    fn drop(&mut self) {
        TEMPLATES.take();
        BACKOFF.set(Backoff::START);
    }
}

enum Lookup {
    /// The formula's tree, built from a kept formula.
    Tree(Ast),
    /// The kept formula at this index has the formula's shape, but no tree.
    Shape(usize),
    Miss,
}

/// Whether ingest looks for a kept shape for the next formula: not during a
/// pause after many misses, which this counts down.
pub(super) fn looks_for_shapes() -> bool {
    let backoff = BACKOFF.get();
    if backoff.paused == 0 {
        return true;
    }
    BACKOFF.set(Backoff {
        paused: backoff.paused - 1,
        ..backoff
    });
    false
}

/// The tree of formula text `body` (trimmed, without its `=`), built from a
/// kept formula of the same shape when there is one, or else `parse`d. A
/// parsed formula without sheet, table, defined name or LAMBDA is kept for
/// the formulas after it. Out of line: a load that repeats no shape spends
/// most formulas in a pause, and their parse should not carry this code.
#[inline(never)]
pub(super) fn reuse_or_parse(body: &str, parse: impl FnOnce() -> ParseResult) -> ParseResult {
    let backoff = BACKOFF.get();
    let mut kept = TEMPLATES.take();
    let mut hash = None;
    let shape = match kept.lookup(body, &mut hash) {
        Lookup::Tree(tree) => {
            TEMPLATES.set(kept);
            BACKOFF.set(Backoff::START);
            return Ok((tree, ParseFeatures::default()));
        }
        Lookup::Shape(index) => Some(index),
        Lookup::Miss => None,
    };
    BACKOFF.set(if shape.is_some() {
        Backoff::START
    } else {
        backoff.missed()
    });
    let parsed = parse();
    if let Ok((tree, features)) = &parsed {
        if depends_on_text_alone(*features) && scan_sites(body, &mut kept.sites) {
            let body_hash = hash.unwrap_or_else(|| shape_hash(body));
            kept.keep(body, body_hash, tree, shape);
        }
    }
    TEMPLATES.set(kept);
    parsed
}

/// The start and end byte offsets of a token in formula text.
type TokenSpan = (usize, usize);

/// The span of a name token's text in `body`. The lexer slices an unquoted
/// name out of the text; a quoted name's text is a string the lexer built,
/// which lies outside `body`, so it has no span.
fn span_in(body: &str, text: &str) -> Option<TokenSpan> {
    let start = (text.as_ptr() as usize).checked_sub(body.as_ptr() as usize)?;
    let end = start.checked_add(text.len())?;
    (end <= body.len()).then_some((start, end))
}

/// Lists in `sites` the reference sites of `body`, a formula that parsed
/// without sheet, table, defined name or LAMBDA, as the parser meets them:
/// a name before `(` is a call, `TRUE` and `FALSE` are values, a name or a
/// number before `:` starts a range whose end is the token after it, and any
/// other name is a cell. `false` for a name that is none of these, which
/// such a formula does not hold.
fn scan_sites(body: &str, sites: &mut Vec<RefSite>) -> bool {
    sites.clear();
    let mut cursor = Cursor::over_text(body);
    while let Some(tok) = cursor.next() {
        let followed_by_colon = matches!(cursor.peek_at(0), Some(Tok::Colon));
        if let Tok::Num(_) = tok {
            if followed_by_colon {
                let _ = cursor.next();
                let _ = cursor.next();
                sites.push(RefSite::Fixed);
            }
            continue;
        }
        let Tok::Ident(name, _) = tok else {
            continue;
        };
        if matches!(cursor.peek_at(0), Some(Tok::LParen))
            || name.eq_ignore_ascii_case("TRUE")
            || name.eq_ignore_ascii_case("FALSE")
        {
            continue;
        }
        if followed_by_colon {
            let Some(start) = AreaEnd::of_name(&name) else {
                return false;
            };
            let _ = cursor.next();
            let end_tok = cursor.next();
            let end_span = if let Some(Tok::Ident(end_name, _)) = &end_tok {
                span_in(body, end_name)
            } else {
                None
            };
            let both_cells = matches!(start, AreaEnd::Cell(..))
                && matches!(
                    end_tok.as_ref().and_then(AreaEnd::of),
                    Some(AreaEnd::Cell(..))
                );
            let spans = (span_in(body, &name), end_span);
            sites.push(
                if let (true, (Some(first), Some(last))) = (both_cells, spans) {
                    RefSite::Range(first, last)
                } else {
                    RefSite::Fixed
                },
            );
        } else if parse_a1(&name).is_some() {
            sites.push(span_in(body, &name).map_or(RefSite::Fixed, RefSite::Cell));
        } else {
            return false;
        }
    }
    true
}

/// Whether a parsed tree with `features` is a function of its text: it
/// names no sheet, table, defined name or LAMBDA, which the store binds.
const fn depends_on_text_alone(features: ParseFeatures) -> bool {
    let ParseFeatures {
        sheet_refs,
        names,
        table_refs,
        detached_sheets,
        #[cfg(feature = "analysis")]
        lambdas,
    } = features;
    #[cfg(not(feature = "analysis"))]
    let lambdas = false;
    !(sheet_refs || names || table_refs || detached_sheets || lambdas)
}

/// A hash of formula text that every formula of one shape has: each run of
/// letters, digits and `$` that starts with a letter or `$` and holds a
/// digit, which may be a cell reference, counts as one marker, whatever its
/// letters and digits. One pass over the text, so a formula that repeats no
/// kept shape costs a few comparisons, not a walk of every kept formula.
fn shape_hash(body: &str) -> u64 {
    /// Stands for a run that may be a cell reference.
    const REFERENCE: u8 = 0xFF;

    let bytes = body.as_bytes();
    let mut hasher = rustc_hash::FxHasher::default();
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        if !(byte.is_ascii_alphabetic() || byte == b'$') {
            hasher.write_u8(byte);
            index += 1;
            continue;
        }
        let start = index;
        let mut holds_digit = false;
        while let Some(&next) = bytes.get(index) {
            if !(next.is_ascii_alphanumeric() || next == b'$') {
                break;
            }
            holds_digit |= next.is_ascii_digit();
            index += 1;
        }
        if holds_digit {
            hasher.write_u8(REFERENCE);
        } else {
            hasher.write(bytes.get(start..index).unwrap_or_default());
        }
    }
    hasher.finish()
}

impl Templates {
    /// The kept formula of `body`'s shape. `hash` caches `body`'s
    /// [`shape_hash`], which only a lookup among kept formulas needs.
    fn lookup(&mut self, body: &str, hash: &mut Option<u64>) -> Lookup {
        if self.kept.is_empty() {
            return Lookup::Miss;
        }
        let body_hash = *hash.get_or_insert_with(|| shape_hash(body));
        let Some(index) = self.kept.iter().position(|template| {
            template.hash == body_hash && template.values_in(body, &mut self.values)
        }) else {
            return Lookup::Miss;
        };
        let Some(tree) = &self.kept[index].tree else {
            return Lookup::Shape(index);
        };
        let mut built = tree.clone();
        let mut values = self.values.iter();
        if write_values(&mut built, &mut values, 0) && values.next().is_none() {
            Lookup::Tree(built)
        } else {
            Lookup::Miss
        }
    }

    /// Keeps the parse of `body` (`tree` and `self.sites`), whose shape
    /// hash is `hash`. A formula of the kept shape at `shape` keeps its tree
    /// there; a new shape keeps only its text and sites until a second
    /// formula of that shape arrives.
    fn keep(&mut self, body: &str, hash: u64, tree: &Ast, shape: Option<usize>) {
        let index = match shape {
            Some(index) => index,
            None if self.kept.len() < KEPT_SHAPES => {
                self.kept.push(Template::default());
                self.kept.len() - 1
            }
            None => {
                let index = self.next;
                self.next = (index + 1) % KEPT_SHAPES;
                index
            }
        };
        let Some(template) = self.kept.get_mut(index) else {
            return;
        };
        template.hash = hash;
        template.text.clear();
        template.text.push_str(body);
        template.sites.clear();
        template.sites.extend_from_slice(&self.sites);
        template.tree = (shape.is_some() && count_sites(tree, 0) == Some(self.sites.len()))
            .then(|| tree.clone());
    }
}

impl Template {
    /// Whether `body` is this formula with only the cells of its
    /// references changed. Then `values` holds the value of each site in
    /// `body`, in site order.
    fn values_in(&self, body: &str, values: &mut Vec<SiteValue>) -> bool {
        let text = self.text.as_bytes();
        let mut text_at = 0;
        let mut body_at = 0;
        values.clear();
        for site in &self.sites {
            let value = match *site {
                RefSite::Fixed => SiteValue::Fixed,
                RefSite::Cell((start, end)) => {
                    let Some((row, col, flags)) =
                        same_then_cell(text, (text_at, start), body, &mut body_at)
                    else {
                        return false;
                    };
                    text_at = end;
                    SiteValue::Cell(row, col, flags)
                }
                RefSite::Range((first_start, first_end), (last_start, last_end)) => {
                    let Some((row, col, flags)) =
                        same_then_cell(text, (text_at, first_start), body, &mut body_at)
                    else {
                        return false;
                    };
                    let Some((end_row, end_col, end_flags)) =
                        same_then_cell(text, (first_end, last_start), body, &mut body_at)
                    else {
                        return false;
                    };
                    text_at = last_end;
                    let (r0, c0, r1, c1, range_flags) =
                        normalize_range(row, col, flags, end_row, end_col, end_flags);
                    SiteValue::Range(r0, c0, r1, c1, range_flags)
                }
            };
            values.push(value);
        }
        text.get(text_at..) == body.as_bytes().get(body_at..)
    }
}

/// The row, column and `$` markers of a cell reference.
type CellParts = (u32, u32, RefFlags);

/// The cell reference in `body` at `*body_at` after the text between
/// `gap.0` and `gap.1` of `text`, when `body` repeats that text there; it
/// moves `*body_at` past the reference. The reference is the longest run of
/// bytes that can continue a name, as the lexer reads it; any byte outside
/// ASCII joins the run, so that a reference followed by one fails instead of
/// being cut short.
fn same_then_cell(
    text: &[u8],
    gap: (usize, usize),
    body: &str,
    body_at: &mut usize,
) -> Option<CellParts> {
    let between = text.get(gap.0..gap.1)?;
    let start = body_at.checked_add(between.len())?;
    if body.as_bytes().get(*body_at..start)? != between {
        return None;
    }
    let rest = body.as_bytes().get(start..)?;
    let len = rest
        .iter()
        .position(|&byte| {
            byte.is_ascii()
                && !(byte.is_ascii_alphanumeric() || matches!(byte, b'$' | b'_' | b'.' | b'\\'))
        })
        .unwrap_or(rest.len());
    *body_at = start + len;
    parse_a1(body.get(start..*body_at)?)
}

/// Writes `values` into the cell and range nodes of `ast` in walk order;
/// `false` when the nodes and the values disagree or the tree is deeper
/// than the evaluator allows.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "only cell and range nodes hold site values; every other node is walked through its children"
)]
fn write_values(ast: &mut Ast, values: &mut std::slice::Iter<'_, SiteValue>, depth: usize) -> bool {
    if depth > FORMULA_RECURSION_LIMIT {
        return false;
    }
    match ast {
        Ast::Cell(row, col, flags) => match values.next() {
            Some(&SiteValue::Cell(new_row, new_col, new_flags)) => {
                (*row, *col, *flags) = (new_row, new_col, new_flags);
                true
            }
            Some(SiteValue::Fixed) => true,
            Some(SiteValue::Range(..)) | None => false,
        },
        Ast::Range(row_start, col_start, row_end, col_end, flags) => match values.next() {
            Some(&SiteValue::Range(r0, c0, r1, c1, range_flags)) => {
                (*row_start, *col_start, *row_end, *col_end, *flags) =
                    (r0, c0, r1, c1, range_flags);
                true
            }
            Some(SiteValue::Fixed) => true,
            Some(SiteValue::Cell(..)) | None => false,
        },
        other => {
            let mut written = true;
            other.fold_children_mut(&mut |child| {
                written &= write_values(child, values, depth + 1);
                false
            });
            written
        }
    }
}

/// The cell and range nodes of `ast`; `None` past the evaluator's depth.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "only cell and range nodes hold site values; every other node is walked through its children"
)]
fn count_sites(ast: &Ast, depth: usize) -> Option<usize> {
    if depth > FORMULA_RECURSION_LIMIT {
        return None;
    }
    match ast {
        Ast::Cell(..) | Ast::Range(..) => Some(1),
        other => {
            let mut count = Some(0usize);
            other.any_child(&mut |child| {
                count = count
                    .zip(count_sites(child, depth + 1))
                    .map(|(sum, more)| sum + more);
                count.is_none()
            });
            count
        }
    }
}
