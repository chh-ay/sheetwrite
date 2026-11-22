import { cpus, platform } from "node:os";

/** Words a CPU model string carries that do not tell one machine from another. */
const CPU_NOISE =
  /\(r\)|\(tm\)|@\s*[\d.]+\s*ghz|\b\d+(?:st|nd|rd|th) gen\b|\b(?:intel|amd|apple|core|processor|cpu)\b|\b\d+-core\b/gu;
const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  darwin: "mac",
  linux: "linux",
  win32: "windows",
};

/**
 * The machine label a capture records, such as "linux-i9-12900h" or
 * "mac-m5-pro": `SHEETWRITE_BENCH_MACHINE` when set, otherwise the platform
 * and CPU model. Both are fixed for one machine, so release comparison can
 * require one label across captures. Captures are committed, so the label
 * never holds the host or user name.
 */
export function machineLabel(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  platform_name: string = platform(),
  cpu_model: string = cpus()[0]?.model ?? "",
): string {
  const configured = environment.SHEETWRITE_BENCH_MACHINE?.trim();
  if (configured) return configured;
  const cpu = cpu_model
    .toLowerCase()
    .replace(CPU_NOISE, " ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return `${PLATFORM_NAMES[platform_name] ?? platform_name}-${cpu || "unknown-cpu"}`;
}
