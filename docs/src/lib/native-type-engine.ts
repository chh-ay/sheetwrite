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
 * - Results are cached on disk by sample content. The cache key also covers
 *   the compiler version and settings, this engine's code, `bun.lock` and every
 *   source file the `paths` mapping can reach, so any change to Sheetwrite's
 *   types, a dependency or the settings rebuilds every sample.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { type Node, ScriptKind } from "typescript-7.1/ast";
import {
  isIdentifier,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
} from "typescript-7.1/ast/is";
import { API } from "typescript-7.1/async";

import { type NativeQuickInfo, parseNativeHover } from "./native-quick-info.js";
import type { SheetwriteHoverOrigin, SheetwriteTypeHover } from "./sheetwrite-type-engine.js";

export interface NativeTypeEngineOptions {
  /** The docs package directory; samples resolve `@sheetwrite/*` through its node_modules. */
  cwd: string;
  /** Identifiers that never get a hover (compiler-generated names). */
  internalIdentifier: RegExp;
  /** Tag text that is never reader-facing. */
  internalTagText: RegExp;
  fsMap?: ReadonlyMap<string, string>;
}

type Language = "ts" | "tsx";

/** An identifier in a sample, in UTF-16 offsets and LSP line/character. */
export interface NativeIdentifier {
  text: string;
  start: number;
  end: number;
  line: number;
  character: number;
  /** The name of a property in an object literal (`name: value` or `name`). */
  propertyName: boolean;
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
/**
 * The in-memory projects live under node_modules: the server's search for a file's
 * tsconfig stops there, so opening them never loads the docs or package projects above.
 */
const PROJECT_DIRECTORY = "node_modules/.sheetwrite-hover";
const SHEETWRITE_PACKAGES = "node_modules/@sheetwrite";
const CACHE_FILE = "node_modules/.cache/sheetwrite-hovers.jsonl";
/** Files that can carry types; every file of every Sheetwrite package samples import is hashed. */
const TYPED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
/** Never read by samples: Rust build output, installed packages, the original sources. */
const UNHASHED_DIRECTORIES = new Set(["node_modules", "target", ".git", "src"]);
/** Code whose changes change hovers for unchanged sample text (relative to the docs package). */
const ENGINE_FILES = [
  "src/lib/native-type-engine.ts",
  "src/lib/native-quick-info.ts",
  "src/lib/sheetwrite-type-engine.ts",
  "src/lib/sheetwrite-code-hovers.ts",
  "src/lib/hover-preludes.ts",
];
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

/** Where a hovered symbol's definitions live; drives the docs hover-quality gate. */
function hoverOrigin(
  definitionFiles: readonly string[],
  sampleFile: string,
): SheetwriteHoverOrigin | undefined {
  let origin: SheetwriteHoverOrigin | undefined;
  for (const definitionFile of definitionFiles) {
    const file = normalizedPath(definitionFile);
    if (file === sampleFile) return "snippet";
    if (!file.includes("/node_modules/")) return "workspace";
    origin = "lib";
  }
  return origin;
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

function nativeCompilerPath(cwd: string): string {
  const packageJson = createRequire(join(cwd, "package.json")).resolve(
    "typescript-7.1/package.json",
  );
  const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}/package.json`;
  const platformDirectory = dirname(createRequire(packageJson).resolve(platformPackage));
  return join(platformDirectory, "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
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
    this.child = spawn(executable, ["--lsp", "--stdio"], { stdio: ["pipe", "pipe", "inherit"] });
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
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
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

/** Sample results by content key, appended as JSON lines under one header line holding the global key. */
class HoverCache {
  private readonly entries = new Map<string, SheetwriteTypeHover[]>();

  constructor(
    private readonly path: string,
    private readonly globalKey: string,
  ) {
    const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
    if (lines[0] !== globalKey) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${globalKey}\n`);
      return;
    }
    for (const line of lines.slice(1)) {
      // A line cut short by an interrupted run is simply analyzed again.
      if (!line.endsWith("]}")) continue;
      const { key, hovers } = JSON.parse(line) as { key: string; hovers: SheetwriteTypeHover[] };
      this.entries.set(key, hovers);
    }
  }

  get(key: string): SheetwriteTypeHover[] | undefined {
    return this.entries.get(key);
  }

  set(key: string, hovers: SheetwriteTypeHover[]): void {
    this.entries.set(key, hovers);
    appendFileSync(this.path, `${JSON.stringify({ key, hovers })}\n`);
  }
}

export class NativeTypeEngine {
  private readonly projectDirectory: string;
  private readonly inFlight = new Map<string, Promise<SheetwriteTypeHover[]>>();
  /**
   * Hovers at declarations outside the samples (libraries, Sheetwrite's declarations),
   * which do not change during a session; many samples ask about the same ones.
   */
  private readonly declarationHovers = new Map<string, Promise<NativeQuickInfo | undefined>>();
  private queue: Sample[] = [];
  private flushScheduled = false;
  private session: Promise<{ server: LanguageServer; cache: HoverCache }> | undefined;
  /** The API session holds the process open, so it closes once no batch has run for a moment. */
  private parser: API | undefined;
  private parserIdle: NodeJS.Timeout | undefined;
  private activeFlushes = 0;

  constructor(private readonly options: NativeTypeEngineOptions) {
    this.projectDirectory = normalizedPath(join(options.cwd, PROJECT_DIRECTORY));
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

  /**
   * Hovers a caller derives from TypeScript output (Vue and Svelte samples), cached on
   * disk under `key` with the same invalidation as every sample, so a warm run neither
   * generates code nor asks the server.
   */
  async remember(
    key: string,
    compute: () => Promise<SheetwriteTypeHover[]>,
  ): Promise<SheetwriteTypeHover[]> {
    const { cache } = await this.start();
    const cacheKey = hash("derived", key);
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const hovers = await compute();
    cache.set(cacheKey, hovers);
    return hovers;
  }

  async dispose(): Promise<void> {
    await this.closeParser();
    if (!this.session) return;
    const { server } = await this.session;
    this.session = undefined;
    await server.shutdown();
  }

  private async closeParser(): Promise<void> {
    clearTimeout(this.parserIdle);
    const parser = this.parser;
    this.parser = undefined;
    await parser?.close();
  }

  private sampleFile(sample: Pick<Sample, "key" | "language">, project = "shared"): string {
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
      files: files.map((file) => basename(file)),
    });
  }

  /** Everything that changes hover results for unchanged sample text. */
  private async globalKey(): Promise<string> {
    const require = createRequire(join(this.options.cwd, "package.json"));
    const parts: string[] = [
      readFileSync(require.resolve("typescript-7.1/package.json"), "utf8"),
      this.projectConfig([]),
      readFileSync(join(this.options.cwd, "../bun.lock"), "utf8"),
      ...[...(this.options.fsMap ?? [])].flat(),
    ];
    for (const file of ENGINE_FILES) parts.push(readFileSync(join(this.options.cwd, file), "utf8"));
    const packages = join(this.options.cwd, SHEETWRITE_PACKAGES);
    const roots = (await readdir(packages)).map((name) => realpathSync(join(packages, name)));
    const files = new Set<string>();
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!UNHASHED_DIRECTORIES.has(entry.name)) await visit(path);
        } else if (TYPED_EXTENSIONS.has(extname(entry.name))) files.add(path);
      }
    };
    for (const root of roots) await visit(root);
    for (const file of [...files].sort()) parts.push(file, await readFile(file, "utf8"));
    return hash(...parts);
  }

  private start(): Promise<{ server: LanguageServer; cache: HoverCache }> {
    this.session ??= (async () => {
      const cache = new HoverCache(join(this.options.cwd, CACHE_FILE), await this.globalKey());
      const server = new LanguageServer(nativeCompilerPath(this.options.cwd));
      await server.initialize(this.options.cwd);
      for (const [fileName, text] of this.options.fsMap ?? []) {
        server.open(pathToFileURL(fileName).href, languageId(fileName), text);
      }
      return { server, cache };
    })();
    return this.session;
  }

  private parserSession(): API {
    clearTimeout(this.parserIdle);
    this.parser ??= new API({ cwd: this.options.cwd });
    return this.parser;
  }

  private async flush(): Promise<void> {
    const batch = this.queue;
    this.queue = [];
    this.flushScheduled = false;
    this.activeFlushes += 1;
    try {
      const { server, cache } = await this.start();
      const misses: Sample[] = [];
      for (const sample of batch) {
        const known = cache.get(sample.key) ?? this.inFlight.get(sample.key);
        if (known) {
          Promise.resolve(known).then(sample.resolve, sample.reject);
          continue;
        }
        const result = new Promise<SheetwriteTypeHover[]>((resolveHovers, reject) => {
          misses.push({ ...sample, resolve: resolveHovers, reject });
        });
        this.inFlight.set(sample.key, result);
        result.then(sample.resolve, sample.reject);
      }
      for (let index = 0; index < misses.length; index += SAMPLES_PER_PROJECT) {
        await this.analyzeTogether(server, cache, misses.slice(index, index + SAMPLES_PER_PROJECT));
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      for (const sample of batch) sample.reject(failure);
    } finally {
      this.activeFlushes -= 1;
      if (this.activeFlushes === 0 && !this.flushScheduled && this.parser) {
        this.parserIdle = setTimeout(() => void this.closeParser(), PARSER_IDLE_MS);
      }
    }
  }

  /** One project holds the samples while the server answers all their requests in parallel. */
  private async analyzeTogether(
    server: LanguageServer,
    cache: HoverCache,
    samples: readonly Sample[],
  ): Promise<void> {
    const parser = this.parserSession();
    const files = samples.map((sample) => this.sampleFile(sample));
    const configUri = pathToFileURL(`${this.projectDirectory}/shared/tsconfig.json`).href;
    for (const [index, sample] of samples.entries()) {
      const file = files[index] ?? "";
      server.open(pathToFileURL(file).href, languageId(file), sample.source);
    }
    server.open(configUri, "json", this.projectConfig(files));
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
          const shared = await this.sampleHovers(server, parser, sample, {
            checked: sampleChecked,
            lookups,
          });
          const hovers = await this.recheckGenericOwners(server, sample, shared);
          cache.set(sample.key, hovers);
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
    server.close(configUri);
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
      const owner = GENERIC_MEMBER_OWNER.exec(hover.text);
      return owner?.[1] !== undefined && TYPE_PARAMETER_ARGUMENT.test(owner[1]);
    });
    if (suspects.length === 0) return hovers;
    const project = `alone-${sample.key.slice(0, 16)}`;
    const file = this.sampleFile(sample, project);
    const uri = pathToFileURL(file).href;
    const configUri = pathToFileURL(`${this.projectDirectory}/${project}/tsconfig.json`).href;
    server.open(uri, languageId(file), sample.source);
    server.open(configUri, "json", this.projectConfig([file]));
    try {
      const answers = new Map<SheetwriteTypeHover, NativeQuickInfo | undefined>();
      for (const hover of suspects) {
        const markdown = await server.hover(uri, hover);
        answers.set(hover, markdown ? parseNativeHover(markdown) : undefined);
      }
      return hovers.map((hover) => {
        const quickInfo = answers.get(hover);
        return quickInfo?.text ? this.hover(quickInfo, hover, hover.origin) : hover;
      });
    } finally {
      server.close(uri);
      server.close(configUri);
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
    parser: API,
    sample: Sample,
    phases: { checked(): void; lookups: Promise<void> },
  ): Promise<SheetwriteTypeHover[]> {
    const file = this.sampleFile(sample);
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
          const quickInfo = markdown ? parseNativeHover(markdown) : undefined;
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
        if (identifier.propertyName && LITERAL_PROPERTY.test(quickInfo.text)) {
          quickInfo = (await this.declaredProperty(server, definitions, file)) ?? quickInfo;
        }
        if (!quickInfo.docs) {
          const docs = await this.mergedDeclarationDocs(server, definitions, file);
          if (docs) quickInfo = { ...quickInfo, docs };
        }
        const origin = hoverOrigin(
          definitions.map((definition) => definition.file),
          file,
        );
        const position = {
          start: identifier.start,
          length: identifier.end - identifier.start,
          target: identifier.text,
          line: identifier.line,
          character: identifier.character,
        };
        return this.hover(quickInfo, position, origin);
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
   * with docs supplies them.
   */
  private async mergedDeclarationDocs(
    server: LanguageServer,
    definitions: readonly Definition[],
    sampleFile: string,
  ): Promise<string | undefined> {
    const declarations = definitions.filter(
      (definition) => normalizedPath(definition.file) !== sampleFile,
    );
    if (declarations.length < 2) return undefined;
    for (const declaration of declarations) {
      const docs = (await this.declarationHover(server, declaration))?.docs;
      if (docs) return docs;
    }
    return undefined;
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
        .then((markdown) => (markdown ? parseNativeHover(markdown) : undefined));
      this.declarationHovers.set(key, hover);
    }
    return hover;
  }

  private async identifiers(parser: API, file: string, sample: Sample) {
    const lease = await parser.createSourceFile(file, sample.source, {
      scriptKind: sample.language === "tsx" ? ScriptKind.TSX : ScriptKind.TS,
    });
    try {
      const { sourceFile } = lease;
      const starts = lineStarts(sample.source);
      const identifiers: NativeIdentifier[] = [];
      const propertyNames = new Set<Node>();
      const visit = (node: Node, parent?: Node): void => {
        if (
          (isPropertyAssignment(node) || isShorthandPropertyAssignment(node)) &&
          parent !== undefined &&
          isObjectLiteralExpression(parent)
        ) {
          propertyNames.add(node.name);
        }
        if (isIdentifier(node) && !this.options.internalIdentifier.test(node.text)) {
          const start = node.getStart(sourceFile);
          identifiers.push({
            text: node.text,
            start,
            end: node.end,
            propertyName: propertyNames.has(node),
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
  return fileName.endsWith(".tsx") ? "typescriptreact" : "typescript";
}
