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

test('JS が毎フレーム書く opacity に CSS transition を掛けていない', () => {
  // 以前 .label--brand に transition が残り、HIDD の文字が薄いまま止まった
  const css = read('src/css/index.css');
  const rule = css.match(/\.label--brand\s*\{[^}]*\}/);
  assert.ok(rule, '.label--brand の定義が見つからない');
  assert.ok(!/transition/.test(rule[0]),
    '.label--brand に transition がある。opacity は JS が毎フレーム書くので追従できない');
});

test('重要な処理を requestAnimationFrame の完了に紐づけていない', () => {
  // 以前 遷移やカード表示を rAF 完了に紐づけ、背景タブで固まった
  for (const f of ['src/js/sphere.js', 'demo/js/stars.js']) {
    // コメントでの言及は許し、実際の受け渡し・呼び出しだけを見る
    assert.ok(!/onDone\s*[(:=]/.test(read(f)),
      `${f} に onDone コールバックが復活している（進行はアニメ完了でなく setTimeout で出すこと）`);
  }
});

test('横送りの状態更新を scroll イベントだけに任せていない', () => {
  // scroll も描画フレーム待ちなので、背景タブでは飛んでこない。
  // 送りボタンが無効のまま固まるのを防ぐため setTimeout でも直すこと。
  const code = read('src/js/category.js');
  assert.ok(/setTimeout\(\s*updateNav/.test(code),
    'src/js/category.js が updateNav を setTimeout で呼んでいない。' +
    'scroll イベントはタブ非表示だと来ないので、ボタンが押せなくなる');
});

test('回転の計算が 1 か所にまとまっている（重複させない）', () => {
  for (const f of ['src/js/sphere.js', 'demo/js/stars.js']) {
    assert.ok(!/^\s*function facingAngles/m.test(read(f)),
      `${f} が facingAngles を再定義している。src/js/geometry.js を使うこと`);
  }
});

/* --- 動画まわり --- */

test('実物の動画を Git に入れない設定になっている', () => {
  const ignore = read('.gitignore');
  assert.ok(/^src\/videos\/\*$/m.test(ignore), 'src/videos/* が除外されていない');
  assert.ok(/^!src\/videos\/sample\/$/m.test(ignore), 'sample が除外解除されていない');
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
