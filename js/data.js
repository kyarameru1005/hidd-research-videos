/**
 * HIDD 先行研究 紹介動画サイト — データ定義
 *
 * === 実データの入れ方 ===
 * 各カテゴリの videos 配列を書き換えるだけで済みます。
 * driveId は Google ドライブの共有 URL から取り出します。
 *   https://drive.google.com/file/d/★この部分★/view?usp=sharing
 * driveId の代わりに url: '...' を直接書くこともできます。
 *
 * 注意: ドライブ側の共有設定を「リンクを知る全員 / 閲覧者」にしないと再生できません。
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
          driveId: 'PLACEHOLDER_AI_1',
        },
        {
          title: '時系列データからの異常検知',
          presenter: '〇〇研究室',
          summary: 'センサーログを対象にした教師なし異常検知手法の比較。',
          driveId: 'PLACEHOLDER_AI_2',
        },
        {
          title: '自然言語処理による文書分類',
          presenter: '〇〇研究室',
          summary: '日本語文書に対する大規模言語モデルの適用と評価。',
          driveId: 'PLACEHOLDER_AI_3',
        },
        {
          title: '強化学習を用いた意思決定支援',
          presenter: '〇〇研究室',
          summary: 'シミュレーション環境での方策学習と実環境への転移。',
          driveId: 'PLACEHOLDER_AI_4',
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
          driveId: 'PLACEHOLDER_GAME_1',
        },
        {
          title: 'ゲーム AI による動的難易度調整',
          presenter: '〇〇研究室',
          summary: 'プレイヤの習熟度を推定してリアルタイムに難易度を変える仕組み。',
          driveId: 'PLACEHOLDER_GAME_2',
        },
        {
          title: 'AR を用いた展示ガイドの制作',
          presenter: '〇〇研究室',
          summary: 'スマートフォン AR による館内案内アプリの設計と評価。',
          driveId: 'PLACEHOLDER_GAME_3',
        },
        {
          title: 'プロシージャル生成による地形制作',
          presenter: '〇〇研究室',
          summary: 'ノイズ関数を組み合わせた自動地形生成とアート方向性の両立。',
          driveId: 'PLACEHOLDER_GAME_4',
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
          driveId: 'PLACEHOLDER_WEB_1',
        },
        {
          title: 'Web アプリケーションの性能最適化',
          presenter: '〇〇研究室',
          summary: 'レンダリング戦略の違いが体感速度に与える影響の比較。',
          driveId: 'PLACEHOLDER_WEB_2',
        },
        {
          title: 'モバイルアプリの UI/UX 評価',
          presenter: '〇〇研究室',
          summary: 'ユーザビリティテストによる画面遷移設計の改善提案。',
          driveId: 'PLACEHOLDER_WEB_3',
        },
        {
          title: 'クラウド基盤への移行と運用自動化',
          presenter: '〇〇研究室',
          summary: 'オンプレミス環境からの移行手順と運用コストの変化。',
          driveId: 'PLACEHOLDER_WEB_4',
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
          driveId: 'PLACEHOLDER_SEC_1',
        },
        {
          title: 'マルウェアの静的解析と分類',
          presenter: '〇〇研究室',
          summary: '検体の特徴量抽出による亜種の自動分類の試み。',
          driveId: 'PLACEHOLDER_SEC_2',
        },
        {
          title: '認証方式の安全性と使いやすさ',
          presenter: '〇〇研究室',
          summary: '多要素認証の導入がユーザの負担に与える影響の調査。',
          driveId: 'PLACEHOLDER_SEC_3',
        },
        {
          title: '無線ネットワークの通信品質改善',
          presenter: '〇〇研究室',
          summary: '混雑環境における電波干渉の測定とチャネル設計。',
          driveId: 'PLACEHOLDER_SEC_4',
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
          driveId: 'PLACEHOLDER_IOT_1',
        },
        {
          title: '自律移動ロボットの経路計画',
          presenter: '〇〇研究室',
          summary: '屋内環境における SLAM と障害物回避の実装。',
          driveId: 'PLACEHOLDER_IOT_2',
        },
        {
          title: '組込み機器のリアルタイム制御',
          presenter: '〇〇研究室',
          summary: 'マイコン上での制御周期の安定化と消費電力の両立。',
          driveId: 'PLACEHOLDER_IOT_3',
        },
        {
          title: 'ロボットアームの動作学習',
          presenter: '〇〇研究室',
          summary: '模倣学習による把持動作の獲得と実機での評価。',
          driveId: 'PLACEHOLDER_IOT_4',
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
 * 真上（+Y）を起点に、記載順で時計回りに 360/N 度ずつ等間隔で並べる。
 * すべて z = 0 の面（＝カメラから見て正面を取り巻くリング）に置くので、
 * 正面（+Z）は HIDD の表示用に必ず空く。
 * カテゴリを増減しても自動で均等配置になる。
 */
window.HIDD_DATA.direction = function (index) {
  var n = window.HIDD_DATA.categories.length;
  var a = (index / n) * Math.PI * 2;
  return [Math.sin(a), Math.cos(a), 0];
};

/** 動画の視聴用 URL を組み立てる（mode: 'preview' | 'view'） */
window.HIDD_DATA.videoUrl = function (video, mode) {
  if (video.url) return video.url;
  if (!video.driveId) return null;
  return 'https://drive.google.com/file/d/' + video.driveId + '/' + (mode === 'preview' ? 'preview' : 'view');
};
