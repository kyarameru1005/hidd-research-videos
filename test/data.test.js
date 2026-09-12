/**
 * src/js/data.js の整合性。
 * 内容の編集はこのファイルだけで行う運用なので、壊れると全ページに波及する。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read, loadBrowserScripts } from './helpers.mjs';

const { HIDD_DATA: DATA } = loadBrowserScripts('src/js/data.js');

/** serve.py が書き出した動画一覧（src/js/videos.js）。data.js とは別の文脈で読む */
const FILES = (() => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(read('src/js/videos.js'), ctx, { filename: 'src/js/videos.js' });
  return JSON.parse(JSON.stringify(ctx.window.HIDD_VIDEO_FILES || {}));
})();
const HEX = /^#[0-9a-f]{6}$/i;

test('カテゴリが 1 件以上ある', () => {
  assert.ok(Array.isArray(DATA.categories));
  assert.ok(DATA.categories.length > 0);
});

test('各カテゴリに必須項目が揃っている', () => {
  for (const c of DATA.categories) {
    assert.match(c.id, /^[a-z0-9-]+$/, `id が URL に使えない形式: ${c.id}`);
    assert.ok(c.label && c.label.trim(), `label が空: ${c.id}`);
    assert.match(c.accent, HEX, `accent が #rrggbb でない: ${c.id}`);
    assert.ok(Array.isArray(c.videos), `videos が配列でない: ${c.id}`);
  }
});

test('カテゴリの id が重複していない', () => {
  const ids = DATA.categories.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('アクセントカラーが重複していない（色で見分けるため）', () => {
  const colors = DATA.categories.map((c) => c.accent.toLowerCase());
  assert.equal(new Set(colors).size, colors.length);
});

test('各動画にタイトルとローカルファイルがある', () => {
  for (const c of DATA.categories) {
    assert.ok(c.videos.length > 0, `動画が 0 件: ${c.id}`);
    for (const v of c.videos) {
      assert.ok(v.title && v.title.trim(), `title が空: ${c.id}`);
      assert.ok(v.file, `file が無い: ${c.id} / ${v.title}`);
    }
  }
});

test('findCategory が引ける / 未知の id では null', () => {
  for (const c of DATA.categories) {
    assert.equal(DATA.findCategory(c.id), c);
  }
  assert.equal(DATA.findCategory('存在しない'), null);
});

test('indexOf は 1 始まり', () => {
  assert.equal(DATA.indexOf(DATA.categories[0]), 1);
  assert.equal(DATA.indexOf(DATA.categories.at(-1)), DATA.categories.length);
});

test('videoFile はローカルパスを返し、無ければ null', () => {
  assert.equal(DATA.videoFile({ file: 'videos/a.mp4' }), 'videos/a.mp4');
  assert.equal(DATA.videoFile({}), null);
});

/* --- ファイル名の読み取り ---
   フォルダに置いたファイル名がそのまま表示になるので、
   実際に配布された動画のファイル名をそのまま並べて検証している。
   ここが崩れると全カテゴリの表示が一斉に壊れる。 */

test('parseVideoName が実際のファイル名からタイトルと発表者を取り出す', () => {
  const cases = [
    ['2Dオンラインゲームの開発に関する実践研究(大川　羽賀　高橋　神田).mp4',
      '2Dオンラインゲームの開発に関する実践研究', '大川 羽賀 高橋 神田'],
    // 全角括弧
    ['VR機器を利用した没入感の高いゲーム開発に関する実践研究（山田）.mp4',
      'VR機器を利用した没入感の高いゲーム開発に関する実践研究', '山田'],
    // 開きが半角・閉じが全角（実物がこうなっている）
    ['生成AIコーディングエージェント活用のためのハーネス構築と実装力維持手法の研究開発(佐藤）.mp4',
      '生成AIコーディングエージェント活用のためのハーネス構築と実装力維持手法の研究開発', '佐藤'],
    // アンダースコア区切り
    ['サイバーセキュリティアプリの機能強化／追加開発に関する実践研究_小嶋翼.mp4',
      'サイバーセキュリティアプリの機能強化／追加開発に関する実践研究', '小嶋翼'],
    // 括弧の前のスペースはタイトルに残さない
    ['Webフロントエンド技術の習得を目的とした脱出ゲームの開発 (兼子).mp4',
      'Webフロントエンド技術の習得を目的とした脱出ゲームの開発', '兼子'],
    ['ハンドトラッキングを用いたデバイスの非接触操作に関する実践研究  （赤石優斗、川原翔馬）.mp4',
      'ハンドトラッキングを用いたデバイスの非接触操作に関する実践研究', '赤石優斗、川原翔馬'],
    // ダウンロード時に付く重複番号は捨てる（発表者と間違えない）
    ['WEBサイトのサービス運営ライフサイクル実践に関する研究(佐々木、岡田、富田、神宮、井田、多田) (1).mp4',
      'WEBサイトのサービス運営ライフサイクル実践に関する研究', '佐々木、岡田、富田、神宮、井田、多田'],
    // 【２期】はタイトルの一部。括弧として扱わない
    ['AIを活用したクラウドスケーリングの最適化に関する実践研究【２期】（中泉）.mp4',
      'AIを活用したクラウドスケーリングの最適化に関する実践研究【２期】', '中泉'],
    ['ライフスタイルと連動した”日常×ゲーム”の開発に関する実践研究【３期】.mp4',
      'ライフスタイルと連動した”日常×ゲーム”の開発に関する実践研究【３期】', ''],
    // 発表者なし
    ['球体型ロボのVR遠隔操作に関する実践研究.mp4',
      '球体型ロボのVR遠隔操作に関する実践研究', ''],
    // 先頭の番号は並び順のためのもの。表示には出さない
    ['01_球体型ロボのVR遠隔操作に関する実践研究（山田）.mp4',
      '球体型ロボのVR遠隔操作に関する実践研究', '山田'],
    ['02-発表者のいない研究.mp4', '発表者のいない研究', ''],
    // 数字で始まるタイトルを番号と間違えない
    ['2Dオンラインゲームの開発に関する実践研究.mp4',
      '2Dオンラインゲームの開発に関する実践研究', ''],
  ];

  for (const [file, title, presenter] of cases) {
    const got = DATA.parseVideoName(file);
    assert.equal(got.title, title, `title: ${file}`);
    assert.equal(got.presenter, presenter, `presenter: ${file}`);
  }
});

test('applyVideoFiles がフォルダの中身で videos を置き換える', () => {
  const cat = DATA.categories[0];
  const before = cat.videos;

  DATA.applyVideoFiles({ [cat.id]: ['01_テスト動画（山田）.mp4', '02_もう一本.mp4'] });

  assert.equal(cat.videos.length, 2);
  /* file は URL に入れるので percent-encode 済み。表示用のタイトルだけ番号を外す */
  assert.equal(cat.videos[0].file,
    `videos/${cat.id}/${encodeURIComponent('01_テスト動画（山田）.mp4')}`);
  assert.equal(cat.videos[0].title, 'テスト動画');
  assert.equal(cat.videos[0].presenter, '山田');
  assert.equal(cat.videos[1].title, 'もう一本');
  assert.equal(cat.videos[1].presenter, '');

  cat.videos = before;   // 後続のテストに影響させない
});

test('applyVideoFiles が URL を壊す文字を含むファイル名を扱える', () => {
  // # はフラグメント、? はクエリの区切りとして解釈され、
  // エンコードしないとそこから先が切り落とされて再生できなくなる
  const cat = DATA.categories[0];
  const before = cat.videos;

  DATA.applyVideoFiles({ [cat.id]: ['C#とC++の比較 (山田).mp4'] });

  const file = cat.videos[0].file;
  assert.ok(!file.includes('#'), `# が生のまま残っている: ${file}`);
  assert.ok(!file.includes(' '), `スペースが生のまま残っている: ${file}`);
  assert.equal(decodeURIComponent(file), `videos/${cat.id}/C#とC++の比較 (山田).mp4`);
  assert.equal(cat.videos[0].title, 'C#とC++の比較');

  cat.videos = before;
});

/* --- 動画一覧（src/js/videos.js）の中身 ---
   コミットされた一覧は、その時点で手元にあった src/videos/<カテゴリid>/ を映している。
   フォルダ側の間違いは、ページではエラーにならず「出てこない」「空の札になる」だけなので、ここで見る。 */

test('動画一覧のカテゴリがすべて data.js にある（フォルダ名の打ち間違い・改名漏れ）', () => {
  // data.js に無い id のフォルダに置いた動画は、どこにも表示されない
  const ids = DATA.categories.map((c) => c.id);
  const unknown = Object.keys(FILES).filter((id) => !ids.includes(id));
  assert.deepEqual(unknown, [], 'data.js の categories に無いフォルダ名（src/videos/<ここ>/）');
});

test('動画一覧のどのファイル名からもタイトルが取り出せる', () => {
  // 「（山田）.mp4」のような名前だとタイトルが空になり、札に何も出ない
  for (const [id, names] of Object.entries(FILES)) {
    assert.ok(Array.isArray(names) && names.length > 0, `${id}: 一覧が空（serve.py は空のフォルダを書き出さない）`);
    for (const name of names) {
      assert.ok(DATA.parseVideoName(name).title, `src/videos/${id}/${name}: タイトルが空になる`);
    }
  }
});

test('同じカテゴリに同じタイトルの動画が重なっていない（ダウンロードし直した (1) の取り残しなど）', () => {
  for (const [id, names] of Object.entries(FILES)) {
    const titles = names.map((n) => DATA.parseVideoName(n).title);
    const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
    assert.deepEqual(dup, [], `src/videos/${id}/ に同じタイトルが 2 本以上ある`);
  }
});

test('applyVideoFiles は空のカテゴリを書き換えない（実物を置く前でも動く）', () => {
  const cat = DATA.categories[0];
  const before = cat.videos;

  DATA.applyVideoFiles({ [cat.id]: [] });
  assert.equal(cat.videos, before);

  DATA.applyVideoFiles(undefined);
  assert.equal(cat.videos, before);
});
