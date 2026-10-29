-- 第5段階: 実運用に向けた改善
--   1. 急ぎでない問い合わせ先
--   2. 180日の上限の管理(住宅宿泊事業法: 4月1日正午〜翌年4月1日正午に180日まで)
--   3. 定期報告の集計(2か月ごとの「宿泊させた日数・宿泊者数・延べ宿泊者数・国籍別の内訳」)
-- stage4_2.sql の実行後に、SQL Editor で1回だけ実行する。

-- ── 1. 急ぎでない問い合わせ先 ────────────────────────────────
alter table public.properties
  add column contact_ja text not null default '',
  add column contact_en text not null default '';

update public.properties
   set contact_ja = 'メール: stay-naka-demo@example.com(架空)' || E'\n' || '返信は 9:00〜21:00 です。',
       contact_en = 'Email: stay-naka-demo@example.com (fictional)' || E'\n' || 'We reply between 9:00 and 21:00.'
 where slug = 'hiroshima-demo' and contact_ja = '';

-- ── 2・3. 予約にチェックイン日・人数・国籍の内訳を追加 ───────────────
alter table public.stays
  add column checkin_date date,
  add column guests integer not null default 1 check (guests between 1 and 50),
  add column nationalities jsonb not null default '[]'::jsonb;   -- [{"country": "日本", "count": 2}, ...]

-- すでにある予約は、1泊・1人(国籍は日本)として埋める
update public.stays set checkin_date = checkout_date - 1 where checkin_date is null;
update public.stays set nationalities = jsonb_build_array(jsonb_build_object('country', '日本', 'count', guests))
 where nationalities = '[]'::jsonb;
alter table public.stays alter column checkin_date set not null;
alter table public.stays add constraint stays_dates_check check (checkin_date < checkout_date);

-- 年度の始まり(4月1日)
create function public.fiscal_year_start(d date) returns date
language sql immutable as $$
  select make_date(case when extract(month from d) >= 4 then extract(year from d)::int else extract(year from d)::int - 1 end, 4, 1);
$$;

-- 物件の、ある年度に人を宿泊させた日数(重なりは1日として数える)
create function public.fy_nights(p_property uuid, p_fy_start date) returns integer
language sql stable as $$
  select count(distinct n)::int
    from public.stays s, generate_series(s.checkin_date, s.checkout_date - 1, interval '1 day') as g(n)
   where s.property_id = p_property
     and n::date >= p_fy_start and n::date < (p_fy_start + interval '1 year')::date;
$$;

-- 予約の入力チェック: 日付の重なり・180日の上限・国籍の内訳
create function public.check_stay() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fy date;
  total integer;
  sum_count integer;
  item jsonb;
begin
  if new.checkin_date is null or new.checkin_date >= new.checkout_date then
    raise exception 'チェックイン日は、チェックアウト日より前にしてください';
  end if;
  if new.checkout_date - new.checkin_date > 30 then
    raise exception '1回の予約は30泊までにしてください';
  end if;

  -- 同じ物件で日付が重なる予約は受け付けない(チェックアウト日に次のチェックインは可)
  if exists (
    select 1 from public.stays s
     where s.property_id = new.property_id and s.id <> new.id
       and daterange(s.checkin_date, s.checkout_date) && daterange(new.checkin_date, new.checkout_date)
  ) then
    raise exception '同じ期間に、別の予約があります';
  end if;

  -- 国籍の内訳: 合計が宿泊者数と合うこと
  if jsonb_typeof(new.nationalities) <> 'array' or jsonb_array_length(new.nationalities) = 0 then
    raise exception '国籍の内訳を入力してください';
  end if;
  sum_count := 0;
  for item in select * from jsonb_array_elements(new.nationalities) loop
    if coalesce(btrim(item ->> 'country'), '') = '' or coalesce((item ->> 'count')::int, 0) < 1 then
      raise exception '国籍の内訳に、空の国籍か0人の行があります';
    end if;
    sum_count := sum_count + (item ->> 'count')::int;
  end loop;
  if sum_count <> new.guests then
    raise exception '国籍の内訳の合計(%人)が、宿泊者数(%人)と合いません', sum_count, new.guests;
  end if;

  -- 180日の上限: この予約がかかる年度ごとに、ほかの予約と合わせた日数を数える
  for fy in
    select distinct public.fiscal_year_start(n::date)
      from generate_series(new.checkin_date, new.checkout_date - 1, interval '1 day') as g(n)
  loop
    select count(distinct n)::int into total from (
      select n::date as n
        from public.stays s, generate_series(s.checkin_date, s.checkout_date - 1, interval '1 day') as g(n)
       where s.property_id = new.property_id and s.id <> new.id
      union
      select n::date from generate_series(new.checkin_date, new.checkout_date - 1, interval '1 day') as g(n)
    ) x
    where x.n >= fy and x.n < (fy + interval '1 year')::date;
    if total > 180 then
      raise exception '年間の宿泊日数が180日を超えます(%年度: %日)', extract(year from fy), total;
    end if;
  end loop;
  return new;
end;
$$;

create trigger stays_check before insert or update on public.stays
  for each row execute function public.check_stay();

-- 予約の日付の変更で、清掃の期限が動くようにする(チェックイン日だけの変更では動かない)
-- (stays_sync_task は checkout_date の変更を見ているので、そのままでよい)

-- ── 3. 定期報告の集計 ─────────────────────────────────────
-- 年度の6つの報告期間(4-5月、6-7月、8-9月、10-11月、12-1月、2-3月)ごとに4項目を集計する。
-- 呼んだ人の権限(RLS)で読める予約だけを数える(管理者・閲覧専用・その物件のオーナー)。
--   宿泊させた日数 : 期間の中の夜の日付(正午〜翌正午で1日)の数。重なりは1日
--   宿泊者数       : 期間の中に1泊でもある予約の人数の合計(期間をまたぐ予約は両方の期間で数える)
--   延べ宿泊者数   : 期間の中の1泊ごとに、その予約の人数を足したもの
--   国籍別         : 宿泊者数と同じ数え方で、国籍ごとに足したもの
create function public.stay_report(p_property uuid, p_fy_start date) returns jsonb
language sql stable as $$
  with periods as (
    select (p_fy_start + (i * interval '2 months'))::date as p_start,
           (p_fy_start + ((i + 1) * interval '2 months'))::date as p_end
      from generate_series(0, 5) as i
  ),
  nights as (
    select s.id as stay_id, s.guests, s.nationalities, g.n::date as night
      from public.stays s, generate_series(s.checkin_date, s.checkout_date - 1, interval '1 day') as g(n)
     where s.property_id = p_property
  ),
  per_period as (
    select p.p_start, p.p_end,
           count(distinct n.night)::int as nights,
           coalesce(sum(n.guests), 0)::int as guest_nights
      from periods p left join nights n on n.night >= p.p_start and n.night < p.p_end
     group by p.p_start, p.p_end
  ),
  stays_in_period as (
    select distinct p.p_start, n.stay_id, n.guests, n.nationalities
      from periods p join nights n on n.night >= p.p_start and n.night < p.p_end
  ),
  guests_pp as (
    select p_start, sum(guests)::int as guests from stays_in_period group by p_start
  ),
  nat_pp as (
    select p_start, jsonb_object_agg(country, cnt order by country) as nationalities
      from (
        select sp.p_start, e ->> 'country' as country, sum((e ->> 'count')::int)::int as cnt
          from stays_in_period sp, jsonb_array_elements(sp.nationalities) e
         group by sp.p_start, e ->> 'country'
      ) t
     group by p_start
  )
  select jsonb_build_object(
    'fy_start', p_fy_start,
    'fy_nights', public.fy_nights(p_property, p_fy_start),
    'periods', jsonb_agg(jsonb_build_object(
        'start', pp.p_start,
        'end', (pp.p_end - 1),
        'due', (make_date(extract(year from pp.p_end)::int, extract(month from pp.p_end)::int, 15)),
        'nights', pp.nights,
        'guests', coalesce(g.guests, 0),
        'guest_nights', pp.guest_nights,
        'nationalities', coalesce(np.nationalities, '{}'::jsonb)
      ) order by pp.p_start)
  )
  from per_period pp
  left join guests_pp g on g.p_start = pp.p_start
  left join nat_pp np on np.p_start = pp.p_start;
$$;

-- ── AIに渡す物件の情報に、急ぎでない問い合わせ先を加える ─────────────
create or replace function public.begin_ai_call(p_slug text, p_ip text)
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
      'emergency_note_ja', v_prop.emergency_note_ja, 'emergency_note_en', v_prop.emergency_note_en,
      'contact_ja', v_prop.contact_ja, 'contact_en', v_prop.contact_en),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('category', g.category, 'title_ja', g.title_ja, 'title_en', g.title_en,
                                          'body_ja', g.body_ja, 'body_en', g.body_en) order by g.sort_order)
        from public.guide_items g
       where g.property_id = v_prop.id and g.is_published and not g.requires_code
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.begin_ai_call(text, text) from public, anon, authenticated;
grant execute on function public.begin_ai_call(text, text) to service_role;
-- 集計の関数は、ログインした人だけが呼べる(読める範囲はRLSで決まる)
revoke all on function public.stay_report(uuid, date) from public, anon;
revoke all on function public.fy_nights(uuid, date) from public, anon;
grant execute on function public.stay_report(uuid, date) to authenticated;
grant execute on function public.fy_nights(uuid, date) to authenticated;
