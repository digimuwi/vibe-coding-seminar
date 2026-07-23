// Gehörbildung bilden — Prototyp
// Tasten von c¹ bis g² (deutsche Notation). Easy/Modus 2: c¹–c². Modus 3: c¹–g².

const ALL_WHITE = [
  { semi: 0,  name: "c¹", freq: 261.63 },
  { semi: 2,  name: "d¹", freq: 293.66 },
  { semi: 4,  name: "e¹", freq: 329.63 },
  { semi: 5,  name: "f¹", freq: 349.23 },
  { semi: 7,  name: "g¹", freq: 392.00 },
  { semi: 9,  name: "a¹", freq: 440.00 },
  { semi: 11, name: "h¹", freq: 493.88 },
  { semi: 12, name: "c²", freq: 523.25 },
  { semi: 14, name: "d²", freq: 587.33 },
  { semi: 16, name: "e²", freq: 659.25 },
  { semi: 17, name: "f²", freq: 698.46 },
  { semi: 19, name: "g²", freq: 783.99 },
];

const ALL_BLACK = [
  { semi: 1,  name: "cis¹", freq: 277.18 },
  { semi: 3,  name: "dis¹", freq: 311.13 },
  { semi: 6,  name: "fis¹", freq: 369.99 },
  { semi: 8,  name: "gis¹", freq: 415.30 },
  { semi: 10, name: "ais¹", freq: 466.16 },
  { semi: 13, name: "cis²", freq: 554.37 },
  { semi: 15, name: "dis²", freq: 622.25 },
  { semi: 18, name: "fis²", freq: 739.99 },
];

const EASY_MAX_SEMI = 12;  // c¹–c²
const HARD_MAX_SEMI = 19;  // c¹–g²

// Intervallnamen mit enharmonischer Alternative
const INTERVAL_NAMES_FULL = {
  0:  { primary: "Prime" },
  1:  { primary: "kleine Sekunde", alt: "übermäßige Prime" },
  2:  { primary: "große Sekunde",  alt: "verminderte Terz" },
  3:  { primary: "kleine Terz",    alt: "übermäßige Sekunde" },
  4:  { primary: "große Terz",     alt: "verminderte Quarte" },
  5:  { primary: "reine Quarte",   alt: "übermäßige Terz" },
  6:  { primary: "Tritonus",       alt: "übermäßige Quarte / verminderte Quinte" },
  7:  { primary: "reine Quinte",   alt: "verminderte Sexte" },
  8:  { primary: "kleine Sexte",   alt: "übermäßige Quinte" },
  9:  { primary: "große Sexte",    alt: "verminderte Septime" },
  10: { primary: "kleine Septime", alt: "übermäßige Sexte" },
  11: { primary: "große Septime",  alt: "verminderte Oktave" },
  12: { primary: "reine Oktave",   alt: "übermäßige Septime" },
};

// Welche Halbton-Anzahl entspricht welcher Qualität+Name-Kombination?
// undefined/fehlend = diese Kombination gibt es musikalisch nicht.
// Qualitäten: rein, gross, klein, vermindert, uebermaessig.
const QUALITY_INTERVAL_SEMITONES = {
  Prim:    { rein: 0,                          uebermaessig: 1  },
  Sekunde: { klein: 1,  gross: 2,  vermindert: 0,  uebermaessig: 3  },
  Terz:    { klein: 3,  gross: 4,  vermindert: 2,  uebermaessig: 5  },
  Quarte:  { rein: 5,                vermindert: 4,  uebermaessig: 6  },
  Quinte:  { rein: 7,                vermindert: 6,  uebermaessig: 8  },
  Sexte:   { klein: 8,  gross: 9,  vermindert: 7,  uebermaessig: 10 },
  Septime: { klein: 10, gross: 11, vermindert: 9,  uebermaessig: 12 },
  Oktave:  { rein: 12,               vermindert: 11, uebermaessig: 13 },
};

let level = "easy";        // "easy" | "mid" | "hard"
let mode = "normal";       // "normal" | "intervalle"
let selectedSemi = null;
let currentTask = null;    // { semitones, direction, first, second } im Quiz-Modus
let quizSelection = { qual: null, name: null, dir: null, tritonus: false };

// Einstellungen des Quiz (über das Menü oben rechts steuerbar)
let quizSettings = {
  play: "einzeln",    // "einzeln" (melodisch) | "gleichzeitig" (harmonisch)
  range: "standard",  // "standard" (c¹–c²) | "mehr" (c¹–g²)
  octave: 0,          // -1 (tief) | 0 (normal) | 1 (hoch)
  timerOn: false,
  timerSecs: 10,      // 5–20
};

// Spielstand
let lives = 3;
let score = 0;
let streak = 0;
let bestStreak = 0;
let gameOver = false;

// Timer
let timerId = null;
let timerDeadline = 0;

// Oberste Tonhöhe im Quiz, je nach gewähltem Tonumfang.
function quizRangeMax() {
  return quizSettings.range === "mehr" ? HARD_MAX_SEMI : EASY_MAX_SEMI;
}

// Verschiebt einen Tonnamen um ganze Oktaven (c¹ -> c² usw.).
function transposeName(name, shift) {
  const supers = { "¹": 1, "²": 2, "³": 3 };
  const last = name[name.length - 1];
  let oct, base;
  if (supers[last]) {
    oct = supers[last];
    base = name.slice(0, -1);
  } else {
    oct = 0;
    base = name;
  }
  const suffix = { 0: "", 1: "¹", 2: "²", 3: "³" }[oct + shift] ?? "";
  return base + suffix;
}

// Wendet die eingestellte Oktavlage auf einen Ton an (Frequenz verdoppelt/halbiert).
function mapQuizNote(k) {
  if (quizSettings.octave === 0) return k;
  return {
    semi: k.semi,
    name: transposeName(k.name, quizSettings.octave),
    freq: k.freq * Math.pow(2, quizSettings.octave),
  };
}

function getWhiteKeys() {
  if (level === "hard") {
    return ALL_WHITE.filter((k) => k.semi <= quizRangeMax()).map(mapQuizNote);
  }
  return ALL_WHITE.filter((k) => k.semi <= EASY_MAX_SEMI);
}

function getBlackKeys() {
  if (level === "easy") return [];
  if (level === "hard") {
    return ALL_BLACK.filter((k) => k.semi <= quizRangeMax()).map(mapQuizNote);
  }
  return ALL_BLACK.filter((k) => k.semi <= EASY_MAX_SEMI);
}

function getAllKeys() {
  return [...getWhiteKeys(), ...getBlackKeys()];
}

function findKey(semi) {
  return getAllKeys().find((k) => k.semi === semi);
}

// AudioContext erst beim ersten User-Gesture initialisieren (Browser-Policy)
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playNote(freq, durationSec = 1.8) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, now);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(freq * 2, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0, now);
  gain2.gain.linearRampToValueAtTime(0.07, now + 0.01);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + durationSec * 0.8);

  osc.connect(gain).connect(ctx.destination);
  osc2.connect(gain2).connect(ctx.destination);

  osc.start(now);
  osc2.start(now);
  osc.stop(now + durationSec);
  osc2.stop(now + durationSec);
}

function playDrumRoll() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const duration = 1.1;
  const sampleRate = ctx.sampleRate;

  // Weißes Rauschen als Snare-Basis
  const bufSize = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.8;

  // Tremolo: schnelle Amplituden-Modulation für „rrrrr"-Effekt
  const trem = ctx.createGain();
  trem.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 34;
  const lfoAmp = ctx.createGain();
  lfoAmp.gain.value = 0.45;
  lfo.connect(lfoAmp).connect(trem.gain);

  // Crescendo-Hüllkurve
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.18, now + 0.08);
  env.gain.linearRampToValueAtTime(0.45, now + duration - 0.05);
  env.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.1);

  noise.connect(filter).connect(trem).connect(env).connect(ctx.destination);
  lfo.start(now);
  noise.start(now);
  noise.stop(now + duration + 0.1);
  lfo.stop(now + duration + 0.1);

  // Becken-Schlag am Ende
  const crashSize = Math.floor(sampleRate * 0.55);
  const crashBuf = ctx.createBuffer(1, crashSize, sampleRate);
  const crashData = crashBuf.getChannelData(0);
  for (let i = 0; i < crashSize; i++) {
    crashData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.2));
  }
  const crashSrc = ctx.createBufferSource();
  crashSrc.buffer = crashBuf;
  const crashFilter = ctx.createBiquadFilter();
  crashFilter.type = "highpass";
  crashFilter.frequency.value = 4500;
  const crashGain = ctx.createGain();
  crashGain.gain.setValueAtTime(0, now + duration);
  crashGain.gain.linearRampToValueAtTime(0.35, now + duration + 0.01);
  crashGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.6);
  crashSrc.connect(crashFilter).connect(crashGain).connect(ctx.destination);
  crashSrc.start(now + duration);
}

function intervalBetween(fromSemi, toSemi) {
  const diff = toSemi - fromSemi;
  const abs = Math.abs(diff);
  const entry = INTERVAL_NAMES_FULL[abs];
  if (!entry) return null;
  let base = entry.primary;
  if (level === "mid" && entry.alt) {
    base = `${entry.primary} (${entry.alt})`;
  }
  if (abs === 0) return base;
  return `${base} ${diff > 0 ? "aufwärts" : "abwärts"}`;
}

let intervalTimeoutId = null;

function playInterval(fromFreq, toFreq) {
  if (intervalTimeoutId !== null) {
    clearTimeout(intervalTimeoutId);
    intervalTimeoutId = null;
  }
  playNote(fromFreq, 0.9);
  intervalTimeoutId = setTimeout(() => {
    playNote(toFreq, 1.4);
    intervalTimeoutId = null;
  }, 520);
}

// Diatonische Stufen-Zahlen auf den weißen Tasten (nur in Easy + Intervalle).
function updateKeyNumbers() {
  const whites = getWhiteKeys();
  const show =
    mode === "intervalle" && selectedSemi !== null && level === "easy";
  const selIdx = show
    ? whites.findIndex((k) => k.semi === selectedSemi)
    : -1;
  whites.forEach((key, idx) => {
    const el = document.querySelector(
      `.key[data-semi="${key.semi}"] .number`
    );
    if (!el) return;
    if (!show) {
      el.textContent = "";
      return;
    }
    const delta = idx - selIdx;
    if (delta === 0) el.textContent = "1";
    else if (delta > 0) el.textContent = String(delta + 1);
    else el.textContent = String(delta - 1);
  });
}

function buildKeyboard() {
  const keyboard = document.getElementById("keyboard");
  keyboard.innerHTML = "";

  const whites = getWhiteKeys();
  const blacks = getBlackKeys();
  const numWhite = whites.length;
  const whiteWidthPct = 100 / numWhite;
  const blackWidthPct = whiteWidthPct * 0.6;

  const row = document.createElement("div");
  row.className = "key-row";

  whites.forEach((key) => {
    row.appendChild(makeKeyButton(key, "white"));
  });

  blacks.forEach((bk) => {
    // Index der weißen Taste direkt links daneben (höchste mit semi < bk.semi)
    let leftWhiteIdx = -1;
    for (let i = 0; i < whites.length; i++) {
      if (whites[i].semi < bk.semi) leftWhiteIdx = i;
      else break;
    }
    if (leftWhiteIdx < 0 || leftWhiteIdx >= whites.length - 1) return;
    const boundaryPct = ((leftWhiteIdx + 1) / numWhite) * 100;
    const btn = makeKeyButton(bk, "black");
    btn.style.left = `${boundaryPct - blackWidthPct / 2}%`;
    btn.style.width = `${blackWidthPct}%`;
    row.appendChild(btn);
  });

  keyboard.appendChild(row);
}

function makeKeyButton(key, color) {
  const btn = document.createElement("button");
  btn.className = `key ${color}`;
  btn.dataset.semi = key.semi;
  btn.setAttribute("aria-label", `Ton ${key.name}`);
  btn.innerHTML = `
    <span class="number"></span>
    <span class="note">${key.name}</span>
  `;
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    triggerKey(key.semi);
  });
  btn.addEventListener("mouseenter", () => handleHover(key.semi));
  btn.addEventListener("mouseleave", () => handleHoverEnd());
  return btn;
}

function triggerKey(semi) {
  if (level === "hard") return; // Im Quiz-Modus tut die Tastatur nichts.
  const key = findKey(semi);
  if (!key) return;
  playNote(key.freq);

  const el = document.querySelector(`.key[data-semi="${semi}"]`);
  if (el) {
    el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 180);
  }

  if (mode === "intervalle") {
    document
      .querySelectorAll(".key.selected")
      .forEach((k) => k.classList.remove("selected"));
    selectedSemi = semi;
    if (el) el.classList.add("selected");
    updateKeyNumbers();
    updateInfo();
  }
}

function handleHover(semi) {
  if (level === "hard") return;
  if (mode !== "intervalle" || selectedSemi === null) return;
  if (semi === selectedSemi) {
    updateInfo();
    return;
  }
  const name = intervalBetween(selectedSemi, semi);
  if (!name) return;
  setInfoHTML(`<span class="interval-name">${name}</span>`);
  const from = findKey(selectedSemi);
  const to = findKey(semi);
  if (from && to) playInterval(from.freq, to.freq);
}

function handleHoverEnd() {
  if (level === "hard") return;
  if (mode !== "intervalle") return;
  updateInfo();
}

function setInfoHTML(html) {
  document.getElementById("info-area").innerHTML = html;
}

function updateInfo() {
  const info = document.getElementById("info-area");
  const hint = document.getElementById("hint");
  if (level === "hard") return; // Quiz hat eigene Anzeige
  if (mode === "normal") {
    info.innerHTML = "";
    hint.innerHTML =
      level === "mid"
        ? "Klicke eine Taste. Zahlentasten <kbd>1</kbd>–<kbd>8</kbd> spielen die weißen Tasten."
        : "Klicke eine Taste oder benutze die Zahlentasten <kbd>1</kbd>–<kbd>8</kbd>.";
  } else {
    if (selectedSemi === null) {
      info.textContent = "Klicke eine Taste, um sie als Bezugston zu wählen.";
    } else {
      const sel = findKey(selectedSemi);
      info.innerHTML = `Bezugston: <span class="interval-name">${sel.name}</span> — hovere über eine andere Taste.`;
    }
    hint.innerHTML = "Auswahl aufheben mit <kbd>Esc</kbd>.";
  }
}

function updateSubtitle() {
  const sub = document.getElementById("subtitle");
  if (!sub) return;
  if (level === "mid") {
    sub.innerHTML =
      "Chromatische Klaviatur einer Oktave (c<sup>1</sup> – c<sup>2</sup>, mit schwarzen Tasten)";
  } else if (level === "hard") {
    sub.innerHTML = "Quiz – höre das Intervall und benenne es";
  } else {
    sub.innerHTML =
      "Prototyp – Klaviatur einer Oktave (c<sup>1</sup> – c<sup>2</sup>)";
  }
}

function setMode(newMode) {
  mode = newMode;
  selectedSemi = null;
  document.querySelectorAll(".mode-btn").forEach((b) => {
    const isActive = b.dataset.mode === mode;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document
    .querySelectorAll(".key.selected")
    .forEach((k) => k.classList.remove("selected"));
  updateKeyNumbers();
  updateInfo();
}

function setLevel(newLevel) {
  if (newLevel === level) return;
  level = newLevel;
  selectedSemi = null;
  currentTask = null;
  clearTaskTimeouts();
  clearAnswerSelections();
  clearFeedback();
  stopTimer();
  hideTimer();

  const over = document.getElementById("gameover");
  if (over) over.hidden = true;

  document.body.classList.remove("level-easy", "level-mid", "level-hard");
  document.body.classList.add(`level-${level}`);

  document.querySelectorAll(".level-btn").forEach((b) => {
    const isActive = b.dataset.level === level;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  if (level === "hard") {
    resetGame();
    closeSettings();
  }
  applyHarmonicClass();

  buildKeyboard();
  updateSubtitle();
  updateKeyNumbers();
  updateInfo();
}

/* ---- Quiz-Einstellungen (Menü oben rechts) ---- */

function applyHarmonicClass() {
  document.body.classList.toggle(
    "quiz-harmonic",
    level === "hard" && quizSettings.play === "gleichzeitig"
  );
}

function closeSettings() {
  const panel = document.getElementById("settings-panel");
  const toggle = document.getElementById("settings-toggle");
  if (panel) panel.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

function setSetting(key, val) {
  if (key === "play") {
    quizSettings.play = val;
    applyHarmonicClass();
    if (currentTask) newQuizTask();
  } else if (key === "range") {
    quizSettings.range = val;
    buildKeyboard();
    if (currentTask) newQuizTask();
  } else if (key === "octave") {
    quizSettings.octave = parseInt(val, 10);
    buildKeyboard();
    if (currentTask) newQuizTask();
  } else if (key === "timer") {
    quizSettings.timerOn = val === "on";
    const slider = document.getElementById("timer-slider");
    if (slider) slider.hidden = !quizSettings.timerOn;
    if (quizSettings.timerOn) {
      if (currentTask) startTimer();
    } else {
      stopTimer();
      hideTimer();
    }
  }

  // Aktiven Knopf je Gruppe markieren
  document
    .querySelectorAll(`.seg-btn[data-set="${key}"]`)
    .forEach((b) => b.classList.toggle("active", b.dataset.val === val));
}

/* ============== Quiz (Modus 3) ============== */

let taskTimeouts = [];

function clearTaskTimeouts() {
  taskTimeouts.forEach((id) => clearTimeout(id));
  taskTimeouts = [];
  document
    .querySelectorAll(".key.task-on")
    .forEach((k) => k.classList.remove("task-on"));
}

function newQuizTask() {
  if (gameOver) return;
  const keys = getAllKeys();
  let a, b, tries = 0;
  do {
    a = keys[Math.floor(Math.random() * keys.length)];
    b = keys[Math.floor(Math.random() * keys.length)];
    tries++;
  } while ((a.semi === b.semi || Math.abs(a.semi - b.semi) > 12) && tries < 80);
  if (a.semi === b.semi) return;

  const direction = Math.random() < 0.5 ? "up" : "down";
  const lower = a.semi < b.semi ? a : b;
  const higher = a.semi < b.semi ? b : a;
  const first  = direction === "up" ? lower  : higher;
  const second = direction === "up" ? higher : lower;

  currentTask = {
    semitones: Math.abs(a.semi - b.semi),
    direction,
    first,
    second,
  };

  clearAnswerSelections();
  clearFeedback();
  playTaskNotes(first, second);
  startTimer();
}

function playTaskNotes(first, second) {
  clearTaskTimeouts();

  if (quizSettings.play === "gleichzeitig") {
    // Beide Töne als Akkord – Richtung ist hier nicht hörbar.
    highlightTaskKey(first.semi, true);
    highlightTaskKey(second.semi, true);
    playNote(first.freq, 1.6);
    playNote(second.freq, 1.6);
    taskTimeouts.push(setTimeout(() => {
      highlightTaskKey(first.semi, false);
      highlightTaskKey(second.semi, false);
    }, 1500));
    return;
  }

  highlightTaskKey(first.semi, true);
  playNote(first.freq, 0.9);
  taskTimeouts.push(setTimeout(() => {
    highlightTaskKey(first.semi, false);
    highlightTaskKey(second.semi, true);
    playNote(second.freq, 1.4);
    taskTimeouts.push(setTimeout(() => {
      highlightTaskKey(second.semi, false);
    }, 1300));
  }, 700));
}

// Spielt die aktuelle Aufgabe noch einmal vor (Knopf „Nochmal hören").
function replayTask() {
  if (currentTask) playTaskNotes(currentTask.first, currentTask.second);
}

function highlightTaskKey(semi, on) {
  const el = document.querySelector(`.key[data-semi="${semi}"]`);
  if (el) el.classList.toggle("task-on", on);
}

function selectAnswer(btn) {
  const cat = btn.dataset.cat;

  // Tritonus ist eine eigenständige Antwort: ein Klick genügt, er hebt
  // Qualität/Intervall/Richtung auf – und umgekehrt.
  if (cat === "special") {
    const turnOn = !quizSelection.tritonus;
    document
      .querySelectorAll(".ans-btn.selected")
      .forEach((b) => b.classList.remove("selected"));
    quizSelection = { qual: null, name: null, dir: null, tritonus: turnOn };
    if (turnOn) btn.classList.add("selected");
    return;
  }

  // Eine normale Antwort hebt eine evtl. gewählte Tritonus-Antwort auf.
  if (quizSelection.tritonus) {
    quizSelection.tritonus = false;
    document
      .querySelectorAll('.ans-btn[data-cat="special"].selected')
      .forEach((b) => b.classList.remove("selected"));
  }

  document.querySelectorAll(`.ans-btn[data-cat="${cat}"]`).forEach((b) => {
    b.classList.remove("selected");
  });
  btn.classList.add("selected");
  if (cat === "qual") quizSelection.qual = btn.dataset.val;
  else if (cat === "name") quizSelection.name = btn.dataset.val;
  else if (cat === "dir") quizSelection.dir = btn.dataset.val;
}

function clearAnswerSelections() {
  quizSelection = { qual: null, name: null, dir: null, tritonus: false };
  document
    .querySelectorAll(".ans-btn.selected")
    .forEach((b) => b.classList.remove("selected"));
}

function showFeedback(text, kind) {
  const fb = document.getElementById("quiz-feedback");
  fb.textContent = text;
  fb.className = "quiz-feedback";
  if (kind) fb.classList.add(kind);
}

function clearFeedback() {
  const fb = document.getElementById("quiz-feedback");
  fb.textContent = "";
  fb.className = "quiz-feedback";
}

function checkAnswer() {
  if (gameOver) return;
  if (!currentTask) {
    showFeedback('Drücke zuerst „Neue Aufgabe".', "neutral");
    return;
  }
  const sel = quizSelection;
  const harmonic = quizSettings.play === "gleichzeitig";

  // Tritonus-Knopf: allein gültig, ohne Intervallname/Richtung.
  if (sel.tritonus) {
    if (currentTask.semitones === 6) handleCorrect();
    else handleWrong();
    return;
  }

  if (!sel.qual || !sel.name || (!harmonic && !sel.dir)) {
    showFeedback(
      harmonic
        ? "Wähle Qualität und Intervall aus."
        : "Wähle Qualität, Intervall und Richtung aus.",
      "neutral"
    );
    return;
  }

  const expected = QUALITY_INTERVAL_SEMITONES[sel.name]?.[sel.qual];
  if (expected === undefined) {
    showFeedback("Diese Kombination gibt es nicht. Versuche es noch einmal.", "wrong");
    return;
  }
  const intervalOk = expected === currentTask.semitones;
  const dirOk = harmonic || sel.dir === currentTask.direction;
  if (intervalOk && dirOk) handleCorrect();
  else handleWrong();
}

/* ---- Richtig / Falsch / Zeit abgelaufen ---- */

function handleCorrect() {
  stopTimer();
  streak += 1;
  if (streak > bestStreak) bestStreak = streak;

  let points = 10 + (streak - 1) * 2; // Streak-Bonus
  if (quizSettings.timerOn) {
    const remSec = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
    points += remSec; // Zeitbonus
  }
  score += points;

  renderHud();
  showFeedback(`Richtig!  +${points}`, "right");
  taskTimeouts.push(setTimeout(() => newQuizTask(), 1600));
}

function handleWrong() {
  streak = 0;
  loseLife();
  renderHud();
  if (gameOver) return;
  showFeedback("Nicht ganz – versuche es noch einmal.", "wrong");
}

function onTimeout() {
  if (gameOver || !currentTask) return;
  streak = 0;
  loseLife();
  renderHud();
  if (gameOver) return;
  showFeedback("Zeit abgelaufen!", "wrong");
  taskTimeouts.push(setTimeout(() => newQuizTask(), 1300));
}

function loseLife() {
  lives = Math.max(0, lives - 1);
  if (lives === 0) showGameOver();
}

/* ---- Spielstand-Anzeige (Herzen, Punkte, Streak) ---- */

function renderHud() {
  const livesEl = document.getElementById("hud-lives");
  if (livesEl) {
    let html = "";
    for (let i = 0; i < 3; i++) {
      html += `<span class="heart ${i < lives ? "full" : "empty"}">${
        i < lives ? "♥" : "♡"
      }</span>`;
    }
    livesEl.innerHTML = html;
  }
  const scoreEl = document.getElementById("hud-score");
  if (scoreEl) scoreEl.textContent = String(score);
  const streakEl = document.getElementById("hud-streak");
  if (streakEl) streakEl.textContent = String(streak);
  const streakWrap = document.getElementById("hud-streak-wrap");
  if (streakWrap) streakWrap.classList.toggle("hot", streak >= 3);
}

function resetGame() {
  lives = 3;
  score = 0;
  streak = 0;
  bestStreak = 0;
  gameOver = false;
  renderHud();
}

function showGameOver() {
  gameOver = true;
  stopTimer();
  clearTaskTimeouts();
  currentTask = null;
  const over = document.getElementById("gameover");
  if (over) {
    document.getElementById("final-score").textContent = String(score);
    document.getElementById("final-streak").textContent = String(bestStreak);
    over.hidden = false;
  }
}

function restartGame() {
  const over = document.getElementById("gameover");
  if (over) over.hidden = true;
  resetGame();
  newQuizTask();
}

/* ---- Timer ---- */

function startTimer() {
  stopTimer();
  if (!quizSettings.timerOn || !currentTask) {
    hideTimer();
    return;
  }
  const total = quizSettings.timerSecs * 1000;
  timerDeadline = Date.now() + total;
  showTimer();
  updateTimerBar(total, total);
  timerId = setInterval(() => {
    const remaining = timerDeadline - Date.now();
    if (remaining <= 0) {
      stopTimer();
      onTimeout();
    } else {
      updateTimerBar(remaining, total);
    }
  }, 80);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function showTimer() {
  const el = document.getElementById("quiz-timer");
  if (el) el.hidden = false;
}

function hideTimer() {
  const el = document.getElementById("quiz-timer");
  if (el) el.hidden = true;
}

function updateTimerBar(remaining, total) {
  const bar = document.getElementById("quiz-timer-bar");
  if (!bar) return;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  bar.style.width = `${pct}%`;
  bar.classList.toggle("low", pct < 30);
}

/* ============== Event-Bindings ============== */

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

document.querySelectorAll(".level-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    if (btn.dataset.level === "hard") {
      playDrumRoll();
    }
    setLevel(btn.dataset.level);
  });
});

document.querySelectorAll(".ans-btn").forEach((btn) => {
  btn.addEventListener("click", () => selectAnswer(btn));
});

document.getElementById("new-task-btn").addEventListener("click", newQuizTask);
document.getElementById("check-btn").addEventListener("click", checkAnswer);

const replayBtn = document.getElementById("replay-btn");
if (replayBtn) replayBtn.addEventListener("click", replayTask);

const restartBtn = document.getElementById("restart-btn");
if (restartBtn) restartBtn.addEventListener("click", restartGame);

// Einstellungs-Menü auf-/zuklappen
const settingsToggle = document.getElementById("settings-toggle");
if (settingsToggle) {
  settingsToggle.addEventListener("click", () => {
    const panel = document.getElementById("settings-panel");
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

// Auswahl-Knöpfe im Einstellungs-Menü
document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => setSetting(btn.dataset.set, btn.dataset.val));
});

// Zeitlimit-Schieberegler
const timerRange = document.getElementById("timer-range");
if (timerRange) {
  timerRange.addEventListener("input", () => {
    quizSettings.timerSecs = parseInt(timerRange.value, 10);
    const valEl = document.getElementById("timer-value");
    if (valEl) valEl.textContent = `${quizSettings.timerSecs} s`;
  });
}

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "Escape") {
    if (level === "hard") {
      closeSettings();
      return;
    }
    if (mode === "intervalle" && selectedSemi !== null) {
      selectedSemi = null;
      document
        .querySelectorAll(".key.selected")
        .forEach((k) => k.classList.remove("selected"));
      updateKeyNumbers();
      updateInfo();
    }
    return;
  }
  if (level === "hard") {
    if (e.key === "Enter") checkAnswer();
    return;
  }
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 8) {
    const whites = getWhiteKeys();
    if (whites[num - 1]) triggerKey(whites[num - 1].semi);
  }
});

buildKeyboard();
updateInfo();
