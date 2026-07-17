using System;
using System.Collections.Generic;
using System.Linq;

namespace BackingTrack
{
    // Grundlagen: Tonnamen, Tonarten, Akkordmodell und Symbolbildung.
    public static class Theory
    {
        public static readonly string[] NamesSharp = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
        public static readonly string[] NamesFlat  = { "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B" };

        // Dur-Tonarten, die mit b-Vorzeichen notiert werden: F, Bb, Eb, Ab, Db, Gb
        static readonly HashSet<int> FlatMajorTonics = new HashSet<int> { 5, 10, 3, 8, 1, 6 };

        public static readonly string[] KeyChoices = { "C", "Db", "D", "Eb", "E", "F", "F#/Gb", "G", "Ab", "A", "Bb", "B" };

        public static int KeyToPc(string key)
        {
            switch (key)
            {
                case "C": return 0;
                case "Db": return 1;
                case "D": return 2;
                case "Eb": return 3;
                case "E": return 4;
                case "F": return 5;
                case "F#/Gb": return 6;
                case "G": return 7;
                case "Ab": return 8;
                case "A": return 9;
                case "Bb": return 10;
                default: return 11;
            }
        }

        // Moll richtet sich nach den Vorzeichen der parallelen Dur-Tonart (kleine Terz aufwaerts)
        public static bool UseFlatsForKey(int tonicPc, bool minor)
        {
            int majorPc = minor ? (tonicPc + 3) % 12 : tonicPc;
            return FlatMajorTonics.Contains(majorPc);
        }

        public static string NoteName(int pc, bool useFlats)
        {
            pc = ((pc % 12) + 12) % 12;
            return useFlats ? NamesFlat[pc] : NamesSharp[pc];
        }
    }

    public class Chord
    {
        public int Root;                 // Pitch-Class 0..11
        public string Quality;           // "maj" "min" "dim" "aug" "sus4"
        public string Seventh;           // null "6" "b7" "maj7" "dim7"
        public HashSet<int> Tensions;    // Teilmenge von {9, 11, 13}
        public string Analysis;          // Herkunft laut Harmonielehre, z.B. "ii7", "V7/vi", "subV7"
        public bool? FlatOverride;       // erzwungene b- bzw. #-Schreibweise (z.B. Ab statt G# bei MI)
        public string PreSusQuality;     // gemerktes Tongeschlecht fuer den sus4-Schalter im Editor

        public Chord(int root, string quality, string seventh, string analysis)
        {
            Root = root;
            Quality = quality;
            Seventh = seventh;
            Analysis = analysis;
            Tensions = new HashSet<int>();
        }

        public Chord Copy()
        {
            var c = new Chord(Root, Quality, Seventh, Analysis);
            c.Tensions = new HashSet<int>(Tensions);
            c.FlatOverride = FlatOverride;
            c.PreSusQuality = PreSusQuality;
            return c;
        }

        public bool SameAs(Chord o)
        {
            return Root == o.Root && Quality == o.Quality && Seventh == o.Seventh && Tensions.SetEquals(o.Tensions);
        }

        static readonly Dictionary<string, int[]> Triads = new Dictionary<string, int[]>
        {
            { "maj",  new[] { 0, 4, 7 } },
            { "min",  new[] { 0, 3, 7 } },
            { "dim",  new[] { 0, 3, 6 } },
            { "aug",  new[] { 0, 4, 8 } },
            { "sus4", new[] { 0, 5, 7 } },
        };
        static readonly Dictionary<string, int> Sevenths = new Dictionary<string, int>
        {
            { "6", 9 }, { "b7", 10 }, { "maj7", 11 }, { "dim7", 9 },
        };
        static readonly Dictionary<int, int> TensionIv = new Dictionary<int, int>
        {
            { 9, 14 }, { 11, 17 }, { 13, 21 },
        };

        // Halbtonabstaende vom Grundton, aufsteigend
        public List<int> Intervals()
        {
            var iv = new List<int>(Triads[Quality]);
            if (Seventh != null) iv.Add(Sevenths[Seventh]);
            foreach (var t in Tensions.OrderBy(x => x)) iv.Add(TensionIv[t]);
            return iv;
        }

        public string Symbol(bool useFlats)
        {
            bool flats = FlatOverride.HasValue ? FlatOverride.Value : useFlats;
            string root = Theory.NoteName(Root, flats);
            string core;
            if (Quality == "maj")
                core = Seventh == "6" ? "6" : Seventh == "b7" ? "7" : Seventh == "maj7" ? "maj7" : "";
            else if (Quality == "min")
                core = "m" + (Seventh == "6" ? "6" : Seventh == "b7" ? "7" : Seventh == "maj7" ? "(maj7)" : "");
            else if (Quality == "dim")
                core = Seventh == "b7" ? "m7b5" : (Seventh == "dim7" || Seventh == "6") ? "dim7" : "dim";
            else if (Quality == "aug")
                core = "aug" + (Seventh == "b7" ? "7" : Seventh == "maj7" ? "(maj7)" : "");
            else
                core = Seventh == "b7" ? "7sus4" : Seventh == "maj7" ? "maj7sus4" : Seventh == "6" ? "6sus4" : "sus4";

            var t = Tensions.OrderBy(x => x).ToList();
            if (t.Count > 0)
            {
                int top = t[t.Count - 1];
                // C13 impliziert 9/11 usw. - jazzuebliche Kurzschreibweise
                if (core == "7" || core == "maj7" || core == "m7")
                    core = core.Substring(0, core.Length - 1) + top;
                else if (core == "6" && t.Contains(9))
                    core = "6/9";
                else if (core == "m6" && t.Contains(9))
                    core = "m6/9";
                else if ((core == "" || core == "m") && t.Count == 1 && top == 9)
                    core += "add9";
                else
                    core += "(" + string.Join(",", t) + ")";
            }
            return root + core;
        }
    }

    // Ein Takt haelt einen oder zwei Akkorde (halbtaktige Wechsel, z.B. II-V in einem Takt).
    public class Bar
    {
        public List<Chord> Chords;

        public Bar(Chord c)
        {
            Chords = new List<Chord> { c };
        }

        public Bar(Chord a, Chord b)
        {
            Chords = new List<Chord> { a, b };
        }

        public Bar Copy()
        {
            var b = new Bar(Chords[0].Copy());
            for (int i = 1; i < Chords.Count; i++) b.Chords.Add(Chords[i].Copy());
            return b;
        }

        public bool SameAs(Bar o)
        {
            if (o == null || o.Chords.Count != Chords.Count) return false;
            for (int i = 0; i < Chords.Count; i++)
                if (!Chords[i].SameAs(o.Chords[i])) return false;
            return true;
        }

        public string Symbols(bool useFlats)
        {
            var parts = new List<string>();
            foreach (var c in Chords) parts.Add(c.Symbol(useFlats));
            return string.Join("   ", parts);
        }

        public string Analyses()
        {
            var parts = new List<string>();
            foreach (var c in Chords) parts.Add(c.Analysis);
            return string.Join(" · ", parts);
        }
    }
}
