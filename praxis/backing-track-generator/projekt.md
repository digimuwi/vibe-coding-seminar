---
titel: Backing Track Generator
studierende: (anonym)
typ: sonstiges
---
Eine Windows-App zum direkt Drauflosspielen – ähnlich iReal Pro, aber ohne
Eingabehürde: Tonart wählen, generieren, Play drücken. Die Akkordfolgen folgen
der **Funktionsharmonik** (nach [lehrklaenge.de](https://www.lehrklaenge.de/))
und der Jazz-Harmonielehre von Frank Sikora; ein „Jazz-Gesetz“-Regler bestimmt,
wie streng sich der Generator an die Lehre hält – von klassisch streng über
Zwischendominanten, Tritonussubstitution und Modal Interchange bis outside.

- Tonart (alle 12), Dur/Moll, Form: 12/16 Takte oder Blues-Schema
- 7 Begleitstile (Swing mit Walking Bass, Shuffle, Blues, Bossa, Pop, Funk,
  Ballade), Band einzeln (de)aktivierbar, Intro/Ending, Vorzähler
- Jeder Takt editierbar: Extensions (6/7/9/11/13), sus4, halbtaktige II-V,
  Rechtsklick würfelt neu – unter jedem Akkord steht die Analyse laut Harmonielehre
- Oberfläche wie ein analoges Mischpult: Dreh-Potis, flackernde
  Segment-Displays, VU-Meter – plus versteckter 8-Bit-Modus
- Schemata speichern/laden und als **MIDI-Datei exportieren**

Bauen ohne jede Installation (nutzt den in Windows enthaltenen C#-Compiler):
`build.cmd` ausführen, fertig ist `bin\BackingTrackGenerator.exe`. Details und
Bedienung in der [README](README.md).
