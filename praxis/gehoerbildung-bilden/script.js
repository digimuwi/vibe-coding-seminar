// Gehörbildung bilden — Prototyp
// Weiße Tasten einer Oktave von c¹ bis c² (deutsche Notation)

const NOTES = [
  { num: 1, name: "c¹", freq: 261.63, semitones: 0 },
  { num: 2, name: "d¹", freq: 293.66, semitones: 2 },
  { num: 3, name: "e¹", freq: 329.63, semitones: 4 },
  { num: 4, name: "f¹", freq: 349.23, semitones: 5 },
  { num: 5, name: "g¹", freq: 392.00, semitones: 7 },
  { num: 6, name: "a¹", freq: 440.00, semitones: 9 },
  { num: 7, name: "h¹", freq: 493.88, semitones: 11 },
  { num: 8, name: "c²", freq: 523.25, semitones: 12 },
];

const INTERVAL_NAMES = {
  0: "Prime",
  1: "kleine Sekunde",
  2: "große Sekunde",
  3: "kleine Terz",
  4: "große Terz",
  5: "reine Quarte",
  6: "Tritonus",
  7: "reine Quinte",
  8: "kleine Sexte",
  9: "große Sexte",
  10: "kleine Septime",
  11: "große Septime",
  12: "reine Oktave",
};

let mode = "normal";
let selectedNum = null;

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

function intervalBetween(fromNum, toNum) {
  const from = NOTES.find((n) => n.num === fromNum);
  const to = NOTES.find((n) => n.num === toNum);
  if (!from || !to) return null;
  const diff = to.semitones - from.semitones;
  const abs = Math.abs(diff);
  const base = INTERVAL_NAMES[abs];
  if (!base) return null;
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

function updateKeyNumbers() {
  const show = mode === "intervalle" && selectedNum !== null;
  const selIdx = show ? NOTES.findIndex((n) => n.num === selectedNum) : -1;
  NOTES.forEach((note, idx) => {
    const el = document.querySelector(`.key[data-num="${note.num}"] .number`);
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
  NOTES.forEach((note) => {
    const btn = document.createElement("button");
    btn.className = "key";
    btn.dataset.num = note.num;
    btn.setAttribute("aria-label", `Taste ${note.num}, Ton ${note.name}`);
    btn.innerHTML = `
      <span class="number"></span>
      <span class="note">${note.name}</span>
    `;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      triggerKey(note.num);
    });
    btn.addEventListener("mouseenter", () => handleHover(note.num));
    btn.addEventListener("mouseleave", () => handleHoverEnd());
    keyboard.appendChild(btn);
  });
}

function triggerKey(num) {
  const note = NOTES.find((n) => n.num === num);
  if (!note) return;
  playNote(note.freq);

  const el = document.querySelector(`.key[data-num="${num}"]`);
  if (el) {
    el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 180);
  }

  if (mode === "intervalle") {
    document.querySelectorAll(".key.selected").forEach((k) => k.classList.remove("selected"));
    selectedNum = num;
    if (el) el.classList.add("selected");
    updateKeyNumbers();
    updateInfo();
  }
}

function handleHover(num) {
  if (mode !== "intervalle" || selectedNum === null) return;
  if (num === selectedNum) {
    updateInfo();
    return;
  }
  const name = intervalBetween(selectedNum, num);
  if (!name) return;
  setInfoHTML(`<span class="interval-name">${name}</span>`);
  const from = NOTES.find((n) => n.num === selectedNum);
  const to = NOTES.find((n) => n.num === num);
  if (from && to) playInterval(from.freq, to.freq);
}

function handleHoverEnd() {
  if (mode !== "intervalle") return;
  updateInfo();
}

function setInfoHTML(html) {
  document.getElementById("info-area").innerHTML = html;
}

function updateInfo() {
  const info = document.getElementById("info-area");
  const hint = document.getElementById("hint");
  if (mode === "normal") {
    info.innerHTML = "";
    hint.innerHTML = "Klicke eine Taste oder benutze die Zahlentasten <kbd>1</kbd>–<kbd>8</kbd>.";
  } else {
    if (selectedNum === null) {
      info.textContent = "Klicke eine Taste, um sie als Bezugston zu wählen.";
    } else {
      const sel = NOTES.find((n) => n.num === selectedNum);
      info.innerHTML = `Bezugston: <span class="interval-name">${sel.name}</span> — hovere über eine andere Taste.`;
    }
    hint.innerHTML = "Auswahl aufheben mit <kbd>Esc</kbd>.";
  }
}

function setMode(newMode) {
  mode = newMode;
  selectedNum = null;
  document.querySelectorAll(".mode-btn").forEach((b) => {
    const isActive = b.dataset.mode === mode;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document.querySelectorAll(".key.selected").forEach((k) => k.classList.remove("selected"));
  updateKeyNumbers();
  updateInfo();
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "Escape") {
    if (mode === "intervalle" && selectedNum !== null) {
      selectedNum = null;
      document.querySelectorAll(".key.selected").forEach((k) => k.classList.remove("selected"));
      updateKeyNumbers();
      updateInfo();
    }
    return;
  }
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 8) {
    triggerKey(num);
  }
});

buildKeyboard();
updateInfo();
