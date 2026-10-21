begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
 ('9a000000-0000-4000-8000-000000000001','painel-admin@teste.edu.br'),
 ('9a000000-0000-4000-8000-000000000002','painel-monitor@teste.edu.br'),
 ('9a000000-0000-4000-8000-000000000003','painel-aluno@teste.edu.br'),
 ('9a000000-0000-4000-8000-000000000004','painel-outro@teste.edu.br');
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) select id,id,now(),now(),now()+interval '1 day' from auth.users where id::text like '9a000000-%';
insert into public.profiles(id,nome,email) select id,'Usuário painel',email from auth.users where id::text like '9a000000-%';
insert into public.user_roles(user_id,papel) values
 ('9a000000-0000-4000-8000-000000000001','admin'),('9a000000-0000-4000-8000-000000000002','monitor'),
 ('9a000000-0000-4000-8000-000000000003','aluno'),('9a000000-0000-4000-8000-000000000004','aluno');
insert into public.laboratorios(id,nome,tipo,capacidade,localizacao,modo_reserva) values
 ('9b000000-0000-4000-8000-000000000001','Painel um','redes',30,'Teste','slot_fixo'),
 ('9b000000-0000-4000-8000-000000000002','Painel dois','informatica',30,'Teste','slot_fixo');
insert into public.monitor_laboratorios(monitor_id,laboratorio_id) values('9a000000-0000-4000-8000-000000000002','9b000000-0000-4000-8000-000000000001');
insert into public.reservas(laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante)
select '9b000000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000003',((now() at time zone 'America/Sao_Paulo')::date+time '10:00') at time zone 'America/Sao_Paulo',((now() at time zone 'America/Sao_Paulo')::date+time '11:00') at time zone 'America/Sao_Paulo','laboratorio','Solicitação painel '||n,1,1,'aluno' from generate_series(1,27) n;
insert into public.reservas(laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante)
select '9b000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000004',((now() at time zone 'America/Sao_Paulo')::date+time '10:00') at time zone 'America/Sao_Paulo',((now() at time zone 'America/Sao_Paulo')::date+time '11:00') at time zone 'America/Sao_Paulo','laboratorio','Solicitação fora do vínculo '||n,1,1,'aluno' from generate_series(1,5) n;
insert into public.reservas(laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante)
values('9b000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000002',((now() at time zone 'America/Sao_Paulo')::date+time '10:00') at time zone 'America/Sao_Paulo',((now() at time zone 'America/Sao_Paulo')::date+time '11:00') at time zone 'America/Sao_Paulo','laboratorio','Solicitação própria fora do vínculo',1,1,'aluno');
select ok(not has_function_privilege('anon','public.obter_resumo_painel()','EXECUTE'),'anon não consulta indicadores');
set local role authenticated;
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"9a000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"9a000000-0000-4000-8000-000000000003"}',true);
select is((public.obter_resumo_painel()->>'reservasHoje')::int,27,'contagem própria inclui registros além da página20');
select is((public.obter_resumo_painel()->>'pendentes')::int,27,'pendentes próprias exatas');
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"9a000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"9a000000-0000-4000-8000-000000000002"}',true);
select is((public.obter_resumo_painel()->>'reservasHoje')::int,28,'monitor agrega vínculo e própria fora do vínculo');
select is((public.obter_resumo_painel()->>'pendentes')::int,28,'monitor não agrega terceiros fora do vínculo');
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"9a000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"9a000000-0000-4000-8000-000000000001"}',true);
select is((public.obter_resumo_painel()->>'pendentes')::int,(select count(*)::int from public.reservas where status='pendente'),'admin agrega todos os registros');
select is((public.obter_resumo_painel()->>'labsAtivos')::int,(select count(*)::int from public.laboratorios where ativo),'laboratórios ativos precisos');
select ok((public.obter_resumo_painel()->>'ocupacaoPercentual')::int between 0 and 100,'ocupação agregada dentro de0a100');
reset role;
update public.profiles set ativo=false where id='9a000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"9a000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"9a000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.obter_resumo_painel()$$,'42501','ACESSO_NEGADO','conta desativada não consulta painel');
reset role;
select * from finish();
rollback;
