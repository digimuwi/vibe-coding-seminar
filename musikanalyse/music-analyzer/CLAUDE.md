# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Type-check (tsc -b) then production build
npm run lint      # Run ESLint across TypeScript/TSX
npm run preview   # Serve the production build locally
```

## Architecture

React 19 + TypeScript + Vite frontend. Two key dependencies beyond React:
- **Verovio 6.1.0** — C++ music notation renderer compiled to WASM; runs in a Web Worker
- **tonal** — music theory library used for chord detection and key analysis

### Data flow

```
File upload
  → preprocessMusicXML()       src/lib/musicxml-preprocessor.ts
  → parseMusicXML()            src/lib/musicxml-parser.ts        (main thread)
  → analyzeHarmony()           src/lib/harmony-analyzer.ts       (main thread)
  → verovio.worker postMessage                                    (Web Worker)
  → ScoreViewer overlay        src/components/ScoreViewer.tsx
```

### Key files

| File | Role |
|------|------|
| `src/lib/musicxml-preprocessor.ts` | Fixes split `<attributes>` blocks in grand-staff scores — consolidates clef definitions from mid-measure attribute elements into the first one |
| `src/lib/musicxml-parser.ts` | Parses `score-partwise` MusicXML; handles `<backup>`/`<forward>` for multi-voice scores; extracts notes with beat positions, key signature, and time signature |
| `src/lib/harmony-analyzer.ts` | Groups notes by (measure, beat) rounded to the nearest eighth note, runs `Chord.detect()`, maps chords to Riemannian functional symbols (T, S, D, Tp, Sp, Dp, …) |
| `src/workers/verovio.worker.ts` | Loads Verovio WASM (`verovio/wasm` + `verovio/esm`), renders MusicXML to SVG page arrays |
| `src/components/ScoreViewer.tsx` | Injects Verovio SVG pages into the DOM, then queries `g.measure` bounding boxes to position functional labels at the correct beat fraction within each measure |
| `src/types/music.ts` | Shared types: `ParsedNote`, `BeatChord`, `HarmonyAnalysis` |

### Verovio worker

Import pattern (no TypeScript types shipped with the package — declarations are in `src/verovio.d.ts`):

```ts
import createVerovioModule from 'verovio/wasm';   // WASM factory
import { VerovioToolkit } from 'verovio/esm';      // class wrapper
```

Verovio is excluded from Vite's dep optimiser (`optimizeDeps.exclude`) to prevent the bundler from breaking its internal WASM loading path. Worker format is `'es'`.

### Functional harmony labeling

`toFunctionalLabel()` in `harmony-analyzer.ts` maps `(semitone interval from tonic, chord quality)` → Riemannian symbol. Intervals are computed mod 12 from the tonic chroma. The `beatsPerMeasure` value (quarter-note beats, derived from `<beats>` × 4 / `<beat-type>`) is threaded through to `ScoreViewer` to position labels proportionally within each measure.

### React Compiler

Enabled via `babel-plugin-react-compiler` + `@rolldown/plugin-babel`. Avoid redundant `useMemo`/`useCallback` — the compiler handles memoisation automatically.

TypeScript: strict bundler mode, ES2023 target, unused variable/parameter checks on.
