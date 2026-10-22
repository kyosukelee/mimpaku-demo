-- 民泊デモアプリ 第2段階: テーブルとRLS
-- Supabaseの SQL Editor に貼り付けて実行する(最初の1回だけ)。

-- ── テーブル ─────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'owner', 'staff')),
  display_name text not null default '',
  line_destination_id text,            -- 第3段階のLINE通知で使う
  created_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,           -- URL用(/p/<slug>/)
  name_ja text not null,
  name_en text not null default '',
  tagline_ja text not null default '',
  tagline_en text not null default '',
  area_ja text not null default '',
  area_en text not null default '',
  check_in text not null default '15:00',
  check_out text not null default '10:00',
  emergency_phone text not null default '',
  emergency_note_ja text not null default '',
  emergency_note_en text not null default '',
  is_published boolean not null default false,
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guide_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  category text not null check (category in ('checkin', 'nearby', 'faq', 'urgent')),
  display text not null default 'text' check (display in ('text', 'steps', 'bullets', 'keyvalue')),
  sort_order integer not null default 0,
  title_ja text not null default '',
  title_en text not null default '',
  body_ja text not null default '',
  body_en text not null default '',
  map_query text,
  requires_code boolean not null default false,  -- 第3段階: 滞在コードが必要な項目
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index guide_items_property_idx on public.guide_items (property_id, sort_order);

-- ── 更新日時 ─────────────────────────────────────────────
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger properties_updated before update on public.properties
  for each row execute function public.set_updated_at();
create trigger guide_items_updated before update on public.guide_items
  for each row execute function public.set_updated_at();

-- ── 権限の判定(RLSの再帰を避けるため security definer) ─────
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── RLS(全テーブルで有効) ───────────────────────────────
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.guide_items enable row level security;

-- profiles: 自分の行は読める / adminはすべて読み書きできる
create policy profiles_read_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- properties: 公開中は誰でも読める / adminはすべて / ownerは自分の物件を読むだけ
create policy properties_read_published on public.properties
  for select to anon, authenticated using (is_published);
create policy properties_owner_read on public.properties
  for select to authenticated using (owner_id = auth.uid());
create policy properties_admin_all on public.properties
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- guide_items: 公開中の物件の、公開中かつ滞在コード不要の項目だけ誰でも読める / adminはすべて
create policy guide_items_read_public on public.guide_items
  for select to anon, authenticated using (
    is_published
    and not requires_code
    and exists (
      select 1 from public.properties p
      where p.id = guide_items.property_id and p.is_published
    )
  );
create policy guide_items_admin_all on public.guide_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
