# Handoff: BMS-API (Bibliographie des Musikschrifttums online)

**Stand:** 2026-07-23 · alle Endpunkte/Beispiele in diesem Dokument wurden live getestet.

## TL;DR

`musikbibliographie.de` ist die **frei zugängliche** BMS online. Sie läuft auf der
**K10plus / GBV-PICA-Infrastruktur** und hat damit eine offene, standardisierte
**SRU-Schnittstelle** — kein Login, keine Lizenz, **kein VPN nötig**, funktioniert von
überall.

```
https://sru.k10plus.de/bmsonline?version=1.1&operation=searchRetrieve&query=pica.all=Mozart&maximumRecords=5
```
→ liefert MARC21-XML mit `numberOfRecords` (z. B. ~9.233 Treffer für „Mozart").

> **Nicht verwechseln mit RILM Abstracts.** RILM ist ein *separates*, lizenzpflichtiges
> Produkt über EBSCOhost (IP-/Shibboleth-Zugang, hier zählt der Uni-/VPN-Zugang, **keine
> öffentliche API**). BMS online ist frei. Siehe Abschnitt „Abgrenzung" unten.

---

## Endpunkte

| Schnittstelle | Basis-URL | Zweck |
|---|---|---|
| **SRU** | `https://sru.k10plus.de/bmsonline` | Suche → XML (Hauptweg) |
| **unAPI** | `https://unapi.k10plus.de/?id=bmsonline:ppn:PPN&format=FMT` | Einzelsatz per PPN |
| **Z39.50** | `z3950.k10plus.de/bmsonline` (TCP) | klassischer Bibliotheks-Client |
| **PICA-API** | `https://kxpapi.k10plus.de:8000/DB=1.86/` | Roh-PICA (selten nötig) |

Betreiber der Inhalte: Staatliches Institut für Musikforschung PK (Projektleitung
C. Schmidt); Hosting/Technik: Verbundzentrale des GBV (K10plus).

---

## SRU — der Hauptweg

### Parameter

| Parameter | Wert | Hinweis |
|---|---|---|
| `version` | `1.1` | funktioniert stabil |
| `operation` | `searchRetrieve` \| `explain` | |
| `query` | CQL, z. B. `pica.all=Mozart` | URL-encoden! |
| `maximumRecords` | z. B. `10` | Seitengröße; moderat halten und paginieren |
| `startRecord` | 1-basiert, z. B. `11` | Pagination |
| `recordSchema` | z. B. `marcxml`, `mods`, `dc` | siehe Schema-Liste |

Antwort enthält immer `<numberOfRecords>` (Gesamttreffer) — ideal, um erst die Trefferzahl
zu prüfen und dann gezielt zu paginieren.

### CQL-Suchindizes (`pica`-Kontextset)

Das `explain`-Dokument deklariert die Kontextsets `cql` und `pica` mit **über 150 Indizes**.
Live verifiziert:

| Index | Sucht in | Beispiel |
|---|---|---|
| `pica.all` | alles (Volltext über den Satz) | `pica.all=Mozart` |
| `pica.tit` | Titel | `pica.tit=Beethoven` |
| `pica.per` | Person / Verfasser:in | `pica.per=Beethoven` |
| `pica.jhr` | Erscheinungsjahr | `pica.jhr=2020` |

Weitere gebräuchliche K10plus-`pica`-Indizes (im Kontextset vorhanden, für BMS je nach
Feldbelegung nutzbar — bei Bedarf am `explain`-Dokument gegenprüfen): `pica.slw`
(Schlagwort), `pica.spr` (Sprache), `pica.ppn` (PPN direkt), `pica.bep`
(Besetzung/Gattung bei Musikalien). Die vollständige Liste steht im
`operation=explain`-Response.

**Booleans:** `and` / `or` / `not` funktionieren (verifiziert):
```
pica.tit=Beethoven and pica.jhr=2020        → 208 Treffer
```
Phrasen in Anführungszeichen, z. B. `pica.tit="conversation books"`.

### Record-Schemata (`recordSchema=…`)

Die Schnittstelle bietet **14 Formate** an. Die praktisch relevanten:

| Schema | Inhalt |
|---|---|
| `marcxml` | MARC21-XML (Default in unseren Tests) — Titel 245, Verf. 100, PPN 001, Jahr 264/008 |
| `mods` / `mods36` | MODS (gut maschinell weiterzuverarbeiten) |
| `dc` / `oai-dc` / `srw-dc` | Dublin Core (schlank: title/creator/date) |
| `picaxml` | rohes PICA+ |
| `isbd-xml`, `mads`, `marcxml-solr`, `turbomarc`, `jsmf`, `jsmf-xjson`, `marcxml-legacy` | Spezialfälle |

Für schnelles Parsen empfiehlt sich **`dc`** (minimal) oder **`mods`** (strukturiert);
für vollständige bibliografische Daten **`marcxml`**.

---

## Einzelsatz per unAPI

Mit der PPN aus der SRU-Trefferliste:
```
https://unapi.k10plus.de/?id=bmsonline:ppn:009374523&format=marcxml
```
Ohne `&format=` antwortet der Server mit **HTTP 300 (Multiple Choices)** und einem
XML-Menü der verfügbaren Formate (`pp`, `picaxml`, `marcxml`, `mods`, `dc`, …). Für den
Abruf immer `&format=` mitgeben.

---

## Rezepte

### A) Direkt in einer Claude-Session (kein Code)

Ich kann die SRU-URL per **WebFetch** aufrufen und dir die Treffer strukturiert
(Titel/Autor:in/Jahr/PPN) zurückgeben — keine lokale Einrichtung nötig, weil die API frei
ist. Einfach eine Suchanfrage nennen.

### B) Python (requests + MARCXML)

```python
import requests
import xml.etree.ElementTree as ET

SRU = "https://sru.k10plus.de/bmsonline"
NS = {"marc": "http://www.loc.gov/MARC21/slim",
      "srw":  "http://www.loc.gov/zing/srw/"}

def bms_search(cql, n=10, start=1, schema="marcxml"):
    r = requests.get(SRU, params={
        "version": "1.1", "operation": "searchRetrieve",
        "query": cql, "maximumRecords": n,
        "startRecord": start, "recordSchema": schema,
    }, timeout=30)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    total = root.findtext(".//srw:numberOfRecords", namespaces=NS)
    hits = []
    for rec in root.findall(".//marc:record", NS):
        def field(tag, code):
            for df in rec.findall(f"marc:datafield[@tag='{tag}']", NS):
                for sf in df.findall(f"marc:subfield[@code='{code}']", NS):
                    return sf.text
            return None
        ppn = rec.findtext("marc:controlfield[@tag='001']", namespaces=NS)
        hits.append({
            "ppn":    ppn,
            "title":  field("245", "a"),
            "author": field("100", "a"),
            "year":   field("264", "c") or field("260", "c"),
        })
    return int(total), hits

total, hits = bms_search('pica.tit=Beethoven and pica.jhr=2020', n=5)
print(total, "Treffer")
for h in hits:
    print(h)
```

### C) Pagination

```python
def bms_all(cql, page=50, cap=500):
    total, out = None, []
    start = 1
    while True:
        total, hits = bms_search(cql, n=page, start=start)
        out += hits
        if not hits or len(out) >= min(total, cap):
            break
        start += page
    return total, out
```

---

## Abgrenzung: BMS vs. RILM (wichtig)

| | **BMS online** (`musikbibliographie.de`) | **RILM Abstracts** |
|---|---|---|
| Zugang | frei, offene SRU-API | lizenzpflichtig, EBSCOhost |
| API | ✅ SRU / unAPI / Z39.50 | ❌ keine öffentliche API |
| VPN/Uni-Netz nötig? | **nein** | **ja** (IP/Shibboleth) |
| Von Claude direkt abrufbar? | ✅ per WebFetch | nur per Browser-Automation im eingeloggten Chrome |
| Abstracts | überwiegend **Nachweise ohne** Abstract (zu prüfen je Satz, MARC 520) | echte Abstracts |

**Konsequenz für die Recherche:** BMS gibt sehr breite, saubere *bibliografische
Nachweise* (Autor/Titel/Jahr/PPN, ab Berichtsjahr nach 1988) — ideal für
Vollständigkeits-/Titelrecherche und zum Verlinken. Für inhaltliche **Abstracts** bleibt
RILM die Quelle, und die geht nur über deinen lizenzierten Uni-/VPN-Zugang im Browser.

---

## Offene Punkte / zu verifizieren

- **Abstract-Feld (MARC 520):** Ob und wie oft BMS-Sätze ein Abstract enthalten, ist nicht
  systematisch geprüft. Bei Bedarf an konkreten PPNs stichprobenhaft testen.
- **maximumRecords-Obergrenze:** Das `explain`-Dokument nennt keine harte Grenze; K10plus
  begrenzt große Seiten in der Praxis — daher paginieren statt einer Riesen-Anfrage.
- **Vollständige Indexliste:** live nur `pica.all/.tit/.per/.jhr` bestätigt; die restlichen
  >150 Indizes stehen im `operation=explain`-Response, dort nachschlagen.

## Quellen

- <https://uri.gbv.de/database/bmsonline> — Endpunkte (SRU/unAPI/Z39.50/PICA)
- <https://sru.k10plus.de/bmsonline?operation=explain> — Schemata & Indizes
- <https://miz.org/de/institutionen/bibliographie-des-musikschrifttums-bms-i3404> — Betreiber/Umfang
