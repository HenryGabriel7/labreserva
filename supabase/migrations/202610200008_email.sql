-- A fila, o claim SKIP LOCKED, o reaper, o backoff e os jobs cron estão na 001.
-- Nenhuma credencial é gravada em migração: project_url e notification_worker_secret
-- são lidos do Vault pelo job notificacoes-worker.
alter table public.notificacoes add column provedor_id text;
alter table public.notificacoes add column mensagem_email jsonb check (mensagem_email is null or jsonb_typeof(mensagem_email)='object');
alter table public.notificacoes add column mensagem_preparada_em timestamptz;
create index notificacoes_provedor_id_idx on public.notificacoes(provedor_id) where provedor_id is not null;

create function public.preparar_entrega_notificacao(p_id uuid,p_mensagem jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n public.notificacoes;
begin
  select * into v_n from public.notificacoes where id=p_id for update;
  if not found or v_n.status<>'enviando' then raise exception 'NOTIFICACAO_NAO_RECLAMADA'; end if;
  if v_n.mensagem_email is not null then return v_n.mensagem_email; end if;
  if p_mensagem is null or jsonb_typeof(p_mensagem)<>'object'
    or not(p_mensagem ?& array['remetente','para','assunto','html','texto','chaveIdempotencia'])
    or p_mensagem-'remetente'-'para'-'assunto'-'html'-'texto'-'chaveIdempotencia'-'descadastroUrl'<>'{}'::jsonb
    or exists(select 1 from jsonb_each(p_mensagem) e where jsonb_typeof(e.value)<>'string')
    or p_mensagem->>'para'<>v_n.destinatario_email or p_mensagem->>'chaveIdempotencia'<>v_n.chave_idempotencia
    or octet_length(p_mensagem::text)>1048576 then raise exception 'MENSAGEM_INVALIDA'; end if;
  update public.notificacoes set mensagem_email=p_mensagem,mensagem_preparada_em=now() where id=p_id;
  return p_mensagem;
end $$;

create function public.marcar_reconciliacao_notificacao(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A retenção da chave no Resend é 24 h. Antes de ultrapassá-la, interrompe
  -- automaticamente entregas de resultado incerto em vez de duplicar mensagens.
  update public.notificacoes set status='falhou',tentativas=5,proxima_tentativa_em=null,erro='reconciliacao_manual_necessaria'
  where id=p_id and status='enviando' and provedor_id is null and mensagem_preparada_em<=now()-interval '23 hours';
  if not found then raise exception 'RECONCILIACAO_NAO_NECESSARIA'; end if;
end $$;

create function public.registrar_entrega_notificacao(p_id uuid,p_provedor_id text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_provedor_id is null or char_length(p_provedor_id) not between 1 and 200 then raise exception 'PROVEDOR_ID_INVALIDO'; end if;
  update public.notificacoes set provedor_id=p_provedor_id where id=p_id and status in ('enviando','falhou');
  if not found then raise exception 'NOTIFICACAO_NAO_RECLAMADA'; end if;
end $$;

create function public.registrar_webhook_notificacao(p_provedor_id text,p_email text,p_evento text,p_chave_idempotencia text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_provedor_id is null or char_length(p_provedor_id) not between 1 and 200
    or p_chave_idempotencia is null or char_length(p_chave_idempotencia) not between 1 and 600
    or p_email is null or char_length(p_email)>320 or position('@' in p_email)=0
    or p_evento is null or p_evento not in ('email.bounced','email.complained') then raise exception 'EVENTO_INVALIDO'; end if;
  -- O SDK verifica a assinatura antes desta RPC. O identificador Svix é a chave
  -- idempotente; supressão é por endereço, inclusive após troca de perfil.
  perform public.suprimir_email(p_email,p_evento,p_chave_idempotencia);
  update public.notificacoes set status='falhou',erro=p_evento,envio_dispensado=false,proxima_tentativa_em=null
  where provedor_id=p_provedor_id and lower(destinatario_email)=lower(trim(p_email));
end $$;

create function public.descadastrar_notificacao(p_usuario_id uuid,p_categoria text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_usuario_id is null or p_categoria is null or p_categoria not in ('lembretes','outros') then raise exception 'PREFERENCIA_INVALIDA'; end if;
  -- Somente o servidor com token HMAC verificado pode chamar. Mensagens
  -- essenciais são classificadas pelo banco e ignoram estas preferências.
  update public.profiles set preferencias_notificacao=jsonb_set(preferencias_notificacao,array[p_categoria],'false'::jsonb,true)
  where id=p_usuario_id and ativo;
end $$;

create function public.sugerir_horarios_notificacao(p_id uuid) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_r public.reservas; v_n public.notificacoes; v_lab public.laboratorios;
  v_inicio timestamptz; v_fim timestamptz; v_resultado text[]:='{}'; v_itens jsonb;
begin
  select * into v_n from public.notificacoes where id=p_id and template='reserva_substituida';
  if not found then return v_resultado; end if;
  select * into v_r from public.reservas where id=(v_n.payload->>'reserva_id')::uuid and solicitante_id=v_n.usuario_id and status='substituida';
  if not found then return v_resultado; end if;
  select * into v_lab from public.laboratorios where id=v_r.laboratorio_id and ativo;
  if not found then return v_resultado; end if;
  v_itens:=public._itens_reserva(v_r.id);
  for v_inicio in
    select s.inicio from generate_series((now() at time zone 'America/Sao_Paulo')::date::timestamp,
      ((now() at time zone 'America/Sao_Paulo')::date+7)::timestamp,interval '1 day') d(dia)
    join public.janelas_horario j on j.laboratorio_id=v_r.laboratorio_id and j.dia_semana=extract(dow from d.dia)::int
    cross join lateral generate_series((d.dia::date+j.inicio) at time zone 'America/Sao_Paulo',
      ((d.dia::date+j.fim) at time zone 'America/Sao_Paulo')-(v_r.fim-v_r.inicio),
      make_interval(mins=>case when v_lab.modo_reserva='slot_fixo' then j.duracao_slot_minutos else v_lab.granularidade_minutos end)) s(inicio)
    where s.inicio>now() and not exists(select 1 from public.reservas r where r.laboratorio_id=v_r.laboratorio_id
      and r.status in ('aprovada','em_uso') and r.periodo&&tstzrange(s.inicio,s.inicio+(v_r.fim-v_r.inicio),'[)'))
    order by s.inicio limit 3000
  loop
    v_fim:=v_inicio+(v_r.fim-v_r.inicio);
    begin
      perform public._validar_intervalo(v_r.laboratorio_id,v_inicio,v_fim,v_r.escopo,v_r.n_participantes,v_itens,true);
    exception when raise_exception then continue;
    end;
    v_resultado:=array_append(v_resultado,to_char(v_inicio at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' às '||to_char(v_fim at time zone 'America/Sao_Paulo','HH24:MI'));
    exit when cardinality(v_resultado)>=3;
  end loop;
  return v_resultado;
end $$;

revoke execute on function public.preparar_entrega_notificacao(uuid,jsonb),public.marcar_reconciliacao_notificacao(uuid),public.registrar_entrega_notificacao(uuid,text),public.registrar_webhook_notificacao(text,text,text,text),
  public.descadastrar_notificacao(uuid,text),public.sugerir_horarios_notificacao(uuid) from public,anon,authenticated;
grant execute on function public.preparar_entrega_notificacao(uuid,jsonb),public.marcar_reconciliacao_notificacao(uuid),public.registrar_entrega_notificacao(uuid,text),public.registrar_webhook_notificacao(text,text,text,text),
  public.descadastrar_notificacao(uuid,text),public.sugerir_horarios_notificacao(uuid) to service_role;
