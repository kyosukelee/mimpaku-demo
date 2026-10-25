// 第4段階: AI問い合わせの上限・記録・権限のテスト
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const root = new URL("../", import.meta.url).pathname;
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role; grant usage on schema public to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`);
const grants = `grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;`;
for (const f of ["schema.sql", "seed.sql", "stage3_1.sql"]) { await db.exec(fs.readFileSync(root + f, "utf8")); await db.exec(grants); }
await db.exec(`revoke all on public.staff_directory from anon;`);
const users = { admin: "admin@example.com", staff: "staff@example.com", owner: "owner@example.com", viewer: "viewer@example.com", owner2: "owner2@example.com" };
for (const e of Object.values(users)) await db.query(`insert into auth.users (email) values ($1)`, [e]);
await db.exec(fs.readFileSync(root + "create-admin.sql", "utf8").replaceAll("your-email@example.com", "admin@example.com"));
await db.exec(fs.readFileSync(root + "create-users.sql", "utf8"));
await db.exec(fs.readFileSync(root + "seed_stage3.sql", "utf8"));
// Supabaseと同じく、新しいテーブル・関数に公開側の権限が最初から付く状態で流す
await db.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
await db.exec(fs.readFileSync(root + "stage3_3.sql", "utf8"));
await db.exec(fs.readFileSync(root + "stage4.sql", "utf8"));
await db.exec(fs.readFileSync(root + "stage4_1.sql", "utf8"));
await db.exec(fs.readFileSync(root + "stage4_1.sql", "utf8")); // 2回実行しても問題ない
const id = Object.fromEntries((await db.query(`select email, id from auth.users`)).rows.map((r) => [r.email, r.id]));
await db.exec(`insert into public.profiles (id, role, display_name) values ('${id[users.owner2]}', 'owner', 'オーナー2');
  insert into public.properties (slug, name_ja, is_published, owner_id) values ('other-demo', '別の物件', true, '${id[users.owner2]}');`);

const as = async (role, uid, sql, params) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.uid','${uid}', false);`);
  try { return await db.query(sql, params); } catch (e) { return { error: e.message, rows: [] }; } finally { await db.exec(`reset role;`); }
};
const begin = async (ip = "1.1.1.1", slug = "hiroshima-demo", role = "service_role") => as(role, "", `select public.begin_ai_call($1, $2) as r`, [slug, ip]);
const log = (slug, q, a, answered = true, kind = "ai") => as("service_role", "", `select public.log_chat($1, 'ja', $2, $3, $4, $5, '@cf/google/gemma-4-26b-a4b-it')`, [slug, kind, q, a, answered]);
let fails = 0;
const ok = (name, cond, extra) => { console.log(cond ? "OK  " : "FAIL", name, cond ? "" : (extra ?? "")); if (!cond) fails++; };
const count = async (role, uid, sql) => (await as(role, uid, sql)).rows?.[0]?.c ?? "ERR";

ok("anon は begin_ai_call を呼べない", !!(await begin("x", "hiroshima-demo", "anon")).error);
ok("ログイン済みも呼べない", !!(await as("authenticated", id[users.admin], `select public.begin_ai_call('hiroshima-demo','x')`)).error);
ok("anon は log_chat を呼べない", !!(await as("anon", "", `select public.log_chat('hiroshima-demo','ja','ai','q','a',true)`)).error);

const r = (await begin()).rows[0].r;
ok("呼び出しは ok で、物件の公開情報が返る", r.status === "ok" && r.property.name_ja === "ステイ中区(デモ)" && r.property.check_out === "10:00");
const text = JSON.stringify(r);
ok("AIに渡す情報に、鍵とWi-Fi(滞在コード用の項目)は含まれない", !text.includes("StayNaka-Demo") && !text.includes("demo-wifi") && !text.includes("鍵の受け取り"), text.slice(0, 120));
ok("公開の案内項目(13件)は含まれる", r.items.length === 13);
ok("非公開の物件は not_found", (await (async () => { await db.exec(`update properties set is_published=false where slug='hiroshima-demo'`); const x = (await begin("9.0.0.1")).rows[0].r.status; await db.exec(`update properties set is_published=true where slug='hiroshima-demo'`); return x; })()) === "not_found");

// 接続元ごとの上限: 1時間に10回(上の1回を含めて、1.1.1.1 はあと9回)
for (let i = 0; i < 9; i++) await begin("1.1.1.1");
ok("同じ接続元の11回目は limited_ip", (await begin("1.1.1.1")).rows[0].r.status === "limited_ip");
ok("limited_ip は1日の回数を増やさない", (await db.query(`select calls from usage_limits`)).rows[0].calls === 10);
ok("別の接続元は使える", (await begin("2.2.2.2")).rows[0].r.status === "ok");
await db.exec(`update ai_attempts set created_at = now() - interval '61 minutes' where ip = '1.1.1.1'`);
ok("1時間たつと、同じ接続元でまた使える", (await begin("1.1.1.1")).rows[0].r.status === "ok");

// 1日の上限: 50回(いまは12回)
for (let i = 0; i < 38; i++) await begin(`10.0.${i}.1`);
ok("1日の合計が50回になった", (await db.query(`select calls from usage_limits`)).rows[0].calls === 50);
ok("51回目は limited_day", (await begin("3.3.3.3")).rows[0].r.status === "limited_day");
ok("limited_day のあとも50回のまま(超えない)", (await db.query(`select calls from usage_limits`)).rows[0].calls === 50);
await db.exec(`update usage_limits set day = day - 1`);
ok("日付が変わると、また使える(日本時間の日付で数える)", (await begin("4.4.4.4")).rows[0].r.status === "ok");

// 記録
await log("hiroshima-demo", "チェックアウトは何時?", "10時です。", true);
await log("hiroshima-demo", "宇宙の果ては?", "わかりません。", false);
await log("hiroshima-demo", "火事です", "119番へ。", true, "emergency");
await log("other-demo", "別の物件の質問", "回答", true);
await log("hiroshima-demo", "x".repeat(500), "a", true, "bogus");
const longRow = (await db.query(`select length(question) l, kind from chat_logs order by id desc limit 1`)).rows[0];
ok("記録: 答えたモデルの名前が残る", (await db.query(`select model from chat_logs where question = 'チェックアウトは何時?'`)).rows[0].model === "@cf/google/gemma-4-26b-a4b-it");
ok("記録: モデル名なしで呼んでも記録できる(既定は空)", !(await as("service_role", "", `select public.log_chat(p_slug := 'hiroshima-demo', p_lang := 'en', p_kind := 'ai', p_question := 'q2', p_answer := 'a2', p_answered := true)`)).error && (await db.query(`select model from chat_logs where question = 'q2'`)).rows[0].model === "");
await db.exec(`delete from chat_logs where question = 'q2'`);
ok("anon は新しい log_chat も呼べない", !!(await as("anon", "", `select public.log_chat('hiroshima-demo','ja','ai','q','a',true,'m')`)).error);
ok("記録: 質問は300文字までに切る/不正な種類は ai にする", longRow.l === 300 && longRow.kind === "ai");
ok("admin は全部の記録(5件)を読める", await count("authenticated", id[users.admin], `select count(*)::int c from chat_logs`) === 5);
ok("viewer も全部読める", await count("authenticated", id[users.viewer], `select count(*)::int c from chat_logs`) === 5);
ok("owner は自分の物件の記録(4件)だけ", await count("authenticated", id[users.owner], `select count(*)::int c from chat_logs`) === 4);
ok("owner2 は別の物件の1件だけ", await count("authenticated", id[users.owner2], `select count(*)::int c from chat_logs`) === 1);
ok("staff は記録を読めない(0件)", await count("authenticated", id[users.staff], `select count(*)::int c from chat_logs`) === 0);
ok("anon は記録を読めない", !!(await as("anon", "", `select * from chat_logs`)).error);
ok("admin でも記録を書き換えられない", !!(await as("authenticated", id[users.admin], `update chat_logs set answer='x'`)).error);
ok("admin でも記録を足せない(書くのは関数だけ)", !!(await as("authenticated", id[users.admin], `insert into chat_logs (property_id, question, answer) select id,'q','a' from properties limit 1`)).error);
ok("使用状況: admin・viewer は読める、owner・anon は読めない",
  (await count("authenticated", id[users.admin], `select count(*)::int c from usage_limits`)) >= 1 &&
  (await count("authenticated", id[users.viewer], `select count(*)::int c from usage_limits`)) >= 1 &&
  (await count("authenticated", id[users.owner], `select count(*)::int c from usage_limits`)) === 0 &&
  !!(await as("anon", "", `select * from usage_limits`)).error);
ok("接続元の記録は、admin でも読めない", !!(await as("authenticated", id[users.admin], `select * from ai_attempts`)).error);

// 90日で自動削除
await db.exec(`update chat_logs set created_at = now() - interval '91 days' where question = '宇宙の果ては?'`);
await begin("5.5.5.5");
ok("90日を過ぎた記録は、次の呼び出しで消える", (await db.query(`select count(*)::int c from chat_logs where question = '宇宙の果ては?'`)).rows[0].c === 0 && (await db.query(`select count(*)::int c from chat_logs`)).rows[0].c === 4);
console.log(fails === 0 ? "\n全部通りました" : `\n${fails} 件失敗`);
process.exit(fails ? 1 : 0);
