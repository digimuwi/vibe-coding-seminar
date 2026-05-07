# Music Analyzer

A browser-based tool for rendering MusicXML scores and overlaying an automated **functional harmonic analysis** (Riemannian Funktionstheorie) on the notation.

## Getting started

```bash
npm install
npm run dev        # opens at http://localhost:5173
```

## Usage

1. Upload a MusicXML file (`.xml` or `.musicxml`) via drag-and-drop or the file picker.
2. The score is rendered using [Verovio](https://www.verovio.org) and displayed at full width.
3. Functional harmony labels are overlaid below each measure, positioned at the beat where each chord change occurs.

Only `score-partwise` MusicXML is supported. `score-timewise` and compressed `.mxl` files are not.

## Functional analysis

Chords are identified using the [tonal](https://github.com/tonaljs/tonal) library and labeled with symbols from **Riemannian Funktionstheorie**:

| Symbol | Meaning |
|--------|---------|
| **T** | Tonic (major) |
| **t** | Tonic (minor) |
| **S** / **s** | Subdominant |
| **D** | Dominant |
| **D⁷** | Dominant seventh |
| **D°** | Leading-tone diminished |
| **Tp** / **Sp** / **Dp** | Minor parallels of T, S, D (major key) |
| **tP** / **sP** / **dP** | Major parallels of t, s, d (minor key) |
| **Tg** / **Sg** | Gegenklänge (Leittonwechselklänge) |

Non-diatonic chords fall back to their chord symbol (e.g. `A7`).

The key is detected from the MusicXML `<key>` element. Beat positions are derived from the time signature so that each label sits at its rhythmic position within the bar.

## Multi-voice scores

The parser handles multi-voice scores (e.g. SATB chorales) correctly: `<backup>` and `<forward>` elements are tracked so that notes in different voices are assigned the right beat positions and grouped into chords.

A preprocessing step consolidates split `<attributes>` blocks — a common export artefact where clef definitions for lower staves appear in a second attributes element rather than the first — so that Verovio renders clefs in the correct position.

## Stack

- [React 19](https://react.dev) + TypeScript + [Vite](https://vite.dev)
- [Verovio](https://www.verovio.org) (WASM, runs in a Web Worker)
- [tonal](https://github.com/tonaljs/tonal)
