import { describe, expect, it } from "bun:test";
import {
  type CommandResult,
  ensurePackageReleases,
  provenanceCommitFromAttestations,
} from "./release-github.js";

const sha = "a".repeat(40);

function result(exitCode: number, stdout = "", stderr = ""): CommandResult {
  return { exitCode, stdout, stderr };
}

describe("independent package GitHub releases", () => {
  it("reads the immutable source commit from npm provenance", () => {
    const payload = Buffer.from(
      JSON.stringify({
        predicate: {
          buildDefinition: { resolvedDependencies: [{ digest: { gitCommit: sha } }] },
        },
      }),
    ).toString("base64");
    expect(
      provenanceCommitFromAttestations({
        attestations: [
          {
            predicateType: "https://slsa.dev/provenance/v1",
            bundle: { dsseEnvelope: { payload } },
          },
        ],
      }),
    ).toBe(sha);
  });

  it("creates missing tags and releases while verifying completed ones", async () => {
    const commands: string[][] = [];
    const packages = [
      { name: "@sheetwrite/wasm", version: "0.2.0" },
      { name: "@sheetwrite/core", version: "0.3.0" },
    ];
    await ensurePackageReleases(
      packages,
      packages,
      sha,
      async (command) => {
        commands.push([...command]);
        const rendered = command.join(" ");
        if (rendered.includes("rev-parse") && rendered.includes("wasm")) return result(1);
        if (rendered.includes("rev-parse") && rendered.includes("core")) return result(0, sha);
        if (rendered.includes("release view") && rendered.includes("wasm")) return result(1);
        if (rendered.includes("release view") && rendered.includes("core")) {
          return result(
            0,
            JSON.stringify({
              tagName: "@sheetwrite/core@0.3.0",
              isDraft: false,
              isPrerelease: false,
            }),
          );
        }
        return result(0);
      },
      async () => sha,
    );

    const rendered = commands.map((command) => command.join("\n"));
    expect(rendered).toContain(`git\ntag\n@sheetwrite/wasm@0.2.0\n${sha}`);
    expect(rendered).toContain("git\npush\norigin\nrefs/tags/@sheetwrite/wasm@0.2.0");
    expect(rendered.some((command) => command.includes("release\ncreate\n@sheetwrite/wasm"))).toBe(
      true,
    );
    expect(rendered.some((command) => command.includes("release\ncreate\n@sheetwrite/core"))).toBe(
      false,
    );
  });

  it("accepts an older attested commit for a previously published package", async () => {
    const previousCommit = "b".repeat(40);
    const identity = { name: "@sheetwrite/core", version: "0.2.0" };
    const run = (attested: string) => {
      const commands: string[] = [];
      const done = ensurePackageReleases(
        [identity],
        [],
        sha,
        async (command) => {
          commands.push(command.join(" "));
          if (command.includes("rev-parse")) return result(0, previousCommit);
          if (command.includes("view")) {
            return result(
              0,
              JSON.stringify({
                tagName: "@sheetwrite/core@0.2.0",
                isDraft: false,
                isPrerelease: false,
              }),
            );
          }
          throw new Error(`Unexpected command ${command.join(" ")}`);
        },
        async () => attested,
      );
      return { done, commands };
    };

    const accepted = run(previousCommit);
    await accepted.done;
    expect(accepted.commands.some((command) => command.includes("rev-parse"))).toBe(true);
    expect(accepted.commands.some((command) => command.includes("view"))).toBe(true);

    // The existing tag must still match the attested commit.
    await expect(run("c".repeat(40)).done).rejects.toThrow("c".repeat(40));
  });

  it("fails closed when an existing package tag targets another commit", async () => {
    const identity = { name: "@sheetwrite/xlsx", version: "0.2.0" };
    await expect(
      ensurePackageReleases(
        [identity],
        [identity],
        sha,
        async () => result(0, "b".repeat(40)),
        async () => sha,
      ),
    ).rejects.toThrow("expected");
  });
});
