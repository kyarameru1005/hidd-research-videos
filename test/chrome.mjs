/**
 * テスト用の Chrome 操作。
 *
 * npm を持ち込まない方針（CLAUDE.md）なので Puppeteer などは使わず、
 * Chrome を --remote-debugging-pipe 付きで起動して、DevTools Protocol の JSON を
 * fd 3（送る）と fd 4（受ける）で直接やり取りする。メッセージは NUL 区切り。
 * ポートも WebSocket も使わないので、ほかのプロセスとぶつからない。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Chrome の実行ファイル。CHROME_PATH で指定でき、無ければよくある場所を探す */
export function findChrome() {
  const onPath = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
    .flatMap((name) => (process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, name)));
  return [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ...onPath,
  ].find((p) => p && existsSync(p)) || null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** message は関数でもよい（時間切れの時点の Chrome のログを載せるため） */
function withTimeout(promise, ms, message) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(typeof message === 'function' ? message() : message)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

export async function launch(executable) {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'hidd-chrome-'));
  const child = spawn(executable, [
    '--headless=new',
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    '--mute-audio',
    '--enable-unsafe-swiftshader',   // GPU の無い CI でも WebGL を使う（ソフトウェア描画）
    // CI の Linux では sandbox を張れないことがある。開くのは手元のファイルだけ
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });

  let log = '';
  child.stderr.on('data', (d) => { log = (log + d).slice(-4000); });   // 読み捨てないと詰まる
  child.stdio[3].on('error', () => {});                                   // 落ちたあとに書いても例外にしない
  const exited = new Promise((resolve) => child.once('exit', resolve));

  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  let buf = Buffer.alloc(0);

  child.stdio[4].on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (let i = buf.indexOf(0); i >= 0; i = buf.indexOf(0)) {
      const msg = JSON.parse(buf.subarray(0, i).toString('utf8'));
      buf = buf.subarray(i + 1);
      const p = msg.id && pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result);
      } else {
        for (const fn of listeners) fn(msg);
      }
    }
  });

  exited.then((code) => {
    for (const p of pending.values()) p.reject(new Error(`Chrome が終了した (${code})\n${log}`));
    pending.clear();
  });

  function send(method, params = {}, sessionId) {
    const reply = new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, method });
      child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + '\0');
    });
    return withTimeout(reply, 30000, () => `Chrome が ${method} に 30 秒応えない\n${log}`);
  }

  /**
   * 新しいタブで url を開き、load まで待つ。
   *
   * タブごとに別のブラウザコンテキスト（シークレットウィンドウ相当）にして、
   * 保存した設定や再生位置がほかの検査へ漏れないようにする。
   * preload はどのスクリプトより先に実行される（WebGL を塞ぐ、設定を仕込むなど）。
   */
  async function open(url, { preload } = {}) {
    const { browserContextId } = await send('Target.createBrowserContext');
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    const errors = [];
    const loaded = new Set();   // load まで進んだ読み込みの loaderId
    let wake = () => {};
    const listener = (m) => {
      if (m.sessionId !== sessionId) return;
      const p = m.params;
      if (m.method === 'Page.lifecycleEvent' && p.name === 'load') {
        loaded.add(p.loaderId);
        wake();
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails;
        errors.push({ text: d.exception?.description || d.text, url: d.url });
      } else if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) {
        errors.push({ text: p.args.map((a) => a.value ?? a.description).join(' ') });
      } else if (m.method === 'Log.entryAdded' && p.entry.level === 'error') {
        errors.push({ text: p.entry.text, url: p.entry.url });
      }
    };
    listeners.add(listener);

    await send('Page.enable', {}, sessionId);
    await send('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Log.enable', {}, sessionId);
    if (preload) await send('Page.addScriptToEvaluateOnNewDocument', { source: preload }, sessionId);

    const nav = await send('Page.navigate', { url }, sessionId);
    if (nav.errorText) throw new Error(`${url} を開けない: ${nav.errorText}`);
    await withTimeout(new Promise((resolve) => {
      wake = () => { if (loaded.has(nav.loaderId)) resolve(); };
      wake();
    }), 30000, `${url} の読み込みが 30 秒で終わらない`);

    const page = {
      /** ページで起きたエラー（例外・console.error・読み込み失敗）。{ text, url } */
      errors,

      async evaluate(expression) {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
        if (r.exceptionDetails) {
          const d = r.exceptionDetails;
          throw new Error(`ページでの評価に失敗: ${d.exception?.description || d.text}\n${expression}`);
        }
        return r.result.value;
      },

      /** 式が真になるまで待ち、その値を返す */
      async waitFor(expression, timeout = 5000) {
        const end = Date.now() + timeout;
        let last = null;
        for (;;) {
          try {
            const value = await page.evaluate(expression);
            if (value) return value;
            last = null;
          } catch (e) {
            last = e;   // ページの移動中は文脈が入れ替わるので、評価に失敗しても待ち続ける
          }
          if (Date.now() > end) {
            throw new Error(`${timeout}ms 待っても成り立たない: ${expression}${last ? '\n' + last.message : ''}`);
          }
          await sleep(100);
        }
      },

      /** キーを押して離す（文字は入力しない）。modifiers は Alt=1, Ctrl=2, Meta=4, Shift=8 の和 */
      async press(key, { code = key, keyCode, modifiers = 0 } = {}) {
        for (const type of ['rawKeyDown', 'keyUp']) {
          await send('Input.dispatchKeyEvent',
            { type, key, code, windowsVirtualKeyCode: keyCode, modifiers }, sessionId);
        }
      },

      async close() {
        listeners.delete(listener);
        await send('Target.disposeBrowserContext', { browserContextId });
      },
    };
    return page;
  }

  async function close() {
    await send('Browser.close').catch(() => {});
    if (child.exitCode === null) child.kill();
    await withTimeout(exited, 5000, 'Chrome が終了しない').catch(() => {});
    // 終了の途中はまだプロファイルに書き込んでいるので、終わってから消す
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  const { product } = await send('Browser.getVersion');
  return { product, open, close };
}
