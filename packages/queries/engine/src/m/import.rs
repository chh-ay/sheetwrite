//! Maps parsed section members to saved queries. Only exact supported forms
//! map; anything else keeps its original text span and a reason, and is never
//! evaluated. The supported forms are the ones the emitter writes plus the
//! common shapes of the same M functions (function reference:
//! https://learn.microsoft.com/powerquery-m/power-query-m-function-reference).

use std::ops::Range;

use super::parse::{parse_section, Expr, Member};
use super::{MQuery, MSource, MSourceKind};
use crate::plan::{
    Aggregate, AggregateOp, ColumnSpec, ColumnType, CompareOp, ErrorPolicy, JoinKind, Literal,
    OutputColumn, Predicate, Step,
};

const LEFT_ROW: &str = "Sheetwrite.LeftRow";
const RIGHT_ROW: &str = "Sheetwrite.RightRow";
const UTF8_CODE_PAGE: f64 = 65_001.0;
const COMMA: u8 = b',';
const HOST_SOURCE_REASON: &str = "Sheetwrite.HostSource";

/// A member that is kept as text, with the reason and the M function involved.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unsupported {
    pub member: String,
    pub reason: &'static str,
    /// The M function or form that is outside the supported subset, if one is known.
    pub detail: String,
    pub span: Range<usize>,
}

type Outcome<T> = Result<T, (&'static str, String)>;

fn miss(reason: &'static str, detail: &str) -> (&'static str, String) {
    (reason, detail.to_owned())
}

fn fail<T>(reason: &'static str, detail: impl Into<String>) -> Outcome<T> {
    Err((reason, detail.into()))
}

fn call<'a>(expression: &'a Expr, name: &str) -> Option<&'a [Expr]> {
    match expression {
        Expr::Call(function, arguments) if matches!(function.as_ref(), Expr::Identifier(found) if found == name) => {
            Some(arguments)
        }
        _ => None,
    }
}

fn function_name(expression: &Expr) -> String {
    match expression {
        Expr::Call(function, _) => match function.as_ref() {
            Expr::Identifier(name) => name.clone(),
            _ => String::from("call"),
        },
        Expr::Identifier(name) => name.clone(),
        _ => String::from("expression"),
    }
}

fn text(expression: &Expr) -> Option<&str> {
    match expression {
        Expr::Text(value) => Some(value),
        _ => None,
    }
}

fn texts(expression: &Expr) -> Option<Vec<String>> {
    match expression {
        Expr::List(items) => items
            .iter()
            .map(|item| text(item).map(str::to_owned))
            .collect(),
        // A single column name is also accepted where M takes `any`.
        Expr::Text(value) => Some(vec![value.clone()]),
        _ => None,
    }
}

fn pairs(expression: &Expr) -> Option<Vec<(String, String)>> {
    let Expr::List(items) = expression else {
        return None;
    };

    items
        .iter()
        .map(|item| match item {
            Expr::List(pair) => match pair.as_slice() {
                [left, right] => Some((text(left)?.to_owned(), text(right)?.to_owned())),
                _ => None,
            },
            _ => None,
        })
        .collect()
}

fn record_field<'a>(record: &'a Expr, name: &str) -> Option<&'a Expr> {
    match record {
        Expr::Record(fields) => fields
            .iter()
            .find(|field| field.0 == name)
            .map(|field| &field.1),
        _ => None,
    }
}

/// Primitive types the engine stores; integer and currency facets read as numbers.
fn column_type(expression: &Expr) -> Option<ColumnType> {
    let name = match expression {
        Expr::Type(name) => name.as_str(),
        Expr::Identifier(name) => name.as_str(),
        _ => return None,
    };

    Some(match name {
        "number" | "Number.Type" | "Int64.Type" | "Int32.Type" | "Int16.Type" | "Int8.Type"
        | "Double.Type" | "Decimal.Type" | "Currency.Type" | "Percentage.Type" | "Single.Type" => {
            ColumnType::Number
        }
        "text" | "Text.Type" => ColumnType::Text,
        "logical" | "Logical.Type" => ColumnType::Logical,
        "date" | "Date.Type" => ColumnType::Date,
        "datetime" | "DateTime.Type" => ColumnType::DateTime,
        "any" | "Any.Type" => ColumnType::Mixed,
        _ => return None,
    })
}

/// Names and identities of the current columns; imported identities start as names.
#[derive(Default)]
struct Schema {
    columns: Vec<ColumnSpec>,
}

impl Schema {
    fn id(&self, name: &str) -> Outcome<String> {
        self.columns
            .iter()
            .find(|column| column.name == name)
            .map(|column| column.id.clone())
            .ok_or_else(|| ("column", name.to_owned()))
    }

    /// A new identity that no current column uses.
    fn fresh(&self, name: &str) -> String {
        let mut id = name.to_owned();
        let mut suffix = 2;
        while self.columns.iter().any(|column| column.id == id) {
            id = format!("{name} ({suffix})");
            suffix += 1;
        }

        id
    }
}

struct Source {
    kind: MSourceKind,
    source_id: String,
    locator: Option<String>,
    /// Column names fixed before typing, if the M lists them.
    names: Option<Vec<String>>,
}

fn web_locator(expression: &Expr) -> Option<String> {
    let arguments = call(expression, "Web.Contents")?;
    match arguments {
        [url] => text(url).map(str::to_owned),
        _ => None,
    }
}

/// The first binding: where data comes from.
fn source(expression: &Expr) -> Outcome<Source> {
    if let Some(arguments) = call(expression, "Csv.Document") {
        let (contents, options) = match arguments {
            [contents] => (contents, None),
            [contents, options] => (contents, Some(options)),
            _ => return fail("source", "Csv.Document"),
        };
        let locator = web_locator(contents).ok_or(("source", function_name(contents)))?;
        let mut delimiter = COMMA;
        let mut columns = None;

        if let Some(options) = options {
            let Expr::Record(fields) = options else {
                return fail("source", "Csv.Document");
            };

            for (name, value) in fields {
                match (name.as_str(), value) {
                    ("Delimiter", Expr::Text(text)) if text.len() == 1 && text.is_ascii() => {
                        delimiter = text.as_bytes().first().copied().unwrap_or(COMMA);
                    }
                    ("Columns", Expr::Number(count)) => columns = Some(*count),
                    ("Encoding", Expr::Number(code)) if *code == UTF8_CODE_PAGE => {}
                    ("QuoteStyle", Expr::Identifier(style)) if style == "QuoteStyle.Csv" => {}
                    _ => return fail("source", format!("Csv.Document {name}")),
                }
            }
        }

        let _ = columns;
        return Ok(Source {
            kind: MSourceKind::Csv {
                delimiter,
                headers: false,
                empty_is_null: false,
            },
            source_id: locator.clone(),
            locator: Some(locator),
            names: None,
        });
    }

    if let Some([contents]) = call(expression, "Json.Document") {
        let locator = web_locator(contents).ok_or(("source", function_name(contents)))?;
        return Ok(Source {
            kind: MSourceKind::Json { path: Vec::new() },
            source_id: locator.clone(),
            locator: Some(locator),
            names: None,
        });
    }

    // Excel.CurrentWorkbook(){[Name = "Table"]}[Content]: a workbook table that the host supplies.
    if let Expr::Field(Some(target), field) = expression {
        if field == "Content" {
            if let Expr::Item(workbook, selector) = target.as_ref() {
                if call(workbook, "Excel.CurrentWorkbook").is_some_and(<[Expr]>::is_empty) {
                    if let Some(name) = record_field(selector, "Name").and_then(text) {
                        return Ok(Source {
                            kind: MSourceKind::Host,
                            source_id: name.to_owned(),
                            locator: None,
                            names: None,
                        });
                    }
                }
            }
        }
    }

    // The emitter's marker for a host-supplied source.
    if let Expr::Error(record) = expression {
        if let Some([reason, _, detail]) = call(record, "Error.Record") {
            if text(reason) == Some(HOST_SOURCE_REASON) {
                if let Some(id) = record_field(detail, "SourceId").and_then(text) {
                    return Ok(Source {
                        kind: MSourceKind::Host,
                        source_id: id.to_owned(),
                        locator: None,
                        names: None,
                    });
                }
            }
        }
    }

    fail("source", function_name(expression))
}

fn compare_op(operator: &str) -> Option<CompareOp> {
    Some(match operator {
        "=" => CompareOp::Eq,
        "<>" => CompareOp::Neq,
        "<" => CompareOp::Lt,
        "<=" => CompareOp::Lte,
        ">" => CompareOp::Gt,
        ">=" => CompareOp::Gte,
        _ => return None,
    })
}

/// The operator that keeps a comparison true when its operands swap sides.
fn mirrored(op: CompareOp) -> CompareOp {
    match op {
        CompareOp::Lt => CompareOp::Gt,
        CompareOp::Lte => CompareOp::Gte,
        CompareOp::Gt => CompareOp::Lt,
        CompareOp::Gte => CompareOp::Lte,
        other => other,
    }
}

fn literal(expression: &Expr) -> Option<Literal> {
    Some(match expression {
        Expr::Null => Literal::Null,
        Expr::Logical(value) => Literal::Logical(*value),
        Expr::Number(value) => Literal::Number(*value),
        Expr::Negate(inner) => match inner.as_ref() {
            Expr::Number(value) => Literal::Number(-value),
            _ => return None,
        },
        Expr::Text(value) => Literal::Text(value.clone()),
        _ => return None,
    })
}

fn row_field(expression: &Expr) -> Option<&str> {
    match expression {
        Expr::Field(None, name) => Some(name),
        _ => None,
    }
}

fn predicate(expression: &Expr, schema: &Schema) -> Outcome<Predicate> {
    match expression {
        Expr::Binary(operator @ ("and" | "or"), left, right) => {
            let mut predicates = Vec::new();
            for side in [left, right] {
                let child = predicate(side, schema)?;
                // Chains of one operator flatten into one list.
                match (child, *operator) {
                    (Predicate::And { predicates: inner }, "and")
                    | (Predicate::Or { predicates: inner }, "or") => {
                        predicates.extend(inner);
                    }
                    (child, _) => predicates.push(child),
                }
            }

            Ok(if *operator == "and" {
                Predicate::And { predicates }
            } else {
                Predicate::Or { predicates }
            })
        }
        Expr::Not(inner) => Ok(Predicate::Not {
            predicate: Box::new(predicate(inner, schema)?),
        }),
        Expr::Binary(operator, left, right) => {
            let op = compare_op(operator).ok_or(("expression", (*operator).to_owned()))?;
            let (column, value, op) = match (row_field(left), row_field(right)) {
                (Some(column), None) => (column, right.as_ref(), op),
                (None, Some(column)) => (column, left.as_ref(), mirrored(op)),
                _ => return fail("expression", "comparison"),
            };
            let column = schema.id(column)?;
            let value = literal(value).ok_or_else(|| miss("expression", "comparison value"))?;

            Ok(match (op, &value) {
                (CompareOp::Eq, Literal::Null) => Predicate::IsNull { column },
                (CompareOp::Neq, Literal::Null) => Predicate::Not {
                    predicate: Box::new(Predicate::IsNull { column }),
                },
                _ => Predicate::Compare { column, op, value },
            })
        }
        Expr::Call(..) => match call(expression, "Text.Contains") {
            Some([target, needle]) => Ok(Predicate::Contains {
                column: schema
                    .id(row_field(target).ok_or_else(|| miss("expression", "Text.Contains"))?)?,
                text: text(needle)
                    .ok_or_else(|| miss("expression", "Text.Contains"))?
                    .to_owned(),
            }),
            _ => fail("expression", function_name(expression)),
        },
        Expr::Logical(true) => Ok(Predicate::And {
            predicates: Vec::new(),
        }),
        Expr::Logical(false) => Ok(Predicate::Or {
            predicates: Vec::new(),
        }),
        _ => fail("expression", "condition"),
    }
}

/// `each (condition) = true`, as the emitter writes, or a plain `each condition`.
fn condition(expression: &Expr, schema: &Schema) -> Outcome<Predicate> {
    let Expr::Each(body) = expression else {
        return fail("expression", "Table.SelectRows");
    };

    match body.as_ref() {
        Expr::Binary("=", inner, value) if matches!(value.as_ref(), Expr::Logical(true)) => {
            predicate(inner, schema)
        }
        other => predicate(other, schema),
    }
}

struct Builder<'a> {
    schema: Schema,
    steps: Vec<Step>,
    queries: &'a [(String, Vec<ColumnSpec>)],
}

impl Builder<'_> {
    fn select(&mut self, names: &[String]) -> Outcome<()> {
        let ids = names
            .iter()
            .map(|name| self.schema.id(name))
            .collect::<Outcome<Vec<_>>>()?;
        self.schema.columns = ids
            .iter()
            .filter_map(|id| {
                self.schema
                    .columns
                    .iter()
                    .find(|column| &column.id == id)
                    .cloned()
            })
            .collect();
        self.steps.push(Step::Select { columns: ids });
        Ok(())
    }

    fn rename(&mut self, renames: &[(String, String)]) -> Outcome<()> {
        let mut columns = Vec::new();
        for (old, new) in renames {
            let id = self.schema.id(old)?;
            if let Some(column) = self
                .schema
                .columns
                .iter_mut()
                .find(|column| column.id == id)
            {
                column.name.clone_from(new);
            }
            columns.push((id, new.clone()));
        }

        self.steps.push(Step::Rename { columns });
        Ok(())
    }

    fn change_types(&mut self, list: &Expr, on_error: ErrorPolicy) -> Outcome<()> {
        let Expr::List(items) = list else {
            return fail("step", "Table.TransformColumnTypes");
        };

        for item in items {
            let Expr::List(pair) = item else {
                return fail("step", "Table.TransformColumnTypes");
            };
            let [name, kind] = pair.as_slice() else {
                return fail("step", "Table.TransformColumnTypes");
            };
            let name = text(name).ok_or_else(|| miss("step", "Table.TransformColumnTypes"))?;
            let kind = column_type(kind).ok_or(("type", function_name(kind)))?;
            let id = self.schema.id(name)?;
            if let Some(column) = self
                .schema
                .columns
                .iter_mut()
                .find(|column| column.id == id)
            {
                column.column_type = kind;
            }

            self.steps.push(Step::ChangeType {
                column: id,
                column_type: kind,
                on_error,
            });
        }

        Ok(())
    }

    fn join(
        &mut self,
        left_keys: &Expr,
        right: &Expr,
        right_keys: &Expr,
        kind: &Expr,
    ) -> Outcome<()> {
        let Expr::Identifier(input) = right else {
            return fail("step", "Table.Join");
        };
        let (_, right_schema) = self
            .queries
            .iter()
            .find(|entry| &entry.0 == input)
            .ok_or(("dependency", input.clone()))?;
        let right_schema = right_schema.clone();
        let join = match kind {
            Expr::Identifier(name) => match name.as_str() {
                "JoinKind.Inner" => JoinKind::Inner,
                "JoinKind.LeftOuter" => JoinKind::Left,
                "JoinKind.RightOuter" => JoinKind::Right,
                "JoinKind.FullOuter" => JoinKind::Full,
                "JoinKind.LeftSemi" => JoinKind::LeftSemi,
                "JoinKind.RightSemi" => JoinKind::RightSemi,
                "JoinKind.LeftAnti" => JoinKind::LeftAnti,
                "JoinKind.RightAnti" => JoinKind::RightAnti,
                _ => return fail("step", name.clone()),
            },
            _ => return fail("step", "Table.Join"),
        };
        let left_names = texts(left_keys).ok_or_else(|| miss("step", "Table.Join"))?;
        let right_names = texts(right_keys).ok_or_else(|| miss("step", "Table.Join"))?;
        if left_names.len() != right_names.len() {
            return fail("step", "Table.Join");
        }

        let mut keys = Vec::new();
        for (left, right) in left_names.iter().zip(&right_names) {
            let right_id = right_schema
                .iter()
                .find(|column| &column.name == right)
                .map(|column| column.id.clone())
                .ok_or(("column", right.clone()))?;
            keys.push((self.schema.id(left)?, right_id));
        }

        let keep_left = !matches!(join, JoinKind::RightSemi | JoinKind::RightAnti);
        let keep_right = !matches!(join, JoinKind::LeftSemi | JoinKind::LeftAnti);
        let mut next = Vec::new();
        if keep_left {
            next.extend(self.schema.columns.iter().cloned());
        }
        if keep_right {
            next.extend(right_schema.iter().cloned());
        }
        self.schema.columns = next;
        self.steps.push(Step::Join {
            input: input.clone(),
            keys,
            join,
        });
        Ok(())
    }

    /// The emitter's join: remove-helpers(sort(join(add-index(left), add-index(right)))).
    fn helper_join(&mut self, sorted: &Expr) -> Outcome<()> {
        let Some([joined, _order]) = call(sorted, "Table.Sort") else {
            return fail("step", "Table.RemoveColumns");
        };
        let Some([left, left_keys, right, right_keys, kind]) = call(joined, "Table.Join") else {
            return fail("step", "Table.Join");
        };
        let unwrap = |side: &Expr, helper: &str| -> Outcome<Expr> {
            match call(side, "Table.AddIndexColumn") {
                Some([inner, name, ..]) if text(name) == Some(helper) => Ok(inner.clone()),
                _ => fail("step", "Table.AddIndexColumn"),
            }
        };
        let _left = unwrap(left, LEFT_ROW)?;
        let right = unwrap(right, RIGHT_ROW)?;

        self.join(left_keys, &right, right_keys, kind)
    }

    fn group(&mut self, keys: &Expr, aggregates: &Expr) -> Outcome<()> {
        let names = texts(keys).ok_or_else(|| miss("step", "Table.Group"))?;
        let key_ids = names
            .iter()
            .map(|name| self.schema.id(name))
            .collect::<Outcome<Vec<_>>>()?;
        let Expr::List(items) = aggregates else {
            return fail("step", "Table.Group");
        };

        let mut next: Vec<ColumnSpec> = key_ids
            .iter()
            .filter_map(|id| {
                self.schema
                    .columns
                    .iter()
                    .find(|column| &column.id == id)
                    .cloned()
            })
            .collect();
        let mut folds = Vec::new();

        for item in items {
            let Expr::List(parts) = item else {
                return fail("step", "Table.Group");
            };
            let (name, function) = match parts.as_slice() {
                [name, function] | [name, function, _] => (name, function),
                _ => return fail("step", "Table.Group"),
            };
            let name = text(name)
                .ok_or_else(|| miss("step", "Table.Group"))?
                .to_owned();
            let Expr::Each(body) = function else {
                return fail("step", "Table.Group");
            };
            let (op, column) = match body.as_ref() {
                Expr::Call(function, arguments) => {
                    let Expr::Identifier(function) = function.as_ref() else {
                        return fail("step", "Table.Group");
                    };
                    match (function.as_str(), arguments.as_slice()) {
                        ("Table.RowCount", [Expr::Identifier(row)]) if row == "_" => {
                            (AggregateOp::CountRows, None)
                        }
                        (function, [Expr::Field(None, column)]) => {
                            let op = match function {
                                "List.NonNullCount" => AggregateOp::Count,
                                "List.Sum" => AggregateOp::Sum,
                                "List.Average" => AggregateOp::Average,
                                "List.Min" => AggregateOp::Min,
                                "List.Max" => AggregateOp::Max,
                                other => return fail("aggregate", other.to_owned()),
                            };
                            (op, Some(self.schema.id(column)?))
                        }
                        (function, _) => return fail("aggregate", function.to_owned()),
                    }
                }
                _ => return fail("aggregate", "expression"),
            };

            let kind = match op {
                AggregateOp::Min | AggregateOp::Max => column
                    .as_deref()
                    .and_then(|id| self.schema.columns.iter().find(|entry| entry.id == id))
                    .map_or(ColumnType::Mixed, |entry| entry.column_type),
                _ => ColumnType::Number,
            };
            let id = name.clone();
            next.push(ColumnSpec {
                id: id.clone(),
                name: name.clone(),
                column_type: kind,
            });
            folds.push(Aggregate {
                id,
                name,
                op,
                column,
            });
        }

        self.schema.columns = next;
        self.steps.push(Step::Group {
            keys: key_ids,
            aggregates: folds,
        });
        Ok(())
    }

    fn unpivot(&mut self, ids: Vec<String>, attribute: &str, value: &str) {
        self.schema
            .columns
            .retain(|column| !ids.contains(&column.id));
        let attribute = OutputColumn {
            id: self.schema.fresh(attribute),
            name: attribute.to_owned(),
        };
        self.schema.columns.push(ColumnSpec {
            id: attribute.id.clone(),
            name: attribute.name.clone(),
            column_type: ColumnType::Text,
        });
        let value = OutputColumn {
            id: self.schema.fresh(value),
            name: value.to_owned(),
        };
        self.schema.columns.push(ColumnSpec {
            id: value.id.clone(),
            name: value.name.clone(),
            column_type: ColumnType::Mixed,
        });
        self.steps.push(Step::Unpivot {
            columns: ids,
            attribute,
            value,
        });
    }

    /// One binding after the typed source; each maps to one or more engine steps.
    fn binding(&mut self, expression: &Expr, previous: &str) -> Outcome<()> {
        let input_is_previous =
            |argument: &Expr| matches!(argument, Expr::Identifier(name) if name == previous);
        let name = function_name(expression);
        let Expr::Call(_, arguments) = expression else {
            return fail("step", name);
        };

        match (name.as_str(), arguments.as_slice()) {
            ("Table.SelectRows", [input, each]) if input_is_previous(input) => {
                let predicate = condition(each, &self.schema)?;
                self.steps.push(Step::Filter { predicate });
                Ok(())
            }
            ("Table.SelectColumns", [input, names]) if input_is_previous(input) => {
                self.select(&texts(names).ok_or(("step", name.clone()))?)
            }
            ("Table.RemoveColumns", [sorted, _]) if call(sorted, "Table.Sort").is_some() => {
                self.helper_join(sorted)
            }
            ("Table.RemoveColumns", [input, names]) if input_is_previous(input) => {
                let removed = texts(names).ok_or(("step", name.clone()))?;
                let kept: Vec<String> = self
                    .schema
                    .columns
                    .iter()
                    .filter(|column| !removed.contains(&column.name))
                    .map(|column| column.name.clone())
                    .collect();
                self.select(&kept)
            }
            ("Table.RenameColumns", [input, renames]) if input_is_previous(input) => {
                self.rename(&pairs(renames).ok_or(("step", name.clone()))?)
            }
            ("Table.TransformColumnTypes", [input, list, ..]) if input_is_previous(input) => {
                self.change_types(list, ErrorPolicy::Error)
            }
            ("Table.ReplaceErrorValues", [inner, _]) => {
                match call(inner, "Table.TransformColumnTypes") {
                    Some([input, list, ..]) if input_is_previous(input) => {
                        self.change_types(list, ErrorPolicy::Null)
                    }
                    _ => fail("step", name),
                }
            }
            ("Table.Join", [input, left_keys, right, right_keys, kind])
                if input_is_previous(input) =>
            {
                self.join(left_keys, right, right_keys, kind)
            }
            ("Table.Sort", [grouped, _]) => match call(grouped, "Table.Group") {
                Some([input, keys, aggregates]) if input_is_previous(input) => {
                    self.group(keys, aggregates)
                }
                _ => fail("step", name),
            },
            ("Table.Group", [input, keys, aggregates]) if input_is_previous(input) => {
                self.group(keys, aggregates)
            }
            ("Table.Unpivot", [input, names, attribute, value]) if input_is_previous(input) => {
                let columns = texts(names).ok_or(("step", name.clone()))?;
                let ids = columns
                    .iter()
                    .map(|column| self.schema.id(column))
                    .collect::<Outcome<Vec<_>>>()?;
                let attribute = text(attribute).ok_or(("step", name.clone()))?;
                let value = text(value).ok_or(("step", name.clone()))?;
                self.unpivot(ids, attribute, value);
                Ok(())
            }
            ("Table.UnpivotOtherColumns", [input, names, attribute, value])
                if input_is_previous(input) =>
            {
                let kept = texts(names).ok_or(("step", name.clone()))?;
                let ids: Vec<String> = self
                    .schema
                    .columns
                    .iter()
                    .filter(|column| !kept.contains(&column.name))
                    .map(|column| column.id.clone())
                    .collect();
                let attribute = text(attribute).ok_or(("step", name.clone()))?;
                let value = text(value).ok_or(("step", name.clone()))?;
                self.unpivot(ids, attribute, value);
                Ok(())
            }
            _ => fail("step", name),
        }
    }
}

/// The bindings before typing: headers, column selection, blanks and the typed schema.
fn typed_source(bindings: &[(String, Expr)]) -> Outcome<(Source, Vec<ColumnSpec>, usize)> {
    let (first_name, first) = bindings.first().ok_or_else(|| miss("source", "let"))?;
    let mut source = source(first)?;
    let mut previous = first_name.as_str();

    for (index, (name, expression)) in bindings.iter().enumerate().skip(1) {
        let is_previous =
            |argument: &Expr| matches!(argument, Expr::Identifier(found) if found == previous);
        let function = function_name(expression);
        let arguments = match expression {
            Expr::Call(_, arguments) => arguments.as_slice(),
            // JSON record navigation, `Source[result][items]`.
            Expr::Field(..) => &[],
            _ => return fail("schema", function),
        };

        match (&mut source.kind, function.as_str(), arguments) {
            (MSourceKind::Csv { headers, .. }, "Table.PromoteHeaders", [input, ..])
                if is_previous(input) =>
            {
                *headers = true;
            }
            (MSourceKind::Csv { .. }, "Table.SelectColumns", [input, names])
                if is_previous(input) =>
            {
                source.names = Some(texts(names).ok_or(("schema", function.clone()))?);
            }
            (MSourceKind::Csv { headers: false, .. }, "Table.RenameColumns", [input, renames])
                if is_previous(input) =>
            {
                // Positional names Column1..ColumnN become the declared names.
                let renames = pairs(renames).ok_or(("schema", function.clone()))?;
                let mut names = Vec::new();
                for (position, (old, new)) in renames.iter().enumerate() {
                    if *old != format!("Column{}", position + 1) {
                        return fail("schema", function);
                    }
                    names.push(new.clone());
                }
                source.names = Some(names);
            }
            (
                MSourceKind::Csv { empty_is_null, .. },
                "Table.ReplaceValue",
                [input, old, new, replacer, _],
            ) if is_previous(input)
                && text(old) == Some("")
                && matches!(new, Expr::Null)
                && matches!(replacer, Expr::Identifier(name) if name == "Replacer.ReplaceValue") =>
            {
                *empty_is_null = true;
            }
            (MSourceKind::Json { path }, _, []) => {
                // A chain of field accesses from the document root.
                let mut fields = Vec::new();
                let mut current = expression;
                while let Expr::Field(Some(target), field) = current {
                    fields.push(field.clone());
                    current = target;
                }
                if !is_previous(current) {
                    return fail("schema", "navigation");
                }
                fields.reverse();
                path.extend(fields);
            }
            (
                MSourceKind::Json { path },
                "Table.FromRecords",
                [input, names, Expr::Identifier(missing)],
            ) if missing == "MissingField.UseNull" => {
                // The record list may be navigated inline, as in `Source[data][items]`.
                let mut fields = Vec::new();
                let mut current = input;
                while let Expr::Field(Some(target), field) = current {
                    fields.push(field.clone());
                    current = target;
                }
                if !is_previous(current) {
                    return fail("schema", function);
                }

                fields.reverse();
                path.extend(fields);
                source.names = Some(texts(names).ok_or(("schema", function.clone()))?);
            }
            (_, "Table.TransformColumnTypes", [input, list, ..]) if is_previous(input) => {
                let Expr::List(items) = list else {
                    return fail("schema", function);
                };
                let mut typed: Vec<(String, ColumnType)> = Vec::new();
                for item in items {
                    let Expr::List(pair) = item else {
                        return fail("schema", function);
                    };
                    let [column, kind] = pair.as_slice() else {
                        return fail("schema", function);
                    };
                    let column = text(column).ok_or(("schema", function.clone()))?.to_owned();
                    typed.push((
                        column,
                        column_type(kind).ok_or(("type", function_name(kind)))?,
                    ));
                }

                // Declared names keep their order; listed types apply to them, others stay mixed.
                let names = source
                    .names
                    .clone()
                    .unwrap_or_else(|| typed.iter().map(|entry| entry.0.clone()).collect());
                let columns = names
                    .iter()
                    .map(|name| ColumnSpec {
                        id: name.clone(),
                        name: name.clone(),
                        column_type: typed
                            .iter()
                            .find(|entry| &entry.0 == name)
                            .map_or(ColumnType::Mixed, |entry| entry.1),
                    })
                    .collect();

                return Ok((source, columns, index));
            }
            _ => return fail("schema", function),
        }

        previous = name;
    }

    fail("schema", "Table.TransformColumnTypes")
}

fn member_query(
    member: &Member,
    body: &Expr,
    queries: &[(String, Vec<ColumnSpec>)],
) -> Outcome<(MQuery, Vec<ColumnSpec>)> {
    let Expr::Let(bindings, result) = body else {
        return fail("expression", function_name(body));
    };
    let (source, columns, typed) = typed_source(bindings)?;

    let mut state = Builder {
        schema: Schema {
            columns: columns.clone(),
        },
        steps: Vec::new(),
        queries,
    };
    let mut previous = bindings.get(typed).map_or("", |binding| binding.0.as_str());
    for (name, expression) in bindings.iter().skip(typed + 1) {
        state.binding(expression, previous)?;
        previous = name;
    }

    if !matches!(result.as_ref(), Expr::Identifier(name) if name == previous) {
        return fail("expression", "in");
    }

    Ok((
        MQuery {
            id: member.name.clone(),
            name: member.name.clone(),
            source: MSource {
                kind: source.kind,
                source_id: source.source_id,
                locator: source.locator,
                columns,
            },
            steps: state.steps,
            output: None,
        },
        state.schema.columns,
    ))
}

/// Reads a section document; supported members become queries, the rest are
/// reported with their text spans. A malformed section fails as a whole.
pub fn import_section(text: &str) -> Result<(Vec<MQuery>, Vec<Unsupported>), &'static str> {
    let members = parse_section(text)?;
    let mut queries = Vec::new();
    let mut schemas: Vec<(String, Vec<ColumnSpec>)> = Vec::new();
    let mut unsupported = Vec::new();
    let mut pending: Vec<&Member> = members.iter().collect();

    // Members may join members written later, so each pass imports the members whose inputs are known.
    loop {
        let before = pending.len();
        let mut waiting = Vec::new();

        for member in pending {
            let outcome = match &member.body {
                Ok(body) => member_query(member, body, &schemas),
                Err(reason) => Err((*reason, String::from("syntax"))),
            };

            match outcome {
                Ok((query, schema)) => {
                    schemas.push((query.id.clone(), schema));
                    queries.push(query);
                }
                Err(("dependency", input)) if members.iter().any(|other| other.name == input) => {
                    waiting.push(member);
                }
                Err((reason, detail)) => unsupported.push(Unsupported {
                    member: member.name.clone(),
                    reason,
                    detail,
                    span: member.span.clone(),
                }),
            }
        }

        if waiting.is_empty() {
            break;
        }

        if waiting.len() == before {
            // The inputs of these members are unsupported, so they cannot refresh either.
            for member in waiting {
                unsupported.push(Unsupported {
                    member: member.name.clone(),
                    reason: "dependency",
                    detail: String::new(),
                    span: member.span.clone(),
                });
            }
            break;
        }

        pending = waiting;
    }

    Ok((queries, unsupported))
}
