let audioCtx: AudioContext | null = null;
let primed = false;

/** Unlock audio after a user gesture (required on iOS / Safari). */
export function primeAudio(): void {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    void audioCtx.resume().then(() => {
      primed = audioCtx?.state === "running";
    });
  } catch {
    /* ignore */
  }
}

export function isAudioPrimed(): boolean {
  return primed && audioCtx?.state === "running";
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  durationSec: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec);
}

/** Success beep + short vibration when available. */
export async function playSuccessBeep(): Promise<boolean> {
  primeAudio();

  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const t0 = ctx.currentTime;
    playTone(ctx, 880, t0, 0.12);
    playTone(ctx, 1174, t0 + 0.14, 0.18);

    primed = ctx.state === "running";

    if (typeof navigator.vibrate === "function") {
      navigator.vibrate([60, 40, 100]);
    }

    await new Promise((r) => setTimeout(r, 380));
    return ctx.state === "running";
  } catch {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate([80, 50, 120]);
    }
    return false;
  }
}
