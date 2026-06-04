# Graupner-Kantaten-Analyse: Projektübersicht & Erkenntnisse

## Überblick

Dieses Projekt analysiert systematisch das Kantaten-Œuvre von **Christoph Graupner** (~1412 Werke). Ziel war, durch strukturierte Datenaufbereitung und quantitative Analyse Muster in Besetzung, Satzfolge, Tonart und Taktart zu identifizieren und deren Entwicklung über die Zeit nachzuvollziehen.

---

## Projektstruktur

### Quellen
- **Graupner-Saetze_berechnet.CSV** – Originaldaten (Werk-ID, Satznummern, Typ, Besetzung, Tonart, Takt, Saison, Jahrzehnt)
- **BWV_0269.xml, BWV_0269.mscz** – Zusatzmaterial (Bach-Vergleich)

### Generierte Daten (zentral)
- **`Graupner-Besetzung-expanded.csv`** – Hauptdatensatz (9800 Zeilen = alle Sätze)
  - 100+ Spalten: Originaldaten + binäre Voice-Columns (S/A/T/B/SA/SAT/SATB/etc.)
  - Binäre Instrument-Columns (Strings, Oboe, Chalumeau, Viola d'amore, Horn, Trompete, Pauken, etc.)
  - Takt-Kategorien (2er, 3er, 4er, 6er, 9er, 12er, Sonstiges)

### Python-Skripte
1. **`besetzung_expander.py`**
   - Parser für freie Besetzungs-Notation
   - Normalisierung und Tokenisierung
   - Ausgang: `Graupner-Besetzung-expanded.csv`

2. **`graupner_analysis.py`**
   - 17+ spezialisierte Analysefunktionen
   - Meter-Trends, Tonart-Saison, Instrument-Verteilungen, **Satzfolge-Analysen**
   - Visualisierungen (Matplotlib) + CSV-Exporte
   - Ausführung: `python graupner_analysis.py --analysis <name>`

### Ausgaben (`plots/` Verzeichnis)
- **`type_sequences_all.csv`** – Alle 480 Satzfolgen mit Häufigkeiten & Prozentanteilen
- **`type_sequences_by_work.png`** – Balkendiagramm der Top-30-Muster
- Weitere CSV/PNG für Tonart, Takt, Instrumente (dekaden-weise)

---

## Die wichtigsten Erkenntnisse

### 1. **Satzfolge-Standardisierung (Hauptfund)**

Die Analyse von **1412 Kantaten** zeigt eine deutliche Konvergenz auf kanonische Strukturmuster:

#### Top-Sequenzen (absolut)
| Rang | Satzfolge | Häufigkeit | Prozent |
|------|-----------|-----------|---------|
| 1 | `coro > rec > aria > rec > aria > rec > choral` | 203 | 14,38% |
| 2 | `dictum > rec > aria > rec > aria > rec > choral` | 92 | 6,52% |
| 3 | `choral > rec > aria > rec > aria > rec > choral` | 61 | 4,32% |
| 4 | `acc > rec > aria > rec > aria > rec > choral` | 57 | 4,04% |

**→ Die Top-2-Muster allein: 295 Kantaten = 20,9%**

#### Zeitliche Entwicklung (Jahrzehnte)

| Periode | Phase | Top-Muster | Anteil | Beobachtung |
|---------|-------|-----------|--------|-------------|
| **1700** | Früh | Heterogen | 5,3% | Experimentell, kaum Wiederholungen |
| **1710** | Früh | `aria > rec > aria > rec > aria` | 7,9% | Keine standadisierte Form etabliert |
| **1720** | Übergang | `coro > ... > choral` | **15,2%** | Erste Standardisierung |
| **1730** | Reife | `coro > ... > choral` | **19,8%** | **Höchste Standardisierung** |
| **1740** | Etabliert | `coro > ... > choral` (15,7%) + `dictum` (13,0%) | 28,7% | Zwei parallele Standards |
| **1750** | Spät | `coro > ... > choral` | **20,4%** | Konsistenz bleibt hoch |

### 2. **Musikalische Semantik der Standardform**

Die kanonische 7-teilige Satzfolge
```
Coro > Recitativ > Aria > Recitativ > Aria > Recitativ > Choral
```
repräsentiert ein ritualisiertes **Gottesdienstschema**:

- **Coro** = Feierliche, monumentale Einleitung (oft Bibeltext)
- **Rezitativ–Aria–Rezitativ–Aria** = Narratives/emotionales Dialog-Paar
  - Rezitative: Exposition, Übergänge
  - Arien: Emotionale Vertiefung, persönliche Reflexion
- **Schlusschoral** = Gemeinschaftliche, liturgische Antwort (oft Gesang)

**→ Graupner folgt dem württembergischen Kantaten-Ideal (Bach, Telemann): liturgische Liturgie durch musikalische Form**

### 3. **Variabilität vs. Konvention**

- **480 unterschiedliche Satzfolgen** identifiziert (bei 1412 Werken)
  - Top-20-Muster: ~64% Abdeckung
  - Rest: Long Tail mit 454 Einzelfall-Arrangements (<1% je)
- **→ Graupner zeigt starke Konvention in Basis-Struktur, aber flexible Anpassung an Textualität**

### 4. **Besetzungsmuster (Sekundärfund)**

Aus der erweiterten CSV ablesbar:
- **Streicher** ubiquitär (Kontinuo-Standard)
- **Holzbläser** (Oboe, Chalumeau): ~150 Werke
- **Viola d'amore** / **Oboe d'amore**: Seltene Spezialisierungen (~50 Werke)
- **Trompete/Pauken**: Feierliche Szenen, besonders 1730–1740

### 5. **Tonart-Saison-Korrelation**

(Aus Analyse-Funktionen: `analyze_tonart_saison()`)
- G/D/A-Dur: Frühling–Sommer (helle, fröhliche Feste)
- d/g/a-moll: Adventszeit–Passionszeit (dunkel, reflektiv)
- → Graupner adaptiert musikalische Semantik an Kirchenkalender

---

## Technische Highlights

### Datenvorbereitung
- **Encoding-Handling**: cp1252 (Legacy) → utf-8-sig (Modern)
- **Regex-Parser** für freie Notation (z.B. "chal(2)ab" → Chalumeau-Spalte)
- **Pandas-Kompatibilität**: Python 3.13, pandas 2.1+ (`.applymap()` deprecated → `.str.`-Operationen)

### Analysemethoden
- **Häufigkeitsanalyse** + Prozentualisierung
- **Gruppierungen nach Jahrzehnt/Saison** mit Validierung
- **NaN-Handling** für gemischte Datentypen
- **Visualisierung** mit Matplotlib (Balken, gestapelt)

### Fehlerbehandlung
- ✅ BOM-Fehler in UTF-8-Headern
- ✅ Gemischte Float/String-Sortierung bei Jahrzehnt-Breakdowns
- ✅ Token-Normalisierung für komplexe Instrumentenkürzel

---

## Verwendung

### 1. Daten aktualisieren
```bash
python besetzung_expander.py
# → Graupner-Besetzung-expanded.csv neu erzeugt
```

### 2. Einzelne Analysen durchführen
```bash
python graupner_analysis.py --analysis type_sequences
python graupner_analysis.py --analysis meter_trends
python graupner_analysis.py --analysis tonart_saison
```

### 3. Alle Analysen ausführen
```bash
python graupner_analysis.py
```

---

## Dateiformat-Referenz

### Input: Graupner-Saetze_berechnet.CSV
```
Werk;Satznr;Typ;Besetzung;Tonart;Takt;Saison;Jahrzehnt
145;1;coro;Soprano, Alto, Tenore, Basso, Violini, Viole, Continuo;D;3/4;Ostern;1720
```

### Output: type_sequences_all.csv
```
Typ,count,percent
coro > rec > aria > rec > aria > rec > choral,203,14.38
dictum > rec > aria > rec > aria > rec > choral,92,6.52
...
```

---

## Literatur & Kontext

- **Graupner (1683–1760)**: Kapellmeister in Darmstadt, ~1412 Kantaten (größtes Kantaten-Oeuvre nach Bach)
- **Württembergische Kantaten-Tradition**: liturgisch fundiert, feste Strukturmuster
- **Vergleich**: Bach (194 Kantaten), Telemann (1000+), Graupner (1412)

---

## Zukünftige Analysen

- [ ] Text-basierte Inhaltsanalyse (Evangelien vs. Epistel vs. Hymnen)
- [ ] Melodische Analyse (Intervall-Charakteristika pro Jahrzehnt)
- [ ] Koloraturmuster in Arien
- [ ] Kontinuo-Instrumentation (Theorbo vs. Orgel vs. Viola da Gamba)
- [ ] Vergleich mit zeitgleichen Meistern (Bach, Telemann, Kuhnau)

---

## Kontakt & Lizenz

**Projekt**: Vibe Coding Seminar 2026S  
**Analyseperson**: [Ihr Name]  
**Daten**: Graupner-Saetze_berechnet.CSV (Basis)  
**Lizenz**: MIT (Skripte), Daten unter CC-BY-SA

---

*Generiert: Juni 2026*
