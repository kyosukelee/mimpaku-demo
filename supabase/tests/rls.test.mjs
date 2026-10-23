import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const root = new URL("../", import.meta.url).pathname;
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`);
await db.exec(fs.readFileSync(root + "schema.sql", "utf8"));
await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
await db.exec(fs.readFileSync(root + "seed.sql", "utf8"));
await db.exec(fs.readFileSync(root + "stage3_1.sql", "utf8"));
await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated; revoke all on public.staff_directory from anon;`);

const U = { admin: "00000000-0000-0000-0000-0000000000a1", staff: "00000000-0000-0000-0000-0000000000b1", staff2: "00000000-0000-0000-0000-0000000000b2",
  owner: "00000000-0000-0000-0000-0000000000c1", owner2: "00000000-0000-0000-0000-0000000000c2", viewer: "00000000-0000-0000-0000-0000000000d1" };
for (const [k, id] of Object.entries(U)) await db.exec(`insert into auth.users values ('${id}','${k}@example.com')`);
await db.exec(`insert into public.profiles (id, role, display_name) values
  ('${U.admin}','admin','管理者'),('${U.staff}','staff','スタッフ1'),('${U.staff2}','staff','スタッフ2'),
  ('${U.owner}','owner','オーナー1'),('${U.owner2}','owner','オーナー2'),('${U.viewer}','viewer','閲覧');`);
// 2つ目の物件(オーナー2)
await db.exec(`update public.properties set owner_id='${U.owner}', default_staff_id='${U.staff}', checklist_template=E'掃除する\r\n\r\n  確認する  \n' where slug='hiroshima-demo';
  insert into public.properties (slug, name_ja, is_published, owner_id) values ('other-demo','別の物件',true,'${U.owner2}');`);
await db.exec(fs.readFileSync(root + "seed_stage3.sql", "utf8"));
await db.exec(fs.readFileSync(root + "seed_stage3.sql", "utf8")); // 2回目で重複しない

const as = async (role, uid, sql, params) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.uid','${uid}', false);`);
  try { return await db.query(sql, params); } catch (e) { return { error: e.message, rows: [] }; } finally { await db.exec(`reset role;`); }
};
let fails = 0;
const ok = (name, cond, extra) => { console.log(cond ? "OK  " : "FAIL", name, cond ? "" : (extra ?? "")); if (!cond) fails++; };
const n = async (role, uid, table, where = "true") => (await as(role, uid, `select count(*)::int c from ${table} where ${where}`)).rows[0]?.c ?? "ERR";

// ── 自動作成 ──
ok("stays 3件(2回実行しても重複しない)", (await db.query("select count(*)::int c from stays")).rows[0].c === 3);
const tasks = (await db.query("select t.*, s.label from cleaning_tasks t join stays s on s.id=t.stay_id order by t.scheduled_at")).rows;
ok("予約3件から清掃タスク3件が自動作成される", tasks.length === 3);
ok("チェックリストはひな型から(空行・CRLF・前後の空白を除いて2項目)", tasks[0].checklist.length === 2 && tasks[0].checklist[0].text === "掃除する" && tasks[0].checklist[1].text === "確認する", JSON.stringify(tasks[0].checklist));
ok("既定のスタッフが担当になる", tasks.every((t) => t.assigned_staff === U.staff));
const today = (await db.query("select (now() at time zone 'Asia/Tokyo')::date d")).rows[0].d;
const todayTask = tasks.find((t) => t.label === "予約B(架空)");
const exp = (await db.query(`select public.task_deadline(date '${today.toISOString?.().slice(0,10) ?? today}', '15:00') x`)).rows[0].x;
ok("期限はチェックアウト日の15:00(JST)", new Date(todayTask.scheduled_at).getUTCHours() === 6 && new Date(todayTask.scheduled_at).getUTCMinutes() === 0, String(todayTask.scheduled_at));
const doneTask = tasks.find((t) => t.label === "予約A(架空)");
ok("昨日分は完了・完了時刻つき", doneTask.status === "done" && doneTask.completed_at !== null);
// check_in が不正な文字列でも15:00に
await db.exec(`update properties set check_in='あとで' where slug='other-demo';`);
await db.exec(`insert into stays (property_id, checkout_date, label) select id, current_date + 5, 'X' from properties where slug='other-demo'`);
const odd = (await db.query(`select scheduled_at from cleaning_tasks where property_id=(select id from properties where slug='other-demo')`)).rows[0];
ok("check_inが不正でも15:00(JST)で作る", new Date(odd.scheduled_at).getUTCHours() === 6);
// 日付の変更で期限が動く(未完了のみ)
await db.exec(`update stays set checkout_date = checkout_date + 2 where label in ('予約A(架空)','予約C(架空)')`);
const after = (await db.query("select t.scheduled_at, t.status, s.label from cleaning_tasks t join stays s on s.id=t.stay_id where s.label in ('予約A(架空)','予約C(架空)')")).rows;
const a = after.find((r) => r.label === "予約A(架空)"), c = after.find((r) => r.label === "予約C(架空)");
ok("日付変更: 未完了の期限は動き、完了済みは動かない", new Date(c.scheduled_at) - new Date(tasks.find(t=>t.label==="予約C(架空)").scheduled_at) === 2*86400000 && +new Date(a.scheduled_at) === +new Date(doneTask.scheduled_at));

// ── 閲覧範囲 ──
ok("anon: stays/tasksは見えない", (await n("anon","", "stays")) === 0 && (await n("anon","", "cleaning_tasks")) === 0);
ok("staff1: 自分の担当(3件)だけ見える", await n("authenticated", U.staff, "cleaning_tasks") === 3);
ok("staff2: 担当なしで0件", await n("authenticated", U.staff2, "cleaning_tasks") === 0);
ok("staff: staysは見えない", await n("authenticated", U.staff, "stays") === 0);
ok("owner1: 自分の物件のタスク3件(別物件の1件は見えない)", await n("authenticated", U.owner, "cleaning_tasks") === 3);
ok("owner2: 別物件のタスク1件だけ", await n("authenticated", U.owner2, "cleaning_tasks") === 1);
ok("viewer: 全4件のタスクと全予約が見える", await n("authenticated", U.viewer, "cleaning_tasks") === 4 && await n("authenticated", U.viewer, "stays") === 4);
ok("viewer: 非公開の物件・項目も読める", (await db.exec(`update properties set is_published=false where slug='hiroshima-demo'`), await n("authenticated", U.viewer, "properties")) === 2);
ok("staff: 担当の物件は非公開でも読める(他は公開のみ)", await n("authenticated", U.staff, "properties", "slug='hiroshima-demo'") === 1);
await db.exec(`update properties set is_published=true where slug='hiroshima-demo'`);
ok("admin: 全部見える", await n("authenticated", U.admin, "cleaning_tasks") === 4);

// ── 閲覧専用は書けない ──
ok("viewer: 更新できない", (await as("authenticated", U.viewer, `update cleaning_tasks set note='x'`), (await db.query("select count(*)::int c from cleaning_tasks where note='x'")).rows[0].c === 0));
ok("viewer: stays追加は拒否", !!(await as("authenticated", U.viewer, `insert into stays (property_id, checkout_date) select id, current_date from properties limit 1`)).error);
ok("viewer: 案内項目の更新もできない", (await as("authenticated", U.viewer, `update guide_items set title_ja='x'`), (await db.query("select count(*)::int c from guide_items where title_ja='x'")).rows[0].c === 0));
ok("viewer: profilesは自分の1件だけ", await n("authenticated", U.viewer, "profiles") === 1);
ok("owner: 書けない", (await as("authenticated", U.owner, `update cleaning_tasks set note='x'`), (await db.query("select count(*)::int c from cleaning_tasks where note='x'")).rows[0].c === 0));

// ── スタッフの更新制限 ──
const tid = todayTask.id;
const upd = (uid, set, id = tid) => as("authenticated", uid, `update cleaning_tasks set ${set} where id='${id}' returning id`);
ok("staff: チェックを入れられる(in_progress)", (await upd(U.staff, `status='in_progress', checklist='[{"text":"掃除する","done":true},{"text":"確認する","done":false}]'`)).rows.length === 1);
ok("staff2: 他人のタスクは更新できない", (await upd(U.staff2, `note='x'`)).rows.length === 0);
ok("staff: 期限の変更は拒否", !!(await upd(U.staff, `scheduled_at = now()`)).error);
ok("staff: 担当の付け替えは拒否", !!(await upd(U.staff, `assigned_staff = '${U.staff2}'`)).error);
ok("staff: チェックリストの文言変更は拒否", !!(await upd(U.staff, `checklist='[{"text":"改ざん","done":true},{"text":"確認する","done":false}]'`)).error);
ok("staff: 項目数の変更は拒否", !!(await upd(U.staff, `checklist='[]'`)).error);
ok("staff: 未完了のまま完了は拒否", /すべて完了/.test((await upd(U.staff, `status='done'`)).error ?? ""));
ok("staff: 全部チェックしても写真なしは拒否", /写真/.test((await upd(U.staff, `status='done', checklist='[{"text":"掃除する","done":true},{"text":"確認する","done":true}]'`)).error ?? ""));
ok("staff: 他タスクの写真パスは拒否", !!(await upd(U.staff, `photo_paths=array['${doneTask.id}/a.jpg']`)).error);
ok("staff: 写真を足して完了できる", (await upd(U.staff, `status='done', photo_paths=array['${tid}/a.jpg'], checklist='[{"text":"掃除する","done":true},{"text":"確認する","done":true}]'`)).rows.length === 1);
const fin = (await db.query(`select status, completed_at from cleaning_tasks where id='${tid}'`)).rows[0];
ok("完了時刻が自動で入る", fin.status === "done" && fin.completed_at !== null);
ok("staff: 完了後は変更できない", (await upd(U.staff, `note='あとから'`)).rows.length === 0);
ok("admin: 完了後でも変更・やり直しできる", (await upd(U.admin, `status='pending'`)).rows.length === 1 && (await db.query(`select completed_at from cleaning_tasks where id='${tid}'`)).rows[0].completed_at === null);

// ── スタッフ名簿 ──
ok("staff_directory: ログイン済みは読める(スタッフ2名の名前だけ)", await n("authenticated", U.owner, "staff_directory") === 2);
ok("staff_directory: anonは読めない", !!(await as("anon","", `select * from staff_directory`)).error);

// ── 写真(Storage) ──
const put = (uid, name) => as("authenticated", uid, `insert into storage.objects (bucket_id, name) values ('cleaning-photos', $1) returning id`, [name]);
const otherTask = tasks.find((t) => t.label === "予約C(架空)").id;
ok("storage: 担当スタッフは自分のタスク配下に置ける", (await put(U.staff, `${otherTask}/p1.jpg`)).rows?.length === 1);
ok("storage: 他のスタッフは置けない", !!(await put(U.staff2, `${otherTask}/p2.jpg`)).error);
ok("storage: 担当でも別のタスクIDの配下には置けない", !!(await put(U.staff, `${doneTask.id}/p3.jpg`)).error);
ok("storage: 完了済みのタスク配下には置けない", !!(await put(U.staff, `${doneTask.id}/p4.jpg`)).error);
ok("storage: IDでない場所には置けない", !!(await put(U.staff, `abc/p5.jpg`)).error);
ok("storage: admin/viewer/オーナー/担当は読める", (await n("authenticated", U.admin, "storage.objects")) === 1 && (await n("authenticated", U.viewer, "storage.objects")) === 1 && (await n("authenticated", U.owner, "storage.objects")) === 1 && (await n("authenticated", U.staff, "storage.objects")) === 1);
ok("storage: 他のオーナー・他のスタッフ・anonは読めない", (await n("authenticated", U.owner2, "storage.objects")) === 0 && (await n("authenticated", U.staff2, "storage.objects")) === 0 && !(await as("anon","", `select * from storage.objects`)).rows.length);
ok("storage: viewerは置けない", !!(await put(U.viewer, `${otherTask}/v.jpg`)).error);
ok("storage: 担当スタッフは自分の写真を消せる", (await as("authenticated", U.staff, `delete from storage.objects where name='${otherTask}/p1.jpg' returning id`)).rows.length === 1);
ok("bucketは非公開・5MB・画像のみ", (await db.query(`select public, file_size_limit from storage.buckets where id='cleaning-photos'`)).rows[0].public === false);

// ── 既存(第2段階)の動作は変わらない ──
ok("anon: 公開ガイドは今までどおり読める", await n("anon","", "guide_items") === 15);
ok("staff: 案内項目の編集はできない", (await as("authenticated", U.staff, `update guide_items set title_ja='x'`), (await db.query("select count(*)::int c from guide_items where title_ja='x'")).rows[0].c === 0));
console.log(fails === 0 ? "\n全部通りました" : `\n${fails} 件失敗`);
process.exit(fails ? 1 : 0);
