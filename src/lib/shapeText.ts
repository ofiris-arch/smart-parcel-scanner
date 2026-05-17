import type { OcrWord } from "./types";

interface DetectedTextLike {
  rawValue?: string;
  boundingBox: DOMRectReadOnly;
}

/** Native Shape Detection API — fast when available (often mobile Chrome). */
export async function detectTextNative(
  canvas: HTMLCanvasElement,
): Promise<OcrWord[]> {
  const TextDetectorCtor = (
    globalThis as typeof globalThis & {
      TextDetector?: new () => {
        detect: (source: ImageBitmapSource) => Promise<DetectedTextLike[]>;
      };
    }
  ).TextDetector;

  if (!TextDetectorCtor) return [];

  try {
    const detector = new TextDetectorCtor();
    const bitmap = await createImageBitmap(canvas);
    try {
      const detected = await detector.detect(bitmap);
      return detected
        .map((d) => ({
          text: d.rawValue?.trim() ?? "",
          bbox: {
            x0: d.boundingBox.x,
            y0: d.boundingBox.y,
            x1: d.boundingBox.x + d.boundingBox.width,
            y1: d.boundingBox.y + d.boundingBox.height,
          },
          confidence: 72,
        }))
        .filter((w) => w.text.length > 0);
    } finally {
      bitmap.close();
    }
  } catch {
    return [];
  }
}

export function isNativeTextDetectionAvailable(): boolean {
  return "TextDetector" in globalThis;
}
