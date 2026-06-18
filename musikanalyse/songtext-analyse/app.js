'use strict';

/* Songtext-Analyse – Daten ausschließlich von genius.com.
   Da Browser fremde Seiten nicht direkt laden dürfen (CORS), läuft jeder
   Abruf über einen öffentlichen Vermittler-Dienst (Proxy). */

const GENIUS = 'https://genius.com/api';
// Mehrere öffentliche Vermittler-Dienste (CORS-Proxys). Fällt einer aus, wird
// automatisch der nächste probiert. `auspacken` holt bei JSON-verpackenden
// Diensten den eigentlichen Inhalt heraus.
const PROXIES = [
  { name: 'allorigins-raw', baue: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u), auspacken: (t) => t },
  { name: 'allorigins-get', baue: (u) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u), auspacken: (t) => JSON.parse(t).contents },
  { name: 'codetabs',       baue: (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u), auspacken: (t) => t },
  { name: 'cors.eu.org',    baue: (u) => 'https://cors.eu.org/' + u, auspacken: (t) => t },
  { name: 'thingproxy',     baue: (u) => 'https://thingproxy.freeboard.io/fetch/' + u, auspacken: (t) => t },
  { name: 'corsproxy.io',   baue: (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u), auspacken: (t) => t },
];
// Voreingestellte Vermittler-Adresse (eigener Cloudflare-Worker). Wird benutzt,
// solange im Feld "Eigene Vermittler-Adresse" nichts anderes eingetragen ist.
const STANDARD_PROXY = 'https://songtextproxy.trashy-stuff.workers.dev/';
const PROXY_TIMEOUT = 13000; // ms pro Dienst, dann zum nächsten
let letzterGuter = null;     // Name des zuletzt erfolgreichen Dienstes – wird zuerst probiert
const STANDARD_ANZAHL = 50; // Künstler-Modus: wie viele Lieder höchstens
const PARALLEL = 4;         // gleichzeitige Abrufe
const FENSTER = 4;          // Wortwolke: so viele Wörter vor und nach dem Treffer
// Häufige Füllwörter, die in der Wortwolke ausgeblendet werden (EN + DE).
const STOPWOERTER = new Set((
  'the a an and or but if of to in on at for with from by as is are was were be been ' +
  'am i you he she it we they me him her us them my your his its our their this that these ' +
  'those do does did not no so up down out off over all just like get got can will would ' +
  'oh yeah na la ooh hey ' +
  'der die das ein eine einen und oder aber wenn von zu im in an auf für mit aus durch ' +
  'ich du er sie es wir ihr mich dich sich mein dein sein ist sind war waren bin bist ' +
  'nicht kein auch noch schon nur wie so dass den dem des'
).split(' '));

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const form = $('suche'), wortEl = $('wort'), filterEl = $('filter'),
  nameEl = $('name'), nameLabel = $('name-label'), losBtn = $('los'),
  statusEl = $('status'), ergebnis = $('ergebnis'), ergTitel = $('ergebnis-titel'),
  diagramm = $('diagramm'), overlay = $('overlay'), overlayTitel = $('overlay-titel'),
  overlayMeta = $('overlay-meta'), overlayInhalt = $('overlay-inhalt'),
  overlayZu = $('overlay-zu'), proxyEl = $('proxy-url'), proxyStatusEl = $('proxy-status'),
  ganzwortEl = $('ganzwort'), anzahlEl = $('anzahl'), darstellungEl = $('darstellung'),
  jahrEl = $('jahr'), wolkeKnopf = $('wolke-knopf');

// Darstellung (absolut / Prozent) umschalten, ohne neu zu laden.
darstellungEl.addEventListener('change', () => {
  if (!letzteAnsicht) return;
  if (letzteAnsicht.typ === 'kuenstler') renderKuenstler();
  else if (letzteAnsicht.typ === 'album') renderAlbum();
  else renderJahr();
});

filterEl.addEventListener('change', () => {
  const v = filterEl.value;
  const istJahr = v === 'jahr';
  nameLabel.textContent = v === 'album' ? 'Album' : 'Künstler';
  nameEl.placeholder = v === 'album' ? 'z. B. 21' : 'z. B. Adele';
  $('name-feld').hidden = istJahr;   // im Jahr-Modus kein Künstler/Album nötig
  nameEl.required = !istJahr;
  $('anzahl-feld').hidden = !(v === 'kuenstler' || istJahr);
  $('jahr-feld').hidden = !istJahr;
});

// Eigene Vermittler-Adresse: aus dem Browser laden und beim Tippen speichern.
function proxyStatusZeigen() {
  const gesetzt = !!(proxyEl.value || '').trim();
  proxyStatusEl.textContent = gesetzt ? '✓ gespeichert' : 'nicht gesetzt';
  proxyStatusEl.classList.toggle('ok', gesetzt);
}
proxyEl.value = localStorage.getItem('proxyUrl') || STANDARD_PROXY;
proxyStatusZeigen();
proxyEl.addEventListener('input', () => {
  const wert = proxyEl.value.trim();
  if (wert) localStorage.setItem('proxyUrl', wert);
  else localStorage.removeItem('proxyUrl');
  proxyStatusZeigen();
});

// ---------- Helfer ----------
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function setStatus(msg, fehler = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('fehler', !!fehler);
}

function el(tag, opts = {}, kinder = []) {
  const e = document.createElement(tag);
  if (opts.class) e.className = opts.class;
  if (opts.text != null) e.textContent = opts.text;
  if (opts.html != null) e.innerHTML = opts.html;
  if (opts.style) e.style.cssText = opts.style;
  for (const [k, v] of Object.entries(opts.attr || {})) e.setAttribute(k, v);
  for (const c of [].concat(kinder)) if (c) e.appendChild(c);
  return e;
}

// ---------- Abruf über Proxy ----------
// Eigene Vermittler-Adresse (falls eingetragen) als bevorzugten Dienst ergänzen.
function eigenerProxy() {
  const u = (localStorage.getItem('proxyUrl') || STANDARD_PROXY).trim();
  if (!u) return null;
  return {
    name: 'eigener',
    baue: (z) => u + (u.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(z),
    auspacken: (t) => t,
  };
}
function aktiveProxies() {
  const eigen = eigenerProxy();
  return eigen ? [eigen, ...PROXIES] : PROXIES.slice();
}

async function einProxy(p, url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT);
  try {
    const r = await fetch(p.baue(url), { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const inhalt = p.auspacken(await r.text());
    if (!inhalt) throw new Error('leere Antwort');
    return inhalt;
  } finally {
    clearTimeout(timer);
  }
}

async function proxyFetch(url) {
  // zuletzt erfolgreichen Dienst zuerst, dann die übrigen
  const liste = aktiveProxies();
  liste.sort((a, b) => (b.name === letzterGuter ? 1 : 0) - (a.name === letzterGuter ? 1 : 0));
  let letzterFehler;
  for (const p of liste) {
    try {
      const inhalt = await einProxy(p, url);
      letzterGuter = p.name;
      return inhalt;
    } catch (e) { letzterFehler = e; }
  }
  throw letzterFehler || new Error('Kein Vermittler-Dienst erreichbar');
}
async function jsonGet(url) {
  return JSON.parse(await proxyFetch(url));
}

// ---------- genius.com ----------
async function sucheMulti(q) {
  const d = await jsonGet(GENIUS + '/search/multi?q=' + encodeURIComponent(q));
  return (d.response && d.response.sections) || [];
}
async function findeKuenstler(name) {
  const sec = await sucheMulti(name);
  const artistSec = sec.find((s) => s.type === 'artist');
  if (artistSec && artistSec.hits.length) return artistSec.hits[0].result;
  const songSec = sec.find((s) => s.type === 'song');
  if (songSec && songSec.hits.length) return songSec.hits[0].result.primary_artist;
  return null;
}
async function findeAlbum(name) {
  const sec = await sucheMulti(name);
  const albumSec = sec.find((s) => s.type === 'album');
  return albumSec && albumSec.hits.length ? albumSec.hits[0].result : null;
}
async function kuenstlerLieder(artistId, limit) {
  const lieder = [];
  let page = 1;
  while (lieder.length < limit && page) {
    const d = await jsonGet(GENIUS + '/artists/' + artistId +
      '/songs?per_page=20&page=' + page + '&sort=popularity');
    for (const s of (d.response.songs || [])) {
      lieder.push(s);
      if (lieder.length >= limit) break;
    }
    page = d.response.next_page;
  }
  return lieder;
}
async function songDetail(id) {
  const d = await jsonGet(GENIUS + '/songs/' + id + '?text_format=plain');
  return d.response.song;
}
async function albumLieder(albumId) {
  const d = await jsonGet(GENIUS + '/albums/' + albumId + '/tracks?per_page=50');
  return (d.response.tracks || []).map((t) => t.song);
}

// ---------- Liedtext lesen ----------
function parseLyrics(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let cont = doc.querySelectorAll('[data-lyrics-container="true"]');
  if (!cont.length) cont = doc.querySelectorAll('[class^="Lyrics__Container"], .lyrics');
  if (!cont.length) return '';
  const teile = [];
  cont.forEach((c) => {
    const tmp = doc.createElement('div');
    tmp.innerHTML = c.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    // genius-Kopf (Contributors, Translations, Sprachliste, "… Lyrics") und
    // andere Nicht-Text-Bausteine entfernen – genius markiert sie selbst so.
    tmp.querySelectorAll('[data-exclude-from-selection="true"]').forEach((kopf) => kopf.remove());
    teile.push(tmp.textContent);
  });
  return bereinige(teile.join('\n'));
}

// Entfernt genius-Markierungen ([Strophe], [Refrain] …) und typische Zusätze,
// damit sie weder gezählt noch markiert werden.
function bereinige(text) {
  return text
    .replace(/\[[^\]]*\]/g, '')          // Abschnitts-Marker wie [Chorus], [Verse 1]
    .replace(/You might also like/gi, '') // von genius eingestreuter Hinweis
    .replace(/\d*\s*Embed\s*$/i, '')      // "…123Embed" am Ende
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
async function holeText(song) {
  const key = 'lyrics2:' + song.id; // v2: ohne genius-Kopf (Cache neu aufbauen)
  const cached = localStorage.getItem(key);
  if (cached !== null) return cached;
  const text = parseLyrics(await proxyFetch(song.url));
  try { localStorage.setItem(key, text); } catch (e) { /* Speicher voll – egal */ }
  return text;
}

// ---------- Zählen & Markieren ----------
// Baut den Suchausdruck. Bei "ganze Wörter" sorgen Grenzen dafür, dass z. B.
// "love" nicht in "glove" oder "lover" mitgezählt wird (auch mit Umlauten).
function bauRegex(phrase, ganzwort) {
  const kern = escapeRegex(phrase);
  const muster = ganzwort ? '(?<![\\p{L}\\p{N}])' + kern + '(?![\\p{L}\\p{N}])' : kern;
  return new RegExp(muster, 'giu');
}
function zaehle(text, phrase, ganzwort) {
  if (!text || !phrase) return 0;
  const m = text.match(bauRegex(phrase, ganzwort));
  return m ? m.length : 0;
}
function markiere(text, phrase, ganzwort) {
  const re = bauRegex(phrase, ganzwort);
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index === re.lastIndex) { re.lastIndex++; continue; }
    out += escapeHtml(text.slice(last, m.index)) + '<mark>' + escapeHtml(m[0]) + '</mark>';
    last = m.index + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

// ---------- Parallel mit Fortschritt ----------
async function poolKarte(items, fn, onProgress) {
  const ergebnisse = new Array(items.length);
  let i = 0, fertig = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { ergebnisse[idx] = await fn(items[idx], idx); }
      catch (e) { ergebnisse[idx] = null; }
      fertig++;
      if (onProgress) onProgress(fertig, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return ergebnisse;
}

// ---------- Relative Häufigkeit / Darstellung ----------
// Zählt die Wörter eines Liedtexts (für "Treffer pro 1000 Wörter").
function zaehleWoerter(text) {
  if (!text) return 0;
  const m = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}
function fmt(n, stellen) {
  return n.toLocaleString('de-DE', { maximumFractionDigits: stellen == null ? 1 : stellen });
}
// Liefert je nach gewählter Darstellung den Balken-Wert und die Beschriftungen.
// "prozent" = Anteil des Wortes am gesamten Text (Treffer / Wörter * 100).
function werte(treffer, woerter) {
  const prozent = woerter > 0 ? (treffer / woerter) * 100 : 0;
  if (darstellungEl.value === 'prozent') {
    return { wert: prozent, haupt: fmt(prozent, 2) + ' %', neben: treffer + '×' };
  }
  return { wert: treffer, haupt: treffer + '×', neben: fmt(prozent, 2) + ' %' };
}

let letzteAnsicht = null; // gespeicherte Auswertung, damit die Darstellung umschaltbar ist

// ---------- Analyse: Künstler ----------
async function analyseKuenstler(name, phrase, ganzwort, anzahl) {
  setStatus('Suche Künstler „' + name + '" …');
  const artist = await findeKuenstler(name);
  if (!artist) return setStatus('Keinen Künstler dazu gefunden.', true);

  const wieviele = anzahl === Infinity ? 'alle' : anzahl;
  setStatus('Lade Liedliste von ' + artist.name + ' (' + wieviele + ' Lieder) …');
  const lieder = await kuenstlerLieder(artist.id, anzahl);
  if (!lieder.length) return setStatus('Keine Lieder gefunden.', true);

  const daten = (await poolKarte(lieder, async (s) => {
    const det = await songDetail(s.id);
    const text = await holeText(det);
    return { titel: det.title, album: det.album, treffer: zaehle(text, phrase, ganzwort), woerter: zaehleWoerter(text), text };
  }, (f, t) => setStatus('Lade Texte … ' + f + '/' + t))).filter(Boolean);

  letzteAnsicht = { typ: 'kuenstler', artist, phrase, daten, ganzwort, begrenzt: lieder.length >= anzahl, limit: anzahl };
  renderKuenstler();
}

function renderKuenstler() {
  const { artist, phrase, daten, ganzwort, begrenzt, limit } = letzteAnsicht;
  const map = new Map();
  for (const d of daten) {
    const name = d.album && d.album.name ? d.album.name : 'Sonstige';
    if (!map.has(name)) map.set(name, { name, lieder: [], treffer: 0, woerter: 0 });
    const g = map.get(name);
    g.lieder.push(d);
    g.treffer += d.treffer;
    g.woerter += d.woerter;
  }
  const gruppen = [...map.values()];
  for (const g of gruppen) g.w = werte(g.treffer, g.woerter);
  gruppen.sort((a, b) => {
    if (a.name === 'Sonstige') return 1;
    if (b.name === 'Sonstige') return -1;
    return b.w.wert - a.w.wert;
  });
  const max = Math.max(1, ...gruppen.map((g) => g.w.wert));
  const gesamt = daten.reduce((s, d) => s + d.treffer, 0);

  ergTitel.textContent = '„' + phrase + '" bei ' + artist.name +
    ' – ' + gesamt + '× in ' + daten.length + ' Liedern';
  diagramm.innerHTML = '';

  for (const g of gruppen) {
    const kopf = el('div', { class: 'album-kopf' }, [
      el('span', { class: 'titel', text: g.name }),
      el('span', { class: 'summe' }, [
        el('span', { class: 'wert-haupt', text: g.w.haupt }),
        el('span', { class: 'wert-neben', text: g.w.neben }),
      ]),
    ]);
    const spur = el('div', { class: 'album-spur' },
      el('div', { class: 'album-fuellung', style: 'width:' + (100 * g.w.wert / max) + '%' }));

    const liederW = g.lieder.map((l) => ({ l, w: werte(l.treffer, l.woerter) }));
    const maxLied = Math.max(1, ...liederW.map((x) => x.w.wert));
    const liste = el('ul', { class: 'album-lieder' },
      liederW.sort((a, b) => b.w.wert - a.w.wert).map(({ l, w }) => {
        const knopf = el('button', { class: 'text-knopf', text: 'Text', attr: { type: 'button' } });
        knopf.addEventListener('click', () =>
          zeigeText(l.titel, artist.name + ' · ' + l.treffer + ' Treffer', l.text, phrase, ganzwort));
        return el('li', {}, [
          el('span', { class: 'lied-titel', text: l.titel }),
          el('span', { class: 'mini-spur' },
            el('span', { class: 'mini-fuellung', style: 'width:' + (100 * w.wert / maxLied) + '%' })),
          el('span', { class: 'lied-wert', text: w.haupt }),
          knopf,
        ]);
      }));

    diagramm.appendChild(el('div', { class: 'album-block' }, [kopf, spur, liste]));
  }

  setStatus('Fertig.' + (begrenzt
    ? ' Hinweis: nur die ' + limit + ' bekanntesten Lieder wurden ausgewertet.'
    : ''));
  ergebnis.hidden = false;
}

// ---------- Analyse: Album ----------
async function analyseAlbum(name, phrase, ganzwort) {
  setStatus('Suche Album „' + name + '" …');
  const album = await findeAlbum(name);
  if (!album) return setStatus('Kein Album dazu gefunden.', true);

  setStatus('Lade Lieder von „' + album.name + '" …');
  const tracks = await albumLieder(album.id);
  if (!tracks.length) return setStatus('Keine Lieder im Album gefunden.', true);

  const daten = (await poolKarte(tracks, async (s) => {
    const text = await holeText(s);
    return { titel: s.title, treffer: zaehle(text, phrase, ganzwort), woerter: zaehleWoerter(text), text };
  }, (f, t) => setStatus('Lade Texte … ' + f + '/' + t))).filter(Boolean);

  letzteAnsicht = { typ: 'album', album, phrase, daten, ganzwort };
  renderAlbum();
}

// Gemeinsame Balken-Darstellung „ein Balken je Lied" (Album- und Jahr-Filter).
function songBalken(daten, phrase, ganzwort, kuenstler) {
  const datenW = daten.map((d) => ({ d, w: werte(d.treffer, d.woerter) }));
  const max = Math.max(1, ...datenW.map((x) => x.w.wert));
  diagramm.innerHTML = '';
  for (const { d, w } of datenW) {
    const wer = d.kuenstler || kuenstler;
    const label = d.kuenstler ? d.titel + ' – ' + d.kuenstler : d.titel;
    const knopf = el('button', { class: 'text-knopf', text: 'Text anzeigen', attr: { type: 'button' } });
    knopf.addEventListener('click', () =>
      zeigeText(d.titel, (wer ? wer + ' · ' : '') + d.treffer + ' Treffer', d.text, phrase, ganzwort));

    diagramm.appendChild(el('div', { class: 'lied-zeile' }, [
      el('span', { class: 'balken-label', text: label, attr: { title: label } }),
      el('span', { class: 'balken-spur' },
        el('span', { class: 'balken-fuellung', style: 'width:' + (100 * w.wert / max) + '%' })),
      el('span', { class: 'balken-wert' }, [
        el('span', { class: 'wert-haupt', text: w.haupt }),
        el('span', { class: 'wert-neben', text: w.neben }),
      ]),
      knopf,
    ]));
  }
}

function renderAlbum() {
  const { album, phrase, daten, ganzwort } = letzteAnsicht;
  const gesamt = daten.reduce((s, d) => s + d.treffer, 0);
  const kuenstler = album.artist ? album.artist.name : '';
  ergTitel.textContent = '„' + phrase + '" auf „' + album.name + '"' +
    (kuenstler ? ' (' + kuenstler + ')' : '') + ' – ' + gesamt + '×';
  songBalken(daten, phrase, ganzwort, kuenstler);
  setStatus('Fertig. ' + daten.length + ' Lieder ausgewertet.');
  ergebnis.hidden = false;
}

// ---------- Analyse: nach Jahr (unabhängig vom Künstler) ----------
// genius bietet keine "alle Songs aus Jahr X"-Liste. Stattdessen durchsuchen wir
// die nach Klickzahlen sortierte Bestenliste (Charts) und filtern nach dem Jahr –
// so erhalten wir die populärsten Lieder dieses Jahres.
const CHART_MAX_SEITEN = 30; // höchstens so viele Chart-Seiten (à 50) absuchen

async function chartSeite(page) {
  const d = await jsonGet(GENIUS + '/songs/chart?per_page=50&page=' + page +
    '&time_period=all_time&chart_genre=all');
  return (d.response.chart_items || []).map((c) => c.item).filter(Boolean);
}

async function analyseJahr(phrase, ganzwort, anzahl, jahr) {
  const ziel = anzahl === Infinity ? CHART_MAX_SEITEN * 50 : anzahl;
  const gefunden = [];
  let page = 1;
  while (gefunden.length < ziel && page <= CHART_MAX_SEITEN) {
    setStatus('Suche populäre Lieder aus ' + jahr + ' … (' + gefunden.length + ' gefunden)');
    const songs = await chartSeite(page);
    if (!songs.length) break;
    for (const s of songs) {
      const y = s.release_date_components ? s.release_date_components.year : null;
      if (y === jahr) {
        gefunden.push(s);
        if (gefunden.length >= ziel) break;
      }
    }
    page++;
  }
  if (!gefunden.length) {
    return setStatus('Keine Lieder aus ' + jahr + ' in den Charts gefunden – für sehr ' +
      'alte oder seltene Jahre gibt es dort evtl. zu wenige Einträge.', true);
  }

  const daten = (await poolKarte(gefunden, async (s) => {
    const text = await holeText(s);
    return {
      titel: s.title,
      kuenstler: s.primary_artist ? s.primary_artist.name : (s.primary_artist_names || ''),
      treffer: zaehle(text, phrase, ganzwort),
      woerter: zaehleWoerter(text),
      text,
    };
  }, (f, t) => setStatus('Lade Texte … ' + f + '/' + t))).filter(Boolean);

  letzteAnsicht = { typ: 'jahr', phrase, daten, ganzwort, jahr };
  renderJahr();
}

function renderJahr() {
  const { phrase, daten, ganzwort, jahr } = letzteAnsicht;
  const gesamt = daten.reduce((s, d) => s + d.treffer, 0);
  ergTitel.textContent = '„' + phrase + '" in den ' + daten.length +
    ' populärsten Liedern aus ' + jahr + ' – ' + gesamt + '×';
  songBalken(daten, phrase, ganzwort, '');
  setStatus('Fertig. ' + daten.length + ' Lied(er) aus ' + jahr + '.');
  ergebnis.hidden = false;
}

// ---------- Overlay (Volltext) ----------
function zeigeText(titel, meta, text, phrase, ganzwort) {
  overlayTitel.textContent = titel;
  overlayMeta.textContent = meta;
  overlayInhalt.innerHTML = text
    ? markiere(text, phrase, ganzwort)
    : '(Der Text konnte nicht geladen werden.)';
  overlay.hidden = false;
}
function schliesseOverlay() { overlay.hidden = true; }
overlayZu.addEventListener('click', schliesseOverlay);
overlay.addEventListener('click', (e) => { if (e.target === overlay) schliesseOverlay(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') schliesseOverlay(); });

// ---------- Absenden ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const phrase = wortEl.value.trim();
  const name = nameEl.value.trim();
  const ganzwort = ganzwortEl.checked;
  const anzahl = anzahlEl.value === 'alle'
    ? Infinity
    : (parseInt(anzahlEl.value, 10) || STANDARD_ANZAHL);
  const jahr = parseInt(jahrEl.value, 10);
  const istJahr = filterEl.value === 'jahr';
  if (!phrase) return;
  if (istJahr) {
    if (!jahr) return setStatus('Bitte eine Jahreszahl eingeben (z. B. 2015).', true);
  } else if (!name) {
    return;
  }

  losBtn.disabled = true;
  ergebnis.hidden = true;
  diagramm.innerHTML = '';
  try {
    if (filterEl.value === 'album') await analyseAlbum(name, phrase, ganzwort);
    else if (istJahr) await analyseJahr(phrase, ganzwort, anzahl, jahr);
    else await analyseKuenstler(name, phrase, ganzwort, anzahl);
  } catch (err) {
    setStatus('Fehler: ' + err.message +
      ' – gerade ist offenbar kein Vermittler-Dienst erreichbar. Bitte in ein paar Sekunden erneut auf „Analysieren" klicken.', true);
  } finally {
    losBtn.disabled = false;
  }
});

// ---------- Umgebungswörter / Wortwolke ----------
// Sammelt die Wörter rund um jeden Treffer (FENSTER Wörter davor und danach).
function umgebung(text, phrase, ganzwort) {
  if (!text) return [];
  const tokens = [];
  const wre = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  let m;
  while ((m = wre.exec(text))) tokens.push({ w: m[0], start: m.index, end: m.index + m[0].length });

  const tre = bauRegex(phrase, ganzwort);
  const gefunden = [];
  let pm;
  while ((pm = tre.exec(text))) {
    if (pm.index === tre.lastIndex) { tre.lastIndex++; continue; }
    const s = pm.index, e = pm.index + pm[0].length;
    const first = tokens.findIndex((t) => t.end > s);
    if (first === -1) continue;
    let last = first;
    for (let i = tokens.length - 1; i >= 0; i--) { if (tokens[i].start < e) { last = i; break; } }
    for (let i = first - FENSTER; i <= last + FENSTER; i++) {
      if (i < 0 || i >= tokens.length || (i >= first && i <= last)) continue;
      gefunden.push(tokens[i].w.toLowerCase());
    }
  }
  return gefunden;
}

// Textbreite messen (Canvas), um Wörter überlappungsfrei zu platzieren.
const messContext = document.createElement('canvas').getContext('2d');
function textBreite(wort, fs) {
  messContext.font = '700 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  return messContext.measureText(wort).width;
}
// Rechtecke (mit kleinem Abstand) auf Überlappung prüfen.
function ueberlappt(a, b) {
  const luft = 3;
  return !(a.x + a.w + luft <= b.x || b.x + b.w + luft <= a.x ||
           a.y + a.h + luft <= b.y || b.y + b.h + luft <= a.y);
}

// Baut eine echte Wortwolke: Schriftgröße = Häufigkeit, jedes dritte Wort
// senkrecht, spiralförmig dicht gepackt, jedes Wort in einer farbigen Kachel.
function wortwolkeBauen(liste) {
  const maxN = liste[0][1], minN = liste[liste.length - 1][1];
  const platzierte = [];
  const kacheln = [];

  liste.forEach(([wort, n], i) => {
    const t = maxN === minN ? 1 : (Math.sqrt(n) - Math.sqrt(minN)) / (Math.sqrt(maxN) - Math.sqrt(minN));
    const fs = Math.round(15 + t * 38);          // Schriftgröße 15…53 px
    const senkrecht = (i % 3 === 1);             // jedes dritte Wort senkrecht
    const padX = Math.round(fs * 0.34), padY = Math.round(fs * 0.22);
    const tw = Math.ceil(textBreite(wort, fs)) + 2 * padX;
    const th = Math.round(fs) + 2 * padY;
    const fw = senkrecht ? th : tw;              // Grundfläche der Kachel
    const fh = senkrecht ? tw : th;

    // Spiralsuche nach einem freien Platz (Archimedische Spirale, breit gestaucht)
    let schritt = 0, x = -fw / 2, y = -fh / 2;
    while (true) {
      const r = 4 * schritt;
      x = Math.cos(schritt) * r - fw / 2;
      y = Math.sin(schritt) * r * 0.62 - fh / 2;
      const rect = { x, y, w: fw, h: fh };
      if (!platzierte.some((p) => ueberlappt(p, rect))) { platzierte.push(rect); break; }
      schritt += 0.18;
      if (r > 6000) { platzierte.push(rect); break; }
    }
    kacheln.push({ wort, n, fs, senkrecht, x, y, fw, fh, hue: (i * 53) % 360 });
  });

  const minX = Math.min(...platzierte.map((p) => p.x));
  const minY = Math.min(...platzierte.map((p) => p.y));
  const breite = Math.max(...platzierte.map((p) => p.x + p.w)) - minX;
  const hoehe = Math.max(...platzierte.map((p) => p.y + p.h)) - minY;

  const wolke = el('div', { class: 'wortwolke' });
  wolke.style.width = breite + 'px';
  wolke.style.height = hoehe + 'px';
  for (const k of kacheln) {
    const box = el('div', { class: 'wolke-kachel', attr: { title: k.wort + ': ' + k.n + '×' } });
    box.style.left = (k.x - minX) + 'px';
    box.style.top = (k.y - minY) + 'px';
    box.style.width = k.fw + 'px';
    box.style.height = k.fh + 'px';
    box.style.background = 'hsl(' + k.hue + ', 82%, 93%)';
    box.style.color = 'hsl(' + k.hue + ', 68%, 32%)';
    const span = el('span', { class: 'wolke-wort', text: k.wort });
    span.style.fontSize = k.fs + 'px';
    if (k.senkrecht) span.style.transform = 'rotate(-90deg)';
    box.appendChild(span);
    wolke.appendChild(box);
  }

  // Bei Überbreite herunterskalieren, damit die Wolke ins Overlay passt.
  const maxBreite = 600;
  if (breite > maxBreite) {
    const skala = maxBreite / breite;
    const rahmen = el('div', { class: 'wolke-rahmen' });
    rahmen.style.width = (breite * skala) + 'px';
    rahmen.style.height = (hoehe * skala) + 'px';
    wolke.style.transformOrigin = 'top left';
    wolke.style.transform = 'scale(' + skala + ')';
    rahmen.appendChild(wolke);
    return rahmen;
  }
  return wolke;
}

// Sammelt die Umgebungswörter und zeigt sie als Wortwolke im Overlay.
function zeigeWolke() {
  if (!letzteAnsicht) return;
  const { phrase, ganzwort, daten } = letzteAnsicht;
  const zaehl = new Map();
  for (const d of daten) {
    for (const w of umgebung(d.text || '', phrase, ganzwort)) {
      if (w.length < 2 || STOPWOERTER.has(w)) continue;
      zaehl.set(w, (zaehl.get(w) || 0) + 1);
    }
  }
  const liste = [...zaehl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50);

  overlayTitel.textContent = 'Umgebung von „' + phrase + '"';
  overlayMeta.textContent = liste.length
    ? 'Häufigste Wörter direkt vor/nach „' + phrase + '" (je ' + FENSTER + ' Wörter; Füllwörter ausgeblendet).'
    : '';
  overlayInhalt.innerHTML = '';
  if (!liste.length) {
    overlayInhalt.textContent = 'Keine Umgebungswörter gefunden – „' + phrase +
      '" kommt in den geladenen Texten nicht vor.';
    overlay.hidden = false;
    return;
  }
  overlayInhalt.appendChild(wortwolkeBauen(liste));
  overlay.hidden = false;
}
wolkeKnopf.addEventListener('click', zeigeWolke);

// ---------- Web-App installierbar machen ----------
// Service Worker registrieren (funktioniert nur über http/https, nicht bei
// direktem Öffnen der Datei). Fehler werden bewusst ignoriert.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
