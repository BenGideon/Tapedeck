/**
 * Background Noise Filter — lightweight, dependency-free DSP that runs
 * identically at export time and in the A/B preview:
 *
 *   1. High-pass biquad (~90 Hz) removes rumble, fan and AC hum energy.
 *   2. A soft downward expander (noise gate with smooth ratio) attenuates
 *      quiet steady background noise between speech.
 *
 * Honest scope: this reduces steady low-level noise. It is not AI noise
 * removal and is presented in the UI as "reduce", never "remove".
 */

export interface ChannelState {
  // Biquad state (direct form II transposed)
  z1: number;
  z2: number;
  // Envelope follower
  envelope: number;
  // Current gate gain, smoothed
  gain: number;
}

export interface NoiseFilterState {
  sampleRate: number;
  coeffs: { b0: number; b1: number; b2: number; a1: number; a2: number };
  channels: ChannelState[];
  attackCoeff: number;
  releaseCoeff: number;
  gainAttack: number;
  gainRelease: number;
}

const HIGHPASS_HZ = 90;
const GATE_THRESHOLD = 0.012; // linear amplitude ≈ -38 dBFS
const GATE_FLOOR = 0.25; // minimum gain (≈ -12 dB) — reduction, not removal

export function createNoiseFilterState(sampleRate: number): NoiseFilterState {
  // RBJ high-pass, Q = 0.707
  const w0 = (2 * Math.PI * HIGHPASS_HZ) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2 * 2);
  const a0 = 1 + alpha;
  const coeffs = {
    b0: (1 + cosW0) / 2 / a0,
    b1: -(1 + cosW0) / a0,
    b2: (1 + cosW0) / 2 / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  };
  const timeConstant = (ms: number) => Math.exp(-1 / ((ms / 1000) * sampleRate));
  return {
    sampleRate,
    coeffs,
    channels: [],
    attackCoeff: timeConstant(5),
    releaseCoeff: timeConstant(120),
    gainAttack: timeConstant(8),
    gainRelease: timeConstant(60),
  };
}

function channelState(state: NoiseFilterState, index: number): ChannelState {
  while (state.channels.length <= index) {
    state.channels.push({ z1: 0, z2: 0, envelope: 0, gain: 1 });
  }
  return state.channels[index];
}

/** Process one Float32 block in place. */
export function processChannel(
  state: NoiseFilterState,
  channelIndex: number,
  data: Float32Array,
): void {
  const ch = channelState(state, channelIndex);
  const { b0, b1, b2, a1, a2 } = state.coeffs;
  for (let i = 0; i < data.length; i++) {
    // High-pass biquad
    const x = data[i];
    const y = b0 * x + ch.z1;
    ch.z1 = b1 * x - a1 * y + ch.z2;
    ch.z2 = b2 * x - a2 * y;

    // Envelope follower on the filtered signal
    const magnitude = Math.abs(y);
    const envCoeff = magnitude > ch.envelope ? state.attackCoeff : state.releaseCoeff;
    ch.envelope = envCoeff * ch.envelope + (1 - envCoeff) * magnitude;

    // Soft downward expansion below the threshold
    let targetGain = 1;
    if (ch.envelope < GATE_THRESHOLD) {
      const ratio = ch.envelope / GATE_THRESHOLD;
      targetGain = Math.max(GATE_FLOOR, ratio * ratio);
    }
    const gainCoeff = targetGain < ch.gain ? state.gainAttack : state.gainRelease;
    ch.gain = gainCoeff * ch.gain + (1 - gainCoeff) * targetGain;

    data[i] = y * ch.gain;
  }
}

type MediabunnyModule = typeof import("mediabunny");
type AudioSampleType = import("mediabunny").AudioSample;

/** Apply the filter to a mediabunny AudioSample, returning a new sample.
 * Samples must be fed sequentially (state is carried across blocks). */
export function processNoiseBlock(
  sample: AudioSampleType,
  state: NoiseFilterState,
  mb: MediabunnyModule,
): AudioSampleType {
  const { numberOfChannels, numberOfFrames, sampleRate, timestamp } = sample;
  const interleaved = new Float32Array(numberOfFrames * numberOfChannels);
  sample.copyTo(interleaved, { planeIndex: 0, format: "f32" });

  if (numberOfChannels === 1) {
    processChannel(state, 0, interleaved);
  } else {
    // De-interleave, process per channel, re-interleave.
    for (let c = 0; c < numberOfChannels; c++) {
      const channel = new Float32Array(numberOfFrames);
      for (let i = 0; i < numberOfFrames; i++) channel[i] = interleaved[i * numberOfChannels + c];
      processChannel(state, c, channel);
      for (let i = 0; i < numberOfFrames; i++) interleaved[i * numberOfChannels + c] = channel[i];
    }
  }

  return new mb.AudioSample({
    data: interleaved,
    format: "f32",
    numberOfChannels,
    sampleRate,
    timestamp,
  });
}

/** Offline-process an AudioBuffer copy for the A/B preview snippet. */
export function processAudioBufferCopy(buffer: AudioBuffer): AudioBuffer {
  const state = createNoiseFilterState(buffer.sampleRate);
  const context = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const copy = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = new Float32Array(buffer.length);
    buffer.copyFromChannel(data, c);
    processChannel(state, c, data);
    copy.copyToChannel(data, c);
  }
  return copy;
}
