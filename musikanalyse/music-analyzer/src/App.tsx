import { useState, useRef, useEffect, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import ScoreViewer from './components/ScoreViewer';
import { preprocessMusicXML } from './lib/musicxml-preprocessor';
import { parseMusicXML } from './lib/musicxml-parser';
import { analyzeHarmony } from './lib/harmony-analyzer';
import type { HarmonyAnalysis } from './types/music';
import './App.css';

type AppState =
  | { phase: 'idle' }
  | { phase: 'loading'; fileName: string }
  | { phase: 'done'; svgPages: string[]; analysis: HarmonyAnalysis; fileName: string }
  | { phase: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<AppState>({ phase: 'idle' });
  const workerRef = useRef<Worker | null>(null);
  const pendingAnalysis = useRef<HarmonyAnalysis | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/verovio.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'result') {
        const analysis = pendingAnalysis.current;
        if (analysis) {
          setState(prev =>
            'fileName' in prev
              ? { phase: 'done', svgPages: msg.svgPages, analysis, fileName: prev.fileName }
              : prev,
          );
        }
      } else if (msg.type === 'error') {
        setState({ phase: 'error', message: msg.message });
      }
    };

    return () => worker.terminate();
  }, []);

  const handleFile = useCallback((file: File) => {
    setState({ phase: 'loading', fileName: file.name });
    pendingAnalysis.current = null;

    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target?.result as string;
      try {
        const xml = preprocessMusicXML(raw);
        const { notes, tonic, mode, beatsPerMeasure, measureCount } = parseMusicXML(xml);
        const analysis = analyzeHarmony(notes, tonic, mode, beatsPerMeasure, measureCount);
        pendingAnalysis.current = analysis;
        workerRef.current?.postMessage({ type: 'render', xml, chords: analysis.chords });
      } catch (err) {
        setState({
          phase: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };
    reader.onerror = () => setState({ phase: 'error', message: 'Failed to read file.' });
    reader.readAsText(file);
  }, []);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Music Analyzer</h1>
        {state.phase === 'done' && (
          <div className="app-header-meta">
            <span className="key-badge">{state.analysis.keyLabel}</span>
            <span className="file-name">{state.fileName}</span>
            <button className="reset-btn" onClick={reset}>← New file</button>
          </div>
        )}
        {state.phase === 'loading' && (
          <span className="status-text">Rendering {state.fileName}…</span>
        )}
      </header>

      <main className="app-main">
        {state.phase === 'idle' && (
          <div className="upload-wrapper">
            <FileUpload onFile={handleFile} />
            <p className="hint">
              Roman numeral analysis will be overlaid on the rendered score.
            </p>
          </div>
        )}

        {state.phase === 'loading' && (
          <div className="spinner-wrapper">
            <div className="spinner" />
            <p>Analyzing and rendering…</p>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="error-box">
            <strong>Error</strong>
            <p>{state.message}</p>
            <button onClick={reset}>Try again</button>
          </div>
        )}

        {state.phase === 'done' && (
          <ScoreViewer svgPages={state.svgPages} analysis={state.analysis} />
        )}
      </main>
    </div>
  );
}
