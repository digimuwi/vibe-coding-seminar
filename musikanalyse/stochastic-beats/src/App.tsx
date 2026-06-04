import { useState } from 'react';
import { startAudio } from './audio';
import { SoundTester } from './components/SoundTester';
import './App.css';

type Tab = 'sounds' | 'generator';

export default function App() {
  const [tab, setTab] = useState<Tab>('sounds');
  const [audioReady, setAudioReady] = useState(false);

  const handleStart = async () => {
    await startAudio();
    setAudioReady(true);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Stochastic Beats</h1>
        <nav className="tabs">
          <button
            className={`tab${tab === 'sounds' ? ' active' : ''}`}
            onClick={() => setTab('sounds')}
          >
            Sounds
          </button>
          <button
            className={`tab${tab === 'generator' ? ' active' : ''}`}
            onClick={() => setTab('generator')}
          >
            Generator
          </button>
        </nav>
      </header>

      <main className="app-main">
        {!audioReady ? (
          <div className="audio-gate">
            <button className="start-button" onClick={handleStart}>
              Audio starten
            </button>
            <p className="gate-hint">
              Browser brauchen einen Klick, bevor sie Ton abspielen dürfen.
            </p>
          </div>
        ) : tab === 'sounds' ? (
          <SoundTester />
        ) : (
          <div className="placeholder">
            <h2>Beat-Generator</h2>
            <p>
              Hier kommt später der eigentliche Generator. Er wird auf Basis
              eines stochastischen Prozesses und eines minimalen Regelsatzes
              Beats erzeugen.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
