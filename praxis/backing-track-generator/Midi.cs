using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace BackingTrack
{
    // Direkter Zugriff auf den in Windows eingebauten GM-Synth - keine Zusatzbibliotheken.
    public class MidiOut : IDisposable
    {
        [DllImport("winmm.dll")] static extern int midiOutOpen(out IntPtr handle, uint deviceId, IntPtr cb, IntPtr inst, uint flags);
        [DllImport("winmm.dll")] static extern int midiOutShortMsg(IntPtr handle, uint msg);
        [DllImport("winmm.dll")] static extern int midiOutClose(IntPtr handle);

        const uint MidiMapper = 0xFFFFFFFF;
        IntPtr _h;

        public MidiOut()
        {
            int res = midiOutOpen(out _h, MidiMapper, IntPtr.Zero, IntPtr.Zero, 0);
            if (res != 0) throw new InvalidOperationException("MIDI-Ausgang konnte nicht geoeffnet werden (Code " + res + ")");
        }

        void Msg(int status, int d1, int d2)
        {
            midiOutShortMsg(_h, (uint)(status | (d1 << 8) | (d2 << 16)));
        }

        public void NoteOn(int ch, int note, int vel) { Msg(0x90 | ch, note & 0x7F, vel); }
        public void NoteOff(int ch, int note) { Msg(0x80 | ch, note & 0x7F, 0); }
        public void Program(int ch, int prog) { Msg(0xC0 | ch, prog, 0); }
        public void AllOff(int ch) { Msg(0xB0 | ch, 123, 0); }

        public void Dispose()
        {
            if (_h != IntPtr.Zero)
            {
                for (int ch = 0; ch < 16; ch++) AllOff(ch);
                midiOutClose(_h);
                _h = IntPtr.Zero;
            }
        }
    }

    // Alles, was der Player zum Spielen braucht; Delegates lesen live aus dem UI-Zustand.
    public class PlayOptions
    {
        public Func<List<Bar>> GetBars;
        public Func<int> GetBpm;
        public Func<string> GetStyle;
        public Func<int> GetCompProg;    // GM-Programm, -1 = Begleitung aus
        public Func<int> GetBassProg;    // GM-Programm, -1 = Bass aus
        public Func<bool> GetDrumsOn;
        public Func<int> GetSync;        // Regler 0-100
        public Func<int> GetArp;
        public Func<int> GetBassAct;
        public bool CountIn;
        public bool Intro;               // die letzten 4 Takte der Form vorweg
        public int Choruses;             // 0 = endlos
        public List<Bar> Ending;         // null = kein Ending; letzter Takt = Schlussakkord
    }

    // Spielt: Vorzaehler -> Intro -> Chorusse -> Ending. Events kommen pro Takt aus
    // Styles.BarEvents, dadurch klingen Bearbeitungen und Stilwechsel sofort mit.
    public class Player
    {
        Thread _thread;
        volatile bool _stop;
        volatile int _currentBar = -1;
        public volatile string LastError;

        public int CurrentBar { get { return _currentBar; } }

        public bool Running
        {
            get { var t = _thread; return t != null && t.IsAlive; }
        }

        public void Start(PlayOptions options)
        {
            Stop();
            _stop = false;
            LastError = null;
            _thread = new Thread(delegate() { Run(options); });
            _thread.IsBackground = true;
            _thread.Start();
        }

        public void Stop()
        {
            _stop = true;
            var t = _thread;
            if (t != null && t.IsAlive) t.Join(1500);
            _thread = null;
            _currentBar = -1;
        }

        bool SleepUntil(long targetMs, System.Diagnostics.Stopwatch sw)
        {
            while (!_stop)
            {
                long rest = targetMs - sw.ElapsedMilliseconds;
                if (rest <= 0) return true;
                Thread.Sleep((int)Math.Min(rest, 25L));
            }
            return false;
        }

        class Act
        {
            public double Beat;
            public bool On;
            public int Ch;
            public int Note;
            public int Vel;
        }

        void Run(PlayOptions o)
        {
            MidiOut midi;
            try { midi = new MidiOut(); }
            catch (Exception e)
            {
                LastError = e.Message;
                return;
            }
            try
            {
                var ctx = new GrooveCtx();
                var sw = System.Diagnostics.Stopwatch.StartNew();
                double t = 80;   // kleiner Vorlauf in ms
                int lastComp = int.MinValue;
                int lastBass = int.MinValue;
                // Phasen: 0 Vorzaehler, 1 Intro, 2 Chorusse, 3 Ending
                int phase = o.CountIn ? 0 : (o.Intro ? 1 : 2);
                int idx = 0;
                int chorus = 0;

                while (!_stop)
                {
                    var bars = o.GetBars();
                    if (bars == null || bars.Count == 0) break;
                    int n = bars.Count;
                    ctx.Sync = o.GetSync();
                    ctx.Arp = o.GetArp();
                    ctx.BassAct = o.GetBassAct();
                    List<Ev> events;
                    bool isCount = false;
                    bool chorusStart = false;

                    if (phase == 0)
                    {
                        events = Styles.CountIn();
                        _currentBar = -1;
                        isCount = true;
                    }
                    else if (phase == 1)
                    {
                        int bi = Math.Max(0, n - 4) + idx;
                        if (bi >= n) bi = n - 1;
                        _currentBar = bi;
                        events = Styles.BarEvents(bars[bi], bars[(bi + 1) % n], o.GetStyle(), ctx);
                    }
                    else if (phase == 2)
                    {
                        if (idx >= n) idx = 0;
                        _currentBar = idx;
                        chorusStart = idx == 0;
                        events = Styles.BarEvents(bars[idx], bars[(idx + 1) % n], o.GetStyle(), ctx);
                    }
                    else
                    {
                        _currentBar = -1;
                        if (idx == o.Ending.Count - 1) events = Styles.FinalHit(ctx, o.Ending[idx].Chords[0]);
                        else events = Styles.BarEvents(o.Ending[idx], o.Ending[idx + 1], o.GetStyle(), ctx);
                    }

                    // Instrumentenwahl anwenden (live umschaltbar)
                    int comp = o.GetCompProg();
                    int bass = o.GetBassProg();
                    bool drums = o.GetDrumsOn();
                    if (chorusStart && drums) events.Add(Styles.ChorusCrash());
                    if (comp >= 0 && comp != lastComp) { midi.Program(Styles.PianoCh, comp); lastComp = comp; }
                    if (bass >= 0 && bass != lastBass) { midi.Program(Styles.BassCh, bass); lastBass = bass; }
                    events.RemoveAll(delegate(Ev e)
                    {
                        if (isCount) return false;   // der Vorzaehler klickt immer
                        if (e.Ch == Styles.PianoCh && comp < 0) return true;
                        if (e.Ch == Styles.BassCh && bass < 0) return true;
                        if (e.Ch == Styles.DrumCh && !drums) return true;
                        return false;
                    });

                    double spb = 60000.0 / Math.Max(30, o.GetBpm());
                    var acts = new List<Act>();
                    foreach (var e in events)
                    {
                        acts.Add(new Act { Beat = e.Beat, On = true, Ch = e.Ch, Note = e.Note, Vel = e.Vel });
                        acts.Add(new Act { Beat = e.Beat + e.Dur, On = false, Ch = e.Ch, Note = e.Note });
                    }
                    acts.Sort(delegate(Act a, Act b)
                    {
                        int cmp = a.Beat.CompareTo(b.Beat);
                        if (cmp != 0) return cmp;
                        return a.On.CompareTo(b.On);     // Off vor On bei gleicher Zeit
                    });
                    foreach (var a in acts)
                    {
                        if (!SleepUntil((long)(t + a.Beat * spb), sw)) break;
                        if (a.On) midi.NoteOn(a.Ch, a.Note, a.Vel);
                        else midi.NoteOff(a.Ch, a.Note);
                    }
                    if (_stop)
                    {
                        foreach (var a in acts)
                            if (!a.On) midi.NoteOff(a.Ch, a.Note);
                    }
                    t += 4 * spb;

                    // Phasenfortschritt
                    if (phase == 0)
                    {
                        phase = o.Intro ? 1 : 2;
                        idx = 0;
                    }
                    else if (phase == 1)
                    {
                        idx++;
                        if (idx >= Math.Min(4, n)) { phase = 2; idx = 0; }
                    }
                    else if (phase == 2)
                    {
                        idx++;
                        if (idx >= n)
                        {
                            idx = 0;
                            chorus++;
                            if (o.Choruses > 0 && chorus >= o.Choruses)
                            {
                                if (o.Ending != null && o.Ending.Count > 0) phase = 3;
                                else break;
                            }
                        }
                    }
                    else
                    {
                        idx++;
                        if (idx >= o.Ending.Count) break;
                    }
                }
            }
            finally
            {
                _currentBar = -1;
                midi.Dispose();
            }
        }
    }
}
