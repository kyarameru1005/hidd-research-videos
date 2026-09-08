# HIDD 先行研究 紹介動画サイト

先行研究の紹介動画をカテゴリ別に閲覧できる静的サイトです。
中央の球体を回してカテゴリを選び、カテゴリページから Google ドライブ上の動画を再生します。

## すぐ開く

```sh
python3 serve.py
```

- 本番サイト: <http://localhost:8000/src/>
- 検討用デモ: <http://localhost:8000/demo/>

`src/index.html` をダブルクリックしても動きます（ビルド工程はありません）。
ただしローカル動画を扱う場合は `serve.py` を使ってください（理由は [docs/operations.md](docs/operations.md)）。

## テスト

```sh
node --test test/*.test.js
```

Node 標準のテストランナーだけで動きます（npm 不要）。
データの整合性、回転の計算、構成の決まりごと（`file://` で開けるか、外部依存が混じっていないか）を検査します。

## ディレクトリ

```
src/                本番サイト（これ単体で完結して動く）
  index.html          トップ（入場アニメーション + 球体）
  category.html       カテゴリ詳細（?cat=<id> で共通描画）
  css/                common / index / category
  js/                 data.js（内容の編集はここだけ）/ geometry / sphere / intro / category / texture-lab
  vendor/             Three.js r149（UMD 版・同梱）
  videos/             動画ファイル（実物は Git 管理外。sample のみ追跡）

demo/               検討用の比較・試作ページ（本番からは独立）
  index.html          デモ一覧
  texture.html        球体テクスチャ 6 案
  category-ui.html    動画一覧ページの UI 6 案
  stars.html          星 + 放置時の自動再生

docs/               ドキュメント
  requirements.md     最初に受け取った要件メモ（原文）
  data.md             動画・カテゴリの編集方法
  operations.md       動かし方、動画の用意、展示運用
  decisions.md        設計判断と落とし穴の記録

test/               テスト（node --test test/*.test.js）
serve.py            簡易サーバー（Range 対応）
CLAUDE.md           このリポジトリでの作業指示
```

## 操作方法

| 操作 | 動き |
|---|---|
| 球体をドラッグ | 回転（離すと慣性で少し流れる） |
| カテゴリをクリック | 正面に寄せてからカテゴリページへ移動 |
| 矢印キー | 球体を回転（球体にフォーカスがあるとき） |
| Tab / Enter | 画面下部のカテゴリ一覧から選択 |
| Esc | 動画モーダルを閉じる |

### 文字が見える条件

カテゴリ名と HIDD の文字は、**その面を正面に向けたときだけ**表示されます。
正面から約 21 度以内で全開、約 57 度で消えます。既定の向きでは HIDD だけが見えます。
カテゴリの位置は球面上の色付きの点で分かり、画面下部の一覧からはいつでも選べます。

### 無操作時の自動回転

**1 分間まったく操作がないと、球体がゆっくり回り始めます。**
正面（HIDD）→ 上 → 右 → 下 → 左 → 後ろ → 正面… の順に巡回し、1 周およそ 30 秒です。
操作があれば即座に止まります。タブが見えていないあいだと、
OS の「視差効果を減らす」設定が有効な場合は回りません。

待ち時間や速度は `src/js/sphere.js` の `IDLE_MS` と `TOUR_RAD_PER_SEC` で変えられます。

## 動画を入れる

`src/js/data.js` を編集します。→ **[docs/data.md](docs/data.md)**

PowerPoint のビデオ出力（MP4）はほぼそのまま使えます。→ **[docs/operations.md](docs/operations.md)**

## 検討中のこと

動画一覧ページの UI と、星のインタフェースを本番に取り込むかは未決定です。
`demo/` で比較できます。→ **[docs/decisions.md](docs/decisions.md)**

## 動作環境

高スペックでない PC で動かす前提です。

- **静止したら描画ループを止める** — 回転中・アニメーション中だけ `requestAnimationFrame` を回します
- タブが見えていないあいだは描画しません
- 解像度は `devicePixelRatio` 1.5 までに制限
- ライトオブジェクトもポストプロセスも使わず、陰影とリムライトは 1 パスの軽いシェーダで処理
- テクスチャは起動時に 1 枚（512×256）生成するだけで、以降は再生成しません
- WebGL が使えない環境では球体を出さず、カテゴリ一覧に自動で切り替わります
