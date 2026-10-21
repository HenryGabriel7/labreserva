# LabReserva

Sistema institucional de reserva de laboratórios em português, com Next.js 16 App Router, TypeScript strict, Tailwind/shadcn, React Hook Form, Zod e Supabase. O banco controla autorização, concorrência, prioridade, substituição, recorrência e auditoria. E-mails saem por uma fila transacional, com Edge Function e Resend.

Inclui catálogo e disponibilidade, solicitações e histórico, painel do monitor, check-in/out, ocorrências com fotos, cadastros, usuários/CSV, configurações, relatórios CSV/PDF e exportação de dados pessoais. Horários em `America/Sao_Paulo`; banco em UTC.

## Executar a interface

Requisitos: Node.js 24 e npm. O `package-lock.json` fixa as dependências usadas.

```sh
npm ci
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). No PowerShell, use `npm.cmd` e `npx.cmd` quando a política de execução bloquear `npm.ps1`; não é necessário alterar essa política.

Sem `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`, a interface mostra uma demonstração identificada, somente de leitura. Não autentica usuários nem grava reservas. Com Supabase configurado, falhas de conexão produzem erro; não são substituídas por exemplos.

## Supabase local e variáveis

É necessário Docker em execução. O CLI Supabase está nas dependências do projeto.

```sh
npx supabase start
npm run db:reset
```

`db:reset` apaga e recria **o banco local** com migrações e seed; use somente em desenvolvimento. As portas são API `54321`, Postgres `54322` e Studio `54323`.

Copie `.env.example` para `.env.local` e preencha os valores locais. `APP_URL` deve ser uma origem, sem caminho ou parâmetros; em desenvolvimento, `http://localhost:3000`.

| Variável                          | Uso                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `APP_URL`                         | Origem da aplicação para links e validação de Origin; HTTPS em produção.                     |
| `SUPABASE_URL`                    | URL da API Supabase.                                                                         |
| `SUPABASE_PUBLISHABLE_KEY`        | Chave publicável; o SDK também aceita `ANON_KEY` legada local.                               |
| `SUPABASE_SERVICE_ROLE_KEY`       | Operações administrativas no servidor, bootstrap e testes locais. Nunca enviar ao navegador. |
| `RESEND_API_KEY`                  | Credencial de e-mail.                                                                        |
| `RESEND_FROM`                     | Nome/endereço de domínio verificado no Resend.                                               |
| `RESEND_WEBHOOK_SECRET`           | Assinatura do webhook no Next.                                                               |
| `NOTIFICATION_WORKER_SECRET`      | Invocação da Edge Function; mínimo 32 caracteres.                                            |
| `NOTIFICATION_UNSUBSCRIBE_SECRET` | HMAC de descadastro; mesmo valor no Next e worker, mínimo 32 caracteres.                     |

As variáveis são de servidor, sem prefixo `NEXT_PUBLIC_*`. URL e chave publicável não são segredos; a factory browser só as recebe explicitamente. `.env*` é ignorado pelo Git, exceto o exemplo sem valores.

Para disponibilizar as credenciais locais também aos testes no PowerShell, capture o status sem imprimir seu conteúdo:

```powershell
$estadoLocal = npx.cmd supabase status --output json | ConvertFrom-Json
$env:SUPABASE_URL = $estadoLocal.API_URL
$env:SUPABASE_PUBLISHABLE_KEY = $estadoLocal.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $estadoLocal.SERVICE_ROLE_KEY
$env:APP_URL = "http://localhost:3000"
npm.cmd run dev
```

Se o CLI retornar `PUBLISHABLE_KEY`, use esse campo no lugar de `ANON_KEY`. Não publique o JSON de status nem os valores de serviço. Next e os scripts de integração/E2E leem `.env.local`; variáveis já exportadas no shell prevalecem. A captura acima é uma alternativa para trabalhar sem manter as credenciais em arquivo.

## Contas do seed — somente desenvolvimento

A senha compartilhada é `DevOnly!123456`.

| Email                          | Papéis                                           |
| ------------------------------ | ------------------------------------------------ |
| `admin@horizonte.edu.br`       | Administrador                                    |
| `professor@horizonte.edu.br`   | Professor                                        |
| `funcionario@horizonte.edu.br` | Funcionário                                      |
| `monitor@horizonte.edu.br`     | Monitor + aluno; vinculado a Redes e Informática |
| `aluno@horizonte.edu.br`       | Aluno                                            |

O seed cria quatro laboratórios, equipamentos, funcionamento e reservas em vários estados. Não executar em produção nem usar essa senha fora do desenvolvimento. O cadastro público permanece desabilitado.

## Primeiro administrador em um banco novo

Em produção, aplicar as migrações **sem seed**. Um operador com acesso ao servidor cria o primeiro administrador com um arquivo de variáveis ignorado pelo Git, por exemplo `.env.bootstrap.local`, contendo `APP_URL`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do destino correto:

```sh
node --env-file=.env.bootstrap.local scripts/primeiro-admin.mjs --email admin@instituicao.edu.br --nome "Nome completo" --matricula ADM001
```

A CLI verifica se já existe qualquer papel `admin`, gera o convite com `auth.admin.generateLink({ type: 'invite' })` e chama `inicializar_administrador`. Essa RPC service-only usa lock global e cria perfil, papel, auditoria e convite essencial na fila em uma transação. Recusa um segundo bootstrap, inclusive com administrador inativo. Nenhum token ou link é impresso; há limite por email antes de gerar outro convite.

Configure worker e Resend antes desse passo. O destinatário abre `/auth/confirm`, o servidor confirma com `verifyOtp` e permite definir a senha. Se o banco falhar depois de Auth criar a identidade, ela pode permanecer sem perfil e sem acesso; não há exclusão automática de contas. Aguarde o limite de dez minutos antes de repetir uma tentativa e investigue o erro de provisionamento.

Depois do primeiro acesso, use **Usuários** para criar contas ou importar CSV com cabeçalho `nome,email,matricula,papeis`; papéis acumulados são separados por `|`. Esse fluxo exige administrador autenticado e usa `provisionar_usuario`, que valida o ator e enfileira o convite. Desativar preserva o histórico.

## Verificação

| Comando                        | Finalidade                                                         |
| ------------------------------ | ------------------------------------------------------------------ |
| `npm run dev`                  | Desenvolvimento em `3000`.                                         |
| `npm run build` / `npm start`  | Build e servidor Next de produção.                                 |
| `npm run lint`                 | ESLint sem warnings permitidos.                                    |
| `npm run typecheck`            | TypeScript strict sem emissão.                                     |
| `npm test`                     | Unidade Vitest.                                                    |
| `npm run test:db:smoke`        | SQL/RLS/RPC no PostgreSQL WASM (`node scripts/validar-banco.mjs`). |
| `npm run test:db`              | pgTAP no Supabase local real.                                      |
| `npm run test:integration`     | Concorrência HTTP, Auth, convite, revogação e conta inativa.       |
| `npm run test:e2e`             | Playwright, 360 px, axe e fluxos autenticados quando configurados. |
| `npm run format`               | Prettier.                                                          |
| `npm audit --audit-level=high` | Auditoria das dependências.                                        |

Para navegador sem Docker:

```sh
npm run build
npx playwright install chromium
npm run test:e2e -- --project=demo-desktop --project=demo-mobile-360
```

QA usa `3101` para demonstração e `3100` para Supabase. Para os fluxos reais, exporte as três variáveis Supabase locais e `APP_URL=http://127.0.0.1:3100` no shell; execute `npm run test:db`, `npm run test:integration` e `npm run test:e2e`.

Os testes com service_role recusam hosts remotos. Sem Supabase, casos autenticados aparecem como **skipped**, não como aprovados; no CI, ausência de serviços é erro. O harness WASM usa adaptadores declarados de Auth, Storage, Vault, cron/net e TAP: exercita SQL e RLS, mas não substitui GoTrue, PostgREST, pgTAP nativo nem concorrência multiconexão. Veja [TESTES](docs/TESTES.md), [PROGRESSO](docs/PROGRESSO.md) e [EMAIL](docs/EMAIL.md) para evidências, worker Deno e validação de entrega.

## Implantar em Vercel + Supabase

1. Crie um projeto Supabase separado. Vincule o CLI com `npx supabase link --project-ref SEU_PROJECT_REF` e aplique `npx supabase db push`. Substitua `SEU_PROJECT_REF` pelo identificador real. Não use `--include-seed` em produção.
2. No Auth hospedado, mantenha o provider **Email habilitado**, desabilite novos cadastros e imponha mínimo de 12 caracteres com maiúscula, minúscula, número e símbolo. Pela Management API, isso corresponde a `external_email_enabled=true` e `disable_signup=true`. No `config.toml`, a combinação equivalente é `[auth] enable_signup=false` e `[auth.email] enable_signup=true`: a segunda opção controla o provider, inclusive o login de contas existentes. Configure Site URL e redirects restritos, incluindo `/auth/confirm` e `/definir-senha`.
3. Importe o repositório na Vercel como Next.js, Node.js 24, instalação `npm ci` e build `npm run build`. Cadastre as variáveis no ambiente correto, com `APP_URL` na origem HTTPS definitiva. Não habilite exportação estática: há SSR, Server Actions, Route Handlers e `proxy.ts`.
4. Configure Resend, secrets, Vault e DNS; publique `processar-notificacoes` conforme [EMAIL](docs/EMAIL.md). Cadastre `/api/webhooks/resend` com assinatura obrigatória. Nenhuma credencial entra nas migrações.
5. Execute o bootstrap uma vez, abra o convite e confirme o primeiro acesso. Configure identidade visual, domínios permitidos, espaços, equipamentos, funcionamento e vínculos dos monitores.
6. Antes de liberar usuários reais, execute o CI com Supabase local e valide em homologação entrega, retry, supressão e jobs. Confirme o contato institucional e a política de retenção. A configuração de referência não constitui aprovação de produção.

O workflow prepara Supabase/Docker, pgTAP, integração real, build, audit e Playwright. Sua presença não significa que uma execução remota ocorreu. Neste computador não havia Docker nem credenciais Supabase/Resend; a validação desses serviços continua indicada no progresso.

## Organização

`src/app` contém páginas, ações e handlers; `src/components`, a interface; `src/lib`, autenticação, schemas e dados; `supabase/migrations`, tabelas/RLS/RPCs/jobs; `supabase/functions`, worker e provider/templates; `supabase/tests`, pgTAP; `tests`, unidade, integração e E2E.

Consulte também [ARQUITETURA](docs/ARQUITETURA.md), [SEGURANÇA](docs/SEGURANCA.md), [DECISÕES](docs/DECISOES.md) e [REQUISITOS](docs/REQUISITOS.md).
