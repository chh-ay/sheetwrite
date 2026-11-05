//! Source fixtures share the public parsing interface, not a second execution model.

use sheetwrite_queries::{parse_source, Batch, ColumnSpec, ColumnType, Limits, SourceSpec};

/// Stable ids remain separate from field names in every source fixture.
pub fn column(id: &str, name: &str, column_type: ColumnType) -> ColumnSpec {
    ColumnSpec {
        id: id.to_owned(),
        name: name.to_owned(),
        column_type,
    }
}

/// Input records always pass through the production schema converter.
pub fn json_batch(bytes: &[u8], columns: Vec<ColumnSpec>) -> Batch {
    let source = SourceSpec::Json {
        columns,
        path: Vec::new(),
    };

    parse_source(bytes, &source, &Limits::default()).unwrap()
}
