/**
 * HIDD — 星 + 放置時の自動再生 デモ（検討用）
 *
 * ・動画 1 本 = 星 1 つ。同じカテゴリの星をカテゴリ方向のまわりに散らし、線で結んで星座にする
 * ・一定時間操作がないと球体が巡回を始め、さらに一定時間後にランダムな星を選ぶ
 * ・選んだ星を正面へ寄せてからカードを「生やし」、動画を再生する
 * ・再生が終わったら次の動画へ。どこかを触れば即座に止まる
 *
 * 再生方式は 2 通りを自動で使い分ける。
 *   file  あり -> <video>。自動再生・再生終了の検知・再生位置の復元ができる
 *   file  なし -> Google ドライブの iframe。別オリジンなので JS から制御できず、自動再生できない
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;
  var TAU = Math.PI * 2;
  var HALF_PI = Math.PI / 2;
  var LABEL_R = 1.16;
  var BRAND_R = 1.02;
  var STAR_R = 1.04;
  var MAJOR_R = 1.05;
  var STORE = 'hidd.demo.pos.';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 回転まわりの計算は ../src/js/geometry.js に集約している */
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
      var phi = (vi / n) * TAU + ci * 0.6;                 /* 4 本を 90 度ずつ均等に */
      ENTRIES.push({
        id: cat.id + '-' + (vi + 1),
        cat: cat,
        catIndex: ci,
        video: video,
        /* デモ用の確認動画。本番では src/js/data.js の video.file を使う */
        file: '../src/videos/sample/' + cat.id + '-0' + (vi + 1) + '.mp4',
        dir: scatter(d, theta, phi)
      });
    });
  });

  /* ---------------- 起動 ---------------- */

  var stage = document.getElementById('stage');
  var host = document.getElementById('sphereCanvas');
  var overlay = document.getElementById('overlay');
  var svg = document.getElementById('constellations');
  var statusEl = document.getElementById('status');
  var navList = document.getElementById('navList');

  var grow = document.getElementById('grow');
  var growCard = document.getElementById('growCard');
  var growLab = document.getElementById('growLab');
  var growTitle = document.getElementById('growTitle');
  var growSummary = document.getElementById('growSummary');
  var growPlayer = document.getElementById('growPlayer');
  var growProgress = document.getElementById('growProgress');

  DATA.categories.forEach(function (cat) {
    var li = document.createElement('li');
    var span = document.createElement('span');
    span.className = 'chip';
    span.style.setProperty('--cat', cat.accent);
    span.innerHTML = '';
    span.appendChild(document.createTextNode(cat.label + ' '));
    var b = document.createElement('b');
    b.textContent = '(' + cat.videos.length + ')';
    span.appendChild(b);
    li.appendChild(span);
    navList.appendChild(li);
  });

  if (!hasWebGL()) {
    document.getElementById('fallback').hidden = false;
    return;
  }

  /* ---------------- 3D ---------------- */

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 3.6);

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
    el.setAttribute('aria-label', cat.label + ' を選ぶ');

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
      focusCategory(ci);
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
  var running = false, lastFrame = 0, width = 1, height = 1, rect = { left: 0, top: 0 };
  var showLines = true, twinkle = true, muted = true;
  var idleMs = 5000, playMs = 4000;
  var phase = 'idle';            /* idle | tour | playing */
  var idleTimer = null, playTimer = null;
  var current = null;            /* 再生中のエントリ */
  var watchdog = null;           /* 再生が進まないときに次へ送る番人 */
  var STALL_MS = 12000;          /* これだけ進捗が無ければ次の動画へ */
  var bag = null;   /* 未再生の動画（シャッフル済み）。null は未初期化 */

  var TOUR_RAD_PER_SEC = 0.35;
  var TOUR_STOPS = (function () {
    var l = [[0, 0, 1]];
    for (var i = 0; i < DATA.categories.length; i++) l.push(DATA.direction(i));
    return l;
  })();

  /* ---------------- 描画 ---------------- */

  function resize() {
    var r = host.getBoundingClientRect();
    rect = r;
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
        a.vis = smoothstep(-0.28, 0.12, depth);
        var sc = 0.7 + 0.6 * ((depth + 1) / 2);
        a.el.style.transform = 'translate3d(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px,0) scale(' + sc.toFixed(2) + ')';
        a.el.style.opacity = a.vis.toFixed(3);
        a.el.style.zIndex = String(Math.round((depth + 1) * 100));
        a.el.classList.toggle('is-back', a.vis < 0.25);
        /* カテゴリ名は 1 等星が正面を向いたときだけ出す */
        if (a.nameEl) a.nameEl.style.opacity = smoothstep(0.45, 0.9, depth).toFixed(3);
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
            var tip = a.el.firstElementChild;
            if (tip) tip.className = 'star__tip star__tip--' + side;
          }
        }
      } else {
        /* HIDD は正面を向いたときだけ */
        a.vis = smoothstep(0.55, 0.93, depth);
        a.el.style.transform = 'translate3d(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px,0) translate(-50%,-50%)';
        a.el.style.opacity = a.vis.toFixed(3);
      }
    }

    for (var k = 0; k < LINES.length; k++) {
      var L = LINES[k];
      var pa = L.from, pb = L.to.anchor;
      if (!pa || !pb) continue;
      var o = showLines ? Math.min(pa.vis, pb.vis) * 0.75 : 0;
      L.el.setAttribute('x1', pa.x.toFixed(1)); L.el.setAttribute('y1', pa.y.toFixed(1));
      L.el.setAttribute('x2', pb.x.toFixed(1)); L.el.setAttribute('y2', pb.y.toFixed(1));
      L.el.setAttribute('opacity', o.toFixed(3));
    }
  }

  function drawFrame() {
    pitch = clamp(pitch, -HALF_PI, HALF_PI);
    group.rotation.set(pitch, yaw, 0);
    group.updateMatrixWorld(true);
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
      yaw += velYaw * dt; pitch += velPitch * dt;
      velYaw *= Math.pow(0.06, dt); velPitch *= Math.pow(0.06, dt);
      busy = true;
    } else { velYaw = 0; velPitch = 0; }

    drawFrame();
    if (busy) requestAnimationFrame(frame); else running = false;
  }

  /* ---------------- 巡回 ---------------- */

  function beginTourLeg() {
    var t = facingAngles(TOUR_STOPS[tourStep % TOUR_STOPS.length]);
    var dYaw = shortestAngle(yaw, t.yaw);
    var dPitch = t.pitch - pitch;
    var span = Math.max(Math.abs(dYaw), Math.abs(dPitch));
    tour = { fromYaw: yaw, fromPitch: pitch, dYaw: dYaw, dPitch: dPitch, t: 0,
             dur: Math.max(200, (span / TOUR_RAD_PER_SEC) * 1000) };
  }

  var SNAP_MS = 620;

  function snapTo(dir) {
    var t = facingAngles(dir);
    snap = {
      fromYaw: yaw, fromPitch: pitch,
      dYaw: shortestAngle(yaw, t.yaw), dPitch: t.pitch - pitch,
      start: performance.now(), dur: SNAP_MS
    };
    tour = null;
    requestRender();
  }

  /* ---------------- カテゴリの選択（1 等星） ---------------- */

  var focused = -1;

  function focusCategory(ci) {
    focused = (focused === ci) ? -1 : ci;
    applyFocus();
    if (focused >= 0) snapTo(DATA.direction(focused));
    requestRender();
  }

  function applyFocus() {
    MAJORS.forEach(function (m) {
      m.el.classList.toggle('is-focused', m.ci === focused);
      m.el.classList.toggle('is-dim', focused >= 0 && m.ci !== focused);
    });
    ENTRIES.forEach(function (x) {
      x.el.classList.toggle('is-focused', x.catIndex === focused);
      x.el.classList.toggle('is-dim', focused >= 0 && x.catIndex !== focused);
    });
    document.getElementById('sphereWrap').classList.toggle('has-focus', focused >= 0);
    if (focused >= 0) {
      var cat = DATA.categories[focused];
      statusEl.classList.add('is-live');
      statusEl.innerHTML = '<b>' + cat.label + '</b> を選択中 — 周りの星が ' +
        cat.videos.length + ' 本の動画です（もう一度押すと解除）' +
        ' <a class="sd-link" href="../src/category.html?cat=' + encodeURIComponent(cat.id) + '">一覧ページを開く →</a>';
    }
  }

  function clearFocus() {
    if (focused < 0) return;
    focused = -1;
    applyFocus();
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
    var v = parseFloat(localStorage.getItem(STORE + entry.id) || '0');
    return isFinite(v) ? v : 0;
  }

  function pickAndPlay(entry) {
    clearFocus();
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
    growSummary.textContent = (entry.video.presenter ? entry.video.presenter + ' — ' : '') + (entry.video.summary || '');
    growProgress.style.width = '0%';
    growPlayer.innerHTML = '';
    grow.hidden = false;
    document.getElementById('sphereWrap').classList.add('is-playing');

    /* カードは星の位置（正面＝中央）から生える */
    requestAnimationFrame(function () { grow.classList.add('is-open'); });

    if (entry.file) {
      var v = document.createElement('video');
      v.src = entry.file;
      v.playsInline = true;
      v.muted = muted;
      v.preload = 'metadata';
      v.controls = true;
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
          /* 音あり再生がブラウザに止められた場合、無音でなら自動再生できるので
             まずそちらへ切り替える。無人展示で再生できないまま止まるのを避けるため。 */
          if (!v.muted) {
            v.muted = true;
            var retry = v.play();
            if (retry && retry.catch) retry.catch(showBlockedNote);
          } else {
            showBlockedNote();
          }
        });
      }
      updateStatus();

      function showBlockedNote() {
        var note = document.createElement('div');
        note.className = 'no-file';
        note.textContent = 'ブラウザが自動再生を止めました。再生ボタンを押してください。';
        growPlayer.appendChild(note);
      }
    } else {
      var url = DATA.videoUrl(entry.video, 'preview');
      if (url) {
        var f = document.createElement('iframe');
        f.src = url;
        f.setAttribute('allow', 'autoplay; fullscreen');
        f.setAttribute('allowfullscreen', '');
        growPlayer.appendChild(f);
      }
      var msg = document.createElement('div');
      msg.className = 'no-file';
      msg.textContent = '動画ファイルが未配置のため Google ドライブ埋め込みです。別オリジンのため自動再生・終了検知ができません。20 秒で次へ送ります。';
      growPlayer.appendChild(msg);
      /* 終了を検知できないので時間で送るしかない */
      stopWatchdog();
      watchdog = setTimeout(function () {
        watchdog = null;
        if (phase === 'playing') autoNext();
      }, 20000);
    }
  }

  /* ---------------- 音声のロック解除 ----------------
     ブラウザは音ありの自動再生を、その場での操作なしには許可しない。
     ただし一度でもクリック・タップ・キー操作があれば、そのタブでは
     以降ずっと解除されたままになる（ページを再読み込みするまで）。
     展示を始めるときに画面へ 1 回触れてもらえば、それ以降は無人でも
     音つきで流れ続ける。 */
  function unlockSound() {
    if (muted) {
      muted = false;
      var seg = document.getElementById('segSound');
      if (seg) {
        seg.querySelectorAll('button').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.dataset.v === 'on'));
        });
      }
    }
    var v = growPlayer.querySelector('video');
    if (v && v.muted) {
      v.muted = false;
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    }
  }
  document.addEventListener('pointerdown', unlockSound, { once: true });
  document.addEventListener('keydown', unlockSound, { once: true });

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
        statusEl.innerHTML = '再生が進まないため次の動画へ送りました';
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
    document.getElementById('sphereWrap').classList.remove('is-playing');
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

  /* ---------------- 放置の状態遷移 ---------------- */

  function setPhase(p) {
    phase = p;
    updateStatus();
  }

  function updateStatus() {
    if (phase === 'idle') {
      statusEl.classList.remove('is-live');
      statusEl.innerHTML = '操作がないと <b>' + (idleMs / 1000) + '</b> 秒後に回り始めます';
    } else if (phase === 'tour') {
      statusEl.classList.add('is-live');
      statusEl.innerHTML = '回転中 — <b>' + (playMs / 1000) + '</b> 秒後にランダムな動画を選びます';
    } else {
      statusEl.classList.add('is-live');
      var left = bag ? bag.length : ENTRIES.length;
      statusEl.innerHTML = '再生中: <b>' + (current ? current.video.title : '') + '</b>（未再生の残り ' + left + ' 本）';
    }
  }

  function clearTimers() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  }

  /** 操作があった。全部止めて測り直す */
  function noteActivity() {
    clearTimers();
    tour = null;
    if (phase === 'playing') closeCard();
    setPhase('idle');
    if (reduceMotion) return;
    idleTimer = setTimeout(function () {
      idleTimer = null;
      if (document.hidden) return;
      setPhase('tour');
      tourStep = 0;
      beginTourLeg();
      requestRender();
      playTimer = setTimeout(function () {
        playTimer = null;
        if (document.hidden) return;
        pickAndPlay(nextEntry());
      }, playMs);
    }, idleMs);
  }

  /* ---------------- 操作 ---------------- */

  var DRAG_K = 0.006;

  host.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true; pointerId = e.pointerId;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    velYaw = 0; velPitch = 0; snap = null;
    clearFocus();
    noteActivity();
    host.classList.add('is-dragging');
    if (host.setPointerCapture) { try { host.setPointerCapture(e.pointerId); } catch (err) {} }
    requestRender();
  });
  host.addEventListener('pointermove', function (e) {
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

  host.addEventListener('keydown', function (e) {
    var step = 0.22, ok = true;
    if (e.key === 'ArrowLeft') yaw -= step;
    else if (e.key === 'ArrowRight') yaw += step;
    else if (e.key === 'ArrowUp') pitch = clamp(pitch - step, -HALF_PI, HALF_PI);
    else if (e.key === 'ArrowDown') pitch = clamp(pitch + step, -HALF_PI, HALF_PI);
    else ok = false;
    if (ok) { e.preventDefault(); noteActivity(); snap = null; requestRender(); }
  });

  document.getElementById('growClose').addEventListener('click', function () { noteActivity(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') noteActivity(); });

  /* ---------------- 操作パネル ---------------- */

  function seg(id, fn) {
    var el = document.getElementById(id);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      el.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      fn(b.dataset.v);
    });
  }
  seg('segIdle', function (v) { idleMs = parseInt(v, 10); noteActivity(); });
  seg('segPlay', function (v) { playMs = parseInt(v, 10); noteActivity(); });
  seg('segLines', function (v) { showLines = (v === 'on'); requestRender(); });
  seg('segTwinkle', function (v) {
    twinkle = (v === 'on');
    ENTRIES.forEach(function (x) { x.el.classList.toggle('is-twinkle', twinkle); });
  });
  seg('segSound', function (v) {
    muted = (v === 'off');
    var el = growPlayer.querySelector('video');
    if (el) el.muted = muted;
  });

  document.getElementById('btnPlayNow').addEventListener('click', function () {
    clearTimers();
    setPhase('playing');
    pickAndPlay(nextEntry());
  });
  document.getElementById('btnReset').addEventListener('click', function () {
    ENTRIES.forEach(function (x) { try { localStorage.removeItem(STORE + x.id); } catch (e) {} });
    bag = null;
    noteActivity();
  });

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
  noteActivity();
})();
