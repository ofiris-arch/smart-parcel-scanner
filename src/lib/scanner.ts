import {
  decodeBarcode,
  findPrintedNumberBelowBarcode,
  verifyBarcode,
} from "./barcode";
import { buildScanFields } from "./buildFields";
import { detectLabel, warpLabel } from "./labelDetector";
import { recognizeLabel } from "./ocr";
import { analyzeWords, redactImage } from "./piiFilter";
import type { ScanResult } from "./types";

export async function processFrame(
  frame: HTMLCanvasElement,
  labelRoi: NonNullable<Awaited<ReturnType<typeof detectLabel>>>,
): Promise<ScanResult> {
  const start = performance.now();

  const labelCanvas = await warpLabel(frame, labelRoi);

  const [words, barcode] = await Promise.all([
    recognizeLabel(labelCanvas),
    decodeBarcode(labelCanvas),
  ]);

  const printed = findPrintedNumberBelowBarcode(
    words,
    barcode,
    labelCanvas.height,
  );
  const verification = verifyBarcode(barcode, printed);
  const { redactBoxes, informativeFields } = analyzeWords(words);
  const fields = buildScanFields(verification, informativeFields);
  const redactedImageUrl = redactImage(labelCanvas, redactBoxes);

  return {
    barcode: verification.barcode ?? "",
    redactedImageUrl,
    rawLabelUrl: labelCanvas.toDataURL("image/jpeg", 0.85),
    fields,
    processingMs: Math.round(performance.now() - start),
  };
}

export { detectLabel };
