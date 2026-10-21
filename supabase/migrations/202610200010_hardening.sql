-- PostgREST verifica a assinatura do JWT, mas não consulta sessões revogadas.
-- Vincular session_id ao mesmo usuário impede o uso direto de RPCs/RLS depois
-- do logout global. A existência da sessão é verificada em cada transação.
create function public._sessao_ativa()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sessao text := auth.jwt() ->> 'session_id';
begin
  if v_sessao is null or v_sessao !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from auth.sessions s
    where s.id = v_sessao::uuid
      and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  );
end;
$$;
revoke execute on function public._sessao_ativa() from public, anon, authenticated;

create or replace function public._ativo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public._sessao_ativa()
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo)
$$;
revoke execute on function public._ativo() from public, anon;
grant execute on function public._ativo() to authenticated;

-- Links de convite/recuperação são credenciais bearer, mesmo quando chamados de
-- hashed_token. A fila é lida pelo worker com service_role, nunca pela central.
-- Filtrar somente no React deixaria o segredo exposto pela API REST do banco.
drop policy notificacoes_leitura on public.notificacoes;
create policy notificacoes_leitura on public.notificacoes
for select to authenticated
using (
  public._ativo()
  and usuario_id = auth.uid()
  and tipo_evento not in ('convite', 'recuperacao', 'recuperacao_senha', 'seguranca_conta')
  and template not in ('convite', 'recuperacao', 'recuperacao_senha', 'seguranca_conta')
);

-- O retorno do RPC também não pode revelar a presença de eventos ocultos pela
-- contagem. IDs enviados pelo cliente só atingem notificações visíveis próprias.
create or replace function public.marcar_notificacoes_lidas(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := public._exigir_ativo();
  v_total integer;
begin
  update public.notificacoes
  set lida_em = now()
  where usuario_id = v_usuario
    and lida_em is null
    and (p_ids is null or id = any(p_ids))
    and tipo_evento not in ('convite', 'recuperacao', 'recuperacao_senha', 'seguranca_conta')
    and template not in ('convite', 'recuperacao', 'recuperacao_senha', 'seguranca_conta');
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;
revoke execute on function public.marcar_notificacoes_lidas(uuid[]) from public, anon;
grant execute on function public.marcar_notificacoes_lidas(uuid[]) to authenticated;
