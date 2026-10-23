// 第3段階-3: 滞在コードの照合のテスト
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
await db.exec(fs.readFileSync(root + "seed_stage3.sql", "utf8"));
// Supabaseと同じく、新しいテーブル・関数に公開側の権限が最初から付く状態を再現する。
// そのうえで stage3_3.sql の revoke が効くかを確かめる
await db.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
await db.exec(fs.readFileSync(root + "stage3_3.sql", "utf8"));
const ADMIN = "00000000-0000-0000-0000-0000000000a1";
await db.exec(`insert into auth.users values ('${ADMIN}','admin@example.com'); insert into public.profiles (id, role) values ('${ADMIN}','admin');`);

const as = async (role, uid, sql, params) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.uid','${uid}', false);`);
  try { return await db.query(sql, params); } catch (e) { return { error: e.message, rows: [] }; } finally { await db.exec(`reset role;`); }
};
const verify = async (code, ip = "1.1.1.1", slug = "hiroshima-demo", role = "service_role") =>
  (await as(role, "", `select public.verify_stay_code($1, $2, $3) as r`, [slug, code, ip]));
let fails = 0;
const ok = (name, cond, extra) => { console.log(cond ? "OK  " : "FAIL", name, cond ? "" : (extra ?? "")); if (!cond) fails++; };
const codes = Object.fromEntries((await db.query(`select label, stay_code from stays`)).rows.map((r) => [r.label, r.stay_code]));

ok("未ログイン(anon)は照合の関数を呼べない", !!(await verify("DEMO-2026", "x", "hiroshima-demo", "anon")).error);
ok("ログイン済み(authenticated)も呼べない", !!(await as("authenticated", ADMIN, `select public.verify_stay_code('hiroshima-demo','DEMO-2026','x')`)).error);
const good = (await verify(codes["予約B(架空)"])).rows[0].r;
ok("今日チェックアウトの予約のコードは有効", good.status === "ok");
ok("返すのは『滞在コードが必要』な鍵とWi-Fiの2項目だけ", good.items?.length === 2 && good.items.map((i) => i.title_ja).join(",") === "鍵の受け取り,Wi-Fi", JSON.stringify(good.items?.map((i) => i.title_ja)));
ok("返す項目に本文が入っている", good.items[0].body_ja.includes("キーボックス"));
ok("明日チェックアウトの予約のコードも有効", (await verify(codes["予約C(架空)"])).rows[0].r.status === "ok");
ok("昨日チェックアウトの予約のコードは期限切れ", (await verify(codes["予約A(架空)"])).rows[0].r.status === "invalid");
ok("デモ用コードは期限なしで有効(小文字・前後の空白も可)", (await verify("  demo-2026 ")).rows[0].r.status === "ok");
ok("まちがったコードは invalid", (await verify("WRONG1")).rows[0].r.status === "invalid");
ok("空のコードは invalid", (await verify("")).rows[0].r.status === "invalid");
ok("存在しない物件は not_found", (await verify("DEMO-2026", "1.1.1.1", "nope")).rows[0].r.status === "not_found");
await db.exec(`update properties set is_published = false where slug='hiroshima-demo'`);
ok("非公開の物件は not_found", (await verify("DEMO-2026")).rows[0].r.status === "not_found");
await db.exec(`update properties set is_published = true where slug='hiroshima-demo'`);

// 総当たりの防止
for (let i = 0; i < 10; i++) await verify(`BAD${i}`, "9.9.9.9");
ok("同じ接続元で10回まちがえると locked", (await verify("BAD-X", "9.9.9.9")).rows[0].r.status === "locked");
ok("locked の間は、正しいコードでも受け付けない", (await verify("DEMO-2026", "9.9.9.9")).rows[0].r.status === "locked");
ok("別の接続元には影響しない", (await verify("DEMO-2026", "2.2.2.2")).rows[0].r.status === "ok");
await db.exec(`update code_attempts set created_at = now() - interval '16 minutes' where ip = '9.9.9.9'`);
ok("15分たつと、また受け付ける", (await verify("DEMO-2026", "9.9.9.9")).rows[0].r.status === "ok");

// 公開側からは見えない
ok("anon: 公開の案内項目は13件(鍵とWi-Fiが伏せられる)", (await as("anon", "", `select count(*)::int c from guide_items`)).rows[0].c === 13);
ok("anon: 鍵とWi-Fiは読めない", (await as("anon", "", `select count(*)::int c from guide_items where requires_code`)).rows[0].c === 0);
ok("anon: 照合の記録は読めない", !!(await as("anon", "", `select * from code_attempts`)).error);
ok("admin でも照合の記録は読めない(画面からは触れない)", !!(await as("authenticated", ADMIN, `select * from code_attempts`)).error);
ok("admin: 伏せた項目も編集用に読める", (await as("authenticated", ADMIN, `select count(*)::int c from guide_items where requires_code`)).rows[0].c === 2);
await db.exec(`update properties set demo_stay_code = '' where slug='hiroshima-demo'`);
ok("デモ用コードを空にすると使えなくなる", (await verify("DEMO-2026", "3.3.3.3")).rows[0].r.status === "invalid");
console.log(fails === 0 ? "\n全部通りました" : `\n${fails} 件失敗`);
process.exit(fails ? 1 : 0);
