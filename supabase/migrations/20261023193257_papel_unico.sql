-- O formulário, o CSV e os RPCs administrativos compartilham a mesma regra.
-- Não modifica contas existentes nem o histórico de decisões.
create or replace function public._validar_papeis(p_papeis text[])
returns void
language plpgsql immutable security definer
set search_path = public, pg_temp
as $$
begin
  if p_papeis is null or cardinality(p_papeis) <> 1
     or exists (
       select 1 from unnest(p_papeis) p
       where p is null or p not in ('aluno','professor','funcionario','monitor','admin')
     ) then
    raise exception 'PAPEIS_INVALIDOS';
  end if;
end
$$;

revoke all on function public._validar_papeis(text[]) from public, anon, authenticated;
