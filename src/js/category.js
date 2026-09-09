/**
 * HIDD — カテゴリページの描画
 *
 * ?cat=<id> を読んで data.js から該当カテゴリを引き、
 * 動画を横スクロールのフィルムストリップとして並べる。
 * コマを押すとモーダル内の iframe で Google ドライブの動画を再生する。
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;

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
  var modalFrame = document.getElementById('modalFrame');
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

  videos.forEach(function (video, i) {
    var previewUrl = DATA.videoUrl(video, 'preview');
    var viewUrl    = DATA.videoUrl(video, 'view');

    /* button の中に見出しは置けないので、コマ全体を 1 つのボタンとして読ませる */
    var panel = document.createElement('button');
    panel.type = 'button';
    panel.className = 'film';

    panel.appendChild(span('film__no', ('0' + (i + 1)).slice(-2)));

    var body = document.createElement('span');
    body.className = 'film__body';

    if (video.presenter) body.appendChild(span('film__lab', video.presenter));
    body.appendChild(span('film__title', video.title));
    if (video.summary) body.appendChild(span('film__summary', video.summary));

    if (previewUrl) {
      body.appendChild(span('film__play', '再生'));
      panel.addEventListener('click', function () {
        openModal(video.title, previewUrl, viewUrl, panel);
      });
    } else {
      /* URL 未設定（ダミーのまま）でも見た目が壊れないようにしておく */
      body.appendChild(span('film__missing', '動画リンク未設定'));
      panel.disabled = true;
    }

    panel.appendChild(body);
    trackEl.appendChild(panel);
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

    prevBtn.disabled = trackEl.scrollLeft <= 2;
    nextBtn.disabled = trackEl.scrollLeft >= overflow - 2;
  }

  prevBtn.addEventListener('click', function () { scrollBySteps(-1); });
  nextBtn.addEventListener('click', function () { scrollBySteps(1); });
  trackEl.addEventListener('scroll', updateNav);
  window.addEventListener('resize', updateNav);

  /* コマにフォーカスがある状態での左右キー。イベントはトラックまで上がってくる */
  trackEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); scrollBySteps(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); scrollBySteps(-1); }
  });

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

  function openModal(title, previewUrl, viewUrl, trigger) {
    lastFocused = trigger || document.activeElement;
    modalTitle.textContent = title;
    modalFrame.src = previewUrl;
    modalOpen.href = viewUrl || previewUrl;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modalClose.focus();
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    modalFrame.src = 'about:blank';   /* 再生を確実に止める */
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute('data-close')) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
})();
