//! Power Query M translation for saved queries.
//!
//! Export writes one `section Section1;` document ([MS-QDEFF] 2.3.2). Import
//! reads M text with a bounded lexer and parser and maps only the exact
//! supported forms back to saved queries. Imported M is data: nothing in it
//! is evaluated, and no source is fetched while it is read.

mod emit;
mod import;
mod parse;
mod text;

pub use emit::{emit_section, Loss, Section};
pub use import::{import_section, SectionImport, Unsupported};

use crate::plan::{ColumnSpec, Diagnostic, Limits, Plan};
use crate::plan_wire::{definition, Cursor, PlanWire, NO_COLUMN};
use crate::wire::{decode_type, encode_type};

mod writer;
pub(crate) use writer::PlanWriter;

const SOURCE_CSV: u32 = 1;
const SOURCE_JSON: u32 = 2;
const SOURCE_HOST: u32 = 3;

/// How a saved query reads its data; mirrors `SavedQuerySource` in core.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MSourceKind {
    /// Delimited text, read with these options.
    Csv {
        /// Field separator byte.
        delimiter: u8,
        /// Whether the first record names the columns.
        headers: bool,
        /// Whether an empty field reads as null rather than empty text.
        empty_is_null: bool,
    },
    /// A JSON document whose rows are the objects of one array.
    Json {
        /// Member names leading from the root to the row array.
        path: Vec<String>,
    },
    /// Rows the host supplies, such as a worksheet table.
    Host,
}

/// Where a saved query reads its rows and the columns it declares.
#[derive(Clone, Debug)]
pub struct MSource {
    /// How the source bytes are parsed.
    pub kind: MSourceKind,
    /// The host's id for the source.
    pub source_id: String,
    /// Where the host loads the source from, such as a URL; the engine never fetches it.
    pub locator: Option<String>,
    /// Declared columns, in source order.
    pub columns: Vec<ColumnSpec>,
}

/// One saved query as the codec sees it; join inputs name other query IDs.
#[derive(Clone, Debug)]
pub struct MQuery {
    /// Stable id that join steps of other queries refer to.
    pub id: String,
    /// Display name, written as the M member name.
    pub name: String,
    /// Where the query reads its rows.
    pub source: MSource,
    /// Steps applied to the source rows, in order.
    pub steps: Plan,
    /// Output table name, written as the query's `FillTarget`.
    pub output: Option<String>,
}

fn optional_string(cursor: &mut Cursor<'_>) -> Result<Option<String>, Diagnostic> {
    // Absent strings use the same sentinel as an aggregate without a column.
    let index = cursor.code()?;
    if index == NO_COLUMN {
        return Ok(None);
    }

    cursor.string_at(index).map(Some)
}

fn flag(cursor: &mut Cursor<'_>) -> Result<bool, Diagnostic> {
    match cursor.code()? {
        0 => Ok(false),
        1 => Ok(true),
        _ => Err(definition()),
    }
}

fn query(cursor: &mut Cursor<'_>, limits: &Limits) -> Result<MQuery, Diagnostic> {
    let id = cursor.string()?;
    let name = cursor.string()?;
    let kind_code = cursor.code()?;
    let source_id = cursor.string()?;
    let locator = optional_string(cursor)?;
    let count = cursor.count()?;
    let mut columns = Vec::with_capacity(count);
    for _ in 0..count {
        let id = cursor.string()?;
        let name = cursor.string()?;
        let column_type = u8::try_from(cursor.code()?)
            .ok()
            .and_then(|code| decode_type(code).ok())
            .ok_or_else(definition)?;
        columns.push(ColumnSpec {
            id,
            name,
            column_type,
        });
    }

    let kind = match kind_code {
        SOURCE_CSV => MSourceKind::Csv {
            delimiter: u8::try_from(cursor.code()?).ok().ok_or_else(definition)?,
            headers: flag(cursor)?,
            empty_is_null: flag(cursor)?,
        },
        SOURCE_JSON => MSourceKind::Json {
            path: cursor.strings()?,
        },
        SOURCE_HOST => MSourceKind::Host,
        _ => return Err(definition()),
    };
    let output = optional_string(cursor)?;
    let steps = cursor.steps(limits)?;

    Ok(MQuery {
        id,
        name,
        source: MSource {
            kind,
            source_id,
            locator,
            columns,
        },
        steps,
        output,
    })
}

/// Decodes the query list lanes the host encoder writes: a query count, then each query.
pub fn decode_queries(wire: PlanWire<'_>, limits: &Limits) -> Result<Vec<MQuery>, Diagnostic> {
    let mut cursor = Cursor::new(wire)?;
    let count = cursor.count()?;
    let queries = (0..count)
        .map(|_| query(&mut cursor, limits))
        .collect::<Result<Vec<_>, _>>()?;

    if !cursor.finished() {
        return Err(definition());
    }

    Ok(queries)
}

/// Encodes queries in the same lane layout, for the host decoder.
pub(crate) fn encode_queries(queries: &[MQuery], writer: &mut PlanWriter) {
    writer.code_usize(queries.len());

    for query in queries {
        writer.string(&query.id);
        writer.string(&query.name);

        let source = &query.source;
        writer.code(match source.kind {
            MSourceKind::Csv { .. } => SOURCE_CSV,
            MSourceKind::Json { .. } => SOURCE_JSON,
            MSourceKind::Host => SOURCE_HOST,
        });
        writer.string(&source.source_id);
        writer.optional_string(source.locator.as_deref());
        writer.code_usize(source.columns.len());
        for column in &source.columns {
            writer.string(&column.id);
            writer.string(&column.name);
            writer.code(u32::from(encode_type(column.column_type)));
        }

        match &source.kind {
            MSourceKind::Csv {
                delimiter,
                headers,
                empty_is_null,
            } => {
                writer.code(u32::from(*delimiter));
                writer.code(u32::from(*headers));
                writer.code(u32::from(*empty_is_null));
            }
            MSourceKind::Json { path } => writer.strings(path),
            MSourceKind::Host => {}
        }

        writer.optional_string(query.output.as_deref());
        writer.steps(&query.steps);
    }
}

#[cfg(test)]
mod tests;
