# Progresso

## Etapa 1 — setup
- Feito: Next.js 16, TypeScript strict, Tailwind, componente shadcn, tokens institucionais, Vitest, ESLint, Prettier, Husky, scripts, CI básico.
- Verificação: em execução.
- Pendente: Docker/Supabase local não encontrados; validações de banco e integrações precisam de ambiente próprio.
- Próximo passo: migrações, RLS, RPCs e seed.

## Evidências do banco
- Migration, seed e 90 asserções SQL/RLS/RPC passaram no PostgreSQL WASM via `node scripts/validar-banco.mjs`.
- O harness substitui serviços Auth/Storage/Vault/cron/net e protocolo TAP por adaptadores declarados; não testa HTTP, GoTrue, agendamento ou concorrência multiconexão.
- `npm.cmd run test:db` foi tentado e falhou com ECONNREFUSED em 127.0.0.1:54322. Não há Docker disponível.
- Para validar Supabase real: `npx supabase start`, `npm run db:reset`, `npm run test:db`.

## Etapa 1 — Setup, tooling e layout
- Feito: implementação da etapa incluída neste commit.
- Verificado: lint, typecheck e Vitest passaram localmente.
- Pendente: testes Supabase/pgTAP e integração exigem Docker + serviços e credenciais; executar conforme README. Não foram considerados aprovados.
- Próximo passo: Banco, RLS, RPCs e seed.

## Etapa 2 — Banco, RLS, RPCs e seed
- Feito: implementação da etapa incluída neste commit.
- Verificado: lint, typecheck e Vitest passaram localmente.
- Pendente: testes Supabase/pgTAP e integração exigem Docker + serviços e credenciais; executar conforme README. Não foram considerados aprovados.
- Próximo passo: Auth, RBAC e contas.
