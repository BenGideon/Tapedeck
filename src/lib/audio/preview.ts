import { processAudioBufferCopy } from "./noiseDsp";

/**
 * A/B preview for the Background Noise Filter: pulls a short audio snippet
 * from the recording, optionally runs it through the exact export DSP, and
 * plays it. Uses the same code path as export, so the preview is honest.
 */

let activeContext: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;

export const SNIPPET_SECONDS = 6;

export async function extractSnippet(blob: Blob, startSec: number): Promise<AudioBuffer | null> {
  const { Input, BlobSource, ALL_FORMATS, AudioBufferSink } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const sink = new AudioBufferSink(track);
    const chunks: AudioBuffer[] = [];
    for await (const { buffer } of sink.buffers(startSec, startSec + SNIPPET_SECONDS)) {
      chunks.push(buffer);
    }
    if (chunks.length === 0) return null;

    const sampleRate = chunks[0].sampleRate;
    const channels = chunks[0].numberOfChannels;
    const totalLength = chunks.reduce((sum, b) => sum + b.length, 0);
    const merged = new AudioBuffer({ length: totalLength, numberOfChannels: channels, sampleRate });
    let offset = 0;
    for (const chunk of chunks) {
      for (let c = 0; c < channels; c++) {
        const data = new Float32Array(chunk.length);
        chunk.copyFromChannel(data, Math.min(c, chunk.numberOfChannels - 1));
        merged.copyToChannel(data, c, offset);
      }
      offset += chunk.length;
    }
    return merged;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

export function stopSnippet(): void {
  try {
    activeSource?.stop();
  } catch {
    // already stopped
  }
  activeSource = null;
  void activeContext?.close().catch(() => undefined);
  activeContext = null;
}

export function playSnippet(buffer: AudioBuffer, filtered: boolean, onEnded: () => void): void {
  stopSnippet();
  const toPlay = filtered ? processAudioBufferCopy(buffer) : buffer;
  activeContext = new AudioContext();
  activeSource = activeContext.createBufferSource();
  activeSource.buffer = toPlay;
  activeSource.connect(activeContext.destination);
  activeSource.onended = () => {
    onEnded();
    stopSnippet();
  };
  activeSource.start();
}
