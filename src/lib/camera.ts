export type CameraFacing = "environment" | "user";

export interface CameraErrorInfo {
  message: string;
  needsHttps: boolean;
  canRetry: boolean;
}

type GetUserMedia = (
  constraints: MediaStreamConstraints,
) => Promise<MediaStream>;

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isIPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipod/i.test(navigator.userAgent);
}

export function isSecureCameraContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

/** Resolve getUserMedia including legacy WebKit prefixes. */
export function getUserMediaFn(): GetUserMedia | null {
  if (typeof navigator === "undefined") return null;

  if (navigator.mediaDevices?.getUserMedia) {
    return (constraints) => navigator.mediaDevices.getUserMedia(constraints);
  }

  const webkit = (
    navigator as Navigator & {
      webkitGetUserMedia?: (
        c: MediaStreamConstraints,
        ok: (s: MediaStream) => void,
        err: (e: unknown) => void,
      ) => void;
    }
  ).webkitGetUserMedia;

  if (!webkit) return null;

  return (constraints) =>
    new Promise((resolve, reject) => {
      webkit(constraints, resolve, reject);
    });
}

export function getCameraBlockReason(): CameraErrorInfo | null {
  if (typeof navigator === "undefined") {
    return {
      message: "Camera not available in this environment.",
      needsHttps: false,
      canRetry: false,
    };
  }

  if (!getUserMediaFn()) {
    return {
      message:
        "Camera API unavailable. Open the https:// link from your computer (not http://), accept the certificate warning, then tap Enable camera.",
      needsHttps: true,
      canRetry: true,
    };
  }

  if (!isSecureCameraContext()) {
    return {
      message:
        "Camera blocked: use https:// (not http://). In the terminal, copy the Network https:// address, accept the security warning on your phone, then tap Enable camera.",
      needsHttps: true,
      canRetry: true,
    };
  }

  return null;
}

function describeGetUserMediaError(err: unknown): CameraErrorInfo {
  const name = err instanceof DOMException ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      message: isIOS()
        ? "Camera blocked. iPhone: Settings → Safari → Camera → Allow, then reload this page and tap Enable camera again."
        : "Camera permission denied. Allow camera in browser settings, then tap Enable camera again.",
      needsHttps: false,
      canRetry: true,
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      message: "No camera found on this device.",
      needsHttps: false,
      canRetry: true,
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      message:
        "Camera is in use by another app. Close other camera apps and try again.",
      needsHttps: false,
      canRetry: true,
    };
  }
  if (name === "OverconstrainedError") {
    return {
      message: "Camera constraints not supported. Retrying with simpler settings…",
      needsHttps: false,
      canRetry: true,
    };
  }

  return {
    message: msg || "Could not start camera.",
    needsHttps: false,
    canRetry: true,
  };
}

/**
 * Call synchronously from a click/touch handler (required on iOS Safari).
 * Call this as the first line in the handler — before stopCamera(), setState, etc.
 */
export function requestCameraFromGesture(
  _facingMode: CameraFacing,
): Promise<MediaStream> {
  const gum = getUserMediaFn();
  if (!gum) {
    const blocked = getCameraBlockReason();
    throw blocked ?? new Error("Camera unavailable");
  }

  // iPhone: { video: true } is the most reliable way to trigger the permission sheet.
  if (isIOS()) {
    return gum({ video: true, audio: false });
  }

  return gum({
    video: { facingMode: { ideal: _facingMode } },
    audio: false,
  });
}

/** After permission granted on iOS, try to switch to rear camera. */
export async function preferRearCamera(track: MediaStreamTrack | null): Promise<void> {
  if (!track || !isIOS()) return;
  try {
    await track.applyConstraints({
      facingMode: { ideal: "environment" },
    });
  } catch {
    try {
      await track.applyConstraints({ facingMode: "environment" });
    } catch {
      /* keep default camera */
    }
  }
}

/** Request camera with constraint fallbacks (desktop / non-gesture retry). */
export async function requestCamera(
  facingMode: CameraFacing,
): Promise<MediaStream> {
  const blocked = getCameraBlockReason();
  if (blocked) throw blocked;

  const gum = getUserMediaFn()!;

  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    {
      video: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    { video: { facingMode: { ideal: facingMode } }, audio: false },
    { video: { facingMode }, audio: false },
    { video: true, audio: false },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await gum(constraints);
    } catch (e) {
      lastError = e;
    }
  }

  throw describeGetUserMediaError(lastError);
}

export function toCameraError(err: unknown): CameraErrorInfo {
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as CameraErrorInfo).message === "string" &&
    "needsHttps" in err
  ) {
    return err as CameraErrorInfo;
  }
  return describeGetUserMediaError(err);
}
