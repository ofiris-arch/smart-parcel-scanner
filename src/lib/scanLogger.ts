export type ScanLogEvent =
  | "lifecycle"
  | "scan_attempt"
  | "barcode_decoded"
  | "printed_ocr"
  | "verification"
  | "scan_complete"
  | "scan_error";

export interface ScanLogEntry {
  ts: string;
  event: ScanLogEvent;
  message: string;
  conclusion?: string;
  barcode?: string;
  printedNumber?: string;
  matched?: boolean;
  accuracyPercent?: number;
  processingMs?: number;
  barcodeDetectionMs?: number;
  printedDetectionMs?: number;
  ocrConfidence?: number;
  detail?: Record<string, unknown>;
}

const LOG_ENDPOINT = "/__scan-log";
const throttleMs = new Map<string, number>();

function shouldThrottle(key: string, ms: number): boolean {
  const now = Date.now();
  const last = throttleMs.get(key) ?? 0;
  if (now - last < ms) return true;
  throttleMs.set(key, now);
  return false;
}

/** Live scan log — mirrored to console and `.cursor/scanner-live.jsonl` in dev. */
export function logScan(
  event: ScanLogEvent,
  message: string,
  fields: Omit<ScanLogEntry, "ts" | "event" | "message"> = {},
  options?: { throttleKey?: string; throttleMs?: number },
): void {
  if (options?.throttleKey) {
    const ms = options.throttleMs ?? 4000;
    if (shouldThrottle(options.throttleKey, ms)) return;
  }

  const entry: ScanLogEntry = {
    ts: new Date().toISOString(),
    event,
    message,
    ...fields,
  };

  const line = JSON.stringify(entry);
  console.info(`[ParcelScan] ${message}`, entry);

  if (import.meta.env.DEV) {
    void fetch(LOG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: line,
      keepalive: true,
    }).catch(() => {
      /* dev server not running */
    });
  }
}
