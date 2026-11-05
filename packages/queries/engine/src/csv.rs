//! A byte-level RFC 4180 record reader: https://www.rfc-editor.org/rfc/rfc4180
//!
//! Records end at LF, CRLF or a lone CR. A quoted field may contain delimiters, line breaks
//! and doubled quotes; after its closing quote only a delimiter or a record end may follow.
//! A quote inside an unquoted field is a literal byte. Empty lines are skipped. The delimiter
//! is ASCII, so every field boundary is also a UTF-8 character boundary.

use crate::plan::Diagnostic;

const QUOTE: u8 = b'"';
const LINE_FEED: u8 = b'\n';
const CARRIAGE_RETURN: u8 = b'\r';

fn syntax() -> Diagnostic {
    Diagnostic::new("csv")
}

/// One reusable record: decoded field text and flat end offsets, with no per-field allocation.
#[derive(Default)]
pub(crate) struct Record {
    text: String,
    ends: Vec<usize>,
}

impl Record {
    pub(crate) fn len(&self) -> usize {
        self.ends.len()
    }

    pub(crate) fn field(&self, index: usize) -> Option<&str> {
        let start = match index.checked_sub(1) {
            Some(previous) => *self.ends.get(previous)?,
            None => 0,
        };

        self.text.get(start..*self.ends.get(index)?)
    }

    /// Yields fields in record order.
    pub(crate) fn fields(&self) -> impl Iterator<Item = &str> {
        (0..self.len()).filter_map(|index| self.field(index))
    }
}

/// Reads records from one validated UTF-8 document.
pub(crate) struct Reader<'a> {
    text: &'a str,
    offset: usize,
    delimiter: u8,
}

impl<'a> Reader<'a> {
    /// Rejects a delimiter that could split a UTF-8 sequence or clash with quoting.
    pub(crate) fn new(bytes: &'a [u8], delimiter: u8) -> Result<Self, Diagnostic> {
        if !delimiter.is_ascii() || matches!(delimiter, QUOTE | LINE_FEED | CARRIAGE_RETURN | 0) {
            return Err(Diagnostic::new("csv-options"));
        }

        Ok(Self {
            text: std::str::from_utf8(bytes).map_err(|_| syntax())?,
            offset: 0,
            delimiter,
        })
    }

    fn peek(&self) -> Option<u8> {
        self.text.as_bytes().get(self.offset).copied()
    }

    /// Appends source text in `start..self.offset`; both are ASCII boundaries.
    fn copy(&self, record: &mut Record, start: usize) -> Result<(), Diagnostic> {
        record
            .text
            .push_str(self.text.get(start..self.offset).ok_or_else(syntax)?);
        Ok(())
    }

    fn end_line(&mut self) {
        if self.peek() == Some(CARRIAGE_RETURN) {
            self.offset += 1;
        }

        if self.peek() == Some(LINE_FEED) {
            self.offset += 1;
        }
    }

    /// Fills `record` with the next non-empty record; returns false at the end of input.
    pub(crate) fn read(&mut self, record: &mut Record) -> Result<bool, Diagnostic> {
        record.text.clear();
        record.ends.clear();

        while matches!(self.peek(), Some(LINE_FEED | CARRIAGE_RETURN)) {
            self.end_line();
        }

        if self.peek().is_none() {
            return Ok(false);
        }

        loop {
            let ended = if self.peek() == Some(QUOTE) {
                self.quoted(record)?
            } else {
                self.unquoted(record)?
            };
            record.ends.push(record.text.len());

            if ended {
                return Ok(true);
            }
        }
    }

    /// Returns true when the field also ended its record.
    fn unquoted(&mut self, record: &mut Record) -> Result<bool, Diagnostic> {
        let start = self.offset;

        loop {
            match self.peek() {
                None => {
                    self.copy(record, start)?;
                    return Ok(true);
                }
                Some(LINE_FEED | CARRIAGE_RETURN) => {
                    self.copy(record, start)?;
                    self.end_line();
                    return Ok(true);
                }
                Some(byte) if byte == self.delimiter => {
                    self.copy(record, start)?;
                    self.offset += 1;
                    return Ok(false);
                }
                Some(_) => self.offset += 1,
            }
        }
    }

    fn quoted(&mut self, record: &mut Record) -> Result<bool, Diagnostic> {
        self.offset += 1;
        let mut start = self.offset;

        loop {
            match self.peek().ok_or_else(syntax)? {
                QUOTE => {
                    self.copy(record, start)?;
                    self.offset += 1;

                    if self.peek() == Some(QUOTE) {
                        record.text.push('"');
                        self.offset += 1;
                        start = self.offset;
                        continue;
                    }

                    return match self.peek() {
                        None => Ok(true),
                        Some(LINE_FEED | CARRIAGE_RETURN) => {
                            self.end_line();
                            Ok(true)
                        }
                        Some(byte) if byte == self.delimiter => {
                            self.offset += 1;
                            Ok(false)
                        }
                        Some(_) => Err(syntax()),
                    };
                }
                _ => self.offset += 1,
            }
        }
    }
}

#[cfg(test)]
mod tests;
