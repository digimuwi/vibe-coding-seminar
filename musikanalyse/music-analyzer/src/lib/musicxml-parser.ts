import type { ParsedNote } from '../types/music';

// Maps number of sharps/flats to tonic note name
const FIFTHS_MAJOR: Record<number, string> = {
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#',
  '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb',
};
const FIFTHS_MINOR: Record<number, string> = {
  0: 'A', 1: 'E', 2: 'B', 3: 'F#', 4: 'C#', 5: 'G#', 6: 'D#',
  '-1': 'D', '-2': 'G', '-3': 'C', '-4': 'F', '-5': 'Bb', '-6': 'Eb',
};

export interface ParseResult {
  notes: ParsedNote[];
  tonic: string;
  mode: 'major' | 'minor';
  beatsPerMeasure: number; // quarter-note beats per measure
  measureCount: number;
}

function getAlterString(alter: number): string {
  if (alter === 1 || alter === 0.5) return '#';
  if (alter === -1 || alter === -0.5) return 'b';
  if (alter === 2) return '##';
  if (alter === -2) return 'bb';
  return '';
}

export function parseMusicXML(xml: string): ParseResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid MusicXML: ' + parseError.textContent?.slice(0, 80));

  let tonic = 'C';
  let mode: 'major' | 'minor' = 'major';
  let beatsPerMeasure = 4; // updated from the first <time> element encountered
  const allNotes: ParsedNote[] = [];
  let totalMeasures = 0;

  const root = doc.documentElement;
  if (root.tagName !== 'score-partwise') {
    throw new Error(
      `Expected a MusicXML file (root element <score-partwise>), but got <${root.tagName}>. ` +
      `This file does not appear to be a MusicXML score.`,
    );
  }

  const parts = Array.from(doc.querySelectorAll('score-partwise > part'));
  if (parts.length === 0) throw new Error('No parts found in this MusicXML file.');

  // Analyse all parts for harmonic content
  for (const part of parts) {
    const measures = Array.from(part.querySelectorAll('measure'));
    totalMeasures = Math.max(totalMeasures, measures.length);
    let divisions = 1; // divisions per quarter note

    for (let mi = 0; mi < measures.length; mi++) {
      const measure = measures[mi];
      let cursor = 0;     // current position in divisions
      let prevCursor = 0; // position before last non-chord note (for <chord> element)

      // Iterate all direct children in document order so that <backup> /
      // <forward> elements correctly reset the time cursor between voices.
      for (const child of Array.from(measure.children)) {
        const tag = child.tagName;

        if (tag === 'attributes') {
          const divEl    = child.querySelector('divisions');
          if (divEl) divisions = parseInt(divEl.textContent ?? '1', 10) || 1;

          const fifthsEl = child.querySelector('key > fifths');
          const modeEl   = child.querySelector('key > mode');
          if (fifthsEl) {
            const fifths = parseInt(fifthsEl.textContent ?? '0', 10);
            mode = (modeEl?.textContent?.trim().toLowerCase() === 'minor') ? 'minor' : 'major';
            const table = mode === 'minor' ? FIFTHS_MINOR : FIFTHS_MAJOR;
            tonic = table[fifths] ?? (mode === 'minor' ? 'A' : 'C');
          }

          const beatsEl    = child.querySelector('time > beats');
          const beatTypeEl = child.querySelector('time > beat-type');
          if (beatsEl && beatTypeEl) {
            const beats    = parseInt(beatsEl.textContent ?? '4', 10);
            const beatType = parseInt(beatTypeEl.textContent ?? '4', 10);
            // Convert to quarter-note beats (our beatPosition unit)
            beatsPerMeasure = beats * 4 / beatType;
          }
          continue;
        }

        if (tag === 'backup') {
          const dur = parseInt(child.querySelector('duration')?.textContent ?? '0', 10);
          cursor = Math.max(0, cursor - dur);
          prevCursor = cursor;
          continue;
        }

        if (tag === 'forward') {
          const dur = parseInt(child.querySelector('duration')?.textContent ?? '0', 10);
          prevCursor = cursor;
          cursor += dur;
          continue;
        }

        if (tag !== 'note') continue;

        const noteEl = child;

        // Skip grace notes – they have no rhythmic value
        if (noteEl.querySelector('grace')) continue;

        const durationEl = noteEl.querySelector('duration');
        const duration = parseInt(durationEl?.textContent ?? '0', 10);
        const isChord = !!noteEl.querySelector('chord');
        const isRest  = !!noteEl.querySelector('rest');

        // <chord> means this note starts at the same position as the previous one
        if (isChord) {
          cursor = prevCursor;
        } else {
          prevCursor = cursor;
        }

        if (!isRest) {
          const stepEl   = noteEl.querySelector('pitch > step');
          const alterEl  = noteEl.querySelector('pitch > alter');
          const octaveEl = noteEl.querySelector('pitch > octave');

          if (stepEl && octaveEl) {
            const step   = stepEl.textContent?.trim() ?? 'C';
            const alter  = parseFloat(alterEl?.textContent ?? '0') || 0;
            const octave = parseInt(octaveEl.textContent ?? '4', 10);
            const acc    = getAlterString(alter);
            const pitchClass = step + acc;

            allNotes.push({
              pitch: pitchClass + octave,
              pitchClass,
              measureIndex: mi,
              beatPosition: cursor / divisions,
              duration: duration / divisions,
            });
          }
        }

        if (!isChord) cursor += duration;
      }
    }
  }

  return { notes: allNotes, tonic, mode, beatsPerMeasure, measureCount: totalMeasures };
}
