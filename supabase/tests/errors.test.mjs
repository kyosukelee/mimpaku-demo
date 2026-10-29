// 第4段階-2: エラーの記録のテスト
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
for (const e of ["admin@example.com", "staff@example.com", "owner@example.com", "viewer@example.com"]) await db.query(`insert into auth.users (email) values ($1)`, [e]);
await db.exec(fs.readFileSync(root + "create-admin.sql", "utf8").replaceAll("your-email@example.com", "admin@example.com"));
await db.exec(fs.readFileSync(root + "create-users.sql", "utf8"));
await db.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
for (const f of ["stage3_3.sql", "stage4.sql", "stage4_1.sql", "stage4_2.sql"]) await db.exec(fs.readFileSync(root + f, "utf8"));
const id = Object.fromEntries((await db.query(`select email, id from auth.users`)).rows.map((r) => [r.email, r.id]));

const as = async (role, uid, sql, params) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.uid','${uid}', false);`);
  try { return await db.query(sql, params); } catch (e) { return { error: e.message, rows: [] }; } finally { await db.exec(`reset role;`); }
};
const logErr = (src, kind, detail = "", retried = false, role = "service_role") =>
  as(role, "", `select public.log_error($1, $2, '@cf/google/gemma-4-26b-a4b-it', $3, $4)`, [src, kind, detail, retried]);
let fails = 0;
const ok = (name, cond, extra) => { console.log(cond ? "OK  " : "FAIL", name, cond ? "" : (extra ?? "")); if (!cond) fails++; };
const cnt = async (role, uid) => (await as(role, uid, `select count(*)::int c from error_logs`)).rows?.[0]?.c ?? "ERR";

ok("anon は log_error を呼べない", !!(await logErr("ask", "ai_error", "", false, "anon")).error);
ok("ログイン済みも呼べない", !!(await as("authenticated", id["admin@example.com"], `select public.log_error('ask','ai_error','m','d',false)`)).error);
await logErr("ask", "ai_error", "HTTP 500", true);
await logErr("ask", "recovered", "1回目: timeout", true);
await logErr("stay-code", "upstream", "rpc verify_stay_code: HTTP 503");
await logErr("bogus", "weird-kind", "x".repeat(900));
const last = (await db.query(`select source, kind, length(detail) l from error_logs order by id desc limit 1`)).rows[0];
ok("不正な機能名は ask、不正な種類は other、説明は500文字まで", last.source === "ask" && last.kind === "other" && last.l === 500, JSON.stringify(last));
ok("admin は4件読める", await cnt("authenticated", id["admin@example.com"]) === 4);
ok("viewer は読めない(0件)", await cnt("authenticated", id["viewer@example.com"]) === 0);
ok("owner は読めない(0件)", await cnt("authenticated", id["owner@example.com"]) === 0);
ok("staff は読めない(0件)", await cnt("authenticated", id["staff@example.com"]) === 0);
ok("anon は読めない", !!(await as("anon", "", `select * from error_logs`)).error);
ok("admin でも書き換え・削除はできない", !!(await as("authenticated", id["admin@example.com"], `update error_logs set detail='x'`)).error && !!(await as("authenticated", id["admin@example.com"], `delete from error_logs`)).error);
await db.exec(`update error_logs set created_at = now() - interval '31 days' where kind = 'ai_error'`);
await logErr("ask", "timeout");
ok("30日を過ぎた記録は、次の記録のときに消える", (await db.query(`select count(*)::int c from error_logs where kind = 'ai_error'`)).rows[0].c === 0 && (await db.query(`select count(*)::int c from error_logs`)).rows[0].c === 4);
console.log(fails === 0 ? "\n全部通りました" : `\n${fails} 件失敗`);
process.exit(fails ? 1 : 0);
