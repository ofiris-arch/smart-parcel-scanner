import { createWorker, PSM, type Worker } from "tesseract.js";
import type { OcrWord } from "./types";

let workerPromise: Promise<Worker> | null = null;

export async function prepareOcr(): Promise<void> {
  await getWorker();
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("eng+heb", 1, {
        logger: () => {},
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ",
      });
      return worker;
    })();
  }
  return workerPromise;
}

interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface TextBlock {
  text: string;
  bbox: Bbox;
  confidence: number;
}

/** Single-line OCR for printed tracking numbers below the barcode. */
export async function recognizeLine(
  canvas: HTMLCanvasElement,
): Promise<OcrWord[]> {
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  });
  const words = await wordsFromRecognition(worker, canvas);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  });
  return words;
}

async function wordsFromRecognition(
  worker: Worker,
  canvas: HTMLCanvasElement,
): Promise<OcrWord[]> {
  const { data } = await worker.recognize(canvas);
  const words: OcrWord[] = [];

  const blocks = (data as { words?: TextBlock[]; lines?: TextBlock[] }).words;
  const lines = (data as { lines?: TextBlock[] }).lines;

  if (blocks?.length) {
    for (const w of blocks) {
      if (!w.text?.trim()) continue;
      words.push({
        text: w.text,
        bbox: w.bbox,
        confidence: w.confidence,
      });
    }
  } else if (lines?.length) {
    for (const line of lines) {
      if (!line.text?.trim()) continue;
      words.push({
        text: line.text,
        bbox: line.bbox,
        confidence: line.confidence,
      });
    }
  } else if (data.text) {
    words.push({
      text: data.text,
      bbox: { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height },
      confidence: data.confidence,
    });
  }

  return words;
}

export async function recognizeLabel(
  canvas: HTMLCanvasElement,
): Promise<OcrWord[]> {
  const worker = await getWorker();
  return wordsFromRecognition(worker, canvas);
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}
