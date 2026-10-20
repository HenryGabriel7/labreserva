-- APENAS desenvolvimento local: senha compartilhada DevOnly!123456.
-- Nunca execute este seed em produção. Os dados não concedem papéis por metadata.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
select '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,
  extensions.crypt('DevOnly!123456',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),'','','',''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid,'admin@horizonte.edu.br'),
  ('00000000-0000-4000-8000-000000000002'::uuid,'professor@horizonte.edu.br'),
  ('00000000-0000-4000-8000-000000000003'::uuid,'funcionario@horizonte.edu.br'),
  ('00000000-0000-4000-8000-000000000004'::uuid,'monitor@horizonte.edu.br'),
  ('00000000-0000-4000-8000-000000000005'::uuid,'aluno@horizonte.edu.br')
) s(id,email) on conflict(id) do nothing;
insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
select gen_random_uuid(),u.id,u.id::text,jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',true),'email',now(),now(),now()
from auth.users u where u.id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005')
on conflict(provider_id,provider) do nothing;
insert into public.profiles(id,nome,email,matricula) values
 ('00000000-0000-4000-8000-000000000001','Ana Administradora','admin@horizonte.edu.br','ADM001'),
 ('00000000-0000-4000-8000-000000000002','Marcos Professor','professor@horizonte.edu.br','PROF001'),
 ('00000000-0000-4000-8000-000000000003','Clara Funcionária','funcionario@horizonte.edu.br','FUNC001'),
 ('00000000-0000-4000-8000-000000000004','Rafael Monitor','monitor@horizonte.edu.br','MON001'),
 ('00000000-0000-4000-8000-000000000005','Lia Estudante','aluno@horizonte.edu.br','ALU001')
on conflict(id) do nothing;
insert into public.user_roles(user_id,papel) values
 ('00000000-0000-4000-8000-000000000001','admin'),
 ('00000000-0000-4000-8000-000000000002','professor'),
 ('00000000-0000-4000-8000-000000000003','funcionario'),
 ('00000000-0000-4000-8000-000000000004','monitor'),
 ('00000000-0000-4000-8000-000000000004','aluno'),
 ('00000000-0000-4000-8000-000000000005','aluno') on conflict(user_id,papel) do nothing;
insert into public.laboratorios(id,nome,tipo,capacidade,localizacao,descricao,regras_de_uso,modo_reserva,granularidade_minutos,duracao_minima_minutos,duracao_maxima_minutos) values
 ('10000000-0000-4000-8000-000000000001','Laboratório de Redes','redes',30,'Bloco A · Sala 101','Roteadores, switches e bancadas para atividades de conectividade.','Organize os cabos e desligue os equipamentos ao finalizar.','slot_fixo',15,60,240),
 ('10000000-0000-4000-8000-000000000002','Laboratório de Informática','informatica',40,'Bloco A · Sala 204','Estações de trabalho para desenvolvimento e pesquisa.','Não instale programas sem autorização.','intervalo_livre',15,30,240),
 ('10000000-0000-4000-8000-000000000003','Laboratório de Química','quimica',24,'Bloco B · Sala 103','Bancadas com infraestrutura para práticas experimentais.','Jaleco, calçado fechado e óculos de proteção são obrigatórios.','slot_fixo',30,60,180),
 ('10000000-0000-4000-8000-000000000004','Laboratório de Anatomia','anatomia',20,'Bloco C · Sala 102','Modelos anatômicos e recursos para estudos de saúde.','Higienize as mãos e preserve os modelos anatômicos.','intervalo_livre',30,60,240)
on conflict(id) do nothing;
insert into public.janelas_horario(laboratorio_id,dia_semana,inicio,fim,duracao_slot_minutos)
select l.id,d,'08:00'::time,'22:00'::time,60 from public.laboratorios l cross join generate_series(1,5) d on conflict(laboratorio_id,dia_semana,inicio,fim) do nothing;
insert into public.equipamentos(id,laboratorio_id,nome,patrimonio,quantidade,status,reservavel_individualmente) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Kit de roteadores','RED-001',10,'ativo',true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Switch gerenciável','RED-002',8,'ativo',true),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Computador desktop','INF-001',40,'ativo',false),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Projetor multimídia','INF-002',2,'ativo',true),
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000003','Microscópio','QUI-001',12,'ativo',true),
 ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000003','Centrífuga','QUI-002',1,'manutencao',true),
 ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000004','Modelo anatômico','ANA-001',10,'ativo',true),
 ('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000004','Esqueleto articulado','ANA-002',3,'ativo',true)
on conflict(id) do nothing;
insert into public.monitor_laboratorios(monitor_id,laboratorio_id) select '00000000-0000-4000-8000-000000000004',l.id from public.laboratorios l where l.tipo in ('redes','informatica') on conflict(monitor_id,laboratorio_id) do nothing;

-- Próxima segunda-feira, no fuso da instituição. Registros antigos servem ao histórico.
with base as (select (date_trunc('week',now() at time zone 'America/Sao_Paulo')+interval '7 days')::date as dia), dados as (
 select * from (values
 ('30000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000005'::uuid,0,10,1,'pendente',1,'aluno','Prática de configuração de redes'),
 ('30000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000002'::uuid,'00000000-0000-4000-8000-000000000002'::uuid,0,14,2,'aprovada',2,'professor','Aula de programação orientada a objetos'),
 ('30000000-0000-4000-8000-000000000003'::uuid,'10000000-0000-4000-8000-000000000003'::uuid,'00000000-0000-4000-8000-000000000003'::uuid,1,9,1,'recusada',2,'funcionario','Preparação de materiais didáticos'),
 ('30000000-0000-4000-8000-000000000004'::uuid,'10000000-0000-4000-8000-000000000004'::uuid,'00000000-0000-4000-8000-000000000005'::uuid,2,10,1,'cancelada',1,'aluno','Grupo de estudos de anatomia'),
 ('30000000-0000-4000-8000-000000000005'::uuid,'10000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000002'::uuid,-7,10,2,'concluida',2,'professor','Prática de endereçamento IPv6'),
 ('30000000-0000-4000-8000-000000000006'::uuid,'10000000-0000-4000-8000-000000000002'::uuid,'00000000-0000-4000-8000-000000000005'::uuid,-7,14,1,'no_show',1,'aluno','Pesquisa em acervo digital'),
 ('30000000-0000-4000-8000-000000000007'::uuid,'10000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000005'::uuid,-7,10,2,'substituida',1,'aluno','Projeto de comunicação de dados')
 ) x(id,lab,usuario,deslocamento,hora,duracao,status,prioridade,papel,finalidade)
)
insert into public.reservas(id,laboratorio_id,solicitante_id,inicio,fim,escopo,finalidade,n_participantes,prioridade_efetiva,papel_solicitante,status,decidido_por,decidido_em,motivo)
select d.id,d.lab,d.usuario,(b.dia+d.deslocamento+make_time(d.hora,0,0)) at time zone 'America/Sao_Paulo',(b.dia+d.deslocamento+make_time(d.hora+d.duracao,0,0)) at time zone 'America/Sao_Paulo','laboratorio',d.finalidade,15,d.prioridade,d.papel,d.status,
 case when d.status<>'pendente' then '00000000-0000-4000-8000-000000000001'::uuid end,case when d.status<>'pendente' then now() end,
 case d.status when 'recusada' then 'Atividade necessita de acompanhamento técnico.' when 'cancelada' then 'Atividade reagendada pelo solicitante.' when 'no_show' then 'Ausência após a tolerância de check-in.' when 'substituida' then 'Prioridade de atividade curricular do professor.' when 'aprovada' then 'Atividade curricular aprovada.' end
from dados d cross join base b on conflict(id) do nothing;
insert into public.reserva_equipamentos(reserva_id,equipamento_id,quantidade) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',3),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004',1) on conflict(reserva_id,equipamento_id) do nothing;
insert into public.checkins(reserva_id,monitor_id,entrada,saida,observacoes) select id,'00000000-0000-4000-8000-000000000004',inicio,fim,'Bancadas organizadas após a atividade.' from public.reservas where id='30000000-0000-4000-8000-000000000005' on conflict(reserva_id) do nothing;
select public._notificar_reserva('30000000-0000-4000-8000-000000000001','reserva_criada',false,true);
select public._notificar_reserva('30000000-0000-4000-8000-000000000002','reserva_aprovada');
