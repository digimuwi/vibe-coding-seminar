// Minimal Western-tonal music theory helpers: diatonic scales, chord builder,
// MIDI <-> note name conversion, common chord progressions.

export type Mode = 'major' | 'minor';

export const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// Semitone distances from the root for each diatonic scale degree (1..7).
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const; // natural minor

export type Key = { root: number; mode: Mode }; // root: 0..11 (pitch class)

export function intervals(mode: Mode): readonly number[] {
  return mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
}

// MIDI note for a diatonic scale degree (1-based, wraps across octaves).
// baseOctave follows scientific-pitch convention: C4 = MIDI 60.
export function scaleDegree(key: Key, degree: number, baseOctave: number): number {
  const iv = intervals(key.mode);
  const idx = (((degree - 1) % 7) + 7) % 7;
  const octaveShift = Math.floor((degree - 1) / 7);
  return (baseOctave + octaveShift + 1) * 12 + key.root + iv[idx];
}

// Triad (or seventh chord) on a scale degree, given as MIDI notes.
export function chordMidi(
  key: Key,
  degree: number,
  baseOctave: number,
  addSeventh = false,
): number[] {
  const r = scaleDegree(key, degree, baseOctave);
  const t = scaleDegree(key, degree + 2, baseOctave);
  const f = scaleDegree(key, degree + 4, baseOctave);
  if (addSeventh) {
    const s = scaleDegree(key, degree + 6, baseOctave);
    return [r, t, f, s];
  }
  return [r, t, f];
}

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES_SHARP[pc] + oct;
}

export type ChordProgression = readonly number[];

// Common 4-bar progressions, expressed as diatonic degrees.
// They sound musical in either parallel mode because we only use diatonic
// degrees and let `chordMidi` build the right quality for the scale.
export const MAJOR_PROGS: readonly ChordProgression[] = [
  [1, 5, 6, 4], // pop / "axis"
  [1, 6, 4, 5], // doo-wop / 50s
  [6, 4, 1, 5], // alt pop
  [1, 4, 6, 5],
  [4, 5, 3, 6],
  [2, 5, 1, 6], // ii-V-I-vi
  [1, 4, 5, 4],
];

export const MINOR_PROGS: readonly ChordProgression[] = [
  [1, 7, 6, 7],
  [1, 6, 3, 7],
  [1, 4, 7, 6],
  [1, 5, 6, 4],
  [1, 7, 4, 5],
  [1, 3, 4, 5],
];

// Pick a progression appropriate for the song's mode.
export function pickProgression(
  mode: Mode,
  choose: <T>(arr: readonly T[]) => T,
): ChordProgression {
  return choose(mode === 'major' ? MAJOR_PROGS : MINOR_PROGS);
}

// Bring a MIDI note into a comfortable melody range by octave-shifting.
export function fitToRange(midi: number, lo: number, hi: number): number {
  let n = midi;
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
}
