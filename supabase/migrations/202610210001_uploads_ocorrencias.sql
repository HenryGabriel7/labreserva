-- Quarentena sem leitura ou gravação direta pelas roles de cliente. As únicas
-- gravações são autorizações assinadas para paths gerados pelo servidor.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ocorrencias-temporarias','ocorrencias-temporarias',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

create table public.ocorrencia_uploads (
  id uuid primary key,
  usuario_id uuid not null references public.profiles(id),
  reserva_id uuid not null references public.reservas(id),
  paths text[] not null check(cardinality(paths) between 1 and 5),
  estado text not null default 'pendente' check(estado in ('pendente','processando','concluido','falhou')),
  expira_em timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ocorrencia_uploads_usuario_idx on public.ocorrencia_uploads(usuario_id);
create index ocorrencia_uploads_reserva_idx on public.ocorrencia_uploads(reserva_id);
create index ocorrencia_uploads_expira_idx on public.ocorrencia_uploads(expira_em);
alter table public.ocorrencia_uploads enable row level security;
revoke all on public.ocorrencia_uploads from public,anon,authenticated;
grant select,insert,update,delete on public.ocorrencia_uploads to service_role;
