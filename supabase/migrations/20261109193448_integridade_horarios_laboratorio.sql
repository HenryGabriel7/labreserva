-- A leitura do editor é um snapshot de um laboratório, sem a paginação do catálogo.
create function public.obter_laboratorio_edicao(p_id uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_snapshot jsonb;
begin
  if public.tem_papel('admin') is not true then
    raise exception using errcode = '42501', message = 'ACESSO_NEGADO';
  end if;

  select jsonb_build_object(
    'laboratorio', to_jsonb(l),
    'janelas', coalesce((
      select jsonb_agg(to_jsonb(j) order by j.dia_semana, j.inicio, j.fim, j.id)
      from public.janelas_horario j
      where j.laboratorio_id = l.id
    ), '[]'::jsonb),
    'equipamentos', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.id)
      from public.equipamentos e
      where e.laboratorio_id = l.id
    ), '[]'::jsonb)
  )
  into v_snapshot
  from public.laboratorios l
  where l.id = p_id;

  if not found then
    raise exception 'REGISTRO_NAO_ENCONTRADO';
  end if;

  return v_snapshot || jsonb_build_object(
    'revisao', encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex'),
    'total_janelas', jsonb_array_length(v_snapshot->'janelas'),
    'total_equipamentos', jsonb_array_length(v_snapshot->'equipamentos')
  );
end;
$$;

create schema labreserva_private;
revoke all on schema labreserva_private from public, anon, authenticated, service_role;

-- Somente as duas RPCs administrativas podem chamar este gravador.
create function labreserva_private.gravar_laboratorio_completo(
  p_id uuid,
  p_revisao text,
  p_dados jsonb,
  p_janelas jsonb,
  p_equipamentos jsonb
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_antes public.laboratorios;
  v_depois public.laboratorios;
  v_snapshot jsonb;
  v_item jsonb;
  v_nova boolean;
  v_janela public.janelas_horario;
  v_janelas_gravar public.janelas_horario[] := '{}';
  v_manter uuid[];
  v_alterar uuid[];
  v_remover uuid[];
  v_ids_enviados uuid[];
  v_ids_atuais uuid[] := '{}';
  v_total_janelas integer;
  v_equipamento public.equipamentos;
  v_equipamento_id uuid;
  v_ids_equipamentos uuid[] := '{}';
  v_mudou_janelas boolean;
  v_mudou_regras boolean;
  v_revalidar boolean;
begin
  perform public._lock_lab(v_id);
  if p_id is not null then
    if p_revisao is null or p_revisao = '' then
      raise exception 'REVISAO_OBRIGATORIA';
    end if;
    select l.* into v_antes
    from public.laboratorios l
    where l.id = v_id
    for update;

    -- Este SELECT ocorre depois do lock e enxerga a gravação que acabou de liberá-lo.
    v_snapshot := public.obter_laboratorio_edicao(v_id);
    if v_snapshot->>'revisao' is distinct from p_revisao then
      raise exception 'REVISAO_DESATUALIZADA';
    end if;
    select coalesce(array_agg(j.id order by j.id), '{}'::uuid[])
    into v_ids_atuais
    from public.janelas_horario j
    where j.laboratorio_id = v_id;
  end if;

  perform public._validar_chaves(p_dados, array[
    'nome', 'tipo', 'capacidade', 'localizacao', 'descricao', 'regras_de_uso',
    'ativo', 'modo_reserva', 'granularidade_minutos', 'duracao_minima_minutos',
    'duracao_maxima_minutos'
  ]);
  perform public._validar_chaves(p_janelas, array['manter', 'alterar', 'novas', 'remover']);
  if jsonb_typeof(p_janelas->'manter') is distinct from 'array'
     or jsonb_typeof(p_janelas->'alterar') is distinct from 'array'
     or jsonb_typeof(p_janelas->'novas') is distinct from 'array'
     or jsonb_typeof(p_janelas->'remover') is distinct from 'array'
     or jsonb_typeof(p_equipamentos) is distinct from 'array' then
    raise exception 'ENTRADA_INVALIDA';
  end if;
  if jsonb_array_length(p_equipamentos) > 100 then
    raise exception 'ENTRADA_INVALIDA';
  end if;

  begin
    select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_manter
    from jsonb_array_elements_text(p_janelas->'manter');
    select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into v_alterar
    from jsonb_array_elements(p_janelas->'alterar');
    select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_remover
    from jsonb_array_elements_text(p_janelas->'remover');
  exception when invalid_text_representation then
    raise exception 'FUNCIONAMENTO_INCOMPLETO';
  end;

  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_ids_enviados
  from unnest(v_manter || v_alterar || v_remover) as enviada(id);
  -- Comparar as listas ordenadas detecta omissão, repetição e IDs de outro laboratório.
  if v_ids_enviados is distinct from v_ids_atuais then
    raise exception 'FUNCIONAMENTO_INCOMPLETO';
  end if;

  v_total_janelas := cardinality(v_manter) + cardinality(v_alterar)
    + jsonb_array_length(p_janelas->'novas');
  v_mudou_janelas := cardinality(v_alterar) + cardinality(v_remover)
    + jsonb_array_length(p_janelas->'novas') > 0;
  if v_total_janelas = 0 and (p_id is null or v_mudou_janelas) then
    raise exception 'FUNCIONAMENTO_OBRIGATORIO';
  end if;
  -- Cadastros legados acima do limite podem ser preservados ou reduzidos.
  if v_total_janelas > greatest(50, cardinality(v_ids_atuais)) then
    raise exception 'ENTRADA_INVALIDA';
  end if;

  if p_id is null then
    v_antes := row(v_id, null, null, null, null, '', '', true, 'slot_fixo', 15,
      30, 240, now(), now())::public.laboratorios;
  end if;
  v_depois := jsonb_populate_record(v_antes, p_dados);
  v_mudou_regras := (
    v_antes.modo_reserva, v_antes.granularidade_minutos,
    v_antes.duracao_minima_minutos, v_antes.duracao_maxima_minutos
  ) is distinct from (
    v_depois.modo_reserva, v_depois.granularidade_minutos,
    v_depois.duracao_minima_minutos, v_depois.duracao_maxima_minutos
  );
  v_revalidar := v_mudou_janelas or v_mudou_regras
    or (v_antes.capacidade, v_antes.ativo) is distinct from (v_depois.capacidade, v_depois.ativo);

  for v_item, v_nova in
    select value, false from jsonb_array_elements(p_janelas->'alterar')
    union all
    select value, true from jsonb_array_elements(p_janelas->'novas')
  loop
    perform public._validar_chaves(v_item,
      array['dia_semana', 'inicio', 'fim', 'duracao_slot_minutos']
      || case when v_nova then '{}'::text[] else array['id'] end);
    if not (v_item ?& array['dia_semana', 'inicio', 'fim', 'duracao_slot_minutos']) then
      raise exception 'ENTRADA_INVALIDA';
    end if;
    v_janela := jsonb_populate_record(null::public.janelas_horario, v_item);
    if v_janela.dia_semana is null or v_janela.dia_semana not between 0 and 6
       or v_janela.inicio is null or v_janela.fim is null
       or v_janela.fim <= v_janela.inicio
       or v_janela.duracao_slot_minutos is null
       or v_janela.duracao_slot_minutos not between 1 and 720
       or extract(second from v_janela.inicio) <> 0
       or extract(second from v_janela.fim) <> 0 then
      raise exception 'FUNCIONAMENTO_INCOMPATIVEL';
    end if;
    if v_nova then
      v_janela.id := gen_random_uuid();
      v_janela.created_at := now();
    else
      select j.created_at into strict v_janela.created_at
      from public.janelas_horario j
      where j.id = v_janela.id and j.laboratorio_id = v_id;
    end if;
    v_janela.laboratorio_id := v_id;
    v_janelas_gravar := array_append(v_janelas_gravar, v_janela);
  end loop;

  if v_mudou_janelas and exists (
    select 1
    from (
      select j.inicio, max(j.fim) over (
        partition by j.dia_semana order by j.inicio, j.id
        rows between unbounded preceding and 1 preceding
      ) as fim_anterior
      from (
        select atual.id, atual.dia_semana, atual.inicio, atual.fim
        from public.janelas_horario atual
        where atual.laboratorio_id = v_id and atual.id = any(v_manter)
        union all
        select nova.id, nova.dia_semana, nova.inicio, nova.fim
        from unnest(v_janelas_gravar) nova
      ) j
    ) ordenada
    where ordenada.inicio < ordenada.fim_anterior
  ) then
    raise exception 'JANELAS_SOBREPOSTAS';
  end if;

  if (v_mudou_janelas or v_mudou_regras) and exists (
    select 1
    from (
      select atual.inicio, atual.fim, atual.duracao_slot_minutos
      from public.janelas_horario atual
      where atual.laboratorio_id = v_id and atual.id = any(v_manter)
      union all
      select nova.inicio, nova.fim, nova.duracao_slot_minutos
      from unnest(v_janelas_gravar) nova
    ) j
    cross join lateral (
      select case when v_depois.modo_reserva = 'slot_fixo'
        then j.duracao_slot_minutos else v_depois.granularidade_minutos end as valor
    ) passo
    cross join lateral (
      select ceil(v_depois.duracao_minima_minutos::numeric / nullif(passo.valor, 0))
        * passo.valor as valor
    ) minimo
    where passo.valor is null or passo.valor < 1
      or minimo.valor > v_depois.duracao_maxima_minutos
      or minimo.valor > extract(epoch from (j.fim - j.inicio)) / 60
  ) then
    raise exception 'FUNCIONAMENTO_INCOMPATIVEL';
  end if;

  insert into public.laboratorios (
    id, nome, tipo, capacidade, localizacao, descricao, regras_de_uso, ativo,
    modo_reserva, granularidade_minutos, duracao_minima_minutos, duracao_maxima_minutos
  ) values (
    v_id, v_depois.nome, v_depois.tipo, v_depois.capacidade, v_depois.localizacao,
    v_depois.descricao, v_depois.regras_de_uso, v_depois.ativo, v_depois.modo_reserva,
    v_depois.granularidade_minutos, v_depois.duracao_minima_minutos, v_depois.duracao_maxima_minutos
  )
  on conflict (id) do update set
    nome = excluded.nome, tipo = excluded.tipo, capacidade = excluded.capacidade,
    localizacao = excluded.localizacao, descricao = excluded.descricao,
    regras_de_uso = excluded.regras_de_uso, ativo = excluded.ativo,
    modo_reserva = excluded.modo_reserva, granularidade_minutos = excluded.granularidade_minutos,
    duracao_minima_minutos = excluded.duracao_minima_minutos,
    duracao_maxima_minutos = excluded.duracao_maxima_minutos;

  if v_mudou_janelas then
    -- A troca entre dois horários não viola a chave única temporariamente.
    -- Somente as janelas alteradas são reinseridas com o mesmo ID e created_at.
    delete from public.janelas_horario j
    where j.laboratorio_id = v_id and j.id = any(v_alterar || v_remover);

    insert into public.janelas_horario (
      id, laboratorio_id, dia_semana, inicio, fim, duracao_slot_minutos, created_at
    )
    select j.id, j.laboratorio_id, j.dia_semana, j.inicio, j.fim, j.duracao_slot_minutos, j.created_at
    from unnest(v_janelas_gravar) j;
  end if;

  for v_item in select value from jsonb_array_elements(p_equipamentos) loop
    perform public._validar_chaves(v_item,
      array['id', 'nome', 'patrimonio', 'quantidade', 'status', 'reservavel_individualmente']);
    if not (v_item ?& array['nome', 'patrimonio', 'quantidade', 'status', 'reservavel_individualmente']) then
      raise exception 'ENTRADA_INVALIDA';
    end if;
    v_equipamento_id := nullif(v_item->>'id', '')::uuid;
    if v_equipamento_id is not null and not exists (
      select 1 from public.equipamentos e where e.id = v_equipamento_id and e.laboratorio_id = v_id
    ) then
      raise exception 'EQUIPAMENTO_OUTRO_LABORATORIO';
    end if;
    v_equipamento_id := coalesce(v_equipamento_id, gen_random_uuid());
    if v_equipamento_id = any(v_ids_equipamentos) then
      raise exception 'EQUIPAMENTO_DUPLICADO';
    end if;
    v_ids_equipamentos := array_append(v_ids_equipamentos, v_equipamento_id);
    v_equipamento := jsonb_populate_record(null::public.equipamentos, v_item);
    if exists (
      select 1 from public.equipamentos e
      where e.id = v_equipamento_id
        and (e.quantidade, e.status, e.reservavel_individualmente) is distinct from
          (v_equipamento.quantidade, v_equipamento.status, v_equipamento.reservavel_individualmente)
    ) then
      v_revalidar := true;
    end if;
    insert into public.equipamentos (
      id, laboratorio_id, nome, patrimonio, quantidade, status, reservavel_individualmente
    ) values (
      v_equipamento_id, v_id, v_equipamento.nome, nullif(trim(v_equipamento.patrimonio), ''),
      v_equipamento.quantidade, v_equipamento.status, v_equipamento.reservavel_individualmente
    )
    on conflict (id) do update set nome = excluded.nome, patrimonio = excluded.patrimonio,
      quantidade = excluded.quantidade, status = excluded.status,
      reservavel_individualmente = excluded.reservavel_individualmente;
  end loop;

  if p_id is not null and v_revalidar then
    perform public._revalidar_futuras(v_id);
  end if;
  perform public._auditar(
    case when p_id is null then 'salvar_laboratorio_completo' else 'editar_laboratorio_completo' end,
    'laboratorios', v_id,
    v_snapshot - array['revisao', 'total_janelas', 'total_equipamentos'],
    public.obter_laboratorio_edicao(v_id) - array['revisao', 'total_janelas', 'total_equipamentos']
  );
  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function labreserva_private.gravar_laboratorio_completo(uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.salvar_laboratorio_completo(
  p_dados jsonb,
  p_janelas jsonb,
  p_equipamentos jsonb,
  p_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_id is not null then
    raise exception 'REVISAO_OBRIGATORIA';
  end if;
  return labreserva_private.gravar_laboratorio_completo(
    null, null, p_dados,
    jsonb_build_object('manter', '[]'::jsonb, 'alterar', '[]'::jsonb,
      'novas', p_janelas, 'remover', '[]'::jsonb),
    p_equipamentos
  );
end;
$$;

create function public.editar_laboratorio_completo(
  p_id uuid,
  p_revisao text,
  p_dados jsonb,
  p_janelas jsonb,
  p_equipamentos jsonb
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_id is null then
    raise exception 'ENTRADA_INVALIDA';
  end if;
  return labreserva_private.gravar_laboratorio_completo(p_id, p_revisao, p_dados, p_janelas, p_equipamentos);
end;
$$;

revoke all on function public.obter_laboratorio_edicao(uuid),
  public.salvar_laboratorio_completo(jsonb, jsonb, jsonb, uuid),
  public.editar_laboratorio_completo(uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.obter_laboratorio_edicao(uuid),
  public.salvar_laboratorio_completo(jsonb, jsonb, jsonb, uuid),
  public.editar_laboratorio_completo(uuid, text, jsonb, jsonb, jsonb)
  to authenticated;
