const SAMPLE_W = 160;
const SAMPLE_H = 120;

/** Laplacian variance on a downscaled sample — higher = sharper. */
export function frameSharpnessScore(canvas: HTMLCanvasElement): number {
  const tmp = document.createElement("canvas");
  tmp.width = SAMPLE_W;
  tmp.height = SAMPLE_H;
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;

  ctx.drawImage(canvas, 0, 0, SAMPLE_W, SAMPLE_H);
  const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

  let sum = 0;
  let count = 0;

  for (let y = 1; y < SAMPLE_H - 1; y++) {
    for (let x = 1; x < SAMPLE_W - 1; x++) {
      const gray = (i: number) =>
        data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;

      const c = gray((y * SAMPLE_W + x) * 4);
      const lap = Math.abs(
        4 * c -
          gray((y * SAMPLE_W + x - 1) * 4) -
          gray((y * SAMPLE_W + x + 1) * 4) -
          gray(((y - 1) * SAMPLE_W + x) * 4) -
          gray(((y + 1) * SAMPLE_W + x) * 4),
      );
      sum += lap * lap;
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

export function orderFramesBySharpness(
  frames: HTMLCanvasElement[],
): HTMLCanvasElement[] {
  return [...frames].sort(
    (a, b) => frameSharpnessScore(b) - frameSharpnessScore(a),
  );
}
