/**
 * serve.py（動作確認・展示用のサーバー）の検査。
 *
 * 動画のシークと再生位置の復元は Range（部分取得）が前提で、
 * 動画一覧（src/js/videos.js）の生成は data.js との受け渡しになっている。
 * どちらが壊れてもページ自体は表示されるので、ブラウザで眺めても気づきにくい。
 *
 * 本物の serve.py を一時フォルダへ写し、偽の動画フォルダを置いて `python3 serve.py <port>` で起動する。
 * リポジトリの src/js/videos.js を書き換えないため。
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { read, repoPath, skipWithout } from './helpers.mjs';

const PYTHON = process.env.PYTHON || 'python3';
const skip = skipWithout(spawnSync(PYTHON, ['--version']).status === 0, 'python3');

/* ---------------- 偽の動画フォルダ ---------------- */

const BASE = mkdtempSync(path.join(os.tmpdir(), 'hidd-serve-'));
const ROOT = path.join(BASE, 'repo');          // serve.py が配信するフォルダ
const SECRET = 'serve.py の外にあるファイル';   // BASE 直下に置く（配信してはいけない）

/** 0..255 を繰り返す中身。範囲がずれると値で分かる */
const bytes = (n) => Buffer.from(Array.from({ length: n }, (_, i) => i % 251));
const CLIP = bytes(1000);

function put(rel, content = CLIP) {
  const file = path.join(ROOT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

mkdirSync(path.join(ROOT, 'src/js'), { recursive: true });   // serve.py が videos.js を書き出す先
copyFileSync(repoPath('serve.py'), path.join(ROOT, 'serve.py'));
put('src/videos/ai/02_二本目（佐藤）.mp4');
put('src/videos/ai/01_一本目（山田）.MP4');          // 拡張子が大文字でも拾う
put('src/videos/ai/.gitkeep', '');                   // 隠しファイルは拾わない
put('src/videos/ai/._01_一本目（山田）.MP4', 'x');   // macOS が USB に作る影ファイル
put('src/videos/ai/メモ.txt', 'x');                   // 動画以外は拾わない
put('src/videos/game/C#とC++の比較 (1).webm');       // URL を壊す文字と、ダウンロード時の重複番号
put('src/videos/web/.gitkeep', '');                  // 空のカテゴリは一覧に出さない
put('src/videos/sample/range.mp4');                  // 確認用は一覧に出さない
put('src/videos/.trash/消したつもり.mp4');           // 隠しフォルダは見ない
put('src/videos/直に置いた.mp4');                     // カテゴリのフォルダに入っていない
writeFileSync(path.join(BASE, 'outside.txt'), SECRET);

const EXPECTED = {
  ai: ['01_一本目（山田）.MP4', '02_二本目（佐藤）.mp4'],
  game: ['C#とC++の比較 (1).webm'],
};

/* ---------------- 起動 ---------------- */

async function freePort() {
  const s = net.createServer();
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  const { port } = s.address();
  await new Promise((resolve) => s.close(resolve));
  return port;
}

/** 実際の使い方どおり `python3 serve.py <port>` で起動し、案内が出るまで待つ */
async function start() {
  const port = await freePort();
  const child = spawn(PYTHON, ['-u', 'serve.py', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stderr.on('data', (d) => { log = (log + d).slice(-4000); });   // 読み捨てないと詰まる
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve.py が 10 秒で起動しない\n${log}`)), 10000);
    child.stdout.on('data', (d) => {
      if (String(d).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`serve.py が終了した (${code})\n${log}`)); });
  });
  return { port, child };
}

const server = skip ? null : await start();

after(() => {
  agent.destroy();
  server?.child.kill();
  rmSync(BASE, { recursive: true, force: true });
});

/* ---------------- 取得 ---------------- */

/* 接続を使い回す（ブラウザと同じ）。応答の長さが分からないと、ここで固まる */
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

/** URL を正規化せずにそのまま送る（.. を含むパスを試すため fetch は使わない） */
function get(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.port, path: urlPath, headers, agent }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(3000, () => req.destroy(new Error(
      `${urlPath} の応答が 3 秒で終わらない（Content-Length が無く、接続を開けたままにしている可能性）`)));
    req.on('error', reject);
    req.end();
  });
}

const encodePath = (rel) => '/' + rel.split('/').map(encodeURIComponent).join('/');

/** 別の文脈で評価したオブジェクトは prototype が違うので、比較できる形に直す */
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ---------------- 動画一覧（src/js/videos.js） ---------------- */

test('動画一覧: カテゴリのフォルダにある動画だけを、名前順で返す', { skip }, async () => {
  const res = await get('/src/js/videos.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /javascript/);
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(res.body.toString('utf8'), ctx);
  assert.deepEqual(plain(ctx.window.HIDD_VIDEO_FILES), EXPECTED);
});

test('動画一覧: 配信した内容を src/js/videos.js にも書き出す（file:// で開いたとき用）', { skip }, async () => {
  const res = await get('/src/js/videos.js?v=1');   // クエリ付きでも同じものを返す
  assert.equal(res.status, 200);
  assert.equal(readFileSync(path.join(ROOT, 'src/js/videos.js'), 'utf8'), res.body.toString('utf8'));
});

test('動画一覧: data.js がそのまま読み、書かれた URL で動画を取れる', { skip }, async () => {
  // ファイル名 → videos.js → data.js → URL → serve.py の受け渡しを通しで見る
  const ctx = vm.createContext({ window: {} });
  vm.runInContext((await get('/src/js/videos.js')).body.toString('utf8'), ctx);
  vm.runInContext(read('src/js/data.js'), ctx, { filename: 'src/js/data.js' });
  const DATA = ctx.window.HIDD_DATA;

  const ai = plain(DATA.findCategory('ai').videos);
  assert.deepEqual(ai.map((v) => [v.title, v.presenter]), [['一本目', '山田'], ['二本目', '佐藤']]);
  const game = plain(DATA.findCategory('game').videos);
  assert.deepEqual(game.map((v) => [v.title, v.presenter]), [['C#とC++の比較', '']]);

  for (const v of [...ai, ...game]) {
    const res = await get('/src/' + v.file);   // file はページ（src/）からの相対パス
    assert.equal(res.status, 200, `${v.file} が取れない`);
    assert.ok(res.body.equals(CLIP), `${v.file} の中身が違う`);
  }
});

/* ---------------- Range（部分取得） ---------------- */

test('Range: 指定した範囲だけを 206 で返す（シークと再生位置の復元に要る）', { skip }, async () => {
  const cases = [
    ['bytes=0-9', 0, 9],
    ['bytes=990-', 990, 999],      // そこから最後まで
    ['bytes=-5', 995, 999],        // 末尾の 5 バイト
    ['bytes=995-5000', 995, 999],  // 終わりがはみ出していたら切り詰める
    ['bytes=0-0', 0, 0],
  ];
  for (const [range, start, end] of cases) {
    const res = await get('/src/videos/sample/range.mp4', { Range: range });
    assert.equal(res.status, 206, range);
    assert.equal(res.headers['content-range'], `bytes ${start}-${end}/1000`, range);
    assert.equal(res.headers['content-length'], String(end - start + 1), range);
    assert.equal(res.headers['accept-ranges'], 'bytes', range);
    assert.equal(res.headers['content-type'], 'video/mp4', range);
    assert.ok(res.body.equals(CLIP.subarray(start, end + 1)), `${range} の中身が違う`);
  }
});

test('Range: 日本語のファイル名でも部分取得できる', { skip }, async () => {
  const res = await get(encodePath('src/videos/ai/02_二本目（佐藤）.mp4'), { Range: 'bytes=10-19' });
  assert.equal(res.status, 206);
  assert.ok(res.body.equals(CLIP.subarray(10, 20)));
});

test('Range: 範囲外の指定には 416 を返し、接続を固めない', { skip }, async () => {
  // 本文の長さを書かずに返すと、接続を使い回すブラウザは続きを待ち続ける
  for (const range of ['bytes=1000-', 'bytes=5000-6000']) {
    const res = await get('/src/videos/sample/range.mp4', { Range: range });
    assert.equal(res.status, 416, range);
    assert.equal(res.headers['content-range'], 'bytes */1000', range);
    assert.equal(res.body.length, 0, range);
  }
  // 同じ接続で次のリクエストが通る
  assert.equal((await get('/src/videos/sample/range.mp4', { Range: 'bytes=0-1' })).status, 206);
});

test('Range: 形式の違う指定には 400', { skip }, async () => {
  assert.equal((await get('/src/videos/sample/range.mp4', { Range: 'items=0-1' })).status, 400);
});

test('Range が無ければ 200 で全体を返す', { skip }, async () => {
  const res = await get('/src/videos/sample/range.mp4');
  assert.equal(res.status, 200);
  assert.ok(res.body.equals(CLIP));
});

test('存在しないファイルは 404（Range 付きでも）', { skip }, async () => {
  const missing = encodePath('src/videos/ai/無い.mp4');
  assert.equal((await get(missing)).status, 404);
  assert.equal((await get(missing, { Range: 'bytes=0-1' })).status, 404);
});

test('どの応答にもキャッシュを抑える指定が付く（展示中に古い内容を残さない）', { skip }, async () => {
  for (const [p, h] of [
    ['/src/js/videos.js', {}],
    ['/src/videos/sample/range.mp4', {}],
    ['/src/videos/sample/range.mp4', { Range: 'bytes=0-1' }],
  ]) {
    assert.equal((await get(p, h)).headers['cache-control'], 'no-store', `${p} ${JSON.stringify(h)}`);
  }
});

test('配信するフォルダの外は読ませない（.. でさかのぼれない）', { skip }, async () => {
  for (const p of ['/../outside.txt', '/%2e%2e/outside.txt', '/src/../../outside.txt']) {
    for (const h of [{}, { Range: 'bytes=0-9' }]) {
      const res = await get(p, h);
      assert.ok(res.status >= 400, `${p} ${JSON.stringify(h)} が ${res.status}`);
      assert.ok(!res.body.toString('utf8').includes(SECRET), `${p} で外のファイルが読めた`);
    }
  }
});
