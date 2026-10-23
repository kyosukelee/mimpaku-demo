-- 第3段階-3: 滞在コード
-- stage3_1.sql の実行後に、SQL Editor で1回だけ実行する。

-- ── 期限なしのデモ用コード(物件ごとに1つ。空なら使わない) ─────────
alter table public.properties
  add column demo_stay_code text not null default '';

-- ── 照合の記録(総当たりを防ぐため)。画面からは読めない ──────────
create table public.code_attempts (
  id bigint generated always as identity primary key,
  ip text not null default '',
  property_id uuid references public.properties (id) on delete cascade,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index code_attempts_ip_idx on public.code_attempts (ip, created_at);
alter table public.code_attempts enable row level security;   -- ポリシーなし = anon・ログイン済みとも読み書きできない
revoke all on public.code_attempts from anon, authenticated;

-- ── 滞在コードの照合 ──────────────────────────────────────
-- 正しければ、その物件の「滞在コードが必要な項目」を返す。
-- 呼べるのは secret key を持つサーバー側(Cloudflareの関数)だけ。
create function public.verify_stay_code(p_slug text, p_code text, p_ip text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prop public.properties;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_ip text := left(coalesce(p_ip, ''), 64);
  v_fails integer;
  v_ok boolean := false;
begin
  delete from public.code_attempts where created_at < now() - interval '1 day';

  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 同じ接続元で、15分以内に10回まちがえたら受け付けない
  select count(*) into v_fails from public.code_attempts
   where ip = v_ip and not ok and created_at > now() - interval '15 minutes';
  if v_fails >= 10 then
    return jsonb_build_object('status', 'locked');
  end if;

  if v_code <> '' and length(v_code) <= 40 then
    v_ok := (v_prop.demo_stay_code <> '' and upper(v_prop.demo_stay_code) = v_code)
         or exists (
              select 1 from public.stays s
               where s.property_id = v_prop.id
                 and upper(s.stay_code) = v_code
                 and s.checkout_date >= (now() at time zone 'Asia/Tokyo')::date   -- チェックアウト日まで有効
            );
  end if;

  insert into public.code_attempts (ip, property_id, ok) values (v_ip, v_prop.id, v_ok);
  if not v_ok then
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', g.id, 'category', g.category, 'display', g.display, 'sort_order', g.sort_order,
                                  'title_ja', g.title_ja, 'title_en', g.title_en, 'body_ja', g.body_ja, 'body_en', g.body_en,
                                  'map_query', g.map_query, 'requires_code', true, 'is_published', true)
               order by g.sort_order)
        from public.guide_items g
       where g.property_id = v_prop.id and g.requires_code and g.is_published
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.verify_stay_code(text, text, text) from public, anon, authenticated;
grant execute on function public.verify_stay_code(text, text, text) to service_role;

-- ── デモ物件の設定 ──────────────────────────────────────────
update public.properties set demo_stay_code = 'DEMO-2026'
 where slug = 'hiroshima-demo' and demo_stay_code = '';

-- 鍵とWi-Fiを「滞在コードが必要」にする(宿泊者ガイドから伏せる)
update public.guide_items set requires_code = true
 where property_id = (select id from public.properties where slug = 'hiroshima-demo')
   and category = 'checkin' and title_ja in ('鍵の受け取り', 'Wi-Fi');
