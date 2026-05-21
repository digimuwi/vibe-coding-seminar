---
titel: Änderungsgeschichte einer Dissertation
studierende: Niels Pfeffer
typ: sonstiges
---
Ein kleines Set von Skripten, das die **Änderungsgeschichte eines
Word-Dokuments** automatisch in Git festhält – gedacht für eine über Monate
wachsende Dissertation. So bleibt jederzeit nachvollziehbar, *was wann* am Text
geändert wurde, ohne dass man von Hand committen muss.

- Das `.docx` wird automatisch „ausgepackt" (es ist im Inneren eine ZIP-Datei
  mit XML) und der Text als lesbares XML in Git gespeichert
- Ein Beobachter (`watch.sh`) merkt, wenn gespeichert wird, und committet kurz danach
- Stündlich werden die Zwischenstände zu einem Commit zusammengefasst – die
  Commit-Nachricht wird dabei von Claude aus dem Diff **automatisch formuliert**

> Beispielprojekt zum Anschauen. Hier liegen **nur die Skripte**, nicht die
> Dissertation selbst. Wie es funktioniert, steht in der `README.md`.
