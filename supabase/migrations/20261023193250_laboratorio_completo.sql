-- Um único commit para o espaço, seu funcionamento e seu inventário.
-- Itens com histórico são desativados; reservas nunca são apagadas ou canceladas.
create function public.salvar_laboratorio_completo(
  p_dados jsonb,
  p_janelas jsonb,
  p_equipamentos jsonb,
  p_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := coalesce(p_id,gen_random_uuid());
  v_antes public.laboratorios;
  v_depois public.laboratorios;
  v_item jsonb;
  v_janela public.janelas_horario;
  v_equipamento public.equipamentos;
  v_equipamento_id uuid;
  v_ids uuid[] := '{}';
  v_janelas_antes jsonb;
  v_equipamentos_antes jsonb;
  v_depois_auditoria jsonb;
  v_antes_auditoria jsonb;
  v_passo integer;
  v_menor integer;
  v_revalidar boolean := false;
begin
  perform public._exigir_admin();
  perform public._lock_lab(v_id);
  perform public._validar_chaves(p_dados,array['nome','tipo','capacidade','localizacao','descricao','regras_de_uso','ativo','modo_reserva','granularidade_minutos','duracao_minima_minutos','duracao_maxima_minutos']);
  if p_janelas is null or jsonb_typeof(p_janelas)<>'array' then raise exception 'ENTRADA_INVALIDA'; end if;
  if jsonb_array_length(p_janelas)=0 then raise exception 'FUNCIONAMENTO_OBRIGATORIO'; end if;
  if jsonb_array_length(p_janelas)>50 or p_equipamentos is null or jsonb_typeof(p_equipamentos)<>'array' or jsonb_array_length(p_equipamentos)>100 then raise exception 'ENTRADA_INVALIDA'; end if;
  select * into v_antes from public.laboratorios where id=v_id for update;
  if p_id is not null and not found then raise exception 'REGISTRO_NAO_ENCONTRADO'; end if;
  v_depois:=jsonb_populate_record(case when p_id is null then row(v_id,null,null,null,null,'','',true,'slot_fixo',15,30,240,now(),now())::public.laboratorios else v_antes end,p_dados);
  select coalesce(jsonb_agg(to_jsonb(j)-'id'-'laboratorio_id'-'created_at'-'updated_at' order by dia_semana,inicio,fim),'[]') into v_janelas_antes from public.janelas_horario j where laboratorio_id=v_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') into v_equipamentos_antes from public.equipamentos e where laboratorio_id=v_id;
  v_antes_auditoria:=case when p_id is null then null else jsonb_build_object('laboratorio',to_jsonb(v_antes),'janelas',v_janelas_antes,'equipamentos',v_equipamentos_antes) end;
  if p_id is not null then
    v_revalidar:=(v_antes.capacidade,v_antes.ativo,v_antes.modo_reserva,v_antes.granularidade_minutos,v_antes.duracao_minima_minutos,v_antes.duracao_maxima_minutos) is distinct from (v_depois.capacidade,v_depois.ativo,v_depois.modo_reserva,v_depois.granularidade_minutos,v_depois.duracao_minima_minutos,v_depois.duracao_maxima_minutos);
  end if;
  insert into public.laboratorios(id,nome,tipo,capacidade,localizacao,descricao,regras_de_uso,ativo,modo_reserva,granularidade_minutos,duracao_minima_minutos,duracao_maxima_minutos)
  values(v_id,v_depois.nome,v_depois.tipo,v_depois.capacidade,v_depois.localizacao,v_depois.descricao,v_depois.regras_de_uso,v_depois.ativo,v_depois.modo_reserva,v_depois.granularidade_minutos,v_depois.duracao_minima_minutos,v_depois.duracao_maxima_minutos)
  on conflict(id) do update set nome=excluded.nome,tipo=excluded.tipo,capacidade=excluded.capacidade,localizacao=excluded.localizacao,descricao=excluded.descricao,regras_de_uso=excluded.regras_de_uso,ativo=excluded.ativo,modo_reserva=excluded.modo_reserva,granularidade_minutos=excluded.granularidade_minutos,duracao_minima_minutos=excluded.duracao_minima_minutos,duracao_maxima_minutos=excluded.duracao_maxima_minutos;

  delete from public.janelas_horario where laboratorio_id=v_id;
  for v_item in select value from jsonb_array_elements(p_janelas) loop
    perform public._validar_chaves(v_item,array['dia_semana','inicio','fim','duracao_slot_minutos']);
    if not(v_item ?& array['dia_semana','inicio','fim','duracao_slot_minutos']) then raise exception 'ENTRADA_INVALIDA'; end if;
    v_janela:=jsonb_populate_record(null::public.janelas_horario,v_item);
    if extract(second from v_janela.inicio)<>0 or extract(second from v_janela.fim)<>0 then raise exception 'FUNCIONAMENTO_INCOMPATIVEL'; end if;
    v_passo:=case when v_depois.modo_reserva='slot_fixo' then v_janela.duracao_slot_minutos else v_depois.granularidade_minutos end;
    if v_passo is null or v_passo<1 or v_janela.fim<=v_janela.inicio then raise exception 'FUNCIONAMENTO_INCOMPATIVEL'; end if;
    v_menor:=ceil(v_depois.duracao_minima_minutos::numeric/v_passo)::integer*v_passo;
    if v_menor>v_depois.duracao_maxima_minutos or v_menor>extract(epoch from(v_janela.fim-v_janela.inicio))/60 then raise exception 'FUNCIONAMENTO_INCOMPATIVEL'; end if;
    if exists(select 1 from public.janelas_horario where laboratorio_id=v_id and dia_semana=v_janela.dia_semana and inicio<v_janela.fim and fim>v_janela.inicio) then raise exception 'JANELAS_SOBREPOSTAS'; end if;
    insert into public.janelas_horario(laboratorio_id,dia_semana,inicio,fim,duracao_slot_minutos) values(v_id,v_janela.dia_semana,v_janela.inicio,v_janela.fim,v_janela.duracao_slot_minutos);
  end loop;
  if v_janelas_antes is distinct from (select coalesce(jsonb_agg(to_jsonb(j)-'id'-'laboratorio_id'-'created_at'-'updated_at' order by dia_semana,inicio,fim),'[]') from public.janelas_horario j where laboratorio_id=v_id) then v_revalidar:=true; end if;

  for v_item in select value from jsonb_array_elements(p_equipamentos) loop
    perform public._validar_chaves(v_item,array['id','nome','patrimonio','quantidade','status','reservavel_individualmente']);
    if not(v_item ?& array['nome','patrimonio','quantidade','status','reservavel_individualmente']) then raise exception 'ENTRADA_INVALIDA'; end if;
    v_equipamento_id:=nullif(v_item->>'id','')::uuid;
    if v_equipamento_id is not null and not exists(select 1 from public.equipamentos where id=v_equipamento_id and laboratorio_id=v_id) then raise exception 'EQUIPAMENTO_OUTRO_LABORATORIO'; end if;
    v_equipamento_id:=coalesce(v_equipamento_id,gen_random_uuid());
    if v_equipamento_id=any(v_ids) then raise exception 'EQUIPAMENTO_DUPLICADO'; end if;
    v_ids:=array_append(v_ids,v_equipamento_id);
    v_equipamento:=jsonb_populate_record(null::public.equipamentos,v_item);
    if exists(select 1 from public.equipamentos e where e.id=v_equipamento_id and (e.quantidade,e.status,e.reservavel_individualmente) is distinct from (v_equipamento.quantidade,v_equipamento.status,v_equipamento.reservavel_individualmente)) then v_revalidar:=true; end if;
    insert into public.equipamentos(id,laboratorio_id,nome,patrimonio,quantidade,status,reservavel_individualmente)
    values(v_equipamento_id,v_id,v_equipamento.nome,nullif(trim(v_equipamento.patrimonio),''),v_equipamento.quantidade,v_equipamento.status,v_equipamento.reservavel_individualmente)
    on conflict(id) do update set nome=excluded.nome,patrimonio=excluded.patrimonio,quantidade=excluded.quantidade,status=excluded.status,reservavel_individualmente=excluded.reservavel_individualmente;
  end loop;
  -- Omitidos são preservados. A UI envia status=inativo para uma remoção explícita;
  -- uma lista antiga ou paginada nunca pode desativar itens que não carregou.
  if p_id is not null and v_revalidar then perform public._revalidar_futuras(v_id); end if;
  v_depois_auditoria:=jsonb_build_object('laboratorio',(select to_jsonb(l) from public.laboratorios l where id=v_id),'janelas',(select coalesce(jsonb_agg(to_jsonb(j) order by dia_semana,inicio),'[]') from public.janelas_horario j where laboratorio_id=v_id),'equipamentos',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.equipamentos e where laboratorio_id=v_id));
  perform public._auditar('salvar_laboratorio_completo','laboratorios',v_id,v_antes_auditoria,v_depois_auditoria);
  return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.salvar_laboratorio_completo(jsonb,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.salvar_laboratorio_completo(jsonb,jsonb,jsonb,uuid) to authenticated;
