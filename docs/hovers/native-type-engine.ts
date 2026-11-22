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

/**
 * A JSX attribute of a generic component showed, in about one run in ten, its declared
 * owner (`Props<Id extends Key = Key>.height`) instead of the instantiated one
 * (`Props<Key>.height`), and asking again or in the sample's own program did not settle
 * it. When every type parameter of the owner has a default, this rewrites the declared
 * form to the defaults, which is what the server answers in the other runs. Returns
 * undefined for any other hover.
 */
function owner_with_defaults(text: string): string | undefined {
  const match = GENERIC_MEMBER_OWNER.exec(text);
  const owner = match?.[1];
  if (!match || owner === undefined || !/\bextends\b|=/.test(owner)) return undefined;
  const parameters: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= owner.length; index++) {
    const char = owner[index];
    if (char === "<" || char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ">" || char === ")" || char === "]" || char === "}") depth -= 1;
    else if ((char === "," && depth === 0) || char === undefined) {
      parameters.push(owner.slice(start, index).trim());
      start = index + 1;
    }
  }
  const defaults = new Map<string, string>();
  for (const parameter of parameters) {
    const declared = /^([A-Za-z_$][\w$]*)\s+(?:extends\s+[\s\S]+?\s+)?=\s+([\s\S]+)$/.exec(
      parameter,
    );
    if (!declared?.[1] || !declared[2]) return undefined;
    defaults.set(declared[1], declared[2]);
  }
  const owner_end = match.index + match[0].indexOf(`<${owner}>`) + owner.length + 2;
  const head = text.slice(0, owner_end - owner.length - 2);
  const rest = text
    .slice(owner_end)
    .replace(/[A-Za-z_$][\w$]*/g, (name) => defaults.get(name) ?? name);
  return `${head}<${[...defaults.values()].join(", ")}>${rest}`;
}
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

function normalized_path(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
}

function hash(...parts: readonly string[]): string {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(part).update("\0");
  return digest.digest("hex");
}

/**
 * Where a hovered symbol's definitions live; drives the docs hover-quality gate.
 * `library_directory` holds the server's built-in `lib.*.d.ts` files, which count as lib
 * wherever the server is installed.
 */
function hover_origin(
  definition_files: readonly string[],
  sample_file: string,
  library_directory: string,
): SheetwriteHoverOrigin | undefined {
  let origin: SheetwriteHoverOrigin | undefined;
  for (const definition_file of definition_files) {
    const file = normalized_path(definition_file);
    if (file === sample_file) return "snippet";
    if (!file.includes("/node_modules/") && !file.startsWith(library_directory)) {
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
function js_doc_summary_before(lines: readonly string[], line: number): string {
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
  const tag_start = body.findIndex((text) => /^\s*@\w/.test(text));
  return (tag_start < 0 ? body : body.slice(0, tag_start)).join("\n").trim();
}

function line_starts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function position_at(
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

function native_compiler_path(): string {
  const package_json = createRequire(import.meta.url).resolve("typescript/package.json");
  const platform_package = `@typescript/typescript-${process.platform}-${process.arch}/package.json`;
  const platform_directory = dirname(createRequire(package_json).resolve(platform_package));
  return join(platform_directory, "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
}

/**
 * The language server to run: TypeScript 7.1's `tsc`, or another server with the same
 * `--lsp --stdio` interface (such as tsrs) named by `SHEETWRITE_HOVER_COMPILER`.
 */
function server_executable(): string {
  return process.env.SHEETWRITE_HOVER_COMPILER || native_compiler_path();
}

function set_referenced(handle: object | null | undefined, referenced: boolean): void {
  if (!handle) return;
  if (referenced && "ref" in handle && typeof handle.ref === "function") handle.ref();
  if (!referenced && "unref" in handle && typeof handle.unref === "function") handle.unref();
}

/** JSON-RPC over the language server's stdio. Holds the process open only while requests are in flight. */
class LanguageServer {
  private readonly child: ChildProcess;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly versions = new Map<string, number>();
  private next_id = 1;
  private buffered = Buffer.alloc(0);

  constructor(executable: string) {
    this.child = spawn(executable, ["--lsp", "--stdio"], {
      stdio: ["pipe", "pipe", "inherit"],
      env: {
        ...process.env,
        // Collecting at 75% heap growth instead of 100% kept the same time with less memory.
        GOGC: process.env.GOGC ?? "75",
        // tsrs allocates with mimalloc. With transparent huge pages set to `always` (Linux),
        // its eagerly committed arenas made the server peak at 1.0-1.3 GB instead of ~0.4 GB.
        ...(basename(executable).startsWith("tsrs")
          ? { MIMALLOC_ARENA_EAGER_COMMIT: "0", MIMALLOC_PURGE_DELAY: "0" }
          : {}),
      },
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

  /** Deletes a project directory and tells the server that its tsconfig and `files` are gone. */
  removeProject(directory: string, files: readonly string[] = []): void {
    const file = join(directory, "tsconfig.json");
    rmSync(directory, { recursive: true, force: true });
    this.notify("workspace/didChangeWatchedFiles", {
      changes: [file, ...files].map((path) => ({ uri: pathToFileURL(path).href, type: 3 })),
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
    const id = this.next_id++;
    if (this.pending.size === 0) this.set_referenced(true);
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

  private set_referenced(referenced: boolean): void {
    set_referenced(this.child, referenced);
    set_referenced(this.child.stdin, referenced);
    set_referenced(this.child.stdout, referenced);
  }

  private send(message: JsonRpcMessage): void {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message });
    this.child.stdin?.write(`Content-Length: ${Buffer.byteLength(body)}${HEADER_SEPARATOR}${body}`);
  }

  private receive(chunk: Buffer): void {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    for (;;) {
      const header_end = this.buffered.indexOf(HEADER_SEPARATOR);
      if (header_end < 0) return;
      const header = this.buffered.toString("ascii", 0, header_end);
      const length = Number(CONTENT_LENGTH.exec(header)?.[1]);
      const body_start = header_end + HEADER_SEPARATOR.length;
      if (this.buffered.length < body_start + length) return;
      const body = this.buffered.toString("utf8", body_start, body_start + length);
      this.buffered = this.buffered.subarray(body_start + length);
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
    if (this.pending.size === 0) this.set_referenced(false);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }
}

export class NativeTypeEngine {
  private readonly project_directory: string;
  private readonly in_flight = new Map<string, Promise<SheetwriteTypeHover[]>>();
  /**
   * Hovers at declarations outside the samples (libraries, Sheetwrite's declarations),
   * JSDoc summaries by declaration file and line, and declaration file lines. Many
   * samples of a batch ask about the same declarations, so each is asked or read once
   * per batch; `drain` clears them after every batch.
   */
  private readonly declaration_hovers = new Map<string, Promise<NativeQuickInfo | undefined>>();
  private readonly declaration_docs = new Map<string, string>();
  private readonly declaration_files = new Map<string, string[]>();
  /** Names each batch's project directory. */
  private batches = 0;
  private queue: Sample[] = [];
  private flush_scheduled = false;
  private session: Promise<LanguageServer> | undefined;
  /** The API session holds the process open, so it closes once no batch has run for a moment. */
  private parser: Promise<API<boolean>> | undefined;
  private parser_idle: NodeJS.Timeout | undefined;
  /** Samples waiting for a batch, and the loop that runs batches while any wait. */
  private readonly pending: Sample[] = [];
  private worker: Promise<void> | undefined;
  /** The server's own directory, which holds its built-in `lib.*.d.ts` files. */
  private readonly library_directory = `${normalized_path(dirname(realpathSync(server_executable())))}/`;

  constructor(private readonly options: NativeTypeEngineOptions) {
    this.project_directory = normalized_path(PROJECT_DIRECTORY);
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
    return new Promise((resolve_hovers, reject) => {
      this.queue.push({
        key: hash(language, source, selection?.key ?? ""),
        source,
        language,
        ...(selection ? { selection } : {}),
        resolve: resolve_hovers,
        reject,
      });
      if (this.flush_scheduled) return;
      this.flush_scheduled = true;
      // Every sample requested in this turn of the event loop goes into one batch.
      setTimeout(() => void this.flush(), 0);
    });
  }

  async dispose(): Promise<void> {
    await this.close_parser();
    if (!this.session) return;
    const server = await this.session;
    this.session = undefined;
    await server.shutdown();
  }

  private async close_parser(): Promise<void> {
    clearTimeout(this.parser_idle);
    const parser = this.parser;
    this.parser = undefined;
    await (await parser)?.close();
  }

  private sample_file(sample: Pick<Sample, "key" | "language">, project: string): string {
    return `${this.project_directory}/${project}/${sample.key.slice(0, 16)}.${sample.language}`;
  }

  private project_config(files: readonly string[]): string {
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
      const server = new LanguageServer(server_executable());
      await server.initialize(this.options.cwd);
      for (const [file_name, text] of this.options.fsMap ?? []) {
        server.open(pathToFileURL(file_name).href, language_id(file_name), text);
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
  private parser_session(server: LanguageServer): Promise<API<boolean>> {
    clearTimeout(this.parser_idle);
    this.parser ??= server.apiPipe().then(
      (pipe) => API.fromLSPConnection({ pipe }),
      () => new API({ cwd: this.options.cwd }),
    );
    return this.parser;
  }

  private async flush(): Promise<void> {
    const batch = this.queue;
    this.queue = [];
    this.flush_scheduled = false;
    try {
      const server = await this.start();
      for (const sample of batch) {
        // The same sample text requested again while it is still being analyzed.
        const known = this.in_flight.get(sample.key);
        if (known) {
          Promise.resolve(known).then(sample.resolve, sample.reject);
          continue;
        }
        const result = new Promise<SheetwriteTypeHover[]>((resolve_hovers, reject) => {
          this.pending.push({ ...sample, resolve: resolve_hovers, reject });
        });
        this.in_flight.set(sample.key, result);
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
          await this.analyze_together(server, samples, `batch-${this.batches++}`);
        } catch (error) {
          const failure = error instanceof Error ? error : new Error(String(error));
          for (const sample of samples) sample.reject(failure);
        } finally {
          this.declaration_hovers.clear();
          this.declaration_docs.clear();
          this.declaration_files.clear();
        }
      }
    } finally {
      this.worker = undefined;
      if (this.parser) {
        this.parser_idle = setTimeout(() => void this.close_parser(), PARSER_IDLE_MS);
      }
    }
  }

  /** One project holds the samples while the server answers all their requests in parallel. */
  private async analyze_together(
    server: LanguageServer,
    samples: readonly Sample[],
    project: string,
  ): Promise<void> {
    const parser = await this.parser_session(server);
    const files = samples.map((sample) => this.sample_file(sample, project));
    const directory = `${this.project_directory}/${project}`;
    // The samples are written next to the batch tsconfig instead of opened one by one:
    // the server handled each `didOpen` before any request after it (5.8 s of a pass on
    // the Mac), while files on disk load with the project in one step. One sample is
    // still opened: an open file keeps the batch project as the default project for the
    // declaration files it reaches, instead of the packages' own tsconfig projects.
    mkdirSync(directory, { recursive: true });
    for (const [index, sample] of samples.entries())
      writeFileSync(files[index] ?? "", sample.source);
    server.writeProject(directory, this.project_config(files));
    const anchor = pathToFileURL(files[0] ?? "").href;
    server.open(anchor, language_id(files[0] ?? ""), samples[0]?.source ?? "");
    // Hovers at declarations outside the samples make the server look up those files'
    // projects, which in the middle of checking 64 samples cost 14 s of server CPU. They
    // wait until every sample of the batch has its own answers.
    let checking = samples.length;
    let start_lookups: () => void = () => {};
    const lookups = new Promise<void>((resolve) => {
      start_lookups = resolve;
    });
    const sample_checked = () => {
      checking -= 1;
      if (checking === 0) start_lookups();
    };
    await Promise.all(
      samples.map(async (sample) => {
        try {
          const shared = await this.sample_hovers(server, parser, sample, project, {
            checked: sample_checked,
            lookups,
          });
          const hovers = await this.recheck_generic_owners(server, sample, shared);
          sample.resolve(hovers);
        } catch (error) {
          sample.reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
          this.in_flight.delete(sample.key);
        }
      }),
    );
    server.close(anchor);
    server.removeProject(directory, files);
  }

  /**
   * Asks again, in a program holding only this sample, for hovers whose owner shows type
   * parameters. One request at a time, in source order, so the answer does not depend on
   * which request the server happened to check first.
   */
  private async recheck_generic_owners(
    server: LanguageServer,
    sample: Sample,
    hovers: SheetwriteTypeHover[],
  ): Promise<SheetwriteTypeHover[]> {
    const suspects = hovers.filter((hover) => {
      const owner = GENERIC_MEMBER_OWNER.exec(hover.text);
      return owner?.[1] !== undefined && TYPE_PARAMETER_ARGUMENT.test(owner[1]);
    });
    if (suspects.length === 0) return hovers;
    const project = `alone-${sample.key.slice(0, 16)}`;
    const file = this.sample_file(sample, project);
    const uri = pathToFileURL(file).href;
    const directory = `${this.project_directory}/${project}`;
    server.writeProject(directory, this.project_config([file]));
    server.open(uri, language_id(file), sample.source);
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
        const quick_info = answers.get(hover);
        return quick_info?.text ? this.hover(quick_info, hover, hover.origin) : hover;
      });
    } finally {
      server.close(uri);
      server.removeProject(directory);
    }
  }

  private hover(
    quick_info: NativeQuickInfo,
    position: Pick<SheetwriteTypeHover, "start" | "length" | "target" | "line" | "character">,
    origin: SheetwriteHoverOrigin | undefined,
  ): SheetwriteTypeHover {
    const tags = quick_info.tags.filter(
      ([, value]) => !value || !this.options.internalTagText.test(value),
    );
    return {
      type: "hover",
      text: quick_info.text,
      ...(quick_info.docs ? { docs: quick_info.docs } : {}),
      ...(tags.length ? { tags } : {}),
      ...(origin ? { origin } : {}),
      start: position.start,
      length: position.length,
      target: position.target,
      line: position.line,
      character: position.character,
    };
  }

  private async sample_hovers(
    server: LanguageServer,
    parser: API<boolean>,
    sample: Sample,
    project: string,
    phases: { checked(): void; lookups: Promise<void> },
  ): Promise<SheetwriteTypeHover[]> {
    const file = this.sample_file(sample, project);
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
          const quick_info = markdown
            ? parseNativeHover(markdown, this.options.internalTagText)
            : undefined;
          if (!quick_info?.text) return undefined;
          // Only positions with a hover ask where their symbol is declared.
          return {
            identifier,
            quickInfo: quick_info,
            definitions: await server.definitions(uri, identifier),
          };
        }),
      );
      answers = found.filter((answer) => answer !== undefined);
    } finally {
      phases.checked();
    }
    await phases.lookups;
    const hovers = await Promise.all(
      answers.map(async ({ identifier, definitions, ...answer }) => {
        let { quickInfo: quick_info } = answer;
        if (identifier.propertyName && LITERAL_PROPERTY.test(quick_info.text)) {
          quick_info = (await this.declared_property(server, definitions, file)) ?? quick_info;
        } else if (identifier.jsxAttribute) {
          const text = owner_with_defaults(quick_info.text);
          if (text) quick_info = { ...quick_info, text };
        }
        if (!quick_info.docs) {
          const docs = this.merged_declaration_docs(definitions, file);
          if (docs) quick_info = { ...quick_info, docs };
        }
        const origin = hover_origin(
          definitions.map((definition) => definition.file),
          file,
          this.library_directory,
        );
        const position = {
          start: identifier.start,
          length: identifier.end - identifier.start,
          target: identifier.text,
          line: identifier.line,
          character: identifier.character,
        };
        return this.hover(quick_info, position, origin);
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
  private async declared_property(
    server: LanguageServer,
    definitions: readonly Definition[],
    sample_file: string,
  ): Promise<NativeQuickInfo | undefined> {
    const declared = definitions.filter(
      (definition) => normalized_path(definition.file) !== sample_file,
    );
    if (declared.length !== 1 || !declared[0]) return undefined;
    const quick_info = await this.declaration_hover(server, declared[0]);
    return quick_info && OWNED_PROPERTY.test(quick_info.text) ? quick_info : undefined;
  }

  /**
   * 5.9 joined the docs of every declaration of a symbol; 7.1 shows none when the
   * declaration it reads has none, as for `AbortController`, whose value (`declare var`)
   * is undocumented and whose interface carries the docs. The first other declaration
   * with a JSDoc comment supplies them. The comment is read from the declaration file:
   * hovering there made the server load a project for every library file it touched.
   */
  private merged_declaration_docs(
    definitions: readonly Definition[],
    sample_file: string,
  ): string | undefined {
    const declarations = definitions.filter(
      (definition) => normalized_path(definition.file) !== sample_file,
    );
    if (declarations.length < 2) return undefined;
    for (const declaration of declarations) {
      const key = `${declaration.file}:${declaration.position.line}`;
      let docs = this.declaration_docs.get(key);
      if (docs === undefined) {
        docs = js_doc_summary_before(
          this.declaration_text(declaration.file),
          declaration.position.line,
        );
        this.declaration_docs.set(key, docs);
      }
      if (docs) return docs;
    }
    return undefined;
  }

  private declaration_text(file: string): string[] {
    let lines = this.declaration_files.get(file);
    if (!lines) {
      lines = readFileSync(file, "utf8").split("\n");
      this.declaration_files.set(file, lines);
    }
    return lines;
  }

  private declaration_hover(
    server: LanguageServer,
    definition: Definition,
  ): Promise<NativeQuickInfo | undefined> {
    const key = `${definition.uri}:${definition.position.line}:${definition.position.character}`;
    let hover = this.declaration_hovers.get(key);
    if (!hover) {
      hover = server
        .hover(definition.uri, definition.position)
        .then((markdown) =>
          markdown ? parseNativeHover(markdown, this.options.internalTagText) : undefined,
        );
      this.declaration_hovers.set(key, hover);
    }
    return hover;
  }

  private async identifiers(
    parser: API<boolean>,
    file: string,
    sample: Sample,
  ): Promise<NativeIdentifier[]> {
    if (sample.language !== "vue")
      return this.script_identifiers(parser, file, sample.source, 0, sample.language);
    // Script blocks are parsed; template names are found by pattern. The server answers
    // only positions the content mapper maps, so text words drop out on their own.
    const identifiers: NativeIdentifier[] = [];
    const blocks = [...sample.source.matchAll(/(<(script|style)\b[^>]*>)([\s\S]*?)<\/\2>/gi)];
    for (const block of blocks) {
      if (block[2]?.toLowerCase() !== "script") continue;
      const start = (block.index ?? 0) + (block[1]?.length ?? 0);
      const kind = /\blang=["']tsx["']/.test(block[1] ?? "") ? "tsx" : "ts";
      identifiers.push(
        ...(await this.script_identifiers(
          parser,
          file,
          sample.source,
          start,
          kind,
          block[3] ?? "",
        )),
      );
    }
    const starts = line_starts(sample.source);
    for (const word of sample.source.matchAll(TEMPLATE_NAME)) {
      const start = word.index ?? 0;
      const in_block = blocks.some(
        (block) => start >= (block.index ?? 0) && start < (block.index ?? 0) + block[0].length,
      );
      if (in_block || RESERVED_WORDS.has(word[0])) continue;
      const text = word[0];
      identifiers.push({
        text,
        start,
        end: start + text.length,
        propertyName: false,
        jsxAttribute: false,
        ...position_at(starts, start),
      });
    }
    return identifiers.sort((left, right) => left.start - right.start);
  }

  /** Identifiers of `code`, a script that starts at `offset` in the sample's source. */
  private async script_identifiers(
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
      const { sourceFile: source_file } = lease;
      const starts = line_starts(source);
      const identifiers: NativeIdentifier[] = [];
      const property_names = new Set<Node>();
      const jsx_attribute_names = new Set<Node>();
      const visit = (node: Node, parent?: Node): void => {
        if (
          (isPropertyAssignment(node) || isShorthandPropertyAssignment(node)) &&
          parent !== undefined &&
          isObjectLiteralExpression(parent)
        ) {
          property_names.add(node.name);
        }
        if (isJsxAttribute(node)) jsx_attribute_names.add(node.name);
        if (isIdentifier(node) && !this.options.internalIdentifier.test(node.text)) {
          const start = offset + node.getStart(source_file);
          identifiers.push({
            text: node.text,
            start,
            end: offset + node.end,
            propertyName: property_names.has(node),
            jsxAttribute: jsx_attribute_names.has(node),
            ...position_at(starts, start),
          });
        }
        // API nodes carry no reliable `parent`, so the visitor passes it down.
        node.forEachChild((child) => visit(child, node));
      };
      visit(source_file);
      return identifiers;
    } finally {
      await lease.dispose();
    }
  }
}

function language_id(file_name: string): string {
  if (file_name.endsWith(".vue")) return "vue";
  return file_name.endsWith(".tsx") ? "typescriptreact" : "typescript";
}
