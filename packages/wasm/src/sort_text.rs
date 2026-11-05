//! Excel's ascending order of text in a sort, from the sort order table of
//! "Sort data in a range or table in Excel" (Microsoft Support): digits,
//! space, punctuation in a fixed order, then letters without case.
//! Apostrophes and hyphens are skipped. When two texts differ only in them,
//! the text with a hyphen sorts last. Excel's order of other characters
//! depends on the locale; they sort after the documented characters by
//! their lowercase code point.

/// Punctuation in the documented order, after the digits and space.
const PUNCTUATION_ORDER: &[u8] = b" !\"#$%&()*,./:;?@[\\]^_`{|}~+<=>";

const ASCII_COUNT: usize = 128;
const LETTER_COUNT: u8 = 26;

/// Control characters keep their code (0 to 31) and sort first.
const FIRST_DIGIT_RANK: u8 = 32;
const FIRST_PUNCTUATION_RANK: u8 = FIRST_DIGIT_RANK + 10;
const FIRST_LETTER_RANK: u8 = FIRST_PUNCTUATION_RANK + PUNCTUATION_ORDER.len() as u8;
const DELETE_RANK: u8 = FIRST_LETTER_RANK + LETTER_COUNT;

const ASCII_RANKS: [u8; ASCII_COUNT] = ascii_ranks();

const fn ascii_ranks() -> [u8; ASCII_COUNT] {
    let mut ranks = [0u8; ASCII_COUNT];

    let mut code = 0;
    while code < ASCII_COUNT {
        ranks[code] = code as u8;
        code += 1;
    }

    let mut digit = 0;
    while digit < 10 {
        ranks[b'0' as usize + digit] = FIRST_DIGIT_RANK + digit as u8;
        digit += 1;
    }

    let mut position = 0;
    while position < PUNCTUATION_ORDER.len() {
        ranks[PUNCTUATION_ORDER[position] as usize] = FIRST_PUNCTUATION_RANK + position as u8;
        position += 1;
    }

    let mut letter = 0;
    while letter < LETTER_COUNT as usize {
        ranks[b'a' as usize + letter] = FIRST_LETTER_RANK + letter as u8;
        ranks[b'A' as usize + letter] = FIRST_LETTER_RANK + letter as u8;
        letter += 1;
    }

    ranks[0x7f] = DELETE_RANK;
    ranks
}

/// Lead byte of a character outside ASCII. It is above every ASCII rank, so
/// such characters sort after the documented ones.
const OTHER_CHARACTER_LEAD: u8 = 0x80;

/// Append the collation key of `text` to `arena`: one rank byte for each
/// ASCII character and four bytes for any other character, so that a plain
/// byte comparison of two keys gives Excel's order. Returns whether the text
/// holds a hyphen, which decides a tie.
pub(crate) fn push_collation_key(text: &str, arena: &mut Vec<u8>) -> bool {
    if text.is_ascii() {
        let bytes = text.as_bytes();
        arena.extend(
            bytes
                .iter()
                .filter(|&&byte| byte != b'\'' && byte != b'-')
                .map(|&byte| ASCII_RANKS[usize::from(byte)]),
        );
        return bytes.contains(&b'-');
    }

    let mut has_hyphen = false;

    for character in text.chars() {
        has_hyphen |= character == '-';
        if character == '\'' || character == '-' {
            continue;
        }

        if character.is_ascii() {
            arena.push(ASCII_RANKS[character as usize]);
            continue;
        }

        let folded = character.to_lowercase().next().unwrap_or(character);
        let [_, high, middle, low] = u32::from(folded).to_be_bytes();
        arena.extend_from_slice(&[OTHER_CHARACTER_LEAD, high, middle, low]);
    }
    has_hyphen
}
