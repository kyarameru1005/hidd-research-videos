/**
 * HIDD — トップページ（星の球体 ＋ 放置時の自動再生）
 *
 * ・動画 1 本 = 星 1 つ。同じカテゴリの星を 1 等星のまわりに散らし、線で結んで星座にする
 * ・1 等星＝カテゴリ。押すとそのカテゴリを選択し、周りの動画の星が浮かび上がる
 * ・小さな星を押すと、その星からカードが生えて動画が再生される
 * ・操作がないと IDLE_MS 後に球体が巡回を始め、さらに PLAY_MS 後に動画を自動再生する
 * ・再生が終わったら次の動画へ。どこかを触れば即座に止まる（＝人が操作を取り戻す）
 *
 * 展示（無人ディスプレイ）を主眼に置いているので、以下を守っている。
 *   - 進行に関わる処理は setTimeout で出す（rAF はタブ非表示だと止まるため）
 *   - 再生が進まなくなったら次へ送る（1 本読めないだけで止まらないように）
 *   - 音は最初から出す。ブラウザに止められたらミュートで再生を続け、
 *     一度でも操作があればそこで音を戻す（docs/operations.md を参照）
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;
  var TAU = Math.PI * 2;
  var HALF_PI = Math.PI / 2;
  var BRAND_R = 1.02;

  /* 星は球面ちょうど（半径 1.0）に置く。
     以前は 1.04 / 1.05 と少し浮かせていたが、これは旧 sphere.js の名残だった。
     当時マーカーは 3D の THREE.Points で、球に隠れないよう輪郭の外へ押し出す
     必要があった（docs/decisions.md 参照）。今の星はキャンバスの上に重ねた
     HTML 要素なので球に隠れることはなく、浮かせるとズームで寄ったときに
     星だけが輪郭の外へ離れていってしまう。 */
  var STAR_R = 1.0;
  var MAJOR_R = 1.0;

  var STORE = 'hidd.pos.';        /* 再生位置の保存キー */

  /* ---------------- 展示の設定（固定値） ---------------- */

  var IDLE_MS = 5000;             /* 操作が止まってから球体が回り出すまで */
  var PLAY_MS = 5000;             /* 回り出してから動画を再生するまで */
  var STALL_MS = 12000;           /* これだけ再生が進まなければ次の動画へ */
  var TOUR_RAD_PER_SEC = 0.35;
  var SNAP_MS = 620;

  /* 手を離したあとの減衰。1 に近いほど長く回り続ける。
     0.84 は半減期およそ 4 秒（demo/inertia.html の「重い（弾み車）」）。 */
  var FRICTION = 0.84;

  /* ズーム（カメラを球の中心へ寄せる・引く）の範囲 */
  var CAM_DEFAULT = 3.6;
  var CAM_MIN = 1.75;
  var CAM_MAX = 7.0;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 回転まわりの計算は js/geometry.js に集約している */
  var G = window.HIDDGeom;
  var clamp = G.clamp, smoothstep = G.smoothstep, easeInOutCubic = G.easeInOutCubic,
      shortestAngle = G.shortestAngle, facingAngles = G.facingAngles, hasWebGL = G.hasWebGL;

  /* 再現性のある擬似乱数（読み込むたびに星の配置が変わらないように） */
  function seeded(seed) {
    var s = seed >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ---------------- 星の座標を決める ---------------- */

  function norm(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  /** カテゴリ方向 d を中心に、円錐状に散らした向きを返す */
  function scatter(d, theta, phi) {
    var ref = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    var u = norm(cross(ref, d));
    var v = cross(d, u);
    var st = Math.sin(theta), ct = Math.cos(theta);
    return norm([
      d[0] * ct + (u[0] * Math.cos(phi) + v[0] * Math.sin(phi)) * st,
      d[1] * ct + (u[1] * Math.cos(phi) + v[1] * Math.sin(phi)) * st,
      d[2] * ct + (u[2] * Math.cos(phi) + v[2] * Math.sin(phi)) * st
    ]);
  }

  var rnd = seeded(20260908);
  var ENTRIES = [];   /* 星 1 つ = 動画 1 本 */

  DATA.categories.forEach(function (cat, ci) {
    var d = DATA.direction(ci);
    var n = cat.videos.length;
    cat.videos.forEach(function (video, vi) {
      /* 中心から 26〜38 度。カテゴリ同士は 90 度離れているので、
         38 度までなら隣の星座と混ざらない（90 - 38*2 = 14 度の間隔が残る）。 */
      var theta = (26 + rnd() * 12) * Math.PI / 180;
      var phi = (vi / n) * TAU + ci * 0.6;
      ENTRIES.push({
        id: cat.id + '-' + (vi + 1),
        cat: cat,
        catIndex: ci,
        video: video,
        file: DATA.videoFile(video),
        dir: scatter(d, theta, phi)
      });
    });
  });

  /* ---------------- 要素 ---------------- */

  var host = document.getElementById('sphereCanvas');
  var overlay = document.getElementById('overlay');
  var svg = document.getElementById('constellations');
  var statusEl = document.getElementById('status');
  var sphereWrap = document.getElementById('sphereWrap');

  var grow = document.getElementById('grow');
  var growLab = document.getElementById('growLab');
  var growTitle = document.getElementById('growTitle');
  var growSummary = document.getElementById('growSummary');
  var growPlayer = document.getElementById('growPlayer');
  var growProgress = document.getElementById('growProgress');

  /** キーボードと支援技術、および WebGL 非対応時の正規の導線 */
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

  buildFallbackNav();

  if (!hasWebGL()) {
    document.body.classList.add('no-webgl');
    window.HIDDSphere = { animateIn: function () {}, render: function () {} };
    return;
  }

  /* ---------------- 3D ---------------- */

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  var camZ = CAM_DEFAULT;
  camera.position.set(0, 0, camZ);

  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  var group = new THREE.Group();
  scene.add(group);
  var sphereMat = HIDDTexture.materials.quad();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), sphereMat));

  /* ---------------- HTML アンカー ---------------- */

  var anchors = [];

  function addAnchor(el, dir, radius, kind, entry) {
    var obj = new THREE.Object3D();
    obj.position.set(dir[0] * radius, dir[1] * radius, dir[2] * radius);
    group.add(obj);
    var a = { el: el, obj: obj, kind: kind, entry: entry || null,
              world: new THREE.Vector3(), x: 0, y: 0, vis: 0 };
    anchors.push(a);
    if (entry) entry.anchor = a;   /* 星座線が座標を参照できるようにする */
    return a;
  }

  addAnchor(overlay.querySelector('[data-anchor="brand"]'), [0, 0, 1], BRAND_R, 'brand');

  /* 1 等星 = カテゴリ。周りの小さな星がそのカテゴリの動画になる */
  var MAJORS = [];
  DATA.categories.forEach(function (cat, ci) {
    var el = document.createElement('div');
    el.className = 'star star--major is-twinkle';
    el.style.setProperty('--star', cat.accent);
    el.style.setProperty('--dur', '4.2s');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', cat.label + ' の動画一覧を開く');

    var spikes = document.createElement('span');
    spikes.className = 'star__spikes';
    el.appendChild(spikes);

    var name = document.createElement('span');
    name.className = 'star__name';
    name.textContent = cat.label;
    el.appendChild(name);

    overlay.appendChild(el);
    var a = addAnchor(el, DATA.direction(ci), MAJOR_R, 'major');
    a.nameEl = name;

    var major = { cat: cat, ci: ci, el: el, anchor: a };
    MAJORS.push(major);
    /* 吹き出しを星座の中心から外向きに出すため、親を覚えさせる */
    ENTRIES.forEach(function (x) { if (x.catIndex === ci) x.majorAnchor = a; });

    el.addEventListener('click', function (e) {
      e.stopPropagation();
      noteActivity();
      goToCategory(major);
    });
  });

  ENTRIES.forEach(function (entry) {
    var el = document.createElement('div');
    el.className = 'star is-twinkle';
    el.style.setProperty('--star', entry.cat.accent);
    el.style.setProperty('--dur', (2.6 + rnd() * 2.6).toFixed(2) + 's');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', entry.video.title);

    var tip = document.createElement('span');
    tip.className = 'star__tip star__tip--below';   /* 向きは updateOverlay が決め直す */
    tip.textContent = entry.video.title;
    el.appendChild(tip);

    overlay.appendChild(el);
    entry.el = el;
    addAnchor(el, entry.dir, STAR_R, 'star', entry);

    el.addEventListener('click', function (e) {
      e.stopPropagation();
      noteActivity();
      pickAndPlay(entry);
    });
  });

  /* 星座線: 1 等星から、その周りの動画の星へ放射状に引く（親子関係が見えるように） */
  var LINES = [];
  MAJORS.forEach(function (major) {
    ENTRIES.filter(function (x) { return x.catIndex === major.ci; }).forEach(function (entry) {
      var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('stroke', major.cat.accent);
      svg.appendChild(ln);
      LINES.push({ el: ln, from: major.anchor, to: entry });
    });
  });

  /* ---------------- 状態 ---------------- */

  var yaw = 0, pitch = 0, velYaw = 0, velPitch = 0;
  var dragging = false, pointerId = null, lastX = 0, lastY = 0, lastT = 0;
  var snap = null, tour = null, tourStep = 0;
  var running = false, lastFrame = 0, width = 1, height = 1;
  var phase = 'idle';            /* idle | tour | playing */
  var idleTimer = null, playTimer = null;
  var current = null;            /* 再生中のエントリ */
  var watchdog = null;           /* 再生が進まないときに次へ送る番人 */
  var bag = null;                /* 未再生の動画（シャッフル済み）。null は未初期化 */

  var intro = null;
  var introScale = reduceMotion ? 1 : 0.001;
  var introOpacity = reduceMotion ? 1 : 0;

  var TOUR_STOPS = (function () {
    var l = [[0, 0, 1]];
    for (var i = 0; i < DATA.categories.length; i++) l.push(DATA.direction(i));
    return l;
  })();

  /* ---------------- 描画 ---------------- */

  function resize() {
    var r = host.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    requestRender();
  }

  var tmp = new THREE.Vector3();

  function updateOverlay() {
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      a.obj.getWorldPosition(a.world);
      var radius = a.obj.position.length();
      var depth = clamp(a.world.z / radius, -1, 1);

      tmp.copy(a.world).project(camera);
      a.x = (tmp.x * 0.5 + 0.5) * width;
      a.y = (-tmp.y * 0.5 + 0.5) * height;

      if (a.kind === 'star' || a.kind === 'major') {
        /* 星は手前半球ではしっかり見え、輪郭を回り込んだところで消える */
        a.vis = smoothstep(-0.28, 0.12, depth) * introOpacity;
        var sc = (0.7 + 0.6 * ((depth + 1) / 2)) * introScale;
        a.el.style.transform = 'translate3d(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px,0) scale(' + sc.toFixed(2) + ')';
        a.el.style.opacity = a.vis.toFixed(3);
        a.el.style.zIndex = String(Math.round((depth + 1) * 100));
        a.el.classList.toggle('is-back', a.vis < 0.25);
        /* カテゴリ名は 1 等星が正面を向いたときだけ出す */
        if (a.nameEl) a.nameEl.style.opacity = (smoothstep(0.45, 0.9, depth) * introOpacity).toFixed(3);
        /* 吹き出しは星座の中心（1 等星）から見て外向きに出す。
           中央のカテゴリ名や隣の吹き出しと重ならないようにするため。 */
        if (a.kind === 'star' && a.entry && a.entry.majorAnchor) {
          var mdx = a.x - a.entry.majorAnchor.x;
          var mdy = a.y - a.entry.majorAnchor.y;
          var side = Math.abs(mdx) > Math.abs(mdy)
            ? (mdx < 0 ? 'left' : 'right')
            : (mdy < 0 ? 'above' : 'below');
          if (a.tipSide !== side) {
            a.tipSide = side;
            var t = a.el.firstElementChild;
            if (t) t.className = 'star__tip star__tip--' + side;
          }
        }
      } else {
        /* HIDD は正面を向いたときだけ */
        a.vis = smoothstep(0.55, 0.93, depth) * introOpacity;
        a.el.style.transform = 'translate3d(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px,0) translate(-50%,-50%)';
        a.el.style.opacity = a.vis.toFixed(3);
      }
    }

    for (var k = 0; k < LINES.length; k++) {
      var L = LINES[k];
      var pa = L.from, pb = L.to.anchor;
      if (!pa || !pb) continue;
      L.el.setAttribute('x1', pa.x.toFixed(1)); L.el.setAttribute('y1', pa.y.toFixed(1));
      L.el.setAttribute('x2', pb.x.toFixed(1)); L.el.setAttribute('y2', pb.y.toFixed(1));
      L.el.setAttribute('opacity', (Math.min(pa.vis, pb.vis) * 0.75).toFixed(3));
    }
  }

  function drawFrame() {
    pitch = clamp(pitch, -HALF_PI, HALF_PI);
    group.rotation.set(pitch, yaw, 0);
    group.scale.setScalar(introScale);
    group.updateMatrixWorld(true);
    sphereMat.uniforms.uFade.value = introOpacity;
    renderer.render(scene, camera);
    updateOverlay();
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

    /* 入場アニメーション（見た目だけ。進行は intro.js の setTimeout 側が持つ） */
    if (intro) {
      var it = clamp((now - intro.start) / intro.dur, 0, 1);
      introScale = 0.001 + easeInOutCubic(it) * 0.999;
      introOpacity = clamp((it - 0.25) / 0.55, 0, 1);
      if (it >= 1) { intro = null; introScale = 1; introOpacity = 1; }
      else busy = true;
    }

    if (snap) {
      var st = clamp((now - snap.start) / snap.dur, 0, 1);
      var e = easeInOutCubic(st);
      yaw = snap.fromYaw + snap.dYaw * e;
      pitch = snap.fromPitch + snap.dPitch * e;
      if (st >= 1) snap = null;
      else busy = true;
    } else if (dragging) {
      busy = true;
    } else if (tour) {
      tour.t += (dt * 1000) / tour.dur;
      if (tour.t >= 1) {
        yaw = tour.fromYaw + tour.dYaw;
        pitch = tour.fromPitch + tour.dPitch;
        tourStep++;
        beginTourLeg();
      } else {
        yaw = tour.fromYaw + tour.dYaw * tour.t;
        pitch = tour.fromPitch + tour.dPitch * tour.t;
      }
      busy = true;
    } else if (Math.abs(velYaw) > 0.0004 || Math.abs(velPitch) > 0.0004) {
      /* 手を離したあとの惰性。FRICTION が 1 に近いほど長く回り続ける */
      yaw += velYaw * dt; pitch += velPitch * dt;
      velYaw *= Math.pow(FRICTION, dt); velPitch *= Math.pow(FRICTION, dt);
      busy = true;
    } else { velYaw = 0; velPitch = 0; }

    drawFrame();
    if (busy) requestAnimationFrame(frame); else running = false;
  }

  /* ---------------- 巡回 ---------------- */

  function beginTourLeg() {
    /* 巡回とスナップの最中は惰性を進めない。消しておかないと、
       終わった瞬間に古い速度で回り出す（減衰が弱いほど派手に出る）。 */
    velYaw = 0; velPitch = 0;
    var t = facingAngles(TOUR_STOPS[tourStep % TOUR_STOPS.length]);
    var dYaw = shortestAngle(yaw, t.yaw);
    var dPitch = t.pitch - pitch;
    var span = Math.max(Math.abs(dYaw), Math.abs(dPitch));
    tour = { fromYaw: yaw, fromPitch: pitch, dYaw: dYaw, dPitch: dPitch, t: 0,
             dur: Math.max(200, (span / TOUR_RAD_PER_SEC) * 1000) };
  }

  function snapTo(dir) {
    velYaw = 0; velPitch = 0;
    var t = facingAngles(dir);
    snap = {
      fromYaw: yaw, fromPitch: pitch,
      dYaw: shortestAngle(yaw, t.yaw), dPitch: t.pitch - pitch,
      start: performance.now(), dur: SNAP_MS
    };
    tour = null;
    requestRender();
  }

  /* ---------------- ズーム ----------------
     カメラを球の中心へ寄せる・引くだけ（dolly）。
     星の見え隠れは depth = world.z / radius（ワールド座標の前後方向）で決めていて
     カメラ距離に依存しないので、見え方の計算式には手を入れていない。 */

  var pinchPointers = new Map();
  var pinchDist = null;

  function pinchDistance() {
    var pts = Array.from(pinchPointers.values());
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function setZoom(z) {
    var next = clamp(z, CAM_MIN, CAM_MAX);
    if (next === camZ) return;
    camZ = next;
    camera.position.z = camZ;
    requestRender();
  }

  /* ---------------- カテゴリの選択（1 等星） ----------------
     押すと、その星を正面へ寄せてからカテゴリの一覧ページへ移動する。
     rAF はタブが非表示だと止まるので、遷移はスナップの完了ではなく
     setTimeout で出す（CLAUDE.md の制約と同じ理由）。 */

  function goToCategory(major) {
    major.el.classList.add('is-picked');
    snapTo(DATA.direction(major.ci));
    setPhase('idle');
    setTimeout(function () {
      window.location.href = 'category.html?cat=' + encodeURIComponent(major.cat.id);
    }, SNAP_MS + 30);
  }

  /* ---------------- 再生 ---------------- */

  function shuffled() {
    var a = ENTRIES.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function nextEntry() {
    if (!bag || !bag.length) bag = shuffled();
    return bag.pop();
  }

  /** 直接クリックで再生した動画も「再生済み」として扱う */
  function markPlayed(entry) {
    if (!bag) bag = shuffled();
    var i = bag.indexOf(entry);
    if (i >= 0) bag.splice(i, 1);
  }

  function savedPos(entry) {
    try {
      var v = parseFloat(localStorage.getItem(STORE + entry.id) || '0');
      return isFinite(v) ? v : 0;
    } catch (e) { return 0; }
  }

  function pickAndPlay(entry) {
    markPlayed(entry);
    current = entry;
    ENTRIES.forEach(function (x) { x.el.classList.toggle('is-picked', x === entry); });
    /* 選んだ星を正面へ寄せてから生やす。
       描画ループ（rAF）はタブが非表示だと止まるので、カードを開く合図は
       スナップの完了ではなくタイマーで出す。 */
    snapTo(entry.dir);
    setPhase('playing');
    setTimeout(function () {
      if (phase === 'playing' && current === entry) openCard(entry);
    }, SNAP_MS + 40);
  }

  function openCard(entry) {
    grow.style.setProperty('--cat', entry.cat.accent);
    growLab.textContent = entry.cat.label;
    growTitle.textContent = entry.video.title;
    growSummary.textContent =
      (entry.video.presenter ? entry.video.presenter + ' — ' : '') + (entry.video.summary || '');
    growProgress.style.width = '0%';
    growPlayer.innerHTML = '';
    grow.hidden = false;
    sphereWrap.classList.add('is-playing');

    /* カードは星の位置（正面＝中央）から生える。
       hidden を外した直後に class を足すと transition が走らないので 1 拍置くが、
       rAF はタブが非表示だと止まってカードが開かないままになる。必ず setTimeout で。 */
    setTimeout(function () { grow.classList.add('is-open'); }, 20);

    if (entry.file) {
      playLocal(entry);
    } else {
      playMissing(entry);
    }
  }

  /** ローカル動画。自動再生・終了検知・再生位置の復元ができる */
  function playLocal(entry) {
    var v = document.createElement('video');
    v.src = entry.file;
    v.playsInline = true;
    v.preload = 'metadata';
    v.controls = true;
    v.muted = false;              /* まず音ありで試す */
    growPlayer.appendChild(v);

    var resumeAt = savedPos(entry);
    v.addEventListener('loadedmetadata', function () {
      if (resumeAt > 1 && resumeAt < v.duration - 2) v.currentTime = resumeAt;
    });

    var lastSave = 0;
    v.addEventListener('timeupdate', function () {
      if (v.duration) growProgress.style.width = (v.currentTime / v.duration * 100).toFixed(1) + '%';
      var now = performance.now();
      if (now - lastSave > 1000) {
        lastSave = now;
        try { localStorage.setItem(STORE + entry.id, String(v.currentTime)); } catch (e) {}
      }
    });

    v.addEventListener('ended', function () {
      try { localStorage.removeItem(STORE + entry.id); } catch (e) {}
      if (phase === 'playing') setTimeout(function () { if (phase === 'playing') autoNext(); }, 900);
    });

    v.addEventListener('error', function () {
      if (phase === 'playing') { stopWatchdog(); autoNext(); }
    });

    startWatchdog(function () { return v.currentTime; });

    var p = v.play();
    if (p && p.catch) {
      p.catch(function () {
        /* 音ありを止められた。無音でなら自動再生できるので、まずそちらへ倒す。
           無人展示で「再生できないまま次々スキップされる」のを避けるため。
           音は最初の操作で戻す（unlockSound）。 */
        if (!v.muted) {
          v.muted = true;
          var retry = v.play();
          if (retry && retry.catch) retry.catch(showBlocked);
        } else {
          showBlocked();
        }
      });
    }

    function showBlocked() {
      var note = document.createElement('div');
      note.className = 'no-file';
      note.textContent = 'ブラウザが自動再生を止めました。再生ボタンを押してください。';
      growPlayer.appendChild(note);
    }
  }

  /** 動画ファイル未配置。再生のしようがないので stall 監視の時間切れで次へ送る */
  function playMissing(entry) {
    var msg = document.createElement('div');
    msg.className = 'no-file';
    msg.textContent = '動画ファイルが未配置です。'
      + (STALL_MS / 1000) + ' 秒で次へ送ります。';
    growPlayer.appendChild(msg);

    startWatchdog(function () { return 0; });
  }

  /**
   * 再生が進まなくなったら次へ送る。
   * 無人展示では、1 本読み込めなかっただけで永久に止まるのが一番困るため。
   */
  function startWatchdog(getTime) {
    stopWatchdog();
    var lastT = -1, lastMove = performance.now();
    watchdog = setInterval(function () {
      if (phase !== 'playing') { stopWatchdog(); return; }
      var t = getTime();
      if (t !== lastT) { lastT = t; lastMove = performance.now(); }
      if (performance.now() - lastMove > STALL_MS) {
        stopWatchdog();
        autoNext();
      }
    }, 1000);
  }

  function stopWatchdog() {
    if (watchdog) { clearInterval(watchdog); clearTimeout(watchdog); watchdog = null; }
  }

  function closeCard() {
    stopWatchdog();
    grow.classList.remove('is-open');
    sphereWrap.classList.remove('is-playing');
    var v = growPlayer.querySelector('video');
    if (v) { try { v.pause(); } catch (e) {} }
    setTimeout(function () {
      if (!grow.classList.contains('is-open')) { grow.hidden = true; growPlayer.innerHTML = ''; }
    }, 320);
    ENTRIES.forEach(function (x) { x.el.classList.remove('is-picked'); });
    current = null;
  }

  function autoNext() {
    closeCard();
    setTimeout(function () { if (phase === 'playing') pickAndPlay(nextEntry()); }, 380);
  }

  /* ---------------- 音声のロック解除 ----------------
     ブラウザは音ありの自動再生を、その場での操作なしには許可しない。
     ただし一度でもクリック・タップ・キー操作があれば、そのタブでは
     以降ずっと解除されたままになる（ページを再読み込みするまで）。
     展示を始めるときに画面へ 1 回触れてもらえば、そのあとは無人でも音つきで流れる。

     誰も触らずに音を出したい場合は、ブラウザ側の自動再生ポリシーを切って
     起動する必要がある。手順は docs/operations.md に書いてある。 */
  function unlockSound() {
    var v = growPlayer.querySelector('video');
    if (v && v.muted) {
      v.muted = false;
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    }
  }
  document.addEventListener('pointerdown', unlockSound, { once: true });
  document.addEventListener('keydown', unlockSound, { once: true });

  /* ---------------- 放置の状態遷移 ---------------- */

  function setPhase(p) {
    phase = p;
    updateStatus();
  }

  function updateStatus() {
    if (!statusEl) return;
    if (phase === 'playing') {
      statusEl.classList.add('is-live');
      statusEl.innerHTML = '再生中: <b>' + (current ? current.video.title : '') + '</b>';
    } else if (phase === 'tour') {
      statusEl.classList.add('is-live');
      statusEl.textContent = '動画を選んでいます…';
    } else {
      statusEl.classList.remove('is-live');
      statusEl.textContent = 'ドラッグで回す ／ ホイールかピンチで拡大 ／ 明るい星がカテゴリ、小さな星が動画';
    }
  }

  function clearTimers() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  }

  /**
   * 操作があった。全部止めて測り直す。
   *
   * 進行は rAF ではなく setTimeout に持たせている。タブが非表示のあいだは
   * 描画も再生も止まるので、そこで動き出さないよう document.hidden も見る。
   */
  function noteActivity() {
    clearTimers();
    tour = null;
    if (phase === 'playing') closeCard();
    setPhase('idle');
    if (reduceMotion) return;
    idleTimer = setTimeout(function () {
      idleTimer = null;
      if (document.hidden) return;
      /* 無人展示では、来場者が寄せたままの倍率で放置されると
         そのあとずっと寄ったままになる。巡回に戻るときに既定へ戻す。 */
      setZoom(CAM_DEFAULT);
      setPhase('tour');
      tourStep = 0;
      beginTourLeg();
      requestRender();
      playTimer = setTimeout(function () {
        playTimer = null;
        if (document.hidden) return;
        pickAndPlay(nextEntry());
      }, PLAY_MS);
    }, IDLE_MS);
  }

  /* ---------------- 操作 ---------------- */

  var DRAG_K = 0.006;

  host.addEventListener('pointerdown', function (e) {
    pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    /* 指が 2 本になったらピンチ。回転は止めてズームに切り替える */
    if (pinchPointers.size >= 2) {
      dragging = false;
      pinchDist = pinchDistance();
      noteActivity();
      return;
    }
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true; pointerId = e.pointerId;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    velYaw = 0; velPitch = 0; snap = null;
    noteActivity();
    host.classList.add('is-dragging');
    if (host.setPointerCapture) { try { host.setPointerCapture(e.pointerId); } catch (err) {} }
    requestRender();
  });

  host.addEventListener('pointermove', function (e) {
    if (pinchPointers.has(e.pointerId)) pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchPointers.size >= 2) {
      var d = pinchDistance();
      if (pinchDist !== null) setZoom(camZ - (d - pinchDist) * 0.012 * camZ);
      pinchDist = d;
      return;
    }
    if (!dragging || e.pointerId !== pointerId) return;
    var now = performance.now();
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    var dt = Math.max((now - lastT) / 1000, 0.001);
    yaw += dx * DRAG_K;
    pitch = clamp(pitch + dy * DRAG_K, -HALF_PI, HALF_PI);
    velYaw = (dx * DRAG_K) / dt; velPitch = (dy * DRAG_K) / dt;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
    requestRender();
  });

  function endDrag(e) {
    pinchPointers.delete(e.pointerId);
    if (pinchPointers.size < 2) pinchDist = null;

    if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    dragging = false; pointerId = null;
    host.classList.remove('is-dragging');
    if (performance.now() - lastT > 90) { velYaw = 0; velPitch = 0; }
    velYaw = clamp(velYaw, -6, 6); velPitch = clamp(velPitch, -6, 6);
    noteActivity();
    requestRender();
  }
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);
  host.addEventListener('lostpointercapture', endDrag);

  /* ホイールでズーム。Ctrl 併用はブラウザのページ拡大操作なので横取りしない */
  host.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;
    e.preventDefault();
    setZoom(camZ + e.deltaY * 0.0022 * camZ);
    noteActivity();
  }, { passive: false });

  host.addEventListener('keydown', function (e) {
    var step = 0.22, ok = true;
    if (e.key === 'ArrowLeft') yaw -= step;
    else if (e.key === 'ArrowRight') yaw += step;
    else if (e.key === 'ArrowUp') pitch = clamp(pitch - step, -HALF_PI, HALF_PI);
    else if (e.key === 'ArrowDown') pitch = clamp(pitch + step, -HALF_PI, HALF_PI);
    else if (e.key === '+' || e.key === '=') { setZoom(camZ * 0.9); noteActivity(); ok = false; }
    else if (e.key === '-' || e.key === '_') { setZoom(camZ / 0.9); noteActivity(); ok = false; }
    else ok = false;
    if (ok) { e.preventDefault(); noteActivity(); snap = null; requestRender(); }
  });

  document.getElementById('growClose').addEventListener('click', function () { noteActivity(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') noteActivity(); });

  /* ---------------- その他 ---------------- */

  var rt = null;
  window.addEventListener('resize', function () {
    if (rt) clearTimeout(rt);
    rt = setTimeout(function () { resize(); drawFrame(); }, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimers(); tour = null; }
    else { noteActivity(); requestRender(); }
  });

  resize();
  drawFrame();
  updateStatus();

  /* 入場アニメーションの合図は intro.js が出す（rAF に紐づけない） */
  window.HIDDSphere = {
    animateIn: function (duration) {
      if (reduceMotion) {
        introScale = 1; introOpacity = 1;
      } else {
        intro = { start: performance.now(), dur: duration || 1100 };
      }
      noteActivity();      /* ここから無操作時間の計測を始める */
      requestRender();
    },
    render: requestRender
  };
})();
