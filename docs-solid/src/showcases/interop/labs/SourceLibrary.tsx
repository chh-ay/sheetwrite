import { formatBytes } from "@docs/lib/format.js";
import { repositorySourceUrl } from "@docs/lib/repository.js";
import { For, Show } from "solid-js";

import {
  type InteropFixture,
  POSITIVE_FIXTURES,
  PRODUCER_MATRIX,
} from "../../scenarios/interop-fixtures.js";
import { actionPending, digests, fixtureLoad, run } from "../state.js";
import { CopyValue, LabAnswer, LabFigure } from "./LabParts.js";
import { nf } from "./vault-data.js";

const MANIFEST = "packages/xlsx/test/fixtures/manifest.json";
/** Leading hex digits a row shows; the copy button copies the full digest. */
const DIGEST_SHOWN = 12;
/** The producer of the committed workbooks, as the manifest names it. */
const PRODUCER = POSITIVE_FIXTURES[0]?.producer ?? "";

function DigestBadge(props: Readonly<{ state: "pending" | "verified" | "mismatch" }>) {
  return (
    <span class="sw-lab-badge" data-outcome={props.state === "verified" ? "pass" : props.state}>
      {props.state === "verified"
        ? "Hash matches"
        : props.state === "mismatch"
          ? "Mismatch"
          : "Hashing…"}
    </span>
  );
}

function FixtureRow(props: Readonly<{ fixture: InteropFixture }>) {
  const digest = () => digests[props.fixture.id];
  const state = () => digest()?.state ?? "pending";
  const loading = () =>
    fixtureLoad()?.id === props.fixture.id && fixtureLoad()?.state === "loading";
  return (
    <tr data-state={state()}>
      <th scope="row">
        <code class="sw-source-file">{props.fixture.file}</code>
        <details class="sw-lab-row-details">
          <summary>{nf(props.fixture.details.length)} features covered</summary>
          <ul aria-label={`Features covered by ${props.fixture.file}`} class="sw-lab-chips">
            <For each={props.fixture.details}>{(detail) => <li>{detail}</li>}</For>
          </ul>
          <Show when={props.fixture.expectedWarnings.length > 0}>
            <p>The manifest expects: {props.fixture.expectedWarnings.join("; ")}</p>
          </Show>
          <p>
            SHA-256{" "}
            <CopyValue
              label={`the SHA-256 of ${props.fixture.file}`}
              shown={`${props.fixture.sha256.slice(0, DIGEST_SHOWN)}…`}
              value={props.fixture.sha256}
            />
          </p>
        </details>
      </th>
      <td class="sw-lab-num">
        {(() => {
          const bytes = digest()?.bytes;
          return bytes === undefined ? "…" : formatBytes(bytes, { kib: 1, mib: 2 });
        })()}
      </td>
      <td>
        <span data-state={state()} data-testid={`fixture-${props.fixture.id}-digest`}>
          <DigestBadge state={state()} />
        </span>
      </td>
      <td class="sw-source-load">
        <button
          aria-busy={loading() || undefined}
          aria-label={`Open ${props.fixture.file} in the workbook`}
          class="sw-button"
          data-size="sm"
          data-testid={`fixture-${props.fixture.id}-load`}
          disabled={state() !== "verified" || actionPending() || loading()}
          onClick={() => run((current) => current.handleFixtureLoad(props.fixture))}
          type="button"
        >
          {loading() ? "Opening…" : "Open"}
        </button>
        <Show when={fixtureLoad()?.id === props.fixture.id ? fixtureLoad() : null}>
          {(load) => (
            <p
              class="sw-source-load__state"
              data-state={load().state}
              data-testid={`fixture-${props.fixture.id}-load-state`}
              role="status"
            >
              {load().detail}
            </p>
          )}
        </Show>
      </td>
    </tr>
  );
}

/** The Source library: workbooks other software saved, hashed here, then opened. */
export function SourceLibrary() {
  const verified = () =>
    POSITIVE_FIXTURES.filter((fixture) => digests[fixture.id]?.state === "verified").length;
  const live = PRODUCER_MATRIX.filter((entry) => entry.status === "verified-live");
  const notOpened = PRODUCER_MATRIX.filter((entry) => entry.status !== "verified-live");
  return (
    <div class="sw-lab-body" data-testid="interop-fixtures-lab">
      <LabAnswer
        answer={
          <>
            Yes for the {nf(POSITIVE_FIXTURES.length)} {PRODUCER} workbooks here. The page checks
            each file's SHA-256 hash against{" "}
            <a href={repositorySourceUrl(MANIFEST)}>the committed manifest</a>, then opens it in
            your browser. {notOpened.map((entry) => entry.producer).join(" and ")} files aren't
            opened on this page yet.
          </>
        }
        figure={
          <LabFigure
            fill={POSITIVE_FIXTURES.length === 0 ? 0 : verified() / POSITIVE_FIXTURES.length}
            label="hashes match"
            of={`/ ${nf(POSITIVE_FIXTURES.length)}`}
            stats={
              <span>
                <b>{nf(live.length)}</b> of {nf(PRODUCER_MATRIX.length)} producers run here
              </span>
            }
            value={nf(verified())}
          />
        }
        headingId="source-question"
        icon="file"
        name="Source library"
        question="Does it open files other apps saved?"
        term={
          <>
            <strong>A hash</strong> is a fingerprint of the file: change one byte and it no longer
            matches.
          </>
        }
      />
      <table class="sw-lab-table sw-source-table">
        <caption class="sw-visually-hidden">
          Workbooks saved by {PRODUCER}, with their hashes
        </caption>
        <thead>
          <tr>
            <th scope="col">File</th>
            <th class="sw-lab-num" scope="col">
              Size
            </th>
            <th scope="col">Hash</th>
            <th scope="col">
              <span class="sw-visually-hidden">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <For each={POSITIVE_FIXTURES}>{(fixture) => <FixtureRow fixture={fixture} />}</For>
        </tbody>
      </table>
      <section aria-labelledby="source-producers" class="sw-source-producers">
        <h4 class="sw-lab-subhead" id="source-producers">
          By producer
        </h4>
        <table class="sw-lab-table" data-testid="interop-producer-matrix">
          <caption class="sw-visually-hidden">Results by producing application</caption>
          <thead>
            <tr>
              <th scope="col">Producer</th>
              <th scope="col">Result</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            <For each={PRODUCER_MATRIX}>
              {(entry) => (
                <tr data-producer={entry.producer} data-state={entry.status}>
                  <th scope="row">{entry.producer}</th>
                  <td>
                    <span
                      class="sw-lab-badge"
                      data-outcome={entry.status === "verified-live" ? "pass" : "none"}
                    >
                      {entry.status === "verified-live" ? "Runs here" : "Not opened here"}
                    </span>
                  </td>
                  <td>
                    <details class="sw-lab-row-details">
                      <summary>
                        {entry.evidence.startsWith("packages/")
                          ? "What is checked in"
                          : "How it runs"}
                      </summary>
                      <p>
                        {entry.detail}{" "}
                        {entry.evidence.startsWith("packages/") ? (
                          <a href={repositorySourceUrl(entry.evidence)}>Evidence file</a>
                        ) : (
                          <code>{entry.evidence}</code>
                        )}
                      </p>
                    </details>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>
    </div>
  );
}
