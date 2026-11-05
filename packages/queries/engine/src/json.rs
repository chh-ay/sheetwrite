//! A bounded streaming JSON reader for source records and small saved plans.
//!
//! Borrowed UTF-8 strings stay borrowed. Only escaped strings need a decode buffer.

use std::{borrow::Cow, fmt};

use serde::de::{self, DeserializeSeed, IntoDeserializer, MapAccess, SeqAccess, Visitor};

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

/// Syntax failures never include source text, which can contain private values.
#[derive(Debug)]
pub(crate) struct JsonError;

impl fmt::Display for JsonError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("invalid JSON")
    }
}

impl std::error::Error for JsonError {}

impl de::Error for JsonError {
    fn custom<T: fmt::Display>(_message: T) -> Self {
        Self
    }
}

/// The cursor owns no source data and limits nesting before visiting child values.
pub(crate) struct Deserializer<'a> {
    bytes: &'a [u8],
    offset: usize,
    depth: usize,
}

impl<'a> Deserializer<'a> {
    /// The caller keeps the byte slice alive for every borrowed visitor value.
    pub(crate) fn new(bytes: &'a [u8]) -> Self {
        Self {
            bytes,
            offset: 0,
            depth: 0,
        }
    }

    /// A complete document has no non-whitespace bytes after its root value.
    pub(crate) fn end(&mut self) -> Result<(), JsonError> {
        self.whitespace();
        if self.offset == self.bytes.len() {
            Ok(())
        } else {
            Err(JsonError)
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

    fn require(&mut self, byte: u8) -> Result<(), JsonError> {
        self.whitespace();
        if self.peek() != Some(byte) {
            return Err(JsonError);
        }

        self.offset += 1;
        Ok(())
    }

    fn literal(&mut self, literal: &[u8]) -> Result<(), JsonError> {
        let end = self.offset.checked_add(literal.len()).ok_or(JsonError)?;
        if self.bytes.get(self.offset..end) != Some(literal) {
            return Err(JsonError);
        }

        self.offset = end;
        Ok(())
    }

    fn string(&mut self) -> Result<Cow<'a, str>, JsonError> {
        self.require(b'"')?;
        let mut start = self.offset;
        let mut decoded: Option<String> = None;

        loop {
            match self.peek().ok_or(JsonError)? {
                b'"' => {
                    let segment = self.string_segment(start)?;
                    self.offset += 1;
                    return if let Some(mut decoded) = decoded {
                        decoded.push_str(segment);
                        Ok(Cow::Owned(decoded))
                    } else {
                        Ok(Cow::Borrowed(segment))
                    };
                }
                b'\\' => {
                    let segment = self.string_segment(start)?;
                    let decoded = decoded.get_or_insert_with(String::new);
                    decoded.push_str(segment);
                    self.offset += 1;
                    decoded.push(self.escape()?);
                    start = self.offset;
                }
                0..=CONTROL_CHARACTER_END => return Err(JsonError),
                _ => self.offset += 1,
            }
        }
    }

    fn string_segment(&self, start: usize) -> Result<&'a str, JsonError> {
        let bytes = self.bytes.get(start..self.offset).ok_or(JsonError)?;
        std::str::from_utf8(bytes).map_err(|_| JsonError)
    }

    fn escape(&mut self) -> Result<char, JsonError> {
        let escaped = self.peek().ok_or(JsonError)?;
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
            _ => Err(JsonError),
        }
    }

    fn hex_quad(&mut self) -> Result<u32, JsonError> {
        let mut value = 0;
        for _ in 0..HEX_DIGITS {
            let byte = self.peek().ok_or(JsonError)?;
            let digit = char::from(byte).to_digit(HEX_RADIX).ok_or(JsonError)?;
            value = value * HEX_RADIX + digit;
            self.offset += 1;
        }

        Ok(value)
    }

    fn unicode_escape(&mut self) -> Result<char, JsonError> {
        let high = self.hex_quad()?;
        if (HIGH_SURROGATE_START..=HIGH_SURROGATE_END).contains(&high) {
            self.literal(b"\\u")?;
            let low = self.hex_quad()?;
            if !(LOW_SURROGATE_START..=LOW_SURROGATE_END).contains(&low) {
                return Err(JsonError);
            }

            let scalar =
                SUPPLEMENTARY_START + ((high - HIGH_SURROGATE_START) << SURROGATE_SHIFT) + low
                    - LOW_SURROGATE_START;
            char::from_u32(scalar).ok_or(JsonError)
        } else {
            char::from_u32(high).ok_or(JsonError)
        }
    }

    fn number(&mut self) -> Result<f64, JsonError> {
        let start = self.offset;
        if self.peek() == Some(b'-') {
            self.offset += 1;
        }

        match self.peek() {
            Some(b'0') => self.offset += 1,
            Some(b'1'..=b'9') => self.digits(),
            _ => return Err(JsonError),
        }

        if self.peek() == Some(b'.') {
            self.offset += 1;
            if !self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                return Err(JsonError);
            }
            self.digits();
        }

        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.offset += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.offset += 1;
            }
            if !self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                return Err(JsonError);
            }
            self.digits();
        }

        let token = self.bytes.get(start..self.offset).ok_or(JsonError)?;
        std::str::from_utf8(token)
            .map_err(|_| JsonError)?
            .parse()
            .map_err(|_| JsonError)
    }

    fn digits(&mut self) {
        while self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
            self.offset += 1;
        }
    }
}

/// Small plan metadata uses the same reader as source records, with a complete-root check.
pub(crate) fn from_slice<'a, T: serde::Deserialize<'a>>(bytes: &'a [u8]) -> Result<T, JsonError> {
    let mut deserializer = Deserializer::new(bytes);
    let value = T::deserialize(&mut deserializer)?;
    deserializer.end()?;
    Ok(value)
}

impl<'de> de::Deserializer<'de> for &mut Deserializer<'de> {
    type Error = JsonError;

    fn deserialize_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, JsonError> {
        self.whitespace();
        match self.peek().ok_or(JsonError)? {
            b'n' => {
                self.literal(b"null")?;
                visitor.visit_unit()
            }
            b't' => {
                self.literal(b"true")?;
                visitor.visit_bool(true)
            }
            b'f' => {
                self.literal(b"false")?;
                visitor.visit_bool(false)
            }
            b'"' => match self.string()? {
                Cow::Borrowed(value) => visitor.visit_borrowed_str(value),
                Cow::Owned(value) => visitor.visit_string(value),
            },
            b'[' | b'{' => {
                if self.depth >= MAX_JSON_DEPTH {
                    return Err(JsonError);
                }
                let opening = self.peek().ok_or(JsonError)?;
                self.offset += 1;
                self.depth += 1;

                let result = if opening == b'[' {
                    visitor.visit_seq(Sequence {
                        parser: self,
                        first: true,
                    })
                } else {
                    visitor.visit_map(Record {
                        parser: self,
                        first: true,
                    })
                };
                self.depth -= 1;
                result
            }
            b'-' | b'0'..=b'9' => visitor.visit_f64(self.number()?),
            _ => Err(JsonError),
        }
    }

    fn deserialize_option<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, JsonError> {
        self.whitespace();
        if self.peek() == Some(b'n') {
            self.literal(b"null")?;
            visitor.visit_none()
        } else {
            visitor.visit_some(self)
        }
    }

    fn deserialize_enum<V: Visitor<'de>>(
        self,
        _name: &'static str,
        _variants: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, JsonError> {
        visitor.visit_enum(self.string()?.into_deserializer())
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 char str string bytes byte_buf
        unit unit_struct newtype_struct seq tuple tuple_struct map struct identifier ignored_any
    }
}

struct Sequence<'a, 'de> {
    parser: &'a mut Deserializer<'de>,
    first: bool,
}

impl<'de> SeqAccess<'de> for Sequence<'_, 'de> {
    type Error = JsonError;

    fn next_element_seed<T: DeserializeSeed<'de>>(
        &mut self,
        seed: T,
    ) -> Result<Option<T::Value>, JsonError> {
        self.parser.whitespace();
        if self.parser.peek() == Some(b']') {
            self.parser.offset += 1;
            return Ok(None);
        }
        if !self.first {
            self.parser.require(b',')?;
        }
        self.first = false;

        seed.deserialize(&mut *self.parser).map(Some)
    }
}

struct Record<'a, 'de> {
    parser: &'a mut Deserializer<'de>,
    first: bool,
}

impl<'de> MapAccess<'de> for Record<'_, 'de> {
    type Error = JsonError;

    fn next_key_seed<T: DeserializeSeed<'de>>(
        &mut self,
        seed: T,
    ) -> Result<Option<T::Value>, JsonError> {
        self.parser.whitespace();
        if self.parser.peek() == Some(b'}') {
            self.parser.offset += 1;
            return Ok(None);
        }
        if !self.first {
            self.parser.require(b',')?;
        }

        self.parser.whitespace();
        if self.parser.peek() != Some(b'"') {
            return Err(JsonError);
        }

        self.first = false;

        let key = seed.deserialize(&mut *self.parser)?;
        self.parser.require(b':')?;
        Ok(Some(key))
    }

    fn next_value_seed<T: DeserializeSeed<'de>>(&mut self, seed: T) -> Result<T::Value, JsonError> {
        seed.deserialize(&mut *self.parser)
    }
}
