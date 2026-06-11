# Songtext-Analyse

Eine kleine Webseite zur **quantitativen Analyse von Songtexten**. Datenquelle
ist ausschließlich [genius.com](https://genius.com/).

## Was sie kann

- **Suchwort/Phrase eingeben** und zählen lassen, wie oft es vorkommt.
- **Filter „Künstler"**: eine Säule pro Album, darunter pro Lied aufgeschlüsselt.
  Lieder ohne Album erscheinen unter **„Sonstige"**.
- **Filter „Album"**: eine Säule pro Lied; pro Lied ein Knopf, der den
  **Volltext** mit **markierten Treffern** öffnet.

## Wie sie startet

Es ist eine statische Webseite – einfach `index.html` im Browser öffnen
(kein Server, kein Build nötig).

## Technischer Hinweis

Browser dürfen fremde Seiten aus Sicherheitsgründen nicht direkt laden (CORS),
und genius.com bietet die Texte nicht über eine offizielle Schnittstelle an.
Deshalb laufen alle Abrufe über einen öffentlichen **Vermittler-Dienst**
(CORS-Proxy). Das kann gelegentlich langsam oder gestört sein – dann einfach
erneut versuchen. Sehr umfangreiche Künstler werden auf die bekanntesten Lieder
begrenzt. Einmal geladene Texte werden im Browser zwischengespeichert
(localStorage). **Nur zu Lehrzwecken.**
