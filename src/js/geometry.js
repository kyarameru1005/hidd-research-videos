/**
 * HIDD — 球体の回転まわりの計算
 *
 * 本番（js/stars.js）と検討用デモ（demo/js/stars.js）の両方から使う。
 * カテゴリページ（js/category.js）のフィルムストリップを循環させる計算もここに置く。
 * DOM に触れない純粋な関数だけを置き、test/ から検証できるようにしている。
 *
 * 球体の回転は R = Rx(pitch) * Ry(yaw)（Three.js 既定の 'XYZ' 順）。
 */
window.HIDDGeom = (function () {
  'use strict';

  var TAU = Math.PI * 2;
  var HALF_PI = Math.PI / 2;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /** 角度差を -PI..PI に畳んで最短経路にする */
  function shortestAngle(from, to) {
    var d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  /**
   * 単位ベクトル d を正面（+Z）に持ってくる yaw / pitch を求める。
   *
   * R = Rx(pitch) * Ry(yaw) で正面に来る向きは
   *   d = (-cos(pitch)·sin(yaw), sin(pitch), cos(pitch)·cos(yaw))
   * なので、逆に解くと pitch = asin(dy), yaw = atan2(-dx, dz)。
   * pitch は必ず ±90 度以内に収まるため、可動域のクランプに引っかからない。
   */
  function facingAngles(d) {
    return {
      pitch: Math.asin(clamp(d[1], -1, 1)),
      yaw: Math.atan2(-d[0], d[2])
    };
  }

  /**
   * R = Rx(pitch) * Ry(yaw) を向き d に適用する。
   * facingAngles の検算用（本番の描画は Three.js が行う）。
   */
  function rotate(d, yaw, pitch) {
    var x1 = d[0] * Math.cos(yaw) + d[2] * Math.sin(yaw);
    var y1 = d[1];
    var z1 = -d[0] * Math.sin(yaw) + d[2] * Math.cos(yaw);
    return [
      x1,
      y1 * Math.cos(pitch) - z1 * Math.sin(pitch),
      y1 * Math.sin(pitch) + z1 * Math.cos(pitch)
    ];
  }

  /**
   * 手を離したあとの惰性が settle まで落ちるのに要する時間（ミリ秒）。
   *
   * 速度は 1 秒あたり friction 倍に減る（v(t) = v0 * friction^t）ので、
   * v0 * friction^t = settle を解いて t = log(settle / v0) / log(friction)。
   * すでに settle 以下、または値が不正なら 0。
   *
   * 無操作の計測を「球体が止まってから」始めるために使う。
   * rAF に頼らず先に時間が求まるので、タブが非表示でも計算が狂わない。
   */
  function spinSettleMs(velYaw, velPitch, settle, friction) {
    var v = Math.max(Math.abs(velYaw), Math.abs(velPitch));
    if (!(settle > 0) || !(friction > 0) || friction >= 1 || !(v > settle)) return 0;
    return (Math.log(settle / v) / Math.log(friction)) * 1000;
  }

  /* ---------------- カテゴリページのフィルムストリップ（循環） ---------------- */

  /**
   * 循環させるために、元の並びの前後へ足す周回の数。
   *
   * 並び（左右の余白 padding を含む）が表示幅 viewW に収まるなら、流す必要がないので null。
   * 収まらないときは前に 1 周、後ろに「表示幅を埋めてなお 1 周の余裕が残る」だけ足す。
   * 流れている最中も、手で 1 周ぶん送った直後も、端の余白を見せないため。
   * setW は 1 周の幅（(コマ幅 + 間隔) × 本数）、gap はコマの間隔。
   */
  function stripCopies(viewW, setW, padding, gap) {
    if (!(viewW > 0) || !(setW > 0)) return null;
    if (setW - gap + padding - viewW <= 4) return null;
    return { before: 1, after: Math.ceil((viewW + gap) / setW) + 1 };
  }

  /**
   * 循環中のスクロール位置を、基準の 1 周 [home, home + setW) の中へ畳む。
   * 周回ごとに同じ並びが続いているので、setW の整数倍ずらしても見た目は変わらない。
   */
  function wrapStrip(pos, home, setW) {
    if (!(setW > 0)) return pos;
    var d = (pos - home) % setW;
    if (d < 0) d += setW;
    if (d >= setW) d -= setW;
    return home + d;
  }

  /**
   * 送りボタン 1 回ぶんの行き先。コマの頭（左端）に揃える。
   *
   * 流れの途中で止まった半端な位置からでも、次（前）のコマの頭へ行く。
   * コマ幅の 2% 以内のずれは揃っているとみなし、丸め誤差で
   * 「同じコマへ 1px だけ動いて終わる」ことが無いようにしている。
   */
  function stripStepTarget(pos, home, step, dir) {
    if (!(step > 0)) return pos;
    var k = (pos - home) / step;
    k = dir > 0 ? Math.floor(k + 0.02) + 1 : Math.ceil(k - 0.02) - 1;
    return home + k * step;
  }

  function hasWebGL() {
    if (typeof document === 'undefined') return false;
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  return {
    TAU: TAU,
    HALF_PI: HALF_PI,
    clamp: clamp,
    smoothstep: smoothstep,
    easeInOutCubic: easeInOutCubic,
    shortestAngle: shortestAngle,
    facingAngles: facingAngles,
    rotate: rotate,
    spinSettleMs: spinSettleMs,
    stripCopies: stripCopies,
    wrapStrip: wrapStrip,
    stripStepTarget: stripStepTarget,
    hasWebGL: hasWebGL
  };
})();
