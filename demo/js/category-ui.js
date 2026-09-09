/**
 * HIDD — 動画一覧ページ UI 比較デモ
 *
 * 6 案とも js/data.js の実データを描画する。
 * 案ごとに DOM 構造ごと変えているので、CSS の当て方も .ui1 〜 .ui6 で完全に分離している。
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;
  var root = document.getElementById('demoRoot');
  var segCat = document.getElementById('segCat');
  var jumpNav = document.getElementById('jumpNav');

  var current = DATA.categories[0];

  /* ---------------- 小物 ---------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* ---------------- 案 1: エディトリアル（雑誌の目次） ---------------- */

  function ui1(cat) {
    var s = el('div', 'ui1');
    var inner = el('div', 'ui1__inner');

    var head = el('div', 'ui1__masthead');
    var left = el('div');
    left.appendChild(el('p', 'ui1__kicker', 'HIDD RESEARCH ARCHIVE'));
    left.appendChild(el('h2', 'ui1__title', cat.label));
    head.appendChild(left);
    head.appendChild(el('span', 'ui1__count', cat.videos.length + ' 本の紹介動画'));
    inner.appendChild(head);

    var list = el('ol', 'ui1__list');
    cat.videos.forEach(function (v, i) {
      var li = el('li', 'ui1__item');
      li.appendChild(el('div', 'ui1__no', pad(i + 1)));

      var body = el('div');
      body.appendChild(el('span', 'ui1__lab', v.presenter || ''));
      body.appendChild(el('h3', 'ui1__t', v.title));
      if (v.summary) body.appendChild(el('p', 'ui1__s', v.summary));
      body.appendChild(el('span', 'ui1__go', '動画を見る'));
      li.appendChild(body);
      list.appendChild(li);
    });
    inner.appendChild(list);
    s.appendChild(inner);
    return s;
  }

  /* ---------------- 案 2: インデックス（目次・表） ---------------- */

  function ui2(cat) {
    var s = el('div', 'ui2');
    var inner = el('div', 'ui2__inner');

    var head = el('div', 'ui2__head');
    head.appendChild(el('h2', 'ui2__title', cat.label));
    head.appendChild(el('span', 'ui2__meta', cat.videos.length + ' ENTRIES'));
    inner.appendChild(head);

    var cols = el('div', 'ui2__cols');
    ['NO.', 'TITLE', 'LAB', ''].forEach(function (t) { cols.appendChild(el('span', null, t)); });
    inner.appendChild(cols);

    var list = el('ul', 'ui2__list');
    cat.videos.forEach(function (v, i) {
      var li = el('li', 'ui2__row');
      li.appendChild(el('span', 'ui2__no', pad(i + 1)));

      var main = el('div', 'ui2__main');
      main.appendChild(el('h3', 'ui2__t', v.title));
      if (v.summary) main.appendChild(el('p', 'ui2__s', v.summary));
      li.appendChild(main);

      li.appendChild(el('span', 'ui2__lab', v.presenter || ''));
      li.appendChild(el('span', 'ui2__play', '再生 →'));
      list.appendChild(li);
    });
    inner.appendChild(list);
    s.appendChild(inner);
    return s;
  }

  /* ---------------- 案 3: ターミナル / アーカイブ ---------------- */

  function ui3(cat) {
    var s = el('div', 'ui3');
    var inner = el('div', 'ui3__inner');

    var prompt = el('p', 'ui3__prompt');
    prompt.appendChild(el('span', null, 'hidd@archive:~$ '));
    prompt.appendChild(document.createTextNode('ls ./' + cat.id + '/'));
    prompt.appendChild(el('span', 'ui3__cursor'));
    inner.appendChild(prompt);

    inner.appendChild(el('p', 'ui3__stat',
      '# ' + cat.label + ' — ' + cat.videos.length + ' items'));

    var list = el('ul', 'ui3__list');
    cat.videos.forEach(function (v, i) {
      var li = el('li', 'ui3__row');
      li.appendChild(el('span', 'ui3__no', '[' + pad(i + 1) + ']'));

      var body = el('div');
      body.appendChild(el('h3', 'ui3__t', v.title));
      var sub = el('p', 'ui3__sub');
      var b = el('b', null, v.presenter || '');
      sub.appendChild(b);
      if (v.summary) sub.appendChild(document.createTextNode('  ·  ' + v.summary));
      body.appendChild(sub);
      li.appendChild(body);
      list.appendChild(li);
    });
    inner.appendChild(list);
    s.appendChild(inner);
    return s;
  }

  /* ---------------- 案 4: スイス / ブルータリズム ---------------- */

  function ui4(cat) {
    var s = el('div', 'ui4');
    var inner = el('div', 'ui4__inner');

    var head = el('div', 'ui4__head');
    head.appendChild(el('div', 'ui4__badge', 'CATEGORY ' + ('0' + DATA.indexOf(cat)).slice(-2)));
    head.appendChild(el('h2', 'ui4__title', cat.label));
    head.appendChild(el('div', 'ui4__count', pad(cat.videos.length)));
    inner.appendChild(head);

    var grid = el('div', 'ui4__grid');
    cat.videos.forEach(function (v, i) {
      var cell = el('div', 'ui4__cell');
      cell.appendChild(el('span', 'ui4__no', pad(i + 1)));
      cell.appendChild(el('span', 'ui4__lab', (v.presenter || '').toUpperCase()));
      cell.appendChild(el('h3', 'ui4__t', v.title));
      if (v.summary) cell.appendChild(el('p', 'ui4__s', v.summary));
      cell.appendChild(el('span', 'ui4__go', '▶ 動画を見る'));
      grid.appendChild(cell);
    });
    /* 奇数個のときに枠が欠けないよう空セルで埋める */
    if (cat.videos.length % 2 === 1) grid.appendChild(el('div', 'ui4__cell'));
    inner.appendChild(grid);
    s.appendChild(inner);
    return s;
  }

  /* ---------------- 案 5: フィルムストリップ（横スクロール） ---------------- */

  function ui5(cat) {
    var s = el('div', 'ui5');

    var head = el('div', 'ui5__head');
    head.appendChild(el('h2', 'ui5__title', cat.label));
    head.appendChild(el('span', 'ui5__hint', '横にスクロールして選ぶ →'));
    s.appendChild(head);

    var track = el('div', 'ui5__track');
    cat.videos.forEach(function (v, i) {
      var p = el('div', 'ui5__panel');
      p.appendChild(el('span', 'ui5__no', pad(i + 1)));

      var body = el('div', 'ui5__body');
      body.appendChild(el('span', 'ui5__lab', v.presenter || ''));
      body.appendChild(el('h3', 'ui5__t', v.title));
      if (v.summary) body.appendChild(el('p', 'ui5__s', v.summary));
      body.appendChild(el('span', 'ui5__play', '再生'));
      p.appendChild(body);
      track.appendChild(p);
    });
    s.appendChild(track);
    return s;
  }

  /* ---------------- 案 6: ポスター / タイポグラフィ ---------------- */

  function ui6(cat) {
    var s = el('div', 'ui6');
    var inner = el('div', 'ui6__inner');

    var head = el('div', 'ui6__head');
    head.appendChild(el('h2', 'ui6__title', cat.label));
    inner.appendChild(head);

    var list = el('ul', 'ui6__list');
    cat.videos.forEach(function (v, i) {
      var li = el('li', 'ui6__item');
      li.appendChild(el('span', 'ui6__ghost', pad(i + 1)));

      var body = el('div', 'ui6__body');
      body.appendChild(el('span', 'ui6__lab', v.presenter || ''));
      body.appendChild(el('h3', 'ui6__t', v.title));
      if (v.summary) body.appendChild(el('p', 'ui6__s', v.summary));
      body.appendChild(el('span', 'ui6__go', '動画を見る →'));
      li.appendChild(body);
      list.appendChild(li);
    });
    inner.appendChild(list);
    s.appendChild(inner);
    return s;
  }

  /* ---------------- 旧実装（参考） ---------------- */

  function uiCurrent(cat) {
    var s = el('div', 'uid-current');
    var grid = el('ul', 'video-grid');
    cat.videos.forEach(function (v) {
      var li = el('li');
      var card = el('div', 'video-card');
      if (v.presenter) card.appendChild(el('span', 'video-card__presenter', v.presenter));
      card.appendChild(el('h3', 'video-card__title', v.title));
      if (v.summary) card.appendChild(el('p', 'video-card__summary', v.summary));
      card.appendChild(el('span', 'video-card__cta', '動画を見る'));
      li.appendChild(card);
      grid.appendChild(li);
    });
    s.appendChild(grid);
    return s;
  }

  /* ---------------- 案の定義 ---------------- */

  var CASES = [
    { id: 'cur', num: '旧', name: '以前の実装（参考）',
      desc: '暗い角丸カードのグリッド。情報は読めるが、どのサイトでも見る型で個性が出にくい。比較用に残してある。',
      build: uiCurrent },
    { id: 'ui1', num: '案 1', name: 'エディトリアル（雑誌の目次）',
      desc: '明るい紙色に明朝体。カードをやめて罫線だけで区切る。研究紹介という中身に一番似合う落ち着いた方向。',
      build: ui1 },
    { id: 'ui2', num: '案 2', name: 'インデックス（一覧表）',
      desc: '図書目録のような行リスト。1 画面に収まる情報量が最大で、本数が増えても破綻しない。',
      build: ui2 },
    { id: 'ui3', num: '案 3', name: 'ターミナル / アーカイブ',
      desc: '等幅フォントの端末風。情報系学科らしさが一番強く出るが、好みが分かれる。',
      build: ui3 },
    { id: 'ui4', num: '案 4', name: 'スイス / ブルータリズム',
      desc: '太い黒罫と角ゼロ、極太の見出し。明るくて力強い。学内掲示やポスターに近い印象。',
      build: ui4 },
    { id: 'ui5', num: '案 5', name: 'フィルムストリップ（横スクロール）★採用',
      desc: '大きな縦長パネルを横に送る。動画らしさは一番出るが、一覧性は下がる。本番の category.html はこれ。',
      build: ui5 },
    { id: 'ui6', num: '案 6', name: 'ポスター / タイポグラフィ',
      desc: 'タイトルそのものを主役にし、連番を大きく背景に敷く。球体のトップページと最も雰囲気が揃う。',
      build: ui6 }
  ];

  /* ---------------- 組み立て ---------------- */

  function render() {
    root.innerHTML = '';
    document.documentElement.style.setProperty('--accent', current.accent);

    CASES.forEach(function (c) {
      var sec = el('section', 'uid-case');
      sec.id = c.id;

      var bar = el('div', 'uid-case__bar');
      bar.appendChild(el('span', 'uid-case__num', c.num));
      bar.appendChild(el('h2', 'uid-case__name', c.name));
      bar.appendChild(el('p', 'uid-case__desc', c.desc));
      sec.appendChild(bar);

      var frame = el('div', 'uid-frame');
      frame.appendChild(c.build(current));
      sec.appendChild(frame);

      root.appendChild(sec);
    });
  }

  function buildControls() {
    DATA.categories.forEach(function (cat) {
      var b = el('button', null, cat.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(cat === current));
      b.addEventListener('click', function () {
        current = cat;
        segCat.querySelectorAll('button').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        render();
      });
      segCat.appendChild(b);
    });

    CASES.forEach(function (c, i) {
      var a = el('a', null, i === 0 ? '現' : String(i));
      a.href = '#' + c.id;
      a.title = c.name;
      jumpNav.appendChild(a);
    });
  }

  buildControls();
  render();
})();
