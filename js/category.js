/**
 * HIDD — カテゴリページの描画
 *
 * ?cat=<id> を読んで data.js から該当カテゴリを引き、動画カードを並べる。
 * カードを押すとモーダル内の iframe で Google ドライブの動画を再生する。
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;

  var titleEl   = document.getElementById('catTitle');
  var eyebrowEl = document.getElementById('catEyebrow');
  var descEl    = document.getElementById('catDesc');
  var gridEl    = document.getElementById('videoGrid');
  var emptyEl   = document.getElementById('emptyNote');
  var othersEl  = document.getElementById('otherCats');

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

  /* ---------------- 動画カード ---------------- */

  var videos = category.videos || [];

  if (!videos.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = 'このカテゴリにはまだ動画が登録されていません。';
  }

  videos.forEach(function (video) {
    var previewUrl = DATA.videoUrl(video, 'preview');
    var viewUrl    = DATA.videoUrl(video, 'view');

    var li = document.createElement('li');
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'video-card';

    if (video.presenter) {
      var pres = document.createElement('span');
      pres.className = 'video-card__presenter';
      pres.textContent = video.presenter;
      card.appendChild(pres);
    }

    var h = document.createElement('h2');
    h.className = 'video-card__title';
    h.textContent = video.title;
    card.appendChild(h);

    if (video.summary) {
      var s = document.createElement('p');
      s.className = 'video-card__summary';
      s.textContent = video.summary;
      card.appendChild(s);
    }

    if (previewUrl) {
      var cta = document.createElement('span');
      cta.className = 'video-card__cta';
      cta.textContent = '動画を見る';
      card.appendChild(cta);

      card.addEventListener('click', function () {
        openModal(video.title, previewUrl, viewUrl, card);
      });
    } else {
      /* URL 未設定（ダミーのまま）でも見た目が壊れないようにしておく */
      var miss = document.createElement('span');
      miss.className = 'video-card__missing';
      miss.textContent = '動画リンク未設定';
      card.appendChild(miss);
      card.disabled = true;
    }

    li.appendChild(card);
    gridEl.appendChild(li);
  });

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
