---
titel: richtig nachweisen – Nachweisprüfung für wissenschaftliche Arbeiten
studierende: Niels Pfeffer
typ: web
start: index.html
---
Ein **Claude-Code-„Skill"**, der eine fertige oder halbfertige wissenschaftliche
Arbeit (`.docx`, `.odt`, LaTeX) auf **korrekte Nachweise** prüft: Fußnoten,
In-Text-Belege sowie Quellen- und Literaturverzeichnis. Statt Zitierregeln zu
erfinden, wendet er ein hinterlegtes Regelwerk an (Tübinger Handleitung B +
Gardner/Springfeld + Kursunterlagen) und gleicht Autor:innen, Titel und
Erscheinungsjahr zusätzlich gegen die **Bibliographie des Musikschrifttums (BMS)**
ab – eine freie Musik-Bibliografie-API.

Das Ergebnis ist ein **durchklickbarer Bericht**, in dem jeder Korrekturvorschlag
einzeln angenommen oder abgelehnt werden kann (Ist rot ↔ Soll grün, mit Regel-Beleg
und – bei Bibliografie-Abgleichen – dem gefundenen BMS-Satz). Die angenommenen
Korrekturen kommen als **Änderungsverfolgung + Kommentar** zurück ins Dokument.

- **App öffnen** zeigt einen echten Beispiel-Bericht (fiktive Telemann-Arbeit) zum Durchklicken
- prüft **Form** (Kurz-/Erstbeleg, `ebd.`, Titelkursivierung, Interpunktion) und **Sache** (BMS-Abgleich)
- erfindet nie eine Angabe: offene Fragen werden markiert, nicht ausgefüllt
- die eigentliche Anleitung für Claude steht in `SKILL.md`, das Regelwerk in `unterlagen/rules.md`
