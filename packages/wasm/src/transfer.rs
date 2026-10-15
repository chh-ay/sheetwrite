//! Ephemeral, same-build memory transfer. Not a persistence or document format.
//!
//! All payloads cross JS as packed bytes; parsed ASTs and capacity slack never do.
use crate::types::{FormulaError, StringStorage};

pub(crate) type TransferResult<T> = Result<T, String>;

#[cfg(target_arch = "wasm32")]
pub(crate) type TransferInput<'a> = js_sys::Uint8Array;

#[cfg(not(target_arch = "wasm32"))]
pub(crate) type TransferInput<'a> = &'a [u8];

pub(crate) struct Writer(pub(crate) Vec<u8>);

impl Writer {
    pub(crate) fn new(tag: u32) -> Self {
        let mut out = Self(Vec::new());
        out.u32(tag);
        out
    }

    pub(crate) fn u32(&mut self, value: u32) {
        self.0.extend_from_slice(&value.to_le_bytes());
    }

    pub(crate) fn usize(&mut self, value: usize) {
        self.u32(value as u32);
    }

    pub(crate) fn u64(&mut self, value: u64) {
        self.0.extend_from_slice(&value.to_le_bytes());
    }

    pub(crate) fn bool(&mut self, value: bool) {
        self.0.push(u8::from(value));
    }

    pub(crate) fn bytes(&mut self, value: &[u8]) {
        self.usize(value.len());
        let mut start = 0;

        while start < value.len() {
            let is_zero = value[start] == 0;
            let mut end = start + 1;

            while end < value.len()
                && end - start < (u32::MAX >> 1) as usize
                && (value[end] == 0) == is_zero
            {
                end += 1;
            }

            self.u32(((end - start) as u32) << 1 | u32::from(!is_zero));
            if !is_zero {
                self.0.extend_from_slice(&value[start..end]);
            }

            start = end;
        }
    }

    pub(crate) fn text(&mut self, value: &str) {
        self.bytes(value.as_bytes());
    }

    pub(crate) fn words(&mut self, value: &[u64]) {
        // WASM is little-endian; borrow the backing bytes instead of packing a second vector.
        self.bytes(unsafe {
            std::slice::from_raw_parts(value.as_ptr().cast(), std::mem::size_of_val(value))
        });
    }

    pub(crate) fn ints(&mut self, value: &[u32]) {
        self.bytes(unsafe {
            std::slice::from_raw_parts(value.as_ptr().cast(), std::mem::size_of_val(value))
        });
    }

    pub(crate) fn strings(&mut self, strings: &StringStorage) {
        self.usize(strings.len());

        for id in 0..strings.len() {
            self.text(strings.get(id as u32).expect("pool ID"));
        }

        self.u32(strings.epoch);
    }

    pub(crate) fn error(&mut self, error: Option<FormulaError>) {
        self.u32(error.map_or(u32::MAX, |error| error.slot() as u32));
    }
}

pub(crate) struct Reader<'a> {
    #[cfg(not(target_arch = "wasm32"))]
    bytes: &'a [u8],
    #[cfg(target_arch = "wasm32")]
    _native_borrow: std::marker::PhantomData<&'a [u8]>,
    #[cfg(target_arch = "wasm32")]
    source: js_sys::Uint8Array,
    #[cfg(target_arch = "wasm32")]
    buffer: Vec<u8>,
    #[cfg(target_arch = "wasm32")]
    offset: usize,
}

impl<'a> Reader<'a> {
    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn new(bytes: &'a [u8], tag: u32) -> TransferResult<Self> {
        let mut input = Self { bytes };

        if input.u32()? != tag {
            return Err("invalid engine memory transfer".into());
        }

        Ok(input)
    }

    #[cfg(target_arch = "wasm32")]
    pub(crate) fn new(source: js_sys::Uint8Array, tag: u32) -> TransferResult<Self> {
        let mut input = Self {
            _native_borrow: std::marker::PhantomData,
            source,
            buffer: Vec::new(),
            offset: 0,
        };

        if input.u32()? != tag {
            return Err("invalid engine memory transfer".into());
        }

        Ok(input)
    }

    fn remaining(&self) -> usize {
        #[cfg(target_arch = "wasm32")]
        {
            self.source.length() as usize - self.offset
        }

        #[cfg(not(target_arch = "wasm32"))]
        {
            self.bytes.len()
        }
    }

    fn read_exact(&mut self, output: &mut [u8]) -> TransferResult<()> {
        if output.len() > self.remaining() {
            return Err("truncated engine memory transfer".into());
        }

        #[cfg(target_arch = "wasm32")]
        {
            const CHUNK_BYTES: usize = 64 * 1024;
            let mut written = 0;

            while written < output.len() {
                let cursor = self.offset % CHUNK_BYTES;
                if cursor == 0 {
                    let length = CHUNK_BYTES.min(self.remaining());
                    self.buffer.resize(length, 0);
                    self.source
                        .subarray(self.offset as u32, (self.offset + length) as u32)
                        .copy_to(&mut self.buffer);
                }

                let length = (self.buffer.len() - cursor).min(output.len() - written);
                output[written..written + length]
                    .copy_from_slice(&self.buffer[cursor..cursor + length]);
                self.offset += length;
                written += length;
            }
        }

        #[cfg(not(target_arch = "wasm32"))]
        {
            let (value, rest) = self.bytes.split_at(output.len());
            output.copy_from_slice(value);
            self.bytes = rest;
        }

        Ok(())
    }

    fn fixed<const N: usize>(&mut self) -> TransferResult<[u8; N]> {
        let mut value = [0; N];
        self.read_exact(&mut value)?;
        Ok(value)
    }

    pub(crate) fn u32(&mut self) -> TransferResult<u32> {
        Ok(u32::from_le_bytes(self.fixed()?))
    }

    pub(crate) fn usize(&mut self) -> TransferResult<usize> {
        Ok(self.u32()? as usize)
    }

    pub(crate) fn u64(&mut self) -> TransferResult<u64> {
        Ok(u64::from_le_bytes(self.fixed()?))
    }

    pub(crate) fn bool(&mut self) -> TransferResult<bool> {
        match self.fixed::<1>()?[0] {
            0 => Ok(false),
            1 => Ok(true),
            _ => Err("invalid transfer flag".into()),
        }
    }

    pub(crate) fn count(&mut self) -> TransferResult<usize> {
        let count = self.usize()?;
        if count > self.remaining() {
            return Err("invalid transfer count".into());
        }

        Ok(count)
    }

    fn array<T: Copy + Default>(&mut self) -> TransferResult<Vec<T>> {
        let length = self.usize()?;
        let width = std::mem::size_of::<T>();
        if length % width != 0 {
            return Err("invalid transfer length".into());
        }

        let mut values = vec![T::default(); length / width];
        // Only u8/u32/u64 call this method, and every bit pattern is valid for them.
        let bytes =
            unsafe { std::slice::from_raw_parts_mut(values.as_mut_ptr().cast::<u8>(), length) };
        self.fill_array(bytes)?;
        Ok(values)
    }

    // Share the run decoder across element widths instead of duplicating it in WASM.
    #[inline(never)]
    fn fill_array(&mut self, bytes: &mut [u8]) -> TransferResult<()> {
        let mut offset = 0;

        while offset < bytes.len() {
            let run = self.u32()?;
            let count = (run >> 1) as usize;
            if count == 0 || count > bytes.len() - offset {
                return Err("invalid transfer run".into());
            }

            if run & 1 != 0 {
                self.read_exact(&mut bytes[offset..offset + count])?;
            }

            offset += count;
        }

        Ok(())
    }

    pub(crate) fn bytes(&mut self) -> TransferResult<Vec<u8>> {
        self.array()
    }

    pub(crate) fn text(&mut self) -> TransferResult<String> {
        String::from_utf8(self.bytes()?).map_err(|_| "invalid transfer UTF-8".into())
    }

    pub(crate) fn words(&mut self) -> TransferResult<Vec<u64>> {
        self.array()
    }

    pub(crate) fn ints(&mut self) -> TransferResult<Vec<u32>> {
        self.array()
    }

    pub(crate) fn strings(&mut self) -> TransferResult<StringStorage> {
        let mut strings = StringStorage::new();

        for id in 0..self.count()? {
            if strings.intern(&self.text()?) != id as u32 {
                return Err("duplicate transfer string".into());
            }
        }

        strings.epoch = self.u32()?;
        Ok(strings)
    }

    pub(crate) fn error(&mut self) -> TransferResult<Option<FormulaError>> {
        use FormulaError::*;
        match self.u32()? {
            u32::MAX => Ok(None),
            value @ 0..=10 => Ok(Some(
                [
                    Cycle, DivZero, Ref, Num, Value, Name, Na, Spill, Calc, Loading, Null,
                ][value as usize],
            )),
            _ => Err("invalid transfer error".into()),
        }
    }

    pub(crate) fn finish(self) -> TransferResult<()> {
        if self.remaining() == 0 {
            Ok(())
        } else {
            Err("trailing engine memory transfer".into())
        }
    }
}
