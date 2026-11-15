import { publicHelper } from "./shared.js";

export function exportedEntry(inputValue: number): number {
  // `local_total` is passed to `private_helper`.
  const local_total = inputValue + 1;
  // A prose mention of localTotal may name an OOXML term, so it stays.
  return private_helper(local_total) + read_loose();
}

/** A key on an untyped value resolves to no symbol and does not block the local. */
function read_loose(): number {
  const loose_value = 1;
  return JSON.parse("{}").looseValue + loose_value;
}

/**
 * Doubles a value read through a persisted payload.
 * @param raw_value The value to double.
 */
function private_helper(raw_value: number): number {
  const { rowIndex: row_index } = { rowIndex: raw_value };
  const payload = JSON.stringify({ rowIndex: row_index, sheetName: "Data" });
  // Reads decoded.rowIndex back from the persisted key.
  const decoded = JSON.parse(payload) as { rowIndex: number };
  return decoded.rowIndex * 2 + publicHelper(row_index);
}

export const exportedArrow = (keptParam: number): number => {
  const doubled_values = [keptParam].map((item_value) => item_value * 2);
  return doubled_values.length;
};

function reexportedHelper(): string {
  return "kept";
}

export { reexportedHelper };

class Counter {
  private current_count = 0;
  #step_size = 1;
  publicTotal = 0;

  constructor(private readonly startValue: number) {}

  static async create(): Promise<Counter> {
    const counter = new Counter(await Promise.resolve(0));
    counter.#step_size = 2;
    return counter;
  }

  increment(byAmount: number): number {
    this.current_count += byAmount * this.#step_size + this.startValue;
    this.publicTotal = this.current_count;
    return this.publicTotal;
  }
}

export function listen(target: EventTarget): Counter {
  target.addEventListener("click", (click_event) => {
    click_event.preventDefault();
  });
  return new Counter(0);
}

/** Unlike `doubledValues`, nothing here is renamed. */
export function collides(lineValue: number): number {
  const scaledLine = lineValue;
  const scaled_line = 2;
  return scaledLine * scaled_line;
}

function pair_product(pair_left: number, pair_right: number): number {
  return pair_left * pair_right;
}

/** Sums each pair with {@link pair_product}. */
export function sumPairs(pairs: readonly [pairLeft: number, pairRight: number][]): number {
  let pair_total = 0;
  for (const [pair_left, pair_right] of pairs) pair_total += pair_product(pair_left, pair_right);
  return pair_total;
}

/** Reads private state by name, as a test does. */
export function peekCount(counter: Counter): number {
  const shown: { publicTotal: number } = counter;
  const loose = JSON.parse("{}");
  const typed = Reflect.get(counter, "current_count") + counter["current_count"];
  const named = Reflect.get(shown, "current_count");
  return typed + named + loose.currentCount + loose["currentCount"];
}
