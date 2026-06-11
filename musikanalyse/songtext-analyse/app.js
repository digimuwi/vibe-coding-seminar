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
const PROXY_TIMEOUT = 13000; // ms pro Dienst, dann zum nächsten
let bevorzugt = 0;           // zuletzt erfolgreicher Dienst – wird zuerst probiert
const MAX_LIEDER = 25; // Künstler-Modus: nur die bekanntesten Lieder
const PARALLEL = 4;    // gleichzeitige Abrufe

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const form = $('suche'), wortEl = $('wort'), filterEl = $('filter'),
  nameEl = $('name'), nameLabel = $('name-label'), losBtn = $('los'),
  statusEl = $('status'), ergebnis = $('ergebnis'), ergTitel = $('ergebnis-titel'),
  diagramm = $('diagramm'), overlay = $('overlay'), overlayTitel = $('overlay-titel'),
  overlayMeta = $('overlay-meta'), overlayInhalt = $('overlay-inhalt'),
  overlayZu = $('overlay-zu');

filterEl.addEventListener('change', () => {
  const album = filterEl.value === 'album';
  nameLabel.textContent = album ? 'Album' : 'Künstler';
  nameEl.placeholder = album ? 'z. B. 21' : 'z. B. Adele';
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
async function einProxy(idx, url) {
  const p = PROXIES[idx];
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
  // zuletzt erfolgreichen Dienst zuerst, dann der Reihe nach die übrigen
  const reihenfolge = [bevorzugt, ...PROXIES.map((_, i) => i)]
    .filter((v, i, a) => a.indexOf(v) === i);
  let letzterFehler;
  for (const idx of reihenfolge) {
    try {
      const inhalt = await einProxy(idx, url);
      bevorzugt = idx;
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
async function kuenstlerLieder(artistId) {
  const lieder = [];
  let page = 1;
  while (lieder.length < MAX_LIEDER && page) {
    const d = await jsonGet(GENIUS + '/artists/' + artistId +
      '/songs?per_page=20&page=' + page + '&sort=popularity');
    for (const s of (d.response.songs || [])) {
      lieder.push(s);
      if (lieder.length >= MAX_LIEDER) break;
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
    teile.push(tmp.textContent);
  });
  return teile.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function holeText(song) {
  const key = 'lyrics:' + song.id;
  const cached = localStorage.getItem(key);
  if (cached !== null) return cached;
  const text = parseLyrics(await proxyFetch(song.url));
  try { localStorage.setItem(key, text); } catch (e) { /* Speicher voll – egal */ }
  return text;
}

// ---------- Zählen & Markieren ----------
function zaehle(text, phrase) {
  if (!text || !phrase) return 0;
  const m = text.match(new RegExp(escapeRegex(phrase), 'gi'));
  return m ? m.length : 0;
}
function markiere(text, phrase) {
  const re = new RegExp(escapeRegex(phrase), 'gi');
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

// ---------- Analyse: Künstler ----------
async function analyseKuenstler(name, phrase) {
  setStatus('Suche Künstler „' + name + '" …');
  const artist = await findeKuenstler(name);
  if (!artist) return setStatus('Keinen Künstler dazu gefunden.', true);

  setStatus('Lade Liedliste von ' + artist.name + ' …');
  const lieder = await kuenstlerLieder(artist.id);
  if (!lieder.length) return setStatus('Keine Lieder gefunden.', true);

  const daten = (await poolKarte(lieder, async (s) => {
    const det = await songDetail(s.id);
    const text = await holeText(det);
    return { titel: det.title, album: det.album, treffer: zaehle(text, phrase) };
  }, (f, t) => setStatus('Lade Texte … ' + f + '/' + t))).filter(Boolean);

  renderKuenstler(artist, phrase, daten, lieder.length >= MAX_LIEDER);
}

function renderKuenstler(artist, phrase, daten, begrenzt) {
  const map = new Map();
  for (const d of daten) {
    const name = d.album && d.album.name ? d.album.name : 'Sonstige';
    if (!map.has(name)) map.set(name, { name, lieder: [], summe: 0 });
    const g = map.get(name);
    g.lieder.push(d);
    g.summe += d.treffer;
  }
  const gruppen = [...map.values()].sort((a, b) => {
    if (a.name === 'Sonstige') return 1;
    if (b.name === 'Sonstige') return -1;
    return b.summe - a.summe;
  });
  const max = Math.max(1, ...gruppen.map((g) => g.summe));
  const gesamt = daten.reduce((s, d) => s + d.treffer, 0);

  ergTitel.textContent = '„' + phrase + '" bei ' + artist.name +
    ' – ' + gesamt + '× in ' + daten.length + ' Liedern';
  diagramm.innerHTML = '';

  for (const g of gruppen) {
    const kopf = el('div', { class: 'album-kopf' }, [
      el('span', { class: 'titel', text: g.name }),
      el('span', { class: 'summe', text: g.summe + '×' }),
    ]);
    const spur = el('div', { class: 'album-spur' },
      el('div', { class: 'album-fuellung', style: 'width:' + (100 * g.summe / max) + '%' }));

    const maxLied = Math.max(1, ...g.lieder.map((l) => l.treffer));
    const liste = el('ul', { class: 'album-lieder' },
      g.lieder.sort((a, b) => b.treffer - a.treffer).map((l) =>
        el('li', {}, [
          el('span', { class: 'lied-titel', text: l.titel }),
          el('span', { class: 'mini-spur' },
            el('span', { class: 'mini-fuellung', style: 'width:' + (100 * l.treffer / maxLied) + '%' })),
          el('span', { class: 'lied-wert', text: l.treffer + '×' }),
        ])));

    diagramm.appendChild(el('div', { class: 'album-block' }, [kopf, spur, liste]));
  }

  setStatus('Fertig.' + (begrenzt
    ? ' Hinweis: nur die ' + MAX_LIEDER + ' bekanntesten Lieder wurden ausgewertet.'
    : ''));
  ergebnis.hidden = false;
}

// ---------- Analyse: Album ----------
async function analyseAlbum(name, phrase) {
  setStatus('Suche Album „' + name + '" …');
  const album = await findeAlbum(name);
  if (!album) return setStatus('Kein Album dazu gefunden.', true);

  setStatus('Lade Lieder von „' + album.name + '" …');
  const tracks = await albumLieder(album.id);
  if (!tracks.length) return setStatus('Keine Lieder im Album gefunden.', true);

  const daten = (await poolKarte(tracks, async (s) => {
    const text = await holeText(s);
    return { titel: s.title, treffer: zaehle(text, phrase), text };
  }, (f, t) => setStatus('Lade Texte … ' + f + '/' + t))).filter(Boolean);

  renderAlbum(album, phrase, daten);
}

function renderAlbum(album, phrase, daten) {
  const max = Math.max(1, ...daten.map((d) => d.treffer));
  const gesamt = daten.reduce((s, d) => s + d.treffer, 0);
  const kuenstler = album.artist ? album.artist.name : '';

  ergTitel.textContent = '„' + phrase + '" auf „' + album.name + '"' +
    (kuenstler ? ' (' + kuenstler + ')' : '') + ' – ' + gesamt + '×';
  diagramm.innerHTML = '';

  for (const d of daten) {
    const knopf = el('button', { class: 'text-knopf', text: 'Text anzeigen', attr: { type: 'button' } });
    knopf.addEventListener('click', () =>
      zeigeText(d.titel, kuenstler + ' · ' + d.treffer + ' Treffer', d.text, phrase));

    diagramm.appendChild(el('div', { class: 'lied-zeile' }, [
      el('span', { class: 'balken-label', text: d.titel }),
      el('span', { class: 'balken-spur' },
        el('span', { class: 'balken-fuellung', style: 'width:' + (100 * d.treffer / max) + '%' })),
      el('span', { class: 'balken-wert', text: d.treffer + '×' }),
      knopf,
    ]));
  }

  setStatus('Fertig. ' + daten.length + ' Lieder ausgewertet.');
  ergebnis.hidden = false;
}

// ---------- Overlay (Volltext) ----------
function zeigeText(titel, meta, text, phrase) {
  overlayTitel.textContent = titel;
  overlayMeta.textContent = meta;
  overlayInhalt.innerHTML = text
    ? markiere(text, phrase)
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
  if (!phrase || !name) return;

  losBtn.disabled = true;
  ergebnis.hidden = true;
  diagramm.innerHTML = '';
  try {
    if (filterEl.value === 'album') await analyseAlbum(name, phrase);
    else await analyseKuenstler(name, phrase);
  } catch (err) {
    setStatus('Fehler: ' + err.message +
      ' – gerade ist offenbar kein Vermittler-Dienst erreichbar. Bitte in ein paar Sekunden erneut auf „Analysieren" klicken.', true);
  } finally {
    losBtn.disabled = false;
  }
});
