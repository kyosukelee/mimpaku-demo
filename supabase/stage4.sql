-- 第4段階: AI問い合わせ(上限・記録・権限)
-- stage3_3.sql の実行後に、SQL Editor で1回だけ実行する。
--
-- 上限(2026-10-25に決定):
--   ・1日の呼び出し回数(全体、日本時間の日付で数える) … 50回
--   ・1つの接続元からの質問 … 1時間に10回
--   ・Claude Console の月の上限額 … 5ドル(これはConsoleの画面で設定する)
-- 回数を変えるときは、下の begin_ai_call の v_daily_limit と v_ip_hourly_limit を書き換えて、関数を作り直す。

-- ── 問い合わせの記録(90日で自動削除) ─────────────────────────
create table public.chat_logs (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  lang text not null default 'ja',          -- 画面の言語(ja / en)
  kind text not null default 'ai' check (kind in ('ai', 'emergency')),
  question text not null,
  answer text not null,
  answered boolean not null default true    -- ガイドの内容で答えられたか
);
create index chat_logs_property_idx on public.chat_logs (property_id, created_at desc);

-- ── 1日の呼び出し回数(全体) ───────────────────────────────
create table public.usage_limits (
  day date primary key,                     -- 日本時間の日付
  calls integer not null default 0
);

-- ── 接続元ごとの呼び出し(1時間あたりの上限用。1日で消す) ─────────
create table public.ai_attempts (
  id bigint generated always as identity primary key,
  ip text not null default '',
  created_at timestamptz not null default now()
);
create index ai_attempts_ip_idx on public.ai_attempts (ip, created_at);

-- ── RLS ────────────────────────────────────────────────────
alter table public.chat_logs enable row level security;
alter table public.usage_limits enable row level security;
alter table public.ai_attempts enable row level security;
revoke all on public.chat_logs, public.usage_limits, public.ai_attempts from anon;
revoke insert, update, delete on public.chat_logs, public.usage_limits from authenticated;
revoke all on public.ai_attempts from authenticated;

-- 記録: 管理者・閲覧専用はすべて、オーナーは自分の物件だけ読める(書き込みは関数だけ)
create policy chat_logs_admin_read on public.chat_logs
  for select to authenticated using (public.is_admin() or public.user_role() = 'viewer');
create policy chat_logs_owner_read on public.chat_logs
  for select to authenticated using (public.owns_property(property_id));
-- 1日の回数: 管理者・閲覧専用が、画面で使用状況を見るため
create policy usage_limits_read on public.usage_limits
  for select to authenticated using (public.is_admin() or public.user_role() = 'viewer');

-- ── AIを呼ぶ前の確認(上限の確認と回数の加算、AIに渡す公開情報の取り出し) ──
-- 呼べるのは secret key を持つサーバー側(Cloudflareの関数)だけ。
create function public.begin_ai_call(p_slug text, p_ip text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_daily_limit constant integer := 50;   -- 1日の上限(全体)
  v_ip_hourly_limit constant integer := 10; -- 1つの接続元の、1時間の上限
  v_prop public.properties;
  v_ip text := left(coalesce(p_ip, ''), 64);
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_recent integer;
  v_calls integer;
begin
  -- 古い記録の片付け(問い合わせの記録は90日、接続元の記録は1日)
  delete from public.chat_logs where created_at < now() - interval '90 days';
  delete from public.ai_attempts where created_at < now() - interval '1 day';

  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select count(*) into v_recent from public.ai_attempts
   where ip = v_ip and created_at > now() - interval '1 hour';
  if v_recent >= v_ip_hourly_limit then
    return jsonb_build_object('status', 'limited_ip');
  end if;

  -- 1日の回数を、上限を超えないときだけ1つ増やす(同時アクセスでも超えない)
  insert into public.usage_limits as u (day, calls) values (v_today, 1)
  on conflict (day) do update set calls = u.calls + 1 where u.calls < v_daily_limit
  returning u.calls into v_calls;
  if v_calls is null then
    return jsonb_build_object('status', 'limited_day');
  end if;

  insert into public.ai_attempts (ip) values (v_ip);

  return jsonb_build_object(
    'status', 'ok',
    'property', jsonb_build_object(
      'name_ja', v_prop.name_ja, 'name_en', v_prop.name_en,
      'area_ja', v_prop.area_ja, 'area_en', v_prop.area_en,
      'check_in', v_prop.check_in, 'check_out', v_prop.check_out,
      'emergency_phone', v_prop.emergency_phone,
      'emergency_note_ja', v_prop.emergency_note_ja, 'emergency_note_en', v_prop.emergency_note_en),
    -- AIに渡すのは、公開中で滞在コード不要の項目だけ(鍵・Wi-Fiは渡さない)
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('category', g.category, 'title_ja', g.title_ja, 'title_en', g.title_en,
                                          'body_ja', g.body_ja, 'body_en', g.body_en) order by g.sort_order)
        from public.guide_items g
       where g.property_id = v_prop.id and g.is_published and not g.requires_code
    ), '[]'::jsonb)
  );
end;
$$;

-- ── 問い合わせの記録 ─────────────────────────────────────
create function public.log_chat(p_slug text, p_lang text, p_kind text, p_question text, p_answer text, p_answered boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.chat_logs (property_id, lang, kind, question, answer, answered)
  select p.id,
         case when p_lang in ('ja', 'en') then p_lang else 'ja' end,
         case when p_kind in ('ai', 'emergency') then p_kind else 'ai' end,
         left(coalesce(p_question, ''), 300),
         left(coalesce(p_answer, ''), 4000),
         coalesce(p_answered, true)
    from public.properties p where p.slug = p_slug;
end;
$$;

revoke all on function public.begin_ai_call(text, text) from public, anon, authenticated;
revoke all on function public.log_chat(text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.begin_ai_call(text, text) to service_role;
grant execute on function public.log_chat(text, text, text, text, text, boolean) to service_role;
