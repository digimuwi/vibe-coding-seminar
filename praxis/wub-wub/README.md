# Wub Wub – Sidechain VST Plugin

Ein JUCE-basiertes Audio-Plugin für Sidechain-Volume-Ducking mit Envelope-Editor.

## Features

- **Drei Trigger-Modi:**
  - AUDIO: Transient-Erkennung auf Eingangssignal
  - MIDI: Reagiert auf MIDI Note-On Events
  - SYNC: Synchronisiert mit DAW-Tempo (1/8, 1/4, 1/2, 1/1 Taktteile)

- **Envelope-Editor:**
  - 7 voreingestellte Hüllkurvformen (Linear, Expo, Smooth, etc.)
  - Freies Zeichnen oder Bezier-Punkte bearbeiten
  - Echtzeit-Visualisierung

- **Mix-Knob:**
  - 0–100% Wet/Dry Blending

- **Plugin-Formate:**
  - Standalone App
  - VST3
  - AU (macOS)

## Build & Run

```bash
./build.sh
```

Das Skript:
1. Löscht den alten Build
2. Konfiguriert mit CMake
3. Baut alle Formate
4. Öffnet die Standalone-App

### Manueller Build

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j$(sysctl -n hw.ncpu)
```

## Verwendung

### Standalone App
```
build/WubWub_artefacts/Release/Standalone/Wub Wub.app
```

### VST3 Plugin (DAW)
```
build/WubWub_artefacts/Release/VST3/Wub Wub.vst3
```

### AU Plugin (macOS DAW)
```
build/WubWub_artefacts/Release/AU/Wub Wub.component
```

## UI-Steuerung

- **Mix-Knob (oben):** Vertikales Ziehen zum Anpassen (0–100%)
- **Trigger-Buttons:** Wähle AUDIO, MIDI oder SYNC
- **Beat-Division (SYNC mode):** Wähle 1/8, 1/4, 1/2 oder 1/1
- **Envelope-Presets:** 7 vordefinierte Formen
- **Canvas:** 
  - Klick → Punkt hinzufügen
  - Ziehen → Punkt verschieben
  - Doppelklick → Punkt löschen

## Entwicklung

### Abhängigkeiten

- macOS 11+
- CMake 3.22+
- JUCE 8.0.4 (wird automatisch heruntergeladen)

### Dateistruktur

```
praxis/wub-wub/
├── CMakeLists.txt           # Build-Konfiguration
├── Source/
│   ├── PluginProcessor.cpp  # Audio-DSP
│   ├── PluginEditor.cpp     # UI-Bridge
│   └── EnvelopeGenerator.cpp # Hüllkurven-LUT
├── Resources/
│   └── ui.html              # WebView UI
└── build.sh                 # Rebuild-Skript
```

### Bearbeitung der UI

Die UI liegt in `Resources/ui.html` und wird automatisch in den Binary eingebettet. Nach Änderungen muss mit `./build.sh` neu gebaut werden.
