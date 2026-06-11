// Songtext-Analyse – Live-Daten aus MusicBrainz (Discographie) + lyrics.ovh (Texte).
// Alles läuft im Browser, ohne Server. Künstler werden im localStorage zwischengespeichert.

const SONSTIGE = "Sonstige";
const CACHE_KEY = "songtext-analyse:library:v1";
const MB_BASE = "https://musicbrainz.org/ws/2";
const LYRICS_BASE = "https://api.lyrics.ovh/v1";
const MAX_ALBUMS = 20;          // pro Künstler – große Discographien begrenzen
const LYRICS_PARALLEL = 4;      // gleichzeitige Lyrics-Anfragen
const MB_DELAY_MS = 1100;       // MusicBrainz erlaubt ~1 Anfrage pro Sekunde

const els = {
  search: document.getElementById("search-input"),
  filterType: document.getElementById("filter-type"),
  filterValue: document.getElementById("filter-value"),
  filterValueList: document.getElementById("filter-value-list"),
  periodRange: document.getElementById("period-range"),
  yearFrom: document.getElementById("year-from"),
  yearTo: document.getElementById("year-to"),
  runButton: document.getElementById("run-button"),
  status: document.getElementById("status-line"),
  progress: document.getElementById("progress"),
  progressBar: document.getElementById("progress-bar"),
  libraryList: document.getElementById("library-list"),
  libraryEmpty: document.getElementById("library-empty"),
  chartCanvas: document.getElementById("main-chart"),
  details: document.getElementById("details"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modal-title"),
  modalMeta: document.getElementById("modal-meta"),
  modalLyrics: document.getElementById("modal-lyrics"),
  modalClose: document.getElementById("modal-close"),
};

let chart = null;
let artistLookup = new Map();
let albumLookup = new Map();
let isLoading = false;

// ===== Bibliothek (localStorage) =====
function loadLibrary() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveLibrary() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(library));
  } catch (e) {
    console.warn("Cache konnte nicht gespeichert werden:", e);
  }
}
let library = loadLibrary();

function libraryArtists() {
  return Object.values(library).sort((a, b) => a.name.localeCompare(b.name));
}
function libraryAlbums() {
  const out = [];
  for (const a of libraryArtists()) {
    for (const alb of a.albums) {
      out.push({ artist: a.name, album: alb.title, year: alb.year });
    }
  }
  return out.sort(
    (x, y) => x.artist.localeCompare(y.artist) || x.album.localeCompare(y.album)
  );
}
function libraryAllSongs() {
  const out = [];
  for (const a of libraryArtists()) {
    for (const alb of a.albums) {
      for (const s of alb.songs) {
        out.push({
          artist: a.name,
          album: alb.title,
          albumLabel: alb.title || SONSTIGE,
          year: alb.year,
          title: s.title,
          lyrics: s.lyrics,
        });
      }
    }
  }
  return out;
}

// ===== MusicBrainz =====
async function mbSearchArtist(name) {
  const url = `${MB_BASE}/artist/?query=${encodeURIComponent("artist:" + name)}&fmt=json&limit=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MusicBrainz-Suche fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return data.artists || [];
}
async function mbReleaseGroups(mbid) {
  const url = `${MB_BASE}/release-group?artist=${mbid}&type=album&limit=100&fmt=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MusicBrainz Discographie fehlgeschlagen (${res.status})`);
  const data = await res.json();
  // Nur reguläre Studio-Alben (keine Compilations, Live, Soundtrack etc.)
  return (data["release-groups"] || []).filter(
    (rg) => !rg["secondary-types"] || rg["secondary-types"].length === 0
  );
}
async function mbTracksForReleaseGroup(rgid) {
  const url = `${MB_BASE}/release?release-group=${rgid}&inc=recordings&fmt=json&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MusicBrainz Tracks fehlgeschlagen (${res.status})`);
  const data = await res.json();
  const release = (data.releases || [])[0];
  if (!release) return [];
  const tracks = [];
  for (const media of release.media || []) {
    for (const tr of media.tracks || []) {
      if (tr.title) tracks.push({ title: tr.title });
    }
  }
  return tracks;
}

// ===== lyrics.ovh =====
async function fetchLyrics(artist, title) {
  try {
    const url = `${LYRICS_BASE}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return (data && data.lyrics) ? data.lyrics : null;
  } catch {
    return null;
  }
}

// ===== Hilfen =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runInParallel(items, max, worker, onProgress) {
  const results = new Array(items.length);
  let i = 0;
  let done = 0;
  const run = async () => {
    while (true) {
      const my = i++;
      if (my >= items.length) return;
      results[my] = await worker(items[my], my);
      done++;
      onProgress?.(done, items.length);
    }
  };
  const lanes = [];
  for (let k = 0; k < Math.min(max, items.length); k++) lanes.push(run());
  await Promise.all(lanes);
  return results;
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = keyFn(it);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}

// ===== Künstler live laden =====
async function loadArtistLive(name) {
  setProgress(0, "Suche Künstler bei MusicBrainz…");
  const candidates = await mbSearchArtist(name);
  if (!candidates.length) throw new Error(`Künstler „${name}" nicht gefunden.`);
  const artist = candidates[0];
  await sleep(MB_DELAY_MS);

  setProgress(5, `Lade Alben von ${artist.name}…`);
  let groups = await mbReleaseGroups(artist.id);
  groups.sort((a, b) =>
    (a["first-release-date"] || "9999").localeCompare(b["first-release-date"] || "9999")
  );
  groups = dedupeBy(groups, (g) => g.title.toLowerCase()).slice(0, MAX_ALBUMS);
  await sleep(MB_DELAY_MS);

  // Tracks pro Album (sequentiell, wegen Rate-Limit)
  const albums = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const pct = 5 + Math.round((i / groups.length) * 45);
    setProgress(pct, `Lade Tracks: „${g.title}" (${i + 1}/${groups.length})…`);
    try {
      const tracks = await mbTracksForReleaseGroup(g.id);
      const yr = parseInt((g["first-release-date"] || "").slice(0, 4), 10);
      albums.push({
        title: g.title,
        year: Number.isFinite(yr) ? yr : null,
        songs: dedupeBy(tracks, (t) => t.title.toLowerCase()).map((t) => ({
          title: t.title,
          lyrics: null,
        })),
      });
    } catch (e) {
      console.warn("Album übersprungen:", g.title, e.message);
    }
    await sleep(MB_DELAY_MS);
  }

  // Lyrics holen (parallel)
  const lyricTasks = [];
  for (const alb of albums) {
    for (const s of alb.songs) lyricTasks.push({ artist: artist.name, ref: s });
  }
  await runInParallel(
    lyricTasks,
    LYRICS_PARALLEL,
    async ({ artist: a, ref }) => {
      ref.lyrics = await fetchLyrics(a, ref.title);
    },
    (done, total) => {
      const pct = 50 + Math.round((done / total) * 50);
      setProgress(pct, `Lade Songtexte (${done}/${total})…`);
    }
  );

  const entry = {
    name: artist.name,
    mbid: artist.id,
    albums,
    loadedAt: Date.now(),
  };
  library[artist.name.toLowerCase()] = entry;
  saveLibrary();
  return entry;
}

// ===== UI: Status & Progress =====
function setStatus(text) {
  els.status.textContent = text;
}
function setProgress(percent, text) {
  if (percent === null) {
    els.progress.classList.add("hidden");
    els.progressBar.style.width = "0%";
  } else {
    els.progress.classList.remove("hidden");
    els.progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
  if (text !== undefined) setStatus(text);
}

function setBusy(busy) {
  isLoading = busy;
  els.runButton.disabled = busy;
}

// ===== Bibliotheks-Panel =====
function renderLibraryPanel() {
  const artists = libraryArtists();
  els.libraryEmpty.classList.toggle("hidden", artists.length > 0);
  els.libraryList.innerHTML = artists
    .map(
      (a) =>
        `<li><span>${escapeHtml(a.name)} <span class="meta">(${a.albums.length} Alben)</span></span>
         <button data-remove="${escapeAttr(a.name.toLowerCase())}" title="Aus Bibliothek entfernen">×</button></li>`
    )
    .join("");
  els.libraryList.querySelectorAll("button[data-remove]").forEach((b) =>
    b.addEventListener("click", () => {
      delete library[b.dataset.remove];
      saveLibrary();
      renderLibraryPanel();
    })
  );
  populateFilterValue();
}

// ===== Filter-Suchfeld =====
function populateFilterValue() {
  const type = els.filterType.value;
  if (type === "period") {
    els.filterValue.classList.add("hidden");
    els.periodRange.classList.remove("hidden");
    initYearRange();
    return;
  }
  els.filterValue.classList.remove("hidden");
  els.periodRange.classList.add("hidden");

  let labels = [];
  if (type === "artist") {
    els.filterValue.placeholder = "Künstlernamen tippen (neu = live laden)…";
    artistLookup = new Map();
    const artists = libraryArtists().map((a) => a.name);
    artists.forEach((a) => artistLookup.set(a.toLowerCase(), a));
    labels = artists;
  } else if (type === "album") {
    els.filterValue.placeholder = "Album aus Bibliothek suchen…";
    albumLookup = new Map();
    const seen = new Set();
    for (const it of libraryAlbums()) {
      const label = `${it.artist} – ${it.album}`;
      const key = label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        albumLookup.set(key, { artist: it.artist, album: it.album });
        labels.push(label);
      }
    }
  }
  els.filterValueList.innerHTML = labels
    .map((l) => `<option value="${escapeAttr(l)}"></option>`)
    .join("");
}

function initYearRange() {
  const all = libraryAllSongs().filter((s) => Number.isFinite(s.year));
  if (!all.length) {
    els.yearFrom.value = "";
    els.yearTo.value = "";
    return;
  }
  const years = all.map((s) => s.year);
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (!els.yearFrom.value) els.yearFrom.value = min;
  if (!els.yearTo.value) els.yearTo.value = max;
  els.yearFrom.min = min;
  els.yearTo.min = min;
  els.yearFrom.max = max;
  els.yearTo.max = max;
}

// ===== Treffer zählen =====
function countMatches(text, query) {
  if (!query || !text) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let count = 0;
  let from = 0;
  while (true) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) break;
    count++;
    from = i + needle.length;
  }
  return count;
}

// ===== Auswertung =====
async function runAnalysis() {
  if (isLoading) {
    setStatus("Es läuft schon eine Auswertung – bitte warten.");
    return;
  }
  const query = els.search.value.trim();
  const type = els.filterType.value;
  setStatus(`Auswertung gestartet (Filter: ${type}, Suchwort: „${query || "—"}")…`);
  if (!query) {
    setStatus("Bitte oben ein Wort oder eine Phrase eingeben.");
    return;
  }
  try {
    if (type === "artist") await renderByArtist(query);
    else if (type === "album") renderByAlbum(query);
    else if (type === "period") renderByPeriod(query);
  } catch (e) {
    console.error(e);
    setStatus(`Fehler: ${e.message || e}`);
    setProgress(null);
    setBusy(false);
  }
}

// ----- Künstler-Filter (live laden, falls nötig) -----
async function renderByArtist(query) {
  const input = els.filterValue.value.trim();
  if (!input) {
    setStatus("Bitte einen Künstlernamen eingeben.");
    return;
  }
  let entry = library[input.toLowerCase()];
  if (!entry) {
    setBusy(true);
    setProgress(0, `Lade „${input}" – das kann ein paar Minuten dauern…`);
    try {
      entry = await loadArtistLive(input);
    } finally {
      setBusy(false);
      setProgress(null);
      renderLibraryPanel();
    }
  }
  drawArtist(entry, query);
}

function drawArtist(entry, query) {
  const albumStats = entry.albums.map((alb) => {
    const songs = alb.songs.map((s) => ({
      ...s,
      count: countMatches(s.lyrics, query),
    }));
    return {
      album: alb.title || SONSTIGE,
      year: alb.year,
      songs,
      total: songs.reduce((a, b) => a + b.count, 0),
      hasLyrics: songs.some((s) => s.lyrics !== null),
    };
  });
  albumStats.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

  drawBarChart({
    labels: albumStats.map((a) => `${a.album}${a.year ? ` (${a.year})` : ""}`),
    values: albumStats.map((a) => a.total),
    title: `„${query}" bei ${entry.name} – pro Album`,
    yLabel: "Treffer gesamt",
  });

  els.details.innerHTML = albumStats
    .map((a) => {
      const items = a.songs
        .sort((x, y) => y.count - x.count || x.title.localeCompare(y.title))
        .map((s) => {
          const noLyrics = s.lyrics === null;
          return `<li>
            <span class="song-title">${escapeHtml(s.title)}${noLyrics ? ' <span class="meta">(kein Text)</span>' : ""}</span>
            <span class="song-count">${s.count}×</span>
          </li>`;
        })
        .join("");
      return `<div class="album-group">
        <h3>${escapeHtml(a.album)} <span class="meta">${a.year ? `· ${a.year}` : ""} · ${a.total} Treffer</span></h3>
        <ul class="song-list">${items}</ul>
      </div>`;
    })
    .join("");

  const total = albumStats.reduce((s, a) => s + a.total, 0);
  const missing = entry.albums.flatMap((a) => a.songs).filter((s) => s.lyrics === null).length;
  setStatus(`„${query}" – ${total} Treffer bei ${entry.name}.${missing ? ` (${missing} Lieder ohne verfügbaren Text)` : ""}`);
}

// ----- Album-Filter -----
function renderByAlbum(query) {
  const input = els.filterValue.value.trim();
  if (!input) {
    setStatus("Bitte ein Album aus der Bibliothek auswählen.");
    return;
  }
  const ref = albumLookup.get(input.toLowerCase());
  if (!ref) {
    setStatus(`Album „${input}" ist nicht in der Bibliothek. Lade erst den Künstler über den „Künstler"-Filter.`);
    return;
  }
  const artistEntry = library[ref.artist.toLowerCase()];
  const album = artistEntry?.albums.find((a) => a.title === ref.album);
  if (!album) {
    setStatus("Album in der Bibliothek nicht gefunden.");
    return;
  }
  const counted = album.songs.map((s) => ({
    ...s,
    count: countMatches(s.lyrics, query),
    artist: ref.artist,
    album: ref.album,
    year: album.year,
    id: `${ref.artist}::${ref.album}::${s.title}`,
  }));

  drawBarChart({
    labels: counted.map((s) => s.title),
    values: counted.map((s) => s.count),
    title: `„${query}" – ${ref.artist}: ${ref.album}`,
    yLabel: "Treffer",
  });

  els.details.innerHTML = counted
    .map((s) => {
      const noLyrics = s.lyrics === null;
      return `<div class="song-row">
        <div>
          <strong>${escapeHtml(s.title)}</strong>
          <div class="meta">${s.count} Treffer${album.year ? ` · ${album.year}` : ""}${noLyrics ? " · kein Text verfügbar" : ""}</div>
        </div>
        <button class="btn-secondary" data-song-id="${escapeAttr(s.id)}" data-query="${escapeAttr(query)}" ${noLyrics ? "disabled" : ""}>
          Songtext anzeigen
        </button>
      </div>`;
    })
    .join("");

  els.details.querySelectorAll("button[data-song-id]").forEach((btn) =>
    btn.addEventListener("click", () =>
      openLyricsModalById(btn.dataset.songId, btn.dataset.query)
    )
  );

  const total = counted.reduce((s, x) => s + x.count, 0);
  setStatus(`„${query}" – ${total} Treffer auf „${ref.album}".`);
}

// ----- Zeitraum-Filter -----
function renderByPeriod(query) {
  const songs = libraryAllSongs().filter((s) => Number.isFinite(s.year));
  if (!songs.length) {
    setStatus(`Bibliothek leer. Lade zuerst einen Künstler über den „Künstler"-Filter.`);
    return;
  }
  const from = Number(els.yearFrom.value);
  const to = Number(els.yearTo.value);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    setStatus("Bitte einen gültigen Zeitraum eingeben (Von ≤ Bis).");
    return;
  }

  const byYear = new Map();
  for (let y = from; y <= to; y++) byYear.set(y, { count: 0, songs: [] });

  for (const s of songs) {
    if (s.year < from || s.year > to) continue;
    const c = countMatches(s.lyrics, query);
    const e = byYear.get(s.year);
    if (!e) continue;
    e.count += c;
    if (c > 0) e.songs.push({ ...s, count: c });
  }

  const years = [...byYear.keys()];
  drawBarChart({
    labels: years.map(String),
    values: years.map((y) => byYear.get(y).count),
    title: `„${query}" pro Jahr (${from}–${to}) – Bibliothek`,
    yLabel: "Treffer",
  });

  els.details.innerHTML = years
    .map((y) => {
      const e = byYear.get(y);
      return `<div class="year-row">
        <h3>${y} <span class="meta">– ${e.count} Treffer</span></h3>
        <button class="btn-secondary" data-year="${y}" ${e.songs.length === 0 ? "disabled" : ""}>Welche Lieder?</button>
        <div class="year-songs hidden" data-year-list="${y}"></div>
      </div>`;
    })
    .join("");

  els.details.querySelectorAll("button[data-year]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const y = btn.dataset.year;
      const list = els.details.querySelector(`[data-year-list="${y}"]`);
      const e = byYear.get(Number(y));
      if (!list || !e) return;
      list.classList.toggle("hidden");
      list.innerHTML = `<ul class="song-list">${e.songs
        .sort((a, b) => b.count - a.count)
        .map(
          (s) =>
            `<li><span class="song-title">${escapeHtml(s.artist)} – ${escapeHtml(s.title)}</span><span class="song-count">${s.count}×</span></li>`
        )
        .join("")}</ul>`;
    })
  );

  const total = years.reduce((sum, y) => sum + byYear.get(y).count, 0);
  setStatus(`„${query}" – ${total} Treffer zwischen ${from} und ${to} (Bibliothek mit ${libraryArtists().length} Künstler/n).`);
}

// ===== Diagramm =====
function drawBarChart({ labels, values, title, yLabel }) {
  if (chart) chart.destroy();
  chart = new Chart(els.chartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: yLabel, data: values, backgroundColor: "#2f6feb", borderRadius: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: title, font: { size: 14 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} Treffer` } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: yLabel } },
        x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } },
      },
    },
  });
}

// ===== Songtext-Modal =====
function openLyricsModalById(id, query) {
  const [artist, album, title] = id.split("::");
  const entry = library[artist.toLowerCase()];
  const alb = entry?.albums.find((a) => a.title === album);
  const song = alb?.songs.find((s) => s.title === title);
  if (!song || song.lyrics === null) return;
  els.modalTitle.textContent = song.title;
  els.modalMeta.textContent = `${artist} · ${album}${alb.year ? ` · ${alb.year}` : ""}`;
  els.modalLyrics.innerHTML = highlight(song.lyrics, query);
  els.modal.classList.remove("hidden");
}
function closeModal() {
  els.modal.classList.add("hidden");
}
function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  return safe.replace(new RegExp(escapeRegex(query), "gi"), (m) => `<mark class="hit">${m}</mark>`);
}

// ===== Helfer =====
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s) { return escapeHtml(s); }
function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ===== Globaler Fehler-Anzeiger (damit Bugs sichtbar werden) =====
window.addEventListener("error", (e) => {
  if (els.status) setStatus(`Skript-Fehler: ${e.message} (${e.filename?.split("/").pop()}:${e.lineno})`);
});
window.addEventListener("unhandledrejection", (e) => {
  if (els.status) setStatus(`Unbehandelter Fehler: ${e.reason?.message || e.reason}`);
});

// ===== Events =====
els.filterType.addEventListener("change", populateFilterValue);
els.runButton.addEventListener("click", () => {
  setStatus("Klick registriert, starte…");
  runAnalysis();
});
els.search.addEventListener("keydown", (e) => { if (e.key === "Enter") runAnalysis(); });
els.filterValue.addEventListener("keydown", (e) => { if (e.key === "Enter") runAnalysis(); });
els.modalClose.addEventListener("click", closeModal);
els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ===== Start =====
renderLibraryPanel();
const cnt = libraryArtists().length;
setStatus(cnt
  ? `${cnt} Künstler in der Bibliothek geladen.`
  : `Tippe einen Künstlernamen ins Filter-Suchfeld und klicke „Auswerten" – die App lädt Discographie und Texte live.`);
