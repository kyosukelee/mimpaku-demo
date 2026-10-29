-- 第5段階の架空データ: 過去の予約(年度の集計・定期報告が分かるように)。
-- stage5.sql の実行後に、1回だけ実行する。日付は実行した日を基準にする。

-- すでにある予約(予約A・B・C)の人数と国籍を、それらしく整える
update public.stays set guests = 2, nationalities = '[{"country": "日本", "count": 2}]'::jsonb where label = '予約A(架空)';
update public.stays set guests = 2, nationalities = '[{"country": "韓国", "count": 2}]'::jsonb where label = '予約B(架空)';
update public.stays set guests = 3, nationalities = '[{"country": "アメリカ", "count": 2}, {"country": "日本", "count": 1}]'::jsonb where label = '予約C(架空)';

-- 過去の予約(チェックアウトが今日からk日前、n泊、g人)
insert into public.stays (property_id, checkin_date, checkout_date, label, stay_code, guests, nationalities)
select p.id,
       (now() at time zone 'Asia/Tokyo')::date - v.k - v.n,
       (now() at time zone 'Asia/Tokyo')::date - v.k,
       '過去の予約(架空)', '', v.g, v.nat::jsonb
  from public.properties p,
       (values (12, 2, 2, '[{"country": "韓国", "count": 2}]'),
               (20, 3, 4, '[{"country": "日本", "count": 2}, {"country": "台湾", "count": 2}]'),
               (33, 2, 1, '[{"country": "アメリカ", "count": 1}]'),
               (45, 4, 3, '[{"country": "日本", "count": 3}]'),
               (60, 2, 2, '[{"country": "中国", "count": 2}]'),
               (78, 3, 2, '[{"country": "オーストラリア", "count": 2}]'),
               (95, 2, 4, '[{"country": "日本", "count": 2}, {"country": "韓国", "count": 2}]'),
               (120, 5, 2, '[{"country": "フランス", "count": 2}]'),
               (150, 3, 3, '[{"country": "日本", "count": 3}]'),
               (175, 2, 2, '[{"country": "香港", "count": 2}]')) as v(k, n, g, nat)
 where p.slug = 'hiroshima-demo'
   and not exists (select 1 from public.stays s where s.property_id = p.id and s.label = '過去の予約(架空)');

-- 過去の予約の清掃は、済んでいることにする
update public.cleaning_tasks t
   set status = 'done',
       completed_at = t.scheduled_at - interval '2 hours',
       checklist = coalesce((select jsonb_agg(jsonb_set(e, '{done}', 'true'::jsonb)) from jsonb_array_elements(t.checklist) e), '[]'::jsonb)
 where t.stay_id in (select id from public.stays where label = '過去の予約(架空)')
   and t.status <> 'done';
