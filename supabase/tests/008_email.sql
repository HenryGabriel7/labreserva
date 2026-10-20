begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
-- Isola a fila sem alterar os dados das outras suítes (rollback ao final).
update public.notificacoes set status='enviada',enviada_em=now();
insert into auth.users(id,email) values('98000000-0000-4000-8000-000000000001','email@teste.edu.br');
insert into public.profiles(id,nome,email) values('98000000-0000-4000-8000-000000000001','Pessoa do teste','email@teste.edu.br');
select ok(not has_function_privilege('anon','public.descadastrar_notificacao(uuid,text)','execute'),'anon não chama descadastro diretamente');
select ok(not has_function_privilege('authenticated','public.preparar_entrega_notificacao(uuid,jsonb)','execute'),'usuário não fabrica envelope de e-mail');
select ok(not has_function_privilege('authenticated','public.registrar_webhook_notificacao(text,text,text,text)','execute'),'usuário não fabrica bounce');
select ok(not has_function_privilege('authenticated','public.registrar_entrega_notificacao(uuid,text)','execute'),'usuário não altera identificador do provedor');
select ok(not has_function_privilege('authenticated','public.sugerir_horarios_notificacao(uuid)','execute'),'sugestões do worker são restritas ao serviço');
select ok(not has_function_privilege('authenticated','public.marcar_reconciliacao_notificacao(uuid)','execute'),'reconciliação exige serviço');

set local role service_role;
select public.enfileirar_notificacao('98000000-0000-4000-8000-000000000001','reserva_aprovada','reserva_aprovada','{}','email:essencial');
select public.enfileirar_notificacao('98000000-0000-4000-8000-000000000001','lembrete_reserva','lembrete_reserva','{}','email:lembrete');
select lives_ok($$select public.descadastrar_notificacao('98000000-0000-4000-8000-000000000001','lembretes')$$,'descadastro altera somente categoria permitida');
select is((select preferencias_notificacao->'lembretes' from public.profiles where id='98000000-0000-4000-8000-000000000001'),'false'::jsonb,'lembretes desativados');
select is((select preferencias_notificacao->'outros' from public.profiles where id='98000000-0000-4000-8000-000000000001'),'true'::jsonb,'outros avisos permanecem');
select throws_ok($$select public.descadastrar_notificacao('98000000-0000-4000-8000-000000000001','essenciais')$$,'P0001','PREFERENCIA_INVALIDA','essenciais não têm descadastro');
select count(*) from public.reclamar_notificacoes(25);
select is((select status from public.notificacoes where chave_idempotencia='email:essencial'),'enviando','decisão essencial ignora opt-out');
select ok((select status='falhou' and envio_dispensado and erro='envio_dispensado_preferencia' from public.notificacoes where chave_idempotencia='email:lembrete'),'lembrete não enviado continua na central');

select public.preparar_entrega_notificacao((select id from public.notificacoes where chave_idempotencia='email:essencial'),
  jsonb_build_object('remetente','avisos@teste.edu.br','para','email@teste.edu.br','assunto','Decisão','html','<p>Primeiro conteúdo</p>','texto','Primeiro conteúdo','chaveIdempotencia','email:essencial'));
select public.preparar_entrega_notificacao((select id from public.notificacoes where chave_idempotencia='email:essencial'),
  jsonb_build_object('remetente','avisos@teste.edu.br','para','email@teste.edu.br','assunto','Decisão','html','<p>Conteúdo diferente</p>','texto','Conteúdo diferente','chaveIdempotencia','email:essencial'));
select is((select mensagem_email->>'html' from public.notificacoes where chave_idempotencia='email:essencial'),'<p>Primeiro conteúdo</p>','retry preserva envelope idêntico para idempotência Resend');
select throws_ok($$select public.marcar_reconciliacao_notificacao((select id from public.notificacoes where chave_idempotencia='email:essencial'))$$,'P0001','RECONCILIACAO_NAO_NECESSARIA','reconciliação terminal exige envelope antigo');
select public.registrar_entrega_notificacao((select id from public.notificacoes where chave_idempotencia='email:essencial'),'resend-fixture');
select public.concluir_notificacao((select id from public.notificacoes where chave_idempotencia='email:essencial'),true);
select is((select provedor_id from public.notificacoes where chave_idempotencia='email:essencial'),'resend-fixture','id do provedor fica associado à outbox');
select public.enfileirar_notificacao('98000000-0000-4000-8000-000000000001','seguranca_conta','seguranca_conta','{}','email:incerta');
select count(*) from public.reclamar_notificacoes(25);
select public.preparar_entrega_notificacao((select id from public.notificacoes where chave_idempotencia='email:incerta'),
  jsonb_build_object('remetente','avisos@teste.edu.br','para','email@teste.edu.br','assunto','Segurança','html','<p>Conteúdo</p>','texto','Conteúdo','chaveIdempotencia','email:incerta'));
reset role;
update public.notificacoes set mensagem_preparada_em=now()-interval '24 hours' where chave_idempotencia='email:incerta';
set local role service_role;
select public.marcar_reconciliacao_notificacao((select id from public.notificacoes where chave_idempotencia='email:incerta'));
select ok((select status='falhou' and tentativas=5 and proxima_tentativa_em is null and erro='reconciliacao_manual_necessaria' from public.notificacoes where chave_idempotencia='email:incerta'),'entrega incerta antiga não ultrapassa janela idempotente do provedor');
select throws_ok($$select public.registrar_webhook_notificacao('resend-fixture','email@teste.edu.br','evento_falso','msg-falso')$$,'P0001','EVENTO_INVALIDO','webhook só admite bounce e complaint');
select public.registrar_webhook_notificacao('resend-fixture','email@teste.edu.br','email.bounced','msg-bounce-fixture');
select public.registrar_webhook_notificacao('resend-fixture','email@teste.edu.br','email.bounced','msg-bounce-fixture');
select is((select count(*)::int from public.supressoes_email where email='email@teste.edu.br'),1,'replay do webhook é idempotente');
select ok((select email_suprimido from public.profiles where id='98000000-0000-4000-8000-000000000001'),'bounce suprime o endereço');
select ok((select status='falhou' and erro='email.bounced' from public.notificacoes where chave_idempotencia='email:essencial'),'bounce marca falha mesmo após aceite do provedor');
select public.enfileirar_notificacao('98000000-0000-4000-8000-000000000001','recuperacao','recuperacao','{}','email:apos-bounce');
select count(*) from public.reclamar_notificacoes(25);
select ok((select status='falhou' and erro='email_suprimido' from public.notificacoes where chave_idempotencia='email:apos-bounce'),'supressão impede até novos envios essenciais');
reset role;

insert into public.laboratorios(id,nome,tipo,capacidade,localizacao,modo_reserva,duracao_minima_minutos,duracao_maxima_minutos)
values('98100000-0000-4000-8000-000000000001','Lab sugestões','redes',30,'Teste','slot_fixo',60,240);
insert into public.janelas_horario(laboratorio_id,dia_semana,inicio,fim,duracao_slot_minutos)
select '98100000-0000-4000-8000-000000000001',d,'08:00','18:00',60 from generate_series(0,6) d;
insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status)
values('98200000-0000-4000-8000-000000000001','98100000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001',
  (((now() at time zone 'America/Sao_Paulo')::date+1)+time '10:00') at time zone 'America/Sao_Paulo',
  (((now() at time zone 'America/Sao_Paulo')::date+1)+time '11:00') at time zone 'America/Sao_Paulo','laboratorio','Reserva substituída',1,1,'aluno','substituida');
insert into public.notificacoes(id,usuario_id,tipo_evento,template,payload,destinatario_email,essencial,chave_idempotencia)
values('98300000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','reserva_substituida','reserva_substituida',
  '{"reserva_id":"98200000-0000-4000-8000-000000000001"}','email@teste.edu.br',true,'email:sugestoes');
set local role service_role;
select is(cardinality(public.sugerir_horarios_notificacao('98300000-0000-4000-8000-000000000001')),3,'substituição sugere até três horários válidos');
reset role;
insert into public.bloqueios(inicio,fim,motivo,descricao) values(now(),now()+interval '9 days','manutencao','Bloqueio global do teste');
set local role service_role;
select is(cardinality(public.sugerir_horarios_notificacao('98300000-0000-4000-8000-000000000001')),0,'nenhuma sugestão atravessa bloqueio global');
reset role;
select * from finish();
rollback;
