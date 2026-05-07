import { Chord, Note } from 'tonal';
import type { ParsedNote, BeatChord, HarmonyAnalysis } from '../types/music';

/**
 * Maps a detected chord to a functional label using Riemannian Funktionstheorie
 * (the German functional harmony system: T, S, D and their parallels).
 *
 * Intervals are measured in semitones from the tonic upward (mod 12).
 * Suffixes: 7 = dominant/minor seventh, ° = diminished, p = Parallelklang
 * (minor relative of a major function), P = Parallelklang (major relative of
 * a minor function), g = Gegenklang (Leittonwechselklang).
 */
function toFunctionalLabel(
  chordName: string,
  tonic: string,
  mode: 'major' | 'minor',
): string | null {
  const chord = Chord.get(chordName);
  if (!chord.tonic) return chordName;

  const rootChroma  = Note.get(chord.tonic).chroma ?? -1;
  const tonicChroma = Note.get(tonic).chroma ?? 0;
  if (rootChroma < 0) return chordName;

  // Semitone distance from tonic to chord root, mod 12
  const iv = (rootChroma - tonicChroma + 12) % 12;

  const q      = chord.quality;
  const has7m  = chord.intervals.includes('7m'); // minor seventh (dom7 / m7 / ø7)
  const has7d  = chord.intervals.includes('7d'); // diminished seventh
  const dim    = q === 'Diminished';
  const min    = q === 'Minor';
  const maj    = q === 'Major';

  // Helper: append seventh suffix
  const sev = (base: string) =>
    has7d ? base + '°⁷' : has7m ? base + '⁷' : base;

  if (mode === 'major') {
    switch (iv) {
      case 0:  return maj ? 'T'           : min  ? 't'            : null;
      case 2:  return min ? sev('Sp')     : dim  ? sev('Sp°')     : maj ? 'Sg'    : null;
      case 4:  return min ? sev('Dp')     : maj  ? 'Tg'           : null;
      case 5:  return maj ? 'S'           : min  ? 's'            : null;
      case 7:  return maj ? sev('D')      : dim  ? sev('D°')      : null;
      case 9:  return min ? sev('Tp')     : maj  ? 'Sg'           : null;
      case 11: return dim ? sev('D°')     : null;
    }
  } else {
    // Minor key
    switch (iv) {
      case 0:  return min ? 't'           : maj  ? 'T'            : null;
      case 2:  return dim ? sev('sp°')    : min  ? sev('sp')      : null;
      case 3:  return maj ? 'tP'          : min  ? 'dp'           : null;
      case 5:  return min ? 's'           : maj  ? 'S'            : null;
      case 7:  return maj ? sev('D')      : min  ? 'd'            : dim ? sev('D°') : null;
      case 8:  return maj ? 'sP'          : null;
      case 10: return maj ? 'dP'          : null;
      case 11: return dim ? sev('D°')     : null;
    }
  }

  // Non-diatonic: fall back to the raw chord symbol
  return chordName;
}

export function analyzeHarmony(
  notes: ParsedNote[],
  tonic: string,
  mode: 'major' | 'minor',
  beatsPerMeasure: number,
  measureCount: number,
): HarmonyAnalysis {
  // Group notes by (measureIndex, beat position rounded to the nearest eighth note)
  // so that near-simultaneous attacks in different voices are treated as one chord.
  const groups = new Map<string, Set<string>>();

  for (const note of notes) {
    const roundedBeat = Math.round(note.beatPosition * 2) / 2;
    const key = `${note.measureIndex}:${roundedBeat}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(note.pitchClass);
  }

  const allChords: BeatChord[] = [];

  for (const [key, pcSet] of groups) {
    if (pcSet.size < 2) continue; // single pitch class – no chord

    const [mStr, bStr] = key.split(':');
    const pitchClasses  = Array.from(pcSet);
    const detected      = Chord.detect(pitchClasses);
    const chordName     = detected[0] ?? null;
    const romanNumeral  = chordName
      ? toFunctionalLabel(chordName, tonic, mode)
      : null;

    allChords.push({
      measureIndex: parseInt(mStr, 10),
      beatPosition: parseFloat(bStr),
      pitchClasses,
      chordName,
      romanNumeral,
    });
  }

  allChords.sort((a, b) =>
    a.measureIndex !== b.measureIndex
      ? a.measureIndex - b.measureIndex
      : a.beatPosition - b.beatPosition,
  );

  const keyLabel = `${tonic} ${mode}`;
  return { tonic, mode, keyLabel, chords: allChords, beatsPerMeasure, measureCount };
}
