using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace BackingTrack
{
    // Prozedurale Oberflaechen-Texturen (einmalig erzeugt) und Farbhilfen.
    public static class Tex
    {
        static readonly Random Rng = new Random(42);
        static TextureBrush _metal;
        static TextureBrush _black;

        // gebuerstetes, dunkles Metall fuer die Konsole
        public static TextureBrush Metal()
        {
            if (_metal == null) _metal = new TextureBrush(BuildMetal(), WrapMode.Tile);
            return _metal;
        }

        // schwarz eloxiertes Aluminium fuer den Akkordbereich
        public static TextureBrush Anodized()
        {
            if (_black == null) _black = new TextureBrush(BuildAnodized(), WrapMode.Tile);
            return _black;
        }

        static Bitmap BuildMetal()
        {
            var bmp = new Bitmap(320, 320);
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.FromArgb(45, 48, 56));
                for (int i = 0; i < 2600; i++)
                {
                    int yy = Rng.Next(320);
                    int xx = Rng.Next(320);
                    int len = 24 + Rng.Next(110);
                    bool light = Rng.Next(2) == 0;
                    int a = 5 + Rng.Next(11);
                    using (var p = new Pen(light ? Color.FromArgb(a, 235, 240, 248) : Color.FromArgb(a, 8, 9, 12), 1f))
                        g.DrawLine(p, xx, yy, xx + len, yy);
                }
                for (int i = 0; i < 1400; i++)
                {
                    int a = 6 + Rng.Next(12);
                    using (var b = new SolidBrush(Rng.Next(2) == 0 ? Color.FromArgb(a, 255, 255, 255) : Color.FromArgb(a, 0, 0, 0)))
                        g.FillRectangle(b, Rng.Next(320), Rng.Next(320), 1, 1);
                }
            }
            return bmp;
        }

        static Bitmap BuildAnodized()
        {
            var bmp = new Bitmap(320, 320);
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.FromArgb(18, 19, 23));
                for (int i = 0; i < 5200; i++)
                {
                    int a = 5 + Rng.Next(11);
                    bool light = Rng.Next(3) > 0;
                    using (var b = new SolidBrush(light ? Color.FromArgb(a, 205, 214, 230) : Color.FromArgb(a, 0, 0, 0)))
                        g.FillRectangle(b, Rng.Next(320), Rng.Next(320), 1, 1);
                }
                for (int i = 0; i < 700; i++)
                {
                    int a = 4 + Rng.Next(5);
                    using (var p = new Pen(Color.FromArgb(a, 185, 194, 210), 1f))
                    {
                        int yy = Rng.Next(320);
                        int xx = Rng.Next(320);
                        g.DrawLine(p, xx, yy, xx + 8 + Rng.Next(26), yy);
                    }
                }
            }
            return bmp;
        }

        public static Color Hsv(float h, float s, float v)
        {
            h = (h % 1f + 1f) % 1f;
            float r = 0, gg = 0, b = 0;
            int i = (int)(h * 6);
            float f = h * 6 - i;
            float p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
            switch (i % 6)
            {
                case 0: r = v; gg = t; b = p; break;
                case 1: r = q; gg = v; b = p; break;
                case 2: r = p; gg = v; b = t; break;
                case 3: r = p; gg = q; b = v; break;
                case 4: r = t; gg = p; b = v; break;
                default: r = v; gg = p; b = q; break;
            }
            return Color.FromArgb(255, (int)(r * 255), (int)(gg * 255), (int)(b * 255));
        }

        public static Color Mix(Color a, Color b, float t)
        {
            return Color.FromArgb(
                (int)(a.A + (b.A - a.A) * t),
                (int)(a.R + (b.R - a.R) * t),
                (int)(a.G + (b.G - a.G) * t),
                (int)(a.B + (b.B - a.B) * t));
        }

        // LED mit Glaslinse: Fassung, weicher Lichthof (radial), gewoelbte Linse, Sheen.
        public static void DrawLed(Graphics g, float cx, float cy, float r, Color c, float intensity, float flick)
        {
            if (r < 2f) return;
            var socket = new RectangleF(cx - r * 1.45f, cy - r * 1.45f, r * 2.9f, r * 2.9f);
            using (var b = new SolidBrush(Color.FromArgb(15, 16, 20)))
                g.FillEllipse(b, socket);
            using (var rim = new Pen(Color.FromArgb(10, 11, 14), 1.4f))
                g.DrawEllipse(rim, socket);

            float glow = intensity * flick;
            if (glow > 0.03f)
            {
                float gr = r * 3.4f;
                var halo = new RectangleF(cx - gr, cy - gr, gr * 2, gr * 2);
                using (var hp = new GraphicsPath())
                {
                    hp.AddEllipse(halo);
                    using (var hb = new PathGradientBrush(hp))
                    {
                        hb.CenterColor = Color.FromArgb((int)(80 * glow), c);
                        hb.SurroundColors = new[] { Color.FromArgb(0, c) };
                        g.FillEllipse(hb, halo);
                    }
                }
            }

            var lens = new RectangleF(cx - r, cy - r, r * 2, r * 2);
            using (var baseB = new SolidBrush(Color.FromArgb(255, c.R / 5 + 10, c.G / 5 + 10, c.B / 5 + 8)))
                g.FillEllipse(baseB, lens);
            if (intensity > 0.03f)
            {
                using (var lp = new GraphicsPath())
                {
                    lp.AddEllipse(lens);
                    using (var lb = new PathGradientBrush(lp))
                    {
                        lb.CenterPoint = new PointF(cx - r * 0.15f, cy - r * 0.22f);
                        int ca = (int)(215 * intensity * flick) + 40;
                        lb.CenterColor = Color.FromArgb(ca > 255 ? 255 : ca, Mix(c, Color.White, 0.35f));
                        lb.SurroundColors = new[] { Color.FromArgb((int)(165 * intensity * flick), c) };
                        g.FillEllipse(lb, lens);
                    }
                }
            }
            // Glas: Sheen auf der oberen Haelfte der Linse
            var oldClip = g.Clip;
            using (var clip = new GraphicsPath())
            {
                clip.AddEllipse(lens);
                g.SetClip(clip);
                var sheen = new RectangleF(lens.X, lens.Y, lens.Width, Math.Max(2f, lens.Height * 0.55f));
                using (var sb = new LinearGradientBrush(sheen, Color.FromArgb(85, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), 90f))
                    g.FillRectangle(sb, sheen);
                g.Clip = oldClip;
            }
            using (var rim2 = new Pen(Color.FromArgb(150, 12, 13, 16), 1.2f))
                g.DrawEllipse(rim2, lens);
        }
    }

    // 14-Segment-Anzeige im Stil alter Geraete-Displays: orange gluehend,
    // hinter Glas, mit Flackern (flick 0..1 skaliert die Helligkeit).
    public static class Seg
    {
        const int SA = 1, SB = 2, SC = 4, SD = 8, SE = 16, SF = 32, SG1 = 64, SG2 = 128,
                  SH = 256, SI = 512, SJ = 1024, SK = 2048, SL = 4096, SM = 8192;
        const int ALL = SA | SB | SC | SD | SE | SF | SG1 | SG2;

        static readonly Dictionary<char, int> Map = new Dictionary<char, int>
        {
            { '0', SA | SB | SC | SD | SE | SF },
            { '1', SB | SC },
            { '2', SA | SB | SG1 | SG2 | SE | SD },
            { '3', SA | SB | SC | SD | SG2 },
            { '4', SF | SG1 | SG2 | SB | SC },
            { '5', SA | SF | SG1 | SG2 | SC | SD },
            { '6', SA | SF | SE | SD | SC | SG1 | SG2 },
            { '7', SA | SB | SC },
            { '8', ALL },
            { '9', SA | SB | SC | SD | SF | SG1 | SG2 },
            { 'A', SA | SB | SC | SE | SF | SG1 | SG2 },
            { 'B', SA | SB | SC | SD | SG2 | SI | SL },
            { 'C', SA | SD | SE | SF },
            { 'D', SA | SB | SC | SD | SI | SL },
            { 'E', SA | SD | SE | SF | SG1 | SG2 },
            { 'F', SA | SE | SF | SG1 },
            { 'G', SA | SC | SD | SE | SF | SG2 },
            { 'H', SB | SC | SE | SF | SG1 | SG2 },
            { 'I', SA | SD | SI | SL },
            { 'J', SB | SC | SD | SE },
            { 'K', SE | SF | SG1 | SJ | SM },
            { 'L', SD | SE | SF },
            { 'M', SB | SC | SE | SF | SH | SJ },
            { 'N', SB | SC | SE | SF | SH | SM },
            { 'O', SA | SB | SC | SD | SE | SF },
            { 'P', SA | SB | SE | SF | SG1 | SG2 },
            { 'R', SA | SB | SE | SF | SG1 | SG2 | SM },
            { 'S', SA | SC | SD | SF | SG1 | SG2 },
            { 'T', SA | SI | SL },
            { 'U', SB | SC | SD | SE | SF },
            { 'V', SE | SF | SJ | SK },
            { 'W', SB | SC | SE | SF | SK | SM },
            { 'Y', SH | SJ | SL },
            { 'Z', SA | SD | SJ | SK },
            { 'b', SC | SD | SE | SF | SG1 | SG2 },
            { '-', SG1 | SG2 },
            { ' ', 0 },
        };

        public static Color Lit(float flick, int alpha)
        {
            int a = (int)(alpha * flick);
            return Color.FromArgb(a < 0 ? 0 : a > 255 ? 255 : a, 255, 150, 45);
        }

        // gemeinsame Flacker-Logik: traeges Glimmen mit gelegentlichen Aussetzern
        public static float NextFlick(Random rng, float current)
        {
            float target = 0.72f + 0.28f * (float)rng.NextDouble();
            if (rng.NextDouble() < 0.035) target = 0.45f;
            return 0.5f * current + 0.5f * target;
        }

        public static void DrawDisplay(Graphics g, Rectangle r, string text, float flick)
        {
            var old = g.SmoothingMode;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var path = Rounded(r, Math.Max(3, r.Height / 7)))
            {
                using (var b = new SolidBrush(Color.FromArgb(16, 12, 9))) g.FillPath(b, path);
                using (var p = new Pen(Color.FromArgb(10, 8, 6), 2f)) g.DrawPath(p, path);
                var inner = Rectangle.Inflate(r, -3, -3);
                using (var glow = new SolidBrush(Color.FromArgb((int)(14 * flick), 255, 140, 40)))
                    g.FillPath(glow, path);

                DrawText(g, inner, text, flick);

                var glass = new Rectangle(r.X + 2, r.Y + 2, r.Width - 4, r.Height / 2 - 2);
                if (glass.Height > 1)
                    using (var gb = new LinearGradientBrush(glass, Color.FromArgb(26, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), 90f))
                        g.FillRectangle(gb, glass);
                using (var edge = new Pen(Color.FromArgb(38, 255, 255, 255), 1f))
                    g.DrawLine(edge, r.X + 3, r.Bottom - 2, r.Right - 3, r.Bottom - 2);
            }
            g.SmoothingMode = old;
        }

        static void DrawText(Graphics g, Rectangle r, string text, float flick)
        {
            if (text == null) text = "";
            int n = Math.Max(text.Length, 1);
            float cellW = Math.Min(r.Width / (float)n, r.Height * 0.78f);
            float total = cellW * text.Length;
            float x = r.X + (r.Width - total) / 2f;
            float padX = cellW * 0.16f;
            float padY = r.Height * 0.20f;
            using (var glowPen = new Pen(Lit(flick, 34), cellW * 0.30f))
            using (var midPen = new Pen(Lit(flick, 90), cellW * 0.17f))
            using (var corePen = new Pen(Lit(flick, 235), cellW * 0.09f))
            using (var ghostPen = new Pen(Color.FromArgb(24, 200, 110, 40), cellW * 0.09f))
            {
                glowPen.StartCap = glowPen.EndCap = LineCap.Round;
                midPen.StartCap = midPen.EndCap = LineCap.Round;
                corePen.StartCap = corePen.EndCap = LineCap.Round;
                ghostPen.StartCap = ghostPen.EndCap = LineCap.Round;
                foreach (var ch in text)
                {
                    var cell = new RectangleF(x + padX, r.Y + padY, cellW - 2 * padX, r.Height - 2 * padY);
                    DrawChar(g, cell, ch, glowPen, midPen, corePen, ghostPen);
                    x += cellW;
                }
            }
        }

        static void DrawChar(Graphics g, RectangleF r, char ch, Pen glow, Pen mid, Pen core, Pen ghost)
        {
            if (ch == '∞') { DrawInfinity(g, r, glow, mid, core); return; }
            if (ch == '#') { DrawSharp(g, r, glow, mid, core); return; }
            int bits;
            if (!Map.TryGetValue(ch, out bits) && !Map.TryGetValue(char.ToUpperInvariant(ch), out bits))
                bits = SG1 | SG2;

            float x0 = r.Left, x1 = r.Right, y0 = r.Top, y1 = r.Bottom;
            float xm = (x0 + x1) / 2f, ym = (y0 + y1) / 2f;
            var ends = new[]
            {
                new[] { x0, y0, x1, y0 },
                new[] { x1, y0, x1, ym },
                new[] { x1, ym, x1, y1 },
                new[] { x0, y1, x1, y1 },
                new[] { x0, ym, x0, y1 },
                new[] { x0, y0, x0, ym },
                new[] { x0, ym, xm, ym },
                new[] { xm, ym, x1, ym },
                new[] { x0, y0, xm, ym },
                new[] { xm, y0, xm, ym },
                new[] { x1, y0, xm, ym },
                new[] { xm, ym, x0, y1 },
                new[] { xm, ym, xm, y1 },
                new[] { xm, ym, x1, y1 },
            };
            for (int s = 0; s < ends.Length; s++)
            {
                var e = ends[s];
                float dx = (e[2] - e[0]) * 0.13f, dy = (e[3] - e[1]) * 0.13f;
                var p1 = new PointF(e[0] + dx, e[1] + dy);
                var p2 = new PointF(e[2] - dx, e[3] - dy);
                bool on = (bits & (1 << s)) != 0;
                if (!on)
                {
                    if (s < 8) g.DrawLine(ghost, p1, p2);
                    continue;
                }
                g.DrawLine(glow, p1, p2);
                g.DrawLine(mid, p1, p2);
                g.DrawLine(core, p1, p2);
            }
        }

        static void DrawInfinity(Graphics g, RectangleF r, Pen glow, Pen mid, Pen core)
        {
            float ry = r.Height * 0.18f;
            float rx = r.Width * 0.30f;
            var e1 = new RectangleF(r.X + r.Width * 0.5f - rx, r.Y + r.Height / 2f - ry, rx, ry * 2);
            var e2 = new RectangleF(r.X + r.Width * 0.5f, r.Y + r.Height / 2f - ry, rx, ry * 2);
            g.DrawEllipse(glow, e1); g.DrawEllipse(glow, e2);
            g.DrawEllipse(mid, e1); g.DrawEllipse(mid, e2);
            g.DrawEllipse(core, e1); g.DrawEllipse(core, e2);
        }

        static void DrawSharp(Graphics g, RectangleF r, Pen glow, Pen mid, Pen core)
        {
            float xa = r.X + r.Width * 0.36f, xb = r.X + r.Width * 0.64f;
            float ya = r.Y + r.Height * 0.40f, yb = r.Y + r.Height * 0.62f;
            var lines = new[]
            {
                new[] { xa, r.Y + r.Height * 0.18f, xa, r.Y + r.Height * 0.85f },
                new[] { xb, r.Y + r.Height * 0.15f, xb, r.Y + r.Height * 0.82f },
                new[] { r.X + r.Width * 0.12f, ya, r.X + r.Width * 0.88f, ya - r.Height * 0.06f },
                new[] { r.X + r.Width * 0.12f, yb, r.X + r.Width * 0.88f, yb - r.Height * 0.06f },
            };
            foreach (var l in lines)
            {
                var p1 = new PointF(l[0], l[1]);
                var p2 = new PointF(l[2], l[3]);
                g.DrawLine(glow, p1, p2);
                g.DrawLine(mid, p1, p2);
                g.DrawLine(core, p1, p2);
            }
        }

        public static GraphicsPath Rounded(Rectangle r, int rad)
        {
            var p = new GraphicsPath();
            p.AddArc(r.X, r.Y, rad * 2, rad * 2, 180, 90);
            p.AddArc(r.Right - rad * 2, r.Y, rad * 2, rad * 2, 270, 90);
            p.AddArc(r.Right - rad * 2, r.Bottom - rad * 2, rad * 2, rad * 2, 0, 90);
            p.AddArc(r.X, r.Bottom - rad * 2, rad * 2, rad * 2, 90, 90);
            p.CloseFigure();
            return p;
        }
    }

    // Dreh-Poti in Metall-Optik mit Segment-Display darueber.
    // Ziehen (hoch/runter) oder Mausrad; Rechtsklick = Ausgangswert.
    public class KnobControl : Control
    {
        int _min;
        int _max = 100;
        int _value;
        public int DefaultValue;
        public string[] DisplayChoices;
        public string LabelText = "";
        public event EventHandler ValueChanged;
        public event EventHandler Touched;
        public event EventHandler DidReset;

        double _dragStart;
        int _dragY = -1;
        float _flick = 1f;
        static readonly Random FlickRng = new Random();

        public KnobControl()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Cursor = Cursors.Hand;
        }

        public int Minimum { get { return _min; } set { _min = value; Invalidate(); } }
        public int Maximum { get { return _max; } set { _max = value; Invalidate(); } }

        public int Value
        {
            get { return _value; }
            set
            {
                int v = value < _min ? _min : value > _max ? _max : value;
                if (v == _value) return;
                _value = v;
                Invalidate();
                var h = ValueChanged;
                if (h != null) h(this, EventArgs.Empty);
            }
        }

        Rectangle DispRect()
        {
            return new Rectangle(Ui.S(3), Ui.S(2), Width - Ui.S(6), Ui.S(28));
        }

        public void FlickerTick()
        {
            _flick = Seg.NextFlick(FlickRng, _flick);
            Invalidate(DispRect());
        }

        string DisplayText()
        {
            if (DisplayChoices != null)
            {
                int i = _value - _min;
                if (i >= 0 && i < DisplayChoices.Length) return DisplayChoices[i];
            }
            return _value.ToString();
        }

        void Raise(EventHandler h)
        {
            if (h != null) h(this, EventArgs.Empty);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left)
            {
                _dragY = e.Y;
                _dragStart = _value;
                Raise(Touched);
            }
            else if (e.Button == MouseButtons.Right)
            {
                Value = DefaultValue;
                Raise(DidReset);
            }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            if (_dragY < 0) return;
            double delta = (_dragY - e.Y) * (_max - _min) / 150.0;
            Value = (int)Math.Round(_dragStart + delta);
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            _dragY = -1;
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            Focus();
        }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            base.OnMouseWheel(e);
            int step = Math.Max(1, (_max - _min) / 100);
            Value = _value + Math.Sign(e.Delta) * step;
            Raise(Touched);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            Seg.DrawDisplay(g, DispRect(), DisplayText(), _flick);

            int cx = Width / 2;
            int cy = Ui.S(2) + Ui.S(28) + Ui.S(8) + Ui.S(23);
            int r = Ui.S(21);
            double t = _max > _min ? (_value - _min) / (double)(_max - _min) : 0;
            float a0 = 135f, sweep = 270f;
            double valRad = (a0 + sweep * t) * Math.PI / 180.0;

            using (var sb = new SolidBrush(Color.FromArgb(50, 0, 0, 0)))
                g.FillEllipse(sb, cx - r - 1, cy - r + 2, r * 2 + 4, r * 2 + 5);
            using (var sb = new SolidBrush(Color.FromArgb(90, 0, 0, 0)))
                g.FillEllipse(sb, cx - r + 1, cy - r + 3, r * 2, r * 2);

            var ring = new Rectangle(cx - r, cy - r, r * 2, r * 2);
            using (var lg = new LinearGradientBrush(ring, Color.FromArgb(185, 191, 201), Color.FromArgb(42, 45, 52), 128f))
                g.FillEllipse(lg, ring);

            for (int k = 0; k < 28; k++)
            {
                double a = valRad + k * Math.PI * 2 / 28;
                float r1 = r * 0.86f, r2 = r * 0.99f;
                var c = k % 2 == 0 ? Color.FromArgb(150, 26, 28, 33) : Color.FromArgb(70, 220, 226, 235);
                using (var kn = new Pen(c, 1.3f))
                    g.DrawLine(kn,
                        cx + (float)(Math.Cos(a) * r1), cy + (float)(Math.Sin(a) * r1),
                        cx + (float)(Math.Cos(a) * r2), cy + (float)(Math.Sin(a) * r2));
            }

            int rb = r - Ui.S(4);
            var body = new Rectangle(cx - rb, cy - rb, rb * 2, rb * 2);
            using (var path = new GraphicsPath())
            {
                path.AddEllipse(body);
                using (var pgb = new PathGradientBrush(path))
                {
                    pgb.CenterPoint = new PointF(cx - rb * 0.38f, cy - rb * 0.45f);
                    pgb.CenterColor = Color.FromArgb(118, 124, 135);
                    pgb.SurroundColors = new[] { Color.FromArgb(30, 32, 38) };
                    g.FillEllipse(pgb, body);
                }
            }

            int rc = (int)(rb * 0.60);
            var cap = new Rectangle(cx - rc, cy - rc, rc * 2, rc * 2);
            using (var cb = new LinearGradientBrush(cap, Color.FromArgb(64, 68, 77), Color.FromArgb(38, 41, 47), 90f))
                g.FillEllipse(cb, cap);
            using (var rim = new Pen(Color.FromArgb(120, 16, 17, 20), 1.4f))
                g.DrawEllipse(rim, cap);

            var hi = new Rectangle(cx - (int)(rb * 0.72), cy - (int)(rb * 0.82), (int)(rb * 0.9), (int)(rb * 0.62));
            using (var hp = new GraphicsPath())
            {
                hp.AddEllipse(hi);
                using (var hb = new PathGradientBrush(hp))
                {
                    hb.CenterColor = Color.FromArgb(95, 255, 255, 255);
                    hb.SurroundColors = new[] { Color.FromArgb(0, 255, 255, 255) };
                    g.FillEllipse(hb, hi);
                }
            }

            var arcRect = new Rectangle(cx - r - Ui.S(5), cy - r - Ui.S(5), (r + Ui.S(5)) * 2, (r + Ui.S(5)) * 2);
            using (var track = new Pen(Color.FromArgb(52, 56, 64), Ui.S(3)))
                g.DrawArc(track, arcRect, a0, sweep);
            if (t > 0.003)
            {
                using (var glowArc = new Pen(Seg.Lit(_flick, 60), Ui.S(5)))
                    g.DrawArc(glowArc, arcRect, a0, (float)(sweep * t));
                using (var arc = new Pen(Seg.Lit(_flick, 220), Ui.S(3)))
                    g.DrawArc(arc, arcRect, a0, (float)(sweep * t));
            }
            for (int k = 0; k <= 10; k++)
            {
                double ta = (a0 + sweep * k / 10.0) * Math.PI / 180.0;
                float r1 = r + Ui.S(8), r2 = r + Ui.S(11);
                using (var tick = new Pen(Color.FromArgb(90, 96, 106), 1f))
                    g.DrawLine(tick,
                        cx + (float)(Math.Cos(ta) * r1), cy + (float)(Math.Sin(ta) * r1),
                        cx + (float)(Math.Cos(ta) * r2), cy + (float)(Math.Sin(ta) * r2));
            }

            using (var shadow = new Pen(Color.FromArgb(120, 0, 0, 0), Ui.S(4)))
            {
                shadow.StartCap = shadow.EndCap = LineCap.Round;
                g.DrawLine(shadow,
                    cx + (float)(Math.Cos(valRad) * rc * 0.30) + 1, cy + (float)(Math.Sin(valRad) * rc * 0.30) + 1,
                    cx + (float)(Math.Cos(valRad) * rb * 0.86) + 1, cy + (float)(Math.Sin(valRad) * rb * 0.86) + 1);
            }
            using (var ptr = new Pen(Color.FromArgb(240, 243, 247), Ui.S(3)))
            {
                ptr.StartCap = ptr.EndCap = LineCap.Round;
                g.DrawLine(ptr,
                    cx + (float)(Math.Cos(valRad) * rc * 0.30), cy + (float)(Math.Sin(valRad) * rc * 0.30),
                    cx + (float)(Math.Cos(valRad) * rb * 0.86), cy + (float)(Math.Sin(valRad) * rb * 0.86));
            }

            var lr = new Rectangle(0, Height - Ui.S(16), Width, Ui.S(14));
            Ui.DrawText(g, LabelText, Ui.Small, new Rectangle(lr.X, lr.Y + 1, lr.Width, lr.Height),
                        Color.FromArgb(14, 15, 18), TextFormatFlags.HorizontalCenter);
            Ui.DrawText(g, LabelText, Ui.Small, lr, Color.FromArgb(165, 171, 180), TextFormatFlags.HorizontalCenter);
        }
    }

    // Kippschalter mit flackernder Glas-LED; Klick schaltet, Rechtsklick = Ausgangswert.
    public class ToggleSwitch : Control
    {
        bool _checked;
        public bool DefaultChecked;
        public string LabelText = "";
        public bool RainbowLed;            // 8-Bit-Hebel: LED schimmert dauerhaft durch die Farben
        public event EventHandler CheckedChanged;
        public event EventHandler DidReset;
        float _flick = 1f;
        float _hue;
        static readonly Random FlickRng = new Random();

        public ToggleSwitch()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Cursor = Cursors.Hand;
        }

        public bool Checked
        {
            get { return _checked; }
            set
            {
                if (_checked == value) return;
                _checked = value;
                Invalidate();
                var h = CheckedChanged;
                if (h != null) h(this, EventArgs.Empty);
            }
        }

        public void FlickerTick()
        {
            if (!_checked && !RainbowLed) return;
            _flick = Seg.NextFlick(FlickRng, _flick);
            if (RainbowLed) _hue = (_hue + 0.02f) % 1f;
            Invalidate(new Rectangle(0, 0, Width, Ui.S(26)));
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left)
            {
                Checked = !_checked;
            }
            else if (e.Button == MouseButtons.Right)
            {
                Checked = DefaultChecked;
                var h = DidReset;
                if (h != null) h(this, EventArgs.Empty);
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            int cx = Width / 2;

            int ledY = Ui.S(13), ledR = Ui.S(4);
            Color ledColor = RainbowLed ? Tex.Hsv(_hue, 0.85f, 0.95f) : Color.FromArgb(255, 150, 45);
            float intensity = _checked ? 1f : (RainbowLed ? 0.4f : 0f);
            Tex.DrawLed(g, cx, ledY, ledR, ledColor, intensity, _flick);

            int tw = Ui.S(18), th = Ui.S(42);
            var track = new Rectangle(cx - tw / 2, Ui.S(26), tw, th);
            using (var path = Seg.Rounded(track, tw / 2))
            {
                using (var b = new LinearGradientBrush(track, Color.FromArgb(18, 20, 24), Color.FromArgb(38, 41, 48), 90f))
                    g.FillPath(b, path);
                using (var p = new Pen(Color.FromArgb(14, 15, 18), 2f))
                    g.DrawPath(p, path);
            }
            int kr = Ui.S(8);
            int ky = _checked ? track.Y + kr + Ui.S(2) : track.Bottom - kr - Ui.S(2);
            var knob = new Rectangle(cx - kr, ky - kr, kr * 2, kr * 2);
            using (var sb = new SolidBrush(Color.FromArgb(80, 0, 0, 0)))
                g.FillEllipse(sb, knob.X + 1, knob.Y + 2, knob.Width, knob.Height);
            using (var kb = new LinearGradientBrush(knob, Color.FromArgb(130, 136, 146), Color.FromArgb(52, 56, 64), 90f))
                g.FillEllipse(kb, knob);
            using (var rim = new Pen(Color.FromArgb(22, 24, 28), 1.5f))
                g.DrawEllipse(rim, knob);

            var lr = new Rectangle(0, Height - Ui.S(16), Width, Ui.S(14));
            Ui.DrawText(g, LabelText, Ui.Small, new Rectangle(lr.X, lr.Y + 1, lr.Width, lr.Height),
                        Color.FromArgb(14, 15, 18), TextFormatFlags.HorizontalCenter);
            Ui.DrawText(g, LabelText, Ui.Small, lr, Color.FromArgb(165, 171, 180), TextFormatFlags.HorizontalCenter);
        }
    }

    // Klartext-Anzeige fuer den zuletzt bedienten Regler, im Look eines LCD-Streifens.
    public class ReadoutDisplay : Control
    {
        string _title = "";
        string _text = "";
        float _flick = 1f;
        static readonly Random FlickRng = new Random();

        public ReadoutDisplay()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
        }

        public void Show(string title, string text)
        {
            _title = title;
            _text = text;
            Invalidate();
        }

        public void FlickerTick()
        {
            _flick = Seg.NextFlick(FlickRng, _flick);
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var path = Seg.Rounded(r, Ui.S(6)))
            {
                using (var b = new SolidBrush(Color.FromArgb(16, 12, 9))) g.FillPath(b, path);
                using (var glow = new SolidBrush(Color.FromArgb((int)(12 * _flick), 255, 140, 40)))
                    g.FillPath(glow, path);
                using (var p = new Pen(Color.FromArgb(10, 8, 6), 2f)) g.DrawPath(p, path);

                Ui.DrawText(g, _title, Ui.Small,
                    new Rectangle(Ui.S(10), Ui.S(6), Width - Ui.S(20), Ui.S(14)),
                    Seg.Lit(_flick, 130), TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
                Ui.DrawText(g, _text, Ui.Mid,
                    new Rectangle(Ui.S(10), Ui.S(22), Width - Ui.S(20), Height - Ui.S(28)),
                    Seg.Lit(_flick, 235), TextFormatFlags.Left | TextFormatFlags.EndEllipsis);

                var glass = new Rectangle(r.X + 2, r.Y + 2, r.Width - 4, r.Height / 2 - 2);
                if (glass.Height > 1)
                    using (var gb = new LinearGradientBrush(glass, Color.FromArgb(22, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), 90f))
                        g.FillRectangle(gb, glass);
                using (var edge = new Pen(Color.FromArgb(34, 255, 255, 255), 1f))
                    g.DrawLine(edge, r.X + 3, r.Bottom - 2, r.Right - 3, r.Bottom - 2);
            }
        }
    }

    // Zweikanaliges LED-Pegelmeter: runde LEDs hinter Glas, flackernd, mit Peak-Hold.
    public class VuMeter : Control
    {
        const int Leds = 12;
        float _l, _r;
        int _peakL, _peakR, _ageL, _ageR;
        float _flick = 1f;
        static readonly Random FlickRng = new Random();

        public VuMeter()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
        }

        public void FlickerTick()
        {
            _flick = Seg.NextFlick(FlickRng, _flick);
        }

        public void SetLevels(float l, float r)
        {
            _l = l < 0 ? 0 : l > 1 ? 1 : l;
            _r = r < 0 ? 0 : r > 1 ? 1 : r;
            int nl = (int)Math.Round(_l * Leds);
            int nr = (int)Math.Round(_r * Leds);
            if (nl >= _peakL) { _peakL = nl; _ageL = 0; }
            else if (++_ageL > 10 && _peakL > 0) { _peakL--; _ageL = 7; }
            if (nr >= _peakR) { _peakR = nr; _ageR = 0; }
            else if (++_ageR > 10 && _peakR > 0) { _peakR--; _ageR = 7; }
            Invalidate();
        }

        static Color LedColor(int i)
        {
            if (i >= Leds - 2) return Color.FromArgb(235, 62, 50);
            if (i >= Leds - 4) return Color.FromArgb(255, 150, 45);
            return Color.FromArgb(70, 220, 95);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var path = Seg.Rounded(r, Ui.S(5)))
            {
                using (var b = new SolidBrush(Color.FromArgb(14, 15, 18))) g.FillPath(b, path);
                using (var p = new Pen(Color.FromArgb(10, 11, 14), 2f)) g.DrawPath(p, path);

                int pad = Ui.S(6);
                int colW = (Width - pad * 3) / 2;
                int cellH = (Height - pad * 2) / Leds;
                int d = Math.Min(colW, cellH - Ui.S(1));
                if (d >= 4)
                {
                    int litL = (int)Math.Round(_l * Leds);
                    int litR = (int)Math.Round(_r * Leds);
                    for (int col = 0; col < 2; col++)
                    {
                        int cx = pad + col * (colW + pad) + colW / 2;
                        int lit = col == 0 ? litL : litR;
                        int peak = col == 0 ? _peakL : _peakR;
                        for (int i = 0; i < Leds; i++)
                        {
                            int cy = Height - pad - i * cellH - cellH / 2;
                            var c = LedColor(i);
                            bool on = i < lit || i == peak - 1;
                            Tex.DrawLed(g, cx, cy, d / 2f, c, on ? 1f : 0f, _flick);
                        }
                    }
                }

                // Glasscheibe
                var glass = new Rectangle(r.X + 2, r.Y + 2, r.Width - 4, r.Height / 3);
                using (var gb = new LinearGradientBrush(glass, Color.FromArgb(24, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), 90f))
                    g.FillRectangle(gb, glass);
                using (var edge = new Pen(Color.FromArgb(30, 255, 255, 255), 1f))
                    g.DrawLine(edge, r.X + 3, r.Bottom - 2, r.Right - 3, r.Bottom - 2);
            }
        }
    }

    // Haptischer Konsolen-Taster: Vertiefung + erhabene Kappe, die beim Druck einsinkt.
    public class GlowButton : Control
    {
        public bool Lit;
        bool _down;

        public GlowButton()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Cursor = Cursors.Hand;
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left) { _down = true; Invalidate(); }
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            _down = false;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            // Vertiefung (Schacht)
            var well = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var wellPath = Seg.Rounded(well, Ui.S(8)))
            {
                using (var b = new SolidBrush(Color.FromArgb(16, 17, 21))) g.FillPath(b, wellPath);
                using (var p = new Pen(Color.FromArgb(8, 9, 11), 2f)) g.DrawPath(p, wellPath);
                using (var hi = new Pen(Color.FromArgb(28, 255, 255, 255), 1f))
                    g.DrawLine(hi, well.X + Ui.S(8), well.Bottom - 1, well.Right - Ui.S(8), well.Bottom - 1);
            }

            // Kappe: erhaben, beim Druecken tiefer
            int inset = Ui.S(4);
            int push = _down ? Ui.S(2) : 0;
            var cap = new Rectangle(inset, inset + push, Width - inset * 2 - 1, Height - inset * 2 - 1 - push);
            using (var capPath = Seg.Rounded(cap, Ui.S(6)))
            {
                if (!_down)
                {
                    using (var sb = new SolidBrush(Color.FromArgb(110, 0, 0, 0)))
                        g.FillRectangle(sb, cap.X + 1, cap.Bottom - Ui.S(2), cap.Width - 2, Ui.S(3));
                }
                var top = _down ? Color.FromArgb(42, 45, 52) : Color.FromArgb(84, 90, 100);
                var bot = _down ? Color.FromArgb(56, 60, 68) : Color.FromArgb(44, 47, 54);
                using (var b = new LinearGradientBrush(cap, top, bot, 90f))
                    g.FillPath(b, capPath);
                if (Lit)
                {
                    using (var glow = new Pen(Seg.Lit(1f, 110), Ui.S(4)))
                        g.DrawPath(glow, capPath);
                }
                using (var p = new Pen(Lit ? Seg.Lit(1f, 220) : Color.FromArgb(24, 26, 31), 1.6f))
                    g.DrawPath(p, capPath);
                using (var hi = new Pen(Color.FromArgb(_down ? 16 : 46, 255, 255, 255), 1f))
                    g.DrawLine(hi, cap.X + Ui.S(6), cap.Y + 2, cap.Right - Ui.S(6), cap.Y + 2);
            }
            var tr = cap;
            tr.Offset(0, _down ? 1 : 0);
            Ui.DrawText(g, Text, Ui.Norm, tr,
                        Lit ? Seg.Lit(1f, 255) : Color.FromArgb(228, 231, 236),
                        TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }

    // Traegerplatte im Pult-Look: gebuerstetes Metall, Kanten, Schrauben.
    // Im 8-Bit-Modus laeuft ein Regenbogen durch (Nyan-Style); beim Umschalten
    // "uebernimmt" er das Panel von links nach rechts (RainbowExtent 0..1).
    public class ConsolePanel : Panel
    {
        static readonly float[] SlotAngles = { 25f, 70f, 110f, 160f };
        public bool EightBit;
        public float RainbowPhase;
        public float RainbowExtent = 1f;

        public ConsolePanel()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            var g = e.Graphics;
            using (var bg = new SolidBrush(Ui.Bg))
                g.FillRectangle(bg, ClientRectangle);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(Ui.S(4), Ui.S(2), Width - Ui.S(8), Height - Ui.S(5));
            if (r.Width < 20 || r.Height < 20) return;
            using (var path = Seg.Rounded(r, Ui.S(10)))
            {
                // Grundflaeche: gebuerstetes Metall
                g.FillPath(Tex.Metal(), path);
                using (var ov = new LinearGradientBrush(r, Color.FromArgb(20, 255, 255, 255), Color.FromArgb(70, 0, 0, 0), 90f))
                    g.FillPath(ov, path);

                // Regenbogen-Uebernahme von links nach rechts
                int rw = (int)(r.Width * (EightBit ? RainbowExtent : 0f));
                if (rw > 2)
                {
                    var oldClip = g.Clip;
                    g.SetClip(path);
                    g.SetClip(new Rectangle(r.X, r.Y, rw, r.Height), CombineMode.Intersect);
                    int slices = 72;
                    float sw = r.Width / (float)slices + 1f;
                    for (int i = 0; i < slices; i++)
                    {
                        var c = Tex.Hsv(i / (float)slices + RainbowPhase, 0.85f, 0.60f);
                        using (var b = new SolidBrush(c))
                            g.FillRectangle(b, r.X + i * r.Width / (float)slices, r.Y, sw, r.Height);
                    }
                    using (var dk = new LinearGradientBrush(r, Color.FromArgb(60, 0, 0, 0), Color.FromArgb(125, 0, 0, 0), 90f))
                        g.FillRectangle(dk, r);
                    g.Clip = oldClip;
                    // Frontkante des Sweeps
                    if (RainbowExtent < 0.995f)
                    {
                        using (var fg = new Pen(Color.FromArgb(70, 255, 255, 255), Ui.S(7)))
                            g.DrawLine(fg, r.X + rw, r.Y + 3, r.X + rw, r.Bottom - 3);
                        using (var fp = new Pen(Color.FromArgb(190, 255, 255, 255), Ui.S(2)))
                            g.DrawLine(fp, r.X + rw, r.Y + 3, r.X + rw, r.Bottom - 3);
                    }
                }
                using (var p = new Pen(Color.FromArgb(14, 15, 18), 2f))
                    g.DrawPath(p, path);
                using (var hi = new Pen(Color.FromArgb(26, 255, 255, 255), 1f))
                    g.DrawLine(hi, r.X + Ui.S(12), r.Y + 2, r.Right - Ui.S(12), r.Y + 2);
            }
            int inset = Ui.S(13);
            Screw(g, r.X + inset, r.Y + inset, SlotAngles[0]);
            Screw(g, r.Right - inset, r.Y + inset, SlotAngles[1]);
            Screw(g, r.X + inset, r.Bottom - inset, SlotAngles[2]);
            Screw(g, r.Right - inset, r.Bottom - inset, SlotAngles[3]);
        }

        static void Screw(Graphics g, int cx, int cy, float angle)
        {
            int r = Ui.S(5);
            var rect = new Rectangle(cx - r, cy - r, r * 2, r * 2);
            using (var b = new LinearGradientBrush(rect, Color.FromArgb(110, 116, 126), Color.FromArgb(46, 50, 57), 135f))
                g.FillEllipse(b, rect);
            using (var p = new Pen(Color.FromArgb(20, 22, 26), 1.4f))
                g.DrawEllipse(p, rect);
            double rad = angle * Math.PI / 180.0;
            float dx = (float)(Math.Cos(rad) * (r - 1.5f)), dy = (float)(Math.Sin(rad) * (r - 1.5f));
            using (var slot = new Pen(Color.FromArgb(25, 27, 31), 1.6f))
                g.DrawLine(slot, cx - dx, cy - dy, cx + dx, cy + dy);
        }
    }

    // Traeger fuer das Taktraster: schwarz eloxierte Flaeche.
    public class GridHost : TableLayoutPanel
    {
        public GridHost()
        {
            DoubleBuffered = true;
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            e.Graphics.FillRectangle(Tex.Anodized(), ClientRectangle);
        }
    }
}
