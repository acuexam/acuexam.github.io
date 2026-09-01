/* ============================================================
   acuExam engine — exam-agnostic.
   Everything specific to an exam lives in its pack JSON:
   metadata, domain weights, highlight terms, screens, questions.
   Usage:  acuExam.mount(pack, document.getElementById('app'))
   ============================================================ */
window.acuExam = (function () {
  'use strict';

  const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const STORE = 'acuexam-progress-v1';
  const MODE_NAMES = {
    exam: 'Exam simulation', full: 'Full bank', practice: 'Study mode',
    weak: 'Weak spots', drills: 'Menu drills', retry: 'Retry missed'
  };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const shuffled = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(p => p[1]);
  const $ = (sel, r) => (r || document).querySelector(sel);

  /* ---------- progress, namespaced per exam ---------- */
  let memStore = null, storageOK = true;
  const blankAll = () => ({ v: 1 });
  const blankExam = () => ({ attempts: [], q: {} });

  function readAll() {
    try {
      const raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : blankAll();
    } catch (e) { storageOK = false; return memStore || (memStore = blankAll()); }
  }
  function writeAll(all) {
    memStore = all;
    try { localStorage.setItem(STORE, JSON.stringify(all)); }
    catch (e) { storageOK = false; }
  }
  function loadProg(examId) {
    const all = readAll();
    const p = all[examId] || blankExam();
    if (!p.q) p.q = {}; if (!p.attempts) p.attempts = [];
    return p;
  }
  function saveProg(examId, p) {
    const all = readAll();
    all[examId] = p;
    writeAll(all);
  }

  const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    + ' ' + new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  /* ---------- the app ---------- */
  function mount(pack, root) {
    const QUESTIONS = pack.questions;
    const SCREENS = pack.screens || {};
    const TERMS = (pack.terms || []).slice().sort((a, b) => b.length - a.length);
    const DOMAIN = {};
    pack.domains.forEach(d => { DOMAIN[d.name] = d; });

    /* nav-node index for click questions */
    const NODE = {};
    Object.entries(SCREENS).forEach(([sid, sc]) => {
      sc.nav.forEach(top => {
        NODE[top.id] = { screen: sid, path: [top.label], desc: top.desc };
        (top.children || []).forEach(ch => { NODE[ch.id] = { screen: sid, path: [top.label, ch.label], desc: ch.desc }; });
      });
    });
    const pathOf = id => NODE[id] ? NODE[id].path.join(' › ') : id;

    /* ---------- topic-clue highlighting ---------- */
    function collect(text, list, type, out) {
      list.forEach(p => {
        const re = new RegExp(escRe(p), 'gi'); let m;
        while ((m = re.exec(text)) !== null) {
          out.push({ s: m.index, e: m.index + m[0].length, type });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      });
    }
    function highlight(text, cues, on) {
      if (!on) return esc(text);
      const hits = [];
      collect(text, cues || [], 'scene', hits);
      collect(text, TERMS, 'term', hits);
      hits.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s) || (a.type === 'scene' ? -1 : 1));
      let html = '', pos = 0, last = -1;
      for (const h of hits) {
        if (h.s < last || h.s < pos) continue;
        html += esc(text.slice(pos, h.s)) + '<mark class="' + h.type + '">' + esc(text.slice(h.s, h.e)) + '</mark>';
        pos = h.e; last = h.e;
      }
      return html + esc(text.slice(pos));
    }

    /* ---------- shell ---------- */
    const clicks = QUESTIONS.filter(q => q.type === 'click').length;
    root.innerHTML = `
<section id="setup">
  <div class="card" id="progressCard">
    <div class="row spread" style="margin-bottom:14px">
      <span class="eyebrow">Your progress</span>
      <button class="btn sm" id="openProgress">Full history →</button>
    </div>
    <div id="progressSummary"></div>
  </div>

  <div class="card">
    <span class="eyebrow">Choose a mode</span>
    <div class="opt-grid" id="modes">
      <button class="pick" data-mode="exam" aria-pressed="true">
        <strong>Exam simulation</strong>
        <span>${pack.examQuestions} questions, ${pack.minutes}-minute timer, graded at the end. Same length and weighting as the real thing.</span>
      </button>
      <button class="pick" data-mode="full" aria-pressed="false">
        <strong>Full bank</strong>
        <span>All ${QUESTIONS.length} questions, no timer.</span>
      </button>
      <button class="pick" data-mode="practice" aria-pressed="false">
        <strong>Study mode</strong>
        <span>20 questions with the answer and explanation revealed as you go.</span>
      </button>
      <button class="pick" data-mode="weak" aria-pressed="false" id="weakMode">
        <strong>Weak spots</strong>
        <span>Rebuilt from what you've missed or not yet seen.</span>
      </button>
      ${clicks ? `<button class="pick" data-mode="drills" aria-pressed="false">
        <strong>Menu drills</strong>
        <span>${clicks} click-the-menu questions — find the setting on a drawn console screen.</span>
      </button>` : ''}
    </div>

    <span class="eyebrow">Focus on one area</span>
    <div class="opt-grid" id="domains"></div>

    <label class="toggle" for="shuffleOpts">
      <input type="checkbox" id="shuffleOpts" checked>
      <span><b>Shuffle answer order</b>Stops you memorising "it was the third one".</span>
    </label>
    <label class="toggle" for="showCues">
      <input type="checkbox" id="showCues" checked>
      <span><b>Highlight the topic clues</b>Marks the words that tell you what a question is testing, so you learn to spot them under time pressure.</span>
    </label>
    <div class="legend" style="margin:2px 0 0 14px">
      <span><mark class="term">feature names</mark> the giveaway term</span>
      <span><mark class="scene">scenario clues</mark> the situation that points to the answer</span>
    </div>

    <div class="row" style="margin-top:20px">
      <button class="btn primary" id="start">Start</button>
      <span class="pill" id="startInfo"></span>
    </div>
  </div>

  <div class="card">
    <span class="eyebrow">How scoring works</span>
    <p class="prose" style="margin:8px 0 0">${esc(pack.code)} is scored on a scale of 1–${pack.scaleMax}, and you need <strong>${pack.passScaled} or more</strong> to pass. You get that scaled figure alongside your raw percentage, plus a breakdown by area. Everything you miss is explained — including why each answer you didn't pick was wrong.</p>
    ${clicks ? `<p class="prose" style="margin:12px 0 0"><strong>On the menu drills:</strong> the console screens are drawn recreations, not screenshots, built from current vendor documentation. Menu items move around; what the exam tests is which console and which area, and that part is stable. Every wrong click tells you what that item actually does.</p>` : ''}
  </div>
</section>

<section id="progressView" class="hidden">
  <div class="row spread" style="margin-bottom:16px">
    <h2>Your progress</h2>
    <button class="btn sm" id="closeProgress">← Back</button>
  </div>
  <div id="storageWarn"></div>
  <div class="card"><span class="eyebrow">Overall</span><div class="stats" id="bigStats" style="margin-top:10px"></div></div>
  <div class="card">
    <span class="eyebrow">Accuracy by topic</span>
    <p style="font-size:14px;color:var(--ink-2);margin:8px 0 14px">Weakest first. Topics you have not reached yet are collapsed at the bottom.</p>
    <div id="topicStats"></div>
  </div>
  <div class="card">
    <span class="eyebrow">Attempt history</span>
    <div id="histWrap" style="margin-top:12px"></div>
    <div class="row" style="margin-top:18px">
      <button class="btn sm" id="exportProg">Export progress</button>
      <button class="btn sm" id="importProg">Import progress</button>
      <button class="btn sm" id="resetProg">Reset this exam</button>
      <input type="file" id="importFile" accept="application/json,.json" class="hidden">
    </div>
  </div>
</section>

<section id="quiz" class="hidden">
  <div class="card">
    <div class="qmeta">
      <span><b id="qCount"></b> &nbsp;·&nbsp; <span id="qDomain" class="domain-chip"></span></span>
      <span id="timer"></span>
    </div>
    <div class="progress"><i id="progressBar"></i></div>
    <div class="qtext" id="qText"></div>
    <div class="answers" id="answers"></div>
    <div id="explainBox"></div>
    <div class="row spread" style="margin-top:22px">
      <div class="row">
        <button class="btn sm" id="prev">← Back</button>
        <button class="btn sm" id="next">Next →</button>
      </div>
      <button class="btn primary sm" id="finish">Finish &amp; grade</button>
    </div>
    <p style="margin:14px 0 0;font-size:13px;color:var(--ink-2)" id="kbdTip"></p>
  </div>
</section>

<section id="results" class="hidden">
  <div class="card">
    <div class="score-top">
      <div class="dial">
        <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="64" cy="64" r="54" fill="none" stroke="var(--surface-2)" stroke-width="11"/>
          <circle id="dialArc" cx="64" cy="64" r="54" fill="none" stroke="var(--accent)" stroke-width="11" stroke-linecap="round" stroke-dasharray="339.3" stroke-dashoffset="339.3"/>
        </svg>
        <div class="val"><b id="pct"></b><span id="rawScore"></span></div>
      </div>
      <div class="verdict-box">
        <div class="big" id="passFail"></div>
        <p style="margin:0 0 10px;color:var(--ink-2);font-size:15px" id="scaled"></p>
        <p style="margin:0 0 12px;font-size:13.5px" id="logged"></p>
        <div class="row">
          <button class="btn primary sm" id="reviewWrong">Review what I got wrong</button>
          <button class="btn sm" id="reviewAll">Review everything</button>
        </div>
      </div>
    </div>
  </div>
  <div class="card"><span class="eyebrow">Score by area</span><div id="domainBars" style="margin-top:12px"></div></div>
  <div class="card" id="reviewCard">
    <div class="row spread" style="margin-bottom:14px">
      <h3 id="reviewTitle">Review</h3>
      <div class="row">
        <button class="btn sm" id="retryMissed">Retry missed only</button>
        <button class="btn sm" id="restart">New attempt</button>
      </div>
    </div>
    <div id="reviewList"></div>
  </div>
</section>`;

    /* ---------- state ---------- */
    const state = {
      mode: 'exam', domain: 'all', shuffle: true, cues: true,
      items: [], idx: 0, answers: [], instant: false,
      endsAt: null, tick: null, startedAt: null, runMode: 'exam'
    };
    let lastRun = null;

    /* ---------- setup screen ---------- */
    const domainBox = $('#domains', root);
    const mkPick = (label, note, val, pressed) => {
      const b = document.createElement('button');
      b.className = 'pick'; b.dataset.domain = val;
      b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      b.innerHTML = '<strong>' + esc(label) + '</strong><span>' + esc(note) + '</span>';
      return b;
    };
    domainBox.appendChild(mkPick('Everything', 'All ' + QUESTIONS.length + ' questions, weighted like the exam.', 'all', true));
    pack.domains.forEach(d => {
      const n = QUESTIONS.filter(q => q.domain === d.name).length;
      domainBox.appendChild(mkPick(d.name, n + ' questions · officially ' + d.official + ' of the exam', d.name, false));
    });

    function groupPick(container, onPick) {
      container.addEventListener('click', e => {
        const b = e.target.closest('.pick');
        if (!b || b.disabled) return;
        container.querySelectorAll('.pick').forEach(x => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        onPick(b);
      });
    }
    groupPick($('#modes', root), b => { state.mode = b.dataset.mode; updateStartInfo(); });
    groupPick(domainBox, b => { state.domain = b.dataset.domain; updateStartInfo(); });

    function weakIds(p) {
      const missed = [], shaky = [], unseen = [];
      QUESTIONS.forEach(q => {
        const st = p.q[String(q.id)];
        if (!st) unseen.push(q.id);
        else if (st.lastOk === false) missed.push(q.id);
        else if (st.correct / st.seen < 0.7) shaky.push(q.id);
      });
      return { missed, shaky, unseen };
    }
    function currentPool() {
      if (state.mode === 'weak') {
        const w = weakIds(loadProg(pack.id));
        let pool = [...w.missed, ...w.shaky, ...w.unseen].map(id => QUESTIONS.find(q => q.id === id));
        if (state.domain !== 'all') pool = pool.filter(q => q.domain === state.domain);
        return pool;
      }
      let pool = state.mode === 'drills' ? QUESTIONS.filter(q => q.type === 'click') : QUESTIONS.slice();
      if (state.domain !== 'all') pool = pool.filter(q => q.domain === state.domain);
      return pool;
    }
    function poolSize() {
      const pool = currentPool();
      const want = state.mode === 'exam' ? pack.examQuestions
        : state.mode === 'practice' ? 20
          : state.mode === 'weak' ? 20
            : state.mode === 'drills' ? 15
              : pool.length;
      return Math.min(want, pool.length);
    }
    /* exam mode draws each area in its official proportion */
    function drawSet() {
      const pool = currentPool(), n = poolSize();
      if (state.mode !== 'exam' || state.domain !== 'all') return shuffled(pool).slice(0, n);
      const out = [];
      pack.domains.forEach((d, i) => {
        const take = i === pack.domains.length - 1 ? n - out.length : Math.round(n * d.weight);
        out.push(...shuffled(pool.filter(q => q.domain === d.name)).slice(0, take));
      });
      return shuffled(out).slice(0, n);
    }
    function updateStartInfo() {
      const n = poolSize();
      const t = state.mode === 'exam' ? ' · ' + pack.minutes + ' min · exam weighting'
        : state.mode === 'practice' ? ' · answers shown as you go'
          : state.mode === 'weak' ? ' · drawn from your weak spots'
            : state.mode === 'drills' ? ' · find it on the menu'
              : ' · no timer';
      $('#startInfo', root).textContent = n ? n + ' question' + (n === 1 ? '' : 's') + t : 'Nothing to practise here yet';
      $('#start', root).disabled = n === 0;
    }

    /* ---------- progress rendering ---------- */
    function topicStats(p) {
      const map = {};
      QUESTIONS.forEach(q => {
        const st = p.q[String(q.id)];
        const t = map[q.topic] || (map[q.topic] = { topic: q.topic, domain: q.domain, seen: 0, correct: 0 });
        if (st) { t.seen += st.seen; t.correct += st.correct; }
      });
      return Object.values(map);
    }
    function renderProgressSummary() {
      const p = loadProg(pack.id), box = $('#progressSummary', root);
      const w = weakIds(p);
      const weakBtn = $('#weakMode', root);
      if (weakBtn) weakBtn.disabled = (w.missed.length + w.shaky.length + w.unseen.length) === 0;

      if (!p.attempts.length) {
        box.innerHTML = '<p class="prose" style="margin:0">Nothing logged yet. Finish an attempt and this starts tracking your scores, your accuracy on every topic, and which questions still trip you up.</p>';
        updateStartInfo(); return;
      }
      const last = p.attempts[p.attempts.length - 1];
      const best = Math.max(...p.attempts.map(a => a.pct));
      const answered = Object.values(p.q).reduce((n, s) => n + s.seen, 0);
      const right = Object.values(p.q).reduce((n, s) => n + s.correct, 0);
      const acc = answered ? Math.round(right / answered * 100) : 0;
      const weak = topicStats(p).filter(t => t.seen >= 1)
        .map(t => ({ ...t, pc: Math.round(t.correct / t.seen * 100) }))
        .filter(t => t.pc < 100).sort((a, b) => a.pc - b.pc).slice(0, 3);

      box.innerHTML = `
        <div class="stats">
          <div class="stat"><b>${p.attempts.length}</b><span>attempt${p.attempts.length === 1 ? '' : 's'}</span></div>
          <div class="stat"><b style="color:${best >= 70 ? 'var(--pass)' : 'var(--ink)'}">${best}%</b><span>best score</span></div>
          <div class="stat"><b>${last.pct}%</b><span>last · ${fmtDate(last.ts)}</span></div>
          <div class="stat"><b>${acc}%</b><span>lifetime · ${answered} answers</span></div>
          <div class="stat"><b>${Object.keys(p.q).length}<span style="display:inline;font-size:14px;color:var(--ink-2)">/${QUESTIONS.length}</span></b><span>questions seen</span></div>
        </div>
        <p style="margin:14px 0 0;font-size:14px;color:var(--ink-2)">${weak.length
          ? 'Weakest topics: ' + weak.map(t => '<span class="pill" style="margin-right:5px">' + esc(t.topic) + ' · ' + t.pc + '%</span>').join('')
          : 'No weak spots yet — everything you have attempted is at 100%.'}</p>`;
      updateStartInfo();
    }

    function renderProgressView() {
      const p = loadProg(pack.id);
      $('#storageWarn', root).innerHTML = storageOK ? '' :
        '<p class="warn-note"><b>Heads up:</b> this browser is not letting the page save data, so progress will only last until you close the tab. Use Export below to keep a copy.</p>';

      const answered = Object.values(p.q).reduce((n, s) => n + s.seen, 0);
      const right = Object.values(p.q).reduce((n, s) => n + s.correct, 0);
      const acc = answered ? Math.round(right / answered * 100) : 0;
      const mastered = Object.values(p.q).filter(s => s.lastOk === true).length;
      const best = p.attempts.length ? Math.max(...p.attempts.map(a => a.pct)) : 0;
      const mins = Math.round(p.attempts.reduce((n, a) => n + (a.secs || 0), 0) / 60);

      $('#bigStats', root).innerHTML = `
        <div class="stat"><b>${p.attempts.length}</b><span>attempts</span></div>
        <div class="stat"><b style="color:${best >= 70 ? 'var(--pass)' : 'var(--ink)'}">${best}%</b><span>best score</span></div>
        <div class="stat"><b>${acc}%</b><span>lifetime accuracy</span></div>
        <div class="stat"><b>${answered}</b><span>answers given</span></div>
        <div class="stat"><b>${Object.keys(p.q).length}/${QUESTIONS.length}</b><span>questions seen</span></div>
        <div class="stat"><b>${mastered}</b><span>right on last try</span></div>
        <div class="stat"><b>${mins}</b><span>minutes studied</span></div>`;

      const ts = topicStats(p).map(t => ({ ...t, pc: t.seen ? Math.round(t.correct / t.seen * 100) : null }))
        .sort((a, b) => {
          if (a.pc === null && b.pc === null) return a.topic.localeCompare(b.topic);
          if (a.pc === null) return 1; if (b.pc === null) return -1;
          return a.pc - b.pc;
        });
      const line = t => {
        const col = t.pc === null ? 'var(--line)' : t.pc >= 70 ? 'var(--pass)' : t.pc >= 50 ? 'var(--warn)' : 'var(--fail)';
        return `<div class="tline">
          <span class="nm">${esc(t.topic)}<i>${esc(t.domain)}</i></span>
          <span class="tr"><span class="track"><i style="width:${t.pc === null ? 0 : t.pc}%;background:${col}"></i></span></span>
          <span class="pc">${t.pc === null ? 'not seen' : t.pc + '% (' + t.correct + '/' + t.seen + ')'}</span>
        </div>`;
      };
      const seenT = ts.filter(t => t.pc !== null), unseenT = ts.filter(t => t.pc === null);
      $('#topicStats', root).innerHTML =
        (seenT.length ? seenT.map(line).join('') : '<p style="margin:0;color:var(--ink-2)">No topics attempted yet.</p>') +
        (unseenT.length ? `<details style="margin-top:14px"><summary style="cursor:pointer;font-size:14px;color:var(--ink-2);padding:6px 0">${unseenT.length} topic${unseenT.length === 1 ? '' : 's'} not attempted yet — show</summary><div style="margin-top:6px">${unseenT.map(line).join('')}</div></details>` : '');

      $('#histWrap', root).innerHTML = p.attempts.length ? `
        <table class="hist"><thead><tr><th>When</th><th>Mode</th><th>Focus</th><th>Score</th></tr></thead><tbody>
        ${p.attempts.slice().reverse().map(a => `<tr>
          <td class="mono" style="font-size:13px">${fmtDate(a.ts)}</td>
          <td>${MODE_NAMES[a.mode] || a.mode}</td>
          <td style="color:var(--ink-2)">${a.domain === 'all' ? 'Everything' : esc(a.domain)}</td>
          <td class="sc" style="color:${a.pct >= 70 ? 'var(--pass)' : 'var(--fail)'}">${a.pct}% <span style="color:var(--ink-2);font-weight:400">(${a.correct}/${a.total})</span></td>
        </tr>`).join('')}</tbody></table>` : '<p style="margin:0;color:var(--ink-2)">No attempts logged yet.</p>';
    }

    /* ---------- run ---------- */
    function startRun(source, modeLabel) {
      state.runMode = modeLabel || state.mode;
      state.items = source.map(q => ({ ...q, order: (q.type === 'click' || !state.shuffle) ? [0, 1, 2, 3] : shuffled([0, 1, 2, 3]) }));
      state.answers = new Array(state.items.length).fill(null);
      state.idx = 0;
      state.instant = ['practice', 'weak', 'retry', 'drills'].includes(state.runMode);
      state.startedAt = Date.now();
      $('#setup', root).classList.add('hidden');
      $('#progressView', root).classList.add('hidden');
      $('#results', root).classList.add('hidden');
      $('#quiz', root).classList.remove('hidden');
      clearInterval(state.tick);
      if (state.runMode === 'exam') {
        state.endsAt = Date.now() + pack.minutes * 60 * 1000;
        state.tick = setInterval(updateTimer, 1000);
        updateTimer();
      } else { state.endsAt = null; $('#timer', root).textContent = ''; }
      render(); window.scrollTo(0, 0);
    }
    function updateTimer() {
      if (!state.endsAt) return;
      const left = Math.max(0, state.endsAt - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      $('#timer', root).innerHTML = '<span class="pill" style="' + (left < 5 * 60000 ? 'color:var(--fail);border-color:var(--fail-line)' : '') + '">' + m + ':' + String(s).padStart(2, '0') + ' left</span>';
      if (left === 0) { clearInterval(state.tick); grade(); }
    }

    function render() {
      const it = state.items[state.idx], picked = state.answers[state.idx];
      $('#qCount', root).textContent = 'Question ' + (state.idx + 1) + ' of ' + state.items.length;
      const chip = $('#qDomain', root), col = (DOMAIN[it.domain] || {}).color || 'var(--accent)';
      chip.textContent = it.domain;
      chip.style.color = col; chip.style.borderColor = col; chip.style.background = 'transparent';
      $('#progressBar', root).style.width = (state.idx / state.items.length * 100) + '%';
      $('#qText', root).innerHTML = highlight(it.q, it.cues, state.cues);

      const box = $('#answers', root); box.innerHTML = '';
      const revealed = state.instant && picked !== null;
      $('#kbdTip', root).innerHTML = it.type === 'click'
        ? 'Click straight into the menu. Wrong clicks are explained too — that is how you learn the map. <kbd>←</kbd> <kbd>→</kbd> move between questions.'
        : 'Press <kbd>1</kbd>–<kbd>4</kbd> to answer, <kbd>←</kbd> <kbd>→</kbd> to move between questions.';

      if (it.type === 'click') {
        box.appendChild(renderScreen(it, picked, revealed));
        $('#explainBox', root).innerHTML = revealed ? explainClick(it, picked) : '';
      } else {
        it.order.forEach((orig, pos) => {
          const b = document.createElement('button');
          b.className = 'ans';
          b.setAttribute('aria-pressed', picked === orig ? 'true' : 'false');
          b.innerHTML = '<span class="key">' + KEYS[pos] + '</span><span>' + esc(it.options[orig]) + '</span>';
          if (revealed) {
            b.classList.add('locked');
            if (orig === it.answer) b.classList.add('correct');
            else if (orig === picked) b.classList.add('wrong');
            b.setAttribute('aria-pressed', 'false');
          } else b.addEventListener('click', () => choose(orig));
          box.appendChild(b);
        });
        $('#explainBox', root).innerHTML = revealed ? explainMC(it, picked) : '';
      }
      $('#prev', root).disabled = state.idx === 0;
      $('#next', root).disabled = state.idx === state.items.length - 1;
    }

    function renderScreen(it, picked, revealed) {
      const sc = SCREENS[it.screen];
      const wrap = document.createElement('div');
      wrap.className = 'portal';
      wrap.style.setProperty('--hue', sc.hue);
      const rows = [];
      sc.nav.forEach(top => {
        rows.push({ id: top.id, label: top.label, cls: 'parent', caret: (top.children || []).length ? '▾' : '' });
        (top.children || []).forEach(ch => rows.push({ id: ch.id, label: ch.label, cls: 'child', caret: '' }));
      });
      const railHTML = rows.map(r => {
        let cls = 'nav-item ' + r.cls;
        if (revealed) {
          cls += ' locked';
          if (r.id === it.answer) cls += ' hit';
          else if (r.id === picked) cls += ' miss';
        }
        return '<button class="' + cls + '" data-node="' + r.id + '">' + (r.caret ? '<span class="caret">' + r.caret + '</span>' : '') + '<span>' + esc(r.label) + '</span></button>';
      }).join('');
      let stage;
      if (!revealed) {
        stage = '<div class="hint"><b>Where would you click?</b>Pick the item in the menu on the left. There is one right answer.</div>';
      } else {
        const steps = NODE[it.answer].path;
        stage = '<div><p class="eyebrow" style="margin:0 0 9px">The path</p><div class="crumb"><span class="step">' + esc(sc.name) + '</span>' +
          steps.map((s, i) => '<span class="sep">›</span><span class="step' + (i === steps.length - 1 ? ' final' : '') + '">' + esc(s) + '</span>').join('') +
          '</div><p class="nodedesc" style="margin-top:12px">' + esc(NODE[it.answer].desc) + '</p></div>';
      }
      wrap.innerHTML = '<div class="portal-bar"><span class="grid">' + '<i></i>'.repeat(9) + '</span>' + esc(sc.name) +
        '<span class="url">' + esc(sc.url) + '</span></div><div class="portal-body"><nav class="rail-nav">' + railHTML + '</nav><div class="stage">' + stage + '</div></div>';
      if (!revealed) wrap.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => choose(b.dataset.node)));
      return wrap;
    }

    function explainMC(it, picked) {
      const ok = picked === it.answer;
      const lines = it.order.filter(o => o !== it.answer).map(o => {
        const mine = o === picked ? ' <span class="pill" style="color:var(--fail);border-color:var(--fail-line)">you chose this</span>' : '';
        return '<li><b>' + KEYS[it.order.indexOf(o)] + '</b><span>' + esc(it.wrong[String(o)]) + mine + '</span></li>';
      }).join('');
      return '<div class="explain ' + (ok ? 'ok' : 'no') + '">' +
        '<p class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</p>' +
        '<p class="topicline">Testing: <b>' + esc(it.topic) + '</b> · ' + esc(it.domain) + '</p>' +
        '<p class="body"><b>' + KEYS[it.order.indexOf(it.answer)] + ' — ' + esc(it.options[it.answer]) + '</b></p>' +
        '<p class="body">' + esc(it.explain) + '</p>' +
        '<ul class="why"><li class="head">Why the others are wrong</li>' + lines + '</ul></div>';
    }
    function explainClick(it, picked) {
      const ok = picked === it.answer, sc = SCREENS[it.screen];
      const missed = (!ok && NODE[picked])
        ? '<p class="body" style="margin-top:10px"><b>You clicked ' + esc(sc.name) + ' › ' + esc(pathOf(picked)) + '</b> — ' + esc(NODE[picked].desc) + '</p>' : '';
      return '<div class="explain ' + (ok ? 'ok' : 'no') + '">' +
        '<p class="verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ Correct' : '✗ Not there') + '</p>' +
        '<p class="topicline">Testing: <b>' + esc(it.topic) + '</b> · ' + esc(it.domain) + '</p>' +
        '<p class="body"><b>' + esc(sc.name) + ' › ' + esc(pathOf(it.answer)) + '</b></p>' +
        '<p class="body">' + esc(it.explain) + '</p>' + missed + '</div>';
    }

    function choose(val) {
      state.answers[state.idx] = val;
      render();
      if (!state.instant && state.idx < state.items.length - 1) setTimeout(() => { state.idx++; render(); }, 160);
    }

    /* ---------- grading ---------- */
    function grade() {
      clearInterval(state.tick);
      const rows = state.items.map((it, i) => ({ it, picked: state.answers[i], ok: state.answers[i] === it.answer }));
      lastRun = rows;
      const correct = rows.filter(r => r.ok).length, total = rows.length;
      const pct = Math.round(correct / total * 100);
      const scaled = Math.round(pct / 100 * pack.scaleMax);
      const secs = Math.round((Date.now() - state.startedAt) / 1000);

      const before = loadProg(pack.id);
      const prev = before.attempts.filter(a => a.mode === state.runMode).slice(-1)[0];
      const p = loadProg(pack.id), now = Date.now();
      rows.forEach(r => {
        const k = String(r.it.id), st = p.q[k] || { seen: 0, correct: 0 };
        st.seen++; if (r.ok) st.correct++;
        st.lastOk = r.ok; st.lastTs = now; p.q[k] = st;
      });
      p.attempts.push({ ts: now, mode: state.runMode, domain: state.domain, correct, total, pct, secs });
      if (p.attempts.length > 100) p.attempts = p.attempts.slice(-100);
      saveProg(pack.id, p);

      $('#quiz', root).classList.add('hidden');
      $('#results', root).classList.remove('hidden');
      $('#pct', root).textContent = pct + '%';
      $('#rawScore', root).textContent = correct + ' of ' + total;
      const C = 2 * Math.PI * 54, arc = $('#dialArc', root);
      arc.style.strokeDashoffset = C - (C * pct / 100);
      arc.setAttribute('stroke', scaled >= pack.passScaled ? 'var(--pass)' : 'var(--fail)');

      const passed = scaled >= pack.passScaled;
      $('#passFail', root).innerHTML = passed
        ? '<span style="color:var(--pass)">Pass — nice work</span>'
        : '<span style="color:var(--fail)">Below the pass mark</span>';
      $('#scaled', root).textContent = passed
        ? 'Scaled score ' + scaled + '/' + pack.scaleMax + '. The real exam needs ' + pack.passScaled + ', so you are on track — check the area breakdown for any weak spot.'
        : 'Scaled score ' + scaled + '/' + pack.scaleMax + '. The real exam needs ' + pack.passScaled + '. Work through the ' + (total - correct) + ' explanation' + (total - correct === 1 ? '' : 's') + ' below and try again.';

      let delta = '';
      if (prev) {
        const d = pct - prev.pct, name = MODE_NAMES[state.runMode] || state.runMode;
        delta = d > 0 ? '<span style="color:var(--pass)">▲ up ' + d + ' points</span> on your last ' + name + ' attempt (' + prev.pct + '%).'
          : d < 0 ? '<span style="color:var(--fail)">▼ down ' + Math.abs(d) + ' points</span> on your last ' + name + ' attempt (' + prev.pct + '%).'
            : 'Same as your last ' + name + ' attempt (' + prev.pct + '%).';
      }
      const mm = Math.floor(secs / 60), ss = secs % 60;
      $('#logged', root).innerHTML = '<span class="pill">logged</span> Took ' + (mm ? mm + ' min ' : '') + ss + 's. ' + delta;

      const byDomain = {};
      rows.forEach(r => {
        const d = r.it.domain;
        byDomain[d] = byDomain[d] || { c: 0, t: 0 };
        byDomain[d].t++; if (r.ok) byDomain[d].c++;
      });
      $('#domainBars', root).innerHTML = Object.entries(byDomain).map(([d, v]) => {
        const q = Math.round(v.c / v.t * 100);
        const col = q >= 70 ? 'var(--pass)' : q >= 50 ? 'var(--warn)' : 'var(--fail)';
        return '<div class="dbar"><div class="lbl"><span>' + esc(d) + '</span><span>' + v.c + '/' + v.t + ' · ' + q + '%</span></div>' +
          '<span class="track"><i style="width:' + q + '%;background:' + col + '"></i></span></div>';
      }).join('');

      showReview(false);
      window.scrollTo(0, 0);
    }

    function showReview(all) {
      const rows = all ? lastRun : lastRun.filter(r => !r.ok);
      $('#reviewTitle', root).textContent = all ? 'All ' + rows.length + ' questions'
        : (rows.length ? 'The ' + rows.length + ' you got wrong' : 'Nothing wrong — perfect run');
      const list = $('#reviewList', root); list.innerHTML = '';
      if (!rows.length) {
        list.innerHTML = '<p class="prose" style="margin:0">You answered every question correctly. Try the full bank, or switch area for a different mix.</p>';
        return;
      }
      rows.forEach(r => {
        const it = r.it, el = document.createElement('div');
        el.className = 'rev';
        const col = (DOMAIN[it.domain] || {}).color || 'var(--accent)';
        const chip = '<span class="domain-chip" style="color:' + col + ';border-color:' + col + '">' + esc(it.topic) + '</span>';
        if (it.type === 'click') {
          const sc = SCREENS[it.screen];
          const you = r.ok ? '' : '<p class="pickline"><span class="lab you">You clicked</span><span>' +
            (r.picked === null ? '<i>nothing</i>' : esc(sc.name) + ' › ' + esc(pathOf(r.picked)) +
              (NODE[r.picked] ? ' — <span style="color:var(--ink-2)">' + esc(NODE[r.picked].desc) + '</span>' : '')) + '</span></p>';
          el.innerHTML = chip + ' <span class="pill">menu drill</span><div class="qt">' + highlight(it.q, it.cues, true) + '</div>' + you +
            '<p class="pickline"><span class="lab right">The path</span><span><b>' + esc(sc.name) + ' › ' + esc(pathOf(it.answer)) + '</b></span></p>' +
            '<div class="explain" style="margin-top:12px"><p class="body">' + esc(it.explain) + '</p></div>';
        } else {
          const you = r.ok ? '' : '<p class="pickline"><span class="lab you">Your answer</span><span>' +
            (r.picked === null ? '<i>left blank</i>' : esc(it.options[r.picked])) + '</span></p>';
          el.innerHTML = chip + '<div class="qt">' + highlight(it.q, it.cues, true) + '</div>' + you +
            '<p class="pickline"><span class="lab right">Correct</span><span>' + esc(it.options[it.answer]) + '</span></p>' +
            '<div class="explain" style="margin-top:12px"><p class="body">' + esc(it.explain) + '</p>' +
            '<ul class="why"><li class="head">Why the others are wrong</li>' +
            it.order.filter(o => o !== it.answer).map(o => '<li><b>·</b><span>' + esc(it.options[o]) + ' — ' + esc(it.wrong[String(o)]) + '</span></li>').join('') +
            '</ul></div>';
        }
        list.appendChild(el);
      });
    }

    /* ---------- wiring ---------- */
    $('#shuffleOpts', root).addEventListener('change', e => state.shuffle = e.target.checked);
    $('#showCues', root).addEventListener('change', e => {
      state.cues = e.target.checked;
      if (!$('#quiz', root).classList.contains('hidden')) render();
    });
    $('#start', root).addEventListener('click', () => startRun(drawSet()));
    $('#prev', root).addEventListener('click', () => { if (state.idx > 0) { state.idx--; render(); window.scrollTo(0, 0); } });
    $('#next', root).addEventListener('click', () => { if (state.idx < state.items.length - 1) { state.idx++; render(); window.scrollTo(0, 0); } });
    $('#finish', root).addEventListener('click', () => {
      const missing = state.answers.filter(a => a === null).length;
      if (missing && !confirm(missing + ' question' + (missing === 1 ? ' is' : 's are') + ' still unanswered. They will be marked wrong. Grade anyway?')) return;
      grade();
    });
    $('#reviewWrong', root).addEventListener('click', () => { showReview(false); $('#reviewCard', root).scrollIntoView({ behavior: 'smooth' }); });
    $('#reviewAll', root).addEventListener('click', () => { showReview(true); $('#reviewCard', root).scrollIntoView({ behavior: 'smooth' }); });
    $('#retryMissed', root).addEventListener('click', () => {
      const missed = lastRun.filter(r => !r.ok).map(r => QUESTIONS.find(q => q.id === r.it.id));
      if (!missed.length) { alert('You did not miss any — nothing to retry.'); return; }
      startRun(shuffled(missed), 'retry');
    });
    $('#restart', root).addEventListener('click', () => {
      clearInterval(state.tick);
      $('#results', root).classList.add('hidden');
      $('#quiz', root).classList.add('hidden');
      $('#setup', root).classList.remove('hidden');
      renderProgressSummary(); window.scrollTo(0, 0);
    });
    $('#openProgress', root).addEventListener('click', () => {
      renderProgressView();
      $('#setup', root).classList.add('hidden');
      $('#progressView', root).classList.remove('hidden');
      window.scrollTo(0, 0);
    });
    $('#closeProgress', root).addEventListener('click', () => {
      $('#progressView', root).classList.add('hidden');
      $('#setup', root).classList.remove('hidden');
      renderProgressSummary(); window.scrollTo(0, 0);
    });
    $('#exportProg', root).addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ exam: pack.id, code: pack.code, ...loadProg(pack.id) }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'acuexam-' + pack.id + '-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('#importProg', root).addEventListener('click', () => $('#importFile', root).click());
    $('#importFile', root).addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const d = JSON.parse(rd.result);
          if (!d || typeof d !== 'object' || !d.q) throw new Error('bad');
          if (d.exam && d.exam !== pack.id && !confirm('That file is progress for ' + (d.code || d.exam) + ', not ' + pack.code + '. Import it anyway?')) return;
          saveProg(pack.id, { attempts: d.attempts || [], q: d.q || {} });
          renderProgressView(); renderProgressSummary();
          alert('Progress imported.');
        } catch (err) { alert('That file could not be read as an acuExam progress export.'); }
      };
      rd.readAsText(f); e.target.value = '';
    });
    $('#resetProg', root).addEventListener('click', () => {
      if (!confirm('Erase all logged attempts and question history for ' + pack.code + '? Other exams are not affected. This cannot be undone.')) return;
      saveProg(pack.id, blankExam());
      renderProgressView(); renderProgressSummary();
    });
    document.addEventListener('keydown', e => {
      if ($('#quiz', root).classList.contains('hidden')) return;
      if (e.key === 'ArrowRight') $('#next', root).click();
      else if (e.key === 'ArrowLeft') $('#prev', root).click();
      else if (['1', '2', '3', '4'].includes(e.key)) {
        const it = state.items[state.idx];
        if (!it || it.type === 'click') return;
        if (state.instant && state.answers[state.idx] !== null) return;
        const orig = it.order[Number(e.key) - 1];
        if (orig !== undefined) choose(orig);
      }
    });

    renderProgressSummary();
  }

  /* ---------- shared helpers the catalogue also uses ---------- */
  function summaryFor(examId) {
    const all = readAll();
    const p = all[examId];
    if (!p || !p.attempts || !p.attempts.length) return null;
    return {
      attempts: p.attempts.length,
      best: Math.max(...p.attempts.map(a => a.pct)),
      seen: Object.keys(p.q || {}).length
    };
  }

  return { mount, summaryFor };
})();
