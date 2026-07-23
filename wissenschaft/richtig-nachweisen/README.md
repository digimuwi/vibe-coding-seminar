# richtig nachweisen

Ein **Claude-Code-Skill**, der wissenschaftliche Arbeiten auf **korrekte Nachweise**
prüft – Fußnoten, In-Text-Belege sowie Quellen- und Literaturverzeichnis – und
begründete, einzeln annehmbare Korrekturen zurück ins Dokument schreibt.

Der Skill *erfindet keine Zitierregeln*. Er wendet ein hinterlegtes Regelwerk an
(`unterlagen/rules.md`), das die **Tübinger Handleitung B**, Gardner/Springfelds
*Musikwissenschaftliches Arbeiten* und die Kursunterlagen zusammenführt. Bei
Widersprüchen ist die Handleitung B maßgeblich. Jede Korrektur trägt die Regel-ID
und das wörtliche Regelzitat mit, auf das sie sich stützt.

## Was er prüft

- **Form** gegen das Regelwerk: Erst- vs. Kurzbeleg, `ebd.`/`a.a.O.`, Titelkursivierung,
  Ort/Jahr, Seitenzahl-Notation, Interpunktion, geschützte Leerzeichen.
- **Querbezüge**: Steht jeder in Fußnoten zitierte Titel im richtigen Verzeichnis
  (und keine Waisen)? Wird ein Werk durchgängig gleich benannt?
- **Sache** gegen die **Bibliographie des Musikschrifttums (BMS)**: Ist ein Autorname
  falsch geschrieben, ein Titel verdreht, ein Erscheinungsjahr vertauscht? Der Abgleich
  läuft über die freie SRU-Schnittstelle von `musikbibliographie.de` (kein Login, kein
  VPN). BMS ist ein *Plausibilitätsabgleich*: Abweichungen sind Warnungen mit Beleg –
  ein anderes Jahr kann eine legitime Auflage sein –, die Entscheidung trifft der Mensch.

## Ergebnis

Ein **durchklickbarer HTML-Bericht** (weißes, ruhiges Layout). Jede Karte zeigt Ort,
Regel-Badge, **Ist** (rot, durchgestrichen) ↔ **Soll** (grün), eine Begründung in
Klartext und die Knöpfe *Annehmen · Ablehnen* (Tastatur: `j/k/a/r/u`). Bei
BMS-Befunden erscheint zusätzlich der gefundene Bibliografie-Satz mit PPN und Link.
Die angenommenen Fixes werden anschließend als **Änderungsverfolgung + Kommentar**
(mit Regel-ID) ins Dokument geschrieben – das finale Annehmen bleibt beim Menschen.

## App öffnen

Die `index.html` zeigt ein **kurzes Beispiel-Video** (ca. 15 s): ein echter Lauf des
Skills über eine Hausarbeit zu Christoph Graupner – erst die Prüfung im Terminal
(Regelwerk laden, Nachweise extrahieren, BMS-Abgleich), dann ein Scroll durch den
fertigen, durchklickbaren Bericht mit seinen 13 Befunden.

## Pipeline (im echten Lauf)

```
1 Einlesen     docx / odt / LaTeX  →  Volltext + Rohstruktur
2 Extrahieren  alle Nachweise (Fußnoten, In-Text, Verzeichnisse)
3 Prüfen       Form gegen rules.md  +  Sachabgleich gegen BMS
4 Bericht      durchklickbares Artifact: annehmen / ablehnen
5 Rückgabe     angenommene Fixes als Änderungsverfolgung + Kommentar ins Dokument
```

## Installation als Claude-Code-Skill

```bash
# in den Skills-Ordner kopieren
cp -r wissenschaft/richtig-nachweisen ~/.claude/skills/richtig-nachweisen
```

Aufruf in Claude Code: `/richtig-nachweisen <datei>`. Der Skill braucht Internet für
den (optionalen) BMS-Abgleich; die API ist frei zugänglich. Details für Claude stehen
in `SKILL.md`.

## Dateien

| Datei | Zweck |
|---|---|
| `SKILL.md` | Anleitung für Claude (die eigentliche Skill-Definition) |
| `index.html` | Video-Seite mit dem Beispiellauf („App öffnen") |
| `demo.mp4` | das Beispiel-Video (Graupner-Lauf: Terminal → Bericht) |
| `assets/report-template.html` | Vorlage für den durchklickbaren Bericht |
| `assets/bms_lookup.py` | BMS-SRU-Helfer (Python-Standardbibliothek, kein `pip` nötig) |
| `unterlagen/rules.md` | **das Regelwerk** – einzige Quelle der Wahrheit für „richtig" |
| `unterlagen/HANDOFF_bms_api.md` | Vertrag der BMS-API (Endpunkte, Indizes, Schemata) |
