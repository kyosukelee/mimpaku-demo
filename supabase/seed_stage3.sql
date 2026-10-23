-- 第3段階-1の架空データ(清掃のチェックリストのひな型と、予約3件)。
-- create-users.sql の実行後に、1回だけ実行する。日付は実行した日を基準にする。
update public.properties
   set checklist_template = E'ベッドのシーツと枕カバーを交換\nバス・トイレ・洗面台を掃除\nキッチンとシンクを掃除\n床の掃除機がけと拭き掃除\nゴミを回収して、ゴミ出しの準備\nタオルとアメニティを補充\n窓を閉めて、鍵をキーボックスに戻す\n忘れ物がないか確認'
 where slug = 'hiroshima-demo' and checklist_template = '';

-- 予約を入れると、清掃タスクが自動でできる(担当は物件の既定のスタッフ)
insert into public.stays (property_id, checkout_date, label, stay_code)
select p.id, (now() at time zone 'Asia/Tokyo')::date + v.d, v.label, v.code
  from public.properties p,
       (values (-1, '予約A(架空)', 'DEMO-A1B2'),
               (0,  '予約B(架空)', 'DEMO-C3D4'),
               (1,  '予約C(架空)', 'DEMO-E5F6')) as v(d, label, code)
 where p.slug = 'hiroshima-demo'
   and not exists (select 1 from public.stays s where s.property_id = p.id);

-- 昨日のチェックアウト分は、清掃済みにしておく
update public.cleaning_tasks t
   set status = 'done',
       completed_at = t.scheduled_at - interval '2 hours',
       checklist = coalesce((select jsonb_agg(jsonb_set(e, '{done}', 'true'::jsonb)) from jsonb_array_elements(t.checklist) e), '[]'::jsonb)
 where t.stay_id in (select id from public.stays where label = '予約A(架空)')
   and t.status <> 'done';
