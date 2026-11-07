/**
 * Worker side of `NativeHoverClient`. It owns two processes of one compiler,
 * TypeScript 7.1 (`tsgo`) or tsrs, which ships a copy of the 7.1 API:
 *
 * - the `async` API, which parses each sample to find its identifiers
 *   (`sync` cannot run under Bun: it reads Node's private
 *   `stdout._handle.fd`);
 * - the language server (`--lsp --stdio`), which answers hover and
 *   definition requests, because the 7.1 API has no quick-info call.
 *
 * Vue and Svelte samples go through the content mappers that the hover
 * tsconfig names: the API builds the project to read the mapped file and its
 * span map, and the language server answers in positions of the original file.
 *
 * The main thread blocks on `signal` until the reply is posted, which keeps
 * `SheetwriteTypeEngine.analyze` synchronous.
 *
 * Node loads this file directly as a worker, so it imports no repository modules.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { type MessagePort, workerData } from "node:worker_threads";

import type * as NativeAst from "typescript-7.1/ast";
import type * as NativeAstGuards from "typescript-7.1/ast/is";
import type * as NativeAsyncApi from "typescript-7.1/async";
import type * as NativeFileSystem from "typescript-7.1/fs";

export type NativeCompiler = "tsgo" | "tsrs";

export interface NativeHoverDocument {
  uri: string;
  languageId: string;
  text: string;
}

export interface NativeIdentifier {
  text: string;
  start: number;
  end: number;
  line: number;
  character: number;
}

/** A Vue or Svelte sample, with the hover tsconfig that names the content mappers. */
export interface NativeMappedFile {
  projectFile: string;
  projectText: string;
  fileName: string;
  document: NativeHoverDocument;
}

export type NativeHoverRequest =
  | { kind: "open"; documents: readonly NativeHoverDocument[] }
  | { kind: "close"; uris: readonly string[] }
  | { kind: "analyze"; fileName: string; document: NativeHoverDocument }
  | { kind: "analyzeMapped"; file: NativeMappedFile }
  | { kind: "dispose" };

export interface NativeHoverAnswer {
  identifiers: NativeIdentifier[];
  /** Markdown hover text per identifier; `null` where the server has no hover. */
  hovers: (string | null)[];
  /** Definition file URIs per identifier. */
  definitions: string[][];
}

export type NativeHoverReply =
  | { ok: true; answer?: NativeHoverAnswer }
  | { ok: false; error: string };

export interface NativeHoverWorkerInput {
  port: MessagePort;
  signal: Int32Array;
  rootDirectory: string;
  compiler: NativeCompiler;
  /** Source of the engine's pattern for compiler-generated names that get no hover. */
  internalIdentifier: string;
}

interface JsonRpcMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message: string };
}

interface HoverResult {
  contents?: { kind: string; value: string };
}

interface LspLocation {
  uri?: string;
  targetUri?: string;
}

interface PendingRequest {
  resolve(result: unknown): void;
  reject(error: Error): void;
}

const HEADER_SEPARATOR = "\r\n\r\n";
const CONTENT_LENGTH = /Content-Length: (\d+)/i;

function nativeCompilerPath(compiler: NativeCompiler): string {
  if (compiler === "tsrs") {
    const packageJson = createRequire(import.meta.url).resolve("tsrs/package.json");
    // The binary ships in a per-platform package; the Linux ones name their C library.
    const libc = process.platform === "linux" ? "-gnu" : "";
    const platformPackage = `@tsrs/${process.platform}-${process.arch}${libc}/package.json`;
    const platformDirectory = dirname(createRequire(packageJson).resolve(platformPackage));
    return join(platformDirectory, process.platform === "win32" ? "tsrs.exe" : "tsrs");
  }
  const packageJson = createRequire(import.meta.url).resolve("typescript-7.1/package.json");
  const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}/package.json`;
  const platformDirectory = dirname(createRequire(packageJson).resolve(platformPackage));
  return join(platformDirectory, "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function positionAt(
  starts: readonly number[],
  offset: number,
): { line: number; character: number } {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle;
  }
  return { line: low, character: offset - (starts[low] ?? 0) };
}

class LanguageServerConnection {
  private readonly child: ChildProcess;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly versions = new Map<string, number>();
  private nextId = 1;
  private buffered = Buffer.alloc(0);

  constructor(compiler: NativeCompiler) {
    this.child = spawn(nativeCompilerPath(compiler), ["--lsp", "--stdio"], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.child.stdout?.on("data", (chunk: Buffer) => this.receive(chunk));
    this.child.on("exit", (code: number | null) => {
      const failure = new Error(`TypeScript language server exited with code ${code}`);
      for (const request of this.pending.values()) request.reject(failure);
      this.pending.clear();
    });
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  async initialize(rootDirectory: string): Promise<void> {
    await this.request("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(rootDirectory).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        textDocument: { hover: { contentFormat: ["markdown"] }, definition: {} },
      },
      // Lets the server start the content mappers that the hover tsconfig names.
      initializationOptions: { runExternalCode: true },
    });
    this.notify("initialized", {});
  }

  open(document: NativeHoverDocument): void {
    const version = (this.versions.get(document.uri) ?? 0) + 1;
    if (this.versions.has(document.uri)) {
      this.notify("textDocument/didChange", {
        textDocument: { uri: document.uri, version },
        contentChanges: [{ text: document.text }],
      });
    } else {
      this.notify("textDocument/didOpen", { textDocument: { ...document, version } });
    }
    this.versions.set(document.uri, version);
  }

  close(uri: string): void {
    if (!this.versions.delete(uri)) return;
    this.notify("textDocument/didClose", { textDocument: { uri } });
  }

  async hover(uri: string, position: { line: number; character: number }): Promise<string | null> {
    const hover = (await this.request("textDocument/hover", {
      textDocument: { uri },
      position,
    })) as HoverResult | null;
    return hover?.contents?.value ?? null;
  }

  async definition(uri: string, position: { line: number; character: number }): Promise<string[]> {
    const result = (await this.request("textDocument/definition", {
      textDocument: { uri },
      position,
    })) as LspLocation | LspLocation[] | null;
    const locations = result === null ? [] : Array.isArray(result) ? result : [result];
    return locations.flatMap((location) => location.targetUri ?? location.uri ?? []);
  }

  async shutdown(): Promise<void> {
    // The server rejects `params: null` here; JSON.stringify drops `undefined`.
    await this.request("shutdown", undefined);
    this.notify("exit", undefined);
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    // The docs tsconfig targets ES2022, which has no Promise.withResolvers.
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.send({ id, method, params });
    return result;
  }

  private notify(method: string, params: unknown): void {
    this.send({ method, params });
  }

  private send(message: JsonRpcMessage): void {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message });
    this.child.stdin?.write(`Content-Length: ${Buffer.byteLength(body)}${HEADER_SEPARATOR}${body}`);
  }

  private receive(chunk: Buffer): void {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    for (;;) {
      const headerEnd = this.buffered.indexOf(HEADER_SEPARATOR);
      if (headerEnd < 0) return;
      const header = this.buffered.toString("ascii", 0, headerEnd);
      const length = Number(CONTENT_LENGTH.exec(header)?.[1]);
      const bodyStart = headerEnd + HEADER_SEPARATOR.length;
      if (this.buffered.length < bodyStart + length) return;
      const body = this.buffered.toString("utf8", bodyStart, bodyStart + length);
      this.buffered = this.buffered.subarray(bodyStart + length);
      this.dispatch(JSON.parse(body) as JsonRpcMessage);
    }
  }

  private dispatch(message: JsonRpcMessage): void {
    // Notifications (logs, diagnostics) carry no id; hovers do not need them.
    if (message.id === undefined) return;
    if (message.method !== undefined) {
      // Server-to-client requests (configuration, capability registration): accept with no data.
      this.send({ id: message.id, result: null });
      return;
    }
    const id = Number(message.id);
    const pending = this.pending.get(id);
    if (!pending) throw new Error(`TypeScript language server answered unknown request ${id}`);
    this.pending.delete(id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }
}

const { port, signal, rootDirectory, compiler, internalIdentifier } =
  workerData as NativeHoverWorkerInput;
const internalName = new RegExp(internalIdentifier);
const apiPackage = compiler === "tsrs" ? "tsrs" : "typescript-7.1";
const [{ ScriptKind, SpanMapFidelity }, { isIdentifier }, { API }, { createFileSystemLayer }] =
  await Promise.all([
    import(`${apiPackage}/ast`) as Promise<typeof NativeAst>,
    import(`${apiPackage}/ast/is`) as Promise<typeof NativeAstGuards>,
    import(`${apiPackage}/async`) as Promise<typeof NativeAsyncApi>,
    import(`${apiPackage}/fs`) as Promise<typeof NativeFileSystem>,
  ]);
const parser = new API({ cwd: rootDirectory, runExternalCode: true });
const server = new LanguageServerConnection(compiler);
const ready = server.initialize(rootDirectory);

interface IdentifierNode {
  text: string;
  start: number;
  end: number;
}

/** Every identifier of a parsed file, minus compiler-generated names. */
function identifierNodes(sourceFile: NativeAst.SourceFile): IdentifierNode[] {
  const identifiers: IdentifierNode[] = [];
  const visit = (node: NativeAst.Node): void => {
    if (isIdentifier(node) && !internalName.test(node.text)) {
      identifiers.push({ text: node.text, start: node.getStart(sourceFile), end: node.end });
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return identifiers;
}

async function identifiersOf(
  fileName: string,
  document: NativeHoverDocument,
): Promise<NativeIdentifier[]> {
  const lease = await parser.createSourceFile(fileName, document.text, {
    scriptKind: document.languageId === "typescriptreact" ? ScriptKind.TSX : ScriptKind.TS,
  });
  try {
    const starts = lineStarts(document.text);
    return identifierNodes(lease.sourceFile).map((identifier) => ({
      ...identifier,
      ...positionAt(starts, identifier.start),
    }));
  } finally {
    await lease.dispose();
  }
}

/**
 * Identifiers of a content-mapped file, in positions of the original file: the
 * project build returns the mapper's TypeScript and its span map, and only
 * identifiers copied from the original as they are written are kept.
 */
async function mappedIdentifiersOf({
  projectFile,
  projectText,
  fileName,
  document,
}: NativeMappedFile): Promise<NativeIdentifier[]> {
  const snapshot = await parser.createSnapshot({
    fileSystem: createFileSystemLayer([
      [projectFile, projectText],
      [fileName, document.text],
    ]),
    openProjects: [projectFile],
  });
  try {
    const project = snapshot.getConfiguredProject(projectFile);
    const sourceFile = await project?.program.getSourceFile(fileName);
    const spanMap = sourceFile?.spanMap;
    if (!sourceFile || !spanMap) {
      throw new Error(`no content mapper turned ${fileName} into TypeScript`);
    }
    const starts = lineStarts(document.text);
    const byStart = new Map<number, NativeIdentifier>();
    for (const identifier of identifierNodes(sourceFile)) {
      const { range, fidelity } = spanMap.virtualToOriginalSpan({
        pos: identifier.start,
        end: identifier.end,
      });
      if (fidelity !== SpanMapFidelity.Exact && fidelity !== SpanMapFidelity.Atom) continue;
      if (document.text.slice(range.pos, range.end) !== identifier.text) continue;
      if (byStart.has(range.pos)) continue;
      byStart.set(range.pos, {
        text: identifier.text,
        start: range.pos,
        end: range.end,
        ...positionAt(starts, range.pos),
      });
    }
    return [...byStart.values()].sort((left, right) => left.start - right.start);
  } finally {
    await snapshot.dispose();
  }
}

async function answerAt(
  document: NativeHoverDocument,
  identifiers: NativeIdentifier[],
): Promise<NativeHoverAnswer> {
  server.open(document);
  const hovers = identifiers.map((identifier) => server.hover(document.uri, identifier));
  const definitions = identifiers.map((identifier) => server.definition(document.uri, identifier));
  return {
    identifiers,
    hovers: await Promise.all(hovers),
    definitions: await Promise.all(definitions),
  };
}

async function handle(request: NativeHoverRequest): Promise<NativeHoverReply> {
  await ready;
  switch (request.kind) {
    case "open":
      for (const document of request.documents) server.open(document);
      return { ok: true };
    case "close":
      for (const uri of request.uris) server.close(uri);
      return { ok: true };
    case "analyze":
      return {
        ok: true,
        answer: await answerAt(
          request.document,
          await identifiersOf(request.fileName, request.document),
        ),
      };
    case "analyzeMapped":
      return {
        ok: true,
        answer: await answerAt(request.file.document, await mappedIdentifiersOf(request.file)),
      };
    case "dispose":
      await server.shutdown();
      await parser.close();
      return { ok: true };
  }
}

port.on("message", (request: NativeHoverRequest) => {
  handle(request).then(reply, (error: unknown) =>
    reply({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
});

function reply(message: NativeHoverReply): void {
  port.postMessage(message);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
}
