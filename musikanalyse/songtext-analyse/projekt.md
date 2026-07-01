---
titel: Songtext-Analyse
studierende: Rian Knittel
typ: web
start: index.html
---
Installierbare **Web-App** zur quantitativen Analyse von Songtexten auf Basis von
**genius.com**. Du gibst ein Wort oder eine Phrase ein und siehst als
**Säulendiagramm**, wie oft es in den Liedern vorkommt. Die App lässt sich im
Browser öffnen oder auf Startbildschirm/Desktop installieren.

- **Filter „Künstler"**: eine Säule pro Album des Künstlers, darunter
  aufgeschlüsselt, wie oft der Begriff in welchem Lied des Albums vorkommt.
  Lieder ohne Album landen unter **„Sonstige"**.
- **Filter „Album"**: eine Säule pro Lied des Albums. Unter jedem Lied öffnet ein
  Knopf den **vollständigen Text** mit **farbig markierten** Treffern.

Die Lied- und Albumlisten sowie die Texte stammen ausschließlich von
[genius.com](https://genius.com/). Da Browser fremde Seiten nicht direkt laden
dürfen, läuft der Abruf über einen öffentlichen Vermittler-Dienst (CORS-Proxy);
einmal geladene Texte werden im Browser zwischengespeichert (localStorage).
Nur für Lehrzwecke.
