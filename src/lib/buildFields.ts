import type { BarcodeVerification } from "./barcode";
import type { InformativeField, ScanField } from "./types";

/** Build ordered key → value rows for the results table. */
export function buildScanFields(
  verification: BarcodeVerification,
  informative: InformativeField[],
): ScanField[] {
  const rows: ScanField[] = [];
  const seen = new Set<string>();

  const add = (key: string, value: string, highlight?: ScanField["highlight"]) => {
    const k = key.trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    rows.push({ key: k, value: value.trim(), highlight });
  };

  if (verification.barcode) add("Barcode", verification.barcode);
  if (verification.printedNumber) add("Printed number", verification.printedNumber);

  const highlight =
    verification.match === true
      ? "success"
      : verification.match === false
        ? "danger"
        : undefined;
  add("Barcode verification", verification.status, highlight);

  for (const f of informative) {
    add(f.label, f.value);
  }

  return rows;
}
