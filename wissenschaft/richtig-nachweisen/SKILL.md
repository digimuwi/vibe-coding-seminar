---
name: richtig-nachweisen
description: "Prüft in einer bestehenden Hausarbeit (docx, odt, LaTeX, …) sämtliche Nachweise – Fußnoten, In-Text-Belege sowie Literatur- und Quellenverzeichnis – gegen das Tübinger Regelwerk (rules.md) UND gleicht Autor:innen-Schreibweisen, Titel und Erscheinungsjahre sachlich gegen die BMS (Bibliographie des Musikschrifttums, freie SRU-API) ab, gibt die Korrekturvorschläge als durchklickbares Artifact zum Annehmen/Ablehnen aus und überarbeitet das Dokument anschließend als Änderungsverfolgung mit Kommentaren. Use whenever Niels mentions Nachweise prüfen, Zitate/Fußnoten kontrollieren, Zitierweise, Belege, Literaturverzeichnis, Quellenverzeichnis, Hausarbeit korrigieren, richtig nachweisen, BMS-Abgleich, or „zitiert das korrekt"."
---

# Richtig nachweisen — Nachweisprüfung für wissenschaftliche Arbeiten

Prüft eine fertige (oder halbfertige) Arbeit auf **korrekte Nachweise** und liefert
begründete, einzeln annehmbare Korrekturen zurück ins Dokument. Der Skill *erfindet keine
Zitierregeln* — er wendet das Regelwerk in `rules.md` an.

## Pipeline

```
1 Einlesen        docx / odt / LaTeX  →  normalisierter Volltext + Rohstruktur
2 Extrahieren     alle Nachweise: Fußnoten · In-Text-Belege · Literatur- · Quellenverzeichnis
3 Prüfen          Form gegen rules.md  +  Sachabgleich gegen BMS  →  Befunde (findings.json)
4 Artifact        durchklickbarer Bericht: annehmen / ablehnen pro Befund
5 Entscheidungen  nachweis-entscheidungen.json zurückholen
6 Überarbeiten    angenommene Fixes als Änderungsverfolgung + Kommentar ins Dokument
```

Schritt 1–3 laufen still durch. **Vor Schritt 4 dem Nutzer kurz die Bilanz nennen**
(N Nachweise geprüft, M Befunde nach Schwere) und dann das Artifact veröffentlichen.

---

## Ablage — Regelwerk & BMS-Handoff

Regelwerk und BMS-Vertrag leben im Projekt **`~/Projects/richtig-zitieren/`** (dort werden
sie gepflegt), **nicht** im Skill-Ordner:

| Datei | Zweck |
|---|---|
| `~/Projects/richtig-zitieren/rules.md` | **Das Regelwerk** — Tübinger Handleitung B + Gardner/Springfeld + Kursunterlagen. Einzige Quelle der Wahrheit für „richtig". |
| `~/Projects/richtig-zitieren/HANDOFF_bms_api.md` | **BMS-API-Vertrag** — Endpunkte, CQL-Indizes, Schemata der Bibliographie des Musikschrifttums. |

Beide bei jedem Lauf **frisch lesen** (sie ändern sich). Regelwerk-Regeln:

- **Fehlt `rules.md`, brich ab** und sag, dass das Regelwerk nicht auffindbar ist. Ohne
  Regelwerk keine Prüfung — nicht raten.
- `rules.md` ist **maßgeblich**; bei Widerspruch zwischen den Quellen gilt laut Regelwerk
  **Handleitung B** (Kennzeichnung `[B-Vorrang]`). Widerspricht der Text unten dem Regelwerk,
  gilt `rules.md`.
- Regel-IDs/-Titel/-Zitat aus `rules.md` werden in jedem Befund mitgeführt (`rule.id`,
  `rule.title`, wörtliches `rule.quote`), damit jede Korrektur im Artifact und im Kommentar
  auf ihre Regel zeigt.

---

## Schritt 1 · Einlesen

| Format | Vorgehen |
|---|---|
| **.docx** | `docx`-Skill nutzen. `pandoc --track-changes=all doc.docx -o doc.md` für lesbaren Volltext (Fußnoten inline), **zusätzlich** `python scripts/office/unpack.py doc.docx unpacked/` für die Rohstruktur: `word/footnotes.xml` = Fußnoten, `word/document.xml` = Fließtext + Verzeichnisse. |
| **.odt** | ZIP mit `content.xml`; Fußnoten sind `<text:note text:note-class="footnote">`. Für den Editierschritt am robustesten nach docx wandeln: `python scripts/office/soffice.py --headless --convert-to docx datei.odt` — dann wie docx. (Rückgabe kommt dann als .docx; vgl. Schritt 6.) |
| **.doc** (alt) | Erst `soffice.py --convert-to docx`, dann wie docx. |
| **.tex** | Klartext direkt lesen. Fußnoten `\footnote{…}`, Belege `\cite/\parencite/\footcite{…}`, Bibliografie aus `.bib` (biblatex/natbib) **oder** `thebibliography`. Alle `\input`/`\include` mitlesen. |
| **PDF** | Nur wenn keine Quelldatei existiert: `pdftotext -layout`. Editieren ist dann nicht möglich → nur Bericht, klar so ansagen. |

`.doc`, Konvertierungen usw. laufen über die Skripte des **`docx`-Skills**
(`~/.claude/skills/docx/scripts/…`) — dessen SKILL.md ist die Referenz für alle docx-Mechanik.

---

## Schritt 2 · Nachweise extrahieren

Ein **Nachweis** ist jede Stelle, die eine Aussage belegt oder ein Werk verzeichnet:

- **Fußnoten-/Endnotenbelege** (Erstbeleg, Kurzbeleg, `ebd.`, `a.a.O.`, `vgl.`-Verweise).
- **In-Text-Belege** (Autor-Jahr-Klammern, sofern die Arbeit so zitiert).
- **Literaturverzeichnis** (Sekundärliteratur).
- **Quellenverzeichnis** (Primärquellen, Editionen, Digitalisate, Noten, Archivalien) — oft
  eigenständig und mit eigenen Regeln.

Jeden Nachweis in ein **Befund-Objekt** überführen. Das Schema ist der Vertrag zwischen
Prüfung, Artifact und Überarbeitung — genau einhalten:

```json
{
  "id": "f012",
  "kind": "kurzbeleg | erstbeleg | ebd | seitenzahl | verzeichnis-fehlt | verzeichnis-waise | verzeichnisform | fussnotenform | konsistenz | interpunktion | bms-autor | bms-titel | bms-jahr | bms-nicht-gefunden | ...",
  "severity": "fehler | warnung | stil",
  "location": {
    "part": "fussnote | literaturverzeichnis | quellenverzeichnis | fliesstext",
    "label": "Fn. 12",
    "anchor": "wörtlicher Ausschnitt, der im Dokument genau so vorkommt (Ankertext zum Wiederfinden)"
  },
  "rule": { "id": "R-3.2", "title": "Kurzbeleg ab zweiter Nennung", "quote": "…wörtlich aus rules.md…" },
  "current": "Ist-Text des Nachweises, exakt wie im Dokument",
  "proposed": "Soll-Text nach Regel (oder null bei offener Frage / bloßer Verifikationslücke)",
  "explanation": "ein bis zwei Sätze, warum — in Klartext, ohne Jargon",
  "confidence": 0.0,
  "evidence": {
    "source": "bms",
    "ppn": "001509160",
    "matched": { "author": "Taruskin, Richard", "title": "Stravinsky and the Russian Traditions", "year": "1996" },
    "url": "https://sru.k10plus.de/bmsonline?...",
    "matchScore": 1.0
  }
}
```

`evidence` ist **optional** — nur bei sachlichen Befunden aus dem BMS-Abgleich (Schritt 3 C);
formale Befunde haben es nicht. Es trägt den BMS-Beleg (gefundener Satz + PPN + Quell-URL),
damit im Artifact nachvollziehbar ist, worauf sich der Vorschlag stützt.

Regeln fürs Extrahieren:
- **`current` und `anchor` müssen zeichengenau** dem Dokument entsprechen (inkl. Smart Quotes,
  Halbgeviert, Nichtumbruch-Leerzeichen) — daran hängt später das Wiederfinden beim Editieren.
- Findet ein Nachweis **keinen Verstoß**, entsteht **kein** Befund. Das Artifact zeigt nur zu
  Korrigierendes, nicht das Korrekte.
- Alle Befunde in `<scratchpad>/findings.json` speichern (Array). Diese Datei ist die
  Wahrheit für Schritt 4–6; die Entscheidungen aus dem Artifact werden per `id` zurückgejoint.

---

## Schritt 3 · Prüfen — Form (rules.md) + Sache (BMS)

Drei Ebenen. **A** und **B** sind Formprüfung gegen `rules.md`, **C** ist der
**Sachabgleich gegen die BMS**.

**A) Einzelprüfung** — jeder Nachweis für sich gegen die Formregeln (Autornennung,
Titelkursivierung, Ort/Jahr, Seitenzahl-Notation, `ebd.`/`a.a.O.`-Gebrauch, Interpunktion,
Erst- vs. Kurzbeleg je nach Position im Text).

**B) Querprüfung** über alle Nachweise — das, was Einzelprüfung nicht sieht:
- **Verzeichnisabgleich**: Jedes in Fußnoten zitierte Werk steht im passenden Verzeichnis
  (Sekundärlit → Literaturverzeichnis, Quelle → Quellenverzeichnis) und umgekehrt keine
  Waisen (`verzeichnis-fehlt` / `verzeichnis-waise`).
- **Konsistenz**: Ein Werk wird über die ganze Arbeit gleich benannt (Kurztitel, Namensform,
  Jahr). Uneinheitliche Kurzbelege sind ein häufiger Befund.
- **Erst-/Kurzbeleg-Logik**: Erste Nennung vollständig, danach Kurzform; `ebd.` nur bei
  unmittelbar vorausgehendem identischem Beleg.

Für jeden Befund `confidence` setzen. **Nur raten, wo `rules.md` eindeutig ist.** Wo das
Regelwerk schweigt oder die Quelle mehrdeutig ist (z. B. fehlende Angabe, die man nicht aus
dem Dokument rekonstruieren kann): entweder gar kein Befund, oder `severity: "warnung"` mit
`proposed` = null und einer Frage im `explanation` — **niemals eine Angabe erfinden**.

### C) Sachabgleich gegen die BMS (Bibliographie des Musikschrifttums)

Formprüfung sieht nicht, ob ein Autorname **falsch geschrieben** oder ein **Erscheinungsjahr
verdreht** ist. Dafür der Abgleich gegen die BMS — eine freie, standardisierte SRU-API
(K10plus/GBV, kein Login/VPN). Vertrag: `~/Projects/richtig-zitieren/HANDOFF_bms_api.md`.

**Was abgeglichen wird** (pro Nachweis, für den BMS plausibel zuständig ist):
- **Autor:innen-Schreibweise** — z. B. `Schoenberg` vs. autoritatives `Schönberg, Arnold`,
  Umlaute, Transliteration, ausgeschriebene Vornamen. → `bms-autor`
- **Titel/Untertitel** — Wortlaut, Untertitel, Tippfehler. → `bms-titel`
- **Erscheinungsjahr** — Zahlendreher, falsches Jahr. → `bms-jahr`

**Wie** — Helper `assets/bms_lookup.py` (stdlib, holt über `curl`, live getestet):
```
python assets/bms_lookup.py --author "Taruskin" --title "Stravinsky and the Russian Traditions" --year 1996
```
liefert JSON `{total, candidates:[{ppn, author, title, year, doi, match_score, url}]}`. Für
Einzelabfragen genügt auch **WebFetch** auf die SRU-URL (Rezept A im Handoff). Ergebnisse pro
Werk in `<scratchpad>/bms_cache.json` zwischenspeichern, nicht mehrfach abfragen.

**Disziplin — hier ist Vorsicht Pflicht, sonst Fehlalarme:**
- **BMS ist Plausibilitätsabgleich, keine absolute Wahrheit.** Ein abweichendes Jahr kann eine
  **legitime andere Auflage/Ausgabe** sein, die Niels bewusst benutzt hat. Darum sind
  BMS-Befunde **`severity: "warnung"`**, nie `fehler`, und `proposed` wird **nur** gesetzt,
  wenn die Abweichung klar ein Fehler ist (Schreibfehler im Namen, Zahlendreher im Jahr); bei
  echter Auflagen-Ambiguität `proposed: null` + Frage.
- **Erst matchen, dann urteilen.** Nur flaggen, wenn ein BMS-Satz die zitierte Arbeit
  zweifelsfrei trifft (Nachname **und** signifikante Titelwörter; `match_score` als Anhalt,
  nicht als Beweis). Kein sicherer Match → **keine** Abweichungsbehauptung.
- **„Nicht gefunden" ist ein weicher Hinweis**, kein Fehler: `bms-nicht-gefunden`,
  `severity: "warnung"`, `proposed: null` — „In BMS nicht auffindbar; ggf. Autor/Titel prüfen".
  Kann an einem Tippfehler *oder* an fehlender BMS-Abdeckung liegen.
- **Abdeckung/Zuständigkeit:** BMS erfasst **musikwissenschaftliche Literatur ab Berichtsjahr
  ~1988**. Daher BMS-Abgleich vor allem auf **Literaturverzeichnis-Einträge** anwenden;
  Primärquellen, Noten, sehr alte/fachfremde Titel überspringen (kein Fehlalarm für Dinge, die
  BMS gar nicht führt). RILM ist **nicht** die BMS und hat **keine** freie API — nicht damit
  verwechseln.
- Jeder BMS-Befund trägt den **`evidence`-Block** (gefundener Satz + PPN + Quell-URL), damit
  Niels im Artifact selbst sieht, worauf sich der Vorschlag stützt, und entscheidet.

---

## Schritt 4 · Artifact — durchklickbarer Bericht

**Zuerst** `artifact-design` und `artifact-capabilities` laden (Design-Kalibrierung +
aktueller Capability-Vertrag). Dann:

1. Vorlage `assets/report-template.html` nach `<scratchpad>/nachweis-bericht.html` kopieren.
2. Platzhalter ersetzen:
   - `__FINDINGS__` → das findings-Array als JSON (aus `findings.json`).
   - `__DOCMETA__` → `{ "document": "<Dateiname>", "generatedAt": "<ISO>" }`.
   - Sonst **nichts** an der Vorlage ändern — Annehmen/Ablehnen-Logik, weißes Theme und der
     `downloads.save`-Aufruf sind darin fertig und geprüft.
3. Veröffentlichen mit `Artifact`:
   - `capabilities: { downloads: true }` — dafür ist die Vorlage gebaut.
   - `title: "Nachweisprüfung — <Dateiname>"`, `favicon: "📑"`,
     `description: "N Nachweise geprüft, M Korrekturvorschläge zum Annehmen/Ablehnen."`

Das UI ist bewusst **weiß mit neutralen Grautönen** (kein Beige/Pergament) und im Dark Mode
neutral dunkelgrau. Jede Karte zeigt: Ort (Fn. / Verzeichnis), Regel-Badge, **Ist** (rot,
durchgestrichen) vs. **Soll** (grün), Begründung, und die Knöpfe *Annehmen · Ablehnen*.
Bei BMS-Befunden erscheint zusätzlich der **Beleg-Kasten** (gefundener BMS-Satz + PPN + Link),
sobald der Befund einen `evidence`-Block hat — dafür ist die Vorlage schon gebaut.
Fortschrittsanzeige, Filter nach Schwere, Tastatur (j/k/a/r/u).

---

## Schritt 5 · Entscheidungen zurückholen

Im Artifact klickt Niels durch und drückt am Ende **„Entscheidungen speichern"** — die
Vorlage ruft `window.claude.downloads.save({ filename: "nachweis-entscheidungen.json", … })`.
Nach Bestätigung liegt die Datei in **`~/Downloads/`**.

- Diese Datei lesen (`~/Downloads/nachweis-entscheidungen.json`, ggf. mit Zähler-Suffix, den
  neuesten Treffer nehmen) und per `id` gegen `findings.json` joinen.
- Format der Datei:
  ```json
  {
    "schema": "richtig-nachweisen/decisions@1",
    "document": "Hausarbeit.docx",
    "decisions": [ { "id": "f012", "decision": "accept" }, { "id": "f013", "decision": "reject" } ]
  }
  ```
- **Ein echtes Live-Rückschreiben direkt in die Session gibt es nicht** — `downloads` ist der
  verfügbare Weg. Falls `downloads` in der Ansicht fehlt, zeigt die Vorlage einen Kopier-/
  Textfeld-Fallback; dann bringt Niels das JSON per Chat/Datei zurück.

---

## Schritt 6 · Dokument überarbeiten

Nur **angenommene** Befunde anwenden. Abgelehnte bleiben unangetastet (optional am Ende
auflisten). Jede Korrektur = **Änderungsverfolgung + erklärender Kommentar mit Regel-ID**.
Angenommene Befunde mit `proposed: null` (offene Fragen) bekommen **nur einen Kommentar**
an die Stelle, keinen tracked change — es gibt nichts automatisch Einzusetzendes.

### docx (Standardfall)
Über den `docx`-Skill: `unpack.py doc.docx unpacked/` → in `word/footnotes.xml` bzw.
`word/document.xml` den Run mit `current` finden und als tracked change ersetzen (das ganze
`<w:r>…</w:r>` durch `<w:del>…</w:del><w:ins>…</w:ins>` als Geschwister ersetzen, `<w:rPr>`
übernehmen), Autor **„Claude"**. Dazu je Stelle ein Kommentar via `scripts/comment.py`
(Text: Regel-Titel + Kurzbegründung) mit `commentRangeStart/End`-Markern. Dann
`pack.py unpacked/ Hausarbeit_geprueft.docx --original doc.docx`. Smart Quotes als
XML-Entities einsetzen (`&#x2019;` usw.). Details/Fallstricke: SKILL.md des `docx`-Skills.

### odt
Am robustesten in docx überarbeiten und **als `.docx` mit Änderungsverfolgung** zurückgeben
(ODF-Change-Tracking in `content.xml` ist deutlich fehleranfälliger). Will Niels zwingend
`.odt` zurück, vorher ansagen und die Einschränkung nennen.

### LaTeX
Änderungsverfolgungs-Äquivalent über das **`changes`-Paket**:
`\replaced[Kommentar]{neu}{alt}`, `\added`, `\deleted` — der Kommentar trägt die Regel-ID.
Bibliografie-Fixes im `.bib` bzw. `thebibliography`. Zusätzlich einen `latexdiff`-tauglichen
Stand oder ein Diff bereitstellen, damit Niels die Änderungen wie „tracked changes" sieht.
`\cite`-Schlüssel gegen `.bib`-Einträge prüfen (Waisen/fehlende Keys sind Querprüf-Befunde).

Am Ende: Pfad der überarbeiteten Datei nennen, Zahl der angewendeten/abgelehnten Korrekturen,
und dass die Änderungen als Änderungsverfolgung drinstehen (finaler Accept macht Niels selbst).

---

## Grenzen & Prinzipien

- **Keine erfundenen Angaben.** Fehlt eine Seitenzahl/ein Verlag und lässt er sich nicht aus
  dem Dokument selbst herleiten, wird das als offene Frage markiert, nicht ausgefüllt.
- **`rules.md` schlägt Bauchgefühl.** Bei Konflikt zwischen „üblicher" Zitierweise und dem
  Regelwerk gilt das Regelwerk; im Zweifel Regelstelle zitieren statt selbst entscheiden.
- **Zeichengenauigkeit.** `current`/`anchor` müssen exakt matchen, sonst greift der tracked
  change nicht. Bei Nichtfund die Stelle als „nicht automatisch anwendbar" melden, nicht
  ungefähr ersetzen.
- **BMS ist Abgleich, nicht Urteil.** Eine BMS-Abweichung ist ein Hinweis, kein Beweis — ein
  anderes Jahr kann eine legitime Auflage sein. BMS-Befunde bleiben Warnungen mit Beleg; die
  Entscheidung trifft Niels. Kein sicherer Treffer → keine Abweichungsbehauptung.
- **Nichts final akzeptieren.** Der Skill setzt Änderungsverfolgung + Kommentare; das Annehmen
  im Textprogramm bleibt bei Niels.

## Assets & Abhängigkeiten

- `assets/report-template.html` — Artifact-Vorlage (Platzhalter `__FINDINGS__`, `__DOCMETA__`);
  weißes Theme, Annehmen/Ablehnen, `downloads.save`-Rückkanal + Kopier-Fallback. Nicht ändern.
- `assets/bms_lookup.py` — BMS-SRU-Helper (Python-stdlib, holt über `curl`; kein `pip` nötig).
  `--author/--title/--year`, `--cql`, oder `--ppn`. Braucht Internet (die API ist frei, kein VPN).
- **docx-Skill** (`~/.claude/skills/docx/`) für unpack/pack/comment/accept_changes.
- `pandoc`, `libreoffice`/`soffice` (odt-/doc-Konvertierung, PDF-Vorschau) über den docx-Skill.
