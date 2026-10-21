# Progresso

## Preparação de produção — 21/10/2026

- Repositório publicado em `HenryGabriel7/labreserva`, branch `main`.
- A primeira execução remota do GitHub Actions (`39661076622`) aprovou lint, tipos, 64 testes unitários, worker Deno e **204 asserções pgTAP nativas no Supabase local do runner**. Essa evidência atualiza a pendência histórica de pgTAP abaixo.
- A integração teve um teste aprovado e quatro falhas por `Email logins are disabled`. Corrigido o provider de e-mail local: `[auth.email].enable_signup=true` habilita o login, enquanto `[auth].enable_signup=false` continua bloqueando o cadastro público. O teste HTTP confere os dois flags antes de testar o bloqueio de signup. A repetição do CI ainda é necessária.
- Projeto Supabase `hvcetcfairwfuyxlyynl` (`labreserva`) criado em `sa-east-1`, na organização `HenryGabriel7`. Aplicadas as oito migrações, sem seed de desenvolvimento: 18 tabelas públicas com RLS, dois buckets privados e dois jobs. Histórico alinhado às versões dos arquivos do repositório.
- Auth hospedado configurado para login por e-mail, cadastro público bloqueado, senha de 12 caracteres com complexidade e redirects somente em `https://labreserva.vercel.app`. O diff do CLI confirmou ausência de mudanças pendentes nos campos declarados.
- Projeto Vercel `labreserva` criado e conectado ao GitHub; domínio atribuído `labreserva.vercel.app`, Node 24 e cinco variáveis de produção cadastradas. Publicação e verificação HTTP em andamento.
- Corrigido o envio de fotos para usar Storage assinado e quarentena privada. As funções Vercel recebem JSON de até 16 KiB. Passaram lint, tipos, build, 79 testes unitários e 216 asserções SQL WASM.
- Após o ajuste de Auth, o CI `39663394086` aprovou 204 pgTAP nativos, cinco integrações reais, build, audit e 46 testes de demonstração. Os quatro E2E autenticados apontaram seletores de formulário e HTTP local incompatível com a guarda HTTPS de produção; a correção do ambiente de QA está em andamento.
- Resend ainda não configurado pelo proprietário. Convites e e-mails automáticos não foram enviados; nenhuma entrega foi afirmada como concluída.

---

Atualizado em 21/10/2026. As 11 etapas foram implementadas e commitadas em ordem. Cada checkpoint executa lint, typecheck e unidade antes de permitir o commit. A validação com os serviços reais permanece pendente pelas limitações de ambiente descritas abaixo.

## Etapas concluídas

| Etapa | Entrega                                                                  | Commit       |
| ----- | ------------------------------------------------------------------------ | ------------ |
| 1     | Setup Next.js 16, TypeScript strict, tooling, tokens e layout responsivo | `1bb9b9a`    |
| 2     | Migrações, RLS, RPCs, constraints, seed e testes de banco                | `15bb2da`    |
| 3     | Auth, RBAC, proxy, convites, recuperação e administração de contas       | `a0308d5`    |
| 4     | Cadastros de laboratórios, equipamentos, funcionamento e configurações   | `d644117`    |
| 5     | Solicitações, calendário e regras de conflito                            | `b62e941`    |
| 6     | Monitor, decisões, check-in/out, no-show e ocorrências com fotos         | `8a36a43`    |
| 7     | Recorrência, exceções e aprovação parcial de séries                      | `6e98b55`    |
| 8     | Fila transacional, worker, provider Resend, templates, webhook e jobs    | `485c23c`    |
| 9     | Relatórios CSV/PDF, exportação pessoal, anonimização e auditoria         | `b33d947`    |
| 10    | Hardening, sessão revogada, bootstrap, bloqueios e acessibilidade        | `33c810b`    |
| 11    | Playwright, integração, CI final e documentação                          | Neste commit |

Lint, typecheck e Vitest passaram em todos os checkpoints. A implementação inclui também o CRUD completo de bloqueios com prévia de reservas afetadas e motivo obrigatório para cancelamento, bootstrap service-only do primeiro administrador e captura sanitizada de IP/user-agent na auditoria, consolidados na etapa 10.

## Evidências locais

| Verificação                      | Resultado                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| ESLint e TypeScript strict       | Aprovados; repetidos nos checkpoints finais                                                |
| Vitest                           | 79 testes aprovados em 14 arquivos                                                         |
| Build Next.js de produção        | Aprovado                                                                                   |
| Auditoria npm                    | 0 vulnerabilidades                                                                         |
| SQL/RLS/RPC no PostgreSQL WASM   | 216 asserções aprovadas                                                                    |
| Worker Deno                      | Tipos aprovados; 1 teste com 4 passos aprovado, sem rede                                   |
| Chromium sobre build de produção | 46 casos aprovados: desktop 1440 × 1000 e celular 360 × 800                                |
| Axe e largura da interface       | 20 rotas nos dois tamanhos, sem violações nas regras verificadas e sem overflow horizontal |

O harness WASM executa migrações, seed, RLS e RPCs, mas usa adaptadores declarados para Auth, Storage, Vault, cron/net e protocolo TAP. Não comprova GoTrue, PostgREST, pgTAP nativo, entrega de e-mail ou concorrência multiconexão. O teste offline do worker usa provider simulado. As verificações axe não representam certificação completa de acessibilidade. Os comandos, escopo e resultados estão em [TESTES](TESTES.md) e [EMAIL](EMAIL.md).

## Pendente por ambiente

Não há Docker nem credenciais Supabase/Resend neste computador. A tentativa de `npm run test:db` falhou com `ECONNREFUSED` em `127.0.0.1:54322`. Os cinco casos de integração foram explicitamente ignorados; os quatro E2E autenticados permanecem não executados. Nenhuma execução remota do GitHub Actions foi afirmada como aprovada.

Com Docker instalado, execute no ambiente local de desenvolvimento:

```sh
npx supabase start
npm run db:reset
npm run test:db
```

Configure as três variáveis Supabase locais e `APP_URL=http://127.0.0.1:3100`, conforme [README](../README.md), e execute:

```sh
npm run test:integration
npm run build
npm run test:e2e
```

Essas etapas devem comprovar pgTAP nativo, oito aprovações HTTP simultâneas com exatamente um sucesso, bloqueio de signup público, convite administrativo, sessão revogada/inativa e os quatro fluxos completos autenticados. O CI exige os serviços e falha se faltarem credenciais locais; não aceita skips silenciosos como aprovação.

Antes de liberar produção, configurar Vercel, Supabase Auth/Storage/Vault/cron e Resend/DNS, executar o bootstrap e validar em homologação entrega real, retry, supressão, descadastro e jobs conforme [EMAIL](EMAIL.md). Confirmar também o contato institucional e a retenção documentada em [SEGURANCA](SEGURANCA.md).

## Próximo passo operacional

Provisionar os serviços e executar as verificações de integração acima. A interface sem configuração funciona como demonstração identificada e somente de leitura; não autentica nem grava dados.

## Etapa 10 — Hardening e acessibilidade

- Feito: implementação da etapa incluída neste commit.
- Verificado: lint, typecheck e Vitest passaram localmente.
- Pendente: testes Supabase/pgTAP e integração exigem Docker + serviços e credenciais; executar conforme README. Não foram considerados aprovados.
- Próximo passo: E2E, CI e documentação.

## Etapa 11 — E2E, CI e documentação

- Feito: implementação da etapa incluída neste commit.
- Verificado: lint, typecheck e Vitest passaram localmente.
- Pendente: testes Supabase/pgTAP e integração exigem Docker + serviços e credenciais; executar conforme README. Não foram considerados aprovados.
- Próximo passo: provisionar serviços e executar validação de integração completa.
