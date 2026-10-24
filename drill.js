function renderListeningQuestion(k) {
  const pool = listeningPool();
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
      const small = document.createElement("small");
      small.textContent = drillRomaji(KANA_BY_CH[option.dataset.ch]);
      option.appendChild(small);
      option.classList.remove("sel");
      option.disabled = true;
      if (option.dataset.ch === k.ch) option.classList.add("right");
      else if (option.dataset.ch === picked) option.classList.add("wrong");
    });
    $("listen-feedback").textContent = k.ch;
    answered(k.ch, correct);
    playPronunciation([k.romaji]);
    go.textContent = "Continue";
    go.className = `go ${correct ? "good" : "bad"}`;
  };
}
