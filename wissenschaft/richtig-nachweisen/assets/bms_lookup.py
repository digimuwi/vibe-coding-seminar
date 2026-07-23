#!/usr/bin/env python3
"""BMS-Lookup — Sachabgleich gegen die Bibliographie des Musikschrifttums online.

Frei zugängliche SRU-API der BMS (K10plus/GBV), kein Login/VPN. Endpunkte & Vertrag:
siehe ~/Projects/richtig-zitieren/HANDOFF_bms_api.md (live getestet 2026-07-23).

Zweck: für einen Literatur-Nachweis Kandidatensätze aus BMS holen, damit Autor-
Schreibweise, Titel und Erscheinungsjahr sachlich gegengeprüft werden können. Die
Bewertung (Treffer? Abweichung relevant oder nur andere Auflage?) bleibt beim Aufrufer —
dieses Skript liefert nur strukturierte Kandidaten, es entscheidet nichts.

Nutzung:
  python bms_lookup.py --author "Taruskin" --title "Stravinsky Russian Traditions" --year 1996
  python bms_lookup.py --cql 'pica.tit=Beethoven and pica.jhr=2020' --max 5
  python bms_lookup.py --ppn 009374523      # Einzelsatz per unAPI
Ausgabe: JSON auf stdout ({query, total, candidates:[…]}).
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

SRU = "https://sru.k10plus.de/bmsonline"
UNAPI = "https://unapi.k10plus.de/"
NS = {"marc": "http://www.loc.gov/MARC21/slim",
      "zs": "http://www.loc.gov/zing/srw/",
      "srw": "http://www.loc.gov/zing/srw/"}
TIMEOUT = 30
STOPWORDS = {"der", "die", "das", "und", "in", "im", "zur", "zum", "des", "the", "of",
             "a", "an", "and", "for", "to", "on", "le", "la", "les", "el", "il", "di",
             "eine", "ein", "einer", "von", "vom", "op", "no"}


def _get(url):
    # curl first: uses the system cert store, avoids the macOS-Python SSL cert quirk.
    curl = shutil.which("curl")
    if curl:
        p = subprocess.run(
            [curl, "-sS", "--fail", "--max-time", str(TIMEOUT),
             "-A", "richtig-nachweisen/1.0", url],
            capture_output=True)
        if p.returncode == 0:
            return p.stdout
        # fall through to urllib on curl failure
    req = urllib.request.Request(url, headers={"User-Agent": "richtig-nachweisen/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read()


def _norm(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def _title_tokens(title):
    words = re.findall(r"\w+", (title or "").lower(), flags=re.UNICODE)
    return [w for w in words if len(w) > 2 and w not in STOPWORDS]


def build_cql(author=None, title=None, year=None):
    parts = []
    if author:
        surname = re.split(r"[,\s]+", author.strip())[0]
        if surname:
            parts.append(f'pica.per={surname}')
    if title:
        for w in _title_tokens(title)[:3]:
            parts.append(f'pica.tit={w}')
    if year:
        y = re.sub(r"\D", "", str(year))
        if y:
            parts.append(f'pica.jhr={y}')
    if not parts:
        raise SystemExit("bms_lookup: need --author/--title/--year or --cql")
    return " and ".join(parts)


def _field(rec, tag, code):
    for df in rec.findall(f"marc:datafield[@tag='{tag}']", NS):
        for sf in df.findall(f"marc:subfield[@code='{code}']", NS):
            if sf.text:
                return sf.text
    return None


def _year_of(rec):
    raw = _field(rec, "264", "c") or _field(rec, "260", "c")
    if raw:
        m = re.search(r"\d{4}", raw)
        if m:
            return m.group(0)
    cf008 = rec.findtext("marc:controlfield[@tag='008']", namespaces=NS)
    if cf008 and len(cf008) >= 11:
        m = re.search(r"\d{4}", cf008[7:11])
        if m:
            return m.group(0)
    return None


def _doi(rec):
    for df in rec.findall("marc:datafield[@tag='024']", NS):
        if (df.findtext("marc:subfield[@code='2']", namespaces=NS) or "").lower() == "doi":
            v = df.findtext("marc:subfield[@code='a']", namespaces=NS)
            if v:
                return v
    return None


def parse_records(xml_bytes):
    root = ET.fromstring(xml_bytes)
    total = root.findtext(".//zs:numberOfRecords", namespaces=NS)
    records = root.findall(".//marc:record", NS)
    if not records and root.tag == "{http://www.loc.gov/MARC21/slim}record":
        records = [root]  # unAPI returns the bare <record> as the root element
    out = []
    for rec in records:
        ppn = rec.findtext("marc:controlfield[@tag='001']", namespaces=NS)
        a = _field(rec, "245", "a") or ""
        b = _field(rec, "245", "b")
        title = _norm(a + ((". " + b) if b else ""))
        author = _field(rec, "100", "a") or _field(rec, "110", "a")
        out.append({
            "ppn": ppn,
            "title": title,
            "author": _norm(author) if author else None,
            "year": _year_of(rec),
            "doi": _doi(rec),
            "unapi": f"{UNAPI}?id=bmsonline:ppn:{ppn}&format=marcxml" if ppn else None,
        })
    return (int(total) if total is not None else None), out


def score(cand, author=None, title=None, year=None):
    """Grobe Heuristik zur Rangfolge (0..1). Keine Entscheidung — nur Hilfe."""
    s = 0.0
    if author and cand.get("author"):
        surname = re.split(r"[,\s]+", author.strip())[0].lower()
        if surname and surname in cand["author"].lower():
            s += 0.4
    if title and cand.get("title"):
        want = set(_title_tokens(title))
        have = set(_title_tokens(cand["title"]))
        if want:
            s += 0.5 * len(want & have) / len(want)
    if year and cand.get("year"):
        s += 0.1 if re.sub(r"\D", "", str(year)) == cand["year"] else 0.0
    return round(s, 3)


def search(cql, n=10, start=1, schema="marcxml"):
    params = urllib.parse.urlencode({
        "version": "1.1", "operation": "searchRetrieve", "query": cql,
        "maximumRecords": n, "startRecord": start, "recordSchema": schema,
    })
    total, recs = parse_records(_get(f"{SRU}?{params}"))
    return total, recs, f"{SRU}?{params}"


def fetch_ppn(ppn):
    # parse_records only understands MARCXML, so always request that format.
    url = f"{UNAPI}?id=bmsonline:ppn:{ppn}&format=marcxml"
    _, recs = parse_records(_get(url))
    return recs[0] if recs else None, url


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--author")
    ap.add_argument("--title")
    ap.add_argument("--year")
    ap.add_argument("--cql")
    ap.add_argument("--ppn")
    ap.add_argument("--max", type=int, default=10)
    ap.add_argument("--schema", default="marcxml")
    args = ap.parse_args()

    if args.ppn:
        rec, url = fetch_ppn(args.ppn)
        print(json.dumps({"ppn": args.ppn, "record": rec, "source": url},
                         ensure_ascii=False, indent=2))
        return

    cql = args.cql or build_cql(args.author, args.title, args.year)
    try:
        total, recs, url = search(cql, n=args.max, schema=args.schema)
    except Exception as e:  # network/parse failure — report, do not crash the caller
        print(json.dumps({"error": str(e), "cql": cql}, ensure_ascii=False))
        sys.exit(2)
    if not args.cql:
        for c in recs:
            c["match_score"] = score(c, args.author, args.title, args.year)
        recs.sort(key=lambda c: c.get("match_score", 0), reverse=True)
    print(json.dumps({"cql": cql, "total": total, "source": url, "candidates": recs},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
