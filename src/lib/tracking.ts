/** Tracking / parcel number patterns (barcode + human-readable). */
export const TRACKING_NUM_RE = /\b([A-Z]{1,4}\d{8,14})\b/i;

export function normalizeTracking(value: string): string {
  return value.replace(/[\s\-]/g, "").toUpperCase();
}

export function trackingNumbersMatch(barcode: string, printed: string): boolean {
  const a = normalizeTracking(barcode);
  const b = normalizeTracking(printed);
  if (a === b) return true;
  if (a.length < 8 || b.length < 8) return false;
  if (Math.abs(a.length - b.length) > 2) return false;

  let diffs = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) diffs++;
    if (diffs > 2) return false;
  }
  return diffs <= 2;
}

export function extractTrackingToken(text: string): string | null {
  const m = text.replace(/\s/g, "").match(TRACKING_NUM_RE);
  return m ? m[1].toUpperCase() : null;
}

/** All tracking-like tokens in OCR text (longest-first avoids partial substrings). */
export function extractAllTrackingTokens(text: string): string[] {
  const compact = text.replace(/\s/g, "").toUpperCase();
  const re = /([A-Z]{1,4}\d{8,14})/g;
  const seen = new Set<string>();
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(compact)) !== null) {
    const t = m[1].toUpperCase();
    if (!seen.has(t)) {
      seen.add(t);
      tokens.push(t);
    }
  }
  return tokens.sort((a, b) => b.length - a.length);
}

/** Prefer a token that matches the decoded barcode (skill: reject garbage reads). */
export function pickTokenMatchingBarcode(
  text: string,
  barcode: string,
): string | null {
  const want = normalizeTracking(barcode);
  const compact = text.replace(/\s/g, "").toUpperCase();

  if (want.length >= 8 && compact.includes(want)) return want;

  const tokens = extractAllTrackingTokens(text);
  for (const token of tokens) {
    if (normalizeTracking(token) === want) return token;
  }
  for (const token of tokens) {
    if (trackingNumbersMatch(barcode, token)) return token;
  }
  return null;
}
