---
titel: Songtext-Analyse
studierende: TODO Name eintragen
typ: web
start: index.html
---
Quantitative Analyse von Songtexten auf Basis von **genius.com**. Du gibst ein
Wort oder eine Phrase ein und siehst als **Säulendiagramm**, wie oft es in den
Liedern vorkommt.

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
