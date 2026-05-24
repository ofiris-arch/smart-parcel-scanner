export type ResolutionPreset =
  | "auto"
  | "hd720"
  | "fhd1080"
  | "max"
  | "photo4k";

export type FrameRatePreset = "auto" | "30" | "60";

export type FocusModePreset = "continuous" | "single-shot";

export interface CameraSettings {
  resolution: ResolutionPreset;
  frameRate: FrameRatePreset;
  focusMode: FocusModePreset;
}

export interface ResolutionPresetInfo {
  label: string;
  width?: number;
  height?: number;
}

export const RESOLUTION_PRESETS: Record<
  ResolutionPreset,
  ResolutionPresetInfo
> = {
  auto: { label: "Auto (browser default)" },
  hd720: { label: "HD 1280×720", width: 1280, height: 720 },
  fhd1080: { label: "Full HD 1920×1080", width: 1920, height: 1080 },
  max: { label: "Maximum (highest available)", width: 3840, height: 2160 },
  photo4k: { label: "4K / photo 4032×3024", width: 4032, height: 3024 },
};

export const FRAME_RATE_OPTIONS: { value: FrameRatePreset; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "30", label: "30 fps" },
  { value: "60", label: "60 fps" },
];

export const FOCUS_MODE_OPTIONS: { value: FocusModePreset; label: string }[] =
  [
    { value: "continuous", label: "Continuous (video)" },
    { value: "single-shot", label: "Single shot (macro / still)" },
  ];

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  resolution: "max",
  frameRate: "auto",
  focusMode: "continuous",
};

const STORAGE_KEY = "parcel-scanner-camera-settings";

export function loadCameraSettings(): CameraSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_CAMERA_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CAMERA_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CameraSettings>;
    return {
      resolution: parsed.resolution ?? DEFAULT_CAMERA_SETTINGS.resolution,
      frameRate: parsed.frameRate ?? DEFAULT_CAMERA_SETTINGS.frameRate,
      focusMode: parsed.focusMode ?? DEFAULT_CAMERA_SETTINGS.focusMode,
    };
  } catch {
    return { ...DEFAULT_CAMERA_SETTINGS };
  }
}

export function saveCameraSettings(settings: CameraSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export interface ActiveVideoInfo {
  width: number;
  height: number;
  frameRate?: number;
  facingMode?: string;
  deviceId?: string;
}

export function readActiveVideoInfo(
  track: MediaStreamTrack | null,
): ActiveVideoInfo | null {
  if (!track?.getSettings) return null;
  const s = track.getSettings();
  const width = s.width ?? 0;
  const height = s.height ?? 0;
  if (!width || !height) return null;
  return {
    width,
    height,
    frameRate: s.frameRate,
    facingMode: s.facingMode,
    deviceId: s.deviceId,
  };
}

export function formatVideoInfo(info: ActiveVideoInfo | null): string {
  if (!info) return "—";
  const fps =
    info.frameRate != null ? ` @ ${Math.round(info.frameRate)} fps` : "";
  return `${info.width}×${info.height}${fps}`;
}

/** Build getUserMedia video constraints from saved settings. */
export function buildVideoConstraints(
  settings: CameraSettings,
  req: { deviceId?: string; facingMode?: "environment" | "user" } = {},
  options?: { exactDevice?: boolean },
): MediaTrackConstraints {
  const video: MediaTrackConstraints = {};
  const preset = RESOLUTION_PRESETS[settings.resolution];

  if (req.deviceId) {
    video.deviceId = options?.exactDevice
      ? { exact: req.deviceId }
      : { ideal: req.deviceId };
  } else if (req.facingMode) {
    video.facingMode = { ideal: req.facingMode };
  }

  if (preset.width && preset.height) {
    if (settings.resolution === "max" || settings.resolution === "photo4k") {
      video.width = { ideal: preset.width, min: 1280 };
      video.height = { ideal: preset.height, min: 720 };
    } else {
      video.width = { ideal: preset.width };
      video.height = { ideal: preset.height };
    }
  }

  if (settings.frameRate !== "auto") {
    video.frameRate = { ideal: Number(settings.frameRate) };
  }

  (video as MediaTrackConstraints & { focusMode?: ConstrainDOMString }).focusMode =
    { ideal: settings.focusMode };

  return video;
}

/** Fallback attempts when the browser rejects ideal constraints. */
export function buildCameraConstraintAttempts(
  settings: CameraSettings,
  req: { deviceId?: string; facingMode?: "environment" | "user" },
): MediaStreamConstraints[] {
  const facing = req.facingMode ?? "environment";
  const attempts: MediaStreamConstraints[] = [];

  if (req.deviceId) {
    attempts.push({
      video: buildVideoConstraints(settings, req, { exactDevice: true }),
      audio: false,
    });
  }

  attempts.push({
    video: buildVideoConstraints(settings, req),
    audio: false,
  });

  if (settings.resolution !== "auto") {
    attempts.push({
      video: buildVideoConstraints(
        { ...settings, resolution: "fhd1080" },
        req,
      ),
      audio: false,
    });
    attempts.push({
      video: buildVideoConstraints({ ...settings, resolution: "hd720" }, req),
      audio: false,
    });
  }

  attempts.push(
    {
      video: req.deviceId
        ? { deviceId: { ideal: req.deviceId } }
        : { facingMode: { ideal: facing } },
      audio: false,
    },
    { video: { facingMode: { ideal: facing } }, audio: false },
    { video: true, audio: false },
  );

  return attempts;
}
