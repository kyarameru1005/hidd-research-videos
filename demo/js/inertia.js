/**
 * HIDD — 球体の慣性 デモ（検討用）
 *
 * 本番の星の球体（js/stars.js）から、放置時の自動再生・動画再生・音声まわりを
 * すべて外し、ドラッグ回転と慣性の比較に絞った軽量版。
 *
 * 本番の減衰は velYaw *= Math.pow(0.06, dt) で、半減期は約 0.25 秒しかない
 * （1 秒後には元の速度の 6% まで落ちる）。「回した勢いが残っている」と感じる
 * 間もなく止まるため、減衰の強さを 3 段階の切り替えで比較できるようにした。
 * 数式の形自体は本番と同じ（指数減衰）で、底の値だけを変えている。
 */
(function () {
  'use strict';

  var DATA = window.HIDD_DATA;
  var TAU = Math.PI * 2;
  var HALF_PI = Math.PI / 2;
  var BRAND_R = 1.02;
  var STAR_R = 1.04;
  var MAJOR_R = 1.05;

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
  var speedEl = document.getElementById('speedReadout');

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

  /* 減衰の強さ（底が 1 に近いほどゆっくり止まる）。切り替えパネルが更新する */
  var FRICTION = 0.68;

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

  function updateSpeedReadout(spinning) {
    if (!spinning) { speedEl.hidden = true; return; }
    var degPerSec = Math.hypot(velYaw, velPitch) * (180 / Math.PI);
    speedEl.hidden = false;
    speedEl.textContent = '角速度: ' + Math.round(degPerSec) + '°/秒';
  }

  function frame(now) {
    var dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    var busy = false;
    var spinning = false;

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
      yaw += velYaw * dt; pitch += velPitch * dt;
      velYaw *= Math.pow(FRICTION, dt); velPitch *= Math.pow(FRICTION, dt);
      busy = true; spinning = true;
    } else { velYaw = 0; velPitch = 0; }

    updateSpeedReadout(spinning);
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

  /* ---------------- 減衰の強さ切り替え ---------------- */

  var segFriction = document.getElementById('segFriction');
  segFriction.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    segFriction.querySelectorAll('button').forEach(function (x) {
      x.setAttribute('aria-pressed', String(x === b));
    });
    FRICTION = parseFloat(b.dataset.v);
  });

  /* ---------------- 操作 ---------------- */

  var DRAG_K = 0.006;

  host.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true; pointerId = e.pointerId;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    velYaw = 0; velPitch = 0; snap = null;
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
