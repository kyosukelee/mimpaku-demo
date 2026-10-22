# 民泊管理デモアプリ(広島・架空物件)

広島市中区の**架空のマンション一室**を想定した、民泊の宿泊者ガイド・管理アプリのデモです。
住宅宿泊管理業の営業資料と、開発の業務委託向けポートフォリオを兼ねています。

> 物件・人物・番号・連絡先はすべて架空です。実在するのは、平和記念公園や宮島などの公共の観光地のみです。

## いまの段階

**第1段階:宿泊者ガイド(日本語・英語)**

- トップ / チェックイン案内 / 周辺案内 / 困ったとき の4ページ
- 端末の言語で日英を自動選択し、画面上部で切り替え可能
- 物件情報は `data/property.json` の1ファイルだけ(第2段階でSupabaseに移す)

## 技術と選んだ理由

| 技術 | 役割 | 理由 |
|---|---|---|
| Astro | 宿泊者ガイド | 文章中心のページを軽く速く作れる。通信の弱い場所でも数秒で開く |
| Cloudflare Pages | 公開 | 無料枠で公開できる |

## 作り方の分担

プログラムの作成はAI(Claude)が担い、構想・技術選定・判断・確認・運用は自分が担当しています。

## ローカルで動かす

```
cd apps/guide
npm.cmd install      # PowerShell。macOS/Linuxは npm
npm.cmd run dev      # http://localhost:4321/p/hiroshima-demo/
npm.cmd run build    # dist/ に静的ファイルができる
```

## Cloudflare Pagesの設定

| 項目 | 値 |
|---|---|
| ルートディレクトリ | `apps/guide` |
| ビルドコマンド | `npm run build` |
| 出力ディレクトリ | `dist` |
| 環境変数 `NODE_VERSION` | `22` |

## QRコード

公開URLが決まったら、物件ごとのURLでQRコードを作る。

```
cd apps/guide
npm.cmd run qr -- https://<公開URL>/p/hiroshima-demo/
```

`docs/qr-hiroshima-demo.png` ができる。

## フォルダ構成

```
apps/guide/   宿泊者ガイド(Astro)
data/         第1段階の物件情報JSON
functions/    サーバー側の関数(第3・4段階で使う)
supabase/     テーブル定義とRLSのSQL(第2段階で使う)
docs/         設計書、スクリーンショット、QRコード
```
