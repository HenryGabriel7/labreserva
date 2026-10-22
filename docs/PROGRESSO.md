# Progresso

Atualizado em 22/10/2026. Implementação das 11 etapas concluída; aplicação e banco publicados. O envio de e-mails depende da configuração do Resend, que o proprietário informou ainda não possuir.

## Implantação

- Aplicação: [labreserva.vercel.app](https://labreserva.vercel.app), Vercel em São Paulo (`gru1`), Node.js 24. Os pushes em `main` publicam automaticamente a partir do [repositório privado](https://github.com/HenryGabriel7/labreserva).
- Banco: projeto Supabase `labreserva`, referência `hvcetcfairwfuyxlyynl`, organização `HenryGabriel7`, região `sa-east-1`. As oito migrações estão aplicadas e o histórico corresponde às versões do repositório.
- Verificado no banco hospedado: 18 tabelas públicas com RLS, dois buckets privados, dois jobs criados, um administrador ativo e nenhum laboratório demonstrativo. O seed e suas senhas de desenvolvimento não foram usados em produção.
- Auth hospedado: login por e-mail ativo, signup público bloqueado, senha mínima de 12 caracteres com complexidade e redirects restritos à origem definitiva. API anônima de laboratórios recusada com HTTP 401.
- Edge Function `processar-notificacoes` publicada com autenticação por segredo próprio. Requisição sem segredo recusada com HTTP 401. O Vault de invocação foi mantido sem os valores de envio enquanto o Resend estiver ausente.
- Primeiro administrador provisionado com o e-mail fornecido pelo proprietário. O convite inicial é entregue em `.env.primeiro-acesso.local.html`, arquivo privado fora do Git e do deploy, sem senha padrão nem token impresso. A ativação e a definição da senha ficam a cargo do proprietário.

Detalhes operacionais e configuração restante: [DEPLOY](DEPLOY.md).

## Validação

| Camada                     | Resultado confirmado                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESLint e TypeScript strict | Aprovados localmente e no GitHub Actions                                                                                                                                 |
| Vitest                     | 79 testes aprovados em 14 arquivos                                                                                                                                       |
| PostgreSQL WASM            | 216 asserções aprovadas, com adaptadores declarados                                                                                                                      |
| pgTAP nativo               | 216 asserções aprovadas no Supabase real do runner CI                                                                                                                    |
| Integração HTTP/Auth       | Cinco testes aprovados: concorrência, signup bloqueado, convite, logout global e conta inativa                                                                           |
| Worker Deno                | Tipos aprovados e um teste com quatro passos offline                                                                                                                     |
| Build e npm audit          | Build de produção aprovado; zero vulnerabilidades                                                                                                                        |
| Chromium no CI             | 50/50 aprovados no [run 39832599914](https://github.com/HenryGabriel7/labreserva/actions/runs/39832599914), commit `558f554`                                             |
| Acessibilidade e 360 px    | As 20 rotas passaram no axe em desktop e celular, sem supressão de regras e sem overflow horizontal                                                                      |
| Smoke do site publicado    | Login/privacidade HTTP 200, área interna exige login, API administrativa HTTP 401 sem sessão, redirect de confirmação permanece na origem HTTPS e nenhum erro JavaScript |
| Storage hospedado          | Upload assinado feito pelo Chromium a partir do site de produção: HTTP 200, bytes preservados, leitura pública negada e objeto de teste removido                         |

O teste WASM não substitui serviços reais; as camadas pgTAP e integração acima foram executadas separadamente com Docker/Supabase no GitHub Actions. O CI usa apenas credenciais locais do runner e não envia e-mails externos. O smoke de produção não consumiu o convite do administrador nem criou reservas fictícias. O objeto de Storage usado para conferir CORS/transporte foi temporário e removido pelo SDK.

A primeira execução remota encontrou o provider Email desativado pela opção da seção `auth.email`. O login foi reabilitado mantendo `[auth] enable_signup=false`, e um teste confere os dois flags para impedir falso positivo. Os E2E autenticados passaram a usar HTTPS no loopback e seletores por papel; o proxy de QA reescreve redirects da porta interna HTTP para sua origem TLS. Essas correções não flexibilizaram a exigência de HTTPS da aplicação de produção.

A verificação axe complementa a revisão manual de teclado/leitores de tela e não constitui certificação completa. O transporte de fotos real foi conferido; o fluxo integral de ocorrência com arquivos ainda pode ser revisado em homologação. Resultados e comandos: [TESTES](TESTES.md).

## Etapas e commits

Lint, typecheck e unidade passaram ao fim de cada checkpoint original.

| Etapa | Entrega                                          | Commit    |
| ----- | ------------------------------------------------ | --------- |
| 1     | Setup, tooling, tokens e layout responsivo       | `1bb9b9a` |
| 2     | Migrações, RLS, RPCs, constraints, seed e pgTAP  | `15bb2da` |
| 3     | Auth, RBAC, proxy, convites e contas             | `a0308d5` |
| 4     | Cadastros e configurações                        | `d644117` |
| 5     | Solicitações, calendário e anti-conflito         | `b62e941` |
| 6     | Monitor, check-in/out e ocorrências              | `8a36a43` |
| 7     | Recorrência e aprovação parcial de séries        | `6e98b55` |
| 8     | Fila, worker, Resend, templates e jobs           | `485c23c` |
| 9     | Relatórios, LGPD e auditoria                     | `b33d947` |
| 10    | Hardening, bootstrap, bloqueios e acessibilidade | `33c810b` |
| 11    | E2E, integração, CI e documentação               | `d08e5de` |

A preparação de produção acrescentou correções de Auth, upload direto para o Storage privado e HTTPS do ambiente de testes. Seus commits estão no histórico posterior às 11 etapas.

## Pendente e próximo passo

- Configurar Resend, remetente/DNS e webhook, completar os secrets de e-mail e o Vault e validar entrega, retry, descadastro e supressão conforme [EMAIL](EMAIL.md). Nenhuma entrega real foi afirmada como aprovada.
- Definir a senha pelo convite inicial e cadastrar laboratórios, equipamentos, funcionamento e monitores pela interface administrativa.
- Confirmar o contato institucional e a retenção conforme [SEGURANCA](SEGURANCA.md). Os advisors registram os helpers/RPCs SECURITY DEFINER e tabelas service-only intencionais; a proteção de senhas vazadas depende do plano Pro e não foi contratada.

Para repetir a validação completa em desenvolvimento, com Docker:

```sh
npx supabase start
npm run db:reset
npm run test:db
```

Configure somente credenciais Supabase de loopback e `APP_URL=https://127.0.0.1:3100`, conforme README, e execute:

```sh
npm run test:integration
npm run build
npm run test:e2e
```

Os testes com fixtures e service_role recusam projetos remotos. As instruções de implantação já realizada estão separadas desses comandos de desenvolvimento em [DEPLOY](DEPLOY.md).
