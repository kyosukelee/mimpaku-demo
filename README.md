# 民泊管理デモアプリ(広島・架空物件)

広島市中区の**架空のマンション一室**を想定した、民泊の宿泊者ガイド・管理アプリのデモです。
住宅宿泊管理業の営業資料と、開発の業務委託向けポートフォリオを兼ねています。

> 物件・人物・番号・連絡先はすべて架空です。実在するのは、平和記念公園や宮島などの公共の観光地のみです。

## いまの段階

**第3段階-1:清掃とスタッフ用PWA**(LINE通知は3-2、滞在コードは3-3)

- 管理者が予約(架空)のチェックアウト日を登録すると、その日の**清掃タスクが自動でできる**(期限は日本時間のチェックイン時刻)
- 清掃スタッフは、スマホのPWAで「今日の清掃」を開き、**チェックリスト・写真・完了報告**を行う
- 管理者・オーナーは、清掃の状況(未完了・期限超過・完了写真)を見られる
- **閲覧専用のデモ用アカウント**で、営業先や業務委託の相手が、変更はできない状態で実際に触れる
- 電波が弱い現場のために、**画面の枠のキャッシュ**と**入力途中の端末保存**に対応(電波が戻ると自動で送る)
- 第2段階: Supabase化と管理画面 / 第1段階: 宿泊者ガイド(日本語・英語)

![スタッフの作業画面](docs/screenshot-staff-work.png)

## 技術と選んだ理由

| 技術 | 役割 | 理由 |
|---|---|---|
| Astro | 宿泊者ガイド | 文章中心のページを軽く速く作れる。静的な内容を先に出し、あとから最新に差し替える |
| React + Vite(PWA) | 管理画面・スタッフ画面 | 入力と一覧の操作が多い画面に向く。ホーム画面に追加して使える |
| Supabase | データ・ログイン・写真 | 行単位の権限(RLS)で、立場ごとに見せる範囲を分けられる |
| Cloudflare Pages | 公開 | 無料枠で、ガイドと管理画面を別々に公開できる |

清掃スタッフ用を、PWAにするかFlutterにするかは比べて決めました。
通知は(PWAが弱いiPhoneの通知ではなく)LINEで送る設計で、必要な機能(カメラ・チェックリスト・送信)はPWAで足りるため、PWAにしています。
実運用で、通知や裏での処理が足りなくなったり、BluetoothやNFCの機器と連携したくなったりしたら、データ(Supabase)はそのままで画面だけFlutterに作り替えられます。

## 権限(RLS)

| 立場 | 読める | 書ける |
|---|---|---|
| 宿泊者(未ログイン) | 公開中の物件と、公開中かつ滞在コード不要の項目 | なし |
| admin | すべて | すべて |
| viewer(閲覧専用) | すべて(スタッフのメール・LINE IDは除く) | なし |
| owner | 自分の物件の清掃の状況と写真 | なし |
| staff | 自分の担当の清掃と、その写真 | 担当の清掃の「チェックの完了印・写真・状態・申し送り」だけ |

- 全テーブルでRLSを有効にしています。画面に置くのは、公開してよい Publishable key(または従来の anon key)だけです。
- スタッフが変えてよい項目の制限と、完了の条件(チェックが全部ついている・写真が1枚以上)は、**データベース側のトリガー**で守ります。画面を通さず直接APIをたたいても、守られます。
- 写真は非公開のバケットに置き、期限つきのURLで見せます。保存先は「タスクのID/ファイル名」で、タスクの担当者・オーナー・admin・viewerだけが読めます。
- 写真は、端末側で長辺1600pxまで縮めてから送ります(保存容量と通信量を減らす)。

## 作り方の分担

プログラムの作成はAI(Claude)が担い、構想・技術選定・判断・確認・運用は自分が担当しています。

## セットアップ

### 1. Supabase

最初から作るときの順番です(第1・2段階が済んでいれば、手順2から)。

1. [Supabase](https://supabase.com) で新しいプロジェクトを作る(社内ポータルとは別)。
2. **SQL Editor** で、次の順に実行する。それぞれ1回だけ。
   1. `supabase/schema.sql` ― テーブルとRLS
   2. `supabase/seed.sql` ― 架空のガイドのデータ
   3. `supabase/stage3_1.sql` ― 予約・清掃タスク・写真の保存先・閲覧専用の権限
3. **Authentication → Users → Add user** で、管理者のユーザーを作る(Auto Confirm User をオン)。
4. `supabase/create-admin.sql` のメールアドレスを書き換えて実行する(管理者として登録される)。
5. 同じ方法で、**スタッフ・オーナー・閲覧専用**の3人を作る(メールアドレスは `example.com` で終わる架空のものでよい)。
6. `supabase/create-users.sql` の3つのメールアドレスを書き換えて実行する。
7. `supabase/seed_stage3.sql` を実行する(清掃のチェックリストのひな型と、予約3件。日付は実行した日が基準)。
8. **Storage** に、非公開のバケット `cleaning-photos` ができていることを確認する。
9. **Authentication** で、新規ユーザー登録(Allow new users to sign up)をオフにする。
10. **Project Settings → API Keys** から、`Project URL` と **Publishable key**(`sb_publishable_...`)を控える。`secret` / `service_role` は使わない。

### 2. 宿泊者ガイド(Cloudflare Pages: `mimpaku-demo`)

| 項目 | 値 |
|---|---|
| ルートディレクトリ | `apps/guide` |
| ビルドコマンド | `npm run build` |
| 出力ディレクトリ | `dist` |
| `NODE_VERSION` | `22` |
| `PUBLIC_SUPABASE_URL` | Project URL(`https://〇〇.supabase.co`。末尾に何も付けない) |
| `PUBLIC_SUPABASE_ANON_KEY` | Publishable key |

### 3. 管理画面(Cloudflare Pages: `mimpaku-console`)

| 項目 | 値 |
|---|---|
| ルートディレクトリ | `apps/console` |
| ビルドコマンド | `npm run build` |
| 出力ディレクトリ | `dist` |
| `NODE_VERSION` | `22` |
| `VITE_SUPABASE_URL` | Project URL(末尾に何も付けない) |
| `VITE_SUPABASE_ANON_KEY` | Publishable key |
| `VITE_GUIDE_URL` | `https://mimpaku-demo.pages.dev` |

### 4. スマホにPWAを入れる(スタッフ用)

- **iPhone**: Safariで管理画面のURLを開き、共有ボタン → 「ホーム画面に追加」。(iPhoneでは、ホーム画面に追加してから使うのが前提です)
- **Android**: Chromeで開き、メニュー → 「アプリをインストール」または「ホーム画面に追加」。

## 営業先・業務委託の相手に触ってもらうとき

閲覧専用のアカウント(`viewer`)を渡します。このアカウントは、すべての画面を見られますが、どこも変更できません(データベース側で拒否されます)。
パスワードは、渡す相手ごとに分けて、使わなくなったら Supabase の Authentication → Users で変更または削除してください。
管理者(`admin`)のアカウントは、絶対に渡さないでください。

## ローカルで動かす

```
# ガイド
cd apps/guide
copy .env.example .env      # 値を書き換える(未設定でも静的な内容で動く)
npm.cmd install
npm.cmd run dev             # http://localhost:4321/p/hiroshima-demo/

# 管理画面・スタッフ画面
cd apps/console
copy .env.example .env      # 値を書き換える
npm.cmd install
npm.cmd run dev
```

## テスト

`supabase/tests/` に、SQLとRLSのテストがあります(本物のPostgresで、立場ごとの読み書きの範囲を確認)。

```
cd supabase/tests
npm.cmd install
npm.cmd test
```

## QRコード

```
cd apps/guide
npm.cmd run qr -- https://<公開URL>/p/hiroshima-demo/
```

`docs/qr-hiroshima-demo.png` ができる。

## 架空データの元

`data/property.json` が、ビルド時の表示と `supabase/seed.sql` の元になる。内容を変えたら次を実行して、seed を作り直す。

```
node supabase/gen-seed.mjs
```

## フォルダ構成

```
apps/guide/     宿泊者ガイド(Astro)
apps/console/   管理画面・オーナー画面・スタッフ画面(React + Vite、PWA)
data/           架空データ(property.json)
functions/      サーバー側の関数(第3段階-2・3で使う)
supabase/       schema.sql / seed.sql / stage3_1.sql / create-*.sql / seed_stage3.sql / tests/
docs/           設計書、スクリーンショット、QRコード
```
