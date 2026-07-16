# Backing Track Generator

Ein Akkordschema-Generator zum direkt Drauflosspielen – Idee ähnlich iReal Pro,
aber ohne Eingabehürde: Tonart wählen, generieren, Play drücken.

Eigenständige Windows-App (WinForms, echte `.exe`), kein Browser, keine
Abhängigkeiten – der Sound kommt aus dem in Windows eingebauten GM-Synth (MIDI).

## Bauen & Starten

```
build.cmd          → bin\BackingTrackGenerator.exe
```

Genutzt wird der C#-Compiler, der in jedem Windows enthalten ist
(`%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`). Keine Installation nötig.
Achtung: Der Code muss C#-5-kompatibel bleiben (keine String-Interpolation usw.).

Selbsttest ohne Oberfläche: `BackingTrackGenerator.exe --smoke`
(schreibt `bin\smoke_out.txt`).

## Bedienung

- **Tonart** (alle 12), **Tongeschlecht** (Dur/Moll)
- **Form**: 12 Takte, 16 Takte oder **Blues (12)** – der Blues bringt je nach
  Reglerstand Quick Change, #IV°7, V7/ii und II-V-Turnarounds mit
- **Tempo** (live), **Stil**: Swing (Walking Bass, Ride), Shuffle (Boogie),
  Blues (triolischer 12/8-Puls, R-3-5-6-Bass), Bossa, Pop, Funk, Ballade – live umschaltbar
- **8-Bit** (Easter Egg): eigener Hebel, überstimmt Stil und Sounds – Chip-Arpeggios
  in Sechzehnteln, Oktav-Bass, Square-Leads. (Später: komplettes Retro-Skin.)
- **Regler**: **Synkopen** (Dichte/Offbeats der Begleitung), **Arpeggio**
  (gerollte Akkorde bis Dauer-Arpeggio, ab 80 im Pendel), **Bass-Aktivität**
  (halbe Noten bis Fills) – alle live, wirken auch im MIDI-Export
- **Besetzung**: Begleitinstrument wählbar (Piano, E-Piano, Orgel, Jazz-Gitarre,
  Vibraphon, Pad) oder **aus** – z. B. wenn man selbst Klavier spielt. Bass
  (Kontrabass, E-Bass, Fretless, Synth-Bass oder aus) und Drums (an/aus) ebenso.
- **Intro**: spielt die letzten 4 Takte der Form vorweg (Jazz-Konvention)
- **Ending**: Kadenz + gehaltener Schlussakkord mit Crash; braucht eine endliche
  **Chorus-Zahl** (∞, 1, 2, 3, 4, 8) – nach dem letzten Chorus endet die Wiedergabe
- **Vorzähler**: vier Klicks vor dem Einsatz (klickt auch bei Drums = aus)
- **Jazz-Gesetz** (0–100): wie streng sich der Generator an die Harmonielehre hält
- **Play** loopt das Schema (Piano, Bass, Drums), **Leertaste** = Play/Stop
- **Linksklick auf einen Takt**: Sexte/Septime, Tensions (9/11/13), sus4 bearbeiten –
  bei zwei Akkorden im Takt beide getrennt. Änderungen klingen sofort mit.
- **Rechtsklick auf einen Takt**: neu würfeln (passend zu Nachbartakten),
  in zwei Akkorde teilen / zweiten Akkord entfernen, zurücksetzen
- **Menü Datei**: Schema speichern/laden (`.btg`), **als MIDI exportieren** (`.mid`,
  ein Durchlauf im gewählten Stil – für DAW oder Notensatz)

## Der Regler „Jazz-Gesetz"

Harmonische Grundlage: klassische Funktionstheorie (lehrklaenge.de) und
Jazz-Harmonielehre nach Frank Sikora. **100 = volles Gesetz** (streng nach
Lehre), **0 = kein Gesetz** (frei) – je weiter man aufdreht, desto braver:

| Regler | Stufe | Material |
|---|---|---|
| 86–100 | Klassisch streng | leitereigene Dreiklänge, T-S-D-T, nach D keine S, IV–V–I bzw. iv–V–i |
| 66–85 | Jazz-Diatonik | Septakkorde, II-V-I, ii-V halbtaktig, Turnaround im Schlusstakt |
| 46–65 | + Zwischendominanten | Sekundärdominanten (ganz- oder halbtaktig), zugehöriges ii (II-V-Ketten), erste Tensions |
| 26–45 | + Substitution / MI | Tritonussubstitution, Modal Interchange (iv7, bVImaj7, bVII7, iiø7, bIIImaj7) |
| 0–25 | Frei / Outside | funktionsfremde Klänge; unter 10 fallen auch Anfangs-/Schlusstonika |

## Bedienung der Konsole

Das Panel ist einem analogen Pult nachempfunden: **gebürstetes Metall** mit
Schrauben, darunter der Akkordbereich in **schwarz eloxiertem Aluminium**.
**Dreh-Potis** mit 14-Segment-Displays darüber (orange glühend, hinter Glas,
flackernd), **Kippschalter** mit flackernden Glas-LEDs, haptische Taster und
ein **VU-Meter** mit runden LEDs hinter Glas.

**8-Bit-Modus** (Hebel rechts oben): Pixel-Schrift überall, und durch die
Konsole läuft ein animierter Regenbogen (Nyan-Style). Zum Testen auch per
`BackingTrackGenerator.exe --8bit` startbar.

- **Poti ändern:** anklicken und hoch/runter ziehen, oder Mausrad
- **Rechtsklick auf Poti oder Schalter: zurück zum Ausgangswert** – das Readout
  bestätigt mit „(Standard)", auch wenn der Wert schon auf Standard stand
- **Readout-Display:** zeigt in Klartext, was der zuletzt angefasste Regler
  gerade macht (z. B. Display `FRT` → Readout „BASS: Fretless")
- **VU-Meter:** LED-Pegel (grün/orange/rot) mit Peak-Hold, läuft mit der Wiedergabe
- Displays zeigen Kurzformen: Tonart `C`/`F#`/`Bb`, Tongeschlecht `DUR`/`MOLL`,
  Form `12`/`16`/`BL`, Stil `SWG`/`SHF`/`BLU`/`BOS`/`POP`/`FNK`/`BAL`,
  Begleitung `PNO`/`EP`/`ORG`/`GIT`/`VIB`/`PAD`/`OFF`, Chorusse `∞`–`8`

## Klangbild

Die Begleitung nutzt **Stimmführung** (Voicings bewegen sich minimal von Akkord
zu Akkord statt zu springen), leichte **Velocity-Humanisierung** und einen
dezenten Crash am Chorus-Anfang. Alte `.btg`-Dateien mit dem früheren
Freiheits-Regler werden beim Laden automatisch umgerechnet.

Unter jedem Akkord steht die Herkunft laut Harmonielehre (z. B. `ii7`, `V7/vi`,
`subV7`, `MI bVImaj7`, `frei`). Leihakkorde werden enharmonisch sinnvoll
geschrieben (Ab statt G#, #IV°7 mit Kreuz).

## Architektur

| Datei | Inhalt |
|---|---|
| `Theory.cs` | Tonnamen/Enharmonik, Akkord- und Taktmodell, Symbolbildung |
| `Generator.cs` | Stufen-/Funktionslogik, Kadenzbau, Regler-Stufen, Blues-Preset, Takt-Reroll |
| `Styles.cs` | Begleit-Patterns (Events pro Takt): Swing/Bossa/Ballade, Walking Bass, Drums, Vorzähler |
| `Midi.cs` | `winmm`-Anbindung (GM-Synth) und Player-Thread (Event-Scheduler) |
| `SongFile.cs` | Speichern/Laden (`.btg`) und Standard-MIDI-File-Export |
| `MainForm.cs` | Fenster, Taktraster, Editor, Kontextmenü, Menüleiste |
| `Program.cs` | Einstieg + `--smoke`-Selbsttest |

## Roadmap (nächste Schritte)

- Sound-Design: bessere Klänge (der Windows-GM-Synth ist Zweckmittel), Velocity-Feinschliff,
  Swing-Feel justieren, Fills, evtl. eigene Sample-Wiedergabe
- Jazz-Waltz 3/4 (braucht Taktarten-Unterstützung), Intro-Varianten (Vamp, Turnaround)
- Interface-Feinschliff (Skalen-Hinweise für Solisten, Transponier-Ansicht für Bläser)
- Enharmonik der „frei"-Akkorde, Slash Chords
- Optional: Umstieg auf .NET-8-SDK für moderne Sprachfeatures (Runtime ist installiert)
