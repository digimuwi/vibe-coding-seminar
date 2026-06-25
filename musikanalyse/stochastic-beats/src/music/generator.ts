import type { DrumName, InstrumentName } from '../audio';
import { hashString, makeRng, type Rng } from './random';
import {
  chordMidi,
  fitToRange,
  KEY_NAMES,
  midiToNoteName,
  pickProgression,
  scaleDegree,
  type ChordProgression,
  type Key,
  type Mode,
} from './theory';

// =============================================================
// Public API
// =============================================================

export type Mood = 'chill' | 'vibe' | 'hype';
export type DurationMin = 1 | 2 | 3;

export type GeneratorConfig = {
  seed: string;
  durationMin: DurationMin;
  mood: Mood;
  rootChoice?: 'auto' | (typeof KEY_NAMES)[number];
  modeChoice?: 'auto' | Mode;
};

export type SongEvent =
  | { time: number; kind: 'drum'; name: DrumName; velocity?: number }
  | {
      time: number;
      kind: 'note';
      instrument: InstrumentName;
      note: string | string[];
      durationSec: number;
    };

export type SectionType = 'I' | 'A' | 'B' | 'C' | 'O';

export type SectionPlan = {
  type: SectionType;
  bars: number;
  startBar: number;
  startTime: number;
  durationSec: number;
};

export type Song = {
  meta: {
    seed: string;
    seedHash: number;
    bpm: number;
    key: Key;
    keyLabel: string; // e.g. "G minor"
    mood: Mood;
    progA: ChordProgression;
    progB: ChordProgression;
    structure: SectionPlan[];
    totalBars: number;
    totalDurationSec: number;
    secondsPerBar: number;
    secondsPerBeat: number;
  };
  events: SongEvent[];
};

// =============================================================
// Top-level composer
// =============================================================

export function generate(config: GeneratorConfig): Song {
  const seedHash = hashString(config.seed || 'default');
  const rng = makeRng(seedHash);

  // Tempo: mood biases the range, seed picks the exact value.
  const bpmRange: Record<Mood, [number, number]> = {
    chill: [72, 96],
    vibe: [92, 118],
    hype: [120, 148],
  };
  const [bpmLo, bpmHi] = bpmRange[config.mood];
  const bpm = Math.round(rng.range(bpmLo, bpmHi));

  // Key: user override or seeded random.
  const root =
    config.rootChoice && config.rootChoice !== 'auto'
      ? KEY_NAMES.indexOf(config.rootChoice)
      : rng.int(0, 12);
  const mode: Mode =
    config.modeChoice && config.modeChoice !== 'auto'
      ? config.modeChoice
      : config.mood === 'chill'
        ? rng.bool(0.6) ? 'minor' : 'major'
        : config.mood === 'hype'
          ? rng.bool(0.7) ? 'major' : 'minor'
          : rng.bool(0.5) ? 'major' : 'minor';
  const key: Key = { root, mode };

  const progA = pickProgression(mode, rng.pick);
  // Pick a second progression different from A for B/chorus sections.
  let progB: ChordProgression = progA;
  for (let i = 0; i < 6 && progB === progA; i++) progB = pickProgression(mode, rng.pick);

  // Tempo geometry
  const secondsPerBeat = 60 / bpm;
  const secondsPerBar = secondsPerBeat * 4; // assume 4/4

  // Structure
  const targetSec = config.durationMin * 60;
  const targetBars = Math.max(8, Math.round(targetSec / secondsPerBar));
  const structure = makeStructure(targetBars, rng);

  // Annotate sections with time positions.
  let bar = 0;
  let time = 0;
  for (const s of structure) {
    s.startBar = bar;
    s.startTime = time;
    s.durationSec = s.bars * secondsPerBar;
    bar += s.bars;
    time += s.durationSec;
  }
  const totalBars = bar;
  const totalDurationSec = time;

  // Pick a base groove template by mood, then mutate per section.
  const groove = pickGroove(config.mood, rng);

  // Build events
  const events: SongEvent[] = [];

  for (const section of structure) {
    composeSection(
      events,
      section,
      key,
      progA,
      progB,
      groove,
      secondsPerBar,
      secondsPerBeat,
      config.mood,
      rng,
    );
  }

  // Sort once for player simplicity.
  events.sort((a, b) => a.time - b.time);

  return {
    meta: {
      seed: config.seed,
      seedHash,
      bpm,
      key,
      keyLabel: `${KEY_NAMES[key.root]} ${key.mode}`,
      mood: config.mood,
      progA,
      progB,
      structure,
      totalBars,
      totalDurationSec,
      secondsPerBar,
      secondsPerBeat,
    },
    events,
  };
}

// =============================================================
// Structure: pick a song form sized roughly to the target.
// =============================================================

type Template = SectionType[];

const TEMPLATES: Template[] = [
  ['I', 'A', 'B', 'A', 'O'],
  ['I', 'A', 'A', 'B', 'A', 'B', 'O'],
  ['I', 'A', 'B', 'A', 'B', 'C', 'B', 'O'],
  ['I', 'A', 'B', 'A', 'B', 'C', 'A', 'B', 'B', 'O'],
  ['I', 'A', 'A', 'B', 'A', 'B', 'C', 'A', 'B', 'B', 'O'],
];

function makeStructure(targetBars: number, rng: Rng): SectionPlan[] {
  // Base bar lengths per section type. Tweaked per template by scaling.
  const baseLen: Record<SectionType, number> = { I: 4, A: 8, B: 8, C: 8, O: 4 };

  // Pick the template closest to target.
  let best = TEMPLATES[0];
  let bestDiff = Infinity;
  for (const t of TEMPLATES) {
    const total = t.reduce((s, x) => s + baseLen[x], 0);
    const diff = Math.abs(total - targetBars);
    if (diff < bestDiff) {
      best = t;
      bestDiff = diff;
    }
  }

  // Scale lengths so the sum matches targetBars closely.
  const total = best.reduce((s, x) => s + baseLen[x], 0);
  const scale = targetBars / total;
  const plans: SectionPlan[] = best.map((type) => ({
    type,
    bars: Math.max(2, Math.round(baseLen[type] * scale)),
    startBar: 0,
    startTime: 0,
    durationSec: 0,
  }));

  // Light randomization for variety (without breaking the song length too much).
  if (plans.length > 4) {
    const i = rng.int(1, plans.length - 1);
    if (plans[i].type === 'A' || plans[i].type === 'B') {
      plans[i].bars += rng.pick([-2, 0, 2]);
      plans[i].bars = Math.max(2, plans[i].bars);
    }
  }

  return plans;
}

// =============================================================
// Drums: 16-step bar templates per groove with stochastic variation
// =============================================================

type Step16 = 0 | 1; // present/absent
type DrumGroove = {
  name: string;
  // 16 steps per bar (one bar = four beats of four 16ths each).
  kick: Step16[];
  snare: Step16[];
  hihatClosed: Step16[];
  hihatOpen: Step16[];
  clap: Step16[];
  // probability multipliers per drum (per step) — chance a step gets dropped/added each bar
  ghostKickProb: number; // chance of adding a syncopated kick on weak 16ths
  ghostHihatProb: number;
  hihatDensity: 8 | 16; // 8th vs 16th note hihat
};

const GROOVES: DrumGroove[] = [
  {
    // Classic 4/4 backbeat
    name: 'boom-bap',
    kick:        [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
    snare:       [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihatClosed: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    hihatOpen:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    clap:        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    ghostKickProb: 0.10,
    ghostHihatProb: 0.10,
    hihatDensity: 8,
  },
  {
    // Trap-ish syncopated kick + 16th hats
    name: 'trap',
    kick:        [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,1,0,0],
    snare:       [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihatClosed: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    hihatOpen:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1],
    clap:        [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    ghostKickProb: 0.15,
    ghostHihatProb: 0.05,
    hihatDensity: 16,
  },
  {
    // Four-on-the-floor (house-ish)
    name: 'four-floor',
    kick:        [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare:       [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihatClosed: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    hihatOpen:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    clap:        [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    ghostKickProb: 0.05,
    ghostHihatProb: 0.15,
    hihatDensity: 8,
  },
  {
    // Half-time
    name: 'half-time',
    kick:        [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    snare:       [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihatClosed: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    hihatOpen:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    clap:        [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    ghostKickProb: 0.10,
    ghostHihatProb: 0.10,
    hihatDensity: 8,
  },
];

function pickGroove(mood: Mood, rng: Rng): DrumGroove {
  if (mood === 'chill') return rng.weighted([
    [GROOVES[0], 3],
    [GROOVES[3], 2],
    [GROOVES[1], 1],
  ]);
  if (mood === 'hype') return rng.weighted([
    [GROOVES[1], 3],
    [GROOVES[2], 3],
    [GROOVES[0], 1],
  ]);
  return rng.pick(GROOVES);
}

// Section "density" — how much drum material is active.
function sectionDensity(type: SectionType, mood: Mood): number {
  const base: Record<SectionType, number> = { I: 0.4, A: 0.7, B: 1.0, C: 0.85, O: 0.4 };
  const moodMul: Record<Mood, number> = { chill: 0.85, vibe: 1.0, hype: 1.1 };
  return Math.min(1, base[type] * moodMul[mood]);
}

// =============================================================
// Composer (per section)
// =============================================================

function composeSection(
  out: SongEvent[],
  section: SectionPlan,
  key: Key,
  progA: ChordProgression,
  progB: ChordProgression,
  groove: DrumGroove,
  secondsPerBar: number,
  secondsPerBeat: number,
  mood: Mood,
  rng: Rng,
): void {
  // Pick the chord progression for this section type.
  const prog: ChordProgression =
    section.type === 'B' || section.type === 'C' ? progB : progA;
  const density = sectionDensity(section.type, mood);
  const sixteenth = secondsPerBeat / 4;

  // Section-starting accents — crash at the top of B and C.
  if ((section.type === 'B' || section.type === 'C') && section.startBar > 0) {
    out.push({ time: section.startTime, kind: 'drum', name: 'crash' });
  }

  for (let b = 0; b < section.bars; b++) {
    const barStart = section.startTime + b * secondsPerBar;
    const isLastBar = b === section.bars - 1;
    const isPenultimate = b === section.bars - 2;

    // Pick chord for this bar from the progression (cycles every 4 bars).
    const chordDegree = prog[b % prog.length];

    // -------- Drums --------
    composeBarDrums(
      out,
      barStart,
      sixteenth,
      groove,
      density,
      section.type,
      isLastBar,
      isPenultimate,
      rng,
    );

    // -------- Bass (root + occasional fifth, octave 1) --------
    if (section.type !== 'I' || b >= section.bars - 2) {
      composeBarBass(out, barStart, secondsPerBeat, key, chordDegree, mood, rng);
    }

    // -------- Pad (long sustained chord, octave 3) --------
    if (section.type === 'I' || section.type === 'O') {
      // Sparser intro/outro: only on bar 1 (or last bars).
      if (b === 0 || b === section.bars - 1) {
        composeBarPad(out, barStart, secondsPerBar, key, chordDegree);
      }
    } else {
      composeBarPad(out, barStart, secondsPerBar, key, chordDegree);
    }

    // -------- E-piano comping (rhythmic chord stabs) --------
    if (section.type === 'A' || section.type === 'B' || section.type === 'C') {
      composeBarEPiano(
        out,
        barStart,
        secondsPerBeat,
        key,
        chordDegree,
        density,
        section.type,
        rng,
      );
    }

    // -------- Melody --------
    // Lead the chorus (B), bridge (C), and final A; intro gets a sparse motif on its last bar.
    const playMelody =
      section.type === 'B' ||
      section.type === 'C' ||
      (section.type === 'A' && section.bars - b <= 4) ||
      (section.type === 'I' && b === section.bars - 1) ||
      (section.type === 'O' && b < 2);
    if (playMelody) {
      composeBarMelody(
        out,
        barStart,
        secondsPerBeat,
        key,
        chordDegree,
        section.type,
        rng,
      );
    }
  }
}

// ---- Drums for one bar ----

function composeBarDrums(
  out: SongEvent[],
  barStart: number,
  sixteenth: number,
  groove: DrumGroove,
  density: number,
  type: SectionType,
  isLastBar: boolean,
  _isPenultimate: boolean,
  rng: Rng,
): void {
  // Pick the active subset of the groove for this section.
  const wantSnare = type !== 'I';
  const wantHihat = true;
  const wantClap = type === 'B' || type === 'C';
  const wantOpen = type === 'B' || type === 'C';

  for (let s = 0; s < 16; s++) {
    const t = barStart + s * sixteenth;
    // Stochastic dropouts scale with (1 - density). Stronger beats are stickier.
    const isStrong = s === 0 || s === 4 || s === 8 || s === 12;
    const dropoutScale = isStrong ? 0.15 : 1.0;
    const keepChance = 1 - (1 - density) * dropoutScale;

    if (groove.kick[s] && rng.bool(keepChance)) {
      out.push({ time: t, kind: 'drum', name: 'kick' });
    } else if (!groove.kick[s] && rng.bool(groove.ghostKickProb * density * 0.5)) {
      // Tiny chance of inserting a syncopated ghost kick on otherwise-empty 16ths.
      out.push({ time: t, kind: 'drum', name: 'kick' });
    }

    if (wantSnare && groove.snare[s] && rng.bool(keepChance)) {
      out.push({ time: t, kind: 'drum', name: 'snare' });
    }

    if (wantClap && groove.clap[s] && rng.bool(keepChance)) {
      out.push({ time: t, kind: 'drum', name: 'clap' });
    }

    if (wantHihat) {
      const hhActive =
        groove.hihatDensity === 16
          ? groove.hihatClosed[s]
          : groove.hihatClosed[s] && s % 2 === 0;
      if (hhActive && rng.bool(keepChance)) {
        out.push({ time: t, kind: 'drum', name: 'hihatClosed' });
      } else if (!hhActive && rng.bool(groove.ghostHihatProb * density * 0.5)) {
        out.push({ time: t, kind: 'drum', name: 'hihatClosed' });
      }
      if (wantOpen && groove.hihatOpen[s] && rng.bool(0.7)) {
        out.push({ time: t, kind: 'drum', name: 'hihatOpen' });
      }
    }
  }

  // Fill on the last bar of a section: tom rolls or extra snare flam.
  if (isLastBar && (type === 'A' || type === 'B' || type === 'C')) {
    const fillKind = rng.pick(['tomRoll', 'snareRoll', 'shaker'] as const);
    if (fillKind === 'tomRoll') {
      for (let s = 12; s < 16; s++) {
        const t = barStart + s * sixteenth;
        const tom = rng.pick(['tomHigh', 'tomMid', 'tomLow'] as const);
        out.push({ time: t, kind: 'drum', name: tom });
      }
    } else if (fillKind === 'snareRoll') {
      for (let s = 12; s < 16; s++) {
        const t = barStart + s * sixteenth;
        out.push({ time: t, kind: 'drum', name: 'snare' });
      }
    } else {
      for (let s = 12; s < 16; s++) {
        const t = barStart + s * sixteenth;
        out.push({ time: t, kind: 'drum', name: 'shaker' });
      }
    }
  }
}

// ---- Bass ----

function composeBarBass(
  out: SongEvent[],
  barStart: number,
  secondsPerBeat: number,
  key: Key,
  chordDegree: number,
  mood: Mood,
  rng: Rng,
): void {
  const bassRoot = scaleDegree(key, chordDegree, 1); // octave 1
  const bassFifth = scaleDegree(key, chordDegree + 4, 1);

  // Pattern depends on mood.
  if (mood === 'chill') {
    // Half-note root + octave-up on beat 3
    out.push({
      time: barStart,
      kind: 'note',
      instrument: 'bass808',
      note: midiToNoteName(bassRoot),
      durationSec: secondsPerBeat * 2,
    });
    out.push({
      time: barStart + secondsPerBeat * 2,
      kind: 'note',
      instrument: 'bass808',
      note: midiToNoteName(bassRoot + 12),
      durationSec: secondsPerBeat * 2,
    });
  } else if (mood === 'hype') {
    // Eighth-note pulsing pattern: root root root fifth ... with octave jumps
    for (let i = 0; i < 8; i++) {
      const t = barStart + i * (secondsPerBeat / 2);
      const choice = rng.weighted([
        ['root', 5],
        ['fifth', 1],
        ['octave', 1],
        ['rest', 1],
      ] as const);
      if (choice === 'rest') continue;
      const m =
        choice === 'root' ? bassRoot : choice === 'fifth' ? bassFifth : bassRoot + 12;
      out.push({
        time: t,
        kind: 'note',
        instrument: 'bass808',
        note: midiToNoteName(m),
        durationSec: secondsPerBeat / 2,
      });
    }
  } else {
    // Vibe: quarter notes with light variation
    for (let i = 0; i < 4; i++) {
      const t = barStart + i * secondsPerBeat;
      const choice =
        i === 0 ? 'root' : rng.weighted([
          ['root', 4],
          ['fifth', 1],
          ['rest', 1],
        ] as const);
      if (choice === 'rest') continue;
      const m = choice === 'root' ? bassRoot : bassFifth;
      out.push({
        time: t,
        kind: 'note',
        instrument: 'bass808',
        note: midiToNoteName(m),
        durationSec: secondsPerBeat,
      });
    }
  }
}

// ---- Pad ----

function composeBarPad(
  out: SongEvent[],
  barStart: number,
  secondsPerBar: number,
  key: Key,
  chordDegree: number,
): void {
  const chord = chordMidi(key, chordDegree, 3);
  out.push({
    time: barStart,
    kind: 'note',
    instrument: 'pad',
    note: chord.map(midiToNoteName),
    durationSec: secondsPerBar * 0.95,
  });
}

// ---- E-piano comping (rhythmic chord stabs) ----

function composeBarEPiano(
  out: SongEvent[],
  barStart: number,
  secondsPerBeat: number,
  key: Key,
  chordDegree: number,
  density: number,
  type: SectionType,
  rng: Rng,
): void {
  const chord = chordMidi(key, chordDegree, 3, true);
  // For chorus, denser stabs; for verse, just downbeats.
  const pattern: number[] = type === 'B' ? [0, 1.5, 2, 2.5, 3.5] : [0, 2];
  for (const beat of pattern) {
    if (rng.bool(0.85 * density)) {
      out.push({
        time: barStart + beat * secondsPerBeat,
        kind: 'note',
        instrument: 'ePiano',
        note: chord.map(midiToNoteName),
        durationSec: secondsPerBeat * 0.9,
      });
    }
  }
}

// ---- Melody (Markov-ish over scale degrees, chord-tone bias on strong beats) ----

function composeBarMelody(
  out: SongEvent[],
  barStart: number,
  secondsPerBeat: number,
  key: Key,
  chordDegree: number,
  type: SectionType,
  rng: Rng,
): void {
  // Strong-beat targets: chord tones. Weak beats: any scale tone with step-bias.
  // Use a 1- or 2-beat note grid for chill/vibe, 0.5-beat for hype.
  const beats = type === 'B' ? 4 : 2; // chorus: full-bar phrases; verse: shorter
  const subdivisions = type === 'C' ? 8 : 4; // bridge tighter
  const stepDur = secondsPerBeat / (subdivisions / 4); // duration of one melody step

  const chordTones = [chordDegree, chordDegree + 2, chordDegree + 4];
  const melodyLo = 67; // G4
  const melodyHi = 84; // C6

  let prevDegree = chordDegree + 2; // start on third for sweetness
  for (let i = 0; i < beats * (subdivisions / 4); i++) {
    const t = barStart + i * stepDur;
    const isStrong = i % (subdivisions / 4) === 0;

    // 25% chance of rest on weak beats
    if (!isStrong && rng.bool(0.25)) continue;

    let degree: number;
    if (isStrong && rng.bool(0.7)) {
      // Land on a chord tone
      degree = rng.pick(chordTones);
    } else {
      // Step from previous degree (bias to small steps)
      const move = rng.weighted([
        [-2, 2],
        [-1, 4],
        [0, 1],
        [1, 4],
        [2, 2],
        [3, 1],
        [-3, 1],
      ] as const);
      degree = prevDegree + move;
    }

    const midi = fitToRange(scaleDegree(key, degree, 4), melodyLo, melodyHi);
    // ePiano + synthLead are pure synths (always loaded). Piano sampler is
    // CDN-streamed so we avoid it here to keep the generator deterministic.
    const melInst = type === 'B' || type === 'C' ? 'synthLead' : 'ePiano';
    out.push({
      time: t,
      kind: 'note',
      instrument: melInst,
      note: midiToNoteName(midi),
      durationSec: stepDur * 0.95,
    });
    prevDegree = degree;
  }
}
