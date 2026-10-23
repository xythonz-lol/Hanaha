// app.js - hirakana. storage, stroke drawing, chart, detail pop-up, settings, navigation.
const $ = id => document.getElementById(id);
const view = $("view"), modal = $("modal");
const SCRIPT_NAME = { hira: "Hiragana", kata: "Katakana", both: "Both" };

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
const DEFAULTS = {
  script: "hira", showRomaji: false, choices: 6, sessionLen: 10,
  mixWrite: 28, mixRead: 26, mixPick: 26, mixWords: 20, mixListen: 0, pronunciationVolumePercent: 100,
  level: "normal", theme: "auto"
};
function migrateQuestionMix(target, hasWordMix, hasListenMix) {
  const kanaKeys = ["mixWrite", "mixRead", "mixPick"];
  if (!hasWordMix) target.mixWords = 0;
  if (!hasListenMix) target.mixListen = 0;
  const kanaTotal = kanaKeys.reduce((total, key) => total + target[key], 0);
  if (hasWordMix && kanaTotal === 100 && kanaTotal + target.mixWords !== 100 &&
      Number.isInteger(target.mixWords) && target.mixWords >= 0 && target.mixWords <= 100) {
    const kanaBudget = 100 - target.mixWords;
    let assigned = 0;
    kanaKeys.forEach((key, i) => {
      target[key] = i === kanaKeys.length - 1
        ? kanaBudget - assigned
        : Math.floor(kanaBudget * target[key] / kanaTotal);
      assigned += target[key];
    });
  }
}
const savedSettings = load("hirakana-settings", null);
let settings = Object.assign({}, DEFAULTS, savedSettings || {});
if (savedSettings) {
  migrateQuestionMix(
    settings,
    Object.prototype.hasOwnProperty.call(savedSettings, "mixWords"),
    Object.prototype.hasOwnProperty.call(savedSettings, "mixListen")
  );
}
const migratedListeningMix = !!savedSettings && !Object.prototype.hasOwnProperty.call(savedSettings, "mixListen");
delete settings.pronunciationVolume;
const invalidPronunciationVolume = !Number.isInteger(settings.pronunciationVolumePercent) ||
  settings.pronunciationVolumePercent < 0 || settings.pronunciationVolumePercent > 100;
if (invalidPronunciationVolume) settings.pronunciationVolumePercent = DEFAULTS.pronunciationVolumePercent;
const migrateAnswerChoices = settings.choices === 2 || settings.choices === 3;
if (migrateAnswerChoices) settings.choices = 4;
if (invalidPronunciationVolume || migrateAnswerChoices || migratedListeningMix) saveSettings();
let progress = load("hirakana-progress", {});
let days = load("hirakana-days", []);
let selected = new Set(load("hirakana-selected", KANA.filter(k => k.row === "a" || k.row === "ka").map(k => k.ch)));
let studyMode = false;
let uiNeedsPracticeOpen = false;

// Migration for SRS
Object.keys(progress).forEach(ch => {
  if (progress[ch].interval === undefined) {
    progress[ch].interval = progress[ch].streak >= 3 ? 7 : 1;
    const d = new Date();
    d.setDate(d.getDate() + progress[ch].interval);
    progress[ch].dueDate = d.toLocaleDateString("en-CA");
  }
});
store("hirakana-progress", progress);

function saveSettings() { store("hirakana-settings", settings); }
function saveSelected() { store("hirakana-selected", [...selected]); }
function createBackup() {
  const exportedProgress = KANA.reduce((all, k) => {
    const p = progress[k.ch] || { right: 0, wrong: 0, streak: 0, miss: 0, interval: 0, dueDate: "" };
    const practice = p.right + p.wrong;
    all[k.ch] = {
      right: p.right,
      wrong: p.wrong,
      streak: p.streak,
      miss: p.miss,
      interval: p.interval,
      dueDate: p.dueDate,
      proficiency: profLevel(k.ch),
      accuracy: practice ? Math.round(100 * p.right / practice) : 0,
      practice
    };
    return all;
  }, {});
  const totals = Object.values(exportedProgress).reduce((result, p) => {
    result.right += p.right;
    result.wrong += p.wrong;
    return result;
  }, { right: 0, wrong: 0 });
  const practice = totals.right + totals.wrong;

  return {
    app: "hirakana",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      progress: exportedProgress,
      days,
      stats: {
        streak: calculateStreak(),
        accuracy: practice ? Math.round(100 * totals.right / practice) : 0,
        practice
      }
    }
  };
}
function validateBackup(backup) {
  if (!backup || backup.app !== "hirakana" || ![1, 2].includes(backup.version) || !backup.data) {
    throw new Error("This is not a supported Hirakana backup.");
  }

  const data = backup.data;
  const validChars = new Set(KANA.map(k => k.ch));
  const validKeys = ["script", "showRomaji", "choices", "sessionLen", "mixWrite", "mixRead", "mixPick", "mixWords", "mixListen", "pronunciationVolumePercent", "level", "theme"];
  if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings) ||
      Object.keys(data.settings).some(key => !validKeys.includes(key) && key !== "pronunciationVolume")) {
    throw new Error("The backup has invalid settings.");
  }

  const importedSettings = Object.assign({}, DEFAULTS, data.settings);
  migrateQuestionMix(
    importedSettings,
    Object.prototype.hasOwnProperty.call(data.settings, "mixWords"),
    Object.prototype.hasOwnProperty.call(data.settings, "mixListen")
  );
  delete importedSettings.pronunciationVolume;
  if (importedSettings.choices === 2 || importedSettings.choices === 3) importedSettings.choices = 4;
  if (!["hira", "kata", "both"].includes(importedSettings.script) ||
      typeof importedSettings.showRomaji !== "boolean" ||
      ![4, 6, 8, 10].includes(importedSettings.choices) ||
      ![5, 10, 20].includes(importedSettings.sessionLen) ||
      !["easy", "normal", "strict"].includes(importedSettings.level) ||
      !["light", "dark", "auto"].includes(importedSettings.theme) ||
      !Number.isInteger(importedSettings.pronunciationVolumePercent) ||
      importedSettings.pronunciationVolumePercent < 0 || importedSettings.pronunciationVolumePercent > 100 ||
      !Number.isInteger(importedSettings.mixWords) || importedSettings.mixWords < 0 || importedSettings.mixWords > 100 ||
      !Number.isInteger(importedSettings.mixListen) || importedSettings.mixListen < 0 || importedSettings.mixListen > 100 ||
      !["mixWrite", "mixRead", "mixPick"].every(key =>
        Number.isInteger(importedSettings[key]) && importedSettings[key] >= 0 && importedSettings[key] <= 100
      ) ||
      importedSettings.mixWrite + importedSettings.mixRead + importedSettings.mixPick +
        importedSettings.mixWords + importedSettings.mixListen !== 100) {
    throw new Error("The backup has invalid settings.");
  }

  if (!data.progress || typeof data.progress !== "object" || Array.isArray(data.progress) ||
      Object.entries(data.progress).some(([ch, p]) =>
        !validChars.has(ch) || !p || typeof p !== "object" || Array.isArray(p) ||
        !["right", "wrong", "streak", "miss", "interval"].every(key =>
          Number.isFinite(p[key]) && p[key] >= 0
        ) || typeof p.dueDate !== "string"
      ) || (backup.version === 2 &&
        (Object.keys(data.progress).length !== KANA.length ||
          KANA.some(k => !Object.prototype.hasOwnProperty.call(data.progress, k.ch)) ||
          Object.entries(data.progress).some(([, p]) => {
            const practice = p.right + p.wrong;
            const accuracy = practice ? Math.round(100 * p.right / practice) : 0;
            const proficiency = practice === 0 ? 0 : p.streak >= 3 ? 3 : p.streak >= 1 ? 2 : 1;
            return p.practice !== practice || p.accuracy !== accuracy || p.proficiency !== proficiency;
          })))) {
    throw new Error("The backup has invalid progress data.");
  }

  const validDate = value => typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!Array.isArray(data.days) || data.days.some(day => !validDate(day))) {
    throw new Error("The backup has invalid study history.");
  }

  const restoredProgress = KANA.reduce((all, k) => {
    const p = data.progress[k.ch] || {};
    all[k.ch] = {
      right: p.right || 0,
      wrong: p.wrong || 0,
      streak: p.streak || 0,
      miss: p.miss || 0,
      interval: p.interval || 0,
      dueDate: p.dueDate || ""
    };
    return all;
  }, {});

  if (backup.version === 2) {
    const totals = Object.values(restoredProgress).reduce((result, p) => {
      result.right += p.right;
      result.wrong += p.wrong;
      return result;
    }, { right: 0, wrong: 0 });
    const practice = totals.right + totals.wrong;
    const accuracy = practice ? Math.round(100 * totals.right / practice) : 0;
    if (!data.stats || !Number.isInteger(data.stats.streak) || data.stats.streak < 0 ||
        data.stats.practice !== practice || data.stats.accuracy !== accuracy) {
      throw new Error("The backup has invalid overall study statistics.");
    }
  }

  return {
    settings: importedSettings,
    progress: restoredProgress,
    days: data.days
  };
}
function isMastered(ch) { return !!progress[ch] && progress[ch].streak >= 3; }
function record(ch, ok) {
  const s = progress[ch] || (progress[ch] = { right: 0, wrong: 0, streak: 0, miss: 0, interval: 0, dueDate: "" });
  
  if (ok) { 
    s.right++; 
    s.streak++; 
    s.miss = Math.max(0, s.miss - 1); 
    if (s.interval <= 1) s.interval = 1;
    else s.interval = Math.round(s.interval * 2.5);
  } else { 
    s.wrong++; 
    s.streak = 0; 
    s.miss++; 
    s.interval = 1;
  }

  const today = new Date();
  today.setDate(today.getDate() + s.interval);
  s.dueDate = today.toLocaleDateString("en-CA");

  store("hirakana-progress", progress);
  
  const todayStr = new Date().toLocaleDateString("en-CA");
  if (!days.includes(todayStr)) { days.push(todayStr); store("hirakana-days", days); }
}

function profLevel(ch) {
  const p = progress[ch];
  if (!p || p.right + p.wrong === 0) return 0;
  if (p.streak >= 3) return 3;
  if (p.streak >= 1) return 2;
  return 1;
}

// ---------- streak calculation ----------
function calculateStreak() {
  if (!days.length) return 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let checkDate = new Date(today);

  if (!days.includes(checkDate.toLocaleDateString("en-CA"))) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const str = checkDate.toLocaleDateString("en-CA");
    if (days.includes(str)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ---------- theme ----------
const mq = window.matchMedia("(prefers-color-scheme: dark)");
function resolvedTheme() {
  return settings.theme === "auto" ? (mq.matches ? "dark" : "light") : settings.theme;
}
function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
}
mq.addEventListener("change", () => { if (settings.theme === "auto") applyTheme(); });
applyTheme();

// ---------- stroke drawing helpers ----------
let animToken = 0;

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    let t = carry;
    while (t + step <= len) { t += step; out.push([a[0] + dx * (t / len), a[1] + dy * (t / len)]); }
    carry = t - len;
    if (carry < 0) carry = 0;
  }
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}
function widthAt(t) {
  if (t < 0.35) return 0.35 + 0.65 * (t / 0.35);
  if (t > 0.8)  return 1 - 0.9 * ((t - 0.8) / 0.2);
  return 1;
}
function polyLen(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
function fillStroke(ctx, pts, k, f, maxHalf) {
  if (f <= 0) return;
  const scaled = pts.map(p => [p[0] * k, p[1] * k]);
  const step = Math.max(1.5, (maxHalf * 2) / 6);
  let rs = resample(scaled, step);
  if (f < 1) {
    const total = polyLen(rs), want = total * f;
    const trimmed = [rs[0]];
    let acc = 0;
    for (let i = 1; i < rs.length; i++) {
      const seg = Math.hypot(rs[i][0] - rs[i - 1][0], rs[i][1] - rs[i - 1][1]);
      if (acc + seg >= want) {
        const t = seg ? (want - acc) / seg : 0;
        trimmed.push([rs[i - 1][0] + (rs[i][0] - rs[i - 1][0]) * t,
                      rs[i - 1][1] + (rs[i][1] - rs[i - 1][1]) * t]);
        break;
      }
      acc += seg; trimmed.push(rs[i]);
    }
    rs = trimmed;
  }
  if (rs.length < 2) { ctx.beginPath(); ctx.arc(rs[0][0], rs[0][1], maxHalf * 0.6, 0, Math.PI * 2); ctx.fill(); return; }
  const n = rs.length, left = [], right = [];
  for (let i = 0; i < n; i++) {
    const p = rs[i], prev = rs[Math.max(0, i - 1)], next = rs[Math.min(n - 1, i + 1)];
    let dx = next[0] - prev[0], dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const t = f * (i / (n - 1)), hw = maxHalf * widthAt(t);
    left.push([p[0] - dy * hw, p[1] + dx * hw]);
    right.push([p[0] + dy * hw, p[1] - dx * hw]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath(); ctx.fill();
}
function drawGuide(ctx, ch, size, color, width) {
  if (!STROKES[ch]) return;
  const k = size / 100, maxHalf = width / 2;
  ctx.fillStyle = color;
  STROKES[ch].forEach(pts => fillStroke(ctx, pts, k, 1, maxHalf));
}
function playStrokes(cv, ch) {
  if (!STROKES[ch]) {
    const ctx = cv.getContext("2d"), S = cv.width;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#2B0006";
    ctx.font = `${S / 2}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(ch, S / 2, S / 2);
    ctx.font = `${S / 16}px sans-serif`;
    ctx.fillText("no stroke data", S / 2, S * 0.85);
    return;
  }
  const ctx = cv.getContext("2d"), S = cv.width, k = S / 100, data = STROKES[ch];
  const maxHalf = S / 22;
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#2B0006";
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--clay").trim() || "#D0021B";
  const my = ++animToken, t0 = performance.now(), PER = 700;
  function frame(now) {
    if (my !== animToken) return;
    ctx.clearRect(0, 0, S, S);
    drawGuide(ctx, ch, S, "#F7C6CB", S / 16);
    const p = Math.min((now - t0) / PER, data.length);
    data.forEach((pts, i) => {
      const f = Math.max(0, Math.min(1, p - i));
      if (f <= 0) return;
      ctx.fillStyle = ink;
      fillStroke(ctx, pts, k, f, maxHalf);
      ctx.fillStyle = accent; ctx.font = `bold ${S / 12}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(i + 1, pts[0][0] * k - S / 16, pts[0][1] * k - S / 16);
    });
    if (p < data.length) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- chart ----------
function renderSection(s, rows, group, isBoth) {
  let cells = "";
  const isYoon = group === "yoon";
  const cols = isYoon ? 3 : 5;

  rows.forEach(r => {
    const chars = KANA.filter(k => k.script === s && k.row === r[0] && k.group === group);
    for (let c = 0; c < cols; c++) {
      const k = isYoon ? chars[c] : chars.find(x => x.col === c);
      cells += k
        ? `<button class="tile ${isYoon ? "yoon" : ""} ${settings.showRomaji ? "has-romaji" : ""} lvl-${profLevel(k.ch)} ${selected.has(k.ch) ? "picked" : ""}" data-ch="${k.ch}">${k.ch}${settings.showRomaji ? `<small>${k.romaji}</small>` : ""}</button>`
        : `<div></div>`;
    }
  });

  const scriptLabel = isBoth 
    ? `<div class="script-label">${SCRIPT_NAME[s]}</div>` 
    : "";

  return `${scriptLabel}<div class="grid5 ${isYoon ? "grid-yoon" : ""}">${cells}</div>`;
}

function renderChart() {
  const s = settings.script;
  const scriptsToShow = s === "both" ? ["hira", "kata"] : [s];

  const count = () => KANA.filter(k => scriptsToShow.includes(k.script) && selected.has(k.ch)).length;
  
  let right = 0, wrong = 0;
  Object.values(progress).forEach(p => { right += p.right; wrong += p.wrong; });
  const acc = right + wrong ? Math.round(100 * right / (right + wrong)) : 0;
  const mastered = KANA.filter(k => isMastered(k.ch)).length;
  
  const streak = calculateStreak();

  const weakFor = script => KANA
    .filter(k => k.script === script && progress[k.ch] && progress[k.ch].miss > 0)
    .sort((a, b) => progress[b.ch].miss - progress[a.ch].miss)
    .slice(0, 10)
    .map(k => k.ch);

  const weakHira = weakFor("hira");
  const weakKata = weakFor("kata");
  
  const chipsBlock = (title, list) => `
    <div class="weak-sub">${title}</div>
    <div class="chips" data-list='${JSON.stringify(list)}' style="justify-content: center;">
      ${list.length ? list.map(c => `<button class="chip" data-ch="${c}">${c}</button>`).join("") : `<span class="note" style="font-size:12px;color:var(--text)">Nothing yet!</span>`}
    </div>`;

  const bookIcon = uiNeedsPracticeOpen 
    ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`
    : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;

  view.innerHTML = `
    <div class="navbar">
      <div class="brand"><img src="logo.svg" alt=""><span>hanaha</span></div>
      <div class="script-switch-group">
        <button id="scr" class="script-switch" aria-label="Switch script">${SCRIPT_NAME[s]} ⇄</button>
        <span class="script-switch-sub">${s === "hira" ? "used for native words" : s === "kata" ? "used for foreign words" : "Hiragana and Katakana"}</span>
      </div>
      <div class="romaji-switch-group">
        <button id="romaji" class="${settings.showRomaji ? "on" : ""}" aria-label="Show romaji">A</button>
        <span class="romaji-switch-sub">romaji</span>
      </div>
    </div>
    
    <div class="header-stats">
      <div class="stat"><b>${mastered}/${KANA.length}</b>mastered</div>
      <div class="stat"><b>${acc}%</b>accuracy</div>
      <div class="stat"><b>${streak}</b>streak</div>
      <div class="stat" id="toggle-weak" style="cursor:pointer; color:var(--clay); display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:4px;">
        <div style="display:flex; align-items:center; justify-content:center;">${bookIcon}</div>
        <span style="margin-top:2px;">practice</span>
      </div>
    </div>

    <div class="needs-practice-container ${uiNeedsPracticeOpen ? "open" : ""}" id="weak-dropdown">
      ${chipsBlock("Hiragana", weakHira)}
      ${chipsBlock("Katakana", weakKata)}
    </div>

    <div class="section">Gojuon<span class="sub">${studyMode ? "Tap to see how to write it" : "Tap to choose what Drill practises"}</span></div>
    ${scriptsToShow.includes("hira") ? renderSection("hira", ROWS, "basic", s === "both") : ""}
    ${scriptsToShow.includes("kata") ? renderSection("kata", ROWS, "basic", s === "both") : ""}
    
    <div class="section">Dakuten / Handakuten<span class="sub">Voiced & semi-voiced</span></div>
    ${scriptsToShow.includes("hira") ? renderSection("hira", ROWS_VOICED, "voiced", s === "both") : ""}
    ${scriptsToShow.includes("kata") ? renderSection("kata", ROWS_VOICED, "voiced", s === "both") : ""}
    
    <div class="section">Yōon<span class="sub">Contracted sounds</span></div>
    ${scriptsToShow.includes("hira") ? renderSection("hira", ROWS_YOON, "yoon", s === "both") : ""}
    ${scriptsToShow.includes("kata") ? renderSection("kata", ROWS_YOON, "yoon", s === "both") : ""}
    
    <div class="dock">
      <p id="drill-warning" class="drill-warning" aria-live="polite" hidden></p>
      <div class="dock-actions">
        <button id="drillbtn" class="grow"></button>
        <button id="study" class="sq ${studyMode ? "on" : ""}" aria-label="Study mode (stroke order)">✒︎</button>
        <button id="gear" class="sq" aria-label="Settings">⚙︎</button>
      </div>
    </div>`;
      
  const label = () => {
    const n = count();
    const hasKanaQuestions = n > 0 && settings.mixWrite + settings.mixRead + settings.mixPick > 0;
    const wordCount = wordQuestionPool().length;
    const hasWordQuestions = wordCount >= 2 && settings.mixWords > 0;
    const hasListenQuestions = settings.mixListen > 0 && canListen();
    $("drillbtn").textContent = n ? `Drill (${n})` : hasWordQuestions ? "Word drill" : "Choose characters";
    $("drillbtn").disabled = !hasKanaQuestions && !hasWordQuestions && !hasListenQuestions;
    const wordWarning = $("drill-warning");
    wordWarning.hidden = settings.mixWords === 0 || wordCount >= 2;
    wordWarning.textContent = wordWarning.hidden ? "" : "Not enough words available. Select more kana to practise words.";
  };
  label();

  let dragTarget = null;
  let startX = 0, startY = 0;
  let isDragging = false;

  const paint = (tile, on) => {
    const ch = tile.dataset.ch;
    if (on) selected.add(ch); else selected.delete(ch);
    tile.classList.toggle("picked", on);
  };
  const tileAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".tile") : null;
  };

  view.onpointerdown = e => {
    if (studyMode) return;
    const tile = e.target.closest(".tile");
    if (!tile) { dragTarget = null; return; }
    
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;
    dragTarget = !selected.has(tile.dataset.ch);
    
    paint(tile, dragTarget); label(); 
  };

  view.onpointermove = e => {
    if (dragTarget === null) return;
    
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);

    if (!isDragging) {
      if (dx > 10 && dx > dy) {
        isDragging = true;
        e.preventDefault();
      } else if (dy > 10) {
        const tile = tileAt(startX, startY);
        if (tile) paint(tile, !dragTarget); 
        dragTarget = null;
        return;
      }
    }

    if (isDragging) {
      e.preventDefault();
      const tile = tileAt(e.clientX, e.clientY);
      if (!tile) return;
      if (dragTarget === selected.has(tile.dataset.ch)) return;
      paint(tile, dragTarget); label();
    }
  };

  const endDrag = () => { 
    if (dragTarget !== null) { 
      saveSelected(); 
      dragTarget = null; 
      isDragging = false;
    } 
  };
  
  view.onpointerup = endDrag;
  view.onpointercancel = endDrag;
  view.onpointerleave = endDrag;

  view.onclick = e => {
    if (e.target.closest("#toggle-weak")) {
      uiNeedsPracticeOpen = !uiNeedsPracticeOpen;
      renderChart();
      return;
    }

    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "scr") {
      if (s === "hira") settings.script = "kata";
      else if (s === "kata") settings.script = "both";
      else settings.script = "hira";
      saveSettings(); renderChart();
    }
    else if (b.id === "romaji") { settings.showRomaji = !settings.showRomaji; saveSettings(); renderChart(); }
    else if (b.id === "study") { studyMode = !studyMode; renderChart(); }
    else if (b.id === "gear") show("settings");
    else if (b.id === "drillbtn") startDrill();
    else if (b.dataset.ch) {
      if (studyMode) { openDetail(b.dataset.ch); return; }
      if (b.classList.contains("chip")) {
        const group = b.closest(".chips");
        const list = group ? JSON.parse(group.dataset.list || "[]") : [];
        openDetail(b.dataset.ch, list);
        return;
      }
      if (e.detail === 0) {
        const on = !selected.has(b.dataset.ch);
        paint(b, on); saveSelected(); label();
      }
    }
  };
}

// ---------- detail pop-up ----------
function openDetail(ch, list) {
  const nav = list && list.length ? list : KANA.filter(k => k.script === KANA_BY_CH[ch].script).map(k => k.ch);
  const idx = Math.max(0, nav.indexOf(ch));
  const k = KANA_BY_CH[ch], st = progress[ch];
  const go = d => openDetail(nav[(idx + d + nav.length) % nav.length], nav);
  const hasStrokes = !!STROKES[ch];
  modal.innerHTML = `<div class="sheet">
      <div class="detail-top"><button id="prev" aria-label="Previous">‹</button>
        <div><div class="detail-char">${ch}</div><div class="detail-romaji">${k.romaji}</div></div>
        <button id="next" aria-label="Next">›</button></div>
      <canvas id="dcv" width="240" height="240"></canvas>
      <p class="note">${hasStrokes ? "Stroke order" : "Stroke data not yet available"} · ${st ? `${st.right} right, ${st.wrong} wrong` : "not practiced yet"}</p>
      <div class="btns">${hasStrokes ? `<button id="replay">Replay</button>` : ""}<button id="close" class="primary">Close</button></div></div>`;
  modal.classList.add("open");
  playStrokes($("dcv"), ch);
  playKanaPronunciation(ch);
  if (hasStrokes) $("replay").onclick = () => playStrokes($("dcv"), ch);
  $("prev").onclick = () => go(-1);
  $("next").onclick = () => go(1);
  $("close").onclick = () => modal.classList.remove("open");
}
modal.onclick = e => { if (e.target === modal) modal.classList.remove("open"); };

// ---------- settings ----------
function renderSettings() {
  const opt = (label, key, opts) => `<div class="set-row"><div class="set-label">${label}</div><div class="seg">${
    opts.map(([v, t]) => `<button data-k="${key}" data-v="${v}" class="${settings[key] === v ? "on" : ""}">${t}</button>`).join("")}</div></div>`;

  const mixKeys = ["mixWrite", "mixRead", "mixPick", "mixWords", "mixListen"];
  if (mixKeys.reduce((total, key) => total + settings[key], 0) !== 100) {
    mixKeys.forEach(key => { settings[key] = DEFAULTS[key]; });
  }

  view.innerHTML = `
    <div class="navbar settings-navbar">
      <button id="back" aria-label="Back">‹</button>
      <div class="brand-group">
        <div class="brand"><img src="logo.svg" alt=""><span>hanaha</span></div>
      </div>
      <div class="settings-title">Settings</div>
      <span class="navbar-spacer"></span>
    </div>
    <div class="page">
      ${opt("Theme", "theme", [["light", "Light"], ["dark", "Dark"], ["auto", "Auto"]])}
      ${opt("Writing check", "level", [["easy", "Easy"], ["normal", "Normal"], ["strict", "Strict"]])}
      <div class="set-row">
        <label class="set-label" for="pronunciation-volume">Pronunciation volume <output id="pronunciation-volume-value">${settings.pronunciationVolumePercent}%</output></label>
        <input id="pronunciation-volume" type="range" min="0" max="100" step="1" value="${settings.pronunciationVolumePercent}">
      </div>

      <div class="set-row">
        <div class="set-label">Question Mix</div>
        <div class="slider-container" id="mix-slider">
          <div class="slider-seg" data-k="mixWrite" style="width: ${settings.mixWrite}%; background: var(--clay); color: #fff;">
            <span>Write</span>
            <span class="pct">${settings.mixWrite}%</span>
          </div>
          <div class="slider-seg" data-k="mixRead" style="width: ${settings.mixRead}%; background: var(--peach); color: var(--ink);">
            <span>Read</span>
            <span class="pct">${settings.mixRead}%</span>
          </div>
          <div class="slider-seg" data-k="mixPick" style="width: ${settings.mixPick}%; background: var(--peach-dark); color: var(--ink);">
            <span>Recall</span>
            <span class="pct">${settings.mixPick}%</span>
          </div>
          <div class="slider-seg" data-k="mixWords" style="width: ${settings.mixWords}%; background: var(--slate); color: #fff;">
            <span>Words</span>
            <span class="pct">${settings.mixWords}%</span>
          </div>
          <div class="slider-seg" data-k="mixListen" style="width: ${settings.mixListen}%; background: var(--slate-dark); color: #fff;">
            <span>Listen</span>
            <span class="pct">${settings.mixListen}%</span>
          </div>
        </div>
        
        <div class="mix-inputs">
          <div class="mix-input-group">
            <label for="in-write">Write</label>
            <input type="number" id="in-write" value="${settings.mixWrite}" min="0" max="100">
          </div>
          <div class="mix-input-group">
            <label for="in-read">Read</label>
            <input type="number" id="in-read" value="${settings.mixRead}" min="0" max="100">
          </div>
          <div class="mix-input-group">
            <label for="in-pick">Recall</label>
            <input type="number" id="in-pick" value="${settings.mixPick}" min="0" max="100">
          </div>
          <div class="mix-input-group">
            <label for="in-words">Words</label>
            <input type="number" id="in-words" value="${settings.mixWords}" min="0" max="100">
          </div>
          <div class="mix-input-group">
            <label for="in-listen">Listen</label>
            <input type="number" id="in-listen" value="${settings.mixListen}" min="0" max="100">
          </div>
        </div>
      </div>

      ${opt("Answer choices", "choices", [[4, "4"], [6, "6"], [8, "8"], [10, "10"]])}
      ${opt("Questions per drill", "sessionLen", [[5, "5"], [10, "10"], [20, "20"]])}
      <div class="set-row">
        <div class="set-label">Study data</div>
        <p class="note">Backups include proficiency for every kana, practice and accuracy statistics, streak history, and settings.</p>
        <div class="btns">
          <button id="export-data">Export data</button>
          <button id="import-data">Import data</button>
          <input id="data-file" type="file" accept=".txt,.json,text/plain,application/json" hidden>
        </div>
      </div>
      <div class="btns"><button id="reset">Reset progress</button></div>
      <p class="note">Stroke order data: KanjiVG (c) Ulrich Apel, CC BY-SA 3.0.</p>
    </div>`;

  const slider = $("mix-slider");
  const volumeSlider = $("pronunciation-volume");
  volumeSlider.addEventListener("input", () => {
    settings.pronunciationVolumePercent = Number(volumeSlider.value);
    $("pronunciation-volume-value").value = `${settings.pronunciationVolumePercent}%`;
    setPronunciationVolume(settings.pronunciationVolumePercent);
    saveSettings();
  });
  const inputs = ["in-write", "in-read", "in-pick", "in-words", "in-listen"].map($);
  let applyWidths;
  if (slider) {
    const segs = Array.from(slider.querySelectorAll(".slider-seg"));
    let drag = null;

    const handles = Array.from({ length: segs.length - 1 }, () => {
      const h = document.createElement("div");
      h.className = "slider-handle";
      slider.appendChild(h);
      return h;
    });

    const widths = () => segs.map(s => parseFloat(s.style.width) || 0);

    const layoutHandles = () => {
      const w = widths();
      let boundary = 0;
      handles.forEach((handle, i) => {
        boundary += w[i];
        handle.style.left = `calc(${boundary}% - 6px)`;
      });
    };
    layoutHandles();

    applyWidths = (arr) => {
      const rounded = arr.map(value => Math.max(0, Math.floor(value)));
      rounded[rounded.length - 1] = 100 - rounded.slice(0, -1).reduce((sum, value) => sum + value, 0);
      segs.forEach((segment, i) => {
        segment.style.width = `${rounded[i]}%`;
        segment.querySelector(".pct").textContent = `${rounded[i]}%`;
        inputs[i].value = rounded[i];
      });
      layoutHandles();
    };

    slider.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const rect = slider.getBoundingClientRect();
      const boundaryPositions = [];
      let boundary = 0;
      widths().slice(0, -1).forEach(width => {
        boundary += width;
        boundaryPositions.push(boundary);
      });
      const pointerPct = (e.clientX - rect.left) / rect.width * 100;
      const idx = boundaryPositions.reduce((closest, position, i) =>
        Math.abs(position - pointerPct) < Math.abs(boundaryPositions[closest] - pointerPct) ? i : closest, 0);
      const boundaryX = rect.left + boundaryPositions[idx] / 100 * rect.width;
      if (Math.abs(e.clientX - boundaryX) > 14) return;

      const currentWidths = widths();
      drag = {
        index: idx,
        offsetX: e.clientX - boundaryX,
        left: currentWidths.slice(0, idx).reduce((sum, width) => sum + width, 0),
        pairTotal: currentWidths[idx] + currentWidths[idx + 1]
      };
      e.preventDefault();
      slider.setPointerCapture(e.pointerId);
    });

    const onMove = e => {
      if (!drag) return;
      e.preventDefault();

      const rect = slider.getBoundingClientRect();
      const pct = ((e.clientX - drag.offsetX - rect.left) / rect.width) * 100;
      const w = widths();
      const first = Math.round(Math.max(0, Math.min(drag.pairTotal, pct - drag.left)));
      const adjusted = w.slice();
      adjusted[drag.index] = first;
      adjusted[drag.index + 1] = drag.pairTotal - first;
      applyWidths(adjusted);
    };

    const onUp = () => {
      if (!drag) return;
      drag = null;
      const w = widths().map(v => Math.round(v));
      mixKeys.forEach((key, i) => { settings[key] = w[i]; });
      saveSettings();
    };

    slider.addEventListener("pointermove", onMove);
    slider.addEventListener("pointerup", onUp);
    slider.addEventListener("pointercancel", onUp);

    window.__showSettingsCleanup = () => {
      slider.removeEventListener("pointermove", onMove);
      slider.removeEventListener("pointerup", onUp);
      slider.removeEventListener("pointercancel", onUp);
    };
  }

  const updateFromInputs = (changedKey) => {
    const changedIndex = mixKeys.indexOf(changedKey);
    const values = inputs.map(input => Math.max(0, Math.min(100, Number.parseInt(input.value, 10) || 0)));
    const changedValue = values[changedIndex];
    const remainder = 100 - changedValue;
    const otherIndices = mixKeys.map((_, i) => i).filter(i => i !== changedIndex);
    const otherTotal = otherIndices.reduce((sum, i) => sum + values[i], 0);
    let assigned = 0;

    otherIndices.forEach((i, position) => {
      values[i] = position === otherIndices.length - 1
        ? remainder - assigned
        : otherTotal
          ? Math.floor(remainder * values[i] / otherTotal)
          : Math.floor(remainder / otherIndices.length);
      assigned += values[i];
    });

    mixKeys.forEach((key, i) => { settings[key] = values[i]; });
    applyWidths(values);
    saveSettings();
  };

  mixKeys.forEach((key, i) => inputs[i].addEventListener("input", () => updateFromInputs(key)));
  $("data-file").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const backup = validateBackup(JSON.parse(await file.text()));
      if (!confirm("Import this backup and replace the study data and settings on this device?")) return;

      const keys = {
        "hirakana-settings": backup.settings,
        "hirakana-progress": backup.progress,
        "hirakana-days": backup.days
      };
      const previous = Object.keys(keys).map(key => [key, localStorage.getItem(key)]);
      try {
        Object.entries(keys).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
      } catch (error) {
        let rollbackFailed = false;
        previous.forEach(([key, value]) => {
          try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
          } catch (rollbackError) {
            rollbackFailed = true;
          }
        });
        throw new Error(rollbackFailed
          ? "Storage failed during import, and the previous data could not be fully restored."
          : "Storage failed during import; the previous data was restored.");
      }

      settings = backup.settings;
      progress = backup.progress;
      days = backup.days;
      setPronunciationVolume(settings.pronunciationVolumePercent);
      applyTheme();
      show("chart");
      alert("Study data imported.");
    } catch (error) {
      alert(`Could not import this backup: ${error.message}`);
    } finally {
      e.target.value = "";
    }
  });

  view.onclick = e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "back") show("chart");
    else if (b.id === "export-data") {
      const backup = createBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hanaha-data-${new Date().toISOString().slice(0, 10)}.txt`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    else if (b.id === "import-data") $("data-file").click();
    else if (b.dataset.k) {
      const v = b.dataset.v;
      settings[b.dataset.k] =
        v === "true" ? true :
        v === "false" ? false :
        (v !== "" && !isNaN(v)) ? Number(v) :
        v;
      saveSettings();
      if (b.dataset.k === "theme") applyTheme();
      renderSettings();
    }
    else if (b.id === "reset" && confirm("Erase all progress?")) {
      progress = {}; days = [];
      store("hirakana-progress", progress); store("hirakana-days", days);
      renderSettings();
    }
  };
}

const SCREENS = { chart: renderChart, settings: renderSettings };
function show(name) {
  if (window.__showSettingsCleanup) {
    window.__showSettingsCleanup();
    window.__showSettingsCleanup = null;
  }
  animToken++; drill = null;
  view.onclick = null;
  view.onchange = null;
  view.onpointerdown = null;
  view.onpointermove = null;
  view.onpointerup = null;
  view.onpointercancel = null;
  view.onpointerleave = null;
  modal.classList.remove("open");
  SCREENS[name]();
  window.scrollTo(0, 0);
}

applyTheme();
show("chart");

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js");
}