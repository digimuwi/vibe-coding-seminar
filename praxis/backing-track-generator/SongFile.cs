using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace BackingTrack
{
    public class SongData
    {
        public string Key = "C";
        public string Mode = "Dur";
        public string Form = "12 Takte";
        public int Freedom = 25;      // altes Format (Freiheit); nur noch fuer Abwaertskompatibilitaet
        public int Gesetz = -1;       // neuer Regler: 100 = volles Jazz-Gesetz, 0 = frei
        public int Tempo = 110;
        public string Style = "Swing";
        public string Comp = "Piano";
        public string Bass = "Kontrabass";
        public bool Drums = true;
        public bool Intro = false;
        public bool Ending = false;
        public string Choruses = "∞";
        public int Sync = 40;
        public int Arp = 0;
        public int BassAct = 50;
        public bool EightBit = false;
        public List<Bar> Bars = new List<Bar>();
    }

    // Eigenes, simples Textformat (*.btg) plus Standard-MIDI-File-Export.
    public static class SongFile
    {
        public static void Save(string path, SongData d)
        {
            var sb = new StringBuilder();
            sb.AppendLine("BTG1");
            sb.AppendLine("key=" + d.Key);
            sb.AppendLine("mode=" + d.Mode);
            sb.AppendLine("form=" + d.Form);
            sb.AppendLine("freedom=" + d.Freedom.ToString(CultureInfo.InvariantCulture));
            sb.AppendLine("tempo=" + d.Tempo.ToString(CultureInfo.InvariantCulture));
            sb.AppendLine("style=" + d.Style);
            sb.AppendLine("comp=" + d.Comp);
            sb.AppendLine("bass=" + d.Bass);
            sb.AppendLine("drums=" + (d.Drums ? "1" : "0"));
            sb.AppendLine("intro=" + (d.Intro ? "1" : "0"));
            sb.AppendLine("ending=" + (d.Ending ? "1" : "0"));
            sb.AppendLine("choruses=" + d.Choruses);
            sb.AppendLine("gesetz=" + d.Gesetz.ToString(CultureInfo.InvariantCulture));
            sb.AppendLine("sync=" + d.Sync.ToString(CultureInfo.InvariantCulture));
            sb.AppendLine("arp=" + d.Arp.ToString(CultureInfo.InvariantCulture));
            sb.AppendLine("bassact=" + d.BassAct.ToString(CultureInfo.InvariantCulture));
            sb.AppendLine("eightbit=" + (d.EightBit ? "1" : "0"));
            foreach (var b in d.Bars)
            {
                var parts = new List<string>();
                foreach (var c in b.Chords) parts.Add(ChordStr(c));
                sb.AppendLine("bar=" + string.Join(";", parts));
            }
            File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
        }

        static string ChordStr(Chord c)
        {
            var ts = new List<int>(c.Tensions);
            ts.Sort();
            var t = new List<string>();
            foreach (var x in ts) t.Add(x.ToString(CultureInfo.InvariantCulture));
            return c.Root.ToString(CultureInfo.InvariantCulture) + "," + c.Quality + "," +
                   (c.Seventh ?? "-") + "," +
                   (t.Count > 0 ? string.Join("+", t) : "-") + "," +
                   (c.FlatOverride.HasValue ? (c.FlatOverride.Value ? "f" : "s") : "-") + "," +
                   c.Analysis.Replace(";", ",");
        }

        public static SongData Load(string path)
        {
            var d = new SongData();
            d.Bars = new List<Bar>();
            foreach (var raw in File.ReadAllLines(path))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line == "BTG1") continue;
                int eq = line.IndexOf('=');
                if (eq < 0) continue;
                string k = line.Substring(0, eq);
                string v = line.Substring(eq + 1);
                if (k == "key") d.Key = v;
                else if (k == "mode") d.Mode = v;
                else if (k == "form") d.Form = v;
                else if (k == "freedom") d.Freedom = int.Parse(v, CultureInfo.InvariantCulture);
                else if (k == "tempo") d.Tempo = int.Parse(v, CultureInfo.InvariantCulture);
                else if (k == "style") d.Style = v;
                else if (k == "comp") d.Comp = v;
                else if (k == "bass") d.Bass = v;
                else if (k == "drums") d.Drums = v == "1";
                else if (k == "intro") d.Intro = v == "1";
                else if (k == "ending") d.Ending = v == "1";
                else if (k == "choruses") d.Choruses = v;
                else if (k == "gesetz") d.Gesetz = int.Parse(v, CultureInfo.InvariantCulture);
                else if (k == "sync") d.Sync = int.Parse(v, CultureInfo.InvariantCulture);
                else if (k == "arp") d.Arp = int.Parse(v, CultureInfo.InvariantCulture);
                else if (k == "bassact") d.BassAct = int.Parse(v, CultureInfo.InvariantCulture);
                else if (k == "eightbit") d.EightBit = v == "1";
                else if (k == "bar")
                {
                    var chords = new List<Chord>();
                    foreach (var cs in v.Split(';'))
                    {
                        var f = cs.Split(new[] { ',' }, 6);
                        if (f.Length < 5) throw new InvalidDataException("Ungueltige Akkordzeile: " + cs);
                        var c = new Chord(int.Parse(f[0], CultureInfo.InvariantCulture), f[1],
                                          f[2] == "-" ? null : f[2],
                                          f.Length > 5 ? f[5] : "");
                        if (f[3] != "-")
                            foreach (var x in f[3].Split('+'))
                                c.Tensions.Add(int.Parse(x, CultureInfo.InvariantCulture));
                        if (f[4] == "f") c.FlatOverride = true;
                        else if (f[4] == "s") c.FlatOverride = false;
                        chords.Add(c);
                    }
                    var bar = new Bar(chords[0]);
                    for (int i = 1; i < chords.Count; i++) bar.Chords.Add(chords[i]);
                    d.Bars.Add(bar);
                }
            }
            if (d.Bars.Count == 0) throw new InvalidDataException("Keine Takte in der Datei.");
            return d;
        }

        // Ein Durchlauf des Schemas als Standard-MIDI-File (Format 0, 480 PPQ).
        // Beruecksichtigt Instrumentenwahl und abgeschaltete Spuren.
        public static void ExportMidi(string path, List<Bar> bars, int bpm, string style,
                                      int compProg, int bassProg, bool drums,
                                      int sync, int arp, int bassAct)
        {
            const int ppq = 480;
            var events = new List<int[]>();   // { Tick, On(1)/Off(0), Kanal, Note, Velocity }
            var ctx = new GrooveCtx { Rng = new Random(7), Sync = sync, Arp = arp, BassAct = bassAct };
            for (int i = 0; i < bars.Count; i++)
            {
                var evs = Styles.BarEvents(bars[i], bars[(i + 1) % bars.Count], style, ctx);
                foreach (var e in evs)
                {
                    if (e.Ch == Styles.PianoCh && compProg < 0) continue;
                    if (e.Ch == Styles.BassCh && bassProg < 0) continue;
                    if (e.Ch == Styles.DrumCh && !drums) continue;
                    int t0 = (int)Math.Round((i * 4 + e.Beat) * ppq);
                    int t1 = (int)Math.Round((i * 4 + e.Beat + e.Dur) * ppq);
                    if (t1 <= t0) t1 = t0 + 1;
                    events.Add(new[] { t0, 1, e.Ch, e.Note, e.Vel });
                    events.Add(new[] { t1, 0, e.Ch, e.Note, 0 });
                }
            }
            events.Sort(delegate(int[] a, int[] b)
            {
                int c = a[0].CompareTo(b[0]);
                if (c != 0) return c;
                return a[1].CompareTo(b[1]);   // Off vor On bei gleichem Tick
            });

            var trk = new List<byte>();
            WriteVar(trk, 0);                   // Tempo-Meta
            int usPerQ = 60000000 / Math.Max(30, bpm);
            trk.AddRange(new[] { (byte)0xFF, (byte)0x51, (byte)0x03, (byte)(usPerQ >> 16), (byte)(usPerQ >> 8), (byte)usPerQ });
            if (compProg >= 0)
            {
                WriteVar(trk, 0);
                trk.AddRange(new[] { (byte)0xC0, (byte)compProg });
            }
            if (bassProg >= 0)
            {
                WriteVar(trk, 0);
                trk.AddRange(new[] { (byte)0xC1, (byte)bassProg });
            }
            int last = 0;
            foreach (var e in events)
            {
                WriteVar(trk, e[0] - last);
                last = e[0];
                trk.Add((byte)((e[1] == 1 ? 0x90 : 0x80) | e[2]));
                trk.Add((byte)e[3]);
                trk.Add((byte)e[4]);
            }
            WriteVar(trk, ppq);                 // eine Viertel Luft vor dem Ende
            trk.AddRange(new[] { (byte)0xFF, (byte)0x2F, (byte)0x00 });

            var outb = new List<byte>();
            outb.AddRange(Encoding.ASCII.GetBytes("MThd"));
            outb.AddRange(Be32(6));
            outb.AddRange(Be16(0));
            outb.AddRange(Be16(1));
            outb.AddRange(Be16(ppq));
            outb.AddRange(Encoding.ASCII.GetBytes("MTrk"));
            outb.AddRange(Be32(trk.Count));
            outb.AddRange(trk);
            File.WriteAllBytes(path, outb.ToArray());
        }

        static void WriteVar(List<byte> b, int v)
        {
            if (v < 0) v = 0;
            var stack = new Stack<byte>();
            stack.Push((byte)(v & 0x7F));
            v >>= 7;
            while (v > 0)
            {
                stack.Push((byte)((v & 0x7F) | 0x80));
                v >>= 7;
            }
            while (stack.Count > 0) b.Add(stack.Pop());
        }

        static byte[] Be16(int v)
        {
            return new[] { (byte)(v >> 8), (byte)v };
        }

        static byte[] Be32(int v)
        {
            return new[] { (byte)(v >> 24), (byte)(v >> 16), (byte)(v >> 8), (byte)v };
        }
    }
}
