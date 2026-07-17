using System;
using System.Collections.Generic;

namespace BackingTrack
{
    // Akkordfolgen-Generator.
    //
    // Harmonische Grundlage: klassische Funktionstheorie (lehrklaenge.de) und
    // Jazz-Harmonielehre nach Frank Sikora. Der Regler ("Jazz-Gesetz") loest
    // die Bindung an die Regeln stufenweise:
    //
    //   0-14   klassisch streng: leitereigene Dreiklaenge, Kadenzik T-S-D-T
    //  15-34   Jazz-Diatonik: Septakkorde, II-V-I, Verdichtung, Turnaround
    //  35-54   + Zwischendominanten samt zugehoerigem ii (Sikora: II-V-Ketten)
    //  55-74   + Tritonussubstitution und Modal Interchange
    //  75-100  zunehmend frei: funktionsfremde Klaenge, ab 90 fallen die Anker
    public static class Generator
    {
        class Degree
        {
            public int Offset;
            public string Triad;
            public string JazzSeventh;
            public string Function;
            public Degree(int off, string tri, string sev, string fn)
            {
                Offset = off; Triad = tri; JazzSeventh = sev; Function = fn;
            }
        }

        static readonly Dictionary<string, Degree> Major = new Dictionary<string, Degree>
        {
            { "I",   new Degree(0,  "maj", "maj7", "T") },
            { "ii",  new Degree(2,  "min", "b7",   "S") },
            { "iii", new Degree(4,  "min", "b7",   "T") },
            { "IV",  new Degree(5,  "maj", "maj7", "S") },
            { "V",   new Degree(7,  "maj", "b7",   "D") },
            { "vi",  new Degree(9,  "min", "b7",   "T") },
            { "vii", new Degree(11, "dim", "b7",   "D") },
        };

        // Moll gemischt aus natuerlich + harmonisch (Dominante mit grosser Terz)
        static readonly Dictionary<string, Degree> Minor = new Dictionary<string, Degree>
        {
            { "i",   new Degree(0,  "min", "b7",   "T") },
            { "ii",  new Degree(2,  "dim", "b7",   "S") },
            { "III", new Degree(3,  "maj", "maj7", "T") },
            { "iv",  new Degree(5,  "min", "b7",   "S") },
            { "V",   new Degree(7,  "maj", "b7",   "D") },
            { "VI",  new Degree(8,  "maj", "maj7", "T") },
            { "VII", new Degree(10, "maj", "b7",   "D") },
        };

        static KeyValuePair<string, double> W(string s, double w)
        {
            return new KeyValuePair<string, double>(s, w);
        }

        // Auswahlgewichte je Funktion: Hauptklaenge vor Nebenklaengen
        static readonly Dictionary<string, KeyValuePair<string, double>[]> MajorPool = new Dictionary<string, KeyValuePair<string, double>[]>
        {
            { "T", new[] { W("I", 6), W("vi", 2.5), W("iii", 1.5) } },
            { "S", new[] { W("IV", 5), W("ii", 5) } },
            { "D", new[] { W("V", 8), W("vii", 2) } },
        };
        static readonly Dictionary<string, KeyValuePair<string, double>[]> MinorPool = new Dictionary<string, KeyValuePair<string, double>[]>
        {
            { "T", new[] { W("i", 6), W("VI", 2), W("III", 2) } },
            { "S", new[] { W("iv", 5.5), W("ii", 4.5) } },
            { "D", new[] { W("V", 8.5), W("VII", 1.5) } },
        };

        // Funktionsfortschreitung; klassische Regel: nach der Dominante keine Subdominante
        static readonly Dictionary<string, KeyValuePair<string, double>[]> Transitions = new Dictionary<string, KeyValuePair<string, double>[]>
        {
            { "T", new[] { W("T", 2.5), W("S", 4.5), W("D", 3) } },
            { "S", new[] { W("S", 2), W("D", 5.5), W("T", 2.5) } },
            { "D", new[] { W("T", 8.5), W("D", 1.5) } },
        };

        static readonly string[] Roman = { "I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII" };

        static string Pick(Random rng, KeyValuePair<string, double>[] pool)
        {
            double total = 0;
            foreach (var kv in pool) total += kv.Value;
            double x = rng.NextDouble() * total;
            foreach (var kv in pool)
            {
                x -= kv.Value;
                if (x <= 0) return kv.Key;
            }
            return pool[pool.Length - 1].Key;
        }

        static string DegLabel(string deg, Degree d, bool jazz)
        {
            if (!jazz) return d.Triad == "dim" ? deg + "°" : deg;
            if (d.JazzSeventh == "b7") return d.Triad == "dim" ? deg + "ø7" : deg + "7";
            return deg + "maj7";
        }

        static Chord DegChord(Dictionary<string, Degree> degrees, string deg, int tonic, bool jazz)
        {
            var d = degrees[deg];
            return new Chord((tonic + d.Offset) % 12, d.Triad, jazz ? d.JazzSeventh : null, DegLabel(deg, d, jazz));
        }

        static Chord[] MiChords(int tonic)
        {
            var a = new Chord((tonic + 5) % 12, "min", "b7", "MI iv7");
            var b = new Chord((tonic + 8) % 12, "maj", "maj7", "MI bVImaj7");
            b.FlatOverride = true;
            var c = new Chord((tonic + 10) % 12, "maj", "b7", "MI bVII7");
            c.FlatOverride = true;
            var d = new Chord((tonic + 2) % 12, "dim", "b7", "MI iiø7");
            var e = new Chord((tonic + 3) % 12, "maj", "maj7", "MI bIIImaj7");
            e.FlatOverride = true;
            return new[] { a, b, c, d, e };
        }

        static readonly string[][] FreeQualities =
        {
            new[] { "maj", "maj7" }, new[] { "min", "b7" }, new[] { "maj", "b7" },
            new[] { "dim", "b7" }, new[] { "min", "maj7" }, new[] { "sus4", "b7" },
            new[] { "aug", "maj7" }, new[] { "dim", "dim7" },
        };

        static Chord FreeChord(Random rng)
        {
            var q = FreeQualities[rng.Next(FreeQualities.Length)];
            var c = new Chord(rng.Next(12), q[0], q[1], "frei");
            if (rng.NextDouble() < 0.4) c.Tensions.Add(new[] { 9, 11, 13 }[rng.Next(3)]);
            return c;
        }

        // gelegentliche Tensions ab mittlerem Reglerstand (Avoid-Noten vermieden)
        static void AutoTensions(List<Bar> bars, int freedom, Random rng)
        {
            if (freedom < 35) return;
            double pt = 0.12 + freedom / 500.0;
            foreach (var bar in bars)
            {
                foreach (var c in bar.Chords)
                {
                    if (rng.NextDouble() >= pt) continue;
                    if (c.Seventh == "maj7") c.Tensions.Add(9);
                    else if (c.Quality == "min" && c.Seventh == "b7") c.Tensions.Add(rng.NextDouble() < 0.67 ? 9 : 11);
                    else if (c.Quality == "maj" && c.Seventh == "b7") c.Tensions.Add(rng.NextDouble() < 0.6 ? 9 : 13);
                }
            }
        }

        // freie Zone: ganze Takte werden durch funktionsfremde Klaenge ersetzt
        static void FreeZone(List<Bar> bars, int freedom, Random rng)
        {
            if (freedom < 75) return;
            double pf = 0.15 + 0.55 * (freedom - 75) / 25.0;
            for (int i = 0; i < bars.Count; i++)
            {
                if ((i == 0 || i == bars.Count - 1) && freedom < 90) continue;
                if (rng.NextDouble() < pf) bars[i] = new Bar(FreeChord(rng));
            }
        }

        // form: "12", "16" oder "blues"
        public static List<Bar> Generate(int tonic, bool minor, string form, int freedom, int? seed = null)
        {
            var rng = seed.HasValue ? new Random(seed.Value) : new Random();
            if (form == "blues") return Blues(tonic, minor, freedom, rng);

            int nBars = form == "16" ? 16 : 12;
            var degrees = minor ? Minor : Major;
            var pool = minor ? MinorPool : MajorPool;
            bool jazz = freedom >= 15;
            string tonicDeg = minor ? "i" : "I";
            string sCad = jazz ? "ii" : (minor ? "iv" : "IV");

            // 1) Stufen-Geruest: Phrasen zu 4 Takten, Ganzschluss am Ende
            var degs = new string[nBars];
            degs[0] = tonicDeg;
            degs[nBars - 1] = tonicDeg;
            degs[nBars - 2] = "V";
            degs[nBars - 3] = sCad;
            int phrases = nBars / 4;
            for (int p = 0; p < phrases - 1; p++)
            {
                degs[p * 4 + 3] = Pick(rng, new[]
                {
                    W("V", 4), W(tonicDeg, 2.5), W(minor ? "VI" : "vi", 1.5), W(minor ? "iv" : "IV", 1),
                });
            }
            for (int i = 1; i < nBars; i++)
            {
                if (degs[i] != null) continue;
                string fn = Pick(rng, Transitions[degrees[degs[i - 1]].Function]);
                string deg = Pick(rng, pool[fn]);
                if (deg == degs[i - 1] && rng.NextDouble() < 0.7) deg = Pick(rng, pool[fn]);
                degs[i] = deg;
            }

            var bars = new List<Bar>();
            for (int i = 0; i < nBars; i++)
                bars.Add(new Bar(DegChord(degrees, degs[i], tonic, jazz)));

            // 2) Kadenz verdichten: ii-V zusammen in einem Takt
            if (jazz && rng.NextDouble() < 0.35)
            {
                bars[nBars - 3] = new Bar(DegChord(degrees, Pick(rng, pool["T"]), tonic, true));
                bars[nBars - 2] = new Bar(DegChord(degrees, "ii", tonic, true), DegChord(degrees, "V", tonic, true));
            }

            // 3) Turnaround im Schlusstakt: | I  V7 | fuehrt zurueck zum Anfang
            if (jazz && rng.NextDouble() < 0.3)
            {
                var v = DegChord(degrees, "V", tonic, true);
                v.Analysis = "V7 (Turnaround)";
                bars[nBars - 1] = new Bar(bars[nBars - 1].Chords[0], v);
            }

            // 4) Zwischendominanten: ganztaktig oder halbtaktig hinter dem Original
            if (freedom >= 35)
            {
                double p = 0.18 + 0.4 * (freedom - 35) / 65.0;
                for (int i = nBars - 1; i >= 2; i--)
                {
                    if (i - 1 == nBars - 2) continue;                 // Schlussdominante bleibt
                    if (bars[i - 1].Chords.Count > 1) continue;
                    var target = bars[i].Chords[0];
                    if (target.Root == tonic || target.Quality == "dim") continue;
                    if (rng.NextDouble() >= p) continue;
                    var zd = new Chord((target.Root + 7) % 12, "maj", "b7",
                                       "V7/" + Roman[((target.Root - tonic) + 12) % 12]);
                    if (rng.NextDouble() < 0.5) bars[i - 1] = new Bar(zd);
                    else bars[i - 1].Chords.Add(zd);
                }
            }

            // 5) zugehoeriges ii vor Dominanten: aus | V7 | wird | ii7 V7 | (Sikora II-V)
            if (freedom >= 35)
            {
                double p = 0.25 + 0.2 * (freedom - 35) / 65.0;
                for (int i = 1; i < nBars - 1; i++)
                {
                    if (bars[i].Chords.Count != 1) continue;
                    var c = bars[i].Chords[0];
                    if (!(c.Quality == "maj" && c.Seventh == "b7")) continue;
                    if (rng.NextDouble() >= p) continue;
                    int iiRoot = (c.Root + 7) % 12;
                    var prevBar = bars[i - 1];
                    var prev = prevBar.Chords[prevBar.Chords.Count - 1];
                    if (prev.Root == iiRoot && (prev.Quality == "min" || prev.Quality == "dim")) continue;
                    var resolveTo = bars[(i + 1) % nBars].Chords[0];
                    bool toMinor = resolveTo.Quality == "min" || resolveTo.Quality == "dim";
                    string targetRoman = Roman[(((c.Root + 5 - tonic) % 12) + 12) % 12];
                    string lab = (toMinor ? "iiø7" : "ii7") + (c.Analysis == "V7" ? "" : "/" + targetRoman);
                    var ii = new Chord(iiRoot, toMinor ? "dim" : "min", "b7", lab);
                    bars[i] = new Bar(ii, c);
                }
            }

            // 6) Tritonussubstitution (bII7 statt V7) und Modal Interchange
            if (freedom >= 55)
            {
                double pSub = 0.2 + 0.3 * (freedom - 55) / 45.0;
                for (int i = 1; i < nBars; i++)
                {
                    var cs = bars[i].Chords;
                    for (int k = 0; k < cs.Count; k++)
                    {
                        var c = cs[k];
                        if (i == nBars - 1 && k == 0) continue;       // Schlusstonika bleibt
                        if (!(c.Quality == "maj" && c.Seventh == "b7")) continue;
                        if (rng.NextDouble() >= pSub) continue;
                        var sub = new Chord((c.Root + 6) % 12, "maj", "b7", "subV7");
                        sub.FlatOverride = true;
                        cs[k] = sub;
                    }
                }
                if (!minor)
                {
                    double pMi = 0.12 + 0.25 * (freedom - 55) / 45.0;
                    var mi = MiChords(tonic);
                    for (int i = 1; i < nBars - 2; i++)
                    {
                        if (bars[i].Chords.Count != 1) continue;
                        var a = bars[i].Chords[0].Analysis;
                        if (a.StartsWith("V7/") || a.StartsWith("subV")) continue;
                        if (rng.NextDouble() < pMi) bars[i] = new Bar(mi[rng.Next(mi.Length)].Copy());
                    }
                }
            }

            AutoTensions(bars, freedom, rng);
            FreeZone(bars, freedom, rng);
            return bars;
        }

        // 12-Takt-Blues als Preset; Varianten haengen am Reglerstand
        static List<Bar> Blues(int tonic, bool minor, int freedom, Random rng)
        {
            bool jazz = freedom >= 15;
            var bars = new List<Bar>();
            Func<int, string, string, Chord> mk = delegate(int off, string q, string lab)
            {
                return new Chord((tonic + off) % 12, q, jazz ? "b7" : null, lab);
            };

            if (!minor)
            {
                string i7 = jazz ? "I7" : "I", iv7 = jazz ? "IV7" : "IV", v7 = jazz ? "V7" : "V";
                bars.Add(new Bar(mk(0, "maj", i7)));                                          // 1
                bars.Add(new Bar(jazz && rng.NextDouble() < 0.55 ? mk(5, "maj", "IV7") : mk(0, "maj", i7)));  // 2 quick change
                bars.Add(new Bar(mk(0, "maj", i7)));                                          // 3
                bars.Add(new Bar(mk(0, "maj", i7)));                                          // 4
                bars.Add(new Bar(mk(5, "maj", iv7)));                                         // 5
                if (freedom >= 35 && rng.NextDouble() < 0.45)
                {
                    var d = new Chord((tonic + 6) % 12, "dim", "dim7", "#IV°7");
                    d.FlatOverride = false;
                    bars.Add(new Bar(d));                                                     // 6
                }
                else bars.Add(new Bar(mk(5, "maj", iv7)));
                bars.Add(new Bar(mk(0, "maj", i7)));                                          // 7
                if (freedom >= 35 && rng.NextDouble() < 0.55)
                    bars.Add(new Bar(mk(9, "maj", "V7/II")));                                 // 8: VI7
                else bars.Add(new Bar(mk(0, "maj", i7)));
                if (jazz)
                {
                    bars.Add(new Bar(new Chord((tonic + 2) % 12, "min", "b7", "ii7")));       // 9
                    bars.Add(new Bar(mk(7, "maj", "V7")));                                    // 10
                }
                else
                {
                    bars.Add(new Bar(mk(7, "maj", v7)));
                    bars.Add(new Bar(mk(5, "maj", iv7)));
                }
                if (jazz && rng.NextDouble() < 0.45)
                    bars.Add(new Bar(mk(0, "maj", "I7"), mk(9, "maj", "V7/II")));             // 11 + Turnaround-Start
                else bars.Add(new Bar(mk(0, "maj", i7)));
                if (jazz && rng.NextDouble() < 0.6)
                    bars.Add(new Bar(new Chord((tonic + 2) % 12, "min", "b7", "ii7"), mk(7, "maj", "V7")));   // 12
                else bars.Add(new Bar(mk(7, "maj", jazz ? "V7 (Turnaround)" : v7)));
            }
            else
            {
                string t7 = jazz ? "i7" : "i", s7 = jazz ? "iv7" : "iv", v7 = jazz ? "V7" : "V";
                bars.Add(new Bar(mk(0, "min", t7)));                                          // 1
                bars.Add(new Bar(jazz && rng.NextDouble() < 0.45 ? mk(5, "min", "iv7") : mk(0, "min", t7)));  // 2
                bars.Add(new Bar(mk(0, "min", t7)));                                          // 3
                if (freedom >= 35 && rng.NextDouble() < 0.5)
                    bars.Add(new Bar(mk(0, "min", "i7"), mk(0, "maj", "V7/iv")));             // 4: i7 wird Dominante nach iv
                else bars.Add(new Bar(mk(0, "min", t7)));
                bars.Add(new Bar(mk(5, "min", s7)));                                          // 5
                bars.Add(new Bar(mk(5, "min", s7)));                                          // 6
                bars.Add(new Bar(mk(0, "min", t7)));                                          // 7
                bars.Add(new Bar(mk(0, "min", t7)));                                          // 8
                var bvi = mk(8, "maj", jazz ? "bVI7" : "VI");
                bvi.FlatOverride = true;
                bars.Add(new Bar(bvi));                                                       // 9
                bars.Add(new Bar(mk(7, "maj", v7)));                                          // 10
                bars.Add(new Bar(mk(0, "min", t7)));                                          // 11
                if (jazz && rng.NextDouble() < 0.5)
                    bars.Add(new Bar(mk(0, "min", "i7"), mk(7, "maj", "V7")));                // 12
                else bars.Add(new Bar(mk(7, "maj", jazz ? "V7 (Turnaround)" : v7)));
            }

            // Farbstufen auch im Blues: Tritonussub auf Nebendominanten
            if (freedom >= 55)
            {
                double pSub = 0.15 + 0.25 * (freedom - 55) / 45.0;
                for (int i = 1; i < 12; i++)
                {
                    var cs = bars[i].Chords;
                    for (int k = 0; k < cs.Count; k++)
                    {
                        if ((i == 4 || i == 10) && k == 0) continue;  // IV- und I-Anker des Blues bleiben
                        var c = cs[k];
                        if (!(c.Quality == "maj" && c.Seventh == "b7")) continue;
                        if (rng.NextDouble() >= pSub) continue;
                        var sub = new Chord((c.Root + 6) % 12, "maj", "b7", "subV7");
                        sub.FlatOverride = true;
                        cs[k] = sub;
                    }
                }
            }

            AutoTensions(bars, freedom, rng);
            FreeZone(bars, freedom, rng);
            return bars;
        }

        // Einzelnen Takt neu setzen (Rechtsklick): passend zu Vorgaenger und Folgetakt
        public static Bar RerollBar(List<Bar> bars, int i, int tonic, bool minor, int freedom)
        {
            var rng = new Random();
            bool jazz = freedom >= 15;
            var degrees = minor ? Minor : Major;
            var pool = minor ? MinorPool : MajorPool;
            var options = new List<Bar>();

            // funktionslogische Fortsetzung des Vorgaengers
            var prevBar = bars[(i - 1 + bars.Count) % bars.Count];
            var prev = prevBar.Chords[prevBar.Chords.Count - 1];
            string prevFn = "T";
            foreach (var kv in degrees)
                if ((tonic + kv.Value.Offset) % 12 == prev.Root) { prevFn = kv.Value.Function; break; }
            for (int k = 0; k < 3; k++)
            {
                string deg = Pick(rng, pool[Pick(rng, Transitions[prevFn])]);
                options.Add(new Bar(DegChord(degrees, deg, tonic, jazz)));
            }

            var next = bars[(i + 1) % bars.Count].Chords[0];
            if (freedom >= 35 && next.Root != tonic && next.Quality != "dim")
            {
                string targetRoman = Roman[(((next.Root - tonic) % 12) + 12) % 12];
                var zd = new Chord((next.Root + 7) % 12, "maj", "b7", "V7/" + targetRoman);
                options.Add(new Bar(zd));
                bool toMinor = next.Quality == "min" || next.Quality == "dim";
                var ii = new Chord((next.Root + 2) % 12, toMinor ? "dim" : "min", "b7",
                                   (toMinor ? "iiø7" : "ii7") + "/" + targetRoman);
                options.Add(new Bar(ii, zd.Copy()));
            }
            if (freedom >= 55)
            {
                var sub = new Chord((next.Root + 1) % 12, "maj", "b7", "subV7");
                sub.FlatOverride = true;
                options.Add(new Bar(sub));
                if (!minor)
                {
                    var mi = MiChords(tonic);
                    options.Add(new Bar(mi[rng.Next(mi.Length)].Copy()));
                }
            }
            if (freedom >= 75)
            {
                options.Add(new Bar(FreeChord(rng)));
                options.Add(new Bar(FreeChord(rng)));
            }

            for (int tries = 0; tries < 8; tries++)
            {
                var cand = options[rng.Next(options.Count)];
                if (!cand.SameAs(bars[i])) return cand;
            }
            return options[rng.Next(options.Count)];
        }

        // Zwei Ending-Takte: Kadenz + gehaltener Schlussakkord
        public static List<Bar> EndingBars(int tonic, bool minor, int freedom)
        {
            bool jazz = freedom >= 15;
            var degrees = minor ? Minor : Major;
            var list = new List<Bar>();
            if (jazz)
                list.Add(new Bar(DegChord(degrees, "ii", tonic, true), DegChord(degrees, "V", tonic, true)));
            else
                list.Add(new Bar(DegChord(degrees, minor ? "iv" : "IV", tonic, false), DegChord(degrees, "V", tonic, false)));
            Chord final;
            if (minor)
            {
                final = new Chord(tonic, "min", jazz ? "6" : null, "i (Schluss)");
                if (jazz) final.Tensions.Add(9);      // m6/9
            }
            else
            {
                final = new Chord(tonic, "maj", jazz ? "maj7" : null, "I (Schluss)");
                if (jazz) final.Tensions.Add(9);      // maj9
            }
            list.Add(new Bar(final));
            return list;
        }

        public static string TierName(int freedom)
        {
            if (freedom < 15) return "Klassisch streng";
            if (freedom < 35) return "Jazz-Diatonik";
            if (freedom < 55) return "+ Zwischendominanten";
            if (freedom < 75) return "+ Substitution / MI";
            return "Frei / Outside";
        }
    }
}
