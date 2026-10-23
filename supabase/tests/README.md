# SQLとRLSのテスト

本物のPostgres(PGlite)に `schema.sql` → `seed.sql` → `stage3_1.sql` → `seed_stage3.sql` を流し、
立場ごと(未ログイン・admin・owner・staff・viewer)に、読める範囲と書ける範囲をテストします。

```
cd supabase/tests
npm.cmd install
npm.cmd test
```

確認する内容の例:
- 予約を登録すると、清掃タスクが自動でできる(期限は日本時間のチェックイン時刻)
- スタッフは、自分の担当のタスクだけ読めて、チェックの完了印・写真・状態しか変えられない
- チェックが全部ついて写真が1枚以上ないと、完了にできない
- 写真は、担当のスタッフだけが置け、オーナー・admin・viewerは読める。他の人は読めない
- viewer(閲覧専用)は、どのテーブルにも書けない

Supabase本体の Auth と Storage は、テスト用の最小の代用品で置き換えています。
