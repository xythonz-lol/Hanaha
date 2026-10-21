// drill.js - the Drill (multiple-choice + writing questions) and the drawing checker.

let drill = null;

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function poolChars() { return KANA.filter(k => k.script === settings.script && selected.has(k.ch)); }

function startDrill() {
  if (!poolChars().length) return;
  drill = { i: 0, score: 0, missed: [], lastCh: "" };
  nextQuestion();
}

function pickChar() {
  const pool = poolChars();
  const w = pool.map(k => {
    if (k.ch === drill.lastCh && pool.length > 1) return 0;
    const s = progress[k.ch];
    if (!s) return 2;
    return (isMastered(k.ch) ? 0.3 : 1) + 3 * s.miss;
  });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[0];
}

function nextQuestion() {
  if (!drill) return;
  if (drill.i >= settings.sessionLen) { renderSummary(); return; }
  drill.i++;
  
  const k = pickChar();
  drill.lastCh = k.ch;

  let weights = [
    { type: "write", weight: settings.mixWrite },
    { type: "read", weight: settings.mixRead },
    { type: "pick", weight: settings.mixPick }
  ];
  
  weights = weights.filter(w => w.weight > 0);
  if (!weights.length) weights = [{ type: "write", weight: 1 }];

  const totalWeight = weights.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * totalWeight;
  let type = "write";
  for (const w of weights) {
    r -= w.weight;
    if (r <= 0) { type = w.type; break; }
  }
  
  if (type === "write") renderWrite(k);
  else renderChoice(k, type);
}

function topline() {
  const pct = (drill.i - 1) / settings.sessionLen * 100;
  return `<div class="topline"><button id="quit" class="x" aria-label="Quit">✕</button>
    <div class="track"><i style="width:${pct}%"></i></div><span class="count">${drill.i}/${settings.sessionLen}</span></div>`;
}
function wireQuit() { $("quit").onclick = () => { drill = null; show("chart"); }; }
function answered(ch, ok) {
  record(ch, ok);
  if (ok) drill.score++; else drill.missed.push(ch);
}

function distractors(k, n) {
  const same = KANA.filter(x => x.script === k.script && x.ch !== k.ch);
  const sameGroup = same.filter(x => x.group === k.group);
  const look = SIMILAR.filter(g => g.includes(k.ch)).join("");
  const near = shuffle(sameGroup.filter(x => look.includes(x.ch)));
  const inPool = shuffle(sameGroup.filter(x => !look.includes(x.ch) && selected.has(x.ch)));
  const rest = shuffle(same.filter(x => !look.includes(x.ch) && !selected.has(x.ch)));
  return [...near, ...inPool, ...rest].slice(0, n);
}

function renderChoice(k, kind) {
  const read = kind === "read";
  const opts = shuffle([k, ...distractors(k, settings.choices - 1)]);
  let picked = null, checked = false;
  view.innerHTML = `<div class="drill">${topline()}
      <div class="glyph ${read ? "" : "rom"}">${read ? k.ch : k.romaji}</div>
      <div class="opts">${opts.map(o =>
        read
          ? `<button class="opt" data-ch="${o.ch}">${o.romaji}</button>`
          : `<button class="opt kana" data-ch="${o.ch}" data-romaji="${o.romaji}">${o.ch}</button>`
      ).join("")}</div></div>
    <div class="foot"><button id="go" class="go" disabled>Check Answer</button></div>`;
  wireQuit();
  const go = $("go");
  view.onclick = e => {
    const b = e.target.closest(".opt");
    if (!b || checked) return;
    picked = b.dataset.ch;
    document.querySelectorAll(".opt").forEach(x => x.classList.toggle("sel", x === b));
    go.disabled = false;
  };
  go.onclick = () => {
    if (checked) { nextQuestion(); return; }
    checked = true;
    const ok = picked === k.ch;
    document.querySelectorAll(".opt.kana").forEach(x => {
      if (!x.querySelector("small")) {
        const s = document.createElement("small");
        s.textContent = x.dataset.romaji;
        x.appendChild(s);
      }
    });
    document.querySelectorAll(".opt").forEach(x => {
      x.classList.remove("sel"); x.disabled = true;
      if (x.dataset.ch === k.ch) x.classList.add("right");
      else if (x.dataset.ch === picked) x.classList.add("wrong");
    });
    answered(k.ch, ok);
    go.textContent = "Continue"; go.className = "go " + (ok ? "good" : "bad");
  };
}

function renderWrite(k) {
  view.innerHTML = `<div class="drill">${topline()}
      <div class="prompt"><span class="rom">${k.romaji}</span><span class="sub">${SCRIPT_NAME[k.script]}</span></div>
      <div class="pair" id="pair"><canvas id="cv" width="400" height="400"></canvas></div>
      <div class="btns" id="tools"><button id="clear">Clear</button><button id="hint">Hint</button></div>
      <p id="msg" class="msg"></p></div>
    <div class="foot" id="foot"><button id="go" class="go">Check Answer</button></div>`;
  wireQuit();
  view.onclick = null;

  let strokes = [], drawing = false, hinted = false, done = false;
  const cv = $("cv"), ctx = cv.getContext("2d");
  const pos = e => {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height };
  };

  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function redraw() {
    const ink = cssVar("--ink") || "#2B0006";
    const guide = cssVar("--peach") || "#F7C6CB";
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (hinted) drawGuide(ctx, k.ch, cv.width, guide, cv.width / 16);
    ctx.lineWidth = 14; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = ink;
    strokes.forEach(s => {
      ctx.beginPath();
      s.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y);
      ctx.stroke();
    });
  }
  cv.onpointerdown = e => {
    if (done) return;
    drawing = true;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    strokes.push([pos(e)]); redraw();
  };
  cv.onpointermove = e => { if (drawing) { strokes[strokes.length - 1].push(pos(e)); redraw(); } };
  cv.onpointerup = cv.onpointercancel = () => { drawing = false; };

  $("clear").onclick = () => { if (!done) { strokes = []; redraw(); } };
  $("hint").onclick = () => { if (!done) { hinted = true; redraw(); } };

  function showContinue(cls, onclick) {
    $("foot").innerHTML = `<button id="go" class="go ${cls}">Continue</button>`;
    $("go").onclick = onclick;
  }

  function addReference() {
    $("pair").insertAdjacentHTML("beforeend", `<canvas id="rcv" width="400" height="400"></canvas>`);
    const rcv = $("rcv"), rctx = rcv.getContext("2d");
    const ink = cssVar("--ink") || "#2B0006";
    drawGuide(rctx, k.ch, rcv.width, ink, rcv.width / 16);
  }

  $("go").onclick = () => {
    if (done) return;
    if (!strokes.length) { $("msg").textContent = "Draw the character first."; return; }
    done = true;
    $("tools").classList.add("hidden");
    const pass = checkDrawing(strokes, k.ch, cv.width);
    
    if (hinted) {
      $("msg").textContent = (pass ? "✓ Looks right" : "✗ Not quite") + " (hint used, not counted)";
      addReference();
      showContinue(pass ? "good" : "bad", nextQuestion);
    } else if (pass) {
      $("msg").textContent = "✓ Correct!";
      answered(k.ch, true);
      addReference();
      
      $("foot").innerHTML = `
        <button id="mine" class="go alt" style="flex: 0.5; font-size: 16px;">Count as incorrect</button>
        <button id="go" class="go good">Continue</button>
      `;
      
      $("mine").onclick = () => { 
        const s = progress[k.ch];
        if (s) {
          // Undo the increment that happened when the checker passed
          s.right = Math.max(0, s.right - 1);
          s.streak = Math.max(0, s.streak - 1);
          s.miss = s.miss + 1; // Put the miss weight back
        }
        // Now record as incorrect (this increments wrong, sets streak to 0)
        record(k.ch, false);
        nextQuestion();
      };
      
      $("go").onclick = nextQuestion;
      
    } else {
      $("msg").textContent = `✗ Not quite. This is ${k.ch} - watch the stroke order.`;
      $("pair").insertAdjacentHTML("beforeend", `<canvas id="rcv" width="400" height="400"></canvas>`);
      playStrokes($("rcv"), k.ch);
      $("foot").innerHTML = `<button id="mine" class="go alt">Count as correct</button><button id="go" class="go bad">Continue</button>`;
      $("mine").onclick = () => { answered(k.ch, true); nextQuestion(); };
      $("go").onclick = () => { answered(k.ch, false); nextQuestion(); };
    }
  };
}

function renderSummary() {
  const n = settings.sessionLen, missed = [...new Set(drill.missed)];
  view.innerHTML = `<div class="drill"><div class="card"><div class="score">${drill.score}/${n}</div>
      <p>${Math.round(100 * drill.score / n)}% correct</p></div>` +
    (missed.length
      ? `<h3 class="row-title">Review these (tap for stroke order)</h3><div class="chips">${missed.map(c => `<button class="chip" data-ch="${c}">${c}</button>`).join("")}</div>`
      : `<p class="note">Nothing missed!</p>`) + `</div>
    <div class="foot"><button id="home" class="go alt">Done</button><button id="again" class="go">Drill again</button></div>`;
  $("again").onclick = startDrill;
  $("home").onclick = () => show("chart");
  view.onclick = e => { const c = e.target.closest(".chip"); if (c) openDetail(c.dataset.ch); };
  drill = null;
}

const G = 64, PAD = 4;
const LEVELS = { 
  easy:   [10, 0.65],
  normal: [6,  0.75],
  strict: [3,  0.85]
};

function toGrid(strokes, isReference) {
  const pts = strokes.flat(), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
  
  const min = 0.35 * Math.max(w, h, 1);
  const sx = (G - 2 * PAD) / Math.max(w, min), sy = (G - 2 * PAD) / Math.max(h, min);
  const ox = (G - w * sx) / 2, oy = (G - h * sy) / 2;
  
  const c = document.createElement("canvas"); c.width = c.height = G;
  const x = c.getContext("2d");
  
  x.lineWidth = isReference ? 6 : 2;
  x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#000";
  
  strokes.forEach(st => {
    x.beginPath();
    st.forEach((p, i) => {
      const px = ox + (p.x - minX) * sx, py = oy + (p.y - minY) * sy;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    });
    if (st.length === 1) x.lineTo(ox + (st[0].x - minX) * sx + 0.1, oy + (st[0].y - minY) * sy);
    x.stroke();
  });
  
  const d = x.getImageData(0, 0, G, G).data, bits = new Uint8Array(G * G);
  for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4 + 3] > 100 ? 1 : 0;
  return bits;
}

const refCache = {};
function refGrid(ch) {
  if (!refCache[ch]) {
    refCache[ch] = toGrid(STROKES[ch].map(st => st.map(([x, y]) => ({ x, y }))), true);
  }
  return refCache[ch];
}

function dilate(bits, r) {
  const out = new Uint8Array(G * G);
  for (let i = 0; i < bits.length; i++) if (bits[i]) {
    const px = i % G, py = (i / G) | 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = px + dx, y = py + dy;
      if (x >= 0 && x < G && y >= 0 && y < G) out[y * G + x] = 1;
    }
  }
  return out;
}

function overlap(a, b) {
  let n = 0, hit = 0;
  for (let i = 0; i < a.length; i++) if (a[i]) { n++; if (b[i]) hit++; }
  return n ? hit / n : 0;
}

function checkDrawing(strokes, ch, canvasSize, level) {
  if (!STROKES[ch]) return false;
  
  const [radius, threshold] = level || LEVELS[settings.level] || LEVELS.normal;
  const pts = strokes.flat(), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (size < canvasSize * 0.2) return false;

  const u = toGrid(strokes, false);
  const r = refGrid(ch);
  
  const uDilated = dilate(u, radius);
  const rDilated = dilate(r, radius);

  const coverage = overlap(r, uDilated);
  const precision = overlap(u, rDilated);

  return coverage >= threshold && precision >= threshold;
}