import JScanify from "jscanify/client";
import type { LabelRoi, Point } from "./types";
import { waitForOpenCV } from "./opencv";

type Corner = { x: number; y: number };

export type JscanifyCornerMap = {
  topLeftCorner: Corner;
  topRightCorner: Corner;
  bottomLeftCorner: Corner;
  bottomRightCorner: Corner;
};

let scanner: JScanify | null = null;

function getScanner(): JScanify {
  if (!scanner) scanner = new JScanify();
  return scanner;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cornersFromJscanify(c: JscanifyCornerMap, scale: number): Point[] | null {
  const tl = c.topLeftCorner;
  const tr = c.topRightCorner;
  const bl = c.bottomLeftCorner;
  const br = c.bottomRightCorner;
  if (!tl || !tr || !bl || !br) return null;

  return [
    { x: tl.x / scale, y: tl.y / scale },
    { x: tr.x / scale, y: tr.y / scale },
    { x: br.x / scale, y: br.y / scale },
    { x: bl.x / scale, y: bl.y / scale },
  ];
}

function buildRoi(
  corners: Point[],
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
  frameArea: number,
  contourArea: number,
  method: LabelRoi["method"],
): LabelRoi | null {
  const width = Math.max(dist(corners[0], corners[1]), dist(corners[2], corners[3]));
  const height = Math.max(dist(corners[0], corners[3]), dist(corners[1], corners[2]));
  const aspect = width / height;
  if (aspect < 0.25 || aspect > 3.5) return null;
  if (rect.width < 20 || rect.height < 20) return null;

  return {
    corners,
    rect: {
      x: rect.x / scale,
      y: rect.y / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    },
    confidence: Math.min(1, contourArea / (frameArea * 0.2)),
    method,
  };
}

export function roiToJscanifyCorners(roi: LabelRoi): JscanifyCornerMap {
  const [tl, tr, br, bl] = roi.corners;
  return {
    topLeftCorner: tl,
    topRightCorner: tr,
    bottomLeftCorner: bl,
    bottomRightCorner: br,
  };
}

/** Detect label using jscanify; ROI is OpenCV boundingRect (true rectangle). */
export async function detectLabelJscanify(
  source: HTMLCanvasElement,
  scale = 0.85,
): Promise<LabelRoi | null> {
  await waitForOpenCV();
  const cv = window.cv!;
  const s = getScanner();

  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  work.getContext("2d")!.drawImage(source, 0, 0, w, h);

  const img = cv.imread(work) as { delete: () => void };
  try {
    const contour = s.findPaperContour(img);
    if (!contour) return null;

    const contourArea = cv.contourArea(contour);
    const frameArea = w * h;
    if (contourArea < frameArea * 0.05) return null;

    const bound = cv.boundingRect(contour) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };

    const raw = s.getCornerPoints(contour) as JscanifyCornerMap;
    const corners = cornersFromJscanify(raw, scale);
    if (!corners) return null;

    return buildRoi(corners, bound, scale, frameArea, contourArea, "jscanify");
  } finally {
    img.delete();
  }
}

export async function extractLabelJscanify(
  source: HTMLCanvasElement,
  roi: LabelRoi,
): Promise<HTMLCanvasElement | null> {
  await waitForOpenCV();
  const s = getScanner();
  const [tl, tr, br, bl] = roi.corners;
  const maxW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  const maxH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  if (maxW < 8 || maxH < 8) return null;

  return s.extractPaper(source, maxW, maxH, roiToJscanifyCorners(roi));
}
