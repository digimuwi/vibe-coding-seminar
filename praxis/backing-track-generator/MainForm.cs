using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace BackingTrack
{
    static class Ui
    {
        // DPI-Skalierung: alle Pixelmasse laufen durch S()
        public static float Scale = 1f;
        public static int S(int v)
        {
            return (int)Math.Round(v * Scale);
        }

        public static readonly Color Bg     = Color.FromArgb(24, 25, 29);
        public static readonly Color Panel  = Color.FromArgb(38, 41, 47);
        public static readonly Color Cell   = Color.FromArgb(45, 48, 56);
        public static readonly Color Border = Color.FromArgb(60, 64, 74);
        public static readonly Color Accent = Color.FromArgb(216, 151, 60);
        public static readonly Color Dim    = Color.FromArgb(154, 160, 168);
        public static readonly Font Big   = new Font("Segoe UI", 15f, FontStyle.Bold);
        public static readonly Font Mid   = new Font("Segoe UI", 11.5f, FontStyle.Bold);
        public static readonly Font Small = new Font("Segoe UI", 8f);
        public static readonly Font Norm  = new Font("Segoe UI", 9.5f);

        // 8-Bit-Modus: Texte werden klein gerendert und pixelig hochskaliert
        public static bool EightBitMode;
        static readonly Dictionary<float, Font> PixelFonts = new Dictionary<float, Font>();

        public static void DrawText(Graphics g, string text, Font f, Rectangle r, Color c, TextFormatFlags flags)
        {
            if (string.IsNullOrEmpty(text) || r.Width < 4 || r.Height < 4) return;
            if (!EightBitMode)
            {
                TextRenderer.DrawText(g, text, f, r, c, flags);
                return;
            }
            const int sc = 3;
            int w = Math.Max(4, r.Width / sc);
            int h = Math.Max(5, r.Height / sc);
            Font small;
            if (!PixelFonts.TryGetValue(f.Size, out small))
            {
                small = new Font(f.FontFamily, Math.Max(3.2f, f.Size / sc * 0.9f), FontStyle.Bold);
                PixelFonts[f.Size] = small;
            }
            using (var bmp = new Bitmap(w, h))
            {
                using (var bg = Graphics.FromImage(bmp))
                using (var sf = new StringFormat())
                using (var br = new SolidBrush(c))
                {
                    bg.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;
                    sf.Alignment = (flags & TextFormatFlags.HorizontalCenter) == TextFormatFlags.HorizontalCenter
                        ? StringAlignment.Center : StringAlignment.Near;
                    // immer vertikal zentrieren, sonst werden Unterlaengen abgeschnitten
                    sf.LineAlignment = StringAlignment.Center;
                    sf.Trimming = StringTrimming.EllipsisCharacter;
                    sf.FormatFlags = StringFormatFlags.NoWrap | StringFormatFlags.NoClip;
                    bg.DrawString(text, small, br, new RectangleF(0, 0, w, h), sf);
                }
                var oldI = g.InterpolationMode;
                var oldP = g.PixelOffsetMode;
                g.InterpolationMode = InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                g.DrawImage(bmp, r);
                g.InterpolationMode = oldI;
                g.PixelOffsetMode = oldP;
            }
        }
    }

    // dunkles Farbschema fuer Menues
    class DarkColors : ProfessionalColorTable
    {
        public override Color MenuItemSelected { get { return Ui.Cell; } }
        public override Color MenuItemBorder { get { return Ui.Accent; } }
        public override Color MenuBorder { get { return Ui.Border; } }
        public override Color ToolStripDropDownBackground { get { return Ui.Panel; } }
        public override Color ImageMarginGradientBegin { get { return Ui.Panel; } }
        public override Color ImageMarginGradientMiddle { get { return Ui.Panel; } }
        public override Color ImageMarginGradientEnd { get { return Ui.Panel; } }
        public override Color MenuItemSelectedGradientBegin { get { return Ui.Cell; } }
        public override Color MenuItemSelectedGradientEnd { get { return Ui.Cell; } }
        public override Color MenuItemPressedGradientBegin { get { return Ui.Panel; } }
        public override Color MenuItemPressedGradientEnd { get { return Ui.Panel; } }
        public override Color SeparatorDark { get { return Ui.Border; } }
    }

    // Ein Takt im Raster: Nummer, Akkordsymbole, Analyse-Zeile.
    // Linksklick oeffnet den Editor, Rechtsklick das Kontextmenue.
    public class BarCell : Panel
    {
        public int Index;
        public string Symbol = "";
        public string Analysis = "";
        public bool Edited;
        public bool Playing;

        public BarCell()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Cursor = Cursors.Hand;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var rr = new Rectangle(1, 1, Width - 3, Height - 3);
            if (rr.Width < 12 || rr.Height < 12) return;
            using (var path = Seg.Rounded(rr, Ui.S(7)))
            {
                // Glaskoerper: dunkel, leicht durchscheinend
                using (var b = new LinearGradientBrush(rr, Color.FromArgb(228, 58, 63, 74), Color.FromArgb(238, 33, 36, 43), 90f))
                    g.FillPath(b, path);
                var oldClip = g.Clip;
                g.SetClip(path);
                var sheen = new Rectangle(rr.X, rr.Y, rr.Width, rr.Height * 2 / 5);
                using (var gb = new LinearGradientBrush(sheen, Color.FromArgb(32, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), 90f))
                    g.FillRectangle(gb, sheen);
                using (var bot = new Pen(Color.FromArgb(20, 255, 255, 255), 1f))
                    g.DrawLine(bot, rr.X + Ui.S(10), rr.Bottom - 2, rr.Right - Ui.S(10), rr.Bottom - 2);
                g.Clip = oldClip;
                if (Playing)
                {
                    using (var glow = new Pen(Seg.Lit(1f, 70), Ui.S(5)))
                        g.DrawPath(glow, path);
                    using (var p = new Pen(Seg.Lit(1f, 230), Ui.S(2)))
                        g.DrawPath(p, path);
                }
                else
                {
                    using (var p = new Pen(Color.FromArgb(15, 16, 19), 1.4f))
                        g.DrawPath(p, path);
                }
            }
            Ui.DrawText(g, (Index + 1).ToString(), Ui.Small, new Rectangle(Ui.S(8), Ui.S(5), Ui.S(30), Ui.S(14)), Ui.Dim, TextFormatFlags.Left);
            if (Edited)
            {
                int w = TextRenderer.MeasureText("bearbeitet", Ui.Small).Width;
                Ui.DrawText(g, "bearbeitet", Ui.Small, new Rectangle(Width - w - Ui.S(8), Ui.S(5), w + Ui.S(2), Ui.S(14)), Ui.Accent, TextFormatFlags.Left);
            }
            var font = Ui.Big;
            if (TextRenderer.MeasureText(Symbol, font).Width > Width - Ui.S(10)) font = Ui.Mid;
            int anaH = Ui.S(24);
            var mid = new Rectangle(0, Ui.S(8), Width, Height - Ui.S(8) - anaH);
            Ui.DrawText(g, Symbol, font, mid, Color.White,
                        TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            var bottom = new Rectangle(0, Height - anaH, Width, anaH - Ui.S(4));
            Ui.DrawText(g, Analysis, Ui.Small, bottom, Ui.Dim, TextFormatFlags.HorizontalCenter);
        }
    }

    public class MainForm : Form
    {
        const string PlayText = "▶  Play";
        const string StopText = "■  Stop";
        const string DefaultHint = "Takt: links bearbeiten, rechts würfeln/teilen · Regler: ziehen/Mausrad, Rechtsklick = Ausgangswert · Leertaste: Play/Stop";

        static readonly string[] CompNames = { "aus", "Piano", "E-Piano", "Orgel", "Jazz-Gitarre", "Vibraphon", "Pad" };
        static readonly int[] CompProgs = { -1, 0, 4, 16, 26, 11, 89 };
        static readonly string[] BassNames = { "aus", "Kontrabass", "E-Bass", "Fretless", "Synth-Bass" };
        static readonly int[] BassProgs = { -1, 32, 33, 35, 38 };
        static readonly string[] ChorusChoices = { "∞", "1", "2", "3", "4", "8" };
        static readonly string[] FormNames = { "12 Takte", "16 Takte", "Blues (12)" };

        // Kurztexte fuer die Segment-Displays
        static readonly string[] KeyDisp = { "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B" };
        static readonly string[] ModeDisp = { "DUR", "MOLL" };
        static readonly string[] FormDisp = { "12", "16", "BL" };
        static readonly string[] StyleDisp = { "SWG", "SHF", "BLU", "BOS", "POP", "FNK", "BAL" };
        static readonly string[] CompDisp = { "OFF", "PNO", "EP", "ORG", "GIT", "VIB", "PAD" };
        static readonly string[] BassDisp = { "OFF", "KTR", "EB", "FRT", "SYN" };

        readonly List<Bar> _bars = new List<Bar>();
        readonly List<Bar> _orig = new List<Bar>();
        readonly List<BarCell> _cells = new List<BarCell>();
        readonly List<KnobControl> _knobs = new List<KnobControl>();
        readonly Player _player = new Player();
        readonly ToolStripRenderer _menuRenderer = new ToolStripProfessionalRenderer(new DarkColors());

        bool _useFlats;
        volatile int _bpm = 110;
        volatile string _styleName = "Swing";
        volatile int _compProg = 0;
        volatile int _bassProg = 32;
        volatile bool _drumsOn = true;
        volatile bool _eightBitOn;
        volatile int _syncVal = 40;
        volatile int _arpVal = 0;
        volatile int _bassActVal = 50;
        int _genTonic;
        bool _genMinor;
        int _genFreedom = 25;
        int _lastHl = -2;
        bool _midiErrorShown;
        readonly Random _vuRng = new Random();
        float _vuL, _vuR;

        KnobControl _keyKnob;
        KnobControl _modeKnob;
        KnobControl _formKnob;
        KnobControl _tempoKnob;
        KnobControl _styleKnob;
        KnobControl _compKnob;
        KnobControl _bassKnob;
        KnobControl _chorusKnob;
        KnobControl _gesetzKnob;
        KnobControl _syncKnob;
        KnobControl _arpKnob;
        KnobControl _bassActKnob;
        ToggleSwitch _drums;
        ToggleSwitch _countIn;
        ToggleSwitch _intro;
        ToggleSwitch _ending;
        ToggleSwitch _eightBit;
        GlowButton _genBtn;
        GlowButton _playBtn;
        ReadoutDisplay _readout;
        VuMeter _vu;
        ConsolePanel _console;
        readonly List<ToggleSwitch> _switchList = new List<ToggleSwitch>();
        int _rainbowTick;
        float _rbExtent;
        TableLayoutPanel _grid;
        Label _status;
        Timer _timer;

        public MainForm()
        {
            using (var g = CreateGraphics()) Ui.Scale = g.DpiX / 96f;
            Text = "Backing Track Generator";
            BackColor = Ui.Bg;
            ForeColor = Color.White;
            Font = Ui.Norm;
            var area = Screen.PrimaryScreen.WorkingArea;
            int w = Math.Min(Ui.S(1030), area.Width - 30);
            int h = Math.Min(Ui.S(790), area.Height - 60);
            ClientSize = new Size(w, h);
            MinimumSize = new Size(Math.Min(Ui.S(990), area.Width - 30), Math.Min(Ui.S(660), area.Height - 60));
            KeyPreview = true;
            BuildControls();
            Generate();
            KeyDown += OnKey;
            _timer = new Timer { Interval = 60 };
            _timer.Tick += delegate { PollPlayhead(); };
            _timer.Start();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            _player.Stop();
            if (_timer != null) _timer.Stop();
            base.OnFormClosing(e);
        }

        // Testhilfe: 8-Bit-Modus direkt beim Start aktivieren (Argument --8bit)
        public void EnableEightBit()
        {
            _eightBit.Checked = true;
        }

        // Retro-Soundeffekt beim Umschalten (Rechtecktoene ueber den System-Beeper)
        static void PlayModeFx(bool up)
        {
            var th = new System.Threading.Thread(delegate()
            {
                try
                {
                    int[] freqs = up
                        ? new[] { 523, 659, 784, 1046, 1318, 1568, 2093 }
                        : new[] { 1568, 1046, 784, 523, 392 };
                    foreach (var f in freqs) Console.Beep(f, up ? 45 : 60);
                }
                catch { }
            });
            th.IsBackground = true;
            th.Start();
        }

        void OnKey(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Space)
            {
                TogglePlay();
                e.Handled = true;
                e.SuppressKeyPress = true;
            }
        }

        int FreedomVal()
        {
            return 100 - _gesetzKnob.Value;   // 100 = volles Jazz-Gesetz = streng
        }

        // ---- Aufbau ----------------------------------------------------------

        Button MkButton(string text)
        {
            var b = new Button
            {
                Text = text, BackColor = Ui.Panel, ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat, Width = Ui.S(112), Height = Ui.S(32),
            };
            b.FlatAppearance.BorderColor = Ui.Border;
            return b;
        }

        ToolStripMenuItem MkMenuItem(string text, Keys shortcut, Action onClick)
        {
            var it = new ToolStripMenuItem(text) { ForeColor = Color.White };
            if (shortcut != Keys.None) it.ShortcutKeys = shortcut;
            it.Click += delegate { onClick(); };
            return it;
        }

        KnobControl AddKnob(Control parent, int x, int y, string label, int min, int max, int val, string[] disp)
        {
            var k = new KnobControl
            {
                Minimum = min, Maximum = max, DefaultValue = val,
                LabelText = label, DisplayChoices = disp,
                Bounds = new Rectangle(x, y, Ui.S(76), Ui.S(118)),
            };
            k.Value = val;
            parent.Controls.Add(k);
            _knobs.Add(k);
            return k;
        }

        ToggleSwitch AddSwitch(Control parent, int x, int y, string label, bool val)
        {
            // Breite an der Beschriftung ausrichten, damit nichts abgeschnitten wird
            int w = Math.Max(Ui.S(52), TextRenderer.MeasureText(label, Ui.Small).Width + Ui.S(10));
            var t = new ToggleSwitch
            {
                DefaultChecked = val, LabelText = label,
                Bounds = new Rectangle(x, y, w, Ui.S(118)),
            };
            t.Checked = val;
            parent.Controls.Add(t);
            _switchList.Add(t);
            return t;
        }

        void BuildControls()
        {
            _grid = new GridHost { Dock = DockStyle.Fill, Padding = new Padding(Ui.S(8), Ui.S(4), Ui.S(8), Ui.S(2)) };
            var console = new ConsolePanel { Dock = DockStyle.Top, Height = Ui.S(272) };
            _console = console;
            _status = new Label
            {
                Dock = DockStyle.Bottom, Height = Ui.S(26), BackColor = Ui.Bg, ForeColor = Ui.Dim,
                Text = DefaultHint,
                Padding = new Padding(Ui.S(12), Ui.S(5), 0, 0),
            };

            Controls.Add(_grid);
            Controls.Add(_status);
            Controls.Add(console);

            // Menue
            var menu = new MenuStrip { BackColor = Ui.Panel, ForeColor = Color.White, Renderer = _menuRenderer };
            var mFile = new ToolStripMenuItem("Datei") { ForeColor = Color.White };
            mFile.DropDownItems.Add(MkMenuItem("Neu generieren", Keys.Control | Keys.G, Generate));
            mFile.DropDownItems.Add(new ToolStripSeparator());
            mFile.DropDownItems.Add(MkMenuItem("Schema laden…", Keys.Control | Keys.O, LoadSong));
            mFile.DropDownItems.Add(MkMenuItem("Schema speichern…", Keys.Control | Keys.S, SaveSong));
            mFile.DropDownItems.Add(MkMenuItem("Als MIDI exportieren…", Keys.Control | Keys.E, ExportMidiFile));
            mFile.DropDownItems.Add(new ToolStripSeparator());
            mFile.DropDownItems.Add(MkMenuItem("Beenden", Keys.None, Close));
            menu.Items.Add(mFile);
            MainMenuStrip = menu;
            Controls.Add(menu);

            // Reihe A: Song-Parameter + Schalter
            int x = Ui.S(22), y = Ui.S(10), step = Ui.S(78);
            _keyKnob = AddKnob(console, x, y, "TONART", 0, 11, 0, KeyDisp); x += step;
            _modeKnob = AddKnob(console, x, y, "TONGESCHL.", 0, 1, 0, ModeDisp); x += step;
            _formKnob = AddKnob(console, x, y, "FORM", 0, 2, 0, FormDisp); x += step;
            _tempoKnob = AddKnob(console, x, y, "TEMPO", 40, 240, 110, null); x += step;
            _styleKnob = AddKnob(console, x, y, "STIL", 0, Styles.Names.Length - 1, 0, StyleDisp); x += step;
            _compKnob = AddKnob(console, x, y, "BEGLEITUNG", 0, CompNames.Length - 1, 1, CompDisp); x += step;
            _bassKnob = AddKnob(console, x, y, "BASS", 0, BassNames.Length - 1, 1, BassDisp); x += step;
            _chorusKnob = AddKnob(console, x, y, "CHORUSSE", 0, ChorusChoices.Length - 1, 0, ChorusChoices); x += step;

            x += Ui.S(12);
            _drums = AddSwitch(console, x, y, "DRUMS", true); x += _drums.Width + Ui.S(2);
            _countIn = AddSwitch(console, x, y, "VORZÄHLER", true); x += _countIn.Width + Ui.S(2);
            _intro = AddSwitch(console, x, y, "INTRO", false); x += _intro.Width + Ui.S(2);
            _ending = AddSwitch(console, x, y, "ENDING", false); x += _ending.Width + Ui.S(2);
            _eightBit = AddSwitch(console, x, y, "8-BIT", false);
            _eightBit.RainbowLed = true;

            // Reihe B: Ausdrucks-Regler + Transport
            x = Ui.S(22);
            int y2 = y + Ui.S(126);
            _gesetzKnob = AddKnob(console, x, y2, "JAZZ-GESETZ", 0, 100, 75, null); x += step;
            _syncKnob = AddKnob(console, x, y2, "SYNKOPEN", 0, 100, 40, null); x += step;
            _arpKnob = AddKnob(console, x, y2, "ARPEGGIO", 0, 100, 0, null); x += step;
            _bassActKnob = AddKnob(console, x, y2, "BASS-AKT.", 0, 100, 50, null); x += step;

            // Klartext-Readout fuer den zuletzt bedienten Regler
            _readout = new ReadoutDisplay
            {
                Bounds = new Rectangle(x + Ui.S(12), y2 + Ui.S(26), Ui.S(250), Ui.S(56)),
            };
            console.Controls.Add(_readout);

            // Pegelmeter (dekorativ, laeuft mit der Wiedergabe)
            _vu = new VuMeter
            {
                Bounds = new Rectangle(x + Ui.S(12) + Ui.S(258), y2 + Ui.S(4), Ui.S(52), Ui.S(106)),
            };
            console.Controls.Add(_vu);

            _playBtn = new GlowButton
            {
                Text = PlayText,
                Bounds = new Rectangle(console.ClientSize.Width - Ui.S(140), y2 + Ui.S(40), Ui.S(116), Ui.S(38)),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
            };
            _playBtn.Click += delegate { TogglePlay(); };
            console.Controls.Add(_playBtn);

            _genBtn = new GlowButton
            {
                Text = "Generieren",
                Bounds = new Rectangle(console.ClientSize.Width - Ui.S(266), y2 + Ui.S(40), Ui.S(116), Ui.S(38)),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
            };
            _genBtn.Click += delegate { Generate(); };
            console.Controls.Add(_genBtn);

            // Verdrahtung: Zustaende
            _tempoKnob.ValueChanged += delegate { _bpm = _tempoKnob.Value; };
            _styleKnob.ValueChanged += delegate { _styleName = Styles.Names[_styleKnob.Value]; };
            _compKnob.ValueChanged += delegate { _compProg = CompProgs[_compKnob.Value]; };
            _bassKnob.ValueChanged += delegate { _bassProg = BassProgs[_bassKnob.Value]; };
            _drums.CheckedChanged += delegate { _drumsOn = _drums.Checked; };
            _eightBit.CheckedChanged += delegate
            {
                _eightBitOn = _eightBit.Checked;
                PlayModeFx(_eightBitOn);
                _status.Text = _eightBitOn ? "8-BIT-MODUS AKTIV – READY PLAYER ONE" : DefaultHint;
            };
            _syncKnob.ValueChanged += delegate { _syncVal = _syncKnob.Value; };
            _arpKnob.ValueChanged += delegate { _arpVal = _arpKnob.Value; };
            _bassActKnob.ValueChanged += delegate { _bassActVal = _bassActKnob.Value; };

            // Verdrahtung: Klartext-Readout fuer den zuletzt bedienten Regler
            Wire(_keyKnob, "TONART", delegate { return KeyDisp[_keyKnob.Value]; });
            Wire(_modeKnob, "TONGESCHLECHT", delegate { return _modeKnob.Value == 1 ? "Moll" : "Dur"; });
            Wire(_formKnob, "FORM", delegate { return FormNames[_formKnob.Value]; });
            Wire(_tempoKnob, "TEMPO", delegate { return _tempoKnob.Value + " BPM"; });
            Wire(_styleKnob, "STIL", delegate { return Styles.Names[_styleKnob.Value]; });
            Wire(_compKnob, "BEGLEITUNG", delegate { return CompNames[_compKnob.Value]; });
            Wire(_bassKnob, "BASS", delegate { return BassNames[_bassKnob.Value]; });
            Wire(_chorusKnob, "CHORUSSE", delegate { return _chorusKnob.Value == 0 ? "endlos (∞)" : ChorusChoices[_chorusKnob.Value] + " Chorusse"; });
            Wire(_gesetzKnob, "JAZZ-GESETZ", delegate { return _gesetzKnob.Value + " – " + Generator.TierName(FreedomVal()); });
            Wire(_syncKnob, "SYNKOPEN", delegate
            {
                return _syncKnob.Value + " – " + (_syncKnob.Value < 33 ? "ruhig" : _syncKnob.Value <= 66 ? "normal" : "offbeat-lastig");
            });
            Wire(_arpKnob, "ARPEGGIO", delegate
            {
                return _arpKnob.Value + " – " + (_arpKnob.Value < 20 ? "aus" : _arpKnob.Value <= 60 ? "gerollte Akkorde"
                    : _arpKnob.Value <= 80 ? "Dauer-Arpeggio" : "Arpeggio auf & ab");
            });
            Wire(_bassActKnob, "BASS-AKTIVITÄT", delegate
            {
                return _bassActKnob.Value + " – " + (_bassActKnob.Value < 25 ? "halbe Noten" : _bassActKnob.Value <= 70 ? "normal" : "aktiv mit Fills");
            });
            WireSwitch(_drums, "DRUMS");
            WireSwitch(_countIn, "VORZÄHLER");
            WireSwitch(_intro, "INTRO (letzte 4 Takte)");
            WireSwitch(_ending, "ENDING");
            WireSwitch(_eightBit, "8-BIT-MODUS");
            _readout.Show("JAZZ-GESETZ", _gesetzKnob.Value + " – " + Generator.TierName(FreedomVal()));
        }

        void Wire(KnobControl k, string title, Func<string> text)
        {
            k.ValueChanged += delegate { _readout.Show(title, text()); };
            k.Touched += delegate { _readout.Show(title, text()); };
            k.DidReset += delegate { _readout.Show(title, text() + "  (Standard)"); };
        }

        void WireSwitch(ToggleSwitch t, string title)
        {
            t.CheckedChanged += delegate { _readout.Show(title, t.Checked ? "an" : "aus"); };
            t.DidReset += delegate { _readout.Show(title, (t.Checked ? "an" : "aus") + "  (Standard)"); };
        }

        // ---- Modell ----------------------------------------------------------

        string FormKey()
        {
            return _formKnob.Value == 1 ? "16" : _formKnob.Value == 2 ? "blues" : "12";
        }

        void Generate()
        {
            bool wasPlaying = _player.Running;
            _player.Stop();
            _genTonic = Theory.KeyToPc(Theory.KeyChoices[_keyKnob.Value]);
            _genMinor = _modeKnob.Value == 1;
            _genFreedom = FreedomVal();
            _useFlats = Theory.UseFlatsForKey(_genTonic, _genMinor);
            var bars = Generator.Generate(_genTonic, _genMinor, FormKey(), _genFreedom);
            _bars.Clear();
            _orig.Clear();
            foreach (var b in bars)
            {
                _bars.Add(b);
                _orig.Add(b.Copy());
            }
            RenderGrid();
            if (wasPlaying) StartPlay();
        }

        void RenderGrid()
        {
            _grid.SuspendLayout();
            _grid.Controls.Clear();
            foreach (var c in _cells) c.Dispose();
            _cells.Clear();
            _lastHl = -2;
            int rows = Math.Max(1, _bars.Count / 4);
            _grid.ColumnCount = 4;
            _grid.RowCount = rows;
            _grid.ColumnStyles.Clear();
            _grid.RowStyles.Clear();
            for (int c = 0; c < 4; c++) _grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25f));
            for (int r = 0; r < rows; r++) _grid.RowStyles.Add(new RowStyle(SizeType.Percent, 100f / rows));
            for (int i = 0; i < _bars.Count; i++)
            {
                var cell = new BarCell { Index = i, Dock = DockStyle.Fill, Margin = new Padding(Ui.S(4)) };
                int idx = i;
                cell.MouseClick += delegate(object s, MouseEventArgs me)
                {
                    if (me.Button == MouseButtons.Left) EditBar(idx);
                    else if (me.Button == MouseButtons.Right) ShowBarMenu(idx, (Control)s, me.Location);
                };
                _cells.Add(cell);
                _grid.Controls.Add(cell, i % 4, i / 4);
                UpdateCell(i);
            }
            _grid.ResumeLayout();
        }

        void UpdateCell(int i)
        {
            var cell = _cells[i];
            cell.Symbol = _bars[i].Symbols(_useFlats);
            cell.Analysis = _bars[i].Analyses();
            cell.Edited = !_bars[i].SameAs(_orig[i]);
            cell.Invalidate();
        }

        // ---- Wiedergabe ------------------------------------------------------

        void TogglePlay()
        {
            if (_player.Running)
            {
                _player.Stop();
                _playBtn.Text = PlayText;
                _playBtn.Lit = false;
                _playBtn.Invalidate();
            }
            else
            {
                StartPlay();
            }
        }

        int ChorusCount()
        {
            string v = ChorusChoices[_chorusKnob.Value];
            if (v == "∞") return 0;
            return int.Parse(v);
        }

        void StartPlay()
        {
            _midiErrorShown = false;
            int choruses = ChorusCount();
            var o = new PlayOptions
            {
                GetBars = delegate { return _bars; },
                GetBpm = delegate { return _bpm; },
                GetStyle = delegate { return _eightBitOn ? Styles.EightBitStyle : _styleName; },
                GetCompProg = delegate { return _eightBitOn && _compProg >= 0 ? 80 : _compProg; },
                GetBassProg = delegate { return _eightBitOn && _bassProg >= 0 ? 80 : _bassProg; },
                GetDrumsOn = delegate { return _drumsOn; },
                GetSync = delegate { return _syncVal; },
                GetArp = delegate { return _arpVal; },
                GetBassAct = delegate { return _bassActVal; },
                CountIn = _countIn.Checked,
                Intro = _intro.Checked,
                Choruses = choruses,
                Ending = _ending.Checked && choruses > 0
                    ? Generator.EndingBars(_genTonic, _genMinor, _genFreedom)
                    : null,
            };
            if (_ending.Checked && choruses == 0)
                _status.Text = "Hinweis: Das Ending spielt nur bei endlicher Chorus-Zahl (Chorusse ≠ ∞).";
            _player.Start(o);
            _playBtn.Text = StopText;
            _playBtn.Lit = true;
            _playBtn.Invalidate();
        }

        void PollPlayhead()
        {
            // Display-Flackern und Pegelanimation
            foreach (var k in _knobs) k.FlickerTick();
            foreach (var s in _switchList) s.FlickerTick();
            _readout.FlickerTick();
            _vu.FlickerTick();
            // Regenbogen: beim Umschalten uebernimmt er das Panel von links nach rechts
            float goal = _eightBitOn ? 1f : 0f;
            if (Math.Abs(_rbExtent - goal) > 0.001f)
            {
                _rbExtent += Math.Sign(goal - _rbExtent) * 0.05f;
                if (_rbExtent < 0f) _rbExtent = 0f;
                if (_rbExtent > 1f) _rbExtent = 1f;
                _console.RainbowExtent = _rbExtent;
                _console.EightBit = _rbExtent > 0.001f;
                _console.RainbowPhase = (_console.RainbowPhase + 0.011f) % 1f;
                _console.Invalidate(true);
            }
            else if (_eightBitOn)
            {
                _console.RainbowPhase = (_console.RainbowPhase + 0.011f) % 1f;
                _rainbowTick++;
                if ((_rainbowTick & 1) == 0) _console.Invalidate(true);
            }
            // Pixel-Font schaltet um, sobald der Sweep die Mitte passiert
            bool pixel = _rbExtent > 0.5f;
            if (pixel != Ui.EightBitMode)
            {
                Ui.EightBitMode = pixel;
                _console.Invalidate(true);
                _grid.Invalidate(true);
                _readout.Invalidate();
            }
            float target = 0f;
            if (_player.Running)
            {
                if (_player.CurrentBar >= 0)
                {
                    double beatMs = 60000.0 / Math.Max(30, _bpm);
                    double phase = (Environment.TickCount % (int)beatMs) / beatMs;
                    target = (float)(0.34 + Math.Pow(1 - phase, 2.2) * 0.45);
                }
                else target = 0.14f;   // Vorzaehler / Ending
            }
            float jit = _player.Running ? 0.16f : 0.02f;
            _vuL = 0.55f * _vuL + 0.45f * (target + (float)_vuRng.NextDouble() * jit);
            _vuR = 0.55f * _vuR + 0.45f * (target + (float)_vuRng.NextDouble() * jit);
            _vu.SetLevels(_vuL, _vuR);

            int cur = _player.Running ? _player.CurrentBar : -1;
            if (cur != _lastHl)
            {
                for (int i = 0; i < _cells.Count; i++)
                {
                    bool p = i == cur;
                    if (_cells[i].Playing != p)
                    {
                        _cells[i].Playing = p;
                        _cells[i].Invalidate();
                    }
                }
                _lastHl = cur;
            }
            if (!_player.Running && _playBtn.Lit)
            {
                _playBtn.Text = PlayText;
                _playBtn.Lit = false;
                _playBtn.Invalidate();
            }
            if (_player.LastError != null && !_midiErrorShown)
            {
                _midiErrorShown = true;
                _status.Text = "MIDI-Fehler: " + _player.LastError;
            }
        }

        // ---- Takt-Kontextmenue -----------------------------------------------

        void ShowBarMenu(int i, Control anchor, Point at)
        {
            var menu = new ContextMenuStrip { BackColor = Ui.Panel, ForeColor = Color.White, Renderer = _menuRenderer };
            var bar = _bars[i];

            var reroll = new ToolStripMenuItem("Takt neu würfeln") { ForeColor = Color.White };
            reroll.Click += delegate
            {
                _bars[i] = Generator.RerollBar(_bars, i, _genTonic, _genMinor, _genFreedom);
                UpdateCell(i);
            };
            menu.Items.Add(reroll);

            if (bar.Chords.Count == 1)
            {
                var split = new ToolStripMenuItem("In zwei Akkorde teilen") { ForeColor = Color.White };
                split.Click += delegate
                {
                    bar.Chords.Add(bar.Chords[0].Copy());
                    UpdateCell(i);
                    EditBar(i);
                };
                menu.Items.Add(split);
            }
            else
            {
                var join = new ToolStripMenuItem("Zweiten Akkord entfernen") { ForeColor = Color.White };
                join.Click += delegate
                {
                    bar.Chords.RemoveAt(1);
                    UpdateCell(i);
                };
                menu.Items.Add(join);
            }

            var reset = new ToolStripMenuItem("Zurücksetzen (wie generiert)") { ForeColor = Color.White };
            reset.Click += delegate
            {
                _bars[i] = _orig[i].Copy();
                UpdateCell(i);
            };
            menu.Items.Add(reset);

            menu.Show(anchor, at);
        }

        // ---- Takt-Editor -----------------------------------------------------

        void EditBar(int i)
        {
            Func<int, int> S = Ui.S;
            var bar = _bars[i];
            bool two = bar.Chords.Count == 2;
            int yBase = two ? 108 : 78;
            using (var dlg = new Form())
            {
                dlg.Text = "Takt " + (i + 1) + " bearbeiten";
                dlg.BackColor = Ui.Panel;
                dlg.ForeColor = Color.White;
                dlg.Font = Ui.Norm;
                dlg.FormBorderStyle = FormBorderStyle.FixedToolWindow;
                dlg.StartPosition = FormStartPosition.CenterParent;
                dlg.ClientSize = new Size(S(370), S(yBase + 162));
                dlg.ShowInTaskbar = false;

                var preview = new Label
                {
                    Text = bar.Symbols(_useFlats), Font = Ui.Mid, ForeColor = Color.White, BackColor = Ui.Panel,
                    Bounds = new Rectangle(0, S(10), S(370), S(34)), TextAlign = ContentAlignment.MiddleCenter,
                };
                var ana = new Label
                {
                    Text = "laut Generator: " + bar.Analyses(), ForeColor = Ui.Dim, BackColor = Ui.Panel,
                    Bounds = new Rectangle(0, S(46), S(370), S(20)), TextAlign = ContentAlignment.MiddleCenter,
                };
                dlg.Controls.Add(preview);
                dlg.Controls.Add(ana);

                int cur = 0;
                bool loading = false;

                var sevNames = new[] { "keine", "6", "7", "maj7" };
                var sevValues = new[] { null, "6", "b7", "maj7" };
                var sevRadios = new RadioButton[4];
                var sevPanel = new Panel { Bounds = new Rectangle(S(24), S(yBase + 22), S(330), S(28)), BackColor = Ui.Panel };
                for (int k = 0; k < 4; k++)
                {
                    sevRadios[k] = new RadioButton
                    {
                        Text = sevNames[k], AutoSize = true, ForeColor = Color.White, BackColor = Ui.Panel,
                        Location = new Point(S(k * 82), 0),
                    };
                    sevPanel.Controls.Add(sevRadios[k]);
                }

                var t9 = new CheckBox { Text = "9", AutoSize = true, ForeColor = Color.White, BackColor = Ui.Panel, Location = new Point(S(24), S(yBase + 78)) };
                var t11 = new CheckBox { Text = "11", AutoSize = true, ForeColor = Color.White, BackColor = Ui.Panel, Location = new Point(S(94), S(yBase + 78)) };
                var t13 = new CheckBox { Text = "13", AutoSize = true, ForeColor = Color.White, BackColor = Ui.Panel, Location = new Point(S(164), S(yBase + 78)) };
                var sus = new CheckBox { Text = "sus4", AutoSize = true, ForeColor = Color.White, BackColor = Ui.Panel, Location = new Point(S(240), S(yBase + 78)) };

                Action loadChord = delegate
                {
                    loading = true;
                    var ch = bar.Chords[cur];
                    for (int k = 0; k < 4; k++) sevRadios[k].Checked = ch.Seventh == sevValues[k];
                    t9.Checked = ch.Tensions.Contains(9);
                    t11.Checked = ch.Tensions.Contains(11);
                    t13.Checked = ch.Tensions.Contains(13);
                    sus.Checked = ch.Quality == "sus4";
                    loading = false;
                };

                Action apply = delegate
                {
                    if (loading) return;
                    var ch = bar.Chords[cur];
                    for (int k = 0; k < 4; k++)
                        if (sevRadios[k].Checked) ch.Seventh = sevValues[k];
                    if (sus.Checked)
                    {
                        if (ch.Quality != "sus4")
                        {
                            ch.PreSusQuality = ch.Quality;
                            ch.Quality = "sus4";
                        }
                    }
                    else if (ch.Quality == "sus4")
                    {
                        ch.Quality = ch.PreSusQuality ?? "maj";
                    }
                    ch.Tensions.Clear();
                    if (t9.Checked) ch.Tensions.Add(9);
                    if (t11.Checked) ch.Tensions.Add(11);
                    if (t13.Checked) ch.Tensions.Add(13);
                    preview.Text = bar.Symbols(_useFlats);
                    UpdateCell(i);
                };

                if (two)
                {
                    var halfPanel = new Panel { Bounds = new Rectangle(S(24), S(76), S(330), S(28)), BackColor = Ui.Panel };
                    var h1 = new RadioButton { Text = "1. Akkord", Checked = true, AutoSize = true, ForeColor = Ui.Accent, BackColor = Ui.Panel, Location = new Point(0, 0) };
                    var h2 = new RadioButton { Text = "2. Akkord", AutoSize = true, ForeColor = Ui.Accent, BackColor = Ui.Panel, Location = new Point(S(120), 0) };
                    h1.CheckedChanged += delegate { if (h1.Checked) { cur = 0; loadChord(); } };
                    h2.CheckedChanged += delegate { if (h2.Checked) { cur = 1; loadChord(); } };
                    halfPanel.Controls.Add(h1);
                    halfPanel.Controls.Add(h2);
                    dlg.Controls.Add(halfPanel);
                }

                dlg.Controls.Add(new Label { Text = "Sexte / Septime", ForeColor = Ui.Dim, BackColor = Ui.Panel, Location = new Point(S(24), S(yBase)), AutoSize = true });
                dlg.Controls.Add(sevPanel);
                dlg.Controls.Add(new Label { Text = "Tensions & sus4", ForeColor = Ui.Dim, BackColor = Ui.Panel, Location = new Point(S(24), S(yBase + 56)), AutoSize = true });
                dlg.Controls.Add(t9);
                dlg.Controls.Add(t11);
                dlg.Controls.Add(t13);
                dlg.Controls.Add(sus);

                loadChord();
                for (int k = 0; k < 4; k++) sevRadios[k].CheckedChanged += delegate { apply(); };
                t9.CheckedChanged += delegate { apply(); };
                t11.CheckedChanged += delegate { apply(); };
                t13.CheckedChanged += delegate { apply(); };
                sus.CheckedChanged += delegate { apply(); };

                var resetBtn = MkButton("Zurücksetzen");
                resetBtn.Bounds = new Rectangle(S(24), S(yBase + 116), S(140), S(32));
                resetBtn.Click += delegate
                {
                    _bars[i] = _orig[i].Copy();
                    UpdateCell(i);
                    dlg.Close();
                };
                dlg.Controls.Add(resetBtn);

                var okBtn = MkButton("Fertig");
                okBtn.Bounds = new Rectangle(S(250), S(yBase + 116), S(100), S(32));
                okBtn.Click += delegate { dlg.Close(); };
                dlg.Controls.Add(okBtn);

                dlg.ShowDialog(this);
            }
        }

        // ---- Datei -----------------------------------------------------------

        void SaveSong()
        {
            using (var sfd = new SaveFileDialog { Filter = "Backing-Track-Schema (*.btg)|*.btg", FileName = "schema.btg" })
            {
                if (sfd.ShowDialog(this) != DialogResult.OK) return;
                var d = new SongData
                {
                    Key = Theory.KeyChoices[_keyKnob.Value],
                    Mode = _modeKnob.Value == 1 ? "Moll" : "Dur",
                    Form = FormNames[_formKnob.Value],
                    Freedom = FreedomVal(),
                    Gesetz = _gesetzKnob.Value,
                    Tempo = _tempoKnob.Value,
                    Style = Styles.Names[_styleKnob.Value],
                    Comp = CompNames[_compKnob.Value],
                    Bass = BassNames[_bassKnob.Value],
                    Drums = _drums.Checked,
                    Intro = _intro.Checked,
                    Ending = _ending.Checked,
                    Choruses = ChorusChoices[_chorusKnob.Value],
                    Sync = _syncKnob.Value,
                    Arp = _arpKnob.Value,
                    BassAct = _bassActKnob.Value,
                    EightBit = _eightBit.Checked,
                    Bars = _bars,
                };
                try
                {
                    SongFile.Save(sfd.FileName, d);
                    _status.Text = "Gespeichert: " + sfd.FileName;
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, ex.Message, "Speichern fehlgeschlagen");
                }
            }
        }

        static int IndexOr(string[] arr, string val, int fallback)
        {
            int i = Array.IndexOf(arr, val);
            return i >= 0 ? i : fallback;
        }

        void LoadSong()
        {
            using (var ofd = new OpenFileDialog { Filter = "Backing-Track-Schema (*.btg)|*.btg" })
            {
                if (ofd.ShowDialog(this) != DialogResult.OK) return;
                SongData d;
                try { d = SongFile.Load(ofd.FileName); }
                catch (Exception ex)
                {
                    MessageBox.Show(this, ex.Message, "Laden fehlgeschlagen");
                    return;
                }
                _player.Stop();
                _playBtn.Text = PlayText;
                _playBtn.Lit = false;
                _keyKnob.Value = IndexOr(Theory.KeyChoices, d.Key, 0);
                _modeKnob.Value = d.Mode == "Moll" ? 1 : 0;
                _formKnob.Value = IndexOr(FormNames, d.Form, 0);
                _styleKnob.Value = IndexOr(Styles.Names, d.Style, 0);
                _compKnob.Value = IndexOr(CompNames, d.Comp, 1);
                _bassKnob.Value = IndexOr(BassNames, d.Bass, 1);
                _chorusKnob.Value = IndexOr(ChorusChoices, d.Choruses, 0);
                _drums.Checked = d.Drums;
                _intro.Checked = d.Intro;
                _ending.Checked = d.Ending;
                _eightBit.Checked = d.EightBit;
                int gesetz = d.Gesetz >= 0 ? d.Gesetz : 100 - d.Freedom;   // alte Dateien speicherten die Freiheit
                _gesetzKnob.Value = Math.Max(0, Math.Min(100, gesetz));
                _syncKnob.Value = Math.Max(0, Math.Min(100, d.Sync));
                _arpKnob.Value = Math.Max(0, Math.Min(100, d.Arp));
                _bassActKnob.Value = Math.Max(0, Math.Min(100, d.BassAct));
                _tempoKnob.Value = Math.Max(40, Math.Min(240, d.Tempo));
                _bpm = _tempoKnob.Value;
                _bars.Clear();
                _orig.Clear();
                foreach (var b in d.Bars)
                {
                    _bars.Add(b);
                    _orig.Add(b.Copy());
                }
                _genTonic = Theory.KeyToPc(d.Key);
                _genMinor = d.Mode == "Moll";
                _genFreedom = FreedomVal();
                _useFlats = Theory.UseFlatsForKey(_genTonic, _genMinor);
                RenderGrid();
                _status.Text = "Geladen: " + ofd.FileName;
            }
        }

        void ExportMidiFile()
        {
            using (var sfd = new SaveFileDialog { Filter = "MIDI-Datei (*.mid)|*.mid", FileName = "backingtrack.mid" })
            {
                if (sfd.ShowDialog(this) != DialogResult.OK) return;
                try
                {
                    string style = _eightBitOn ? Styles.EightBitStyle : _styleName;
                    int comp = _eightBitOn && _compProg >= 0 ? 80 : _compProg;
                    int bass = _eightBitOn && _bassProg >= 0 ? 80 : _bassProg;
                    SongFile.ExportMidi(sfd.FileName, _bars, _bpm, style, comp, bass, _drumsOn,
                                        _syncVal, _arpVal, _bassActVal);
                    _status.Text = "MIDI exportiert (ein Durchlauf, Stil " + style + "): " + sfd.FileName;
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, ex.Message, "Export fehlgeschlagen");
                }
            }
        }
    }
}
