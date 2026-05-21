import argparse
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib.pyplot as plt
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[3]
DEFAULT_CSV = ROOT_DIR / "Graupner-Saetze_berechnet.CSV"
PLOTS_DIR = Path(__file__).resolve().parent / "plots"
PLOTS_DIR.mkdir(exist_ok=True, parents=True)

METER_PATTERNS = [
    (r"\ballabreve\b|alla breve|2/2\b", "alla_breve"),
    (r"\bC\b", "4/4"),
    (r"\b12/8\b", "12/8"),
    (r"\b9/8\b", "9/8"),
    (r"\b6/8\b", "6/8"),
    (r"\b3/4\b", "3/4-like"),
    (r"\b3/8\b", "3/4-like"),
    (r"\b3/2\b", "3/2"),
    (r"\b3\b", "3"),
]

MODE_INSTRUMENTS = {
    "chalumeau": ["chalumeau", "chal"],
    "oboe d'amore": ["oboe d'amore", "ob am", "oba"],
    "viola d'amore": ["viola d'amore", "vla am"],
}
VOICE_LABELS = {"s", "a", "t", "b"}


def load_data(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, sep=";", dtype=str, keep_default_na=False, encoding="cp1252")
    df = df.rename(columns={"Takt": "Meter"})
    df = df.replace({"": pd.NA})
    df["Typ"] = df["Typ"].astype(str).str.lower().str.strip()
    df["Tonart"] = df["Tonart"].astype(str).str.strip()
    df["Besetzung"] = df["Besetzung"].astype(str).str.strip()
    df["Saison"] = df["Saison"].astype(str).str.strip().str.title()
    df["Zeit"] = df["Zeit"].astype(str).str.strip()
    df["Jahrzehnt"] = df["Jahrzehnt"].astype(str).str.strip()
    df["Meter"] = df["Meter"].astype(str).str.strip()
    df["Jahr"] = pd.to_numeric(df["Jahr"], errors="coerce").astype("Int64")
    df["Satznr"] = pd.to_numeric(df["Satznr"], errors="coerce").astype("Int64")
    df["Werk"] = df["Werk"].astype(str).str.strip()
    df["MeterCategory"] = df["Meter"].apply(categorize_meter)
    parsed = df["Besetzung"].apply(parse_besetzung)
    df["VoiceCounts"] = parsed.apply(lambda x: x[0])
    df["InstrumentCounts"] = parsed.apply(lambda x: x[1])
    df["VoiceTotal"] = df["VoiceCounts"].apply(lambda d: sum(d.values()) if isinstance(d, dict) else 0)
    df["InstrumentTotal"] = df["InstrumentCounts"].apply(lambda d: sum(d.values()) if isinstance(d, dict) else 0)
    df["ChoralPosition"] = df.groupby("Werk")["Typ"].transform(lambda s: find_choral_position(s))
    return df


def categorize_meter(meter: str) -> str:
    if pd.isna(meter) or not meter:
        return "unknown"
    meter = meter.lower().replace("(allabreve)", "allabreve").replace("(alla breve)", "alla breve")
    meter = re.sub(r"\s+", " ", meter).strip()
    if "+" in meter and not re.search(r"allabreve|alla breve", meter):
        return "mixed"
    for pattern, category in METER_PATTERNS:
        if re.search(pattern, meter):
            return category
    if "c" == meter:
        return "4/4"
    return meter.strip()


def normalize_besetzung_text(besetzung: str) -> str:
    if pd.isna(besetzung) or not besetzung:
        return ""
    text = besetzung.lower()
    text = text.replace("+", ",").replace(";", ",").replace("/", " ")
    text = re.sub(r"[\(\)]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_besetzung(besetzung: str) -> Tuple[Dict[str, int], Dict[str, int]]:
    text = normalize_besetzung_text(besetzung)
    if not text:
        return {}, {}

    tokens = [token.strip() for token in re.split(r",", text) if token.strip()]
    voices: Counter[str] = Counter()
    instruments: Counter[str] = Counter()

    for token in tokens:
        if token in {"bc", "str", "string", "strings"}:
            if token.startswith("str"):
                instruments["strings"] += 1
            else:
                instruments["basso continuo"] += 1
            continue
        token_letters = re.sub(r"[\s\(\)]", "", token)
        if token_letters and re.fullmatch(r"[satb]+", token_letters):
            for letter in token_letters:
                voices[letter.upper()] += 1
            continue
        name, count = split_token_count(token)
        if not name:
            continue
        mapped = map_instrument_name(name)
        if mapped:
            instruments[mapped] += count
            continue
        if name in VOICE_LABELS or set(name).issubset(VOICE_LABELS):
            for letter in name:
                voices[letter.upper()] += count
            continue
        instruments[name] += count

    return dict(voices), dict(instruments)


def split_token_count(token: str) -> Tuple[str, int]:
    token = token.strip()
    if not token:
        return "", 0
    match = re.match(r"^([a-zäöü ]+?)(?:\s*(\d+))?$", token)
    if match:
        name = match.group(1).strip()
        count = int(match.group(2) or 1)
        return name, count
    match = re.match(r"^([a-zäöü ]+?)\s*\((\d+)\)$", token)
    if match:
        return match.group(1).strip(), int(match.group(2))
    return token, 1


def map_instrument_name(name: str) -> str:
    mapping = {
        "ob am": "oboe d'amore",
        "oba": "oboe d'amore",
        "oboe d'amore": "oboe d'amore",
        "hautbois": "oboe",
        "oboe": "oboe",
        "ob": "oboe",
        "hn": "horn",
        "fg": "bassoon",
        "vc": "violoncello",
        "vl unis": "violins",
        "vln": "violins",
        "vl": "violins",
        "vla am": "viola d'amore",
        "viola d'amore": "viola d'amore",
        "vla": "viola",
        "va": "viola",
        "str": "strings",
        "string": "strings",
        "strings": "strings",
        "bc": "basso continuo",
        "tr": "trumpet",
        "fl": "flute",
        "recorder": "recorder",
        "chal": "chalumeau",
        "chalumeau": "chalumeau",
        "org": "organ",
        "pf": "piano",
    }
    normalized = name.strip()
    for pattern, canonical in mapping.items():
        if normalized.startswith(pattern):
            return canonical
    return ""


def find_choral_position(series: pd.Series) -> str:
    values = list(series.astype(str))
    positions = [i for i, value in enumerate(values, start=1) if value == "choral"]
    if not positions:
        return "none"
    first = positions[0]
    last = positions[-1]
    if first == 1:
        return "first"
    if last == len(values):
        return "last"
    return "middle"


def save_figure(fig: plt.Figure, name: str) -> None:
    path = PLOTS_DIR / f"{name}.png"
    fig.savefig(path, bbox_inches="tight", dpi=150)
    plt.close(fig)
    print(f"Saved plot: {path}")


def analyze_meter_trends(df: pd.DataFrame) -> None:
    table = pd.crosstab(df["Jahrzehnt"], df["MeterCategory"])
    print("\nMeter categories by decade:\n", table)
    fig = table.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
    fig.suptitle("Meter categories by decade")
    save_figure(fig, "meter_categories_by_decade")


def analyze_recitative_types(df: pd.DataFrame) -> None:
    rec_df = df[df["Typ"].isin(["rec", "acc"]) | df["Typ"].str.startswith("rec") | df["Typ"].str.contains("acc")]
    rec_df = rec_df.copy()
    rec_df["RecType"] = rec_df["Typ"].apply(lambda x: "acc" if "acc" in x else ("rec" if "rec" in x else "other"))
    table = pd.crosstab(rec_df["Jahrzehnt"], rec_df["RecType"])
    print("\nAccompagnato vs Secco by decade:\n", table)
    if "acc" in table.columns and "rec" in table.columns:
        table["acc_ratio"] = table["acc"] / (table["acc"] + table["rec"])
        print("\nAcc ratio by decade:\n", table[["acc_ratio"]])
    fig = table.plot(kind="bar", figsize=(12, 6)).get_figure()
    fig.suptitle("Recitative types by decade")
    save_figure(fig, "recitative_types_by_decade")


def analyze_instrumentation_complexity(df: pd.DataFrame) -> None:
    complexity = df.groupby("Jahrzehnt")["InstrumentTotal"].agg(["mean", "median", "count"]).fillna(0)
    print("\nInstrumentation complexity by decade:\n", complexity)
    fig, ax = plt.subplots(figsize=(10, 6))
    complexity["mean"].plot(kind="bar", ax=ax)
    ax.set_ylabel("Average instrument count")
    ax.set_title("Average instrument count per decade")
    save_figure(fig, "instrumentation_complexity_by_decade")


def analyze_tonart_saison(df: pd.DataFrame) -> None:
    table = pd.crosstab(df["Saison"], df["Tonart"])
    print("\nTonart distribution by season:\n", table)
    csv_path = PLOTS_DIR / "tonart_by_season.csv"
    table.to_csv(csv_path)
    print(f"Saved season-tonart table: {csv_path}")


def analyze_d_dur_ostern(df: pd.DataFrame) -> None:
    measurement = df[df["Tonart"] == "D"].groupby("Saison").size()
    total_by_season = df.groupby("Saison").size()
    ratio = (measurement / total_by_season).fillna(0).sort_values(ascending=False)
    print("\nD-Dur ratio by season:\n", ratio)


def analyze_minor_in_passion(df: pd.DataFrame) -> None:
    minor = df["Tonart"].str.islower()
    table = pd.crosstab(df["Saison"], minor)
    print("\nMinor-key frequency by season (False = major, True = minor):\n", table)


def analyze_meter_saison_correlation(df: pd.DataFrame) -> None:
    corr = pd.crosstab(df["Saison"], df["MeterCategory"])
    print("\nSeason vs meter category:\n", corr)
    fig = corr.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
    fig.suptitle("Meter categories by season")
    save_figure(fig, "meter_category_by_season")


def analyze_vocal_distribution(df: pd.DataFrame) -> None:
    aria_df = df[df["Typ"].str.contains("aria")]
    voice_totals = Counter()
    for counts in aria_df["VoiceCounts"]:
        voice_totals.update(counts)
    total = sum(voice_totals.values())
    distribution = {voice: count / total for voice, count in voice_totals.items()} if total else {}
    print("\nVocal distribution in arias:\n", voice_totals)
    print("\nVocal share in arias:\n", distribution)


def analyze_modeinstruments(df: pd.DataFrame) -> None:
    summary = {}
    for label, canonical_names in MODE_INSTRUMENTS.items():
        years = []
        indexes = []
        for i, counts in enumerate(df["InstrumentCounts"]):
            if any(counts.get(name, 0) > 0 for name in canonical_names):
                years.append(df.iloc[i]["Jahr"])
                indexes.append(i)
        years = [y for y in years if pd.notna(y)]
        if years:
            summary[label] = {
                "first_year": min(years),
                "count": len(years),
                "by_decade": Counter(df.loc[indexes, "Jahrzehnt"])
            }
        else:
            summary[label] = {"first_year": None, "count": 0, "by_decade": {}}
    print("\nMode instruments summary:\n", summary)


def analyze_instrumental_color_by_decade(df: pd.DataFrame) -> None:
    instrument_names = ["oboe d'amore", "viola d'amore"]
    rows = []
    for name in instrument_names:
        hits = []
        for idx, counts in enumerate(df["InstrumentCounts"]):
            if counts.get(name, 0) > 0:
                hits.append(df.iloc[idx]["Jahrzehnt"])
        rows.append((name, Counter(hits)))
    for name, counts in rows:
        print(f"\n{name} by decade:\n", counts)


def analyze_type_sequences(df: pd.DataFrame) -> None:
    grouped = (
        df.sort_values(["Werk", "Satznr"])
        .groupby("Werk")["Typ"]
        .apply(lambda series: " > ".join(series.dropna().astype(str)))
    )
    freq = grouped.value_counts().head(30)
    print("\nMost frequent type sequences by work:\n", freq)


def analyze_choral_position(df: pd.DataFrame) -> None:
    positions = df[df["Typ"] == "choral"].groupby("Werk")["Satznr"].agg(["min", "max"])
    if positions.empty:
        print("No chorale positions found.")
        return
    print("\nChorale positions by work:\n", positions)
    by_position = df[df["Typ"] == "choral"].groupby("ChoralPosition").size()
    print("\nChoral position summary:\n", by_position)


def analyze_form_distribution(df: pd.DataFrame) -> None:
    table = df["Typ"].value_counts()
    print("\nType distribution:\n", table)
    fig = table.plot(kind="bar", figsize=(10, 6)).get_figure()
    fig.suptitle("Satztyp-Verteilung")
    save_figure(fig, "type_distribution")


def main() -> None:
    parser = argparse.ArgumentParser(description="Graupner Kantaten Metadaten-Analyse")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Pfad zur CSV-Datei")
    parser.add_argument("--analysis", nargs="*", default=["all"], help="Welche Analysen ausführen")
    args = parser.parse_args()

    df = load_data(args.csv)
    available = {
        "meter_trends": analyze_meter_trends,
        "recitative_types": analyze_recitative_types,
        "instrumentation_complexity": analyze_instrumentation_complexity,
        "tonart_saison": analyze_tonart_saison,
        "d_dur_ostern": analyze_d_dur_ostern,
        "minor_passion": analyze_minor_in_passion,
        "meter_saison": analyze_meter_saison_correlation,
        "vocal_distribution": analyze_vocal_distribution,
        "mode_instruments": analyze_modeinstruments,
        "instrumental_color": analyze_instrumental_color_by_decade,
        "type_sequences": analyze_type_sequences,
        "choral_position": analyze_choral_position,
        "form_distribution": analyze_form_distribution,
    }

    if "all" in args.analysis:
        selected = list(available.keys())
    else:
        selected = [name for name in args.analysis if name in available]

    for name in selected:
        print(f"\n=== Running analysis: {name} ===")
        available[name](df)


if __name__ == "__main__":
    main()
