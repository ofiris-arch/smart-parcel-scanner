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

/** Bell partials — wallet-style ascending chime (not Apple's proprietary audio). */
function paymentBellSample(
  freq: number,
  timeSec: number,
  durationSec: number,
): number {
  if (timeSec < 0 || timeSec > durationSec) return 0;
  const attack = Math.min(1, timeSec / 0.003);
  const decay = Math.exp(-timeSec * 14);
  const env = attack * decay;
  const f = 2 * Math.PI * freq * timeSec;
  const tone =
    Math.sin(f) +
    0.32 * Math.sin(f * 2) +
    0.12 * Math.sin(f * 3) +
    0.06 * Math.sin(f * 4.2);
  return tone * env * 0.36;
}

/** Three quick ascending notes similar to mobile wallet “payment approved” chimes. */
function buildSuccessBeepSamples(sampleRate = 44100): Float32Array {
  const notes = [
    { freq: 1046.5, duration: 0.052, start: 0 },
    { freq: 1318.51, duration: 0.052, start: 0.058 },
    { freq: 1567.98, duration: 0.13, start: 0.116 },
  ];
  const totalSec = 0.28;
  const length = Math.ceil(sampleRate * totalSec);
  const out = new Float32Array(length);

  for (const note of notes) {
    const startIdx = Math.floor(note.start * sampleRate);
    const count = Math.floor(note.duration * sampleRate);
    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      if (idx >= length) break;
      const t = i / sampleRate;
      out[idx]! += paymentBellSample(note.freq, t, note.duration);
    }
  }

  let peak = 0;
  for (const s of out) peak = Math.max(peak, Math.abs(s));
  if (peak > 0) {
    for (let i = 0; i < out.length; i++) {
      out[i] = (out[i]! / peak) * 0.9;
    }
  }

  return out;
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
  const uri = getBeepDataUri();
  if (!beepAudio || beepAudio.src !== uri) {
    beepAudio = new Audio(uri);
    beepAudio.preload = "auto";
  }
  return beepAudio;
}

function playPaymentNote(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  durationSec: number,
): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.45, startAt + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
  gain.connect(ctx.destination);

  for (const mult of [1, 2, 3]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency * mult;
    const partialGain = ctx.createGain();
    partialGain.gain.value = mult === 1 ? 1 : mult === 2 ? 0.28 : 0.12;
    osc.connect(partialGain);
    partialGain.connect(gain);
    osc.start(startAt);
    osc.stop(startAt + durationSec);
  }
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
      playPaymentNote(ctx, 1046.5, t0, 0.04);
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
  playPaymentNote(ctx, 1046.5, t0, 0.052);
  playPaymentNote(ctx, 1318.51, t0 + 0.058, 0.052);
  playPaymentNote(ctx, 1567.98, t0 + 0.116, 0.13);
  await new Promise((r) => setTimeout(r, 320));
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
