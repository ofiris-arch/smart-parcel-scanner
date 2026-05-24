import {
  FOCUS_MODE_OPTIONS,
  FRAME_RATE_OPTIONS,
  formatVideoInfo,
  RESOLUTION_PRESETS,
  saveCameraSettings,
  type ActiveVideoInfo,
  type CameraSettings,
  type FocusModePreset,
  type FrameRatePreset,
  type ResolutionPreset,
} from "../lib/cameraSettings";

interface CameraSettingsPanelProps {
  settings: CameraSettings;
  activeVideo: ActiveVideoInfo | null;
  disabled?: boolean;
  onChange: (settings: CameraSettings) => void;
  onApply: () => void;
}

export function CameraSettingsPanel({
  settings,
  activeVideo,
  disabled,
  onChange,
  onApply,
}: CameraSettingsPanelProps) {
  const patch = (partial: Partial<CameraSettings>) => {
    const next = { ...settings, ...partial };
    onChange(next);
    saveCameraSettings(next);
  };

  return (
    <section className="camera-settings" aria-labelledby="camera-settings-title">
      <h2 id="camera-settings-title" className="camera-settings-title">
        Camera settings
      </h2>

      <label className="camera-settings-field">
        <span>Resolution</span>
        <select
          value={settings.resolution}
          disabled={disabled}
          onChange={(e) =>
            patch({ resolution: e.target.value as ResolutionPreset })
          }
        >
          {(Object.keys(RESOLUTION_PRESETS) as ResolutionPreset[]).map(
            (key) => (
              <option key={key} value={key}>
                {RESOLUTION_PRESETS[key].label}
              </option>
            ),
          )}
        </select>
      </label>

      <label className="camera-settings-field">
        <span>Frame rate</span>
        <select
          value={settings.frameRate}
          disabled={disabled}
          onChange={(e) =>
            patch({ frameRate: e.target.value as FrameRatePreset })
          }
        >
          {FRAME_RATE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="camera-settings-field">
        <span>Focus</span>
        <select
          value={settings.focusMode}
          disabled={disabled}
          onChange={(e) =>
            patch({ focusMode: e.target.value as FocusModePreset })
          }
        >
          {FOCUS_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <p className="camera-settings-active">
        Active stream: <strong>{formatVideoInfo(activeVideo)}</strong>
      </p>

      <button
        type="button"
        className="secondary camera-settings-apply"
        disabled={disabled}
        onClick={onApply}
      >
        Apply &amp; restart camera
      </button>
    </section>
  );
}
