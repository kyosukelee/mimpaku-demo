// 第5段階: 急ぎでない問い合わせ先・180日の上限・定期報告の集計のテスト
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
for (const e of ["admin@example.com", "staff@example.com", "owner@example.com", "viewer@example.com", "owner2@example.com"]) await db.query(`insert into auth.users (email) values ($1)`, [e]);
await db.exec(fs.readFileSync(root + "create-admin.sql", "utf8").replaceAll("your-email@example.com", "admin@example.com"));
await db.exec(fs.readFileSync(root + "create-users.sql", "utf8"));
await db.exec(fs.readFileSync(root + "seed_stage3.sql", "utf8"));
await db.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
for (const f of ["stage3_3.sql", "stage4.sql", "stage4_1.sql", "stage4_2.sql", "stage5.sql", "seed_stage5.sql", "seed_stage5.sql"]) await db.exec(fs.readFileSync(root + f, "utf8"));
const id = Object.fromEntries((await db.query(`select email, id from auth.users`)).rows.map((r) => [r.email, r.id]));
await db.exec(`insert into public.profiles (id, role, display_name) values ('${id["owner2@example.com"]}', 'owner', 'オーナー2');
  insert into public.properties (slug, name_ja, is_published, owner_id, checklist_template) values ('report-demo', '集計の確認用', true, '${id["owner2@example.com"]}', 'a');`);

const as = async (role, uid, sql, params) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.uid','${uid}', false);`);
  try { return await db.query(sql, params); } catch (e) { return { error: e.message, rows: [] }; } finally { await db.exec(`reset role;`); }
};
let fails = 0;
const ok = (name, cond, extra) => { console.log(cond ? "OK  " : "FAIL", name, cond ? "" : (extra ?? "")); if (!cond) fails++; };
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
const rid = (await q1(`select id from properties where slug = 'report-demo'`)).id;
const hid = (await q1(`select id from properties where slug = 'hiroshima-demo'`)).id;
const add = (pid, ci, co, guests, nat, label = "t") => as("authenticated", id["admin@example.com"],
  `insert into stays (property_id, checkin_date, checkout_date, label, guests, nationalities) values ($1, $2, $3, $4, $5, $6::jsonb) returning id`,
  [pid, ci, co, label, guests, JSON.stringify(nat)]);

// ── 1. 急ぎでない問い合わせ先 ──
const p = await q1(`select contact_ja, contact_en from properties where slug = 'hiroshima-demo'`);
ok("デモ物件に急ぎでない問い合わせ先が入る(日英)", p.contact_ja.includes("example.com") && p.contact_en.includes("We reply"));
const g = (await as("service_role", "", `select public.begin_ai_call('hiroshima-demo', '1.1.1.1') as r`)).rows[0].r;
ok("AIに渡す物件の情報に、問い合わせ先が含まれる", g.status === "ok" && g.property.contact_ja.includes("example.com"));

// ── 既存の予約と、過去の架空データ ──
ok("すでにある予約にチェックイン日が入る(1泊)", (await q1(`select count(*)::int c from stays where checkin_date = checkout_date - 1 and label like '予約%'`)).c === 3);
ok("過去の予約10件が入る(2回実行しても重複しない)", (await q1(`select count(*)::int c from stays where label = '過去の予約(架空)'`)).c === 10);
ok("過去の予約の清掃は済み", (await q1(`select count(*)::int c from cleaning_tasks t join stays s on s.id = t.stay_id where s.label = '過去の予約(架空)' and t.status <> 'done'`)).c === 0);

// ── 入力のチェック ──
ok("年度の始まり: 4/1→その年、3/31→前の年", (await q1(`select public.fiscal_year_start('2026-04-01') a, public.fiscal_year_start('2027-03-31') b, public.fiscal_year_start('2026-03-31') c`)).a.toISOString().startsWith("2026-04-01"));
ok("チェックインがチェックアウト以降は拒否", /より前/.test((await add(rid, "2026-06-10", "2026-06-10", 1, [{ country: "日本", count: 1 }])).error ?? ""));
ok("31泊以上は拒否", /30泊/.test((await add(rid, "2026-06-01", "2026-07-02", 1, [{ country: "日本", count: 1 }])).error ?? ""));
ok("国籍の内訳の合計が人数と違うと拒否", /合いません/.test((await add(rid, "2026-06-10", "2026-06-11", 3, [{ country: "日本", count: 2 }])).error ?? ""));
ok("国籍の内訳が空なら拒否", /入力してください/.test((await add(rid, "2026-06-10", "2026-06-11", 1, [])).error ?? ""));

// ── 定期報告の集計(手で計算した値と比べる) ──
ok("S1 5/30〜6/2 2人 日本2", !(await add(rid, "2026-05-30", "2026-06-02", 2, [{ country: "日本", count: 2 }])).error);
ok("S2 6/10〜6/13 3人 韓国2・台湾1", !(await add(rid, "2026-06-10", "2026-06-13", 3, [{ country: "韓国", count: 2 }, { country: "台湾", count: 1 }])).error);
ok("チェックアウト日に次のチェックインはできる(S3 6/13〜6/14 1人)", !(await add(rid, "2026-06-13", "2026-06-14", 1, [{ country: "アメリカ", count: 1 }])).error);
ok("日付が重なる予約は拒否", /別の予約/.test((await add(rid, "2026-06-12", "2026-06-15", 1, [{ country: "日本", count: 1 }])).error ?? ""));
const rep = (await as("authenticated", id["owner2@example.com"], `select public.stay_report($1, '2026-04-01') as r`, [rid])).rows[0].r;
const [aprMay, junJul] = rep.periods;
ok("報告期間は6つ、4-5月の期限は6/15、12-1月は2/15", rep.periods.length === 6 && aprMay.due === "2026-06-15" && rep.periods[4].due === "2027-02-15" && rep.periods[5].end === "2027-03-31", JSON.stringify(rep.periods.map((x) => x.due)));
ok("4-5月: 日数2・宿泊者2・延べ4・日本2", aprMay.nights === 2 && aprMay.guests === 2 && aprMay.guest_nights === 4 && JSON.stringify(aprMay.nationalities) === JSON.stringify({ 日本: 2 }), JSON.stringify(aprMay));
ok("6-7月: 日数5・宿泊者6(またいだS1も数える)・延べ12", junJul.nights === 5 && junJul.guests === 6 && junJul.guest_nights === 12, JSON.stringify(junJul));
ok("6-7月の国籍別: 日本2・韓国2・台湾1・アメリカ1", junJul.nationalities["日本"] === 2 && junJul.nationalities["韓国"] === 2 && junJul.nationalities["台湾"] === 1 && junJul.nationalities["アメリカ"] === 1);
ok("宿泊のない期間は0(8-9月)", rep.periods[2].nights === 0 && rep.periods[2].guests === 0 && JSON.stringify(rep.periods[2].nationalities) === "{}");
ok("年度の宿泊日数は7日", rep.fy_nights === 7);

// 年度をまたぐ予約: 3/30〜4/2 は 旧年度2日・新年度1日
await add(rid, "2027-03-30", "2027-04-02", 1, [{ country: "日本", count: 1 }]);
ok("年度をまたぐ予約は、それぞれの年度で数える", (await q1(`select public.fy_nights($1, '2026-04-01') a, public.fy_nights($1, '2027-04-01') b`, [rid])).a === 9 && (await q1(`select public.fy_nights($1, '2027-04-01') b`, [rid])).b === 1);

// ── 180日の上限 ──
// 2027年度: いま1日。30泊×5回で151日、さらに29泊で180日ちょうど、そのあと1泊で超える
const starts = ["2027-05-01", "2027-06-01", "2027-07-01", "2027-08-01", "2027-09-01"];
for (const s of starts) { const d = new Date(s); const e = new Date(d.getTime() + 30 * 86400000).toISOString().slice(0, 10); await add(rid, s, e, 1, [{ country: "日本", count: 1 }]); }
ok("2027年度は151日", (await q1(`select public.fy_nights($1, '2027-04-01') n`, [rid])).n === 151);
ok("180日ちょうどまでは登録できる", !(await add(rid, "2027-10-01", "2027-10-30", 1, [{ country: "日本", count: 1 }])).error && (await q1(`select public.fy_nights($1, '2027-04-01') n`, [rid])).n === 180);
ok("181日目になる予約は拒否(年度と日数を表示)", /180日を超えます\(2027年度: 181日\)/.test((await add(rid, "2027-11-10", "2027-11-11", 1, [{ country: "日本", count: 1 }])).error ?? ""), (await add(rid, "2027-11-10", "2027-11-11", 1, [{ country: "日本", count: 1 }])).error);
ok("別の年度なら登録できる", !(await add(rid, "2028-04-10", "2028-04-11", 1, [{ country: "日本", count: 1 }])).error);
ok("既存の予約を延ばして超える変更も拒否", /180日/.test((await as("authenticated", id["admin@example.com"], `update stays set checkout_date = '2027-10-31' where property_id = $1 and checkin_date = '2027-10-01'`, [rid])).error ?? ""));

// ── 権限 ──
const other = (await as("authenticated", id["owner@example.com"], `select public.stay_report($1, '2026-04-01') as r`, [rid])).rows[0].r;
ok("別のオーナーは、その物件の数字を見られない(0)", other.fy_nights === 0 && other.periods.every((x) => x.nights === 0));
const staffR = (await as("authenticated", id["staff@example.com"], `select public.stay_report($1, '2026-04-01') as r`, [hid])).rows[0].r;
ok("スタッフは集計できない(0)", staffR.fy_nights === 0);
ok("未ログインは集計の関数を呼べない", !!(await as("anon", "", `select public.stay_report($1, '2026-04-01')`, [hid])).error);
const viewR = (await as("authenticated", id["viewer@example.com"], `select public.stay_report($1, public.fiscal_year_start((now() at time zone 'Asia/Tokyo')::date)) as r`, [hid])).rows[0].r;
ok("閲覧専用はデモ物件の集計を見られる(過去の予約が入っている)", viewR.fy_nights > 0);
ok("閲覧専用は予約を追加できない", !!(await as("authenticated", id["viewer@example.com"], `insert into stays (property_id, checkin_date, checkout_date, guests, nationalities) values ($1, '2028-01-01', '2028-01-02', 1, '[{"country":"日本","count":1}]')`, [hid])).error);
console.log(fails === 0 ? "\n全部通りました" : `\n${fails} 件失敗`);
process.exit(fails ? 1 : 0);
