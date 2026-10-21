begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function public._teste_inicio() returns timestamptz language sql stable as $$
  select (date_trunc('week',now() at time zone 'America/Sao_Paulo')+interval '7 days 10 hours') at time zone 'America/Sao_Paulo'
$$;
grant execute on function public._teste_inicio() to authenticated;
insert into auth.users(id,email,raw_user_meta_data) values
 ('90000000-0000-4000-8000-000000000001','db-admin@teste.edu.br','{}'),
 ('90000000-0000-4000-8000-000000000002','db-monitor@teste.edu.br','{}'),
 ('90000000-0000-4000-8000-000000000003','db-aluno@teste.edu.br','{"papel":"admin"}'),
 ('90000000-0000-4000-8000-000000000004','db-professor@teste.edu.br','{}'),
 ('90000000-0000-4000-8000-000000000005','db-aluno2@teste.edu.br','{}');
insert into public.profiles(id,nome,email) select id,'Usuário de teste',email from auth.users where id::text like '90000000-%';
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
select id,id,now(),now(),now()+interval '1 day' from auth.users where id::text like '90000000-%';
insert into public.user_roles(user_id,papel) values
 ('90000000-0000-4000-8000-000000000001','admin'),('90000000-0000-4000-8000-000000000002','monitor'),
 ('90000000-0000-4000-8000-000000000003','aluno'),('90000000-0000-4000-8000-000000000004','professor'),
 ('90000000-0000-4000-8000-000000000005','aluno');
insert into public.laboratorios(id,nome,tipo,capacidade,localizacao,modo_reserva,duracao_minima_minutos,duracao_maxima_minutos) values
 ('91000000-0000-4000-8000-000000000001','Lab testes um','redes',30,'Teste','slot_fixo',60,600),
 ('91000000-0000-4000-8000-000000000002','Lab testes dois','informatica',30,'Teste','intervalo_livre',60,600);
insert into public.janelas_horario(laboratorio_id,dia_semana,inicio,fim,duracao_slot_minutos)
select l.id,d,'08:00','22:00',60 from public.laboratorios l cross join generate_series(0,6) d where l.id::text like '91000000-%';
insert into public.equipamentos(id,laboratorio_id,nome,quantidade) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Kit um',5),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','Kit dois',5);
insert into public.monitor_laboratorios(monitor_id,laboratorio_id) values('90000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001');
insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,created_at) values
 ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000003',public._teste_inicio(),public._teste_inicio()+interval '1 hour','laboratorio','Aula de teste inicial',10,1,'aluno',now()-interval '2 hours'),
 ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000005',public._teste_inicio(),public._teste_inicio()+interval '1 hour','laboratorio','Aula concorrente teste',10,1,'aluno',now()-interval '1 hour'),
 ('93000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000005',public._teste_inicio(),public._teste_inicio()+interval '1 hour','laboratorio','Aula em outro laboratório',10,1,'aluno',now()),
 ('93000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002',public._teste_inicio()+interval '2 hours',public._teste_inicio()+interval '3 hours','laboratorio','Reserva própria do monitor',10,1,'aluno',now());

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.profiles'::regclass,'public.user_roles'::regclass,'public.laboratorios'::regclass,'public.janelas_horario'::regclass,'public.equipamentos'::regclass,'public.monitor_laboratorios'::regclass,'public.reservas'::regclass,'public.reserva_equipamentos'::regclass,'public.recorrencias'::regclass,'public.bloqueios'::regclass,'public.checkins'::regclass,'public.ocorrencias'::regclass,'public.notificacoes'::regclass,'public.audit_log'::regclass,'public.configuracoes'::regclass,'public.rate_limits'::regclass,'public.supressoes_email'::regclass)),'RLS ativa em todas as tabelas');
select ok(not has_table_privilege('anon','public.reservas','SELECT'),'anon não lê reservas');
select ok(not has_function_privilege('anon','public.aprovar_reserva(uuid,text)','EXECUTE'),'anon não herda EXECUTE de PUBLIC');
select ok(not has_function_privilege('authenticated','public.provisionar_usuario(uuid,text,text,text,text[],uuid,text,text)','EXECUTE'),'provisionamento só serviço');
select ok(not has_function_privilege('authenticated','public.consumir_rate_limit(text,integer,integer)','EXECUTE'),'rate limit pré-login só serviço');
select ok(not has_function_privilege('authenticated','public._aprovar_reserva(uuid,text)','EXECUTE'),'helper interno não exposto');
select ok(has_column_privilege('authenticated','public.profiles','preferencias_notificacao','UPDATE'),'preferências têm UPDATE por coluna');
select ok(not has_column_privilege('authenticated','public.profiles','ativo','UPDATE'),'ativo sem UPDATE por coluna');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename in ('reservas','reserva_equipamentos','recorrencias','checkins','notificacoes','audit_log') and cmd in ('INSERT','UPDATE','DELETE','ALL')),'nenhuma policy de escrita no fluxo');

set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated','session_id',current_setting('request.jwt.claim.sub'))::text,true);
select is((select count(*)::int from public.reservas where id::text like '93000000-%'),1,'aluno só vê a própria reserva');
select ok(not public.tem_papel('admin'),'metadata não concede admin');
select throws_ok($$update public.reservas set status='aprovada' where id='93000000-0000-4000-8000-000000000001'$$,'42501',null,'aluno não muda status diretamente');
select throws_ok($$insert into public.reserva_equipamentos(reserva_id,equipamento_id,quantidade) values('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',1)$$,'42501',null,'aluno não acrescenta equipamento');
select throws_ok($$update public.profiles set ativo=false where id=auth.uid()$$,'42501',null,'aluno não muda ativo');
select lives_ok($$update public.profiles set preferencias_notificacao='{"lembretes":false,"outros":true}' where id=auth.uid()$$,'aluno altera as próprias preferências');
select throws_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000001','Teste')$$,'42501','ACESSO_NEGADO','aluno não aprova');
select throws_ok($$select public.solicitar_reserva('91000000-0000-4000-8000-000000000001',public._teste_inicio(),public._teste_inicio()+interval '1 hour','equipamentos','Equipamentos vazios',1,'[]')$$,'P0001','EQUIPAMENTOS_OBRIGATORIOS','escopo equipamentos requer ao menos um item');
select throws_ok($$select public.solicitar_reserva('91000000-0000-4000-8000-000000000001',public._teste_inicio(),public._teste_inicio()+interval '1 hour','equipamentos','Equipamento de outro laboratório',1,'[{"equipamento_id":"92000000-0000-4000-8000-000000000002","quantidade":1}]')$$,'P0001','EQUIPAMENTO_INDISPONIVEL','equipamento precisa pertencer ao lab');
select throws_ok($$select public.solicitar_reserva('91000000-0000-4000-8000-000000000001',public._teste_inicio(),public._teste_inicio()+interval '30 minutes','laboratorio','Slot incompleto',1)$$,'P0001','DURACAO_INVALIDA','slot não permite intervalo incompleto');
select lives_ok($$select public.solicitar_reserva('91000000-0000-4000-8000-000000000001',public._teste_inicio(),public._teste_inicio()+interval '1 hour','laboratorio','Segunda pendente permitida',1)$$,'pendentes podem coexistir');

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated','session_id',current_setting('request.jwt.claim.sub'))::text,true);
select is((select count(*)::int from public.reservas where id::text like '93000000-%'),3,'monitor só vê seu lab');
select throws_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000003','Teste')$$,'42501','ACESSO_NEGADO','monitor fora do vínculo não decide');
select throws_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000004','Teste')$$,'42501','DECISAO_PROPRIA_PROIBIDA','monitor não decide solicitação própria');
select throws_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000002')$$,'P0001','MOTIVO_DESEMPATE_OBRIGATORIO','divergir da chegada exige motivo');
select lives_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000001','Conforme chegada e prioridade')$$,'monitor aprova a sugestão');
select throws_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000002','Teste concorrente')$$,'P0001','CONFLITO_SALA','segunda aprovação conflitante falha');
select throws_ok($$select public.recusar_reserva('93000000-0000-4000-8000-000000000001','Tarde demais')$$,'P0001','TRANSICAO_INVALIDA','reserva aprovada não pode ser recusada');
select throws_ok($$select public.marcar_no_show('93000000-0000-4000-8000-000000000001')$$,'P0001','NOSHOW_NAO_PERMITIDO','no-show não pode antecipar tolerância');
select throws_ok($$select public.criar_bloqueio('91000000-0000-4000-8000-000000000001',public._teste_inicio(),public._teste_inicio()+interval '1 hour','manutencao','Manutenção de teste')$$,'P0001','BLOQUEIO_AFETA_RESERVAS','bloqueio exige confirmação de cancelamento');

reset role;
select throws_ok($$insert into public.reservas(laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status) values('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000005',public._teste_inicio(),public._teste_inicio()+interval '1 hour','laboratorio','Teste exclusão direta',1,1,'aluno','aprovada')$$,'23P01',null,'constraint impede sobreposição mesmo para proprietário');
select ok(exists(select 1 from public.audit_log where entidade_id='93000000-0000-4000-8000-000000000001' and acao='aprovar_reserva' and depois->>'motivo'='Conforme chegada e prioridade'),'decisão e motivo ficam na auditoria');
select throws_ok($$update public.audit_log set acao='fraude'$$,'42501','AUDITORIA_IMUTAVEL','auditoria rejeita update até do proprietário');
select throws_ok($$delete from public.audit_log$$,'42501','AUDITORIA_IMUTAVEL','auditoria rejeita delete até do proprietário');

insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status) values
 ('93000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000005',public._teste_inicio(),public._teste_inicio()+interval '1 hour','equipamentos','Equipamento versus sala inteira',1,1,'aluno','pendente'),
 ('93000000-0000-4000-8000-000000000006','91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000005',public._teste_inicio()+interval '1 hour',public._teste_inicio()+interval '2 hours','laboratorio','Intervalo adjacente válido',1,1,'aluno','pendente'),
 ('93000000-0000-4000-8000-000000000007','91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000005',public._teste_inicio()+interval '4 hours',public._teste_inicio()+interval '5 hours','equipamentos','Equipamento primeiro intervalo',1,1,'aluno','aprovada'),
 ('93000000-0000-4000-8000-000000000008','91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000005',public._teste_inicio()+interval '5 hours',public._teste_inicio()+interval '6 hours','equipamentos','Equipamento segundo intervalo',1,1,'aluno','aprovada'),
 ('93000000-0000-4000-8000-000000000009','91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003',public._teste_inicio()+interval '4 hours',public._teste_inicio()+interval '6 hours','equipamentos','Pico temporal válido',1,1,'aluno','pendente'),
 ('93000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003',public._teste_inicio()+interval '4 hours',public._teste_inicio()+interval '6 hours','equipamentos','Pico temporal inválido',1,1,'aluno','pendente'),
 ('93000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000004',public._teste_inicio(),public._teste_inicio()+interval '1 hour','laboratorio','Professor solicita substituição',10,2,'professor','pendente');
insert into public.reserva_equipamentos(reserva_id,equipamento_id,quantidade) values
 ('93000000-0000-4000-8000-000000000005','92000000-0000-4000-8000-000000000001',1),
 ('93000000-0000-4000-8000-000000000007','92000000-0000-4000-8000-000000000002',3),
 ('93000000-0000-4000-8000-000000000008','92000000-0000-4000-8000-000000000002',3),
 ('93000000-0000-4000-8000-000000000009','92000000-0000-4000-8000-000000000002',2),
 ('93000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000002',3);

set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated','session_id',current_setting('request.jwt.claim.sub'))::text,true);
select throws_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000005','Teste')$$,'P0001','CONFLITO_SALA','sala inteira impede equipamento');
select lives_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000006','Intervalo adjacente')$$,'intervalos [início,fim) adjacentes são válidos');
select lives_ok($$select public.substituir_reserva('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','Atividade curricular prioritária')$$,'substituição de aluno por professor é atômica');
select is((select status from public.reservas where id='93000000-0000-4000-8000-000000000001'),'substituida','reserva antiga fica substituída');
select is((select status from public.reservas where id='93000000-0000-4000-8000-000000000011'),'aprovada','nova reserva fica aprovada');

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated','session_id',current_setting('request.jwt.claim.sub'))::text,true);
select lives_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000009','Capacidade pelo pico temporal')$$,'estoque5 aceita q2 sobre q3 em intervalos distintos');
select throws_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000010','Teste excesso')$$,'P0001','ESTOQUE_INSUFICIENTE','pico que supera estoque falha');
select throws_ok($$select public.salvar_equipamento('{"quantidade":4}','92000000-0000-4000-8000-000000000002')$$,'P0001','ESTOQUE_INSUFICIENTE','CRUD não reduz estoque abaixo do pico aprovado');
select ok((select not exists(select 1 from jsonb_object_keys(to_jsonb(d)) k where k in ('solicitante_id','finalidade','reserva_id','usuario_id')) from public.consultar_disponibilidade('91000000-0000-4000-8000-000000000001',public._teste_inicio(),public._teste_inicio()+interval '2 hours') d limit 1),'disponibilidade não expõe dados pessoais');
select throws_ok($$select public.alterar_usuario_admin(auth.uid(),'Administrador',null,false,array['admin'],'{}')$$,'P0001','AUTO_DESATIVACAO_PROIBIDA','admin não desativa a própria conta');

reset role;
update public.profiles set ativo=false where id='90000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated','session_id',current_setting('request.jwt.claim.sub'))::text,true);
select is((select count(*)::int from public.laboratorios),0,'admin inativo perde leitura');
select throws_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000002','Teste')$$,'42501','ACESSO_NEGADO','admin inativo perde RPC');
reset role;
update public.profiles set ativo=true where id='90000000-0000-4000-8000-000000000001';

-- Fluxo check-in/out e prazo de cancelamento usam uma reserva em andamento.
insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status) values
 ('93000000-0000-4000-8000-000000000012','91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003',now()-interval '5 minutes',now()+interval '55 minutes','laboratorio','Atividade em andamento',1,1,'aluno','aprovada');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated','session_id',current_setting('request.jwt.claim.sub'))::text,true);
select throws_ok($$select public.cancelar_reserva('93000000-0000-4000-8000-000000000012','Cancelamento tardio')$$,'P0001','PRAZO_CANCELAMENTO_ENCERRADO','solicitante respeita prazo de cancelamento');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated','session_id',current_setting('request.jwt.claim.sub'))::text,true);
select lives_ok($$select public.fazer_checkin('93000000-0000-4000-8000-000000000012','Entrada registrada')$$,'check-in aprovado para em uso');
select throws_ok($$select public.fazer_checkin('93000000-0000-4000-8000-000000000012')$$,'P0001','TRANSICAO_INVALIDA','check-in duplicado falha');
select lives_ok($$select public.fazer_checkout('93000000-0000-4000-8000-000000000012','Saída registrada')$$,'checkout conclui sessão');
select is((select status from public.reservas where id='93000000-0000-4000-8000-000000000012'),'concluida','status concluída após checkout');
select throws_ok($$select public.cancelar_reserva('93000000-0000-4000-8000-000000000012','Teste')$$,'P0001','TRANSICAO_INVALIDA','estado terminal não cancela');

reset role;
set local role anon;
select throws_ok($$select public.aprovar_reserva('93000000-0000-4000-8000-000000000002','Teste')$$,'42501',null,'anon não executa RPC');
reset role;
select * from finish();
rollback;
