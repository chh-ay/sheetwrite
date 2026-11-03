//! Excel wildcard patterns, shared by criteria (`COUNTIF`, `SUMIFS`, the
//! database functions), wildcard lookups (`XLOOKUP` and `XMATCH` match mode 2)
//! and `SEARCH`.
//!
//! `*` matches any run of characters and `?` exactly one character; `~` makes
//! the next `*`, `?` or `~` literal, and a `~` before anything else is a
//! literal `~`. Characters compare without case one code point at a time, so
//! `?` always stands for one character of the candidate as written.

use std::convert::Infallible;

use crate::types::FormulaError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Token {
    Literal(char),
    AnyOne,
    AnyMany,
}

/// A pattern parsed once and matched against many candidates.
#[derive(Debug)]
pub(super) struct Wildcard {
    tokens: Vec<Token>,
    has_wildcards: bool,
}

impl Wildcard {
    /// Parses `pattern`, or fails with `#NUM!` when its tokens (four bytes
    /// per character) cannot be allocated, as for a pattern of millions of
    /// characters on a nearly full WebAssembly memory.
    pub(super) fn parse(pattern: &str) -> Result<Self, FormulaError> {
        let mut tokens = Vec::new();
        tokens
            .try_reserve_exact(pattern.chars().count())
            .map_err(|_| FormulaError::Num)?;
        let mut has_wildcards = false;
        let mut chars = pattern.chars().peekable();
        while let Some(character) = chars.next() {
            match character {
                '~' => match chars.peek().copied() {
                    Some(literal @ ('*' | '?' | '~')) => {
                        has_wildcards = true;
                        chars.next();
                        tokens.push(Token::Literal(literal));
                    }
                    _ => tokens.push(Token::Literal('~')),
                },
                '*' => {
                    has_wildcards = true;
                    // A run of stars matches what one star matches.
                    if tokens.last() != Some(&Token::AnyMany) {
                        tokens.push(Token::AnyMany);
                    }
                }
                '?' => {
                    has_wildcards = true;
                    tokens.push(Token::AnyOne);
                }
                literal => tokens.push(Token::Literal(literal)),
            }
        }
        Ok(Self {
            tokens,
            has_wildcards,
        })
    }

    /// Whether the pattern uses `*`, `?` or a `~` escape. Criteria compare a
    /// pattern without them as a plain value instead.
    pub(super) fn has_wildcards(&self) -> bool {
        self.has_wildcards
    }

    /// Whether the pattern matches all of `text`.
    pub(super) fn matches(&self, text: &str) -> bool {
        match match_prefix(&self.tokens, text, Anchor::Whole, &mut || {
            Ok::<(), Infallible>(())
        }) {
            Ok(matched) => matched,
            Err(never) => match never {},
        }
    }

    /// `SEARCH`: the byte offset of the first position at or after byte
    /// `start` where the pattern matches the start of the rest of `text`.
    /// `step` runs once per matching step and can stop a search that runs too
    /// long with its error.
    pub(super) fn find<E>(
        &self,
        text: &str,
        start: usize,
        step: &mut impl FnMut() -> Result<(), E>,
    ) -> Result<Option<usize>, E> {
        let candidates = text[start..]
            .char_indices()
            .map(|(offset, _)| start + offset)
            .chain(std::iter::once(text.len()));
        for candidate in candidates {
            if match_prefix(&self.tokens, &text[candidate..], Anchor::Start, step)? {
                return Ok(Some(candidate));
            }
        }
        Ok(None)
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Anchor {
    /// The pattern must use all of the text.
    Whole,
    /// The pattern may stop before the end of the text.
    Start,
}

/// Matches with one remembered `*`: on a mismatch, that star takes one more
/// character and matching resumes after it. Text is walked by byte offset, so
/// a candidate is matched where it lies.
fn match_prefix<E>(
    tokens: &[Token],
    text: &str,
    anchor: Anchor,
    step: &mut impl FnMut() -> Result<(), E>,
) -> Result<bool, E> {
    let (mut token_index, mut text_index) = (0usize, 0usize);
    // The token after the last `*` and the text offset that star has reached.
    let mut star: Option<(usize, usize)> = None;
    loop {
        step()?;
        let next = text[text_index..].chars().next();
        let consumed = match tokens.get(token_index) {
            None if anchor == Anchor::Start || next.is_none() => return Ok(true),
            None => None,
            Some(Token::AnyMany) => {
                token_index += 1;
                star = Some((token_index, text_index));
                continue;
            }
            Some(Token::AnyOne) => next,
            Some(Token::Literal(expected)) => {
                next.filter(|character| characters_equal_ignore_case(*character, *expected))
            }
        };
        if let Some(character) = consumed {
            text_index += character.len_utf8();
            token_index += 1;
            continue;
        }

        let Some((retry_token, star_end)) = star else {
            return Ok(false);
        };
        let Some(skipped) = text[star_end..].chars().next() else {
            return Ok(false);
        };
        let star_end = star_end + skipped.len_utf8();
        star = Some((retry_token, star_end));
        token_index = retry_token;
        text_index = star_end;
    }
}

fn characters_equal_ignore_case(left: char, right: char) -> bool {
    if left.is_ascii() && right.is_ascii() {
        return left.eq_ignore_ascii_case(&right);
    }
    left == right
        || left.to_lowercase().eq(right.to_lowercase())
        || left.to_uppercase().eq(right.to_uppercase())
}

#[cfg(test)]
mod tests {
    use super::Wildcard;

    fn whole(pattern: &str, text: &str) -> bool {
        Wildcard::parse(pattern)
            .expect("small pattern")
            .matches(text)
    }

    fn search(pattern: &str, text: &str) -> Option<usize> {
        Wildcard::parse(pattern)
            .expect("small pattern")
            .find(text, 0, &mut || Ok::<(), ()>(()))
            .expect("unbounded search")
    }

    #[test]
    fn stars_questions_and_escapes_follow_excel() {
        assert!(whole("a*", "Alpha"));
        assert!(whole("a?", "ax"));
        assert!(!whole("a?", "a"));
        assert!(whole("*a*a*", "banana"));
        assert!(!whole("*x*", "banana"));
        assert!(whole("a~*", "a*"));
        assert!(!whole("a~*", "ab"));
        assert!(whole("a~~b", "a~b"));
        assert!(whole("a~b", "a~b"));
        assert!(whole("", ""));
        assert!(!whole("", "a"));
        assert!(whole("**", ""));
    }

    #[test]
    fn question_mark_is_one_character_as_written() {
        // U+0130 lowercases to two code points; `?` still matches it once.
        assert!(whole("?", "İ"));
        assert!(whole("é?", "ÉZ"));
        assert!(whole("ÉCOLE", "école"));
        assert_eq!(search("?", "😀z"), Some(0));
        assert_eq!(search("z", "😀z"), Some("😀".len()));
    }

    #[test]
    fn search_matches_a_prefix_from_each_position() {
        assert_eq!(search("b*d", "abcde"), Some(1));
        assert_eq!(search("", "abc"), Some(0));
        assert_eq!(search("x", "abc"), None);
        assert_eq!(
            Wildcard::parse("c")
                .expect("small pattern")
                .find("abc", 1, &mut || Ok::<(), ()>(())),
            Ok(Some(2))
        );
    }

    #[test]
    fn search_stops_when_its_step_budget_runs_out() {
        let mut steps = 0;
        let mut budget = || {
            steps += 1;
            if steps > 10 {
                Err("budget")
            } else {
                Ok(())
            }
        };
        assert_eq!(
            Wildcard::parse("*x")
                .expect("small pattern")
                .find(&"a".repeat(64), 0, &mut budget),
            Err("budget")
        );
    }
}
