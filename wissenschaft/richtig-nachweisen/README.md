# richtig-nachweisen

Dieses Projekt stellt eine lokale Web-Anwendung bereit, mit der eine wissenschaftliche Arbeit im ODT-Format überarbeitet werden kann.

## Funktion

- ODT-Datei hochladen
- Fußnoten auf ein einheitliches Format bringen
- Ein Quellen- und Literaturverzeichnis im Kapitel „Quellen- und Literaturverzeichnis“ ergänzen
- Überarbeitete Datei als Download anbieten
- Kurze Übersicht der vorgenommenen Korrekturen ausgeben

## Regeln

Die Anwendung arbeitet mit einem einfachen Regelwerk, das die Unterscheidung zwischen Quellen und Literatur abbildet:

- Quellen sind Primärquellen wie Archivstücke, Quelleneditionen, Interviews, handschriftliche Zeugnisse, Tonaufnahmen oder Dokumente.
- Literatur sind Sekundärliteratur wie Monographien, Aufsätze, Dissertationen, Biographien oder wissenschaftliche Studien.
- Bei Widersprüchen zwischen verschiedenen Erläuterungen gilt die Handleitung als maßgeblich.

## Starten

1. In dieses Verzeichnis wechseln.
2. Python starten: `python server.py`
3. Im Browser die Adresse `http://127.0.0.1:8000/` öffnen.
