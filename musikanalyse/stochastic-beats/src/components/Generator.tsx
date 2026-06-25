import { useEffect, useMemo, useRef, useState } from 'react';
import { generate, type DurationMin, type Mood, type Song } from '../music/generator';
import { KEY_NAMES, type Mode } from '../music/theory';
import { Player } from '../music/player';
import { downloadBlob, exportMidi, exportWav } from '../music/export';

const MOODS: Mood[] = ['chill', 'vibe', 'hype'];
const DURATIONS: DurationMin[] = [1, 2, 3];

type RootChoice = 'auto' | (typeof KEY_NAMES)[number];
type ModeChoice = 'auto' | Mode;

const SECTION_COLORS: Record<string, string> = {
  I: '#3a4250',
  A: '#4d5b6e',
  B: '#ff7a59',
  C: '#a07acc',
  O: '#3a4250',
};
const SECTION_LABELS: Record<string, string> = {
  I: 'Intro',
  A: 'Verse',
  B: 'Chorus',
  C: 'Bridge',
  O: 'Outro',
};

function randomSeed(): string {
  // Friendly word-ish seed. Just a few syllables joined with numbers.
  const syl = ['lo', 'fi', 'da', 'be', 'ka', 'mo', 'zu', 'ra', 'ne', 'pi', 'shi', 'on'];
  const pick = () => syl[Math.floor(Math.random() * syl.length)];
  return `${pick()}${pick()}-${Math.floor(Math.random() * 1000)}`;
}

export function GeneratorView() {
  const [seed, setSeed] = useState<string>(() => randomSeed());
  const [durationMin, setDurationMin] = useState<DurationMin>(1);
  const [mood, setMood] = useState<Mood>('vibe');
  const [rootChoice, setRootChoice] = useState<RootChoice>('auto');
  const [modeChoice, setModeChoice] = useState<ModeChoice>('auto');

  const [song, setSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [wavRendering, setWavRendering] = useState(false);
  const [wavProgress, setWavProgress] = useState(0);

  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) playerRef.current = new Player();

  useEffect(() => {
    const p = playerRef.current!;
    p.setCallbacks({
      onTick: (e) => setElapsed(e),
      onEnd: () => {
        setIsPlaying(false);
        setElapsed(0);
      },
    });
    return () => p.stop();
  }, []);

  const generateSong = () => {
    playerRef.current?.stop();
    setIsPlaying(false);
    setElapsed(0);
    const s = generate({
      seed,
      durationMin,
      mood,
      rootChoice,
      modeChoice,
    });
    setSong(s);
    playerRef.current!.load(s);
  };

  const handlePlay = () => {
    if (!song) return;
    if (isPlaying) {
      playerRef.current!.stop();
      setIsPlaying(false);
      setElapsed(0);
    } else {
      playerRef.current!.play();
      setIsPlaying(true);
    }
  };

  const handleNewSeed = () => setSeed(randomSeed());

  const slug = (s: string) => s.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'song';

  const handleExportMidi = () => {
    if (!song) return;
    const blob = exportMidi(song);
    downloadBlob(blob, `stochastic-beats_${slug(song.meta.seed)}.mid`);
  };

  const handleExportWav = async () => {
    if (!song || wavRendering) return;
    setWavRendering(true);
    setWavProgress(0);
    try {
      const blob = await exportWav(song, (p) => setWavProgress(p));
      downloadBlob(blob, `stochastic-beats_${slug(song.meta.seed)}.wav`);
    } finally {
      setWavRendering(false);
      setWavProgress(0);
    }
  };

  const eventStats = useMemo(() => {
    if (!song) return null;
    let drums = 0;
    let notes = 0;
    for (const e of song.events) {
      if (e.kind === 'drum') drums++;
      else notes++;
    }
    return { drums, notes, total: song.events.length };
  }, [song]);

  return (
    <div className="generator">
      <section className="gen-controls">
        <div className="gen-row">
          <label className="gen-label">Seed</label>
          <input
            className="gen-seed"
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="z. B. lofi-42"
          />
          <button className="gen-mini-btn" onClick={handleNewSeed}>
            ↻ Zufall
          </button>
        </div>

        <div className="gen-row">
          <span className="gen-label">Dauer</span>
          <div className="gen-pills">
            {DURATIONS.map((d) => (
              <button
                key={d}
                className={`gen-pill${durationMin === d ? ' active' : ''}`}
                onClick={() => setDurationMin(d)}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        <div className="gen-row">
          <span className="gen-label">Vibe</span>
          <div className="gen-pills">
            {MOODS.map((m) => (
              <button
                key={m}
                className={`gen-pill${mood === m ? ' active' : ''}`}
                onClick={() => setMood(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="gen-row">
          <span className="gen-label">Tonart</span>
          <select
            className="gen-select"
            value={rootChoice}
            onChange={(e) => setRootChoice(e.target.value as RootChoice)}
          >
            <option value="auto">auto</option>
            {KEY_NAMES.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            className="gen-select"
            value={modeChoice}
            onChange={(e) => setModeChoice(e.target.value as ModeChoice)}
          >
            <option value="auto">auto</option>
            <option value="major">major</option>
            <option value="minor">minor</option>
          </select>
        </div>

        <div className="gen-row">
          <button className="gen-primary" onClick={generateSong}>
            ⚡ Beat generieren
          </button>
          <button
            className={`gen-secondary${!song ? ' disabled' : ''}`}
            onClick={handlePlay}
            disabled={!song}
          >
            {isPlaying ? '■ Stop' : '▶ Play'}
          </button>
          <button
            className={`gen-secondary${!song ? ' disabled' : ''}`}
            onClick={handleExportMidi}
            disabled={!song}
            title="Standard MIDI File"
          >
            ⤓ MIDI
          </button>
          <button
            className={`gen-secondary${!song || wavRendering ? ' disabled' : ''}`}
            onClick={handleExportWav}
            disabled={!song || wavRendering}
            title="Offline-Rendering der echten Synth-Sounds"
          >
            {wavRendering ? `Rendering… ${Math.round(wavProgress * 100)}%` : '⤓ WAV'}
          </button>
        </div>
      </section>

      {song && (
        <section className="gen-output">
          <SongMeta song={song} eventStats={eventStats} />
          <SongTimeline song={song} elapsed={elapsed} isPlaying={isPlaying} />
        </section>
      )}
    </div>
  );
}

function SongMeta({
  song,
  eventStats,
}: {
  song: Song;
  eventStats: { drums: number; notes: number; total: number } | null;
}) {
  const { meta } = song;
  return (
    <div className="meta-grid">
      <Meta label="Seed" value={meta.seed} />
      <Meta label="Key" value={meta.keyLabel} />
      <Meta label="Tempo" value={`${meta.bpm} BPM`} />
      <Meta label="Bars" value={`${meta.totalBars}`} />
      <Meta
        label="Länge"
        value={`${Math.floor(meta.totalDurationSec / 60)}:${String(
          Math.round(meta.totalDurationSec % 60),
        ).padStart(2, '0')}`}
      />
      <Meta
        label="Progression"
        value={`${meta.progA.join('–')}  /  ${meta.progB.join('–')}`}
      />
      {eventStats && (
        <Meta
          label="Events"
          value={`${eventStats.total} (${eventStats.drums} drum / ${eventStats.notes} note)`}
        />
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-item">
      <div className="meta-label">{label}</div>
      <div className="meta-value">{value}</div>
    </div>
  );
}

function SongTimeline({
  song,
  elapsed,
  isPlaying,
}: {
  song: Song;
  elapsed: number;
  isPlaying: boolean;
}) {
  const total = song.meta.totalDurationSec;
  const progress = Math.min(1, Math.max(0, elapsed / total));

  return (
    <div className="timeline-wrap">
      <div className="timeline-track">
        {song.meta.structure.map((s, i) => {
          const left = (s.startTime / total) * 100;
          const width = (s.durationSec / total) * 100;
          return (
            <div
              key={i}
              className="timeline-section"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: SECTION_COLORS[s.type],
              }}
              title={`${SECTION_LABELS[s.type]} (${s.bars} bars)`}
            >
              <span className="timeline-section-label">{SECTION_LABELS[s.type]}</span>
            </div>
          );
        })}
        <div
          className={`timeline-playhead${isPlaying ? ' playing' : ''}`}
          style={{ left: `${progress * 100}%` }}
        />
      </div>
      <div className="timeline-time">
        {formatTime(elapsed)} / {formatTime(total)}
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
