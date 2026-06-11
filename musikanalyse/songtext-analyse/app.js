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

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const form = $('suche'), wortEl = $('wort'), filterEl = $('filter'),
  nameEl = $('name'), nameLabel = $('name-label'), losBtn = $('los'),
  statusEl = $('status'), ergebnis = $('ergebnis'), ergTitel = $('ergebnis-titel'),
  diagramm = $('diagramm'), overlay = $('overlay'), overlayTitel = $('overlay-titel'),
  overlayMeta = $('overlay-meta'), overlayInhalt = $('overlay-inhalt'),
  overlayZu = $('overlay-zu'), proxyEl = $('proxy-url'), proxyStatusEl = $('proxy-status'),
  ganzwortEl = $('ganzwort'), anzahlEl = $('anzahl'), darstellungEl = $('darstellung');

// Darstellung (absolut / pro 1000 Wörter) umschalten, ohne neu zu laden.
darstellungEl.addEventListener('change', () => {
  if (!letzteAnsicht) return;
  if (letzteAnsicht.typ === 'kuenstler') renderKuenstler();
  else if (letzteAnsicht.typ === 'album') renderAlbum();
  else renderLied();
});

filterEl.addEventListener('change', () => {
  const v = filterEl.value;
  nameLabel.textContent = v === 'album' ? 'Album' : v === 'lied' ? 'Lied' : 'Künstler';
  nameEl.placeholder = v === 'album' ? 'z. B. 21' : v === 'lied' ? 'z. B. Hello' : 'z. B. Adele';
  $('anzahl-feld').hidden = v !== 'kuenstler'; // "Lieder (bei Künstler)" nur im Künstler-Modus
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
async function findeLied(name) {
  const sec = await sucheMulti(name);
  const songSec = sec.find((s) => s.type === 'song');
  return songSec && songSec.hits.length ? songSec.hits[0].result : null;
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

function renderAlbum() {
  const { album, phrase, daten, ganzwort } = letzteAnsicht;
  const datenW = daten.map((d) => ({ d, w: werte(d.treffer, d.woerter) }));
  const max = Math.max(1, ...datenW.map((x) => x.w.wert));
  const gesamt = daten.reduce((s, d) => s + d.treffer, 0);
  const kuenstler = album.artist ? album.artist.name : '';

  ergTitel.textContent = '„' + phrase + '" auf „' + album.name + '"' +
    (kuenstler ? ' (' + kuenstler + ')' : '') + ' – ' + gesamt + '×';
  diagramm.innerHTML = '';

  for (const { d, w } of datenW) {
    const knopf = el('button', { class: 'text-knopf', text: 'Text anzeigen', attr: { type: 'button' } });
    knopf.addEventListener('click', () =>
      zeigeText(d.titel, kuenstler + ' · ' + d.treffer + ' Treffer', d.text, phrase, ganzwort));

    diagramm.appendChild(el('div', { class: 'lied-zeile' }, [
      el('span', { class: 'balken-label', text: d.titel }),
      el('span', { class: 'balken-spur' },
        el('span', { class: 'balken-fuellung', style: 'width:' + (100 * w.wert / max) + '%' })),
      el('span', { class: 'balken-wert' }, [
        el('span', { class: 'wert-haupt', text: w.haupt }),
        el('span', { class: 'wert-neben', text: w.neben }),
      ]),
      knopf,
    ]));
  }

  setStatus('Fertig. ' + daten.length + ' Lieder ausgewertet.');
  ergebnis.hidden = false;
}

// ---------- Analyse: einzelnes Lied ----------
async function analyseLied(name, phrase, ganzwort) {
  setStatus('Suche Lied „' + name + '" …');
  const song = await findeLied(name);
  if (!song) return setStatus('Kein Lied dazu gefunden.', true);

  setStatus('Lade Text von „' + song.title + '" …');
  const text = await holeText(song);
  const daten = {
    titel: song.title,
    kuenstler: song.primary_artist ? song.primary_artist.name : '',
    treffer: zaehle(text, phrase, ganzwort),
    woerter: zaehleWoerter(text),
    text,
  };
  letzteAnsicht = { typ: 'lied', phrase, daten, ganzwort };
  renderLied();
}

function renderLied() {
  const { phrase, daten, ganzwort } = letzteAnsicht;
  const w = werte(daten.treffer, daten.woerter);

  ergTitel.textContent = '„' + phrase + '" in „' + daten.titel + '"' +
    (daten.kuenstler ? ' (' + daten.kuenstler + ')' : '');
  diagramm.innerHTML = '';

  diagramm.appendChild(el('div', { class: 'lied-zusammenfassung' }, [
    el('span', { class: 'wert-haupt', text: w.haupt }),
    el('span', { class: 'wert-neben', text: w.neben + ' · von ' + daten.woerter + ' Wörtern' }),
  ]));
  diagramm.appendChild(el('div', {
    class: 'volltext',
    html: daten.text ? markiere(daten.text, phrase, ganzwort) : '(Der Text konnte nicht geladen werden.)',
  }));

  setStatus('Fertig.');
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
  if (!phrase || !name) return;

  losBtn.disabled = true;
  ergebnis.hidden = true;
  diagramm.innerHTML = '';
  try {
    if (filterEl.value === 'album') await analyseAlbum(name, phrase, ganzwort);
    else if (filterEl.value === 'lied') await analyseLied(name, phrase, ganzwort);
    else await analyseKuenstler(name, phrase, ganzwort, anzahl);
  } catch (err) {
    setStatus('Fehler: ' + err.message +
      ' – gerade ist offenbar kein Vermittler-Dienst erreichbar. Bitte in ein paar Sekunden erneut auf „Analysieren" klicken.', true);
  } finally {
    losBtn.disabled = false;
  }
});

// ---------- Web-App installierbar machen ----------
// Service Worker registrieren (funktioniert nur über http/https, nicht bei
// direktem Öffnen der Datei). Fehler werden bewusst ignoriert.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
