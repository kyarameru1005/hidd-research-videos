/**
 * HIDD — 球体の回転まわりの計算
 *
 * 本番（js/sphere.js）と検討用デモ（demo/js/stars.js）の両方から使う。
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
    hasWebGL: hasWebGL
  };
})();
