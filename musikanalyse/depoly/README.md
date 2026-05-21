# scripts/depoly.py

Turns a polyphonic vocal score into a **study layout** for intabulation work:

- **top** — a keyboard grand staff (the *Reduction*): every voice of the
  source kept at its original durations, split treble/bass by pitch and braced
  together
- **bottom** — a single **theorbo / lute** staff in intabulation style: each
  note is struck exactly once at its original onset and held until the next
  onset anywhere in the texture (no re-attacks, no ties for sustain). By default
  it is written in bass clef, an octave lower (theorbo).

This is *not* `music21`'s `chordify()`: a long note is **truncated** whenever a
shorter voice moves underneath it — it rings once and stops, like a plucked
string.

## Requirements

- Python 3 with [`music21`](https://web.mit.edu/music21/) and
  [`python-ly`](https://pypi.org/project/python-ly/)
  (`pip install music21 python-ly`)
- [MuseScore 4](https://musescore.org/) — only needed for `.mscz` input or for
  `--mscz` / `--pdf` / `--open` output. The script looks for the macOS binary at
  `/Applications/MuseScore 4.app/Contents/MacOS/mscore` (or `mscore` on PATH).

## Usage

```bash
python3 depoly.py INPUT [-o OUT.musicxml] [--staff N] [--split C4] \
                  [--lute-clef bass] [--lute-octave -1] [--mscz] [--pdf] [--open]
```

| flag | meaning | default |
|------|---------|---------|
| `INPUT` | `.ly`, `.musicxml` / `.xml` / `.mxl`, or `.mscz` | — |
| `-o, --output` | output MusicXML path | `<input>-depoly.musicxml` |
| `--staff N` | 0-based part index to use as the source; omit to combine **all** parts (e.g. a 6-voice motet → one grand staff + one theorbo staff) | all parts |
| `--split` | treble/bass split pitch for the grand staff | `C4` |
| `--lute-clef` | `bass` (theorbo), `treble_8`, `treble`, `alto` | `bass` |
| `--lute-octave` | octaves to transpose the lute staff (`0` = none) | `-1` |
| `--mscz` / `--pdf` | also render via the MuseScore CLI | off |
| `--open` | render `.mscz` and open it in MuseScore (macOS) | off |

### Examples

```bash
# Full default: 6-voice .ly -> grand staff + theorbo (bass, 8va bassa), open it
python3 depoly.py "Judas mercator.ly" --open

# Keep the lute on a G clef at written pitch
python3 depoly.py input.ly --lute-clef treble_8 --lute-octave 0

# Only flatten one source staff (0-based index)
python3 depoly.py input.mxl --staff 1
```

## LilyPond input

`music21` can't read `.ly`, and python-ly's MusicXML exporter chokes on the
markup / Scheme / lyrics / `\paper` / `\layout` blocks found in published
editions (notably the Nancho Álvarez / tomasluisdevictoria.org corpus — it
crashes on Scheme lists such as `keepAliveInterfaces`). The built-in
`clean_ly()` pass strips that down to a minimal score (key + time + the voice
variables) before conversion. It is tuned to that corpus's conventions; other
LilyPond dialects may need the cleaner extended.

Title and composer are read from the original `\header` (the `subtitle` is
intentionally dropped, since MuseScore renders it as the main heading).
