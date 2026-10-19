/* AI 빌더 기초 레퍼런스 — 바닐라 JS. 프레임워크 없음.
 * 1) Mermaid  2) 명령어 표  3) 용어집  4) 전체 검색  5) 목차 스크롤스파이 + 모바일 서랍 + 테마
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var DIAGRAM_FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function h(tag, attrs, kids) {
    var n = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return n;
  }
  function readJSON(id) {
    var n = doc.getElementById(id);
    if (!n) return [];
    try { var v = JSON.parse(n.textContent); return Array.isArray(v) ? v : []; }
    catch (e) { console.error('[data] JSON parse failed: ' + id, e); return []; }
  }
  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }
  function openAncestorDetails(el) {
    for (; el && el !== doc.body; el = el.parentElement) if (el.tagName === 'DETAILS') el.open = true;
  }
  function sectionIdOf(el) {
    var s = el.closest ? el.closest('section[id]') : null;
    return s ? s.id : '(no-section)';
  }

  /* ------------------------------------------------------------------ theme */
  var themeBtn = $('#theme-toggle');
  var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return mqDark && mqDark.matches ? 'dark' : 'light';
  }
  function paintThemeBtn() {
    if (!themeBtn) return;
    var dark = currentTheme() === 'dark';
    themeBtn.textContent = dark ? '☀️' : '🌙';
    themeBtn.setAttribute('aria-label', dark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기');
  }
  function setTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
    paintThemeBtn();
    renderDiagrams();
  }
  if (themeBtn) themeBtn.addEventListener('click', function () { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); });
  if (mqDark && mqDark.addEventListener) {
    mqDark.addEventListener('change', function () {
      if (!root.getAttribute('data-theme')) { paintThemeBtn(); renderDiagrams(); }
    });
  }
  paintThemeBtn();

  /* ---------------------------------------------------------------- mermaid */
  var diagrams = [];
  var renderToken = 0;
  var renderQueue = Promise.resolve();
  var mermaidState = 'pending'; // pending | ready | failed

  function dedent(s) {
    var lines = s.replace(/\t/g, '  ').split('\n');
    var min = null;
    lines.forEach(function (l) {
      if (!l.trim()) return;
      var n = l.match(/^ */)[0].length;
      if (min === null || n < min) min = n;
    });
    if (!min) return s.trim();
    return lines.map(function (l) { return l.slice(min); }).join('\n').trim();
  }
  function diagramSource(pre) {
    // 브라우저는 <pre> 안의 <br/>을 요소로 만들어 두므로, 텍스트 노드와 BR을 직접 이어 붙여요.
    var out = '';
    Array.prototype.forEach.call(pre.childNodes, function (n) {
      if (n.nodeType === 3) out += n.data;
      else if (n.nodeName === 'BR') out += '<br/>';
      else out += n.textContent;
    });
    return dedent(out);
  }
  function putSvg(pre, svg) {
    var range = doc.createRange();
    range.selectNodeContents(pre);
    var frag = range.createContextualFragment(svg);
    pre.textContent = '';
    pre.appendChild(frag);
  }
  function showDiagramError(pre, idx, message) {
    var sec = sectionIdOf(pre);
    pre.textContent = '';
    pre.appendChild(h('div', { class: 'mermaid-error', role: 'note' }, [
      h('strong', { text: '다이어그램을 불러오지 못했어요' }),
      h('br'),
      h('span', { text: message || '' })
    ]));
    pre.setAttribute('data-state', 'error');
    pre.setAttribute('data-section', sec);
    console.error('[mermaid] ' + (message || 'render failed') + ' | source: ' + sec + ' diagram #' + idx);
  }
  function runRender(token) {
    if (mermaidState === 'failed') {
      diagrams.forEach(function (pre, i) { showDiagramError(pre, i, '다이어그램 라이브러리를 받지 못했어요. 인터넷 연결을 확인해 보세요.'); });
      window.__mermaidStats = { total: diagrams.length, ok: 0, err: diagrams.length };
      window.__mermaidDone = true;
      return Promise.resolve();
    }
    window.mermaid.initialize({
      startOnLoad: false,
      theme: currentTheme() === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
      fontFamily: DIAGRAM_FONT,
      flowchart: { htmlLabels: true, useMaxWidth: true, padding: 14 }
    });
    var ok = 0, err = 0;
    // 한글 웹폰트가 다 받아진 뒤에 그려야 라벨 폭을 제대로 재서 글자가 잘리지 않아요
    var fontsReady = (doc.fonts && doc.fonts.ready) ? doc.fonts.ready : Promise.resolve();
    var chain = Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 3000); })]);
    diagrams.forEach(function (pre, i) {
      chain = chain.then(function () {
        if (token !== renderToken) return null;
        var id = 'mmd-' + token + '-' + i;
        return window.mermaid.render(id, pre.getAttribute('data-src')).then(function (out) {
          if (token !== renderToken) return;
          putSvg(pre, out.svg);
          pre.setAttribute('data-state', 'done');
          pre.removeAttribute('data-section');
          if (out.bindFunctions) out.bindFunctions(pre);
          ok++;
        }).catch(function (e) {
          [id, 'd' + id].forEach(function (x) { var s = doc.getElementById(x); if (s && s.parentNode) s.parentNode.removeChild(s); });
          if (token !== renderToken) return;
          showDiagramError(pre, i, (e && e.message ? String(e.message).split('\n')[0] : String(e)).slice(0, 160));
          err++;
        });
      });
    });
    return chain.then(function () {
      if (token !== renderToken) return;
      window.__mermaidStats = { total: diagrams.length, ok: ok, err: err };
      window.__mermaidDone = true;
    });
  }
  function renderDiagrams() {
    if (!diagrams.length) { window.__mermaidStats = { total: 0, ok: 0, err: 0 }; window.__mermaidDone = true; return; }
    if (mermaidState === 'pending') return; // 라이브러리가 도착하면 initMermaid의 ready()가 호출해요
    var token = ++renderToken;
    window.__mermaidDone = false;
    renderQueue = renderQueue.then(function () { return runRender(token); }).catch(function (e) {
      console.error('[mermaid] fatal', e);
      window.__mermaidDone = true;
    });
  }
  function initMermaid() {
    diagrams = $$('pre.mermaid');
    diagrams.forEach(function (pre) { pre.setAttribute('data-src', diagramSource(pre)); });
    window.__mermaidDone = false;
    if (!diagrams.length) { renderDiagrams(); return; }
    var script = $('#mermaid-js');
    function settle(state) { if (mermaidState !== 'pending') return; mermaidState = state; renderDiagrams(); }
    if (window.mermaid) { settle('ready'); return; }
    if (script) {
      script.addEventListener('load', function () { settle(window.mermaid ? 'ready' : 'failed'); });
      script.addEventListener('error', function () { settle('failed'); });
    }
    window.addEventListener('load', function () { settle(window.mermaid ? 'ready' : 'failed'); });
  }

  /* ---------------------------------------------------------------- copying */
  function copyText(text, btn) {
    var label = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', label);
    function done(okay) {
      btn.textContent = okay ? '복사됨 ✓' : '복사 실패';
      btn.classList.toggle('ok', okay);
      setTimeout(function () { btn.textContent = label; btn.classList.remove('ok'); }, 1400);
    }
    function fallback() {
      var ta = h('textarea', { readonly: 'readonly', 'aria-hidden': 'true' });
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '-9999px';
      doc.body.appendChild(ta);
      ta.select();
      var okay = false;
      try { okay = doc.execCommand('copy'); } catch (e) {}
      doc.body.removeChild(ta);
      done(okay);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else fallback();
  }

  /* --------------------------------------------------------- command table */
  var CAT_LABEL = { slash: '슬래시', cli: 'CLI', key: '단축키', prefix: '접두어' };
  var CAT_CHIPS = [['all', '전체'], ['slash', '슬래시'], ['cli', 'CLI'], ['key', '단축키'], ['prefix', '접두어']];
  var LV_CHIPS = [['0', '전체 레벨'], ['1', 'Lv1 첫 주에 꼭'], ['2', 'Lv2 익숙해지면'], ['3', 'Lv3 고급']];
  var cmdApi = null;

  function chipGroup(label, defs, onPick) {
    var wrap = h('div', { class: 'chips', role: 'group', 'aria-label': label });
    var buttons = defs.map(function (d, i) {
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': i === 0 ? 'true' : 'false', 'data-v': d[0], text: d[1] });
      b.addEventListener('click', function () { setPressed(d[0]); onPick(d[0]); });
      wrap.appendChild(b);
      return b;
    });
    function setPressed(v) { buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === v ? 'true' : 'false'); }); }
    return { el: wrap, set: setPressed };
  }

  function initCommands() {
    var host = $('#cmd-app');
    if (!host) return;
    var data = readJSON('data-commands');
    host.textContent = '';
    if (!data.length) { host.appendChild(h('p', { class: 'empty-note', text: '명령어 데이터를 불러오지 못했어요.' })); return; }

    var state = { cat: 'all', lv: '0', q: '' };
    var input = h('input', { type: 'search', class: 'filter-input', placeholder: '명령어, 설명, 태그로 거르기', 'aria-label': '명령어 필터', autocomplete: 'off' });
    var catChips = chipGroup('종류', CAT_CHIPS, function (v) { state.cat = v; apply(); });
    var lvChips = chipGroup('난이도', LV_CHIPS, function (v) { state.lv = v; apply(); });
    var count = h('p', { class: 'result-count', 'aria-live': 'polite' });
    var empty = h('p', { class: 'empty-note', text: '맞는 명령이 없어요. 필터를 풀어 보세요.', hidden: 'hidden' });

    var thead = h('thead', null, [h('tr', null, ['명령', '설명', '예시', '난이도', ''].map(function (t) { return h('th', { scope: 'col', text: t }); }))]);
    var tbody = h('tbody');
    var rows = data.map(function (d, i) {
      var tags = Array.isArray(d.tags) ? d.tags : [];
      var lv = String(d.level || 1);
      var tr = h('tr', { id: 'cmd-' + i, class: 'scroll-target' });
      tr.appendChild(h('td', { class: 'c-cmd', 'data-label': '명령' }, [h('code', { text: d.cmd || '' })]));
      var descTd = h('td', { class: 'c-desc', 'data-label': '설명' }, [h('span', { text: d.desc || '' })]);
      if (tags.length) descTd.appendChild(h('span', { class: 'tags', text: tags.map(function (t) { return '#' + t; }).join(' ') }));
      tr.appendChild(descTd);
      tr.appendChild(h('td', { class: 'c-ex', 'data-label': '예시' }, d.ex ? [h('code', { text: d.ex })] : []));
      tr.appendChild(h('td', { class: 'c-lv', 'data-label': '난이도' }, [h('span', { class: 'lv-badge lv' + lv, text: 'Lv' + lv })]));
      var btn = h('button', { type: 'button', class: 'copy-btn', text: '복사', 'aria-label': (d.cmd || '') + ' 복사' });
      btn.addEventListener('click', function () { copyText(d.cmd || '', btn); });
      tr.appendChild(h('td', { class: 'c-copy' }, [btn]));
      tbody.appendChild(tr);
      return { tr: tr, cat: d.cat, lv: lv, hay: lc([d.cmd, d.desc, d.ex, tags.join(' '), CAT_LABEL[d.cat] || d.cat].join(' ')) };
    });
    var table = h('table', { class: 'cmd-table' }, [thead, tbody]);
    var wrap = h('div', { class: 'table-wrap' }, [table]);

    host.appendChild(h('div', { class: 'filter-bar' }, [input, catChips.el, lvChips.el]));
    host.appendChild(count);
    host.appendChild(wrap);
    host.appendChild(empty);

    function apply() {
      var toks = lc(state.q).split(/\s+/).filter(Boolean);
      var shown = 0;
      rows.forEach(function (r) {
        var okay = (state.cat === 'all' || r.cat === state.cat) &&
          (state.lv === '0' || r.lv === state.lv) &&
          toks.every(function (t) { return r.hay.indexOf(t) !== -1; });
        r.tr.hidden = !okay;
        if (okay) shown++;
      });
      count.textContent = '총 ' + rows.length + '개 중 ' + shown + '개';
      wrap.hidden = shown === 0;
      empty.hidden = shown !== 0;
    }
    input.addEventListener('input', function () { state.q = input.value; apply(); });
    apply();

    cmdApi = {
      items: data,
      reveal: function (i) {
        state.cat = 'all'; state.lv = '0'; state.q = ''; input.value = '';
        catChips.set('all'); lvChips.set('0'); apply();
        var tr = rows[i] && rows[i].tr;
        if (!tr) return;
        tr.scrollIntoView({ block: 'center' });
        tr.classList.remove('flash'); void tr.offsetWidth; tr.classList.add('flash');
        setTimeout(function () { tr.classList.remove('flash'); }, 1900);
      }
    };
  }

  /* -------------------------------------------------------------- glossary */
  var CHO = ['ㄱ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅂ', 'ㅅ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var CHO_ORDER = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var glApi = null;

  function groupKey(term) {
    var ch = String(term || '').trim().charAt(0);
    var code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) return CHO[Math.floor((code - 0xAC00) / 588)];
    if (/[A-Za-z]/.test(ch)) return ch.toUpperCase();
    return '#';
  }
  function groupRank(k) {
    var i = CHO_ORDER.indexOf(k);
    if (i !== -1) return i;
    if (k === '#') return 1000;
    return 100 + k.charCodeAt(0);
  }

  function initGlossary() {
    var host = $('#glossary-app');
    if (!host) return;
    var data = readJSON('data-glossary');
    host.textContent = '';
    if (!data.length) { host.appendChild(h('p', { class: 'empty-note', text: '용어 데이터를 불러오지 못했어요.' })); return; }

    var input = h('input', { type: 'search', class: 'filter-input', placeholder: '용어, 영어, 설명으로 거르기', 'aria-label': '용어집 필터', autocomplete: 'off' });
    var count = h('p', { class: 'result-count', 'aria-live': 'polite' });
    var jump = h('div', { class: 'gl-jump', role: 'group', 'aria-label': '가나다 바로가기' });
    var list = h('div', { class: 'gl-list' });
    var empty = h('p', { class: 'empty-note', text: '맞는 용어가 없어요.', hidden: 'hidden' });

    var items = data.map(function (d, i) { return { d: d, i: i, key: groupKey(d.term) }; });
    var groups = {};
    items.forEach(function (it) { (groups[it.key] = groups[it.key] || []).push(it); });
    var collator = (window.Intl && Intl.Collator) ? new Intl.Collator('ko') : null;
    var keys = Object.keys(groups).sort(function (a, b) { return groupRank(a) - groupRank(b); });

    var groupEls = [];
    var itemEls = [];
    keys.forEach(function (k) {
      groups[k].sort(function (a, b) {
        var x = String(a.d.term || ''), y = String(b.d.term || '');
        return collator ? collator.compare(x, y) : (x < y ? -1 : x > y ? 1 : 0);
      });
      var head = h('div', { class: 'gl-letter scroll-target', id: 'gl-g-' + groupEls.length, text: k });
      var dl = h('dl', { class: 'gl-dl' });
      groups[k].forEach(function (it) {
        var d = it.d;
        var dt = h('dt', null, [d.term || '']);
        if (d.en) dt.appendChild(h('span', { class: 'en', text: d.en }));
        var dd = h('dd', null, [h('span', { text: d.def || '' })]);
        if (d.see) dd.appendChild(h('a', { class: 'gl-see', href: '#' + d.see, text: '본문 보기 →' }));
        var row = h('div', { class: 'gl-item scroll-target', id: 'gl-' + it.i }, [dt, dd]);
        dl.appendChild(row);
        itemEls[it.i] = { el: row, hay: lc([d.term, d.en, d.def].join(' ')) };
      });
      var gEl = h('div', { class: 'gl-group' }, [head, dl]);
      list.appendChild(gEl);
      groupEls.push({ el: gEl, rows: groups[k] });
      var jb = h('button', { type: 'button', text: k, 'aria-label': k + ' 그룹으로 이동' });
      jb.addEventListener('click', function () { head.scrollIntoView({ block: 'start' }); });
      jump.appendChild(jb);
    });

    host.appendChild(h('div', { class: 'filter-bar' }, [input]));
    host.appendChild(jump);
    host.appendChild(count);
    host.appendChild(list);
    host.appendChild(empty);

    function apply() {
      var toks = lc(input.value).split(/\s+/).filter(Boolean);
      var shown = 0;
      groupEls.forEach(function (g) {
        var any = 0;
        g.rows.forEach(function (it) {
          var r = itemEls[it.i];
          var okay = toks.every(function (t) { return r.hay.indexOf(t) !== -1; });
          r.el.hidden = !okay;
          if (okay) any++;
        });
        g.el.hidden = any === 0;
        shown += any;
      });
      jump.hidden = toks.length > 0;
      count.textContent = '총 ' + data.length + '개 중 ' + shown + '개';
      empty.hidden = shown !== 0;
    }
    input.addEventListener('input', apply);
    apply();

    glApi = {
      items: data,
      reveal: function (i) {
        input.value = ''; apply();
        var r = itemEls[i];
        if (!r) return;
        r.el.scrollIntoView({ block: 'center' });
        r.el.classList.remove('flash'); void r.el.offsetWidth; r.el.classList.add('flash');
        setTimeout(function () { r.el.classList.remove('flash'); }, 1900);
      }
    };
  }

  /* ---------------------------------------------------------------- search */
  var searchInput = $('#search-input');
  var resultsEl = $('#search-results');
  var entries = [];
  var shownResults = [];
  var activeIdx = -1;

  function headingTitle(hd) {
    var c = hd.cloneNode(true);
    $$('.h2-emoji', c).forEach(function (x) { x.parentNode.removeChild(x); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  function buildIndex() {
    entries = [];
    $$('main section.chapter').forEach(function (sec) {
      var secTitle = sec.getAttribute('data-title') || '';
      $$('h2, h3', sec).forEach(function (hd) {
        var isH2 = hd.tagName === 'H2';
        var id = hd.id || (isH2 ? sec.id : '');
        if (!id) return;
        var title = headingTitle(hd);
        entries.push({ type: isH2 ? '섹션' : '소제목', title: title, sub: isH2 ? '' : secTitle, hay: lc(title + ' ' + secTitle), go: { id: id }, rank: isH2 ? 0 : 1 });
      });
    });
    if (cmdApi) cmdApi.items.forEach(function (d, i) {
      entries.push({ type: '명령어', title: d.cmd || '', sub: d.desc || '', hay: lc([d.cmd, d.desc, d.ex, (d.tags || []).join(' ')].join(' ')), go: { cmd: i }, rank: 2 });
    });
    if (glApi) glApi.items.forEach(function (d, i) {
      entries.push({ type: '용어', title: d.term + (d.en ? ' · ' + d.en : ''), sub: d.def || '', hay: lc([d.term, d.en, d.def].join(' ')), go: { gl: i }, rank: 3 });
    });
  }
  function runSearch(q) {
    var toks = lc(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    var whole = lc(q).trim();
    var scored = [];
    entries.forEach(function (e, idx) {
      if (!toks.every(function (t) { return e.hay.indexOf(t) !== -1; })) return;
      var t = lc(e.title);
      var score = t.indexOf(whole) === 0 ? 0 : t.indexOf(whole) !== -1 ? 1 : 2;
      scored.push({ e: e, score: score, idx: idx });
    });
    scored.sort(function (a, b) { return a.score - b.score || a.e.rank - b.e.rank || a.idx - b.idx; });
    return scored.slice(0, 12).map(function (s) { return s.e; });
  }
  function closeResults() {
    resultsEl.hidden = true;
    resultsEl.textContent = '';
    shownResults = [];
    activeIdx = -1;
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
  }
  function setActive(i) {
    var lis = $$('li[role="option"]', resultsEl);
    if (!lis.length) return;
    activeIdx = (i + lis.length) % lis.length;
    lis.forEach(function (li, k) { li.setAttribute('aria-selected', k === activeIdx ? 'true' : 'false'); });
    searchInput.setAttribute('aria-activedescendant', lis[activeIdx].id);
    lis[activeIdx].scrollIntoView({ block: 'nearest' });
  }
  function renderResults() {
    var q = searchInput.value;
    resultsEl.textContent = '';
    if (!q.trim()) { closeResults(); return; }
    shownResults = runSearch(q);
    if (!shownResults.length) {
      resultsEl.appendChild(h('li', { class: 'r-empty', text: '"' + q.trim() + '"에 맞는 결과가 없어요.' }));
    } else {
      shownResults.forEach(function (e, i) {
        var li = h('li', { role: 'option', id: 'sr-' + i, 'aria-selected': 'false' }, [
          h('span', { class: 'r-type', text: e.type }),
          h('span', { class: 'r-title', text: e.title }),
          h('span', { class: 'r-sub', text: e.sub || ' ' })
        ]);
        li.addEventListener('mousedown', function (ev) { ev.preventDefault(); goTo(e); });
        resultsEl.appendChild(li);
      });
    }
    resultsEl.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    activeIdx = -1;
    if (shownResults.length) setActive(0);
  }
  function goTo(e) {
    closeResults();
    searchInput.blur();
    closeDrawer();
    if (e.go.id) {
      var target = doc.getElementById(e.go.id);
      if (target) openAncestorDetails(target);
      if (location.hash === '#' + e.go.id) { if (target) target.scrollIntoView(); }
      else location.hash = e.go.id;
    } else if (e.go.cmd !== undefined && cmdApi) cmdApi.reveal(e.go.cmd);
    else if (e.go.gl !== undefined && glApi) glApi.reveal(e.go.gl);
  }
  function initSearch() {
    if (!searchInput || !resultsEl) return;
    buildIndex();
    searchInput.addEventListener('input', renderResults);
    searchInput.addEventListener('focus', function () { if (searchInput.value.trim()) renderResults(); });
    searchInput.addEventListener('keydown', function (ev) {
      if (ev.isComposing) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (resultsEl.hidden) renderResults(); else setActive(activeIdx + 1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(activeIdx - 1); }
      else if (ev.key === 'Enter') { ev.preventDefault(); var e = shownResults[activeIdx < 0 ? 0 : activeIdx]; if (e) goTo(e); }
      else if (ev.key === 'Escape') { if (!resultsEl.hidden) closeResults(); else { searchInput.value = ''; searchInput.blur(); } }
    });
    searchInput.addEventListener('blur', function () { setTimeout(closeResults, 120); });
    doc.addEventListener('keydown', function (ev) {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var t = ev.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      ev.preventDefault();
      searchInput.focus();
      searchInput.select();
    });
  }

  /* -------------------------------------- TOC: scrollspy, drawer, progress */
  var header = $('#site-header');
  var toc = $('#toc');
  var tocToggle = $('#toc-toggle');
  var backdrop = $('#toc-backdrop');
  var bar = $('#progress-bar');

  function isMobile() { return window.matchMedia && window.matchMedia('(max-width: 900px)').matches; }
  function openDrawer() {
    doc.body.classList.add('toc-open');
    if (backdrop) backdrop.hidden = false;
    if (tocToggle) { tocToggle.setAttribute('aria-expanded', 'true'); tocToggle.setAttribute('aria-label', '목차 닫기'); }
  }
  function closeDrawer() {
    doc.body.classList.remove('toc-open');
    if (backdrop) backdrop.hidden = true;
    if (tocToggle) { tocToggle.setAttribute('aria-expanded', 'false'); tocToggle.setAttribute('aria-label', '목차 열기'); }
  }
  function initToc() {
    if (header) {
      var setH = function () { root.style.setProperty('--header-h', header.offsetHeight + 'px'); };
      setH();
      if (window.ResizeObserver) new ResizeObserver(setH).observe(header);
      else window.addEventListener('resize', setH);
    }
    if (tocToggle) tocToggle.addEventListener('click', function () { doc.body.classList.contains('toc-open') ? closeDrawer() : openDrawer(); });
    if (backdrop) backdrop.addEventListener('click', closeDrawer);
    if (toc) toc.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('a') && isMobile()) closeDrawer(); });
    doc.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && doc.body.classList.contains('toc-open')) closeDrawer(); });
    window.addEventListener('resize', function () { if (!isMobile()) closeDrawer(); });

    // h2 앞에 이모지
    $$('main section.chapter[data-emoji]').forEach(function (sec) {
      var h2 = $('h2', sec), em = sec.getAttribute('data-emoji');
      if (h2 && em && h2.textContent.trim().indexOf(em) !== 0 && !$('.h2-emoji', h2)) {
        h2.insertBefore(h('span', { class: 'h2-emoji', 'aria-hidden': 'true', text: em }), h2.firstChild);
      }
    });

    // 스크롤스파이
    var heads = [];
    $$('main section.chapter').forEach(function (sec) {
      $$('h2, h3', sec).forEach(function (hd) {
        var id = hd.id || (hd.tagName === 'H2' ? sec.id : '');
        if (!id || !toc) return;
        var link = null;
        $$('a', toc).some(function (a) { if (a.getAttribute('href') === '#' + id) { link = a; return true; } return false; });
        if (link) heads.push({ el: hd, link: link, chapter: link.closest('.toc-ch') });
      });
    });
    var activeLink = null;
    function spy() {
      var limit = (header ? header.offsetHeight : 56) + 40;
      var cur = heads.length ? heads[0] : null;
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].el.getBoundingClientRect().top <= limit) cur = heads[i]; else break;
      }
      if (window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 4 && heads.length) cur = heads[heads.length - 1];
      if (!cur || cur.link === activeLink) return;
      if (activeLink) { activeLink.classList.remove('active'); activeLink.removeAttribute('aria-current'); }
      $$('.toc-ch.open', toc).forEach(function (c) { if (c !== cur.chapter) c.classList.remove('open'); });
      cur.link.classList.add('active');
      cur.link.setAttribute('aria-current', 'location');
      if (cur.chapter) cur.chapter.classList.add('open');
      activeLink = cur.link;
      if (toc && !isMobile()) {
        var tr = toc.getBoundingClientRect(), lr = cur.link.getBoundingClientRect();
        if (lr.top < tr.top + 8 || lr.bottom > tr.bottom - 8) toc.scrollTop += lr.top - tr.top - tr.height / 3;
      }
    }
    function progress() {
      var max = doc.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar) bar.style.transform = 'scaleX(' + p + ')';
    }
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; spy(); progress(); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('load', onScroll);
    spy(); progress();
  }

  function onHash() {
    if (!location.hash || location.hash.length < 2) return;
    var id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
    var t = doc.getElementById(id);
    if (t) openAncestorDetails(t);
  }
  window.addEventListener('hashchange', onHash);

  /* ------------------------------------------------------------------ boot */
  function boot() {
    initToc();
    initCommands();
    initGlossary();
    initSearch();
    initMermaid();
    onHash();
    window.__appReady = true;
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
