/**
 * HIDD — 球体のズーム デモ（検討用）
 *
 * 本番の星の球体（js/stars.js）から、放置時の自動再生・動画再生・音声まわりを
 * すべて外し、ドラッグ回転とズームだけに絞った軽量版。
 *
 * ズームはカメラを球の中心へ近づけ・遠ざけるだけ（dolly）。星の見え隠れは
 * ワールド座標の depth（カメラ距離に依存しない）で決めているので、
 * ズームを足しても既存の見え方の計算には触れていない。
 *
 *   ホイール         : deltaY でズーム（Ctrl 併用時はブラウザのページ拡大を優先し、何もしない）
 *   2 本指ピンチ      : Pointer Events で 2 点間の距離を追って算出
 *   + / - / 既定に戻す: ボタン操作
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;
  var TAU = Math.PI * 2;
  var HALF_PI = Math.PI / 2;
  var BRAND_R = 1.02;

  /* 星は球面ちょうど（半径 1.0）に置く。
     stars.js は 1.04 / 1.05 と少し浮かせているが、これは旧 sphere.js の名残。
     当時マーカーは 3D の THREE.Points で、球に隠れないよう輪郭の外へ
     押し出す必要があった（docs/decisions.md 参照）。
     今の星はキャンバスの上に重ねた HTML 要素なので球に隠れることはなく、
     浮かせると寄ったときに星だけが輪郭の外へ離れていく（100% で 27px ずれる）。 */
  var STAR_R = 1.0;
  var MAJOR_R = 1.0;

  var G = window.HIDDGeom;
  var clamp = G.clamp, smoothstep = G.smoothstep, easeInOutCubic = G.easeInOutCubic,
      facingAngles = G.facingAngles, shortestAngle = G.shortestAngle, hasWebGL = G.hasWebGL;

  function seeded(seed) {
    var s = seed >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function norm(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
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
  var ENTRIES = [];
  DATA.categories.forEach(function (cat, ci) {
    var d = DATA.direction(ci);
    var n = cat.videos.length;
    cat.videos.forEach(function (video, vi) {
      var theta = (26 + rnd() * 12) * Math.PI / 180;
      var phi = (vi / n) * TAU + ci * 0.6;
      ENTRIES.push({ cat: cat, catIndex: ci, video: video, dir: scatter(d, theta, phi) });
    });
  });

  var host = document.getElementById('sphereCanvas');
  var overlay = document.getElementById('overlay');
  var svg = document.getElementById('constellations');
  var statusEl = document.getElementById('status');
  var navList = document.getElementById('navList');

  DATA.categories.forEach(function (cat) {
    var li = document.createElement('li');
    var span = document.createElement('span');
    span.className = 'chip';
    span.style.setProperty('--cat', cat.accent);
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

  var CAM_DEFAULT = 3.6, CAM_MIN = 1.75, CAM_MAX = 7.0;
  var camZ = CAM_DEFAULT;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, camZ);

  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  var group = new THREE.Group();
  scene.add(group);
  var sphereMat = HIDDTexture.materials.quad();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), sphereMat));

  var anchors = [];
  function addAnchor(el, dir, radius, kind, entry) {
    var obj = new THREE.Object3D();
    obj.position.set(dir[0] * radius, dir[1] * radius, dir[2] * radius);
    group.add(obj);
    var a = { el: el, obj: obj, kind: kind, entry: entry || null,
              world: new THREE.Vector3(), x: 0, y: 0, vis: 0 };
    anchors.push(a);
    if (entry) entry.anchor = a;
    return a;
  }

  addAnchor(overlay.querySelector('[data-anchor="brand"]'), [0, 0, 1], BRAND_R, 'brand');

  var MAJORS = [];
  DATA.categories.forEach(function (cat, ci) {
    var el = document.createElement('div');
    el.className = 'star star--major is-twinkle';
    el.style.setProperty('--star', cat.accent);
    el.style.setProperty('--dur', '4.2s');

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
    MAJORS.push({ cat: cat, ci: ci, el: el, anchor: a });
    ENTRIES.forEach(function (x) { if (x.catIndex === ci) x.majorAnchor = a; });

    el.addEventListener('click', function (e) { e.stopPropagation(); snapTo(DATA.direction(ci)); });
  });

  ENTRIES.forEach(function (entry) {
    var el = document.createElement('div');
    el.className = 'star is-twinkle';
    el.style.setProperty('--star', entry.cat.accent);
    el.style.setProperty('--dur', (2.6 + rnd() * 2.6).toFixed(2) + 's');
    var tip = document.createElement('span');
    tip.className = 'star__tip star__tip--below';
    tip.textContent = entry.video.title;
    el.appendChild(tip);
    overlay.appendChild(el);
    entry.el = el;
    addAnchor(el, entry.dir, STAR_R, 'star', entry);
    el.addEventListener('click', function (e) { e.stopPropagation(); snapTo(entry.dir); });
  });

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
  var snap = null;
  var running = false, lastFrame = 0, width = 1, height = 1;

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
      /* depth はワールド座標系での前後方向。カメラ距離を変えても値は変わらないので、
         ズームを足しても見え隠れの閾値をいじる必要がない。 */
      var depth = clamp(a.world.z / radius, -1, 1);

      tmp.copy(a.world).project(camera);
      a.x = (tmp.x * 0.5 + 0.5) * width;
      a.y = (-tmp.y * 0.5 + 0.5) * height;

      if (a.kind === 'star' || a.kind === 'major') {
        a.vis = smoothstep(-0.28, 0.12, depth);
        var sc = 0.7 + 0.6 * ((depth + 1) / 2);
        a.el.style.transform = 'translate3d(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px,0) scale(' + sc.toFixed(2) + ')';
        a.el.style.opacity = a.vis.toFixed(3);
        a.el.style.zIndex = String(Math.round((depth + 1) * 100));
        a.el.classList.toggle('is-back', a.vis < 0.25);
        if (a.nameEl) a.nameEl.style.opacity = smoothstep(0.45, 0.9, depth).toFixed(3);
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
        a.vis = smoothstep(0.55, 0.93, depth);
        a.el.style.transform = 'translate3d(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px,0) translate(-50%,-50%)';
        a.el.style.opacity = a.vis.toFixed(3);
      }
    }
    for (var k = 0; k < LINES.length; k++) {
      var L = LINES[k];
      var pa = L.from, pb = L.to.anchor;
      if (!pa || !pb) continue;
      var o = Math.min(pa.vis, pb.vis) * 0.75;
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
    } else if (Math.abs(velYaw) > 0.0004 || Math.abs(velPitch) > 0.0004) {
      /* ドラッグを離した後の慣性（本番と同じ減衰）。慣性そのものの強さは demo/inertia.html で比較する */
      yaw += velYaw * dt; pitch += velPitch * dt;
      velYaw *= Math.pow(0.06, dt); velPitch *= Math.pow(0.06, dt);
      busy = true;
    } else { velYaw = 0; velPitch = 0; }

    drawFrame();
    if (busy) requestAnimationFrame(frame); else running = false;
  }

  var SNAP_MS = 620;
  function snapTo(dir) {
    var t = facingAngles(dir);
    snap = { fromYaw: yaw, fromPitch: pitch, dYaw: shortestAngle(yaw, t.yaw), dPitch: t.pitch - pitch,
             start: performance.now(), dur: SNAP_MS };
    requestRender();
  }

  /* ---------------- ズーム ---------------- */

  var zoomReadout = document.getElementById('zoomReadout');

  function setZoom(z) {
    camZ = clamp(z, CAM_MIN, CAM_MAX);
    camera.position.z = camZ;
    var pct = Math.round((CAM_MAX - camZ) / (CAM_MAX - CAM_MIN) * 100);
    zoomReadout.textContent = pct + '%';
    requestRender();
  }
  setZoom(CAM_DEFAULT);

  /* ホイール。Ctrl 併用はブラウザのページ拡大操作なので横取りしない */
  host.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;
    e.preventDefault();
    setZoom(camZ + e.deltaY * 0.0022 * camZ);
  }, { passive: false });

  /* ピンチ（2 本指）。単指のドラッグ回転とはポインタ数で切り分ける */
  var pinchPointers = new Map();
  var pinchDist = null;

  function pinchDistance() {
    var pts = Array.from(pinchPointers.values());
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  document.getElementById('btnZoomIn').addEventListener('click', function () { setZoom(camZ * 0.82); });
  document.getElementById('btnZoomOut').addEventListener('click', function () { setZoom(camZ / 0.82); });
  document.getElementById('btnZoomReset').addEventListener('click', function () { setZoom(CAM_DEFAULT); });

  /* ---------------- 操作（ドラッグ回転 + ピンチ） ---------------- */

  var DRAG_K = 0.006;

  host.addEventListener('pointerdown', function (e) {
    pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchPointers.size >= 2) {
      dragging = false;
      pinchDist = pinchDistance();
      return;
    }
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true; pointerId = e.pointerId;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    velYaw = 0; velPitch = 0; snap = null;
    host.classList.add('is-dragging');
    if (host.setPointerCapture) { try { host.setPointerCapture(e.pointerId); } catch (err) {} }
    requestRender();
  });

  host.addEventListener('pointermove', function (e) {
    if (pinchPointers.has(e.pointerId)) pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchPointers.size >= 2) {
      var d = pinchDistance();
      if (pinchDist != null) setZoom(camZ - (d - pinchDist) * 0.012 * camZ);
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

  function endPointer(e) {
    pinchPointers.delete(e.pointerId);
    if (pinchPointers.size < 2) pinchDist = null;

    if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    dragging = false; pointerId = null;
    host.classList.remove('is-dragging');
    if (performance.now() - lastT > 90) { velYaw = 0; velPitch = 0; }
    velYaw = clamp(velYaw, -6, 6); velPitch = clamp(velPitch, -6, 6);
    requestRender();
  }
  host.addEventListener('pointerup', endPointer);
  host.addEventListener('pointercancel', endPointer);
  host.addEventListener('lostpointercapture', endPointer);

  host.addEventListener('keydown', function (e) {
    var step = 0.22, ok = true;
    if (e.key === 'ArrowLeft') yaw -= step;
    else if (e.key === 'ArrowRight') yaw += step;
    else if (e.key === 'ArrowUp') pitch = clamp(pitch - step, -HALF_PI, HALF_PI);
    else if (e.key === 'ArrowDown') pitch = clamp(pitch + step, -HALF_PI, HALF_PI);
    else if (e.key === '+' || e.key === '=') { setZoom(camZ * 0.9); ok = false; }
    else if (e.key === '-' || e.key === '_') { setZoom(camZ / 0.9); ok = false; }
    else ok = false;
    if (ok) { e.preventDefault(); snap = null; requestRender(); }
  });

  var rt = null;
  window.addEventListener('resize', function () {
    if (rt) clearTimeout(rt);
    rt = setTimeout(function () { resize(); drawFrame(); }, 150);
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) requestRender();
  });

  resize();
  drawFrame();
})();
