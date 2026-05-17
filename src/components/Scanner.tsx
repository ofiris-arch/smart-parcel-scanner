import { useCallback, useEffect, useRef, useState } from "react";
import { prepareBarcodeEngine } from "../lib/barcode";
import { getScanDeviceInfo, type ScanDeviceInfo } from "../lib/deviceInfo";
import { preparePrintedOcr } from "../lib/printedOcr";
import { logScan } from "../lib/scanLogger";
import { isAudioPrimed, playSuccessBeep, primeAudio } from "../lib/sound";
import {
  getCameraBlockReason,
  isIOS,
  isIPhone,
  isMobileDevice,
  isSecureCameraContext,
  preferRearCamera,
  requestCamera,
  requestCameraFromGesture,
  toCameraError,
} from "../lib/camera";
import {
  applyTorch,
  getVideoTrack,
  isTorchSupported,
} from "../lib/torch";
import { scanFrame, verifiedScanToResult } from "../lib/verifyScan";
import type { ScanPhase, ScanResult } from "../lib/types";
import { BarcodeGuide } from "./BarcodeGuide";
import { MobileCapabilities } from "./MobileCapabilities";
import { ResultView } from "./ResultView";

const LIVE_SCAN_MS = 550;
const STABLE_MATCHES = 2;
const AGGRESSIVE_EVERY = 4;

interface ScannerProps {
  onSample?: () => void;
}

export function Scanner({ onSample }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const lastScanRef = useRef(0);
  const scanningRef = useRef(false);
  const stableMatchRef = useRef(0);
  const lastMatchKeyRef = useRef("");
  const attemptRef = useRef(0);
  const enginesReadyRef = useRef(false);
  const barcodeStableFramesRef = useRef(0);
  const lastBarcodeSeenRef = useRef("");

  const [phase, setPhase] = useState<ScanPhase>("scanning");
  const [engineReady, setEngineReady] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [torchOn, setTorchOn] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [detectBarcode, setDetectBarcode] = useState(true);
  const [detectPrintedNumber, setDetectPrintedNumber] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState<ScanDeviceInfo | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string | null>(null);
  const desktopCameraStartedRef = useRef(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setCameraActive(false);
  }, []);

  const handleCameraError = useCallback((err: unknown) => {
    const info = toCameraError(err);
    setError(info.message);
    setPhase("scanning");
    setCameraActive(false);
    setCameraStatus("Camera failed — tap Enable camera to retry");
    logScan("lifecycle", "Camera failed", {
      detail: {
        error: info.message,
        needsHttps: info.needsHttps,
        secureContext: window.isSecureContext,
        protocol: window.location.protocol,
        href: window.location.href,
      },
    });
  }, []);

  const frameFromVideo = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || video.readyState < 2) return null;
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    frame.getContext("2d")!.drawImage(video, 0, 0);
    return frame;
  }, []);

  const completeWithResult = useCallback(
    async (scanResult: ScanResult) => {
      stopCamera();
      const beepOk = await playSuccessBeep();
      logScan("scan_complete", "Scan finished — showing results", {
        barcode: scanResult.barcode,
        printedNumber: scanResult.printedNumber,
        matched: scanResult.matched,
        accuracyPercent: scanResult.accuracyPercent,
        processingMs: scanResult.processingMs,
        barcodeDetectionMs: scanResult.barcodeDetectionMs,
        printedDetectionMs: scanResult.printedDetectionMs,
        ocrConfidence: scanResult.ocrConfidence,
        conclusion: scanResult.matched
          ? "Verified match"
          : "Verification incomplete",
        detail: { beepPlayed: beepOk, audioPrimed: isAudioPrimed() },
      });
      setResult(scanResult);
      setPhase("done");
      setStatusHint(null);
    },
    [stopCamera],
  );

  const attachStream = useCallback(
    async (streamPromise: Promise<MediaStream>) => {
      try {
        setCameraStatus("Requesting camera permission…");
        const wantTorch = torchOn && facingMode === "environment";
        const stream = await streamPromise;
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");
          video.muted = true;
          video.srcObject = stream;
          await video.play();
        }

        const track = getVideoTrack(stream);
        if (facingMode === "environment") {
          await preferRearCamera(track);
        }
        const supported = isTorchSupported(track);
        setTorchSupported(supported);
        if (wantTorch && supported && track) {
          await applyTorch(track, true);
        }

        logScan("lifecycle", "Camera started", {
          detail: { facingMode, torchOn: wantTorch, torchSupported: supported },
        });
        setPhase("scanning");
        setError(null);
        setCameraActive(true);
        setCameraStatus(null);
        stableMatchRef.current = 0;
        lastMatchKeyRef.current = "";
        barcodeStableFramesRef.current = 0;
        lastBarcodeSeenRef.current = "";
        attemptRef.current = 0;
      } catch (err) {
        handleCameraError(err);
      }
    },
    [facingMode, torchOn, handleCameraError],
  );

  const startCamera = useCallback(() => {
    stopCamera();
    primeAudio();
    const blocked = getCameraBlockReason();
    if (blocked) {
      handleCameraError(blocked);
      return;
    }
    void attachStream(requestCamera(facingMode));
  }, [facingMode, stopCamera, attachStream, handleCameraError]);

  /** getUserMedia must be the first call in the tap handler on iPhone Safari. */
  const enableCamera = useCallback(() => {
    const blocked = getCameraBlockReason();
    if (blocked) {
      setError(null);
      handleCameraError(blocked);
      return;
    }

    const streamPromise = requestCameraFromGesture(facingMode);

    stopCamera();
    primeAudio();
    setError(null);

    logScan("lifecycle", "Enable camera tapped", {
      detail: {
        facingMode,
        ios: isIOS(),
        secureContext: window.isSecureContext,
        protocol: window.location.protocol,
      },
    });

    void attachStream(streamPromise);
  }, [facingMode, stopCamera, attachStream, handleCameraError]);

  useEffect(() => {
    if (phase !== "scanning") return;
    const track = getVideoTrack(streamRef.current);
    if (facingMode !== "environment" || !torchSupported || !track) return;
    void applyTorch(track, torchOn);
    logScan("lifecycle", torchOn ? "Flash enabled" : "Flash disabled", {
      detail: { torchOn },
    });
  }, [torchOn, torchSupported, facingMode, phase]);

  useEffect(() => {
    let cancelled = false;
    setStatusHint("Loading barcode reader…");

    const onGesture = () => primeAudio();
    window.addEventListener("pointerdown", onGesture, { capture: true });
    window.addEventListener("touchstart", onGesture, {
      capture: true,
      passive: true,
    });

    Promise.all([prepareBarcodeEngine(), preparePrintedOcr()])
      .then(() => {
        if (!cancelled) {
          enginesReadyRef.current = true;
          const device = getScanDeviceInfo();
          setDeviceInfo(device);
          setEngineReady(true);
          setStatusHint(null);
          logScan("lifecycle", "Scanner engines ready", {
            detail: device as unknown as Record<string, unknown>,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Scanner failed to load. Refresh and try again.");
          setPhase("error");
          setStatusHint(null);
        }
      });

    return () => {
      cancelled = true;
      enginesReadyRef.current = false;
      window.removeEventListener("pointerdown", onGesture, { capture: true });
      window.removeEventListener("touchstart", onGesture, { capture: true });
      cancelAnimationFrame(rafRef.current);
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (!engineReady || isMobileDevice()) return;
    if (desktopCameraStartedRef.current) return;
    desktopCameraStartedRef.current = true;
    startCamera();
  }, [engineReady, startCamera]);

  useEffect(() => {
    if (!engineReady || isMobileDevice() || !cameraActive) return;
    startCamera();
  }, [facingMode]);

  useEffect(() => {
    if (phase !== "scanning" || !engineReady) return;

    const tick = (now: number) => {
      if (
        now - lastScanRef.current >= LIVE_SCAN_MS &&
        !scanningRef.current
      ) {
        lastScanRef.current = now;
        const frame = frameFromVideo();
        if (frame) {
          scanningRef.current = true;
          attemptRef.current += 1;
          const aggressive =
            attemptRef.current % AGGRESSIVE_EVERY === 0 ||
            attemptRef.current <= 2;

          if (!detectBarcode && !detectPrintedNumber) {
            setStatusHint("Enable barcode or printed number detection");
            scanningRef.current = false;
            return;
          }

          setStatusHint("Scanning…");
          void scanFrame(frame, {
            aggressiveBarcode: aggressive,
            detectBarcode,
            detectPrintedNumber,
            barcodeStableFrames: barcodeStableFramesRef.current,
          })
            .then((outcome) => {
              if (outcome.status === "idle") {
                setStatusHint("Enable barcode or printed number detection");
                return;
              }

              if (outcome.status === "no_barcode") {
                stableMatchRef.current = 0;
                lastMatchKeyRef.current = "";
                barcodeStableFramesRef.current = 0;
                lastBarcodeSeenRef.current = "";
                setStatusHint(null);
                return;
              }

              if (outcome.status === "barcode_locked") {
                const b = outcome.barcode;
                if (b === lastBarcodeSeenRef.current) {
                  barcodeStableFramesRef.current += 1;
                } else {
                  barcodeStableFramesRef.current = 1;
                  lastBarcodeSeenRef.current = b;
                }
                setStatusHint("Barcode locked — reading number…");
                return;
              }

              if (outcome.status === "no_printed") {
                setStatusHint("Reading printed number… hold steady");
                return;
              }

              if (outcome.status === "barcode_only") {
                setStatusHint("Barcode found — hold steady for printed number");
                return;
              }

              if (outcome.status === "mismatch") {
                setStatusHint("Mismatch — adjust label");
                stableMatchRef.current = 0;
                lastMatchKeyRef.current = "";
                return;
              }

              const verified =
                outcome.status === "verified"
                  ? outcome.scan
                  : {
                      barcode: outcome.printed,
                      printedNumber: outcome.printed,
                      matched: true as const,
                      accuracyPercent: 100,
                      ocrConfidence: 0,
                      barcodeDetectionMs: 0,
                      printedDetectionMs: outcome.printedDetectionMs,
                      processingMs: outcome.printedDetectionMs,
                    };

              const key = `${verified.barcode}|${verified.printedNumber}`;
              if (key === lastMatchKeyRef.current) {
                stableMatchRef.current += 1;
              } else {
                stableMatchRef.current = 1;
                lastMatchKeyRef.current = key;
              }

              if (stableMatchRef.current >= STABLE_MATCHES) {
                void completeWithResult(verifiedScanToResult(verified));
              } else {
                setStatusHint("Match — hold steady…");
                logScan("verification", "Stable match pending", {
                  barcode: verified.barcode,
                  printedNumber: verified.printedNumber,
                  matched: true,
                  detail: {
                    stableCount: stableMatchRef.current,
                    required: STABLE_MATCHES,
                  },
                });
              }
            })
            .catch(() => {
              setStatusHint(null);
            })
            .finally(() => {
              scanningRef.current = false;
            });
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    phase,
    engineReady,
    frameFromVideo,
    completeWithResult,
    detectBarcode,
    detectPrintedNumber,
  ]);

  const reset = () => {
    setResult(null);
    setError(null);
    stableMatchRef.current = 0;
    lastMatchKeyRef.current = "";
    attemptRef.current = 0;
    setPhase("scanning");
    if (isMobileDevice()) {
      stopCamera();
      setCameraStatus(null);
    } else {
      startCamera();
    }
  };

  if (result && phase === "done") {
    return <ResultView result={result} onScanAgain={reset} />;
  }

  const busy = !engineReady || phase === "processing";

  return (
    <div className="scanner">
      {!result && (
        <div className="viewport" onPointerDown={() => primeAudio()}>
          <video ref={videoRef} playsInline muted autoPlay />
          <BarcodeGuide />
          <canvas ref={frameRef} hidden />
          {!cameraActive && (
            <div className="camera-prompt">
              <button type="button" className="primary" onClick={enableCamera}>
                Enable camera
              </button>
              <p>
                {cameraStatus ??
                  (engineReady
                    ? "Tap to open the system camera permission dialog"
                    : "Loading scanner… then tap Enable camera")}
              </p>
              {error && <p className="camera-prompt-error">{error}</p>}
              {!isSecureCameraContext() && (
                <p className="camera-prompt-error">
                  This page is not secure (need https://). Use the https Network
                  URL from your computer.
                </p>
              )}
              {isIPhone() && (
                <ol className="ios-camera-help">
                  <li>
                    Open in <strong>Safari</strong> (not a link preview inside
                    Mail/Slack).
                  </li>
                  <li>
                    URL must start with <strong>https://</strong> — accept the
                    certificate warning if shown.
                  </li>
                  <li>
                    Tap <strong>Enable camera</strong> above — iOS should ask
                    “Allow camera?”
                  </li>
                  <li>
                    If no prompt: Settings → Safari → Camera →{" "}
                    <strong>Allow</strong>, then reload.
                  </li>
                </ol>
              )}
            </div>
          )}
          <div className="guide">
            <p>
              {statusHint ??
                "Place barcode in the orange box — hold steady until capture"}
            </p>
          </div>
        </div>
      )}

      {deviceInfo && (
        <MobileCapabilities
          deviceInfo={deviceInfo}
          torchSupported={torchSupported}
        />
      )}

      <div className="controls controls-detection">
        <button
          type="button"
          className={detectBarcode ? "secondary toggle-on" : "secondary"}
          disabled={busy}
          aria-pressed={detectBarcode}
          onClick={() => {
            primeAudio();
            setDetectBarcode((on) => !on);
            stableMatchRef.current = 0;
            lastMatchKeyRef.current = "";
          }}
        >
          {detectBarcode ? "Barcode on" : "Barcode off"}
        </button>
        <button
          type="button"
          className={detectPrintedNumber ? "secondary toggle-on" : "secondary"}
          disabled={busy}
          aria-pressed={detectPrintedNumber}
          onClick={() => {
            primeAudio();
            setDetectPrintedNumber((on) => !on);
            stableMatchRef.current = 0;
            lastMatchKeyRef.current = "";
          }}
        >
          {detectPrintedNumber ? "Number on" : "Number off"}
        </button>
      </div>

      <div className="controls">
        <button
          type="button"
          className={torchOn ? "secondary torch-on toggle-on" : "secondary"}
          disabled={busy || !torchSupported || facingMode === "user"}
          aria-pressed={torchOn}
          title={
            facingMode === "user"
              ? "Flash works on rear camera only"
              : torchSupported
                ? "Toggle camera flash"
                : "Flash not supported on this device"
          }
          onClick={() => {
            primeAudio();
            setTorchOn((on) => !on);
          }}
        >
          {torchOn ? "Flash on" : "Flash off"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            primeAudio();
            const next =
              facingMode === "environment" ? "user" : "environment";
            setFacingMode(next);
            if (isMobileDevice()) {
              const blocked = getCameraBlockReason();
              if (blocked) {
                handleCameraError(blocked);
                return;
              }
              const streamPromise = requestCameraFromGesture(next);
              stopCamera();
              void attachStream(streamPromise);
            }
          }}
        >
          Flip camera
        </button>
        {onSample && (
          <button
            type="button"
            className="ghost"
            onClick={onSample}
            disabled={busy}
          >
            Try sample label
          </button>
        )}
      </div>

      <p className="hint">
        {torchSupported
          ? "Flash helps scan in low light (rear camera)"
          : "Flash unavailable on this browser — use bright lighting"}
        {" · "}
        Tap once for beep
      </p>
    </div>
  );
}
