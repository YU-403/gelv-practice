/* ============================================================
   格律练习 · 交互逻辑
   ============================================================ */
(function () {
  'use strict';
  var DATA = window.GELV_DATA || { poems: [], rusheng: [] };

  /* ---------- 音效（Web Audio 合成，无音频文件） ---------- */
  var audioCtx = null;
  var SOUND_ON = localStorage.getItem('gelv_sound') !== 'off';   // 默认开
  function getAudioCtx() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    return audioCtx;
  }
  function beep(freq, type, dur, vol, delay) {
    if (!SOUND_ON) return;
    try {
      var ctx = getAudioCtx(); if (!ctx) return;
      var t0 = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = type;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.start(t0); osc.stop(t0 + dur);
    } catch (e) {}
  }
  function sweep(f1, f2, type, dur, vol) {      // 滑音（用于「切换」「清空」这类状态音）
    if (!SOUND_ON) return;
    try {
      var ctx = getAudioCtx(); if (!ctx) return;
      var t0 = ctx.currentTime;
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(f1, t0);
      osc.frequency.linearRampToValueAtTime(f2, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.start(t0); osc.stop(t0 + dur);
    } catch (e) {}
  }
  /* ---- 答题区音效（保持原样：sine 880 / 660+880 / 200 锯齿）---- */
  function playClick()   { beep(880, 'sine', 0.06, 0.15, 0); }
  function playCorrect() { beep(660, 'sine', 0.25, 0.12, 0); beep(880, 'sine', 0.25, 0.12, 0.1); }
  function playWrong()   { beep(200, 'sawtooth', 0.3, 0.1, 0); }
  /* ---- UI 操作音效：音高更低、时长更短、音色 triangle/square，与答题区错开 ----
     音量也比答题音低一档，避免抢戏 */
  function playNav()    { beep(530, 'triangle', 0.09, 0.07, 0);    beep(790, 'triangle', 0.10, 0.055, 0.085); }
  function playStart()  { beep(660, 'triangle', 0.10, 0.075, 0);   beep(990, 'triangle', 0.12, 0.06, 0.10);
                          beep(1320, 'sine', 0.16, 0.03, 0.20); }
  function playSubmit() { beep(440, 'square', 0.06, 0.055, 0);     beep(440, 'square', 0.06, 0.05, 0.075); }
  function playUi()     { beep(520, 'triangle', 0.028, 0.055, 0); }
  function playToggle() { sweep(700, 1000, 'triangle', 0.12, 0.065); }
  function playClear()  { sweep(400, 180, 'sine', 0.2, 0.07); }
  function setSound(on) {
    SOUND_ON = on;
    try { localStorage.setItem('gelv_sound', on ? 'on' : 'off'); } catch (e) {}
    var b = document.getElementById('soundToggle');
    if (b) {
      b.classList.toggle('off', !on);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? '音效开：点击静音' : '已静音：点击开启音效';
      b.setAttribute('aria-label', b.title);
    }
    var cap = document.getElementById('soundCap');
    if (cap) cap.textContent = on ? '音效' : '静音';
  }
  (function initSound() {
    var b = document.getElementById('soundToggle');
    if (b) b.addEventListener('click', function () {
      setSound(!SOUND_ON);
      if (SOUND_ON) playToggle();          // 开启时给个反馈；关闭时静默
      shake(b);
    });
    setSound(SOUND_ON);
  })();
  /* 工具按钮的小动效：涟漪 + 抖动（类名用完即摘，避免残留） */
  function ripple(b) {
    if (!b) return;
    b.classList.remove('ripple'); void b.offsetWidth; b.classList.add('ripple');
    setTimeout(function () { b.classList.remove('ripple'); }, 460);
  }
  function shake(b) {
    if (!b) return;
    b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
    setTimeout(function () { b.classList.remove('shake'); }, 320);
  }
  var RU = new Set(DATA.rusheng || []);       // 入声全集（校正后）：批改页给仄声入声字加「（入声）」注
  var RU_TRAP = new Set(DATA.ruPool || []);   // 古仄今平：今读平声的入声字（易误判为平）
  var RU_DUAL = new Set(DATA.ruDual || []);   // 两读字（另有非入声读法）

  /* ---------- 繁简显示层（只影响渲染，不参与判定）
     数据层的键一律是简体：判定链、错题本、答案表都不受显示开关影响。
     诗句用「位置级」繁体表（解决 发/髮、干/乾/幹、里/裏 等一字多繁体形）；
     其他单字（字块、批改页清单、榜单、专练、入声池）用单字映射。 ---------- */
  var TRAD = DATA.trad || { poems: {}, map: {}, expand: {} };
  var TRAD_ON = localStorage.getItem('gelv_trad') !== 'off';   // 默认繁体（与考核卷一致）
  function tradOf(ch) { return TRAD.map[ch] || ch; }           // 单字繁体形（与显示开关无关）
  function T(ch) {                        // 单字显示
    return TRAD_ON ? tradOf(ch) : ch;
  }
  function TPoemTrad(pid, li, ci, ch) {    // 诗句逐字繁体形（位置级，与显示开关无关）
    var p = TRAD.poems[pid];
    return (p && p.l[li] && p.l[li][ci]) || tradOf(ch);
  }
  function TPoem(pid, li, ci, ch) { return TRAD_ON ? TPoemTrad(pid, li, ci, ch) : ch; }
  function TTitle(p) {
    if (!TRAD_ON) return p.title;
    var t = TRAD.poems[p.id];
    return (t && t.t) || p.title;
  }
  function TAuthor(p) {
    if (!TRAD_ON) return p.author;
    var t = TRAD.poems[p.id];
    return (t && t.a) || p.author;
  }
  function ruShow(it) { return TRAD_ON ? it.c : it.k; }   // 入声题面/批改：繁显时用繁体形

  /* 入声/古仄今平/两读三个标记的取值。
     繁体显示时以「显示字形」为准：简体一个字归并了两个不同的字时（只←隻/祇、蜡←蠟、
     仆←僕 …），显示哪个字形就按哪个字形自身的韵书记载标注（trad.glyphFix）。
     简体显示时仍按简体键口径，与数据层（rusheng/ruPool/ruDual）完全一致。 */
  var GFIX = TRAD.glyphFix || {};
  function ruFlags(key, glyph) {
    if (TRAD_ON && glyph) {
      var f = GFIX[glyph];
      if (f) return { ru: !!f.ru, trap: !!f.trap, dual: !!f.dual };
    }
    return { ru: RU.has(key) || RU_TRAP.has(key), trap: RU_TRAP.has(key), dual: RU_DUAL.has(key) };
  }

  function setTrad(on) {
    TRAD_ON = on;
    try { localStorage.setItem('gelv_trad', on ? 'on' : 'off'); } catch (e) {}
    var ic = document.getElementById('tradIcon');
    if (ic) ic.textContent = on ? '繁' : '简';
    var cap = document.getElementById('tradCap');
    if (cap) cap.textContent = on ? '繁体' : '简体';
    var b = document.getElementById('tradToggle');
    if (b) {
      b.classList.toggle('on', on);
      b.classList.toggle('off', !on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? '当前显示繁体（与考核卷一致），点击切换为简体'
                   : '当前显示简体，点击切换为繁体';
      b.setAttribute('aria-label', b.title);
    }
  }

  /* 切换繁简后，把当前页面上所有数据驱动的字重画一遍（进度、计时不受影响） */
  function refreshPickers() {
    [['poemSelect', 'poemPicker'], ['ruTimeSelect', 'ruTimePicker'],
     ['ruCountSelect', 'ruCountPicker']].forEach(function (pair) {
      var sel = el(pair[0]), host = el(pair[1]);
      if (!sel || !host) return;
      Array.prototype.forEach.call(host.querySelectorAll('.picker-opt'), function (o) {
        var op = sel.querySelector('option[value="' + o.dataset.value + '"]');
        if (op) o.textContent = op.textContent;
      });
      var cur = sel.options[sel.selectedIndex];
      var vs = host.querySelector('.picker-value');
      if (vs && cur) vs.textContent = cur.textContent;
    });
  }

  function applyTrad() {
    fillSelect();
    refreshPickers();
    var pg = activePage();
    if (pg === 'page-practice' && state.poem) repaintPoem();
    else if (pg === 'page-result') renderPoemReview();
    else if (pg === 'page-zedrill') renderZeGrid();
    else if (pg === 'page-zedrillresult') renderZeResult();
    else if (pg === 'page-rusheng') renderRu();
    else if (pg === 'page-ruresult') { renderRuGridReview(); renderRuResult(); }
    renderWeakPanel();
  }
  (function initTrad() {
    var b = document.getElementById('tradToggle');
    if (b) b.addEventListener('click', function () {
      setTrad(!TRAD_ON);
      applyTrad();
      playToggle();
      ripple(b);
      if (b) {                                    // 字形翻牌动画
        b.classList.remove('flip'); void b.offsetWidth; b.classList.add('flip');
        setTimeout(function () { b.classList.remove('flip'); }, 320);
      }
    });
    setTrad(TRAD_ON);
  })();

  /* ---------- UI 操作音效接线（答题区音效不受影响） ---------- */
  (function initUiSound() {
    function bind(sel, fn) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (n) {
        n.addEventListener('click', function () { fn(); });
      });
    }
    bind('.module-card, [data-go], #quitPractice, #ruAgain', playNav);   // 切换页面 / 返回
    bind('#startByPick, #startRandom, #startWeak, #zeDrillAgain, #ruBegin, #ruDrill', playStart);
    bind('#submitBtn, #zeDrillSubmit, #ruSubmit', playSubmit);           // 提交作答
    bind('#clearRec', playClear);                                        // 清空记录
    bind('#basisBtn, #feedbackBtn', playUi);                             // 打开说明 / 反馈弹窗
    bind('#toolMore', playToggle);                                       // 展开 / 收起工具组
    /* 弹窗按钮（动态生成）：用捕获阶段，否则按钮自身的处理函数会先把弹窗清空 */
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('#modalBox [data-x]');
      if (t) playUi();
    }, true);
  })();



  /* ---------- 练习记录：错题本与成绩（localStorage） ---------- */
  var REC = (function () {
    try {
      var r = JSON.parse(localStorage.getItem('gelv_records') || '{}') || {};
      r.poems = r.poems || {}; r.ze = r.ze || {};
      r.ruMiss = r.ruMiss || {}; r.ruExtra = r.ruExtra || {};
      return r;
    } catch (e) { return { poems: {}, ze: {}, ruMiss: {}, ruExtra: {} }; }
  })();
  function saveRec() { try { localStorage.setItem('gelv_records', JSON.stringify(REC)); } catch (e) {} }
  function weakZe() {                      // 未掌握的平仄错字，按错误次数降序
    return Object.keys(REC.ze).sort(function (a, b) { return REC.ze[b].n - REC.ze[a].n; });
  }
  /* 榜单与专练里显示哪个字形：优先用「这个字在诗里被判错时的那个形」
     （诗里是 白髮/枝幹/漫捲 就显示 髮/幹/捲，而不是单字默认形 發/干/卷）；
     旧记录没有 d 字段、或切到简体显示时，回落到单字映射。 */
  function weakGlyph(ch) {
    return TRAD_ON ? weakTrad(ch) : ch;
  }
  function weakTrad(ch) {                  // 与显示开关无关的「繁体形」
    var r = REC.ze[ch];
    return (r && r.d) || tradOf(ch);
  }
  function ruWrongList() {                 // 入声错题池（漏选 + 误选）
    var n = {};
    Object.keys(REC.ruMiss).forEach(function (c) { n[c] = (n[c] || 0) + REC.ruMiss[c]; });
    Object.keys(REC.ruExtra).forEach(function (c) { n[c] = (n[c] || 0) + REC.ruExtra[c]; });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a]; });
  }
  var RU_DRILL = false;                    // 本轮是否为「错题专练」



  /* ---------- 随机抽题的洗牌袋：一轮内不重复 ---------- */
  function bagValid() {
    try {
      return (JSON.parse(localStorage.getItem('gelv_bag') || '[]') || [])
        .filter(function (id) { return !!findPoem(id); });
    } catch (e) { return []; }
  }
  function nextRandomPoem() {
    var bag = bagValid();
    if (!bag.length) bag = shuffle(DATA.poems.map(function (p) { return p.id; }));
    var id = bag.shift();
    try { localStorage.setItem('gelv_bag', JSON.stringify(bag)); } catch (e) {}
    return findPoem(id);
  }


  var el = function (id) { return document.getElementById(id); };

  /* ---------- 手机端工具组：收起为一个「设置」按钮 ---------- */
  var toolMoreBtn = el('toolMore'), toolDockEl = el('toolDock');
  function setToolMenu(open) {
    if (!toolMoreBtn || !toolDockEl) return;
    toolDockEl.classList.toggle('open', open);
    toolMoreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (toolMoreBtn && toolDockEl) {
    toolMoreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setToolMenu(!toolDockEl.classList.contains('open'));
    });
    document.addEventListener('click', function (e) {
      if (!toolDockEl.contains(e.target) && !toolMoreBtn.contains(e.target)) setToolMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setToolMenu(false);
    });
  }

  var state = {
    poem: null, answers: [], timed: false, left: 0, timerId: null, result: null,
    cursor: { li: 0, ci: 0 },          // 键盘作答的当前格
  };

  /* ---------- 页面切换 ---------- */
  var PAGE_LEVEL = { home: 0, mode: 1, ruready: 1, practice: 2, rusheng: 2, zedrill: 2,
                     result: 3, ruresult: 3, zedrillresult: 3 };
  var curLevel = 0;
  function go(page) {
    setToolMenu(false);
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    var lvl = PAGE_LEVEL[page] != null ? PAGE_LEVEL[page] : 0;
    var dir = lvl > curLevel ? 'from-right' : (lvl < curLevel ? 'from-left' : '');
    curLevel = lvl;
    document.querySelectorAll('.page').forEach(function (p) {
      p.classList.remove('active', 'from-right', 'from-left');
    });
    var t = el('page-' + page);
    if (t) { if (dir) t.classList.add(dir); t.classList.add('active'); }
    if (page === 'mode') { renderWeakPanel(); }
    if (page === 'ruready') { updateDrillCount(); }
    window.scrollTo(0, 0);
  }
  // 错落入场：为节点依次注入递增延迟
  function stagger(nodes, step, cls) {
    var k = cls || 'stagger-in';
    Array.prototype.forEach.call(nodes, function (n, i) {
      n.classList.add(k);
      n.style.animationDelay = (i * step).toFixed(3) + 's';
      // 入场动画结束后清除类，避免残留 opacity:0 基础值
      // （否则后续 .pulse / .correct 的 animation 会覆盖 forwards 填充，元素退回透明）
      n.addEventListener('animationend', function h(e) {
        if (e.target !== n) return;
        n.classList.remove(k);
        n.style.animationDelay = '';
        n.removeEventListener('animationend', h);
      });
    });
  }
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      var to = b.getAttribute('data-go');
      if (to === 'rusheng') { enterRuReady(); return; }
      go(to);
    });
  });

  /* ---------- 模式选择 ---------- */
  function fillSelect() {
    var sel = el('poemSelect');
    sel.innerHTML = '';
    var groups = { '七律': [], '七古': [] };
    DATA.poems.forEach(function (p) { (groups[p.category] || (groups[p.category] = [])).push(p); });
    Object.keys(groups).forEach(function (cat) {
      if (!groups[cat].length) return;
      var og = document.createElement('optgroup');
      og.label = cat;
      groups[cat].forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.id;
        o.textContent = TTitle(p) + ' · ' + TAuthor(p);
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  function findPoem(id) { return DATA.poems.find(function (p) { return p.id === id; }); }

  /* ---------- 自定义下拉（美化 select；原 select 保留为数据源） ---------- */
  var PICKER_CLOSERS = [];   // 同一页面只允许一个下拉展开
  function enhancePicker(selId, hostId) {
    var sel = el(selId);
    var host = el(hostId);
    if (!sel || !host) return;
    host.innerHTML = '';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'picker-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    var valSpan = document.createElement('span');
    valSpan.className = 'picker-value';
    var caret = document.createElement('span');
    caret.className = 'picker-caret';
    caret.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">' +
      '<path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    trigger.appendChild(valSpan); trigger.appendChild(caret);
    host.appendChild(trigger);

    var panel = document.createElement('div');
    panel.className = 'picker-panel';
    panel.setAttribute('role', 'listbox');
    function addOpt(op) {
      var o = document.createElement('div');
      o.className = 'picker-opt';
      o.setAttribute('role', 'option');
      o.dataset.value = op.value;
      o.textContent = op.textContent;
      o.addEventListener('click', function () {
        sel.value = op.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        syncValue();
        close();
      });
      return o;
    }
    Array.prototype.forEach.call(sel.querySelectorAll('optgroup'), function (og) {
      var g = document.createElement('div'); g.className = 'picker-group';
      var lab = document.createElement('div'); lab.className = 'picker-group-label';
      lab.textContent = og.label;
      g.appendChild(lab);
      Array.prototype.forEach.call(og.querySelectorAll('option'), function (op) {
        g.appendChild(addOpt(op));
      });
      panel.appendChild(g);
    });
    Array.prototype.forEach.call(sel.querySelectorAll(':scope > option'), function (op) {
      panel.appendChild(addOpt(op));
    });
    host.appendChild(panel);

    function syncValue() {
      var op = sel.options[sel.selectedIndex];
      valSpan.textContent = op ? op.textContent : '—';
      Array.prototype.forEach.call(panel.querySelectorAll('.picker-opt'), function (o) {
        o.classList.toggle('selected', o.dataset.value === sel.value);
      });
    }
    function open() {
      PICKER_CLOSERS.forEach(function (fn) { if (fn !== close) fn(); });
      host.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    function close() { host.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); }
    PICKER_CLOSERS.push(close);
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (host.classList.contains('open')) close(); else open();
    });
    document.addEventListener('click', function (e) { if (!host.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    syncValue();
  }

  function startPoem(poem) {
    state.poem = poem;
    state.answers = poem.lines.map(function (l) { return l.chars.map(function () { return ''; }); });
    state.result = null;
    el('practiceTitle').textContent = TTitle(poem);
    el('practiceSub').textContent = TAuthor(poem) + ' · ' + poem.category + ' · ' + poem.lines.length + ' 句';
    renderPoem();
    go('practice');          // 先切页（go 会清掉上一题的计时器）
    startTimerIfNeeded();    // 再启动本题计时
  }

  el('startByPick').addEventListener('click', function () {
    var p = findPoem(el('poemSelect').value);
    if (p) startPoem(p);
  });
  el('startRandom').addEventListener('click', function () {

    var p = nextRandomPoem();
    if (p) startPoem(p);

  });

  el('startWeak').addEventListener('click', startZeDrill);

  /* ================= 薄弱字专练：单字判平仄 ===================
     出题不带诗句语境；答案取该字的平水韵平仄
     （data.charTone：p 平 / z 仄 / pz 平仄两读两可）；
     答对一次即从错题本移出，答错则错误次数 +1。 ================= */
  var ZE = { chars: [], trads: [], ans: [], cur: 0, result: null };

  function zeKey(ch) { return (DATA.charTone || {})[ch] || null; }
  function zeWeakPool() { return weakZe().filter(function (c) { return !!zeKey(c); }); }
  function zeIsRight(ch, user) {
    var k = zeKey(ch);
    if (k === 'pz') return user === '○' || user === '●';   // 两读：平仄皆可
    return k === 'p' ? user === '○' : user === '●';
  }
  function zeKeyText(ch) {
    var k = zeKey(ch);
    return k === 'p' ? '平' : k === 'z' ? '仄' : '平/仄 两可';
  }
  function zeTags(ch, glyph) {
    var f = ruFlags(ch, glyph || weakGlyph(ch));
    var t = [];
    if (f.ru) t.push('入声');
    if (zeKey(ch) === 'pz' || f.dual) t.push('两读');
    return t.join('·');
  }
  function zeCell(i) { return document.querySelector('#zeGrid .cell[data-i="' + i + '"]'); }
  function zePaint(i) {
    var c = zeCell(i); if (!c) return;
    var v = ZE.ans[i];
    c.textContent = v;
    c.classList.toggle('ping', v === '○');
    c.classList.toggle('ze', v === '●');
  }
  function zeCursor(i) {
    var old = document.querySelector('#zeGrid .cell.cur');
    if (old) old.classList.remove('cur');
    var c = zeCell(i); if (c) c.classList.add('cur');
    ZE.cur = i;
  }
  function zeSet(i, v) {
    if (ZE.result) return;
    ZE.ans[i] = v; zePaint(i); playClick();
  }
  function zeNext() { if (ZE.cur + 1 < ZE.chars.length) zeCursor(ZE.cur + 1); }
  function zePrev() { if (ZE.cur > 0) { zeSet(ZE.cur - 1, ''); zeCursor(ZE.cur - 1); } }

  function renderZeGrid() {
    var g = el('zeGrid');
    if (!g) return;
    g.innerHTML = '';
    ZE.chars.forEach(function (ch, i) {
      var wrap = document.createElement('div');
      wrap.className = 'ch';
      var zi = document.createElement('span');
      zi.className = 'zi'; zi.textContent = TRAD_ON ? ZE.trads[i] : ch;
      var cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.i = i;
      cell.addEventListener('click', function () {
        if (ZE.result) return;
        var cur = ZE.ans[i];
        zeSet(i, cur === '' ? '○' : cur === '○' ? '●' : '');
        zeCursor(i);
      });
      wrap.appendChild(zi); wrap.appendChild(cell);
      g.appendChild(wrap);
    });
    ZE.ans.forEach(function (v, i) { if (v) zePaint(i); });   // 切换繁简后保留已作答
    zeCursor(ZE.cur);
  }

  function startZeDrill() {
    var pool = zeWeakPool().slice(0, 12);
    if (!pool.length) {
      alertModal('暂无薄弱字', '先练几首——标错的字会自动记入错题本。', '知道了');
      return;
    }
    ZE.chars = pool;
    ZE.trads = pool.map(weakTrad);      // 记下每个字在诗里的形（专练页与结果页都用它）
    ZE.ans = pool.map(function () { return ''; });
    ZE.result = null;
    ZE.cur = 0;
    renderZeGrid();
    el('zeDrillSub').textContent = '下列 ' + pool.length + ' 个字都是你标错过的——点击格子标出它的平仄';
    zeCursor(0);
    go('zedrill');
  }

  el('zeDrillSubmit').addEventListener('click', function () {
    var blank = ZE.ans.filter(function (a) { return a === ''; }).length;
    confirmModal('确认提交？', blank ? '还有 ' + blank + ' 个字未作答，将判为错。' : '将立即批改本次作答。', '提交', function () {
      if (blank) {
        alertModal('尚未完成', '还有 <b>' + blank + '</b> 个字未标，<b>空白将判为错</b>。是否继续提交？',
          '坚持提交', zeGrade, '返回练习');
      } else zeGrade();
    });
  });

  function zeGrade() {
    var right = 0, wrong = 0;
    ZE.chars.forEach(function (ch, i) {
      if (zeIsRight(ch, ZE.ans[i])) { right++; delete REC.ze[ch]; }   // 答对一次即移出
      else {                            // 答错：计数 +1，字形沿用记录里已有的那个
        wrong++;
        REC.ze[ch] = { n: ((REC.ze[ch] || {}).n || 0) + 1, streak: 0,
                       d: (REC.ze[ch] || {}).d };
      }
    });
    saveRec();
    ZE.result = { right: right, wrong: wrong, total: ZE.chars.length };
    if (wrong) playWrong(); else playCorrect();
    renderZeResult();
    go('zedrillresult');
  }

  function renderZeResult() {
    var r = ZE.result;
    el('zeDrillScore').innerHTML =
      '<div class="verdict">' + (r.wrong ? '错 ' + r.wrong + ' 个' : '全 对') + '</div>' +
      '<div class="detail">共 <b>' + r.total + '</b> 字 · 答对 <b>' + r.right + '</b> 个<br>' +
      '<span style="font-size:13px;color:var(--text-light)">答对的字已从错题本移出</span></div>';
    var g = el('zeDrillReview');
    g.innerHTML = '';
    ZE.chars.forEach(function (ch, i) {
      var ok = zeIsRight(ch, ZE.ans[i]);
      var show = TRAD_ON ? ZE.trads[i] : ch;      // 用「诗里出现的那个形」，不随答题结果变
      var d = document.createElement('div');
      d.className = 'ze-item ' + (ok ? 'ok' : 'bad');
      d.innerHTML = '<span class="ze-ch">' + show + '</span>' +
        '<span class="ze-my">' + (ZE.ans[i] || '空') + '</span>' +
        '<span class="ze-key">' + zeKeyText(ch) + '</span>' +
        (zeTags(ch, show) ? '<span class="ze-tag">' + zeTags(ch, show) + '</span>' : '');
      g.appendChild(d);
    });
    el('zeDrillNote').innerHTML = '<div class="rline"><span class="tag">错题本</span>本次移出 <b>' +
      r.right + '</b> 个，还剩 <b>' + zeWeakPool().length + '</b> 个待攻克</div>';
  }
  el('zeDrillAgain').addEventListener('click', startZeDrill);
  el('clearRec').addEventListener('click', function () {
    confirmModal('清空练习记录？', '会删除错题本与成绩记录（题库数据不受影响）。', '清空', function () {
      REC = { poems: {}, ze: {}, ruMiss: {}, ruExtra: {} };
      saveRec();
      try { localStorage.removeItem('gelv_bag'); } catch (e) {}
      renderWeakPanel(); updateDrillCount();
      toast('练习记录已清空');
    });
  });
  function renderWeakPanel() {


    var list = el('weakList'), btn = el('startWeak');
    if (!list) return;
    // 只列「有答案、可专练」的字——与专练池保持一致（无韵书依据的字跳过）
    var weak = zeWeakPool().slice(0, 10);
    if (!weak.length) {
      list.innerHTML = '<span class="weak-empty">暂无记录——标错的字会自动记入</span>';
      if (btn) btn.disabled = true;
      return;
    }
    if (btn) btn.disabled = false;
    list.innerHTML = weak.map(function (c) {
      return '<span class="weak-chip">' + weakGlyph(c) + '<i>' + REC.ze[c].n + '</i></span>';
    }).join('');
  }

  el('quitPractice').addEventListener('click', function () {
    confirmModal('退出练习？', '当前进度将不会保存。', '退出', function () { go('mode'); });
  });

  /* 入声练习页「返回」：与平仄侧一致 —— 先确认并立刻停表，确认退出后丢弃本题
     （此前是直接 go('ruready')，计时器还在跑，读秒结束会强制批改并弹窗） */
  el('ruQuit').addEventListener('click', function () {
    confirmModal('退出练习？', '计时会停止，本次作答不会保存。', '退出', function () {
      if (RU_STATE.timerId) { clearInterval(RU_STATE.timerId); RU_STATE.timerId = null; }
      RU_STATE.items = [];
      RU_STATE.sel = [];
      RU_STATE.result = null;
      RU_STATE.left = 0;
      var t = el('ruTimer');
      if (t) { t.hidden = true; t.classList.remove('warn'); t.textContent = ''; }
      go('ruready');
    });
  });

  /* ---------- 渲染诗句 + 格子 ---------- */
  function renderPoem(noAnim) {
    var area = el('poemArea');
    area.innerHTML = '';
    var lines = state.poem.lines;
    // 一联一行：每 2 句（14 字）为一行，共 4 行
    for (var k = 0; k < lines.length; k += 2) {
      var row = document.createElement('div');
      row.className = 'line couplet';
      for (var h = 0; h < 2; h++) {
        var li = k + h;
        var line = lines[li];
        if (!line) break;
        var half = document.createElement('div');
        half.className = 'half';
        line.chars.forEach(function (ch, ci) {
          var wrap = document.createElement('div');
          wrap.className = 'ch';
          var zi = document.createElement('span');
          zi.className = 'zi'; zi.textContent = TPoem(state.poem.id, li, ci, ch);
          var cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.li = li; cell.dataset.ci = ci;
          cell.addEventListener('click', function () { cycle(cell, +cell.dataset.li, +cell.dataset.ci); });
          wrap.appendChild(zi); wrap.appendChild(cell);
          half.appendChild(wrap);
        });
        row.appendChild(half);
      }
      area.appendChild(row);
    }
    if (!noAnim) stagger(area.querySelectorAll('.line'), 0.07);   // 逐联错落入场
    setCursor(0, 0);                                 // 键盘光标回到首格
  }

  /* 切换繁简后重画练习页：保留作答、批改结果与键盘光标 */
  function repaintPoem() {
    var keep = { li: state.cursor.li, ci: state.cursor.ci };
    el('practiceTitle').textContent = TTitle(state.poem);
    el('practiceSub').textContent = TAuthor(state.poem) + ' · ' + state.poem.category +
      ' · ' + state.poem.lines.length + ' 句';
    renderPoem(true);
    state.answers.forEach(function (row, li) {
      row.forEach(function (v, ci) { if (v) paint(li, ci); });
    });
    if (state.result) markPoem();
    setCursor(keep.li, keep.ci);
  }

  function cycle(cell, li, ci) {
    if (state.result) return;      // 批改后锁定
    var cur = state.answers[li][ci];
    var next = cur === '' ? '○' : cur === '○' ? '●' : '';
    state.answers[li][ci] = next;
    cell.textContent = next;
    cell.classList.toggle('ping', next === '○');
    cell.classList.toggle('ze', next === '●');
    playClick();
    // 点击脉冲

    cell.classList.remove('pulse'); void cell.offsetWidth; cell.classList.add('pulse');

    setCursor(li, ci);                                 // 点哪个格，键盘光标就移到哪

  }



  /* ---------- 键盘作答（练习页）：A 平 · D 仄 · S 跳过 · Backspace 回退 ---------- */
  function cellAt(li, ci) {
    return document.querySelector('#poemArea .cell[data-li="' + li + '"][data-ci="' + ci + '"]');
  }
  function paint(li, ci) {
    var c = cellAt(li, ci); if (!c) return;
    var v = state.answers[li][ci];
    c.textContent = v;
    c.classList.toggle('ping', v === '○');
    c.classList.toggle('ze', v === '●');
  }
  function setCursor(li, ci) {
    var old = document.querySelector('#poemArea .cell.cur');
    if (old) old.classList.remove('cur');
    var c = cellAt(li, ci);
    if (c) c.classList.add('cur');
    state.cursor = { li: li, ci: ci };
  }
  function cursorNext() {
    var p = state.poem; if (!p) return;
    var li = state.cursor.li, ci = state.cursor.ci;
    if (ci + 1 < p.lines[li].chars.length) ci++;
    else if (li + 1 < p.lines.length) { li++; ci = 0; }
    else return;                                       // 最后一格：停住
    setCursor(li, ci);
  }
  function cursorPrev() {
    var p = state.poem; if (!p) return;
    var li = state.cursor.li, ci = state.cursor.ci;
    if (ci > 0) ci--;
    else if (li > 0) { li--; ci = p.lines[li].chars.length - 1; }
    if (state.answers[li][ci] !== '') { state.answers[li][ci] = ''; paint(li, ci); }
    setCursor(li, ci);
  }
  function setAnswer(li, ci, v) {
    if (state.result) return;
    state.answers[li][ci] = v;
    paint(li, ci);
    playClick();
  }
  document.addEventListener('keydown', function (e) {
    var pg = activePage();
    if (pg !== 'page-practice' && pg !== 'page-zedrill') return;
    var m = el('modal'); if (m && !m.hidden) return;   // 弹窗期间不接管按键
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.isComposing || e.keyCode === 229) return;    // 中文输入法组合态：不接管
    var k = e.key;
    if (k === 'Backspace') {
      if (pg === 'page-practice') cursorPrev(); else zePrev();
      e.preventDefault(); return;
    }
    var v = (k === 'a' || k === 'A') ? '○' : (k === 'd' || k === 'D') ? '●' :
            (k === 's' || k === 'S') ? '' : null;
    if (v === null) return;
    if (pg === 'page-practice') {
      if (state.result) return;
      setAnswer(state.cursor.li, state.cursor.ci, v);
      cursorNext();
    } else {
      if (ZE.result) return;
      zeSet(ZE.cur, v);
      zeNext();
    }
    e.preventDefault();
  });


  /* ---------- 计时 ---------- */
  function startTimerIfNeeded() {
    state.timed = el('timedToggle').checked;
    var box = el('timerBox');
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    if (!state.timed) { if (box) box.hidden = true; return; }
    state.left = 180;
    if (box) box.hidden = false;
    updateTimer();
    resumeTimer();
  }
  function updateTimer() {
    var m = Math.floor(state.left / 60), s = state.left % 60;
    var tEl = el('timer');
    tEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    tEl.classList.toggle('warn', state.left <= 30);
  }

  /* ---------- 提交 ---------- */
  el('submitBtn').addEventListener('click', function () {
    var blank = countBlank();
    confirmModal('确认提交？', blank > 0 ? '' : '将立即批改本次作答。', '提交', function () {
      if (blank > 0) {
        alertModal('尚未完成', '还有 <b>' + blank + '</b> 个字未标注，<b>空白处将判为错误</b>。是否继续提交？', '坚持提交', function () { doGrade(); }, '返回练习');
      } else {
        doGrade();
      }
    });
  });

  function countBlank() {
    var n = 0;
    state.answers.forEach(function (row) { row.forEach(function (a) { if (a === '') n++; }); });
    return n;
  }

  /* ---------- 批改 ---------- */
  function classify(ch, glyph, user, right) {
    var f = ruFlags(ch, glyph);
    var dual = f.dual ? '；另有非入声读法' : '';
    if (f.trap) return '古仄今平（入声）：今读平声，易误判' + dual;
    if (f.ru) return '一般平仄（入声）：今读仍为仄声' + dual;
    return '一般平仄';
  }

  function doGrade() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    var errors = [];
    state.poem.lines.forEach(function (line, li) {
      line.chars.forEach(function (ch, ci) {
        var right = line.tones[ci];
        var user = state.answers[li][ci];
        var lenient = line.lenient && line.lenient.indexOf(ci) >= 0;
        var ok = user !== '' && (user === right || (lenient && user !== ''));
        if (!ok) errors.push({ li: li, ci: ci, ch: ch, user: user, right: right });
      });
    });
    /* ---- 记录：本题成绩 + 逐字掌握度（错题本） ---- */
    var pr = REC.poems[state.poem.id] || { times: 0, best: 99 };
    pr.times += 1;
    pr.best = Math.min(pr.best, errors.length);
    REC.poems[state.poem.id] = pr;
    state.poem.lines.forEach(function (line, li) {
      line.chars.forEach(function (ch, ci) {
        var a = state.answers[li][ci];
        var ok = a !== '' && a === line.tones[ci];
        if (!ok) {          // 记下「这个字在这首诗里的显示形」，错题本/专练按它显示
          REC.ze[ch] = { n: ((REC.ze[ch] || {}).n || 0) + 1, streak: 0,
                         d: TPoemTrad(state.poem.id, li, ci, ch) };
        }
        else if (REC.ze[ch]) {
          REC.ze[ch].streak = (REC.ze[ch].streak || 0) + 1;
          if (REC.ze[ch].streak >= 2) delete REC.ze[ch];   // 连续答对 2 次 → 移出错题本
        }
      });
    });
    saveRec();



    state.result = { errors: errors, pass: errors.length <= 3, total: countTotal() };

    markPoem();
    if (state.result.pass) playCorrect(); else playWrong();
    alertModal(
      state.result.pass ? '通过' : '未通过',
      '共 <b>' + state.result.total + '</b> 字，标错 <b>' + errors.length + '</b> 个。' +
      (state.result.pass ? '失误 ≤ 3，达到通过标准。' : '失误超过 3 个，未达通过标准。'),
      '查看批改', function () { renderResult(); go('result'); }
    );
  }

  function countTotal() {
    return state.poem.lines.reduce(function (s, l) { return s + l.chars.length; }, 0);
  }

  function markPoem() {
    var errSet = {};
    state.result.errors.forEach(function (e) { errSet[e.li + '-' + e.ci] = e; });
    document.querySelectorAll('#poemArea .cell').forEach(function (cell) {
      var li = +cell.dataset.li, ci = +cell.dataset.ci;
      var e = errSet[li + '-' + ci];
      if (e) {
        cell.classList.remove('ping', 'ze');
        cell.classList.add(e.user === '' ? 'miss' : 'wrong');
        if (e.user === '') cell.textContent = '—';
      } else {
        cell.classList.add('correct');
      }
    });
  }

  function renderPoemReview() {
    var area = el('reviewPoem');
    if (!area) return;
    area.innerHTML = '';
    // 顶部图例：三色三态一次说明
    var legend = document.createElement('div');
    legend.className = 'review-legend';
    legend.innerHTML =
      '<span class="lg"><i class="rv i-ok"></i>标对</span>' +
      '<span class="lg"><i class="rv i-bad"></i>标错</span>' +
      '<span class="lg"><i class="rv i-blank"></i>未标</span>' +
      '<span class="lg lg-trap">下标标注入声字：「古仄今平（入声）」＝今读平声、易误判；' +
      '「一般平仄（入声）」＝今读仍为仄；「·两读」＝另有非入声读法</span>';
    area.appendChild(legend);

    // 本诗入声字清单（帮助在格律练习中一并记住入声字）
    (function () {
      var seen = {}, list = [];
      state.poem.lines.forEach(function (line, li) {
        line.chars.forEach(function (ch, ci) {
          var d = TPoem(state.poem.id, li, ci, ch);   // 显示形按位置取（发/髮、干/乾/幹 …）
          var f = ruFlags(ch, d);                     // 标注按显示字形取（只/隻、蜡/蠟 …）
          if (!f.ru) return;
          var key = ch + '|' + d;
          if (seen[key]) return;
          seen[key] = 1; list.push({ k: ch, d: d, f: f });
        });
      });
      if (!list.length) return;
      function mark(o) {          // 两读字：星标挪到该字右上角（上标）
        return o.f.dual
          ? '<span class="rus-ch">' + o.d + '<i>*</i></span>' : o.d;
      }
      var traps = list.filter(function (o) { return o.f.trap; });
      var rest = list.filter(function (o) { return !o.f.trap; });
      var hasDual = list.some(function (o) { return o.f.dual; });
      var html = '<div class="rus-title">本诗入声字 <b>' + list.length + '</b> 个</div>';
      if (traps.length) {
        html += '<div class="rus-line"><span class="rus-label">古仄今平（入声）：</span>' +
          '<span class="rus-chars">' + traps.map(mark).join('、') + '</span></div>';
      }
      if (rest.length) {
        html += '<div class="rus-line"><span class="rus-label">一般平仄（入声）：</span>' +
          '<span class="rus-chars">' + rest.map(mark).join('、') + '</span></div>';
      }
      if (hasDual) html += '<div class="rus-note">标了“*”号的字另有非入声读法</div>';
      var sum = document.createElement('div');
      sum.className = 'ru-summary';
      sum.innerHTML = html;
      area.appendChild(sum);

    })();



    // 这首诗的练习次数与最好成绩
    var pre = REC.poems[state.poem.id];
    if (pre && pre.times) {
      var prEl = document.createElement('div');
      prEl.className = 'poem-record';
      prEl.innerHTML = '这首诗你已练过 <b>' + pre.times + '</b> 次，最好成绩标错 <b>' +
        (pre.best === 99 ? '—' : pre.best) + '</b> 个';
      area.appendChild(prEl);
    }


    var errSet = {};
    state.result.errors.forEach(function (e) { errSet[e.li + '-' + e.ci] = e; });
    var lines = state.poem.lines;
    // 一联一行：每 2 句为一行，与练习页一致
    for (var k = 0; k < lines.length; k += 2) {
      var row = document.createElement('div');
      row.className = 'line couplet';
      for (var h = 0; h < 2; h++) {
        var li = k + h;
        var line = lines[li];
        if (!line) break;
        var half = document.createElement('div');
        half.className = 'half';
        line.chars.forEach(function (ch, ci) {
          var wrap = document.createElement('div');
          wrap.className = 'ch';
          var g = TPoem(state.poem.id, li, ci, ch);        // 显示字形
          var zi = document.createElement('span');
          zi.className = 'zi'; zi.textContent = g;
          var cell = document.createElement('div'); cell.className = 'cell';
          var right = line.tones[ci];
          var user = state.answers[li][ci];               // 本人作答：'' / '○' / '●'
          var e = errSet[li + '-' + ci];
          var f = ruFlags(ch, g);                         // 标注按显示字形取
          var trap = f.trap;                              // 入声·今读平声（易误判）
          var ruOnly = !f.trap && f.ru;                   // 入声·今读仍为仄
          var dualTag = f.dual ? '·两读' : '';
          if (user === '') {                              // 未标：灰虚线 + 「空」
            cell.classList.add('blank');
            cell.textContent = '空';
          } else {
            cell.textContent = user;                      // 格子=我的作答
          }
          var label = null;
          if (!e) {
            if (user !== '') cell.classList.add('correct');       // 绿：标对
            if (trap) label = { t: '古仄今平（入声）' + dualTag, cls: 'trap-ref ok' };
            else if (ruOnly) label = { t: '一般平仄（入声）' + dualTag, cls: 'ru-ref ok' };
          } else {
            if (user !== '') cell.classList.add('wrong');         // 红：标错
            if (trap) label = { t: '古仄今平（入声）' + dualTag, cls: 'trap-ref bad' };
            else if (ruOnly) label = { t: '一般平仄（入声）' + dualTag, cls: 'ru-ref bad' };
            else label = { t: '应为' + (right === '○' ? '平' : '仄'), cls: 'ans-ref' };
          }
          wrap.appendChild(zi); wrap.appendChild(cell);
          if (label) {
            var ref = document.createElement('span');
            ref.className = label.cls; ref.textContent = label.t;
            wrap.appendChild(ref);
          }
          half.appendChild(wrap);
        });
        row.appendChild(half);
      }
      area.appendChild(row);
    }
    // 逐联错落淡入 + 错格一次性高亮
    stagger(area.querySelectorAll('.line'), 0.07);
    Array.prototype.forEach.call(area.querySelectorAll('.cell.wrong, .cell.miss'), function (c) {
      c.classList.add('cell-hi');
      c.style.animationDelay = '0.35s';
    });
  }

  function renderResult() {
    var r = state.result;
    renderPoemReview();
    el('scoreCard').innerHTML =
      '<div class="verdict">' + ziVerdict(r.pass) + '</div>' +
      '<div class="detail">共 ' + r.total + ' 字 · 标错 <b>' + r.errors.length + '</b> 个<br>' +
      '<span style="font-size:13px;color:var(--text-light)">通过标准：失误 ≤ 3 字</span></div>';

    var area = el('reviewArea');
    area.innerHTML = '';
    if (!r.errors.length) {
      area.innerHTML = '<div class="rline" style="text-align:center;color:var(--success)">全对，无失误。</div>';
      return;
    }
    // 按句分组
    var byLine = {};
    r.errors.forEach(function (e) { (byLine[e.li] = byLine[e.li] || []).push(e); });
    Object.keys(byLine).sort(function (a, b) { return a - b; }).forEach(function (li) {
      var line = state.poem.lines[li];
      var box = document.createElement('div');
      box.className = 'rline';
      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '第 ' + (+li + 1) + ' 句';
      box.appendChild(tag);
      var errs = document.createElement('div');
      errs.className = 'errs';
      byLine[li].forEach(function (e) {
        var g = TPoem(state.poem.id, e.li, e.ci, e.ch);   // 逐句清单也用显示字形
        var d = document.createElement('div');
        d.className = 'err-item';
        var yours = e.user === '' ? '未标' : (e.user === '○' ? '平' : '仄');
        var rights = e.right === '○' ? '平' : '仄';
        d.innerHTML = '<span class="c">' + g + '</span>' +
          '你标：<span class="you">' + yours + '</span> · 应为：<span class="right">' + rights + '</span>' +
          '<span class="type">' + classify(e.ch, g, e.user, e.right) + '</span>';
        errs.appendChild(d);
      });
      box.appendChild(errs);
      area.appendChild(box);
    });
  }

  /* ---------- 弹窗 ---------- */
  // 集字「通过 / 未通过」（颜真卿），用 mask 着色：通过=松绿 / 未通过=朱砂
  // 集字以 base64 内联在 style.css（.zi-wei/.zi-tong/.zi-guo），file:// 下亦可用
  function ziVerdict(pass) {
    var chars = pass ? ['zi-tong', 'zi-guo'] : ['zi-wei', 'zi-tong', 'zi-guo'];
    var inner = chars.map(function (c) {
      return '<i class="zi ' + c + '"></i>';
    }).join('');
    return '<span class="zi-verdict ' + (pass ? 'pass' : 'fail') + '" role="img" ' +
      'aria-label="' + (pass ? '通过' : '未通过') + '">' + inner + '</span>';
  }
  function titleTag(title) {
    if (title === '通过' || title.indexOf('未通过') >= 0) {
      return '<h3 class="h-zi">' + ziVerdict(title === '通过') + '</h3>';
    }
    return '<h3>' + title + '</h3>';
  }
  function confirmModal(title, msg, okText, onOk) {
    pauseActiveTimer();   // 弹窗期间暂停计时
    showModal(titleTag(title) + (msg ? '<p>' + msg + '</p>' : '') +
      '<div class="actions"><button class="btn-ghost" data-x="cancel">取消</button>' +
      '<button class="btn-primary" data-x="ok">' + okText + '</button></div>',
      function (x) {
        if (x === 'ok') { hideModal(); onOk(); }
        else if (x === 'cancel') { hideModal(); resumeActiveTimer(); }  // 取消 → 从剩余时间继续
      });
  }
  function alertModal(title, msg, okText, onOk, cancelText) {
    pauseActiveTimer();
    var html = titleTag(title) + (msg ? '<p>' + msg + '</p>' : '') + '<div class="actions">';
    if (cancelText) html += '<button class="btn-ghost" data-x="cancel">' + cancelText + '</button>';
    html += '<button class="btn-primary" data-x="ok">' + okText + '</button></div>';
    showModal(html, function (x) {
      if (x === 'ok') { hideModal(); if (onOk) onOk(); }
      else if (x === 'cancel') { hideModal(); resumeActiveTimer(); }
    });
  }
  function showModal(html, cb) {
    var m = el('modal'), box = el('modalBox');
    box.innerHTML = html;
    m.hidden = false;
    box.querySelectorAll('[data-x]').forEach(function (b) {
      b.addEventListener('click', function () { cb(b.getAttribute('data-x')); });
    });
  }
  function hideModal() { el('modal').hidden = true; el('modalBox').innerHTML = ''; }

  /* ---------- 信息弹窗（依据与勘误 / 反馈二维码）：纯前端 ---------- */
  function openPanel(html, extraClass) {
    var m = el('modal'), box = el('modalBox');
    box.className = 'modal' + (extraClass ? ' ' + extraClass : '');
    box.innerHTML = html;
    m.hidden = false;
    function close() {
      m.hidden = true; box.innerHTML = '';
      document.removeEventListener('keydown', onKey, true);
      m.removeEventListener('click', onOverlay);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function onOverlay(e) { if (e.target === m) close(); }
    document.addEventListener('keydown', onKey, true);
    m.addEventListener('click', onOverlay);
    Array.prototype.forEach.call(box.querySelectorAll('[data-x]'), function (b) {
      b.addEventListener('click', function () {
        var x = b.getAttribute('data-x');
        close();
        if (x === 'feedback') openFeedback();
      });
    });
  }

  /* 二维码内嵌为 data URI（600×600 无损 PNG）：打开弹窗时不再发起文件请求 */
  var FEEDBACK_QR = 'data:image/png;base64,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';
  function openFeedback() {
    openPanel(
      '<h3>反馈与纠错</h3>' +
      '<p class="fb-lead">微信扫一扫，填写使用体验，或指出诗句标注中的错误。</p>' +
      '<div class="fb-main">' +
        '<div class="fb-qr"><img src="' + FEEDBACK_QR + '" alt="反馈问卷二维码" width="230" height="230"></div>' +
        '<div class="fb-side">' +
          '<a class="btn-ghost fb-open" href="https://v.wjx.cn/vm/O7082Oj.aspx" target="_blank" rel="noopener noreferrer">在手机上打开问卷</a>' +
          '<p class="fb-hint">扫码不便时，直接点上方按钮即可打开问卷。</p>' +
        '</div>' +
      '</div>' +
      '<div class="actions"><button class="btn-ghost" data-x="close">关闭</button></div>'
    );
  }

  /* 题库版本：每次更新题库或勘误后手动改这里 */
  var DATA_VERSION = '2026-10-17';
  function openBasis() {
    openPanel(
      '<h3>依据与勘误</h3>' +
      '<div class="basis">' +
        '<h4>一、底本与参校</h4>' +
        '<p>诗题、诗句与平仄标注依据喻守真《唐诗三百首详析》（2005 年 9 月第 2 版）；单字平仄、两读及入声判定，另参校《平水韵》（佩文韵府）。</p>' +
        '<h4>二、录入与校验</h4>' +
        '<p>依据书影人工录入，逐字校对，并与韵书交叉核对。题库现含七律 37 首、七古 16 段，共 53 个练习单元；入声练习使用 281 个常用入声字。</p>' +
        '<h4>三、已知差异</h4>' +
        '<ol>' +
          '<li><b>印本差异</b>：同一著作的不同版次或印次，可能存在个别字形、符号差异；遇有疑问处，本练习依据韵书与上下文校正。</li>' +
          '<li><b>两读字</b>：本练习按“有入声读法即计入声（仄）”处理，这是练习规则，不是标注错误。</li>' +
          '<li><b>繁简字形</b>：繁体界面按实际显示的字形给标注，个别字（如「只 / 隻」）可能与简体界面的归属不同。</li>' +
          '<li><b>提取误差</b>：录入与识别环节仍可能存在疏漏。</li>' +
        '</ol>' +
        '<h4>四、勘误与反馈</h4>' +
        '<p>若发现某字与你的本子不一致，请提交篇目、句序和字；核实后会修正题库并更新页面版本。</p>' +
        '<p class="basis-ver">题库版本：' + DATA_VERSION + '</p>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn-ghost" data-x="close">关闭</button>' +
        '<button class="btn-primary" data-x="feedback">反馈与纠错</button>' +
      '</div>',
      'modal-wide'
    );
  }

  el('basisBtn').addEventListener('click', openBasis);
  el('feedbackBtn').addEventListener('click', openFeedback);

  // ---- 计时暂停 / 恢复（按当前练习页分派；弹窗期间暂停）----
  function activePage() { var p = document.querySelector('.page.active'); return p ? p.id : ''; }
  function pauseActiveTimer() {
    if (activePage() === 'page-practice') {
      if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    } else if (activePage() === 'page-rusheng') {
      if (RU_STATE.timerId) { clearInterval(RU_STATE.timerId); RU_STATE.timerId = null; }
    }
  }
  function resumeActiveTimer() {
    if (activePage() === 'page-practice') resumeTimer();
    else if (activePage() === 'page-rusheng') resumeRuTimer();
  }
  function resumeTimer() {
    if (state.timed && !state.timerId && state.left > 0 && !state.result) {
      state.timerId = setInterval(function () {
        state.left--; updateTimer();
        if (state.left <= 0) {
          clearInterval(state.timerId); state.timerId = null;
          alertModal('练习结束', '倒计时已结束，将强制提交并批改。', '查看结果', function () { doGrade(); });
        }
      }, 1000);
    }
  }
  function resumeRuTimer() {
    if (RU_STATE.duration === 0) return;   // 不限时：不倒数
    if (!RU_STATE.timerId && RU_STATE.left > 0 && !RU_STATE.result) {
      RU_STATE.timerId = setInterval(function () {
        RU_STATE.left--;
        var tEl = el('ruTimer');
        tEl.textContent = (RU_STATE.left < 10 ? '0' : '') + RU_STATE.left;
        tEl.classList.toggle('warn', RU_STATE.left <= 5);
        if (RU_STATE.left <= 0) {
          clearInterval(RU_STATE.timerId); RU_STATE.timerId = null;
          alertModal('练习结束', '倒计时已结束，将强制提交并批改。', '查看结果', function () { gradeRu(); });
        }
      }, 1000);
    }
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);background:var(--text-primary);' +
      'color:var(--bg-page);padding:10px 20px;border-radius:20px;font-size:14px;z-index:2000;opacity:0;transition:.3s;font-family:var(--sans)';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 300); }, 1800);
  }

  /* ============================================================
     入声字判别
     ============================================================ */
  var RU_STATE = { items: [], sel: [], timerId: null, left: 15, duration: 15, result: null };

  // 练习时长（秒）；0 = 不限时
  function ruDuration() {
    var sel = el('ruTimeSelect');
    var v = sel ? parseInt(sel.value, 10) : 15;
    return isNaN(v) ? 15 : v;
  }
  function initRuTime() {
    var sel = el('ruTimeSelect');
    if (!sel) return;
    sel.addEventListener('change', updateRuHint);
    updateRuHint();
  }
  function updateRuHint() {
    var h = el('ruTimeHint');
    if (!h) return;
    var d = ruDuration();
    h.innerHTML = d ? '需在 <b>' + d + ' 秒</b>内' : '不限时，可从容';
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function ruCount() {
    var v = el('ruCountSelect') ? el('ruCountSelect').value : 'exam';
    if (v === 'exam') return 3 + Math.floor(Math.random() * 4);      // 考核档：3–6
    return parseInt(v, 10) || 3;

  }



  /* 出题项：k = 简体键（判定/错题本用），c = 显示字形（繁显时可能是展开出的另一种繁体形） */
  function ruItem(k, ru) {
    var forms = (TRAD.expand && TRAD.expand[k]) || [(TRAD.map && TRAD.map[k]) || k];
    return { k: k, c: forms[Math.floor(Math.random() * forms.length)], ru: ru };
  }

  function newRuQuestion() {
    var pool = (DATA.ruPool || []).slice();
    var fe = (DATA.feiruPool || []).slice();
    if (RU_DRILL) {                                   // 错题专练：优先出错字
      var items = [], used = {}, nRu = 0, nFe = 0;
      ruWrongList().forEach(function (c) {
        if (items.length >= 15 || used[c]) return;
        if (pool.indexOf(c) >= 0) { if (nRu < 12) { items.push(ruItem(c, true)); used[c] = 1; nRu++; } }
        else if (fe.indexOf(c) >= 0) { if (nFe < 12) { items.push(ruItem(c, false)); used[c] = 1; nFe++; } }
      });
      if (nRu < 3) {                                  // 保证至少 3 个入声，否则全选就过
        shuffle(pool.filter(function (c) { return !used[c]; })).slice(0, 3 - nRu)
          .forEach(function (c) { items.push(ruItem(c, true)); used[c] = 1; nRu++; });
      }
      shuffle(fe.filter(function (c) { return !used[c]; })).forEach(function (c) {
        if (items.length < 15) { items.push(ruItem(c, false)); used[c] = 1; nFe++; }
      });
      return shuffle(items);
    }
    var n = Math.min(ruCount(), pool.length, 15);
    var ru = shuffle(pool.slice()).slice(0, n);
    var rest = shuffle(fe.slice()).slice(0, 15 - n);
    return shuffle(
      ru.map(function (c) { return ruItem(c, true); })
        .concat(rest.map(function (c) { return ruItem(c, false); }))
    );
  }


  function updateDrillCount() {
    var n = ruWrongList().length, t = el('drillCount'), b = el('ruDrill');
    if (t) t.textContent = n ? ('错题池 ' + n + ' 字') : '错题池已清空';
    if (b) b.classList.toggle('empty', !n);
  }



  function enterRuReady() {

    if (RU_STATE.timerId) { clearInterval(RU_STATE.timerId); RU_STATE.timerId = null; }

    RU_DRILL = false;
    updateDrillCount();

    go('ruready');          // 缓冲界面：不显示题目、不计时

  }


  function beginRu() {
    RU_STATE.items = newRuQuestion();
    RU_STATE.sel = RU_STATE.items.map(function () { return false; });
    RU_STATE.result = null;
    RU_STATE.duration = ruDuration();   // 读取本页所选时长
    renderRu();
    go('rusheng');          // 切到练习页（此时才显示题目）
    startRuTimer();         // 看到题目即开始计时
  }
  el('ruBegin').addEventListener('click', function () { RU_DRILL = false; beginRu(); });
  el('ruDrill').addEventListener('click', function () {
    if (!ruWrongList().length) {
      alertModal('错题已清空', '入声错题池里没有字了，去常规练习吧。', '知道了');
      return;
    }
    RU_DRILL = true;
    beginRu();
  });

  function renderRu() {
    var g = el('ruGrid');
    if (!g) return;
    g.innerHTML = '';
    RU_STATE.items.forEach(function (it, i) {
      var d = document.createElement('button');
      d.className = 'ru-ch';
      d.textContent = ruShow(it);
      d.dataset.i = i;
      if (RU_STATE.sel[i]) d.classList.add('selected');   // 切换繁简后保留已选
      d.addEventListener('click', function () {
        if (RU_STATE.result) return;
        RU_STATE.sel[i] = !RU_STATE.sel[i];
        d.classList.toggle('selected', RU_STATE.sel[i]);
        playClick();
        d.classList.remove('pulse'); void d.offsetWidth; d.classList.add('pulse');
      });
      g.appendChild(d);
    });
    stagger(g.querySelectorAll('.ru-ch'), 0.03, 'pop-in');   // 字块错落弹出
    if (RU_STATE.result) markRu();                           // 已批改：恢复对错标记
  }

  function startRuTimer() {
    var tEl = el('ruTimer');
    if (RU_STATE.timerId) { clearInterval(RU_STATE.timerId); RU_STATE.timerId = null; }
    var d = RU_STATE.duration;
    tEl.hidden = false;
    tEl.classList.remove('warn');
    if (d === 0) {                       // 不限时
      RU_STATE.left = Infinity;
      tEl.textContent = '∞';
      return;
    }
    RU_STATE.left = d;
    tEl.textContent = (d < 10 ? '0' : '') + d;
    resumeRuTimer();
  }

  el('ruSubmit').addEventListener('click', function () {
    var anySel = RU_STATE.sel.some(function (s) { return s; });
    if (!anySel) {
      pauseActiveTimer();     // 提示期间暂停计时
      showModal(titleTag('提示') + '<p>未判别出任何入声字，请确认。</p>' +
        '<div class="actions"><button class="btn-ghost" data-x="back">返回练习</button>' +
        '<button class="btn-primary" data-x="go">坚持提交</button></div>',
        function (x) {
          if (x === 'back') { hideModal(); resumeActiveTimer(); }
          else { hideModal(); gradeRu(); }
        });
      return;
    }
    confirmModal('确认提交？', '将立即批改本次作答。', '提交', function () { gradeRu(); });
  });

  function gradeRu() {
    if (RU_STATE.timerId) { clearInterval(RU_STATE.timerId); RU_STATE.timerId = null; }
    var miss = [], extra = [];
    RU_STATE.items.forEach(function (it, i) {
      if (it.ru && !RU_STATE.sel[i]) miss.push(it);
      if (!it.ru && RU_STATE.sel[i]) extra.push(it);
    });
    /* ---- 记录入声错题：漏选 / 误选；答对则从错题池清出 ---- */
    RU_STATE.items.forEach(function (it, i) {
      var sel = RU_STATE.sel[i];
      if (it.ru && !sel) REC.ruMiss[it.k] = (REC.ruMiss[it.k] || 0) + 1;
      else if (!it.ru && sel) REC.ruExtra[it.k] = (REC.ruExtra[it.k] || 0) + 1;
      else { delete REC.ruMiss[it.k]; delete REC.ruExtra[it.k]; }
    });
    saveRec();



    var errs = miss.length + extra.length;

    RU_STATE.result = { miss: miss, extra: extra, pass: errs === 0, n: errs };

    markRu();
    if (RU_STATE.result.pass) playCorrect(); else playWrong();
    alertModal(RU_STATE.result.pass ? '通过' : '未通过',
      '共 ' + RU_STATE.items.length + ' 字，失误 <b>' + errs + '</b> 个。' +
      (RU_STATE.result.pass ? '零失误，达到通过标准。' : '未达零失误标准。'),
      '查看批改', function () { renderRuResult(); go('ruresult'); });
  }

  function markRu() {
    document.querySelectorAll('#ruGrid .ru-ch').forEach(function (d) {
      var i = +d.dataset.i;
      var ok = (RU_STATE.items[i].ru === RU_STATE.sel[i]);
      d.classList.add(ok ? 'correct' : 'wrong');
    });
  }

  function renderRuGridReview() {
    var g = el('reviewGrid');
    if (!g) return;
    g.innerHTML = '';
    RU_STATE.items.forEach(function (it, i) {
      var d = document.createElement('div');
      d.className = 'ru-ch';
      d.textContent = ruShow(it);
      var sel = RU_STATE.sel[i];
      var tag = '';
      if (it.ru && sel) { d.classList.add('correct'); tag = '✓'; }        // 入声·选中（对）
      else if (it.ru && !sel) { d.classList.add('miss'); tag = '漏'; }     // 入声·漏选（错）
      else if (!it.ru && sel) { d.classList.add('wrong'); tag = '误'; }    // 非入声·误选（错）
      else { d.classList.add('neutral'); }                                 // 非入声·未选（对）
      if (tag) {
        var b = document.createElement('span');
        b.className = 'ru-badge'; b.textContent = tag;
        d.appendChild(b);
      }
      if (ruFlags(it.k, ruShow(it)).dual) {    // 两读字：额外加角标（按显示字形）
        d.classList.add('dual');
        var db = document.createElement('span');
        db.className = 'ru-badge dual-badge'; db.textContent = '两读';
        d.appendChild(db);
      }
      g.appendChild(d);
    });
    // 整块淡入（逐格会与 correct-glow 冲突）+ 错块一次性高亮
    stagger([g], 0);
    Array.prototype.forEach.call(g.querySelectorAll('.ru-ch.miss, .ru-ch.wrong'), function (c) {
      c.classList.add('cell-hi');
      c.style.animationDelay = '0.35s';
    });
  }

  function renderRuResult() {
    var r = RU_STATE.result;
    renderRuGridReview();
    el('ruScore').innerHTML =
      '<div class="verdict">' + ziVerdict(r.pass) + '</div>' +
      '<div class="detail">共 15 字 · 失误 <b>' + r.n + '</b> 个<br>' +
      '<span style="font-size:13px;color:var(--text-light)">通过标准：零失误</span></div>';
    var area = el('ruReview');
    area.innerHTML = '';
    if (r.n === 0) {
      area.innerHTML = '<div class="rline" style="text-align:center;color:var(--success)">全部判断正确，零失误。</div>';
    } else {
      var box = document.createElement('div');
      box.className = 'rline';
      var errs = document.createElement('div');
      errs.className = 'errs';
      r.miss.forEach(function (it) {
        errs.innerHTML += '<div class="err-item"><span class="c">' + ruShow(it) + '</span>是<b>入声字</b>（仄），你漏选了' +
          '<span class="type">今读平声，易误判</span></div>';
      });
      r.extra.forEach(function (it) {
        errs.innerHTML += '<div class="err-item"><span class="c">' + ruShow(it) + '</span>不是入声字，你误选了' +
          '<span class="type">一般平仄</span></div>';
      });
      box.appendChild(errs);
      area.appendChild(box);
    }
    // 本轮出现的两读字：无论对错都说明（另有非入声读法，按口径仍算入声）
    var dual = RU_STATE.items.filter(function (it) {
      return it.ru && ruFlags(it.k, ruShow(it)).dual;
    }).map(ruShow);
    if (dual.length) {
      var dn = document.createElement('div');
      dn.className = 'rline dual-note';
      dn.innerHTML = '<span class="tag">两读字</span>' +
        '<div class="dual-body"><b>' + dual.join('、') + '</b> 既有入声读法，也有非入声读法；' +
        '本练习按「<b>有入声读法即算入声</b>」判定，故应选入声（仄）。</div>';
      area.appendChild(dn);

    }

    if (RU_DRILL) {
      var left = ruWrongList().length;
      var dline = document.createElement('div');
      dline.className = 'rline drill-note';
      dline.innerHTML = '<span class="tag">错题专练</span>错题池还剩 <b>' + left + '</b> 字' +
        (left ? '' : '——已清空，可以去常规练习了。');
      area.appendChild(dline);
    }

  }



  el('ruAgain').addEventListener('click', enterRuReady);   // 回到缓冲界面


  /* ---------- 初始化 ---------- */
  function fillMeta() {
    var np = DATA.poems.length;
    var byCat = {};
    DATA.poems.forEach(function (p) { byCat[p.category] = (byCat[p.category] || 0) + 1; });
    var parts = Object.keys(byCat).map(function (k) { return k + ' ' + byCat[k]; });
    var mp = el('metaPoems'); if (mp) mp.textContent = np + ' 首（' + parts.join(' · ') + '）';
    var mr = el('metaRu'); if (mr) mr.textContent = (DATA.ruPool || []).length + ' 常用入声字';
  }
  fillSelect();

  enhancePicker('poemSelect', 'poemPicker');

  enhancePicker('ruTimeSelect', 'ruTimePicker');

  enhancePicker('ruCountSelect', 'ruCountPicker');

  fillMeta();

  initRuTime();

  renderWeakPanel();
  updateDrillCount();

  go('home');

})();
