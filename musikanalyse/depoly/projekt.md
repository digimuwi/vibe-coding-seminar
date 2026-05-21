---
titel: depoly – Intavolierungs-Studie
studierende: Niels Pfeffer
typ: sonstiges
---
Ein Python-Skript, das einen **mehrstimmigen Vokalsatz** automatisch in ein
**Studien-Layout für die Intavolierung** umwandelt. Oben entsteht ein
Klavierauszug (alle Stimmen, in Originaldauern), darunter eine einzelne
**Lauten-/Theorben-Stimme** in Intavolierungs-Manier.

- Jeder Ton wird **einmal angeschlagen** und klingt bis zum nächsten Einsatz – wie eine gezupfte Saite
- Anders als `chordify`: eine lange Note wird **abgeschnitten**, sobald darunter etwas Neues erklingt
- Liest **LilyPond**, **MusicXML** und **MuseScore**-Dateien (mit `music21`)
- Entstanden bei der Arbeit an Victoria-Motetten (Projektordner `olivetis`)

> Beispielprojekt zum Anschauen. Eine Beispiel-Vorlage liegt als
> `In monte oliveti.mscz` bei. Bedienung und Optionen stehen in `README.md`.
