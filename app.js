/* ============================================================
   格律练习 · 交互逻辑
   ============================================================ */
(function () {
  'use strict';
  var DATA = window.GELV_DATA || { poems: [], rusheng: [] };
  var RU = new Set(DATA.rusheng || []);

  var el = function (id) { return document.getElementById(id); };
  var state = {
    poem: null, answers: [], timed: false, left: 0, timerId: null, result: null,
  };

  /* ---------- 页面切换 ---------- */
  function go(page) {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var t = el('page-' + page);
    if (t) t.classList.add('active');
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      var to = b.getAttribute('data-go');
      if (to === 'rusheng') { startRusheng(); return; }
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
        o.textContent = p.title + ' · ' + p.author;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  function findPoem(id) { return DATA.poems.find(function (p) { return p.id === id; }); }

  function startPoem(poem) {
    state.poem = poem;
    state.answers = poem.lines.map(function (l) { return l.chars.map(function () { return ''; }); });
    state.result = null;
    el('practiceTitle').textContent = poem.title;
    el('practiceSub').textContent = poem.author + ' · ' + poem.category + ' · ' + poem.lines.length + ' 句';
    renderPoem();
    go('practice');          // 先切页（go 会清掉上一题的计时器）
    startTimerIfNeeded();    // 再启动本题计时
  }

  el('startByPick').addEventListener('click', function () {
    var p = findPoem(el('poemSelect').value);
    if (p) startPoem(p);
  });
  el('startRandom').addEventListener('click', function () {
    var p = DATA.poems[Math.floor(Math.random() * DATA.poems.length)];
    startPoem(p);
  });
  el('quitPractice').addEventListener('click', function () {
    confirmModal('退出练习？', '当前进度将不会保存。', '退出', function () { go('mode'); });
  });

  /* ---------- 渲染诗句 + 格子 ---------- */
  function renderPoem() {
    var area = el('poemArea');
    area.innerHTML = '';
    state.poem.lines.forEach(function (line, li) {
      var div = document.createElement('div');
      div.className = 'line';
      line.chars.forEach(function (ch, ci) {
        var wrap = document.createElement('div');
        wrap.className = 'ch';
        var zi = document.createElement('span'); zi.className = 'zi'; zi.textContent = ch;
        var cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.li = li; cell.dataset.ci = ci;
        cell.addEventListener('click', function () { cycle(cell, li, ci); });
        wrap.appendChild(zi); wrap.appendChild(cell);
        div.appendChild(wrap);
      });
      area.appendChild(div);
    });
  }

  function cycle(cell, li, ci) {
    if (state.result) return;      // 批改后锁定
    var cur = state.answers[li][ci];
    var next = cur === '' ? '○' : cur === '○' ? '●' : '';
    state.answers[li][ci] = next;
    cell.textContent = next;
    cell.classList.toggle('ping', next === '○');
    cell.classList.toggle('ze', next === '●');
  }

  /* ---------- 计时 ---------- */
  function startTimerIfNeeded() {
    state.timed = el('timedToggle').checked;
    var tEl = el('timer');
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    if (!state.timed) { tEl.hidden = true; return; }
    state.left = 180;
    tEl.hidden = false;
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
  function classify(ch, user, right) {
    if (RU.has(ch)) return '入声字（仄声），易误读为平';
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
    state.result = { errors: errors, pass: errors.length <= 3, total: countTotal() };
    markPoem();
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

  function renderResult() {
    var r = state.result;
    el('scoreCard').innerHTML =
      '<div class="verdict ' + (r.pass ? 'pass' : 'fail') + '">' + (r.pass ? '通 过' : '未通过') + '</div>' +
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
        var d = document.createElement('div');
        d.className = 'err-item';
        var yours = e.user === '' ? '未标' : (e.user === '○' ? '平' : '仄');
        var rights = e.right === '○' ? '平' : '仄';
        d.innerHTML = '<span class="c">' + e.ch + '</span>' +
          '你标：<span class="you">' + yours + '</span> · 应为：<span class="right">' + rights + '</span>' +
          '<span class="type">' + classify(e.ch, e.user, e.right) + '</span>';
        errs.appendChild(d);
      });
      box.appendChild(errs);
      area.appendChild(box);
    });
  }

  /* ---------- 弹窗 ---------- */
  function confirmModal(title, msg, okText, onOk) {
    pauseActiveTimer();   // 弹窗期间暂停计时
    showModal('<h3>' + title + '</h3>' + (msg ? '<p>' + msg + '</p>' : '') +
      '<div class="actions"><button class="btn-ghost" data-x="cancel">取消</button>' +
      '<button class="btn-primary" data-x="ok">' + okText + '</button></div>',
      function (x) {
        if (x === 'ok') { hideModal(); onOk(); }
        else if (x === 'cancel') { hideModal(); resumeActiveTimer(); }  // 取消 → 从剩余时间继续
      });
  }
  function alertModal(title, msg, okText, onOk, cancelText) {
    pauseActiveTimer();
    var html = '<h3>' + title + '</h3>' + (msg ? '<p>' + msg + '</p>' : '') + '<div class="actions">';
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
  var RU_STATE = { items: [], sel: [], timerId: null, left: 15, result: null };

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function newRuQuestion() {
    var pool = (DATA.ruPool || []).slice();
    var fe = (DATA.feiruPool || []).slice();
    var n = 3 + Math.floor(Math.random() * 10);        // 3–12 个入声字
    n = Math.min(n, pool.length, 15);
    var ru = shuffle(pool).slice(0, n);
    var rest = shuffle(fe).slice(0, 15 - n);
    return shuffle(
      ru.map(function (c) { return { c: c, ru: true }; })
        .concat(rest.map(function (c) { return { c: c, ru: false }; }))
    );
  }

  function startRusheng() {
    RU_STATE.items = newRuQuestion();
    RU_STATE.sel = RU_STATE.items.map(function () { return false; });
    RU_STATE.result = null;
    renderRu();
    startRuTimer();
    go('rusheng');
  }

  function renderRu() {
    var g = el('ruGrid');
    g.innerHTML = '';
    RU_STATE.items.forEach(function (it, i) {
      var d = document.createElement('button');
      d.className = 'ru-ch';
      d.textContent = it.c;
      d.dataset.i = i;
      d.addEventListener('click', function () {
        if (RU_STATE.result) return;
        RU_STATE.sel[i] = !RU_STATE.sel[i];
        d.classList.toggle('selected', RU_STATE.sel[i]);
      });
      g.appendChild(d);
    });
  }

  function startRuTimer() {
    var tEl = el('ruTimer');
    if (RU_STATE.timerId) { clearInterval(RU_STATE.timerId); RU_STATE.timerId = null; }
    RU_STATE.left = 15;
    tEl.hidden = false;
    tEl.textContent = '15';
    tEl.classList.remove('warn');
    resumeRuTimer();
  }

  el('ruSubmit').addEventListener('click', function () {
    var anySel = RU_STATE.sel.some(function (s) { return s; });
    confirmModal('确认提交？', anySel ? '将立即批改本次作答。' : '尚未选择任何字，提交后将判为全错。', '提交', function () {
      gradeRu();
    });
  });

  function gradeRu() {
    if (RU_STATE.timerId) { clearInterval(RU_STATE.timerId); RU_STATE.timerId = null; }
    var miss = [], extra = [];
    RU_STATE.items.forEach(function (it, i) {
      if (it.ru && !RU_STATE.sel[i]) miss.push(it.c);
      if (!it.ru && RU_STATE.sel[i]) extra.push(it.c);
    });
    var errs = miss.length + extra.length;
    RU_STATE.result = { miss: miss, extra: extra, pass: errs === 0, n: errs };
    markRu();
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

  function renderRuResult() {
    var r = RU_STATE.result;
    el('ruScore').innerHTML =
      '<div class="verdict ' + (r.pass ? 'pass' : 'fail') + '">' + (r.pass ? '通 过' : '未通过') + '</div>' +
      '<div class="detail">共 15 字 · 失误 <b>' + r.n + '</b> 个<br>' +
      '<span style="font-size:13px;color:var(--text-light)">通过标准：零失误</span></div>';
    var area = el('ruReview');
    area.innerHTML = '';
    if (r.n === 0) {
      area.innerHTML = '<div class="rline" style="text-align:center;color:var(--success)">全部判断正确，零失误。</div>';
      return;
    }
    var box = document.createElement('div');
    box.className = 'rline';
    var errs = document.createElement('div');
    errs.className = 'errs';
    r.miss.forEach(function (c) {
      errs.innerHTML += '<div class="err-item"><span class="c">' + c + '</span>是<b>入声字</b>（仄），你漏选了' +
        '<span class="type">今读平声，易误判</span></div>';
    });
    r.extra.forEach(function (c) {
      errs.innerHTML += '<div class="err-item"><span class="c">' + c + '</span>不是入声字，你误选了' +
        '<span class="type">一般平仄</span></div>';
    });
    box.appendChild(errs);
    area.appendChild(box);
  }

  el('ruAgain').addEventListener('click', startRusheng);

  /* ---------- 初始化 ---------- */
  fillSelect();
  go('home');
})();
