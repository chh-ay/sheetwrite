//! A1 cell, column, row and area addresses.

use super::*;

/// Parse column letters (A, B, ..., Z, AA, ...) to a 0-based column index.
pub(super) fn parse_col(letters: &str) -> Option<u32> {
    if letters.is_empty() {
        return None;
    }

    let mut col: u32 = 0;

    for ch in letters.chars() {
        if !ch.is_ascii_alphabetic() {
            return None;
        }

        col = col
            .checked_mul(26)?
            .checked_add((ch.to_ascii_uppercase() as u32) - ('A' as u32) + 1)?;
    }

    Some(col - 1)
}

/// Parse an A1 token like `B12` or `$B$12`, preserving absolute markers.
pub(crate) fn parse_a1(token: &str) -> Option<(u32, u32, RefFlags)> {
    let col_abs = token.starts_with('$');
    let unmarked = token.strip_prefix('$').unwrap_or(token);

    let mut letters_end = 0;

    for (idx, ch) in unmarked.char_indices() {
        if !ch.is_ascii_alphabetic() {
            break;
        }

        letters_end = idx + ch.len_utf8();
    }

    if letters_end == 0 {
        return None;
    }

    let letters = &unmarked[..letters_end];
    let row_token = &unmarked[letters_end..];
    let row_abs = row_token.starts_with('$');
    let digits = row_token.strip_prefix('$').unwrap_or(row_token);

    if digits.is_empty() || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    let col = parse_col(letters)?;
    let row = row_index(digits.parse().ok()?)?;

    (col < SHEET_COLS).then_some((row, col, RefFlags::new(row_abs, col_abs)))
}

/// The 0-based index of a 1-based row number inside the sheet.
fn row_index(row_number: u32) -> Option<u32> {
    (1..=SHEET_ROWS)
        .contains(&row_number)
        .then(|| row_number - 1)
}

/// One end of an area reference: a cell (`B2`), a whole column (`$B`) or a
/// whole row (`2`).
#[derive(Clone, Copy)]
pub(crate) enum AreaEnd {
    Cell(u32, u32, RefFlags),
    Column(u32, bool),
    Row(u32, bool),
}

impl AreaEnd {
    /// A row number arrives as a number token unless it has a `$` marker.
    pub(crate) fn of(token: &Tok<'_>) -> Option<Self> {
        match token {
            Tok::Ident(name, _) => Self::of_name(name),
            Tok::Num(number) if number.fract() == 0.0 && *number <= f64::from(SHEET_ROWS) => {
                row_index(*number as u32).map(|row| Self::Row(row, false))
            }
            Tok::Num(_)
            | Tok::Str(_)
            | Tok::Structured(_)
            | Tok::Op(_)
            | Tok::LParen
            | Tok::RParen
            | Tok::Comma
            | Tok::Semicolon
            | Tok::LBrace
            | Tok::RBrace
            | Tok::Colon
            | Tok::Bang
            | Tok::Cmp(_)
            | Tok::Error(_)
            | Tok::Hash
            | Tok::Intersect
            | Tok::End => None,
        }
    }

    pub(super) fn of_name(name: &str) -> Option<Self> {
        if let Some((row, col, flags)) = parse_a1(name) {
            return Some(Self::Cell(row, col, flags));
        }

        let absolute = name.starts_with('$');
        let bare = name.strip_prefix('$').unwrap_or(name);
        if bare.bytes().all(|byte| byte.is_ascii_alphabetic()) {
            let col = parse_col(bare).filter(|&col| col < SHEET_COLS)?;
            return Some(Self::Column(col, absolute));
        }
        if !bare.is_empty() && bare.bytes().all(|byte| byte.is_ascii_digit()) {
            let row = row_index(bare.parse().ok()?)?;
            return Some(Self::Row(row, absolute));
        }
        None
    }
}

/// The range between two ends of one kind; `A:1` and `A1:B` have none.
pub(crate) fn area(start: AreaEnd, end: AreaEnd) -> Option<(u32, u32, u32, u32, RangeFlags)> {
    let whole_axis = |col_abs, row_abs| RefFlags::new(row_abs, col_abs);
    Some(match (start, end) {
        (AreaEnd::Cell(row, col, flags), AreaEnd::Cell(end_row, end_col, end_flags)) => {
            normalize_range(row, col, flags, end_row, end_col, end_flags)
        }
        (AreaEnd::Column(col, col_abs), AreaEnd::Column(end_col, end_abs)) => normalize_range(
            0,
            col,
            whole_axis(col_abs, true),
            SHEET_ROWS - 1,
            end_col,
            whole_axis(end_abs, true),
        ),
        (AreaEnd::Row(row, row_abs), AreaEnd::Row(end_row, end_abs)) => normalize_range(
            row,
            0,
            whole_axis(true, row_abs),
            end_row,
            SHEET_COLS - 1,
            whole_axis(true, end_abs),
        ),
        _ => return None,
    })
}

/// Whether a range spans every row of the sheet: a whole-column range.
pub(super) const fn spans_all_rows(row_start: u32, row_end: u32) -> bool {
    row_start == 0 && row_end == SHEET_ROWS - 1
}

/// Whether a range spans every column of the sheet: a whole-row range.
pub(super) const fn spans_all_cols(col_start: u32, col_end: u32) -> bool {
    col_start == 0 && col_end == SHEET_COLS - 1
}

pub(super) fn normalize_range(
    row: u32,
    col: u32,
    flags: RefFlags,
    end_row: u32,
    end_col: u32,
    end_flags: RefFlags,
) -> (u32, u32, u32, u32, RangeFlags) {
    let start_flags = RefFlags::new(
        if row <= end_row {
            flags.row_abs()
        } else {
            end_flags.row_abs()
        },
        if col <= end_col {
            flags.col_abs()
        } else {
            end_flags.col_abs()
        },
    );

    let normalized_end_flags = RefFlags::new(
        if row <= end_row {
            end_flags.row_abs()
        } else {
            flags.row_abs()
        },
        if col <= end_col {
            end_flags.col_abs()
        } else {
            flags.col_abs()
        },
    );

    let mut range_flags = RangeFlags {
        start: start_flags,
        end: normalized_end_flags,
    };
    let (row_start, row_end) = (row.min(end_row), row.max(end_row));
    let (col_start, col_end) = (col.min(end_col), col.max(end_col));
    // The rows of a whole column, and the columns of a whole row, are fixed:
    // no edit or copy moves them, so they behave as absolute.
    if spans_all_rows(row_start, row_end) {
        range_flags.start.set_row_abs(true);
        range_flags.end.set_row_abs(true);
    }
    if spans_all_cols(col_start, col_end) {
        range_flags.start.set_col_abs(true);
        range_flags.end.set_col_abs(true);
    }

    (row_start, col_start, row_end, col_end, range_flags)
}
