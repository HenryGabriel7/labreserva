# Revisão para entrega ao professor — LabReserva

Data da revisão: 19/11/2026. Fuso America/Sao_Paulo, UTC−03.
Início dos registros: 16h54. Conferência final dos resultados: 17h11min55s.

Os fluxos centrais avaliados passaram na revisão, incluindo as correções locais abaixo. Para entregar o endereço com essas correções, ainda é necessário publicar a nova versão. As dependências institucionais e operacionais estão registradas neste documento.

**Versão e escopo**

A revisão utilizou a branch local `codex/correcoes-auditoria-novembro`, com base em `d76ec7fad9eebe794e3de1ef9c3648544dacaea5`, e o diff desta revisão. Alterações anteriores nos documentos e nos demais projetos da pasta foram preservadas.

Às 17h00min46s, a API da Vercel confirmou o domínio https://labreserva.vercel.app no deployment `dpl_C6zpDFEciGh4BBXrXiD9V3HJtbqs`, em estado READY, produção, com `releaseCommit=d76ec7fad9eebe794e3de1ef9c3648544dacaea5`. As correções abaixo são locais e ainda precisam de uma nova publicação. Nenhuma migração, configuração, conta ou reserva de produção foi alterada nesta revisão.

Os testes autenticados usam pessoas e dados fictícios em PostgreSQL 17.11, Auth GoTrue e PostgREST descartáveis, em loopback. As integrações operacionais de Storage, Vault, cron e HTTP do banco são emuladas nesse ambiente. O navegador é o Google Chrome instalado, com perfil automatizado temporário. O envio externo de e-mail é simulado.

**Problemas encontrados e corrigidos**

| Problema e causa                                                                                                                                            | Correção e arquivos                                                                                                                                                                                                                                              | Evidência                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A grade diária e semanal gerava apenas as horas de 08h a 21h, ocultando eventos válidos anteriores às 08h ou iniciados a partir de 22h.                     | `src/components/calendario.tsx` passou a mostrar as 24 horas. A última faixa usa a meia-noite do dia seguinte no fuso de São Paulo, com fim exclusivo. O link das 23h preserva laboratório, data e início sem fornecer o término inválido `24:00` ao formulário. | Novo cenário em `tests/e2e/calendario-catalogo.spec.ts` cobre reservas 07h–08h e 22h–23h, bloqueio 23h–00h, bloqueio que atravessa a meia-noite, dias sem sobreposição e navegação ao formulário às 23h. Cenário aprovado no Chrome autenticado. |
| O build identificou advisories no Next.js 16.4.2. A auditoria também identificou uma dependência de desenvolvimento afetada na cadeia do typescript-eslint. | `package.json` e `package-lock.json` atualizam Next.js e eslint-config-next para 16.4.5 e a cadeia compatível de typescript-eslint para 8.73.0, incluindo minimatch corrigido, sem override forçado de versão principal.                                         | Build, lint, tipos, 145 testes unitários e auditoria pontual do lock atual aprovados. O registry npm retornou zero pacotes afetados para 585 nomes e 617 versões distintas às 17h04min17s.                                                       |

Referências dos mantenedores para as correções de dependências: [release Next.js 16.4.5](https://github.com/vercel/next.js/releases/tag/v16.4.5) e [advisory minimatch](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). A consulta ao registry representa os advisories conhecidos naquele momento.

**Matriz de verificação**

| Verificação da versão local corrigida                                                                                             | Resultado                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ESLint, com zero avisos, excluindo apenas os projetos/pastas independentes `primeiro-estagio`, `jujutsu-roblox`, `tmp` e `output` | Aprovado                                                                                          |
| TypeScript                                                                                                                        | Aprovado                                                                                          |
| Build de produção com Next.js 16.4.5                                                                                              | Aprovado                                                                                          |
| Testes unitários em 19 arquivos                                                                                                   | 145/145 aprovados                                                                                 |
| Worker Deno — check e testes com Resend simulado                                                                                  | 1 teste e 7 etapas aprovados                                                                      |
| Banco PostgreSQL — suite pgTAP                                                                                                    | 302/302 asserções aprovadas                                                                       |
| Integrações com Auth, RLS e transações reais                                                                                      | 7/7 aprovadas                                                                                     |
| Playwright da interface em desktop e larguras de 320, 360 e 390 px                                                                | 144/144 aprovados                                                                                 |
| Playwright autenticado, incluindo o novo cenário da agenda                                                                        | 22/22 aprovados                                                                                   |
| Auditoria pontual de dependências no endpoint oficial npm                                                                         | Zero pacotes afetados retornados                                                                  |
| Checagem adicional da agenda diária a 320 px                                                                                      | 24 horas acessíveis, sem rolagem horizontal da página, zero violações axe e zero erros JavaScript |

O banco inclui `supabase/tests/015_laboratorio_completo.sql`, com 58 asserções para edição, preservação de mais de 700 janelas e revisão concorrente, e `016_anonimizacao_notificacoes.sql`, com 17 asserções de anonimização. As sete integrações incluem aprovação concorrente única, concorrência entre editores, bloqueio do cadastro público, convite com fila privada, revogação por logout, usuário inativo e anonimização concorrente com o worker.

Os cenários de navegador cobrem os cinco papéis, proteção da administração, separação dos espaços, login com retorno à privacidade e rejeição de destino externo, solicitação e decisões de reserva, check-in e check-out, cancelamento, prioridade, recorrência de equipamentos, erros vermelhos nos campos, editor com falha ou resposta parcial, conflito entre abas, atividade de hoje após reservas futuras, calendário bissexto e catálogo com 102 laboratórios e RLS. A bateria visual cobre os menus de notificações e perfil, foco de teclado, acessibilidade e contenção das tabelas nas telas auditadas.

São 166 cenários Playwright aprovados. O ambiente autenticado teve uma falha inicial de inicialização do PostgREST no Windows, resolvida limitando o runtime nativo a uma capacidade no harness temporário. Após o ajuste, todas as integrações e todos os cenários autenticados passaram. PostgreSQL, Auth, PostgREST e os servidores web utilizados nos testes foram encerrados.

**Verificação do site publicado**

27/27 verificações públicas aprovadas, sem sessão e sem gravações. Incluem redirecionamento de oito rotas protegidas, duas APIs rejeitando acesso anônimo, validação do destino no servidor, navegação privacidade → login, abertura da recuperação de senha, login e privacidade nas larguras 320, 360, 390, 768 e 1440 px e ausência de erros JavaScript. Os formulários de recuperação não foram enviados. As páginas públicas auditadas tiveram zero violações axe nos critérios WCAG A/AA selecionados.

O worker publicado rejeitou GET com 405 e POST sem segredo com 401. As 12 migrações esperadas estão registradas no Supabase, incluindo `20261116190043_anonimizar_envelopes_notificacoes`.

**Pendências para operação e entrega**

- Publicar o diff desta revisão após conferência. A versão pública ainda não contém a grade de 24 horas nem a atualização de dependências desta rodada.
- A instituição precisa fornecer o contato e o texto de retenção para a página de privacidade. Esses valores não foram inventados.
- Convites e recuperação por e-mail precisam de remetente verificado e homologação com destinatário controlado. A consulta de produção confirmou 35 mensagens pendentes, nenhuma em envio ou aceita, cron pausado e ausência das duas chaves de acionamento no Vault. Não ativar o cron antes de configurar o provedor e revisar a fila.
- Confirmar os horários e equipamentos reais, especialmente o laboratório de química, que o responsável preferiu configurar posteriormente pelo botão Editar.
- O ensaio de recuperação integral de banco, Auth e Storage continua como pendência operacional do projeto.

**Publicação e reversão desta revisão**

O diff contém quatro arquivos de código, testes e dependências. Não requer nova migração, alteração do worker ou ativação de e-mail. A próxima publicação deve usar o lockfile testado, executar o CI do novo commit, verificar a versão no preview e então conferir o commit do domínio de produção após a promoção.

O deployment atual `dpl_C6zpDFEciGh4BBXrXiD9V3HJtbqs` é a referência de retorno do código. Ele contém Next.js 16.4.2 e a grade anterior, portanto esse retorno também reintroduziria os problemas corrigidos aqui. As migrações protetivas já aplicadas devem permanecer, com o cron de e-mail pausado.

**Evidências locais**

- [Diff desta revisão](../test-results/revisao-entrega-professor-2026-11-19.patch)
- [Relatório Playwright da interface](../playwright-report/entrega-final-demo/index.html)
- [Relatório Playwright autenticado](../playwright-report/entrega-final-autenticado/index.html)
- [27 verificações públicas](../test-results/revisao-entrega-final-producao-2026-11-19.json)
- [Auditoria de dependências com SHA256 do lockfile](../test-results/revisao-entrega-final-dependencias-2026-11-19.json)
- [Agenda a 320 px — medições](../test-results/entrega-final-agenda-diaria-320.json)
- [Agenda a 320 px — início](../test-results/entrega-final-agenda-diaria-320.png)
- [Agenda a 320 px — última faixa acessível](../test-results/entrega-final-agenda-diaria-320-final.png)

Os resultados desta revisão local abrangem o diff acima. O CI anterior do commit `d76ec7f` é um registro de outra execução e não comprova a publicação destas novas alterações.
