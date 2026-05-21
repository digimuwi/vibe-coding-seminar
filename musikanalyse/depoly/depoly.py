#!/usr/bin/env python3
"""depoly — polyphonic score -> study layout.

Produces a single score with two stacked systems:

  * top    : a piano grand staff (all voices of the source, kept at their
             original durations, split treble/bass by pitch) braced together
  * bottom : a single "lute" staff in lute-intabulation style — every note is
             struck exactly once at its original onset and held until the next
             onset anywhere in the texture (no re-attacks, no ties for sustain)

Input formats:  .ly (LilyPond), .musicxml / .xml / .mxl, .mscz (MuseScore)
Output:         MusicXML; optionally rendered to .mscz / .pdf and opened.

LilyPond input from the Nancho Alvarez / tomasluisdevictoria.org corpus (and
similar published editions) is decorated with markup, Scheme, lyrics and
\\paper/\\layout blocks that python-ly's MusicXML exporter cannot digest. The
clean_ly() pass strips that cruft down to a minimal score before conversion.

Usage:
    python3 depoly.py INPUT [-o OUT.musicxml] [--staff N]
                      [--split C4] [--lute-clef treble_8]
                      [--mscz] [--pdf] [--open]
"""
import argparse
import copy
import os
import re
import shutil
import subprocess
import sys
import tempfile
import warnings

warnings.filterwarnings("ignore")

MSCORE_CANDIDATES = [
    "/Applications/MuseScore 4.app/Contents/MacOS/mscore",
    "/Applications/MuseScore 3.app/Contents/MacOS/mscore",
    "mscore",
    "musescore",
    "MuseScore",
]


def find_mscore():
    for c in MSCORE_CANDIDATES:
        if os.path.sep in c:
            if os.path.exists(c):
                return c
        elif shutil.which(c):
            return shutil.which(c)
    return None


# --------------------------------------------------------------------------- #
# LilyPond cleaning
# --------------------------------------------------------------------------- #
def _remove_block_after(text, pattern):
    """Remove each regex match plus the balanced {...} block that follows it."""
    while True:
        m = re.search(pattern, text)
        if not m:
            return text
        j = m.end()
        while j < len(text) and text[j] != "{":
            j += 1
        if j >= len(text):  # no brace -> just drop the match
            text = text[: m.start()] + text[m.end():]
            continue
        depth, k = 0, j
        while k < len(text):
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    k += 1
                    break
            k += 1
        text = text[: m.start()] + text[k:]


def clean_ly(path):
    """Return a minimal, python-ly-digestible version of a LilyPond file."""
    src = open(path, encoding="utf-8").read()

    keym = re.search(r"\\key\s+\S+\s+\\\w+", src)
    timem = re.search(r"\\time\s+\d+/\d+", src)
    key = keym.group(0) if keym else r"\key c \major"
    tim = timem.group(0) if timem else r"\time 4/4"

    for kw in (r"\\header", r"\\paper", r"\\layout", r"\\midi"):
        src = _remove_block_after(src, kw)

    src = _remove_block_after(src, r"\b\w+\s*=\s*\\lyricmode")
    src = _remove_block_after(src, r"\\new\s+Lyrics[^{]*")
    src = _remove_block_after(src, r"\\with")
    src = _remove_block_after(src, r"\b(showMultiRests|hideMultiRests)\s*=")

    # neutralise helper definitions and inline uses
    src = re.sub(r"(?m)^\s*\w+\s*=\s*\\once\s+\\set[^\n]*$", "", src)
    src = re.sub(r"(?m)^\s*(showMultiRests|hideMultiRests)\s*$", "", src)
    src = re.sub(r"(?m)^\s*\\set\s+[^\n]*$", "", src)
    src = re.sub(r"\\(showMultiRests|hideMultiRests|ss)\b", "", src)

    # rebuild a trivial global with only key + time
    src = _remove_block_after(src, r"\bglobal\s*=")
    src = "global = { %s %s }\n" % (key, tim) + src
    return src


def parse_ly_metadata(raw):
    """Pull title / subtitle / composer from a raw LilyPond \\header (before cleaning)."""
    def field(key):
        m = re.search(r"(?m)^\s*" + key + r"\s*=\s*(.+)$", raw)
        if not m:
            return None
        q = re.search(r'"([^"]*)"', m.group(1))
        return q.group(1).strip() if q else None

    return {
        "title": field("title") or field("htitle"),
        "subtitle": field("subtitle"),
        "composer": field("composer") or field("hcomposer"),
    }


def build_metadata(input_path, src, ly_meta):
    """Compose useful metadata for the output score."""
    from music21 import metadata

    title = composer = None
    if ly_meta:
        title, composer = ly_meta.get("title"), ly_meta.get("composer")
    if src is not None and src.metadata is not None:
        title = title or src.metadata.title
        try:
            composer = composer or src.metadata.composer
        except Exception:
            pass
    if not title or title == "Music21":
        title = os.path.splitext(os.path.basename(input_path))[0]

    md = metadata.Metadata()
    md.title = title
    if composer and composer != "Music21":
        md.composer = composer
    return md


# --------------------------------------------------------------------------- #
# Loading
# --------------------------------------------------------------------------- #
def load_score(path):
    from music21 import converter

    ext = os.path.splitext(path)[1].lower()
    if ext == ".ly":
        import ly.document
        import ly.musicxml

        cleaned = clean_ly(path)
        w = ly.musicxml.writer()
        w.parse_document(ly.document.Document(cleaned))
        tmp = tempfile.NamedTemporaryFile(suffix=".musicxml", delete=False).name
        w.musicxml().write(tmp)
        return converter.parse(tmp)
    if ext == ".mscz":
        ms = find_mscore()
        if not ms:
            sys.exit("MuseScore CLI not found; cannot read .mscz")
        tmp = tempfile.NamedTemporaryFile(suffix=".musicxml", delete=False).name
        subprocess.run([ms, path, "-o", tmp], check=True, capture_output=True)
        return converter.parse(tmp)
    return converter.parse(path)


# --------------------------------------------------------------------------- #
# Transformations
# --------------------------------------------------------------------------- #
def _measure_numbers(parts):
    from music21 import stream

    nums = set()
    for p in parts:
        for m in p.getElementsByClass(stream.Measure):
            nums.add(m.number)
    return sorted(nums)


def _carry_context(dst, src_measure, first, extra_clef=None):
    """Insert clef (first measure only) + key/time signatures into dst."""
    from music21 import clef, key, meter

    if first:
        if extra_clef is not None:
            dst.insert(0, extra_clef)
        ts = src_measure.getContextByClass(meter.TimeSignature)
        ks = src_measure.getContextByClass(key.KeySignature)
        if ks is not None:
            dst.insert(0, copy.deepcopy(ks))
        if ts is not None:
            dst.insert(0, copy.deepcopy(ts))
    else:
        for el in src_measure.getElementsByClass(meter.TimeSignature):
            dst.insert(el.offset, copy.deepcopy(el))


def build_grand_staff(parts, split_ps):
    """Two PartStaffs (treble/bass) holding all source notes split by pitch."""
    from music21 import chord, clef, duration, note, stream

    treble, bass = stream.PartStaff(), stream.PartStaff()
    treble.id, bass.id = "grand-rh", "grand-lh"
    treble.partName = "Reduction"
    treble.partAbbreviation = "Red."

    first = True
    for mn in _measure_numbers(parts):
        srcs = [p.measure(mn) for p in parts]
        srcs = [m for m in srcs if m is not None]
        if not srcs:
            continue
        ml = srcs[0].barDuration.quarterLength
        tm, bm = stream.Measure(number=mn), stream.Measure(number=mn)
        _carry_context(tm, srcs[0], first, clef.TrebleClef())
        _carry_context(bm, srcs[0], first, clef.BassClef())
        first = False

        for mm in srcs:
            for n in mm.recurse().notes:
                off = n.getOffsetInHierarchy(mm)
                hi = [p for p in n.pitches if p.ps >= split_ps]
                lo = [p for p in n.pitches if p.ps < split_ps]
                for grp, dst in ((hi, tm), (lo, bm)):
                    if not grp:
                        continue
                    el = note.Note(grp[0]) if len(grp) == 1 else chord.Chord(grp)
                    el.duration = copy.deepcopy(n.duration)
                    dst.insert(off, el)

        for st in (tm, bm):
            if not st.notes:
                r = note.Rest()
                r.duration = duration.Duration(ml)
                st.insert(0, r)
            else:
                st.makeVoices(inPlace=True, fillGaps=True)
                st.makeRests(fillGaps=True, inPlace=True, hideRests=False,
                             timeRangeFromBarDuration=True)
        treble.append(tm)
        bass.append(bm)
    return treble, bass


def build_lute(parts, lute_clef, octave_shift=0):
    """Single-voice lute-intabulation part: each note struck once, held to next onset.

    octave_shift transposes the written notes by that many octaves (e.g. -1 for
    a theorbo notated an octave lower).
    """
    from music21 import chord, duration, note, stream

    lute = stream.Part()
    lute.id = "lute"
    lute.partName = "Theorbo"
    lute.partAbbreviation = "Tb."

    first = True
    for mn in _measure_numbers(parts):
        srcs = [p.measure(mn) for p in parts]
        srcs = [m for m in srcs if m is not None]
        if not srcs:
            continue
        ml = srcs[0].barDuration.quarterLength
        nm = stream.Measure(number=mn)
        _carry_context(nm, srcs[0], first, lute_clef)
        first = False

        onsets = {}
        for mm in srcs:
            for n in mm.recurse().notes:
                off = round(float(n.getOffsetInHierarchy(mm)), 4)
                onsets.setdefault(off, []).extend(n.pitches)

        if not onsets:
            r = note.Rest()
            r.duration = duration.Duration(ml)
            nm.insert(0, r)
        else:
            offs = sorted(onsets)
            if offs[0] > 0:
                r = note.Rest()
                r.duration = duration.Duration(offs[0])
                nm.insert(0, r)
            for i, off in enumerate(offs):
                nxt = offs[i + 1] if i + 1 < len(offs) else ml
                dur = nxt - off
                if dur <= 0:
                    continue
                seen = {}
                for p in onsets[off]:
                    seen[p.nameWithOctave] = p
                uniq = list(seen.values())
                el = note.Note(uniq[0]) if len(uniq) == 1 else chord.Chord(uniq)
                el.duration = duration.Duration(dur)
                if octave_shift:
                    el.transpose(12 * octave_shift, inPlace=True)
                nm.insert(off, el)
        lute.append(nm)
    return lute


def make_clef(name):
    from music21 import clef

    return {
        "treble": clef.TrebleClef(),
        "treble_8": clef.Treble8vbClef(),
        "bass": clef.BassClef(),
        "alto": clef.AltoClef(),
    }.get(name, clef.Treble8vbClef())


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description="Depolyphonise a score into a grand-staff + lute study layout.")
    ap.add_argument("input")
    ap.add_argument("-o", "--output", help="output .musicxml path (default: <input>-depoly.musicxml)")
    ap.add_argument("--staff", type=int, default=None,
                    help="0-based part index to use as the polyphony source; default = all parts combined")
    ap.add_argument("--split", default="C4", help="treble/bass split pitch for the grand staff (default C4)")
    ap.add_argument("--lute-clef", default="bass",
                    help="clef for the lute staff: bass (default, for theorbo), treble_8, treble, alto")
    ap.add_argument("--lute-octave", type=int, default=-1,
                    help="octaves to transpose the lute staff (default -1, theorbo notated an octave lower; 0 = no shift)")
    ap.add_argument("--mscz", action="store_true", help="also render a .mscz via MuseScore")
    ap.add_argument("--pdf", action="store_true", help="also render a .pdf via MuseScore")
    ap.add_argument("--open", action="store_true", help="open the result in MuseScore when done")
    args = ap.parse_args()

    from music21 import layout, pitch, stream

    src = load_score(args.input)
    parts = [src.parts[args.staff]] if args.staff is not None else list(src.parts)
    if not parts:
        sys.exit("no parts found in input")

    split_ps = pitch.Pitch(args.split).ps

    treble, bass = build_grand_staff(parts, split_ps)
    lute = build_lute(parts, make_clef(args.lute_clef), octave_shift=args.lute_octave)

    ly_meta = None
    if os.path.splitext(args.input)[1].lower() == ".ly":
        ly_meta = parse_ly_metadata(open(args.input, encoding="utf-8").read())

    out_score = stream.Score()
    out_score.metadata = build_metadata(args.input, src, ly_meta)
    out_score.insert(0, treble)
    out_score.insert(0, bass)
    out_score.insert(0, lute)
    out_score.insert(0, layout.StaffGroup([treble, bass], symbol="brace", barTogether=True))

    out_xml = args.output or (os.path.splitext(args.input)[0] + "-depoly.musicxml")
    out_score.write("musicxml", fp=out_xml)
    print("wrote", out_xml)

    targets = []
    if args.mscz or args.open:
        targets.append(os.path.splitext(out_xml)[0] + ".mscz")
    if args.pdf:
        targets.append(os.path.splitext(out_xml)[0] + ".pdf")
    if targets:
        ms = find_mscore()
        if not ms:
            print("MuseScore CLI not found; skipping render", file=sys.stderr)
        else:
            for t in targets:
                subprocess.run([ms, out_xml, "-o", t], check=True, capture_output=True)
                print("wrote", t)
            if args.open:
                opener = os.path.splitext(out_xml)[0] + ".mscz"
                subprocess.run(["open", opener])
                print("opened", opener)


if __name__ == "__main__":
    main()
