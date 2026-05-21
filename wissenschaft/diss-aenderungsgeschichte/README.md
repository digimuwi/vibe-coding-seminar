# Änderungsgeschichte einer Dissertation (Word + Git)

Diese Skripte halten die Entstehung eines langen Word-Dokuments – hier einer
Dissertation – lückenlos in **Git** fest. Man schreibt ganz normal in Word; im
Hintergrund entsteht automatisch eine nachvollziehbare Versionsgeschichte.

> Hier liegen **nur die Skripte als Beispiel**, nicht die Dissertation selbst.

## Das Grundproblem

Ein `.docx` ist für Git eine „Blackbox": eine einzige gepackte Datei. Git kann
zwar speichern, dass sie sich geändert hat, aber nicht *was* sich am Text
geändert hat. Ein `.docx` ist aber in Wahrheit ein ZIP-Archiv voller XML-Dateien.
Packt man es aus, wird der Textinhalt für Git wieder vergleichbar.

## Die vier Skripte

| Skript | Aufgabe |
|--------|---------|
| `unpack.sh` | Entpackt das `.docx` nach `_unpacked/` und formatiert die Text-XML (`document.xml`, Fußnoten, Kommentare) hübsch, damit Änderungen zeilenweise lesbar sind. |
| `pack.sh` | Baut aus `_unpacked/` wieder ein `.docx`. Word „minimiert" das XML beim nächsten Speichern ohnehin selbst – der Hin- und Rückweg ist also unkritisch. |
| `watch.sh` | Beobachtet die `.docx`-Datei (`fswatch`). Wird gespeichert, startet 30 Sekunden später automatisch ein Commit (mit „Entprellen", falls man mehrmals kurz hintereinander speichert). |
| `autocommit.sh` | Packt aus, committet die Änderungen in `_unpacked/`. Höchstens einmal pro Stunde werden die Zwischenstände zu **einem** Commit zusammengefasst und gepusht – die Commit-Nachricht formuliert **Claude** automatisch aus dem Diff. |

## Warum das praktisch ist

- Man sieht später genau, **wann welche Passage** entstanden oder umgeschrieben wurde.
- Die automatischen, von Claude formulierten Nachrichten ergeben nebenbei ein
  knappes Arbeitstagebuch.
- Das eigentliche `.docx` muss gar nicht eingecheckt werden – es steht in der
  `.gitignore` (siehe `gitignore.beispiel`); versioniert wird der ausgepackte Text.

## Voraussetzungen

`fswatch`, `xmllint`, `zip`/`unzip` und – für die automatischen
Commit-Nachrichten – die `claude`-Kommandozeile.
