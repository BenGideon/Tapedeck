/**
 * Apple-style system sound cues for recording lifecycle events.
 *
 * Design principles (macOS / iOS reference):
 *  - Very short attack (≤ 5ms), exponential decay — never linear.
 *  - 2–3 harmonic partials stacked at falling amplitudes for warmth.
 *  - No sustain — pure attack + decay envelope, like a chime or bell.
 *  - Stereo spread is avoided (mono only) for maximum cross-device compatibility.
 */

let _ctx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") _ctx = new AudioContext();
  return _ctx;
}

/** Resume the context (required after a user gesture on some browsers). */
export function unlockAudio(): void {
  try {
    const ac = ctx();
    if (ac.state === "suspended") void ac.resume();
  } catch {
    // Ignore — context will be created on first sound call.
  }
}

/**
 * Play a single harmonic bell tone.
 * Partials: fundamental + optional 2nd (octave) + 3rd (fifth above octave)
 * Each has an exponential gain envelope — attack → peak → exponential decay.
 */
function chime(
  freq: number,
  startAt: number,
  peakGain: number,
  decaySec: number,
  harmonics: [number, number][] = [[2, 0.35], [3, 0.12]],
) {
  const ac = ctx();
  const partials: [number, number][] = [[1, 1], ...harmonics];

  for (const [ratio, amp] of partials) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    osc.connect(gain);
    gain.connect(ac.destination);

    // Tiny linear attack → exponential decay (bell physics).
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(peakGain * amp, startAt + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + decaySec);

    osc.start(startAt);
    osc.stop(startAt + decaySec + 0.01);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Countdown tick — 3, 2, or 1. Higher pitch, sharper on "1". */
export function playCountdownBeep(n: number): void {
  const ac = ctx();
  if (ac.state === "suspended") void ac.resume();
  const now = ac.currentTime;

  if (n === 1) {
    // "Go" — bright double-ping, like iOS screenshot sound.
    chime(1047, now, 0.28, 0.35, [[2, 0.3], [3, 0.1]]);          // C6
    chime(1319, now + 0.07, 0.18, 0.25, [[2, 0.2]]);              // E6
  } else {
    // Regular tick — muted mid ping.
    chime(n === 3 ? 784 : 880, now, 0.18, 0.22, [[2, 0.25]]);    // G5 / A5
  }
}

/** Recording starts — warm rising two-note chime, AirDrop-accepted character. */
export function playRecordStart(): void {
  const ac = ctx();
  if (ac.state === "suspended") void ac.resume();
  const now = ac.currentTime;
  chime(523.25, now, 0.22, 0.4, [[2, 0.3], [3, 0.1]]);           // C5
  chime(783.99, now + 0.1, 0.26, 0.5, [[2, 0.28], [3, 0.09]]);   // G5
}

/** Recording paused — single muted low note, like a macOS error dismiss. */
export function playRecordPause(): void {
  const ac = ctx();
  if (ac.state === "suspended") void ac.resume();
  chime(440, ac.currentTime, 0.16, 0.28, [[2, 0.2]]);             // A4
}

/** Recording resumed — bright single tap, like macOS lock click. */
export function playRecordResume(): void {
  const ac = ctx();
  if (ac.state === "suspended") void ac.resume();
  const now = ac.currentTime;
  chime(659.25, now, 0.18, 0.22, [[2, 0.25]]);                    // E5
  chime(880, now + 0.08, 0.14, 0.2, [[2, 0.18]]);                 // A5
}

/** Recording stopped — soft descending resolution, like macOS alert dismiss. */
export function playRecordStop(): void {
  const ac = ctx();
  if (ac.state === "suspended") void ac.resume();
  const now = ac.currentTime;
  chime(659.25, now, 0.22, 0.45, [[2, 0.28], [3, 0.1]]);         // E5
  chime(523.25, now + 0.12, 0.18, 0.5, [[2, 0.22], [3, 0.08]]); // C5 — resolves down
}
