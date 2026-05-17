---
name: printed-number-ocr
description: >-
  Fast printed tracking-number OCR for the parcel scanner PWA (camera strip below
  barcode). Use when improving OCR speed, accuracy, Tesseract settings, or
  replacing tesseract.js with another browser engine.
---

# Printed number OCR (parcel scanner)

## No bundled Cursor OCR skill

There is **no official Cursor-wide OCR skill** in `~/.cursor/skills-cursor/` or common plugins. This project skill documents what works here.

## Stack in this repo

| Layer | File | Role |
|-------|------|------|
| Barcode (fast) | `src/lib/decodeFrame.ts`, `barcode-detector` | ~10–30 ms, guide ROI |
| Printed number (slow) | `src/lib/printedOcr.ts` | Tesseract.js `eng`, SINGLE_LINE |
| Verify | `src/lib/tracking.ts` | Strict match vs barcode (≤2 char edit distance) |
| Logs | `.cursor/scanner-live.jsonl` | Compare `barcodeDetectionMs` vs `printedDetectionMs` |

## Rules (do not regress)

1. **At most 2 Tesseract `recognize()` calls** per frame for printed text.
2. **`eng` only** for tracking tokens — not `eng+heb` on the hot path.
3. **`PSM.SINGLE_LINE`** + whitelist `A–Z0–9` — numbers under barcode are one line.
4. **Crop small**: strip below barcode, then `2×` + contrast; cap width **≤420px** before OCR.
5. **Reject OCR** that fails `trackingNumbersMatch(barcode, printed)` — no substring `includes()` matches.
6. **Try native `TextDetector` first** when available (Shape Detection API) — then Tesseract fallback.
7. **Never run block OCR + 4 crops + guide fallback** on the live loop (was 9 passes, 1–2 s).

## Tuning checklist

- [ ] `printedDetectionMs` in logs mostly **&lt;400 ms** on success (watch `engine`: `native` vs `tesseract`)
- [x] False reads like `PH8002878491868` rejected — `pickTokenMatchingBarcode()` + strict `trackingNumbersMatch`
- [x] OCR only when **Number on** toggle enabled (`Scanner.tsx`)
- [x] Preload: `preparePrintedOcr()` with barcode engine on startup
- [x] Logs include `detail.tessPasses` (must stay ≤2) and `detail.engine`

## Faster alternatives (ask before adding deps)

| Option | Pros | Cons |
|--------|------|------|
| **TextDetector** (Shape Detection) | Native, often &lt;50 ms | Chrome/Android oriented; limited desktop |
| **tesseract.js** (current) | Works everywhere | ~200–800 ms per pass |
| **Dynamsoft Label Recognizer** | Parcel-grade | License, bundle size |
| **Skip OCR when barcode enough** | Instant | User must enable “Number off” or trust barcode-only mode |

## Commands

```bash
npm run dev
tail -f .cursor/scanner-live.jsonl   # watch printedDetectionMs
npm test                             # tracking match tests
```

## Related

- Project overview: `.cursor/skills/smart-parcel-scanner/SKILL.md`
- Create new skills: Cursor skill `create-skill`
