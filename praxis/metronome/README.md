# Metronom mit Tempoübergängen

Ein Metronom für Android, dessen Tempo **gleitend zwischen zwei Werten
schwingt**, statt konstant zu bleiben. Damit lässt sich kontrolliertes
Beschleunigen und Abbremsen üben.

## Idee

Man gibt drei Dinge ein:

- **Minimal-Tempo** (z. B. 60 BPM)
- **Maximal-Tempo** (z. B. 120 BPM)
- **Periode** in Schlägen (z. B. 16) – wie lange ein kompletter Hin- und Rückweg dauert

Das tatsächliche Tempo folgt dann einer weichen Kosinus-Kurve zwischen Minimum
und Maximum. Ein wandernder Ball zeigt an, wo im Übergang man sich gerade
befindet.

## Wie es technisch funktioniert (zum Stöbern)

- **`MainActivity.kt`** – die eigentliche Logik. Eine eigene Audio-Engine
  (`AudioTrack`) erzeugt die Klicks in einem Hintergrund-Thread mit hoher
  Priorität, damit das Timing genau bleibt. Pro Schlag wird aus der aktuellen
  Phase das Tempo berechnet (`bpmAtPhase`) – die Interpolation zwischen den
  Tempo-Werten ist exponentiell, damit der Übergang gleichmäßig *klingt*.
- **`BallView.kt`** – eine kleine selbstgezeichnete Ansicht (`View`), die den
  Ball auf einer Linie zwischen den beiden Tempo-Marken bewegt.

## Bauen / Ausprobieren

Android-Projekt (Gradle). Mit Android Studio öffnen oder per Kommandozeile:

```sh
./gradlew assembleDebug
```

Das fertige `.apk` liegt danach unter `app/build/outputs/apk/debug/`.
(Build-Ordner sind hier bewusst **nicht** eingecheckt.)
