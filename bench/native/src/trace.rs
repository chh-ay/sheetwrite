//! Parser for the call traces `bun bench/src/formula-bench.ts --trace <dir>`
//! writes (format documented in `bench/src/formula-trace-recorder.ts`).

use std::fmt;

/// One recorded argument of a `CellStore` call.
#[derive(Clone, Debug)]
pub enum Argument {
    Number(f64),
    Text(String),
    Bool(bool),
    Numbers(Vec<f64>),
}

/// The `CellOut` fields a recorded `getCell` returned.
#[derive(Clone, Debug)]
pub struct ExpectedCell {
    pub kind: u8,
    pub number: f64,
    pub text: Option<String>,
}

/// One recorded engine call: a new store or a method on an existing one.
#[derive(Clone, Debug)]
pub enum Call {
    NewStore,
    Method {
        store: usize,
        method: String,
        arguments: Vec<Argument>,
        /// Set for `getCell`: the cell the engine returned when it was recorded.
        expected: Option<ExpectedCell>,
    },
}

/// A fixture's calls, split by the phase the harness was in.
#[derive(Clone, Debug, Default)]
pub struct Workload {
    pub id: String,
    pub size: usize,
    /// Edit workloads restore their fixture between runs; the others are
    /// rebuilt from `setup` before every run.
    pub restores: bool,
    pub setup: Vec<Call>,
    pub run: Vec<Call>,
    pub check: Vec<Call>,
    pub restore: Vec<Call>,
}

impl Workload {
    /// The formula gate's row key, `workload=<id>;size=<size>`.
    pub fn key(&self) -> String {
        format!("workload={};size={}", self.id, self.size)
    }
}

/// A trace line the parser could not read.
#[derive(Debug)]
pub struct TraceError {
    pub line: usize,
    pub reason: String,
}

impl fmt::Display for TraceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "trace line {}: {}", self.line, self.reason)
    }
}

fn unescape(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut characters = text.chars();

    while let Some(character) = characters.next() {
        if character != '\\' {
            output.push(character);
            continue;
        }

        match characters.next() {
            Some('t') => output.push('\t'),
            Some('n') => output.push('\n'),
            Some(other) => output.push(other),
            None => output.push('\\'),
        }
    }

    output
}

/// JavaScript writes `Infinity` and `-Infinity`; Rust reads `inf` and `-inf`.
fn parse_number(text: &str) -> Result<f64, String> {
    text.replace("Infinity", "inf")
        .parse::<f64>()
        .map_err(|error| format!("bad number {text:?}: {error}"))
}

fn parse_argument(field: &str) -> Result<Argument, String> {
    let Some((tag, value)) = field.split_once(':') else {
        return Err(format!("argument {field:?} has no type tag"));
    };

    match tag {
        "n" => parse_number(value).map(Argument::Number),
        "s" => Ok(Argument::Text(unescape(value))),
        "b" => Ok(Argument::Bool(value == "1")),
        "f" if value.is_empty() => Ok(Argument::Numbers(Vec::new())),
        "f" => value
            .split(',')
            .map(parse_number)
            .collect::<Result<Vec<_>, _>>()
            .map(Argument::Numbers),
        _ => Err(format!("unknown argument tag {tag:?}")),
    }
}

fn parse_expected(fields: &[&str]) -> Result<ExpectedCell, String> {
    let [kind, number, text] = fields else {
        return Err(format!(
            "getCell result needs 3 fields, found {}",
            fields.len()
        ));
    };

    Ok(ExpectedCell {
        kind: kind
            .parse()
            .map_err(|error| format!("bad kind {kind:?}: {error}"))?,
        number: parse_number(number)?,
        text: (*text != "~").then(|| unescape(text)),
    })
}

/// Parse one workload trace.
pub fn parse(text: &str) -> Result<Workload, TraceError> {
    let mut workload = Workload::default();
    let mut phase: Option<&str> = None;

    for (index, line) in text.lines().enumerate() {
        let fail = |reason: String| TraceError {
            line: index + 1,
            reason,
        };

        if line.is_empty() {
            continue;
        }

        let fields: Vec<&str> = line.split('\t').collect();

        let calls = match phase {
            Some("setup") => &mut workload.setup,
            Some("run") => &mut workload.run,
            Some("check") => &mut workload.check,
            Some("restore") => &mut workload.restore,
            _ => &mut workload.setup,
        };

        match fields[0] {
            "W" => {
                let [_, id, size, restores] = fields[..] else {
                    return Err(fail(format!("workload header needs 4 fields: {line:?}")));
                };

                workload.id = id.to_owned();
                workload.size = size
                    .parse()
                    .map_err(|error| fail(format!("bad size: {error}")))?;
                workload.restores = restores == "1";
            }
            "P" => {
                phase = match fields.get(1).copied() {
                    Some(name @ ("setup" | "run" | "check" | "restore")) => Some(name),
                    other => return Err(fail(format!("unknown phase {other:?}"))),
                };
            }
            "N" => calls.push(Call::NewStore),
            "C" => {
                if fields.len() < 3 {
                    return Err(fail(format!("call needs a store and a method: {line:?}")));
                }

                let store = fields[1]
                    .parse()
                    .map_err(|error| fail(format!("bad store index: {error}")))?;
                let arguments = fields[3..]
                    .iter()
                    .map(|field| parse_argument(field))
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(fail)?;

                calls.push(Call::Method {
                    store,
                    method: fields[2].to_owned(),
                    arguments,
                    expected: None,
                });
            }
            "=" => {
                let cell = parse_expected(&fields[1..]).map_err(fail)?;

                let Some(Call::Method { expected, .. }) = calls.last_mut() else {
                    return Err(fail("getCell result does not follow a call".to_owned()));
                };

                *expected = Some(cell);
            }
            other => return Err(fail(format!("unknown record {other:?}"))),
        }
    }

    Ok(workload)
}
