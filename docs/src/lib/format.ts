interface BytePrecision {
  kib: number;
  mib: number;
  gib?: number;
  groupKib?: boolean;
}

const KIB = 1024;
const MIB = KIB * KIB;
const GIB = MIB * KIB;

function formatBytes(bytes: number, precision: BytePrecision): string {
  if (precision.gib !== undefined && bytes >= GIB) {
    return `${(bytes / GIB).toFixed(precision.gib)} GiB`;
  }
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(precision.mib)} MiB`;
  if (bytes >= KIB) {
    const kib = bytes / KIB;
    const label = precision.groupKib
      ? kib.toLocaleString("en-US", {
          minimumFractionDigits: precision.kib,
          maximumFractionDigits: precision.kib,
        })
      : kib.toFixed(precision.kib);
    return `${label} KiB`;
  }
  return `${bytes} B`;
}

export { formatBytes };
