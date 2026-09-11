/**
 * HIDD — カテゴリページの描画
 *
 * ?cat=<id> を読んで data.js から該当カテゴリを引き、
 * 動画を横スクロールのフィルムストリップとして並べる。
 * 並びが画面に収まらないときは右から左へゆっくり流し、
 * 末尾の次に先頭をつないで循環させる（手での横スクロールもそのまま使える）。
 * コマを押すとモーダル内の <video> でローカル動画を再生する。
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;
  var GEOM = window.HIDDGeom;
  var SETTINGS = window.HIDDSettings || null;   /* 設定画面（js/settings.js）。無ければ既定のまま */

  var titleEl   = document.getElementById('catTitle');
  var eyebrowEl = document.getElementById('catEyebrow');
  var descEl    = document.getElementById('catDesc');
  var emptyEl   = document.getElementById('emptyNote');
  var othersEl  = document.getElementById('otherCats');

  var stripEl   = document.getElementById('strip');
  var trackEl   = document.getElementById('videoTrack');
  var countEl   = document.getElementById('stripCount');
  var hintEl    = document.getElementById('stripHint');
  var navEl     = document.getElementById('stripNav');
  var prevBtn   = document.getElementById('stripPrev');
  var nextBtn   = document.getElementById('stripNext');

  var modal      = document.getElementById('modal');
  var modalTitle = document.getElementById('modalTitle');
  var modalPlayer = document.getElementById('modalPlayer');
  var modalOpen  = document.getElementById('modalOpen');
  var modalClose = modal.querySelector('.modal__close');

  var lastFocused = null;

  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  /* ---------------- カテゴリの解決 ---------------- */

  var catId = getParam('cat');
  var category = catId ? DATA.findCategory(catId) : null;

  if (!category) {
    document.title = 'カテゴリが見つかりません — HIDD';
    titleEl.textContent = 'カテゴリが見つかりません';
    eyebrowEl.remove();
    descEl.textContent = 'URL のカテゴリ指定が正しくないようです。';
    stripEl.hidden = true;
    emptyEl.hidden = false;
    emptyEl.innerHTML = '<a href="index.html">球体に戻って選び直す</a>';
    renderOthers(null);
    return;
  }

  document.documentElement.style.setProperty('--accent', category.accent);
  document.title = category.label + ' — HIDD 先行研究 紹介動画';

  eyebrowEl.textContent = 'CATEGORY ' + ('0' + DATA.indexOf(category)).slice(-2);
  titleEl.textContent = category.label;
  descEl.textContent = category.description || '';

  /* ---------------- フィルムストリップ ---------------- */

  var videos = category.videos || [];

  countEl.textContent = videos.length + ' 本の紹介動画';

  if (!videos.length) {
    stripEl.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = 'このカテゴリにはまだ動画が登録されていません。';
  }

  function span(cls, text) {
    var el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    return el;
  }

  /* clone は循環のための複製。Tab と読み上げからは外す（同じ動画が何度も出てこないように） */
  function makePanel(video, i, clone) {
    var file = DATA.videoFile(video);

    /* button の中に見出しは置けないので、コマ全体を 1 つのボタンとして読ませる */
    var panel = document.createElement('button');
    panel.type = 'button';
    panel.className = clone ? 'film film--clone' : 'film';
    if (clone) {
      panel.tabIndex = -1;
      panel.setAttribute('aria-hidden', 'true');
    }

    panel.appendChild(span('film__no', ('0' + (i + 1)).slice(-2)));

    var body = document.createElement('span');
    body.className = 'film__body';

    if (video.presenter) body.appendChild(span('film__lab', video.presenter));
    body.appendChild(span('film__title', video.title));
    if (video.summary) body.appendChild(span('film__summary', video.summary));

    if (file) {
      body.appendChild(span('film__play', '再生'));
      panel.addEventListener('click', function () {
        openModal(video.title, file, panel);
      });
    } else {
      /* 動画ファイル未配置（ダミーのまま）でも見た目が壊れないようにしておく */
      body.appendChild(span('film__missing', '動画ファイル未配置'));
      panel.disabled = true;
    }

    panel.appendChild(body);
    return panel;
  }

  var originals = videos.map(function (video, i) {
    return trackEl.appendChild(makePanel(video, i, false));
  });

  /* ---------------- 横送り（ボタン・矢印キー） ---------------- */

  var reduceMotion = window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function step() {
    var first = trackEl.querySelector('.film');
    if (!first) return trackEl.clientWidth;
    var gap = parseFloat(window.getComputedStyle(trackEl).columnGap) || 0;
    return first.getBoundingClientRect().width + gap;
  }

  function scrollBySteps(dir) {
    var left = dir * step();
    if (loop) {
      /* 流れの途中で止まった半端な位置からでも、コマの頭に揃えて送る。
         連打したときは、動いている途中の位置ではなく前回の行き先から数える */
      nudge();
      var from = trackEl.scrollLeft;
      var base = navTarget !== null && Date.now() < navUntil ? navTarget : from;
      navTarget = GEOM.stripStepTarget(base, loop.home, step(), dir);
      navUntil = Date.now() + 600;
      left = navTarget - from;
    }
    if (trackEl.scrollBy) {
      trackEl.scrollBy({ left: left, behavior: reduceMotion ? 'auto' : 'smooth' });
    } else {
      trackEl.scrollLeft += left;
    }
    /* scroll イベントは描画フレームに紐づいていて、タブが非表示だと飛んでこない。
       ボタンの有効・無効がそこで止まると押せなくなるので setTimeout でも直す。 */
    setTimeout(updateNav, 60);
    setTimeout(updateNav, 500);
  }

  function updateNav() {
    var overflow = trackEl.scrollWidth - trackEl.clientWidth;
    var scrollable = overflow > 4;

    navEl.hidden = !scrollable;
    hintEl.hidden = !scrollable;
    if (!scrollable) return;

    /* 循環中は端が無いので、どちらへも送れる */
    prevBtn.disabled = !loop && trackEl.scrollLeft <= 2;
    nextBtn.disabled = !loop && trackEl.scrollLeft >= overflow - 2;
  }

  prevBtn.addEventListener('click', function () { scrollBySteps(-1); });
  nextBtn.addEventListener('click', function () { scrollBySteps(1); });
  trackEl.addEventListener('scroll', updateNav);

  /* コマにフォーカスがある状態での左右キー。イベントはトラックまで上がってくる */
  trackEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); scrollBySteps(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); scrollBySteps(-1); }
  });

  /* ---------------- 循環（右から左へ流す） ----------------
     元の並びの前後に複製を足し、基準の 1 周（home 〜 home + setW）の中を流す。
     端に来たら 1 周ぶん戻すが、周回ごとに同じ並びなので見た目は途切れない。 */

  var FLOW_PX_PER_SEC = 40;   // 流れる速さの既定（1 コマ約 336px が 8 秒ほど）。設定画面で変わる
  var RESUME_MS = 4000;       // 手で動かしたあと、流れを再開するまで
  var SETTLE_MS = 150;        // 最後の scroll からこれだけ空いたら、止まったとみなす

  var loop = null;            // 循環中だけ { home: 基準の 1 周の先頭, setW: 1 周の幅 }
  var copies = { before: 0, after: 0 };
  var pos = 0;                // 流れの位置。scrollLeft は丸められることがあるので小数は自前で持つ
  var raf = 0;
  var lastT = 0;
  var holds = {};             // 流れを止めている理由（hover / focus / user / modal）
  var resumeTimer = 0;
  var settleTimer = 0;
  var navTarget = null;       // 送りボタンの前回の行き先（連打の積み上げ用）
  var navUntil = 0;

  function addSet(ref) {      // ref の手前に 1 周ぶんの複製を入れる（null なら末尾）
    videos.forEach(function (video, i) {
      trackEl.insertBefore(makePanel(video, i, true), ref);
    });
  }

  function setClones(before, after) {
    if (before === copies.before && after === copies.after) return;
    Array.prototype.slice.call(trackEl.querySelectorAll('.film--clone')).forEach(function (el) {
      trackEl.removeChild(el);
    });
    for (var b = 0; b < before; b++) addSet(originals[0]);
    for (var a = 0; a < after; a++) addSet(null);
    copies = { before: before, after: after };
  }

  /* コマ幅は画面幅で変わるので、読み込み時とリサイズのたびに測り直す */
  function layout() {
    var cs = window.getComputedStyle(trackEl);
    var gap = parseFloat(cs.columnGap) || 0;
    var padL = parseFloat(cs.paddingLeft) || 0;
    var padR = parseFloat(cs.paddingRight) || 0;
    var setW = (originals[0].getBoundingClientRect().width + gap) * videos.length;
    var plan = GEOM.stripCopies(trackEl.clientWidth, setW, padL + padR, gap);

    /* 組み直しても同じコマから続けられるよう、1 周の中での割合を覚えておく */
    var frac = loop ?
      (GEOM.wrapStrip(trackEl.scrollLeft, loop.home, loop.setW) - loop.home) / loop.setW : 0;

    setClones(plan ? plan.before : 0, plan ? plan.after : 0);
    trackEl.classList.toggle('is-loop', !!plan);
    if (!plan) {              /* 画面に収まっている。流さずに並べるだけ */
      loop = null;
      halt();
      return;
    }

    var origin = trackEl.getBoundingClientRect().left - trackEl.scrollLeft;
    var first = originals[0].getBoundingClientRect().left - origin;
    var next = trackEl.children[(plan.before + 1) * videos.length].getBoundingClientRect().left - origin;
    loop = { home: first - padL, setW: next - first };
    pos = loop.home + frac * loop.setW;
    trackEl.scrollLeft = pos;
    flow();
  }

  /** 1 秒あたりに流す px。設定画面の「カードの流れる速さ」。0 は止める（循環と手での操作は残る） */
  function flowSpeed() {
    var v = SETTINGS ? parseFloat(SETTINGS.get('flow')) : NaN;
    return isFinite(v) ? v : FLOW_PX_PER_SEC;
  }

  function canFlow() {
    if (!loop || reduceMotion || !(flowSpeed() > 0)) return false;
    for (var k in holds) if (holds[k]) return false;
    return true;
  }

  /* 見た目だけの動き。止めている間は rAF を再スケジュールしない（低スペック PC 向け）。
     タブが非表示だと rAF は来ないが、そのあいだ流れが止まるだけで進行には関わらない */
  function frame(t) {
    raf = 0;
    if (!canFlow()) return;
    var dt = lastT ? Math.min(t - lastT, 100) : 0;   /* タブ復帰直後の大きな飛びは捨てる */
    lastT = t;
    pos = GEOM.wrapStrip(pos + flowSpeed() * dt / 1000, loop.home, loop.setW);
    trackEl.scrollLeft = pos;
    raf = requestAnimationFrame(frame);
  }

  function flow() {
    if (raf || !canFlow()) return;
    pos = trackEl.scrollLeft;   /* 手で送った位置から続ける */
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }

  function halt() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function hold(reason, on) {
    holds[reason] = on;
    if (on) halt();
    else flow();
  }

  /* 人が動かした。しばらく待ってから流れを戻す。
     再開の合図は setTimeout で出す（scroll イベントや rAF を待つと、タブが隠れている間は届かない） */
  function nudge() {
    hold('user', true);
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () { hold('user', false); }, RESUME_MS);
  }

  /* 設定画面で速さが変わったら、その場で効かせる（開いたまま流れを見て選べる） */
  if (SETTINGS) {
    SETTINGS.onChange(function (key) {
      if (key !== 'flow') return;
      if (flowSpeed() > 0) flow();
      else halt();
    });
  }

  /* 止まったら基準の 1 周へ戻しておく（見た目は変わらない）。
     動いている最中に書き換えると指やトラックパッドの慣性が切れるので、止まるのを待つ */
  function settle() {
    if (!loop) return;
    var cur = trackEl.scrollLeft;
    pos = GEOM.wrapStrip(cur, loop.home, loop.setW);
    navTarget = null;
    if (Math.abs(pos - cur) > 1) trackEl.scrollLeft = pos;
  }

  trackEl.addEventListener('scroll', function () {
    if (!loop) return;
    /* 流れが書いた位置からずれている＝人が動かした（指・トラックパッド・スクロールバー・Tab） */
    if (Math.abs(trackEl.scrollLeft - pos) > 2) nudge();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, SETTLE_MS);
  });

  /* マウスが乗っている間は止める（動いているコマは押しにくい）。
     タッチの pointerleave は指を離したときにしか来ないので、マウスだけを見る */
  trackEl.addEventListener('pointerenter', function (e) {
    if (e.pointerType === 'mouse') hold('hover', true);
  });
  trackEl.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') hold('hover', false);
  });

  /* 触れた時点で止める。scroll を待つと、動き出すまで流れと指が位置を取り合う */
  trackEl.addEventListener('pointerdown', nudge);

  /* キーボードでコマを選んでいる間も止める（選んだコマが流れて見えなくならないように）。
     マウスで押したときのフォーカスでは止めない。押したあと止まったままになるため */
  function focusVisible(el) {
    try { return el.matches(':focus-visible'); } catch (err) { return true; }
  }
  trackEl.addEventListener('focusin', function (e) {
    hold('focus', focusVisible(e.target));
  });
  trackEl.addEventListener('focusout', function (e) {
    if (!trackEl.contains(e.relatedTarget)) hold('focus', false);
  });

  window.addEventListener('resize', function () {
    if (videos.length) layout();
    updateNav();
  });

  if (videos.length) layout();
  updateNav();

  /* ---------------- 他カテゴリへのリンク ---------------- */

  function renderOthers(currentId) {
    DATA.categories.forEach(function (c) {
      if (currentId && c.id === currentId) return;
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'cat-footer__link';
      a.href = 'category.html?cat=' + encodeURIComponent(c.id);
      a.textContent = c.label;
      a.style.setProperty('--cat-accent', c.accent);
      li.appendChild(a);
      othersEl.appendChild(li);
    });
  }
  renderOthers(category.id);

  /* ---------------- モーダル ---------------- */

  /* 設定画面の「動画の音」「音量」。トップの自動再生と同じ設定を使う */
  function applyAudio(v) {
    if (!SETTINGS) return;
    v.muted = SETTINGS.get('sound') === 'off';
    v.volume = parseFloat(SETTINGS.get('volume')) || 1;
  }
  if (SETTINGS) {
    SETTINGS.onChange(function (key) {
      if (key === 'sound' || key === 'volume') applyAudio(modalPlayer);
    });
  }

  function openModal(title, file, trigger) {
    hold('modal', true);   /* 見ている間は後ろで流さない */
    lastFocused = trigger || document.activeElement;
    modalTitle.textContent = title;
    modalPlayer.src = file;
    modalOpen.href = file;
    applyAudio(modalPlayer);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modalPlayer.play().catch(function () {});
    modalClose.focus();
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    modalPlayer.pause();
    modalPlayer.removeAttribute('src');
    modalPlayer.load();   /* src を外しても再生位置と読み込みが残るので明示的に破棄する */
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    hold('modal', false);
  }

  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute('data-close')) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
})();
