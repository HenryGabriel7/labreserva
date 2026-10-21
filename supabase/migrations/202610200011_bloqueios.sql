-- Edição usa o mesmo lock e as mesmas regras de cancelamento da criação.
-- A identidade e o laboratório do bloqueio permanecem estáveis na auditoria.
create function public.editar_bloqueio(
  p_id uuid,
  p_laboratorio_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_motivo text,
  p_descricao text,
  p_cancelar_reservas boolean default false,
  p_motivo_cancelamento text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes public.bloqueios;
  v_depois public.bloqueios;
  v_afetadas uuid[];
  v_reserva public.reservas;
  v_total integer := 0;
begin
  perform public._exigir_ativo();
  select * into v_antes from public.bloqueios where id=p_id;
  if not found or
    (v_antes.laboratorio_id is null and not public.tem_papel('admin')) or
    (v_antes.laboratorio_id is not null and not public.pode_gerir_lab(v_antes.laboratorio_id)) then
    raise exception using errcode='42501',message='ACESSO_NEGADO';
  end if;
  if p_laboratorio_id is distinct from v_antes.laboratorio_id then
    raise exception 'LABORATORIO_IMUTAVEL';
  end if;
  if p_inicio is null or p_fim is null or p_fim<=p_inicio or p_inicio<=now() then
    raise exception 'INTERVALO_INVALIDO';
  end if;
  if p_motivo is null or p_motivo not in ('feriado','manutencao','evento') or
    p_descricao is null or char_length(trim(p_descricao)) not between 3 and 2000 then
    raise exception 'ENTRADA_INVALIDA';
  end if;
  if v_antes.laboratorio_id is null then
    perform public._lock_todos_labs();
  else
    perform public._lock_lab(v_antes.laboratorio_id);
  end if;
  -- Lock do laboratório vem antes do lock da linha, como nas aprovações.
  select * into v_antes from public.bloqueios where id=p_id for update;
  if not found then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  select array_agg(r.id order by r.id) into v_afetadas
  from public.reservas r
  where (v_antes.laboratorio_id is null or r.laboratorio_id=v_antes.laboratorio_id)
    and r.status in ('aprovada','em_uso')
    and r.periodo && tstzrange(p_inicio,p_fim,'[)');
  if cardinality(v_afetadas)>0 and not coalesce(p_cancelar_reservas,false) then
    raise exception using message='BLOQUEIO_AFETA_RESERVAS',detail=to_jsonb(v_afetadas)::text;
  end if;
  if cardinality(v_afetadas)>0 and nullif(trim(p_motivo_cancelamento),'') is null then
    raise exception 'MOTIVO_OBRIGATORIO';
  end if;
  for v_reserva in select * from public.reservas where id=any(v_afetadas) order by id for update loop
    if v_reserva.status='em_uso' then raise exception 'LABORATORIO_EM_USO'; end if;
    perform public.cancelar_reserva(v_reserva.id,p_motivo_cancelamento);
    v_total := v_total+1;
  end loop;
  update public.bloqueios set inicio=p_inicio,fim=p_fim,motivo=p_motivo,descricao=trim(p_descricao)
  where id=p_id returning * into v_depois;
  perform public._auditar('editar_bloqueio','bloqueios',p_id,to_jsonb(v_antes),
    to_jsonb(v_depois)||jsonb_build_object('reservas_canceladas',coalesce(v_afetadas,'{}'::uuid[])));
  return jsonb_build_object('id',p_id,'canceladas',v_total);
end $$;
revoke execute on function public.editar_bloqueio(uuid,uuid,timestamptz,timestamptz,text,text,boolean,text) from public,anon;
grant execute on function public.editar_bloqueio(uuid,uuid,timestamptz,timestamptz,text,text,boolean,text) to authenticated;
