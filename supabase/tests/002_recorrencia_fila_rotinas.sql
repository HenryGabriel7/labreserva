begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
create function public._teste_dia() returns date language sql stable as $$ select (date_trunc('week',now() at time zone 'America/Sao_Paulo')+interval '7 days')::date $$;
create function public._teste_hora(p_dias integer default 0) returns timestamptz language sql stable as $$ select (public._teste_dia()+p_dias+time '10:00') at time zone 'America/Sao_Paulo' $$;
grant execute on function public._teste_dia(),public._teste_hora(integer) to authenticated;
create table public._teste_resultados(chave text primary key,valor jsonb);
grant select,insert on public._teste_resultados to authenticated;
insert into auth.users(id,email) values
 ('94000000-0000-4000-8000-000000000001','serie-admin@teste.edu.br'),('94000000-0000-4000-8000-000000000002','serie-monitor@teste.edu.br'),
 ('94000000-0000-4000-8000-000000000003','serie-professor@teste.edu.br'),('94000000-0000-4000-8000-000000000004','serie-aluno@teste.edu.br');
insert into public.profiles(id,nome,email) select id,'Usuário recorrência',email from auth.users where id::text like '94000000-%';
insert into public.user_roles(user_id,papel) values
 ('94000000-0000-4000-8000-000000000001','admin'),('94000000-0000-4000-8000-000000000002','monitor'),
 ('94000000-0000-4000-8000-000000000003','professor'),('94000000-0000-4000-8000-000000000004','aluno');
insert into public.laboratorios(id,nome,tipo,capacidade,localizacao,modo_reserva,duracao_minima_minutos,duracao_maxima_minutos)
values('95000000-0000-4000-8000-000000000001','Lab recorrência','redes',30,'Teste','slot_fixo',60,240);
insert into public.janelas_horario(laboratorio_id,dia_semana,inicio,fim,duracao_slot_minutos) select '95000000-0000-4000-8000-000000000001',d,'08:00','22:00',60 from generate_series(0,6) d;
insert into public.monitor_laboratorios(monitor_id,laboratorio_id) values('94000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001');
insert into public.bloqueios(laboratorio_id,inicio,fim,motivo,descricao) values('95000000-0000-4000-8000-000000000001',public._teste_hora(7),public._teste_hora(7)+interval '1 hour','feriado','Feriado da instituição');

set local role authenticated;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.solicitar_reserva('95000000-0000-4000-8000-000000000001',null,null,'laboratorio','Recorrência sem papel',10,'[]',null,jsonb_build_object('dia_semana',1,'hora_inicio','10:00','hora_fim','11:00','data_inicio',public._teste_dia(),'data_fim',public._teste_dia()+21,'excecoes',jsonb_build_array(public._teste_dia()+14)))$$,'42501','RECORRENCIA_NAO_PERMITIDA','aluno não solicita série');
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000003',true);
select lives_ok($$insert into public._teste_resultados values('serie',public.solicitar_reserva('95000000-0000-4000-8000-000000000001',null,null,'laboratorio','Série semanal para aula',10,'[]','Atividade curricular',jsonb_build_object('dia_semana',1,'hora_inicio','10:00','hora_fim','11:00','data_inicio',public._teste_dia(),'data_fim',public._teste_dia()+21,'excecoes',jsonb_build_array(public._teste_dia()+14))))$$,'professor cria série semanal');
select is((select jsonb_array_length(valor->'reserva_ids') from public._teste_resultados where chave='serie'),2,'feriado e exceção são pulados');
select is((select jsonb_array_length(valor->'datas_puladas') from public._teste_resultados where chave='serie'),1,'feriado pulado é informado');
select is((select count(*)::int from public.reservas where laboratorio_id='95000000-0000-4000-8000-000000000001' and prioridade_efetiva=2 and status='pendente'),2,'série inteira permanece pendente com snapshot2');
select ok((select bool_and((inicio at time zone 'America/Sao_Paulo')::time=time '10:00') from public.reservas where laboratorio_id='95000000-0000-4000-8000-000000000001'),'recorrência interpreta hora local de São Paulo');
select throws_ok($$select public.solicitar_reserva('95000000-0000-4000-8000-000000000001',null,null,'laboratorio','Série além da antecedência',10,'[]',null,jsonb_build_object('dia_semana',1,'hora_inicio','12:00','hora_fim','13:00','data_inicio',public._teste_dia(),'data_fim',public._teste_dia()+98,'excecoes','[]'::jsonb))$$,'P0001','ANTECEDENCIA_INVALIDA','série também respeita antecedência máxima por data');
select is((select count(*)::int from public.recorrencias where laboratorio_id='95000000-0000-4000-8000-000000000001'),1,'erro na série não deixa linhas parciais');

reset role;
insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status) values
 ('97000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000004',public._teste_hora(21),public._teste_hora(21)+interval '1 hour','laboratorio','Ocupação conflitante da série',1,1,'aluno','aprovada');
set local role authenticated;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
select lives_ok($$insert into public._teste_resultados values('aprovacao',public.aprovar_serie((select (valor->>'recorrencia_id')::uuid from public._teste_resultados where chave='serie'),'Série curricular'))$$,'aprovar série mantém conflitos individuais');
select is((select jsonb_array_length(valor->'aprovadas') from public._teste_resultados where chave='aprovacao'),1,'aprova a data livre');
select is((select jsonb_array_length(valor->'conflitantes') from public._teste_resultados where chave='aprovacao'),1,'lista a data conflitante');
select is((select count(*)::int from public.reservas where recorrencia_id=(select (valor->>'recorrencia_id')::uuid from public._teste_resultados where chave='serie') and status='pendente' and conflito),1,'data conflitante continua pendente e marcada');

reset role;
insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status) values
 ('97000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000004',public._teste_hora(1),public._teste_hora(1)+interval '1 hour','laboratorio','Substituição deve ser revertida',1,1,'aluno','aprovada'),
 ('97000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000003',public._teste_hora(1),public._teste_hora(1)+interval '1 hour','laboratorio','Professor em bloqueio posterior',1,2,'professor','pendente');
insert into public.bloqueios(laboratorio_id,inicio,fim,motivo,descricao) values('95000000-0000-4000-8000-000000000001',public._teste_hora(1),public._teste_hora(1)+interval '1 hour','evento','Bloqueio para provar rollback');
set local role authenticated;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.substituir_reserva('97000000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000003','Prioridade curricular')$$,'P0001','HORARIO_BLOQUEADO','falha na substituição faz rollback');
select is((select status from public.reservas where id='97000000-0000-4000-8000-000000000002'),'aprovada','rollback preserva reserva antiga');
select is((select status from public.reservas where id='97000000-0000-4000-8000-000000000003'),'pendente','rollback preserva nova pendente');

reset role;
-- Fila: opt-out é reavaliado no momento do claim, e essenciais continuam enviáveis.
select public.enfileirar_notificacao('94000000-0000-4000-8000-000000000004','lembrete_reserva','lembrete_reserva','{}','teste-fila-lembrete');
select public.enfileirar_notificacao('94000000-0000-4000-8000-000000000004','atualizacao','atualizacao','{}','teste-fila-outro');
select public.enfileirar_notificacao('94000000-0000-4000-8000-000000000004','reserva_aprovada','reserva_aprovada','{}','teste-fila-essencial');
select public.enfileirar_notificacao('94000000-0000-4000-8000-000000000004','reserva_aprovada','reserva_aprovada','{}','teste-fila-essencial');
select is((select count(*)::int from public.notificacoes where chave_idempotencia='teste-fila-essencial'),1,'fila tem idempotência por evento e destinatário');
update public.profiles set preferencias_notificacao='{"lembretes":false,"outros":false}' where id='94000000-0000-4000-8000-000000000004';
set local role service_role;
select lives_ok($$select * from public.reclamar_notificacoes(100)$$,'worker reclama lote');
select is((select status from public.notificacoes where chave_idempotencia='teste-fila-lembrete'),'falhou','lembrete com opt-out não é enviado');
select ok((select envio_dispensado from public.notificacoes where chave_idempotencia='teste-fila-outro'),'dispensa preserva evento no centro de notificações');
select is((select status from public.notificacoes where chave_idempotencia='teste-fila-essencial'),'enviando','essencial ignora opt-out');
select lives_ok($$select public.concluir_notificacao((select id from public.notificacoes where chave_idempotencia='teste-fila-essencial'),false,'Falha simulada do provedor')$$,'falha volta à fila');
select is((select tentativas from public.notificacoes where chave_idempotencia='teste-fila-essencial'),1,'tentativa incrementa na falha');
select ok((select proxima_tentativa_em between now()+interval '59 seconds' and now()+interval '61 seconds' from public.notificacoes where chave_idempotencia='teste-fila-essencial'),'primeiro retry espera um minuto');
reset role;
update public.notificacoes set status='enviando',updated_at=now() where chave_idempotencia='teste-fila-essencial';
set local role service_role;
select public.concluir_notificacao((select id from public.notificacoes where chave_idempotencia='teste-fila-essencial'),false,'Falha2');
select ok((select proxima_tentativa_em between now()+interval '299 seconds' and now()+interval '301 seconds' from public.notificacoes where chave_idempotencia='teste-fila-essencial'),'segundo retry espera cinco minutos');
reset role;
update public.notificacoes set status='enviando' where chave_idempotencia='teste-fila-essencial';
set local role service_role;
select public.concluir_notificacao((select id from public.notificacoes where chave_idempotencia='teste-fila-essencial'),false,'Falha3');
select ok((select proxima_tentativa_em between now()+interval '899 seconds' and now()+interval '901 seconds' from public.notificacoes where chave_idempotencia='teste-fila-essencial'),'terceiro retry espera quinze minutos');
reset role;
update public.notificacoes set status='enviando' where chave_idempotencia='teste-fila-essencial';
set local role service_role;
select public.concluir_notificacao((select id from public.notificacoes where chave_idempotencia='teste-fila-essencial'),false,'Falha4');
select ok((select proxima_tentativa_em between now()+interval '3599 seconds' and now()+interval '3601 seconds' from public.notificacoes where chave_idempotencia='teste-fila-essencial'),'quarto retry espera sessenta minutos');
reset role;
update public.notificacoes set status='enviando' where chave_idempotencia='teste-fila-essencial';
set local role service_role;
select public.concluir_notificacao((select id from public.notificacoes where chave_idempotencia='teste-fila-essencial'),false,'Falha5');
select is((select status from public.notificacoes where chave_idempotencia='teste-fila-essencial'),'falhou','quinta falha é terminal');
select is((select tentativas from public.notificacoes where chave_idempotencia='teste-fila-essencial'),5,'máximo de cinco tentativas');
select public.suprimir_email('serie-aluno@teste.edu.br','email.bounced','webhook-teste-unico');
select public.suprimir_email('serie-aluno@teste.edu.br','email.bounced','webhook-teste-unico');
select is((select count(*)::int from public.supressoes_email where email='serie-aluno@teste.edu.br'),1,'bounce idempotente suprime endereço');
select public.enfileirar_notificacao('94000000-0000-4000-8000-000000000004','reserva_aprovada','reserva_aprovada','{}','teste-fila-suprimida');
select * from public.reclamar_notificacoes(100);
select is((select erro from public.notificacoes where chave_idempotencia='teste-fila-suprimida'),'email_suprimido','supressão bloqueia também essencial');
reset role;

-- Rotinas internas são restritas e idempotentes.
select ok(not has_function_privilege('authenticated','public.processar_rotinas()','EXECUTE'),'usuário não invoca rotina como sistema');
insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status) values
 ('97000000-0000-4000-8000-000000000004','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000004',now()-interval '1 hour',now()-interval '1 minute','laboratorio','Pendente para expiração',1,1,'aluno','pendente'),
 ('97000000-0000-4000-8000-000000000005','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000003',now()-interval '30 minutes',now()+interval '30 minutes','equipamentos','Aprovada para no-show',1,2,'professor','aprovada');
select lives_ok($$select public.processar_rotinas()$$,'rotinas processam vencimentos');
select lives_ok($$select public.processar_rotinas()$$,'rotinas podem repetir');
select is((select status from public.reservas where id='97000000-0000-4000-8000-000000000004'),'cancelada','pendente passada é cancelada');
select is((select motivo from public.reservas where id='97000000-0000-4000-8000-000000000004'),'expirada','expiração registra motivo');
select is((select status from public.reservas where id='97000000-0000-4000-8000-000000000005'),'no_show','aprovada sem check-in vira no-show');
select is((select count(*)::int from public.audit_log where entidade_id='97000000-0000-4000-8000-000000000005' and acao='no_show_automatico'),1,'rotina não duplica auditoria');
select is((select count(*)::int from public.notificacoes where chave_idempotencia='97000000-0000-4000-8000-000000000005:reserva_no_show:94000000-0000-4000-8000-000000000003'),1,'rotina não duplica email');
select * from finish();
rollback;
