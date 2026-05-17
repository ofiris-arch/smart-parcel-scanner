import { detectLabelJscanify, extractLabelJscanify } from "./jscanifyClient";
import type { LabelRoi, Point } from "./types";
import { waitForOpenCV } from "./opencv";

function orderCorners(pts: Point[]): Point[] {
  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.x - p.y);
  const topLeft = pts[sum.indexOf(Math.min(...sum))];
  const bottomRight = pts[sum.indexOf(Math.max(...sum))];
  const topRight = pts[diff.indexOf(Math.max(...diff))];
  const bottomLeft = pts[diff.indexOf(Math.min(...diff))];
  return [topLeft, topRight, bottomRight, bottomLeft];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function detectLabelContour(
  source: HTMLCanvasElement,
  scale = 0.75,
): Promise<LabelRoi | null> {
  await waitForOpenCV();
  const cv = window.cv!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mats: any[] = [];

  try {
    const w = Math.round(source.width * scale);
    const h = Math.round(source.height * scale);
    const work = document.createElement("canvas");
    work.width = w;
    work.height = h;
    work.getContext("2d")!.drawImage(source, 0, 0, w, h);

    const src = cv.imread(work);
    mats.push(src);
    const gray = new cv.Mat();
    mats.push(gray);
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const blurred = new cv.Mat();
    mats.push(blurred);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    const edges = new cv.Mat();
    mats.push(edges);
    cv.Canny(blurred, edges, 75, 200);

    const contours = new cv.MatVector();
    mats.push(contours);
    const hierarchy = new cv.Mat();
    mats.push(hierarchy);
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const frameArea = w * h;
    let best: LabelRoi | null = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < frameArea * 0.06 || area > frameArea * 0.92) continue;

      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat() as {
        rows: number;
        data32S: Int32Array;
        delete: () => void;
      };
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);

      if (approx.rows !== 4) {
        approx.delete();
        continue;
      }

      const corners: Point[] = [];
      for (let j = 0; j < 4; j++) {
        corners.push({
          x: approx.data32S[j * 2] / scale,
          y: approx.data32S[j * 2 + 1] / scale,
        });
      }
      approx.delete();

      const ordered = orderCorners(corners);
      const width = Math.max(
        dist(ordered[0], ordered[1]),
        dist(ordered[2], ordered[3]),
      );
      const height = Math.max(
        dist(ordered[0], ordered[3]),
        dist(ordered[1], ordered[2]),
      );
      const aspect = width / height;
      if (aspect < 0.35 || aspect > 2.8) continue;

      const bound = cv.boundingRect(contour) as {
        x: number;
        y: number;
        width: number;
        height: number;
      };

      const roi: LabelRoi = {
        corners: ordered,
        rect: {
          x: bound.x / scale,
          y: bound.y / scale,
          width: bound.width / scale,
          height: bound.height / scale,
        },
        confidence: Math.min(1, area / (frameArea * 0.3)),
        method: "contour",
      };

      if (!best || roi.confidence > best.confidence) best = roi;
    }

    return best;
  } finally {
    for (const m of mats) {
      if (m && typeof m.delete === "function") m.delete();
    }
  }
}

export async function detectLabel(
  source: HTMLCanvasElement,
): Promise<LabelRoi | null> {
  const primary = await detectLabelJscanify(source);
  if (primary) return primary;
  return detectLabelContour(source);
}

export async function warpLabel(
  source: HTMLCanvasElement,
  roi: LabelRoi,
): Promise<HTMLCanvasElement> {
  const extracted = await extractLabelJscanify(source, roi);
  if (extracted) return prepareLabelForOcr(extracted);
  return prepareLabelForOcr(await warpLabelContour(source, roi));
}

/** Upscale + light contrast boost so OCR/barcode read the real text. */
export function prepareLabelForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const minWidth = 1000;
  let w = canvas.width;
  let h = canvas.height;
  if (w < minWidth) {
    const s = minWidth / w;
    w = Math.round(w * s);
    h = Math.round(h * s);
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.filter = "contrast(1.12) brightness(1.03)";
  ctx.drawImage(canvas, 0, 0, w, h);
  return out;
}

async function warpLabelContour(
  source: HTMLCanvasElement,
  roi: LabelRoi,
): Promise<HTMLCanvasElement> {
  await waitForOpenCV();
  const cv = window.cv!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mats: any[] = [];

  try {
    const ordered = roi.corners;
    const maxW = Math.round(
      Math.max(dist(ordered[0], ordered[1]), dist(ordered[2], ordered[3])),
    );
    const maxH = Math.round(
      Math.max(dist(ordered[0], ordered[3]), dist(ordered[1], ordered[2])),
    );

    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      ordered[0].x, ordered[0].y,
      ordered[1].x, ordered[1].y,
      ordered[2].x, ordered[2].y,
      ordered[3].x, ordered[3].y,
    ]);
    mats.push(srcPts);

    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      maxW - 1, 0,
      maxW - 1, maxH - 1,
      0, maxH - 1,
    ]);
    mats.push(dstPts);

    const src = cv.imread(source);
    mats.push(src);
    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    mats.push(M);
    const dst = new cv.Mat();
    mats.push(dst);
    cv.warpPerspective(src, dst, M, new cv.Size(maxW, maxH));

    const out = document.createElement("canvas");
    out.width = maxW;
    out.height = maxH;
    cv.imshow(out, dst);
    return out;
  } finally {
    for (const m of mats) {
      if (m && typeof m.delete === "function") m.delete();
    }
  }
}
