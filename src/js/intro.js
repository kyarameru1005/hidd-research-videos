/**
 * HIDD — 入場アニメーションの進行役
 *
 * 光点 -> 球体が広がる -> HIDD -> カテゴリ -> ヒント の順に見せる。
 * クリックやキー入力でスキップでき、prefers-reduced-motion では演出を行わない。
 */
(function () {
  'use strict';

  var veil = document.getElementById('introVeil');
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var finished = false;

  function finish() {
    if (finished) return;
    finished = true;

    document.body.classList.add('is-revealed');

    if (veil) {
      veil.classList.add('is-done');
      /* transition 後に display:none にして、以降の合成コストを消す */
      setTimeout(function () { veil.classList.add('is-removed'); }, 800);
    }

    if (window.HIDDSphere) window.HIDDSphere.animateIn(1100);

    document.removeEventListener('pointerdown', skip);
    document.removeEventListener('keydown', skip);
  }

  function skip() { finish(); }

  if (reduceMotion) {
    /* 演出なしで即表示 */
    if (veil) veil.classList.add('is-removed');
    document.body.classList.add('is-revealed');
    if (window.HIDDSphere) window.HIDDSphere.animateIn(0);
    return;
  }

  /* 光点が広がりきったところで本体に引き継ぐ */
  setTimeout(finish, 900);

  /* 待ちたくない人向けのスキップ */
  document.addEventListener('pointerdown', skip);
  document.addEventListener('keydown', skip);
})();
