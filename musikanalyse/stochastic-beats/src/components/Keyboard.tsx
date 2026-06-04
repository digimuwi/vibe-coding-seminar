const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

const WHITE_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};
const BLACK_AFTER: Record<string, { name: string; semitone: number } | null> = {
  C: { name: 'C#', semitone: 1 },
  D: { name: 'D#', semitone: 3 },
  E: null,
  F: { name: 'F#', semitone: 6 },
  G: { name: 'G#', semitone: 8 },
  A: { name: 'A#', semitone: 10 },
  B: null,
};

// Per-octave hints showing which typing-keyboard key triggers each note.
// Index 0 = base octave (lower row), index 1 = octave above (upper row).
const HINTS_BY_OCTAVE: Record<number, string[]> = {
  0: ['Z', 'S', 'X', 'D', 'C', 'V', 'G', 'B', 'H', 'N', 'J', 'M'],
  1: ['Q', '2', 'W', '3', 'E', 'R', '5', 'T', '6', 'Y', '7', 'U'],
};

const WHITE_WIDTH = 44;
const BLACK_WIDTH = 26;

type KeyboardProps = {
  startOctave?: number;
  octaves?: number;
  activeNote?: string | null;
  onPress: (note: string) => void;
};

export function Keyboard({
  startOctave = 3,
  octaves = 2,
  activeNote,
  onPress,
}: KeyboardProps) {
  const whites: Array<{ note: string; hint: string | null }> = [];
  const blacks: Array<{ note: string; left: number; hint: string | null }> = [];

  let whiteIndex = 0;
  for (let o = 0; o < octaves; o++) {
    const octave = startOctave + o;
    const octHints: string[] | undefined = HINTS_BY_OCTAVE[o];
    for (const key of WHITE_KEYS) {
      const semitone = WHITE_SEMITONES[key];
      whites.push({
        note: `${key}${octave}`,
        hint: octHints ? octHints[semitone] ?? null : null,
      });
      const black = BLACK_AFTER[key];
      if (black) {
        const left = (whiteIndex + 1) * WHITE_WIDTH - BLACK_WIDTH / 2;
        blacks.push({
          note: `${black.name}${octave}`,
          left,
          hint: octHints ? octHints[black.semitone] ?? null : null,
        });
      }
      whiteIndex++;
    }
  }

  const width = whites.length * WHITE_WIDTH;

  return (
    <div className="keyboard" style={{ width }}>
      <div className="keyboard-whites">
        {whites.map((k) => (
          <button
            key={k.note}
            className={`key white${activeNote === k.note ? ' active' : ''}`}
            style={{ width: WHITE_WIDTH }}
            onMouseDown={() => onPress(k.note)}
          >
            {k.hint && <span className="key-hint">{k.hint}</span>}
            <span className="key-label">{k.note}</span>
          </button>
        ))}
      </div>
      <div className="keyboard-blacks">
        {blacks.map((k) => (
          <button
            key={k.note}
            className={`key black${activeNote === k.note ? ' active' : ''}`}
            style={{ left: k.left, width: BLACK_WIDTH }}
            onMouseDown={() => onPress(k.note)}
            aria-label={k.note}
          >
            {k.hint && <span className="key-hint">{k.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
