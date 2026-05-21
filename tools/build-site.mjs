#!/usr/bin/env node
// =============================================================================
//  Seminar-Website-Generator
// -----------------------------------------------------------------------------
//  Durchsucht die Themenordner nach Projekten (jeder Ordner mit einer
//  `projekt.md`) und baut daraus eine statische Übersichts-Website in `_site/`.
//
//  Aufruf:  node tools/build-site.mjs
//
//  Wichtig: Dieses Skript darf NIE wegen eines einzelnen kaputten Projekts
//  abbrechen. Fehler werden pro Projekt abgefangen, das Projekt erscheint dann
//  als "nur Code" und die restliche Seite wird trotzdem gebaut.
// =============================================================================

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');

// GitHub-Repo (für "Code ansehen"-Links). In der CI von GitHub gesetzt.
const REPO = process.env.GITHUB_REPOSITORY || 'digimuwi/vibe-coding-seminar';
const REPO_URL = `https://github.com/${REPO}`;
const BRANCH = 'main';

// Bekannte Themengebiete mit hübschem Namen + Symbol. Unbekannte Ordner mit
// Projekten werden ebenfalls aufgenommen (mit ihrem Ordnernamen als Titel).
const THEMES = {
  musikanalyse:    { label: 'Musikanalyse' },
  musikgeschichte: { label: 'Musikgeschichte' },
  wissenschaft:    { label: 'Wissenschaft' },
  praxis:          { label: 'Praxis' },
};

// Ordner, die nie als Themengebiet gelten.
const IGNORE_DIRS = new Set([
  '.git', '.github', '.claude', 'node_modules', '_site', 'tools', 'folien',
]);

// Dateien/Ordner, die nicht in die Website kopiert werden.
const COPY_EXCLUDE = new Set(['.git', '.claude', 'node_modules', '.DS_Store']);

const log = (...a) => console.log('[site]', ...a);
const warn = (...a) => console.warn('[site] ⚠ ', ...a);

// ---------------------------------------------------------------------------
//  Hilfsfunktionen
// ---------------------------------------------------------------------------

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Sehr einfacher Frontmatter-Parser: flache `schlüssel: wert`-Zeilen zwischen
// zwei `---`-Linien. Bewusst tolerant, damit Tippfehler nichts kaputt machen.
function parseProjekt(raw) {
  const data = {};
  let body = raw;
  const m = raw.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^\s*([\wäöüÄÖÜß-]+)\s*:\s*(.*)$/);
      if (!kv) continue;
      let v = kv[2].trim().replace(/^["']|["']$/g, '');
      data[kv[1].trim().toLowerCase()] = v;
    }
    body = m[2];
  }
  return { data, body: body.trim() };
}

// Minimaler Markdown→HTML-Renderer (Überschriften, Listen, fett/kursiv/Code,
// Links, Absätze). Reicht für Projektbeschreibungen.
function md(src = '') {
  const inline = (t) =>
    esc(t)
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,
        '<a href="$1-PLACEHOLDER" rel="noopener">$1</a>'.replace('$1-PLACEHOLDER', '$2" target="_blank'));
  const lines = src.split(/\r?\n/);
  const out = [];
  let list = null;       // 'ul' | 'ol' | null
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) { flushPara(); closeList(); const n = h[1].length; out.push(`<h${n + 2}>${inline(h[2])}</h${n + 2}>`); }
    else if (ul) { flushPara(); if (list !== 'ul') { closeList(); list = 'ul'; out.push('<ul>'); } out.push(`<li>${inline(ul[1])}</li>`); }
    else if (ol) { flushPara(); if (list !== 'ol') { closeList(); list = 'ol'; out.push('<ol>'); } out.push(`<li>${inline(ol[1])}</li>`); }
    else if (line.trim() === '') { flushPara(); closeList(); }
    else { para.push(line.trim()); }
  }
  flushPara(); closeList();
  return out.join('\n');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (s) => !COPY_EXCLUDE.has(path.basename(s)),
  });
}

// ---------------------------------------------------------------------------
//  Projekte einsammeln
// ---------------------------------------------------------------------------

function discoverThemes() {
  const themeDirs = fs.readdirSync(ROOT)
    .filter((name) => !name.startsWith('.') && !IGNORE_DIRS.has(name) && isDir(path.join(ROOT, name)));
  const themes = [];
  for (const dir of themeDirs) {
    const meta = THEMES[dir] || { label: dir.charAt(0).toUpperCase() + dir.slice(1) };
    const projects = discoverProjects(dir);
    if (projects.length) themes.push({ dir, ...meta, projects });
  }
  // Bekannte Themen zuerst, in definierter Reihenfolge.
  const order = Object.keys(THEMES);
  themes.sort((a, b) => {
    const ia = order.indexOf(a.dir), ib = order.indexOf(b.dir);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.dir.localeCompare(b.dir);
  });
  return themes;
}

function discoverProjects(themeDir) {
  const base = path.join(ROOT, themeDir);
  const out = [];
  for (const name of fs.readdirSync(base)) {
    const dir = path.join(base, name);
    if (!isDir(dir)) continue;
    const mdPath = path.join(dir, 'projekt.md');
    if (!isFile(mdPath)) continue;
    try {
      out.push(buildProject(themeDir, name, dir, mdPath));
    } catch (e) {
      warn(`Projekt "${themeDir}/${name}" konnte nicht gelesen werden:`, e.message);
    }
  }
  out.sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  return out;
}

function buildProject(themeDir, slug, dir, mdPath) {
  const { data, body } = parseProjekt(fs.readFileSync(mdPath, 'utf8'));
  const proj = {
    themeDir, slug, dir,
    titel: data.titel || slug,
    studierende: data.studierende || data.studierender || data.autor || '',
    typ: (data.typ || '').toLowerCase(),
    live: data.live || '',
    download: data.download || '',
    start: data.start || 'index.html',
    bauen: (data.bauen || 'nein').toLowerCase(),
    ausgabe: data.ausgabe || 'dist',
    bodyHtml: md(body),
    codeUrl: `${REPO_URL}/tree/${BRANCH}/${themeDir}/${slug}`,
    appUrl: '',      // gefüllt unten
    note: '',        // optionaler Hinweis (z.B. Build fehlgeschlagen)
  };

  const publicRel = path.posix.join('p', themeDir, slug);
  const publicDir = path.join(OUT, 'p', themeDir, slug);

  // 1) Externe Live-URL hat Vorrang.
  if (proj.live) {
    proj.appUrl = proj.live;
    proj.external = true;
    return proj;
  }

  // 2) Projekt mit Build-Schritt (z.B. Vite/React).
  if (proj.bauen === 'npm') {
    const built = tryBuild(proj);
    if (built) {
      copyDir(path.join(dir, proj.ausgabe), publicDir);
      proj.appUrl = path.posix.join(publicRel, 'index.html');
    } else {
      proj.note = 'Die App konnte nicht automatisch gebaut werden — bitte den Build-Fehler im Projekt beheben.';
    }
    return proj;
  }

  // 3) Statisches Projekt: Ordner kopieren, auf Startdatei verlinken.
  if (isFile(path.join(dir, proj.start))) {
    copyDir(dir, publicDir);
    proj.appUrl = path.posix.join(publicRel, proj.start);
  }
  return proj;
}

function tryBuild(proj) {
  log(`Baue ${proj.themeDir}/${proj.slug} …`);
  const opts = { cwd: proj.dir, stdio: 'inherit', timeout: 8 * 60 * 1000 };
  try {
    if (isFile(path.join(proj.dir, 'package-lock.json'))) {
      execSync('npm ci', opts);
    } else {
      execSync('npm install', opts);
    }
    execSync('npm run build', opts);
    if (!isDir(path.join(proj.dir, proj.ausgabe))) {
      warn(`Build von ${proj.slug} erzeugte keinen Ordner "${proj.ausgabe}".`);
      return false;
    }
    return true;
  } catch (e) {
    warn(`Build von ${proj.slug} fehlgeschlagen:`, e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
//  HTML rendern
// ---------------------------------------------------------------------------

function projectCard(p) {
  const buttons = [];
  if (p.appUrl) {
    const ext = p.external ? ' target="_blank" rel="noopener"' : '';
    buttons.push(`<a class="btn btn-primary" href="${esc(p.appUrl)}"${ext}>▶ App öffnen</a>`);
  }
  if (p.download) {
    buttons.push(`<a class="btn" href="${esc(p.download)}" target="_blank" rel="noopener">⬇ Download</a>`);
  }
  buttons.push(`<a class="btn btn-ghost" href="${esc(p.codeUrl)}" target="_blank" rel="noopener">&lt;/&gt; Code ansehen</a>`);

  const studierende = p.studierende
    ? `<p class="who">${esc(p.studierende)}</p>` : '';
  const note = p.note ? `<p class="note">${esc(p.note)}</p>` : '';

  return `
    <article class="card">
      <header class="card-head"><h3>${esc(p.titel)}</h3></header>
      ${studierende}
      <div class="desc">${p.bodyHtml || '<p class="muted">Noch keine Beschreibung.</p>'}</div>
      ${note}
      <div class="actions">${buttons.join('')}</div>
    </article>`;
}

function themeSection(t) {
  return `
    <section class="theme" id="${esc(t.dir)}">
      <h2>${esc(t.label)}
        <span class="count">${t.projects.length}</span></h2>
      <div class="grid">${t.projects.map(projectCard).join('')}</div>
    </section>`;
}

function renderPage(themes, totalProjects) {
  const nav = themes
    .map((t) => `<a href="#${esc(t.dir)}">${esc(t.label)}</a>`)
    .join('');
  const sections = themes.length
    ? themes.map(themeSection).join('')
    : `<p class="empty">Noch keine Projekte. Lege einen Projektordner mit einer
       <code>projekt.md</code> an und pushe ihn — dann erscheint er hier automatisch.</p>`;
  const now = new Date().toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'short' });

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vibe Coding-Seminar · Projekte</title>
<meta name="description" content="Projekte aus dem Vibe Coding-Seminar (SoSe 26).">
<style>
  :root{
    --paper:#ffffff; --card:#ffffff; --ink:#1b1b1b; --muted:#6b6b6b;
    --accent:#8a3a2a; --accent2:#b5662f; --rule:#e3e3e3; --shadow:rgba(0,0,0,.07);
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.55;}
  a{color:var(--accent)}
  .wrap{max-width:1100px;margin:0 auto;padding:0 20px}
  header.hero{background:#fff;
    border-bottom:1px solid var(--rule);padding:48px 0 28px;text-align:center}
  header.hero h1{font-family:"Iowan Old Style",Palatino,Georgia,serif;
    font-size:clamp(28px,5vw,46px);margin:0 0 8px;color:var(--accent)}
  header.hero p{margin:0;color:var(--muted);font-size:18px}
  nav.themes{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.92);
    backdrop-filter:blur(6px);border-bottom:1px solid var(--rule)}
  nav.themes .wrap{display:flex;flex-wrap:wrap;gap:6px;padding:10px 20px}
  nav.themes a{padding:6px 12px;border-radius:999px;text-decoration:none;
    font-size:14px;color:var(--ink);border:1px solid transparent}
  nav.themes a:hover{border-color:var(--rule);background:var(--card)}
  main{padding:32px 0 64px}
  .theme{margin:0 0 44px}
  .theme h2{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-size:26px;
    border-bottom:2px solid var(--rule);padding-bottom:8px;display:flex;align-items:center;gap:10px}
  .count{margin-left:auto;font-size:13px;font-weight:600;color:var(--muted);
    background:var(--card);border:1px solid var(--rule);border-radius:999px;padding:2px 10px}
  .grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));margin-top:18px}
  .card{background:var(--card);border:1px solid var(--rule);border-radius:14px;
    padding:18px 18px 16px;box-shadow:0 1px 3px var(--shadow);display:flex;flex-direction:column}
  .card-head{display:flex;align-items:center;gap:10px;margin-bottom:2px}
  .card h3{margin:0;font-size:19px}
  .who{margin:6px 0 12px;color:var(--accent);font-size:16px;font-weight:700;letter-spacing:.1px}
  .desc{font-size:15px;flex:1}
  .desc :first-child{margin-top:0}
  .desc h3,.desc h4,.desc h5{margin:.6em 0 .2em;font-size:15px}
  .desc code{background:#f1f1f1;padding:1px 5px;border-radius:5px;font-size:13px}
  .note{font-size:13px;color:var(--accent);background:#f6f6f6;border:1px solid var(--rule);
    border-radius:8px;padding:8px 10px;margin:10px 0 0}
  .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .btn{display:inline-block;text-decoration:none;font-size:14px;font-weight:600;
    padding:8px 14px;border-radius:9px;border:1px solid var(--rule);color:var(--ink);background:#fff}
  .btn:hover{border-color:var(--accent2)}
  .btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}
  .btn-primary:hover{background:var(--accent2);border-color:var(--accent2)}
  .btn-ghost{background:transparent}
  .muted{color:var(--muted)}
  .empty{background:var(--card);border:1px dashed var(--rule);border-radius:12px;
    padding:24px;text-align:center;color:var(--muted)}
  footer{border-top:1px solid var(--rule);padding:24px 0;color:var(--muted);font-size:13px;text-align:center}
  footer code{background:var(--card);padding:1px 6px;border-radius:5px}
</style>
</head>
<body>
  <header class="hero">
    <div class="wrap">
      <h1>Vibe Coding-Seminar</h1>
      <p>Projekte aus dem Seminar (SoSe&nbsp;26) · ${totalProjects} Projekt${totalProjects === 1 ? '' : 'e'}</p>
    </div>
  </header>
  <nav class="themes"><div class="wrap">${nav}</div></nav>
  <main><div class="wrap">${sections}</div></main>
  <footer><div class="wrap">
    Automatisch erzeugt am ${esc(now)} ·
    <a href="${REPO_URL}" target="_blank" rel="noopener">Quellcode auf GitHub</a> ·
    Neues Projekt? Ordner mit <code>projekt.md</code> anlegen und pushen.
  </div></footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
//  Hauptprogramm
// ---------------------------------------------------------------------------

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // GitHub Pages: kein Jekyll

  const themes = discoverThemes();
  const total = themes.reduce((n, t) => n + t.projects.length, 0);
  fs.writeFileSync(path.join(OUT, 'index.html'), renderPage(themes, total));

  log(`Fertig: ${total} Projekt(e) in ${themes.length} Themengebiet(en) → ${path.relative(ROOT, OUT)}/`);
  for (const t of themes) {
    for (const p of t.projects) {
      const status = p.appUrl ? (p.external ? 'extern' : 'App') : (p.note ? 'nur Code (Build-Fehler)' : 'nur Code');
      log(`  • ${t.dir}/${p.slug} — ${status}`);
    }
  }
}

main();
