---
titel: Metronom mit Tempoübergängen
studierende: Niels Pfeffer
typ: mobile
---
Ein Metronom für Android, dessen Tempo nicht starr bleibt, sondern **gleitend
zwischen zwei Werten hin- und herschwingt** – etwa von 60 zu 120 BPM und zurück.
Nützlich, um Beschleunigen und Abbremsen (Accelerando/Ritardando) gezielt zu üben.

- Eingabe von **Minimal-** und **Maximal-Tempo** sowie der **Periodenlänge** (in Schlägen)
- Das Tempo folgt einer weichen Kurve (Kosinus), kein abruptes Umschalten
- Ein Ball wandert im Takt zwischen beiden Tempo-Marken hin und her
- Geschrieben in Kotlin; der Klang wird live aus einer Audio-Engine erzeugt

> Beispielprojekt zum Anschauen – zeigt, dass „Vibe Coding“ auch eine native
> Handy-App sein kann. Code unter `app/src/main/java/com/niels/metronome/`.
