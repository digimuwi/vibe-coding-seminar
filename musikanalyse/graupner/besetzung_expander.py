import argparse
import re
from pathlib import Path

import pandas as pd

DEFAULT_CSV = Path(__file__).resolve().parent / "Graupner-Saetze_berechnet.CSV"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "Graupner-Besetzung-expanded.csv"

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
        # ignore unknown tokens that are not clearly voices or known instruments
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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Erzeuge eine erweiterte Besetzungs-CSV mit Stimmen und Instrumenten als Spalten"
    )
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Pfad zur Ausgangs-CSV-Datei")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Pfad zur neuen erweiterten Ausgabedatei")
    args = parser.parse_args()

    df = pd.read_csv(args.csv, sep=";", dtype=str, keep_default_na=False, encoding="cp1252")
    expanded = expand_besetzung(df)
    expanded.to_csv(args.output, index=False, sep=";", encoding="cp1252")
    print(f"Erstellt: {args.output}")


if __name__ == "__main__":
    main()
