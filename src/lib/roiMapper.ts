import type { LabelRect, LabelRoi, Point } from "./types";

/** Map a point from camera resolution to on-screen coords (object-fit: cover). */
export function mapPointToDisplay(
  point: Point,
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number,
): Point {
  if (!videoWidth || !videoHeight || !displayWidth || !displayHeight) {
    return point;
  }

  const scale = Math.max(
    displayWidth / videoWidth,
    displayHeight / videoHeight,
  );
  const offsetX = (displayWidth - videoWidth * scale) / 2;
  const offsetY = (displayHeight - videoHeight * scale) / 2;

  return {
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
  };
}

/** Map camera-space axis-aligned rect to the visible video element. */
export function mapRectToDisplay(
  rect: LabelRect,
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number,
): LabelRect {
  const tl = mapPointToDisplay(
    { x: rect.x, y: rect.y },
    videoWidth,
    videoHeight,
    displayWidth,
    displayHeight,
  );
  const br = mapPointToDisplay(
    { x: rect.x + rect.width, y: rect.y + rect.height },
    videoWidth,
    videoHeight,
    displayWidth,
    displayHeight,
  );
  return {
    x: tl.x,
    y: tl.y,
    width: br.x - tl.x,
    height: br.y - tl.y,
  };
}

export function rectFromCorners(corners: Point[]): LabelRect {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

export function mapQuadToDisplay(
  roi: LabelRoi,
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number,
): Point[] {
  return roi.corners.map((p) =>
    mapPointToDisplay(p, videoWidth, videoHeight, displayWidth, displayHeight),
  );
}

export function quadAabbDisplay(
  roi: LabelRoi,
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number,
): LabelRect {
  return mapRectToDisplay(roi.rect, videoWidth, videoHeight, displayWidth, displayHeight);
}
