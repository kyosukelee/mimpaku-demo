-- 第4段階-2: エラーの記録(30日で自動削除)
-- stage4_1.sql の実行後に、SQL Editor で1回だけ実行する。
-- 残すのは「いつ・どの機能で・どんな失敗か」だけ。質問の文章・滞在コード・IPアドレス・鍵の値は残さない。

create table public.error_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('ask', 'stay-code')),
  kind text not null,                       -- ai_error / empty_response / timeout / unexpected_shape / upstream / not_configured / recovered / other
  model text not null default '',
  detail text not null default '',          -- エラーの短い説明(500文字まで)
  retried boolean not null default false    -- 自動でやり直したか
);
create index error_logs_created_idx on public.error_logs (created_at desc);

alter table public.error_logs enable row level security;
revoke all on public.error_logs from anon;
revoke insert, update, delete on public.error_logs from authenticated;

-- 読めるのは管理者だけ(閲覧専用・オーナー・スタッフには見せない)
create policy error_logs_admin_read on public.error_logs
  for select to authenticated using (public.is_admin());

-- 書き込みは、サーバー側の関数(secret key)からだけ
create function public.log_error(p_source text, p_kind text, p_model text, p_detail text, p_retried boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.error_logs where created_at < now() - interval '30 days';
  insert into public.error_logs (source, kind, model, detail, retried)
  values (
    case when p_source in ('ask', 'stay-code') then p_source else 'ask' end,
    case when p_kind in ('ai_error', 'empty_response', 'timeout', 'unexpected_shape', 'upstream', 'not_configured', 'recovered')
         then p_kind else 'other' end,
    left(coalesce(p_model, ''), 100),
    left(coalesce(p_detail, ''), 500),
    coalesce(p_retried, false)
  );
end;
$$;

revoke all on function public.log_error(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.log_error(text, text, text, text, boolean) to service_role;
