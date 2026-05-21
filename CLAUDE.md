# Anweisungen für Claude · Vibe Coding-Seminar (SoSe 26)

Dies ist das **gemeinsame Repository** für alle Projekte des Vibe Coding-Seminars.
Viele Studierende arbeiten hier im selben Repo, jede:r in einem eigenen
Projektordner.

## Wen du unterstützt

Die Studierenden sind **keine Programmierer:innen**. Sie kennen sich mit Musik
und Musikwissenschaft aus, nicht mit Code. Sie können eine Datei öffnen und
Befehle eingeben – mehr nicht. Verhalte dich entsprechend:

- **Erkläre in einfacher, alltäglicher Sprache.** Kein Fachjargon ohne Erklärung.
- **Geh in kleinen Schritten vor** und sag jeweils kurz, *was* du tust und *warum*.
- **Triff technische Entscheidungen selbst.** Frag nicht nach Build-Tools,
  Frameworks oder Git-Details – wähle sinnvolle Standards und setze sie um.
- **Frag nur nach inhaltlichen Dingen** (Was soll das Projekt können? Wie soll es
  aussehen?), nicht nach technischen.
- **Mach niemals etwas kaputt, das anderen gehört** (siehe Regeln unten).

## Wie das Repository aufgebaut ist

Ganz oben gibt es **Themengebiete** (Ordner). Jedes studentische Projekt ist ein
**eigener Unterordner** in genau einem Themengebiet:

```
<themengebiet>/<projekt-name>/
```

Aktuelle Themengebiete: `musikanalyse/`, `musikgeschichte/`, `wissenschaft/`,
`praxis/`. Gibt es kein passendes, lege ein neues Themengebiet-Verzeichnis an.

**Regeln für Ordnernamen** (wichtig, damit nichts bricht):

- nur **Kleinbuchstaben**, Wörter mit **Bindestrich** verbinden: `bachs-kantaten`
- **keine** Leerzeichen, **keine** Umlaute/ß (ä→ae, ö→oe, ü→ue, ß→ss), keine Sonderzeichen
- kurz und sprechend

Alles, was zu einem Projekt gehört, lebt **innerhalb seines eigenen Ordners**.

## Pflicht: jede `projekt.md`

**Jeder Projektordner MUSS eine Datei `projekt.md` enthalten.** Daraus wird
automatisch die Seminar-Website gebaut. Lege sie zu Beginn an und halte sie
aktuell. Vorlage:

```markdown
---
titel: Mein Projekttitel
studierende: Vorname Nachname
typ: web
start: index.html
---
Eine kurze Beschreibung in zwei bis vier Sätzen: Was kann das Projekt, worum
geht es musikwissenschaftlich? Stichpunkte mit `-` sind erlaubt.
```

Felder im Kopf (zwischen den `---`-Linien):

| Feld          | Pflicht | Bedeutung |
|---------------|:------:|-----------|
| `titel`       | ja     | Anzeigename auf der Website |
| `studierende` | ja     | Name(n) der Bearbeiter:innen |
| `typ`         | ja     | `web`, `mobile` oder `sonstiges` |
| `start`       | nein   | Startdatei statischer Web-Apps (Standard: `index.html`) |
| `live`        | nein   | externe URL, falls die App woanders online ist |
| `download`    | nein   | Download-Link, z. B. zu einer Android-`.apk` |
| `bauen`       | nein   | `npm`, wenn die App erst gebaut werden muss (siehe unten) |
| `ausgabe`     | nein   | Build-Ausgabeordner (Standard: `dist`) |

Die Beschreibung unter den `---` ist normales Markdown.

## Damit die App auf der Website „geöffnet“ werden kann

Auf der Website soll jedes Projekt einen **„App öffnen“-Knopf** haben. Sorge je
nach Projekttyp dafür:

- **Einfache Web-Seite** (eine `index.html`, ggf. mit CSS/JS/Bildern im selben
  Ordner): nichts weiter nötig. Lege `start: index.html` fest. Halte die App
  **statisch** (kein Server nötig) und verwende **relative Pfade** zu eigenen
  Dateien (`bilder/foto.jpg`, nicht `/bilder/foto.jpg`).
- **App mit Build-Schritt** (z. B. Vite/React): setze `bauen: npm`. Die Website
  baut das Projekt dann automatisch im CI mit `npm ci && npm run build` und
  veröffentlicht den `dist/`-Ordner. **Wichtig:** Die App muss unter einem
  Unterpfad funktionieren – bei Vite z. B. mit `base: './'` in `vite.config`.
  Committe **nicht** den `node_modules/`- und `dist/`-Ordner.
- **Handy-App / sonstiges**: lade die fertige Datei (z. B. `.apk`) irgendwo hoch
  und trage die Adresse unter `download:` ein. Optional `live:` für eine Web-Demo.
- **Schon woanders online?** Trage einfach `live: https://…` ein.

## Git: Arbeiten im gemeinsamen Repo

Viele teilen sich dieses Repo. Halte dich strikt an diesen Ablauf, damit es
keine Konflikte gibt:

1. **Vor dem Arbeiten** den neuesten Stand holen:
   ```
   git pull --rebase
   ```
2. Arbeite **nur im eigenen Projektordner**. Ändere **niemals** die Ordner
   anderer Studierender und auch nicht `tools/`, `.github/` oder diese Datei
   – außer die Person bittet ausdrücklich darum.
3. Committe in **kleinen, nachvollziehbaren Schritten** mit einer kurzen,
   verständlichen Nachricht auf Deutsch.
4. **Vor dem Pushen erneut** `git pull --rebase`, dann `git push`.
5. **Niemals** `git push --force` und **nie** den Branch `main` umschreiben.
6. Gibt es einen Merge-/Rebase-Konflikt, **erkläre ihn in einfachen Worten** und
   löse ihn vorsichtig, ohne fremde Änderungen zu verwerfen.

## Was du committen darfst – und was nicht

- **Nicht committen:** `node_modules/`, Build-Ordner (`dist/`, `build/`),
  riesige Dateien (> ~25 MB), Passwörter/API-Schlüssel, private Daten.
- Lege bei Bedarf eine `.gitignore` im Projektordner an.
- Geheimnisse gehören nie in den Code. Frag die Studierenden, falls ein Schlüssel
  nötig ist, und erkläre, dass er geheim bleibt.

## Die Website (automatisch)

- Bei jedem `git push` auf `main` läuft automatisch GitHub Actions
  (`.github/workflows/deploy.yml`), baut die Übersicht mit
  `tools/build-site.mjs` und lädt sie per `rsync` auf den Uni-Server – genau
  wie das `digimuwi/homepage`-Repository. Live unter:
  **https://www.digimuwi.uni-tuebingen.de/vibe-coding-seminar/**
- Du musst die Website **nicht von Hand** bearbeiten. Es genügt, einen
  Projektordner mit `projekt.md` anzulegen und zu pushen – das Projekt erscheint
  dann von selbst.
- Schlägt der Build eines einzelnen Projekts fehl, erscheint es trotzdem (nur
  ohne „App öffnen“-Knopf). Die restliche Website bleibt davon unberührt.
