-- O primeiro administrador ainda não dispõe de um ator para provisionar_usuario.
-- Esta operação excepcional exige service_role e só pode ocorrer uma vez.
create function public.inicializar_administrador(
  p_usuario_id uuid,
  p_nome text,
  p_email text,
  p_matricula text,
  p_token_hash text,
  p_app_url text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(p_email));
  v_nome text := trim(p_nome);
  v_origem text := rtrim(p_app_url, '/');
  v_dominios jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('bootstrap-administrador', 84219));
  -- Não reabrir o bootstrap quando uma conta administrativa for desativada.
  if exists(select 1 from public.user_roles where papel = 'admin') then
    raise exception using errcode = '42501', message = 'BOOTSTRAP_JA_REALIZADO';
  end if;
  if p_usuario_id is null or v_nome is null or char_length(v_nome) not between 2 and 150
    or v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or p_token_hash is null or char_length(p_token_hash) not between 20 and 512
    or (p_matricula is not null and char_length(p_matricula) > 100)
    or v_origem is null or char_length(v_origem) > 500
    or v_origem !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$|^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$'
  then
    raise exception 'ENTRADA_INVALIDA';
  end if;
  select valor into v_dominios from public.configuracoes where chave = 'dominios_email_permitidos';
  if jsonb_array_length(v_dominios) > 0 and not(v_dominios ? split_part(v_email, '@', 2)) then
    raise exception 'DOMINIO_NAO_PERMITIDO';
  end if;
  if not exists(select 1 from auth.users where id = p_usuario_id and lower(email) = v_email) then
    raise exception 'USUARIO_AUTH_INVALIDO';
  end if;
  if exists(select 1 from public.profiles where id = p_usuario_id or email = v_email) then
    raise exception 'PERFIL_JA_EXISTENTE';
  end if;
  insert into public.profiles(id, nome, email, matricula)
    values(p_usuario_id, v_nome, v_email, nullif(trim(p_matricula), ''));
  insert into public.user_roles(user_id, papel) values(p_usuario_id, 'admin');
  perform public._auditar(
    'inicializar_administrador', 'profiles', p_usuario_id, null,
    jsonb_build_object('papeis', array['admin'], 'bootstrap', true), p_usuario_id
  );
  perform public.enfileirar_notificacao(
    p_usuario_id, 'convite', 'convite',
    jsonb_build_object('url', v_origem || '/auth/confirm?token_hash=' || p_token_hash || '&type=invite'),
    p_usuario_id::text || ':convite:' || p_token_hash
  );
  return p_usuario_id;
end;
$$;

revoke execute on function public.inicializar_administrador(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.inicializar_administrador(uuid,text,text,text,text,text) to service_role;
