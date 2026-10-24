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

function poolChars() { 
  return KANA.filter(k => {
    if (settings.script === "both") return selected.has(k.ch);
    return k.script === settings.script && selected.has(k.ch);
  });
}

function drillRomaji(k) {
  const ambiguous = KANA.some(x =>
    x.script === k.script && x.ch !== k.ch && x.romaji === k.romaji
  );
  return ambiguous ? `${k.romaji} (${k.row[0]} row)` : k.romaji;
}

function kanaTokens(kana, script, requireSelected) {
  const kanae = KANA
    .filter(k => k.script === script && (!requireSelected || selected.has(k.ch)))
    .sort((a, b) => b.ch.length - a.ch.length);
  const tokens = [];
  let offset = 0;
  while (offset < kana.length) {
    if (script === "kata" && kana[offset] === "ー") {
      offset++;
      continue;
    }
    const token = kanae.find(k => kana.startsWith(k.ch, offset));
    if (!token) return null;
    tokens.push(token);
    offset += token.ch.length;
  }
  return tokens;
}

function selectedKanaTokens(kana, script) {
  return kanaTokens(kana, script, true);
}

function wordQuestionPool() {
  const vocabularies = settings.script === "both"
    ? [{ words: WORDS, script: "hira" }, { words: KATAKANA_WORDS, script: "kata" }]
    : [{ words: settings.script === "kata" ? KATAKANA_WORDS : WORDS, script: settings.script }];
  return vocabularies.flatMap(({ words, script }) => words.flatMap(word => {
    const tokens = selectedKanaTokens(word.kana, script);
    if (!tokens) return [];
    const pronunciation = tokens.every(token => PRONUNCIATION_FILES.has(token.romaji))
      ? tokens.map(token => token.romaji)
      : null;
    return [{ ...word, script, ...(pronunciation ? { pronunciation } : {}) }];
  }));
}

let pronunciationContext = null;
let pronunciationSources = [];
let pronunciationGains = [];
let pronunciationPlayback = 0;
const pronunciationBuffers = new Map();

function setPronunciationVolume(percent) {
  pronunciationGains.forEach(gain => { gain.gain.value = percent / 100; });
}

function pronunciationBuffer(romaji) {
  if (!pronunciationBuffers.has(romaji)) {
    const request = fetch(`pronunciation/${romaji}.mp3`)
      .then(response => {
        if (!response.ok) throw new Error(`Could not load pronunciation/${romaji}.mp3 (${response.status}).`);
        return response.arrayBuffer();
      })
      .then(data => pronunciationContext.decodeAudioData(data))
      .catch(error => {
        pronunciationBuffers.delete(romaji);
        throw error;
      });
    pronunciationBuffers.set(romaji, request);
  }
  return pronunciationBuffers.get(romaji);
}

function firstPronunciation(buffer) {
  const frameSize = Math.max(1, Math.round(buffer.sampleRate / 100));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const frameCount = Math.ceil(buffer.length / frameSize);
  let firstSpeechFrame = -1;
  let lastSpeechFrame = -1;

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSize;
    const end = Math.min(start + frameSize, buffer.length);
    let energy = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i++) energy += channel[i] * channel[i];
    }
    const rms = Math.sqrt(energy / ((end - start) * channels.length));
    if (rms > 0.004) {
      if (firstSpeechFrame < 0) firstSpeechFrame = frame;
      lastSpeechFrame = frame;
    } else if (lastSpeechFrame >= 0 && frame - lastSpeechFrame >= 18) {
      break;
    }
  }

  if (firstSpeechFrame < 0) throw new Error("The pronunciation contains no detectable speech.");
  const start = Math.max(0, firstSpeechFrame * frameSize / buffer.sampleRate - 0.04);
  const end = Math.min(buffer.duration, (lastSpeechFrame + 1) * frameSize / buffer.sampleRate + 0.08);
  return { start, duration: end - start };
}

async function playPronunciation(romaji) {
  const playback = ++pronunciationPlayback;
  pronunciationSources.forEach(source => source.stop());
  pronunciationSources = [];
  pronunciationGains = [];

  if (!romaji.length || settings.pronunciationVolumePercent === 0 ||
      romaji.some(value => !value || !PRONUNCIATION_FILES.has(value))) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Audio playback is not supported by this browser.");
    if (!pronunciationContext) pronunciationContext = new AudioContextClass();
    await pronunciationContext.resume();
    const buffers = await Promise.all(romaji.map(pronunciationBuffer));
    if (playback !== pronunciationPlayback) return;
    const clips = buffers.map(firstPronunciation);
    const sampleRate = buffers[0].sampleRate;
    const channels = Math.max(...buffers.map(buffer => buffer.numberOfChannels));
    const gapFrames = Math.round(sampleRate * 0.015);
    const segments = buffers.map((buffer, index) => {
      const start = Math.floor(clips[index].start * sampleRate);
      const end = Math.min(buffer.length, Math.ceil((clips[index].start + clips[index].duration) * sampleRate));
      return { buffer, start, length: end - start };
    });
    const totalFrames = segments.reduce((total, segment) => total + segment.length, 0) +
      gapFrames * Math.max(0, segments.length - 1);
    const wordBuffer = pronunciationContext.createBuffer(channels, totalFrames, sampleRate);
    for (let channel = 0; channel < channels; channel++) {
      const output = wordBuffer.getChannelData(channel);
      let offset = 0;
      segments.forEach((segment, index) => {
        const input = segment.buffer.getChannelData(Math.min(channel, segment.buffer.numberOfChannels - 1));
        output.set(input.subarray(segment.start, segment.start + segment.length), offset);
        offset += segment.length + (index < segments.length - 1 ? gapFrames : 0);
      });
    }

    const source = pronunciationContext.createBufferSource();
    source.buffer = wordBuffer;
    const gain = pronunciationContext.createGain();
    gain.gain.value = settings.pronunciationVolumePercent / 100;
    source.connect(gain);
    gain.connect(pronunciationContext.destination);
    pronunciationSources.push(source);
    pronunciationGains.push(gain);
    source.start();
  } catch (error) {
    if (playback === pronunciationPlayback) console.error("Could not play kana pronunciation.", error);
  }
}

function playKanaPronunciation(kana) {
  const script = [...kana].some(ch => ch >= "\u30a0") ? "kata" : "hira";
  const tokens = kanaTokens(kana, script, false);
  if (tokens) return playPronunciation(tokens.map(token => token.romaji));
}

function startDrill() {
  const hasKanaQuestions = poolChars().length > 0 &&
    settings.mixWrite + settings.mixRead + settings.mixPick > 0;
  const hasWordQuestions = wordQuestionPool().length >= 2 && settings.mixWords > 0;
  const hasListenQuestions = settings.mixListen > 0 && canListen();
  if (!hasKanaQuestions && !hasWordQuestions && !hasListenQuestions) return;
  drill = { i: 0, score: 0, missed: [], missedWords: [], lastCh: "", lastWord: "", askedChars: new Set() };
  nextQuestion();
}

function listeningPool() {
  return poolChars().filter(k => PRONUNCIATION_FILES.has(k.romaji));
}

function canListen() {
  return new Set(listeningPool().map(k => k.romaji)).size >= 2;
}

function pickChar(pool = poolChars()) {
  const unseen = pool.filter(k => !drill.askedChars.has(k.ch));
  const candidates = unseen.length ? unseen : pool;
  const w = candidates.map(k => {
    if (k.ch === drill.lastCh && pool.length > 1) return 0;
    const s = progress[k.ch];
    if (!s) return 2;
    return (isMastered(k.ch) ? 0.3 : 1) + 3 * s.miss;
  });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= w[i];
    if (r <= 0) {
      drill.askedChars.add(candidates[i].ch);
      return candidates[i];
    }
  }
  drill.askedChars.add(candidates[0].ch);
  return candidates[0];
}

function nextQuestion() {
  if (!drill) return;
  if (drill.i >= settings.sessionLen) { renderSummary(); return; }
  drill.i++;
  
  const chars = poolChars();
  const words = wordQuestionPool();
  let weights = [
    { type: "write", weight: chars.length ? settings.mixWrite : 0 },
    { type: "read", weight: chars.length ? settings.mixRead : 0 },
    { type: "pick", weight: chars.length ? settings.mixPick : 0 },
    { type: "word", weight: words.length >= 2 ? settings.mixWords : 0 },
    { type: "listen", weight: canListen() ? settings.mixListen : 0 }
  ];
  
  weights = weights.filter(w => w.weight > 0);
  if (!weights.length) {
    drill.i--;
    renderSummary();
    return;
  }

  const totalWeight = weights.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * totalWeight;
  let type = "write";
  for (const w of weights) {
    r -= w.weight;
    if (r <= 0) { type = w.type; break; }
  }

  if (type === "word") {
    const wordPool = words.filter(word => word.kana !== drill.lastWord);
    const word = wordPool[Math.floor(Math.random() * wordPool.length)] || words[0];
    drill.lastWord = word.kana;
    renderWordQuestion(word);
    return;
  }

  if (type === "listen") {
    const k = pickChar(listeningPool());
    drill.lastCh = k.ch;
    renderListeningQuestion(k);
    return;
  }

  const k = pickChar();
  drill.lastCh = k.ch;
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

function renderWordQuestion(word) {
  const kanaToRomaji = Math.random() < 0.5;
  const script = word.script;
  const distractors = wordQuestionPool().filter(item => item.romaji !== word.romaji);
  const options = shuffle([word, ...shuffle(distractors).slice(0, settings.choices - 1)]);
  const correctIndex = options.indexOf(word);
  let picked = null, checked = false;
  view.innerHTML = `<div class="drill word-question">${topline()}
      <div class="word-direction">${kanaToRomaji ? "Kana → romaji" : "Romaji → kana"}</div>
      <div class="glyph ${kanaToRomaji ? "word-kana" : "word-rom"}">${kanaToRomaji ? word.kana : word.romaji}</div>
      <div class="opts">${options.map((option, index) =>
        `<button class="opt ${kanaToRomaji ? "" : "kana"}" data-index="${index}">${kanaToRomaji ? option.romaji : option.kana}</button>`
      ).join("")}</div>
    </div>
    <div class="foot"><button id="go" class="go" disabled>Check Answer</button></div>`;
  wireQuit();
  const go = $("go");
  view.onclick = e => {
    const button = e.target.closest(".opt");
    if (!button || checked) return;
    picked = Number(button.dataset.index);
    document.querySelectorAll(".opt").forEach(option => option.classList.toggle("sel", option === button));
    go.disabled = false;
  };
  go.onclick = () => {
    if (checked) { nextQuestion(); return; }
    checked = true;
    const correct = picked === correctIndex;
    document.querySelectorAll(".opt").forEach((option, index) => {
      option.classList.remove("sel");
      option.disabled = true;
      if (index === correctIndex) option.classList.add("right");
      else if (index === picked) option.classList.add("wrong");
      const detail = document.createElement("small");
      detail.className = "word-option-detail";
      detail.textContent = kanaToRomaji
        ? options[index].meaning
        : `${options[index].romaji} · ${options[index].meaning}`;
      option.appendChild(detail);
    });
    if (correct) drill.score++;
    else drill.missedWords.push(word);
    if (word.pronunciation) playPronunciation(word.pronunciation);
    go.textContent = "Continue";
    go.className = `go ${correct ? "good" : "bad"}`;
  };
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
      <div class="glyph ${read ? "" : "rom"}">${read ? k.ch : drillRomaji(k)}</div>
      <div class="opts">${opts.map(o =>
        read
          ? `<button class="opt" data-ch="${o.ch}">${drillRomaji(o)}</button>`
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
        s.textContent = drillRomaji(KANA_BY_CH[x.dataset.ch]);
        x.appendChild(s);
      }
    });
    document.querySelectorAll(".opt").forEach(x => {
      x.classList.remove("sel"); x.disabled = true;
      if (x.dataset.ch === k.ch) x.classList.add("right");
      else if (x.dataset.ch === picked) x.classList.add("wrong");
    });
    answered(k.ch, ok);
    playKanaPronunciation(k.ch);
    go.textContent = "Continue"; go.className = "go " + (ok ? "good" : "bad");
  };
}

function renderListeningQuestion(k) {
  const allPronounceable = KANA.filter(item => PRONUNCIATION_FILES.has(item.romaji));
  const distractors = shuffle(allPronounceable.filter(item => item.ch !== k.ch))
    .slice(0, settings.choices - 1);
  const options = shuffle([k, ...distractors]);
  let picked = null, checked = false;

  view.innerHTML = `<div class="drill listening-question">${topline()}
      <div class="word-direction">Listen and choose the kana</div>
      <button id="listen-play" class="audio-play" aria-label="Play sound">▶ Play sound</button>
      <div class="opts">${options.map(option =>
        `<button class="opt kana" data-ch="${option.ch}">${option.ch}</button>`
      ).join("")}</div>
      <p id="listen-feedback" class="listen-feedback" aria-live="polite"></p></div>
    <div class="foot"><button id="go" class="go" disabled>Check Answer</button></div>`;

  wireQuit();
  $("listen-play").onclick = () => playPronunciation([k.romaji]);
  const go = $("go");

  view.onclick = e => {
    const button = e.target.closest(".opt");
    if (!button || checked) return;
    picked = button.dataset.ch;
    document.querySelectorAll(".opt").forEach(option => option.classList.toggle("sel", option === button));
    go.disabled = false;
  };

  go.onclick = () => {
    if (checked) { nextQuestion(); return; }
    checked = true;
    const correct = picked === k.ch;

    document.querySelectorAll(".opt").forEach(option => {
      option.classList.remove("sel");
      option.disabled = true;
      if (option.dataset.ch === k.ch) option.classList.add("right");
      else if (option.dataset.ch === picked) option.classList.add("wrong");

      if (option.dataset.ch === k.ch || option.dataset.ch === picked) {
        const small = document.createElement("small");
        small.textContent = drillRomaji(KANA_BY_CH[option.dataset.ch]);
        option.appendChild(small);
      }
    });

    $("listen-feedback").textContent = k.ch;
    answered(k.ch, correct);
    playPronunciation([k.romaji]);
    go.textContent = "Continue";
    go.className = `go ${correct ? "good" : "bad"}`;
  };
}

function renderWrite(k) {
  view.innerHTML = `<div class="drill">${topline()}
      <div class="prompt"><span class="rom">${drillRomaji(k)}</span><span class="sub">${SCRIPT_NAME[k.script]}</span></div>
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
    playKanaPronunciation(k.ch);
    
    if (hinted) {
      $("msg").textContent = (pass ? "✓ Looks right" : "✗ Not quite") + " (hint used, not counted)";
      addReference();
      showContinue(pass ? "good" : "bad", nextQuestion);
    } else if (pass) {
      $("msg").textContent = "✓ Correct!";
      addReference();
      
      $("foot").innerHTML = `
        <button id="mine" class="go alt" style="flex: 0.5; font-size: 16px;">Count as incorrect</button>
        <button id="go" class="go good">Continue</button>
      `;
      
      $("mine").onclick = () => { answered(k.ch, false); nextQuestion(); };
      
      $("go").onclick = () => { answered(k.ch, true); nextQuestion(); };
      
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
  const missedWords = [...new Map(drill.missedWords.map(word => [word.kana, word])).values()];
  const review = [
    missed.length
      ? `<h3 class="row-title">Review these (tap for stroke order)</h3><div class="chips">${missed.map(c => `<button class="chip" data-ch="${c}">${c}</button>`).join("")}</div>`
      : "",
    missedWords.length
      ? `<h3 class="row-title">Words to revisit</h3><div class="word-review">${missedWords.map(word =>
        `<div class="word-review-item"><span>${word.kana} · ${word.romaji}</span><span>${word.meaning}</span></div>`
      ).join("")}</div>`
      : ""
  ].join("");
  view.innerHTML = `<div class="drill"><div class="card"><div class="score">${drill.score}/${n}</div>
      <p>${Math.round(100 * drill.score / n)}% correct</p></div>` +
    (review || `<p class="note">Nothing missed!</p>`) + `</div>
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
