//! Writes saved queries as one Power Query section. Each step becomes one `let`
//! binding, built only from functions documented in the M function reference:
//! <https://learn.microsoft.com/powerquery-m/power-query-m-function-reference>
//!
//! Where an M default differs from the engine, the binding says so explicitly:
//! `Table.Sort`, `Table.Group` and `Table.Join` do not promise a row order, so
//! joins sort by keys and then by added row-index columns, and groups sort by
//! their keys, which gives the engine's order.

use super::text::{field, identifier, member_name, number, text};
use super::{MQuery, MSourceKind};
use crate::plan::{
    Aggregate, AggregateOp, ColumnType, CompareOp, ErrorPolicy, JoinKind, Literal, Predicate, Step,
};

/// Culture for every type conversion, so a refresh does not depend on the user's locale.
const CULTURE: &str = "en-US";
/// UTF-8, the encoding the engine reads ([MS-QDEFF] code page values follow Windows code pages).
const UTF8_CODE_PAGE: u32 = 65_001;
const LEFT_ROW: &str = "Sheetwrite.LeftRow";
const RIGHT_ROW: &str = "Sheetwrite.RightRow";

/// A difference between the engine's behavior and the exported M, reported with the export.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Loss {
    /// Position of the query in the list given to [`emit_section`].
    pub query: usize,
    /// Zero-based index of the step, or `None` when the difference is in the source.
    pub step: Option<usize>,
    /// Stable code that names the difference, such as `member-name`.
    pub code: &'static str,
}

/// The section text, each query's member name, and every reported difference.
#[derive(Debug)]
pub struct Section {
    /// The whole `section Section1;` document.
    pub text: String,
    /// The member name of each query, in input order.
    pub members: Vec<String>,
    /// Every difference found while writing.
    pub losses: Vec<Loss>,
}

#[derive(Clone)]
struct Column {
    id: String,
    name: String,
    kind: ColumnType,
}

const fn type_value(kind: ColumnType) -> &'static str {
    match kind {
        ColumnType::Number => "type number",
        ColumnType::Logical => "type logical",
        ColumnType::Text => "type text",
        ColumnType::Date => "type date",
        ColumnType::DateTime => "type datetime",
        ColumnType::Mixed => "type any",
    }
}

fn name_list(out: &mut String, names: &[&str]) {
    out.push('{');
    for (index, name) in names.iter().enumerate() {
        if index > 0 {
            out.push_str(", ");
        }

        text(out, name);
    }
    out.push('}');
}

/// A written query's member name and output columns, for joins in later queries.
struct MemberSchema {
    member: String,
    columns: Vec<Column>,
    /// The query's stable id, which join steps name.
    query: String,
}

/// A join step's right input, key pairs and kind.
struct JoinStep<'s> {
    other: &'s str,
    keys: &'s [(String, String)],
    join: JoinKind,
}

/// `Table.TransformColumnTypes` of one column, in the fixed culture.
fn type_conversion(input: &str, name: &str, column_type: ColumnType) -> String {
    let mut conversion = String::from("Table.TransformColumnTypes(");
    conversion.push_str(input);
    conversion.push_str(", {{");
    text(&mut conversion, name);
    conversion.push_str(", ");
    conversion.push_str(type_value(column_type));
    conversion.push_str("}}, ");
    text(&mut conversion, CULTURE);
    conversion.push(')');
    conversion
}

struct Writer<'a> {
    query: usize,
    columns: Vec<Column>,
    losses: &'a mut Vec<Loss>,
    schemas: &'a [MemberSchema],
}

impl Writer<'_> {
    fn loss(&mut self, step: Option<usize>, code: &'static str) {
        self.losses.push(Loss {
            query: self.query,
            step,
            code,
        });
    }

    /// Display name of a column identity; unknown identities fail in the engine
    /// before export, so the identity itself is the fallback.
    fn name<'b>(&'b self, id: &'b str) -> &'b str {
        self.columns
            .iter()
            .find(|column| column.id == id)
            .map_or(id, |column| column.name.as_str())
    }

    fn literal(out: &mut String, literal: &Literal) {
        match literal {
            Literal::Null => out.push_str("null"),
            Literal::Logical(true) => out.push_str("true"),
            Literal::Logical(false) => out.push_str("false"),
            Literal::Number(value) => number(out, *value),
            Literal::Text(value) => text(out, value),
        }
    }

    fn predicate(&self, out: &mut String, predicate: &Predicate) {
        match predicate {
            Predicate::Compare { column, op, value } => {
                field(out, self.name(column));
                out.push_str(match op {
                    CompareOp::Eq => " = ",
                    CompareOp::Neq => " <> ",
                    CompareOp::Lt => " < ",
                    CompareOp::Lte => " <= ",
                    CompareOp::Gt => " > ",
                    CompareOp::Gte => " >= ",
                });
                Self::literal(out, value);
            }
            Predicate::IsNull { column } => {
                field(out, self.name(column));
                out.push_str(" = null");
            }
            Predicate::Contains {
                column,
                text: needle,
            } => {
                out.push_str("Text.Contains(");
                field(out, self.name(column));
                out.push_str(", ");
                text(out, needle);
                out.push(')');
            }
            Predicate::And { predicates } | Predicate::Or { predicates } => {
                let operator = if matches!(predicate, Predicate::And { .. }) {
                    " and "
                } else {
                    " or "
                };

                // An empty conjunction is true and an empty disjunction is false, as in the engine.
                if predicates.is_empty() {
                    out.push_str(if operator == " and " { "true" } else { "false" });
                    return;
                }

                out.push('(');
                for (index, child) in predicates.iter().enumerate() {
                    if index > 0 {
                        out.push_str(operator);
                    }

                    out.push('(');
                    self.predicate(out, child);
                    out.push(')');
                }
                out.push(')');
            }
            Predicate::Not { predicate: inner } => {
                out.push_str("not (");
                self.predicate(out, inner);
                out.push(')');
            }
        }
    }

    fn sort(out: &mut String, input: &str, names: &[&str]) {
        out.push_str("Table.Sort(");
        out.push_str(input);
        out.push_str(", {");
        for (index, name) in names.iter().enumerate() {
            if index > 0 {
                out.push_str(", ");
            }

            out.push('{');
            text(out, name);
            out.push_str(", Order.Ascending}");
        }
        out.push_str("})");
    }

    /// Writes one step as an expression over `input` and updates the tracked schema.
    fn step(&mut self, out: &mut String, input: &str, step: &Step, index: usize) {
        match step {
            Step::Filter { predicate } => {
                // Only logical true selects a row, so null predicates drop rows as in the engine.
                out.push_str("Table.SelectRows(");
                out.push_str(input);
                out.push_str(", each (");
                self.predicate(out, predicate);
                out.push_str(") = true)");
            }
            Step::Select { columns } => self.select(out, input, columns),
            Step::Rename { columns } => self.rename(out, input, columns),
            Step::ChangeType {
                column,
                column_type,
                on_error,
            } => {
                let name = self.name(column).to_owned();
                let conversion = type_conversion(input, &name, *column_type);

                if *on_error == ErrorPolicy::Null {
                    // Table.ReplaceErrorValues also replaces errors that existed before this step.
                    self.loss(Some(index), "error-policy-scope");
                    out.push_str("Table.ReplaceErrorValues(");
                    out.push_str(&conversion);
                    out.push_str(", {{");
                    text(out, &name);
                    out.push_str(", null}})");
                } else {
                    out.push_str(&conversion);
                }

                if let Some(target) = self.columns.iter_mut().find(|entry| &entry.id == column) {
                    target.kind = *column_type;
                }
            }
            Step::Join {
                input: other,
                keys,
                join,
            } => self.join(
                out,
                input,
                JoinStep {
                    other,
                    keys,
                    join: *join,
                },
                index,
            ),
            Step::Group { keys, aggregates } => self.group(out, input, keys, aggregates),
            Step::Unpivot {
                columns,
                attribute,
                value,
            } => {
                let names: Vec<&str> = columns.iter().map(|id| self.name(id)).collect();
                out.push_str("Table.Unpivot(");
                out.push_str(input);
                out.push_str(", ");
                name_list(out, &names);
                out.push_str(", ");
                text(out, &attribute.name);
                out.push_str(", ");
                text(out, &value.name);
                out.push(')');

                self.columns.retain(|column| !columns.contains(&column.id));
                self.columns.push(Column {
                    id: attribute.id.clone(),
                    name: attribute.name.clone(),
                    kind: ColumnType::Text,
                });
                self.columns.push(Column {
                    id: value.id.clone(),
                    name: value.name.clone(),
                    kind: ColumnType::Mixed,
                });
            }
        }
    }

    fn select(&mut self, out: &mut String, input: &str, columns: &[String]) {
        let names: Vec<&str> = columns.iter().map(|id| self.name(id)).collect();
        out.push_str("Table.SelectColumns(");
        out.push_str(input);
        out.push_str(", ");
        name_list(out, &names);
        out.push(')');

        self.columns = columns
            .iter()
            .filter_map(|id| self.columns.iter().find(|column| &column.id == id).cloned())
            .collect();
    }

    fn rename(&mut self, out: &mut String, input: &str, columns: &[(String, String)]) {
        out.push_str("Table.RenameColumns(");
        out.push_str(input);
        out.push_str(", {");
        for (position, (id, name)) in columns.iter().enumerate() {
            if position > 0 {
                out.push_str(", ");
            }

            out.push('{');
            text(out, self.name(id));
            out.push_str(", ");
            text(out, name);
            out.push('}');
        }
        out.push_str("})");

        for (id, name) in columns {
            if let Some(column) = self.columns.iter_mut().find(|column| &column.id == id) {
                column.name.clone_from(name);
            }
        }
    }

    fn group(&mut self, out: &mut String, input: &str, keys: &[String], aggregates: &[Aggregate]) {
        let key_names: Vec<String> = keys.iter().map(|id| self.name(id).to_owned()).collect();
        let key_refs: Vec<&str> = key_names.iter().map(String::as_str).collect();
        let mut grouped = String::from("Table.Group(");
        grouped.push_str(input);
        grouped.push_str(", ");
        name_list(&mut grouped, &key_refs);
        grouped.push_str(", {");

        let mut next: Vec<Column> = keys
            .iter()
            .filter_map(|id| self.columns.iter().find(|column| &column.id == id).cloned())
            .collect();

        for (position, aggregate) in aggregates.iter().enumerate() {
            if position > 0 {
                grouped.push_str(", ");
            }

            let source = aggregate
                .column
                .as_deref()
                .map(|id| self.name(id).to_owned());
            grouped.push('{');
            text(&mut grouped, &aggregate.name);
            grouped.push_str(", each ");
            let (function, kind) = match aggregate.op {
                AggregateOp::CountRows => ("Table.RowCount", ColumnType::Number),
                AggregateOp::Count => ("List.NonNullCount", ColumnType::Number),
                AggregateOp::Sum => ("List.Sum", ColumnType::Number),
                AggregateOp::Average => ("List.Average", ColumnType::Number),
                AggregateOp::Min | AggregateOp::Max => {
                    let kind = aggregate
                        .column
                        .as_deref()
                        .and_then(|id| self.columns.iter().find(|column| column.id == id))
                        .map_or(ColumnType::Mixed, |column| column.kind);
                    let function = if matches!(aggregate.op, AggregateOp::Min) {
                        "List.Min"
                    } else {
                        "List.Max"
                    };
                    (function, kind)
                }
            };
            grouped.push_str(function);
            grouped.push('(');
            match &source {
                Some(name) => field(&mut grouped, name),
                None => grouped.push('_'),
            }
            grouped.push_str(")}");

            next.push(Column {
                id: aggregate.id.clone(),
                name: aggregate.name.clone(),
                kind,
            });
        }
        grouped.push_str("})");

        // Table.Group does not promise an order; the engine emits groups in key order.
        Self::sort(out, &grouped, &key_refs);
        self.columns = next;
    }

    fn join(&mut self, out: &mut String, input: &str, step: JoinStep<'_>, index: usize) {
        let JoinStep { other, keys, join } = step;
        let Some(schema) = self.schemas.iter().find(|entry| entry.query == other) else {
            // The engine rejects a join to a missing input before export.
            self.loss(Some(index), "join-input");
            out.push_str(input);
            return;
        };
        let member = schema.member.clone();
        let right = schema.columns.clone();
        let right_name = |id: &str| -> String {
            right
                .iter()
                .find(|column| column.id == id)
                .map_or_else(|| id.to_owned(), |column| column.name.clone())
        };
        let left_keys: Vec<String> = keys
            .iter()
            .map(|pair| self.name(&pair.0).to_owned())
            .collect();
        let right_keys: Vec<String> = keys.iter().map(|pair| right_name(&pair.1)).collect();
        let keep_left = !matches!(join, JoinKind::RightSemi | JoinKind::RightAnti);
        let keep_right = !matches!(join, JoinKind::LeftSemi | JoinKind::LeftAnti);

        let joined = indexed_join(
            input,
            &member,
            &left_keys.iter().map(String::as_str).collect::<Vec<_>>(),
            &right_keys.iter().map(String::as_str).collect::<Vec<_>>(),
            join,
        );

        // Key order, then original left and right row positions, as in the engine.
        let mut order: Vec<&str> = Vec::new();
        let mut helpers: Vec<&str> = Vec::new();
        if keep_left {
            order.extend(left_keys.iter().map(String::as_str));
        } else {
            order.extend(right_keys.iter().map(String::as_str));
        }
        if keep_left {
            order.push(LEFT_ROW);
            helpers.push(LEFT_ROW);
        }
        if keep_right {
            order.push(RIGHT_ROW);
            helpers.push(RIGHT_ROW);
        }

        if matches!(join, JoinKind::Right | JoinKind::Full) {
            // Unmatched right rows have null left keys in M, so they sort first instead of by key.
            self.loss(Some(index), "outer-join-order");
        }

        let mut sorted = String::new();
        Self::sort(&mut sorted, &joined, &order);
        out.push_str("Table.RemoveColumns(");
        out.push_str(&sorted);
        out.push_str(", ");
        name_list(out, &helpers);
        out.push(')');

        let mut next = Vec::new();
        if keep_left {
            next.extend(self.columns.iter().cloned());
        }
        if keep_right {
            next.extend(right.iter().cloned());
        }
        self.columns = next;
    }
}

/// The M name of a join kind.
const fn join_kind_name(join: JoinKind) -> &'static str {
    match join {
        JoinKind::Inner => "JoinKind.Inner",
        JoinKind::Left => "JoinKind.LeftOuter",
        JoinKind::Right => "JoinKind.RightOuter",
        JoinKind::Full => "JoinKind.FullOuter",
        JoinKind::LeftSemi => "JoinKind.LeftSemi",
        JoinKind::RightSemi => "JoinKind.RightSemi",
        JoinKind::LeftAnti => "JoinKind.LeftAnti",
        JoinKind::RightAnti => "JoinKind.RightAnti",
    }
}

/// `Table.Join` of `input` and the `member` query, each with an added row-index column, so the
/// result can be sorted back to the engine's row order.
fn indexed_join(
    input: &str,
    member: &str,
    left_keys: &[&str],
    right_keys: &[&str],
    join: JoinKind,
) -> String {
    let mut joined = String::from("Table.Join(Table.AddIndexColumn(");
    joined.push_str(input);
    joined.push_str(", ");
    text(&mut joined, LEFT_ROW);
    joined.push_str(", 0, 1), ");
    name_list(&mut joined, left_keys);
    joined.push_str(", Table.AddIndexColumn(");
    identifier(&mut joined, member);
    joined.push_str(", ");
    text(&mut joined, RIGHT_ROW);
    joined.push_str(", 0, 1), ");
    name_list(&mut joined, right_keys);
    joined.push_str(", ");
    joined.push_str(join_kind_name(join));
    joined.push(')');
    joined
}

fn source_steps(writer: &mut Writer<'_>, query: &MQuery, bindings: &mut Vec<(String, String)>) {
    let source = &query.source;
    let names: Vec<&str> = source
        .columns
        .iter()
        .map(|column| column.name.as_str())
        .collect();
    let web = source
        .locator
        .as_deref()
        .filter(|locator| locator.starts_with("https://") || locator.starts_with("http://"));

    let Some(locator) = web.filter(|_| !matches!(source.kind, MSourceKind::Host)) else {
        // A host-supplied source has no M connector; refresh in Excel reports this error.
        writer.loss(None, "host-source");
        bindings.push((String::from("Source"), host_source_error(&source.source_id)));
        typed_binding(writer, query, bindings);
        return;
    };

    let mut fetched = String::from("Web.Contents(");
    text(&mut fetched, locator);
    fetched.push(')');

    match &source.kind {
        MSourceKind::Csv {
            delimiter,
            headers,
            empty_is_null,
        } => {
            // Csv.Document options record: https://learn.microsoft.com/powerquery-m/csv-document
            let mut document = String::from("Csv.Document(");
            document.push_str(&fetched);
            document.push_str(", [Delimiter = ");
            text(&mut document, &char::from(*delimiter).to_string());
            if !*headers {
                // Declared columns pad short records with null and drop extra fields, as the engine does.
                document.push_str(&format!(", Columns = {}", names.len()));
            }
            document.push_str(&format!(
                ", Encoding = {UTF8_CODE_PAGE}, QuoteStyle = QuoteStyle.Csv])"
            ));
            bindings.push((String::from("Source"), document));

            if *headers {
                bindings.push((
                    String::from("Promoted"),
                    String::from("Table.PromoteHeaders(Source, [PromoteAllScalars = true])"),
                ));
                let mut selected = String::from("Table.SelectColumns(Promoted, ");
                name_list(&mut selected, &names);
                selected.push(')');
                bindings.push((String::from("Selected"), selected));
            } else {
                bindings.push((String::from("Selected"), numbered_renames(&names)));
            }

            if *empty_is_null {
                let mut blanks = String::from(
                    "Table.ReplaceValue(Selected, \"\", null, Replacer.ReplaceValue, ",
                );
                name_list(&mut blanks, &names);
                blanks.push(')');
                bindings.push((String::from("Blanks"), blanks));
            }
        }
        MSourceKind::Json { path } => json_steps(&fetched, path, &names, bindings),
        MSourceKind::Host => {}
    }

    typed_binding(writer, query, bindings);
}

/// An M error that names a host-supplied source, which no M connector can read.
fn host_source_error(source_id: &str) -> String {
    let mut expression = String::from("error Error.Record(\"Sheetwrite.HostSource\", ");
    text(
        &mut expression,
        "The host application supplies this source.",
    );
    expression.push_str(", [SourceId = ");
    text(&mut expression, source_id);
    expression.push_str("])");
    expression
}

/// Renames the `Column1`, `Column2`, ... columns of a CSV document without headers.
fn numbered_renames(names: &[&str]) -> String {
    let mut named = String::from("Table.RenameColumns(Source, {");
    for (position, name) in names.iter().enumerate() {
        if position > 0 {
            named.push_str(", ");
        }

        named.push('{');
        text(&mut named, &format!("Column{}", position + 1));
        named.push_str(", ");
        text(&mut named, name);
        named.push('}');
    }
    named.push_str("})");
    named
}

/// Reads the records at `path` of a fetched JSON document as a table of the declared columns.
fn json_steps(
    fetched: &str,
    path: &[String],
    names: &[&str],
    bindings: &mut Vec<(String, String)>,
) {
    bindings.push((String::from("Source"), format!("Json.Document({fetched})")));
    let mut records = String::from("Source");
    for member in path {
        field(&mut records, member);
    }

    // Missing fields are null, and fields outside the schema are ignored, as in the engine.
    let mut table = String::from("Table.FromRecords(");
    table.push_str(&records);
    table.push_str(", ");
    name_list(&mut table, names);
    table.push_str(", MissingField.UseNull)");
    bindings.push((String::from("Selected"), table));
}

/// The explicit typed schema; every conversion uses one fixed culture.
fn typed_binding(writer: &mut Writer<'_>, query: &MQuery, bindings: &mut Vec<(String, String)>) {
    let source = &query.source;
    let previous = last_binding(bindings);
    let mut typed = String::from("Table.TransformColumnTypes(");
    typed.push_str(&previous);
    typed.push_str(", {");
    for (position, column) in source.columns.iter().enumerate() {
        if position > 0 {
            typed.push_str(", ");
        }

        typed.push('{');
        text(&mut typed, &column.name);
        typed.push_str(", ");
        typed.push_str(type_value(column.column_type));
        typed.push('}');
    }
    typed.push_str("}, ");
    text(&mut typed, CULTURE);
    typed.push(')');
    bindings.push((String::from("Typed"), typed));
    writer.loss(None, "conversion-culture");
}

/// Queries in an order where joined inputs come first; the definitions have no cycle.
fn dependency_order(queries: &[MQuery]) -> Vec<usize> {
    let mut order: Vec<usize> = Vec::with_capacity(queries.len());

    while order.len() < queries.len() {
        let before = order.len();
        for (index, query) in queries.iter().enumerate() {
            if order.contains(&index) {
                continue;
            }

            let ready = query.steps.iter().all(|step| match step {
                Step::Join { input, .. } => queries
                    .iter()
                    .position(|candidate| &candidate.id == input)
                    .is_none_or(|position| order.contains(&position)),
                Step::Filter { .. }
                | Step::Select { .. }
                | Step::Rename { .. }
                | Step::ChangeType { .. }
                | Step::Group { .. }
                | Step::Unpivot { .. } => true,
            });
            if ready {
                order.push(index);
            }
        }

        // A cycle cannot be saved; any remaining queries keep their order.
        if order.len() == before {
            let remaining: Vec<usize> = (0..queries.len())
                .filter(|index| !order.contains(index))
                .collect();
            order.extend(remaining);
        }
    }

    order
}

/// Member names for every query, unique when letter case is ignored, as Excel requires for
/// query names. A name that had to change is reported as a difference.
fn member_names(queries: &[MQuery], losses: &mut Vec<Loss>) -> Vec<String> {
    let mut members: Vec<String> = Vec::with_capacity(queries.len());

    for (index, query) in queries.iter().enumerate() {
        let base = member_name(&query.name);
        let mut candidate = base.clone();
        let mut suffix = 2;
        while members
            .iter()
            .any(|name| name.eq_ignore_ascii_case(&candidate))
        {
            candidate = format!("{base} ({suffix})");
            suffix += 1;
        }

        if candidate != query.name {
            losses.push(Loss {
                query: index,
                step: None,
                code: "member-name",
            });
        }

        members.push(candidate);
    }

    members
}

/// The name of the last binding, which the next step reads and the `in` clause returns.
fn last_binding(bindings: &[(String, String)]) -> String {
    bindings
        .last()
        .map_or_else(String::new, |binding| binding.0.clone())
}

/// A `let` expression with one line per binding that returns the last binding.
fn let_body(bindings: &[(String, String)]) -> String {
    let mut body = String::from("let\n");
    for (position, (name, expression)) in bindings.iter().enumerate() {
        body.push_str("    ");
        identifier(&mut body, name);
        body.push_str(" = ");
        body.push_str(expression);
        body.push_str(if position + 1 < bindings.len() {
            ",\n"
        } else {
            "\n"
        });
    }
    body.push_str("in\n    ");
    identifier(&mut body, &last_binding(bindings));
    body
}

/// Writes every query as a shared member of `Section1`.
#[must_use]
pub fn emit_section(queries: &[MQuery]) -> Section {
    let mut losses = Vec::new();
    let members = member_names(queries, &mut losses);
    let mut schemas: Vec<MemberSchema> = Vec::new();
    let mut bodies: Vec<String> = vec![String::new(); queries.len()];

    for index in dependency_order(queries) {
        let (Some(query), Some(member)) = (queries.get(index), members.get(index)) else {
            continue;
        };
        let mut writer = Writer {
            query: index,
            columns: query
                .source
                .columns
                .iter()
                .map(|column| Column {
                    id: column.id.clone(),
                    name: column.name.clone(),
                    kind: column.column_type,
                })
                .collect(),
            losses: &mut losses,
            schemas: &schemas,
        };

        let mut bindings: Vec<(String, String)> = Vec::new();
        source_steps(&mut writer, query, &mut bindings);

        for (position, step) in query.steps.iter().enumerate() {
            let mut input = String::new();
            identifier(&mut input, &last_binding(&bindings));
            let mut expression = String::new();
            writer.step(&mut expression, &input, step, position);
            bindings.push((format!("Step {}", position + 1), expression));
        }

        let columns = writer.columns;
        if let Some(slot) = bodies.get_mut(index) {
            *slot = let_body(&bindings);
        }
        schemas.push(MemberSchema {
            member: member.clone(),
            columns,
            query: query.id.clone(),
        });
    }

    let mut text = String::from("section Section1;\n");
    for (member, body) in members.iter().zip(bodies) {
        text.push_str("\nshared ");
        identifier(&mut text, member);
        text.push_str(" = ");
        text.push_str(&body);
        text.push_str(";\n");
    }

    Section {
        text,
        members,
        losses,
    }
}
