import * as Tone from 'tone';
import { drums, instruments, releaseAllInstruments } from '../audio';
import type { Song, SongEvent } from './generator';

// Plays a generated Song. Each event is scheduled via Tone.Transport at its
// absolute time-in-seconds. Using Transport (rather than raw triggerAttack-
// Release at absolute audio-context times) lets us cancel everything cleanly
// on stop() via Transport.cancel().
//
// We set bpm = 60 so Transport time "in seconds" equals time-in-transport,
// which makes `event.time` (already in seconds) directly schedulable as
// the Transport time.

export type PlayerCallbacks = {
  onTick?: (elapsedSec: number) => void;
  onEnd?: () => void;
};

// While the song is playing we need a non-zero scheduler look-ahead so
// the audio thread can dispatch the thousands of pre-scheduled events
// glitch-free. Interactive triggers (sound tester) keep their zero-
// latency default; the Player saves & restores the value around play().
const PLAYBACK_LOOKAHEAD = 0.1;

export class Player {
  private song: Song | null = null;
  private callbacks: PlayerCallbacks = {};
  private rafId: number | null = null;
  private endTimeoutId: number | null = null;
  private playing = false;
  private prevLookAhead: number | null = null;

  load(song: Song): void {
    this.stop();
    this.song = song;
  }

  setCallbacks(cb: PlayerCallbacks): void {
    this.callbacks = cb;
  }

  play(): void {
    if (!this.song || this.playing) return;
    const song = this.song;
    this.playing = true;

    const ctx = Tone.getContext();
    this.prevLookAhead = ctx.lookAhead as number;
    ctx.lookAhead = PLAYBACK_LOOKAHEAD;

    const transport = Tone.getTransport();

    // Reset Transport state.
    transport.stop();
    transport.cancel(0);
    transport.position = 0;
    transport.bpm.value = 60; // 1 beat == 1 second → event.time (s) == transport time

    // Schedule each event.
    for (const ev of song.events) {
      transport.schedule((t) => this.trigger(ev, t), ev.time);
    }

    // Schedule an end callback shortly after the last event finishes.
    const endAt = song.meta.totalDurationSec + 0.5;
    transport.schedule(() => {
      // Defer to next macrotask so audio-side cleanup doesn't race the UI.
      this.endTimeoutId = window.setTimeout(() => this.handleEnd(), 0);
    }, endAt);

    transport.start();

    // Visual playhead via rAF (reads Transport.seconds).
    const tick = () => {
      if (!this.playing) return;
      const elapsed = transport.seconds;
      this.callbacks.onTick?.(Math.max(0, elapsed));
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.endTimeoutId !== null) {
      clearTimeout(this.endTimeoutId);
      this.endTimeoutId = null;
    }
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);

    // Release any sustained PolySynth voices so pads/bass don't ring on after stop.
    releaseAll();
    this.restoreLookAhead();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  // -------------------------------------------------------------

  private handleEnd(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    releaseAll();
    this.restoreLookAhead();
    this.callbacks.onEnd?.();
  }

  private restoreLookAhead(): void {
    if (this.prevLookAhead !== null) {
      Tone.getContext().lookAhead = this.prevLookAhead;
      this.prevLookAhead = null;
    }
  }

  private trigger(ev: SongEvent, t: number): void {
    if (ev.kind === 'drum') {
      drums[ev.name].play(t);
    } else {
      instruments[ev.instrument].play(ev.note, t, ev.durationSec);
    }
  }
}

// Release every pitched voice currently held.
function releaseAll(): void {
  releaseAllInstruments();
}
