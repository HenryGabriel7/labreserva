-- Toda decisão é serializada por laboratório. O cliente nunca grava tabelas de fluxo.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

revoke create on schema public from public, anon, authenticated;
revoke all on schema public from anon;
grant usage on schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public;

create table public.profiles (
  id uuid primary key references auth.users(id),
  nome text not null check (char_length(nome) between 2 and 150),
  email text not null unique check (email = lower(email) and email like '%@%'),
  matricula text unique,
  preferencias_notificacao jsonb not null default '{"lembretes":true,"outros":true}' check (
    jsonb_typeof(preferencias_notificacao) = 'object' and preferencias_notificacao - 'lembretes' - 'outros' = '{}'::jsonb
    and (not(preferencias_notificacao ? 'lembretes') or jsonb_typeof(preferencias_notificacao->'lembretes')='boolean')
    and (not(preferencias_notificacao ? 'outros') or jsonb_typeof(preferencias_notificacao->'outros')='boolean')
  ),
  ativo boolean not null default true,
  email_suprimido boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  papel text not null check (papel in ('aluno','professor','funcionario','monitor','admin')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,papel)
);
create table public.laboratorios (
  id uuid primary key default gen_random_uuid(), nome text not null check (char_length(nome) between 2 and 150),
  tipo text not null check (tipo in ('redes','informatica','quimica','anatomia')),
  capacidade integer not null check (capacidade between 1 and 10000), localizacao text not null,
  descricao text not null default '', regras_de_uso text not null default '', ativo boolean not null default true,
  modo_reserva text not null check (modo_reserva in ('slot_fixo','intervalo_livre')),
  granularidade_minutos integer not null default 15 check (granularidade_minutos between 1 and 240),
  duracao_minima_minutos integer not null default 30 check (duracao_minima_minutos > 0),
  duracao_maxima_minutos integer not null default 240,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (duracao_maxima_minutos >= duracao_minima_minutos and duracao_maxima_minutos <= 1440)
);
create table public.janelas_horario (
  id uuid primary key default gen_random_uuid(), laboratorio_id uuid not null references public.laboratorios(id),
  dia_semana integer not null check (dia_semana between 0 and 6), inicio time not null, fim time not null,
  duracao_slot_minutos integer not null default 60 check (duracao_slot_minutos between 1 and 720),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (fim > inicio), unique(laboratorio_id,dia_semana,inicio,fim)
);
create table public.equipamentos (
  id uuid primary key default gen_random_uuid(), laboratorio_id uuid not null references public.laboratorios(id),
  nome text not null check (char_length(nome) between 2 and 150), patrimonio text unique,
  quantidade integer not null check (quantidade between 1 and 100000),
  status text not null default 'ativo' check (status in ('ativo','manutencao','inativo')),
  reservavel_individualmente boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.monitor_laboratorios (
  id uuid primary key default gen_random_uuid(), monitor_id uuid not null references public.profiles(id),
  laboratorio_id uuid not null references public.laboratorios(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(monitor_id,laboratorio_id)
);
create table public.recorrencias (
  id uuid primary key default gen_random_uuid(), solicitante_id uuid not null references public.profiles(id),
  laboratorio_id uuid not null references public.laboratorios(id), dia_semana integer not null check (dia_semana between 0 and 6),
  hora_inicio time not null, hora_fim time not null, data_inicio date not null, data_fim date not null,
  excecoes date[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (hora_fim > hora_inicio and data_fim >= data_inicio)
);
create table public.reservas (
  id uuid primary key default gen_random_uuid(), laboratorio_id uuid not null references public.laboratorios(id),
  solicitante_id uuid not null references public.profiles(id), inicio timestamptz not null, fim timestamptz not null,
  periodo tstzrange generated always as (tstzrange(inicio,fim,'[)')) stored,
  escopo text not null check (escopo in ('laboratorio','equipamentos')),
  finalidade text not null check (char_length(finalidade) between 5 and 2000),
  n_participantes integer not null check (n_participantes > 0), justificativa_prioridade text,
  prioridade_efetiva integer not null check (prioridade_efetiva in (1,2)),
  papel_solicitante text not null check (papel_solicitante in ('aluno','professor','funcionario')),
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada','cancelada','em_uso','concluida','no_show','substituida')),
  decidido_por uuid references public.profiles(id), decidido_em timestamptz, motivo text,
  recorrencia_id uuid references public.recorrencias(id), conflito boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (fim > inicio),
  constraint reservas_sala_sem_sobreposicao exclude using gist (laboratorio_id with =, periodo with &&)
    where (escopo = 'laboratorio' and status in ('aprovada','em_uso'))
);
create table public.reserva_equipamentos (
  id uuid primary key default gen_random_uuid(), reserva_id uuid not null references public.reservas(id),
  equipamento_id uuid not null references public.equipamentos(id), quantidade integer not null check (quantidade > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(reserva_id,equipamento_id)
);
create table public.bloqueios (
  id uuid primary key default gen_random_uuid(), laboratorio_id uuid references public.laboratorios(id),
  inicio timestamptz not null, fim timestamptz not null,
  motivo text not null check (motivo in ('feriado','manutencao','evento')), descricao text not null check (char_length(descricao) between 3 and 2000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (fim > inicio)
);
create table public.checkins (
  id uuid primary key default gen_random_uuid(), reserva_id uuid not null unique references public.reservas(id),
  monitor_id uuid not null references public.profiles(id), entrada timestamptz not null default now(), saida timestamptz,
  observacoes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (saida is null or saida >= entrada)
);
create table public.ocorrencias (
  id uuid primary key default gen_random_uuid(), reserva_id uuid not null references public.reservas(id),
  laboratorio_id uuid not null references public.laboratorios(id), monitor_id uuid not null references public.profiles(id),
  tipo text not null check (tipo in ('dano','falta_material','uso_indevido')),
  descricao text not null check (char_length(descricao) between 5 and 4000),
  gravidade text not null check (gravidade in ('baixa','media','grave')), anexos text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (cardinality(anexos) <= 5)
);
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(), usuario_id uuid not null references public.profiles(id),
  tipo_evento text not null, template text not null, payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  destinatario_email text not null, essencial boolean not null default false, envio_dispensado boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente','enviando','enviada','falhou')),
  tentativas integer not null default 0 check (tentativas between 0 and 5),
  proxima_tentativa_em timestamptz default now(), chave_idempotencia text not null unique,
  enviada_em timestamptz, erro text, lida_em timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(), ator_id uuid references public.profiles(id), acao text not null,
  entidade text not null, entidade_id uuid, antes jsonb, depois jsonb, ip inet, user_agent text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.configuracoes (
  id uuid primary key default gen_random_uuid(), chave text not null unique, valor jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.rate_limits (
  id uuid primary key default gen_random_uuid(), chave text not null unique, janela_inicio timestamptz not null default now(),
  contagem integer not null default 0 check (contagem >= 0), bloqueado_ate timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.supressoes_email (
  id uuid primary key default gen_random_uuid(), email text not null unique, motivo text not null,
  chave_idempotencia text not null unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index on public.profiles(ativo);
create index on public.laboratorios(tipo,ativo,capacidade);
create index on public.janelas_horario(laboratorio_id,dia_semana);
create index on public.equipamentos(laboratorio_id,status);
create index on public.monitor_laboratorios(laboratorio_id,monitor_id);
create index on public.recorrencias(solicitante_id);
create index on public.recorrencias(laboratorio_id);
create index on public.reservas(laboratorio_id,status,inicio);
create index on public.reservas(solicitante_id,inicio desc);
create index on public.reservas(decidido_por);
create index on public.reservas(recorrencia_id);
create index on public.reservas(status,prioridade_efetiva desc,created_at);
create index on public.reserva_equipamentos(equipamento_id,reserva_id);
create index on public.bloqueios(laboratorio_id,inicio,fim);
create index on public.checkins(monitor_id);
create index on public.ocorrencias(reserva_id);
create index on public.ocorrencias(laboratorio_id,created_at desc);
create index on public.ocorrencias(monitor_id);
create index on public.notificacoes(usuario_id,created_at desc);
create index on public.notificacoes(status,proxima_tentativa_em) where status in ('pendente','enviando');
create index on public.audit_log(ator_id,created_at desc);
create index on public.audit_log(entidade,entidade_id,created_at desc);

create function public._tocar_updated_at() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','user_roles','laboratorios','janelas_horario','equipamentos','monitor_laboratorios','recorrencias','reservas','reserva_equipamentos','bloqueios','checkins','ocorrencias','notificacoes','configuracoes','rate_limits','supressoes_email'] loop
    execute format('create trigger tocar_updated_at before update on public.%I for each row execute function public._tocar_updated_at()',t);
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;
alter table public.audit_log enable row level security;
create function public._auditoria_imutavel() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin raise exception using errcode='42501', message='AUDITORIA_IMUTAVEL'; end $$;
create trigger auditoria_imutavel before update or delete on public.audit_log for each row execute function public._auditoria_imutavel();

create function public._ativo() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo)
$$;
create function public.tem_papel(p_papel text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public._ativo() and exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.papel=p_papel)
$$;
create function public.monitora_lab(p_laboratorio_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.tem_papel('monitor') and exists(select 1 from public.monitor_laboratorios m where m.monitor_id=auth.uid() and m.laboratorio_id=p_laboratorio_id)
$$;
create function public.pode_gerir_lab(p_laboratorio_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.tem_papel('admin') or public.monitora_lab(p_laboratorio_id)
$$;
create function public._exigir_ativo() returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public._ativo() then raise exception using errcode='42501', message='ACESSO_NEGADO'; end if;
  return auth.uid();
end $$;
create function public._exigir_admin() returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.tem_papel('admin') then raise exception using errcode='42501', message='ACESSO_NEGADO'; end if;
  return auth.uid();
end $$;
create function public._perfil_visivel(p_usuario_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public._ativo() and (p_usuario_id=auth.uid() or public.tem_papel('admin') or exists(
    select 1 from public.reservas r where r.solicitante_id=p_usuario_id and public.monitora_lab(r.laboratorio_id)))
$$;
create function public._reserva_visivel(p_reserva_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public._ativo() and exists(select 1 from public.reservas r where r.id=p_reserva_id and (r.solicitante_id=auth.uid() or public.pode_gerir_lab(r.laboratorio_id)))
$$;
create function public._config_num(p_chave text) returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select (c.valor #>> '{}')::numeric from public.configuracoes c where c.chave=p_chave
$$;
create function public._auditar(p_acao text,p_entidade text,p_entidade_id uuid,p_antes jsonb default null,p_depois jsonb default null,p_ator_id uuid default auth.uid()) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_log(ator_id,acao,entidade,entidade_id,antes,depois) values(p_ator_id,p_acao,p_entidade,p_entidade_id,p_antes,p_depois)
$$;
create function public._lock_lab(p_laboratorio_id uuid) returns void language sql volatile security definer set search_path = public, pg_temp as $$
  select pg_advisory_xact_lock_shared(hashtextextended('global-laboratorios',84219));
  select pg_advisory_xact_lock(hashtextextended(p_laboratorio_id::text,84219))
$$;

create policy profiles_leitura on public.profiles for select to authenticated using (public._perfil_visivel(id));
create policy profiles_preferencias on public.profiles for update to authenticated using (id=auth.uid() and public._ativo()) with check (id=auth.uid() and public._ativo());
create policy roles_leitura on public.user_roles for select to authenticated using (public._ativo() and (user_id=auth.uid() or public.tem_papel('admin')));
create policy labs_leitura on public.laboratorios for select to authenticated using (public._ativo() and (ativo or public.pode_gerir_lab(id)));
create policy janelas_leitura on public.janelas_horario for select to authenticated using (public._ativo());
create policy equipamentos_leitura on public.equipamentos for select to authenticated using (public._ativo());
create policy monitores_leitura on public.monitor_laboratorios for select to authenticated using (public._ativo() and (monitor_id=auth.uid() or public.tem_papel('admin')));
create policy reservas_leitura on public.reservas for select to authenticated using (public._ativo() and (solicitante_id=auth.uid() or public.pode_gerir_lab(laboratorio_id)));
create policy itens_leitura on public.reserva_equipamentos for select to authenticated using (public._reserva_visivel(reserva_id));
create policy recorrencias_leitura on public.recorrencias for select to authenticated using (public._ativo() and (solicitante_id=auth.uid() or public.pode_gerir_lab(laboratorio_id)));
create policy bloqueios_leitura on public.bloqueios for select to authenticated using (public._ativo());
create policy checkins_leitura on public.checkins for select to authenticated using (public._reserva_visivel(reserva_id));
create policy ocorrencias_leitura on public.ocorrencias for select to authenticated using (public.pode_gerir_lab(laboratorio_id));
create policy notificacoes_leitura on public.notificacoes for select to authenticated using (public._ativo() and usuario_id=auth.uid());
create policy auditoria_leitura on public.audit_log for select to authenticated using (public.tem_papel('admin'));
create policy configuracoes_leitura on public.configuracoes for select to authenticated using (public._ativo());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles,public.user_roles,public.laboratorios,public.janelas_horario,public.equipamentos,public.monitor_laboratorios,public.reservas,public.reserva_equipamentos,public.recorrencias,public.bloqueios,public.checkins,public.ocorrencias,public.notificacoes,public.audit_log,public.configuracoes to authenticated;
grant update(preferencias_notificacao) on public.profiles to authenticated;
grant all on all tables in schema public to service_role;

insert into public.configuracoes(chave,valor) values
  ('cancelamento_prazo_horas','2'),('antecedencia_min_horas','1'),('antecedencia_max_dias','90'),
  ('noshow_tolerancia_minutos','15'),('pendencia_lembrete_horas','24'),('pendencia_alerta_admin_horas','48'),
  ('recorrencia_max_meses','6'),('login_max_falhas','5'),('login_bloqueio_minutos','15'),
  ('dominios_email_permitidos','[]'),('identidade_visual','{"nome":"Instituto Horizonte","cor":"#0f766e","logo_url":""}');

create function public.consumir_rate_limit(p_chave text,p_limite integer,p_janela_segundos integer) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_contagem integer;
begin
  if p_limite < 1 or p_janela_segundos < 1 or char_length(p_chave) not between 1 and 250 then raise exception 'ENTRADA_INVALIDA'; end if;
  insert into public.rate_limits(chave,janela_inicio,contagem) values(p_chave,clock_timestamp(),1)
  on conflict(chave) do update set
    contagem=case when public.rate_limits.janela_inicio <= clock_timestamp()-make_interval(secs=>p_janela_segundos) then 1 else public.rate_limits.contagem+1 end,
    janela_inicio=case when public.rate_limits.janela_inicio <= clock_timestamp()-make_interval(secs=>p_janela_segundos) then clock_timestamp() else public.rate_limits.janela_inicio end
  returning contagem into v_contagem;
  return v_contagem <= p_limite;
end $$;
create function public.verificar_bloqueio_login(p_chave text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select r.bloqueado_ate > now() from public.rate_limits r where r.chave='login-falhas:'||p_chave),false)
$$;
create function public.registrar_resultado_login(p_chave text,p_sucesso boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_linha public.rate_limits; v_max integer := public._config_num('login_max_falhas');
begin
  perform pg_advisory_xact_lock(hashtextextended('login-falhas:'||p_chave,84219));
  if p_sucesso then
    delete from public.rate_limits where chave='login-falhas:'||p_chave;
    return jsonb_build_object('bloqueado',false,'contagem',0);
  end if;
  insert into public.rate_limits(chave,contagem) values('login-falhas:'||p_chave,0) on conflict(chave) do nothing;
  select * into v_linha from public.rate_limits where chave='login-falhas:'||p_chave for update;
  if v_linha.bloqueado_ate > now() then return jsonb_build_object('bloqueado',true,'contagem',v_linha.contagem); end if;
  if v_linha.bloqueado_ate is not null or v_linha.janela_inicio < now()-make_interval(mins=>public._config_num('login_bloqueio_minutos')::int) then v_linha.contagem:=0; end if;
  v_linha.contagem:=v_linha.contagem+1;
  update public.rate_limits set contagem=v_linha.contagem,janela_inicio=now(),bloqueado_ate=case when v_linha.contagem>=v_max then now()+make_interval(mins=>public._config_num('login_bloqueio_minutos')::int) else null end where id=v_linha.id;
  return jsonb_build_object('bloqueado',v_linha.contagem>=v_max,'contagem',v_linha.contagem);
end $$;

create function public.enfileirar_notificacao(p_usuario_id uuid,p_tipo_evento text,p_template text,p_payload jsonb,p_chave_idempotencia text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_perfil public.profiles; v_essencial boolean;
begin
  select * into strict v_perfil from public.profiles where id=p_usuario_id;
  v_essencial:=p_tipo_evento in ('reserva_aprovada','reserva_recusada','reserva_substituida','reserva_cancelada','convite','recuperacao','seguranca_conta');
  insert into public.notificacoes(usuario_id,tipo_evento,template,payload,destinatario_email,essencial,chave_idempotencia)
  values(p_usuario_id,p_tipo_evento,p_template,coalesce(p_payload,'{}')||jsonb_build_object('usuario_nome',v_perfil.nome,'email',v_perfil.email),v_perfil.email,v_essencial,p_chave_idempotencia)
  on conflict(chave_idempotencia) do nothing returning id into v_id;
  if v_id is null then select n.id into v_id from public.notificacoes n where n.chave_idempotencia=p_chave_idempotencia; end if;
  return v_id;
end $$;
create function public._notificar_reserva(p_reserva_id uuid,p_evento text,p_incluir_solicitante boolean default true,p_incluir_gestores boolean default false) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas; v_dest uuid; v_payload jsonb;
begin
  select * into strict v_r from public.reservas where id=p_reserva_id;
  v_payload:=jsonb_build_object('reserva_id',v_r.id,'laboratorio_id',v_r.laboratorio_id,'laboratorio_nome',(select nome from public.laboratorios where id=v_r.laboratorio_id),'inicio',v_r.inicio,'fim',v_r.fim,'motivo',v_r.motivo,'finalidade',v_r.finalidade,'prioridade',v_r.prioridade_efetiva);
  for v_dest in select distinct x.id from (
    select v_r.solicitante_id as id where p_incluir_solicitante
    union all select ml.monitor_id from public.monitor_laboratorios ml join public.user_roles ur on ur.user_id=ml.monitor_id and ur.papel='monitor' where p_incluir_gestores and ml.laboratorio_id=v_r.laboratorio_id
  ) x join public.profiles p on p.id=x.id and p.ativo loop
    perform public.enfileirar_notificacao(v_dest,p_evento,p_evento,v_payload,v_r.id::text||':'||p_evento||':'||v_dest::text);
  end loop;
end $$;

create function public._validar_intervalo(p_laboratorio_id uuid,p_inicio timestamptz,p_fim timestamptz,p_escopo text,p_n_participantes integer,p_equipamentos jsonb,p_antecedencia boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lab public.laboratorios; v_local_inicio timestamp; v_local_fim timestamp; v_duracao numeric; v_item jsonb; v_e public.equipamentos; v_q integer;
begin
  select * into v_lab from public.laboratorios where id=p_laboratorio_id;
  if not found or not v_lab.ativo then raise exception 'LABORATORIO_INATIVO'; end if;
  if p_inicio is null or p_fim is null or p_fim<=p_inicio or p_inicio<=now() then raise exception 'INTERVALO_INVALIDO'; end if;
  if p_escopo is null or p_escopo not in ('laboratorio','equipamentos') or p_n_participantes is null or p_n_participantes<1 or p_n_participantes>v_lab.capacidade then raise exception 'CAPACIDADE_INVALIDA'; end if;
  if p_antecedencia and (p_inicio<now()+make_interval(secs=>(public._config_num('antecedencia_min_horas')*3600)::int) or p_inicio>now()+make_interval(days=>public._config_num('antecedencia_max_dias')::int)) then raise exception 'ANTECEDENCIA_INVALIDA'; end if;
  if exists(select 1 from public.bloqueios b where (b.laboratorio_id is null or b.laboratorio_id=p_laboratorio_id) and tstzrange(b.inicio,b.fim,'[)') && tstzrange(p_inicio,p_fim,'[)')) then raise exception 'HORARIO_BLOQUEADO'; end if;
  v_local_inicio:=p_inicio at time zone 'America/Sao_Paulo'; v_local_fim:=p_fim at time zone 'America/Sao_Paulo';
  v_duracao:=extract(epoch from p_fim-p_inicio)/60;
  if v_local_inicio::date<>v_local_fim::date or v_duracao<v_lab.duracao_minima_minutos or v_duracao>v_lab.duracao_maxima_minutos or extract(second from v_local_inicio)<>0 or extract(second from v_local_fim)<>0 then raise exception 'DURACAO_INVALIDA'; end if;
  if not exists(select 1 from public.janelas_horario j where j.laboratorio_id=p_laboratorio_id and j.dia_semana=extract(dow from v_local_inicio)::int and j.inicio<=v_local_inicio::time and j.fim>=v_local_fim::time and
    case when v_lab.modo_reserva='slot_fixo' then mod(extract(epoch from(v_local_inicio::time-j.inicio))/60,j.duracao_slot_minutos)=0 and mod(v_duracao,j.duracao_slot_minutos)=0
    else mod(extract(epoch from(v_local_inicio::time-j.inicio))/60,v_lab.granularidade_minutos)=0 and mod(v_duracao,v_lab.granularidade_minutos)=0 end) then raise exception 'FORA_DA_JANELA'; end if;
  if p_equipamentos is null or jsonb_typeof(p_equipamentos)<>'array' then raise exception 'EQUIPAMENTOS_INVALIDOS'; end if;
  if p_escopo='equipamentos' and jsonb_array_length(p_equipamentos)=0 then raise exception 'EQUIPAMENTOS_OBRIGATORIOS'; end if;
  if (select count(*) from jsonb_array_elements(p_equipamentos))<>(select count(distinct value->>'equipamento_id') from jsonb_array_elements(p_equipamentos)) then raise exception 'EQUIPAMENTO_DUPLICADO'; end if;
  for v_item in select value from jsonb_array_elements(p_equipamentos) loop
    if jsonb_typeof(v_item)<>'object' or not(v_item ?& array['equipamento_id','quantidade']) or exists(select 1 from jsonb_object_keys(v_item) k where k not in ('equipamento_id','quantidade')) or jsonb_typeof(v_item->'quantidade')<>'number' or (v_item->>'quantidade')!~'^[1-9][0-9]*$' then raise exception 'EQUIPAMENTOS_INVALIDOS'; end if;
    v_q:=(v_item->>'quantidade')::int;
    select * into v_e from public.equipamentos where id=(v_item->>'equipamento_id')::uuid and laboratorio_id=p_laboratorio_id;
    if not found or v_e.status<>'ativo' or v_q>v_e.quantidade or (p_escopo='equipamentos' and not v_e.reservavel_individualmente) then raise exception 'EQUIPAMENTO_INDISPONIVEL'; end if;
  end loop;
end $$;
create function public._itens_reserva(p_reserva_id uuid) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('equipamento_id',re.equipamento_id,'quantidade',re.quantidade)),'[]') from public.reserva_equipamentos re where re.reserva_id=p_reserva_id
$$;
create function public._conferir_conflitos(p_reserva_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas; v_e record; v_pico bigint;
begin
  select * into strict v_r from public.reservas where id=p_reserva_id;
  if exists(select 1 from public.reservas r where r.id<>v_r.id and r.laboratorio_id=v_r.laboratorio_id and r.status in ('aprovada','em_uso') and r.periodo&&v_r.periodo and (v_r.escopo='laboratorio' or r.escopo='laboratorio')) then raise exception 'CONFLITO_SALA'; end if;
  for v_e in select re.equipamento_id,re.quantidade,e.quantidade as estoque from public.reserva_equipamentos re join public.equipamentos e on e.id=re.equipamento_id where re.reserva_id=v_r.id loop
    -- Agrupar deltas coincidentes preserva [início,fim): sair e entrar no mesmo instante não duplica ocupação.
    with eventos as (
      select greatest(r.inicio,v_r.inicio) as instante,re.quantidade::bigint as delta from public.reservas r join public.reserva_equipamentos re on re.reserva_id=r.id where r.id<>v_r.id and r.status in ('aprovada','em_uso') and r.periodo&&v_r.periodo and re.equipamento_id=v_e.equipamento_id
      union all select least(r.fim,v_r.fim),-re.quantidade::bigint from public.reservas r join public.reserva_equipamentos re on re.reserva_id=r.id where r.id<>v_r.id and r.status in ('aprovada','em_uso') and r.periodo&&v_r.periodo and re.equipamento_id=v_e.equipamento_id
    ), agrupados as (select instante,sum(delta) delta from eventos group by instante), ocupacao as (select sum(delta) over(order by instante) as quantidade from agrupados)
    select coalesce(max(quantidade),0) into v_pico from ocupacao;
    if v_pico+v_e.quantidade>v_e.estoque then raise exception 'ESTOQUE_INSUFICIENTE'; end if;
  end loop;
end $$;

create function public.solicitar_reserva(p_laboratorio_id uuid,p_inicio timestamptz,p_fim timestamptz,p_escopo text,p_finalidade text,p_n_participantes integer,p_equipamentos jsonb default '[]',p_justificativa_prioridade text default null,p_recorrencia jsonb default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_usuario uuid:=public._exigir_ativo(); v_prioridade integer; v_papel text; v_recorrencia uuid; v_id uuid;
  v_ids uuid[]:='{}'; v_puladas date[]:='{}'; v_data date; v_inicio timestamptz; v_fim timestamptz;
  v_data_inicio date; v_data_fim date; v_dia integer; v_hora_inicio time; v_hora_fim time; v_excecoes date[]:='{}'; v_item jsonb;
begin
  if not public.consumir_rate_limit('solicitar:'||v_usuario::text,15,60) then raise exception 'LIMITE_SOLICITACOES'; end if;
  if p_finalidade is null or char_length(trim(p_finalidade)) not between 5 and 2000 or char_length(coalesce(p_justificativa_prioridade,''))>2000 then raise exception 'ENTRADA_INVALIDA'; end if;
  perform public._lock_lab(p_laboratorio_id);
  v_papel:=case when public.tem_papel('professor') then 'professor' when public.tem_papel('funcionario') then 'funcionario' else 'aluno' end;
  v_prioridade:=case when v_papel in ('professor','funcionario') then 2 else 1 end;
  if v_prioridade=1 and nullif(trim(p_justificativa_prioridade),'') is not null then raise exception 'PRIORIDADE_NAO_PERMITIDA'; end if;
  if p_recorrencia is not null then
    if v_prioridade<>2 then raise exception using errcode='42501',message='RECORRENCIA_NAO_PERMITIDA'; end if;
    if jsonb_typeof(p_recorrencia)<>'object' or not(p_recorrencia ?& array['dia_semana','hora_inicio','hora_fim','data_inicio','data_fim']) or exists(select 1 from jsonb_object_keys(p_recorrencia) k where k not in ('dia_semana','hora_inicio','hora_fim','data_inicio','data_fim','excecoes')) then raise exception 'RECORRENCIA_INVALIDA'; end if;
    v_dia:=(p_recorrencia->>'dia_semana')::integer; v_hora_inicio:=(p_recorrencia->>'hora_inicio')::time; v_hora_fim:=(p_recorrencia->>'hora_fim')::time;
    v_data_inicio:=(p_recorrencia->>'data_inicio')::date; v_data_fim:=(p_recorrencia->>'data_fim')::date;
    if p_recorrencia ? 'excecoes' then
      if jsonb_typeof(p_recorrencia->'excecoes')<>'array' then raise exception 'RECORRENCIA_INVALIDA'; end if;
      select coalesce(array_agg(x::date),'{}') into v_excecoes from jsonb_array_elements_text(p_recorrencia->'excecoes') x;
    end if;
    if v_dia is null or v_dia not between 0 and 6 or v_hora_inicio is null or v_hora_fim is null or v_hora_inicio>=v_hora_fim or v_data_inicio is null or v_data_fim is null or v_data_inicio>v_data_fim or v_data_inicio<(now() at time zone 'America/Sao_Paulo')::date or v_data_fim>(v_data_inicio+make_interval(months=>public._config_num('recorrencia_max_meses')::int))::date then raise exception 'RECORRENCIA_INVALIDA'; end if;
    insert into public.recorrencias(solicitante_id,laboratorio_id,dia_semana,hora_inicio,hora_fim,data_inicio,data_fim,excecoes) values(v_usuario,p_laboratorio_id,v_dia,v_hora_inicio,v_hora_fim,v_data_inicio,v_data_fim,v_excecoes) returning id into v_recorrencia;
  else
    if p_inicio is null or p_fim is null then raise exception 'INTERVALO_INVALIDO'; end if;
    v_data_inicio:=(p_inicio at time zone 'America/Sao_Paulo')::date; v_data_fim:=v_data_inicio;
  end if;
  for v_data in select x::date from generate_series(v_data_inicio::timestamp,v_data_fim::timestamp,interval '1 day') x loop
    if p_recorrencia is not null then
      if extract(dow from v_data)::int<>v_dia or v_data=any(v_excecoes) then continue; end if;
      v_inicio:=(v_data+v_hora_inicio) at time zone 'America/Sao_Paulo'; v_fim:=(v_data+v_hora_fim) at time zone 'America/Sao_Paulo';
      if exists(select 1 from public.bloqueios b where b.motivo='feriado' and (b.laboratorio_id is null or b.laboratorio_id=p_laboratorio_id) and tstzrange(b.inicio,b.fim,'[)')&&tstzrange(v_inicio,v_fim,'[)')) then v_puladas:=array_append(v_puladas,v_data); continue; end if;
    else v_inicio:=p_inicio; v_fim:=p_fim;
    end if;
    perform public._validar_intervalo(p_laboratorio_id,v_inicio,v_fim,p_escopo,p_n_participantes,p_equipamentos,true);
    insert into public.reservas(laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,justificativa_prioridade,prioridade_efetiva,papel_solicitante,recorrencia_id)
    values(p_laboratorio_id,v_usuario,v_inicio,v_fim,p_escopo,trim(p_finalidade),p_n_participantes,nullif(trim(p_justificativa_prioridade),''),v_prioridade,v_papel,v_recorrencia) returning id into v_id;
    insert into public.reserva_equipamentos(reserva_id,equipamento_id,quantidade) select v_id,(x->>'equipamento_id')::uuid,(x->>'quantidade')::int from jsonb_array_elements(p_equipamentos) x;
    v_ids:=array_append(v_ids,v_id);
    perform public._auditar('solicitar_reserva','reservas',v_id,null,jsonb_build_object('prioridade',v_prioridade,'recorrencia_id',v_recorrencia));
    perform public._notificar_reserva(v_id,'reserva_criada',false,true);
    if v_prioridade=2 and exists(select 1 from public.reservas r where r.laboratorio_id=p_laboratorio_id and r.prioridade_efetiva=1 and r.status='aprovada' and r.periodo&&tstzrange(v_inicio,v_fim,'[)')) then
      perform public._notificar_reserva(v_id,'prioridade_substituicao',false,true);
    end if;
  end loop;
  if cardinality(v_ids)=0 then raise exception 'RECORRENCIA_SEM_DATAS'; end if;
  return jsonb_build_object('reserva_ids',v_ids,'recorrencia_id',v_recorrencia,'datas_puladas',v_puladas);
end $$;

create function public._reserva_para_decidir(p_reserva_id uuid) returns public.reservas language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas;
begin
  perform public._exigir_ativo();
  select * into v_r from public.reservas where id=p_reserva_id;
  if not found or not public.pode_gerir_lab(v_r.laboratorio_id) then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  if v_r.solicitante_id=auth.uid() then raise exception using errcode='42501',message='DECISAO_PROPRIA_PROIBIDA'; end if;
  perform public._lock_lab(v_r.laboratorio_id);
  select * into strict v_r from public.reservas where id=p_reserva_id for update;
  return v_r;
end $$;
create function public._aprovar_reserva(p_reserva_id uuid,p_motivo text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas; v_sugerida uuid; v_motivo text;
begin
  v_r:=public._reserva_para_decidir(p_reserva_id);
  if v_r.status<>'pendente' then raise exception 'TRANSICAO_INVALIDA'; end if;
  perform public._validar_intervalo(v_r.laboratorio_id,v_r.inicio,v_r.fim,v_r.escopo,v_r.n_participantes,public._itens_reserva(v_r.id),false);
  perform public._conferir_conflitos(v_r.id);
  select r.id into v_sugerida from public.reservas r where r.laboratorio_id=v_r.laboratorio_id and r.status='pendente' and r.periodo&&v_r.periodo and
    (v_r.escopo='laboratorio' or r.escopo='laboratorio' or exists(select 1 from public.reserva_equipamentos a join public.reserva_equipamentos b on b.equipamento_id=a.equipamento_id where a.reserva_id=v_r.id and b.reserva_id=r.id))
    order by r.prioridade_efetiva desc,r.created_at,r.id limit 1;
  if v_sugerida<>v_r.id and nullif(trim(p_motivo),'') is null then raise exception 'MOTIVO_DESEMPATE_OBRIGATORIO'; end if;
  v_motivo:=coalesce(nullif(trim(p_motivo),''),'Aprovação conforme prioridade e ordem de chegada.');
  update public.reservas set status='aprovada',decidido_por=auth.uid(),decidido_em=now(),motivo=v_motivo,conflito=false where id=v_r.id;
  perform public._auditar('aprovar_reserva','reservas',v_r.id,jsonb_build_object('status',v_r.status),jsonb_build_object('status','aprovada','motivo',v_motivo,'sugestao_id',v_sugerida,'divergiu_sugestao',v_sugerida<>v_r.id,'prioridade',v_r.prioridade_efetiva));
  perform public._notificar_reserva(v_r.id,'reserva_aprovada');
  return jsonb_build_object('id',v_r.id,'status','aprovada');
end $$;
create function public.aprovar_reserva(p_reserva_id uuid,p_motivo text default null) returns jsonb language sql security definer set search_path = public, pg_temp as $$ select public._aprovar_reserva(p_reserva_id,p_motivo) $$;
create function public.aprovar_serie(p_recorrencia_id uuid,p_motivo text default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_serie public.recorrencias; v_r record; v_aprovadas uuid[]:='{}'; v_conflitantes uuid[]:='{}'; v_erro text;
begin
  perform public._exigir_ativo();
  select * into v_serie from public.recorrencias where id=p_recorrencia_id;
  if not found or not public.pode_gerir_lab(v_serie.laboratorio_id) or v_serie.solicitante_id=auth.uid() then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  perform public._lock_lab(v_serie.laboratorio_id);
  for v_r in select id from public.reservas where recorrencia_id=p_recorrencia_id and status='pendente' order by inicio,id loop
    begin
      perform public._aprovar_reserva(v_r.id,p_motivo); v_aprovadas:=array_append(v_aprovadas,v_r.id);
    exception when raise_exception or exclusion_violation then
      get stacked diagnostics v_erro=message_text;
      if v_erro not in ('CONFLITO_SALA','ESTOQUE_INSUFICIENTE','HORARIO_BLOQUEADO','MOTIVO_DESEMPATE_OBRIGATORIO','LABORATORIO_INATIVO','EQUIPAMENTO_INDISPONIVEL','FORA_DA_JANELA','DURACAO_INVALIDA','INTERVALO_INVALIDO','CAPACIDADE_INVALIDA') and sqlstate<>'23P01' then raise; end if;
      update public.reservas set conflito=true where id=v_r.id;
      perform public._auditar('conflito_serie','reservas',v_r.id,null,jsonb_build_object('erro',v_erro));
      v_conflitantes:=array_append(v_conflitantes,v_r.id);
    end;
  end loop;
  return jsonb_build_object('aprovadas',v_aprovadas,'conflitantes',v_conflitantes);
end $$;
create function public.recusar_reserva(p_reserva_id uuid,p_motivo text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas;
begin
  v_r:=public._reserva_para_decidir(p_reserva_id);
  if v_r.status<>'pendente' then raise exception 'TRANSICAO_INVALIDA'; end if;
  if nullif(trim(p_motivo),'') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  update public.reservas set status='recusada',decidido_por=auth.uid(),decidido_em=now(),motivo=trim(p_motivo),conflito=false where id=v_r.id;
  perform public._auditar('recusar_reserva','reservas',v_r.id,jsonb_build_object('status',v_r.status),jsonb_build_object('status','recusada','motivo',p_motivo));
  perform public._notificar_reserva(v_r.id,'reserva_recusada');
  return jsonb_build_object('id',v_r.id,'status','recusada');
end $$;
create function public.cancelar_reserva(p_reserva_id uuid,p_motivo text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas; v_usuario uuid:=public._exigir_ativo(); v_gestor boolean;
begin
  select * into v_r from public.reservas where id=p_reserva_id;
  if not found then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  v_gestor:=public.pode_gerir_lab(v_r.laboratorio_id);
  if v_r.solicitante_id<>v_usuario and not v_gestor then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  perform public._lock_lab(v_r.laboratorio_id);
  select * into strict v_r from public.reservas where id=p_reserva_id for update;
  if v_r.status not in ('pendente','aprovada') then raise exception 'TRANSICAO_INVALIDA'; end if;
  if not v_gestor and now()>v_r.inicio-make_interval(secs=>(public._config_num('cancelamento_prazo_horas')*3600)::int) then raise exception 'PRAZO_CANCELAMENTO_ENCERRADO'; end if;
  if nullif(trim(p_motivo),'') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  update public.reservas set status='cancelada',motivo=trim(p_motivo),decidido_por=v_usuario,decidido_em=now(),conflito=false where id=v_r.id;
  perform public._auditar('cancelar_reserva','reservas',v_r.id,jsonb_build_object('status',v_r.status),jsonb_build_object('status','cancelada','motivo',p_motivo));
  perform public._notificar_reserva(v_r.id,'reserva_cancelada',true,true);
  return jsonb_build_object('id',v_r.id,'status','cancelada');
end $$;
create function public.substituir_reserva(p_reserva_antiga_id uuid,p_reserva_nova_id uuid,p_motivo text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_antiga public.reservas; v_nova public.reservas;
begin
  v_antiga:=public._reserva_para_decidir(p_reserva_antiga_id);
  select * into v_nova from public.reservas where id=p_reserva_nova_id;
  if not found or v_nova.laboratorio_id<>v_antiga.laboratorio_id then raise exception 'SUBSTITUICAO_INVALIDA'; end if;
  v_nova:=public._reserva_para_decidir(p_reserva_nova_id);
  if v_antiga.laboratorio_id<>v_nova.laboratorio_id or not(v_antiga.periodo&&v_nova.periodo) or v_antiga.status<>'aprovada' or v_nova.status<>'pendente' or v_antiga.prioridade_efetiva<>1 or v_nova.prioridade_efetiva<>2 or exists(select 1 from public.checkins where reserva_id=v_antiga.id) then raise exception 'SUBSTITUICAO_INVALIDA'; end if;
  if nullif(trim(p_motivo),'') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  if v_antiga.escopo='equipamentos' and v_nova.escopo='equipamentos' and not exists(select 1 from public.reserva_equipamentos a join public.reserva_equipamentos b on b.equipamento_id=a.equipamento_id where a.reserva_id=v_antiga.id and b.reserva_id=v_nova.id) then raise exception 'SUBSTITUICAO_SEM_CONFLITO'; end if;
  update public.reservas set status='substituida',motivo=trim(p_motivo),decidido_por=auth.uid(),decidido_em=now() where id=v_antiga.id;
  perform public._aprovar_reserva(v_nova.id,p_motivo);
  perform public._auditar('substituir_reserva','reservas',v_antiga.id,jsonb_build_object('status','aprovada'),jsonb_build_object('status','substituida','nova_reserva_id',v_nova.id,'motivo',p_motivo,'prioridade_antiga',1,'prioridade_nova',2));
  perform public._notificar_reserva(v_antiga.id,'reserva_substituida');
  return jsonb_build_object('substituida_id',v_antiga.id,'aprovada_id',v_nova.id);
end $$;
create function public.fazer_checkin(p_reserva_id uuid,p_observacoes text default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas; v_id uuid;
begin
  v_r:=public._reserva_para_decidir(p_reserva_id);
  if v_r.status<>'aprovada' then raise exception 'TRANSICAO_INVALIDA'; end if;
  if now()<v_r.inicio or now()>=v_r.fim then raise exception 'CHECKIN_FORA_DO_HORARIO'; end if;
  insert into public.checkins(reserva_id,monitor_id,observacoes) values(v_r.id,auth.uid(),p_observacoes) returning id into v_id;
  update public.reservas set status='em_uso' where id=v_r.id;
  perform public._auditar('fazer_checkin','reservas',v_r.id,jsonb_build_object('status','aprovada'),jsonb_build_object('status','em_uso','checkin_id',v_id));
  return jsonb_build_object('id',v_r.id,'status','em_uso','checkin_id',v_id);
end $$;
create function public.fazer_checkout(p_reserva_id uuid,p_observacoes text default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas;
begin
  v_r:=public._reserva_para_decidir(p_reserva_id);
  if v_r.status<>'em_uso' then raise exception 'TRANSICAO_INVALIDA'; end if;
  update public.checkins set saida=now(),observacoes=coalesce(p_observacoes,observacoes) where reserva_id=v_r.id and saida is null;
  if not found then raise exception 'CHECKIN_NAO_ENCONTRADO'; end if;
  update public.reservas set status='concluida' where id=v_r.id;
  perform public._auditar('fazer_checkout','reservas',v_r.id,jsonb_build_object('status','em_uso'),jsonb_build_object('status','concluida'));
  return jsonb_build_object('id',v_r.id,'status','concluida');
end $$;
create function public.marcar_no_show(p_reserva_id uuid,p_motivo text default 'Ausência após a tolerância de check-in.') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas;
begin
  v_r:=public._reserva_para_decidir(p_reserva_id);
  if v_r.status<>'aprovada' then raise exception 'TRANSICAO_INVALIDA'; end if;
  if now()<v_r.inicio+make_interval(mins=>public._config_num('noshow_tolerancia_minutos')::int) or exists(select 1 from public.checkins where reserva_id=v_r.id) then raise exception 'NOSHOW_NAO_PERMITIDO'; end if;
  if nullif(trim(p_motivo),'') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  update public.reservas set status='no_show',motivo=p_motivo,decidido_por=auth.uid(),decidido_em=now() where id=v_r.id;
  perform public._auditar('marcar_no_show','reservas',v_r.id,jsonb_build_object('status','aprovada'),jsonb_build_object('status','no_show','motivo',p_motivo));
  perform public._notificar_reserva(v_r.id,'reserva_no_show',true,true);
  return jsonb_build_object('id',v_r.id,'status','no_show');
end $$;
create function public.marcar_notificacoes_lidas(p_ids uuid[] default null) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_usuario uuid:=public._exigir_ativo(); v_total integer;
begin
  update public.notificacoes set lida_em=now() where usuario_id=v_usuario and lida_em is null and (p_ids is null or id=any(p_ids));
  get diagnostics v_total=row_count; return v_total;
end $$;

create function public.consultar_disponibilidade(p_laboratorio_id uuid,p_inicio timestamptz,p_fim timestamptz) returns table(inicio timestamptz,fim timestamptz,escopo text,quantidades jsonb,bloqueado boolean) language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_ativo();
  if p_inicio is null or p_fim is null or p_fim<=p_inicio or p_fim-p_inicio>interval '93 days' then raise exception 'INTERVALO_INVALIDO'; end if;
  if not exists(select 1 from public.laboratorios l where l.id=p_laboratorio_id and (l.ativo or public.pode_gerir_lab(l.id))) then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  return query select greatest(r.inicio,p_inicio),least(r.fim,p_fim),r.escopo,public._itens_reserva(r.id),false from public.reservas r where r.laboratorio_id=p_laboratorio_id and r.status in ('aprovada','em_uso') and r.periodo&&tstzrange(p_inicio,p_fim,'[)')
  union all select greatest(b.inicio,p_inicio),least(b.fim,p_fim),'laboratorio'::text,'[]'::jsonb,true from public.bloqueios b where (b.laboratorio_id is null or b.laboratorio_id=p_laboratorio_id) and tstzrange(b.inicio,b.fim,'[)')&&tstzrange(p_inicio,p_fim,'[)') order by 1,2;
end $$;

create function public._revalidar_futuras(p_laboratorio_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas;
begin
  for v_r in select * from public.reservas where laboratorio_id=p_laboratorio_id and status in ('aprovada','em_uso') and fim>now() loop
    if v_r.inicio<=now() then
      -- Uma operação estrutural não pode mudar as regras de uma sessão em andamento.
      raise exception 'LABORATORIO_EM_USO';
    end if;
    perform public._validar_intervalo(v_r.laboratorio_id,v_r.inicio,v_r.fim,v_r.escopo,v_r.n_participantes,public._itens_reserva(v_r.id),false);
    perform public._conferir_conflitos(v_r.id);
  end loop;
end $$;
create function public._validar_chaves(p_dados jsonb,p_permitidas text[]) returns void language plpgsql immutable security definer set search_path = public, pg_temp as $$
begin
  if p_dados is null or jsonb_typeof(p_dados)<>'object' or exists(select 1 from jsonb_object_keys(p_dados) k where not(k=any(p_permitidas))) then raise exception 'ENTRADA_INVALIDA'; end if;
end $$;
create function public.salvar_laboratorio(p_dados jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_antes public.laboratorios; v_depois public.laboratorios;
begin
  perform public._exigir_admin(); perform public._lock_lab(v_id);
  perform public._validar_chaves(p_dados,array['nome','tipo','capacidade','localizacao','descricao','regras_de_uso','ativo','modo_reserva','granularidade_minutos','duracao_minima_minutos','duracao_maxima_minutos']);
  select * into v_antes from public.laboratorios where id=v_id for update;
  if p_id is not null and not found then raise exception 'REGISTRO_NAO_ENCONTRADO'; end if;
  v_depois:=jsonb_populate_record(case when p_id is null then row(v_id,null,null,null,null,'','',true,'slot_fixo',15,30,240,now(),now())::public.laboratorios else v_antes end,p_dados);
  insert into public.laboratorios(id,nome,tipo,capacidade,localizacao,descricao,regras_de_uso,ativo,modo_reserva,granularidade_minutos,duracao_minima_minutos,duracao_maxima_minutos)
  values(v_id,v_depois.nome,v_depois.tipo,v_depois.capacidade,v_depois.localizacao,v_depois.descricao,v_depois.regras_de_uso,v_depois.ativo,v_depois.modo_reserva,v_depois.granularidade_minutos,v_depois.duracao_minima_minutos,v_depois.duracao_maxima_minutos)
  on conflict(id) do update set nome=excluded.nome,tipo=excluded.tipo,capacidade=excluded.capacidade,localizacao=excluded.localizacao,descricao=excluded.descricao,regras_de_uso=excluded.regras_de_uso,ativo=excluded.ativo,modo_reserva=excluded.modo_reserva,granularidade_minutos=excluded.granularidade_minutos,duracao_minima_minutos=excluded.duracao_minima_minutos,duracao_maxima_minutos=excluded.duracao_maxima_minutos;
  if p_id is not null and (v_antes.capacidade,v_antes.ativo,v_antes.modo_reserva,v_antes.granularidade_minutos,v_antes.duracao_minima_minutos,v_antes.duracao_maxima_minutos) is distinct from (v_depois.capacidade,v_depois.ativo,v_depois.modo_reserva,v_depois.granularidade_minutos,v_depois.duracao_minima_minutos,v_depois.duracao_maxima_minutos) then perform public._revalidar_futuras(v_id); end if;
  perform public._auditar('salvar_laboratorio','laboratorios',v_id,to_jsonb(v_antes),to_jsonb(v_depois));
  return jsonb_build_object('id',v_id);
end $$;
create function public.salvar_equipamento(p_dados jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_antes public.equipamentos; v_depois public.equipamentos; v_lab uuid;
begin
  perform public._exigir_admin();
  perform public._validar_chaves(p_dados,array['laboratorio_id','nome','patrimonio','quantidade','status','reservavel_individualmente']);
  select * into v_antes from public.equipamentos where id=v_id;
  if p_id is not null and not found then raise exception 'REGISTRO_NAO_ENCONTRADO'; end if;
  v_depois:=jsonb_populate_record(case when p_id is null then row(v_id,null,null,null,1,'ativo',true,now(),now())::public.equipamentos else v_antes end,p_dados);
  if p_id is not null and v_depois.laboratorio_id is distinct from v_antes.laboratorio_id then raise exception 'LABORATORIO_IMUTAVEL'; end if;
  v_lab:=v_depois.laboratorio_id;
  if v_lab is null then raise exception 'ENTRADA_INVALIDA'; end if;
  perform public._lock_lab(v_lab);
  if p_id is not null then select * into strict v_antes from public.equipamentos where id=v_id for update; v_depois:=jsonb_populate_record(v_antes,p_dados); end if;
  insert into public.equipamentos(id,laboratorio_id,nome,patrimonio,quantidade,status,reservavel_individualmente) values(v_id,v_lab,v_depois.nome,v_depois.patrimonio,v_depois.quantidade,v_depois.status,v_depois.reservavel_individualmente)
  on conflict(id) do update set nome=excluded.nome,patrimonio=excluded.patrimonio,quantidade=excluded.quantidade,status=excluded.status,reservavel_individualmente=excluded.reservavel_individualmente;
  if p_id is not null and (v_antes.quantidade,v_antes.status,v_antes.reservavel_individualmente) is distinct from (v_depois.quantidade,v_depois.status,v_depois.reservavel_individualmente) then perform public._revalidar_futuras(v_lab); end if;
  perform public._auditar('salvar_equipamento','equipamentos',v_id,to_jsonb(v_antes),to_jsonb(v_depois));
  return jsonb_build_object('id',v_id);
end $$;
create function public.salvar_janela_horario(p_dados jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_antes public.janelas_horario; v_depois public.janelas_horario;
begin
  perform public._exigir_admin();
  perform public._validar_chaves(p_dados,array['laboratorio_id','dia_semana','inicio','fim','duracao_slot_minutos']);
  select * into v_antes from public.janelas_horario where id=v_id;
  if p_id is not null and not found then raise exception 'REGISTRO_NAO_ENCONTRADO'; end if;
  v_depois:=jsonb_populate_record(case when p_id is null then row(v_id,null,null,null,null,60,now(),now())::public.janelas_horario else v_antes end,p_dados);
  if v_depois.laboratorio_id is null or (p_id is not null and v_depois.laboratorio_id is distinct from v_antes.laboratorio_id) then raise exception 'LABORATORIO_IMUTAVEL'; end if;
  perform public._lock_lab(v_depois.laboratorio_id);
  if p_id is not null then select * into strict v_antes from public.janelas_horario where id=v_id for update; v_depois:=jsonb_populate_record(v_antes,p_dados); end if;
  if exists(select 1 from public.janelas_horario j where j.laboratorio_id=v_depois.laboratorio_id and j.dia_semana=v_depois.dia_semana and j.id<>v_id and j.inicio<v_depois.fim and j.fim>v_depois.inicio) then raise exception 'JANELAS_SOBREPOSTAS'; end if;
  insert into public.janelas_horario(id,laboratorio_id,dia_semana,inicio,fim,duracao_slot_minutos) values(v_id,v_depois.laboratorio_id,v_depois.dia_semana,v_depois.inicio,v_depois.fim,v_depois.duracao_slot_minutos)
  on conflict(id) do update set dia_semana=excluded.dia_semana,inicio=excluded.inicio,fim=excluded.fim,duracao_slot_minutos=excluded.duracao_slot_minutos;
  perform public._revalidar_futuras(v_depois.laboratorio_id);
  perform public._auditar('salvar_janela_horario','janelas_horario',v_id,to_jsonb(v_antes),to_jsonb(v_depois));
  return jsonb_build_object('id',v_id);
end $$;
create function public.remover_cadastro(p_entidade text,p_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lab uuid; v_antes jsonb;
begin
  perform public._exigir_admin();
  if p_entidade='laboratorios' then perform public.salvar_laboratorio('{"ativo":false}',p_id); return;
  elsif p_entidade='equipamentos' then perform public.salvar_equipamento('{"status":"inativo"}',p_id); return;
  elsif p_entidade='janelas_horario' then
    select laboratorio_id,to_jsonb(j) into v_lab,v_antes from public.janelas_horario j where id=p_id;
    if v_lab is null then raise exception 'REGISTRO_NAO_ENCONTRADO'; end if;
    perform public._lock_lab(v_lab); delete from public.janelas_horario where id=p_id; perform public._revalidar_futuras(v_lab);
  elsif p_entidade='bloqueios' then
    select laboratorio_id,to_jsonb(b) into v_lab,v_antes from public.bloqueios b where id=p_id;
    if v_antes is null then raise exception 'REGISTRO_NAO_ENCONTRADO'; end if;
    if v_lab is not null then perform public._lock_lab(v_lab); else perform public._lock_todos_labs(); end if;
    delete from public.bloqueios where id=p_id;
  else raise exception 'ENTIDADE_INVALIDA'; end if;
  perform public._auditar('remover_cadastro',p_entidade,p_id,v_antes,null);
end $$;
create function public._lock_todos_labs() returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('global-laboratorios',84219));
  for v_id in select id from public.laboratorios order by id loop perform public._lock_lab(v_id); end loop;
end $$;
create function public.reservas_afetadas_bloqueio(p_laboratorio_id uuid,p_inicio timestamptz,p_fim timestamptz) returns setof public.reservas language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_ativo();
  if (p_laboratorio_id is null and not public.tem_papel('admin')) or (p_laboratorio_id is not null and not public.pode_gerir_lab(p_laboratorio_id)) then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  if p_inicio is null or p_fim is null or p_fim<=p_inicio then raise exception 'INTERVALO_INVALIDO'; end if;
  return query select r.* from public.reservas r where (p_laboratorio_id is null or r.laboratorio_id=p_laboratorio_id) and r.status in ('aprovada','em_uso') and r.periodo&&tstzrange(p_inicio,p_fim,'[)') order by r.inicio;
end $$;
create function public.criar_bloqueio(p_laboratorio_id uuid,p_inicio timestamptz,p_fim timestamptz,p_motivo text,p_descricao text,p_cancelar_reservas boolean default false,p_motivo_cancelamento text default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_r public.reservas; v_afetadas uuid[]; v_total integer:=0;
begin
  perform public._exigir_ativo();
  if (p_laboratorio_id is null and not public.tem_papel('admin')) or (p_laboratorio_id is not null and not public.pode_gerir_lab(p_laboratorio_id)) then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  if p_inicio is null or p_fim is null or p_fim<=p_inicio or p_inicio<=now() then raise exception 'INTERVALO_INVALIDO'; end if;
  if p_laboratorio_id is null then perform public._lock_todos_labs(); else perform public._lock_lab(p_laboratorio_id); end if;
  select array_agg(r.id) into v_afetadas from public.reservas r where (p_laboratorio_id is null or r.laboratorio_id=p_laboratorio_id) and r.status in ('aprovada','em_uso') and r.periodo&&tstzrange(p_inicio,p_fim,'[)');
  if cardinality(v_afetadas)>0 and not coalesce(p_cancelar_reservas,false) then raise exception using message='BLOQUEIO_AFETA_RESERVAS',detail=to_jsonb(v_afetadas)::text; end if;
  if cardinality(v_afetadas)>0 and nullif(trim(p_motivo_cancelamento),'') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  for v_r in select * from public.reservas where id=any(v_afetadas) order by id for update loop
    if v_r.status='em_uso' then raise exception 'LABORATORIO_EM_USO'; end if;
    perform public.cancelar_reserva(v_r.id,p_motivo_cancelamento); v_total:=v_total+1;
  end loop;
  insert into public.bloqueios(laboratorio_id,inicio,fim,motivo,descricao) values(p_laboratorio_id,p_inicio,p_fim,p_motivo,p_descricao) returning id into v_id;
  perform public._auditar('criar_bloqueio','bloqueios',v_id,null,jsonb_build_object('laboratorio_id',p_laboratorio_id,'inicio',p_inicio,'fim',p_fim,'motivo',p_motivo,'reservas_canceladas',v_afetadas));
  return jsonb_build_object('id',v_id,'canceladas',v_total);
end $$;
create function public.atualizar_configuracao(p_chave text,p_valor jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_antes jsonb; v_id uuid; v_item text;
begin
  perform public._exigir_admin();
  if p_chave in ('cancelamento_prazo_horas','antecedencia_min_horas','antecedencia_max_dias','noshow_tolerancia_minutos','pendencia_lembrete_horas','pendencia_alerta_admin_horas','recorrencia_max_meses','login_max_falhas','login_bloqueio_minutos') then
    if p_valor is null or jsonb_typeof(p_valor)<>'number' or (p_valor #>> '{}')!~'^[0-9]+$' or (p_valor #>> '{}')::numeric>10000 or ((p_valor #>> '{}')::numeric=0 and p_chave not in ('cancelamento_prazo_horas','antecedencia_min_horas')) then raise exception 'CONFIGURACAO_INVALIDA'; end if;
    if p_chave='recorrencia_max_meses' and (p_valor #>> '{}')::int>24 then raise exception 'CONFIGURACAO_INVALIDA'; end if;
  elsif p_chave='dominios_email_permitidos' then
    if p_valor is null or jsonb_typeof(p_valor)<>'array' or jsonb_array_length(p_valor)>100 then raise exception 'CONFIGURACAO_INVALIDA'; end if;
    for v_item in select value from jsonb_array_elements_text(p_valor) loop if v_item !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$' then raise exception 'DOMINIO_INVALIDO'; end if; end loop;
  elsif p_chave='identidade_visual' then
    perform public._validar_chaves(p_valor,array['nome','cor','logo_url']);
    if not(p_valor ?& array['nome','cor','logo_url']) or (p_valor->>'cor')!~'^#[0-9A-Fa-f]{6}$' or char_length(p_valor->>'nome') not between 2 and 100 or (p_valor->>'logo_url'<>'' and p_valor->>'logo_url'!~'^https://') then raise exception 'CONFIGURACAO_INVALIDA'; end if;
  else raise exception 'CONFIGURACAO_INVALIDA'; end if;
  select id,valor into v_id,v_antes from public.configuracoes where chave=p_chave for update;
  if not found then raise exception 'CONFIGURACAO_INVALIDA'; end if;
  update public.configuracoes set valor=p_valor where id=v_id;
  perform public._auditar('atualizar_configuracao','configuracoes',v_id,v_antes,p_valor);
end $$;
create function public.registrar_ocorrencia(p_reserva_id uuid,p_tipo text,p_descricao text,p_gravidade text,p_anexos text[] default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas; v_id uuid; v_path text; v_admin uuid;
begin
  perform public._exigir_ativo(); select * into v_r from public.reservas where id=p_reserva_id;
  if not found or not public.pode_gerir_lab(v_r.laboratorio_id) then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  if v_r.status not in ('em_uso','concluida','no_show') then raise exception 'OCORRENCIA_NAO_PERMITIDA'; end if;
  if p_anexos is null or cardinality(p_anexos)>5 then raise exception 'ANEXOS_INVALIDOS'; end if;
  foreach v_path in array p_anexos loop
    if v_path !~ ('^'||v_r.laboratorio_id::text||'/'||v_r.id::text||'/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$') or not exists(select 1 from storage.objects o where o.bucket_id='ocorrencias' and o.name=v_path) then raise exception 'ANEXOS_INVALIDOS'; end if;
  end loop;
  insert into public.ocorrencias(reserva_id,laboratorio_id,monitor_id,tipo,descricao,gravidade,anexos) values(v_r.id,v_r.laboratorio_id,auth.uid(),p_tipo,p_descricao,p_gravidade,p_anexos) returning id into v_id;
  perform public._auditar('registrar_ocorrencia','ocorrencias',v_id,null,jsonb_build_object('reserva_id',v_r.id,'gravidade',p_gravidade));
  if p_gravidade='grave' then
    for v_admin in select ur.user_id from public.user_roles ur join public.profiles p on p.id=ur.user_id and p.ativo where ur.papel='admin' loop
      perform public.enfileirar_notificacao(v_admin,'ocorrencia_grave','ocorrencia_grave',jsonb_build_object('ocorrencia_id',v_id,'reserva_id',v_r.id,'descricao',p_descricao,'laboratorio_id',v_r.laboratorio_id),v_id::text||':ocorrencia_grave:'||v_admin::text);
    end loop;
  end if;
  return jsonb_build_object('id',v_id);
end $$;

create function public._validar_papeis(p_papeis text[]) returns void language plpgsql immutable security definer set search_path = public, pg_temp as $$
begin
  if p_papeis is null or cardinality(p_papeis)=0 or cardinality(p_papeis)>5 or exists(select 1 from unnest(p_papeis) p where p is null or p not in ('aluno','professor','funcionario','monitor','admin')) or cardinality(p_papeis)<>(select count(distinct p) from unnest(p_papeis) p) then raise exception 'PAPEIS_INVALIDOS'; end if;
end $$;
create function public.alterar_usuario_admin(p_usuario_id uuid,p_nome text,p_matricula text,p_ativo boolean,p_papeis text[],p_laboratorio_ids uuid[] default '{}') returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ator uuid:=public._exigir_admin(); v_antes public.profiles; v_papeis_antes jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('administradores',84219));
  perform public._validar_papeis(p_papeis);
  if p_ativo is null or p_laboratorio_ids is null or (cardinality(p_laboratorio_ids)>0 and not('monitor'=any(p_papeis))) then raise exception 'ENTRADA_INVALIDA'; end if;
  select * into v_antes from public.profiles where id=p_usuario_id for update;
  if not found then raise exception 'USUARIO_NAO_ENCONTRADO'; end if;
  select jsonb_agg(ur.papel) into v_papeis_antes from public.user_roles ur where ur.user_id=p_usuario_id;
  if p_usuario_id=v_ator and (not p_ativo or not('admin'=any(p_papeis))) then raise exception 'AUTO_DESATIVACAO_PROIBIDA'; end if;
  if (not p_ativo or not('admin'=any(p_papeis))) and exists(select 1 from public.user_roles where user_id=p_usuario_id and papel='admin') and not exists(select 1 from public.user_roles ur join public.profiles p on p.id=ur.user_id and p.ativo where ur.papel='admin' and ur.user_id<>p_usuario_id) then raise exception 'ULTIMO_ADMIN'; end if;
  update public.profiles set nome=p_nome,matricula=nullif(trim(p_matricula),''),ativo=p_ativo where id=p_usuario_id;
  delete from public.user_roles where user_id=p_usuario_id;
  insert into public.user_roles(user_id,papel) select p_usuario_id,x from unnest(p_papeis) x;
  delete from public.monitor_laboratorios where monitor_id=p_usuario_id;
  insert into public.monitor_laboratorios(monitor_id,laboratorio_id) select distinct p_usuario_id,x from unnest(p_laboratorio_ids) x;
  perform public._auditar('alterar_usuario_admin','profiles',p_usuario_id,jsonb_build_object('ativo',v_antes.ativo,'papeis',v_papeis_antes),jsonb_build_object('ativo',p_ativo,'papeis',p_papeis,'laboratorios',p_laboratorio_ids));
end $$;
create function public.provisionar_usuario(p_usuario_id uuid,p_nome text,p_email text,p_matricula text,p_papeis text[],p_ator_id uuid,p_token_hash text,p_app_url text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_dominios jsonb; v_notificacao uuid;
begin
  if not exists(select 1 from public.profiles p join public.user_roles ur on ur.user_id=p.id where p.id=p_ator_id and p.ativo and ur.papel='admin') then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  perform public._validar_papeis(p_papeis);
  if p_email is null or p_email<>lower(trim(p_email)) or p_email!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or p_token_hash is null or char_length(p_token_hash)<10 or p_app_url is null or p_app_url!~'^https?://' then raise exception 'ENTRADA_INVALIDA'; end if;
  select valor into v_dominios from public.configuracoes where chave='dominios_email_permitidos';
  if jsonb_array_length(v_dominios)>0 and not(v_dominios ? split_part(p_email,'@',2)) then raise exception 'DOMINIO_NAO_PERMITIDO'; end if;
  if not exists(select 1 from auth.users u where u.id=p_usuario_id and lower(u.email)=p_email) then raise exception 'USUARIO_AUTH_INVALIDO'; end if;
  insert into public.profiles(id,nome,email,matricula) values(p_usuario_id,p_nome,p_email,nullif(trim(p_matricula),''));
  insert into public.user_roles(user_id,papel) select p_usuario_id,x from unnest(p_papeis) x;
  perform public._auditar('provisionar_usuario','profiles',p_usuario_id,null,jsonb_build_object('papeis',p_papeis),p_ator_id);
  v_notificacao:=public.enfileirar_notificacao(p_usuario_id,'convite','convite',jsonb_build_object('url',rtrim(p_app_url,'/')||'/auth/confirm?token_hash='||p_token_hash||'&type=invite'),p_usuario_id::text||':convite:'||p_token_hash);
  return p_usuario_id;
end $$;
create function public.enfileirar_recuperacao(p_usuario_id uuid,p_email text,p_token_hash text,p_app_url text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.profiles p where p.id=p_usuario_id and p.ativo and p.email=lower(p_email)) then return null; end if;
  if p_token_hash is null or char_length(p_token_hash)<10 or p_app_url is null or p_app_url!~'^https?://' then raise exception 'ENTRADA_INVALIDA'; end if;
  return public.enfileirar_notificacao(p_usuario_id,'recuperacao','recuperacao',jsonb_build_object('url',rtrim(p_app_url,'/')||'/auth/confirm?token_hash='||p_token_hash||'&type=recovery'),p_usuario_id::text||':recuperacao:'||p_token_hash);
end $$;
create function public.registrar_login_admin(p_usuario_id uuid,p_ip inet default null,p_user_agent text default null) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.profiles p join public.user_roles ur on ur.user_id=p.id where p.id=p_usuario_id and p.ativo and ur.papel='admin') then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  insert into public.audit_log(ator_id,acao,entidade,entidade_id,ip,user_agent) values(p_usuario_id,'login_admin','profiles',p_usuario_id,p_ip,left(p_user_agent,500));
end $$;

create function public.reclamar_notificacoes(p_limite integer default 25) returns setof public.notificacoes language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_limite not between 1 and 100 then raise exception 'LIMITE_INVALIDO'; end if;
  update public.notificacoes set status='pendente',proxima_tentativa_em=now(),erro='worker_interrompido' where status='enviando' and updated_at<now()-interval '10 minutes';
  -- A central mantém o evento mesmo quando a entrega por e-mail foi dispensada.
  update public.notificacoes n set status='falhou',envio_dispensado=true,proxima_tentativa_em=null,
    erro=case when p.email_suprimido or exists(select 1 from public.supressoes_email s where s.email=n.destinatario_email) then 'email_suprimido' when not p.ativo then 'conta_desativada' else 'envio_dispensado_preferencia' end
  from public.profiles p where p.id=n.usuario_id and n.status='pendente' and
    (not p.ativo or p.email_suprimido or exists(select 1 from public.supressoes_email s where s.email=n.destinatario_email) or (not n.essencial and
      (case when n.tipo_evento in ('lembrete_reserva','lembrete_24h','lembrete_1h') then p.preferencias_notificacao->'lembretes'='false'::jsonb else p.preferencias_notificacao->'outros'='false'::jsonb end)));
  return query with escolhidas as (
    select n.id from public.notificacoes n where n.status='pendente' and n.tentativas<5 and n.proxima_tentativa_em<=now() order by n.proxima_tentativa_em,n.created_at,n.id for update skip locked limit p_limite
  ) update public.notificacoes n set status='enviando',erro=null from escolhidas e where n.id=e.id returning n.*;
end $$;
create function public.concluir_notificacao(p_id uuid,p_sucesso boolean,p_erro text default null) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n public.notificacoes; v_tentativas integer; v_minutos integer;
begin
  select * into v_n from public.notificacoes where id=p_id for update;
  if not found or v_n.status<>'enviando' then raise exception 'NOTIFICACAO_NAO_RECLAMADA'; end if;
  if p_sucesso then
    update public.notificacoes set status='enviada',enviada_em=now(),erro=null,proxima_tentativa_em=null where id=p_id;
  else
    v_tentativas:=v_n.tentativas+1;
    v_minutos:=case v_tentativas when 1 then 1 when 2 then 5 when 3 then 15 else 60 end;
    update public.notificacoes set tentativas=v_tentativas,status=case when v_tentativas>=5 then 'falhou' else 'pendente' end,
      proxima_tentativa_em=case when v_tentativas>=5 then null else now()+make_interval(mins=>v_minutos) end,erro=left(coalesce(p_erro,'falha_provedor'),1000) where id=p_id;
  end if;
end $$;
create function public.suprimir_email(p_email text,p_evento text,p_chave_idempotencia text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text:=lower(trim(p_email));
begin
  if p_evento not in ('email.bounced','email.complained','bounce','complaint') or p_email is null or p_chave_idempotencia is null then raise exception 'EVENTO_INVALIDO'; end if;
  insert into public.supressoes_email(email,motivo,chave_idempotencia) values(v_email,p_evento,p_chave_idempotencia) on conflict do nothing;
  update public.profiles set email_suprimido=true where email=v_email;
  update public.notificacoes set status='falhou',erro='email_suprimido',envio_dispensado=true,proxima_tentativa_em=null where destinatario_email=v_email and status in ('pendente','enviando');
end $$;

create function public.processar_rotinas() returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservas; v_dest uuid; v_janela text; v_tolerancia integer:=public._config_num('noshow_tolerancia_minutos');
begin
  for v_r in select * from public.reservas where (status='pendente' and inicio<=now()) or (status='aprovada' and inicio+make_interval(mins=>v_tolerancia)<=now()) order by laboratorio_id,id loop
    perform public._lock_lab(v_r.laboratorio_id);
    select * into strict v_r from public.reservas where id=v_r.id for update;
    if v_r.status='pendente' and v_r.inicio<=now() then
      update public.reservas set status='cancelada',motivo='expirada',decidido_em=now(),decidido_por=null where id=v_r.id;
      perform public._auditar('expirar_pendente','reservas',v_r.id,jsonb_build_object('status','pendente'),jsonb_build_object('status','cancelada','motivo','expirada'),null);
      perform public._notificar_reserva(v_r.id,'reserva_cancelada',true,true);
    elsif v_r.status='aprovada' and v_r.inicio+make_interval(mins=>v_tolerancia)<=now() and not exists(select 1 from public.checkins c where c.reserva_id=v_r.id) then
      update public.reservas set status='no_show',motivo='Ausência após a tolerância de check-in.',decidido_em=now(),decidido_por=null where id=v_r.id;
      perform public._auditar('no_show_automatico','reservas',v_r.id,jsonb_build_object('status','aprovada'),jsonb_build_object('status','no_show'),null);
      perform public._notificar_reserva(v_r.id,'reserva_no_show',true,true);
    end if;
  end loop;
  for v_r in select * from public.reservas where status='aprovada' and inicio>now() and inicio<=now()+interval '24 hours' loop
    if v_r.inicio>now()+interval '23 hours' then
      perform public.enfileirar_notificacao(v_r.solicitante_id,'lembrete_reserva','lembrete_reserva',jsonb_build_object('reserva_id',v_r.id,'inicio',v_r.inicio,'fim',v_r.fim,'antecedencia','24h'),v_r.id::text||':lembrete_24h:'||v_r.solicitante_id::text);
    end if;
    if v_r.inicio<=now()+interval '1 hour' then
      perform public.enfileirar_notificacao(v_r.solicitante_id,'lembrete_reserva','lembrete_reserva',jsonb_build_object('reserva_id',v_r.id,'inicio',v_r.inicio,'fim',v_r.fim,'antecedencia','1h'),v_r.id::text||':lembrete_1h:'||v_r.solicitante_id::text);
    end if;
  end loop;
  for v_r in select * from public.reservas where status='pendente' and inicio>now() and created_at<=now()-make_interval(secs=>(public._config_num('pendencia_lembrete_horas')*3600)::int) loop
    perform public._notificar_reserva(v_r.id,'pendencia_monitor',false,true);
    if v_r.created_at<=now()-make_interval(secs=>(public._config_num('pendencia_alerta_admin_horas')*3600)::int) then
      for v_dest in select ur.user_id from public.user_roles ur join public.profiles p on p.id=ur.user_id and p.ativo where ur.papel='admin' loop
        perform public.enfileirar_notificacao(v_dest,'pendencia_admin','pendencia_admin',jsonb_build_object('reserva_id',v_r.id,'inicio',v_r.inicio,'created_at',v_r.created_at),v_r.id::text||':pendencia_admin:'||v_dest::text);
      end loop;
    end if;
  end loop;
  delete from public.rate_limits where updated_at<now()-interval '7 days' and coalesce(bloqueado_ate,'-infinity'::timestamptz)<now();
end $$;
create function public._invocar_worker_notificacoes() returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_url text; v_segredo text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='project_url' limit 1;
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name='notification_worker_secret' limit 1;
  if v_url is null or v_segredo is null then return; end if;
  perform net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/processar-notificacoes',headers:=jsonb_build_object('Content-Type','application/json','x-worker-secret',v_segredo),body:='{}'::jsonb,timeout_milliseconds:=10000);
end $$;
select cron.schedule('reservas-rotinas','* * * * *','select public.processar_rotinas()');
select cron.schedule('notificacoes-worker','* * * * *','select public._invocar_worker_notificacoes()');

create function public.obter_relatorios(p_inicio timestamptz,p_fim timestamptz,p_laboratorio_id uuid default null) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_resultado jsonb;
begin
  perform public._exigir_admin();
  if p_inicio is null or p_fim is null or p_fim<=p_inicio or p_fim-p_inicio>interval '366 days' then raise exception 'INTERVALO_INVALIDO'; end if;
  select jsonb_build_object(
    'por_laboratorio',coalesce((select jsonb_agg(x) from(select l.id,l.nome,count(r.id)::int as total,count(r.id) filter(where r.status in ('aprovada','em_uso','concluida'))::int as aprovadas,count(r.id) filter(where r.status='pendente')::int as pendentes,count(r.id) filter(where r.status='no_show')::int as no_shows,coalesce(sum(extract(epoch from least(r.fim,p_fim)-greatest(r.inicio,p_inicio))/3600) filter(where r.status in ('aprovada','em_uso','concluida') and r.escopo='laboratorio'),0) as horas_ocupadas from public.laboratorios l left join public.reservas r on r.laboratorio_id=l.id and r.periodo&&tstzrange(p_inicio,p_fim,'[)') where p_laboratorio_id is null or l.id=p_laboratorio_id group by l.id,l.nome order by l.nome) x),'[]'::jsonb),
    'por_papel',coalesce((select jsonb_agg(x) from(select r.papel_solicitante as papel,count(*)::int as total from public.reservas r where r.periodo&&tstzrange(p_inicio,p_fim,'[)') and (p_laboratorio_id is null or r.laboratorio_id=p_laboratorio_id) group by r.papel_solicitante order by r.papel_solicitante) x),'[]'::jsonb),
    'ocorrencias',coalesce((select jsonb_agg(x) from(select o.tipo,o.gravidade,count(*)::int as total from public.ocorrencias o where o.created_at>=p_inicio and o.created_at<p_fim and (p_laboratorio_id is null or o.laboratorio_id=p_laboratorio_id) group by o.tipo,o.gravidade) x),'[]'::jsonb)
  ) into v_resultado;
  return v_resultado;
end $$;
create function public.registrar_exportacao(p_formato text,p_filtros jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_admin();
  if p_formato not in ('csv','pdf','json') or jsonb_typeof(p_filtros)<>'object' then raise exception 'ENTRADA_INVALIDA'; end if;
  perform public._auditar('exportar_relatorio','relatorios',null,null,jsonb_build_object('formato',p_formato,'filtros',p_filtros));
end $$;
create function public.exportar_dados_usuario(p_usuario_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_usuario uuid:=coalesce(p_usuario_id,public._exigir_ativo()); v_dados jsonb;
begin
  perform public._exigir_ativo();
  if v_usuario<>auth.uid() and not public.tem_papel('admin') then raise exception using errcode='42501',message='ACESSO_NEGADO'; end if;
  select jsonb_build_object('perfil',to_jsonb(p)-'email_suprimido','papeis',(select coalesce(jsonb_agg(ur.papel),'[]') from public.user_roles ur where ur.user_id=v_usuario),'reservas',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.reservas r where r.solicitante_id=v_usuario),'notificacoes',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'tipo_evento',n.tipo_evento,'created_at',n.created_at,'lida_em',n.lida_em)),'[]') from public.notificacoes n where n.usuario_id=v_usuario)) into v_dados from public.profiles p where p.id=v_usuario;
  perform public._auditar('exportar_dados_usuario','profiles',v_usuario,null,jsonb_build_object('formato','json'));
  return v_dados;
end $$;
create function public.anonimizar_usuario(p_usuario_id uuid,p_motivo text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_admin();
  if nullif(trim(p_motivo),'') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  perform public.alterar_usuario_admin(p_usuario_id,'Usuário anonimizado',null,false,array['aluno'],'{}');
  update public.profiles set email='anonimizado+'||id::text||'@anon.invalid',email_suprimido=true,preferencias_notificacao='{}' where id=p_usuario_id;
  update public.notificacoes set payload=jsonb_build_object('anonimizada',true),destinatario_email='anonimizado@anon.invalid',status=case when status in ('pendente','enviando') then 'falhou' else status end,envio_dispensado=true,erro=case when status in ('pendente','enviando') then 'perfil_anonimizado' else erro end where usuario_id=p_usuario_id;
  perform public._auditar('anonimizar_usuario','profiles',p_usuario_id,null,jsonb_build_object('motivo',p_motivo));
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ocorrencias','ocorrencias',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
create function public._storage_path_permitido(p_nome text) returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lab uuid; v_reserva uuid;
begin
  if not public._ativo() or p_nome!~'^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$' then return false; end if;
  v_lab:=split_part(p_nome,'/',1)::uuid; v_reserva:=split_part(p_nome,'/',2)::uuid;
  return public.pode_gerir_lab(v_lab) and exists(select 1 from public.reservas r where r.id=v_reserva and r.laboratorio_id=v_lab);
exception when invalid_text_representation then return false;
end $$;
create policy ocorrencias_storage_leitura on storage.objects for select to authenticated using(bucket_id='ocorrencias' and public._storage_path_permitido(name));
-- Upload somente pelo servidor, depois de detectar o tipo pelo conteúdo e autorizar o lab.
-- Sem INSERT/UPDATE/DELETE para authenticated: MIME fornecido pelo browser não é prova.

-- Privilégios explícitos: helpers internos e rotinas de sistema não são APIs públicas.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public._ativo(),public.tem_papel(text),public.monitora_lab(uuid),public.pode_gerir_lab(uuid),public._perfil_visivel(uuid),public._reserva_visivel(uuid),public._storage_path_permitido(text) to authenticated;
grant execute on function public.solicitar_reserva(uuid,timestamptz,timestamptz,text,text,integer,jsonb,text,jsonb),public.aprovar_reserva(uuid,text),public.aprovar_serie(uuid,text),public.recusar_reserva(uuid,text),public.substituir_reserva(uuid,uuid,text),public.cancelar_reserva(uuid,text),public.fazer_checkin(uuid,text),public.fazer_checkout(uuid,text),public.marcar_no_show(uuid,text),public.marcar_notificacoes_lidas(uuid[]),public.consultar_disponibilidade(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.salvar_laboratorio(jsonb,uuid),public.salvar_equipamento(jsonb,uuid),public.salvar_janela_horario(jsonb,uuid),public.remover_cadastro(text,uuid),public.reservas_afetadas_bloqueio(uuid,timestamptz,timestamptz),public.criar_bloqueio(uuid,timestamptz,timestamptz,text,text,boolean,text),public.atualizar_configuracao(text,jsonb),public.registrar_ocorrencia(uuid,text,text,text,text[]),public.alterar_usuario_admin(uuid,text,text,boolean,text[],uuid[]),public.obter_relatorios(timestamptz,timestamptz,uuid),public.registrar_exportacao(text,jsonb),public.exportar_dados_usuario(uuid),public.anonimizar_usuario(uuid,text) to authenticated;
grant execute on function public.consumir_rate_limit(text,integer,integer),public.verificar_bloqueio_login(text),public.registrar_resultado_login(text,boolean),public.provisionar_usuario(uuid,text,text,text,text[],uuid,text,text),public.enfileirar_recuperacao(uuid,text,text,text),public.registrar_login_admin(uuid,inet,text),public.enfileirar_notificacao(uuid,text,text,jsonb,text),public.reclamar_notificacoes(integer),public.concluir_notificacao(uuid,boolean,text),public.suprimir_email(text,text,text) to service_role;
revoke insert,update,delete,truncate on public.audit_log from service_role;
