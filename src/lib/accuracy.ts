import { normalizeTracking, trackingNumbersMatch } from "./tracking";

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/** 0–100 similarity; 100 when tracking numbers match. */
export function verificationAccuracy(
  barcode: string,
  printed: string | null,
): number {
  if (!printed) return 0;
  const a = normalizeTracking(barcode);
  const b = normalizeTracking(printed);
  if (trackingNumbersMatch(a, b)) return 100;
  const maxLen = Math.max(a.length, b.length, 1);
  const dist = levenshtein(a, b);
  return Math.max(0, Math.round((1 - dist / maxLen) * 100));
}
