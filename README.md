# Smart Parcel Scanner

Mobile-first web app that uses your device camera to scan shipping labels, keep **routing / logistics** information (sort codes, weight, origin, barcode), and **redact** personal data on-device:

- Parcel / tracking number (shown only in the verification table as barcode vs printed comparison, then masked on the image)  
- Names (including Hebrew)  
- City, address  
- Phone & mobile  
- Date & time  

## How it works

1. **[jscanify](https://github.com/puffinsoft/jscanify)** (standard OpenCV.js document scanner) finds the label ROI; OpenCV contour detection is the fallback.  
2. **Perspective warp** (`extractPaper`) straightens the label for OCR.  
3. **ZXing** decodes the 1D barcode; **Tesseract.js** (`eng+heb`) reads the human-readable number below it.  
4. **Barcode verification** compares both values (`Match` / `Mismatch`).  
5. **PII rules** redact sensitive fields on the image; results appear in a **Name → Value** table.

**Languages:** field labels and values may be **English**, **Hebrew**, or **mixed** (e.g. `Ofir Israeli - אופיר ישראלי`). OCR uses `eng+heb`; redaction recognizes bilingual labels (`שם`, `עיר`, `טלפון`, `כתובת`, …) and splits mixed lines on `-`, `|`, etc.

Processing stays on the device (no cloud API required).

## Run locally

```bash
npm install
npm run dev
```

Open the URL on your phone (same Wi‑Fi) or use **Try sample label** to test with `public/sample-label.png`.

HTTPS is required for camera access on mobile. Production deploys (GitHub Pages, Vercel) include TLS automatically.

## Deploy (cloud + GitHub)

### 1. Push to GitHub

```bash
cd "/Users/ofiris/smart parcel scanner"
git init
git add .
git commit -m "Initial commit: smart parcel scanner PWA"
```

Create a new repo on [github.com/new](https://github.com/new) (e.g. `smart-parcel-scanner`), then:

```bash
git branch -M main
git remote add origin https://github.com/ofiris-arch/smart-parcel-scanner.git
git push -u origin main
```

**Push blocked with `denied to ofiri84`?** Your Mac is logged into GitHub as `ofiri84`, not `ofiris-arch`. Pick one:

1. **Easiest:** On GitHub (as `ofiris-arch`) → repo **Settings** → **Collaborators** → add **`ofiri84`** with Write access → push again from your Mac.
2. **Use `ofiris-arch` token:** [Create a token](https://github.com/settings/tokens) (classic, `repo` scope) while logged in as `ofiris-arch`, then:
   ```bash
   git remote set-url origin https://ofiris-arch@github.com/ofiris-arch/smart-parcel-scanner.git
   git push -u origin main
   ```
   At the password prompt, paste the token (not your GitHub password).
3. **Clear Keychain:** Open **Keychain Access** → search `github` → delete **internet password** entries → push again and sign in as `ofiris-arch`.

### 2. GitHub Pages (free HTTPS)

1. Repo → **Settings** → **Pages** → **Build and deployment** → Source: **GitHub Actions**
2. After the first push to `main`, the **Deploy to GitHub Pages** workflow runs automatically
3. Your app will be at `https://YOUR_USER.github.io/smart-parcel-scanner/`

Open that URL on your iPhone in Safari — camera works without a local dev server.

### 3. Vercel (optional, custom URL)

1. [vercel.com](https://vercel.com) → **Add New Project** → Import your GitHub repo
2. Framework preset: **Vite** (uses `vercel.json` in this repo)
3. Deploy → use `https://your-project.vercel.app` on your phone

## Build

```bash
npm run build
npm run preview
```

Install as PWA: “Add to Home Screen” on iOS/Android.

## Cursor skill

Project skill: `.cursor/skills/smart-parcel-scanner/SKILL.md` — tells the agent to use jscanify, ZXing, Tesseract, ROI mapping, and bilingual PII rules when working in this repo.

## Optional upgrades

- **Faster OCR**: swap Tesseract for a small vision API or on-device WASM OCR (e.g. RapidOCR).  
- **Higher accuracy**: Google Document AI / Azure Read — send only the warped crop, not the full photo.  
- **Barcode-only mode**: decode 1D/2D barcodes and skip OCR for tracking numbers you never want to display.
