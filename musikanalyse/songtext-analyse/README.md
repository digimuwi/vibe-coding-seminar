# Songtext-Analyse

Quantitative Analyse von Songtexten direkt im Browser. Du gibst ein Wort oder
eine Phrase ein, das Programm zählt die Treffer und zeigt sie als
Säulendiagramm. Filter: **Künstler**, **Album**, **Zeitraum**.

## Quellen (live, kein lokaler Datensatz)

- **[MusicBrainz](https://musicbrainz.org/)** — offene Musikdatenbank.
  Liefert Künstler, Studio-Alben und Tracklisten samt Erscheinungsjahr.
- **[lyrics.ovh](https://lyricsovh.docs.apiary.io/)** — kostenlose Lyrics-API.
  Liefert die Songtexte zu Künstler + Titel.

Beide sind CORS-freundlich, ohne Anmeldung und ohne API-Schlüssel nutzbar.
Direkt von `songtexte.com` ist Browser-Scraping nicht möglich – die Seite
erlaubt das technisch (CORS) nicht und es wäre rechtlich heikel.

## So benutzt du es

1. **Künstler laden:** Filter „Künstler" wählen, Namen ins Suchfeld tippen
   (z. B. `The Beatles`), Wort/Phrase oben eintragen, **Auswerten** klicken.
   Beim ersten Mal lädt die App Discographie + Songtexte live – das dauert
   je nach Größe der Discographie 1–5 Minuten (Progress-Anzeige läuft).
2. **Bibliothek wächst mit:** Jeder geladene Künstler wird im Browser
   gespeichert (localStorage). Beim nächsten Mal ist er sofort verfügbar.
3. **Album-Filter:** Sobald ein Künstler in der Bibliothek ist, kannst du
   gezielt ein seiner Alben auswählen. Pro Song gibt es einen Knopf, der den
   Volltext mit markierten Treffern öffnet.
4. **Zeitraum-Filter:** Säulen pro Jahr, über die gesamte Bibliothek. Pro
   Jahr ein Knopf, der Künstler + Titel der gefundenen Lieder zeigt.

## Was du wissen solltest

- **Erstes Laden dauert.** MusicBrainz erlaubt etwa eine Anfrage pro Sekunde,
  und für jedes Album wird einmal angefragt. Bei 20 Alben sind das also gut
  20 Sekunden allein für die Tracklisten, dazu die parallelen Lyrics-Abrufe.
- **Lyrics sind nicht für jeden Song verfügbar.** lyrics.ovh hat nicht alles.
  Songs ohne Text werden mit dem Hinweis „kein Text" markiert und mit 0
  gezählt.
- **Studio-Alben only.** Die App lädt nur reguläre Alben – keine
  Compilations, Live-Alben, Soundtracks oder Singles. Andernfalls würde die
  Discographie schnell unübersichtlich.
- **Maximal 20 Alben pro Künstler** – damit das Laden in vertretbarer Zeit
  bleibt. Bei sehr großen Diskographien werden die ältesten 20 genommen.
- **Lokaler Cache:** Die Bibliothek lebt im `localStorage` deines Browsers.
  Wenn du den Browser-Speicher löschst, ist sie weg. Im Bibliotheks-Panel
  kannst du einzelne Künstler mit „×" wieder entfernen.

## App starten

Statische Seite – ein lokaler Server reicht. Auf der Seminar-Website ist
schon alles eingerichtet; lokal z. B.:

**VS Code:** Erweiterung „Live Server" → Rechtsklick auf `index.html` →
„Open with Live Server".

**Python (falls installiert):**
```
python -m http.server 8000
```
Dann `http://localhost:8000/` öffnen.

> **Hinweis:** Doppelklick auf `index.html` funktioniert nicht – moderne
> Browser blockieren API-Zugriffe von `file://`-Seiten.

## Aufbau

```
songtext-analyse/
├── index.html      Oberfläche
├── styles.css      Aussehen
├── app.js          Logik: APIs, Cache, Filter, Diagramm
├── projekt.md      Metadaten für die Seminar-Website
└── README.md       diese Anleitung
```

## Wo kommen die Texte rechtlich her?

- MusicBrainz-Daten stehen unter CC0 (öffentliche Domain).
- lyrics.ovh aggregiert Songtexte aus dem Web. Für eine quantitative
  Textanalyse im wissenschaftlichen Seminar-Kontext deckt § 60d UrhG
  (Text- und Data-Mining für Forschungszwecke) das Vorgehen ab.
