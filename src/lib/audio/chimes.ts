/**
 * Soft chime sound cues for recording lifecycle events.
 * All tones are synthesised with the Web Audio API — no audio files needed.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx || ctx.state === "closed") ctx = new AudioContext();
  return ctx;
}

/** Shape a gain node with a quick attack and smooth release. */
function envelope(
  gainNode: GainNode,
  ac: AudioContext,
  startAt: number,
  peakGain: number,
  attackSec: number,
  decaySec: number,
  sustainGain: number,
  releaseSec: number,
  totalDuration: number,
) {
  const g = gainNode.gain;
  g.setValueAtTime(0, startAt);
  g.linearRampToValueAtTime(peakGain, startAt + attackSec);
  g.linearRampToValueAtTime(sustainGain, startAt + attackSec + decaySec);
  g.setValueAtTime(sustainGain, startAt + totalDuration - releaseSec);
  g.linearRampToValueAtTime(0, startAt + totalDuration);
}

function playTone(
  frequency: number,
  startAt: number,
  duration: number,
  peakGain = 0.22,
  type: OscillatorType = "sine",
) {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  osc.connect(gain);
  gain.connect(ac.destination);

  envelope(gain, ac, startAt, peakGain, 0.008, 0.04, peakGain * 0.6, 0.08, duration);

  osc.start(startAt);
  osc.stop(startAt + duration + 0.01);
}

/** Unlock AudioContext on first user gesture (call once early). */
export function unlockAudio() {
  try {
    getCtx();
  } catch {
    // Ignore — context will be created on first chime.
  }
}

/** 3-2-1 countdown tick. n = 3, 2, or 1. */
export function playCountdownBeep(n: number) {
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  // Higher pitch for earlier counts, punchy double-click feel for "1".
  const freq = n === 1 ? 880 : 660;
  const now = ac.currentTime;
  if (n === 1) {
    playTone(freq, now, 0.18, 0.28);
    playTone(freq * 1.5, now + 0.1, 0.12, 0.18);
  } else {
    playTone(freq, now, 0.15, 0.2);
  }
}

/** Soft rising two-note chime — recording has started. */
export function playRecordStart() {
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  const now = ac.currentTime;
  playTone(523.25, now, 0.18, 0.18);        // C5
  playTone(783.99, now + 0.13, 0.22, 0.22); // G5
}

/** Muted single low note — recording paused. */
export function playRecordPause() {
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  playTone(392, ac.currentTime, 0.22, 0.16); // G4
}

/** Bright two-note ascending — recording resumed. */
export function playRecordResume() {
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  const now = ac.currentTime;
  playTone(440, now, 0.14, 0.15);           // A4
  playTone(659.25, now + 0.1, 0.18, 0.2);  // E5
}

/** Gentle falling two-note — recording stopped. */
export function playRecordStop() {
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  const now = ac.currentTime;
  playTone(659.25, now, 0.18, 0.2);         // E5
  playTone(392, now + 0.14, 0.22, 0.18);   // G4
}
