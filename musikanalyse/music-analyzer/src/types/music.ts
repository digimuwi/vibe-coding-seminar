export interface ParsedNote {
  pitch: string;        // e.g. "C4", "F#5"
  pitchClass: string;   // e.g. "C", "F#"
  measureIndex: number; // 0-based
  beatPosition: number; // in quarter notes from measure start
  duration: number;     // in quarter notes
}

export interface BeatChord {
  measureIndex: number;
  beatPosition: number;
  pitchClasses: string[];
  chordName: string | null;   // e.g. "Cmaj7", "G7"
  romanNumeral: string | null; // e.g. "I", "V7", "ii°"
}

export interface HarmonyAnalysis {
  tonic: string;           // e.g. "C", "Bb"
  mode: 'major' | 'minor';
  keyLabel: string;        // e.g. "C major", "A minor"
  chords: BeatChord[];     // all detected chords, sorted chronologically
  beatsPerMeasure: number; // quarter-note beats per measure (for x-positioning)
  measureCount: number;
}
