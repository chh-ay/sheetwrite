//! A bounded pull reader for JSON source records (RFC 8259).
//!
//! Borrowed UTF-8 strings stay borrowed. Only escaped strings need a decode buffer. Syntax
//! failures never include source text, which can contain private values.

use std::borrow::Cow;

use crate::plan::Diagnostic;

const MAX_JSON_DEPTH: usize = 128;
const HEX_DIGITS: usize = 4;
const HEX_RADIX: u32 = 16;
const HIGH_SURROGATE_START: u32 = 0xd800;
const HIGH_SURROGATE_END: u32 = 0xdbff;
const LOW_SURROGATE_START: u32 = 0xdc00;
const LOW_SURROGATE_END: u32 = 0xdfff;
const SUPPLEMENTARY_START: u32 = 0x10000;
const SURROGATE_SHIFT: u32 = 10;
const CONTROL_CHARACTER_END: u8 = 0x1f;

fn syntax() -> Diagnostic {
    Diagnostic::new("json")
}

/// The next value's kind, decided by its first byte.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Kind {
    Null,
    Logical,
    Number,
    Text,
    Array,
    Object,
}

/// The next member name, or `None` once the object closed. A name with escapes is decoded
/// into an owned string; any other name borrows the source bytes.
pub(crate) type NextKey<'a> = Option<Cow<'a, str>>;

/// The cursor owns no source data and limits nesting before it enters a container.
pub(crate) struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
    depth: usize,
}

impl<'a> Reader<'a> {
    /// The caller keeps the byte slice alive for every borrowed string.
    pub(crate) const fn new(bytes: &'a [u8]) -> Self {
        Self {
            bytes,
            offset: 0,
            depth: 0,
        }
    }

    /// A complete document has no non-whitespace bytes after its root value.
    pub(crate) fn end(&mut self) -> Result<(), Diagnostic> {
        self.whitespace();
        if self.offset == self.bytes.len() {
            Ok(())
        } else {
            Err(syntax())
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.offset).copied()
    }

    fn whitespace(&mut self) {
        while self
            .peek()
            .is_some_and(|byte| matches!(byte, b' ' | b'\n' | b'\r' | b'\t'))
        {
            self.offset += 1;
        }
    }

    fn require(&mut self, byte: u8) -> Result<(), Diagnostic> {
        self.whitespace();
        if self.peek() != Some(byte) {
            return Err(syntax());
        }

        self.offset += 1;
        Ok(())
    }

    fn literal(&mut self, literal: &[u8]) -> Result<(), Diagnostic> {
        let end = self.offset.checked_add(literal.len()).ok_or_else(syntax)?;
        if self.bytes.get(self.offset..end) != Some(literal) {
            return Err(syntax());
        }

        self.offset = end;
        Ok(())
    }

    /// Classifies the next value without consuming it.
    pub(crate) fn kind(&mut self) -> Result<Kind, Diagnostic> {
        self.whitespace();

        Ok(match self.peek().ok_or_else(syntax)? {
            b'n' => Kind::Null,
            b't' | b'f' => Kind::Logical,
            b'"' => Kind::Text,
            b'[' => Kind::Array,
            b'{' => Kind::Object,
            b'-' | b'0'..=b'9' => Kind::Number,
            _ => return Err(syntax()),
        })
    }

    pub(crate) fn null(&mut self) -> Result<(), Diagnostic> {
        self.whitespace();
        self.literal(b"null")
    }

    pub(crate) fn logical(&mut self) -> Result<bool, Diagnostic> {
        self.whitespace();
        if self.peek() == Some(b't') {
            self.literal(b"true")?;
            Ok(true)
        } else {
            self.literal(b"false")?;
            Ok(false)
        }
    }

    /// Opens an array or object; `open` is `[` or `{`.
    fn enter(&mut self, open: u8) -> Result<(), Diagnostic> {
        if self.depth >= MAX_JSON_DEPTH {
            return Err(syntax());
        }

        self.require(open)?;
        self.depth += 1;
        Ok(())
    }

    /// Consumes the closing byte or the separator; `first` tracks whether a comma is due.
    fn next_item(&mut self, close: u8, first: &mut bool) -> Result<bool, Diagnostic> {
        self.whitespace();
        if self.peek() == Some(close) {
            self.offset += 1;
            self.depth -= 1;
            return Ok(false);
        }

        if !*first {
            self.require(b',')?;
        }

        *first = false;
        Ok(true)
    }

    pub(crate) fn enter_array(&mut self) -> Result<(), Diagnostic> {
        self.enter(b'[')
    }

    /// Returns false once the array has closed.
    pub(crate) fn next_element(&mut self, first: &mut bool) -> Result<bool, Diagnostic> {
        self.next_item(b']', first)
    }

    pub(crate) fn enter_object(&mut self) -> Result<(), Diagnostic> {
        self.enter(b'{')
    }

    /// Returns the next member name, positioned at its value, or `None` once the object closed.
    pub(crate) fn next_key(&mut self, first: &mut bool) -> Result<NextKey<'a>, Diagnostic> {
        if !self.next_item(b'}', first)? {
            return Ok(None);
        }

        let key = self.string()?;
        self.require(b':')?;

        Ok(Some(key))
    }

    /// Skips one complete value of any kind, with the same nesting bound.
    pub(crate) fn skip(&mut self) -> Result<(), Diagnostic> {
        match self.kind()? {
            Kind::Null => self.null(),
            Kind::Logical => self.logical().map(|_| ()),
            Kind::Number => self.number().map(|_| ()),
            Kind::Text => self.string().map(|_| ()),
            Kind::Array => {
                self.enter_array()?;
                let mut first = true;
                while self.next_element(&mut first)? {
                    self.skip()?;
                }

                Ok(())
            }
            Kind::Object => {
                self.enter_object()?;
                let mut first = true;
                while self.next_key(&mut first)?.is_some() {
                    self.skip()?;
                }

                Ok(())
            }
        }
    }

    pub(crate) fn string(&mut self) -> Result<Cow<'a, str>, Diagnostic> {
        self.require(b'"')?;
        let mut start = self.offset;
        let mut decoded: Option<String> = None;

        loop {
            match self.peek().ok_or_else(syntax)? {
                b'"' => {
                    let segment = self.string_segment(start)?;
                    self.offset += 1;
                    return if let Some(mut owned) = decoded {
                        owned.push_str(segment);
                        Ok(Cow::Owned(owned))
                    } else {
                        Ok(Cow::Borrowed(segment))
                    };
                }
                b'\\' => {
                    let segment = self.string_segment(start)?;
                    let buffer = decoded.get_or_insert_with(String::new);
                    buffer.push_str(segment);
                    self.offset += 1;
                    buffer.push(self.escape()?);
                    start = self.offset;
                }
                0..=CONTROL_CHARACTER_END => return Err(syntax()),
                _ => self.offset += 1,
            }
        }
    }

    fn string_segment(&self, start: usize) -> Result<&'a str, Diagnostic> {
        let bytes = self.bytes.get(start..self.offset).ok_or_else(syntax)?;
        std::str::from_utf8(bytes).ok().ok_or_else(syntax)
    }

    fn escape(&mut self) -> Result<char, Diagnostic> {
        let escaped = self.peek().ok_or_else(syntax)?;
        self.offset += 1;

        match escaped {
            b'"' => Ok('"'),
            b'\\' => Ok('\\'),
            b'/' => Ok('/'),
            b'b' => Ok('\u{0008}'),
            b'f' => Ok('\u{000c}'),
            b'n' => Ok('\n'),
            b'r' => Ok('\r'),
            b't' => Ok('\t'),
            b'u' => self.unicode_escape(),
            _ => Err(syntax()),
        }
    }

    fn hex_quad(&mut self) -> Result<u32, Diagnostic> {
        let mut value = 0;
        for _ in 0..HEX_DIGITS {
            let byte = self.peek().ok_or_else(syntax)?;
            let digit = char::from(byte).to_digit(HEX_RADIX).ok_or_else(syntax)?;
            value = value * HEX_RADIX + digit;
            self.offset += 1;
        }

        Ok(value)
    }

    fn unicode_escape(&mut self) -> Result<char, Diagnostic> {
        let high = self.hex_quad()?;
        if (HIGH_SURROGATE_START..=HIGH_SURROGATE_END).contains(&high) {
            self.literal(b"\\u")?;
            let low = self.hex_quad()?;
            if !(LOW_SURROGATE_START..=LOW_SURROGATE_END).contains(&low) {
                return Err(syntax());
            }

            let scalar =
                SUPPLEMENTARY_START + ((high - HIGH_SURROGATE_START) << SURROGATE_SHIFT) + low
                    - LOW_SURROGATE_START;
            char::from_u32(scalar).ok_or_else(syntax)
        } else {
            char::from_u32(high).ok_or_else(syntax)
        }
    }

    /// Validates the RFC 8259 number grammar; out-of-range magnitudes parse to infinity.
    pub(crate) fn number(&mut self) -> Result<f64, Diagnostic> {
        self.whitespace();
        let start = self.offset;
        if self.peek() == Some(b'-') {
            self.offset += 1;
        }

        match self.peek() {
            Some(b'0') => self.offset += 1,
            Some(b'1'..=b'9') => self.digits(),
            _ => return Err(syntax()),
        }

        if self.peek() == Some(b'.') {
            self.offset += 1;
            if !self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                return Err(syntax());
            }
            self.digits();
        }

        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.offset += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.offset += 1;
            }
            if !self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                return Err(syntax());
            }
            self.digits();
        }

        let token = self.bytes.get(start..self.offset).ok_or_else(syntax)?;
        std::str::from_utf8(token)
            .ok()
            .ok_or_else(syntax)?
            .parse()
            .ok()
            .ok_or_else(syntax)
    }

    fn digits(&mut self) {
        while self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
            self.offset += 1;
        }
    }
}
