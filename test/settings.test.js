/**
 * 設定画面（src/js/settings.js）の値の扱い。
 *
 * 保存先の localStorage は手でも書き換えられるし、項目を変えると古い値が残る。
 * どんな値が保存されていても、今の選択肢のどれかに収まることを確かめる。
 * あわせて、既定値がコードに書いてある値（＝今までの動き）と食い違っていないかを見る。
 * Node には localStorage も document も無いので、読み書きは既定値のまま動く。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { read, loadBrowserScripts } from './helpers.mjs';

const S = loadBrowserScripts('src/js/settings.js').HIDDSettings;
const valueItems = S.items.filter((x) => x.type !== 'action');
const item = (key) => S.items.find((x) => x.key === key);
const nums = (key) => item(key).options.map(([v]) => parseFloat(v));

/** src/js/*.js に書いた `var NAME = 数値;` を読む */
function constant(file, name) {
  const m = read(file).match(new RegExp('var ' + name + '\\s*=\\s*([\\d.]+)\\s*;'));
  assert.ok(m, `${file} に ${name} が無い`);
  return parseFloat(m[1]);
}

test('項目の key が重複せず、どれかの分類に入っている（空のタブも無い）', () => {
  const keys = S.items.map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length, `key が重複: ${keys}`);
  const groups = S.groups.map((g) => g.key);
  for (const x of S.items) {
    assert.ok(groups.includes(x.group), `${x.key}: 分類 ${x.group} が GROUPS に無い`);
    assert.ok(x.label, `${x.key}: 表示名が無い`);
  }
  for (const g of groups) {
    assert.ok(S.items.some((x) => x.group === g), `分類 ${g} に項目が無い`);
  }
});

test('値の項目は既定値が選択肢の中にあり、リセットの項目は実行できる', () => {
  for (const x of valueItems) {
    assert.ok(x.options.some((o) => o[0] === x.def), `${x.key}: 既定値 ${x.def} が選択肢に無い`);
  }
  for (const x of S.items.filter((y) => y.type === 'action')) {
    assert.equal(typeof x.run, 'function', `${x.key}: run が無い`);
    assert.equal(typeof x.done, 'function', `${x.key}: 結果の文が無い`);
    assert.ok(x.button, `${x.key}: ボタンの文言が無い`);
  }
});

test('既定値がコードに書いてある値と同じ（入れても今までの動きは変わらない）', () => {
  const same = (key, file, name) =>
    assert.equal(parseFloat(item(key).def), constant(file, name),
      `${key} の既定値が ${file} の ${name} と違う`);
  same('idle', 'src/js/stars.js', 'IDLE_MS');
  same('delay', 'src/js/stars.js', 'PLAY_MS');
  same('inertia', 'src/js/stars.js', 'FRICTION_DEFAULT');
  same('zoom', 'src/js/stars.js', 'CAM_DEFAULT');
  same('flow', 'src/js/category.js', 'FLOW_PX_PER_SEC');
  assert.equal(item('volume').def, '1');
  assert.equal(item('limit').def, '0');      // 最後まで流す
  for (const key of ['auto', 'sound', 'lines', 'twinkle', 'hint']) {
    assert.equal(item(key).def, 'on', `${key} の既定がオフになっている`);
  }
});

test('数の選択肢が使える範囲に収まっている', () => {
  // 慣性: 1 以上だと減らず、spinSettleMs が 0 を返して無操作の待ちが狂う
  for (const f of nums('inertia')) assert.ok(f > 0 && f < 1, `慣性 ${f}`);
  // 大きさ: stars.js のズーム範囲の中。1/sin(22.5°) ≒ 2.61 より近いと球が画面の上下からはみ出す
  const min = constant('src/js/stars.js', 'CAM_MIN');
  const max = constant('src/js/stars.js', 'CAM_MAX');
  for (const z of nums('zoom')) {
    assert.ok(z >= min && z <= max && z > 1 / Math.sin(Math.PI / 8), `大きさ ${z}`);
  }
  for (const v of nums('volume')) assert.ok(v > 0 && v <= 1, `音量 ${v}`);
  for (const ms of [...nums('idle'), ...nums('delay')]) assert.ok(ms > 0, `待ち ${ms}`);
  for (const s of nums('limit')) assert.ok(s >= 0, `再生時間 ${s}`);
  for (const px of nums('flow')) assert.ok(px >= 0, `流れる速さ ${px}`);
});

test('normalize: 選択肢に無い値・壊れた値は既定値に戻し、リセットの項目は持たない', () => {
  const defaults = S.normalize(null);
  assert.deepEqual(Object.keys(defaults).sort(), valueItems.map((x) => x.key).sort());
  assert.deepEqual(S.normalize(undefined), defaults);
  assert.deepEqual(S.normalize('壊れた文字列'), defaults);
  assert.deepEqual(S.normalize({ sound: 'loud', inertia: '0.5', resetAll: 'x' }), defaults);
  assert.deepEqual(S.normalize({ sound: 'off', inertia: '0.06', old: 'x' }),
    { ...defaults, sound: 'off', inertia: '0.06' });
});

test('set: 選択肢に無い値は受け付けず、変わったときだけ知らせる', () => {
  const heard = [];
  S.onChange((key, value) => heard.push(`${key}=${value}`));
  assert.equal(S.set('sound', 'loud'), false);
  assert.equal(S.set('nope', 'on'), false);
  assert.equal(S.set('resetAll', 'x'), false);   // リセットの項目は値を持たない
  assert.equal(S.get('sound'), 'on');
  assert.equal(S.set('sound', 'off'), true);
  assert.equal(S.set('sound', 'off'), false);    // 同じ値では知らせない
  assert.equal(S.get('sound'), 'off');
  assert.deepEqual(heard, ['sound=off']);
  S.set('sound', 'on');
});

test('run: 既定に戻すと、変えていた項目だけ戻して知らせる', () => {
  const heard = [];
  S.onChange((key, value) => heard.push(`${key}=${value}`));
  S.set('idle', '30000');
  S.set('flow', '0');
  heard.length = 0;
  assert.match(S.run('resetAll'), /2 項目/);
  assert.equal(S.get('idle'), '5000');
  assert.equal(S.get('flow'), '40');
  assert.deepEqual(heard, ['idle=5000', 'flow=40', 'resetAll=null']);
  assert.match(S.run('resetAll'), /すでに既定/);
});

test('run: 保存先が使えなくても、再生位置のリセットで落ちない', () => {
  assert.match(S.run('resetPos'), /ありませんでした/);   // Node には localStorage が無い
  assert.equal(S.run('sound'), null);                       // 値の項目は実行できない
});
