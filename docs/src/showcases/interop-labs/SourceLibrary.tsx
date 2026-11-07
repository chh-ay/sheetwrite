// The Source library lab: workbooks saved by other software, each a card with
// its size, its checksum as hashed in this browser, and a button that loads it.

import { formatBytes } from "../../lib/format.js";
import { repositorySourceUrl } from "../../lib/repository.js";
import type { InteroperabilityWorkbench } from "../InteroperabilityShowcase.js";
import {
  type InteropFixture,
  POSITIVE_FIXTURES,
  PRODUCER_MATRIX,
} from "../scenarios/interoperability.js";
import { CopyValue } from "./CopyValue.js";

const MANIFEST = "packages/xlsx/test/fixtures/manifest.json";
/** Leading hex digits a card shows; the copy button copies the full digest. */
const DIGEST_SHOWN = 16;

function DigestBadge({ state }: Readonly<{ state: "pending" | "verified" | "mismatch" }>) {
  const [tone, text] =
    state === "verified"
      ? (["accent", "Checksum verified"] as const)
      : state === "mismatch"
        ? (["danger", "Checksum mismatch"] as const)
        : ([undefined, "Hashing…"] as const);
  return (
    <span className="sw-badge" data-size="sm" data-tone={tone}>
      {text}
    </span>
  );
}

function FixtureCard({
  fixture,
  workbench,
}: Readonly<{ fixture: InteropFixture; workbench: InteroperabilityWorkbench }>) {
  const { action, run, digests, fixtureLoad, handleFixtureLoad } = workbench;
  const digest = digests[fixture.id];
  const state = digest?.state ?? "pending";
  const loading = fixtureLoad?.id === fixture.id && fixtureLoad.state === "loading";
  return (
    <li className="sw-si-fixture-card" data-state={state}>
      <header>
        <span className="sw-si-fixture-card__producer">{fixture.producer}</span>
        <span data-testid={`fixture-${fixture.id}-digest`} data-state={state}>
          <DigestBadge state={state} />
        </span>
      </header>
      <strong className="sw-si-fixture-card__file">{fixture.file}</strong>
      <dl className="sw-si-fixture-card__facts">
        <div>
          <dt>Size</dt>
          <dd>
            {digest?.bytes === undefined ? "…" : formatBytes(digest.bytes, { kib: 1, mib: 2 })}
          </dd>
        </div>
        <div>
          <dt>SHA-256</dt>
          <dd>
            <CopyValue
              label={`the SHA-256 of ${fixture.file}`}
              shown={`${fixture.sha256.slice(0, DIGEST_SHOWN)}…`}
              value={fixture.sha256}
            />
          </dd>
        </div>
      </dl>
      <ul aria-label={`Features covered by ${fixture.file}`} className="sw-si-chips">
        {fixture.details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
      {fixture.expectedWarnings.length > 0 && (
        <p className="sw-si-fixture-card__note">
          The manifest expects: {fixture.expectedWarnings.join("; ")}
        </p>
      )}
      <footer>
        <button
          aria-busy={loading || undefined}
          aria-label={`Load ${fixture.file} into the grid`}
          className="sw-button"
          data-size="sm"
          data-testid={`fixture-${fixture.id}-load`}
          disabled={state !== "verified" || action.pending || loading}
          onClick={() => run(() => handleFixtureLoad(fixture))}
          type="button"
        >
          {loading ? "Loading…" : "Load into grid"}
        </button>
        {fixtureLoad?.id === fixture.id && (
          <p
            className="sw-si-fixture-card__load"
            data-state={fixtureLoad.state}
            data-testid={`fixture-${fixture.id}-load-state`}
            role="status"
          >
            {fixtureLoad.detail}
          </p>
        )}
      </footer>
    </li>
  );
}

/** One row per producing application, with whether its files ran here. */
function ProducerTable() {
  return (
    <div className="sw-si-tablewrap">
      <table className="sw-si-table" data-testid="interop-producer-matrix">
        <caption>Results by producing application</caption>
        <thead>
          <tr>
            <th scope="col">Application</th>
            <th scope="col">Result</th>
            <th scope="col">What was checked</th>
          </tr>
        </thead>
        <tbody>
          {PRODUCER_MATRIX.map((entry) => (
            <tr data-producer={entry.producer} data-state={entry.status} key={entry.producer}>
              <th scope="row">{entry.producer}</th>
              <td>
                <span
                  className="sw-badge"
                  data-size="sm"
                  data-tone={entry.status === "verified-live" ? "accent" : undefined}
                >
                  {entry.status === "verified-live" ? "Verified here" : "Result unavailable"}
                </span>
              </td>
              <td>
                {entry.detail}{" "}
                {entry.evidence.startsWith("packages/") ? (
                  <a href={repositorySourceUrl(entry.evidence)}>Evidence file</a>
                ) : (
                  <code>{entry.evidence}</code>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SourceLibrary({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  return (
    <div className="sw-si-lab-body" data-testid="interop-fixtures-lab">
      <p className="sw-si-lab-body__lede">
        Bytes saved by other software, committed with their provenance in{" "}
        <a href={repositorySourceUrl(MANIFEST)}>
          <code>{MANIFEST}</code>
        </a>
        . This page hashes each file and loads it only when the checksum matches.
      </p>
      <ul className="sw-si-fixture-cards">
        {POSITIVE_FIXTURES.map((fixture) => (
          <FixtureCard fixture={fixture} key={fixture.id} workbench={workbench} />
        ))}
      </ul>
      <ProducerTable />
    </div>
  );
}
