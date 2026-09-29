# ch-uploader 入稿データ準備ガイド(拡張機能開発AIエージェント向け)

このドキュメントは、**Chrome拡張機能を開発しているあなた(拡張機能側のリポジトリで作業しているAIエージェント)** が、
`ch-uploader` にストア入稿を自動化させるために、成果物をどのフォルダ・ファイル構成で用意すればよいかを示す。

ch-uploader自体の実装方針(Page Object、Playwright運用ルールなど)は関知しなくてよい。
ここに書かれた**入力フォーマットだけ**を満たせば、あとはch-uploader側が自動でダッシュボードに入力する。

> **このファイルは拡張機能リポジトリにコピーして使ってもよい。** そのまま `store/AGENT.md` などに置くか、
> 拡張機能リポジトリの `CLAUDE.md` に丸ごと追記すれば、向こうのエージェントが ch-uploader を
> 参照しなくても入稿データを用意できる(仕様が古くなっていないかは下記スキーマ節の注記を参照)。

## 大前提: 入稿データはあなたのリポジトリが持つ

ch-uploaderは入稿データを一切持たない汎用CLIである。あなたのリポジトリ内に入稿データ一式を作り、
ch-uploader実行時にそのパスを引数で渡す運用になる。ch-uploaderのリポジトリにファイルをコピーする必要はない。

## 完了条件(これが揃えばあなたの作業は終わり)

1. `store/config.yaml` が存在し、下記スキーマを満たしている
2. `store/package.zip` が存在する(展開直下に `manifest.json` が来る構造)
3. `config.yaml` が参照する画像・テキストファイルが全て実在し、規定のピクセルサイズを満たしている
4. `permissionJustifications` のキーが `manifest.json` の `permissions` / `host_permissions` の実態と一致している
5. 下記「実行する」の手順でch-uploaderを実行し、下書き保存まで完了させた

作業の流れ: 拡張機能をビルドして zip を作る → 画像アセットを用意する → プライバシー関連の説明文を書く
→ 下記構成で配置する → `config.yaml` を1つ作る → ランチャーを叩いて入稿する。

## ディレクトリ構成

置き場所は自由だが、特に理由がなければリポジトリルート直下の `store/` にする。
**`config.yaml` 内のパスは、その `config.yaml` が置かれたディレクトリからの相対パスとして解決される。**
ch-uploader のリポジトリルートは基準にならない。

```
<あなたのリポジトリ>/store/
├── config.yaml
├── package.zip                       # ビルド済みzip(unpackedディレクトリではない)
└── assets/
    ├── icon.png                      # 必須 128x128px / 24bit PNG(アルファ可)
    ├── promo-tile-440x280.png        # 任意 440x280 / JPEG または 24bit PNG(アルファなし)
    ├── marquee-1400x560.png          # 任意 1400x560 / JPEG または 24bit PNG(アルファなし)
    └── locales/
        └── ja/                       # defaultLocale は必ず1つ用意する
            ├── description.txt       # 必須 プレーンテキスト 16,000文字以内
            └── screenshots/
                ├── 01.png            # 必須(最低1枚・最大5枚)
                └── 02.png            # 1280x800 または 640x400 / JPEG または 24bit PNG(アルファなし)
```

- ファイル名・ディレクトリ名は自由。`config.yaml` 側でパスを明示的に指定する。
- 画像サイズはChrome Web Storeの要件そのもの。**ピクセルサイズは必ず検証する。** ImageMagick があれば
  `magick identify assets/icon.png`、無ければ Node や Python でヘッダを読むなどして確認し、
  合っていないものはユーザーに報告する(勝手にリサイズして引き伸ばさない)。
- スクリーンショットとプロモーションタイルは **アルファチャンネルなし**。透過PNGを置くと弾かれる。
- `package.zip` は unpacked ディレクトリではなく、`manifest.json` を含むフォルダの**中身**を直接zip化したもの
  (zipを展開した直下に `manifest.json` が来る構造)。
- `package.zip` / `assets/` をコミットするかはこのリポジトリの方針に従う(ビルド生成物なら `.gitignore` 可)。
  `config.yaml` はテキストなのでコミット推奨。

## `config.yaml` スキーマ

バリデーションの正は ch-uploader 側の zod スキーマ `src/config/schema.ts`。
以下は現時点の要約で、**古くなっている可能性があるため、迷ったら `src/config/schema.ts` を直接確認する。**

```yaml
# 既存アイテムの更新時のみ指定(32文字)。
# 未指定ならCLIが新規アイテムを作成し、払い出されたIDをこのファイルに自動で書き戻す
# (= このリポジトリのファイルが実行後に書き換わる。書き戻された値はコミットする)。
extensionId: "abcdefghijklmnopabcdefghijklmnop"

privacy:
  # 単一用途の説明。1〜1000文字。「この拡張は何のための1機能か」を1つに絞って書く。
  singlePurpose: "Amazon.co.jpの商品ページに、楽天市場で販売されている同じ商品へのリンクと価格を表示します。"

  # manifest.json の permissions / host_permissions のキーごとに理由を書く。1〜1000文字。
  # キー名は manifest の値と完全一致させる。host_permissions の分は "host permission" というキーにする。
  permissionJustifications:
    storage: "楽天市場の店舗が改装中かどうかの判定結果を24時間キャッシュし、同じ店舗への確認アクセスを減らすために使用します。"
    host permission: "Amazon.co.jpの商品ページから商品名・JAN・ISBN・型番・価格を読み取り、楽天市場へのリンクを表示するために使用します。"

  # リモートコード(パッケージに含まれないJS/Wasmの読み込み・eval)を使うか
  usesRemoteCode: false

  dataUsage:
    # 収集するデータ種別。指定できるキーは以下6つだけ(それ以外は未対応・下記「未対応事項」参照):
    #   authenticationInfo / personalCommunications / location
    #   webHistory / userActivity / websiteContent
    # 何も収集しないなら空配列。
    collects: []

    # Chrome Web Store の3つの誓約。全て true でなければ公開できない。
    # ただし実態に反して true にしてはいけない(虚偽申告はポリシー違反)。
    certifications:
      noSellingToThirdParties: true
      noUseUnrelatedToSinglePurpose: true
      noUseForCreditworthinessOrLending: true

  privacyPolicyUrl: "https://example.com/privacy-policy"   # 必須・URL形式

storeListing:
  category: "ショッピング"          # 下の一覧から日本語表記を完全一致でコピーする
  defaultLocale: "ja"
  icon: "assets/icon.png"
  promoTileSmall: "assets/promo-tile-440x280.png"                 # 任意
  marqueeTile: "assets/marquee-1400x560.png"                     # 任意
  promoVideoUrl: "https://www.youtube.com/watch?v=xxxxxxxxxxx"    # 任意
  websiteUrl: "https://example.com"                              # 任意
  homepageUrl: "https://example.com"                             # 任意
  supportUrl: "https://example.com/support"                       # 任意
  adultContent: false

  # ロケールごとの説明文とスクリーンショット。複数書くと各ロケールに切り替えて入力される。
  # ここに書ける言語は、パッケージの _locales に存在する言語だけ(後述)。
  locales:
    ja:
      description: "assets/locales/ja/description.txt"
      screenshots:
        - "assets/locales/ja/screenshots/01.png"
        - "assets/locales/ja/screenshots/02.png"

package:
  zip: "package.zip"
```

任意項目は **キー自体を省略する**(空文字を入れるとバリデーションで落ちる)。

### `category` に指定できる値(日本語UI表記・完全一致)

CLIはダッシュボードのコンボボックスをこの表示テキストで選択するため、表記を1文字も変えないこと。

```
仕事効率化 / コミュニケーション / ツール / デベロッパー ツール / ワークフローと計画 / 教育 /
ライフスタイル / アート＆デザイン / エンタテイメント / ゲーム / ショッピング /
ソーシャル ネットワーク / ニュース＆天気 / 健康な暮らし / 家関係 / 旅行 / 楽しみ /
あなただけの CHROME / プライバシー&セキュリティ / ユーザー補助機能 / 機能と UI
```

(全角スペース・半角スペース・`＆` と `&` の使い分けも上記のとおり)

## 実行する(あなたが直接叩いてよい)

ch-uploader には **どのディレクトリからでも呼べるランチャー** が用意されている。
ch-uploader のリポジトリに `cd` する必要はない。第1引数はあなたのカレントディレクトリ基準の
相対パスでも絶対パスでもよい(ランチャー側で絶対パスに解決してから渡している)。

```
# Windows (cmd / PowerShell)
C:\ローカルリポジトリ\ch-uploader\bin\ch-upload.cmd .\store

# bash / WSL / Git Bash
/c/ローカルリポジトリ/ch-uploader/bin/ch-upload.sh ./store
```

特定タブだけやり直す場合は `--only` を足す(`privacy` / `storeListing` / `package` をカンマ区切り):

```
C:\ローカルリポジトリ\ch-uploader\bin\ch-upload.cmd .\store --only=storeListing
```

各ステップは冪等なので、途中で失敗しても同じコマンドを再実行すればよい。
終了コードは0=成功 / 1=失敗。失敗時は標準エラーにスタックトレースが出る。

> ch-uploader の置き場所はユーザーの環境によって異なる。上記は既定の
> `C:\ローカルリポジトリ\ch-uploader` を前提にしている。見つからなければユーザーにパスを聞き、
> **確認できたパスをこのファイルに書き込んでおく**(次回以降のあなたのために)。

### 実行前に確認すること

1. **ブラウザを全て終了させる。** ch-uploader はユーザーの実プロファイル(Brave/Chrome)を
   そのまま使うため、同じブラウザが1つでも起動しているとプロファイルのロック競合で起動に失敗する。
   起動中のときはその旨のエラーで即座に止まるので、**ユーザーにブラウザを閉じてもらってから再実行する**
   (あなたが勝手にブラウザプロセスを kill しないこと。作業中のタブを失わせる)。
2. **初回のみ ch-uploader 側に `.env` が必要。** `BROWSER_EXECUTABLE_PATH` /
   `BROWSER_PROFILE_DIR` が未設定だとその旨のエラーで止まる。その場合は
   `ch-uploader/.env.example` を参考に用意するようユーザーに依頼する(あなたがパスを推測して書かない)。
3. **ヘッドレスではない。** 実行するとブラウザウィンドウが実際に開き、自動操作の様子が見える。
   ユーザーの画面を占有するので、実行前に一声かけること。
4. **未ログインだと最大5分ユーザーの手動ログインを待つ。** その間コマンドは返ってこない。
   ログイン待ちのメッセージが出たらユーザーにログインを依頼する。

### 実行後

- ch-uploader は**「下書きとして保存する」までしか行わない。** 公開審査に出すには、ユーザーが
  ダッシュボードで「審査のため送信」を手動クリックする必要がある。実行後はそれを必ず案内すること。
- `extensionId` を省略して実行した場合、新規アイテムが作成され `config.yaml` にIDが書き戻されている。
  **書き戻された `config.yaml` をコミットする。**

## 未対応事項・制約(2026-09-29時点)

- **データ使用カテゴリは6種類のみ対応。** 個人情報 / 健康情報 / 金融・決済情報 に該当する場合は
  `collects` に書かず、「この項目はダッシュボードで手動入力してください」とユーザーに明示的に伝える。
  当てはまらないカテゴリで代用してはいけない。
- **`locales` に書ける言語はパッケージの `_locales` にある言語だけ。** ダッシュボードUIから言語を
  新規追加する手段はない。言語を増やすには `_locales/<lang>/messages.json` を含めてzipを作り直す。
- **CLIは「下書きとして保存する」までしか自動実行しない。** 「審査のため送信」はユーザーが
  ダッシュボードで手動クリックする。あなたもユーザーにそう案内すること。
- 「パッケージのタイトル」「パッケージの概要」はダッシュボード上で編集不可(manifest由来)。
  変更したい場合は `manifest.json` の `name` / `description` を直して zip を作り直す。

## あなたへのお願い(ポリシー面)

- **プライバシー・データ使用に関する記述は正確に。** `manifest.json` の実際の権限と
  `permissionJustifications` が対応していること、`dataUsage.collects` が実際の通信・保存処理と
  一致していることを、コードを確認したうえで書く。推測で埋めない。
  ここで嘘の申告をするとChrome Web Storeの審査ポリシー違反になる。
- 画像アセットが用意できない任意項目は `config.yaml` からキー自体を省略してよい。
- 不明な点(カテゴリの正式名称、権限名の書き方など)があれば `ch-uploader/CLAUDE.md` の
  「ダッシュボードUI構造」セクションを参照するか、ユーザーに確認すること。
