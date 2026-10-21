-- Indicadores independentes da paginação das listas. Nenhum dado pessoal é agregado publicamente.
create function public.obter_resumo_painel() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_usuario uuid:=public._exigir_ativo();
  v_dia date:=(now() at time zone 'America/Sao_Paulo')::date;
  v_inicio timestamptz; v_fim timestamptz; v_admin boolean:=public.tem_papel('admin');
  v_labs integer; v_ocupados integer; v_resultado jsonb; v_ocorrencias bigint;
begin
  v_inicio:=v_dia::timestamp at time zone 'America/Sao_Paulo';
  v_fim:=(v_dia+1)::timestamp at time zone 'America/Sao_Paulo';
  select count(*) into v_labs from public.laboratorios where ativo;
  select count(distinct r.laboratorio_id) into v_ocupados
    from public.reservas r join public.laboratorios l on l.id=r.laboratorio_id and l.ativo
    where r.escopo='laboratorio' and r.status in ('aprovada','em_uso') and r.periodo @> now();
  with visiveis as materialized (
    select r.* from public.reservas r where v_admin or r.solicitante_id=v_usuario or public.monitora_lab(r.laboratorio_id)
  ) select jsonb_build_object(
    'labsAtivos',v_labs,
    'reservasHoje',count(*) filter(where periodo&&tstzrange(v_inicio,v_fim,'[)')),
    'confirmadasHoje',count(*) filter(where periodo&&tstzrange(v_inicio,v_fim,'[)') and status in ('aprovada','em_uso','concluida')),
    'pendentes',count(*) filter(where status='pendente'),
    'noShows',count(*) filter(where status='no_show'),
    'ocupacaoPercentual',case when v_labs=0 then 0 else round(v_ocupados*100.0/v_labs)::int end
  ) into v_resultado from visiveis;
  select count(*) into v_ocorrencias from public.ocorrencias o
    where v_admin or public.monitora_lab(o.laboratorio_id) or exists(
      select 1 from public.reservas r where r.id=o.reserva_id and r.solicitante_id=v_usuario
    );
  return v_resultado||jsonb_build_object('ocorrencias',v_ocorrencias);
end $$;
revoke execute on function public.obter_resumo_painel() from public,anon;
grant execute on function public.obter_resumo_painel() to authenticated;
