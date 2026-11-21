/**
 * The `--relocations` mode of scripts/wasm-compare.ts: whether two builds run
 * the same code when a change only moved Rust items between files.
 *
 * Such a move is not byte-neutral. rustc orders functions and constants by
 * module path, so functions get other numbers and constants other addresses,
 * and each new file adds its name to the panic locations in the data section.
 * This check undoes those three effects and nothing else:
 *
 * - Functions are paired by name (the name section, without crate hashes;
 *   `--module calc::parser=calc` reads `calc::parser::` as `calc::`). Paired
 *   functions must have the same type and the same instructions. An immediate
 *   may differ only when it is a function number or table slot that names the
 *   paired function, or a data address.
 * - Data addresses are paired by where the code and the data use them. Each
 *   paired constant must hold the same bytes, except for addresses inside it,
 *   which must be paired too, and for the file, line and column of a panic
 *   location.
 * - Data bytes that no pairing covers must be panic-location file names or
 *   zero padding. The report lists the file names.
 */

const SECTION_CUSTOM = 0;
const SECTION_IMPORT = 2;
const SECTION_FUNCTION = 3;
const SECTION_MEMORY = 5;
const SECTION_GLOBAL = 6;
const SECTION_EXPORT = 7;
const SECTION_ELEMENT = 9;
const SECTION_CODE = 10;
const SECTION_DATA = 11;
const WASM_HEADER_BYTES = 8;
const NAME_SUBSECTION_FUNCTIONS = 1;
const IMPORT_FUNCTION = 0;
const EXPORT_FUNCTION = 0;
const IMPORT_TABLE = 1;
const IMPORT_MEMORY = 2;
const IMPORT_GLOBAL = 3;
const LIMITS_HAVE_MAXIMUM = 1;
const WASM_PAGE_BYTES = 65_536;
const LEB_CONTINUATION = 0x80;
const LEB_PAYLOAD = 0x7f;
const LEB_SIGN = 0x40;
const LEB_PAYLOAD_BITS = 7;
const OPCODE_END = 0x0b;
const OPCODE_I32_CONST = 0x41;
const OPCODE_I64_CONST = 0x42;
const OPCODE_PREFIX_MISC = 0xfc;
const BLOCK_EMPTY = 0x40;
const VALUE_TYPES = new Set([0x7f, 0x7e, 0x7d, 0x7c, 0x7b, 0x70, 0x6f]);
const DATA_ACTIVE_MEMORY_ZERO = 0;
const DATA_PASSIVE = 1;
const DATA_ACTIVE_EXPLICIT_MEMORY = 2;
const ELEMENT_ACTIVE_FUNCTIONS = 0;
const WORD_BYTES = 4;
const LOW_32_BITS = 0xffff_ffffn;
const HIGH_HALF_SHIFT = 32n;
/** `core::panic::Location`: file pointer, file length, line, column. */
const LOCATION_BYTES = 16;
const MAX_PATH_BYTES = 200;
/** The shortest run of moved bytes that counts as a table reached through address arithmetic. */
const MIN_SHIFTED_RUN_BYTES = 8;
/** The smallest number that a folded address computation leaves in code (a table base minus an offset). */
const MIN_ADDRESS_ARITHMETIC = 4096;
const SOURCE_PATH = /^[\w./-]+\.rs$/u;
/** Crate disambiguators in demangled names: `sheetwrite_wasm[a089ad51421f66e2]`. */
const CRATE_HASH = /\[[0-9a-f]{16}\]/gu;
const FINDINGS_SHOWN = 20;

interface Instruction {
  opcode: number;
  immediates: Immediate[];
}

/** What an immediate means decides how it may differ. */
interface Immediate {
  kind: "constant" | "packed-constant" | "offset" | "function" | "plain";
  value: bigint;
}

interface Engine {
  functionImports: number;
  /** Type index of each defined function. */
  types: number[];
  bodies: Uint8Array[];
  names: Map<number, string>;
  elementOffset: number;
  /** Function numbers in table order, from `elementOffset`. */
  elements: number[];
  globals: number[];
  /** Export name → kind and index. */
  exports: Map<string, { kind: number; index: number }>;
  /** Linear memory as the data section initializes it, from address 0. */
  memory: Uint8Array;
  dataStart: number;
  dataEnd: number;
  dataBytes: number;
}

export interface RelocationReport {
  isSameCode: boolean;
  lines: string[];
}

class Reader {
  constructor(
    private readonly bytes: Uint8Array,
    public at = 0,
  ) {}

  get isDone(): boolean {
    return this.at >= this.bytes.length;
  }

  byte(): number {
    const value = this.bytes[this.at];
    if (value === undefined) throw new Error(`read past the end at byte ${this.at}`);
    this.at += 1;
    return value;
  }

  unsigned(): number {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = this.byte();
      value += (byte & LEB_PAYLOAD) * 2 ** shift;
      shift += LEB_PAYLOAD_BITS;
      if ((byte & LEB_CONTINUATION) === 0) return value;
    }
  }

  signed(): bigint {
    let value = 0n;
    let shift = 0n;
    for (;;) {
      const byte = this.byte();
      value |= BigInt(byte & LEB_PAYLOAD) << shift;
      shift += BigInt(LEB_PAYLOAD_BITS);
      if ((byte & LEB_CONTINUATION) === 0)
        return (byte & LEB_SIGN) === 0 ? value : value - (1n << shift);
    }
  }

  slice(length: number): Uint8Array {
    const slice = this.bytes.subarray(this.at, this.at + length);
    this.at += length;
    return slice;
  }

  name(): string {
    return new TextDecoder().decode(this.slice(this.unsigned()));
  }

  limits(): number {
    const flags = this.byte();
    const minimum = this.unsigned();
    if ((flags & LIMITS_HAVE_MAXIMUM) !== 0) this.unsigned();
    return minimum;
  }

  /** A constant expression `i32.const n end`. */
  constant(): number {
    if (this.byte() !== OPCODE_I32_CONST) throw new Error("expected an i32.const expression");
    const value = Number(this.signed());
    if (this.byte() !== OPCODE_END) throw new Error("expected a constant expression");
    return value;
  }
}

function parseEngine(bytes: Uint8Array): Engine {
  const engine: Engine = {
    functionImports: 0,
    types: [],
    bodies: [],
    names: new Map(),
    elementOffset: 0,
    elements: [],
    globals: [],
    exports: new Map(),
    memory: new Uint8Array(),
    dataStart: Number.POSITIVE_INFINITY,
    dataEnd: 0,
    dataBytes: 0,
  };
  const reader = new Reader(bytes, WASM_HEADER_BYTES);
  while (!reader.isDone) {
    const id = reader.byte();
    const size = reader.unsigned();
    const end = reader.at + size;
    const count = id === SECTION_CUSTOM ? 0 : reader.unsigned();
    for (let index = 0; index < count; index += 1) {
      if (id === SECTION_IMPORT) readImport(reader, engine);
      if (id === SECTION_FUNCTION) engine.types.push(reader.unsigned());
      if (id === SECTION_MEMORY) engine.memory = new Uint8Array(reader.limits() * WASM_PAGE_BYTES);
      if (id === SECTION_GLOBAL) {
        reader.slice(2);
        engine.globals.push(reader.constant());
      }
      if (id === SECTION_ELEMENT) readElement(reader, engine);
      if (id === SECTION_CODE) engine.bodies.push(reader.slice(reader.unsigned()));
      if (id === SECTION_DATA) readData(reader, engine);
      if (id === SECTION_EXPORT)
        engine.exports.set(reader.name(), { kind: reader.byte(), index: reader.unsigned() });
    }
    if (id === SECTION_DATA) engine.dataBytes = size;
    if (id === SECTION_CUSTOM && reader.name() === "name")
      readFunctionNames(reader, end, engine.names);
    reader.at = end;
  }
  return engine;
}

function readImport(reader: Reader, engine: Engine): void {
  reader.name();
  reader.name();
  const kind = reader.byte();
  if (kind === IMPORT_FUNCTION) {
    reader.unsigned();
    engine.functionImports += 1;
  } else if (kind === IMPORT_TABLE) {
    reader.byte();
    reader.limits();
  } else if (kind === IMPORT_MEMORY) {
    engine.memory = new Uint8Array(reader.limits() * WASM_PAGE_BYTES);
  } else if (kind === IMPORT_GLOBAL) {
    reader.slice(2);
  } else {
    throw new Error(`unknown import kind ${kind}`);
  }
}

function readElement(reader: Reader, engine: Engine): void {
  const flags = reader.unsigned();
  if (flags !== ELEMENT_ACTIVE_FUNCTIONS)
    throw new Error(`element segment kind ${flags} is not handled`);
  const offset = reader.constant();
  if (engine.elements.length === 0) engine.elementOffset = offset;
  if (offset !== engine.elementOffset + engine.elements.length)
    throw new Error("element segments leave gaps");
  const length = reader.unsigned();
  for (let entry = 0; entry < length; entry += 1) engine.elements.push(reader.unsigned());
}

function readData(reader: Reader, engine: Engine): void {
  const mode = reader.unsigned();
  if (mode === DATA_PASSIVE) throw new Error("passive data segments are not handled");
  if (mode === DATA_ACTIVE_EXPLICIT_MEMORY) reader.unsigned();
  if (mode !== DATA_ACTIVE_MEMORY_ZERO && mode !== DATA_ACTIVE_EXPLICIT_MEMORY) {
    throw new Error(`unknown data segment mode ${mode}`);
  }
  const address = reader.constant();
  const bytes = reader.slice(reader.unsigned());
  engine.memory.set(bytes, address);
  engine.dataStart = Math.min(engine.dataStart, address);
  engine.dataEnd = Math.max(engine.dataEnd, address + bytes.length);
}

function readFunctionNames(reader: Reader, end: number, names: Map<number, string>): void {
  while (reader.at < end) {
    const subsection = reader.byte();
    const size = reader.unsigned();
    const next = reader.at + size;
    if (subsection === NAME_SUBSECTION_FUNCTIONS) {
      const count = reader.unsigned();
      for (let index = 0; index < count; index += 1) names.set(reader.unsigned(), reader.name());
    }
    reader.at = next;
  }
}

function plain(value: number): Immediate {
  return { kind: "plain", value: BigInt(value) };
}

/** The immediates of an instruction whose opcode the reader has just read. */
function readImmediates(reader: Reader, opcode: number): Immediate[] {
  if (opcode === 0x02 || opcode === 0x03 || opcode === 0x04) {
    const first = reader.byte();
    if (first === BLOCK_EMPTY || VALUE_TYPES.has(first)) return [plain(first)];
    reader.at -= 1;
    return [{ kind: "plain", value: reader.signed() }];
  }
  if (opcode === 0x0c || opcode === 0x0d) return [plain(reader.unsigned())];
  if (opcode === 0x0e)
    return Array.from({ length: reader.unsigned() + 1 }, () => plain(reader.unsigned()));
  if (opcode === 0x10 || opcode === 0x12 || opcode === 0xd2) {
    return [{ kind: "function", value: BigInt(reader.unsigned()) }];
  }
  if (opcode === 0x11 || opcode === 0x13)
    return [plain(reader.unsigned()), plain(reader.unsigned())];
  if (opcode === 0x1c) return Array.from({ length: reader.unsigned() }, () => plain(reader.byte()));
  if (opcode >= 0x20 && opcode <= 0x26) return [plain(reader.unsigned())];
  if (opcode >= 0x28 && opcode <= 0x3e) {
    return [plain(reader.unsigned()), { kind: "offset", value: BigInt(reader.unsigned()) }];
  }
  if (opcode === 0x3f || opcode === 0x40 || opcode === 0xd0) return [plain(reader.byte())];
  if (opcode === OPCODE_I32_CONST) return [{ kind: "constant", value: reader.signed() }];
  if (opcode === OPCODE_I64_CONST) return [{ kind: "packed-constant", value: reader.signed() }];
  if (opcode === 0x43) return [...reader.slice(4)].map(plain);
  if (opcode === 0x44) return [...reader.slice(8)].map(plain);
  if (opcode === OPCODE_PREFIX_MISC) return readMiscImmediates(reader);
  const hasNoImmediates =
    opcode <= 0x01 ||
    opcode === 0x05 ||
    opcode === OPCODE_END ||
    opcode === 0x0f ||
    opcode === 0x1a ||
    opcode === 0x1b ||
    (opcode >= 0x45 && opcode <= 0xc4) ||
    opcode === 0xd1;
  if (hasNoImmediates) return [];
  throw new Error(`opcode 0x${opcode.toString(16)} is not handled`);
}

/** Immediates after the 0xfc prefix: saturating truncation, bulk memory and tables. */
function readMiscImmediates(reader: Reader): Immediate[] {
  const subopcode = reader.unsigned();
  const immediates = [plain(subopcode)];
  if (subopcode <= 7) return immediates;
  if (subopcode === 8) return [...immediates, plain(reader.unsigned()), plain(reader.byte())];
  if (subopcode === 10) return [...immediates, plain(reader.byte()), plain(reader.byte())];
  if (subopcode === 11) return [...immediates, plain(reader.byte())];
  if (subopcode === 12 || subopcode === 14)
    return [...immediates, plain(reader.unsigned()), plain(reader.unsigned())];
  if (subopcode <= 17) return [...immediates, plain(reader.unsigned())];
  throw new Error(`0xfc ${subopcode} is not handled`);
}

function decodeBody(body: Uint8Array): { locals: Uint8Array; instructions: Instruction[] } {
  const reader = new Reader(body);
  const groups = reader.unsigned();
  for (let group = 0; group < groups; group += 1) {
    reader.unsigned();
    reader.byte();
  }
  const locals = body.subarray(0, reader.at);
  const instructions: Instruction[] = [];
  while (!reader.isDone) {
    const opcode = reader.byte();
    instructions.push({ opcode, immediates: readImmediates(reader, opcode) });
  }
  return { locals, instructions };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, at) => byte === right[at]);
}

function word(memory: Uint8Array, address: number): number {
  return new DataView(memory.buffer, memory.byteOffset).getUint32(address, true);
}

/** The file name of the panic location at `address`, if one is there. */
function locationFile(engine: Engine, address: number): string | undefined {
  if (address < engine.dataStart || address + LOCATION_BYTES > engine.dataEnd) return undefined;
  const file = word(engine.memory, address);
  const length = word(engine.memory, address + WORD_BYTES);
  if (
    length === 0 ||
    length > MAX_PATH_BYTES ||
    file < engine.dataStart ||
    file + length > engine.dataEnd
  ) {
    return undefined;
  }
  const path = new TextDecoder("latin1").decode(engine.memory.subarray(file, file + length));
  return SOURCE_PATH.test(path) && engine.memory[file + length] === 0 ? path : undefined;
}

/** Every function's name without crate hashes, each moved module read as its old one. */
function normalizedNames(engine: Engine, modules: [string, string][]): Map<number, string> {
  const names = new Map<number, string>();
  engine.bodies.forEach((_, position) => {
    const index = engine.functionImports + position;
    let name = (engine.names.get(index) ?? `#${index}`).replace(CRATE_HASH, "");
    for (const [moved, original] of modules)
      name = name.replaceAll(`::${moved}::`, `::${original}::`);
    names.set(index, name);
  });
  return names;
}

/** A body's locals and opcodes: what identifies functions that wasm-opt merged under one name. */
function opcodeShape(body: Uint8Array | undefined): string {
  if (body === undefined) return "";
  const { locals, instructions } = decodeBody(body);
  return `${locals.join(",")}|${instructions.map((instruction) => instruction.opcode).join(",")}`;
}

/**
 * Pairs function numbers by normalized name. When wasm-opt merges identical
 * functions, the survivor's name depends on their order, so the functions
 * left over are paired by their opcodes.
 */
function pairFunctions(
  before: Engine,
  after: Engine,
  modules: [string, string][],
  findings: string[],
): { pairs: Map<number, number>; pairedByOpcodes: number } {
  const pairs = new Map<number, number>();
  for (let index = 0; index < before.functionImports; index += 1) pairs.set(index, index);
  const afterByName = new Map<string, number[]>();
  for (const [index, name] of normalizedNames(after, modules)) {
    afterByName.set(name, [...(afterByName.get(name) ?? []), index]);
  }
  const unpaired: number[] = [];
  for (const [index, name] of normalizedNames(before, modules)) {
    const match = afterByName.get(name)?.shift();
    if (match === undefined) unpaired.push(index);
    else pairs.set(index, match);
  }
  const leftOver = [...afterByName.values()].flat();
  const bodyOf = (engine: Engine, index: number): Uint8Array | undefined =>
    engine.bodies[index - engine.functionImports];
  let pairedByOpcodes = 0;
  for (const index of unpaired) {
    const shape = opcodeShape(bodyOf(before, index));
    const match = leftOver.findIndex(
      (candidate) => opcodeShape(bodyOf(after, candidate)) === shape,
    );
    const paired = leftOver[match];
    if (paired === undefined) {
      findings.push(`no counterpart for ${before.names.get(index) ?? index}`);
      continue;
    }
    pairs.set(index, paired);
    leftOver.splice(match, 1);
    pairedByOpcodes += 1;
  }
  for (const index of leftOver) findings.push(`new function ${after.names.get(index) ?? index}`);
  return { pairs, pairedByOpcodes };
}

/** A pairing that the data alone does not explain; see `Comparison.resolve`. */
interface Unexplained {
  from: number;
  to: number;
  where: string;
}

class Comparison {
  readonly findings: string[] = [];
  readonly pairs: Map<number, number>;
  readonly pairedByOpcodes: number;
  /** Data addresses before → after, and whether the code or data proved the pairing. */
  readonly addresses = new Map<number, { to: number; isProven: boolean }>();
  relocatedFunctions = 0;
  /** Unproven pairings whose data differed: numbers that only looked like addresses. */
  readonly rejected = new Set<number>();
  /** Second pairings of a paired address, such as the end of one constant that starts another before the move. */
  readonly conflicts: Unexplained[] = [];
  /** Numbers below the data that changed, such as an address minus an offset folded into one constant. */
  readonly derived: Unexplained[] = [];
  /** What the last pass over the data found; `compareData` repeats passes until no unproven pairing fails. */
  data = Comparison.emptyDataPass();

  static emptyDataPass(): {
    coveredBefore: Set<number>;
    coveredAfter: Set<number>;
    /** Runs of data that matched, as from, to and length. */
    extents: [number, number, number][];
    /** Proven pairings whose first byte differs. */
    mismatches: Unexplained[];
    relocatedWords: number;
    locationsWithNewFiles: number;
    locationsWithNewLines: number;
  } {
    return {
      coveredBefore: new Set(),
      coveredAfter: new Set(),
      extents: [],
      mismatches: [],
      relocatedWords: 0,
      locationsWithNewFiles: 0,
      locationsWithNewLines: 0,
    };
  }

  constructor(
    readonly before: Engine,
    readonly after: Engine,
    modules: [string, string][],
  ) {
    ({ pairs: this.pairs, pairedByOpcodes: this.pairedByOpcodes } = pairFunctions(
      before,
      after,
      modules,
      this.findings,
    ));
  }

  /** Whether `value` is a linear memory address that data or zero-initialized statics use. */
  isAddress(engine: Engine, value: number): boolean {
    return value >= engine.dataStart && value < engine.memory.length;
  }

  /** Whether table slot `from` before and slot `to` after hold paired functions. */
  isPairedSlot(from: number, to: number): boolean {
    const function_ = this.before.elements[from - this.before.elementOffset];
    const other = this.after.elements[to - this.after.elementOffset];
    return function_ !== undefined && other !== undefined && this.pairs.get(function_) === other;
  }

  pairAddress(from: number, to: number, isProven: boolean, where: string): void {
    const known = this.addresses.get(from);
    if (!isProven && this.rejected.has(from)) return;
    if (known === undefined || (!known.isProven && isProven)) {
      this.addresses.set(from, { to, isProven });
    } else if (
      known.to !== to &&
      isProven &&
      !this.conflicts.some((pair) => pair.from === from && pair.to === to)
    ) {
      this.conflicts.push({ from, to, where });
    }
  }

  /** A number in code or data that may be an address or a table slot. */
  compareNumber(from: number, to: number, where: string): void {
    if (this.isAddress(this.before, from) && this.isAddress(this.after, to)) {
      this.pairAddress(from, to, from !== to, where);
    } else if (from !== to && !this.isPairedSlot(from, to)) {
      this.derived.push({ from, to, where });
    }
  }

  /**
   * Accepts what the data passes left open, or reports it. A second pairing
   * or a pairing whose data differs must point just past a constant that
   * matched, at the same place on both sides: the end of a slice. A changed
   * number below the data must be at least `MIN_ADDRESS_ARITHMETIC` and have
   * moved by as much as a paired address, in either direction: an address
   * minus an offset, or an offset minus an address. Small numbers that
   * change are code changes.
   */
  resolve(): { endPointers: number; arithmetic: number } {
    const ends = new Set(
      this.data.extents.map(([from, to, length]) => `${from + length}→${to + length}`),
    );
    let endPointers = 0;
    for (const { from, to, where } of [...this.conflicts, ...this.data.mismatches]) {
      if (ends.has(`${from}→${to}`)) endPointers += 1;
      else this.findings.push(`${where}: address ${from} → ${to} holds different data`);
    }
    const shifts = new Set(
      [...this.addresses].filter(([, { isProven }]) => isProven).map(([from, { to }]) => to - from),
    );
    let arithmetic = 0;
    for (const { from, to, where } of this.derived) {
      const shift = to - from;
      const isArithmetic =
        Math.abs(from) >= MIN_ADDRESS_ARITHMETIC && (shifts.has(shift) || shifts.has(-shift));
      if (!isArithmetic) {
        this.findings.push(
          `${where}: ${from} → ${to} is neither a moved address nor the paired function`,
        );
        continue;
      }
      arithmetic += 1;
      this.coverShifted(shift);
    }
    return { endPointers, arithmetic };
  }

  /**
   * Covers data that reappears unchanged `shift` bytes later where either
   * side is still uncovered: a table that code reaches only through an
   * address minus an offset, which moved with the rest of the data.
   */
  coverShifted(shift: number): void {
    const { coveredBefore, coveredAfter } = this.data;
    let runStart = -1;
    for (let address = this.before.dataStart; address <= this.before.dataEnd; address += 1) {
      const isMatch =
        address < this.before.dataEnd &&
        !(coveredBefore.has(address) && coveredAfter.has(address + shift)) &&
        this.before.memory[address] === this.after.memory[address + shift];
      if (isMatch && runStart === -1) runStart = address;
      if (isMatch || runStart === -1) continue;
      if (address - runStart >= MIN_SHIFTED_RUN_BYTES) {
        for (let at = runStart; at < address; at += 1) {
          coveredBefore.add(at);
          coveredAfter.add(at + shift);
        }
      }
      runStart = -1;
    }
  }

  compareImmediate(left: Immediate, right: Immediate, where: string): void {
    if (left.kind === "function") {
      if (BigInt(this.pairs.get(Number(left.value)) ?? -1) !== right.value) {
        this.findings.push(
          `${where}: calls ${left.value} → ${right.value}, not the paired function`,
        );
      }
    } else if (left.kind === "constant" || left.kind === "offset") {
      this.compareNumber(Number(left.value), Number(right.value), where);
    } else if (left.kind === "packed-constant") {
      for (const shift of [0n, HIGH_HALF_SHIFT]) {
        const half = (value: bigint): number => Number((value >> shift) & LOW_32_BITS);
        this.compareNumber(half(left.value), half(right.value), where);
      }
    } else if (left.value !== right.value) {
      this.findings.push(`${where}: immediate ${left.value} → ${right.value}`);
    }
  }

  compareFunctions(): void {
    for (const [fromIndex, toIndex] of this.pairs) {
      if (fromIndex < this.before.functionImports) continue;
      const where = this.before.names.get(fromIndex) ?? `function ${fromIndex}`;
      const position = fromIndex - this.before.functionImports;
      const otherPosition = toIndex - this.after.functionImports;
      if (this.before.types[position] !== this.after.types[otherPosition])
        this.findings.push(`${where}: type changed`);
      const left = decodeBody(this.before.bodies[position] ?? new Uint8Array());
      const right = decodeBody(this.after.bodies[otherPosition] ?? new Uint8Array());
      if (
        !sameBytes(left.locals, right.locals) ||
        left.instructions.length !== right.instructions.length
      ) {
        this.findings.push(`${where}: different locals or number of instructions`);
        continue;
      }
      const findingsBefore = this.findings.length;
      let isRelocated = false;
      left.instructions.forEach((instruction, at) => {
        const counterpart = right.instructions[at];
        if (counterpart?.opcode !== instruction.opcode) {
          this.findings.push(`${where}: instruction ${at} changed`);
          return;
        }
        instruction.immediates.forEach((immediate, slot) => {
          const other = counterpart.immediates[slot] ?? plain(-1);
          isRelocated ||= immediate.value !== other.value;
          this.compareImmediate(immediate, other, where);
        });
      });
      if (isRelocated && this.findings.length === findingsBefore) this.relocatedFunctions += 1;
    }
    this.before.elements.forEach((function_, slot) => {
      if (this.pairs.get(function_) === undefined)
        this.findings.push(`table slot ${slot}: unpaired function`);
    });
    if (this.before.elements.length !== this.after.elements.length)
      this.findings.push("function table size changed");
    for (const [name, { kind, index }] of this.before.exports) {
      const other = this.after.exports.get(name);
      const expected = kind === EXPORT_FUNCTION ? this.pairs.get(index) : index;
      if (other?.kind !== kind || other.index !== expected)
        this.findings.push(`export ${name} changed`);
    }
    if (this.after.exports.size !== this.before.exports.size)
      this.findings.push("exports added or removed");
    this.before.globals.forEach((value, index) =>
      this.compareNumber(value, this.after.globals[index] ?? -1, `global ${index}`),
    );
  }

  /** The bytes from `address` to the next paired address, which belong to one constant or a run of them. */
  extent(engine: Engine, address: number, starts: number[]): number {
    const next = starts.find((start) => start > address) ?? engine.dataEnd;
    return Math.max(0, Math.min(next, engine.dataEnd) - address);
  }

  /**
   * Compares the data that each paired address starts, pairing the addresses
   * stored inside. A pairing that only an unchanged number suggested is dropped
   * when its data differs, and the pass runs again without it.
   */
  compareData(): void {
    for (;;) {
      this.data = Comparison.emptyDataPass();
      const rejectedBefore = this.rejected.size;
      const checked = new Set<number>();
      for (;;) {
        const pending = [...this.addresses].filter(([from]) => !checked.has(from));
        if (pending.length === 0) break;
        const startsBefore = [...this.addresses.keys()].sort((left, right) => left - right);
        const startsAfter = [...this.addresses.values()]
          .map(({ to }) => to)
          .sort((left, right) => left - right);
        for (const [from, { to, isProven }] of pending) {
          checked.add(from);
          const length = Math.min(
            this.extent(this.before, from, startsBefore),
            this.extent(this.after, to, startsAfter),
          );
          this.compareConstant(from, to, length, isProven);
        }
      }
      const isStable = this.rejected.size === rejectedBefore;
      if (isStable) return;
    }
  }

  /** The panic location at `from` and `to`, counted, when both sides hold one. */
  isLocationPair(from: number, to: number): boolean {
    const fileBefore = locationFile(this.before, from);
    const fileAfter = locationFile(this.after, to);
    if (fileBefore === undefined || fileAfter === undefined) return false;
    if (fileBefore !== fileAfter) this.data.locationsWithNewFiles += 1;
    const lineAndColumn = (engine: Engine, address: number): string =>
      engine.memory.subarray(address + 2 * WORD_BYTES, address + LOCATION_BYTES).join(",");
    if (lineAndColumn(this.before, from) !== lineAndColumn(this.after, to))
      this.data.locationsWithNewLines += 1;
    return true;
  }

  /**
   * Compares the bytes from a paired address up to `length`, and covers the
   * part that matches. Stored addresses pair in turn; panic locations may name
   * another file, line and column. The match stops at the first other byte:
   * the bytes after it stay uncovered unless another pairing explains them.
   */
  compareConstant(from: number, to: number, length: number, isProven: boolean): void {
    const isAligned = from % WORD_BYTES === 0 && to % WORD_BYTES === 0;
    let offset = 0;
    while (offset < length) {
      const isWord = isAligned && offset % WORD_BYTES === 0 && offset + WORD_BYTES <= length;
      if (
        isWord &&
        offset + LOCATION_BYTES <= length &&
        this.isLocationPair(from + offset, to + offset)
      ) {
        offset += LOCATION_BYTES;
        continue;
      }
      if (isWord) {
        const leftWord = word(this.before.memory, from + offset);
        const rightWord = word(this.after.memory, to + offset);
        const isStoredAddress =
          this.isAddress(this.before, leftWord) && this.isAddress(this.after, rightWord);
        if (isStoredAddress) {
          this.pairAddress(
            leftWord,
            rightWord,
            isProven && leftWord !== rightWord,
            `data at ${from}`,
          );
          if (leftWord !== rightWord) this.data.relocatedWords += 1;
        }
        if (isStoredAddress || (leftWord !== rightWord && this.isPairedSlot(leftWord, rightWord))) {
          offset += WORD_BYTES;
          continue;
        }
      }
      if (this.before.memory[from + offset] !== this.after.memory[to + offset]) break;
      offset += 1;
    }
    if (offset === 0 && length > 0) {
      if (isProven) this.data.mismatches.push({ from, to, where: `data at ${from}` });
      else {
        this.addresses.delete(from);
        this.rejected.add(from);
      }
      return;
    }
    this.data.extents.push([from, to, offset]);
    for (let at = 0; at < offset; at += 1) {
      this.data.coveredBefore.add(from + at);
      this.data.coveredAfter.add(to + at);
    }
  }

  /** Data bytes that no paired constant covers: they must be file names of panic locations, or zeros. */
  uncovered(
    engine: Engine,
    covered: Set<number>,
    side: string,
  ): { files: Set<string>; zeros: number } {
    const fileBytes = new Map<number, string>();
    for (const address of covered) {
      const file = address % WORD_BYTES === 0 ? locationFile(engine, address) : undefined;
      if (file === undefined) continue;
      const start = word(engine.memory, address);
      for (let at = 0; at <= file.length; at += 1) fileBytes.set(start + at, file);
    }
    const files = new Set<string>();
    let zeros = 0;
    let unexplainedFrom = -1;
    for (let address = engine.dataStart; address <= engine.dataEnd; address += 1) {
      const file = fileBytes.get(address);
      const isUnexplained =
        address < engine.dataEnd &&
        !covered.has(address) &&
        file === undefined &&
        engine.memory[address] !== 0;
      if (address < engine.dataEnd && !covered.has(address) && file !== undefined) files.add(file);
      if (address < engine.dataEnd && !covered.has(address) && file === undefined && !isUnexplained)
        zeros += 1;
      if (isUnexplained && unexplainedFrom === -1) unexplainedFrom = address;
      if (!isUnexplained && unexplainedFrom !== -1) {
        this.findings.push(
          `data ${side} ${unexplainedFrom}-${address - 1}: bytes that no pairing explains`,
        );
        unexplainedFrom = -1;
      }
    }
    return { files, zeros };
  }
}

/** Compares two builds of an engine as a source move changes them; see the module comment. */
export function compareRelocations(
  beforeBytes: Uint8Array,
  afterBytes: Uint8Array,
  modules: [string, string][],
): RelocationReport {
  const comparison = new Comparison(parseEngine(beforeBytes), parseEngine(afterBytes), modules);
  const { before, after, findings } = comparison;
  comparison.compareFunctions();
  comparison.compareData();
  const { data } = comparison;
  const { endPointers, arithmetic } = comparison.resolve();
  const looseBefore = comparison.uncovered(before, data.coveredBefore, "before");
  const looseAfter = comparison.uncovered(after, data.coveredAfter, "after");
  const added = [...looseAfter.files].filter((file) => !looseBefore.files.has(file)).sort();
  const dropped = [...looseBefore.files].filter((file) => !looseAfter.files.has(file)).sort();
  const bytesOf = (files: string[]): number =>
    files.reduce((total, file) => total + file.length + 1, 0);
  const renumbered = [...comparison.pairs].filter(([from, to]) => from !== to).length;
  const lines = [
    `Functions: ${before.bodies.length} before, ${after.bodies.length} after; ` +
      `${comparison.pairs.size - before.functionImports - comparison.pairedByOpcodes} paired by name, ` +
      `${comparison.pairedByOpcodes} by opcodes (merged duplicates); ${renumbered} renumbered.`,
    `Code: ${comparison.relocatedFunctions} functions differ only in function numbers and data addresses; ` +
      `${comparison.addresses.size} data addresses paired, ${endPointers} of them ends of slices; ` +
      `${arithmetic} constants are an address plus or minus an offset.`,
    `Data section: ${before.dataBytes} B → ${after.dataBytes} B. ${data.relocatedWords} stored addresses moved; ` +
      `${data.locationsWithNewFiles} panic locations name a new file, ${data.locationsWithNewLines} a new line or column.`,
    `Data bytes that no constant explains: file names added ${added.join(", ") || "none"} (${bytesOf(added)} B), ` +
      `dropped ${dropped.join(", ") || "none"} (${bytesOf(dropped)} B); ` +
      `zero padding ${looseBefore.zeros} B → ${looseAfter.zeros} B.`,
  ];
  if (findings.length > 0) {
    lines.push(
      `Different code (${findings.length} findings):`,
      ...findings.slice(0, FINDINGS_SHOWN).map((text) => `- ${text}`),
    );
  } else {
    lines.push(
      "Same code: the builds differ only in function numbers, data addresses and panic-location files.",
    );
  }
  return { isSameCode: findings.length === 0, lines };
}
