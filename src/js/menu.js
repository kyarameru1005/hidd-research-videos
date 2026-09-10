/**
 * HIDD — 左上のメニュー（カテゴリへの導線）
 *
 * 球体の下に並べていたカテゴリの一覧を、左上のボタンから開くメニューに移した。
 * 項目は data.js の categories から作る（ここに文言を書かない）。
 *
 * 無人展示（docs/operations.md）を主眼に置いているので、以下を守っている。
 *   - 開いているあいだは「操作中」として自動再生を止める（stars.js の armIdle が見る）
 *   - ただし開いたまま放置されても展示が止まらないよう、
 *     MENU_IDLE_MS のあいだ何も触られなければ自分で閉じて計測を再開させる
 *   - 開閉は class の付け外しだけで、rAF にも hidden 属性のタイマーにも紐づけない
 *     （タブ非表示だと止まる・遅れる。docs/decisions.md 参照）
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;
  var head = document.getElementById('siteHead');
  var btn = document.getElementById('menuBtn');
  var panel = document.getElementById('menuPanel');
  var list = document.getElementById('menuList');
  if (!DATA || !head || !btn || !panel || !list) return;

  var MENU_IDLE_MS = 20000;      /* 開いたまま触られなくなってから閉じるまで */

  var open = false;
  var autoClose = null;

  /* ---------------- 項目 ---------------- */

  DATA.categories.forEach(function (cat) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.className = 'menu-panel__link';
    a.href = 'category.html?cat=' + encodeURIComponent(cat.id);
    a.style.setProperty('--cat-accent', cat.accent);

    var dot = document.createElement('span');
    dot.className = 'menu-panel__dot';
    dot.setAttribute('aria-hidden', 'true');
    a.appendChild(dot);
    a.appendChild(document.createTextNode(cat.label));

    li.appendChild(a);
    list.appendChild(li);
  });

  /* ---------------- 開閉 ---------------- */

  /** 球体側（stars.js）に操作があったことを伝える。WebGL 非対応時は無い */
  function noteActivity() {
    var sphere = window.HIDDSphere;
    if (sphere && sphere.noteActivity) sphere.noteActivity();
  }

  /** 開いたまま放置されたときの後始末。触られるたびに測り直す */
  function armAutoClose() {
    if (autoClose) { clearTimeout(autoClose); autoClose = null; }
    if (!open) return;
    autoClose = setTimeout(function () {
      autoClose = null;
      setOpen(false);
    }, MENU_IDLE_MS);
  }

  function setOpen(next) {
    if (open === next) return;
    open = next;
    panel.classList.toggle('is-open', open);
    btn.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'カテゴリメニューを閉じる' : 'カテゴリメニューを開く');
    armAutoClose();
    noteActivity();    /* 開閉そのものが操作。無操作の計測をやり直す */
  }

  btn.addEventListener('click', function () { setOpen(!open); });

  /* メニューの中を触っているあいだは閉じない */
  head.addEventListener('pointerdown', armAutoClose);
  head.addEventListener('pointermove', armAutoClose);
  head.addEventListener('keydown', armAutoClose);

  /* 外側を押したら閉じる。球体の操作を邪魔しないよう、閉じるだけで何も飲み込まない */
  document.addEventListener('pointerdown', function (e) {
    if (!open || head.contains(e.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !open) return;
    setOpen(false);
    btn.focus();
  });

  /* stars.js が「操作中かどうか」を見る */
  window.HIDDMenu = {
    isOpen: function () { return open; },
    close: function () { setOpen(false); }
  };
})();
