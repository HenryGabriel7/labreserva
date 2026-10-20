/**
 * PostgreSQL real em WASM. Verifica SQL/RLS/RPCs sem Docker.
 * NÃO substitui `supabase test db`: Auth, Storage, Vault, cron, net e o protocolo
 * pgTAP são adaptadores locais. Não testa GoTrue, HTTP, jobs nem concorrência.
 */
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
let total = 0;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions; create schema auth; create schema storage;
    create schema vault; create schema cron; create schema net;
    grant usage on schema auth,storage,extensions to authenticated,service_role;
    grant usage on schema extensions to anon;
    create table auth.users(instance_id uuid,id uuid primary key,aud text,role text,email text,encrypted_password text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz,confirmation_token text,email_change text,email_change_token_new text,recovery_token text);
    create table auth.identities(id uuid primary key,user_id uuid references auth.users(id),provider_id text,identity_data jsonb,provider text,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz,unique(provider_id,provider));
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public bool,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$ select 1::bigint $$;
  `);
  const migrations = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const migration of migrations) {
    const sql = (await readFile(`supabase/migrations/${migration}`, 'utf8')).replace(
      /^create extension if not exists (pg_cron|pg_net|supabase_vault).*;\r?\n/gm,
      '',
    );
    await db.exec(sql);
    console.log(`Migration carregada: ${migration}`);
  }
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  console.log('Seed executado no PostgreSQL embutido.');

  // Adaptador das seis asserções TAP usadas nas suites. Dynamic SQL é INVOKER:
  // SET ROLE authenticated/anon continua efetivo dentro de lives_ok/throws_ok.
  await db.exec(`
    create table extensions._tap_resultados(id bigint generated always as identity,passou boolean,descricao text);
    create function extensions._tap_registrar(p_passou boolean,p_descricao text) returns text language plpgsql security definer set search_path=extensions,pg_temp as $$
    declare v_id bigint; begin
      insert into extensions._tap_resultados(passou,descricao) values(coalesce(p_passou,false),p_descricao) returning id into v_id;
      return (case when coalesce(p_passou,false) then 'ok ' else 'not ok ' end)||v_id||' - '||p_descricao;
    end $$;
    create function extensions.no_plan() returns text language sql as $$ select '# Adaptador TAP local, sem extensao pgTAP' $$;
    create function extensions.ok(boolean,text) returns text language sql as $$ select extensions._tap_registrar($1,$2) $$;
    create function extensions.is(anyelement,anyelement,text) returns text language sql as $$ select extensions._tap_registrar($1 is not distinct from $2,$3) $$;
    create function extensions.lives_ok(p_sql text,p_descricao text) returns text language plpgsql as $$
    begin
      execute p_sql;
      return extensions._tap_registrar(true,p_descricao);
    exception when others then return extensions._tap_registrar(false,p_descricao||' ['||sqlstate||': '||sqlerrm||']'); end $$;
    create function extensions.throws_ok(p_sql text,p_estado text,p_mensagem text,p_descricao text) returns text language plpgsql as $$
    declare v_estado text; v_mensagem text;
    begin
      begin execute p_sql;
      exception when others then
        get stacked diagnostics v_estado=returned_sqlstate,v_mensagem=message_text;
        return extensions._tap_registrar(v_estado=p_estado and (p_mensagem is null or p_mensagem=v_mensagem),p_descricao||case when v_estado=p_estado and (p_mensagem is null or p_mensagem=v_mensagem) then '' else ' [recebido '||v_estado||': '||v_mensagem||']' end);
      end;
      return extensions._tap_registrar(false,p_descricao||' [nenhum erro]');
    end $$;
    create function extensions.finish() returns setof text language sql as $$ select '1..'||count(*) from extensions._tap_resultados $$;
    grant execute on all functions in schema extensions to anon,authenticated,service_role;
  `);
  const suites = (await readdir('supabase/tests')).filter((f) => f.endsWith('.sql')).sort();
  const falhas = [];
  for (const suite of suites) {
    const sql = (await readFile(`supabase/tests/${suite}`, 'utf8')).replace(
      /^create extension if not exists pgtap.*;\r?\n/gm,
      '',
    );
    const results = await db.exec(sql);
    let contagem = 0;
    for (const result of results) {
      for (const row of result.rows ?? []) {
        for (const value of Object.values(row)) {
          if (typeof value !== 'string') continue;
          if (/^(ok|not ok) \d+/.test(value)) contagem++;
          if (value.startsWith('not ok ')) falhas.push(`${suite}: ${value}`);
        }
      }
    }
    total += contagem;
    console.log(`${suite}: ${contagem} asserções exercitadas.`);
  }
  if (falhas.length) throw new Error(falhas.join('\n'));
  console.log(`${total} asserções passaram no PostgreSQL embutido; Supabase/pgTAP real permanece obrigatório.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error && typeof error === 'object' && 'position' in error) {
    console.error(`Posição SQL: ${error.position}`);
  }
  process.exitCode = 1;
} finally {
  await db.close();
}
