//! Ephemeral, same-build memory transfer. Not a persistence or document format.
//!
//! All payloads cross JS as packed bytes; parsed ASTs and capacity slack never do.
use crate::types::{FormulaError, StringStorage};

pub(crate) type TransferResult<T> = Result<T, String>;

pub(crate) struct Writer(pub(crate) Vec<u8>);
impl Writer {
    pub(crate) fn new(tag: u32) -> Self {
        let mut out = Self(Vec::new());
        out.u32(tag);
        out
    }
    pub(crate) fn u32(&mut self, value: u32) { self.0.extend_from_slice(&value.to_le_bytes()); }
    pub(crate) fn usize(&mut self, value: usize) { self.u32(value as u32); }
    pub(crate) fn u64(&mut self, value: u64) { self.0.extend_from_slice(&value.to_le_bytes()); }
    pub(crate) fn bool(&mut self, value: bool) { self.0.push(u8::from(value)); }
    pub(crate) fn bytes(&mut self, value: &[u8]) { self.usize(value.len()); self.0.extend_from_slice(value); }
    pub(crate) fn text(&mut self, value: &str) { self.bytes(value.as_bytes()); }
    pub(crate) fn words(&mut self, value: &[u64]) {
        self.usize(value.len());
        for &item in value { self.u64(item); }
    }
    pub(crate) fn ints(&mut self, value: &[u32]) {
        self.usize(value.len());
        for &item in value { self.u32(item); }
    }
    pub(crate) fn strings(&mut self, strings: &StringStorage) {
        self.usize(strings.len());
        for id in 0..strings.len() { self.text(strings.get(id as u32).expect("pool ID")); }
        self.u32(strings.epoch);
    }
    pub(crate) fn error(&mut self, error: Option<FormulaError>) {
        self.u32(error.map_or(u32::MAX, |error| error.slot() as u32));
    }
}

pub(crate) struct Reader<'a>(&'a [u8]);
impl<'a> Reader<'a> {
    pub(crate) fn new(bytes: &'a [u8], tag: u32) -> TransferResult<Self> {
        let mut input = Self(bytes);
        if input.u32()? != tag { return Err("invalid engine memory transfer".into()); }
        Ok(input)
    }
    fn take(&mut self, count: usize) -> TransferResult<&'a [u8]> {
        if count > self.0.len() { return Err("truncated engine memory transfer".into()); }
        let (value, rest) = self.0.split_at(count);
        self.0 = rest;
        Ok(value)
    }
    pub(crate) fn u32(&mut self) -> TransferResult<u32> { Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap())) }
    pub(crate) fn usize(&mut self) -> TransferResult<usize> { Ok(self.u32()? as usize) }
    pub(crate) fn u64(&mut self) -> TransferResult<u64> { Ok(u64::from_le_bytes(self.take(8)?.try_into().unwrap())) }
    pub(crate) fn bool(&mut self) -> TransferResult<bool> {
        match self.take(1)?[0] { 0 => Ok(false), 1 => Ok(true), _ => Err("invalid transfer flag".into()) }
    }
    pub(crate) fn count(&mut self) -> TransferResult<usize> {
        let count = self.usize()?;
        if count > self.0.len() { return Err("invalid transfer count".into()); }
        Ok(count)
    }
    pub(crate) fn bytes(&mut self) -> TransferResult<Vec<u8>> {
        let count = self.usize()?;
        Ok(self.take(count)?.to_vec())
    }
    pub(crate) fn text(&mut self) -> TransferResult<String> {
        String::from_utf8(self.bytes()?).map_err(|_| "invalid transfer UTF-8".into())
    }
    pub(crate) fn words(&mut self) -> TransferResult<Vec<u64>> {
        let count = self.usize()?;
        let bytes = self.take(count.checked_mul(8).ok_or("invalid transfer length")?)?;
        Ok(bytes.chunks_exact(8).map(|item| u64::from_le_bytes(item.try_into().unwrap())).collect())
    }
    pub(crate) fn ints(&mut self) -> TransferResult<Vec<u32>> {
        let count = self.usize()?;
        let bytes = self.take(count.checked_mul(4).ok_or("invalid transfer length")?)?;
        Ok(bytes.chunks_exact(4).map(|item| u32::from_le_bytes(item.try_into().unwrap())).collect())
    }
    pub(crate) fn strings(&mut self) -> TransferResult<StringStorage> {
        let mut strings = StringStorage::new();
        for id in 0..self.count()? {
            if strings.intern(&self.text()?) != id as u32 { return Err("duplicate transfer string".into()); }
        }
        strings.epoch = self.u32()?;
        Ok(strings)
    }
    pub(crate) fn error(&mut self) -> TransferResult<Option<FormulaError>> {
        use FormulaError::*;
        match self.u32()? {
            u32::MAX => Ok(None),
            value @ 0..=10 => Ok(Some([Cycle, DivZero, Ref, Num, Value, Name, Na, Spill, Calc, Loading, Null][value as usize])),
            _ => Err("invalid transfer error".into()),
        }
    }
    pub(crate) fn finish(self) -> TransferResult<()> {
        if self.0.is_empty() { Ok(()) } else { Err("trailing engine memory transfer".into()) }
    }
}
