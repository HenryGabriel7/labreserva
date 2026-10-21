begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001', 'hardening-aluno@teste.edu.br', '{}'),
  ('a1000000-0000-4000-8000-000000000002', 'hardening-outro@teste.edu.br', '{}'),
  ('a1000000-0000-4000-8000-000000000003', 'hardening-admin@teste.edu.br', '{}');
insert into public.profiles(id, nome, email)
select id, 'Pessoa hardening', email from auth.users where id::text like 'a1000000-%';
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
select id,id,now(),now(),now()+interval '1 day' from auth.users where id::text like 'a1000000-%';
insert into public.user_roles(user_id, papel) values
  ('a1000000-0000-4000-8000-000000000001', 'aluno'),
  ('a1000000-0000-4000-8000-000000000002', 'aluno'),
  ('a1000000-0000-4000-8000-000000000003', 'admin');

insert into public.notificacoes(id, usuario_id, tipo_evento, template, payload, chave_idempotencia, destinatario_email)
select id::uuid, usuario_id::uuid, tipo_evento, template, payload::jsonb, chave_idempotencia, 'hardening@teste.edu.br' from (values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'reserva_aprovada', 'reserva_aprovada', '{"titulo":"Aprovação visível"}', 'hardening:normal'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'convite', 'convite', '{"url":"https://portal.teste/auth/confirm?token_hash=segredo-convite&type=invite"}', 'hardening:convite:segredo-convite'),
  ('a2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'recuperacao', 'recuperacao', '{"url":"https://portal.teste/auth/confirm?token_hash=segredo-recovery&type=recovery"}', 'hardening:recuperacao:segredo-recovery'),
  ('a2000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'seguranca_conta', 'seguranca_conta', '{"url":"https://portal.teste/auth/confirm?token_hash=segredo-seguranca&type=recovery"}', 'hardening:seguranca'),
  ('a2000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002', 'reserva_aprovada', 'reserva_aprovada', '{}', 'hardening:outra-pessoa'),
  ('a2000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'aviso', 'recuperacao', '{"url":"https://portal.teste/auth/confirm?token_hash=segredo-template&type=recovery"}', 'hardening:template-auth'),
  ('a2000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000003', 'recuperacao', 'recuperacao', '{"url":"https://portal.teste/auth/confirm?token_hash=segredo-admin&type=recovery"}', 'hardening:recuperacao-admin')
) as eventos(id, usuario_id, tipo_evento, template, payload, chave_idempotencia);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated','session_id',current_setting('request.jwt.claim.sub'))::text,true);
select is((select count(*)::integer from public.notificacoes where id::text like 'a2000000-%'), 1, 'cliente só lê eventos visíveis próprios, sem credenciais auth');
select ok(not exists(select 1 from public.notificacoes where payload::text like '%token_hash%'), 'SELECT direto de payload não revela bearer');
select ok(not exists(select 1 from public.notificacoes where chave_idempotencia like '%segredo%'), 'chave de idempotência dos eventos auth também fica oculta');
select is(public.marcar_notificacoes_lidas(array['a2000000-0000-4000-8000-000000000003'::uuid]), 0, 'RPC não marca nem conta recuperação oculta por ID');
select is(public.marcar_notificacoes_lidas(null), 1, 'marcar todas conta apenas a notificação visível própria');
select is(public.marcar_notificacoes_lidas(null), 0, 'segunda marcação não revela contagem de eventos auth');
select is(public.marcar_notificacoes_lidas(array['a2000000-0000-4000-8000-000000000005'::uuid]), 0, 'RPC não marca notificação de outra pessoa');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated','session_id',current_setting('request.jwt.claim.sub'))::text,true);
select is((select count(*)::integer from public.notificacoes where id::text like 'a2000000-%'), 0, 'admin autenticado também não lê os próprios links de recuperação');
reset role;

select ok(not exists(select 1 from public.notificacoes where id::text like 'a2000000-%' and tipo_evento in ('convite','recuperacao','seguranca_conta') and lida_em is not null), 'marcar lidas preserva a fila privada dos eventos auth');
select ok((select lida_em is null from public.notificacoes where id='a2000000-0000-4000-8000-000000000005'), 'notificação de outra pessoa permanece não lida');
select ok(has_function_privilege('service_role', 'public.reclamar_notificacoes(integer)', 'EXECUTE'), 'worker mantém acesso ao RPC de retirada da fila');
set local role service_role;
select is((select count(*)::integer from public.notificacoes where id::text like 'a2000000-%' and payload::text like '%token_hash%'), 5, 'service_role ainda obtém os links para enviar a fila');
reset role;

-- Orçamento email é atômico no banco e não depende do administrador solicitante.
set local role service_role;
select ok(public.consumir_rate_limit('convite-email:hardening',1,600), 'primeira tentativa reserva o orçamento por email');
select ok(not public.consumir_rate_limit('convite-email:hardening',1,600), 'segunda tentativa de invite não pode reemitir token na janela');
reset role;

-- PostgREST aceitaria a assinatura de um JWT até expirar. RLS e RPC devem
-- revalidar session_id contra auth.sessions, sem depender do servidor Next.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"a1000000-0000-4000-8000-000000000003"}',true);
select ok(public._ativo(), 'admin com sessão existente e própria acessa o banco');
select ok(not has_function_privilege('authenticated','public._sessao_ativa()','EXECUTE'), 'helper de sessão não expõe auth.sessions por RPC');
select ok(not has_table_privilege('authenticated','auth.sessions','SELECT'), 'cliente não recebe SELECT na tabela interna de sessões');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(not public._ativo(), 'JWT sem session_id falha fechado');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"invalido"}',true);
select ok(not public._ativo(), 'session_id malformado falha fechado sem erro de cast');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"ffffffff-ffff-4fff-8fff-ffffffffffff"}',true);
select ok(not public._ativo(), 'sessão inexistente não autoriza JWT ainda assinado');
select throws_ok($$select public.alterar_usuario_admin('a1000000-0000-4000-8000-000000000001','Pessoa hardening',null,true,array['aluno'],'{}')$$,'42501','ACESSO_NEGADO','RPC administrativo direto rejeita sessão inexistente');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"a1000000-0000-4000-8000-000000000002"}',true);
select ok(not public._ativo(), 'sessão de outra pessoa não autoriza o sub do JWT');
reset role;

update auth.sessions set not_after=now()-interval '1 second' where id='a1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"a1000000-0000-4000-8000-000000000003"}',true);
select ok(not public._ativo(), 'sessão além de not_after perde acesso');
reset role;
update auth.sessions set not_after=null where id='a1000000-0000-4000-8000-000000000003';
set local role authenticated;
select ok(public._ativo(), 'sessão sem prazo absoluto e existente permanece válida');
reset role;

-- Simula o efeito de signOut global mantendo os mesmos claims do access token.
delete from auth.sessions where user_id='a1000000-0000-4000-8000-000000000003';
set local role authenticated;
select ok(not public._ativo(), 'JWT copiado antes da revogação perde acesso após remover sessão');
select is((select count(*)::integer from public.profiles),0,'RLS não entrega perfis à sessão revogada');
select throws_ok($$select public.alterar_usuario_admin('a1000000-0000-4000-8000-000000000001','Pessoa hardening',null,true,array['aluno'],'{}')$$,'42501','ACESSO_NEGADO','RPC direto não aceita JWT da sessão revogada');
reset role;

set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select lives_ok($$select * from public.reclamar_notificacoes(1)$$,'worker continua processando fila sem sessão de usuário');
reset role;

select * from finish();
rollback;
