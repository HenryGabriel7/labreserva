-- Captura somente os dois campos de contexto necessários, nunca o conjunto de
-- headers (que contém Authorization, cookies e outras credenciais).
create or replace function public._auditar(
  p_acao text,
  p_entidade text,
  p_entidade_id uuid,
  p_antes jsonb default null,
  p_depois jsonb default null,
  p_ator_id uuid default auth.uid()
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_headers jsonb;
  v_ip inet;
  v_user_agent text;
begin
  begin
    v_headers := nullif(current_setting('request.headers',true),'')::jsonb;
    v_user_agent := left(v_headers->>'user-agent',512);
    v_ip := nullif(trim(split_part(coalesce(v_headers->>'x-forwarded-for',v_headers->>'x-real-ip',''),',',1)),'')::inet;
  exception when invalid_text_representation then
    v_ip := null;
  end;
  insert into public.audit_log(ator_id,acao,entidade,entidade_id,antes,depois,ip,user_agent)
  values(p_ator_id,p_acao,p_entidade,p_entidade_id,p_antes,p_depois,v_ip,v_user_agent);
end $$;
revoke execute on function public._auditar(text,text,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
