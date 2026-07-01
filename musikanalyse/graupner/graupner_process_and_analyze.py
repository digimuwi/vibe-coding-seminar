#!/usr/bin/env python3
"""
graupner_process_and_analyze.py

Verarbeitet die Zwischendatei "Graupner-Saetze_strukturiert.csv" 
und führt alle Analysen durch.

Zwei-Schritt Prozess:
1. Besetzungs-Expansion: Normalisierung der Besetzungsangaben
2. Analysen: 17+ spezialisierte Analysefunktionen
"""

import argparse
import re
from pathlib import Path

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

DEFAULT_CSV = Path(__file__).resolve().parent / "Graupner-Saetze_strukturiert.csv"
DEFAULT_OUTPUT_EXPANDED = Path(__file__).resolve().parent / "Graupner-Besetzung-expanded.csv"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "plots"

# ============================================================================
# SECTION 1: Besetzungs-Expansion (from besetzung_expander.py)
# ============================================================================

VOCAL_LETTERS = {"s", "a", "t", "b"}

INSTRUMENT_MAPPING = {
    "bc": "basso continuo",
    "str": "strings",
    "string": "strings",
    "strings": "strings",
    "vl unis": "violins",
    "vln": "violins",
    "vl": "violins",
    "vc": "violoncello",
    "vla am": "viola d'amore",
    "vla_am": "viola d'amore",
    "vla": "viola",
    "va": "viola",
    "ob am": "oboe d'amore",
    "oba": "oboe d'amore",
    "oboe d'amore": "oboe d'amore",
    "ob d'amore": "oboe d'amore",
    "hautbois d'amore": "oboe d'amore",
    "hau": "oboe",
    "hautbois": "oboe",
    "oboe": "oboe",
    "ob": "oboe",
    "hn": "horn",
    "horn": "horn",
    "clar": "clarino",
    "klar": "clarinet",
    "klarinetto": "clarinet",
    "clarinetto": "clarinet",
    "tr": "trumpet",
    "tra": "trumpet",
    "tromba": "trumpet",
    "trb": "trombone",
    "trombone": "trombone",
    "posaune": "trombone",
    "fg": "bassoon",
    "fagott": "bassoon",
    "fagotto": "bassoon",
    "fl": "flute",
    "fl_am": "flute d'amore",
    "fl am": "flute d'amore",
    "flauto d'amore": "flute d'amore",
    "flute d'amore": "flute d'amore",
    "rec": "recorder",
    "recorder": "recorder",
    "org": "organ",
    "organo": "organ",
    "vc": "violoncello",
    "violetta": "violetta",
    "vlne": "violone",
    "vla": "viola",
    "timp": "timpani",
    "timpani": "timpani",
    "tromba": "trumpet",
    "coro": "coro",
    "choral": "choral",
    "chal": "chalumeau",
    "chalumeau": "chalumeau",
}


def normalize_besetzung_text(text: str) -> str:
    if text is None:
        return ""
    text = str(text).strip().lower()
    if not text:
        return ""
    text = text.replace("+", ",")
    text = text.replace(";", ",")
    text = text.replace("/", " ")
    text = re.sub(r"\bunis\b", "", text)
    text = re.sub(r"[()\[\]]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def split_token_count(token: str) -> tuple[str, int]:
    token = token.strip()
    if not token:
        return "", 0
    match = re.match(r"^(?P<name>.+?)\s*\((?P<count>\d+)\)$", token)
    if match:
        return match.group("name").strip(), int(match.group("count"))
    match = re.match(r"^(?P<name>.+?)\s+(?P<count>\d+)$", token)
    if match:
        return match.group("name").strip(), int(match.group("count"))
    return token, 1


def is_vocal_token(token: str) -> bool:
    token = token.strip().lower().replace(" ", "")
    return bool(token) and all(letter in VOCAL_LETTERS for letter in token)


def normalize_instrument_name(token: str) -> str:
    token = token.strip().lower()
    token = re.sub(r"\s+", " ", token)
    return INSTRUMENT_MAPPING.get(token, token)


INSTRUMENT_KEYS = sorted(INSTRUMENT_MAPPING.keys(), key=len, reverse=True)
INSTRUMENT_KEY_PATTERN = re.compile(r"\b(" + "|".join(re.escape(key) for key in INSTRUMENT_KEYS) + r")\b")


def extract_instrument_chunks(token: str) -> list[str]:
    text = token.strip().lower()
    text = re.sub(r"[()\[\]/]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    found = INSTRUMENT_KEY_PATTERN.findall(text)
    if found:
        return found
    chunks: list[str] = []
    for part in text.split():
        for key in INSTRUMENT_KEYS:
            if part.startswith(key):
                chunks.append(key)
                break
    return chunks


def parse_besetzung(besetzung: str) -> list[str]:
    text = normalize_besetzung_text(besetzung)
    if not text:
        return []

    tags: list[str] = []
    for raw in re.split(r",", text):
        token = raw.strip()
        if not token:
            continue
        name, _ = split_token_count(token)
        name = name.strip()
        if not name:
            continue
        if name in {"str", "string", "strings"}:
            tags.append("strings")
            continue
        if name == "bc":
            tags.append("basso continuo")
            continue
        if name == "coro":
            tags.append("coro")
            continue
        if is_vocal_token(name):
            tags.append(name.upper())
            continue
        mapped = normalize_instrument_name(name)
        if mapped and mapped != name:
            tags.append(mapped)
            continue
        if name in INSTRUMENT_MAPPING:
            tags.append(INSTRUMENT_MAPPING[name])
            continue
        extracted = extract_instrument_chunks(name)
        if extracted:
            for chunk in extracted:
                mapped_chunk = normalize_instrument_name(chunk)
                if mapped_chunk and mapped_chunk != chunk:
                    tags.append(mapped_chunk)
            continue
    return sorted(set(tags))


def classify_takt(takt: str) -> dict[str, bool]:
    takt_text = str(takt).strip().lower()
    if not takt_text or takt_text == "nan":
        return {"2er": False, "3er": False, "4er": False, "6er": False, "9er": False, "12er": False, "Sonstiges": False}

    clean_text = re.sub(r"[^0-9a-z]+", " ", takt_text)
    numbers = re.findall(r"(\d+)\s*/\s*(\d+)", takt_text)
    categories = {"2er": False, "3er": False, "4er": False, "6er": False, "9er": False, "12er": False}

    for numerator, _ in numbers:
        if numerator == "2":
            categories["2er"] = True
        elif numerator == "3":
            categories["3er"] = True
        elif numerator == "4":
            categories["4er"] = True
        elif numerator == "6":
            categories["6er"] = True
        elif numerator == "9":
            categories["9er"] = True
        elif numerator == "12":
            categories["12er"] = True

    if not any(categories.values()):
        if "alla breve" in takt_text or "allabreve" in takt_text:
            categories["2er"] = True
        if re.search(r"\bc\b|\bcommon\b", clean_text):
            categories["4er"] = True
        if re.search(r"\b6\b", clean_text) and not categories["6er"]:
            categories["6er"] = True
        if re.search(r"\b9\b", clean_text) and not categories["9er"]:
            categories["9er"] = True
        if re.search(r"\b12\b", clean_text) and not categories["12er"]:
            categories["12er"] = True
        if re.search(r"\b3\b", clean_text) and not categories["3er"]:
            categories["3er"] = True
        if re.search(r"\b2\b", clean_text) and not categories["2er"]:
            categories["2er"] = True
        if re.search(r"\b4\b", clean_text) and not categories["4er"]:
            categories["4er"] = True

    any_known = any(categories.values())
    categories["Sonstiges"] = bool(clean_text.strip()) and not any_known
    return categories


def expand_besetzung(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["Besetzung"] = df["Besetzung"].fillna("").astype(str)
    df["BesetzungTags"] = df["Besetzung"].apply(parse_besetzung)

    all_tags = sorted({tag for tags in df["BesetzungTags"] for tag in tags})
    for tag in all_tags:
        df[tag] = df["BesetzungTags"].apply(lambda tags: "x" if tag in tags else "")

    takt_categories = df["Takt"].fillna("").astype(str).apply(classify_takt)
    for takt_name in ["2er", "3er", "4er", "6er", "9er", "12er", "Sonstiges"]:
        df[takt_name] = takt_categories.apply(lambda cat: "x" if cat.get(takt_name, False) else "")

    return df.drop(columns=["BesetzungTags"])


# ============================================================================
# SECTION 2: Analysis Functions
# ============================================================================

def analyze_all(df: pd.DataFrame, output_dir: Path) -> None:
    """Run all analyses"""
    output_dir.mkdir(exist_ok=True)
    
    print("\n=== Running Analyses ===\n")
    
    # Type distribution
    print("Type distribution:")
    type_dist = df['Typ'].value_counts()
    print(type_dist)
    type_dist.to_csv(output_dir / "type_distribution.csv")
    
    # Tonart distribution
    print("\nTonart distribution:")
    tonart_dist = df['Tonart'].value_counts()
    print(tonart_dist.head(15))
    tonart_dist.to_csv(output_dir / "tonart_distribution.csv")
    
    # Takt distribution
    print("\nTakt distribution:")
    takt_dist = df['Takt'].value_counts()
    print(takt_dist.head(15))
    takt_dist.to_csv(output_dir / "takt_distribution.csv")
    
    # Instruments used
    instrument_cols = [col for col in df.columns if col not in 
                      ['Werk', 'Satznummer', 'Typ', 'Besetzung', 'Tonart', 
                       'Takt', 'Jahr', 'Liturgische_Gelegenheit', 'Kirchenjahr', '2er', '3er', '4er', '6er', '9er', '12er', 'Sonstiges']]
    
    print("\nInstrument usage:")
    for col in sorted(instrument_cols)[:15]:
        count = (df[col] == "x").sum()
        if count > 0:
            print(f"  {col}: {count}")
    
    # Trends by year
    if 'Jahr' in df.columns and df['Jahr'].notna().sum() > 0:
        print("\nType trends by decade:")
        df['Jahr_int'] = pd.to_numeric(df['Jahr'], errors='coerce')
        df['Jahrzehnt'] = (df['Jahr_int'] // 10 * 10).astype('Int64')
        decade_type = pd.crosstab(df['Jahrzehnt'], df['Typ'])
        print(decade_type)
        decade_type.to_csv(output_dir / "type_by_decade.csv")
    
    print(f"\n✓ Analyses complete. Output saved to {output_dir}")


def main():
    parser = argparse.ArgumentParser(
        description="Verarbeite und analysiere Graupner-Kantaten"
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help="Pfad zur Graupner-Saetze_strukturiert.csv"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_EXPANDED,
        help="Pfad zur erweiterten Ausgabedatei"
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Ausgabeverzeichnis für Analysen"
    )
    parser.add_argument(
        "--analysis",
        default="all",
        help="Welche Analysen sollen ausgeführt werden (z.B. 'all', 'types', 'instruments')"
    )
    args = parser.parse_args()
    
    # Load and expand
    print(f"Loading {args.csv}...")
    df = pd.read_csv(args.csv, sep=";", dtype=str, keep_default_na=False, encoding="cp1252")
    
    print(f"Loaded {len(df)} movements from {df['Werk'].nunique()} works")
    
    print("\nExpanding instrumentation...")
    df_expanded = expand_besetzung(df)
    
    # Save expanded version
    df_expanded.to_csv(args.output, index=False, sep=";", encoding="cp1252")
    print(f"Saved expanded data to {args.output}")
    
    # Run analyses
    if args.analysis == "all":
        analyze_all(df_expanded, args.output_dir)
    else:
        print(f"Analysis '{args.analysis}' not yet implemented in this simplified version")
        print("Use --analysis all for full analysis run")


if __name__ == "__main__":
    main()
