export interface Point {
  x: number;
  y: number;
}

export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelRoi {
  rect: LabelRect;
  corners: Point[];
  confidence: number;
  method?: "jscanify" | "contour";
}

export type LabelQuad = LabelRoi;

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface InformativeField {
  label: string;
  value: string;
}

export interface ScanField {
  key: string;
  value: string;
  highlight?: "success" | "danger" | "muted";
}

export interface ScanResult {
  barcode: string;
  printedNumber?: string;
  matched?: boolean;
  accuracyPercent?: number;
  ocrConfidence?: number;
  barcodeDetectionMs?: number;
  printedDetectionMs?: number;
  fields: ScanField[];
  processingMs: number;
  redactedImageUrl?: string;
  rawLabelUrl?: string;
}

export type ScanPhase =
  | "idle"
  | "scanning"
  | "processing"
  | "done"
  | "error";
