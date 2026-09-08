/**
 * HIDD — 球体テクスチャ 比較デモの進行役
 *
 * 6 案を並べ、ドラッグで 6 つとも同じ向きに回して見比べられるようにする。
 * 描画は 1 本の requestAnimationFrame ループでまとめ、静止したら止める。
 */
(function () {
  'use strict';

  var HALF_PI = Math.PI / 2;
  var BRAND_R = 1.02;

  var grid = document.getElementById('grid');
  var fallback = document.getElementById('fallback');

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  if (!hasWebGL()) {
    fallback.hidden = false;
    return;
  }

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 共有する状態（6 つの球体を連動させる） ---------------- */

  var yaw = 0, pitch = 0;
  var velYaw = 0, velPitch = 0;
  var lineMode = 'rings';       /* none | rings | all */
  var showBrand = true;
  var autoSpin = !reduceMotion;

  var cards = [];
  var running = false, lastFrame = 0;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ---------------- カードの生成 ---------------- */

  var TAU = Math.PI * 2;

  HIDDTexture.options.forEach(function (opt, index) {
    var card = document.createElement('section');
    card.className = 'card';

    var stage = document.createElement('div');
    stage.className = 'card__stage';

    var num = document.createElement('span');
    num.className = 'card__num';
    num.textContent = '案 ' + (index + 1);
    stage.appendChild(num);

    var brand = document.createElement('span');
    brand.className = 'brand';
    brand.textContent = 'HIDD';
    stage.appendChild(brand);

    var body = document.createElement('div');
    body.className = 'card__body';

    var h = document.createElement('h2');
    h.className = 'card__title';
    h.textContent = opt.title;

    var meta = document.createElement('div');
    meta.className = 'card__meta';
    opt.tags.forEach(function (t) {
      var span = document.createElement('span');
      if (typeof t === 'string') { span.className = 'tag'; span.textContent = t; }
      else {
        span.className = 'tag' + (t.good ? ' tag--good' : '') + (t.warn ? ' tag--warn' : '');
        span.textContent = t.text;
      }
      meta.appendChild(span);
    });

    var p = document.createElement('p');
    p.className = 'card__desc';
    p.textContent = opt.desc;

    body.appendChild(h);
    body.appendChild(meta);
    body.appendChild(p);
    card.appendChild(stage);
    card.appendChild(body);
    grid.appendChild(card);

    cards.push(createView(stage, brand, opt));
  });

  /* ---------------- 1 枚ぶんの 3D ビュー ---------------- */

  function createView(stage, brandEl, opt) {
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 3.6);

    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    stage.appendChild(renderer.domElement);

    var group = new THREE.Group();
    scene.add(group);

    /* 球体本体 */
    var sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), opt.makeMaterial());
    group.add(sphere);

    /* 線（グローバル設定で付け外しする） */
    var lines = new THREE.Group();
    group.add(lines);

    var wireMat = new THREE.LineBasicMaterial({ color: 0x7f9fd8, transparent: true, opacity: 0.42 });
    var ringMat = new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.5 });

    /* ジオデシック球の辺は弦なので、半径ぴったりだと辺の中間が球面の内側に沈んで隠れる。
       弦のたわみ（detail 2 でおよそ 1.5%）を見込んで少し外側に置く。 */
    var wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.03, 2)), wireMat);

    function ring(rotX, rotY) {
      var pts = [];
      for (var i = 0; i <= 96; i++) {
        var a = (i / 96) * TAU;
        pts.push(new THREE.Vector3(Math.cos(a) * 1.012, Math.sin(a) * 1.012, 0));
      }
      var l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
      l.rotation.x = rotX; l.rotation.y = rotY;
      return l;
    }
    var rings = [ring(HALF_PI, 0), ring(0, 0), ring(0, HALF_PI)];

    /* カテゴリ位置のマーカー（向きは data.js が個数から算出する） */
    var mp = [], mc = [];
    window.HIDD_DATA.categories.forEach(function (c, i) {
      var d = window.HIDD_DATA.direction(i);
      mp.push(d[0] * 1.06, d[1] * 1.06, d[2] * 1.06);
      var col = new THREE.Color(c.accent);
      mc.push(col.r, col.g, col.b);
    });
    var mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
    mg.setAttribute('color', new THREE.Float32BufferAttribute(mc, 3));
    var markers = new THREE.Points(mg, new THREE.PointsMaterial({
      size: 0.08, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true
    }));
    group.add(markers);

    /* HIDD ラベルのアンカー */
    var anchor = new THREE.Object3D();
    anchor.position.set(0, 0, BRAND_R);
    group.add(anchor);
    var world = new THREE.Vector3();

    var w = 1, h = 1;

    function applyLines() {
      while (lines.children.length) lines.remove(lines.children[0]);
      if (lineMode === 'all') lines.add(wire);
      if (lineMode === 'all' || lineMode === 'rings') {
        rings.forEach(function (r) { lines.add(r); });
      }
    }
    applyLines();

    function resize() {
      var rect = stage.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    function draw() {
      group.rotation.set(pitch, yaw, 0);
      group.updateMatrixWorld(true);
      renderer.render(scene, camera);

      /* HIDD ラベルを球面に追従させる */
      anchor.getWorldPosition(world);
      var depth = clamp(world.z / BRAND_R, -1, 1);
      var v = world.clone().project(camera);
      var x = (v.x * 0.5 + 0.5) * w;
      var y = (-v.y * 0.5 + 0.5) * h;
      brandEl.style.transform =
        'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%) scale(' +
        (0.86 + 0.14 * ((depth + 1) / 2)).toFixed(3) + ')';
      brandEl.style.opacity = clamp(0.06 + 0.94 * ((depth + 0.55) / 1.5), 0, 1).toFixed(3);
    }

    /* ---- ドラッグ（どの球体を掴んでも全部が同じ向きに回る） ---- */

    var dragging = false, pointerId = null, lastX = 0, lastY = 0, lastT = 0;
    var K = 0.006;

    stage.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true; pointerId = e.pointerId;
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
      velYaw = 0; velPitch = 0;
      autoSpin = false; syncSpinButtons();
      stage.classList.add('is-dragging');
      if (stage.setPointerCapture) { try { stage.setPointerCapture(e.pointerId); } catch (err) {} }
      requestRender();
    });

    stage.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pointerId) return;
      var now = performance.now();
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      var dt = Math.max((now - lastT) / 1000, 0.001);
      yaw += dx * K;
      pitch = clamp(pitch + dy * K, -HALF_PI, HALF_PI);
      velYaw = (dx * K) / dt; velPitch = (dy * K) / dt;
      lastX = e.clientX; lastY = e.clientY; lastT = now;
      requestRender();
    });

    function end(e) {
      if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
      dragging = false; pointerId = null;
      stage.classList.remove('is-dragging');
      if (performance.now() - lastT > 90) { velYaw = 0; velPitch = 0; }
      velYaw = clamp(velYaw, -6, 6); velPitch = clamp(velPitch, -6, 6);
      requestRender();
    }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('lostpointercapture', end);

    resize();

    return {
      draw: draw,
      resize: resize,
      applyLines: applyLines,
      brandEl: brandEl,
      isDragging: function () { return dragging; }
    };
  }

  /* ---------------- 共有の描画ループ ---------------- */

  function requestRender() {
    if (running) return;
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function frame(now) {
    var dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    var busy = false;
    var anyDragging = cards.some(function (c) { return c.isDragging(); });

    if (anyDragging) {
      busy = true;
    } else {
      if (Math.abs(velYaw) > 0.0004 || Math.abs(velPitch) > 0.0004) {
        yaw += velYaw * dt; pitch += velPitch * dt;
        velYaw *= Math.pow(0.06, dt); velPitch *= Math.pow(0.06, dt);
        busy = true;
      } else { velYaw = 0; velPitch = 0; }

      if (autoSpin) { yaw += 0.22 * dt; busy = true; }
    }

    pitch = clamp(pitch, -HALF_PI, HALF_PI);
    for (var i = 0; i < cards.length; i++) cards[i].draw();

    if (busy) requestAnimationFrame(frame);
    else running = false;
  }

  /* ---------------- 操作パネル ---------------- */

  function wireSegment(id, onChange) {
    var seg = document.getElementById(id);
    seg.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      seg.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      onChange(btn.dataset.v);
    });
    return seg;
  }

  wireSegment('segLines', function (v) {
    lineMode = v;
    cards.forEach(function (c) { c.applyLines(); });
    requestRender();
  });

  wireSegment('segBrand', function (v) {
    showBrand = (v === 'on');
    cards.forEach(function (c) { c.brandEl.classList.toggle('is-off', !showBrand); });
  });

  var segSpin = wireSegment('segSpin', function (v) {
    autoSpin = (v === 'on');
    requestRender();
  });

  function syncSpinButtons() {
    segSpin.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.v === (autoSpin ? 'on' : 'off')));
    });
  }
  syncSpinButtons();

  /* ---------------- その他 ---------------- */

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      cards.forEach(function (c) { c.resize(); });
      cards.forEach(function (c) { c.draw(); });
    }, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) requestRender();
  });

  /* 初回は必ず 1 枚描いておく（ループが動かない環境でも表示される） */
  cards.forEach(function (c) { c.draw(); });
  requestRender();
})();
