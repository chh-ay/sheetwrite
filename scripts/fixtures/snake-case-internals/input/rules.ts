import { publicHelper } from "./shared.js";

export function exportedEntry(inputValue: number): number {
  // `localTotal` is passed to `privateHelper`.
  const localTotal = inputValue + 1;
  // A prose mention of localTotal may name an OOXML term, so it stays.
  return privateHelper(localTotal);
}

/**
 * Doubles a value read through a persisted payload.
 * @param rawValue The value to double.
 */
function privateHelper(rawValue: number): number {
  const { rowIndex } = { rowIndex: rawValue };
  const payload = JSON.stringify({ rowIndex, sheetName: "Data" });
  // Reads decoded.rowIndex back from the persisted key.
  const decoded = JSON.parse(payload) as { rowIndex: number };
  return decoded.rowIndex * 2 + publicHelper(rowIndex);
}

export const exportedArrow = (keptParam: number): number => {
  const doubledValues = [keptParam].map((itemValue) => itemValue * 2);
  return doubledValues.length;
};

function reexportedHelper(): string {
  return "kept";
}

export { reexportedHelper };

class Counter {
  private currentCount = 0;
  #stepSize = 1;
  publicTotal = 0;

  constructor(private readonly startValue: number) {}

  static async create(): Promise<Counter> {
    const counter = new Counter(await Promise.resolve(0));
    counter.#stepSize = 2;
    return counter;
  }

  increment(byAmount: number): number {
    this.currentCount += byAmount * this.#stepSize + this.startValue;
    this.publicTotal = this.currentCount;
    return this.publicTotal;
  }
}

export function listen(target: EventTarget): Counter {
  target.addEventListener("click", (clickEvent) => {
    clickEvent.preventDefault();
  });
  return new Counter(0);
}

/** Unlike `doubledValues`, nothing here is renamed. */
export function collides(lineValue: number): number {
  const scaledLine = lineValue;
  const scaled_line = 2;
  return scaledLine * scaled_line;
}
