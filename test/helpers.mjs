/**
 * テスト用の読み込み補助。
 *
 * src/js/*.js はブラウザ向けに window へ代入する形なので、
 * グローバルに偽の window を用意してから同じ realm で実行する。
 * （別コンテキストで実行すると Array などの組み込みが別物になり、
 *   assert.deepEqual が prototype 違いで落ちるため）
 *
 * ビルド工程を持たない方針（CLAUDE.md）に合わせ、変換は一切しない。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function repoPath(...parts) {
  return path.join(ROOT, ...parts);
}

export function read(...parts) {
  return readFileSync(repoPath(...parts), 'utf8');
}

/**
 * python3 や Chrome のような、Node の外のプログラムが要る検査の skip 指定。
 *
 * 手元に無ければ飛ばす（理由は結果に出る）。CI（環境変数 CI が立つ）では飛ばさずに落とす。
 * CI で黙って飛ばすと、何も検査していないのに緑になるため。
 */
export function skipWithout(found, what) {
  if (found) return false;
  if (process.env.CI) throw new Error(`${what} が見つからない（CI では飛ばさない）`);
  return `${what} が見つからないので飛ばした`;
}

/**
 * ブラウザ用スクリプトを偽 window の上で実行し、その window を返す。
 *
 * 読み込み後も globalThis.window は残したままにする。
 * data.js の direction() などは呼び出し時に window を参照するため、
 * 片付けてしまうと後から呼べなくなる。
 * node --test はファイルごとに別プロセスなので、残しても他へ影響しない。
 */
export function loadBrowserScripts(...relPaths) {
  const win = globalThis.window || (globalThis.window = {});
  for (const rel of relPaths) {
    vm.runInThisContext(readFileSync(repoPath(rel), 'utf8'), { filename: rel });
  }
  return win;
}
