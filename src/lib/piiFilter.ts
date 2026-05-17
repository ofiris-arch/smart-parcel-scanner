import {
  hasHebrew,
  hasLatin,
  isEnglishCity,
  isHebrewCity,
  isHebrewPersonalName,
  isKeepFieldLabel,
  isLatinPersonalName,
  isMixedScript,
  isOriginText,
  isPiiFieldLabel,
  LABEL_VALUE_RE,
  splitBilingualSegments,
} from "./locale";
import type { InformativeField, OcrWord } from "./types";

const PHONE_RE = /\+?\d[\d\s\-()]{8,}\d/;
const DATE_RE = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/;
const TIME_RE = /\d{1,2}:\d{2}(:\d{2})?/;
const PARCEL_NUM_RE = /^[A-Z]{1,4}\d{8,}$/i;
const ROUTING_CODE_RE = /^[A-Z]{2,4}\d{0,3}$/i;

const ADDRESS_RE =
  /^\d+\s+[\w\u0590-\u05FF\s.'-]{3,}$/u;

function padBox(
  bbox: OcrWord["bbox"],
  padX: number,
  padY: number,
): OcrWord["bbox"] {
  return {
    x0: bbox.x0 - padX,
    y0: bbox.y0 - padY,
    x1: bbox.x1 + padX,
    y1: bbox.y1 + padY,
  };
}

function isRoutingCode(text: string): boolean {
  const t = text.trim();
  if (t.length <= 4 && ROUTING_CODE_RE.test(t)) return true;
  if (/^[A-Z]{2,4}$/.test(t) && t.length <= 4) return true;
  return false;
}

function isPiiValue(text: string, contextLabel: string | null): boolean {
  const t = text.trim();
  if (!t) return false;

  if (contextLabel && isKeepFieldLabel(contextLabel)) return false;
  if (contextLabel && isPiiFieldLabel(contextLabel)) return true;

  if (PHONE_RE.test(t.replace(/\s/g, ""))) return true;
  if (DATE_RE.test(t) || TIME_RE.test(t)) return true;
  if (PARCEL_NUM_RE.test(t.replace(/\s/g, ""))) return true;

  if (isEnglishCity(t) || isHebrewCity(t)) return true;
  if (ADDRESS_RE.test(t)) return true;

  if (isLatinPersonalName(t) || isHebrewPersonalName(t)) return true;

  if (isMixedScript(t)) {
    const segments = splitBilingualSegments(t);
    if (segments.length > 1) {
      return segments.some((seg) => isPiiValue(seg, contextLabel));
    }
    return true;
  }

  if (hasHebrew(t)) {
    if (isOriginText(t)) return false;
    if (isRoutingCode(t)) return false;
    if (t.length > 2) return true;
  }

  if (contextLabel && isPiiFieldLabel(contextLabel)) return true;

  return false;
}

function isInformativeValue(text: string, contextLabel: string | null): boolean {
  const t = text.trim();
  if (!t) return false;
  if (contextLabel && isKeepFieldLabel(contextLabel)) return true;
  if (isRoutingCode(t)) return true;
  if (/^from\s/i.test(t) || isOriginText(t)) return true;
  if (/^\d+(\.\d+)?\s*(kg|lb|ק"ג|קג)?$/iu.test(t) && contextLabel?.match(/weight|משקל/i))
    return true;
  if (/^parcel\s*weight|^משקל/i.test(t)) return true;
  return false;
}

function shouldRedact(text: string, contextLabel: string | null): boolean {
  if (isInformativeValue(text, contextLabel)) return false;
  if (isMixedScript(text) || splitBilingualSegments(text).length > 1) {
    const segments = splitBilingualSegments(text);
    if (segments.length > 1) {
      return segments.some(
        (seg) => isPiiValue(seg, contextLabel) && !isInformativeValue(seg, contextLabel),
      );
    }
  }
  return isPiiValue(text, contextLabel);
}

/** Classify OCR tokens; supports EN, HE, and mixed lines. */
export function analyzeWords(words: OcrWord[]): {
  redactBoxes: OcrWord["bbox"][];
  informativeFields: InformativeField[];
} {
  const redactBoxes: OcrWord["bbox"][] = [];
  const informativeFields: InformativeField[] = [];
  let lastLabel: string | null = null;

  const sorted = [...words].sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
  );

  for (const w of sorted) {
    const text = w.text.trim();
    if (!text) continue;

    const labelMatch = text.match(LABEL_VALUE_RE);
    if (labelMatch) {
      lastLabel = labelMatch[1].trim();
      const value = labelMatch[2].trim();

      if (value) {
        if (isInformativeValue(value, lastLabel)) {
          informativeFields.push({ label: displayLabel(lastLabel), value });
        } else if (shouldRedact(value, lastLabel)) {
          redactBoxes.push(padBox(w.bbox, 4, 3));
        }
      } else if (isPiiFieldLabel(lastLabel)) {
        redactBoxes.push(padBox(w.bbox, 4, 3));
      }
      continue;
    }

    if (isPiiFieldLabel(text) && text.length < 32) {
      lastLabel = text.replace(/[:：]$/, "");
      continue;
    }

    if (isRoutingCode(text) && !shouldRedact(text, lastLabel)) {
      informativeFields.push({ label: "Routing", value: text });
      continue;
    }

    if (isInformativeValue(text, lastLabel)) {
      informativeFields.push({
        label: lastLabel ? displayLabel(lastLabel) : "Info",
        value: text,
      });
      lastLabel = null;
      continue;
    }

    if (shouldRedact(text, lastLabel)) {
      redactBoxes.push(padBox(w.bbox, 6, 4));
      lastLabel = null;
      continue;
    }

    if (w.confidence < 45 && text.length > 12 && (hasHebrew(text) || hasLatin(text))) {
      redactBoxes.push(padBox(w.bbox, 4, 3));
    }
  }

  return {
    redactBoxes: dedupeBoxes(redactBoxes),
    informativeFields: dedupeFields(informativeFields),
  };
}

function displayLabel(label: string): string {
  const map: Record<string, string> = {
    משקל: "Weight",
    "משקל חבילה": "Parcel weight",
    ממקום: "From",
    מוצא: "Origin",
  };
  return map[label] ?? label;
}

function dedupeFields(fields: InformativeField[]): InformativeField[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    const k = `${f.label}:${f.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupeBoxes(boxes: OcrWord["bbox"][]): OcrWord["bbox"][] {
  return boxes.filter((b, i) => {
    for (let j = 0; j < i; j++) {
      const o = boxes[j];
      const overlap =
        Math.max(0, Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0)) *
        Math.max(0, Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0));
      const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (overlap > areaB * 0.6) return false;
    }
    return true;
  });
}

export function redactImage(
  canvas: HTMLCanvasElement,
  boxes: OcrWord["bbox"][],
): string {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);

  ctx.fillStyle = "#f1f5f9";
  for (const b of boxes) {
    const x = Math.max(0, b.x0);
    const y = Math.max(0, b.y0);
    const w = Math.min(out.width, b.x1) - x;
    const h = Math.min(out.height, b.y1) - y;
    if (w > 2 && h > 2) ctx.fillRect(x, y, w, h);
  }

  return out.toDataURL("image/jpeg", 0.92);
}
