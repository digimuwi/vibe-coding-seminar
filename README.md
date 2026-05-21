# vibe-coding-seminar

Sammlung von Projekten, die im Rahmen des Vibe Coding-Seminars (SoSe 26)
entstanden sind.

## 🌐 Projekt-Übersicht (Website)

Alle Projekte sind hier zu sehen und direkt zu öffnen:

**https://digimuwi.uni-tuebingen.de/vibe-coding-seminar/**

Die Seite wird bei jedem Push automatisch neu gebaut und auf den Uni-Server
geladen (GitHub Actions → `rsync`).

## 📂 Aufbau

Pro Themengebiet ein Ordner, pro Projekt ein Unterordner mit einer
`projekt.md`:

```
<themengebiet>/<projekt-name>/projekt.md
```

Themengebiete: `musikanalyse/`, `musikgeschichte/`, `wissenschaft/`, `praxis/`.

## ✏️ Neues Projekt anlegen

1. Ordner im passenden Themengebiet erstellen (Kleinbuchstaben, mit Bindestrich,
   keine Umlaute/Leerzeichen).
2. `tools/vorlage-projekt.md` als `projekt.md` hineinkopieren und ausfüllen.
3. Projektdateien (z. B. `index.html`) hinzufügen, committen, pushen.

Die ausführlichen Regeln für die KI-Assistenz stehen in [`CLAUDE.md`](CLAUDE.md).
