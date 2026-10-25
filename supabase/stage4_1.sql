-- 第4段階-1: 問い合わせの記録に「答えたモデル」を残す(AIの提供元を切り替えて比べるため)
-- stage4.sql の実行後に、SQL Editor で1回だけ実行する。何度実行しても問題ない。

alter table public.chat_logs add column if not exists model text not null default '';

drop function if exists public.log_chat(text, text, text, text, text, boolean);

create or replace function public.log_chat(
  p_slug text, p_lang text, p_kind text, p_question text, p_answer text, p_answered boolean, p_model text default ''
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.chat_logs (property_id, lang, kind, question, answer, answered, model)
  select p.id,
         case when p_lang in ('ja', 'en') then p_lang else 'ja' end,
         case when p_kind in ('ai', 'emergency') then p_kind else 'ai' end,
         left(coalesce(p_question, ''), 300),
         left(coalesce(p_answer, ''), 4000),
         coalesce(p_answered, true),
         left(coalesce(p_model, ''), 100)
    from public.properties p where p.slug = p_slug;
end;
$$;

revoke all on function public.log_chat(text, text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.log_chat(text, text, text, text, text, boolean, text) to service_role;
