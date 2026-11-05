//! Exported M must read back to the same plans, and unsupported M must stay text.

#![allow(clippy::indexing_slicing)]

use super::{emit_section, import_section, MQuery, MSource, MSourceKind};
use crate::plan::{
    Aggregate, AggregateOp, ColumnSpec, ColumnType, CompareOp, ErrorPolicy, JoinKind, Literal,
    OutputColumn, Predicate, Step,
};

fn column(name: &str, column_type: ColumnType) -> ColumnSpec {
    ColumnSpec {
        id: name.to_owned(),
        name: name.to_owned(),
        column_type,
    }
}

fn query(
    name: &str,
    kind: MSourceKind,
    locator: Option<&str>,
    columns: Vec<ColumnSpec>,
    steps: Vec<Step>,
) -> MQuery {
    MQuery {
        id: name.to_owned(),
        name: name.to_owned(),
        source: MSource {
            kind,
            source_id: locator.unwrap_or(name).to_owned(),
            locator: locator.map(str::to_owned),
            columns,
        },
        steps,
        output: None,
    }
}

/// Queries whose identities equal their names, so an import must reproduce them exactly.
fn fixtures() -> Vec<MQuery> {
    let regions = query(
        "Regions",
        MSourceKind::Json {
            path: vec![String::from("data"), String::from("items")],
        },
        Some("https://example.test/regions.json"),
        vec![
            column("Code", ColumnType::Text),
            column("Area \"North\"", ColumnType::Text),
        ],
        vec![],
    );
    let sales = query(
        "Sales.report",
        MSourceKind::Csv {
            delimiter: b';',
            headers: true,
            empty_is_null: true,
        },
        Some("https://example.test/sales.csv"),
        vec![
            column("Region", ColumnType::Text),
            column("Total", ColumnType::Number),
            column("Day", ColumnType::Date),
        ],
        vec![
            Step::Filter {
                predicate: Predicate::And {
                    predicates: vec![
                        Predicate::Compare {
                            column: String::from("Total"),
                            op: CompareOp::Gte,
                            value: Literal::Number(-2.5),
                        },
                        Predicate::Not {
                            predicate: Box::new(Predicate::Or {
                                predicates: vec![
                                    Predicate::IsNull {
                                        column: String::from("Region"),
                                    },
                                    Predicate::Contains {
                                        column: String::from("Region"),
                                        text: String::from("x\"#(y"),
                                    },
                                ],
                            }),
                        },
                    ],
                },
            },
            Step::ChangeType {
                column: String::from("Total"),
                column_type: ColumnType::Text,
                on_error: ErrorPolicy::Null,
            },
            Step::Join {
                input: String::from("Regions"),
                keys: vec![(String::from("Region"), String::from("Code"))],
                join: JoinKind::Left,
            },
            Step::Rename {
                columns: vec![(String::from("Day"), String::from("Date"))],
            },
            Step::Group {
                keys: vec![String::from("Region")],
                aggregates: vec![
                    Aggregate {
                        id: String::from("Rows"),
                        name: String::from("Rows"),
                        op: AggregateOp::CountRows,
                        column: None,
                    },
                    Aggregate {
                        id: String::from("Latest"),
                        name: String::from("Latest"),
                        op: AggregateOp::Max,
                        column: Some(String::from("Day")),
                    },
                ],
            },
            Step::Unpivot {
                columns: vec![String::from("Rows")],
                attribute: OutputColumn {
                    id: String::from("Field"),
                    name: String::from("Field"),
                },
                value: OutputColumn {
                    id: String::from("Value"),
                    name: String::from("Value"),
                },
            },
            Step::Select {
                columns: vec![String::from("Field"), String::from("Value")],
            },
        ],
    );
    let host = query(
        "Budget",
        MSourceKind::Host,
        None,
        vec![column("Amount", ColumnType::Number)],
        vec![],
    );
    let positional = query(
        "Positional",
        MSourceKind::Csv {
            delimiter: b',',
            headers: false,
            empty_is_null: false,
        },
        Some("https://example.test/plain.csv"),
        vec![
            column("A", ColumnType::Text),
            column("B", ColumnType::Logical),
        ],
        vec![],
    );

    vec![sales, regions, host, positional]
}

#[test]
fn exported_sections_import_to_the_same_plans() {
    let queries = fixtures();
    let section = emit_section(&queries);
    let (imported, unsupported) = import_section(&section.text).unwrap();

    assert_eq!(unsupported, vec![], "{}", section.text);
    assert_eq!(imported.len(), queries.len());

    for original in &queries {
        // Member names drop characters M forbids; the host keeps the original name.
        let member = &section.members[queries
            .iter()
            .position(|query| query.id == original.id)
            .unwrap()];
        let found = imported.iter().find(|query| &query.name == member).unwrap();

        assert_eq!(
            format!("{:?}", found.source.kind),
            format!("{:?}", original.source.kind)
        );
        assert_eq!(found.source.locator, original.source.locator);
        assert_eq!(
            format!("{:?}", found.source.columns),
            format!("{:?}", original.source.columns)
        );
        assert_eq!(
            format!("{:?}", found.steps),
            format!("{:?}", original.steps),
            "{member}"
        );
    }
}

#[test]
fn reported_differences_name_their_query_and_step() {
    let section = emit_section(&fixtures());
    let codes: Vec<(usize, Option<usize>, &str)> = section
        .losses
        .iter()
        .map(|loss| (loss.query, loss.step, loss.code))
        .collect();

    assert!(codes.contains(&(0, None, "member-name")));
    assert!(codes.contains(&(0, Some(1), "error-policy-scope")));
    assert!(codes.contains(&(2, None, "host-source")));
    assert_eq!(section.members[0], "Sales_report");
}

#[test]
fn workbook_queries_from_m_documentation_forms_import() {
    let text = r#"section Section1;

shared Orders = let
    Source = Excel.CurrentWorkbook(){[Name="Orders"]}[Content],
    #"Changed Type" = Table.TransformColumnTypes(Source,{{"Region", type text}, {"Amount", Int64.Type}}),
    #"Filtered Rows" = Table.SelectRows(#"Changed Type", each [Amount] > 10 and [Region] <> null),
    #"Grouped Rows" = Table.Group(#"Filtered Rows", {"Region"}, {{"Total", each List.Sum([Amount]), type nullable number}}),
    #"Kept" = Table.RemoveColumns(#"Grouped Rows", {"Region"})
in
    #"Kept";

shared Files = let
    Source = Folder.Files("C:\data")
in
    Source;

shared Lambda = let
    Source = Orders,
    Added = Table.AddColumn(Source, "Flag", each if [Total] > 1 then "y" else "n")
in
    Added;

shared Joined = let
    Source = Excel.CurrentWorkbook(){[Name="Keys"]}[Content],
    Typed = Table.TransformColumnTypes(Source, {{"Region", type text}}),
    Merged = Table.Join(Typed, {"Region"}, Files, {"Name"}, JoinKind.Inner)
in
    Merged;
"#;
    let (queries, unsupported) = import_section(text).unwrap();

    assert_eq!(queries.len(), 1);
    assert!(matches!(queries[0].source.kind, MSourceKind::Host));
    assert_eq!(queries[0].source.source_id, "Orders");
    assert_eq!(
        format!("{:?}", queries[0].steps),
        format!(
            "{:?}",
            vec![
                Step::Filter {
                    predicate: Predicate::And {
                        predicates: vec![
                            Predicate::Compare {
                                column: String::from("Amount"),
                                op: CompareOp::Gt,
                                value: Literal::Number(10.0),
                            },
                            Predicate::Not {
                                predicate: Box::new(Predicate::IsNull {
                                    column: String::from("Region"),
                                }),
                            },
                        ],
                    },
                },
                Step::Group {
                    keys: vec![String::from("Region")],
                    aggregates: vec![Aggregate {
                        id: String::from("Total"),
                        name: String::from("Total"),
                        op: AggregateOp::Sum,
                        column: Some(String::from("Amount")),
                    }],
                },
                Step::Select {
                    columns: vec![String::from("Total")],
                },
            ]
        )
    );

    let reasons: Vec<(&str, &str, &str)> = unsupported
        .iter()
        .map(|entry| (entry.member.as_str(), entry.reason, entry.detail.as_str()))
        .collect();
    assert_eq!(
        reasons,
        vec![
            ("Files", "source", "Folder.Files"),
            ("Lambda", "syntax", "syntax"),
            ("Joined", "dependency", ""),
        ]
    );

    let files = &unsupported[0];
    assert!(text[files.span.clone()].starts_with("shared Files = let"));
    assert!(text[files.span.clone()].ends_with("Source;"));
}

#[test]
fn malformed_or_hostile_text_fails_without_evaluation() {
    assert_eq!(
        import_section("section Other; shared A = 1;").unwrap_err(),
        "section"
    );
    assert!(import_section("shared A = 1;").is_err());
    assert!(import_section("section Section1; shared A = \"open;").is_err());

    let deep = format!(
        "section Section1;\nshared Deep = {}1{};\n",
        "(".repeat(500),
        ")".repeat(500)
    );
    let (queries, unsupported) = import_section(&deep).unwrap();
    assert!(queries.is_empty());
    assert_eq!(unsupported[0].reason, "limit");
}

#[test]
fn query_lists_round_trip_through_host_lanes() {
    let mut queries = fixtures();
    queries[1].output = Some(String::from("Regions table"));

    let mut writer = super::PlanWriter::default();
    super::encode_queries(&queries, &mut writer);
    let writer = writer.finish();
    let decoded = super::decode_queries(
        crate::plan_wire::PlanWire {
            codes: &writer.codes,
            numbers: &writer.numbers,
            text: &writer.text,
            offsets: &writer.offsets,
        },
        &crate::plan::Limits::default(),
    )
    .unwrap();

    assert_eq!(format!("{decoded:?}"), format!("{queries:?}"));

    let mut padded = writer.codes.clone();
    padded.push(0);
    let issue = super::decode_queries(
        crate::plan_wire::PlanWire {
            codes: &padded,
            numbers: &writer.numbers,
            text: &writer.text,
            offsets: &writer.offsets,
        },
        &crate::plan::Limits::default(),
    )
    .unwrap_err();
    assert_eq!(issue.code, "definition");
}
