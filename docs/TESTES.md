# Testes e limites de validação

## Camadas

| Camada              | Comando                              | O que comprova                                                                                                                                                   |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint e tipos        | `npm run lint` e `npm run typecheck` | Regras estáticas e TypeScript strict.                                                                                                                            |
| Unidade             | `npm test`                           | Schemas, prioridade, intervalos, recorrência, autorização, relatórios e notificações com dependências isoladas.                                                  |
| Worker Deno         | Comandos em `EMAIL.md`               | Tipos e teste do processamento de notificações, sem credenciais ou permissão de rede.                                                                            |
| PostgreSQL embutido | `node scripts/validar-banco.mjs`     | Migrações, seed, RLS e RPCs em PostgreSQL WASM com adaptadores explícitos. Não simula GoTrue, HTTP, concorrência, Storage real, cron ou pgTAP nativo.            |
| Banco Supabase real | `npm run test:db`                    | pgTAP executado pelo Supabase local com Docker.                                                                                                                  |
| Integração real     | `npm run test:integration`           | Oito aprovações em `Promise.all` com exatamente um sucesso, cadastro público recusado, convite com signup desabilitado, revogação de JWT direto e conta inativa. |
| E2E                 | `npm run test:e2e`                   | Chromium real: desktop e 360 px, navegação, formulário, leitura da demonstração, axe WCAG 2 A/AA e 2.1 AA; fluxos autenticados quando há Supabase local.         |

Os testes de integração e E2E autenticados recusam qualquer hostname fora de `127.0.0.1`, `localhost` e `::1` antes de usar `service_role`. Nunca aponte os testes a um projeto de produção. As credenciais de teste não são publicadas no HTML nem impressas pelo script de CI.

## Execução sem Docker

```sh
npm ci
npm run lint
npm run typecheck
npm test
node scripts/validar-banco.mjs
npm run build
npx playwright install chromium
npm run test:e2e -- --project=demo-desktop --project=demo-mobile-360
```

Playwright inicia `next start` em `127.0.0.1:3101`, usando o build de produção, com as variáveis Supabase explicitamente vazias. Não reutiliza um servidor desconhecido. Mantenha as portas 3100, 3101 e 3102 livres; o desenvolvimento usa 3000. Os servidores são encerrados ao final dos testes.

A demonstração possui 46 casos: 20 rotas com axe e verificação de overflow em cada viewport, mais três fluxos funcionais por viewport. São testados o painel, catálogo, detalhe e gestão de laboratórios, calendário, reservas e formulário, monitor, usuários, perfil, notificações, bloqueios, configurações, ocorrências, relatórios e privacidade dos relatórios, auditoria, ajuda, privacidade e login. A navegação também verifica o filtro do catálogo, as visões semanal/mensal e a validação de campos obrigatórios. Os tamanhos usados são 1440 × 1000 e 360 × 800 pixels.

`npm run test:integration` sem as três variáveis Supabase marca a suíte inteira como **skipped/não executada**, com o motivo no nome da suíte. O projeto `supabase-local` do Playwright também marca quatro casos como skipped quando falta configuração. Esses casos não contam como validação bem-sucedida. No CI, `REQUIRE_SUPABASE_TESTS=true` transforma configuração ausente em erro, impedindo um resultado verde por ausência de serviços.

## Execução com Supabase local

```sh
npx supabase start
npm run db:reset
npm run test:db
npx supabase status --output json
```

Transfira os valores locais `API_URL`, `ANON_KEY` (ou `PUBLISHABLE_KEY`) e `SERVICE_ROLE_KEY` para as variáveis de ambiente `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Não cole o JSON de status em logs públicos. Defina também `APP_URL=https://127.0.0.1:3100` e execute:

```sh
npm run test:integration
npm run build
npm run test:e2e
```

Os fluxos autenticados usam HTTPS local: `scripts/servidor-e2e-https.mjs` gera um certificado de um dia em uma pasta temporária com OpenSSL, atende somente `127.0.0.1:3100` e encaminha para o Next de produção em `127.0.0.1:3102`. O proxy preserva o Origin HTTPS, fixa Host/X-Forwarded-Proto/Port e reescreve apenas redirects absolutos da porta interna para a origem TLS; não registra requisições nem credenciais. O certificado e a chave são descartados ao encerrar normalmente. O runner Ubuntu já oferece OpenSSL; no Windows, o script procura também os binários incluídos no Git. Somente o projeto `supabase-local`, seus contextos de navegador e a verificação de prontidão desse servidor ignoram a confiança do certificado local. A aplicação mantém a exigência de HTTPS para convites em produção, sem exceção para QA.

Os testes criam usuários, papéis, laboratórios e janelas com identificadores aleatórios, exclusivamente no banco local. Usam a senha de desenvolvimento do seed, `DevOnly!123456`. Os solicitantes, professores e monitores são distintos; os monitores possuem vínculo explícito com o laboratório. Solicitações, decisões, substituição, cancelamento, check-in e check-out passam pelos formulários e Server Actions reais. O teste de convite usa a UI administrativa, lê o link na fila com service_role local e abre `/auth/confirm`; não chama o Resend nem o SMTP.

Para comprovar check-in sem esperar dois dias, uma fixture de testes desloca **somente o início e o fim da reserva QA já aprovada** para um minuto atrás e 59 minutos à frente. Não altera seu status e não cria caminho de teste no aplicativo. O monitor ainda precisa fazer check-in e check-out pelas ações reais. Esse ajuste só é permitido pelo helper com verificação de loopback. Execute `npm run db:reset` para descartar todas as fixtures locais quando terminar; o código do aplicativo nunca apaga contas.

A concorrência usa oito reservas pendentes no mesmo laboratório e intervalo, aprovadas com oito requisições HTTP simultâneas. Confere tanto os sete erros quanto exatamente uma linha aprovada no banco. A revogação copia o access token retornado por `signInWithPassword`, executa logout global e tenta leitura/RPC diretamente no PostgREST com esse token antigo, sem depender do proxy Next.

O teste de cadastro consulta também `/auth/v1/settings` e exige `external.email=true` com `disable_signup=true`. Assim, a recusa de signup não é aceita como prova quando o provider inteiro está desligado. O teste unitário de tooling preserva essa combinação no `config.toml`.

## CI

O workflow executa lint, tipos, unidade, check/test Deno, Supabase/Docker, reset, pgTAP real, integração, build, audit e E2E. O Deno 2.9.6 é executado pelo pacote npm, com os mesmos comandos documentados em `EMAIL.md`; o teste não recebe permissão de rede. `scripts/ci-env.mjs` lê o status local e grava as chaves no ambiente do job sem imprimir seus valores. O runner não recebe chave de Resend; a fila não realiza entregas externas. Chromium é instalado com as dependências do sistema. Falhas de axe são reportadas com regra, seletor e contraste; nenhuma regra é suprimida.

Os relatórios de navegador incluem somente o ambiente local de QA e ficam como artefato por sete dias. Traces dos fluxos autenticados ficam desligados para reduzir a retenção de links de convite nos artefatos. A validação automática de acessibilidade complementa a revisão manual de teclado e leitores de tela.

## Histórico de verificação

- Em 21/10/2026, Chromium executou os 46 casos de demonstração sobre o build de produção: **46 passaram**, em aproximadamente 1,2 minuto.
- As 20 rotas passaram nas regras axe WCAG 2 A/AA e 2.1 AA, nos dois tamanhos, sem supressão de regras e sem overflow horizontal a 360 px. Isso não equivale a uma certificação completa de acessibilidade.
- Verificações estáticas e testes de unidade/SQL embutido constam também em `PROGRESSO.md`.
- A execução de integração marcou os **cinco testes como skipped**, explicitamente pela ausência do Supabase local. Os **quatro casos E2E autenticados** permanecem não executados neste computador.
- Supabase real, pgTAP nativo, concorrência HTTP, revogação no GoTrue/PostgREST, cron e entrega de e-mail não foram validados neste computador sem Docker/Supabase local. As camadas de banco, integração e E2E autenticado permanecem obrigatórias no CI; entrega real de e-mail exige a configuração descrita em `EMAIL.md`.
- Na primeira [execução remota do CI](https://github.com/HenryGabriel7/labreserva/actions/runs/39661076622), as 204 asserções pgTAP passaram no Supabase real do runner. A integração teve um teste aprovado e quatro falhas com `Email logins are disabled`, interrompendo as etapas posteriores. A configuração do provider Email foi corrigida; o resultado da nova execução deve ser conferido antes do deploy.

## CI e produção — 22/10/2026

O [run 39832599914](https://github.com/HenryGabriel7/labreserva/actions/runs/39832599914), commit `558f554`, concluiu com sucesso: lint, tipos, 79 testes unitários em 14 arquivos, 216 asserções pgTAP nativas em nove arquivos, cinco integrações HTTP/Auth, Deno (um teste/quatro passos), build, npm audit e **50/50 E2E**. Os quatro fluxos autenticados passaram juntamente com os 46 casos de demonstração. A correção final ficou restrita à origem TLS dos redirects no proxy de QA; a aplicação de produção manteve sua exigência de HTTPS.

No site publicado, foram conferidos login e privacidade HTTP 200, ausência do modo de demonstração, redirecionamento da área interna para login, API administrativa HTTP 401 sem sessão, redirect de confirmação inválida na origem HTTPS correta e ausência de erros JavaScript. O Auth hospedado confirmou provider Email ativo e signup bloqueado; o acesso anônimo aos laboratórios e ao worker foi recusado.

Um teste do transporte de Storage usou uma imagem sintética de um pixel em um path UUID temporário no bucket privado: o Chromium enviou os bytes pela autorização assinada a partir da origem de produção, o download administrativo preservou o conteúdo, a leitura pública foi negada e o objeto foi removido pelo SDK. Isso comprova CORS/transporte e privacidade do bucket, sem consumir o convite do administrador ou criar reservas fictícias. A entrega real de e-mail permanece pendente pela ausência de Resend, e a revisão completa de ocorrências com fotos continua descrita em DEPLOY.md.
