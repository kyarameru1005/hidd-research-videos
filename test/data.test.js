/**
 * src/js/data.js の整合性。
 * 内容の編集はこのファイルだけで行う運用なので、壊れると全ページに波及する。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScripts } from './helpers.mjs';

const { HIDD_DATA: DATA } = loadBrowserScripts('src/js/data.js');
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

test('各動画にタイトルと再生元がある', () => {
  for (const c of DATA.categories) {
    assert.ok(c.videos.length > 0, `動画が 0 件: ${c.id}`);
    for (const v of c.videos) {
      assert.ok(v.title && v.title.trim(), `title が空: ${c.id}`);
      assert.ok(v.driveId || v.url || v.file,
        `driveId / url / file のいずれも無い: ${c.id} / ${v.title}`);
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

test('videoUrl が driveId から正しい URL を組み立てる', () => {
  const v = { driveId: 'ABC123' };
  assert.equal(DATA.videoUrl(v, 'preview'), 'https://drive.google.com/file/d/ABC123/preview');
  assert.equal(DATA.videoUrl(v, 'view'), 'https://drive.google.com/file/d/ABC123/view');
});

test('videoUrl は url 指定を優先し、どちらも無ければ null', () => {
  assert.equal(DATA.videoUrl({ url: 'https://example.com/a.mp4', driveId: 'X' }),
    'https://example.com/a.mp4');
  assert.equal(DATA.videoUrl({}), null);
});
