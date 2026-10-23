-- スタッフ・オーナー・閲覧専用のデモ用ユーザーの登録。
-- 先に Supabase の Authentication → Users → Add user で、3人分のユーザーを作っておく
-- (Auto Confirm User をオン。メールアドレスは example.com で終わる架空のものでよい)。
-- 下の3つのメールアドレスを、作ったものに書き換えてから実行する。何度実行しても問題ない。
insert into public.profiles (id, role, display_name)
select id, 'staff', '清掃スタッフ(デモ)' from auth.users where email = 'staff@example.com'
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

insert into public.profiles (id, role, display_name)
select id, 'owner', 'オーナー(デモ)' from auth.users where email = 'owner@example.com'
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

insert into public.profiles (id, role, display_name)
select id, 'viewer', '閲覧専用(デモ)' from auth.users where email = 'viewer@example.com'
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

-- デモ物件のオーナーと、清掃の担当スタッフを設定する
update public.properties
   set owner_id = (select id from public.profiles where role = 'owner' order by created_at limit 1),
       default_staff_id = (select id from public.profiles where role = 'staff' order by created_at limit 1)
 where slug = 'hiroshima-demo';
