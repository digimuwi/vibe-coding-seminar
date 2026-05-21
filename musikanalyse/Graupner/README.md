# Graupner-Analyse

Dieses Projekt enthält erste Python-Programme zur Auswertung der Metadaten aus der CSV-Datei `Graupner-Saetze_berechnet.CSV`.

## Inhalte

- `graupner_analysis.py` – zentrales Skript zur Analyse und Visualisierung
- `requirements.txt` – benötigte Python-Pakete
- `plots/` – Ausgabeordner für automatisch erstellte Diagramme und Tabellen

## Verwendung

1. Wechsle in den Ordner `vibe-coding-seminar/musikanalyse/Graupner`
2. Installiere Abhängigkeiten:
   ```bash
   pip install -r requirements.txt
   ```
3. Führe das Skript aus:
   ```bash
   python graupner_analysis.py --csv "../../../../Graupner-Saetze_berechnet.CSV" --analysis all
   ```

## Verfügbare Analysen

- `meter_trends`
- `recitative_types`
- `instrumentation_complexity`
- `tonart_saison`
- `d_dur_ostern`
- `minor_passion`
- `meter_saison`
- `vocal_distribution`
- `mode_instruments`
- `instrumental_color`
- `type_sequences`
- `choral_position`
- `form_distribution`

## Zusätzliche Auswertungsideen

- Instrumentenkorrelationen: Analyse, welche Instrumente häufig gemeinsam auftreten
- Werkgrößenverteilung: Anzahl der Sätze pro Werk und typische Satzfolgen
- Tonartverlauf innerhalb einzelner Werke
- Anteil von `aria`-Formen gegenüber `choral`/`coro` nach Jahrzehnt
- Analyse der Besetzungssprache: Soprane vs. Bässe, begleitete vs. soloartige Kombinationen
