---
name: smart-parcel-scanner
description: >-
  Build and maintain the Barcode Scanner PWA: ZXing barcode + printed-number OCR,
  verification, camera flash. Use when editing scanning, barcode, or capture flow.
  For OCR speed/accuracy rules see printed-number-ocr skill.
---

# Smart Parcel Scanner

## Current mode: barcode + printed verification

| Step | Mechanism | Library |
|------|-----------|---------|
| Camera | `getUserMedia` + torch toggle | Browser API |
| Barcode | Guide ROI decode | `decodeFrame.ts` / ZXing WASM |
| Printed # | Strip OCR below barcode | `printedOcr.ts` (TextDetector → Tesseract) |
| Verify | Match barcode vs OCR | `tracking.ts` |
| Logs | Live JSONL | `.cursor/scanner-live.jsonl` |

**OCR skill:** `.cursor/skills/printed-number-ocr/SKILL.md`

Legacy (not in App): jscanify ROI, full-label PII — `scanner.ts`, `piiFilter.ts`, `ocr.ts`.

References:
- [jscanify](https://github.com/puffinsoft/jscanify) — OSS doc scanner (OpenCV.js)
- [OpenCV.js document scanning](https://opencv.org/smart-document-scanning-with-live-ocr-using-opencv-js/)
- [Dynamsoft parcel barcode + OCR](https://www.dynamsoft.com/codepool/parcel-scan-barcode-ocr-text.html) — commercial; we mirror **barcode + text + frame verification**, not their SDK

## OpenCV loading

- Script in `index.html`: `docs.opencv.org` opencv.js (global `cv`)
- Always `await waitForOpenCV()` before `cv` or jscanify
- jscanify import: `import JScanify from "jscanify/client"`

## Detection order

1. `detectLabelJscanify(canvas)` in `src/lib/jscanifyClient.ts`
2. If null → `detectLabelContour` in `src/lib/labelDetector.ts`
3. `warpLabel`: `extractLabelJscanify` then contour homography fallback

## UX / accuracy rules

- ROI = real **rectangle** from `cv.boundingRect`, not a decorative animated quad
- **Manual capture only** — accuracy over auto-capture speed
- `prepareLabelForOcr` upscales + contrast before OCR/barcode
- Guard `detectingRef` / `capturingRef`; `withTimeout` on `processFrame`

## Bilingual PII

- Redact: names, city, address, phone, mobile, date/time, tracking on **image**
- Table may show **Barcode**, **Printed number**, **Barcode verification** for ops check
- Hebrew labels: `שם`, `עיר`, `טלפון`, `כתובת`, … — see `locale.ts`
- Split mixed values on `-`, `|`, `•`

## Commands

```bash
npm run dev
npm run build
npm test
```

## Optional upgrades (ask user before adding)

- **Dynamsoft Capture Vision** — license key; best parcel accuracy
- **Scanbot SDK** — commercial doc scanner
- Lazy-load ZXing chunk if bundle size matters
