import * as Tone from 'tone';
import { buildDrumKit, buildInstrumentKit, type DrumName, type InstrumentName } from '../audio';
import type { Song } from './generator';

// =====================================================================
// File-save helper
// =====================================================================

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke a tick later so the browser has time to grab the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =====================================================================
// MIDI export — Standard MIDI File, format 1, multi-track
// =====================================================================

// General MIDI drum map (channel 10, 0-indexed = 9).
const GM_DRUM_MAP: Record<DrumName, number> = {
  kick: 36,
  snare: 38,
  hihatClosed: 42,
  hihatOpen: 46,
  clap: 39,
  rim: 37,
  tomLow: 41,
  tomMid: 47,
  tomHigh: 50,
  crash: 49,
  ride: 51,
  shaker: 82,
};

// (program, channel) per instrument. Channels are arbitrary 0..15 except
// drums which must be 9 (GM channel 10).
const GM_INSTRUMENT_MAP: Record<InstrumentName, { program: number; channel: number }> = {
  piano: { program: 0, channel: 0 },
  ePiano: { program: 4, channel: 1 },
  synthLead: { program: 80, channel: 2 },
  pad: { program: 88, channel: 3 },
  violin: { program: 40, channel: 4 },
  bass808: { program: 38, channel: 5 },
  subBass: { program: 39, channel: 6 },
};

const PPQ = 480; // ticks per quarter note

function noteNameToMidi(name: string): number {
  const m = name.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!m) throw new Error('bad note name: ' + name);
  const pcMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = pcMap[m[1]];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const oct = parseInt(m[3], 10);
  return (oct + 1) * 12 + pc + acc;
}

// Variable-length quantity (used by SMF for delta times).
function vlq(n: number): number[] {
  if (n < 0) throw new Error('vlq negative: ' + n);
  const buf: number[] = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    buf.push((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return buf.reverse();
}

function be16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}
function be32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function stringBytes(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0) & 0xff);
}

type MidiEvent = {
  tick: number;
  // Status byte (with channel baked in) + data bytes (no delta).
  data: number[];
};

function chunk(name: string, body: number[]): number[] {
  return [...stringBytes(name), ...be32(body.length), ...body];
}

function eventsToTrack(events: MidiEvent[]): number[] {
  // Stable sort by tick. For same-tick, prefer Note-Off (status 0x80..0x8F)
  // before Note-On so chord notes that release exactly when the next chord
  // starts don't clobber the new attack.
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    const aIsOff = (a.data[0] & 0xf0) === 0x80;
    const bIsOff = (b.data[0] & 0xf0) === 0x80;
    if (aIsOff && !bIsOff) return -1;
    if (!aIsOff && bIsOff) return 1;
    return 0;
  });

  const body: number[] = [];
  let prevTick = 0;
  for (const ev of events) {
    const delta = ev.tick - prevTick;
    body.push(...vlq(delta), ...ev.data);
    prevTick = ev.tick;
  }
  // End of track meta event.
  body.push(0x00, 0xff, 0x2f, 0x00);
  return chunk('MTrk', body);
}

export function exportMidi(song: Song): Blob {
  const { bpm } = song.meta;
  const secondsPerBeat = 60 / bpm;
  const secondsToTicks = (sec: number) => Math.round((sec / secondsPerBeat) * PPQ);

  // --- Track 0: meta (tempo, time signature, track name) ---
  const microsecondsPerBeat = Math.round(60_000_000 / bpm);
  const metaBody: number[] = [];
  // Track name
  const name = `Stochastic Beats — ${song.meta.seed}`;
  metaBody.push(0x00, 0xff, 0x03, ...vlq(name.length), ...stringBytes(name));
  // Tempo
  metaBody.push(
    0x00, 0xff, 0x51, 0x03,
    (microsecondsPerBeat >> 16) & 0xff,
    (microsecondsPerBeat >> 8) & 0xff,
    microsecondsPerBeat & 0xff,
  );
  // Time signature 4/4 (4 numerator, 2 = 2^2 = 4 denominator, 24 clocks/click, 8 32nds/quarter)
  metaBody.push(0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);
  // End of track
  metaBody.push(0x00, 0xff, 0x2f, 0x00);
  const metaTrack = chunk('MTrk', metaBody);

  // --- Drum track (channel 9) ---
  const drumEvents: MidiEvent[] = [];
  // Bank/Program select can be omitted on channel 9 since GM drum kit is implicit.
  for (const ev of song.events) {
    if (ev.kind !== 'drum') continue;
    const pitch = GM_DRUM_MAP[ev.name];
    const tickOn = secondsToTicks(ev.time);
    const tickOff = tickOn + Math.max(10, Math.round(PPQ / 8)); // short note
    drumEvents.push({ tick: tickOn, data: [0x99, pitch, 100] }); // Note On, ch 10
    drumEvents.push({ tick: tickOff, data: [0x89, pitch, 0] });
  }
  const drumTrack = eventsToTrack(drumEvents);

  // --- Instrument tracks ---
  const instTracks: number[][] = [];
  const usedInstruments = new Set<InstrumentName>();
  for (const ev of song.events) {
    if (ev.kind === 'note') usedInstruments.add(ev.instrument);
  }
  for (const inst of usedInstruments) {
    const { program, channel } = GM_INSTRUMENT_MAP[inst];
    const events: MidiEvent[] = [];
    // Program change at tick 0.
    events.push({ tick: 0, data: [0xc0 | channel, program] });
    for (const ev of song.events) {
      if (ev.kind !== 'note' || ev.instrument !== inst) continue;
      const notes = Array.isArray(ev.note) ? ev.note : [ev.note];
      const tickOn = secondsToTicks(ev.time);
      const tickOff = tickOn + Math.max(10, secondsToTicks(ev.durationSec));
      for (const n of notes) {
        const pitch = noteNameToMidi(n);
        events.push({ tick: tickOn, data: [0x90 | channel, pitch, 96] });
        events.push({ tick: tickOff, data: [0x80 | channel, pitch, 0] });
      }
    }
    instTracks.push(eventsToTrack(events));
  }

  const numTracks = 1 /* meta */ + 1 /* drums */ + instTracks.length;

  const header = chunk('MThd', [
    ...be16(1),         // format 1
    ...be16(numTracks),
    ...be16(PPQ),
  ]);

  const all = [...header, ...metaTrack, ...drumTrack, ...instTracks.flat()];
  return new Blob([new Uint8Array(all)], { type: 'audio/midi' });
}

// =====================================================================
// WAV export — render the song offline (faster than real-time) via
// Tone.Offline, then encode the resulting AudioBuffer as 16-bit PCM WAV.
// =====================================================================

export type WavRenderProgress = (frac: number) => void;

export async function exportWav(song: Song, onProgress?: WavRenderProgress): Promise<Blob> {
  // Tone.Offline gives us a fresh OfflineAudioContext-backed Tone context
  // for the duration of the callback. We rebuild the entire instrument
  // graph inside it so synths/sampler bind to the offline context.
  const padding = 2.5; // tail for pad releases / crash decay
  const renderSec = song.meta.totalDurationSec + padding;

  // Naive progress: kick a tick every 100ms based on wall time.
  let progressTimer: number | null = null;
  const startWall = performance.now();
  // Empirical: offline render is roughly 5–15× faster than real-time on
  // mid-range hardware. We don't know the exact speed up front, so we just
  // animate a slow indeterminate-style progress to give visual feedback.
  if (onProgress) {
    onProgress(0);
    progressTimer = window.setInterval(() => {
      const wallSec = (performance.now() - startWall) / 1000;
      // Asymptotic 0 → 0.95 curve so the bar never appears stuck at 100% pre-done.
      const frac = 1 - Math.exp(-wallSec / (renderSec / 4));
      onProgress(Math.min(0.95, frac));
    }, 100);
  }

  const toneBuffer = await Tone.Offline(({ transport }) => {
    const drumKit = buildDrumKit();
    const { kit: instrumentKit } = buildInstrumentKit();

    // Same BPM trick as the live Player — 60 BPM means transport time
    // equals seconds, so event.time can be scheduled directly.
    transport.bpm.value = 60;

    for (const ev of song.events) {
      transport.schedule((t) => {
        if (ev.kind === 'drum') {
          drumKit[ev.name].play(t);
        } else {
          instrumentKit[ev.instrument].play(ev.note, t, ev.durationSec);
        }
      }, ev.time);
    }

    transport.start();
  }, renderSec);

  if (progressTimer !== null) {
    clearInterval(progressTimer);
    onProgress?.(1);
  }

  const audioBuffer = toneBuffer.get() as AudioBuffer;
  return audioBufferToWavBlob(audioBuffer);
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const samples = buffer.length;

  // Interleave channels into a single Float32Array.
  const interleaved = new Float32Array(samples * numCh);
  for (let ch = 0; ch < numCh; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < samples; i++) {
      interleaved[i * numCh + ch] = data[i];
    }
  }

  const byteLength = interleaved.length * 2; // 16-bit
  const buf = new ArrayBuffer(44 + byteLength);
  const view = new DataView(buf);

  // RIFF header
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + byteLength, true);
  writeAscii(view, 8, 'WAVE');
  // fmt chunk
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true); // byte rate
  view.setUint16(32, numCh * 2, true); // block align
  view.setUint16(34, 16, true); // bits/sample
  // data chunk
  writeAscii(view, 36, 'data');
  view.setUint32(40, byteLength, true);

  // PCM samples
  let offset = 44;
  for (let i = 0; i < interleaved.length; i++) {
    const s = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buf], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}
