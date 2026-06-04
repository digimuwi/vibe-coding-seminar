import argparse
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib.pyplot as plt
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[3]
EXPANDED_CSV = Path(__file__).resolve().parent / "Graupner-Besetzung-expanded.csv"
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
    encoding = "utf-8-sig" if path.name == EXPANDED_CSV.name else "cp1252"
    df = pd.read_csv(path, sep=";", dtype=str, keep_default_na=False, encoding=encoding)
    df.columns = [col.lstrip("\ufeff").strip() for col in df.columns]
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
    if "MeterCategory" not in df.columns:
        df["MeterCategory"] = df["Meter"].apply(categorize_meter)
    if "VoiceCounts" not in df.columns or "InstrumentCounts" not in df.columns:
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


def get_voice_columns(df: pd.DataFrame) -> list[str]:
    return sorted(c for c in df.columns if re.fullmatch(r"[SATB]+", c))


def get_meter_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in ["2er", "3er", "4er", "6er", "9er", "12er", "Sonstiges"] if c in df.columns]


def get_instrument_columns(df: pd.DataFrame) -> list[str]:
    standard = {
        "Werk",
        "Satznr",
        "Typ",
        "Besetzung",
        "Tonart",
        "Takt",
        "Meter",
        "Jahr",
        "Zeit",
        "Saison",
        "Jahrzehnt",
        "MeterCategory",
        "VoiceCounts",
        "InstrumentCounts",
        "VoiceTotal",
        "InstrumentTotal",
        "ChoralPosition",
    }
    standard.update(get_voice_columns(df))
    standard.update(get_meter_columns(df))
    return sorted(c for c in df.columns if c not in standard)


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
    percentage = table.div(table.sum(axis=1), axis=0).fillna(0)
    print("\nMeter categories by decade:\n", table)
    print("\nMeter category share by decade:\n", percentage)
    csv_path = PLOTS_DIR / "meter_categories_by_decade.csv"
    table.to_csv(csv_path)
    print(f"Saved meter categories by decade: {csv_path}")
    percent_csv_path = PLOTS_DIR / "meter_categories_by_decade_percent.csv"
    percentage.to_csv(percent_csv_path)
    print(f"Saved meter category share by decade: {percent_csv_path}")
    fig = table.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
    fig.suptitle("Meter categories by decade")
    save_figure(fig, "meter_categories_by_decade")
    fig2 = percentage.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
    fig2.suptitle("Meter category share by decade")
    fig2.axes[0].set_ylabel("Share of decade")
    save_figure(fig2, "meter_categories_by_decade_percent")


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
    percentage = table.div(table.sum(axis=1), axis=0).fillna(0)
    print("\nTonart distribution by season (relative share):\n", percentage)

    csv_path = PLOTS_DIR / "tonart_by_season.csv"
    table.to_csv(csv_path)
    print(f"Saved season-tonart table: {csv_path}")
    percent_csv_path = PLOTS_DIR / "tonart_by_season_percent.csv"
    percentage.to_csv(percent_csv_path)
    print(f"Saved season-tonart percent table: {percent_csv_path}")

    fig = table.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
    fig.suptitle("Tonart distribution by season")
    save_figure(fig, "tonart_by_season")

    fig2 = percentage.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
    fig2.suptitle("Tonart distribution by season (relative share)")
    fig2.axes[0].set_ylabel("Share of season")
    save_figure(fig2, "tonart_by_season_percent")


def analyze_d_dur_ostern(df: pd.DataFrame) -> None:
    measurement = df[df["Tonart"] == "D"].groupby("Saison").size()
    total_by_season = df.groupby("Saison").size()
    ratio = (measurement / total_by_season).fillna(0).sort_values(ascending=False)
    print("\nD-Dur ratio by season:\n", ratio)
    if not ratio.empty:
        fig = ratio.plot(kind="bar", figsize=(10, 6)).get_figure()
        fig.suptitle("D-Dur ratio by season")
        save_figure(fig, "d_dur_ratio_by_season")


def analyze_minor_in_passion(df: pd.DataFrame) -> None:
    minor = df["Tonart"].str.islower()
    table = pd.crosstab(df["Saison"], minor)
    percentage = table.div(table.sum(axis=1), axis=0).fillna(0)
    print("\nMinor-key frequency by season (False = major, True = minor):\n", table)
    print("\nMinor-key share by season:\n", percentage)
    if not table.empty:
        fig = table.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
        fig.suptitle("Minor-key frequency by season")
        save_figure(fig, "minor_key_by_season")

        fig2 = percentage.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
        fig2.suptitle("Minor-key share by season")
        fig2.axes[0].set_ylabel("Share of season")
        save_figure(fig2, "minor_key_by_season_percent")


def analyze_meter_saison_correlation(df: pd.DataFrame) -> None:
    corr = pd.crosstab(df["Saison"], df["MeterCategory"])
    percentage = corr.div(corr.sum(axis=1), axis=0).fillna(0)
    print("\nSeason vs meter category:\n", corr)
    print("\nSeason vs meter category share:\n", percentage)
    csv_path = PLOTS_DIR / "meter_category_by_season.csv"
    corr.to_csv(csv_path)
    print(f"Saved meter categories by season: {csv_path}")
    percent_csv_path = PLOTS_DIR / "meter_category_by_season_percent.csv"
    percentage.to_csv(percent_csv_path)
    print(f"Saved meter category share by season: {percent_csv_path}")
    fig = corr.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
    fig.suptitle("Meter categories by season")
    save_figure(fig, "meter_category_by_season")
    fig2 = percentage.plot(kind="bar", stacked=True, figsize=(12, 6)).get_figure()
    fig2.suptitle("Meter category share by season")
    fig2.axes[0].set_ylabel("Share of season")
    save_figure(fig2, "meter_category_by_season_percent")


def analyze_takt_categories(df: pd.DataFrame) -> None:
    meter_cols = get_meter_columns(df)
    if not meter_cols:
        print("No takt category columns found in this dataset.")
        return
    counts_by_decade = df.groupby("Jahrzehnt")[meter_cols].apply(
        lambda group: group.astype(str).apply(lambda col: col.str.strip().str.lower().eq("x").sum())
    ).fillna(0).astype(int)
    total_by_decade = df.groupby("Jahrzehnt").size()
    percentage_by_decade = counts_by_decade.div(total_by_decade, axis=0).fillna(0)

    print("\nTakt category counts by decade:\n", counts_by_decade)
    print("\nTakt category share by decade (relative to decade total):\n", percentage_by_decade)

    csv_path = PLOTS_DIR / "takt_categories_by_decade.csv"
    counts_by_decade.to_csv(csv_path)
    print(f"Saved takt category counts by decade: {csv_path}")
    percent_csv_path = PLOTS_DIR / "takt_categories_by_decade_percent.csv"
    percentage_by_decade.to_csv(percent_csv_path)
    print(f"Saved takt category percent by decade: {percent_csv_path}")

    fig = counts_by_decade.plot(kind="bar", stacked=True, figsize=(14, 8)).get_figure()
    fig.suptitle("Taktarten nach Jahrzehnt (absolute Zahlen)")
    fig.axes[0].set_ylabel("Anzahl")
    save_figure(fig, "takt_categories_by_decade")

    fig2 = percentage_by_decade.plot(kind="bar", stacked=True, figsize=(14, 8)).get_figure()
    fig2.suptitle("Taktarten nach Jahrzehnt (relative Anteile)")
    fig2.axes[0].set_ylabel("Anteil am Jahrzehnt")
    save_figure(fig2, "takt_categories_by_decade_percent")


def analyze_vocal_distribution(df: pd.DataFrame) -> None:
    aria_df = df[df["Typ"].str.contains("aria", na=False)]
    voice_cols = get_voice_columns(df)
    if voice_cols:
        counts = pd.Series({
            col: int(aria_df[col].astype(str).str.strip().str.lower().eq("x").sum())
            for col in voice_cols
        })
        percentage = counts.div(counts.sum()).fillna(0)
        print("\nVocal distribution in arias (expanded tags):\n", counts)
        print("\nVocal distribution in arias (relative share):\n", percentage)
        csv_path = PLOTS_DIR / "vocal_distribution.csv"
        counts.to_csv(csv_path)
        print(f"Saved vocal distribution counts: {csv_path}")
        percent_csv_path = PLOTS_DIR / "vocal_distribution_percent.csv"
        percentage.to_csv(percent_csv_path)
        print(f"Saved vocal distribution percent: {percent_csv_path}")
        fig = counts.plot(kind="bar", figsize=(12, 6)).get_figure()
        fig.suptitle("Vocal distribution in arias")
        save_figure(fig, "vocal_distribution")
        fig2 = percentage.plot(kind="bar", figsize=(12, 6)).get_figure()
        fig2.suptitle("Vocal distribution share in arias")
        fig2.axes[0].set_ylabel("Share of arias")
        save_figure(fig2, "vocal_distribution_percent")
        return
    voice_totals = Counter()
    for counts in aria_df["VoiceCounts"]:
        voice_totals.update(counts)
    total = sum(voice_totals.values())
    distribution = {voice: count / total for voice, count in voice_totals.items()} if total else {}
    print("\nVocal distribution in arias:\n", voice_totals)
    print("\nVocal share in arias:\n", distribution)


def analyze_modeinstruments(df: pd.DataFrame) -> None:
    instrument_cols = ["chalumeau", "oboe d'amore", "viola d'amore"]
    data = {}
    for label in instrument_cols:
        if label in df.columns:
            series = df[df[label].str.lower() == "x"].groupby("Jahrzehnt").size()
            data[label] = series
        else:
            data[label] = pd.Series(dtype=int)
    if data:
        summary = pd.DataFrame(data).fillna(0).astype(int)
        total_by_decade = df.groupby("Jahrzehnt").size()
        percentage = summary.div(total_by_decade, axis=0).fillna(0)
        print("\nMode instruments by decade:\n", summary)
        print("\nMode instruments share by decade:\n", percentage)
        fig = summary.plot(kind="bar", figsize=(12, 6)).get_figure()
        fig.suptitle("Mode instruments by decade")
        save_figure(fig, "mode_instruments_by_decade")
        percent_csv_path = PLOTS_DIR / "mode_instruments_by_decade_percent.csv"
        percentage.to_csv(percent_csv_path)
        print(f"Saved mode instruments share by decade: {percent_csv_path}")
        fig2 = percentage.plot(kind="bar", figsize=(12, 6)).get_figure()
        fig2.suptitle("Mode instruments share by decade")
        fig2.axes[0].set_ylabel("Share of decade")
        save_figure(fig2, "mode_instruments_by_decade_percent")
    else:
        print("No mode instrument columns found.")


def analyze_instrumental_color_by_decade(df: pd.DataFrame) -> None:
    instrument_names = ["oboe d'amore", "viola d'amore"]
    totals = df.groupby("Jahrzehnt").size()
    for name in instrument_names:
        if name in df.columns:
            counts = df[df[name].str.lower() == "x"].groupby("Jahrzehnt").size()
            counts = counts.reindex(totals.index, fill_value=0)
            percentage = counts.div(totals).fillna(0)
            print(f"\n{name} by decade:\n", counts)
            print(f"\n{name} share by decade:\n", percentage)
            csv_path = PLOTS_DIR / f"{name.replace(' ', '_').replace("'", '')}_by_decade.csv"
            counts.to_csv(csv_path)
            print(f"Saved {name} counts by decade: {csv_path}")
            percent_csv_path = PLOTS_DIR / f"{name.replace(' ', '_').replace("'", '')}_by_decade_percent.csv"
            percentage.to_csv(percent_csv_path)
            print(f"Saved {name} share by decade: {percent_csv_path}")
            if not counts.empty:
                fig = counts.plot(kind="bar", figsize=(10, 6)).get_figure()
                fig.suptitle(f"{name} by decade")
                save_figure(fig, name.replace(" ", "_").replace("'", "") + "_by_decade")
                fig2 = percentage.plot(kind="bar", figsize=(10, 6)).get_figure()
                fig2.suptitle(f"{name} share by decade")
                fig2.axes[0].set_ylabel("Share of decade")
                save_figure(fig2, name.replace(" ", "_").replace("'", "") + "_by_decade_percent")
        else:
            print(f"Column '{name}' not found in dataset.")


def analyze_instrument_usage(df: pd.DataFrame) -> None:
    inst_cols = get_instrument_columns(df)
    if not inst_cols:
        print("No instrument columns found in this dataset.")
        return
    counts = pd.Series({
        col: int(df[col].astype(str).str.strip().str.lower().eq("x").sum())
        for col in inst_cols
    }).sort_values(ascending=False)
    percentage = counts.div(counts.sum()).fillna(0)
    print("\nInstrument usage counts:\n", counts)
    print("\nInstrument usage share:\n", percentage)
    csv_path = PLOTS_DIR / "instrument_usage.csv"
    counts.to_csv(csv_path)
    print(f"Saved instrument usage counts: {csv_path}")
    percent_csv_path = PLOTS_DIR / "instrument_usage_percent.csv"
    percentage.to_csv(percent_csv_path)
    print(f"Saved instrument usage percent: {percent_csv_path}")
    fig = counts.head(20).plot(kind="bar", figsize=(14, 6)).get_figure()
    fig.suptitle("Instrument usage in expanded CSV")
    save_figure(fig, "instrument_usage")
    fig2 = percentage.head(20).plot(kind="bar", figsize=(14, 6)).get_figure()
    fig2.suptitle("Instrument usage share in expanded CSV")
    fig2.axes[0].set_ylabel("Share of all instrument mentions")
    save_figure(fig2, "instrument_usage_percent")


def analyze_type_sequences(df: pd.DataFrame) -> None:
    # Build type sequence per Werk
    grouped = (
        df.sort_values(["Werk", "Satznr"])
        .groupby("Werk")["Typ"]
        .apply(lambda series: " > ".join(series.dropna().astype(str)))
    )
    # Add Jahrzehnt info per Werk
    work_decade = df.groupby("Werk")["Jahrzehnt"].first()
    
    # Count all sequences
    freq = grouped.value_counts()
    total_works = len(grouped)
    percentage = (freq / total_works * 100).round(2)
    
    # Create output table
    seq_table = pd.DataFrame({
        "count": freq,
        "percent": percentage
    })
    seq_table = seq_table.sort_values("count", ascending=False)
    
    print("\nAll type sequences (top 30):\n", seq_table.head(30).to_string())
    print(f"\nTotal unique sequences: {len(seq_table)}")
    print(f"Total works: {total_works}")
    
    # Save full sequence table
    csv_path = PLOTS_DIR / "type_sequences_all.csv"
    seq_table.to_csv(csv_path)
    print(f"Saved all type sequences: {csv_path}")
    
    # Plot top 30
    fig = freq.head(30).plot(kind="bar", figsize=(14, 8)).get_figure()
    fig.suptitle("Most frequent type sequences by work (top 30)")
    save_figure(fig, "type_sequences_by_work")
    
    # Analyze by Jahrzehnt
    print("\n=== Sequences by decade ===")
    decade_seq = pd.DataFrame({
        "sequence": grouped,
        "decade": work_decade
    })
    
    for decade in sorted(decade_seq["decade"].unique(), key=str):
        decade_works = decade_seq[decade_seq["decade"] == decade]["sequence"]
        decade_freq = decade_works.value_counts()
        decade_total = len(decade_works)
        print(f"\n{decade} (n={decade_total}):")
        top5 = decade_freq.head(5)
        for seq_name, count in top5.items():
            pct = (count / decade_total * 100)
            print(f"  {seq_name}: {count} ({pct:.1f}%)")


def analyze_choral_position(df: pd.DataFrame) -> None:
    positions = df[df["Typ"] == "choral"].groupby("Werk")["Satznr"].agg(["min", "max"])
    if positions.empty:
        print("No chorale positions found.")
        return
    print("\nChorale positions by work:\n", positions)
    by_position = df[df["Typ"] == "choral"].groupby("ChoralPosition").size()
    percentage = by_position.div(by_position.sum()).fillna(0)
    print("\nChoral position summary:\n", by_position)
    print("\nChoral position share:\n", percentage)
    csv_path = PLOTS_DIR / "choral_position_summary.csv"
    by_position.to_csv(csv_path)
    print(f"Saved choral position summary: {csv_path}")
    percent_csv_path = PLOTS_DIR / "choral_position_summary_percent.csv"
    percentage.to_csv(percent_csv_path)
    print(f"Saved choral position share: {percent_csv_path}")
    if not by_position.empty:
        fig = by_position.plot(kind="bar", figsize=(8, 6)).get_figure()
        fig.suptitle("Chorale position summary")
        save_figure(fig, "choral_position_summary")
        fig2 = percentage.plot(kind="bar", figsize=(8, 6)).get_figure()
        fig2.suptitle("Chorale position share")
        fig2.axes[0].set_ylabel("Share of chorals")
        save_figure(fig2, "choral_position_summary_percent")


def analyze_form_distribution(df: pd.DataFrame) -> None:
    table = df["Typ"].value_counts()
    percentage = table.div(table.sum()).fillna(0)
    print("\nType distribution:\n", table)
    print("\nType distribution share:\n", percentage)
    csv_path = PLOTS_DIR / "type_distribution.csv"
    table.to_csv(csv_path)
    print(f"Saved type distribution counts: {csv_path}")
    percent_csv_path = PLOTS_DIR / "type_distribution_percent.csv"
    percentage.to_csv(percent_csv_path)
    print(f"Saved type distribution percent: {percent_csv_path}")
    fig = table.plot(kind="bar", figsize=(10, 6)).get_figure()
    fig.suptitle("Satztyp-Verteilung")
    save_figure(fig, "type_distribution")
    fig2 = percentage.plot(kind="bar", figsize=(10, 6)).get_figure()
    fig2.suptitle("Satztyp share")
    fig2.axes[0].set_ylabel("Share of all works")
    save_figure(fig2, "type_distribution_percent")


def main() -> None:
    parser = argparse.ArgumentParser(description="Graupner Kantaten Metadaten-Analyse")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Pfad zur CSV-Datei")
    parser.add_argument("--analysis", nargs="*", default=["all"], help="Welche Analysen ausführen")
    args = parser.parse_args()

    if args.csv == DEFAULT_CSV and EXPANDED_CSV.exists():
        print(f"Using expanded intermediate CSV: {EXPANDED_CSV}")
        args.csv = EXPANDED_CSV

    df = load_data(args.csv)
    available = {
        "meter_trends": analyze_meter_trends,
        "recitative_types": analyze_recitative_types,
        "instrumentation_complexity": analyze_instrumentation_complexity,
        "tonart_saison": analyze_tonart_saison,
        "d_dur_ostern": analyze_d_dur_ostern,
        "minor_passion": analyze_minor_in_passion,
        "meter_saison": analyze_meter_saison_correlation,
        "takt_categories": analyze_takt_categories,
        "vocal_distribution": analyze_vocal_distribution,
        "mode_instruments": analyze_modeinstruments,
        "instrument_usage": analyze_instrument_usage,
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
