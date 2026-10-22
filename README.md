# 民泊管理デモアプリ(広島・架空物件)

広島市中区の**架空のマンション一室**を想定した、民泊の宿泊者ガイド・管理アプリのデモです。
住宅宿泊管理業の営業資料と、開発の業務委託向けポートフォリオを兼ねています。

> 物件・人物・番号・連絡先はすべて架空です。実在するのは、平和記念公園や宮島などの公共の観光地のみです。

## いまの段階

**第2段階:管理画面とデータ化**

- 物件情報と案内項目を Supabase に移し、管理者が管理画面で日英を編集できる
- 管理画面での編集は、宿泊者ガイドにすぐ反映される(ページを開いたときに最新を取得)
- 公開・非公開の切り替え(物件ごと、項目ごと)と、項目の追加・削除・並び替え
- Supabase に接続できないときは、ビルド時に埋め込んだ内容を表示する
- 第1段階: 宿泊者ガイド(日本語・英語、4ページ、QRコードで開く)

## 技術と選んだ理由

| 技術 | 役割 | 理由 |
|---|---|---|
| Astro | 宿泊者ガイド | 文章中心のページを軽く速く作れる。静的な内容を先に出し、あとから最新に差し替える |
| React + Vite | 管理画面 | 入力フォームと一覧の操作が多い画面に向く |
| Supabase | データ・ログイン | 行単位の権限(RLS)で、誰が何を読み書きできるかをデータベース側で守る |
| Cloudflare Pages | 公開 | 無料枠で、ガイドと管理画面を別々に公開できる |

## 権限(RLS)

| 立場 | 読める | 書ける |
|---|---|---|
| 宿泊者(未ログイン) | 公開中の物件と、公開中かつ滞在コード不要の項目 | なし |
| admin | すべて | すべて |
| owner | 自分の物件(第3段階で使う) | なし |
| staff | 自分のプロフィール | なし |

全テーブルでRLSを有効にしています。鍵(service_role)は使わず、画面に置くのは公開してよい Publishable key(または従来の anon key)だけです。

## 作り方の分担

プログラムの作成はAI(Claude)が担い、構想・技術選定・判断・確認・運用は自分が担当しています。

## セットアップ

### 1. Supabase

1. [Supabase](https://supabase.com) で新しいプロジェクトを作る(社内ポータルとは別のプロジェクトにする)。
2. **SQL Editor** で次の順に実行する(それぞれ貼り付けて Run)。
   1. `supabase/schema.sql` ― テーブルとRLS
   2. `supabase/seed.sql` ― 架空データ(最初の1回だけ)
3. **Authentication → Users → Add user** で、管理者のメールアドレスとパスワードを作る(Auto Confirm User をオン)。
4. `supabase/create-admin.sql` のメールアドレスを書き換えて実行する(管理者として登録される)。
5. **Authentication → Sign In / Providers**(または Settings)で、新規ユーザー登録(Allow new users to sign up)をオフにする。
6. **Project Settings → API Keys** から `Project URL` と **Publishable key**(`sb_publishable_...`)を控える。従来の `anon` キー(Legacy タブ)でも動く。`secret` / `service_role` は使わない。

### 2. 宿泊者ガイド(Cloudflare Pages: `mimpaku-demo`)

環境変数を追加して、再デプロイする。

| 名前 | 値 |
|---|---|
| `PUBLIC_SUPABASE_URL` | Project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Publishable key(または従来の anon キー) |

### 3. 管理画面(Cloudflare Pages: `mimpaku-console`)

| 項目 | 値 |
|---|---|
| ルートディレクトリ | `apps/console` |
| ビルドコマンド | `npm run build` |
| 出力ディレクトリ | `dist` |
| `NODE_VERSION` | `22` |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable key(または従来の anon キー) |
| `VITE_GUIDE_URL` | `https://mimpaku-demo.pages.dev` |

## ローカルで動かす

```
# ガイド
cd apps/guide
copy .env.example .env      # 値を書き換える(未設定でも静的な内容で動く)
npm.cmd install
npm.cmd run dev             # http://localhost:4321/p/hiroshima-demo/

# 管理画面
cd apps/console
copy .env.example .env      # 値を書き換える
npm.cmd install
npm.cmd run dev
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
apps/console/   管理画面(React + Vite)
data/           架空データ(property.json)
functions/      サーバー側の関数(第3・4段階で使う)
supabase/       schema.sql / seed.sql / create-admin.sql / gen-seed.mjs
docs/           設計書、スクリーンショット、QRコード
```
