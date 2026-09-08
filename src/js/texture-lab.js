/**
 * HIDD — 球体テクスチャの生成ライブラリ
 *
 * 画像ファイルを一切使わず、Canvas 2D で描いたものを CanvasTexture にする。
 * ・file:// で開いても動く（Chrome は file:// の画像を WebGL テクスチャにできない）
 * ・追加のダウンロードが発生しない
 * ・生成は起動時の一度だけ
 *
 * 球面 UV の対応（THREE.SphereGeometry の既定）:
 *   v = 0 -> +Y（上・AI） / v = 1 -> -Y（下・Web）
 *   u = 0.25 -> +Z（正面・HIDD） / u = 0.5 -> +X（右・XR） / u = 0 -> -X（左・IoT）
 */
window.HIDDTexture = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  /* 各カテゴリの向きと色。向きは data.js が個数から自動計算する（4 個でも 5 個でも動く） */
  var CATS = (function () {
    var D = window.HIDD_DATA;
    if (!D) return [];
    return D.categories.map(function (c, i) {
      return { dir: D.direction(i), rgb: hexToRgb(c.accent) };
    });
  })();

  var BASE = [10, 15, 30];   /* 球面のベースカラー（暗い紺） */

  /* ---------------- 小物 ---------------- */

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function makeCtx(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c.getContext('2d');
  }

  function toTexture(canvas) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    return t;
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smoothstep(a, b, x) {
    var t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }
  function mix(a, b, t) { return a + (b - a) * t; }

  /* UV -> 単位ベクトル（SphereGeometry の並びに合わせる） */
  function uvToDir(u, v) {
    var theta = v * Math.PI;
    var phi = u * TAU;
    var st = Math.sin(theta);
    return [-Math.cos(phi) * st, Math.cos(theta), Math.sin(phi) * st];
  }

  /**
   * その向きが「どのカテゴリに近いか」を色と強さで返す。
   * 4 方向は直交しているので、正面（+Z）では強さ 0 になり、
   * 上下左右に近づくほどそのカテゴリ色が強く出る。
   */
  function catField(d, power) {
    var acc = [0, 0, 0], wsum = 0;
    for (var i = 0; i < CATS.length; i++) {
      var c = CATS[i];
      var dot = d[0] * c.dir[0] + d[1] * c.dir[1] + d[2] * c.dir[2];
      if (dot <= 0) continue;
      var w = Math.pow(dot, power);
      acc[0] += c.rgb[0] * w; acc[1] += c.rgb[1] * w; acc[2] += c.rgb[2] * w;
      wsum += w;
    }
    if (wsum <= 0) return { rgb: BASE, w: 0 };
    return { rgb: [acc[0] / wsum, acc[1] / wsum, acc[2] / wsum], w: clamp01(wsum) };
  }

  /**
   * 暗いベースにカテゴリ色を「足す」。
   * 混ぜる（lerp）とアクセント色が明るいためパステルに寄ってしまうので、
   * 加算にして暗い下地を保ったまま発光しているように見せる。
   */
  function catGlow(d, power, gain, floorRgb) {
    var f = catField(d, power);
    var b = floorRgb || BASE;
    return [
      b[0] + f.rgb[0] * f.w * gain,
      b[1] + f.rgb[1] * f.w * gain,
      b[2] + f.rgb[2] * f.w * gain
    ];
  }

  /* ---------------- 3D 値ノイズ（継ぎ目が出ないよう向きベクトルで引く） ---------------- */

  function hash3(i, j, k) {
    var n = (i * 374761393 + j * 668265263 + k * 1442695041) | 0;
    /* シフトは必ず論理シフト（>>>）にする。
       算術シフト（>>）だと n が負のとき符号ビットが伝播し、
       XOR 後の最上位ビットが常に 0 になって値域が 0〜0.5 に潰れる。 */
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177) | 0;
    n = (n ^ (n >>> 16)) | 0;
    return (n >>> 0) / 4294967295;
  }

  function vnoise(x, y, z) {
    var i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    var fx = x - i, fy = y - j, fz = z - k;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    function L(a, b, t) { return a + (b - a) * t; }
    var c000 = hash3(i, j, k),         c100 = hash3(i + 1, j, k);
    var c010 = hash3(i, j + 1, k),     c110 = hash3(i + 1, j + 1, k);
    var c001 = hash3(i, j, k + 1),     c101 = hash3(i + 1, j, k + 1);
    var c011 = hash3(i, j + 1, k + 1), c111 = hash3(i + 1, j + 1, k + 1);
    return L(
      L(L(c000, c100, u), L(c010, c110, u), v),
      L(L(c001, c101, u), L(c011, c111, u), v),
      w
    );
  }

  function fbm(x, y, z, octaves, lacunarity, gain) {
    var sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (var o = 0; o < octaves; o++) {
      sum += vnoise(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      freq *= lacunarity; amp *= gain;
    }
    return sum / norm;
  }

  /* ピクセル単位でテクスチャを組み立てる共通処理 */
  function perPixel(w, h, fn) {
    var ctx = makeCtx(w, h);
    var img = ctx.createImageData(w, h);
    var px = img.data;
    for (var y = 0; y < h; y++) {
      var v = (y + 0.5) / h;
      for (var x = 0; x < w; x++) {
        var u = (x + 0.5) / w;
        var c = fn(u, v, uvToDir(u, v));
        var o = (y * w + x) * 4;
        px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return ctx;
  }

  /* ================= 案 1: 点描グリッド + カテゴリ色 ================= */

  function dots() {
    var W = 1024, H = 512;
    var ctx = makeCtx(W, H);
    ctx.fillStyle = 'rgb(' + BASE.join(',') + ')';
    ctx.fillRect(0, 0, W, H);

    var ROWS = 60;
    for (var j = 0; j < ROWS; j++) {
      var v = (j + 0.5) / ROWS;
      var theta = v * Math.PI;
      var st = Math.sin(theta);
      /* 極では点が詰まらないよう、緯度に応じて経度方向の個数を減らす */
      var n = Math.max(5, Math.round(st * 132));
      for (var i = 0; i < n; i++) {
        var u = (i + 0.5) / n;
        var d = uvToDir(u, v);
        /* カテゴリ方向から離れた面でも点が見えるよう、青灰色の下限を持たせる */
        var c = catGlow(d, 2.4, 1.2, [58, 80, 120]);
        ctx.fillStyle = 'rgb(' + clampByte(c[0]) + ',' + clampByte(c[1]) + ',' + clampByte(c[2]) + ')';
        var x = u * W, y = v * H;
        /* 極付近は横に潰れるので、テクスチャ上では横長に描いて相殺する */
        var rx = Math.min(2.4 / Math.max(st, 0.12), 11);
        blob(ctx, x, y, rx, 2.4, W);
      }
    }
    return toTexture(ctx.canvas);
  }

  function blob(ctx, x, y, rx, ry, W) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    /* 継ぎ目をまたぐ点は反対側にも描く */
    if (x < rx + 1)      { ctx.beginPath(); ctx.ellipse(x + W, y, rx, ry, 0, 0, TAU); ctx.fill(); }
    if (x > W - rx - 1)  { ctx.beginPath(); ctx.ellipse(x - W, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  }

  /* ================= 案 2: カテゴリ色の 4 分割グロー ================= */

  function quadGlow() {
    return toTexture(perPixel(512, 256, function (u, v, d) {
      var c = catGlow(d, 2.1, 0.72);
      /* ごく薄いノイズでのっぺり感を消す */
      var n = (fbm(d[0] * 6, d[1] * 6, d[2] * 6, 3, 2.1, 0.5) - 0.5) * 12;
      return [clampByte(c[0] + n), clampByte(c[1] + n), clampByte(c[2] + n)];
    }).canvas);
  }

  function clampByte(v) { return v < 0 ? 0 : (v > 255 ? 255 : Math.round(v)); }

  /* ================= 案 3: サーキット / 基板パターン ================= */

  function circuit() {
    var W = 1024, H = 512;
    var ctx = makeCtx(W, H);
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, W, H);

    var rnd = seeded(20260908);

    /* 経路をいったん組み立ててから、継ぎ目対策で 3 回描く */
    var traces = [];
    var STEP = 26;
    for (var t = 0; t < 190; t++) {
      var x = Math.round(rnd() * (W / STEP)) * STEP;
      var y = Math.round(rnd() * (H / STEP)) * STEP;
      var pts = [[x, y]];
      var legs = 2 + Math.floor(rnd() * 4);
      var horiz = rnd() < 0.5;
      for (var s = 0; s < legs; s++) {
        var len = (1 + Math.floor(rnd() * 3)) * STEP * (rnd() < 0.5 ? -1 : 1);
        if (horiz) x += len; else y += len;
        y = Math.max(STEP, Math.min(H - STEP, y));
        pts.push([x, y]);
        horiz = !horiz;
      }
      traces.push(pts);
    }

    function drawAll(dx) {
      ctx.save();
      ctx.translate(dx, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var i = 0; i < traces.length; i++) {
        var pts = traces[i];
        var mid = uvToDir(((pts[0][0] % W) + W) % W / W, pts[0][1] / H);
        var cc = catGlow(mid, 2.0, 1.0, [46, 82, 120]);
        ctx.strokeStyle = 'rgba(' + clampByte(cc[0]) + ',' + clampByte(cc[1]) + ',' +
                          clampByte(cc[2]) + ',0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();
        /* 端のパッド */
        ctx.fillStyle = 'rgba(' + clampByte(cc[0] + 55) + ',' + clampByte(cc[1] + 60) + ',' +
                        clampByte(cc[2] + 65) + ',0.95)';
        var ends = [pts[0], pts[pts.length - 1]];
        for (var e = 0; e < 2; e++) {
          ctx.beginPath(); ctx.arc(ends[e][0], ends[e][1], 3.6, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
    drawAll(-W); drawAll(0); drawAll(W);
    return toTexture(ctx.canvas);
  }

  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ================= 共通マテリアル（陰影 + リムライト） =================
     MeshBasicMaterial のままだとライティングが無く、球体が「平たい円」に見える。
     テクスチャを貼るどの案でも、この 1 パスのシェーダで陰影と輪郭の光を足す。 */

  var SPHERE_VERT = [
    'varying vec2 vUv;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    '  vUv = uv;',
    '  vN = normalize(normalMatrix * normal);',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var SPHERE_FRAG = [
    'uniform sampler2D uMap;',
    'uniform float uUseMap;',
    'uniform vec3 uBase;',
    'uniform vec3 uRim;',
    'uniform float uRimPow;',
    'uniform float uRimGain;',
    'uniform float uAmbient;',
    'uniform vec3 uLight;',
    'uniform float uFade;',
    'varying vec2 vUv;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    '  vec3 base = mix(uBase, texture2D(uMap, vUv).rgb, uUseMap);',
    '  float lam = max(dot(vN, normalize(uLight)), 0.0);',
    '  float f = pow(1.0 - max(dot(vN, vV), 0.0), uRimPow);',
    '  vec3 col = base * (uAmbient + (1.0 - uAmbient) * 1.35 * lam) + uRim * f * uRimGain;',
    /* uFade は入場アニメーション用。半透明にすると描画順の問題が出るので、
       不透明のまま暗い背景色へ向けて落とす。 */
    '  gl_FragColor = vec4(col * uFade, 1.0);',
    '}'
  ].join('\n');

  /* uUseMap = 0 のときにサンプラが未束縛にならないよう、1x1 の白を既定にする */
  var WHITE_1PX = (function () {
    var t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  })();

  function shaded(map, opt) {
    opt = opt || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap:     { value: map || WHITE_1PX },
        uUseMap:  { value: map ? 1 : 0 },
        uBase:    { value: new THREE.Color(opt.base !== undefined ? opt.base : 0x141d3a) },
        uRim:     { value: new THREE.Color(opt.rim !== undefined ? opt.rim : 0x6fb6ff) },
        uRimPow:  { value: opt.rimPow !== undefined ? opt.rimPow : 3.0 },
        uRimGain: { value: opt.rimGain !== undefined ? opt.rimGain : 0.5 },
        uAmbient: { value: opt.ambient !== undefined ? opt.ambient : 0.5 },
        uLight:   { value: new THREE.Vector3(0.42, 0.66, 0.85) },
        uFade:    { value: 1 }
      },
      vertexShader: SPHERE_VERT,
      fragmentShader: SPHERE_FRAG
    });
  }

  /* ================= 案 4: 無地 + リムライト（テクスチャなし） ================= */

  function rimMaterial() {
    return shaded(null, {
      base: 0x16213f, rim: 0x7cc0ff, rimPow: 2.6, rimGain: 1.15, ambient: 0.45
    });
  }

  /* ================= 案 5: 星雲 / ガス惑星 ================= */

  function nebula() {
    return toTexture(perPixel(768, 384, function (u, v, d) {
      var f = 3.0;
      var x = d[0] * f, y = d[1] * f, z = d[2] * f;

      /* ドメインワーピングで渦を作る */
      var q = fbm(x + 5.2, y - 1.7, z + 3.1, 4, 2.0, 0.55);
      var n = fbm(x + q * 3.2, y + q * 3.2, z - q * 2.4, 5, 2.1, 0.5);
      n = clamp01((n - 0.5) * 2.6 + 0.5);

      /* ガス惑星らしい横縞を重ねる（緯度方向） */
      var band = 0.5 + 0.5 * Math.sin(v * Math.PI * 11 + (n - 0.5) * 8.0);
      var mixv = clamp01(n * 0.65 + band * 0.35);

      var deep = [18, 22, 52];
      var pale = [168, 150, 205];
      var glow = catGlow(d, 1.8, 0.5, [0, 0, 0]);
      var hot = smoothstep(0.72, 1.0, mixv);

      return [
        clampByte(mix(deep[0], pale[0], mixv) + glow[0] * 0.55 + hot * 60),
        clampByte(mix(deep[1], pale[1], mixv) + glow[1] * 0.55 + hot * 40),
        clampByte(mix(deep[2], pale[2], mixv) + glow[2] * 0.55 + hot * 25)
      ];
    }).canvas);
  }

  /* ================= 案 6: 地球儀風（手続き生成の大陸） ================= */

  function globe() {
    return toTexture(perPixel(1024, 512, function (u, v, d) {
      /* 向きベクトルは長さ 1 なので、周波数を上げないと大陸が現れない */
      var f = 3.4;
      var n = fbm(d[0] * f + 11.3, d[1] * f - 4.4, d[2] * f + 7.7, 5, 2.05, 0.52);
      n = (n - 0.5) * 2.2 + 0.5;                                   /* コントラストを立てる */
      var detail = fbm(d[0] * 9.5, d[1] * 9.5, d[2] * 9.5, 3, 2.2, 0.5) - 0.5;
      /* 閾値 0.70 で陸地が全体の約 30%（地球とほぼ同じ比率）になる */
      var land = smoothstep(0.68, 0.73, n + detail * 0.10);

      var sea  = [7, 22, 52];
      var soil = [64, 104, 88];
      var high = [118, 132, 96];
      var alt = smoothstep(0.74, 0.92, n);                         /* 内陸の高地 */
      var ground = [
        mix(soil[0], high[0], alt),
        mix(soil[1], high[1], alt),
        mix(soil[2], high[2], alt)
      ];

      var col = [
        mix(sea[0], ground[0], land),
        mix(sea[1], ground[1], land),
        mix(sea[2], ground[2], land)
      ];

      /* 極冠 */
      var ice = smoothstep(0.80, 0.95, Math.abs(d[1]));
      col[0] = mix(col[0], 222, ice); col[1] = mix(col[1], 232, ice); col[2] = mix(col[2], 245, ice);

      /* 緯線・経線をうっすら重ねる */
      var grid = Math.max(gridLine(v * 12), gridLine(u * 24));
      col[0] += grid * 24; col[1] += grid * 34; col[2] += grid * 46;

      return [clampByte(col[0]), clampByte(col[1]), clampByte(col[2])];
    }).canvas);
  }

  function gridLine(t) {
    var f = Math.abs(t - Math.round(t));
    return 1 - smoothstep(0.0, 0.035, f);
  }

  /* ================= マーカー用の丸いドット =================
     THREE.Points は既定だと四角く描かれるので、放射グラデーションを貼って丸くする。 */

  function dotSprite() {
    var S = 64;
    var ctx = makeCtx(S, S);
    var g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0.00, 'rgba(255,255,255,1)');
    g.addColorStop(0.32, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    var t = new THREE.CanvasTexture(ctx.canvas);
    return t;
  }

  /* ---------------- 公開 ---------------- */

  /* 本番・デモの双方から使うマテリアル生成関数 */
  var materials = {
    dots:    function () { return shaded(dots(),     { rimGain: 0.45, ambient: 0.58 }); },
    quad:    function () { return shaded(quadGlow(), { rimGain: 0.55, ambient: 0.52 }); },
    circuit: function () { return shaded(circuit(),  { rimGain: 0.50, ambient: 0.62 }); },
    rim:     rimMaterial,
    nebula:  function () { return shaded(nebula(),   { rim: 0xffc9a0, rimGain: 0.40, ambient: 0.50 }); },
    globe:   function () { return shaded(globe(),    { rim: 0x8fd0ff, rimGain: 0.60, ambient: 0.42 }); }
  };

  return {
    materials: materials,
    dotSprite: dotSprite,

    /* demo/texture.html（比較ページ）が使う一覧 */
    options: [
      {
        key: 'dots',
        title: '点描グリッド + カテゴリ色',
        desc: '緯度経度に沿った細かいドット。近い方向のカテゴリ色（青/桃/緑/橙）で染めているので、回すと正面のカテゴリ色に変わり、装飾が現在位置の目印を兼ねます。',
        tags: ['手続き生成', '負荷 小', { text: 'ラベル読みやすい', good: true }],
        makeMaterial: materials.dots
      },
      {
        key: 'quad',
        title: 'カテゴリ色の 4 分割グロー',
        desc: '上下左右をそれぞれのアクセント色でなめらかに染めた無地。模様がないぶん HIDD の文字がよく立ち、色だけで方向が伝わります。※本番サイトで採用中。',
        tags: ['手続き生成', '負荷 小', { text: '採用中', good: true }],
        makeMaterial: materials.quad
      },
      {
        key: 'circuit',
        title: 'サーキット / 基板パターン',
        desc: '配線と結節点を球面に描いたもの。情報系学科らしい絵柄でテック感は一番強いですが、線が多いぶんワイヤーフレームに近い印象にもなります。',
        tags: ['手続き生成', '負荷 小', { text: '背景が賑やか', warn: true }],
        makeMaterial: materials.circuit
      },
      {
        key: 'rim',
        title: '無地 + リムライト',
        desc: 'テクスチャを貼らず、陰影と輪郭の発光だけで質感を出します。最も軽く、HIDD とカテゴリラベルが一番読みやすい案。厳密にはテクスチャではなくマテリアルの変更です。',
        tags: ['シェーダのみ', '負荷 最小', { text: 'ラベル最も読みやすい', good: true }],
        makeMaterial: materials.rim
      },
      {
        key: 'nebula',
        title: '星雲 / ガス惑星風',
        desc: 'ノイズで作った雲状の模様。雰囲気は一番出ますが、模様の情報量が多く中央の HIDD と競合しやすいので、文字側に影を足す調整が要ります。',
        tags: ['手続き生成', '生成時 CPU 少々', { text: '文字と競合しやすい', warn: true }],
        makeMaterial: materials.nebula
      },
      {
        key: 'globe',
        title: '地球儀風（大陸シルエット）',
        desc: 'ノイズを閾値処理して作った架空の大陸。※これは実在の世界地図ではありません。本物の地図にしたい場合は画像を base64 で埋め込む必要があり、ファイルが 200KB〜1MB ほど増えます。',
        tags: ['手続き生成', '生成時 CPU 少々', { text: '実際の地図ではない', warn: true }],
        makeMaterial: materials.globe
      }
    ]
  };
})();
