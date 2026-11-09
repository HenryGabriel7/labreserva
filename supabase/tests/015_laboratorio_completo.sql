begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values ('c5100000-0000-4000-8000-000000000001','cadastro-admin@teste.edu.br'),('c5100000-0000-4000-8000-000000000002','cadastro-aluno@teste.edu.br');
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) select id,id,now(),now(),now()+interval '1 day' from auth.users where id::text like 'c5100000-%';
insert into profiles(id,nome,email) select id,'Pessoa cadastro',email from auth.users where id::text like 'c5100000-%';
insert into user_roles(user_id,papel) values ('c5100000-0000-4000-8000-000000000001','admin'),('c5100000-0000-4000-8000-000000000002','aluno');
create function pg_temp.lab_dados() returns jsonb language sql as $$ select '{"nome":"Cadastro integrado","tipo":"informatica","capacidade":30,"localizacao":"Bloco A","descricao":"","regras_de_uso":"","ativo":true,"modo_reserva":"slot_fixo","granularidade_minutos":30,"duracao_minima_minutos":60,"duracao_maxima_minutos":240}'::jsonb $$;
create function pg_temp.lab_janelas() returns jsonb language sql as $$ select jsonb_agg(jsonb_build_object('dia_semana',dia,'inicio','08:00','fim','18:00','duracao_slot_minutos',60)) from generate_series(0,6) dia $$;
create function pg_temp.lab_itens() returns jsonb language sql as $$ select '[{"nome":"Computador teste","patrimonio":"PC-INTEGRADO-001","quantidade":10,"status":"ativo","reservavel_individualmente":true}]'::jsonb $$;
create function pg_temp.lab_itens_existentes() returns jsonb language sql as $$ select coalesce(jsonb_agg(to_jsonb(e)-'laboratorio_id'-'created_at'-'updated_at'),'[]') from public.equipamentos e where laboratorio_id=current_setting('teste.lab_id')::uuid $$;
create function pg_temp.lab_snapshot() returns jsonb language sql as $$
  select public.obter_laboratorio_edicao(current_setting('teste.lab_id')::uuid)
$$;
create function pg_temp.lab_particao(
  p_alterar jsonb default '[]', p_novas jsonb default '[]', p_remover jsonb default '[]'
) returns jsonb language sql as $$
  select jsonb_build_object(
    'manter', coalesce(jsonb_agg(j->>'id' order by j->>'id'), '[]'),
    'alterar', p_alterar, 'novas', p_novas, 'remover', p_remover
  )
  from jsonb_array_elements(pg_temp.lab_snapshot()->'janelas') j
  where not (p_remover ? (j->>'id'))
    and not exists (select 1 from jsonb_array_elements(p_alterar) a where a->>'id' = j->>'id')
$$;
create function pg_temp.editar_lab(
  p_dados jsonb, p_horarios jsonb default null, p_itens jsonb default '[]',
  p_revisao text default null
) returns jsonb language sql as $$
  select public.editar_laboratorio_completo(
    current_setting('teste.lab_id')::uuid,
    coalesce(p_revisao, pg_temp.lab_snapshot()->>'revisao'),
    p_dados, coalesce(p_horarios, pg_temp.lab_particao()), p_itens
  )
$$;

-- A listagem global antiga corta o conjunto antes de incluir os outros dias.
insert into public.laboratorios(nome,tipo,capacidade,localizacao,modo_reserva)
  select 'Laboratório volume E1 '||n,'informatica',30,'Bloco volume','intervalo_livre'
  from generate_series(1,30) n;
insert into public.janelas_horario(laboratorio_id,dia_semana,inicio,fim,duracao_slot_minutos)
  select l.id,0,time '00:00'+n*interval '30 minutes',time '00:00'+(n+1)*interval '30 minutes',30
  from public.laboratorios l cross join generate_series(0,23) n
  where l.nome like 'Laboratório volume E1 %';

select ok(not has_function_privilege('anon','public.salvar_laboratorio_completo(jsonb,jsonb,jsonb,uuid)','EXECUTE'),'cadastro completo não é público');
select ok(not has_function_privilege('anon','public.obter_laboratorio_edicao(uuid)','EXECUTE'),'snapshot de edição não é público');
select ok(not has_function_privilege('anon','public.editar_laboratorio_completo(uuid,text,jsonb,jsonb,jsonb)','EXECUTE'),'edição completa não é pública');
set local role authenticated;
select set_config('request.jwt.claim.sub','c5100000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"c5100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"c5100000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select public.salvar_laboratorio_completo(pg_temp.lab_dados(),pg_temp.lab_janelas(),pg_temp.lab_itens())$$,'42501','ACESSO_NEGADO','aluno não cadastra laboratório');
select throws_ok($$select public.obter_laboratorio_edicao('c5200000-0000-4000-8000-000000000002')$$,'42501','ACESSO_NEGADO','aluno não lê snapshot de edição');
select throws_ok($$select public.editar_laboratorio_completo('c5200000-0000-4000-8000-000000000002','revisao','{}','{}','[]')$$,'42501','ACESSO_NEGADO','aluno não edita pela RPC nova');
select set_config('request.jwt.claim.sub','c5100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c5100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"c5100000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.salvar_laboratorio_completo(pg_temp.lab_dados(),'[]',pg_temp.lab_itens())$$,'P0001','FUNCIONAMENTO_OBRIGATORIO','não cria laboratório sem funcionamento');
select throws_ok($$select public.salvar_laboratorio_completo(pg_temp.lab_dados(),'[{"dia_semana":1,"inicio":"08:00","fim":"08:30","duracao_slot_minutos":60}]',pg_temp.lab_itens())$$,'P0001','FUNCIONAMENTO_INCOMPATIVEL','não salva período menor que uma reserva válida');
select is((select count(*)::integer from public.laboratorios where nome='Cadastro integrado'),0,'falha de funcionamento não deixa laboratório parcial');
select throws_ok($$select public.salvar_laboratorio_completo(pg_temp.lab_dados(),'[{"dia_semana":1,"inicio":"08:00","fim":"18:00","duracao_slot_minutos":60},{"dia_semana":1,"inicio":"10:00","fim":"12:00","duracao_slot_minutos":60}]',pg_temp.lab_itens())$$,'P0001','JANELAS_SOBREPOSTAS','sobreposição no mesmo dia é rejeitada');
select set_config('teste.lab_id',public.salvar_laboratorio_completo(pg_temp.lab_dados(),pg_temp.lab_janelas(),pg_temp.lab_itens())->>'id',true);
select is((select count(*)::integer from public.laboratorios where id=current_setting('teste.lab_id')::uuid),1,'laboratório criado');
select is((select count(*)::integer from public.janelas_horario where laboratorio_id=current_setting('teste.lab_id')::uuid),7,'funcionamento salvo na mesma transação');
select is((select count(*)::integer from public.equipamentos where laboratorio_id=current_setting('teste.lab_id')::uuid),1,'equipamento salvo na mesma transação');
select set_config('teste.equipamento_id',(select id::text from public.equipamentos where laboratorio_id=current_setting('teste.lab_id')::uuid),true);
select throws_ok($$select public.salvar_laboratorio_completo(pg_temp.lab_dados()||'{"nome":"Cadastro com patrimonio duplicado"}',pg_temp.lab_janelas(),pg_temp.lab_itens())$$,'23505',null,'patrimônio global duplicado é rejeitado');
select is((select count(*)::integer from public.laboratorios where nome='Cadastro com patrimonio duplicado'),0,'falha de equipamento desfaz o laboratório e funcionamento');
select throws_ok($$select public.salvar_laboratorio_completo('{"nome":"Cliente antigo"}',pg_temp.lab_janelas(),'[]',current_setting('teste.lab_id')::uuid)$$,'P0001','REVISAO_OBRIGATORIA','assinatura antiga não substitui horários em uma edição');
select ok((select count(*) from public.janelas_horario)>700,'fixture cruza limite global de 700 horários');
select ok((select count(*) from (select laboratorio_id from public.janelas_horario order by dia_semana limit 700) j where j.laboratorio_id=current_setting('teste.lab_id')::uuid)<7,'recorte global antigo perderia horários do laboratório editado');
select is((pg_temp.lab_snapshot()->>'total_janelas')::integer,7,'snapshot do laboratório inclui todos os horários apesar do volume global');
select is(jsonb_array_length(pg_temp.lab_snapshot()->'janelas'),7,'contagem do snapshot corresponde à lista completa');
select is((pg_temp.lab_snapshot()->>'total_equipamentos')::integer,1,'snapshot inclui a contagem de equipamentos');
select is(pg_temp.lab_snapshot()->'equipamentos'->0->>'id',current_setting('teste.equipamento_id'),'snapshot inclui o equipamento do laboratório');
select set_config('teste.janelas_antes',(select jsonb_agg(to_jsonb(j) order by id)::text from public.janelas_horario j where j.laboratorio_id=current_setting('teste.lab_id')::uuid),true);
select lives_ok($$select pg_temp.editar_lab('{"nome":"Laboratório editado"}')$$,'editar somente o nome preserva todos os componentes');
select is((select nome from public.laboratorios where id=current_setting('teste.lab_id')::uuid),'Laboratório editado','edição preserva o ID do laboratório');
select is((select id::text from public.equipamentos where laboratorio_id=current_setting('teste.lab_id')::uuid),current_setting('teste.equipamento_id'),'edição preserva o ID do equipamento');
select is((select jsonb_agg(to_jsonb(j) order by id) from public.janelas_horario j where j.laboratorio_id=current_setting('teste.lab_id')::uuid),current_setting('teste.janelas_antes')::jsonb,'editar só o nome mantém IDs e valores de todos os horários');
select throws_ok($$select pg_temp.editar_lab('{}',p_itens=>jsonb_build_array((pg_temp.lab_itens_existentes()->0),(pg_temp.lab_itens_existentes()->0)))$$,'P0001','EQUIPAMENTO_DUPLICADO','ID duplicado não sobrescreve equipamento silenciosamente');
reset role;
insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status) values ('c5400000-0000-4000-8000-000000000001',current_setting('teste.lab_id')::uuid,'c5100000-0000-4000-8000-000000000002',(current_date+10+time '10:00') at time zone 'America/Sao_Paulo',(current_date+10+time '11:00') at time zone 'America/Sao_Paulo','equipamentos','Atividade para preservar histórico',10,1,'aluno','aprovada');
insert into public.reserva_equipamentos(reserva_id,equipamento_id,quantidade) values ('c5400000-0000-4000-8000-000000000001',current_setting('teste.equipamento_id')::uuid,5);
insert into public.laboratorios(id,nome,tipo,capacidade,localizacao,modo_reserva) values ('c5200000-0000-4000-8000-000000000002','Outro laboratório','redes',30,'Outro bloco','slot_fixo');
insert into public.equipamentos(id,laboratorio_id,nome,quantidade) values ('c5300000-0000-4000-8000-000000000002','c5200000-0000-4000-8000-000000000002','Outro equipamento',10);
insert into public.janelas_horario(id,laboratorio_id,dia_semana,inicio,fim,duracao_slot_minutos)
  values ('c5500000-0000-4000-8000-000000000002','c5200000-0000-4000-8000-000000000002',6,'23:00:15','23:59:30',30);
set local role authenticated;
select lives_ok($$select pg_temp.editar_lab('{"descricao":"Descrição atualizada"}')$$,'edição compatível preserva reserva aprovada');
select set_config('teste.antes_reserva',pg_temp.lab_snapshot()::text,true);
select throws_ok($$
  select pg_temp.editar_lab(
    '{"nome":"Mudança inválida"}',
    pg_temp.lab_particao(p_alterar=>(
      select jsonb_agg(jsonb_build_object('id',j.id,'dia_semana',j.dia_semana,'inicio','12:00','fim',j.fim,'duracao_slot_minutos',j.duracao_slot_minutos))
      from public.janelas_horario j where j.laboratorio_id=current_setting('teste.lab_id')::uuid
    )),
    jsonb_build_array((pg_temp.lab_itens_existentes()->0)||'{"nome":"Equipamento alterado"}')
  )
$$,'P0001','FORA_DA_JANELA','horários incompatíveis com aprovação são rejeitados');
select is(pg_temp.lab_snapshot(),current_setting('teste.antes_reserva')::jsonb,'falha de revalidação preserva integralmente laboratório, horários e equipamento');
select throws_ok($$select pg_temp.editar_lab('{}',p_itens=>jsonb_build_array((pg_temp.lab_itens_existentes()->0)||'{"status":"inativo"}'))$$,'P0001','EQUIPAMENTO_INDISPONIVEL','não desativa equipamento exigido por aprovação');
select is((select status from public.equipamentos where id=current_setting('teste.equipamento_id')::uuid),'ativo','remoção rejeitada preserva estoque ativo');
select throws_ok($$select pg_temp.editar_lab('{}',p_itens=>jsonb_build_array((pg_temp.lab_itens_existentes()->0)||'{"quantidade":2}'))$$,'P0001','EQUIPAMENTO_INDISPONIVEL','estoque não pode ficar abaixo da reserva aprovada');
select throws_ok($$select pg_temp.editar_lab('{}',p_itens=>jsonb_build_array((pg_temp.lab_itens_existentes()->0)||'{"id":"c5300000-0000-4000-8000-000000000002"}'))$$,'P0001','EQUIPAMENTO_OUTRO_LABORATORIO','ID de outro laboratório não pode ser alterado');
select is((select status from public.reservas where id='c5400000-0000-4000-8000-000000000001'),'aprovada','edição nunca cancela ou apaga aprovação');
select lives_ok($$select pg_temp.editar_lab('{"nome":"Edição sem inventário"}')$$,'omissão de equipamento preserva o inventário existente');
select is((select status from public.equipamentos where id=current_setting('teste.equipamento_id')::uuid),'ativo','equipamento omitido continua disponível para a aprovação');
reset role;
update public.reservas set status='concluida' where id='c5400000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select pg_temp.editar_lab('{}',p_itens=>jsonb_build_array((pg_temp.lab_itens_existentes()->0)||'{"status":"inativo"}'))$$,'equipamento sem uso futuro pode ser retirado do inventário ativo');
select is((select status from public.equipamentos where id=current_setting('teste.equipamento_id')::uuid),'inativo','equipamento removido é desativado');
select is((select count(*)::integer from public.reserva_equipamentos where reserva_id='c5400000-0000-4000-8000-000000000001'),1,'vínculo histórico do equipamento continua salvo');
select is((select status from public.reservas where id='c5400000-0000-4000-8000-000000000001'),'concluida','histórico da reserva continua salvo');
reset role;
select ok(exists(select 1 from public.audit_log where acao='salvar_laboratorio_completo' and entidade_id=current_setting('teste.lab_id')::uuid and depois ?& array['laboratorio','janelas','equipamentos']),'auditoria registra o conjunto salvo');
select is((select count(*)::integer from public.audit_log where acao='editar_laboratorio_completo' and entidade_id=current_setting('teste.lab_id')::uuid),4,'somente edições bem sucedidas registram auditoria');
select ok(exists(select 1 from public.audit_log where acao='editar_laboratorio_completo' and entidade_id=current_setting('teste.lab_id')::uuid and antes ?& array['laboratorio','janelas','equipamentos'] and depois ?& array['laboratorio','janelas','equipamentos']),'auditoria da edição preserva antes e depois do conjunto');

set local role authenticated;
select throws_ok($$select pg_temp.editar_lab('{"nome":"Omitido"}',pg_temp.lab_particao() || jsonb_build_object('manter',(pg_temp.lab_particao()->'manter')-0))$$,'P0001','FUNCIONAMENTO_INCOMPLETO','omitir um horário sem remoção explícita invalida a edição');
select throws_ok($$select pg_temp.editar_lab('{"nome":"Duplicado"}',pg_temp.lab_particao() || jsonb_build_object('remover',jsonb_build_array(pg_temp.lab_particao()->'manter'->0)))$$,'P0001','FUNCIONAMENTO_INCOMPLETO','o mesmo ID não pode ser mantido e removido');
select throws_ok($$select pg_temp.editar_lab('{"nome":"ID alheio"}',pg_temp.lab_particao() || jsonb_build_object('manter',((pg_temp.lab_particao()->'manter')-0)||jsonb_build_array('c5500000-0000-4000-8000-000000000002')))$$,'P0001','FUNCIONAMENTO_INCOMPLETO','um ID de outro laboratório não substitui o ID omitido');
select is(pg_temp.lab_snapshot()->'laboratorio'->>'nome','Edição sem inventário','cargas incompletas não alteram o laboratório');
select set_config('teste.revisao_a',pg_temp.lab_snapshot()->>'revisao',true);
select set_config('teste.particao_a',pg_temp.lab_particao()::text,true);
select lives_ok($$select pg_temp.editar_lab('{}',pg_temp.lab_particao(p_novas=>'[{"dia_semana":6,"inicio":"18:00","fim":"20:00","duracao_slot_minutos":60}]'))$$,'primeira aba adiciona um horário');
select set_config('teste.nova_janela',(select id::text from public.janelas_horario where laboratorio_id=current_setting('teste.lab_id')::uuid and dia_semana=6 and inicio='18:00'),true);
select throws_ok($$select pg_temp.editar_lab('{"nome":"Edição antiga"}',current_setting('teste.particao_a')::jsonb,p_revisao=>current_setting('teste.revisao_a'))$$,'P0001','REVISAO_DESATUALIZADA','segunda aba com revisão anterior é recusada');
select ok(exists(select 1 from public.janelas_horario where id=current_setting('teste.nova_janela')::uuid),'horário recém-adicionado sobrevive à tentativa desatualizada');
select lives_ok($$select pg_temp.editar_lab('{}',pg_temp.lab_particao(p_remover=>jsonb_build_array(current_setting('teste.nova_janela'))))$$,'remoção explícita do horário informado é aceita');
select is((select jsonb_agg(to_jsonb(j) order by id) from public.janelas_horario j where j.laboratorio_id=current_setting('teste.lab_id')::uuid),current_setting('teste.janelas_antes')::jsonb,'remoção explícita preserva exatamente os demais horários');
select set_config('teste.revisao_a',pg_temp.lab_snapshot()->>'revisao',true);
select set_config('teste.particao_a',pg_temp.lab_particao()::text,true);
select public.salvar_janela_horario(jsonb_build_object('laboratorio_id',current_setting('teste.lab_id'),'dia_semana',6,'inicio','18:00','fim','20:00','duracao_slot_minutos',60));
select throws_ok($$select pg_temp.editar_lab('{"nome":"Edição antes da aba individual"}',current_setting('teste.particao_a')::jsonb,p_revisao=>current_setting('teste.revisao_a'))$$,'P0001','REVISAO_DESATUALIZADA','edição na aba individual também invalida o retrato antigo');

reset role;
insert into public.janelas_horario(laboratorio_id,dia_semana,inicio,fim,duracao_slot_minutos)
  select 'c5200000-0000-4000-8000-000000000002',dia,time '00:00'+n*interval '30 minutes',time '00:00'+(n+1)*interval '30 minutes',30
  from generate_series(1,2) dia cross join generate_series(0,24) n;
select set_config('teste.lab_id','c5200000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((pg_temp.lab_snapshot()->>'total_janelas')::integer,51,'snapshot entrega todos os horários de laboratório legado acima de 50');
select set_config('teste.janelas_legadas', (pg_temp.lab_snapshot()->'janelas')::text,true);
select lives_ok($$select pg_temp.editar_lab('{"nome":"Renomeado sem alterar legado"}')$$,'edição cadastral permite preservar horários legados acima de 50');
select is(pg_temp.lab_snapshot()->'janelas',current_setting('teste.janelas_legadas')::jsonb,'IDs, horários legados com segundos e valores intactos permanecem iguais');
select is(pg_temp.lab_snapshot()->'laboratorio'->>'nome','Renomeado sem alterar legado','edição cadastral salva mesmo com horários legados');
reset role;
select * from finish();
rollback;
