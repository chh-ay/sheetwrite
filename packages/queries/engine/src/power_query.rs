//! WASM bindings for the Power Query codec. Lanes move out once, as in `transport`.

use std::mem;

use wasm_bindgen::prelude::*;

use crate::buffers::saturating_u32;
use crate::m::{decode_queries, emit_section, encode_queries, import_section, PlanWriter};
use crate::plan::{Diagnostic, Limits};
use crate::plan_wire::{PlanWire, NO_COLUMN};
use crate::transport::error;

/// Section documents above this size are rejected before lexing.
const MAX_SECTION_BYTES: usize = 4 * 1024 * 1024;

/// A string table with one entry per item, packed as UTF-8 plus offsets.
#[derive(Debug, Default)]
struct Strings {
    text: Vec<u8>,
    offsets: Vec<u32>,
}

impl Strings {
    fn push(&mut self, value: &str) {
        if self.offsets.is_empty() {
            self.offsets.push(0);
        }

        self.text.extend_from_slice(value.as_bytes());
        self.offsets.push(saturating_u32(self.text.len()));
    }

    fn finish(mut self) -> Self {
        if self.offsets.is_empty() {
            self.offsets.push(0);
        }

        self
    }
}

/// Section text, member names, and differences as (query, step or `NO_COLUMN`, code) triples.
#[wasm_bindgen(js_name = PowerQuerySection)]
#[derive(Debug)]
#[allow(
    unnameable_types,
    reason = "a wasm-bindgen export that only JavaScript names"
)]
pub struct PowerQuerySection {
    text: String,
    members: Strings,
    losses: Vec<u32>,
    loss_codes: Strings,
}

#[wasm_bindgen]
impl PowerQuerySection {
    #[wasm_bindgen(js_name = takeText)]
    pub fn take_text(&mut self) -> String {
        mem::take(&mut self.text)
    }

    #[wasm_bindgen(js_name = takeMemberText)]
    pub fn take_member_text(&mut self) -> Vec<u8> {
        mem::take(&mut self.members.text)
    }

    #[wasm_bindgen(js_name = takeMemberOffsets)]
    pub fn take_member_offsets(&mut self) -> Vec<u32> {
        mem::take(&mut self.members.offsets)
    }

    /// Three codes per difference; the third indexes the loss code strings.
    #[wasm_bindgen(js_name = takeLosses)]
    pub fn take_losses(&mut self) -> Vec<u32> {
        mem::take(&mut self.losses)
    }

    #[wasm_bindgen(js_name = takeLossText)]
    pub fn take_loss_text(&mut self) -> Vec<u8> {
        mem::take(&mut self.loss_codes.text)
    }

    #[wasm_bindgen(js_name = takeLossOffsets)]
    pub fn take_loss_offsets(&mut self) -> Vec<u32> {
        mem::take(&mut self.loss_codes.offsets)
    }
}

/// Writes saved queries, encoded as query-list lanes, as one M section.
#[wasm_bindgen(js_name = emitPowerQuery)]
#[allow(unreachable_pub, reason = "a wasm-bindgen export")]
pub fn emit_power_query(
    codes: &[u32],
    numbers: &[f64],
    text: &[u8],
    offsets: &[u32],
) -> Result<PowerQuerySection, JsValue> {
    let queries = decode_queries(
        PlanWire {
            codes,
            numbers,
            text,
            offsets,
        },
        &Limits::default(),
    )
    .map_err(error)?;
    let section = emit_section(&queries);

    let mut members = Strings::default();
    for member in &section.members {
        members.push(member);
    }

    let mut losses = Vec::with_capacity(section.losses.len() * 3);
    let mut loss_codes = Strings::default();
    for (position, loss) in section.losses.iter().enumerate() {
        losses.push(saturating_u32(loss.query));
        losses.push(loss.step.map_or(NO_COLUMN, saturating_u32));
        losses.push(saturating_u32(position));
        loss_codes.push(loss.code);
    }

    Ok(PowerQuerySection {
        text: section.text,
        members: members.finish(),
        losses,
        loss_codes: loss_codes.finish(),
    })
}

/// Imported queries as query-list lanes, and unsupported members as
/// (start, end) byte spans with name, reason and detail strings.
#[wasm_bindgen(js_name = PowerQueryImport)]
#[derive(Debug)]
#[allow(
    unnameable_types,
    reason = "a wasm-bindgen export that only JavaScript names"
)]
pub struct PowerQueryImport {
    queries: PlanWriter,
    spans: Vec<u32>,
    unsupported: Strings,
}

#[wasm_bindgen]
impl PowerQueryImport {
    #[wasm_bindgen(js_name = takeCodes)]
    pub fn take_codes(&mut self) -> Vec<u32> {
        mem::take(&mut self.queries.codes)
    }

    #[wasm_bindgen(js_name = takeNumbers)]
    pub fn take_numbers(&mut self) -> Vec<f64> {
        mem::take(&mut self.queries.numbers)
    }

    #[wasm_bindgen(js_name = takeText)]
    pub fn take_text(&mut self) -> Vec<u8> {
        mem::take(&mut self.queries.text)
    }

    #[wasm_bindgen(js_name = takeOffsets)]
    pub fn take_offsets(&mut self) -> Vec<u32> {
        mem::take(&mut self.queries.offsets)
    }

    /// Two UTF-8 byte offsets per unsupported member: start and end of its text.
    #[wasm_bindgen(js_name = takeSpans)]
    pub fn take_spans(&mut self) -> Vec<u32> {
        mem::take(&mut self.spans)
    }

    /// Three strings per unsupported member: name, reason and detail.
    #[wasm_bindgen(js_name = takeUnsupportedText)]
    pub fn take_unsupported_text(&mut self) -> Vec<u8> {
        mem::take(&mut self.unsupported.text)
    }

    #[wasm_bindgen(js_name = takeUnsupportedOffsets)]
    pub fn take_unsupported_offsets(&mut self) -> Vec<u32> {
        mem::take(&mut self.unsupported.offsets)
    }
}

/// Reads an M section document without evaluating it.
#[wasm_bindgen(js_name = importPowerQuery)]
#[allow(unreachable_pub, reason = "a wasm-bindgen export")]
pub fn import_power_query(text: &str) -> Result<PowerQueryImport, JsValue> {
    if text.len() > MAX_SECTION_BYTES {
        return Err(error(Diagnostic::limit()));
    }

    let (queries, unsupported) =
        import_section(text).map_err(|reason| error(Diagnostic::new(reason)))?;

    let mut writer = PlanWriter::default();
    encode_queries(&queries, &mut writer);

    let mut spans = Vec::with_capacity(unsupported.len() * 2);
    let mut strings = Strings::default();
    for entry in &unsupported {
        spans.push(saturating_u32(entry.span.start));
        spans.push(saturating_u32(entry.span.end));
        strings.push(&entry.member);
        strings.push(entry.reason);
        strings.push(&entry.detail);
    }

    Ok(PowerQueryImport {
        queries: writer.finish(),
        spans,
        unsupported: strings.finish(),
    })
}
