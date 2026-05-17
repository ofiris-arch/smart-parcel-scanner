let audioCtx: AudioContext | null = null;
let primed = false;
let beepAudio: HTMLAudioElement | null = null;

function encodeWavMono(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function buildSuccessBeepSamples(sampleRate = 44100): Float32Array {
  const parts: number[] = [];
  const tones: { freq: number; duration: number }[] = [
    { freq: 880, duration: 0.12 },
    { freq: 1174, duration: 0.2 },
  ];
  const gapSamples = Math.floor(sampleRate * 0.12);

  for (let t = 0; t < tones.length; t++) {
    if (t > 0) {
      for (let i = 0; i < gapSamples; i++) parts.push(0);
    }
    const { freq, duration } = tones[t]!;
    const count = Math.floor(sampleRate * duration);
    for (let i = 0; i < count; i++) {
      const time = i / sampleRate;
      const env =
        i < 80 ? i / 80 : i > count - 120 ? (count - i) / 120 : 1;
      parts.push(Math.sin(2 * Math.PI * freq * time) * 0.38 * env);
    }
  }

  return new Float32Array(parts);
}

let beepDataUri: string | null = null;

function getBeepDataUri(): string {
  if (!beepDataUri) {
    const samples = buildSuccessBeepSamples();
    const wav = encodeWavMono(samples, 44100);
    const bytes = new Uint8Array(wav);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    beepDataUri = `data:audio/wav;base64,${btoa(binary)}`;
  }
  return beepDataUri;
}

function getBeepAudio(): HTMLAudioElement {
  if (!beepAudio) {
    beepAudio = new Audio(getBeepDataUri());
    beepAudio.preload = "auto";
  }
  return beepAudio;
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
  gain.gain.exponentialRampToValueAtTime(0.4, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec);
}

function hapticSuccess(): void {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate([60, 40, 100]);
  }
}

/** Unlock audio after a user gesture (required on iOS / Safari). */
export function primeAudio(): void {
  void primeAudioAsync();
}

/** Prefer this inside tap handlers — awaits iOS unlock. */
export async function primeAudioAsync(): Promise<boolean> {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    const ctx = audioCtx;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const el = getBeepAudio();
    el.volume = 0.01;
    try {
      await el.play();
      el.pause();
      el.currentTime = 0;
      el.volume = 1;
      primed = true;
      return true;
    } catch {
      const t0 = ctx.currentTime;
      playTone(ctx, 440, t0, 0.04);
      primed = ctx.state === "running";
      return primed;
    }
  } catch {
    return false;
  }
}

export function isAudioPrimed(): boolean {
  return primed;
}

async function playWithWebAudio(): Promise<boolean> {
  if (!audioCtx) audioCtx = new AudioContext();
  const ctx = audioCtx;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  const t0 = ctx.currentTime;
  playTone(ctx, 880, t0, 0.12);
  playTone(ctx, 1174, t0 + 0.14, 0.2);
  await new Promise((r) => setTimeout(r, 380));
  return ctx.state === "running";
}

/** Success beep + vibration (Android). iOS: turn off Silent switch. */
export async function playSuccessBeep(): Promise<boolean> {
  hapticSuccess();

  const el = getBeepAudio();
  el.volume = 1;
  el.currentTime = 0;

  try {
    await el.play();
    primed = true;
    return true;
  } catch {
    try {
      const ok = await playWithWebAudio();
      primed = ok;
      return ok;
    } catch {
      return false;
    }
  }
}
