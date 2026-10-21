begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();
select ok((select relrowsecurity from pg_class where oid='public.ocorrencia_uploads'::regclass),'lotes possuem RLS');
select ok(not has_table_privilege('anon','public.ocorrencia_uploads','SELECT,INSERT,UPDATE,DELETE'),'anon não acessa lotes');
select ok(not has_table_privilege('authenticated','public.ocorrencia_uploads','SELECT,INSERT,UPDATE,DELETE'),'cliente não acessa lotes nem altera claim');
select ok(has_table_privilege('service_role','public.ocorrencia_uploads','SELECT,INSERT,UPDATE,DELETE'),'servidor mantém acesso ao lote');
select ok((select not public and file_size_limit=5242880 and allowed_mime_types=array['image/jpeg','image/png','image/webp'] from storage.buckets where id='ocorrencias-temporarias'),'quarentena privada mantém teto de 5MiB e MIME restrito');

insert into public.ocorrencia_uploads(id,usuario_id,reserva_id,paths)
select 'e1400000-0000-4000-8000-000000000001',solicitante_id,id,array['temporario-sem-leitura'] from public.reservas limit 1;
insert into storage.objects(bucket_id,name) values('ocorrencias-temporarias','temporario-sem-leitura');

set local role anon;
select throws_ok($$select * from public.ocorrencia_uploads$$,'42501',null,'anon não consulta identificadores ou paths dos lotes');
reset role;
set local role authenticated;
select throws_ok($$update public.ocorrencia_uploads set estado='concluido'$$,'42501',null,'cliente não pode aprovar upload sem validar bytes');
select is((select count(*)::integer from storage.objects where bucket_id='ocorrencias-temporarias'),0,'cliente não lê arquivos ainda não validados');
select throws_ok($$insert into storage.objects(bucket_id,name) values('ocorrencias-temporarias','forjado')$$,'42501',null,'cliente não insere em quarentena sem assinatura do servidor');
reset role;

set local role service_role;
with claim as (update public.ocorrencia_uploads set estado='processando' where id='e1400000-0000-4000-8000-000000000001' and estado='pendente' and expira_em>now() returning id)
select is((select count(*)::integer from claim),1,'primeiro compare-and-set consome o lote');
with claim as (update public.ocorrencia_uploads set estado='processando' where id='e1400000-0000-4000-8000-000000000001' and estado='pendente' and expira_em>now() returning id)
select is((select count(*)::integer from claim),0,'segundo compare-and-set não reprocessa lote');
update public.ocorrencia_uploads set estado='pendente',expira_em=now()-interval '1 minute' where id='e1400000-0000-4000-8000-000000000001';
with claim as (update public.ocorrencia_uploads set estado='processando' where id='e1400000-0000-4000-8000-000000000001' and estado='pendente' and expira_em>now() returning id)
select is((select count(*)::integer from claim),0,'lote expirado não pode ser consumido');
reset role;
select * from finish();
rollback;
