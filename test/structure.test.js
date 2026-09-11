/**
 * 構成の決まりごとを守れているかの検査。
 *
 * CLAUDE.md に書いた制約を、人が気をつける代わりに機械で見る。
 * ここが落ちるときは、たいてい file:// で開けなくなっているか、
 * 過去に踏んだ不具合を踏み直している。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, repoPath, read, loadBrowserScripts } from './helpers.mjs';

function walk(dir, filter) {
  const out = [];
  for (const name of readdirSync(repoPath(dir))) {
    if (name === '.git' || name === 'node_modules') continue;
    const rel = path.join(dir, name);
    if (statSync(repoPath(rel)).isDirectory()) out.push(...walk(rel, filter));
    else if (filter(rel)) out.push(rel);
  }
  return out;
}

const HTML = walk('.', (f) => f.endsWith('.html')).map((f) => f.replace(/^\.\//, ''));
const CSS = walk('.', (f) => f.endsWith('.css')).map((f) => f.replace(/^\.\//, ''));
const JS = walk('.', (f) => f.endsWith('.js') && !f.includes('vendor') && !f.includes('/test/'))
  .map((f) => f.replace(/^\.\//, ''));

test('検査対象のファイルが見つかっている', () => {
  assert.ok(HTML.length >= 6, `HTML が少なすぎる: ${HTML.length}`);
  assert.ok(JS.length >= 8, `JS が少なすぎる: ${JS.length}`);
});

test('HTML が参照するファイルが全て存在する', () => {
  const missing = [];
  for (const html of HTML) {
    const dir = path.dirname(repoPath(html));
    for (const m of read(html).matchAll(/(?:src|href)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^(https?:)?\/\//.test(ref) || ref.startsWith('#') || ref.startsWith('data:')) continue;
      const target = path.join(dir, ref.split('?')[0]);
      if (!existsSync(target)) missing.push(`${html} -> ${ref}`);
    }
  }
  assert.deepEqual(missing, [], '参照切れ');
});

test('type="module" を使っていない（file:// で読めなくなる）', () => {
  for (const html of HTML) {
    assert.ok(!/type\s*=\s*["']module["']/.test(read(html)), `${html} に type="module"`);
  }
});

test('外部ホストを読み込んでいない（オフラインで壊れる）', () => {
  const bad = [];
  for (const f of [...HTML, ...CSS]) {
    for (const m of read(f).matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) bad.push(`${f} -> ${m[1]}`);
    for (const m of read(f).matchAll(/@import\s+(?:url\()?["']?(https?:\/\/[^"')]+)/g)) bad.push(`${f} -> ${m[1]}`);
  }
  assert.deepEqual(bad, [], '外部読み込み');
});

test('絶対パス参照を使っていない（サブディレクトリ配信で壊れる）', () => {
  for (const html of HTML) {
    for (const m of read(html).matchAll(/(?:src|href)="(\/[^\/][^"]*)"/g)) {
      assert.fail(`${html} に絶対パス: ${m[1]}`);
    }
  }
});

test('本番の JS で fetch / XMLHttpRequest を使っていない（file:// で失敗する）', () => {
  for (const f of JS.filter((x) => x.startsWith('src/'))) {
    const code = read(f);
    assert.ok(!/\bfetch\s*\(/.test(code), `${f} に fetch()`);
    assert.ok(!/XMLHttpRequest/.test(code), `${f} に XMLHttpRequest`);
  }
});

test('すべての JS が構文的に正しい', () => {
  for (const f of JS) {
    execFileSync(process.execPath, ['--check', repoPath(f)], { stdio: 'pipe' });
  }
});

test('Three.js は UMD 版が同梱されている（THREE をグローバルに置く）', () => {
  const head = read('src/vendor/three.min.js').slice(0, 400);
  assert.ok(head.includes('.THREE='), 'UMD ビルドではない可能性');
});

/* --- 過去に踏んだ不具合の再発防止 --- */

test('JS が毎フレーム書く opacity / transform に CSS transition を掛けていない', () => {
  // 以前 .label--brand に transition が残り、HIDD の文字が薄いまま止まった
  // js/stars.js が inline で毎フレーム書く要素だけを見る（擬似要素や子要素は対象外）
  const css = read('src/css/index.css');
  const guarded = ['.brand', '.star', '.star__name', '.constellations line'];

  for (const sel of guarded) {
    const lit = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    const rule = css.match(new RegExp('(?:^|\\})\\s*' + lit + '\\s*\\{([^}]*)\\}', 'm'));
    assert.ok(rule, `${sel} の定義が見つからない`);
    // コメントでの言及は許し、実際の宣言だけを見る
    assert.ok(!/transition[a-z-]*\s*:/.test(rule[1]),
      `${sel} に transition がある。opacity / transform は JS が毎フレーム書くので追従できない`);
  }
});

test('重要な処理を requestAnimationFrame の完了に紐づけていない', () => {
  // 以前 遷移やカード表示を rAF 完了に紐づけ、背景タブで固まった
  for (const f of ['src/js/stars.js', 'demo/js/stars.js']) {
    // コメントでの言及は許し、実際の受け渡し・呼び出しだけを見る
    assert.ok(!/onDone\s*[(:=]/.test(read(f)),
      `${f} に onDone コールバックが復活している（進行はアニメ完了でなく setTimeout で出すこと）`);
  }
});

test('カードの表示を requestAnimationFrame に紐づけていない', () => {
  // rAF はタブ非表示だと止まる。カードを開く class を rAF の中で足すと、
  // 再生は始まっているのにカードが opacity 0 のまま見えない状態になる。
  assert.ok(!/requestAnimationFrame\s*\([\s\S]{0,120}?is-open/.test(read('src/js/stars.js')),
    'src/js/stars.js がカードの表示を rAF に紐づけている（setTimeout で出すこと）');
});

test('横送りの状態更新を scroll イベントだけに任せていない', () => {
  // scroll も描画フレーム待ちなので、背景タブでは飛んでこない。
  // 送りボタンが無効のまま固まるのを防ぐため setTimeout でも直すこと。
  const code = read('src/js/category.js');
  assert.ok(/setTimeout\(\s*updateNav/.test(code),
    'src/js/category.js が updateNav を setTimeout で呼んでいない。' +
    'scroll イベントはタブ非表示だと来ないので、ボタンが押せなくなる');
});

test('フィルムストリップの流れの再開を setTimeout で出している', () => {
  // 手で送ったあとの再開を scroll イベントや rAF の完了に紐づけると、
  // タブが隠れている間は合図が届かず、止まったままになる
  const body = read('src/js/category.js').match(/function nudge\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(body, 'src/js/category.js に nudge が無い（手で動かしたときの一時停止は 1 か所にまとめる）');
  assert.ok(/setTimeout\(/.test(body[1]), 'nudge が流れの再開を setTimeout で予約していない');
});

test('循環中はスクロールスナップを外している', () => {
  // mandatory のままだと、流すたびに最寄りのコマの頭へ引き戻されて進まない
  assert.ok(/\.strip__track\.is-loop\s*\{[^}]*scroll-snap-type:\s*none/.test(read('src/css/category.css')),
    'src/css/category.css の .strip__track.is-loop が scroll-snap-type: none になっていない');
});

test('循環用に複製したコマを Tab と読み上げから外している', () => {
  // 外さないと、同じ動画が何度も Tab でたどられ、読み上げられる
  const body = read('src/js/category.js').match(/function makePanel\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(body, 'src/js/category.js に makePanel が無い（本物と複製は同じ関数で作る）');
  assert.ok(/tabIndex\s*=\s*-1/.test(body[1]) && /aria-hidden/.test(body[1]),
    '複製のコマに tabIndex = -1 と aria-hidden が付いていない');
});

test('回転の計算が 1 か所にまとまっている（重複させない）', () => {
  for (const f of ['src/js/stars.js', 'demo/js/stars.js']) {
    assert.ok(!/^\s*function facingAngles/m.test(read(f)),
      `${f} が facingAngles を再定義している。src/js/geometry.js を使うこと`);
  }
});

test('無操作の判定が、掴んでいる間と惰性で回っている間を除いている', () => {
  // pointermove は noteActivity を呼ばないので、以前は長くドラッグしていると
  // 無操作と見なされ、球体を触っている最中に自動再生が始まっていた。
  const code = read('src/js/stars.js');
  const body = code.match(/function armIdle\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(body, 'src/js/stars.js に armIdle が無い（無操作の計測開始は 1 か所にまとめる）');
  assert.ok(/\bdragging\b/.test(body[1]) && /pinchPointers/.test(body[1]),
    'armIdle が掴んでいる状態を見ていない。ドラッグ中に自動再生が始まる');
  assert.ok(/spinSettleMs/.test(body[1]),
    'armIdle が惰性の残りを見ていない。まだ回っているのに無操作と見なされる');
});

test('ドラッグの終わりを window でも受けている（取りこぼすと巡回が戻らない）', () => {
  // 掴んでいる間は無操作にしないので、pointerup を逃すと idle の計測が始まらない。
  // 球体の外で離した場合に備えて window でも拾う。
  const code = read('src/js/stars.js');
  assert.ok(/window\.addEventListener\('pointerup',\s*endDrag\)/.test(code),
    'src/js/stars.js が pointerup を window で受けていない');
  assert.ok(/window\.addEventListener\('pointercancel',\s*endDrag\)/.test(code),
    'src/js/stars.js が pointercancel を window で受けていない');
});

test('カテゴリの文言をメニューに書き写していない（data.js から作る）', () => {
  // 増減のたびに 2 か所直すことになり、必ず片方が古くなる
  const label = loadBrowserScripts('src/js/data.js').HIDD_DATA.categories[0].label;
  for (const f of ['src/index.html', 'src/js/menu.js']) {
    assert.ok(!read(f).includes(label), `${f} にカテゴリ名が直書きされている: ${label}`);
  }
  assert.ok(/DATA\.categories/.test(read('src/js/menu.js')),
    'src/js/menu.js が data.js の categories を読んでいない');
});

test('メニューの開閉を rAF や hidden 属性のタイマーに紐づけていない', () => {
  // rAF はタブ非表示だと止まり、setTimeout も間引かれる。
  // 開閉は class の付け外しだけにして、遅れても状態が食い違わないようにする。
  const code = read('src/js/menu.js');
  assert.ok(!/requestAnimationFrame/.test(code),
    'src/js/menu.js が rAF を使っている（タブ非表示で開閉が止まる）');
  assert.ok(!/\.hidden\s*=/.test(code),
    'src/js/menu.js が hidden 属性を切り替えている（transition と競合する。visibility で隠すこと）');
});

test('メニューを開いているあいだは無操作と判定しない', () => {
  const body = read('src/js/stars.js').match(/function armIdle\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(body, 'src/js/stars.js に armIdle が無い');
  assert.ok(/HIDDMenu/.test(body[1]),
    'armIdle がメニューの開閉を見ていない。メニューを見ている最中に自動再生が始まる');
});

test('設定画面を開いているあいだは無操作と判定しない', () => {
  const body = read('src/js/stars.js').match(/function armIdle\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(body, 'src/js/stars.js に armIdle が無い');
  assert.ok(/SETTINGS\.isOpen\(\)/.test(body[1]),
    'armIdle が設定画面の開閉を見ていない。設定している最中に自動再生が始まる');
});

test('設定画面の開閉を rAF や hidden 属性のタイマーに紐づけていない', () => {
  // メニューと同じ理由。開閉は class の付け外しだけにする
  const code = read('src/js/settings.js');
  assert.ok(!/requestAnimationFrame/.test(code),
    'src/js/settings.js が rAF を使っている（タブ非表示で開閉が止まる）');
  assert.ok(!/\.hidden\s*=/.test(code),
    'src/js/settings.js が hidden 属性を切り替えている（transition と競合する。visibility で隠すこと）');
});

test('settings.js を、設定を使うスクリプトより先に読んでいる', () => {
  // 逆だと読み込み時に設定を引けず、保存した値が効かない
  // （既定の動きのまま動くので気づきにくい）
  for (const [html, user] of [['src/index.html', 'js/stars.js'], ['src/category.html', 'js/category.js']]) {
    const code = read(html);
    const settings = code.indexOf('js/settings.js');
    assert.ok(settings >= 0, `${html} が js/settings.js を読んでいない`);
    assert.ok(settings < code.indexOf(user), `${html} が settings.js を ${user} より後に読んでいる`);
  }
});

test('設定画面の CSS は両方のページが読む common.css に置いている', () => {
  // index.css に置くと、カテゴリページで開いたときにスタイルの無い素の要素が並ぶ
  assert.ok(/\.settings\s*\{/.test(read('src/css/common.css')), 'src/css/common.css に .settings が無い');
  assert.ok(!/\.settings\s*\{/.test(read('src/css/index.css')), 'src/css/index.css にも .settings がある（二重定義）');
});

test('背景の模様を塗る .bg-glow が両方のページにある', () => {
  // 背景の設定は、地の色（body）と模様（.bg-glow）の 2 か所で効く。
  // .bg-glow の無いページでは、選んでも地の色しか変わらない
  for (const html of ['src/index.html', 'src/category.html']) {
    assert.ok(read(html).includes('class="bg-glow"'), `${html} に .bg-glow が無い`);
  }
  assert.ok(/\.bg-glow\s*\{[^}]*background:\s*var\(--bg-layers\)/.test(read('src/css/common.css')),
    'src/css/common.css の .bg-glow が --bg-layers を塗っていない');
});

test('再生位置のリセットが stars.js の保存キーを消している', () => {
  // 食い違うと、リセットを押しても続きの位置が消えない
  const store = read('src/js/stars.js').match(/var STORE = '([^']+)'/);
  const prefix = read('src/js/settings.js').match(/var POS_PREFIX = '([^']+)'/);
  assert.ok(store && prefix, 'stars.js の STORE か settings.js の POS_PREFIX が見つからない');
  assert.equal(prefix[1], store[1], 'settings.js が消すキーと stars.js が保存するキーが違う');
});

test('WebGL 非対応時のカテゴリ一覧が残っている', () => {
  // 球体の下の一覧は左上のメニューへ移したが、3D が使えない環境では
  // これが唯一の導線になる。display: none にしたまま復帰させ忘れないこと。
  const css = read('src/css/index.css');
  assert.ok(/\.fallback-nav\s*\{[^}]*display:\s*none/.test(css),
    '球体の下のカテゴリ一覧が隠されていない');
  assert.ok(/\.no-webgl\s+\.fallback-nav\s*\{[^}]*display:\s*block/.test(css),
    'WebGL 非対応時に .fallback-nav が出てこない（カテゴリへ行けなくなる）');
  assert.ok(read('src/index.html').includes('id="fallbackList"'),
    'src/index.html からフォールバックの一覧が消えている');
});

test('全画面の再生カードを .stage の中に置いていない', () => {
  // .stage は z-index: 1 のスタッキングコンテキスト。この中に入れると、
  // .grow の z-index をいくつ上げても body 直下の .site-head（左上の見出し）より
  // 上に出せず、再生中の動画にロゴが重なる。
  const html = read('src/index.html');
  const stage = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.ok(!stage.includes('id="grow"'),
    'src/index.html の再生カードが <main class="stage"> の中にある。body 直下へ出すこと');
  assert.ok(html.includes('id="grow"'), 'src/index.html から再生カードが消えている');
});

/* --- 動画まわり --- */

test('実物の動画を Git に入れない設定になっている', () => {
  const ignore = read('.gitignore');
  assert.ok(/^src\/videos\/\*$/m.test(ignore), 'src/videos/* が除外されていない');
  assert.ok(/^src\/videos\/\*\/\*$/m.test(ignore),
    'src/videos/<カテゴリid>/ の中身が除外されていない');
  assert.ok(/^!src\/videos\/sample\/\*$/m.test(ignore), 'sample が除外解除されていない');
  assert.ok(/^!src\/videos\/\*\/\.gitkeep$/m.test(ignore),
    '.gitkeep が除外解除されていない。空のカテゴリフォルダが clone 先に残らなくなる');
});

test('カテゴリごとの動画フォルダが用意されている', () => {
  const { HIDD_DATA: DATA } = loadBrowserScripts('src/js/data.js');
  const missing = DATA.categories
    .map((c) => `src/videos/${c.id}`)
    .filter((dir) => !existsSync(repoPath(dir)));
  assert.deepEqual(missing, [], 'フォルダが無いカテゴリがある（動画を置く場所が無い）');
});

test('videos.js を data.js より先に読んでいる', () => {
  // 逆だと data.js が読む window.HIDD_VIDEO_FILES がまだ未定義で、
  // フォルダに動画を置いても反映されない（見た目は今までどおり動くので気づきにくい）
  for (const html of ['src/index.html', 'src/category.html']) {
    const code = read(html);
    const videos = code.indexOf('js/videos.js');
    const data = code.indexOf('js/data.js');
    assert.ok(videos >= 0, `${html} が js/videos.js を読んでいない`);
    assert.ok(videos < data, `${html} が videos.js を data.js より後に読んでいる`);
  }
});

test('デモが使う確認用動画が全て存在する', () => {
  const { HIDD_DATA: DATA } = loadBrowserScripts('src/js/data.js');
  const missing = [];
  for (const cat of DATA.categories) {
    cat.videos.forEach((_, i) => {
      const rel = `src/videos/sample/${cat.id}-0${i + 1}.mp4`;
      if (!existsSync(repoPath(rel))) missing.push(rel);
    });
  }
  assert.deepEqual(missing, [], '確認用動画が足りない');
});

test('確認用動画が軽い（リポジトリを太らせない）', () => {
  let total = 0;
  for (const f of readdirSync(repoPath('src/videos/sample'))) {
    const size = statSync(repoPath('src/videos/sample', f)).size;
    assert.ok(size < 1024 * 1024, `${f} が 1MB 超え`);
    total += size;
  }
  assert.ok(total < 5 * 1024 * 1024, `合計 ${(total / 1024 / 1024).toFixed(1)}MB は大きすぎる`);
});

test('デモは本番の資産を ../src/ 経由で参照している', () => {
  for (const html of HTML.filter((f) => f.startsWith('demo/'))) {
    const code = read(html);
    for (const m of code.matchAll(/(?:src|href)="((?:css|js|vendor)\/[^"]+)"/g)) {
      assert.ok(m[1].startsWith('css/') || m[1].startsWith('js/'),
        `${html} が本番の資産を相対参照している: ${m[1]}`);
    }
  }
});
