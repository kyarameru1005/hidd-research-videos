/**
 * HIDD — トップページの球体
 *
 * ・Three.js (UMD / THREE グローバル) で低ポリのワイヤーフレーム球を描く
 * ・カテゴリ名は 3D テキストではなく、3D 座標に追従する HTML 要素として描く
 * ・静止したら描画ループを止める（低スペック PC 対策で最も効く）
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;
  var TAU = Math.PI * 2;
  var HALF_PI = Math.PI / 2;

  /* アンカーの半径。カテゴリは球の外側に浮かせ、HIDD は球面に貼り付ける。
     カテゴリが 5 個になりラベルが上下に広がるため、4 個のとき（1.22）より内側に寄せている。 */
  var LABEL_R = 1.16;
  var BRAND_R = 1.02;


  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- ユーティリティ ---------------- */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /**
   * 単位ベクトル d を正面（+Z）に持ってくる yaw / pitch を求める。
   *
   * 球の回転は R = Rx(pitch) * Ry(yaw)（Three.js 既定の 'XYZ'）。
   * これで正面に来る向きは d = (-cos(pitch)·sin(yaw), sin(pitch), cos(pitch)·cos(yaw)) なので、
   * 逆に解くと pitch = asin(dy), yaw = atan2(-dx, dz)。
   * pitch は必ず ±90 度以内に収まるため、クランプに引っかからない。
   */
  function facingAngles(d) {
    return {
      pitch: Math.asin(clamp(d[1], -1, 1)),
      yaw: Math.atan2(-d[0], d[2])
    };
  }

  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /* 角度差を -PI..PI に畳んで最短経路にする */
  function shortestAngle(from, to) {
    var d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  /* ---------------- フォールバック / キーボード用ナビ ---------------- */

  function buildFallbackNav() {
    var list = document.getElementById('fallbackList');
    if (!list) return;

    DATA.categories.forEach(function (cat) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'fallback-nav__link';
      a.href = 'category.html?cat=' + encodeURIComponent(cat.id);
      a.textContent = cat.label;
      a.style.setProperty('--cat-accent', cat.accent);
      li.appendChild(a);
      list.appendChild(li);
    });

    var nav = document.getElementById('fallbackNav');
    if (nav && !hasWebGL()) {
      var note = document.createElement('p');
      note.className = 'no-webgl-note';
      note.textContent = 'このブラウザでは 3D 表示が使えないため、一覧から選択してください。';
      nav.insertBefore(note, nav.firstChild);
    }
  }

  /* ---------------- 球体本体 ---------------- */

  function createSphere() {
    var host = document.getElementById('sphereCanvas');
    var labelHost = document.getElementById('labels');
    var brandEl = labelHost.querySelector('[data-anchor="brand"]');

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 3.6);

    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    /* 回転させる対象をまとめるグループ */
    var group = new THREE.Group();
    scene.add(group);

    /* 球体本体。テクスチャは js/texture-lab.js が起動時に 1 枚だけ生成する。
       別案に変えたい場合は materials.quad を dots / circuit / rim / nebula / globe に差し替える。 */
    var sphereMat = HIDDTexture.materials.quad();
    var sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), sphereMat);
    group.add(sphere);

    /* カテゴリ位置のマーカー（球面上の点） */
    var markerPos = [];
    var markerCol = [];
    DATA.categories.forEach(function (cat, i) {
      var d = DATA.direction(i);
      /* 半径 1.0 の球面ぴったりだと、輪郭付近のマーカーが球に隠れて見えなくなる。
         カメラ距離 3.6 では 1.04 以上でないと輪郭の外に出ないため、余裕を持たせる。 */
      markerPos.push(d[0] * 1.06, d[1] * 1.06, d[2] * 1.06);
      var c = new THREE.Color(cat.accent);
      markerCol.push(c.r, c.g, c.b);
    });
    var markerGeo = new THREE.BufferGeometry();
    markerGeo.setAttribute('position', new THREE.Float32BufferAttribute(markerPos, 3));
    markerGeo.setAttribute('color', new THREE.Float32BufferAttribute(markerCol, 3));
    var markers = new THREE.Points(markerGeo, new THREE.PointsMaterial({
      size: 0.11,
      map: HIDDTexture.dotSprite(),      /* 既定の四角ではなく丸い点にする */
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,                  /* 発光の縁が他を削らないように */
      sizeAttenuation: true
    }));
    group.add(markers);

    /* --------- ラベルのアンカー（グループの子にして一緒に回す） --------- */

    var anchors = [];

    function addAnchor(el, localPos, category) {
      var obj = new THREE.Object3D();
      obj.position.set(localPos[0], localPos[1], localPos[2]);
      group.add(obj);
      anchors.push({
        el: el,
        obj: obj,
        category: category || null,
        radius: obj.position.length(),
        world: new THREE.Vector3()
      });
    }

    addAnchor(brandEl, [0, 0, BRAND_R], null);

    DATA.categories.forEach(function (cat, i) {
      var d = DATA.direction(i);

      var a = document.createElement('a');
      a.className = 'label label--cat';
      a.href = 'category.html?cat=' + encodeURIComponent(cat.id);
      a.textContent = cat.label;
      a.style.setProperty('--cat-accent', cat.accent);
      a.setAttribute('tabindex', '-1');   /* キーボードは下部ナビが担当する */
      a.dataset.cat = cat.id;
      labelHost.appendChild(a);

      addAnchor(a, [d[0] * LABEL_R, d[1] * LABEL_R, d[2] * LABEL_R], cat);
    });

    /* ---------------- 状態 ---------------- */

    var yaw = 0, pitch = 0;
    var velYaw = 0, velPitch = 0;
    var introScale = reduceMotion ? 1 : 0.001;
    var introOpacity = reduceMotion ? 1 : 0;

    var dragging = false;
    var pointerId = null;
    var lastX = 0, lastY = 0, lastT = 0;
    var userInteracted = false;

    /* 無操作が続いたときの自動回転（巡回） */
    var IDLE_MS = 60000;            // これだけ操作がなければ回り始める
    var TOUR_RAD_PER_SEC = 0.35;    // 巡回の角速度（1 周およそ 30 秒）
    var idleTimer = null;
    var tour = null;                // 進行中の 1 区間
    var tourStep = 0;

    var snap = null;               // { fromYaw, fromPitch, dYaw, dPitch, start, dur, onDone }
    var intro = null;              // { start, dur }

    var running = false;
    var lastFrame = 0;
    var width = 1, height = 1;

    /* ---------------- サイズ ---------------- */

    var wrapRect = { left: 0, top: 0 };

    function measureLabels() {
      wrapRect = host.getBoundingClientRect();
      for (var i = 0; i < anchors.length; i++) {
        anchors[i].hw = anchors[i].el.offsetWidth / 2;
        anchors[i].hh = anchors[i].el.offsetHeight / 2;
      }
    }

    function resize() {
      var rect = host.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      measureLabels();
      requestRender();
    }

    /* ---------------- ラベル更新 ---------------- */

    var tmp = new THREE.Vector3();

    function updateLabels() {
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        a.obj.getWorldPosition(a.world);

        /* 奥行き: 球の中心から見た z。+1 が手前、-1 が奥 */
        var depth = clamp(a.world.z / (a.radius * (introScale || 1)), -1, 1);

        tmp.copy(a.world).project(camera);
        var x = (tmp.x * 0.5 + 0.5) * width;
        var y = (-tmp.y * 0.5 + 0.5) * height;

        var hw = a.hw || 0, hh = a.hh || 0;

        /* 球の輪郭側に来たラベルは、球に重ならないよう半径方向へ逃がす。
           rim は 0 = 正面（球に貼り付いて見せる）、1 = 輪郭。 */
        if (a.category) {
          var dx = x - width / 2;
          var dy = y - height / 2;
          var len = Math.sqrt(dx * dx + dy * dy);
          if (len > 1) {
            var rim = Math.sqrt(Math.max(0, 1 - depth * depth));
            var ux = dx / len, uy = dy / len;
            /* 逃がしすぎるとラベルの輪が縦に広がって画面に収まらないので 7 割に抑える。
               球体が滑らかなグラデーションになった今は、縁に少し掛かっても読みにくくならない。 */
            var push = (hw * Math.abs(ux) + hh * Math.abs(uy)) * rim * 0.7;
            x += ux * push;
            y += uy * push;
          }
        }

        /* 長いラベルが画面外へ出ないよう、ビューポート内に押し戻す */
        var loX = 10 - wrapRect.left + hw;
        var hiX = (window.innerWidth - 10) - wrapRect.left - hw;
        if (hiX > loX) x = clamp(x, loX, hiX);
        var loY = 10 - wrapRect.top + hh;
        var hiY = (window.innerHeight - 10) - wrapRect.top - hh;
        if (hiY > loY) y = clamp(y, loY, hiY);

        /* 文字はその向きを正面に向けたときだけ見せる。
           depth は 1 が真正面。約 57 度（0.55）で消え、約 21 度（0.93）で全開。
           HIDD も同じ扱いなので、球体を回すと文字が球面から消えていく。 */
        var vis = smoothstep(0.55, 0.93, depth);
        var scale = 0.90 + 0.10 * ((depth + 1) / 2);
        var opacity = vis * introOpacity;

        a.el.style.transform =
          'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)' +
          ' translate(-50%,-50%) scale(' + scale.toFixed(3) + ')';
        a.el.style.opacity = opacity.toFixed(3);
        a.el.style.zIndex = String(Math.round((depth + 1) * 100));

        if (a.category) {
          /* 薄いラベルは押せないようにする（クリック判定は見た目と一致させる） */
          a.el.classList.toggle('is-back', vis < 0.35);
          a.el.classList.toggle('is-front', vis > 0.9);
        }
      }
    }

    /* ---------------- 描画ループ ---------------- */

    /* 現在の状態を 1 フレーム分だけ反映して描く。
       ループからも、読み込み直後の初回描画からも呼ぶ。 */
    function drawFrame() {
      pitch = clamp(pitch, -HALF_PI, HALF_PI);

      group.rotation.set(pitch, yaw, 0);   // 既定の 'XYZ' = Rx * Ry
      group.scale.setScalar(introScale);
      sphereMat.uniforms.uFade.value = introOpacity;
      markers.material.opacity = 0.95 * introOpacity;

      group.updateMatrixWorld(true);
      renderer.render(scene, camera);
      updateLabels();
    }

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

      /* 入場アニメーション */
      if (intro) {
        var it = clamp((now - intro.start) / intro.dur, 0, 1);
        var e = easeInOutCubic(it);
        introScale = 0.001 + e * 0.999;
        introOpacity = clamp((it - 0.25) / 0.55, 0, 1);
        if (it >= 1) { intro = null; introScale = 1; introOpacity = 1; }
        else busy = true;
      }

      /* クリックされたカテゴリを正面へ寄せる */
      if (snap) {
        var st = clamp((now - snap.start) / snap.dur, 0, 1);
        var se = easeInOutCubic(st);
        yaw = snap.fromYaw + snap.dYaw * se;
        pitch = snap.fromPitch + snap.dPitch * se;
        if (st >= 1) snap = null;
        else busy = true;
      } else if (dragging) {
        busy = true;
      } else if (tour) {
        advanceTour(dt);
        busy = true;
      } else {
        /* 慣性 */
        if (Math.abs(velYaw) > 0.0004 || Math.abs(velPitch) > 0.0004) {
          yaw += velYaw * dt;
          pitch += velPitch * dt;
          velYaw *= Math.pow(0.06, dt);
          velPitch *= Math.pow(0.06, dt);
          busy = true;
        } else {
          velYaw = 0; velPitch = 0;
        }

      }

      drawFrame();

      if (busy) {
        requestAnimationFrame(frame);
      } else {
        running = false;
      }
    }

    /* ---------------- ドラッグ操作 ---------------- */

    var DRAG_K = 0.006;   // px -> rad

    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      pointerId = e.pointerId;
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
      velYaw = 0; velPitch = 0;
      snap = null;
      markInteracted();
      host.classList.add('is-dragging');
      if (host.setPointerCapture) { try { host.setPointerCapture(e.pointerId); } catch (err) {} }
      requestRender();
    }

    function onPointerMove(e) {
      if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
      var now = performance.now();
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      var dt = Math.max((now - lastT) / 1000, 0.001);

      yaw += dx * DRAG_K;
      pitch = clamp(pitch + dy * DRAG_K, -HALF_PI, HALF_PI);

      velYaw = (dx * DRAG_K) / dt;
      velPitch = (dy * DRAG_K) / dt;

      lastX = e.clientX; lastY = e.clientY; lastT = now;
      requestRender();
    }

    function onPointerUp(e) {
      if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
      dragging = false;
      pointerId = null;
      host.classList.remove('is-dragging');

      /* 離すのが遅ければ慣性を切る */
      if (performance.now() - lastT > 90) { velYaw = 0; velPitch = 0; }
      velYaw = clamp(velYaw, -6, 6);
      velPitch = clamp(velPitch, -6, 6);
      requestRender();
    }

    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', onPointerUp);
    host.addEventListener('pointercancel', onPointerUp);
    host.addEventListener('lostpointercapture', onPointerUp);

    /* キーボード（矢印キーで回す） */
    host.addEventListener('keydown', function (e) {
      var step = 0.22;
      var handled = true;
      if (e.key === 'ArrowLeft')       yaw -= step;
      else if (e.key === 'ArrowRight') yaw += step;
      else if (e.key === 'ArrowUp')    pitch = clamp(pitch - step, -HALF_PI, HALF_PI);
      else if (e.key === 'ArrowDown')  pitch = clamp(pitch + step, -HALF_PI, HALF_PI);
      else handled = false;

      if (handled) {
        e.preventDefault();
        markInteracted();
        snap = null;
        requestRender();
      }
    });

    /* ---------------- カテゴリのクリック ---------------- */

    var SNAP_MS = 450;

    function snapTo(catId) {
      var idx = -1;
      for (var i = 0; i < DATA.categories.length; i++) {
        if (DATA.categories[i].id === catId) { idx = i; break; }
      }
      if (idx < 0) return false;

      var target = facingAngles(DATA.direction(idx));
      snap = {
        fromYaw: yaw,
        fromPitch: pitch,
        dYaw: shortestAngle(yaw, target.yaw),
        dPitch: target.pitch - pitch,
        start: performance.now(),
        dur: SNAP_MS
      };
      requestRender();
      return true;
    }

    /* ---------------- 無操作時の自動回転（巡回） ----------------
       文字は正面を向いたときだけ見えるので、横回転だけだと回転軸上にある
       上下のカテゴリが永久に出てこない。そこで正面（HIDD）と各カテゴリを
       順に正面へ持ってくる経路を、一定の角速度で回り続ける。 */

    var TOUR_STOPS = (function () {
      var list = [[0, 0, 1]];                                   // まず正面（HIDD）
      for (var i = 0; i < DATA.categories.length; i++) list.push(DATA.direction(i));
      return list;
    })();

    function beginTourLeg() {
      var target = facingAngles(TOUR_STOPS[tourStep % TOUR_STOPS.length]);
      var dYaw = shortestAngle(yaw, target.yaw);
      var dPitch = target.pitch - pitch;
      var span = Math.max(Math.abs(dYaw), Math.abs(dPitch));
      tour = {
        fromYaw: yaw, fromPitch: pitch,
        dYaw: dYaw, dPitch: dPitch,
        t: 0,
        dur: Math.max(200, (span / TOUR_RAD_PER_SEC) * 1000)
      };
    }

    function advanceTour(dt) {
      tour.t += (dt * 1000) / tour.dur;
      if (tour.t >= 1) {
        yaw = tour.fromYaw + tour.dYaw;
        pitch = tour.fromPitch + tour.dPitch;
        tourStep++;
        beginTourLeg();                 /* 止まらずに次の区間へ */
      } else {
        yaw = tour.fromYaw + tour.dYaw * tour.t;
        pitch = tour.fromPitch + tour.dPitch * tour.t;
      }
    }

    function startTour() {
      tourStep = 0;
      beginTourLeg();
      requestRender();
    }

    /** 操作があった。巡回を止めて、無操作タイマーを測り直す */
    function noteActivity() {
      tour = null;
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (reduceMotion) return;         /* 視差効果を減らす設定では回さない */
      idleTimer = setTimeout(function () {
        idleTimer = null;
        if (document.hidden) return;    /* 見えていないときは回さない */
        startTour();
      }, IDLE_MS);
    }

    labelHost.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('.label--cat') : null;
      if (!link) return;
      /* 修飾キー付きクリック（別タブで開く等）はブラウザに任せる */
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      e.preventDefault();
      markInteracted();

      var href = link.getAttribute('href');
      if (reduceMotion || !snapTo(link.dataset.cat)) {
        window.location.href = href;
        return;
      }

      /* 正面に寄せる演出を見せてから遷移する。
         描画ループ（rAF）はタブが非表示だと止まるので、遷移はタイマーで行う。 */
      setTimeout(function () { window.location.href = href; }, SNAP_MS + 30);
    });

    /* ---------------- その他 ---------------- */

    function markInteracted() {
      noteActivity();
      if (userInteracted) return;
      userInteracted = true;
      var hint = document.getElementById('hint');
      if (hint) hint.classList.add('is-hidden');
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });

    /* タブが見えていないあいだは描画しない */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        tour = null;
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      } else {
        noteActivity();
        requestRender();
      }
    });

    resize();
    drawFrame();

    return {
      animateIn: function (duration) {
        if (reduceMotion) {
          introScale = 1; introOpacity = 1;
          requestRender();
          return;
        }
        intro = { start: performance.now(), dur: duration || 1100 };
        noteActivity();      /* ここから無操作時間の計測を始める */
        requestRender();
      },
      render: requestRender
    };
  }

  /* ---------------- 起動 ---------------- */

  buildFallbackNav();

  if (!hasWebGL()) {
    document.body.classList.add('no-webgl');
    window.HIDDSphere = { animateIn: function () {}, render: function () {} };
  } else {
    window.HIDDSphere = createSphere();
  }
})();
