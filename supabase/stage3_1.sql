-- 第3段階-1: 予約・清掃タスク・写真・閲覧専用ロール
-- schema.sql の実行後に、SQL Editor で1回だけ実行する。

-- ── 権限の種類に viewer(閲覧専用)を追加 ─────────────────────
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'owner', 'staff', 'viewer'));

-- ── properties に清掃用の設定を追加 ─────────────────────────
alter table public.properties
  add column checklist_template text not null default '',          -- 1行に1項目
  add column default_staff_id uuid references public.profiles (id) on delete set null;

-- ── 予約(架空)と清掃タスク ─────────────────────────────────
create table public.stays (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  checkout_date date not null,
  label text not null default '',            -- 予約の呼び名(架空)
  stay_code text not null default '',        -- 第3段階-3で使う滞在コード(架空)
  created_at timestamptz not null default now()
);
create index stays_property_idx on public.stays (property_id, checkout_date);
create unique index stays_code_unique on public.stays (property_id, stay_code) where stay_code <> '';

create table public.cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  stay_id uuid references public.stays (id) on delete cascade,
  scheduled_at timestamptz not null,         -- 完了の期限
  assigned_staff uuid references public.profiles (id) on delete set null,
  checklist jsonb not null default '[]'::jsonb,   -- [{"text": "...", "done": false}]
  photo_paths text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  completed_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cleaning_tasks_staff_idx on public.cleaning_tasks (assigned_staff, status);
create index cleaning_tasks_property_idx on public.cleaning_tasks (property_id, scheduled_at);

create trigger cleaning_tasks_updated before update on public.cleaning_tasks
  for each row execute function public.set_updated_at();

-- ── 権限の判定用の関数(RLSの再帰を避けるため security definer) ─
create function public.user_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.owns_property(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.properties where id = p and owner_id = auth.uid());
$$;

create function public.staff_has_task_at(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cleaning_tasks where property_id = p and assigned_staff = auth.uid());
$$;

-- 写真の置き場所は「<タスクID>/<ファイル名>」。タスクIDの部分から権限を判定する
create function public.can_view_task_photos(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select folder ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.cleaning_tasks c
    where c.id = folder::uuid and (c.assigned_staff = auth.uid() or public.owns_property(c.property_id))
  );
$$;

create function public.can_edit_task_photos(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select folder ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.cleaning_tasks c
    where c.id = folder::uuid and c.assigned_staff = auth.uid() and c.status <> 'done'
  );
$$;

-- ── 予約を登録すると、清掃タスクを自動で作る ─────────────────
create function public.task_deadline(d date, check_in text) returns timestamptz
language sql immutable as $$
  select ((d + case when check_in ~ '^\d{1,2}:\d{2}$' then check_in::time else time '15:00' end)
          at time zone 'Asia/Tokyo');
$$;

create function public.create_cleaning_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.properties;
  items jsonb;
begin
  select * into p from public.properties where id = new.property_id;
  select coalesce(jsonb_agg(jsonb_build_object('text', btrim(l.line, E' \t\r'), 'done', false) order by l.ord), '[]'::jsonb)
    into items
    from unnest(string_to_array(p.checklist_template, E'\n')) with ordinality as l(line, ord)
    where btrim(l.line, E' \t\r') <> '';
  insert into public.cleaning_tasks (property_id, stay_id, scheduled_at, assigned_staff, checklist)
  values (new.property_id, new.id, public.task_deadline(new.checkout_date, p.check_in), p.default_staff_id, items);
  return new;
end;
$$;

create trigger stays_create_task after insert on public.stays
  for each row execute function public.create_cleaning_task();

create function public.sync_task_deadline() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.checkout_date is distinct from old.checkout_date then
    update public.cleaning_tasks t
       set scheduled_at = public.task_deadline(new.checkout_date, (select check_in from public.properties where id = new.property_id))
     where t.stay_id = new.id and t.status <> 'done';
  end if;
  return new;
end;
$$;

create trigger stays_sync_task after update on public.stays
  for each row execute function public.sync_task_deadline();

-- ── スタッフが変えてよいのは「チェックリストの完了印・写真・状態・メモ」だけ ──
create function public.guard_cleaning_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  path text;
begin
  -- SQL Editor(ログインなし)と管理者は制限しない。完了時刻だけ整える
  if auth.uid() is null or public.is_admin() then
    if new.status = 'done' and new.completed_at is null then new.completed_at := now(); end if;
    if new.status <> 'done' then new.completed_at := null; end if;
    return new;
  end if;

  if new.property_id is distinct from old.property_id
     or new.stay_id is distinct from old.stay_id
     or new.scheduled_at is distinct from old.scheduled_at
     or new.assigned_staff is distinct from old.assigned_staff
     or new.created_at is distinct from old.created_at then
    raise exception 'この項目は変更できません';
  end if;
  if old.status = 'done' then
    raise exception '完了したタスクは変更できません';
  end if;
  if jsonb_array_length(new.checklist) <> jsonb_array_length(old.checklist)
     or (select jsonb_agg(e -> 'text') from jsonb_array_elements(new.checklist) e)
        is distinct from (select jsonb_agg(e -> 'text') from jsonb_array_elements(old.checklist) e) then
    raise exception 'チェックリストの内容は変更できません';
  end if;
  foreach path in array new.photo_paths loop
    if not (path = any (old.photo_paths)) and path not like old.id::text || '/%' then
      raise exception '写真の保存先が正しくありません';
    end if;
  end loop;

  if new.status = 'done' then
    if exists (select 1 from jsonb_array_elements(new.checklist) e where (e ->> 'done')::boolean is not true) then
      raise exception 'チェックリストがすべて完了していません';
    end if;
    if coalesce(array_length(new.photo_paths, 1), 0) < 1 then
      raise exception '写真が1枚もありません';
    end if;
    new.completed_at := now();
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger cleaning_tasks_guard before update on public.cleaning_tasks
  for each row execute function public.guard_cleaning_task();

-- ── スタッフの名簿(名前だけ。メールやLINE IDは含めない) ────────
create view public.staff_directory as
  select id, display_name from public.profiles where role = 'staff';
revoke all on public.staff_directory from anon;
grant select on public.staff_directory to authenticated;

-- ── RLS ────────────────────────────────────────────────────
alter table public.stays enable row level security;
alter table public.cleaning_tasks enable row level security;

create policy stays_admin_all on public.stays
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy stays_viewer_read on public.stays
  for select to authenticated using (public.user_role() = 'viewer');
create policy stays_owner_read on public.stays
  for select to authenticated using (public.owns_property(property_id));

create policy tasks_admin_all on public.cleaning_tasks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tasks_viewer_read on public.cleaning_tasks
  for select to authenticated using (public.user_role() = 'viewer');
create policy tasks_owner_read on public.cleaning_tasks
  for select to authenticated using (public.owns_property(property_id));
create policy tasks_staff_read on public.cleaning_tasks
  for select to authenticated using (assigned_staff = auth.uid());
create policy tasks_staff_update on public.cleaning_tasks
  for update to authenticated
  using (assigned_staff = auth.uid() and status <> 'done')
  with check (assigned_staff = auth.uid());

-- 閲覧専用は、非公開の物件・案内項目も読める。スタッフは担当の物件を読める
create policy properties_viewer_read on public.properties
  for select to authenticated using (public.user_role() = 'viewer');
create policy properties_staff_read on public.properties
  for select to authenticated using (public.staff_has_task_at(id));
create policy guide_items_viewer_read on public.guide_items
  for select to authenticated using (public.user_role() = 'viewer');

-- ── 写真の保存先(非公開) ───────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cleaning-photos', 'cleaning-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy cleaning_photos_read on storage.objects
  for select to authenticated using (
    bucket_id = 'cleaning-photos'
    and (public.is_admin() or public.user_role() = 'viewer'
         or public.can_view_task_photos((storage.foldername(name))[1]))
  );
create policy cleaning_photos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'cleaning-photos'
    and (public.is_admin() or public.can_edit_task_photos((storage.foldername(name))[1]))
  );
create policy cleaning_photos_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'cleaning-photos'
    and (public.is_admin() or public.can_edit_task_photos((storage.foldername(name))[1]))
  );
