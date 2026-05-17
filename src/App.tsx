import { useState } from "react";
import { MobileOpenQr } from "./components/MobileOpenQr";
import { Scanner } from "./components/Scanner";
import { ResultView } from "./components/ResultView";
import { prepareBarcodeEngine } from "./lib/barcode";
import { preparePrintedOcr } from "./lib/printedOcr";
import { logScan } from "./lib/scanLogger";
import { playSuccessBeep, primeAudio } from "./lib/sound";
import {
  scanAndVerify,
  verifiedScanToResult,
} from "./lib/verifyScan";
import type { ScanResult } from "./lib/types";
import "./App.css";

function App() {
  const [sampleResult, setSampleResult] = useState<ScanResult | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [mode, setMode] = useState<"camera" | "sample-result">("camera");

  const runSample = async () => {
    primeAudio();
    setSampleLoading(true);
    logScan("lifecycle", "Sample label scan started");
    try {
      await Promise.all([prepareBarcodeEngine(), preparePrintedOcr()]);

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load sample"));
        img.src = "/sample-label.png";
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);

      const verified = await scanAndVerify(canvas);
      if (!verified) {
        throw new Error(
          "Could not verify barcode against printed number on sample label",
        );
      }

      const result = verifiedScanToResult(verified);
      await playSuccessBeep();
      logScan("scan_complete", "Sample label verified", {
        barcode: result.barcode,
        printedNumber: result.printedNumber,
        matched: result.matched,
        accuracyPercent: result.accuracyPercent,
        processingMs: result.processingMs,
        barcodeDetectionMs: result.barcodeDetectionMs,
        printedDetectionMs: result.printedDetectionMs,
        conclusion: "Verified match (sample)",
      });
      setSampleResult(result);
      setMode("sample-result");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Sample scan failed");
    } finally {
      setSampleLoading(false);
    }
  };

  if (mode === "sample-result" && sampleResult) {
    return (
      <div className="app">
        <ResultView
          result={sampleResult}
          onScanAgain={() => {
            setSampleResult(null);
            setMode("camera");
          }}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Barcode Scanner</h1>
        <p>
          Tap Take photos — we capture 3 stills and match the barcode to the
          printed tracking number.
        </p>
        <MobileOpenQr />
      </header>
      <Scanner onSample={sampleLoading ? undefined : runSample} />
      {sampleLoading && (
        <p className="loading-overlay">Verifying sample label…</p>
      )}
    </div>
  );
}

export default App;
