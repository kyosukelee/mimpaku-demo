-- 管理者の登録。先に Supabase の Authentication → Users → Add user で、
-- メールアドレスとパスワードを設定した(Auto Confirm User をオン)ユーザーを作っておく。
-- 下の 'your-email@example.com' を、そのメールアドレスに書き換えてから実行する。
insert into public.profiles (id, role, display_name)
select id, 'admin', '管理者'
from auth.users
where email = 'your-email@example.com'
on conflict (id) do update set role = 'admin';
