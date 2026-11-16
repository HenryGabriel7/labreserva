create or replace function public.anonimizar_usuario(p_usuario_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_ativo boolean;
  v_anonimizado boolean;
  v_linhas integer;
  v_payload constant jsonb := '{"anonimizada":true}';
  v_destinatario constant text := 'anonimizado@anon.invalid';
begin
  perform public._exigir_admin();
  if nullif(trim(p_motivo), '') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;

  -- Mesma ordem de locks usada na alteração administrativa do perfil.
  perform pg_advisory_xact_lock(hashtextextended('administradores', 84219));
  select email, ativo into v_email, v_ativo from public.profiles where id = p_usuario_id for update;
  if not found then raise exception 'USUARIO_NAO_ENCONTRADO'; end if;
  v_anonimizado := not v_ativo and v_email = 'anonimizado+' || p_usuario_id::text || '@anon.invalid';

  if not v_anonimizado then
    perform public.alterar_usuario_admin(p_usuario_id, 'Usuário anonimizado', null, false, array['aluno'], '{}');
    update public.profiles set email = 'anonimizado+' || id::text || '@anon.invalid',
      email_suprimido = true, preferencias_notificacao = '{}' where id = p_usuario_id;
  end if;

  -- Mantém IDs, datas e estados finais. Chaves de convite/recuperação podem conter tokens.
  update public.notificacoes set
    payload = v_payload, destinatario_email = v_destinatario,
    mensagem_email = null, mensagem_preparada_em = null, provedor_id = null,
    proxima_tentativa_em = null, envio_dispensado = true,
    chave_idempotencia = case when chave_idempotencia ~ '^anonimizada:[0-9a-f]{64}$' then chave_idempotencia
      else 'anonimizada:' || encode(sha256(convert_to(chave_idempotencia, 'UTF8')), 'hex') end,
    status = case when status in ('pendente', 'enviando') then 'falhou' else status end,
    erro = case when status = 'enviada' then null else 'perfil_anonimizado' end
  where usuario_id = p_usuario_id and (
    payload is distinct from v_payload or destinatario_email is distinct from v_destinatario
    or mensagem_email is not null or mensagem_preparada_em is not null or provedor_id is not null
    or proxima_tentativa_em is not null or not envio_dispensado or status in ('pendente', 'enviando')
    or chave_idempotencia !~ '^anonimizada:[0-9a-f]{64}$'
    or erro is distinct from case when status = 'enviada' then null else 'perfil_anonimizado' end
  );
  get diagnostics v_linhas = row_count;

  if not v_anonimizado or v_linhas > 0 then
    perform public._auditar('anonimizar_usuario', 'profiles', p_usuario_id, null, jsonb_build_object('motivo', p_motivo));
  end if;
end $$;

create or replace function public.enfileirar_notificacao(
  p_usuario_id uuid, p_tipo_evento text, p_template text, p_payload jsonb, p_chave_idempotencia text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_perfil public.profiles;
  v_essencial boolean;
  v_chave text := p_chave_idempotencia;
begin
  -- Concorre com o lock do perfil na anonimização, sem serializar outros produtores.
  select * into strict v_perfil from public.profiles where id = p_usuario_id for share;
  v_essencial := p_tipo_evento in ('reserva_aprovada', 'reserva_recusada', 'reserva_substituida',
    'reserva_cancelada', 'convite', 'recuperacao', 'seguranca_conta');
  if not v_perfil.ativo and v_perfil.email = 'anonimizado+' || p_usuario_id::text || '@anon.invalid' then
    v_chave := 'anonimizada:' || encode(sha256(convert_to(v_chave, 'UTF8')), 'hex');
    insert into public.notificacoes(usuario_id, tipo_evento, template, payload, destinatario_email,
      essencial, chave_idempotencia, status, erro, envio_dispensado, proxima_tentativa_em)
    values(p_usuario_id, p_tipo_evento, p_template, '{"anonimizada":true}', 'anonimizado@anon.invalid',
      v_essencial, v_chave, 'falhou', 'perfil_anonimizado', true, null)
    on conflict(chave_idempotencia) do nothing returning id into v_id;
  else
    insert into public.notificacoes(usuario_id, tipo_evento, template, payload, destinatario_email, essencial, chave_idempotencia)
    values(p_usuario_id, p_tipo_evento, p_template,
      coalesce(p_payload, '{}') || jsonb_build_object('usuario_nome', v_perfil.nome, 'email', v_perfil.email),
      v_perfil.email, v_essencial, v_chave)
    on conflict(chave_idempotencia) do nothing returning id into v_id;
  end if;
  if v_id is null then select id into v_id from public.notificacoes where chave_idempotencia = v_chave; end if;
  return v_id;
end $$;

create or replace function public.preparar_entrega_notificacao(p_id uuid, p_mensagem jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n public.notificacoes;
begin
  -- O worker também chama para retries, usando null para ler o envelope persistido.
  select * into v_n from public.notificacoes where id = p_id for update;
  if not found or v_n.status <> 'enviando' or v_n.envio_dispensado then
    raise exception 'NOTIFICACAO_NAO_RECLAMADA';
  end if;
  if v_n.mensagem_email is not null then return v_n.mensagem_email; end if;
  if p_mensagem is null or jsonb_typeof(p_mensagem) <> 'object'
    or not(p_mensagem ?& array['remetente','para','assunto','html','texto','chaveIdempotencia'])
    or p_mensagem-'remetente'-'para'-'assunto'-'html'-'texto'-'chaveIdempotencia'-'descadastroUrl' <> '{}'::jsonb
    or exists(select 1 from jsonb_each(p_mensagem) e where jsonb_typeof(e.value) <> 'string')
    or p_mensagem->>'para' <> v_n.destinatario_email or p_mensagem->>'chaveIdempotencia' <> v_n.chave_idempotencia
    or octet_length(p_mensagem::text) > 1048576 then raise exception 'MENSAGEM_INVALIDA'; end if;
  update public.notificacoes set mensagem_email = p_mensagem, mensagem_preparada_em = now() where id = p_id;
  return p_mensagem;
end $$;

create or replace function public.registrar_entrega_notificacao(p_id uuid, p_provedor_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_provedor_id is null or char_length(p_provedor_id) not between 1 and 200 then raise exception 'PROVEDOR_ID_INVALIDO'; end if;
  update public.notificacoes set provedor_id = p_provedor_id
  where id = p_id and status in ('enviando', 'falhou') and destinatario_email <> 'anonimizado@anon.invalid';
  if not found then raise exception 'NOTIFICACAO_NAO_RECLAMADA'; end if;
end $$;

revoke execute on function public.anonimizar_usuario(uuid, text) from public, anon, service_role;
grant execute on function public.anonimizar_usuario(uuid, text) to authenticated;
revoke execute on function public.enfileirar_notificacao(uuid, text, text, jsonb, text),
  public.preparar_entrega_notificacao(uuid, jsonb), public.registrar_entrega_notificacao(uuid, text)
  from public, anon, authenticated;
grant execute on function public.enfileirar_notificacao(uuid, text, text, jsonb, text),
  public.preparar_entrega_notificacao(uuid, jsonb), public.registrar_entrega_notificacao(uuid, text)
  to service_role;
