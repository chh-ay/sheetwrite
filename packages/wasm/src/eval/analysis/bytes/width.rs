//! `ASC` and `DBCS`: conversion between half-width (single-byte) and
//! full-width (double-byte) forms of ASCII letters, digits, punctuation,
//! the space and katakana.

/// The full-width forms of the half-width characters U+FF61 to U+FF9F:
/// Japanese punctuation, katakana, the long vowel mark and the voiced and
/// semi-voiced sound marks.
const HALF_WIDTH_FORMS: [char; 63] = [
    '。', '「', '」', '、', '・', 'ヲ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ャ', 'ュ', 'ョ', 'ッ', 'ー',
    'ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'ソ', 'タ',
    'チ', 'ツ', 'テ', 'ト', 'ナ', 'ニ', 'ヌ', 'ネ', 'ノ', 'ハ', 'ヒ', 'フ', 'ヘ', 'ホ', 'マ', 'ミ',
    'ム', 'メ', 'モ', 'ヤ', 'ユ', 'ヨ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ワ', 'ン', '゛', '゜',
];
const FIRST_HALF_WIDTH: u32 = 0xFF61;
const HALF_VOICED_MARK: char = 'ﾞ';
const HALF_SEMI_VOICED_MARK: char = 'ﾟ';
/// Full-width ASCII forms are the ASCII code point plus this offset.
const FULL_WIDTH_OFFSET: u32 = 0xFEE0;
const IDEOGRAPHIC_SPACE: char = '\u{3000}';
const VU: char = 'ヴ';
const U: char = 'ウ';

/// `ASC`: full-width characters to half-width ones. A voiced katakana such
/// as ガ becomes two characters, ｶﾞ.
pub(super) fn half_width(text: &str) -> String {
    let mut output = String::with_capacity(text.len());

    for character in text.chars() {
        match character {
            IDEOGRAPHIC_SPACE => output.push(' '),
            '\u{FF01}'..='\u{FF5E}' => output.push(shift(character, false)),
            VU => {
                output.push(half_form(U).unwrap_or(U));
                output.push(HALF_VOICED_MARK);
            }
            _ => push_half_katakana(&mut output, character),
        }
    }

    output
}

fn push_half_katakana(output: &mut String, character: char) {
    if let Some(half) = half_form(character) {
        output.push(half);
        return;
    }

    let code = u32::from(character);

    if let Some(base) = voiced_base(code) {
        if let Some(half) = half_form(base) {
            output.push(half);
            output.push(HALF_VOICED_MARK);
            return;
        }
    }

    if let Some(base) = semi_voiced_base(code) {
        if let Some(half) = half_form(base) {
            output.push(half);
            output.push(HALF_SEMI_VOICED_MARK);
            return;
        }
    }

    output.push(character);
}

/// `DBCS`: half-width characters to full-width ones. A half-width katakana
/// followed by ﾞ or ﾟ becomes one voiced character when that character
/// exists.
pub(super) fn full_width(text: &str) -> String {
    let mut output = String::with_capacity(text.len() * 3);
    let mut characters = text.chars().peekable();

    while let Some(character) = characters.next() {
        let full = match character {
            ' ' => IDEOGRAPHIC_SPACE,
            '!'..='~' => shift(character, true),
            _ => full_form(character).unwrap_or(character),
        };
        let mark = characters.peek().copied();
        let combined = match mark {
            Some(HALF_VOICED_MARK) => voiced(full),
            Some(HALF_SEMI_VOICED_MARK) => semi_voiced(full),
            _ => None,
        };

        match combined {
            Some(combined) => {
                output.push(combined);
                characters.next();
            }
            None => output.push(full),
        }
    }

    output
}

fn shift(character: char, to_full: bool) -> char {
    let code = u32::from(character);
    let shifted = if to_full {
        code + FULL_WIDTH_OFFSET
    } else {
        code - FULL_WIDTH_OFFSET
    };

    char::from_u32(shifted).unwrap_or(character)
}

fn full_form(character: char) -> Option<char> {
    let index = u32::from(character).checked_sub(FIRST_HALF_WIDTH)?;

    HALF_WIDTH_FORMS.get(index as usize).copied()
}

fn half_form(character: char) -> Option<char> {
    let index = HALF_WIDTH_FORMS
        .iter()
        .position(|&full| full == character)?;

    char::from_u32(FIRST_HALF_WIDTH + index as u32)
}

/// Full-width katakana rows that take the voiced mark: カ to ト and ハ to ホ.
/// In those rows the voiced form is the next code point.
fn takes_voiced_mark(code: u32) -> bool {
    (0x30AB..=0x30C8).contains(&code) || (0x30CF..=0x30DB).contains(&code)
}

/// ハ, ヒ, フ, ヘ and ホ take the semi-voiced mark; that form is two code
/// points on.
fn takes_semi_voiced_mark(code: u32) -> bool {
    (0x30CF..=0x30DB).contains(&code) && (code - 0x30CF).is_multiple_of(3)
}

fn voiced(full: char) -> Option<char> {
    if full == U {
        return Some(VU);
    }

    let code = u32::from(full);

    (takes_voiced_mark(code) && half_form(full).is_some() && voiced_base(code + 1) == Some(full))
        .then(|| char::from_u32(code + 1))
        .flatten()
}

fn semi_voiced(full: char) -> Option<char> {
    let code = u32::from(full);

    takes_semi_voiced_mark(code)
        .then(|| char::from_u32(code + 2))
        .flatten()
}

/// The unvoiced katakana of a voiced one, such as カ for ガ.
fn voiced_base(code: u32) -> Option<char> {
    let base = code.checked_sub(1)?;
    let base_char = char::from_u32(base)?;
    let is_voiced = takes_voiced_mark(base)
        && half_form(base_char).is_some()
        && half_form(char::from_u32(code)?).is_none();

    is_voiced.then_some(base_char)
}

/// The plain katakana of a semi-voiced one, such as ハ for パ.
fn semi_voiced_base(code: u32) -> Option<char> {
    let base = code.checked_sub(2)?;

    takes_semi_voiced_mark(base)
        .then(|| char::from_u32(base))
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_and_space_change_width_both_ways() {
        assert_eq!(full_width("EXCEL 1!"), "ＥＸＣＥＬ\u{3000}１！");
        assert_eq!(half_width("ＥＸＣＥＬ\u{3000}１！"), "EXCEL 1!");
    }

    #[test]
    fn voiced_katakana_split_and_join() {
        assert_eq!(half_width("ガパヴァン"), "ｶﾞﾊﾟｳﾞｧﾝ");
        assert_eq!(full_width("ｶﾞﾊﾟｳﾞｧﾝ"), "ガパヴァン");
        assert_eq!(full_width("ｱﾞ"), "ア゛");
    }

    #[test]
    fn every_half_width_katakana_reads_back() {
        let half: String = (FIRST_HALF_WIDTH..FIRST_HALF_WIDTH + 63)
            .filter_map(char::from_u32)
            .collect();

        assert_eq!(half_width(&full_width(&half)), half);
    }

    #[test]
    fn other_text_is_unchanged() {
        assert_eq!(half_width("日本 ヰ"), "日本 ヰ");
        assert_eq!(full_width("日本"), "日本");
    }
}
