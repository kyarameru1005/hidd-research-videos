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

/* --- 惰性が落ち着くまでの時間（無操作の判定に使う） --- */

test('spinSettleMs: 指定の速さまで落ちる時間が減衰の式と一致する', () => {
  const friction = 0.84;   // src/js/stars.js の FRICTION
  const settle = 0.35;     // 巡回と同じ速さ
  for (const v of [0.4, 1, 3, 6]) {
    const ms = G.spinSettleMs(v, 0, settle, friction);
    assert.ok(ms > 0, `${v} rad/s で 0 になった`);
    // t 秒後の速さが settle ちょうどになること
    const left = v * Math.pow(friction, ms / 1000);
    assert.ok(Math.abs(left - settle) < 1e-9, `${v} rad/s: ${left} != ${settle}`);
  }
});

test('spinSettleMs: 速い方の軸で決まり、速いほど長くかかる', () => {
  assert.equal(G.spinSettleMs(1, 4, 0.35, 0.84), G.spinSettleMs(4, 1, 0.35, 0.84));
  assert.ok(G.spinSettleMs(6, 0, 0.35, 0.84) > G.spinSettleMs(2, 0, 0.35, 0.84));
  assert.equal(G.spinSettleMs(-4, 0, 0.35, 0.84), G.spinSettleMs(4, 0, 0.35, 0.84));
});

test('spinSettleMs: 止まっている・値が不正なら 0（待たせ続けない）', () => {
  assert.equal(G.spinSettleMs(0, 0, 0.35, 0.84), 0);
  assert.equal(G.spinSettleMs(0.35, 0.1, 0.35, 0.84), 0);
  assert.equal(G.spinSettleMs(5, 0, 0, 0.84), 0);
  assert.equal(G.spinSettleMs(5, 0, 0.35, 1), 0);      // 減らない → 無限になる
  assert.equal(G.spinSettleMs(5, 0, 0.35, 0), 0);
});

/* --- カテゴリページのフィルムストリップ（循環） --- */

// src/css/category.css の寸法を画面幅 vw に当てはめる。
// コマ幅 clamp(240px, 30vw, 320px)、間隔 16px、左右の余白 clamp(20px, 6vw, 56px)、
// 表示幅は .cat-main の max-width 1080px まで
function stripCase(vw, n) {
  const pad = Math.min(Math.max(20, vw * 0.06), 56);
  const card = Math.min(Math.max(240, vw * 0.3), 320);
  const gap = 16;
  return { viewW: Math.min(vw, 1080), pad, gap, setW: (card + gap) * n };
}

test('stripCopies: 画面に収まる本数なら循環させない（今までどおり並べるだけ）', () => {
  const c = stripCase(1280, 2);
  assert.equal(G.stripCopies(c.viewW, c.setW, c.pad * 2, c.gap), null);
  assert.equal(G.stripCopies(1080, 0, 112, 16), null);    // 動画なし
  assert.equal(G.stripCopies(0, 1000, 112, 16), null);    // 非表示（幅 0）
});

test('stripCopies: 流している間も、手で 1 周ぶん送っても、端の余白が見えない', () => {
  for (const vw of [320, 375, 600, 800, 1080, 1280, 1920]) {
    for (let n = 1; n <= 12; n++) {
      const c = stripCase(vw, n);
      const label = `${vw}px ${n} 本`;
      const plan = G.stripCopies(c.viewW, c.setW, c.pad * 2, c.gap);
      if (!plan) {
        assert.ok(c.pad * 2 + c.setW - c.gap <= c.viewW + 4, `${label}: はみ出すのに循環しない`);
        continue;
      }
      // scrollLeft = s で見えるのは [s, s + viewW]。コマは [pad, lastCard] に並ぶ
      const sets = plan.before + 1 + plan.after;
      const lastCard = c.pad + sets * c.setW - c.gap;
      const maxScroll = c.pad * 2 + sets * c.setW - c.gap - c.viewW;
      const home = plan.before * c.setW;   // 基準の 1 周の先頭コマを左の余白の位置に置く
      assert.ok(home >= c.pad, `${label}: 左端の余白が見える`);
      assert.ok(home + c.setW + c.viewW <= lastCard + 1e-9, `${label}: 流れの途中で右端の余白が見える`);
      assert.ok(home >= c.setW, `${label}: 左へ 1 周送る余裕が無い`);
      assert.ok(maxScroll - (home + c.setW) >= c.setW - 1e-9, `${label}: 右へ 1 周送る余裕が無い`);
    }
  }
});

test('wrapStrip: 何周ずれていても基準の 1 周の中へ戻す', () => {
  const home = 1008, setW = 2352;
  for (let k = -3; k <= 3; k++) {
    for (const d of [0, 1, 500.5, setW - 1]) {
      const got = G.wrapStrip(home + d + k * setW, home, setW);
      assert.ok(Math.abs(got - (home + d)) < 1e-6, `k=${k} d=${d}: ${got}`);
      assert.ok(got >= home && got < home + setW, `範囲外: ${got}`);
    }
  }
});

test('stripStepTarget: 揃った位置からはちょうど 1 コマ送る', () => {
  const home = 1008, step = 336;
  for (let k = -2; k <= 8; k++) {
    const p = home + k * step;
    assert.equal(G.stripStepTarget(p, home, step, 1), p + step);
    assert.equal(G.stripStepTarget(p, home, step, -1), p - step);
  }
});

test('stripStepTarget: 流れの途中で止まった位置からは、次（前）のコマの頭へ揃える', () => {
  const home = 1008, step = 336;
  const p = home + 2.5 * step;
  assert.equal(G.stripStepTarget(p, home, step, 1), home + 3 * step);
  assert.equal(G.stripStepTarget(p, home, step, -1), home + 2 * step);
});

test('stripStepTarget: 丸め誤差で同じコマへ 1px だけ動いて終わらない', () => {
  const home = 1008, step = 336;
  const at = home + 3 * step;
  for (const e of [-1, -0.5, 0.5, 1]) {
    assert.equal(G.stripStepTarget(at + e, home, step, 1), at + step, `+${e}px から次へ`);
    assert.equal(G.stripStepTarget(at + e, home, step, -1), at - step, `+${e}px から前へ`);
  }
});
