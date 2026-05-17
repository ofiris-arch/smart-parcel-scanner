/** Bilingual (EN / HE / mixed) field detection for parcel labels. */

const HEBREW_RE = /[\u0590-\u05FF]/;
const LATIN_RE = /[A-Za-z]/;

/** English PII field labels */
const PII_LABEL_EN =
  /^(name|city|phone|mobile|address|date|time|consignee|sender|recipient|date&time|date\s*&\s*time)\b/i;

/** Hebrew PII field labels (with optional niqqud gaps) */
const PII_LABEL_HE =
  /^(שם|עיר|טלפון|טלפון נייד|נייד|כתובת|תאריך|שעה|נמען|שולח|מקבל|תאריך ושעה)\b/;

/** English labels we keep */
const KEEP_LABEL_EN =
  /^(parcel\s*weight|weight|from|origin|country|sort|route|zone)\b/i;

/** Hebrew labels we keep */
const KEEP_LABEL_HE = /^(משקל|משקל חבילה|ממקום|מוצא|מדינה)\b/;

const CITY_EN =
  /\b(tel\s*aviv|jerusalem|haifa|yafo|jaffa|beer\s*sheva|street|st\.|ave|road|rd|ehad\s*haam)\b/i;

const CITY_HE =
  /תל[\s-]*אביב|ירושלים|חיפה|יפו|יהודה|באר[\s-]*שבע|רחוב|שדרות|דרך|מבית|לוד|רמת[\s-]*גן/;

const ORIGIN_KEEP =
  /\b(from\s+)?china|israel|usa|uk\b|מסין|סין|מאין\s+סין|ארצות|בריטניה/i;

export function hasHebrew(text: string): boolean {
  return HEBREW_RE.test(text);
}

export function hasLatin(text: string): boolean {
  return LATIN_RE.test(text);
}

export function isMixedScript(text: string): boolean {
  return hasHebrew(text) && hasLatin(text);
}

export function isPiiFieldLabel(label: string): boolean {
  const n = label.replace(/[:：]\s*$/, "").trim();
  if (!n) return false;
  if (KEEP_LABEL_EN.test(n) || KEEP_LABEL_HE.test(n)) return false;
  if (PII_LABEL_EN.test(n)) return true;
  if (PII_LABEL_HE.test(n)) return true;
  if (/שם|עיר|טלפון|כתובת|נייד|נמען|שולח/.test(n) && !/משקל|מוצא|ממקום/.test(n))
    return true;
  if (/name|city|phone|mobile|address|sender|consignee/i.test(n) && !/weight|from\b/i.test(n))
    return true;
  return false;
}

export function isKeepFieldLabel(label: string): boolean {
  const n = label.replace(/[:：]\s*$/, "").trim();
  return KEEP_LABEL_EN.test(n) || KEEP_LABEL_HE.test(n);
}

/** Split bilingual values: "Ofir Israeli - אופיר ישראלי" */
export function splitBilingualSegments(text: string): string[] {
  return text
    .split(/\s*[-–—|•·]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isHebrewCity(text: string): boolean {
  return CITY_HE.test(text);
}

export function isEnglishCity(text: string): boolean {
  return CITY_EN.test(text);
}

export function isOriginText(text: string): boolean {
  const t = text.trim();
  if (isHebrewCity(t) || isEnglishCity(t)) return false;
  if (/ישראלי|ישראלית/.test(t)) return false;
  if (/^ישראל$/.test(t)) return true;
  return ORIGIN_KEEP.test(t);
}

/** Hebrew personal name: words in Hebrew, no digits, not city/origin */
export function isHebrewPersonalName(text: string): boolean {
  const t = text.trim();
  if (!hasHebrew(t) || /\d/.test(t)) return false;
  if (isHebrewCity(t) || isOriginText(t) || isKeepFieldLabel(t)) return false;
  const heWords = t.split(/\s+/).filter((w) => HEBREW_RE.test(w));
  return heWords.length >= 1 && heWords.length <= 6 && t.length <= 50;
}

/** Latin personal name: 2+ capitalized words */
export function isLatinPersonalName(text: string): boolean {
  const t = text.trim();
  if (!hasLatin(t) || hasHebrew(t)) return false;
  if (/\d|\+|@/.test(t)) return false;
  if (/^(from|consignee|sender|name|city)\b/i.test(t)) return false;
  const parts = t.split(/\s+/).filter((p) => /^[A-Za-z][A-Za-z'-]*$/.test(p));
  return parts.length >= 2 && parts.length <= 6;
}

/** Label before colon — supports "Name:", "שם:", "שם Name:" */
export const LABEL_VALUE_RE = /^([^:：\n]{1,48})[:：]\s*(.*)$/u;
