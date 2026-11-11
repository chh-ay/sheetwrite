//! Literal REGEX patterns, shared by the formulas of one store.
//!
//! When a formula is installed, the literal pattern argument of `REGEXTEST`,
//! `REGEXREPLACE` or `REGEXEXTRACT` becomes an [`Ast::RegexPattern`] node.
//! Formulas with the same pattern text hold the same [`SharedPattern`], which
//! compiles once for each case mode on first use. The formulas own it: it is
//! freed when the last formula that holds it goes. The store keeps only a
//! weak index from pattern text to the shared pattern, so it never keeps a
//! compiled program alive by itself.

use std::cell::OnceCell;
use std::rc::{Rc, Weak};

use regex_lite::{Regex, RegexBuilder};

use crate::calc::{Ast, Func};
use crate::memory::MemoryOwnerStats;
use crate::types::FormulaError;

/// Compiled program size limit, matching the `regex-lite` default bound.
const MAX_REGEX_BYTES: usize = 2 * 1024 * 1024;

/// The index sweeps dead entries once it holds this many, and after that
/// whenever it doubles, so sweeping costs O(1) per installed pattern.
const FIRST_SWEEP_LEN: usize = 64;

/// Argument position of the pattern in every REGEX function.
const PATTERN_ARGUMENT: usize = 1;

/// One pattern text and its compiled programs, one per case mode.
pub(crate) struct SharedPattern {
    /// Shared with the store's index entry, so the text is stored once.
    text: Rc<str>,
    /// `[case-sensitive, case-insensitive]`, each compiled on first use.
    programs: [OnceCell<Result<Rc<Regex>, FormulaError>>; 2],
}

impl SharedPattern {
    fn new(text: Rc<str>) -> Self {
        Self {
            text,
            programs: [OnceCell::new(), OnceCell::new()],
        }
    }

    /// The pattern as written in the formula.
    pub(crate) fn text(&self) -> &str {
        &self.text
    }

    /// The program for this pattern in one case mode, compiled on first use.
    pub(crate) fn program(&self, insensitive: bool) -> Result<Rc<Regex>, FormulaError> {
        self.programs[usize::from(insensitive)]
            .get_or_init(|| build_regex(&self.text, insensitive))
            .clone()
    }
}

impl PartialEq for SharedPattern {
    fn eq(&self, other: &Self) -> bool {
        self.text == other.text
    }
}

impl std::fmt::Debug for SharedPattern {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.text)
    }
}

/// The store's weak index from pattern text to the formulas' shared pattern,
/// sorted by text. Formulas are installed far less often than they are
/// evaluated, so a sorted list serves the lookups.
#[derive(Default)]
pub(crate) struct PatternIndex {
    entries: Vec<(Rc<str>, Weak<SharedPattern>)>,
    sweep_at: usize,
}

impl PatternIndex {
    /// The shared pattern for `text`, made when no formula holds one yet.
    fn shared(&mut self, text: &str) -> Rc<SharedPattern> {
        let found = self
            .entries
            .binary_search_by(|(key, _)| key.as_ref().cmp(text));
        let key = match found {
            Ok(position) => {
                let (key, entry) = &self.entries[position];
                if let Some(pattern) = entry.upgrade() {
                    return pattern;
                }
                Rc::clone(key)
            }
            Err(_) => Rc::from(text),
        };

        let pattern = Rc::new(SharedPattern::new(Rc::clone(&key)));
        let entry = (key, Rc::downgrade(&pattern));
        match found {
            Ok(position) => self.entries[position] = entry,
            Err(position) => {
                self.entries.insert(position, entry);
                self.sweep_when_grown();
            }
        }
        pattern
    }

    /// Drops the entries of patterns no formula holds, so the list holds at
    /// most about twice its live entries.
    fn sweep_when_grown(&mut self) {
        if self.entries.len() < self.sweep_at.max(FIRST_SWEEP_LEN) {
            return;
        }

        self.entries
            .retain(|(_, pattern)| pattern.strong_count() > 0);
        self.sweep_at = self.entries.len() * 2;
    }

    /// Replaces the literal pattern arguments of the REGEX calls in `ast`
    /// with shared pattern nodes.
    pub(crate) fn bind(&mut self, ast: &mut Ast) {
        match ast {
            Ast::Func(func, args) => {
                if let Func::Analysis(id) = func {
                    if is_regex_function(*id) {
                        self.bind_pattern(args);
                    }
                }
                for arg in args {
                    self.bind(arg);
                }
            }
            Ast::UnknownFunc(call) => {
                let args = &mut call.args;

                for arg in args {
                    self.bind(arg);
                }
            }
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                self.bind(left);
                self.bind(right);
            }
            Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => self.bind(inner),
            Ast::LetSlot { expression, .. } => self.bind(expression),
            _ => {}
        }
    }

    /// Counts the index and each pattern text once. Compiled programs are not
    /// counted: `regex-lite` does not report their size.
    pub(crate) fn add_memory_stats(&self, out: &mut MemoryOwnerStats) {
        let bytes = std::mem::size_of::<Self>();
        out.add_payload(bytes, bytes);
        out.add_vec::<(Rc<str>, Weak<SharedPattern>)>(self.entries.len(), self.entries.capacity());
        for (text, _) in &self.entries {
            out.add_payload(text.len(), text.len());
        }
    }

    fn bind_pattern(&mut self, args: &mut [Ast]) {
        let Some(argument) = args.get_mut(PATTERN_ARGUMENT) else {
            return;
        };
        let Ast::Str(text) = argument else {
            return;
        };

        *argument = Ast::RegexPattern(self.shared(text));
    }
}

fn is_regex_function(id: u16) -> bool {
    matches!(
        super::analysis::name(id),
        "REGEXTEST" | "REGEXREPLACE" | "REGEXEXTRACT"
    )
}

/// Whether formula source text may call a REGEX function, so installing other
/// formulas skips the pattern walk.
pub(crate) fn may_call_regex(source: &str) -> bool {
    const NAME_PREFIX: &[u8] = b"REGEX";
    source
        .as_bytes()
        .windows(NAME_PREFIX.len())
        .any(|window| window.eq_ignore_ascii_case(NAME_PREFIX))
}

/// `regex-lite` folds case for ASCII only, so a case-insensitive pattern with
/// a non-ASCII cased character or a code point escape could give a wrong match.
fn needs_unicode_case(pattern: &str, insensitive: bool) -> bool {
    let folds = insensitive
        || pattern.split("(?").skip(1).any(|group| {
            group
                .split(|c: char| !c.is_ascii_alphabetic())
                .next()
                .is_some_and(|flags| flags.contains('i'))
        });
    folds
        && (pattern
            .chars()
            .any(|c| !c.is_ascii() && (c.to_lowercase().ne([c]) || c.to_uppercase().ne([c])))
            || ["\\x", "\\u", "\\U"]
                .iter()
                .any(|escape| pattern.contains(escape)))
}

/// Compiles `pattern`, or fails with `#VALUE!` for a pattern `regex-lite`
/// cannot run as Excel would.
pub(super) fn build_regex(pattern: &str, insensitive: bool) -> Result<Rc<Regex>, FormulaError> {
    if needs_unicode_case(pattern, insensitive) {
        return Err(FormulaError::Value);
    }

    RegexBuilder::new(pattern)
        .case_insensitive(insensitive)
        .size_limit(MAX_REGEX_BYTES)
        .build()
        .map(Rc::new)
        .map_err(|_| FormulaError::Value)
}
