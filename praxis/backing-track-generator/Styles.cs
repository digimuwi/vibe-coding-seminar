using System;
using System.Collections.Generic;

namespace BackingTrack
{
    // Ein Notenereignis; Zeiten in Vierteln relativ zum Taktanfang (Takt = 4 Viertel).
    public class Ev
    {
        public double Beat;
        public double Dur;
        public int Ch;
        public int Note;
        public int Vel;

        public Ev(double beat, double dur, int ch, int note, int vel)
        {
            Beat = beat; Dur = dur; Ch = ch; Note = note; Vel = vel;
        }
    }

    // Spielzustand und Ausdrucks-Regler; lebt einen Wiedergabelauf bzw. Export lang.
    public class GrooveCtx
    {
        public Random Rng = new Random();
        public int Sync = 40;          // 0-100: Synkopierung der Begleitung
        public int Arp = 0;            // 0-100: gebrochene Akkorde bis Dauer-Arpeggio
        public int BassAct = 50;       // 0-100: Aktivitaet der Bassstimme
        public List<int> LastVoicing;  // fuer Stimmfuehrung von Akkord zu Akkord
    }

    // Begleit-Patterns je Stil: erzeugt pro Takt die Events fuer Bass, Piano und Drums.
    // Wird sowohl von der Live-Wiedergabe als auch vom MIDI-Export benutzt.
    public static class Styles
    {
        public const int PianoCh = 0;
        public const int BassCh = 1;
        public const int DrumCh = 9;

        // GM-Percussion
        const int Kick = 36, SideStick = 37, Snare = 38, HhClosed = 42, HhPedal = 44, Crash = 49, Ride = 51;

        public static readonly string[] Names = { "Swing", "Shuffle", "Blues", "Bossa", "Pop", "Funk", "Ballade" };
        public const string EightBitStyle = "8-Bit";

        // Vorzaehler: vier Viertel Side-Stick
        public static List<Ev> CountIn()
        {
            var ev = new List<Ev>();
            for (int b = 0; b < 4; b++)
                ev.Add(new Ev(b, 0.2, DrumCh, SideStick, b < 2 ? 88 : 72));
            return ev;
        }

        // leichter Crash am Chorus-Anfang
        public static Ev ChorusCrash()
        {
            return new Ev(0, 0.4, DrumCh, Crash, 72);
        }

        // Schlussakkord fuer das Ending: alles auf die Eins, Crash dazu
        public static List<Ev> FinalHit(GrooveCtx ctx, Chord c)
        {
            var ev = new List<Ev>();
            ev.Add(new Ev(0, 3.8, BassCh, BassNote(c.Root), 102));
            foreach (var n in VoiceLead(ctx, c)) ev.Add(new Ev(0, 3.8, PianoCh, n, 86));
            ev.Add(new Ev(0, 0.5, DrumCh, Crash, 96));
            ev.Add(new Ev(0, 0.2, DrumCh, Kick, 88));
            return ev;
        }

        public static List<Ev> BarEvents(Bar bar, Bar next, string style, GrooveCtx ctx)
        {
            var ev = new List<Ev>();
            var chords = bar.Chords;
            var nextChord = next != null ? next.Chords[0] : chords[0];
            if (style == EightBitStyle)
            {
                EightBit(ev, ctx, chords);
                return ev;
            }
            bool swung = style == "Swing" || style == "Shuffle" || style == "Blues";
            if (style == "Bossa") Bossa(ev, ctx, chords);
            else if (style == "Ballade") Ballad(ev, ctx, chords);
            else if (style == "Pop") Pop(ev, ctx, chords);
            else if (style == "Funk") Funk(ev, ctx, chords);
            else if (style == "Shuffle") Shuffle(ev, ctx, chords);
            else if (style == "Blues") BluesStyle(ev, ctx, chords);
            else Swing(ev, ctx, chords, nextChord);
            if (ctx.Arp > 60) ArpComp(ev, ctx, chords, swung);
            return ev;
        }

        // ---- Hilfen ----------------------------------------------------------

        static int Fold(int p, int lo, int hi)
        {
            while (p < lo) p += 12;
            while (p > hi) p -= 12;
            return p;
        }

        static int BassNote(int pc)
        {
            return 36 + ((pc % 12) + 12) % 12;   // C2..B2
        }

        static int Hum(GrooveCtx ctx, int vel)
        {
            int v = vel + ctx.Rng.Next(-5, 6);
            return v < 1 ? 1 : v > 127 ? 127 : v;
        }

        // Stimmfuehrung: Toene moeglichst nah am vorigen Voicing platzieren
        static List<int> VoiceLead(GrooveCtx ctx, Chord c)
        {
            var iv = c.Intervals();
            var outp = new List<int>();
            for (int k = 0; k < iv.Count; k++)
            {
                if (k == 0 && c.Seventh != null) continue;   // Grundton uebernimmt der Bass
                int p = Fold(48 + c.Root + iv[k], 55, 79);
                if (ctx.LastVoicing != null && ctx.LastVoicing.Count > 0)
                {
                    int best = p, bestD = 99;
                    foreach (var cand in new[] { p - 12, p, p + 12 })
                    {
                        if (cand < 53 || cand > 81) continue;
                        int d = 99;
                        foreach (var prev in ctx.LastVoicing) d = Math.Min(d, Math.Abs(cand - prev));
                        if (d < bestD) { bestD = d; best = cand; }
                    }
                    p = best;
                }
                if (!outp.Contains(p)) outp.Add(p);
            }
            outp.Sort();
            ctx.LastVoicing = outp;
            return outp;
        }

        // Akkordanschlag; bei mittlerem Arpeggio-Regler gelegentlich gerollt
        static void CompHit(List<Ev> ev, GrooveCtx ctx, Chord c, double beat, double dur, int vel)
        {
            var v = VoiceLead(ctx, c);
            double stag = 0;
            if (ctx.Arp >= 20 && ctx.Arp <= 60 && beat <= 3 && ctx.Rng.NextDouble() < (ctx.Arp - 15) / 60.0)
                stag = 0.05 + ctx.Rng.NextDouble() * 0.04;
            for (int k = 0; k < v.Count; k++)
            {
                double b = Math.Min(beat + k * stag, 3.9);
                double d = Math.Max(0.1, dur - k * stag);
                ev.Add(new Ev(b, d, PianoCh, v[k], Hum(ctx, vel)));
            }
        }

        // Pattern = flache Liste aus (Zaehlzeit, Dauer)-Paaren
        static void PatComp(List<Ev> ev, GrooveCtx ctx, Chord c, double[] pat, int vel)
        {
            for (int k = 0; k + 1 < pat.Length; k += 2)
                CompHit(ev, ctx, c, pat[k], pat[k + 1], vel);
        }

        static double[] PickPat(GrooveCtx ctx, double[][] low, double[][] mid, double[][] high)
        {
            var band = ctx.Sync < 33 ? low : ctx.Sync <= 66 ? mid : high;
            return band[ctx.Rng.Next(band.Length)];
        }

        // Dauer-Arpeggio (Regler > 60) ersetzt das normale Comping
        static void ArpComp(List<Ev> ev, GrooveCtx ctx, List<Chord> chords, bool swung)
        {
            ev.RemoveAll(delegate(Ev e) { return e.Ch == PianoCh; });
            double[] pos = swung
                ? new[] { 0, 0.67, 1, 1.67, 2, 2.67, 3, 3.67 }
                : new[] { 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5 };
            var c1 = chords[0];
            var c2 = chords[chords.Count - 1];
            var v1 = VoiceLead(ctx, c1);
            var v2 = chords.Count == 2 ? VoiceLead(ctx, c2) : v1;
            bool pendel = ctx.Arp > 80;   // auf und ab statt nur aufwaerts
            for (int k = 0; k < pos.Length; k++)
            {
                var v = pos[k] < 2 ? v1 : v2;
                int len = v.Count;
                int idx;
                if (pendel && len > 1)
                {
                    int cyc = len * 2 - 2;
                    int m = k % cyc;
                    idx = m < len ? m : cyc - m;
                }
                else idx = k % len;
                ev.Add(new Ev(pos[k], swung ? 0.3 : 0.42, PianoCh, v[idx], Hum(ctx, 62)));
            }
        }

        // ruhiger Bass fuer niedrige Bass-Aktivitaet (alle Stile)
        static void SimpleBass(List<Ev> ev, GrooveCtx ctx, List<Chord> chords)
        {
            if (chords.Count == 2)
            {
                ev.Add(new Ev(0, 1.9, BassCh, BassNote(chords[0].Root), Hum(ctx, 88)));
                ev.Add(new Ev(2, 1.9, BassCh, BassNote(chords[1].Root), Hum(ctx, 88)));
            }
            else
            {
                var c = chords[0];
                int root = BassNote(c.Root);
                ev.Add(new Ev(0, 1.9, BassCh, root, Hum(ctx, 88)));
                ev.Add(new Ev(2, 1.9, BassCh, Fold(root + c.Intervals()[2], 33, 50), Hum(ctx, 84)));
            }
        }

        static bool BassLow(GrooveCtx ctx) { return ctx.BassAct < 25; }
        static bool BassHigh(GrooveCtx ctx) { return ctx.BassAct > 70; }

        // chromatische oder Quint-Annaeherung an den naechsten Grundton
        static int Approach(GrooveCtx ctx, int targetPc)
        {
            int t = BassNote(targetPc);
            int[] opts = { t - 1, t + 1, t + 7 };
            return Fold(opts[ctx.Rng.Next(3)], 33, 50);
        }

        // ---- Swing -----------------------------------------------------------

        static readonly double[][] SwingLowPat =
        {
            new[] { 0, 3.8 },
            new double[] { 0, 1.8, 2, 1.8 },
        };
        static readonly double[][] SwingMidPat =
        {
            new[] { 0, 1.4, 2.67, 1.1 },
            new[] { 1.67, 1.6 },
            new[] { 0, 0.7, 1.67, 0.9, 3.67, 0.3 },
            new[] { 2.67, 1.2 },
        };
        static readonly double[][] SwingHighPat =
        {
            new[] { 1.67, 0.8, 3.67, 0.3 },
            new[] { 0.67, 0.6, 2.67, 0.9 },
            new[] { 1.67, 0.4, 2.67, 0.4, 3.67, 0.3 },
            new[] { 0, 0.4, 1.5, 0.5, 2.67, 0.8 },
        };

        static void Swing(List<Ev> ev, GrooveCtx ctx, List<Chord> chords, Chord nextChord)
        {
            // Bass
            if (BassLow(ctx))
            {
                SimpleBass(ev, ctx, chords);
            }
            else if (chords.Count == 2)
            {
                Walk2(ev, ctx, 0, chords[0], chords[1]);
                Walk2(ev, ctx, 2, chords[1], nextChord);
            }
            else
            {
                var c = chords[0];
                int root = BassNote(c.Root);
                int third = Fold(root + c.Intervals()[1], 33, 50);
                int fifth = Fold(root + c.Intervals()[2], 33, 50);
                int high = Fold(root + 12, 33, 50);
                int b1 = ctx.Rng.NextDouble() < 0.5 ? third : fifth;
                int b2 = new[] { third, fifth, high }[ctx.Rng.Next(3)];
                if (b2 == b1) b2 = b1 == fifth ? third : fifth;
                ev.Add(new Ev(0, 0.95, BassCh, root, Hum(ctx, 96)));
                ev.Add(new Ev(1, 0.95, BassCh, b1, Hum(ctx, 88)));
                ev.Add(new Ev(2, 0.95, BassCh, b2, Hum(ctx, 90)));
                ev.Add(new Ev(3, 0.95, BassCh, Approach(ctx, nextChord.Root), Hum(ctx, 92)));
                if (BassHigh(ctx) && ctx.Rng.NextDouble() < (ctx.BassAct - 70) / 30.0 * 0.7)
                    ev.Add(new Ev(3.67, 0.28, BassCh, Approach(ctx, nextChord.Root), Hum(ctx, 78)));
            }
            // Piano
            if (chords.Count == 2)
            {
                CompHit(ev, ctx, chords[0], 0, 1.3, 70);
                CompHit(ev, ctx, chords[1], 2, ctx.Rng.NextDouble() < 0.5 ? 1.9 : 1.2, 72);
                if (ctx.Rng.NextDouble() < 0.2 + ctx.Sync / 200.0) CompHit(ev, ctx, chords[1], 3.67, 0.3, 58);
            }
            else
            {
                PatComp(ev, ctx, chords[0], PickPat(ctx, SwingLowPat, SwingMidPat, SwingHighPat), 68);
            }
            // Drums
            double[] ride = { 0, 1, 1.67, 2, 3, 3.67 };
            int[] vel = { 84, 80, 64, 84, 80, 64 };
            for (int k = 0; k < ride.Length; k++)
                ev.Add(new Ev(ride[k], 0.3, DrumCh, Ride, Hum(ctx, vel[k])));
            ev.Add(new Ev(1, 0.2, DrumCh, HhPedal, 70));
            ev.Add(new Ev(3, 0.2, DrumCh, HhPedal, 70));
        }

        static void Walk2(List<Ev> ev, GrooveCtx ctx, double at, Chord c, Chord target)
        {
            ev.Add(new Ev(at, 0.95, BassCh, BassNote(c.Root), Hum(ctx, 96)));
            ev.Add(new Ev(at + 1, 0.95, BassCh, Approach(ctx, target.Root), Hum(ctx, 90)));
        }

        // ---- Shuffle (Boogie) --------------------------------------------------

        static void Shuffle(List<Ev> ev, GrooveCtx ctx, List<Chord> chords)
        {
            var c1 = chords[0];
            var c2 = chords[chords.Count - 1];
            if (BassLow(ctx))
            {
                SimpleBass(ev, ctx, chords);
            }
            else if (chords.Count == 2)
            {
                ShuffleBassHalf(ev, ctx, 0, c1);
                ShuffleBassHalf(ev, ctx, 2, c2);
            }
            else
            {
                // Boogie-Linie: Grundton, Quinte, Sexte, Quinte (hoch: + Septime-Achtel)
                int root = BassNote(c1.Root);
                int fifth = Fold(root + c1.Intervals()[2], 33, 50);
                int sixth = Fold(root + 9, 33, 50);
                ev.Add(new Ev(0, 0.9, BassCh, root, Hum(ctx, 96)));
                ev.Add(new Ev(1, 0.9, BassCh, fifth, Hum(ctx, 88)));
                ev.Add(new Ev(2, 0.9, BassCh, sixth, Hum(ctx, 90)));
                ev.Add(new Ev(3, 0.9, BassCh, fifth, Hum(ctx, 88)));
                if (BassHigh(ctx) && ctx.Rng.NextDouble() < 0.6)
                    ev.Add(new Ev(3.67, 0.28, BassCh, Fold(root + 10, 33, 50), Hum(ctx, 80)));
            }
            // Comping in Shuffle-Achteln; Dichte nach Synkopen-Regler
            double[] shf = ctx.Sync < 33
                ? new double[] { 0, 1, 2, 3 }
                : ctx.Sync <= 66
                    ? new[] { 0, 0.67, 1, 1.67, 2, 2.67, 3, 3.67 }
                    : new[] { 0.67, 1.67, 2.67, 3.67, 0, 2 };
            for (int k = 0; k < shf.Length; k++)
            {
                var ch = shf[k] < 2 ? c1 : c2;
                CompHit(ev, ctx, ch, shf[k], 0.28, k % 2 == 0 ? 60 : 46);
            }
            double[] hh = { 0, 0.67, 1, 1.67, 2, 2.67, 3, 3.67 };
            for (int k = 0; k < hh.Length; k++)
                ev.Add(new Ev(hh[k], 0.15, DrumCh, HhClosed, Hum(ctx, k % 2 == 0 ? 60 : 42)));
            ev.Add(new Ev(0, 0.2, DrumCh, Kick, 84));
            ev.Add(new Ev(2, 0.2, DrumCh, Kick, 80));
            ev.Add(new Ev(1, 0.2, DrumCh, Snare, 76));
            ev.Add(new Ev(3, 0.2, DrumCh, Snare, 76));
        }

        static void ShuffleBassHalf(List<Ev> ev, GrooveCtx ctx, double at, Chord c)
        {
            int root = BassNote(c.Root);
            int fifth = Fold(root + c.Intervals()[2], 33, 50);
            ev.Add(new Ev(at, 0.9, BassCh, root, Hum(ctx, 96)));
            ev.Add(new Ev(at + 1, 0.9, BassCh, fifth, Hum(ctx, 88)));
        }

        // ---- Blues (langsamer 12/8-Blues) ---------------------------------------

        static void BluesStyle(List<Ev> ev, GrooveCtx ctx, List<Chord> chords)
        {
            var c1 = chords[0];
            var c2 = chords[chords.Count - 1];
            // Bass: R 3 5 6 in Vierteln
            if (BassLow(ctx))
            {
                SimpleBass(ev, ctx, chords);
            }
            else if (chords.Count == 2)
            {
                BluesBassHalf(ev, ctx, 0, c1);
                BluesBassHalf(ev, ctx, 2, c2);
            }
            else
            {
                int root = BassNote(c1.Root);
                int third = Fold(root + c1.Intervals()[1], 33, 50);
                int fifth = Fold(root + c1.Intervals()[2], 33, 50);
                int sixth = Fold(root + 9, 33, 50);
                ev.Add(new Ev(0, 0.95, BassCh, root, Hum(ctx, 96)));
                ev.Add(new Ev(1, 0.95, BassCh, third, Hum(ctx, 86)));
                ev.Add(new Ev(2, 0.95, BassCh, fifth, Hum(ctx, 90)));
                ev.Add(new Ev(3, 0.95, BassCh, sixth, Hum(ctx, 86)));
                if (BassHigh(ctx) && ctx.Rng.NextDouble() < 0.6)
                    ev.Add(new Ev(3.67, 0.28, BassCh, Fold(root + 10, 33, 50), Hum(ctx, 80)));
            }
            // Comp: triolischer Puls mit Pickups
            if (ctx.Sync < 33)
            {
                CompHit(ev, ctx, c1, 0, 1.9, 64);
                CompHit(ev, ctx, c2, 2, 1.9, 64);
            }
            else if (ctx.Sync <= 66)
            {
                for (int b = 0; b < 4; b++)
                    CompHit(ev, ctx, b < 2 ? c1 : c2, b, 0.6, 62);
                if (ctx.Rng.NextDouble() < 0.6) CompHit(ev, ctx, c1, 1.67, 0.25, 50);
                if (ctx.Rng.NextDouble() < 0.6) CompHit(ev, ctx, c2, 3.67, 0.25, 50);
            }
            else
            {
                CompHit(ev, ctx, c1, 0, 0.4, 64);
                CompHit(ev, ctx, c1, 0.67, 0.3, 52);
                CompHit(ev, ctx, c1, 1.67, 0.3, 54);
                CompHit(ev, ctx, c2, 2.67, 0.3, 56);
                CompHit(ev, ctx, c2, 3.67, 0.3, 52);
            }
            // Drums: Ride-Shuffle, kraeftiger Backbeat
            double[] ride = { 0, 0.67, 1, 1.67, 2, 2.67, 3, 3.67 };
            for (int k = 0; k < ride.Length; k++)
                ev.Add(new Ev(ride[k], 0.25, DrumCh, Ride, Hum(ctx, k % 2 == 0 ? 78 : 58)));
            ev.Add(new Ev(0, 0.2, DrumCh, Kick, 84));
            ev.Add(new Ev(2, 0.2, DrumCh, Kick, 78));
            ev.Add(new Ev(2.67, 0.2, DrumCh, Kick, 62));
            ev.Add(new Ev(1, 0.2, DrumCh, Snare, 84));
            ev.Add(new Ev(3, 0.2, DrumCh, Snare, 84));
        }

        static void BluesBassHalf(List<Ev> ev, GrooveCtx ctx, double at, Chord c)
        {
            int root = BassNote(c.Root);
            int third = Fold(root + c.Intervals()[1], 33, 50);
            ev.Add(new Ev(at, 0.95, BassCh, root, Hum(ctx, 96)));
            ev.Add(new Ev(at + 1, 0.95, BassCh, third, Hum(ctx, 86)));
        }

        // ---- Bossa -----------------------------------------------------------

        static void Bossa(List<Ev> ev, GrooveCtx ctx, List<Chord> chords)
        {
            var c1 = chords[0];
            var c2 = chords[chords.Count - 1];
            if (BassLow(ctx))
            {
                SimpleBass(ev, ctx, chords);
            }
            else
            {
                BossaBassHalf(ev, ctx, 0, c1);
                BossaBassHalf(ev, ctx, 2, chords.Count == 2 ? c2 : c1);
                if (BassHigh(ctx) && ctx.Rng.NextDouble() < 0.5)
                    ev.Add(new Ev(3.5, 0.4, BassCh, BassNote(c2.Root), Hum(ctx, 74)));
            }
            if (ctx.Sync < 33)
            {
                CompHit(ev, ctx, c1, 0, 1.8, 62);
                CompHit(ev, ctx, c2, 2, 1.8, 62);
            }
            else
            {
                CompHit(ev, ctx, c1, 0, 1.0, 62);
                CompHit(ev, ctx, c1, 1.5, 0.9, 60);
                CompHit(ev, ctx, c2, 2.5, 0.8, 62);
                if (ctx.Sync > 66 || ctx.Rng.NextDouble() < 0.5) CompHit(ev, ctx, c2, 3.5, 0.4, 56);
            }
            for (double b = 0; b < 4; b += 0.5)
                ev.Add(new Ev(b, 0.2, DrumCh, HhClosed, Hum(ctx, b == Math.Floor(b) ? 48 : 38)));
            ev.Add(new Ev(0, 0.2, DrumCh, Kick, 60));
            ev.Add(new Ev(2, 0.2, DrumCh, Kick, 60));
            ev.Add(new Ev(0, 0.2, DrumCh, SideStick, 70));
            ev.Add(new Ev(1.5, 0.2, DrumCh, SideStick, 68));
            ev.Add(new Ev(3, 0.2, DrumCh, SideStick, 70));
        }

        static void BossaBassHalf(List<Ev> ev, GrooveCtx ctx, double at, Chord c)
        {
            int root = BassNote(c.Root);
            int fifth = Fold(root + c.Intervals()[2], 33, 50);
            ev.Add(new Ev(at, 1.4, BassCh, root, Hum(ctx, 92)));
            ev.Add(new Ev(at + 1.5, 0.45, BassCh, fifth, Hum(ctx, 78)));
        }

        // ---- Pop (gerade Achtel) ----------------------------------------------

        static readonly double[][] PopLowPat =
        {
            new[] { 0, 3.8 },
            new double[] { 0, 1.9, 2, 1.9 },
        };
        static readonly double[][] PopMidPat =
        {
            new[] { 0, 1.4, 1.5, 0.9, 2.5, 1.4 },
            new double[] { 0, 1.9, 2, 0.9, 3, 0.9 },
        };
        static readonly double[][] PopHighPat =
        {
            new[] { 0, 0.4, 1.5, 0.9, 2.5, 0.4, 3.5, 0.4 },
            new[] { 0.5, 0.4, 1.5, 0.4, 2.5, 0.4, 3.5, 0.4 },
        };

        static void Pop(List<Ev> ev, GrooveCtx ctx, List<Chord> chords)
        {
            if (BassLow(ctx))
            {
                SimpleBass(ev, ctx, chords);
            }
            else if (chords.Count == 2)
            {
                PopBassHalf(ev, ctx, 0, chords[0]);
                PopBassHalf(ev, ctx, 2, chords[1]);
            }
            else
            {
                var c = chords[0];
                int root = BassNote(c.Root);
                int fifth = Fold(root + c.Intervals()[2], 33, 50);
                ev.Add(new Ev(0, 1.4, BassCh, root, Hum(ctx, 94)));
                ev.Add(new Ev(1.5, 0.45, BassCh, root, Hum(ctx, 78)));
                ev.Add(new Ev(2, 1.4, BassCh, root, Hum(ctx, 88)));
                ev.Add(new Ev(3.5, 0.45, BassCh, fifth, Hum(ctx, 80)));
                if (BassHigh(ctx))
                {
                    ev.Add(new Ev(0.5, 0.4, BassCh, root, Hum(ctx, 70)));
                    ev.Add(new Ev(2.5, 0.4, BassCh, root, Hum(ctx, 70)));
                }
            }
            if (chords.Count == 2)
            {
                CompHit(ev, ctx, chords[0], 0, 1.4, 66);
                CompHit(ev, ctx, chords[1], 2, 1.4, 66);
                if (ctx.Sync > 50) CompHit(ev, ctx, chords[1], 3.5, 0.4, 58);
            }
            else
            {
                PatComp(ev, ctx, chords[0], PickPat(ctx, PopLowPat, PopMidPat, PopHighPat), 66);
            }
            ev.Add(new Ev(0, 0.2, DrumCh, Kick, 84));
            ev.Add(new Ev(2.5, 0.2, DrumCh, Kick, 74));
            ev.Add(new Ev(1, 0.2, DrumCh, Snare, 78));
            ev.Add(new Ev(3, 0.2, DrumCh, Snare, 78));
            for (double b = 0; b < 4; b += 0.5)
                ev.Add(new Ev(b, 0.15, DrumCh, HhClosed, Hum(ctx, b == Math.Floor(b) ? 56 : 42)));
        }

        static void PopBassHalf(List<Ev> ev, GrooveCtx ctx, double at, Chord c)
        {
            int root = BassNote(c.Root);
            ev.Add(new Ev(at, 1.4, BassCh, root, Hum(ctx, 92)));
            ev.Add(new Ev(at + 1.5, 0.45, BassCh, root, Hum(ctx, 76)));
        }

        // ---- Funk (synkopierte Sechzehntel) ------------------------------------

        static void Funk(List<Ev> ev, GrooveCtx ctx, List<Chord> chords)
        {
            var c1 = chords[0];
            var c2 = chords[chords.Count - 1];
            if (BassLow(ctx))
            {
                SimpleBass(ev, ctx, chords);
            }
            else
            {
                FunkBassHalf(ev, ctx, 0, c1);
                FunkBassHalf(ev, ctx, 2, c2);
                if (BassHigh(ctx))
                {
                    ev.Add(new Ev(0.25, 0.15, BassCh, BassNote(c1.Root), Hum(ctx, 58)));
                    ev.Add(new Ev(3.25, 0.15, BassCh, BassNote(c2.Root), Hum(ctx, 58)));
                }
            }
            // Stabs nach Synkopen-Regler
            if (ctx.Sync < 33)
            {
                CompHit(ev, ctx, c1, 0, 0.3, 72);
                CompHit(ev, ctx, c2, 2, 0.3, 70);
            }
            else
            {
                CompHit(ev, ctx, c1, 0, 0.3, 72);
                CompHit(ev, ctx, c1, 1.5, 0.25, 68);
                CompHit(ev, ctx, c2, 2.75, 0.25, 70);
                if (ctx.Sync > 66)
                {
                    CompHit(ev, ctx, c1, 0.75, 0.2, 60);
                    CompHit(ev, ctx, c2, 3.5, 0.25, 64);
                }
                else if (ctx.Rng.NextDouble() < 0.5)
                {
                    CompHit(ev, ctx, c2, 3.5, 0.25, 64);
                }
            }
            ev.Add(new Ev(0, 0.2, DrumCh, Kick, 88));
            ev.Add(new Ev(1.75, 0.2, DrumCh, Kick, 72));
            ev.Add(new Ev(2.5, 0.2, DrumCh, Kick, 78));
            ev.Add(new Ev(1, 0.2, DrumCh, Snare, 82));
            ev.Add(new Ev(3, 0.2, DrumCh, Snare, 82));
            ev.Add(new Ev(1.25, 0.15, DrumCh, Snare, 26));
            ev.Add(new Ev(3.75, 0.15, DrumCh, Snare, 26));
            for (double b = 0; b < 4; b += 0.5)
                ev.Add(new Ev(b, 0.12, DrumCh, HhClosed, Hum(ctx, b == Math.Floor(b) ? 58 : 44)));
        }

        static void FunkBassHalf(List<Ev> ev, GrooveCtx ctx, double at, Chord c)
        {
            int root = BassNote(c.Root);
            int oct = Fold(root + 12, 33, 52);
            int fifth = Fold(root + c.Intervals()[2], 33, 50);
            ev.Add(new Ev(at, 0.4, BassCh, root, Hum(ctx, 98)));
            ev.Add(new Ev(at + 0.75, 0.2, BassCh, oct, Hum(ctx, 80)));
            ev.Add(new Ev(at + 1.5, 0.45, BassCh, fifth, Hum(ctx, 86)));
        }

        // ---- Ballade ---------------------------------------------------------

        static void Ballad(List<Ev> ev, GrooveCtx ctx, List<Chord> chords)
        {
            if (BassLow(ctx) || chords.Count == 1)
            {
                if (chords.Count == 2)
                {
                    SimpleBass(ev, ctx, chords);
                }
                else
                {
                    var c = chords[0];
                    int root = BassNote(c.Root);
                    ev.Add(new Ev(0, 1.9, BassCh, root, Hum(ctx, 86)));
                    ev.Add(new Ev(2, 1.9, BassCh, Fold(root + c.Intervals()[2], 33, 50), Hum(ctx, 76)));
                    if (BassHigh(ctx) && ctx.Rng.NextDouble() < 0.4)
                        ev.Add(new Ev(3.5, 0.4, BassCh, root, Hum(ctx, 66)));
                }
            }
            else
            {
                ev.Add(new Ev(0, 1.9, BassCh, BassNote(chords[0].Root), Hum(ctx, 86)));
                ev.Add(new Ev(2, 1.9, BassCh, BassNote(chords[1].Root), Hum(ctx, 86)));
            }
            var c1 = chords[0];
            var c2 = chords[chords.Count - 1];
            if (ctx.Sync > 66)
            {
                CompHit(ev, ctx, c1, 0, 1.4, 60);
                CompHit(ev, ctx, c1, 1.5, 0.9, 54);
                CompHit(ev, ctx, c2, 2.5, 1.4, 58);
            }
            else if (chords.Count == 2)
            {
                CompHit(ev, ctx, c1, 0, 1.9, 60);
                CompHit(ev, ctx, c2, 2, 1.9, 60);
            }
            else
            {
                CompHit(ev, ctx, c1, 0, 3.9, 60);
                if (ctx.Sync >= 33 && ctx.Rng.NextDouble() < 0.4) CompHit(ev, ctx, c1, 2.5, 1.2, 50);
            }
            for (int b = 0; b < 4; b++)
                ev.Add(new Ev(b, 0.2, DrumCh, HhClosed, 32));
            ev.Add(new Ev(0, 0.3, DrumCh, Kick, 50));
            ev.Add(new Ev(2, 0.3, DrumCh, SideStick, 42));
        }

        // ---- 8-Bit (Easter Egg: Chiptune) ---------------------------------------

        static void EightBit(List<Ev> ev, GrooveCtx ctx, List<Chord> chords)
        {
            var c1 = chords[0];
            var c2 = chords[chords.Count - 1];
            // Bass: treibende Achtel, Grundton/Oktave im Wechsel
            for (int s = 0; s < 8; s++)
            {
                double b = s * 0.5;
                var c = b < 2 ? c1 : c2;
                int root = BassNote(c.Root);
                ev.Add(new Ev(b, 0.4, BassCh, s % 2 == 0 ? root : root + 12, 98));
            }
            // Chip-Arpeggio: Sechzehntel durch die Akkordtoene, oktavweise steigend
            ChipArp(ev, c1, 0, 8);
            ChipArp(ev, c2, 2, 8);
            // Drums
            ev.Add(new Ev(0, 0.2, DrumCh, Kick, 90));
            ev.Add(new Ev(2, 0.2, DrumCh, Kick, 86));
            ev.Add(new Ev(2.5, 0.2, DrumCh, Kick, 70));
            ev.Add(new Ev(1, 0.2, DrumCh, Snare, 84));
            ev.Add(new Ev(3, 0.2, DrumCh, Snare, 84));
            for (double b = 0; b < 4; b += 0.25)
                ev.Add(new Ev(b, 0.08, DrumCh, HhClosed, b * 4 % 2 == 0 ? 36 : 26));
        }

        static void ChipArp(List<Ev> ev, Chord c, double at, int steps)
        {
            var pcs = new List<int>();
            foreach (var t in c.Intervals())
            {
                int pc = (c.Root + t) % 12;
                if (!pcs.Contains(pc)) pcs.Add(pc);
            }
            pcs.Sort();
            for (int s = 0; s < steps; s++)
            {
                int note = 72 + pcs[s % pcs.Count] + 12 * ((s / pcs.Count) % 2);
                ev.Add(new Ev(at + s * 0.25, 0.2, PianoCh, note, 82));
            }
        }
    }
}
