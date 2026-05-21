---
titel: Graupner Metadatenanalyse
studierende: Rolf-Oliver Bickel
typ: python
start: graupner_analysis.py
---
Dieses Projekt analysiert die Metadaten der Graupner-Kantaten aus der CSV-Datei `Graupner-Saetze_berechnet.CSV`.

Es enthält Python-Skripte zur Auswertung von Satzarten, Besetzung, Meterskala, Tonartverteilung und Instrumentation sowie automatisch erzeugte Plot-Ausgaben.

## Inhalte

- `graupner_analysis.py` – zentrales Analyse-Skript
- `requirements.txt` – benötigte Python-Pakete
- `plots/` – erzeugte Diagramme und Tabellen

## Verwendung

1. Wechsle in den Ordner `vibe-coding-seminar/musikanalyse/graupner`
2. Installiere die Abhängigkeiten:
   ```bash
   pip install -r requirements.txt
   ```
3. Führe das Skript aus:
   ```bash
   python graupner_analysis.py --csv "../../../../Graupner-Saetze_berechnet.CSV" --analysis all
   ```

## Analysen

Das Projekt bietet Analysen zu:

- Meterverteilung und Trends
- Recitativtypen
- Instrumentationskomplexität
- Tonartverteilungen nach Saison
- Mollpassionen
- Satzsequenzen
- Choralpositionen
- Formverteilungen

## Offene Angaben

- `typ` ist als `python` gesetzt. Wenn du eine andere Kategorie bevorzugst (z. B. `datenanalyse`, `wissenschaft` oder `projekt`), sag mir bitte Bescheid.
- Wenn du einen präziseren Projekttitel oder eine ausführlichere Kurzbeschreibung möchtest, ergänze ich das gerne.
