/**
 * HIDD — 設定画面（Ctrl + Shift + S で開く）
 *
 * 展示の見た目を崩さないよう、画面には開くボタンを置かない。
 * 操作する人がキーボードで開き、選んだ値はこのブラウザ（localStorage）に保存する。
 * トップ（index.html）とカテゴリページ（category.html）のどちらでも開ける。
 *
 * 項目は分類（GROUPS。パネルではタブになる）ごとに ITEMS へ並べる。
 * 増やすときは ITEMS に 1 つ足し、使う側で HIDDSettings.get(key) を読む
 * （変わったら onChange で知らせる）。パネルの中身は GROUPS と ITEMS から作るので、HTML は触らない。
 * 背景（bg）だけは例外で、両方のページに同じように効くので、ここで <html> に data-bg を付ける（applyBackground）。
 *
 *   - 開いているあいだは「操作中」として自動再生を止める（stars.js の armIdle が見る）
 *   - 開いたまま放置されたら PANEL_IDLE_MS で自分で閉じ、展示に戻す
 *   - 開閉もタブの切り替えも class の付け外しだけで、rAF にも hidden 属性にも紐づけない
 *     （タブ非表示だと止まる・遅れる。docs/decisions.md 参照）
 *
 * 値の扱い（get / set / normalize / run）は DOM に触れないので、test/settings.test.js から検証できる。
 */
window.HIDDSettings = (function () {
  'use strict';

  var STORE = 'hidd.settings';
  var POS_PREFIX = 'hidd.pos.';  /* 動画ごとの再生位置の保存キー。stars.js の STORE と同じ値にすること */
  var PANEL_IDLE_MS = 60000;     /* 開いたまま触られなくなってから閉じるまで */

  /* 分類（タブ）。page を書いたものは、そのページ（body の class）で開いたときに最初に出す */
  var GROUPS = [
    { key: 'playback', label: '自動再生' },
    { key: 'audio',    label: '音' },
    { key: 'sphere',   label: '球体' },
    { key: 'backdrop', label: '背景' },
    { key: 'cards',    label: 'カード一覧', page: 'page-category' },
    { key: 'reset',    label: 'リセット' }
  ];

  /* 値は文字列で持つ。def が既定値で、今までの動きと同じ値にしてある
     （コード側に書いた既定値と一致することを test/settings.test.js が検査している）。
     type: 'action' は値を持たず、押すとすぐ run を実行する項目 */
  var ITEMS = [
    /* ---- 自動再生（トップ） ---- */
    {
      group: 'playback', key: 'auto', label: '放置したときの自動再生',
      note: 'しない にすると、放置しても球体は回らず、動画も流れません。説明や発表で人が操作するとき向け。',
      def: 'on', options: [['on', 'する'], ['off', 'しない']]
    },
    {
      group: 'playback', key: 'idle', label: '放置してから球体が回り出すまで',
      def: '5000', options: [['5000', '5 秒'], ['10000', '10 秒'], ['30000', '30 秒']]
    },
    {
      group: 'playback', key: 'delay', label: '回り出してから動画を再生するまで',
      def: '5000', options: [['3000', '3 秒'], ['5000', '5 秒'], ['10000', '10 秒']]
    },
    {
      group: 'playback', key: 'limit', label: '1 本あたりの再生時間',
      note: '自動再生のときだけ区切ります。途中で次へ送った動画は、次に回ってきたときに続きから流します。',
      def: '0', options: [['0', '最後まで'], ['30', '30 秒'], ['60', '1 分'], ['180', '3 分']]
    },

    /* ---- 音（両方のページ） ---- */
    {
      group: 'audio', key: 'sound', label: '動画の音',
      note: 'なし にすると、どのページの動画も無音で流します。',
      def: 'on', options: [['on', 'あり'], ['off', 'なし']]
    },
    {
      group: 'audio', key: 'volume', label: '音量',
      def: '1', options: [['0.3', '30%'], ['0.6', '60%'], ['1', '100%']]
    },

    /* ---- 球体（トップ） ---- */
    {
      group: 'sphere', key: 'inertia', label: '慣性',
      note: '手を離したあと、どれだけ回り続けるか。',
      /* 1 秒あたりに残る速さの割合。demo/inertia.html で比べた 3 段階 */
      def: '0.84', options: [['0.06', '弱い'], ['0.68', 'ふつう'], ['0.84', '強い']]
    },
    {
      group: 'sphere', key: 'zoom', label: '大きさ',
      note: '巡回に戻るときも、この大きさに戻ります。',
      /* カメラの距離。小さいほど球が大きく見える。2.61 より近いと球が画面の上下からはみ出す */
      def: '3.6', options: [['4.4', '小さめ'], ['3.6', 'ふつう'], ['3.1', '大きめ']]
    },
    {
      group: 'sphere', key: 'lines', label: '星座線',
      def: 'on', options: [['on', 'あり'], ['off', 'なし']]
    },
    {
      group: 'sphere', key: 'twinkle', label: '星のまたたき',
      note: 'なし にすると常に動いているアニメーションが止まり、低スペック PC で少し軽くなります。',
      def: 'on', options: [['on', 'あり'], ['off', 'なし']]
    },
    {
      group: 'sphere', key: 'hint', label: '画面下の操作ヒント',
      def: 'on', options: [['on', '表示'], ['off', '隠す']]
    },

    /* ---- 背景（両方のページ） ---- */
    {
      group: 'backdrop', key: 'bg', label: '背景', swatch: true,
      note: '白い文字や星が読めるよう、どれも暗めの色にしてあります。カテゴリページにも同じ背景が付きます。',
      /* 塗りは common.css の「背景」の節。値がそのまま <html> の data-bg になる（applyBackground）。
         選択肢を足すときは、common.css にも同じ値の [data-bg] を足す（test/settings.test.js が検査している） */
      def: 'default', options: [
        ['default', '既定'], ['starry', '星空'], ['aurora', 'オーロラ'], ['nebula', '星雲'],
        ['dusk', '夕焼け'], ['ocean', '深海'], ['grid', 'グリッド']
      ]
    },

    /* ---- カード一覧（カテゴリページ） ---- */
    {
      group: 'cards', key: 'flow', label: 'カードの流れる速さ',
      note: '止める にしても、手での横スクロールと循環はそのまま使えます。',
      /* 1 秒あたりに流れる px */
      def: '40', options: [['0', '止める'], ['20', '遅い'], ['40', 'ふつう'], ['70', '速い']]
    },

    /* ---- リセット（押すとすぐ実行する） ---- */
    {
      group: 'reset', key: 'resetPos', type: 'action', label: '動画の続きの位置',
      button: '消して、最初から流す',
      note: '途中まで流した動画の続きの位置を消します。展示を始めるときに。',
      run: clearPositions,
      done: function (n) { return n ? n + ' 本ぶんの続きの位置を消しました。' : '消す位置はありませんでした。'; }
    },
    {
      group: 'reset', key: 'resetAll', type: 'action', label: 'すべての設定',
      button: '既定に戻す',
      note: 'このパネルの項目を、最初の値に戻します。',
      run: resetAll,
      done: function (n) { return n ? n + ' 項目を既定に戻しました。' : 'すでに既定の値です。'; }
    }
  ];

  function isAction(item) { return item.type === 'action'; }

  function find(key) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].key === key) return ITEMS[i];
    return null;
  }

  function allowed(item, value) {
    return !isAction(item) && item.options.some(function (o) { return o[0] === value; });
  }

  /** 保存されていた値を今の選択肢に揃える。選択肢に無い値（古い版の値・壊れた値）は既定に戻す */
  function normalize(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var out = {};
    ITEMS.forEach(function (item) {
      if (isAction(item)) return;
      out[item.key] = allowed(item, src[item.key]) ? src[item.key] : item.def;
    });
    return out;
  }

  /* localStorage は使えないことがある（プライベートモード・容量超過・テスト環境）。
     読めなければ既定値、書けなければその場限りで動かす */
  function load() {
    try { return normalize(JSON.parse(window.localStorage.getItem(STORE))); }
    catch (e) { return normalize(null); }
  }

  function save() {
    try { window.localStorage.setItem(STORE, JSON.stringify(values)); } catch (e) {}
  }

  var values = load();
  var listeners = [];

  function notify(key, value) {
    listeners.forEach(function (fn) { fn(key, value); });
  }

  function get(key) { return values[key]; }

  /** 選択肢に無い値は受け付けない。変わったときだけ保存して知らせる */
  function set(key, value) {
    var item = find(key);
    if (!item || !allowed(item, value) || values[key] === value) return false;
    values[key] = value;
    save();
    notify(key, value);
    return true;
  }

  /** fn(key, value)。リセットの項目を実行したときは value が null で来る */
  function onChange(fn) { listeners.push(fn); }

  /** 動画ごとの再生位置（stars.js が保存している）を全部消す。消した数を返す */
  function clearPositions() {
    var n = 0;
    try {
      var ls = window.localStorage;
      for (var i = ls.length - 1; i >= 0; i--) {
        var k = ls.key(i);
        if (k && k.indexOf(POS_PREFIX) === 0) { ls.removeItem(k); n++; }
      }
    } catch (e) {}
    return n;
  }

  /** 値のある項目を全部既定に戻す。変わった数を返す */
  function resetAll() {
    var n = 0;
    ITEMS.forEach(function (item) {
      if (!isAction(item) && set(item.key, item.def)) n++;
    });
    return n;
  }

  /** リセットの項目を実行して使う側にも知らせ、結果の文を返す（値の項目なら null） */
  function run(key) {
    var item = find(key);
    if (!item || !isAction(item)) return null;
    var message = item.done(item.run());
    notify(key, null);
    return message;
  }

  /* ---------------- パネル ---------------- */

  var open = false;
  var panel = null;
  var tabs = [];              /* { key, tab, body }。GROUPS と同じ並び */
  var shown = null;           /* 表示中の分類 */
  var lastFocus = null;
  var idleClose = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  /** 選ばれている値のボタンに印を付ける */
  function reflect(key) {
    var seg = panel.querySelector('[data-key="' + key + '"]');
    if (!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll('.settings__opt'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-value') === values[key] ? 'true' : 'false');
    });
  }

  function choiceRow(item) {
    var row = el('div', 'settings__row');
    var label = el('p', 'settings__label', item.label);
    label.id = 'settings-' + item.key;
    row.appendChild(label);

    /* swatch の項目（背景）は、選択肢ごとに見本を付けて格子に並べる */
    var seg = el('div', item.swatch ? 'settings__seg settings__seg--swatch' : 'settings__seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-labelledby', label.id);
    seg.setAttribute('data-key', item.key);
    item.options.forEach(function (o) {
      var b = el('button', 'settings__opt', o[1]);
      b.type = 'button';
      b.setAttribute('data-value', o[0]);
      if (item.swatch) {
        /* 見本は実物と同じ data-bg で塗る（common.css の「背景」の節） */
        var sw = el('span', 'settings__swatch');
        sw.setAttribute('data-bg', o[0]);
        sw.setAttribute('aria-hidden', 'true');
        b.insertBefore(sw, b.firstChild);
      }
      b.addEventListener('click', function () { set(item.key, o[0]); });
      seg.appendChild(b);
    });
    row.appendChild(seg);

    if (item.note) row.appendChild(el('p', 'settings__note', item.note));
    return row;
  }

  function actionRow(item) {
    var row = el('div', 'settings__row');
    row.appendChild(el('p', 'settings__label', item.label));

    var btn = el('button', 'settings__action', item.button);
    btn.type = 'button';
    row.appendChild(btn);
    if (item.note) row.appendChild(el('p', 'settings__note', item.note));

    /* 押した結果。読み上げにも伝える */
    var done = el('p', 'settings__done');
    done.setAttribute('role', 'status');
    row.appendChild(done);

    btn.addEventListener('click', function () { done.textContent = run(item.key); });
    return row;
  }

  function showGroup(key) {
    shown = key;
    tabs.forEach(function (t) {
      var on = t.key === key;
      t.tab.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tab.tabIndex = on ? 0 : -1;
      t.body.classList.toggle('is-active', on);
    });
  }

  /** そのページ向けの分類があれば最初に出す（カテゴリページならカード一覧） */
  function firstGroup() {
    for (var i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].page && document.body.classList.contains(GROUPS[i].page)) return GROUPS[i].key;
    }
    return GROUPS[0].key;
  }

  function build() {
    panel = el('section', 'settings');
    panel.id = 'settings';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '設定');

    var head = el('div', 'settings__head');
    head.appendChild(el('h2', 'settings__title', '設定'));
    var close = el('button', 'settings__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '設定を閉じる');
    close.addEventListener('click', function () { setOpen(false, true); });
    head.appendChild(close);
    panel.appendChild(head);

    var list = el('div', 'settings__tabs');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', '設定の分類');
    panel.appendChild(list);

    GROUPS.forEach(function (g) {
      var tab = el('button', 'settings__tab', g.label);
      tab.type = 'button';
      tab.id = 'settings-tab-' + g.key;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'settings-group-' + g.key);
      tab.addEventListener('click', function () { showGroup(g.key); });
      list.appendChild(tab);

      var body = el('div', 'settings__group');
      body.id = 'settings-group-' + g.key;
      body.setAttribute('role', 'tabpanel');
      body.setAttribute('aria-labelledby', tab.id);
      ITEMS.forEach(function (item) {
        if (item.group === g.key) body.appendChild(isAction(item) ? actionRow(item) : choiceRow(item));
      });
      panel.appendChild(body);
      tabs.push({ key: g.key, tab: tab, body: body });
    });

    /* 左右キーで分類を移る（タブの一般的な操作） */
    list.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var i = 0;
      tabs.forEach(function (t, j) { if (t.key === shown) i = j; });
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      showGroup(next.key);
      next.tab.focus();
    });

    panel.appendChild(el('p', 'settings__foot',
      'Ctrl + Shift + S か Esc で閉じる ／ 選んだ値はこのブラウザに保存されます'));

    /* 再生カード（z-index 500）より上に出すため body 直下に置く。
       .stage の中に入れると、重なり順がそこで閉じて上に出せない */
    document.body.appendChild(panel);

    ITEMS.forEach(function (item) { if (!isAction(item)) reflect(item.key); });
    showGroup(firstGroup());
  }

  /** 開いたまま放置されたときの後始末。触られるたびに測り直す */
  function armIdleClose() {
    if (idleClose) { clearTimeout(idleClose); idleClose = null; }
    if (!open) return;
    idleClose = setTimeout(function () {
      idleClose = null;
      setOpen(false, false);
    }, PANEL_IDLE_MS);
  }

  /**
   * byUser が true なら人が開け閉めした＝操作なので、無操作の計測をやり直す。
   * 放置で自動的に閉じるときは計測の再開だけにする
   * （noteActivity は再生中の動画まで閉じてしまう。menu.js と同じ理由）。
   */
  function setOpen(next, byUser) {
    if (open === next) return;
    open = next;
    panel.classList.toggle('is-open', open);

    if (open) {
      lastFocus = document.activeElement;
      Array.prototype.forEach.call(panel.querySelectorAll('.settings__done'), function (d) {
        d.textContent = '';
      });
      tabs.forEach(function (t) { if (t.key === shown) t.tab.focus(); });
    } else if (panel.contains(document.activeElement)) {
      /* 見えなくなる要素にフォーカスを残さない。戻すときに画面を動かさない（カードの列が飛ぶ） */
      if (lastFocus && lastFocus !== document.body && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      else document.activeElement.blur();
    }

    armIdleClose();
    var sphere = window.HIDDSphere;
    if (byUser) { if (sphere && sphere.noteActivity) sphere.noteActivity(); }
    else if (sphere && sphere.armIdle) sphere.armIdle();
  }

  function isShortcut(e) {
    return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey &&
      (e.code === 'KeyS' || String(e.key).toLowerCase() === 's');
  }

  /** 背景は <html> に data-bg を付けるだけ。塗りは common.css の「背景」の節が決める */
  function applyBackground() {
    document.documentElement.setAttribute('data-bg', values.bg);
  }

  /* Node（test/）には document が無いので、値の扱いだけ使えるようにしておく */
  if (typeof document !== 'undefined' && document.body) {
    applyBackground();
    build();
    onChange(function (key) {
      reflect(key);
      if (key === 'bg') applyBackground();
    });

    document.addEventListener('keydown', function (e) {
      if (isShortcut(e)) {
        e.preventDefault();
        setOpen(!open, true);
      } else if (e.key === 'Escape' && open) {
        setOpen(false, true);
      }
    });

    /* 開いているあいだに触られたら放置の計測をやり直す（球体を回して慣性を試している間も含む） */
    document.addEventListener('pointerdown', armIdleClose);
    document.addEventListener('keydown', armIdleClose);
  }

  return {
    groups: GROUPS,
    items: ITEMS,
    get: get,
    set: set,
    run: run,
    onChange: onChange,
    normalize: normalize,
    isOpen: function () { return open; }
  };
})();
