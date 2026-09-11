/**
 * ブラウザでの動作確認（headless Chrome）。
 *
 * CLAUDE.md の「ブラウザでの確認」のうち、機械で見られるものを自動にしたもの。
 *   - file://（src/index.html を直接開く）で動き、コンソールエラーが 0 件であること
 *   - 球体・メニュー・カテゴリページが data.js と videos.js の中身どおりに並ぶこと
 *   - 星を押すとカードが開き、1 等星を押すとカテゴリページへ移ること
 *   - 放っておくと、巡回のあと動画のカードが開くこと（展示モード）
 *
 * Chrome が無ければ飛ばす（CI では飛ばさない）。npm は使わず test/chrome.mjs が Chrome を直接操作する。
 * ラベルの位置や重なりといった見た目と、動画の再生そのものは対象外なので人の目で確認すること。
 * また headless のタブは常に表示中の扱いで、「裏に回ったタブで rAF が止まる」状況は作れない。
 * そちらは structure.test.js の静的な検査が受け持つ。
 */
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, launch } from './chrome.mjs';
import { loadBrowserScripts, read, repoPath, skipWithout } from './helpers.mjs';

const CHROME = findChrome();
const skip = skipWithout(CHROME, 'Chrome');
const browser = skip ? null : await launch(CHROME);
after(() => browser?.close());

/* ページが実際に表示する中身（videos.js を流し込んだあとの data.js） */
const DATA = loadBrowserScripts('src/js/videos.js', 'src/js/data.js').HIDD_DATA;
const VIDEOS = DATA.categories.flatMap((c) => c.videos);
const categoryHref = (c) => 'category.html?cat=' + encodeURIComponent(c.id);

const fileUrl = (rel, query = '') => pathToFileURL(repoPath(rel)).href + query;
const DEMOS = readdirSync(repoPath('demo')).filter((f) => f.endsWith('.html')).sort();

/** どのスクリプトより先に WebGL を塞ぐ（WebGL の無い PC の再現） */
const NO_WEBGL = `(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return /webgl/i.test(type) ? null : get.call(this, type, ...rest);
  };
})()`;

/**
 * 再生カードが最初に開いた瞬間を記録する（preload で渡し、ページのスクリプトより先に仕込む）。
 * openCard が hidden を外した瞬間だけを見る。is-open の class はその 20ms 後に付くが、
 * 動画が読めないとその前に次の動画へ送られることがある（実物の無い CI がそう）。
 */
const WATCH_CARD = `document.addEventListener('DOMContentLoaded', () => {
  const grow = document.getElementById('grow');
  window.__card = { opened: null };
  new MutationObserver((records) => {
    if (window.__card.opened || grow.hidden) return;
    if (!records.some((r) => r.oldValue !== null)) return;   // 隠れていた状態から出てきたときだけ
    const video = grow.querySelector('video');
    window.__card.opened = {
      at: Math.round(performance.now()),
      title: document.getElementById('growTitle').textContent,
      src: video && video.getAttribute('src'),
    };
  }).observe(grow, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
});`;

/** 設定画面の値を、ページが読むより先に保存しておく（preload 用） */
const SETTINGS_STORE = read('src/js/settings.js').match(/var STORE = '([^']+)'/)[1];
const withSettings = (values) =>
  `try { localStorage.setItem(${JSON.stringify(SETTINGS_STORE)}, ${JSON.stringify(JSON.stringify(values))}); } catch (e) {}\n`;

/* 押して確かめる検査では、放置による自動再生を切っておく。
   ページが重いと押す前に自動でカードが開き、押した結果と紛れる */
const NO_AUTO = withSettings({ auto: 'off' });

/** 入場アニメーションが終わるまで待つ。終わる瞬間に無操作の計測がやり直され、開いたカードも閉じられる */
const REVEALED = `document.body.classList.contains('is-revealed')`;

/**
 * 数えるエラー。
 * 実物の動画は Git に入れていないので、CI のチェックアウトには無い。
 * その読み込み失敗は環境の差なので除く（確認用の sample/ は追跡しているので除かない）。
 */
function errorsOf(page) {
  return page.errors
    .filter(({ url }) => !absentVideo(url))
    .map(({ text, url }) => (url ? `${text} (${url})` : text));
}

function absentVideo(url) {
  if (!url || !url.startsWith('file:')) return false;
  const file = fileURLToPath(url);
  const rel = path.relative(repoPath('src/videos'), file);
  return !rel.startsWith('..') && !rel.startsWith('sample' + path.sep) && !existsSync(file);
}

/** ページを開いて fn に渡し、最後にエラーが 0 件であることを見て閉じる */
async function withPage(url, options, fn) {
  const page = await browser.open(url, options);
  try {
    await fn(page);
    assert.deepEqual(errorsOf(page), [], `${url} でエラーが出た`);
  } finally {
    await page.close();
  }
}

/* 同時に開くのは 3 ページまで。全部を一度に開くと CPU を取り合い、1 ページの読み込みに 10 秒以上かかる */
describe('ブラウザ（headless Chrome）', { skip, concurrency: 3 }, () => {
  /* ---------------- トップ（球体） ---------------- */

  // 10 秒ほど待つので最初に始め、ほかの検査と並べて回す
  test('トップ: 触らずに置いておくと、巡回のあと動画のカードが開く（展示モード）', async () => {
    // 回り出してから再生までを設定画面の最短（3 秒）にして待ち時間を縮める
    await withPage(fileUrl('src/index.html'), { preload: withSettings({ delay: '3000' }) + WATCH_CARD }, async (page) => {
      const card = await page.waitFor('window.__card.opened', 25000);
      assert.ok(card.at >= 5000 + 3000, `無操作の待ち（5 秒 + 3 秒）より早く開いた: ${card.at}ms`);
      assert.ok(VIDEOS.some((v) => v.title === card.title && v.file === card.src),
        `一覧に無い動画が開いた: ${card.title} (${card.src})`);
    });
  });

  test('トップ: file:// で開き、星とメニューが data.js どおりに並ぶ', async (t) => {
    t.diagnostic(browser.product);
    await withPage(fileUrl('src/index.html'), {}, async (page) => {
      await page.waitFor(REVEALED);
      const s = await page.evaluate(`({
        noWebgl: document.body.classList.contains('no-webgl'),
        canvas: !!document.querySelector('#sphereCanvas canvas'),
        majors: [...document.querySelectorAll('.star--major')].map((el) => el.getAttribute('aria-label')),
        stars: [...document.querySelectorAll('.star:not(.star--major)')].map((el) => el.getAttribute('aria-label')),
        menu: [...document.querySelectorAll('#menuList a')].map((a) => [a.getAttribute('href'), a.textContent]),
      })`);
      assert.equal(s.noWebgl, false,
        'WebGL が使えず一覧に切り替わった（この Chrome で --enable-unsafe-swiftshader が効いていない可能性）');
      assert.ok(s.canvas, '球体の canvas が無い');
      assert.deepEqual(s.majors, DATA.categories.map((c) => c.label + ' の動画一覧を開く'), '1 等星がカテゴリと合わない');
      assert.deepEqual(s.stars, VIDEOS.map((v) => v.title), '動画の星が動画の一覧と合わない');
      assert.deepEqual(s.menu, DATA.categories.map((c) => [categoryHref(c), c.label]), 'メニューがカテゴリと合わない');
    });
  });

  test('トップ: WebGL が使えない環境では、カテゴリの一覧に切り替わる', async () => {
    await withPage(fileUrl('src/index.html'), { preload: NO_WEBGL }, async (page) => {
      const s = await page.evaluate(`({
        noWebgl: document.body.classList.contains('no-webgl'),
        shown: getComputedStyle(document.getElementById('fallbackNav')).display !== 'none',
        links: [...document.querySelectorAll('#fallbackList a')].map((a) => a.getAttribute('href')),
        stars: document.querySelectorAll('.star').length,
      })`);
      assert.ok(s.noWebgl, 'body に no-webgl が付いていない');
      assert.ok(s.shown, 'フォールバックの一覧が見えていない（カテゴリへ行く手段が無い）');
      assert.deepEqual(s.links, DATA.categories.map(categoryHref));
      assert.equal(s.stars, 0);
    });
  });

  test('トップ: 小さな星を押すと、その動画のカードが開く', async () => {
    await withPage(fileUrl('src/index.html'), { preload: NO_AUTO + WATCH_CARD }, async (page) => {
      await page.waitFor(REVEALED);
      const picked = VIDEOS[Math.min(3, VIDEOS.length - 1)];
      await page.evaluate(`document.querySelectorAll('.star:not(.star--major)')[${VIDEOS.indexOf(picked)}].click()`);
      const card = await page.waitFor('window.__card.opened', 5000);
      assert.equal(card.title, picked.title);
      assert.equal(card.src, picked.file);
    });
  });

  test('トップ: 1 等星を押すと、正面に寄せてからカテゴリのページへ移る', async () => {
    const cat = DATA.categories[Math.min(1, DATA.categories.length - 1)];
    await withPage(fileUrl('src/index.html'), { preload: NO_AUTO }, async (page) => {
      await page.waitFor(REVEALED);
      await page.evaluate(`document.querySelectorAll('.star--major')[${DATA.categories.indexOf(cat)}].click()`);
      const href = await page.waitFor(`location.href.includes('category.html') && location.href`, 5000);
      assert.equal(new URL(href).search, '?cat=' + encodeURIComponent(cat.id));
      const title = await page.waitFor(`document.readyState === 'complete' && document.getElementById('catTitle').textContent`);
      assert.equal(title, cat.label);
    });
  });

  test('設定画面: Ctrl + Shift + S で開き、Esc で閉じる（どちらのページでも）', async () => {
    const isOpen = `window.HIDDSettings.isOpen() && document.querySelector('.settings').classList.contains('is-open')`;
    for (const url of [fileUrl('src/index.html'), fileUrl('src/category.html', '?cat=' + DATA.categories[0].id)]) {
      await withPage(url, {}, async (page) => {
        await page.press('S', { code: 'KeyS', keyCode: 83, modifiers: 2 | 8 });
        assert.ok(await page.evaluate(isOpen), `${url}: Ctrl + Shift + S で開かない`);
        await page.press('Escape', { keyCode: 27 });
        assert.equal(await page.evaluate(isOpen), false, `${url}: Esc で閉じない`);
      });
    }
  });

  /* ---------------- カテゴリページ ---------------- */

  for (const cat of DATA.categories) {
    test(`カテゴリページ（${cat.id}）: 動画の数だけコマが並び、ほかのカテゴリへの道がある`, async () => {
      await withPage(fileUrl('src/category.html', '?cat=' + encodeURIComponent(cat.id)), {}, async (page) => {
        const s = await page.evaluate(`({
          title: document.getElementById('catTitle').textContent,
          films: [...document.querySelectorAll('.film:not(.film--clone) .film__title')].map((el) => el.textContent),
          others: [...document.querySelectorAll('#otherCats a')].map((a) => a.getAttribute('href')),
        })`);
        assert.equal(s.title, cat.label);
        assert.deepEqual(s.films, cat.videos.map((v) => v.title));
        assert.deepEqual(s.others, DATA.categories.filter((c) => c !== cat).map(categoryHref));
      });
    });
  }

  test('カテゴリページ: コマを押すとモーダルでその動画を開き、Esc で閉じる', async () => {
    const cat = DATA.categories[0];
    await withPage(fileUrl('src/category.html', '?cat=' + encodeURIComponent(cat.id)), {}, async (page) => {
      await page.evaluate(`document.querySelector('.film:not(.film--clone)').click()`);
      const s = await page.evaluate(`({
        hidden: document.getElementById('modal').hidden,
        title: document.getElementById('modalTitle').textContent,
        src: document.getElementById('modalPlayer').getAttribute('src'),
      })`);
      assert.deepEqual(s, { hidden: false, title: cat.videos[0].title, src: cat.videos[0].file });
      await page.press('Escape', { keyCode: 27 });
      assert.equal(await page.evaluate(`document.getElementById('modal').hidden`), true, 'Esc で閉じない');
    });
  });

  test('カテゴリページ: 知らない id でも落ちずに、球体へ戻る案内を出す', async () => {
    await withPage(fileUrl('src/category.html', '?cat=no-such-category'), {}, async (page) => {
      const s = await page.evaluate(`({
        title: document.getElementById('catTitle').textContent,
        back: !document.getElementById('emptyNote').hidden && !!document.querySelector('#emptyNote a[href="index.html"]'),
        others: document.querySelectorAll('#otherCats a').length,
      })`);
      assert.equal(s.title, 'カテゴリが見つかりません');
      assert.ok(s.back, '球体へ戻るリンクが出ていない');
      assert.equal(s.others, DATA.categories.length);
    });
  });

  /* ---------------- デモ ----------------
     本番の共有資産（common.css / three.min.js / data.js / texture-lab.js）を読んでいるので、
     src/ を変えてデモが壊れていないかも見る */

  for (const f of DEMOS) {
    test(`デモ: demo/${f} がエラーなく開く`, async () => {
      await withPage(fileUrl(`demo/${f}`), {}, async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));   // 読み込み直後に走る処理の分
      });
    });
  }
});
