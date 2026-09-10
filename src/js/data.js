/**
 * HIDD 先行研究 紹介動画サイト — データ定義
 *
 * === 実データの入れ方 ===
 * 動画ファイルを src/videos/<カテゴリid>/ に置くだけです。
 * このファイルを編集する必要はありません。
 *
 *   src/videos/ai/多層防御の構築に関する実践研究（磯部泰良）.mp4
 *                 └────── タイトル ──────┘└ 発表者 ┘
 *
 * serve.py がフォルダを走査して src/js/videos.js を書き出し、
 * その一覧が下の videos を置き換えます（フォルダが空ならここの記述が使われる）。
 * ファイル名の読み取り規則は parseVideoName を参照。
 *
 * === カテゴリを増減する場合 ===
 * この categories 配列に足す／減らすだけで、球体上の配置は自動で均等になります。
 * 記載順がそのまま球体上の並び順（真上から時計回り）になります。
 */
window.HIDD_DATA = {
  categories: [
    {
      id: 'ai',
      label: 'AI・機械学習・知能システム',
      accent: '#5ac8fa',
      description: '機械学習・深層学習・データ解析を軸にした研究テーマ群。',
      videos: [
        {
          title: '深層学習による画像認識精度の改善',
          presenter: '〇〇研究室',
          summary: '少数データ環境での転移学習の有効性を検証した事例。',
          file: 'videos/sample/ai-01.mp4',
        },
        {
          title: '時系列データからの異常検知',
          presenter: '〇〇研究室',
          summary: 'センサーログを対象にした教師なし異常検知手法の比較。',
          file: 'videos/sample/ai-02.mp4',
        },
        {
          title: '自然言語処理による文書分類',
          presenter: '〇〇研究室',
          summary: '日本語文書に対する大規模言語モデルの適用と評価。',
          file: 'videos/sample/ai-03.mp4',
        },
        {
          title: '強化学習を用いた意思決定支援',
          presenter: '〇〇研究室',
          summary: 'シミュレーション環境での方策学習と実環境への転移。',
          file: 'videos/sample/ai-04.mp4',
        },
      ],
    },
    {
      id: 'game',
      label: 'ゲーム・VR・デジタルコンテンツ',
      accent: '#ff7ac6',
      description: 'ゲーム開発・VR/AR・インタラクティブコンテンツの研究テーマ群。',
      videos: [
        {
          title: 'VR 空間における身体感覚の拡張',
          presenter: '〇〇研究室',
          summary: 'アバタの見た目が操作感に与える影響を被験者実験で検証。',
          file: 'videos/sample/game-01.mp4',
        },
        {
          title: 'ゲーム AI による動的難易度調整',
          presenter: '〇〇研究室',
          summary: 'プレイヤの習熟度を推定してリアルタイムに難易度を変える仕組み。',
          file: 'videos/sample/game-02.mp4',
        },
        {
          title: 'AR を用いた展示ガイドの制作',
          presenter: '〇〇研究室',
          summary: 'スマートフォン AR による館内案内アプリの設計と評価。',
          file: 'videos/sample/game-03.mp4',
        },
        {
          title: 'プロシージャル生成による地形制作',
          presenter: '〇〇研究室',
          summary: 'ノイズ関数を組み合わせた自動地形生成とアート方向性の両立。',
          file: 'videos/sample/game-04.mp4',
        },
      ],
    },
    {
      id: 'web',
      label: 'Webサービス・アプリケーション開発',
      accent: '#7affa8',
      description: 'Web サービス・業務システム・モバイルアプリ開発の研究テーマ群。',
      videos: [
        {
          title: '業務プロセスの可視化と改善',
          presenter: '〇〇研究室',
          summary: '既存の紙業務をワークフロー化した際の効果測定。',
          file: 'videos/sample/web-01.mp4',
        },
        {
          title: 'Web アプリケーションの性能最適化',
          presenter: '〇〇研究室',
          summary: 'レンダリング戦略の違いが体感速度に与える影響の比較。',
          file: 'videos/sample/web-02.mp4',
        },
        {
          title: 'モバイルアプリの UI/UX 評価',
          presenter: '〇〇研究室',
          summary: 'ユーザビリティテストによる画面遷移設計の改善提案。',
          file: 'videos/sample/web-03.mp4',
        },
        {
          title: 'クラウド基盤への移行と運用自動化',
          presenter: '〇〇研究室',
          summary: 'オンプレミス環境からの移行手順と運用コストの変化。',
          file: 'videos/sample/web-04.mp4',
        },
      ],
    },
    {
      id: 'security',
      label: 'サイバーセキュリティ・ネットワーク',
      accent: '#ffc861',
      description: 'ネットワーク・情報セキュリティに関する研究テーマ群。',
      videos: [
        {
          title: 'ネットワーク攻撃の検知手法',
          presenter: '〇〇研究室',
          summary: '通信パターンの分析による不正アクセスの早期検出。',
          file: 'videos/sample/security-01.mp4',
        },
        {
          title: 'マルウェアの静的解析と分類',
          presenter: '〇〇研究室',
          summary: '検体の特徴量抽出による亜種の自動分類の試み。',
          file: 'videos/sample/security-02.mp4',
        },
        {
          title: '認証方式の安全性と使いやすさ',
          presenter: '〇〇研究室',
          summary: '多要素認証の導入がユーザの負担に与える影響の調査。',
          file: 'videos/sample/security-03.mp4',
        },
        {
          title: '無線ネットワークの通信品質改善',
          presenter: '〇〇研究室',
          summary: '混雑環境における電波干渉の測定とチャネル設計。',
          file: 'videos/sample/security-04.mp4',
        },
      ],
    },
    {
      id: 'iot',
      label: 'IoT・ロボティクス・組込みシステム',
      accent: '#b58cff',
      description: 'IoT・ロボット制御・組込み機器に関する研究テーマ群。',
      videos: [
        {
          title: 'IoT センサーネットワークの構築',
          presenter: '〇〇研究室',
          summary: '低消費電力無線を用いた環境計測システムの実装と運用。',
          file: 'videos/sample/iot-01.mp4',
        },
        {
          title: '自律移動ロボットの経路計画',
          presenter: '〇〇研究室',
          summary: '屋内環境における SLAM と障害物回避の実装。',
          file: 'videos/sample/iot-02.mp4',
        },
        {
          title: '組込み機器のリアルタイム制御',
          presenter: '〇〇研究室',
          summary: 'マイコン上での制御周期の安定化と消費電力の両立。',
          file: 'videos/sample/iot-03.mp4',
        },
        {
          title: 'ロボットアームの動作学習',
          presenter: '〇〇研究室',
          summary: '模倣学習による把持動作の獲得と実機での評価。',
          file: 'videos/sample/iot-04.mp4',
        },
      ],
    },
  ],
};

/** id からカテゴリを引く */
window.HIDD_DATA.findCategory = function (id) {
  return window.HIDD_DATA.categories.filter(function (c) { return c.id === id; })[0] || null;
};

/** 表示用の通し番号（1 始まり）。見つからなければ 0 */
window.HIDD_DATA.indexOf = function (category) {
  return window.HIDD_DATA.categories.indexOf(category) + 1;
};

/**
 * カテゴリの球面上の向き（単位ベクトル）。
 *
 * 5 個までは、記載順に「上・右・下・左・後ろ」の軸方向へ割り当てる。
 * 正面（+Z）は HIDD の表示用に必ず空けるので、後ろ向きのカテゴリは
 * 既定の向きでは球体の裏に隠れ、180 度回すと正面に出てくる。
 *
 * 6 個以上になった場合は軸だけでは足りないので、正面を空けたまま
 * 真上を起点に 360/N 度ずつの等間隔リングへ自動で切り替える。
 */
var AXIS_DIRECTIONS = [
  [0, 1, 0],    // 上
  [1, 0, 0],    // 右
  [0, -1, 0],   // 下
  [-1, 0, 0],   // 左
  [0, 0, -1]    // 後ろ
];

window.HIDD_DATA.direction = function (index) {
  var n = window.HIDD_DATA.categories.length;
  if (n <= AXIS_DIRECTIONS.length) return AXIS_DIRECTIONS[index];
  var a = (index / n) * Math.PI * 2;
  return [Math.sin(a), Math.cos(a), 0];
};

/** そのカテゴリが既定の向きで球体の裏側に隠れるか（＝後ろ向きか） */
window.HIDD_DATA.isBehind = function (index) {
  return window.HIDD_DATA.direction(index)[2] < -0.5;
};

/** 動画のローカルパス。無ければ null（まだ動画が置かれていないカテゴリ用） */
window.HIDD_DATA.videoFile = function (video) {
  return video.file || null;
};

/* ---------------- フォルダに置いた動画の取り込み ---------------- */

/**
 * ファイル名から表示用の情報を取り出す。
 *
 *   多層防御の構築とKali Linuxを活用した検証に関する実践研究（磯部泰良）.mp4
 *   └─────────────── タイトル ───────────────┘└ 発表者 ┘
 *
 * 末尾の丸括弧を発表者として扱う。半角 ( ) と全角（ ）が混ざっていても、
 * 開きと閉じが食い違っていても拾う（実際のファイルがそうなっているため）。
 * 【２期】のような角括弧はタイトルの一部として残す。
 * 発表者はアンダースコア区切り（…実践研究_小嶋翼.mp4）でも書ける。
 * ダウンロード時に付く末尾の (1) のような重複番号は捨てる。
 * 括弧もアンダースコアも無ければ、全体がタイトルになる。
 *
 * 先頭の「01_」「02-」は並び順を決めるための番号として扱い、表示からは外す。
 * 区切りを _ . - に限っているのは、「2024 年度の…」のようなタイトルを
 * 番号と誤解しないため（2D… のように数字の直後が文字なら番号とみなさない）。
 */
window.HIDD_DATA.parseVideoName = function (filename) {
  var stem = String(filename).replace(/\.[^.]+$/, '');

  /* 「… (1).mp4」のような重複番号。発表者と紛らわしいので先に落とす */
  stem = stem.replace(/[\s　]*[(（]\s*\d+\s*[)）][\s　]*$/, '');

  /* 並び順のための先頭番号。ここで外さないと _ 区切りの発表者と衝突する */
  stem = stem.replace(/^[\s　]*\d{1,3}[_.\-．][\s　]*/, '');

  var presenter = '';
  var paren = stem.match(/^(.*)[\s　_]*[(（]([^(（)）]*)[)）][\s　]*$/);
  if (paren) {
    stem = paren[1];
    presenter = paren[2];
  } else {
    var under = stem.match(/^(.*)_([^_]+)$/);
    if (under) {
      stem = under[1];
      presenter = under[2];
    }
  }

  return {
    title: stem.replace(/[\s　_]+$/, '').trim(),
    presenter: presenter.replace(/[\s　]+/g, ' ').trim()
  };
};

/**
 * serve.py が書き出した一覧（window.HIDD_VIDEO_FILES）を videos に流し込む。
 *
 * 形は { 'ai': ['タイトル（発表者）.mp4', ...], ... }。
 * 中身があるカテゴリだけ差し替えるので、まだ動画を置いていないカテゴリは
 * 上に書いた確認用の記述がそのまま残る。
 */
window.HIDD_DATA.applyVideoFiles = function (byCategory) {
  if (!byCategory) return;
  window.HIDD_DATA.categories.forEach(function (cat) {
    var files = byCategory[cat.id];
    if (!files || !files.length) return;
    cat.videos = files.map(function (name) {
      var info = window.HIDD_DATA.parseVideoName(name);
      return {
        title: info.title,
        presenter: info.presenter,
        /* ファイル名はそのまま URL に入れられない。# があるとそこから先が
           フラグメント扱いで切り落とされ、? も同じくクエリとして切れる。
           日本語やスペースもここで percent-encode しておく。 */
        file: 'videos/' + cat.id + '/' + encodeURIComponent(name)
      };
    });
  });
};

window.HIDD_DATA.applyVideoFiles(window.HIDD_VIDEO_FILES);
