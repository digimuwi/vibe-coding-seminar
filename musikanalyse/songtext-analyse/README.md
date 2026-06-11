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
Deshalb laufen alle Abrufe über einen **Vermittler-Dienst** (CORS-Proxy). Sehr
umfangreiche Künstler werden auf die bekanntesten Lieder begrenzt. Einmal
geladene Texte werden im Browser zwischengespeichert (localStorage).
**Nur zu Lehrzwecken.**

## Eigener Vermittler (empfohlen, kostenlos)

Die öffentlichen Gratis-Vermittler sind oft nicht erreichbar. Am zuverlässigsten
ist ein eigener kleiner Vermittler bei **Cloudflare** (kostenlos). Das Skript dazu
liegt in `cloudflare-worker.js`. So richtest du ihn ein:

1. Auf <https://dash.cloudflare.com/sign-up> einen **kostenlosen Account** anlegen
   (nur E-Mail + Passwort, E-Mail bestätigen).
2. Links im Menü **„Workers & Pages"** öffnen → **„Create application"** →
   **„Create Worker"**.
3. Einen Namen vergeben, z. B. `songtext-proxy`, dann **„Deploy"** klicken.
4. **„Edit code"** anklicken, den Beispielcode löschen und stattdessen den
   kompletten Inhalt von `cloudflare-worker.js` einfügen → **„Deploy"**.
5. Oben erscheint die Adresse deines Workers, etwa
   `https://songtext-proxy.deinname.workers.dev`. Diese kopieren.
6. In der App unter **„Eigene Vermittler-Adresse"** einfügen – fertig. Die App
   nutzt dann immer zuerst deinen eigenen, stabilen Vermittler.

(Die Knopf-Beschriftungen bei Cloudflare können sich leicht ändern; der Ablauf
„Worker anlegen → Code einfügen → Deploy → Adresse kopieren" bleibt gleich.)
