# Testes e limites de validação

## Camadas

| Camada              | Comando                              | O que comprova                                                                                                                                                          |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint e tipos        | `npm run lint` e `npm run typecheck` | Regras estáticas e TypeScript strict.                                                                                                                                   |
| Unidade             | `npm test`                           | Schemas, prioridade, intervalos, recorrência, autorização, relatórios e notificações com dependências isoladas.                                                         |
| Worker Deno         | Comandos em `EMAIL.md`               | Tipos e teste do processamento de notificações, sem credenciais ou permissão de rede.                                                                                   |
| PostgreSQL embutido | `node scripts/validar-banco.mjs`     | Migrações, seed, RLS e RPCs em PostgreSQL WASM com adaptadores explícitos. Não simula GoTrue, HTTP, concorrência, Storage real, cron ou pgTAP nativo.                   |
| Banco Supabase real | `npm run test:db`                    | pgTAP executado pelo Supabase local com Docker.                                                                                                                         |
| Integração real     | `npm run test:integration`           | Oito aprovações em `Promise.all` com exatamente um sucesso, cadastro público recusado, convite com signup desabilitado, revogação de JWT direto e conta inativa.        |
| E2E                 | `npm run test:e2e`                   | Chrome/Chromium real: desktop e 320/360/390 px, navegação, formulário, leitura da demonstração, axe WCAG 2 A/AA e 2.1 AA; fluxos autenticados quando há Supabase local. |

Os testes automatizados de integração e o projeto E2E `supabase-local` recusam qualquer hostname fora de `127.0.0.1`, `localhost` e `::1` antes de usar `service_role`. Nunca aponte essas suítes a um projeto de produção. As credenciais de teste não são publicadas no HTML nem impressas pelo script de CI. A verificação manual remota expressamente autorizada nesta rodada usa um script separado, descrito abaixo; a restrição das suítes de CI foi mantida.

## Rodada de correções — 23/10/2026

Esta seção registra o estado **provisório** da rodada. Resultados da implantação de 22/10, no histórico ao final deste documento, não comprovam automaticamente o código novo.

| Verificação nesta rodada                     | Estado confirmado                                                                                                                                                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, TypeScript e build de produção         | Build consolidado após as correções de overflow passou; lint global passou com zero avisos e TypeScript passou.                                                                                                                                    |
| Unidade — grupos específicos                 | 11 testes do resumo de notificações, 21 de reservas e 10 de cadastro integrado passaram.                                                                                                                                                           |
| Unidade — suíte integrada                    | 115 testes passaram em 17 arquivos e foram repetidos com sucesso após as últimas correções.                                                                                                                                                        |
| PostgreSQL WASM                              | 259 asserções passaram, incluindo 32 do cadastro integrado e 11 da regra de papel único.                                                                                                                                                           |
| Supabase hospedado                           | Migrações `20261023193250_laboratorio_completo` e `20261023193257_papel_unico` aplicadas. Aplicar uma migração não equivale a executar pgTAP.                                                                                                      |
| pgTAP nativo e integração no CI              | Ainda não executados para esta rodada; os resultados anteriores permanecem somente no histórico.                                                                                                                                                   |
| Chrome — demonstração                        | 108 casos passaram: 54 em desktop/360 px e 54 em 320/390 px. Capturas também foram revisadas visualmente.                                                                                                                                          |
| Chrome — cinco papéis com banco hospedado    | Login, navegação, RBAC, erros de duração/slot em vermelho com foco, envio real de solicitação e diálogo com os dois botões passaram para aluno, professor, funcionário, monitor e administrador.                                                   |
| Chrome — administração remota                | Criar usuário pela UI, rejeitar múltiplos papéis na API/CSV e criar/editar laboratório com funcionamento e equipamento passaram. A edição foi repetida após corrigir a corrida de montagem do formulário.                                          |
| Chrome — operações autenticadas              | Dez verificações passaram, incluindo aprovação, recusa, cancelamento, RBAC, impedimento de autoaprovação, ocorrência com foto privada/assinada, check-in/out persistidos e no-show.                                                                |
| Mobile autenticado — diagnóstico e repetição | Foram encontrados três overflows a 320 px, em `/reservas`, `/monitor` e `/usuarios`. O diagnóstico de 52 verificações passou com o CSS corrigido injetado; a validação definitiva sobre o build real para os cinco papéis ainda está em andamento. |
| Publicação desta rodada                      | Pendente da conclusão das verificações e do novo deploy.                                                                                                                                                                                           |

O usuário pediu testes pela ferramenta ChatGPT in Chrome. A conexão foi tentada, mas o Chrome não estava disponível na superfície CUA desta sessão. O Chrome instalado pôde ser controlado pelo Playwright, com `channel=chrome`, para executar os fluxos reais de navegador. Isso não deve ser relatado como um teste concluído pela ferramenta indisponível.

A inspeção do banco encontrou o laboratório real **Lab Quimica** (`eb75f1e0-571e-48a8-a3f8-df6c2b2e4167`) com modo `slot_fixo`, duração mínima de 60 e máxima de 240 minutos, mas **zero janelas de funcionamento e zero equipamentos**. A ausência de janelas explica a recusa de agendamentos pelo RPC. A interface agora informa essa condição e oferece **Editar** no cadastro. Nenhum horário foi inventado para esse laboratório: a administração deverá informar o funcionamento real pelo formulário integrado.

Os 108 casos de demonstração confirmaram navegação, axe, ausência de overflow nas larguras testadas com dados de demonstração, painéis compactos, foco, teclado e retirada dos elementos pedidos do cabeçalho/lateral. Com o banco hospedado, os cinco papéis passaram por login/RBAC, erros de duração e alinhamento em vermelho com foco, envio real e diálogo de confirmação com **Voltar ao início** e **Novo agendamento**. A criação de usuário e a rejeição de múltiplos papéis pela API/CSV passaram. Criar e editar laboratório com horários/equipamento também passaram na repetição após corrigir a corrida de montagem do formulário.

As dez verificações adicionais de operações autenticadas passaram, incluindo decisão e cancelamento, autorização, impedimento de autoaprovação, ocorrência com imagem privada e leitura assinada, check-in, check-out e no-show com persistência conferida. A checagem móvel com esses dados reais encontrou três transbordamentos a 320 px que não eram reproduzidos pela demonstração, em `/reservas`, `/monitor` e `/usuarios`. A correção usa quebra de texto e posicionamento relativo da área de rolagem da tabela; não oculta conteúdo com `overflow: hidden`. O diagnóstico de 52 verificações com esse CSS injetado passou; o build consolidado também passou. A confirmação final do comportamento móvel nesse build continua em andamento: a checagem autenticada dos cinco papéis e o caso adicional móvel de reservas/monitor ainda aguardam resultado. A aprovação do diagnóstico não é contada como aprovação desses dois testes.

### Fixtures remotas autorizadas

`scripts/qa-remoto.mjs` é exclusivo da verificação manual autorizada pelo proprietário, não é chamado pelo CI e exige `LABRESERVA_QA_AUTORIZADO=1`. Ele fixa o projeto Supabase autorizado e aceita apenas a aplicação publicada ou sua origem HTTPS de teste. Contas genéricas usam um único papel, UUID exclusivo por execução e endereços `@example.invalid`; senhas aleatórias ficam em `test-results/qa-remoto/contas.json`, ignorado pelo Git e pelo deploy. Não há senha padrão de produção nem valor sensível publicado nesta documentação.

Os fluxos exercitam a UI e as Server Actions reais. A preparação de identidades e os ajustes estritamente necessários às fixtures são feitos pelo SDK administrativo, sem reutilizar as contas pessoais. Não há envio real de e-mail: o Resend continua ausente e os destinatários são endereços de teste inválidos. O encerramento planejado com `encerrar` desativa somente as contas e o laboratório dessa execução e dispensa suas notificações, preservando o histórico e a auditoria. **O encerramento ainda precisa ser confirmado ao fim da rodada.**

Para verificar check-in/out e no-show sem aguardar o relógio real, foram ajustados apenas início/fim de **duas reservas QA desta execução**, com valores anteriores e posteriores registrados no arquivo ignorado `test-results/qa-remoto/operacoes.json`. As regras globais de antecedência, funcionamento e tolerância não foram modificadas. As transições de status foram realizadas pelas operações reais da aplicação, não por uma substituição do fluxo no banco.

## Execução sem Docker

```sh
npm ci
npm run lint
npm run typecheck
npm test
node scripts/validar-banco.mjs
npm run build
npx playwright install chromium
npm run test:e2e -- --project=demo-desktop --project=demo-mobile-320 --project=demo-mobile-360 --project=demo-mobile-390
```

Playwright inicia `next start` em `127.0.0.1:3101`, usando o build de produção, com as variáveis Supabase explicitamente vazias. Não reutiliza um servidor desconhecido. Mantenha as portas 3100, 3101 e 3102 livres; o desenvolvimento usa 3000. Os servidores são encerrados ao final dos testes.

A coleção atual de demonstração prevê 108 casos: 27 por projeto de viewport, incluindo 20 rotas com axe e verificação de overflow, navegação, cabeçalho e menus móveis. São cobertos o painel, catálogo, detalhe e gestão de laboratórios, calendário, reservas e formulário, monitor, usuários, perfil, notificações, bloqueios, configurações, ocorrências, relatórios e privacidade dos relatórios, auditoria, ajuda, privacidade e login. A navegação também verifica o filtro do catálogo, as visões semanal/mensal e a validação de campos obrigatórios. Os projetos usam 1440 × 1000, 320 × 800, 360 × 800 e 390 × 844 pixels; casos específicos também redimensionam o navegador para conferir menus nas três larguras móveis. Os 46 casos registrados em 21/10 pertencem à coleção anterior.

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
