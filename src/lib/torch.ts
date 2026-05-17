/** Torch / fill-light on rear camera (Chrome Android, some mobile browsers). */
interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

interface TorchConstraints extends MediaTrackConstraintSet {
  torch?: boolean;
}

export function getVideoTrack(
  stream: MediaStream | null,
): MediaStreamTrack | null {
  return stream?.getVideoTracks()[0] ?? null;
}

export function isTorchSupported(track: MediaStreamTrack | null): boolean {
  if (!track?.getCapabilities) return false;
  const caps = track.getCapabilities() as TorchCapabilities;
  return caps.torch === true;
}

export async function applyTorch(
  track: MediaStreamTrack | null,
  on: boolean,
): Promise<boolean> {
  if (!track || !isTorchSupported(track)) return false;

  const constraint: TorchConstraints = { torch: on };

  try {
    await track.applyConstraints(constraint);
    return true;
  } catch {
    try {
      await track.applyConstraints({
        advanced: [constraint],
      });
      return true;
    } catch {
      return false;
    }
  }
}

/** @deprecated Use requestCamera() — torch is applied after stream starts. */
export function videoConstraintsForScan(
  facingMode: "environment" | "user",
  _torchOn: boolean,
): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };
}
