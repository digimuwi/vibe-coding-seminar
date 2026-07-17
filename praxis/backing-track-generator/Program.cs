using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace BackingTrack
{
    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--smoke")
            {
                Smoke();
                return;
            }
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            var form = new MainForm();
            if (args.Length > 0 && args[0] == "--8bit") form.EnableEightBit();
            Application.Run(form);
        }

        static string BarsToText(List<Bar> bars, bool flats)
        {
            var syms = new List<string>();
            foreach (var b in bars) syms.Add(b.Symbols(flats).Replace("   ", " "));
            return string.Join(" | ", syms);
        }

        // Selbsttest ohne Bedienung; Ergebnis landet in smoke_out.txt neben der Exe
        static void Smoke()
        {
            var log = new StringBuilder();
            try
            {
                // Formen 12/16 ueber alle Reglerstufen
                foreach (var minor in new[] { false, true })
                {
                    foreach (var f in new[] { 0, 25, 45, 65, 95 })
                    {
                        var bars = Generator.Generate(0, minor, "12", f, 42);
                        bool flats = Theory.UseFlatsForKey(0, minor);
                        log.AppendLine("C-" + (minor ? "Moll" : "Dur ") + " f=" + f.ToString().PadLeft(3) + ":  " + BarsToText(bars, flats));
                        if (bars.Count != 12) throw new Exception("Taktzahl falsch");
                        if (f < 90 && bars[bars.Count - 1].Chords[0].Root != 0) throw new Exception("Schluss nicht auf Tonika (f=" + f + ")");
                    }
                }
                var b16 = Generator.Generate(3, false, "16", 30, 1);
                if (b16.Count != 16) throw new Exception("16-Takt-Form falsch");

                // Blues-Preset
                foreach (var minor in new[] { false, true })
                {
                    foreach (var f in new[] { 0, 45, 70 })
                    {
                        var bl = Generator.Generate(0, minor, "blues", f, 5);
                        if (bl.Count != 12) throw new Exception("Blues-Taktzahl falsch");
                        if (f < 75 && bl[10].Chords[0].Root != 0) throw new Exception("Blues: Takt 11 keine Tonika (f=" + f + ")");
                        log.AppendLine("Blues C-" + (minor ? "Moll" : "Dur ") + " f=" + f.ToString().PadLeft(2) + ": " + BarsToText(bl, true));
                    }
                }

                // Style-Patterns liefern gueltige Events, auch an den Regler-Extremen
                var demo = Generator.Generate(0, false, "12", 45, 3);
                var allStyles = new List<string>(Styles.Names);
                allStyles.Add(Styles.EightBitStyle);
                foreach (var style in allStyles)
                {
                    foreach (var knobs in new[] { new[] { 0, 0, 0 }, new[] { 40, 40, 50 }, new[] { 100, 100, 100 }, new[] { 100, 75, 100 } })
                    {
                        var ctx = new GrooveCtx { Rng = new Random(1), Sync = knobs[0], Arp = knobs[1], BassAct = knobs[2] };
                        for (int i = 0; i < demo.Count; i++)
                        {
                            var evs = Styles.BarEvents(demo[i], demo[(i + 1) % demo.Count], style, ctx);
                            if (evs.Count < 4) throw new Exception("Zu wenige Events: " + style);
                            foreach (var e in evs)
                                if (e.Beat < 0 || e.Beat + e.Dur > 4.25 || e.Note < 0 || e.Note > 127 || e.Vel < 0 || e.Vel > 127)
                                    throw new Exception("Event ausserhalb (" + style + "): Beat " + e.Beat + " Dur " + e.Dur + " Note " + e.Note);
                        }
                    }
                }
                log.AppendLine("Styles (inkl. 8-Bit, Regler-Extreme): ok");

                // Speichern/Laden-Roundtrip
                var data = new SongData
                {
                    Key = "F", Mode = "Moll", Form = "16 Takte", Freedom = 60, Tempo = 132, Style = "Bossa",
                    Bars = Generator.Generate(5, true, "16", 60, 9),
                };
                string tmp = Path.Combine(Path.GetTempPath(), "btg_test.btg");
                SongFile.Save(tmp, data);
                var back = SongFile.Load(tmp);
                if (back.Bars.Count != data.Bars.Count || back.Tempo != 132 || back.Style != "Bossa" || back.Key != "F")
                    throw new Exception("Roundtrip-Kopf falsch");
                for (int i = 0; i < back.Bars.Count; i++)
                    if (!back.Bars[i].SameAs(data.Bars[i])) throw new Exception("Roundtrip Takt " + (i + 1));
                log.AppendLine("Speichern/Laden: ok");

                // Ending-Takte
                foreach (var minor in new[] { false, true })
                {
                    var end = Generator.EndingBars(0, minor, 40);
                    if (end.Count != 2 || end[1].Chords[0].Root != 0) throw new Exception("Ending falsch");
                    var hit = Styles.FinalHit(new GrooveCtx(), end[1].Chords[0]);
                    if (hit.Count < 3) throw new Exception("FinalHit leer");
                }
                log.AppendLine("Ending: ok");

                // MIDI-Export
                string mid = Path.Combine(Path.GetTempPath(), "btg_test.mid");
                SongFile.ExportMidi(mid, data.Bars, 120, "Swing", 0, 32, true, 40, 0, 50);
                var bytes = File.ReadAllBytes(mid);
                if (bytes.Length < 60 || bytes[0] != (byte)'M' || bytes[1] != (byte)'T' || bytes[2] != (byte)'h' || bytes[3] != (byte)'d')
                    throw new Exception("MIDI-Header falsch");
                log.AppendLine("MIDI-Export: ok (" + bytes.Length + " Bytes)");

                // Oberflaeche einmal aufbauen
                using (var form = new MainForm())
                {
                    form.CreateControl();
                }
                log.AppendLine("UI: ok");

                try
                {
                    using (var m = new MidiOut()) { }
                    log.AppendLine("MIDI-Geraet: ok");
                }
                catch (Exception e)
                {
                    log.AppendLine("MIDI-Geraet: " + e.Message);
                }

                log.AppendLine("SMOKE OK");
            }
            catch (Exception e)
            {
                log.AppendLine("FEHLER: " + e);
            }
            File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "smoke_out.txt"), log.ToString());
        }
    }
}
