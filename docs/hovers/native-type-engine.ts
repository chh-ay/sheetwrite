/**
 * Hovers for `ts` and `tsx` samples from TypeScript 7.1.
 *
 * The 7.1 API (`typescript/async`) parses each sample to find its identifiers;
 * it has no quick-info call, so the 7.1 language server (`tsc --lsp --stdio`)
 * answers `textDocument/hover` and `textDocument/definition` for them.
 *
 * - One language server and one API session serve every sample.
 * - Each sample is an in-memory file named by its content hash in one project
 *   (`moduleDetection: "force"` keeps samples from sharing globals). Samples
 *   requested in the same turn of the event loop are opened together and all
 *   their requests are sent at once; the server answers them in parallel.
 * - Nothing is kept between runs: every pass asks the server again, so results
 *   always follow the current Sheetwrite types, dependencies and settings.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { type Node, ScriptKind } from "typescript/ast";
import {
  isIdentifier,
  isJsxAttribute,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
} from "typescript/ast/is";
import { API } from "typescript/async";

import type {
  SheetwriteHoverOrigin,
  SheetwriteTypeHover,
} from "../src/lib/sheetwrite-type-engine.js";
import { type NativeQuickInfo, parseNativeHover } from "./native-quick-info.js";

export interface NativeTypeEngineOptions {
  /** Where the language server and API run; sample resolution does not depend on it. */
  cwd: string;
  /** Identifiers that never get a hover (compiler-generated names). */
  internalIdentifier: RegExp;
  /** Tag text that is never reader-facing. */
  internalTagText: RegExp;
  fsMap?: ReadonlyMap<string, string>;
}

type Language = "ts" | "tsx" | "vue";

/** Names in a Vue template: identifiers and kebab-case attribute and event names. */
const TEMPLATE_NAME = /[A-Za-z_$][\w$]*(?:-[\w$]+)*/g;
/** Words a template name pattern also matches that are never bindings. */
const RESERVED_WORDS = new Set(
  "break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof new null return super switch this throw true try typeof undefined var void while with yield let static await of as".split(
    " ",
  ),
);

/** An identifier in a sample, in UTF-16 offsets and LSP line/character. */
export interface NativeIdentifier {
  text: string;
  start: number;
  end: number;
  line: number;
  character: number;
  /** The name of a property in an object literal (`name: value` or `name`). */
  propertyName: boolean;
  /** The name of a JSX attribute (`height` in `<Grid height={400} />`). */
  jsxAttribute: boolean;
}

export interface IdentifierSelection {
  key: string;
  keep(identifier: NativeIdentifier): boolean;
}

interface Sample {
  key: string;
  source: string;
  language: Language;
  selection?: IdentifierSelection;
  resolve(hovers: SheetwriteTypeHover[]): void;
  reject(error: Error): void;
}

interface JsonRpcMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message: string };
}

interface PendingRequest {
  resolve(result: unknown): void;
  reject(error: Error): void;
}

interface LspPosition {
  line: number;
  character: number;
}

interface LspLocation {
  uri?: string;
  targetUri?: string;
  range?: { start: LspPosition };
  targetSelectionRange?: { start: LspPosition };
}

interface Definition {
  file: string;
  uri: string;
  position: LspPosition;
}

/** Long enough to span the gaps between code blocks in a site build. */
const PARSER_IDLE_MS = 1000;
/**
 * Samples in the shared project at once. 64 is as fast as all 304 (2.9 s) and keeps the
 * server about 150 MiB smaller; 32 or fewer get slower as the program is rebuilt more often.
 */
const SAMPLES_PER_PROJECT = 64;
/**
 * In a program shared by many samples the 7.1 server sometimes prints a member's
 * declared owner instead of the instantiated one (`Array<T>.length` for
 * `Array<CellAddress>.length`), depending on which sample was checked first. Hovers
 * whose owner shows type parameters are asked again in a program of their own sample.
 */
const GENERIC_MEMBER_OWNER = /^\((?:property|method)\) [\w$]+(?:\.[\w$]+)*<(.+?)>\.[\w$]+[?:(<]/;
const TYPE_PARAMETER_ARGUMENT = /\bextends\b|(?:^|,\s*)[A-Z][A-Za-z]{0,2}(?:,|$)/;
const HEADER_SEPARATOR = "\r\n\r\n";
const CONTENT_LENGTH = /Content-Length: (\d+)/i;
/** This package; `typescript` and `@vue/content-mapper` resolve from here as 7.1. */
const HOVERS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
/**
 * The in-memory projects live under node_modules: the server's search for a file's
 * tsconfig stops there, so opening them never loads the docs or package projects above.
 */
const PROJECT_DIRECTORY = join(HOVERS_DIRECTORY, "node_modules/.sheetwrite-hover");
/**
 * A property of the object literal itself: no declaring type before the name, and not
 * optional, which only a property of the contextual type can be.
 */
const LITERAL_PROPERTY = /^\(property\) [\w$]+: /;
/**
 * A property hover that names its declaring type (`Column.header`). Without one, the
 * declaration sits in a generic or inline type and its hover shows unfilled type
 * parameters (`props: Props`), which says less than the literal's own type.
 */
const OWNED_PROPERTY = /^\(property\) [\w$]+(?:<[^>]*>)?\.[\w$]+\??: /;

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
}

function hash(...parts: readonly string[]): string {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(part).update("\0");
  return digest.digest("hex");
}

/**
 * Where a hovered symbol's definitions live; drives the docs hover-quality gate.
 * `libraryDirectory` holds the server's built-in `lib.*.d.ts` files, which count as lib
 * wherever the server is installed.
 */
function hoverOrigin(
  definitionFiles: readonly string[],
  sampleFile: string,
  libraryDirectory: string,
): SheetwriteHoverOrigin | undefined {
  let origin: SheetwriteHoverOrigin | undefined;
  for (const definitionFile of definitionFiles) {
    const file = normalizedPath(definitionFile);
    if (file === sampleFile) return "snippet";
    if (!file.includes("/node_modules/") && !file.startsWith(libraryDirectory)) {
      return "workspace";
    }
    origin = "lib";
  }
  return origin;
}

/**
 * The summary of the JSDoc comment that ends right above `line` (the declaration's name
 * line, or the line its comment-led statement starts on), without leading `*` and without
 * the `@tag` section, as the language server shows it. Empty when there is none.
 */
function jsDocSummaryBefore(lines: readonly string[], line: number): string {
  let end = line - 1;
  while (end >= 0 && (lines[end] ?? "").trim() === "") end -= 1;
  if (!(lines[end] ?? "").trim().endsWith("*/")) return "";
  let start = end;
  while (start >= 0 && !(lines[start] ?? "").includes("/**")) start -= 1;
  if (start < 0) return "";
  const body = lines
    .slice(start, end + 1)
    .join("\n")
    .replace(/^[\s\S]*?\/\*\*/, "")
    .replace(/\*\/\s*$/, "")
    .split("\n")
    .map((text) => text.replace(/^\s*\* ?/, ""));
  const tagStart = body.findIndex((text) => /^\s*@\w/.test(text));
  return (tagStart < 0 ? body : body.slice(0, tagStart)).join("\n").trim();
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

function nativeCompilerPath(): string {
  const packageJson = createRequire(import.meta.url).resolve("typescript/package.json");
  const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}/package.json`;
  const platformDirectory = dirname(createRequire(packageJson).resolve(platformPackage));
  return join(platformDirectory, "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
}

/**
 * The language server to run: TypeScript 7.1's `tsc`, or another server with the same
 * `--lsp --stdio` interface (such as tsrs) named by `SHEETWRITE_HOVER_COMPILER`.
 */
function serverExecutable(): string {
  return process.env.SHEETWRITE_HOVER_COMPILER || nativeCompilerPath();
}

function setReferenced(handle: object | null | undefined, referenced: boolean): void {
  if (!handle) return;
  if (referenced && "ref" in handle && typeof handle.ref === "function") handle.ref();
  if (!referenced && "unref" in handle && typeof handle.unref === "function") handle.unref();
}

/** JSON-RPC over the language server's stdio. Holds the process open only while requests are in flight. */
class LanguageServer {
  private readonly child: ChildProcess;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly versions = new Map<string, number>();
  private nextId = 1;
  private buffered = Buffer.alloc(0);

  constructor(executable: string) {
    this.child = spawn(executable, ["--lsp", "--stdio"], {
      stdio: ["pipe", "pipe", "inherit"],
      // Collecting at 75% heap growth instead of 100% kept the same time with less memory.
      env: { ...process.env, GOGC: process.env.GOGC ?? "75" },
    });
    this.child.stdout?.on("data", (chunk: Buffer) => this.receive(chunk));
    this.child.on("exit", (code: number | null) => {
      const failure = new Error(`TypeScript 7.1 language server exited with code ${code}`);
      for (const request of this.pending.values()) request.reject(failure);
      this.pending.clear();
    });
  }

  async initialize(rootDirectory: string): Promise<void> {
    await this.request("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(rootDirectory).href,
      // Lets the server start the Vue content mapper the sample projects configure. Pushed
      // diagnostics would check opened samples in the background, beside the hover requests.
      // Type acquisition is off for every project, inferred ones included: it ran
      // `npm install` whenever a hover opened a file outside the sample projects. Only
      // errors are logged (verbosity 5): a pass otherwise sent about 24,000 log messages.
      initializationOptions: {
        runExternalCode: true,
        disablePushDiagnostics: true,
        logVerbosity: 5,
        userPreferences: { tsserver: { automaticTypeAcquisition: { enabled: false } } },
      },
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        // The server then reads `workspace/didChangeWatchedFiles`, which `writeProject` sends.
        workspace: { didChangeWatchedFiles: { dynamicRegistration: true } },
        textDocument: { hover: { contentFormat: ["markdown"] }, definition: {} },
      },
    });
    this.notify("initialized", {});
  }

  open(uri: string, languageId: string, text: string): void {
    const version = (this.versions.get(uri) ?? 0) + 1;
    if (this.versions.has(uri)) {
      this.notify("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
    } else {
      this.notify("textDocument/didOpen", { textDocument: { uri, languageId, version, text } });
    }
    this.versions.set(uri, version);
  }

  close(uri: string): void {
    if (!this.versions.delete(uri)) return;
    this.notify("textDocument/didClose", { textDocument: { uri } });
  }

  /**
   * Writes a project's tsconfig to disk. An open tsconfig document would get an inferred
   * project of its own, whose type acquisition runs `npm install types-registry` (180 MiB
   * of npm processes, and network access) in the middle of the pass.
   */
  writeProject(directory: string, config: string): void {
    const file = join(directory, "tsconfig.json");
    mkdirSync(directory, { recursive: true });
    writeFileSync(file, config);
    // The server caches directory contents; without this it may not see the new file and
    // put the samples in an inferred project with default options.
    this.notify("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(file).href, type: 1 }],
    });
  }

  removeProject(directory: string): void {
    const file = join(directory, "tsconfig.json");
    rmSync(directory, { recursive: true, force: true });
    this.notify("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(file).href, type: 3 }],
    });
  }

  async hover(
    uri: string,
    position: { line: number; character: number },
  ): Promise<string | undefined> {
    const hover = (await this.request("textDocument/hover", {
      textDocument: { uri },
      position,
    })) as {
      contents?: { value: string };
    } | null;
    return hover?.contents?.value;
  }

  async definitions(uri: string, position: LspPosition): Promise<Definition[]> {
    const result = (await this.request("textDocument/definition", {
      textDocument: { uri },
      position,
    })) as LspLocation | LspLocation[] | null;
    const locations = result === null ? [] : Array.isArray(result) ? result : [result];
    return locations.flatMap((location) => {
      const target = location.targetUri ?? location.uri;
      const start = location.targetSelectionRange?.start ?? location.range?.start;
      return target && start ? [{ file: fileURLToPath(target), uri: target, position: start }] : [];
    });
  }

  /** A socket on which this server also serves the TypeScript API (`custom/initializeAPISession`). */
  async apiPipe(): Promise<string> {
    const result = (await this.request("custom/initializeAPISession", {})) as { pipe?: unknown };
    if (typeof result?.pipe !== "string") throw new Error("The server returned no API pipe");
    return result.pipe;
  }

  async shutdown(): Promise<void> {
    // The server rejects `params: null` here; JSON.stringify drops `undefined`.
    await this.request("shutdown", undefined);
    this.notify("exit", undefined);
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    if (this.pending.size === 0) this.setReferenced(true);
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

  private setReferenced(referenced: boolean): void {
    setReferenced(this.child, referenced);
    setReferenced(this.child.stdin, referenced);
    setReferenced(this.child.stdout, referenced);
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
    if (!pending) throw new Error(`TypeScript 7.1 language server answered unknown request ${id}`);
    this.pending.delete(id);
    if (this.pending.size === 0) this.setReferenced(false);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }
}

export class NativeTypeEngine {
  private readonly projectDirectory: string;
  private readonly inFlight = new Map<string, Promise<SheetwriteTypeHover[]>>();
  /**
   * Hovers at declarations outside the samples (libraries, Sheetwrite's declarations),
   * JSDoc summaries by declaration file and line, and declaration file lines. Many
   * samples of a batch ask about the same declarations, so each is asked or read once
   * per batch; `drain` clears them after every batch.
   */
  private readonly declarationHovers = new Map<string, Promise<NativeQuickInfo | undefined>>();
  private readonly declarationDocs = new Map<string, string>();
  private readonly declarationFiles = new Map<string, string[]>();
  /** Names each batch's project directory. */
  private batches = 0;
  /** Hovers taken from their declaration; the isolated recheck leaves them as they are. */
  private readonly declaredHovers = new WeakSet<SheetwriteTypeHover>();
  private queue: Sample[] = [];
  private flushScheduled = false;
  private session: Promise<LanguageServer> | undefined;
  /** The API session holds the process open, so it closes once no batch has run for a moment. */
  private parser: Promise<API<boolean>> | undefined;
  private parserIdle: NodeJS.Timeout | undefined;
  /** Samples waiting for a batch, and the loop that runs batches while any wait. */
  private readonly pending: Sample[] = [];
  private worker: Promise<void> | undefined;
  /** The server's own directory, which holds its built-in `lib.*.d.ts` files. */
  private readonly libraryDirectory = `${normalizedPath(dirname(realpathSync(serverExecutable())))}/`;

  constructor(private readonly options: NativeTypeEngineOptions) {
    this.projectDirectory = normalizedPath(PROJECT_DIRECTORY);
  }

  /**
   * `selection` limits the identifiers that are asked about to those a caller can map
   * back to the page; its key must change whenever `keep` would.
   */
  analyze(
    source: string,
    language: Language,
    selection?: IdentifierSelection,
  ): Promise<SheetwriteTypeHover[]> {
    return new Promise((resolveHovers, reject) => {
      this.queue.push({
        key: hash(language, source, selection?.key ?? ""),
        source,
        language,
        ...(selection ? { selection } : {}),
        resolve: resolveHovers,
        reject,
      });
      if (this.flushScheduled) return;
      this.flushScheduled = true;
      // Every sample requested in this turn of the event loop goes into one batch.
      setTimeout(() => void this.flush(), 0);
    });
  }

  async dispose(): Promise<void> {
    await this.closeParser();
    if (!this.session) return;
    const server = await this.session;
    this.session = undefined;
    await server.shutdown();
  }

  private async closeParser(): Promise<void> {
    clearTimeout(this.parserIdle);
    const parser = this.parser;
    this.parser = undefined;
    await (await parser)?.close();
  }

  private sampleFile(sample: Pick<Sample, "key" | "language">, project: string): string {
    return `${this.projectDirectory}/${project}/${sample.key.slice(0, 16)}.${sample.language}`;
  }

  private projectConfig(files: readonly string[]): string {
    return JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        moduleDetection: "force",
        // Requests already run in parallel; more checkers only repeat the same lib work.
        checkers: 1,
        jsx: "react-jsx",
        jsxImportSource: "react",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        // TypeScript 7 loads no `@types` packages by default; 5.9 loaded all of them.
        types: ["*"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noImplicitAny: false,
        noEmit: true,
      },
      // Only projects holding a Vue sample start the mapper's process.
      ...(files.some((file) => file.endsWith(".vue"))
        ? {
            contentMappers: [
              { package: "@vue/content-mapper", extensions: [".vue"], options: { target: 3.5 } },
            ],
          }
        : {}),
      typeAcquisition: { enable: false },
      files: files.map((file) => basename(file)),
    });
  }

  private start(): Promise<LanguageServer> {
    this.session ??= (async () => {
      const server = new LanguageServer(serverExecutable());
      await server.initialize(this.options.cwd);
      for (const [fileName, text] of this.options.fsMap ?? []) {
        server.open(pathToFileURL(fileName).href, languageId(fileName), text);
      }
      return server;
    })();
    return this.session;
  }

  /**
   * Identifier discovery parses with the language server's own process, over the API
   * socket it opens on request, instead of starting a second TypeScript process. A server
   * without that request gets a separate API process.
   */
  private parserSession(server: LanguageServer): Promise<API<boolean>> {
    clearTimeout(this.parserIdle);
    this.parser ??= server.apiPipe().then(
      (pipe) => API.fromLSPConnection({ pipe }),
      () => new API({ cwd: this.options.cwd }),
    );
    return this.parser;
  }

  private async flush(): Promise<void> {
    const batch = this.queue;
    this.queue = [];
    this.flushScheduled = false;
    try {
      const server = await this.start();
      for (const sample of batch) {
        // The same sample text requested again while it is still being analyzed.
        const known = this.inFlight.get(sample.key);
        if (known) {
          Promise.resolve(known).then(sample.resolve, sample.reject);
          continue;
        }
        const result = new Promise<SheetwriteTypeHover[]>((resolveHovers, reject) => {
          this.pending.push({ ...sample, resolve: resolveHovers, reject });
        });
        this.inFlight.set(sample.key, result);
        result.then(sample.resolve, sample.reject);
      }
      this.worker ??= this.drain(server);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      for (const sample of batch) sample.reject(failure);
    }
  }

  /**
   * The only place batches run, one after another until no sample is waiting. Samples
   * that arrive while a batch runs (Svelte samples, after their codegen) join the next
   * batch; a second batch alongside the first held 1.1 GB and was no faster. Vue samples
   * get batches of their own: only those projects configure the Vue content mapper, and
   * the server stops the mapper's process once no project uses it.
   */
  private async drain(server: LanguageServer): Promise<void> {
    try {
      while (this.pending.length > 0) {
        const vue = this.pending[0]?.language === "vue";
        const samples: Sample[] = [];
        for (let index = 0; index < this.pending.length && samples.length < SAMPLES_PER_PROJECT;) {
          const sample = this.pending[index];
          if (sample && (sample.language === "vue") === vue) {
            samples.push(sample);
            this.pending.splice(index, 1);
          } else index += 1;
        }
        try {
          // A fresh directory per batch: its tsconfig is new, so no change needs announcing.
          await this.analyzeTogether(server, samples, `batch-${this.batches++}`);
        } catch (error) {
          const failure = error instanceof Error ? error : new Error(String(error));
          for (const sample of samples) sample.reject(failure);
        } finally {
          this.declarationHovers.clear();
          this.declarationDocs.clear();
          this.declarationFiles.clear();
        }
      }
    } finally {
      this.worker = undefined;
      if (this.parser) {
        this.parserIdle = setTimeout(() => void this.closeParser(), PARSER_IDLE_MS);
      }
    }
  }

  /** One project holds the samples while the server answers all their requests in parallel. */
  private async analyzeTogether(
    server: LanguageServer,
    samples: readonly Sample[],
    project: string,
  ): Promise<void> {
    const parser = await this.parserSession(server);
    const files = samples.map((sample) => this.sampleFile(sample, project));
    const directory = `${this.projectDirectory}/${project}`;
    server.writeProject(directory, this.projectConfig(files));
    for (const [index, sample] of samples.entries()) {
      const file = files[index] ?? "";
      server.open(pathToFileURL(file).href, languageId(file), sample.source);
    }
    // Hovers at declarations outside the samples make the server look up those files'
    // projects, which in the middle of checking 64 samples cost 14 s of server CPU. They
    // wait until every sample of the batch has its own answers.
    let checking = samples.length;
    let startLookups: () => void = () => {};
    const lookups = new Promise<void>((resolve) => {
      startLookups = resolve;
    });
    const sampleChecked = () => {
      checking -= 1;
      if (checking === 0) startLookups();
    };
    await Promise.all(
      samples.map(async (sample) => {
        try {
          const shared = await this.sampleHovers(server, parser, sample, project, {
            checked: sampleChecked,
            lookups,
          });
          const hovers = await this.recheckGenericOwners(server, sample, shared);
          sample.resolve(hovers);
        } catch (error) {
          sample.reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
          this.inFlight.delete(sample.key);
        }
      }),
    );
    // Closed samples leave the program, so the server holds only samples in flight.
    for (const file of files) server.close(pathToFileURL(file).href);
    server.removeProject(directory);
  }

  /**
   * Asks again, in a program holding only this sample, for hovers whose owner shows type
   * parameters. One request at a time, in source order, so the answer does not depend on
   * which request the server happened to check first.
   */
  private async recheckGenericOwners(
    server: LanguageServer,
    sample: Sample,
    hovers: SheetwriteTypeHover[],
  ): Promise<SheetwriteTypeHover[]> {
    const suspects = hovers.filter((hover) => {
      if (this.declaredHovers.has(hover)) return false;
      const owner = GENERIC_MEMBER_OWNER.exec(hover.text);
      return owner?.[1] !== undefined && TYPE_PARAMETER_ARGUMENT.test(owner[1]);
    });
    if (suspects.length === 0) return hovers;
    const project = `alone-${sample.key.slice(0, 16)}`;
    const file = this.sampleFile(sample, project);
    const uri = pathToFileURL(file).href;
    const directory = `${this.projectDirectory}/${project}`;
    server.writeProject(directory, this.projectConfig([file]));
    server.open(uri, languageId(file), sample.source);
    try {
      const answers = new Map<SheetwriteTypeHover, NativeQuickInfo | undefined>();
      for (const hover of suspects) {
        const markdown = await server.hover(uri, hover);
        answers.set(
          hover,
          markdown ? parseNativeHover(markdown, this.options.internalTagText) : undefined,
        );
      }
      return hovers.map((hover) => {
        const quickInfo = answers.get(hover);
        return quickInfo?.text ? this.hover(quickInfo, hover, hover.origin) : hover;
      });
    } finally {
      server.close(uri);
      server.removeProject(directory);
    }
  }

  private hover(
    quickInfo: NativeQuickInfo,
    position: Pick<SheetwriteTypeHover, "start" | "length" | "target" | "line" | "character">,
    origin: SheetwriteHoverOrigin | undefined,
  ): SheetwriteTypeHover {
    const tags = quickInfo.tags.filter(
      ([, value]) => !value || !this.options.internalTagText.test(value),
    );
    return {
      type: "hover",
      text: quickInfo.text,
      ...(quickInfo.docs ? { docs: quickInfo.docs } : {}),
      ...(tags.length ? { tags } : {}),
      ...(origin ? { origin } : {}),
      start: position.start,
      length: position.length,
      target: position.target,
      line: position.line,
      character: position.character,
    };
  }

  private async sampleHovers(
    server: LanguageServer,
    parser: API<boolean>,
    sample: Sample,
    project: string,
    phases: { checked(): void; lookups: Promise<void> },
  ): Promise<SheetwriteTypeHover[]> {
    const file = this.sampleFile(sample, project);
    const uri = pathToFileURL(file).href;
    let answers: {
      identifier: NativeIdentifier;
      quickInfo: NativeQuickInfo;
      definitions: Definition[];
    }[];
    try {
      const parsed = await this.identifiers(parser, file, sample);
      const identifiers = sample.selection ? parsed.filter(sample.selection.keep) : parsed;
      const found = await Promise.all(
        identifiers.map(async (identifier) => {
          const markdown = await server.hover(uri, identifier);
          const quickInfo = markdown
            ? parseNativeHover(markdown, this.options.internalTagText)
            : undefined;
          if (!quickInfo?.text) return undefined;
          // Only positions with a hover ask where their symbol is declared.
          return { identifier, quickInfo, definitions: await server.definitions(uri, identifier) };
        }),
      );
      answers = found.filter((answer) => answer !== undefined);
    } finally {
      phases.checked();
    }
    await phases.lookups;
    const hovers = await Promise.all(
      answers.map(async ({ identifier, definitions, ...answer }) => {
        let { quickInfo } = answer;
        let declared = false;
        if (identifier.propertyName && LITERAL_PROPERTY.test(quickInfo.text)) {
          quickInfo = (await this.declaredProperty(server, definitions, file)) ?? quickInfo;
        } else if (identifier.jsxAttribute) {
          // A JSX attribute of a generic component got the instantiated or the declared
          // owner depending on checking order; the declaration's own hover is the same in
          // every run, and it is what 5.9 showed.
          const declaration = await this.declaredProperty(server, definitions, file);
          if (declaration) {
            quickInfo = { ...declaration, docs: declaration.docs || quickInfo.docs };
            declared = true;
          }
        }
        if (!quickInfo.docs) {
          const docs = this.mergedDeclarationDocs(definitions, file);
          if (docs) quickInfo = { ...quickInfo, docs };
        }
        const origin = hoverOrigin(
          definitions.map((definition) => definition.file),
          file,
          this.libraryDirectory,
        );
        const position = {
          start: identifier.start,
          length: identifier.end - identifier.start,
          target: identifier.text,
          line: identifier.line,
          character: identifier.character,
        };
        const hover = this.hover(quickInfo, position, origin);
        if (declared) this.declaredHovers.add(hover);
        return hover;
      }),
    );
    return hovers;
  }

  /**
   * 5.9 answered a property name in an object literal with the property it fills, as
   * declared in the contextual type (`Column.header` and its docs); 7.1 often answers
   * with the literal's own property (`header: string`, no docs). The definition still
   * points at the declared property, so its hover is used when it names the declaring type.
   */
  private async declaredProperty(
    server: LanguageServer,
    definitions: readonly Definition[],
    sampleFile: string,
  ): Promise<NativeQuickInfo | undefined> {
    const declared = definitions.filter(
      (definition) => normalizedPath(definition.file) !== sampleFile,
    );
    if (declared.length !== 1 || !declared[0]) return undefined;
    const quickInfo = await this.declarationHover(server, declared[0]);
    return quickInfo && OWNED_PROPERTY.test(quickInfo.text) ? quickInfo : undefined;
  }

  /**
   * 5.9 joined the docs of every declaration of a symbol; 7.1 shows none when the
   * declaration it reads has none, as for `AbortController`, whose value (`declare var`)
   * is undocumented and whose interface carries the docs. The first other declaration
   * with a JSDoc comment supplies them. The comment is read from the declaration file:
   * hovering there made the server load a project for every library file it touched.
   */
  private mergedDeclarationDocs(
    definitions: readonly Definition[],
    sampleFile: string,
  ): string | undefined {
    const declarations = definitions.filter(
      (definition) => normalizedPath(definition.file) !== sampleFile,
    );
    if (declarations.length < 2) return undefined;
    for (const declaration of declarations) {
      const key = `${declaration.file}:${declaration.position.line}`;
      let docs = this.declarationDocs.get(key);
      if (docs === undefined) {
        docs = jsDocSummaryBefore(
          this.declarationText(declaration.file),
          declaration.position.line,
        );
        this.declarationDocs.set(key, docs);
      }
      if (docs) return docs;
    }
    return undefined;
  }

  private declarationText(file: string): string[] {
    let lines = this.declarationFiles.get(file);
    if (!lines) {
      lines = readFileSync(file, "utf8").split("\n");
      this.declarationFiles.set(file, lines);
    }
    return lines;
  }

  private declarationHover(
    server: LanguageServer,
    definition: Definition,
  ): Promise<NativeQuickInfo | undefined> {
    const key = `${definition.uri}:${definition.position.line}:${definition.position.character}`;
    let hover = this.declarationHovers.get(key);
    if (!hover) {
      hover = server
        .hover(definition.uri, definition.position)
        .then((markdown) =>
          markdown ? parseNativeHover(markdown, this.options.internalTagText) : undefined,
        );
      this.declarationHovers.set(key, hover);
    }
    return hover;
  }

  private async identifiers(
    parser: API<boolean>,
    file: string,
    sample: Sample,
  ): Promise<NativeIdentifier[]> {
    if (sample.language !== "vue")
      return this.scriptIdentifiers(parser, file, sample.source, 0, sample.language);
    // Script blocks are parsed; template names are found by pattern. The server answers
    // only positions the content mapper maps, so text words drop out on their own.
    const identifiers: NativeIdentifier[] = [];
    const blocks = [...sample.source.matchAll(/(<(script|style)\b[^>]*>)([\s\S]*?)<\/\2>/gi)];
    for (const block of blocks) {
      if (block[2]?.toLowerCase() !== "script") continue;
      const start = (block.index ?? 0) + (block[1]?.length ?? 0);
      const kind = /\blang=["']tsx["']/.test(block[1] ?? "") ? "tsx" : "ts";
      identifiers.push(
        ...(await this.scriptIdentifiers(parser, file, sample.source, start, kind, block[3] ?? "")),
      );
    }
    const starts = lineStarts(sample.source);
    for (const word of sample.source.matchAll(TEMPLATE_NAME)) {
      const start = word.index ?? 0;
      const inBlock = blocks.some(
        (block) => start >= (block.index ?? 0) && start < (block.index ?? 0) + block[0].length,
      );
      if (inBlock || RESERVED_WORDS.has(word[0])) continue;
      const text = word[0];
      identifiers.push({
        text,
        start,
        end: start + text.length,
        propertyName: false,
        jsxAttribute: false,
        ...positionAt(starts, start),
      });
    }
    return identifiers.sort((left, right) => left.start - right.start);
  }

  /** Identifiers of `code`, a script that starts at `offset` in the sample's source. */
  private async scriptIdentifiers(
    parser: API<boolean>,
    file: string,
    source: string,
    offset: number,
    language: "ts" | "tsx",
    code = source,
  ): Promise<NativeIdentifier[]> {
    const lease = await parser.createSourceFile(`${file}.${language}`, code, {
      scriptKind: language === "tsx" ? ScriptKind.TSX : ScriptKind.TS,
    });
    try {
      const { sourceFile } = lease;
      const starts = lineStarts(source);
      const identifiers: NativeIdentifier[] = [];
      const propertyNames = new Set<Node>();
      const jsxAttributeNames = new Set<Node>();
      const visit = (node: Node, parent?: Node): void => {
        if (
          (isPropertyAssignment(node) || isShorthandPropertyAssignment(node)) &&
          parent !== undefined &&
          isObjectLiteralExpression(parent)
        ) {
          propertyNames.add(node.name);
        }
        if (isJsxAttribute(node)) jsxAttributeNames.add(node.name);
        if (isIdentifier(node) && !this.options.internalIdentifier.test(node.text)) {
          const start = offset + node.getStart(sourceFile);
          identifiers.push({
            text: node.text,
            start,
            end: offset + node.end,
            propertyName: propertyNames.has(node),
            jsxAttribute: jsxAttributeNames.has(node),
            ...positionAt(starts, start),
          });
        }
        // API nodes carry no reliable `parent`, so the visitor passes it down.
        node.forEachChild((child) => visit(child, node));
      };
      visit(sourceFile);
      return identifiers;
    } finally {
      await lease.dispose();
    }
  }
}

function languageId(fileName: string): string {
  if (fileName.endsWith(".vue")) return "vue";
  return fileName.endsWith(".tsx") ? "typescriptreact" : "typescript";
}
