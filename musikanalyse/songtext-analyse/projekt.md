---
titel: Songtext-Analyse
studierende: TODO Name eintragen
typ: web
start: index.html
---
Quantitative Analyse von Songtexten: Eingabe eines Worts oder einer Phrase,
Auswertung als Säulendiagramm. Filter nach Künstler, Album und Zeitraum.

- Künstler-Filter: Säulen pro Album, darunter Aufschlüsselung je Lied
- Album-Filter: Säulen pro Lied, Button öffnet den Volltext mit markierten Treffern
- Zeitraum-Filter: Säulen pro Jahr, Button listet die berücksichtigten Lieder

Daten werden live geladen: Discographie aus
[MusicBrainz](https://musicbrainz.org/), Songtexte aus
[lyrics.ovh](https://lyricsovh.docs.apiary.io/). Künstler werden im Browser
zwischengespeichert (localStorage).
