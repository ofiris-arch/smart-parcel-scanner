export interface VideoCameraDevice {
  deviceId: string;
  label: string;
  /** Best guess for UI grouping */
  group: "front" | "back" | "other";
}

function classifyCameraLabel(label: string): VideoCameraDevice["group"] {
  const l = label.toLowerCase();
  if (
    l.includes("front") ||
    l.includes("facetime") ||
    l.includes("selfie") ||
    l.includes("user")
  ) {
    return "front";
  }
  if (
    l.includes("back") ||
    l.includes("rear") ||
    l.includes("environment") ||
    l.includes("wide") ||
    l.includes("telephoto") ||
    l.includes("ultra")
  ) {
    return "back";
  }
  return "other";
}

export function isRearCamera(device: VideoCameraDevice): boolean {
  return device.group === "back";
}

export async function enumerateVideoCameras(): Promise<VideoCameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  const raw = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = raw.filter((d) => d.kind === "videoinput");

  return videoInputs.map((d, i) => {
    const label = d.label.trim() || `Camera ${i + 1}`;
    return {
      deviceId: d.deviceId,
      label,
      group: classifyCameraLabel(label),
    };
  });
}

export function pickDefaultRearCamera(
  cameras: VideoCameraDevice[],
): VideoCameraDevice | null {
  const backs = cameras.filter((c) => c.group === "back");
  if (backs.length === 0) return cameras[0] ?? null;

  const main = backs.find(
    (c) =>
      /^back camera$/i.test(c.label.trim()) ||
      (/back/i.test(c.label) &&
        !/ultra|telephoto|dual|triple|depth|zoom|wide/i.test(c.label)),
  );
  return main ?? backs[0];
}

export function nextCameraInList(
  cameras: VideoCameraDevice[],
  currentId: string,
): VideoCameraDevice | null {
  if (cameras.length < 2) return null;
  const idx = cameras.findIndex((c) => c.deviceId === currentId);
  const next = idx < 0 ? 0 : (idx + 1) % cameras.length;
  return cameras[next] ?? null;
}
