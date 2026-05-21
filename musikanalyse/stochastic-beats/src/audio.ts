import * as Tone from 'tone';

let started = false;

export async function startAudio(): Promise<void> {
  if (started) return;
  await Tone.start();
  started = true;
}

export function noteFromSemitones(baseOctave: number, semitones: number): string {
  return Tone.Frequency(`C${baseOctave}`).transpose(semitones).toNote();
}

// ============================================================
// Drums — every drum is built from several layered voices, and
// the pitched layers are slightly detuned (a few cents) so the
// stack gets a soft chorus/beating character.
// ============================================================

const drumBus = new Tone.Gain(0.7).toDestination();

// ---------- KICK ----------
const kickBody = new Tone.MembraneSynth({
  pitchDecay: 0.05,
  octaves: 8,
  oscillator: { type: 'sine' },
  envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 1.4, attackCurve: 'exponential' },
  volume: -4,
}).connect(drumBus);

const kickBodyB = new Tone.MembraneSynth({
  pitchDecay: 0.06,
  octaves: 7,
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.0 },
  detune: 9,
  volume: -10,
}).connect(drumBus);

const kickSub = new Tone.MembraneSynth({
  pitchDecay: 0.15,
  octaves: 2,
  oscillator: { type: 'sine' },
  envelope: { attack: 0.001, decay: 0.9, sustain: 0.01, release: 2 },
  volume: -8,
}).connect(drumBus);

const kickClick = new Tone.NoiseSynth({
  noise: { type: 'white' },
  envelope: { attack: 0.001, decay: 0.01, sustain: 0 },
  volume: -28,
}).connect(drumBus);

function playKick(): void {
  kickBody.triggerAttackRelease('C1', '8n');
  kickBodyB.triggerAttackRelease('C1', '8n');
  kickSub.triggerAttackRelease('A0', '4n');
  kickClick.triggerAttackRelease('64n');
}

// ---------- SNARE ----------
const snareNoiseWhite = new Tone.NoiseSynth({
  noise: { type: 'white' },
  envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
  volume: -8,
}).connect(drumBus);

const snareNoisePink = new Tone.NoiseSynth({
  noise: { type: 'pink' },
  envelope: { attack: 0.003, decay: 0.22, sustain: 0 },
  volume: -10,
}).connect(drumBus);

const snareBodyA = new Tone.MembraneSynth({
  pitchDecay: 0.01,
  octaves: 3,
  envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
  volume: -6,
}).connect(drumBus);

const snareBodyB = new Tone.MembraneSynth({
  pitchDecay: 0.015,
  octaves: 2,
  envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.08 },
  detune: 14,
  volume: -10,
}).connect(drumBus);

function playSnare(): void {
  snareNoiseWhite.triggerAttackRelease('16n');
  snareNoisePink.triggerAttackRelease('16n');
  snareBodyA.triggerAttackRelease('G2', '16n');
  snareBodyB.triggerAttackRelease('A2', '16n');
}

// ---------- HI-HAT CLOSED ----------
const hihatClosedA = new Tone.MetalSynth({
  envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
  harmonicity: 5.1,
  modulationIndex: 32,
  resonance: 6000,
  octaves: 1.5,
  volume: -20,
}).connect(drumBus);

const hihatClosedB = new Tone.MetalSynth({
  envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
  harmonicity: 5.4,
  modulationIndex: 28,
  resonance: 7000,
  octaves: 1.3,
  detune: 18,
  volume: -24,
}).connect(drumBus);

function playHihatClosed(): void {
  hihatClosedA.triggerAttackRelease('C5', '32n');
  hihatClosedB.triggerAttackRelease('C5', '32n');
}

// ---------- HI-HAT OPEN ----------
const hihatOpenA = new Tone.MetalSynth({
  envelope: { attack: 0.001, decay: 0.35, release: 0.2 },
  harmonicity: 5.1,
  modulationIndex: 32,
  resonance: 4500,
  octaves: 1.5,
  volume: -20,
}).connect(drumBus);

const hihatOpenB = new Tone.MetalSynth({
  envelope: { attack: 0.001, decay: 0.32, release: 0.18 },
  harmonicity: 5.5,
  modulationIndex: 28,
  resonance: 5200,
  octaves: 1.3,
  detune: 20,
  volume: -24,
}).connect(drumBus);

function playHihatOpen(): void {
  hihatOpenA.triggerAttackRelease('C5', '8n');
  hihatOpenB.triggerAttackRelease('C5', '8n');
}

// ---------- CRASH ----------
const crashA = new Tone.MetalSynth({
  envelope: { attack: 0.001, decay: 1.5, release: 1.2 },
  harmonicity: 3.1,
  modulationIndex: 64,
  resonance: 3000,
  octaves: 1.5,
  volume: -22,
}).connect(drumBus);

const crashB = new Tone.MetalSynth({
  envelope: { attack: 0.001, decay: 1.7, release: 1.3 },
  harmonicity: 2.7,
  modulationIndex: 48,
  resonance: 2700,
  octaves: 1.6,
  detune: 25,
  volume: -26,
}).connect(drumBus);

function playCrash(): void {
  crashA.triggerAttackRelease('C4', '1n');
  crashB.triggerAttackRelease('C4', '1n');
}

// ---------- RIDE ----------
const rideA = new Tone.MetalSynth({
  envelope: { attack: 0.001, decay: 0.6, release: 0.3 },
  harmonicity: 8,
  modulationIndex: 16,
  resonance: 5200,
  octaves: 1.2,
  volume: -22,
}).connect(drumBus);

const rideB = new Tone.MetalSynth({
  envelope: { attack: 0.001, decay: 0.55, release: 0.25 },
  harmonicity: 7.3,
  modulationIndex: 18,
  resonance: 5800,
  octaves: 1.1,
  detune: 22,
  volume: -26,
}).connect(drumBus);

function playRide(): void {
  rideA.triggerAttackRelease('C5', '4n');
  rideB.triggerAttackRelease('C5', '4n');
}

// ---------- CLAP — three offset noise bursts plus a softer tail ----------
function makeClap(): Tone.NoiseSynth {
  return new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.002, decay: 0.04, sustain: 0 },
    volume: -10,
  }).connect(drumBus);
}

const clapA = makeClap();
const clapB = makeClap();
const clapC = makeClap();
const clapTail = new Tone.NoiseSynth({
  noise: { type: 'pink' },
  envelope: { attack: 0.003, decay: 0.18, sustain: 0 },
  volume: -16,
}).connect(drumBus);

function playClap(): void {
  const t = Tone.now();
  clapA.triggerAttackRelease('64n', t);
  clapB.triggerAttackRelease('64n', t + 0.011);
  clapC.triggerAttackRelease('64n', t + 0.022);
  clapTail.triggerAttackRelease('16n', t + 0.03);
}

// ---------- RIM ----------
const rimNoise = new Tone.NoiseSynth({
  noise: { type: 'white' },
  envelope: { attack: 0.001, decay: 0.02, sustain: 0 },
  volume: -10,
}).connect(drumBus);

const rimBody = new Tone.MembraneSynth({
  pitchDecay: 0.005,
  octaves: 4,
  envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
  volume: -14,
}).connect(drumBus);

function playRim(): void {
  rimNoise.triggerAttackRelease('64n');
  rimBody.triggerAttackRelease('E4', '64n');
}

// ---------- TOMS — two layered MembraneSynths each ----------
type TomCfg = { pitchDecay: number; octaves: number; decay: number; release: number };
function makeTomLayer(cfg: TomCfg, detune: number, volume: number): Tone.MembraneSynth {
  return new Tone.MembraneSynth({
    pitchDecay: cfg.pitchDecay,
    octaves: cfg.octaves,
    envelope: { attack: 0.001, decay: cfg.decay, sustain: 0.01, release: cfg.release },
    detune,
    volume,
  }).connect(drumBus);
}

const tomLowA = makeTomLayer({ pitchDecay: 0.08, octaves: 4, decay: 0.45, release: 0.8 }, 0, -4);
const tomLowB = makeTomLayer({ pitchDecay: 0.08, octaves: 4, decay: 0.4, release: 0.7 }, 12, -10);
const tomMidA = makeTomLayer({ pitchDecay: 0.05, octaves: 4, decay: 0.35, release: 0.6 }, 0, -4);
const tomMidB = makeTomLayer({ pitchDecay: 0.05, octaves: 4, decay: 0.3, release: 0.5 }, 12, -10);
const tomHighA = makeTomLayer({ pitchDecay: 0.03, octaves: 4, decay: 0.25, release: 0.4 }, 0, -4);
const tomHighB = makeTomLayer({ pitchDecay: 0.03, octaves: 4, decay: 0.22, release: 0.35 }, 12, -10);

function playTomLow(): void {
  tomLowA.triggerAttackRelease('A2', '8n');
  tomLowB.triggerAttackRelease('A2', '8n');
}
function playTomMid(): void {
  tomMidA.triggerAttackRelease('D3', '8n');
  tomMidB.triggerAttackRelease('D3', '8n');
}
function playTomHigh(): void {
  tomHighA.triggerAttackRelease('G3', '8n');
  tomHighB.triggerAttackRelease('G3', '8n');
}

// ---------- SHAKER — two short noise bursts back-to-back ----------
const shakerA = new Tone.NoiseSynth({
  noise: { type: 'pink' },
  envelope: { attack: 0.005, decay: 0.06, sustain: 0 },
  volume: -16,
}).connect(drumBus);

const shakerB = new Tone.NoiseSynth({
  noise: { type: 'white' },
  envelope: { attack: 0.003, decay: 0.04, sustain: 0 },
  volume: -20,
}).connect(drumBus);

function playShaker(): void {
  const t = Tone.now();
  shakerA.triggerAttackRelease('32n', t);
  shakerB.triggerAttackRelease('64n', t + 0.012);
}

export type DrumName =
  | 'kick'
  | 'snare'
  | 'hihatClosed'
  | 'hihatOpen'
  | 'clap'
  | 'rim'
  | 'tomLow'
  | 'tomMid'
  | 'tomHigh'
  | 'crash'
  | 'ride'
  | 'shaker';

export const drums: Record<DrumName, { label: string; play: () => void }> = {
  kick: { label: 'Kick', play: playKick },
  snare: { label: 'Snare', play: playSnare },
  hihatClosed: { label: 'HH Closed', play: playHihatClosed },
  hihatOpen: { label: 'HH Open', play: playHihatOpen },
  clap: { label: 'Clap', play: playClap },
  rim: { label: 'Rim', play: playRim },
  tomLow: { label: 'Tom Low', play: playTomLow },
  tomMid: { label: 'Tom Mid', play: playTomMid },
  tomHigh: { label: 'Tom High', play: playTomHigh },
  crash: { label: 'Crash', play: playCrash },
  ride: { label: 'Ride', play: playRide },
  shaker: { label: 'Shaker', play: playShaker },
};

// ============================================================
// Pitched instruments. Piano uses the freely available
// Salamander piano samples streamed from the Tone.js CDN
// (no audio files committed). Everything else is synthesised.
// ============================================================

const instBus = new Tone.Gain(0.75).toDestination();

const pianoSampler = new Tone.Sampler({
  urls: {
    A1: 'A1.mp3',
    A2: 'A2.mp3',
    A3: 'A3.mp3',
    A4: 'A4.mp3',
    A5: 'A5.mp3',
    A6: 'A6.mp3',
    C2: 'C2.mp3',
    C3: 'C3.mp3',
    C4: 'C4.mp3',
    C5: 'C5.mp3',
    C6: 'C6.mp3',
    'D#2': 'Ds2.mp3',
    'D#3': 'Ds3.mp3',
    'D#4': 'Ds4.mp3',
    'D#5': 'Ds5.mp3',
    'F#2': 'Fs2.mp3',
    'F#3': 'Fs3.mp3',
    'F#4': 'Fs4.mp3',
    'F#5': 'Fs5.mp3',
  },
  baseUrl: 'https://tonejs.github.io/audio/salamander/',
  release: 1,
}).connect(instBus);

const ePianoSynth = new Tone.PolySynth(Tone.FMSynth, {
  harmonicity: 3,
  modulationIndex: 14,
  oscillator: { type: 'sine' },
  envelope: { attack: 0.002, decay: 0.6, sustain: 0.2, release: 1.2 },
  modulation: { type: 'square' },
  modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 },
  volume: -6,
}).connect(instBus);

const synthLead = new Tone.PolySynth(Tone.MonoSynth, {
  oscillator: { type: 'sawtooth' },
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.4 },
  filter: { Q: 2, type: 'lowpass', rolloff: -24 },
  filterEnvelope: {
    attack: 0.01,
    decay: 0.4,
    sustain: 0.3,
    release: 0.5,
    baseFrequency: 300,
    octaves: 4,
  },
  volume: -10,
}).connect(instBus);

const padSynth = new Tone.PolySynth(Tone.AMSynth, {
  harmonicity: 2,
  oscillator: { type: 'sine' },
  envelope: { attack: 0.9, decay: 0.5, sustain: 0.8, release: 2.5 },
  modulation: { type: 'sine' },
  modulationEnvelope: { attack: 1, decay: 0.5, sustain: 0.6, release: 2 },
  volume: -8,
}).connect(instBus);

const violinSynth = new Tone.PolySynth(Tone.AMSynth, {
  harmonicity: 1.5,
  oscillator: { type: 'sawtooth' },
  envelope: { attack: 0.2, decay: 0.1, sustain: 0.8, release: 0.6 },
  modulation: { type: 'sine' },
  modulationEnvelope: { attack: 0.3, decay: 0.2, sustain: 0.7, release: 0.6 },
  volume: -10,
}).connect(instBus);

const bass808 = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'sine' },
  envelope: { attack: 0.001, decay: 0.5, sustain: 0.1, release: 1.8 },
  volume: -4,
}).connect(instBus);

const subBass = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'sine' },
  envelope: { attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.6 },
  volume: -2,
}).connect(instBus);

export type InstrumentName =
  | 'piano'
  | 'ePiano'
  | 'synthLead'
  | 'pad'
  | 'violin'
  | 'bass808'
  | 'subBass';

export type InstrumentDef = {
  label: string;
  defaultOctave: number;
  noteDuration: string;
  isLoaded: () => boolean;
  play: (note: string) => void;
};

export const instruments: Record<InstrumentName, InstrumentDef> = {
  piano: {
    label: 'Piano',
    defaultOctave: 3,
    noteDuration: '1n',
    isLoaded: () => pianoSampler.loaded,
    play: (note) => {
      if (pianoSampler.loaded) pianoSampler.triggerAttackRelease(note, '1n');
    },
  },
  ePiano: {
    label: 'E-Piano',
    defaultOctave: 3,
    noteDuration: '2n',
    isLoaded: () => true,
    play: (note) => ePianoSynth.triggerAttackRelease(note, '2n'),
  },
  synthLead: {
    label: 'Synth Lead',
    defaultOctave: 4,
    noteDuration: '4n',
    isLoaded: () => true,
    play: (note) => synthLead.triggerAttackRelease(note, '4n'),
  },
  pad: {
    label: 'Pad',
    defaultOctave: 3,
    noteDuration: '2n',
    isLoaded: () => true,
    play: (note) => padSynth.triggerAttackRelease(note, '2n'),
  },
  violin: {
    label: 'Violin',
    defaultOctave: 4,
    noteDuration: '2n',
    isLoaded: () => true,
    play: (note) => violinSynth.triggerAttackRelease(note, '2n'),
  },
  bass808: {
    label: '808 Bass',
    defaultOctave: 1,
    noteDuration: '2n',
    isLoaded: () => true,
    play: (note) => bass808.triggerAttackRelease(note, '2n'),
  },
  subBass: {
    label: 'Sub Bass',
    defaultOctave: 1,
    noteDuration: '2n',
    isLoaded: () => true,
    play: (note) => subBass.triggerAttackRelease(note, '2n'),
  },
};
