import { useEffect, useRef, useState } from 'react';
import {
  drums,
  instruments,
  noteFromSemitones,
  type DrumName,
  type InstrumentName,
} from '../audio';
import { Keyboard } from './Keyboard';

type Mode = 'drum' | 'piano';

const DRUM_ORDER: DrumName[] = [
  'kick',
  'snare',
  'hihatClosed',
  'hihatOpen',
  'clap',
  'rim',
  'tomLow',
  'tomMid',
  'tomHigh',
  'crash',
  'ride',
  'shaker',
];

const DRUM_KEY_LABELS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];
const DRUM_CODES = [
  'KeyQ', 'KeyW', 'KeyE', 'KeyR',
  'KeyA', 'KeyS', 'KeyD', 'KeyF',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV',
];

// Classic typing-keyboard piano layout (Ableton / FL Studio style).
// Lower row = base octave, upper row = one octave higher.
const PIANO_CODE_TO_SEMITONES: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5,
  KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17,
  Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
  KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
};

const INSTRUMENT_ORDER: InstrumentName[] = [
  'piano',
  'ePiano',
  'synthLead',
  'pad',
  'violin',
  'bass808',
  'subBass',
];

export function SoundTester() {
  const [instrument, setInstrument] = useState<InstrumentName>('piano');
  const [pianoReady, setPianoReady] = useState(instruments.piano.isLoaded());
  const [mode, setMode] = useState<Mode>('drum');
  const [flashing, setFlashing] = useState<DrumName | null>(null);
  const [activeNote, setActiveNote] = useState<string | null>(null);

  const instrumentRef = useRef(instrument);
  const modeRef = useRef(mode);
  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (pianoReady) return;
    const id = window.setInterval(() => {
      if (instruments.piano.isLoaded()) {
        setPianoReady(true);
        window.clearInterval(id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [pianoReady]);

  const flashDrum = (name: DrumName) => {
    setFlashing(name);
    window.setTimeout(() => setFlashing((c) => (c === name ? null : c)), 90);
  };
  const flashNote = (note: string) => {
    setActiveNote(note);
    window.setTimeout(() => setActiveNote((c) => (c === note ? null : c)), 180);
  };

  useEffect(() => {
    const down = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (down.has(e.code)) return;

      if (modeRef.current === 'drum') {
        const idx = DRUM_CODES.indexOf(e.code);
        if (idx >= 0 && idx < DRUM_ORDER.length) {
          const name = DRUM_ORDER[idx];
          drums[name].play();
          flashDrum(name);
          down.add(e.code);
          e.preventDefault();
        }
      } else {
        const semitones = PIANO_CODE_TO_SEMITONES[e.code];
        if (semitones !== undefined) {
          const inst = instruments[instrumentRef.current];
          const note = noteFromSemitones(inst.defaultOctave, semitones);
          inst.play(note);
          flashNote(note);
          down.add(e.code);
          e.preventDefault();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      down.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const inst = instruments[instrument];
  const startOctave = inst.defaultOctave;

  return (
    <div className="sound-tester">
      <div className="mode-toggle">
        <span className="mode-label">Tastatur-Modus</span>
        <button
          className={`mode-btn${mode === 'drum' ? ' active' : ''}`}
          onClick={() => setMode('drum')}
        >
          Drum Mode
        </button>
        <button
          className={`mode-btn${mode === 'piano' ? ' active' : ''}`}
          onClick={() => setMode('piano')}
        >
          Piano Roll Mode
        </button>
      </div>

      <section className={`block${mode === 'drum' ? ' active-block' : ''}`}>
        <h2 className="section-title">Drums</h2>
        <div className="pad-grid">
          {DRUM_ORDER.map((name, i) => (
            <button
              key={name}
              className={`pad${flashing === name ? ' flash' : ''}`}
              onMouseDown={() => {
                drums[name].play();
                flashDrum(name);
              }}
            >
              <span className="pad-key">{DRUM_KEY_LABELS[i]}</span>
              <span className="pad-label">{drums[name].label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={`block${mode === 'piano' ? ' active-block' : ''}`}>
        <h2 className="section-title">Instrumente</h2>
        <div className="instrument-selector">
          {INSTRUMENT_ORDER.map((id) => (
            <button
              key={id}
              className={`inst-btn${instrument === id ? ' active' : ''}`}
              onClick={() => setInstrument(id)}
            >
              {instruments[id].label}
            </button>
          ))}
        </div>
        {instrument === 'piano' && !pianoReady && (
          <p className="loading-note">Klavier-Samples werden geladen…</p>
        )}
        <div className="keyboard-wrap">
          <Keyboard
            startOctave={startOctave}
            octaves={2}
            activeNote={activeNote}
            onPress={(note) => {
              inst.play(note);
              flashNote(note);
            }}
          />
        </div>
        <p className="keyboard-hint">
          Untere Tastenreihe (Z S X D C V G B H N J M) spielt eine Oktave,
          obere Reihe (Q 2 W 3 E R 5 T 6 Y 7 U) die Oktave darüber.
        </p>
      </section>
    </div>
  );
}
