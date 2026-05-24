import { useCallback, useEffect, useRef, useState } from "react";
import { prepareBarcodeEngine, type BarcodeDecodeResult } from "../lib/barcode";
import { getScanDeviceInfo, type ScanDeviceInfo } from "../lib/deviceInfo";
import { preparePrintedOcr } from "../lib/printedOcr";
import { logScan } from "../lib/scanLogger";
import {
  isAudioPrimed,
  playSuccessBeep,
  primeAudio,
  primeAudioAsync,
} from "../lib/sound";
import {
  getCameraBlockReason,
  isIOS,
  isIPhone,
  isMobileDevice,
  isSecureCameraContext,
  requestCamera,
  requestCameraFromGesture,
  toCameraError,
  type CameraRequest,
} from "../lib/camera";
import {
  enumerateVideoCameras,
  isRearCamera,
  nextCameraInList,
  pickDefaultRearCamera,
  type VideoCameraDevice,
} from "../lib/cameraDevices";
import {
  applyTorch,
  getVideoTrack,
  isTorchSupported,
} from "../lib/torch";
import { runPipelinedScan } from "../lib/scanPipeline";
import {
  burstFailureToResult,
  captureFrameFromVideo,
} from "../lib/burstScan";
import { decodeBarcodeFromFrame } from "../lib/decodeFrame";
import { BarcodeStabilityTracker } from "../lib/previewBarcode";
import { SCAN_CONFIG } from "../lib/scanConfig";
import {
  loadCameraSettings,
  readActiveVideoInfo,
  type ActiveVideoInfo,
  type CameraSettings,
} from "../lib/cameraSettings";
import { verifiedScanToResult } from "../lib/verifyScan";
import type { ScanPhase, ScanResult } from "../lib/types";
import { BarcodeGuide } from "./BarcodeGuide";
import { CameraSettingsPanel } from "./CameraSettingsPanel";
import { MobileCapabilities } from "./MobileCapabilities";
import { ResultView } from "./ResultView";

interface ScannerProps {
  onSample?: () => void;
}

export function Scanner({ onSample }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const burstInProgressRef = useRef(false);
  const enginesReadyRef = useRef(false);
  const stabilityTrackerRef = useRef(new BarcodeStabilityTracker());
  const captureCooldownUntilRef = useRef(0);
  const runBurstCaptureRef = useRef<
    (lock: BarcodeDecodeResult) => Promise<void>
  >(async () => {});
  const lockedBarcodeRef = useRef<BarcodeDecodeResult | null>(null);
  const cameraSettingsRef = useRef(loadCameraSettings());

  const [phase, setPhase] = useState<ScanPhase>("scanning");
  const [engineReady, setEngineReady] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<VideoCameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [torchOn, setTorchOn] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [detectBarcode, setDetectBarcode] = useState(true);
  const [detectPrintedNumber, setDetectPrintedNumber] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState<ScanDeviceInfo | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(() =>
    loadCameraSettings(),
  );
  const [activeVideo, setActiveVideo] = useState<ActiveVideoInfo | null>(null);
  const desktopCameraStartedRef = useRef(false);

  cameraSettingsRef.current = cameraSettings;

  const withCameraSettings = useCallback(
    (request: CameraRequest = {}): CameraRequest => ({
      ...request,
      settings: cameraSettingsRef.current,
    }),
    [],
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setCameraActive(false);
    setActiveVideo(null);
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

  const completeWithResult = useCallback(
    async (scanResult: ScanResult, options?: { playBeep?: boolean }) => {
      stopCamera();
      const playBeep = options?.playBeep !== false && scanResult.matched === true;
      if (playBeep) {
        setSuccessFlash(true);
        window.setTimeout(() => setSuccessFlash(false), 450);
      }
      const beepOk = playBeep ? await playSuccessBeep() : false;
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

  const refreshCameraList = useCallback(async () => {
    const list = await enumerateVideoCameras();
    setCameras(list);
    return list;
  }, []);

  const activeCamera = cameras.find((c) => c.deviceId === selectedDeviceId);
  const rearActive = activeCamera ? isRearCamera(activeCamera) : true;

  const attachStream = useCallback(
    async (
      streamPromise: Promise<MediaStream>,
      request: CameraRequest = {},
    ) => {
      try {
        setCameraStatus("Requesting camera permission…");
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
        const settings = track?.getSettings();
        const activeId = settings?.deviceId ?? request.deviceId ?? "";
        if (activeId) setSelectedDeviceId(activeId);
        setActiveVideo(readActiveVideoInfo(track));

        const list = await refreshCameraList();
        const matched = list.find((c) => c.deviceId === activeId);
        const wantTorch =
          torchOn && (matched ? isRearCamera(matched) : true);

        const supported = isTorchSupported(track);
        setTorchSupported(supported);
        if (wantTorch && supported && track) {
          await applyTorch(track, true);
        }

        logScan("lifecycle", "Camera started", {
          detail: {
            deviceId: activeId,
            label: matched?.label,
            cameraCount: list.length,
            torchOn: wantTorch,
            torchSupported: supported,
            video: readActiveVideoInfo(track),
            cameraSettings: cameraSettingsRef.current,
          },
        });
        setPhase("scanning");
        setError(null);
        setCameraActive(true);
        setCameraStatus(null);
      } catch (err) {
        handleCameraError(err);
      }
    },
    [torchOn, handleCameraError, refreshCameraList],
  );

  const startCamera = useCallback(
    (request: CameraRequest = {}) => {
      stopCamera();
      primeAudio();
      const blocked = getCameraBlockReason();
      if (blocked) {
        handleCameraError(blocked);
        return;
      }
      void attachStream(requestCamera(withCameraSettings(request)), request);
    },
    [stopCamera, attachStream, handleCameraError, withCameraSettings],
  );

  /** getUserMedia must be the first call in the tap handler on iPhone Safari. */
  const enableCamera = useCallback(() => {
    const blocked = getCameraBlockReason();
    if (blocked) {
      setError(null);
      handleCameraError(blocked);
      return;
    }

    const request = withCameraSettings(
      selectedDeviceId
        ? { deviceId: selectedDeviceId }
        : { facingMode: "environment" },
    );

    const streamPromise = requestCameraFromGesture(request);

    stopCamera();
    void primeAudioAsync().then((ok) => setSoundReady(ok || isAudioPrimed()));
    setError(null);

    logScan("lifecycle", "Enable camera tapped", {
      detail: {
        request,
        ios: isIOS(),
        secureContext: window.isSecureContext,
        protocol: window.location.protocol,
      },
    });

    void attachStream(streamPromise, request);
  }, [selectedDeviceId, stopCamera, attachStream, handleCameraError, withCameraSettings]);

  /** Switch camera — getUserMedia first (iOS gesture). */
  const switchToCamera = useCallback(
    (deviceId: string) => {
      const blocked = getCameraBlockReason();
      if (blocked) {
        handleCameraError(blocked);
        return;
      }

      const request = withCameraSettings({ deviceId });
      const streamPromise = requestCameraFromGesture(request);

      stopCamera();
      primeAudio();
      setSelectedDeviceId(deviceId);

      logScan("lifecycle", "Camera switched", {
        detail: { deviceId },
      });

      void attachStream(streamPromise, request);
    },
    [stopCamera, attachStream, handleCameraError, withCameraSettings],
  );

  const applyCameraSettings = useCallback(() => {
    const blocked = getCameraBlockReason();
    if (blocked) {
      handleCameraError(blocked);
      return;
    }

    primeAudio();
    const request = withCameraSettings(
      selectedDeviceId
        ? { deviceId: selectedDeviceId }
        : { facingMode: "environment" },
    );

    stopCamera();
    if (isMobileDevice()) {
      void attachStream(requestCameraFromGesture(request), request);
    } else {
      void attachStream(requestCamera(request), request);
    }
  }, [
    selectedDeviceId,
    stopCamera,
    attachStream,
    handleCameraError,
    withCameraSettings,
  ]);

  const cycleCamera = useCallback(() => {
    const next = nextCameraInList(cameras, selectedDeviceId);
    if (next) switchToCamera(next.deviceId);
  }, [cameras, selectedDeviceId, switchToCamera]);

  useEffect(() => {
    if (phase !== "scanning") return;
    const track = getVideoTrack(streamRef.current);
    if (!rearActive || !torchSupported || !track) return;
    void applyTorch(track, torchOn);
    logScan("lifecycle", torchOn ? "Flash enabled" : "Flash disabled", {
      detail: { torchOn },
    });
  }, [torchOn, torchSupported, rearActive, phase]);

  useEffect(() => {
    if (!cameraActive) return;
    const onDeviceChange = () => {
      void refreshCameraList();
    };
    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        onDeviceChange,
      );
    };
  }, [cameraActive, refreshCameraList]);

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
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (!engineReady || isMobileDevice()) return;
    if (desktopCameraStartedRef.current) return;
    desktopCameraStartedRef.current = true;
    void refreshCameraList().then((list) => {
      const rear = pickDefaultRearCamera(list);
      startCamera(rear ? { deviceId: rear.deviceId } : { facingMode: "environment" });
    });
  }, [engineReady, startCamera, refreshCameraList]);

  const runBurstCapture = useCallback(
    async (lock: BarcodeDecodeResult) => {
    if (burstInProgressRef.current || !cameraActive) return;
    const video = videoRef.current;
    if (!video) return;

    burstInProgressRef.current = true;
    stabilityTrackerRef.current.reset();
    lockedBarcodeRef.current = lock;
    setPhase("processing");
    const started = performance.now();

    try {
      const burst = await runPipelinedScan(
        video,
        { barcode: lock, triggerFrame: undefined },
        {
          detectPrintedNumber,
          onStatus: setStatusHint,
        },
      );

      stopCamera();

      const processingMs = Math.round(performance.now() - started);

      if (burst.ok && burst.scan) {
        logScan("verification", "Burst capture verified", {
          barcode: burst.scan.barcode,
          printedNumber: burst.scan.printedNumber,
          matched: true,
          detail: {
            votes: burst.votes,
            framesAnalyzed: burst.framesAnalyzed,
            pipelined: true,
          },
          conclusion: "Verified match (pipelined)",
        });
        const result = verifiedScanToResult(burst.scan);
        result.processingMs = processingMs;
        await completeWithResult(result, { playBeep: true });
      } else {
        logScan("verification", "Burst capture could not verify", {
          barcode: burst.debug?.barcode,
          printedNumber: burst.debug?.printed ?? undefined,
          matched: false,
          detail: { framesAnalyzed: burst.framesAnalyzed, statuses: burst.debug?.statuses },
          conclusion: burst.reason ?? "no_consensus",
        });
        await completeWithResult(burstFailureToResult(burst, processingMs), {
          playBeep: false,
        });
      }
    } catch {
      stopCamera();
      setPhase("scanning");
      setStatusHint(null);
    } finally {
      burstInProgressRef.current = false;
      captureCooldownUntilRef.current =
        Date.now() + SCAN_CONFIG.captureCooldownMs;
    }
  },
    [
    cameraActive,
    detectPrintedNumber,
    completeWithResult,
    stopCamera,
  ]);

  runBurstCaptureRef.current = runBurstCapture;

  useEffect(() => {
    if (phase !== "scanning" || !cameraActive || !engineReady || !detectBarcode) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (
        cancelled ||
        inFlight ||
        burstInProgressRef.current ||
        Date.now() < captureCooldownUntilRef.current
      ) {
        return;
      }

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      inFlight = true;
      try {
        const frame = captureFrameFromVideo(video);
        if (!frame || cancelled) return;

        const hit = await decodeBarcodeFromFrame(frame, { aggressive: false });
        if (cancelled || burstInProgressRef.current) return;

        const state = stabilityTrackerRef.current.note(hit?.value);
        if (state.value) {
          if (state.stable && hit) {
            cancelled = true;
            stabilityTrackerRef.current.reset();
            setStatusHint("Barcode locked — capturing…");
            void runBurstCaptureRef.current(hit);
          } else if (state.streak === 1) {
            setStatusHint(`Barcode seen — hold steady (${state.value})`);
          }
        } else if (!burstInProgressRef.current) {
          setStatusHint(null);
        }
      } finally {
        inFlight = false;
      }
    };

    const id = window.setInterval(
      () => void tick(),
      SCAN_CONFIG.previewScanIntervalMs,
    );

    return () => {
      cancelled = true;
      window.clearInterval(id);
      stabilityTrackerRef.current.reset();
    };
  }, [phase, cameraActive, engineReady, detectBarcode]);

  const reset = () => {
    setResult(null);
    setError(null);
    setStatusHint(null);
    stabilityTrackerRef.current.reset();
    captureCooldownUntilRef.current = 0;
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
        <div
          className={`viewport${successFlash ? " viewport--success" : ""}`}
          onPointerDown={() => {
            void primeAudioAsync().then((ok) =>
              setSoundReady(ok || isAudioPrimed()),
            );
          }}
        >
          <video ref={videoRef} playsInline muted autoPlay />
          <BarcodeGuide />
          {phase === "processing" && (
            <div className="processing-overlay" aria-live="polite">
              <div className="processing-spinner" aria-hidden />
              <p>{statusHint ?? "Processing…"}</p>
            </div>
          )}
          <canvas ref={frameRef} hidden />
          {!cameraActive && phase !== "processing" && (
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
                (detectBarcode
                  ? "Align barcode in the box — auto-captures when clear"
                  : "Turn on Barcode to scan")}
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

      <CameraSettingsPanel
        settings={cameraSettings}
        activeVideo={activeVideo}
        disabled={busy}
        onChange={setCameraSettings}
        onApply={applyCameraSettings}
      />

      <div className="controls controls-detection">
        <button
          type="button"
          className={detectBarcode ? "secondary toggle-on" : "secondary"}
          disabled={busy}
          aria-pressed={detectBarcode}
          onClick={() => {
            primeAudio();
            setDetectBarcode((on) => !on);
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
          }}
        >
          {detectPrintedNumber ? "Number on" : "Number off"}
        </button>
      </div>

      <div className="controls">
        <button
          type="button"
          className={torchOn ? "secondary torch-on toggle-on" : "secondary"}
          disabled={busy || !torchSupported || !rearActive}
          aria-pressed={torchOn}
          title={
            !rearActive
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
        <label className="camera-select">
          <span className="camera-select-label">Camera</span>
          <select
            value={selectedDeviceId}
            disabled={busy || !cameraActive || cameras.length === 0}
            onChange={(e) => {
              primeAudio();
              switchToCamera(e.target.value);
            }}
          >
            {cameras.length === 0 ? (
              <option value="">No cameras listed</option>
            ) : (
              cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label}
                </option>
              ))
            )}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          disabled={busy || !cameraActive || cameras.length < 2}
          onClick={() => {
            primeAudio();
            cycleCamera();
          }}
        >
          Next camera
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
        {soundReady
          ? "Beep ready"
          : isIPhone()
            ? "Tap Enable camera for beep (turn off Silent switch)"
            : "Tap once for beep"}
      </p>
    </div>
  );
}
