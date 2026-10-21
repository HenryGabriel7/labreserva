begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
 ('b1000000-0000-4000-8000-000000000001','bloqueio-admin@teste.edu.br'),
 ('b1000000-0000-4000-8000-000000000002','bloqueio-monitor@teste.edu.br'),
 ('b1000000-0000-4000-8000-000000000003','bloqueio-aluno@teste.edu.br');
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
select id,id,now(),now(),now()+interval '1 day' from auth.users where id::text like 'b1000000-%';
insert into public.profiles(id,nome,email)
select id,'Pessoa bloqueios',email from auth.users where id::text like 'b1000000-%';
insert into public.user_roles(user_id,papel) values
 ('b1000000-0000-4000-8000-000000000001','admin'),
 ('b1000000-0000-4000-8000-000000000002','monitor'),
 ('b1000000-0000-4000-8000-000000000003','aluno');
insert into public.laboratorios(id,nome,tipo,capacidade,localizacao,modo_reserva) values
 ('b2000000-0000-4000-8000-000000000001','Bloqueio laboratório um','redes',30,'Teste','slot_fixo'),
 ('b2000000-0000-4000-8000-000000000002','Bloqueio laboratório dois','redes',30,'Teste','slot_fixo');
insert into public.monitor_laboratorios(monitor_id,laboratorio_id)
values('b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001');
insert into public.bloqueios(id,laboratorio_id,inicio,fim,motivo,descricao) values
 ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '20 days 10 hours',date_trunc('day',now())+interval '20 days 11 hours','manutencao','Bloqueio original'),
 ('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002',date_trunc('day',now())+interval '20 days 10 hours',date_trunc('day',now())+interval '20 days 11 hours','manutencao','Bloqueio fora do vínculo'),
 ('b3000000-0000-4000-8000-000000000003',null,date_trunc('day',now())+interval '21 days 10 hours',date_trunc('day',now())+interval '21 days 11 hours','evento','Bloqueio global');
insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status) values
 ('b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003',date_trunc('day',now())+interval '8 days 10 hours',date_trunc('day',now())+interval '8 days 11 hours','laboratorio','Atividade aprovada para testar edição',10,1,'aluno','aprovada'),
 ('b4000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003',date_trunc('day',now())+interval '9 days 10 hours',date_trunc('day',now())+interval '9 days 11 hours','laboratorio','Reserva cancelável antes de uso',10,1,'aluno','aprovada'),
 ('b4000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003',date_trunc('day',now())+interval '9 days 11 hours',date_trunc('day',now())+interval '9 days 12 hours','laboratorio','Atividade em uso não pode ser cancelada',10,1,'aluno','em_uso');

select ok(not has_function_privilege('anon','public.editar_bloqueio(uuid,uuid,timestamptz,timestamptz,text,text,boolean,text)','EXECUTE'),'anon não executa edição de bloqueio');
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000003"}',true);
select throws_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',now()+interval '18 days',now()+interval '18 days 1 hour','evento','Tentativa aluno')$$,'42501','ACESSO_NEGADO','aluno não edita bloqueios');

select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002',now()+interval '18 days',now()+interval '18 days 1 hour','evento','Tentativa fora do vínculo')$$,'42501','ACESSO_NEGADO','monitor fora do laboratório é bloqueado');
select throws_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000003',null,now()+interval '18 days',now()+interval '18 days 1 hour','evento','Tentativa global')$$,'42501','ACESSO_NEGADO','monitor não edita bloqueio global');
select throws_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002',now()+interval '18 days',now()+interval '18 days 1 hour','evento','Mudança de laboratório')$$,'P0001','LABORATORIO_IMUTAVEL','edição não transfere bloqueio para outro laboratório');
select lives_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '19 days 10 hours',date_trunc('day',now())+interval '19 days 11 hours','evento','Evento atualizado')$$,'monitor edita seu laboratório');
select is((select descricao from public.bloqueios where id='b3000000-0000-4000-8000-000000000001'),'Evento atualizado','ID original continua identificando o bloqueio atualizado');
select throws_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '8 days 10 hours',date_trunc('day',now())+interval '8 days 11 hours','manutencao','Manutenção sobre atividade')$$,'P0001','BLOQUEIO_AFETA_RESERVAS','afetar reserva aprovada exige confirmação de cancelamento');
select is((select status from public.reservas where id='b4000000-0000-4000-8000-000000000001'),'aprovada','edição rejeitada preserva a aprovação');
select is((select descricao from public.bloqueios where id='b3000000-0000-4000-8000-000000000001'),'Evento atualizado','edição rejeitada preserva dados anteriores');
select throws_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '8 days 10 hours',date_trunc('day',now())+interval '8 days 11 hours','manutencao','Manutenção sobre atividade',true,null)$$,'P0001','MOTIVO_OBRIGATORIO','cancelamento confirmado ainda exige motivo');
select lives_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '8 days 10 hours',date_trunc('day',now())+interval '8 days 11 hours','manutencao','Manutenção confirmada',true,'Manutenção de segurança necessária')$$,'edição cancela aprovação com autorização e motivo');
select is((select status from public.reservas where id='b4000000-0000-4000-8000-000000000001'),'cancelada','reserva afetada foi cancelada na mesma transação');
select throws_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '9 days 10 hours',date_trunc('day',now())+interval '9 days 12 hours','manutencao','Não pode interromper uso',true,'Manutenção que não pode interromper uso')$$,'P0001','LABORATORIO_EM_USO','reserva em uso impede edição inteira');
select is((select status from public.reservas where id='b4000000-0000-4000-8000-000000000002'),'aprovada','falha após cancelar primeira reserva faz rollback do cancelamento');
select is((select status from public.reservas where id='b4000000-0000-4000-8000-000000000003'),'em_uso','falha mantém reserva em uso');
select is((select descricao from public.bloqueios where id='b3000000-0000-4000-8000-000000000001'),'Manutenção confirmada','falha preserva o último bloqueio válido');
reset role;
select ok(exists(select 1 from public.notificacoes where tipo_evento='reserva_cancelada' and payload->>'reserva_id'='b4000000-0000-4000-8000-000000000001'),'cancelamento confirmado enfileira email');
select ok(not exists(select 1 from public.notificacoes where tipo_evento='reserva_cancelada' and payload->>'reserva_id'='b4000000-0000-4000-8000-000000000002'),'rollback não deixa email de cancelamento indevido');
select is((select count(*)::integer from public.audit_log where acao='editar_bloqueio' and entidade_id='b3000000-0000-4000-8000-000000000001'),2,'somente edições bem sucedidas ficam na auditoria');
select ok(exists(select 1 from public.audit_log where acao='editar_bloqueio' and entidade_id='b3000000-0000-4000-8000-000000000001' and antes->>'descricao'='Bloqueio original' and depois->>'descricao'='Evento atualizado'),'auditoria preserva antes e depois do mesmo ID');

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000001"}',true);
select lives_ok($$select public.editar_bloqueio('b3000000-0000-4000-8000-000000000003',null,now()+interval '22 days',now()+interval '22 days 1 hour','feriado','Feriado global atualizado')$$,'admin edita bloqueio global');
select lives_ok($$select public.remover_cadastro('bloqueios','b3000000-0000-4000-8000-000000000002')$$,'admin remove bloqueio com auditoria');
select is((select count(*)::integer from public.bloqueios where id='b3000000-0000-4000-8000-000000000002'),0,'remoção administrativa efetiva');
reset role;
select ok(exists(select 1 from public.audit_log where acao='remover_cadastro' and entidade='bloqueios' and entidade_id='b3000000-0000-4000-8000-000000000002'),'remoção permanece no histórico auditável');

select * from finish();
rollback;
