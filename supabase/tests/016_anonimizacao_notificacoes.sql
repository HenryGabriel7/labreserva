begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('b6000000-0000-4000-8000-000000000001', 'anon-pessoa@example.test'),
  ('b6000000-0000-4000-8000-000000000002', 'anon-admin@example.test'),
  ('b6000000-0000-4000-8000-000000000003', 'anon-terceiro@example.test');
insert into public.profiles(id, nome, email)
select id, 'Perfil de teste', email from auth.users where id::text like 'b6000000-%';
insert into auth.sessions(id, user_id, created_at, updated_at, not_after)
select id, id, now(), now(), now() + interval '1 day' from public.profiles where id::text like 'b6000000-%';
insert into public.user_roles(user_id, papel) values
  ('b6000000-0000-4000-8000-000000000001', 'aluno'),
  ('b6000000-0000-4000-8000-000000000002', 'admin'),
  ('b6000000-0000-4000-8000-000000000003', 'aluno');

insert into public.notificacoes(id, usuario_id, tipo_evento, template, payload, destinatario_email,
  chave_idempotencia, status, tentativas, mensagem_email, mensagem_preparada_em,
  provedor_id, erro, enviada_em)
select ('b6010000-0000-4000-8000-00000000000' || i)::uuid,
  case when i = 5 then 'b6000000-0000-4000-8000-000000000003'::uuid
    else 'b6000000-0000-4000-8000-000000000001'::uuid end,
  'recuperacao', 'recuperacao', '{"url":"https://app.test/auth/confirm?token_hash=token-ficticio"}',
  'anon-pessoa@example.test', 'anon:fixture:token-ficticio:' || i, estado, i - 1,
  '{"html":"Envelope com token-ficticio","para":"anon-pessoa@example.test"}', now(),
  case when i in (2, 3, 4) then 'provedor-privado-' || i end,
  case when i = 3 then 'Detalhe de falha para anon-pessoa@example.test' end,
  case when i = 2 then now() end
from (values (1,'pendente'), (2,'enviada'), (3,'falhou'), (4,'enviando'), (5,'pendente')) as fixture(i, estado);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', auth.uid(), 'role', 'authenticated', 'session_id', auth.uid())::text, true);
select throws_ok($$select public.anonimizar_usuario('b6000000-0000-4000-8000-000000000001', 'Finalidade encerrada')$$,
  '42501', 'ACESSO_NEGADO', 'somente admin anonimiza');
select set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', auth.uid(), 'role', 'authenticated', 'session_id', auth.uid())::text, true);
select lives_ok($$select public.anonimizar_usuario('b6000000-0000-4000-8000-000000000001', 'Finalidade encerrada')$$,
  'anonimização remove envelopes na mesma transação');
select lives_ok($$select public.anonimizar_usuario('b6000000-0000-4000-8000-000000000001', 'Repetição de teste')$$,
  'repetição aceita sem recriar conteúdo nem duplicar a operação');
reset role;

select is((select count(*)::integer from public.notificacoes
  where usuario_id = 'b6000000-0000-4000-8000-000000000001'
  and destinatario_email = 'anonimizado@anon.invalid' and payload = '{"anonimizada":true}'
  and mensagem_email is null and mensagem_preparada_em is null and provedor_id is null
  and proxima_tentativa_em is null and chave_idempotencia ~ '^anonimizada:[a-f0-9]{64}$'),
  4, 'pendente, enviada, falha e reclamada perdem todos os campos derivados privados');
select ok((select status = 'enviada' and enviada_em = now() and tentativas = 1 and erro is null
  from public.notificacoes where id = 'b6010000-0000-4000-8000-000000000002'),
  'entrega anterior conserva estado, tentativas e aceite');
select is((select count(*)::integer from public.notificacoes
  where id::text like 'b6010000-%' and status = 'falhou' and envio_dispensado
  and erro = 'perfil_anonimizado'), 3, 'demais linhas são encerradas com código fixo');
select ok((select status = 'pendente' and mensagem_email is not null
  from public.notificacoes where id = 'b6010000-0000-4000-8000-000000000005'),
  'notificação de outro perfil não é alterada');
select is((select count(*)::integer from public.audit_log
  where entidade_id = 'b6000000-0000-4000-8000-000000000001' and acao = 'anonimizar_usuario'),
  1, 'repetição não duplica a entrada de anonimização');
select ok((select antes is null and depois = '{"motivo":"Finalidade encerrada"}'
  from public.audit_log where entidade_id = 'b6000000-0000-4000-8000-000000000001' and acao = 'anonimizar_usuario'),
  'auditoria retém o motivo sem snapshot de e-mail');

set local role service_role;
select throws_ok($$select public.preparar_entrega_notificacao('b6010000-0000-4000-8000-000000000004', null)$$,
  'P0001', 'NOTIFICACAO_NAO_RECLAMADA', 'worker já com lote não pode consultar o envelope redigido');
select throws_ok($$select public.preparar_entrega_notificacao('b6010000-0000-4000-8000-000000000004', '{"html":"envelope antigo"}')$$,
  'P0001', 'NOTIFICACAO_NAO_RECLAMADA', 'worker já com lote não pode restaurar snapshot');
select throws_ok($$select public.registrar_entrega_notificacao('b6010000-0000-4000-8000-000000000004', 'resposta-tardia')$$,
  'P0001', 'NOTIFICACAO_NAO_RECLAMADA', 'resposta tardia do provedor não restaura o identificador');
select throws_ok($$select public.concluir_notificacao('b6010000-0000-4000-8000-000000000004', true)$$,
  'P0001', 'NOTIFICACAO_NAO_RECLAMADA', 'resposta tardia não reabre fila nem altera o estado');
select is(public.enfileirar_notificacao('b6000000-0000-4000-8000-000000000001', 'recuperacao', 'recuperacao',
  '{"privado":"token-ficticio"}', 'anon:fixture:token-ficticio:1'),
  'b6010000-0000-4000-8000-000000000001'::uuid, 'novo pedido com a chave anterior preserva idempotência');
select public.enfileirar_notificacao('b6000000-0000-4000-8000-000000000001', 'recuperacao', 'recuperacao',
  '{"privado":"token-ficticio"}', 'anon:fixture:token-ficticio:nova');
select is((select count(*)::integer from public.reclamar_notificacoes(100)
  where usuario_id = 'b6000000-0000-4000-8000-000000000001'), 0,
  'eventos concorrentes de perfil anonimizado nunca são reclamados para envio');
reset role;

select is((select count(*)::integer from public.notificacoes
  where usuario_id = 'b6000000-0000-4000-8000-000000000001'), 5, 'nenhuma linha histórica é apagada');
select ok(not exists(select 1 from public.notificacoes where usuario_id = 'b6000000-0000-4000-8000-000000000001'
  and (payload <> '{"anonimizada":true}' or destinatario_email <> 'anonimizado@anon.invalid'
    or mensagem_email is not null or chave_idempotencia like '%token-ficticio%')),
  'novo enfileiramento também evita dados privados');

select * from finish();
rollback;
