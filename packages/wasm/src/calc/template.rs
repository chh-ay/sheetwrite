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
//! them, and a recalculation, which ends a load or an edit, drops them.

use super::*;

/// Where an `Ast::Cell` or `Ast::Range` of a parsed tree came from. A
/// parse records one site per such node, in the order it makes them, which
/// is the order of the text and of a walk over the tree's children.
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
    /// The formula's text, trimmed and without its `=`.
    text: String,
    sites: Vec<RefSite>,
    /// The tree, kept once a second formula of this shape arrived. A
    /// formula that no other repeats costs one text copy, not a tree copy.
    tree: Option<Ast>,
}

/// How many shapes ingest keeps: a block written row by row meets the
/// formulas of each column in turn. Every lookup compares against all of
/// them, so the count stays small.
const KEPT_SHAPES: usize = 4;

/// The kept formulas and the scratch buffers of a lookup.
#[derive(Default)]
struct Templates {
    kept: Vec<Template>,
    /// The template the next new shape replaces once `kept` is full.
    next: usize,
    /// The sites the parse in progress records.
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
}

/// Drops the kept formulas and their buffers. A recalculation calls it: the
/// formulas of a load or an edit have arrived by then.
pub(crate) fn release_formula_templates() {
    TEMPLATES.take();
}

/// What a lookup found for a formula.
enum Lookup {
    /// The formula's tree, built from a kept formula.
    Tree(Ast),
    /// The kept formula at this index has the formula's shape, but no tree.
    Shape(usize),
    Miss,
}

/// The tree of formula text `body` (trimmed, without its `=`). With `reuse`,
/// it is built from a kept formula of the same shape when there is one, and
/// a parsed formula without sheet, table, defined name or LAMBDA is kept
/// for the formulas after it. `parse` parses `body` and records its
/// reference sites when it is given a list.
pub(super) fn reuse_or_parse(
    body: &str,
    reuse: bool,
    parse: impl FnOnce(Option<&mut Vec<RefSite>>) -> ParseResult,
) -> ParseResult {
    if !reuse {
        return parse(None);
    }
    let mut kept = TEMPLATES.take();
    let shape = match kept.lookup(body) {
        Lookup::Tree(tree) => {
            TEMPLATES.set(kept);
            return Ok((tree, ParseFeatures::default()));
        }
        Lookup::Shape(index) => Some(index),
        Lookup::Miss => None,
    };
    kept.sites.clear();
    let parsed = parse(Some(&mut kept.sites));
    if let Ok((tree, features)) = &parsed {
        if depends_on_text_alone(*features) {
            kept.keep(body, tree, shape);
        }
    }
    TEMPLATES.set(kept);
    parsed
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

impl Templates {
    fn lookup(&mut self, body: &str) -> Lookup {
        let Some(index) = self
            .kept
            .iter()
            .position(|template| template.values_in(body, &mut self.values))
        else {
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

    /// Keeps the parse of `body` (`tree` and `self.sites`). A formula of the
    /// kept shape at `shape` keeps its tree there; a new shape keeps only
    /// its text and sites until a second formula of that shape arrives.
    fn keep(&mut self, body: &str, tree: &Ast, shape: Option<usize>) {
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
