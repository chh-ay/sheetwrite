//! Maps parsed section members to saved queries. Only exact supported forms
//! map; anything else keeps its original text span and a reason, and is never
//! evaluated. The supported forms are the ones the emitter writes plus the
//! common shapes of the same M functions (function reference:
//! <https://learn.microsoft.com/powerquery-m/power-query-m-function-reference>).

use std::ops::Range;

use super::parse::{parse_section, Expr, Member};
use super::{MQuery, MSource, MSourceKind};
use crate::plan::{
    Aggregate, AggregateOp, ColumnSpec, ColumnType, CompareOp, ErrorPolicy, JoinKind, Literal,
    OutputColumn, Predicate, Step, StringPairs,
};

const LEFT_ROW: &str = "Sheetwrite.LeftRow";
const RIGHT_ROW: &str = "Sheetwrite.RightRow";
const UTF8_CODE_PAGE: f64 = 65_001.0;
const COMMA: u8 = b',';
const HOST_SOURCE_REASON: &str = "Sheetwrite.HostSource";

/// A member that is kept as text, with the reason and the M function involved.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unsupported {
    /// The member name as written in the section.
    pub member: String,
    /// Stable code for why the member was not imported, such as `step` or `dependency`.
    pub reason: &'static str,
    /// The M function or form that is outside the supported subset, if one is known.
    pub detail: String,
    /// Byte range of the member's text in the section document.
    pub span: Range<usize>,
}

/// The imported queries, in import order, and every member that stays as text.
pub type SectionImport = (Vec<MQuery>, Vec<Unsupported>);

type Outcome<T> = Result<T, (&'static str, String)>;

fn miss(reason: &'static str, detail: &str) -> (&'static str, String) {
    (reason, detail.to_owned())
}

fn fail<T>(reason: &'static str, detail: impl Into<String>) -> Outcome<T> {
    Err((reason, detail.into()))
}

fn call<'a>(expression: &'a Expr, name: &str) -> Option<&'a [Expr]> {
    let Expr::Call(function, arguments) = expression else {
        return None;
    };

    matches!(function.as_ref(), Expr::Identifier(found) if found == name)
        .then_some(arguments.as_slice())
}

fn function_name(expression: &Expr) -> String {
    if let Expr::Identifier(name) = expression {
        return name.clone();
    }

    let Expr::Call(function, _) = expression else {
        return String::from("expression");
    };

    if let Expr::Identifier(name) = function.as_ref() {
        name.clone()
    } else {
        String::from("call")
    }
}

fn text(expression: &Expr) -> Option<&str> {
    if let Expr::Text(value) = expression {
        Some(value)
    } else {
        None
    }
}

fn texts(expression: &Expr) -> Option<Vec<String>> {
    // A single column name is also accepted where M takes `any`.
    if let Expr::Text(value) = expression {
        return Some(vec![value.clone()]);
    }

    let Expr::List(items) = expression else {
        return None;
    };

    items
        .iter()
        .map(|item| text(item).map(str::to_owned))
        .collect()
}

fn pairs(expression: &Expr) -> Option<StringPairs> {
    let Expr::List(items) = expression else {
        return None;
    };

    items
        .iter()
        .map(|item| {
            let Expr::List(pair) = item else {
                return None;
            };

            match pair.as_slice() {
                [left, right] => Some((text(left)?.to_owned(), text(right)?.to_owned())),
                _ => None,
            }
        })
        .collect()
}

fn record_field<'a>(record: &'a Expr, name: &str) -> Option<&'a Expr> {
    let Expr::Record(fields) = record else {
        return None;
    };

    fields
        .iter()
        .find(|field| field.0 == name)
        .map(|field| &field.1)
}

/// Primitive types the engine stores; integer and currency facets read as numbers.
fn column_type(expression: &Expr) -> Option<ColumnType> {
    let (Expr::Type(name) | Expr::Identifier(name)) = expression else {
        return None;
    };

    Some(match name.as_str() {
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

/// The output columns of an imported query, which later members may join.
struct QuerySchema {
    /// The query's stable id, which join steps name.
    id: String,
    columns: Vec<ColumnSpec>,
}

struct Source {
    kind: MSourceKind,
    source_id: String,
    locator: Option<String>,
    /// Column names fixed before typing, if the M lists them.
    names: Option<Vec<String>>,
}

/// The source, its declared columns, and the index of the binding that types them.
struct TypedSource {
    source: Source,
    columns: Vec<ColumnSpec>,
    typed: usize,
}

fn web_locator(expression: &Expr) -> Option<String> {
    let arguments = call(expression, "Web.Contents")?;
    match arguments {
        [url] => text(url).map(str::to_owned),
        _ => None,
    }
}

/// `Csv.Document(Web.Contents(url), [options])`.
fn csv_source(arguments: &[Expr]) -> Outcome<Source> {
    let (contents, options) = match arguments {
        [contents] => (contents, None),
        [contents, options] => (contents, Some(options)),
        _ => return fail("source", "Csv.Document"),
    };
    let locator = web_locator(contents).ok_or_else(|| ("source", function_name(contents)))?;
    let mut delimiter = COMMA;
    let mut columns = None;

    if let Some(record) = options {
        let Expr::Record(fields) = record else {
            return fail("source", "Csv.Document");
        };

        for (name, value) in fields {
            match (name.as_str(), value) {
                ("Delimiter", Expr::Text(text)) if text.len() == 1 && text.is_ascii() => {
                    if let Some(&byte) = text.as_bytes().first() {
                        delimiter = byte;
                    }
                }
                ("Columns", Expr::Number(count)) => columns = Some(*count),
                ("Encoding", Expr::Number(code)) if *code == UTF8_CODE_PAGE => {}
                ("QuoteStyle", Expr::Identifier(style)) if style == "QuoteStyle.Csv" => {}
                _ => return fail("source", format!("Csv.Document {name}")),
            }
        }
    }

    let _ = columns;
    Ok(Source {
        kind: MSourceKind::Csv {
            delimiter,
            headers: false,
            empty_is_null: false,
        },
        source_id: locator.clone(),
        locator: Some(locator),
        names: None,
    })
}

/// `Excel.CurrentWorkbook(){[Name = "Table"]}[Content]`: a workbook table that the host supplies.
fn workbook_table(expression: &Expr) -> Option<&str> {
    let Expr::Field(Some(target), field) = expression else {
        return None;
    };
    if field != "Content" {
        return None;
    }

    let Expr::Item(workbook, selector) = target.as_ref() else {
        return None;
    };
    if !call(workbook, "Excel.CurrentWorkbook").is_some_and(<[Expr]>::is_empty) {
        return None;
    }

    record_field(selector, "Name").and_then(text)
}

/// The emitter's marker for a host-supplied source: an error record that names the source.
fn host_source_marker(expression: &Expr) -> Option<&str> {
    let Expr::Error(record) = expression else {
        return None;
    };
    let Some([reason, _, detail]) = call(record, "Error.Record") else {
        return None;
    };
    if text(reason) != Some(HOST_SOURCE_REASON) {
        return None;
    }

    record_field(detail, "SourceId").and_then(text)
}

/// The first binding: where data comes from.
fn source(expression: &Expr) -> Outcome<Source> {
    if let Some(arguments) = call(expression, "Csv.Document") {
        return csv_source(arguments);
    }

    if let Some([contents]) = call(expression, "Json.Document") {
        let locator = web_locator(contents).ok_or_else(|| ("source", function_name(contents)))?;
        return Ok(Source {
            kind: MSourceKind::Json { path: Vec::new() },
            source_id: locator.clone(),
            locator: Some(locator),
            names: None,
        });
    }

    if let Some(id) = workbook_table(expression).or_else(|| host_source_marker(expression)) {
        return Ok(Source {
            kind: MSourceKind::Host,
            source_id: id.to_owned(),
            locator: None,
            names: None,
        });
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
const fn mirrored(op: CompareOp) -> CompareOp {
    match op {
        CompareOp::Lt => CompareOp::Gt,
        CompareOp::Lte => CompareOp::Gte,
        CompareOp::Gt => CompareOp::Lt,
        CompareOp::Gte => CompareOp::Lte,
        CompareOp::Eq | CompareOp::Neq => op,
    }
}

fn literal(expression: &Expr) -> Option<Literal> {
    Some(match expression {
        Expr::Null => Literal::Null,
        Expr::Logical(value) => Literal::Logical(*value),
        Expr::Number(value) => Literal::Number(*value),
        Expr::Negate(inner) => {
            let Expr::Number(value) = inner.as_ref() else {
                return None;
            };
            Literal::Number(-value)
        }
        Expr::Text(value) => Literal::Text(value.clone()),
        Expr::Identifier(_)
        | Expr::List(_)
        | Expr::Record(_)
        | Expr::Field(..)
        | Expr::Item(..)
        | Expr::Call(..)
        | Expr::Each(_)
        | Expr::Let(..)
        | Expr::Not(_)
        | Expr::Binary(..)
        | Expr::Type(_)
        | Expr::Error(_) => return None,
    })
}

fn row_field(expression: &Expr) -> Option<&str> {
    if let Expr::Field(None, name) = expression {
        Some(name)
    } else {
        None
    }
}

/// A comparison between one row field and a literal, in either order.
fn comparison(operator: &str, left: &Expr, right: &Expr, schema: &Schema) -> Outcome<Predicate> {
    let written = compare_op(operator).ok_or_else(|| ("expression", operator.to_owned()))?;
    let (field_name, operand, op) = match (row_field(left), row_field(right)) {
        (Some(field_name), None) => (field_name, right, written),
        (None, Some(field_name)) => (field_name, left, mirrored(written)),
        _ => return fail("expression", "comparison"),
    };
    let column = schema.id(field_name)?;
    let value = literal(operand).ok_or_else(|| miss("expression", "comparison value"))?;

    Ok(match (op, &value) {
        (CompareOp::Eq, Literal::Null) => Predicate::IsNull { column },
        (CompareOp::Neq, Literal::Null) => Predicate::Not {
            predicate: Box::new(Predicate::IsNull { column }),
        },
        _ => Predicate::Compare { column, op, value },
    })
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
                    (other, _) => predicates.push(other),
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
        Expr::Binary(operator, left, right) => comparison(operator, left, right, schema),
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
        Expr::Null
        | Expr::Number(_)
        | Expr::Text(_)
        | Expr::Identifier(_)
        | Expr::List(_)
        | Expr::Record(_)
        | Expr::Field(..)
        | Expr::Item(..)
        | Expr::Each(_)
        | Expr::Let(..)
        | Expr::Negate(_)
        | Expr::Type(_)
        | Expr::Error(_) => fail("expression", "condition"),
    }
}

/// `each (condition) = true`, as the emitter writes, or a plain `each condition`.
fn condition(expression: &Expr, schema: &Schema) -> Outcome<Predicate> {
    let Expr::Each(body) = expression else {
        return fail("expression", "Table.SelectRows");
    };

    if let Expr::Binary("=", inner, value) = body.as_ref() {
        if matches!(value.as_ref(), Expr::Logical(true)) {
            return predicate(inner, schema);
        }
    }

    predicate(body, schema)
}

/// The engine join kind for an M `JoinKind.*` name.
fn join_kind(kind: &Expr) -> Outcome<JoinKind> {
    let Expr::Identifier(name) = kind else {
        return fail("step", "Table.Join");
    };

    Ok(match name.as_str() {
        "JoinKind.Inner" => JoinKind::Inner,
        "JoinKind.LeftOuter" => JoinKind::Left,
        "JoinKind.RightOuter" => JoinKind::Right,
        "JoinKind.FullOuter" => JoinKind::Full,
        "JoinKind.LeftSemi" => JoinKind::LeftSemi,
        "JoinKind.RightSemi" => JoinKind::RightSemi,
        "JoinKind.LeftAnti" => JoinKind::LeftAnti,
        "JoinKind.RightAnti" => JoinKind::RightAnti,
        _ => return fail("step", name.clone()),
    })
}

struct Builder<'a> {
    schema: Schema,
    steps: Vec<Step>,
    queries: &'a [QuerySchema],
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

    /// Selects every current column except the removed names.
    fn remove(&mut self, removed: &[String]) -> Outcome<()> {
        let kept: Vec<String> = self
            .schema
            .columns
            .iter()
            .filter(|column| !removed.contains(&column.name))
            .map(|column| column.name.clone())
            .collect();
        self.select(&kept)
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
            let [name_expression, type_expression] = pair.as_slice() else {
                return fail("step", "Table.TransformColumnTypes");
            };
            let name =
                text(name_expression).ok_or_else(|| miss("step", "Table.TransformColumnTypes"))?;
            let kind = column_type(type_expression)
                .ok_or_else(|| ("type", function_name(type_expression)))?;
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
        let right_schema = self
            .queries
            .iter()
            .find(|entry| &entry.id == input)
            .map(|entry| entry.columns.clone())
            .ok_or_else(|| ("dependency", input.clone()))?;
        let join = join_kind(kind)?;
        let left_names = texts(left_keys).ok_or_else(|| miss("step", "Table.Join"))?;
        let right_names = texts(right_keys).ok_or_else(|| miss("step", "Table.Join"))?;
        if left_names.len() != right_names.len() {
            return fail("step", "Table.Join");
        }

        let mut keys = Vec::new();
        for (left, right_name) in left_names.iter().zip(&right_names) {
            let right_id = right_schema
                .iter()
                .find(|column| &column.name == right_name)
                .map(|column| column.id.clone())
                .ok_or_else(|| ("column", right_name.clone()))?;
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
        let right_input = unwrap(right, RIGHT_ROW)?;

        self.join(left_keys, &right_input, right_keys, kind)
    }

    /// One `{name, each fold(...), type}` entry of `Table.Group`.
    fn aggregate(&self, item: &Expr) -> Outcome<Aggregate> {
        let Expr::List(parts) = item else {
            return fail("step", "Table.Group");
        };
        let (label, each) = match parts.as_slice() {
            [label, each] | [label, each, _] => (label, each),
            _ => return fail("step", "Table.Group"),
        };
        let name = text(label)
            .ok_or_else(|| miss("step", "Table.Group"))?
            .to_owned();
        let Expr::Each(body) = each else {
            return fail("step", "Table.Group");
        };
        let Expr::Call(callee, arguments) = body.as_ref() else {
            return fail("aggregate", "expression");
        };
        let Expr::Identifier(function) = callee.as_ref() else {
            return fail("step", "Table.Group");
        };
        let (op, column) = match (function.as_str(), arguments.as_slice()) {
            ("Table.RowCount", [Expr::Identifier(row)]) if row == "_" => {
                (AggregateOp::CountRows, None)
            }
            (list_function, [Expr::Field(None, column)]) => {
                let op = match list_function {
                    "List.NonNullCount" => AggregateOp::Count,
                    "List.Sum" => AggregateOp::Sum,
                    "List.Average" => AggregateOp::Average,
                    "List.Min" => AggregateOp::Min,
                    "List.Max" => AggregateOp::Max,
                    other => return fail("aggregate", other.to_owned()),
                };
                (op, Some(self.schema.id(column)?))
            }
            (other, _) => return fail("aggregate", other.to_owned()),
        };

        Ok(Aggregate {
            id: name.clone(),
            name,
            op,
            column,
        })
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
            let fold = self.aggregate(item)?;
            let kind = match fold.op {
                AggregateOp::Min | AggregateOp::Max => fold
                    .column
                    .as_deref()
                    .and_then(|id| self.schema.columns.iter().find(|entry| entry.id == id))
                    .map_or(ColumnType::Mixed, |entry| entry.column_type),
                AggregateOp::CountRows
                | AggregateOp::Count
                | AggregateOp::Sum
                | AggregateOp::Average => ColumnType::Number,
            };
            next.push(ColumnSpec {
                id: fold.id.clone(),
                name: fold.name.clone(),
                column_type: kind,
            });
            folds.push(fold);
        }

        self.schema.columns = next;
        self.steps.push(Step::Group {
            keys: key_ids,
            aggregates: folds,
        });
        Ok(())
    }

    fn unpivot(&mut self, ids: Vec<String>, attribute_name: &str, value_name: &str) {
        self.schema
            .columns
            .retain(|column| !ids.contains(&column.id));
        let attribute = OutputColumn {
            id: self.schema.fresh(attribute_name),
            name: attribute_name.to_owned(),
        };
        self.schema.columns.push(ColumnSpec {
            id: attribute.id.clone(),
            name: attribute.name.clone(),
            column_type: ColumnType::Text,
        });
        let value = OutputColumn {
            id: self.schema.fresh(value_name),
            name: value_name.to_owned(),
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

    /// An unpivot whose attribute and value column names are text arguments of `function`.
    fn unpivot_named(
        &mut self,
        function: &str,
        ids: Vec<String>,
        attribute: &Expr,
        value: &Expr,
    ) -> Outcome<()> {
        let attribute_name = text(attribute).ok_or_else(|| miss("step", function))?;
        let value_name = text(value).ok_or_else(|| miss("step", function))?;
        self.unpivot(ids, attribute_name, value_name);
        Ok(())
    }

    /// One binding after the typed source; each maps to one or more engine steps.
    fn binding(&mut self, expression: &Expr, previous: &str) -> Outcome<()> {
        let input_is_previous =
            |argument: &Expr| matches!(argument, Expr::Identifier(name) if name == previous);
        let name = function_name(expression);
        let Expr::Call(_, arguments) = expression else {
            return fail("step", name);
        };
        let names_of = |list: &Expr| texts(list).ok_or_else(|| miss("step", &name));

        match (name.as_str(), arguments.as_slice()) {
            ("Table.SelectRows", [input, each]) if input_is_previous(input) => {
                let predicate = condition(each, &self.schema)?;
                self.steps.push(Step::Filter { predicate });
                Ok(())
            }
            ("Table.SelectColumns", [input, names]) if input_is_previous(input) => {
                self.select(&names_of(names)?)
            }
            ("Table.RemoveColumns", [sorted, _]) if call(sorted, "Table.Sort").is_some() => {
                self.helper_join(sorted)
            }
            ("Table.RemoveColumns", [input, names]) if input_is_previous(input) => {
                self.remove(&names_of(names)?)
            }
            ("Table.RenameColumns", [input, renames]) if input_is_previous(input) => {
                self.rename(&pairs(renames).ok_or_else(|| miss("step", &name))?)
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
                let ids = names_of(names)?
                    .iter()
                    .map(|column| self.schema.id(column))
                    .collect::<Outcome<Vec<_>>>()?;
                self.unpivot_named(&name, ids, attribute, value)
            }
            ("Table.UnpivotOtherColumns", [input, names, attribute, value])
                if input_is_previous(input) =>
            {
                let kept = names_of(names)?;
                let ids: Vec<String> = self
                    .schema
                    .columns
                    .iter()
                    .filter(|column| !kept.contains(&column.name))
                    .map(|column| column.id.clone())
                    .collect();
                self.unpivot_named(&name, ids, attribute, value)
            }
            _ => fail("step", name),
        }
    }
}

/// The field names of a chain of field accesses, outermost last, and the expression they start from.
fn field_path(expression: &Expr) -> (Vec<String>, &Expr) {
    let mut fields = Vec::new();
    let mut current = expression;
    while let Expr::Field(Some(target), field) = current {
        fields.push(field.clone());
        current = target;
    }

    fields.reverse();
    (fields, current)
}

/// Positional names `Column1..ColumnN` renamed to the declared names, in order.
fn positional_names(renames: &Expr, function: &str) -> Outcome<Vec<String>> {
    let pairs = pairs(renames).ok_or_else(|| miss("schema", function))?;
    let mut names = Vec::new();
    for (position, (old, new)) in pairs.iter().enumerate() {
        if *old != format!("Column{}", position + 1) {
            return fail("schema", function);
        }
        names.push(new.clone());
    }

    Ok(names)
}

/// The typed schema: declared names keep their order; listed types apply to them, others stay
/// mixed. Without declared names, the listed columns are the schema.
fn declared_columns(
    names: Option<&[String]>,
    list: &Expr,
    function: &str,
) -> Outcome<Vec<ColumnSpec>> {
    let Expr::List(items) = list else {
        return fail("schema", function);
    };
    let mut typed: Vec<(String, ColumnType)> = Vec::new();
    for item in items {
        let Expr::List(pair) = item else {
            return fail("schema", function);
        };
        let [name_expression, type_expression] = pair.as_slice() else {
            return fail("schema", function);
        };
        let column = text(name_expression)
            .ok_or_else(|| miss("schema", function))?
            .to_owned();
        typed.push((
            column,
            column_type(type_expression).ok_or_else(|| ("type", function_name(type_expression)))?,
        ));
    }

    let ordered = names.map_or_else(
        || typed.iter().map(|entry| entry.0.clone()).collect(),
        <[String]>::to_vec,
    );
    Ok(ordered
        .iter()
        .map(|name| ColumnSpec {
            id: name.clone(),
            name: name.clone(),
            column_type: typed
                .iter()
                .find(|entry| &entry.0 == name)
                .map_or(ColumnType::Mixed, |entry| entry.1),
        })
        .collect())
}

/// The bindings before typing: headers, column selection, blanks and the typed schema.
fn typed_source(bindings: &[(String, Expr)]) -> Outcome<TypedSource> {
    let (first_name, first) = bindings.first().ok_or_else(|| miss("source", "let"))?;
    let mut source = source(first)?;
    let mut previous = first_name.as_str();

    for (index, (name, expression)) in bindings.iter().enumerate().skip(1) {
        let is_previous =
            |argument: &Expr| matches!(argument, Expr::Identifier(found) if found == previous);
        let function = function_name(expression);
        let arguments: &[Expr] = if let Expr::Call(_, arguments) = expression {
            arguments
        } else if matches!(expression, Expr::Field(..)) {
            // JSON record navigation, `Source[result][items]`.
            &[]
        } else {
            return fail("schema", function);
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
                source.names = Some(texts(names).ok_or_else(|| miss("schema", &function))?);
            }
            (MSourceKind::Csv { headers: false, .. }, "Table.RenameColumns", [input, renames])
                if is_previous(input) =>
            {
                source.names = Some(positional_names(renames, &function)?);
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
                let (fields, root) = field_path(expression);
                if !is_previous(root) {
                    return fail("schema", "navigation");
                }
                path.extend(fields);
            }
            (
                MSourceKind::Json { path },
                "Table.FromRecords",
                [input, names, Expr::Identifier(missing)],
            ) if missing == "MissingField.UseNull" => {
                // The record list may be navigated inline, as in `Source[data][items]`.
                let (fields, root) = field_path(input);
                if !is_previous(root) {
                    return fail("schema", function);
                }

                path.extend(fields);
                source.names = Some(texts(names).ok_or_else(|| miss("schema", &function))?);
            }
            (_, "Table.TransformColumnTypes", [input, list, ..]) if is_previous(input) => {
                let columns = declared_columns(source.names.as_deref(), list, &function)?;
                return Ok(TypedSource {
                    source,
                    columns,
                    typed: index,
                });
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
    queries: &[QuerySchema],
) -> Outcome<(MQuery, QuerySchema)> {
    let Expr::Let(bindings, result) = body else {
        return fail("expression", function_name(body));
    };
    let TypedSource {
        source,
        columns,
        typed,
    } = typed_source(bindings)?;

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
        QuerySchema {
            id: member.name.clone(),
            columns: state.schema.columns,
        },
    ))
}

/// Reads a section document; supported members become queries, the rest are
/// reported with their text spans. A malformed section fails as a whole.
pub fn import_section(text: &str) -> Result<SectionImport, &'static str> {
    let members = parse_section(text)?;
    let mut queries = Vec::new();
    let mut schemas: Vec<QuerySchema> = Vec::new();
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
                    schemas.push(schema);
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
