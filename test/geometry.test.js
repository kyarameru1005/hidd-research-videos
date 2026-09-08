/**
 * 球体の回転まわりの計算。
 *
 * 「カテゴリをクリックすると、その面が正面に来る」がこのサイトの根幹なので、
 * facingAngles が正しいことと、求まる pitch が可動域（±90 度）に収まることを検証する。
 * カテゴリ数を変えても壊れないよう、3〜8 件で確認する。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScripts } from './helpers.mjs';

const win = loadBrowserScripts('src/js/data.js', 'src/js/geometry.js');
const DATA = win.HIDD_DATA;
const G = win.HIDDGeom;

const EPS = 1e-9;
const HALF_PI = Math.PI / 2;
const len = (v) => Math.hypot(v[0], v[1], v[2]);

test('clamp が範囲に収める', () => {
  assert.equal(G.clamp(5, 0, 1), 1);
  assert.equal(G.clamp(-5, 0, 1), 0);
  assert.equal(G.clamp(0.4, 0, 1), 0.4);
});

test('smoothstep が 0..1 に収まり、両端で 0 と 1 になる', () => {
  assert.equal(G.smoothstep(0, 1, -1), 0);
  assert.equal(G.smoothstep(0, 1, 2), 1);
  assert.ok(Math.abs(G.smoothstep(0, 1, 0.5) - 0.5) < EPS);
  for (let x = -0.5; x <= 1.5; x += 0.1) {
    const v = G.smoothstep(0, 1, x);
    assert.ok(v >= 0 && v <= 1, `範囲外: ${v}`);
  }
});

test('easeInOutCubic が 0→0, 1→1, 中点 0.5', () => {
  assert.equal(G.easeInOutCubic(0), 0);
  assert.equal(G.easeInOutCubic(1), 1);
  assert.ok(Math.abs(G.easeInOutCubic(0.5) - 0.5) < EPS);
});

test('shortestAngle が常に最短路（±PI 以内）を返す', () => {
  assert.ok(Math.abs(G.shortestAngle(0, Math.PI * 1.9) + Math.PI * 0.1) < 1e-12);
  assert.ok(Math.abs(G.shortestAngle(Math.PI * 1.9, 0) - Math.PI * 0.1) < 1e-12);
  for (let a = -10; a <= 10; a += 0.37) {
    for (let b = -10; b <= 10; b += 0.53) {
      const d = G.shortestAngle(a, b);
      assert.ok(Math.abs(d) <= Math.PI + EPS, `最短路でない: ${d}`);
      // a + d が b と同じ向きを指すこと（周回の差は無視したいので cos/sin で比べる）
      assert.ok(Math.abs(Math.cos(a + d) - Math.cos(b)) < 1e-9 &&
                Math.abs(Math.sin(a + d) - Math.sin(b)) < 1e-9,
        `向きがずれる: a=${a} b=${b} d=${d}`);
    }
  }
});

test('direction() が単位ベクトルを返す', () => {
  for (let i = 0; i < DATA.categories.length; i++) {
    assert.ok(Math.abs(len(DATA.direction(i)) - 1) < 1e-12);
  }
});

test('direction() は正面（+Z）を使わない（HIDD の表示用に空ける）', () => {
  for (let i = 0; i < DATA.categories.length; i++) {
    assert.ok(DATA.direction(i)[2] < 0.99, `正面を占有している: ${i}`);
  }
});

test('カテゴリの向きが互いに重ならない', () => {
  const dirs = DATA.categories.map((_, i) => DATA.direction(i));
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      const dot = dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1] + dirs[i][2] * dirs[j][2];
      assert.ok(dot < 0.99, `向きが重複: ${i} と ${j}`);
    }
  }
});

test('5 件までは上・右・下・左・後ろの軸方向に並ぶ', () => {
  assert.ok(DATA.categories.length <= 5, 'この前提が変わったらテストも見直すこと');
  const expected = [[0, 1, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
  for (let i = 0; i < DATA.categories.length; i++) {
    assert.deepEqual(DATA.direction(i), expected[i]);
  }
});

/* --- ここが本丸 --- */

function checkFacing(dirs, label) {
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    const { yaw, pitch } = G.facingAngles(d);

    assert.ok(Math.abs(pitch) <= HALF_PI + EPS,
      `${label}: pitch が可動域外 ${(pitch * 180 / Math.PI).toFixed(1)}度 (i=${i})`);

    const r = G.rotate(d, yaw, pitch);
    assert.ok(Math.abs(r[0]) < 1e-9 && Math.abs(r[1]) < 1e-9 && Math.abs(r[2] - 1) < 1e-9,
      `${label}: 正面(0,0,1)に来ない i=${i} -> (${r.map((v) => v.toFixed(6))})`);
  }
}

test('現在のカテゴリはすべて正面に回せる', () => {
  checkFacing(DATA.categories.map((_, i) => DATA.direction(i)), '現構成');
});

test('カテゴリ数を 3〜8 に変えても正面に回せる', () => {
  const saved = DATA.categories;
  try {
    for (let n = 3; n <= 8; n++) {
      DATA.categories = new Array(n).fill(0).map(() => ({}));
      const dirs = DATA.categories.map((_, i) => DATA.direction(i));
      for (const d of dirs) assert.ok(Math.abs(len(d) - 1) < 1e-12, `${n} 件: 単位ベクトルでない`);
      checkFacing(dirs, `${n} 件`);
    }
  } finally {
    DATA.categories = saved;
  }
});

test('任意の向きでも正面に回せる（総当たり）', () => {
  const dirs = [];
  for (let a = 0; a < Math.PI * 2; a += 0.31) {
    for (let b = -HALF_PI + 0.05; b < HALF_PI; b += 0.29) {
      dirs.push([Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)]);
    }
  }
  checkFacing(dirs, '総当たり');
});

test('Node には WebGL が無いので hasWebGL は false（例外を投げない）', () => {
  assert.equal(G.hasWebGL(), false);
});
