# E-mail transacional

O sistema usa exclusivamente `ResendNotificationProvider`, que implementa `NotificationProvider`. Convites e recuperação usam `auth.admin.generateLink`; o Supabase Auth não envia essas mensagens. Não habilitar o SMTP padrão como alternativa à fila.

## Fila e worker

As RPCs gravam eventos em `notificacoes` com `chave_idempotencia` única, normalmente `reserva_id:evento:destinatario`. O snapshot do endereço preserva o destinatário do evento. A fila também alimenta a central de notificações, inclusive quando o e-mail é dispensado pelas preferências.

`reclamar_notificacoes(25)` bloqueia linhas com `FOR UPDATE SKIP LOCKED`, marca `enviando`, recupera leases parados há mais de dez minutos e revalida conta ativa, preferências e supressões. `concluir_notificacao` registra aceite do provedor ou incrementa falhas: intervalos de 1, 5, 15 e 60 minutos, encerrando na quinta falha. `enviada` significa aceite pela API, não confirmação de leitura ou de entrega na caixa postal.

A Edge Function `processar-notificacoes` exige POST, corpo `{}` e `x-worker-secret`. O JWT da plataforma fica desativado apenas para essa função; o segredo próprio é obrigatório e comparado com HMAC. Ausência de configuração falha antes de reclamar a fila. O processamento usa `EdgeRuntime.waitUntil`, permitindo que a chamada `pg_net` receba 202 antes do envio do lote. Há uma pausa de 550 ms entre envios; 429 do provedor seguem o mesmo backoff. Execuções manuais paralelas podem compartilhar a cota da conta.

O envelope renderizado e o remetente ficam congelados em `mensagem_email` antes do envio. A chave Resend é `notificacao-` mais SHA-256 da chave da fila, preservando o limite de tamanho e evitando tokens no cabeçalho. Repetições reutilizam o mesmo envelope. Se o provedor aceitou e o banco ficou indisponível, o worker preserva o lease para reconciliação. Um `provedor_id` já registrado permite concluir sem novo envio. Sem esse identificador, envelopes com 23 horas são encerrados como `reconciliacao_manual_necessaria`, evitando ultrapassar a janela de 24 horas de idempotência do Resend. Conferir a mensagem no painel do provedor antes de qualquer reenvio administrativo. A janela e a exigência de conteúdo idêntico constam na [documentação de idempotência do Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

A anonimização administrativa limpa o endereço, o payload, o envelope renderizado e os identificadores de entrega. A fila conserva o evento, o ID interno, as datas históricas, as tentativas e os estados finais. A chave idempotente vira um hash para preservar o bloqueio de duplicatas sem manter tokens. Pendências e retiradas em andamento são encerradas com o código `perfil_anonimizado`. A auditoria registra o motivo administrativo sem copiar o conteúdo da fila. O motivo deve descrever a finalidade encerrada sem incluir dados pessoais ou credenciais.

Em toda tentativa, inclusive com envelope já renderizado, o worker revalida o estado no banco antes de enviar. Uma resposta tardia do provedor não reabre a linha anonimizada. Uma entrega autorizada antes da anonimização ainda pode chegar ao provedor, cujo histórico segue o processo de retenção da instituição. A migração não executa anonimizações em massa. Uma anonimização autorizada repetida também limpa o envelope de perfis tratados antes da migração.

As migrações 001 e 008 contêm as RPCs e os jobs; nenhuma contém credenciais. `reservas-rotinas` enfileira os lembretes de 24h/1h e alertas pendentes. `notificacoes-worker`, a cada minuto, chama a Edge Function via `pg_net`. A URL e o segredo vêm de `vault.decrypted_secrets`, com os nomes `project_url` e `notification_worker_secret`. Sem esses valores, o job de invocação não faz chamadas. Esse desenho segue o [agendamento oficial de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

## Eventos e templates

Todos os templates usam React Email, idioma pt-BR, HTML escapado pelo React, alternativa em texto, link `/reservas/{uuid}` e horários em `America/Sao_Paulo`. A identidade vem de `configuracoes.identidade_visual`: `nome`, `cor` hexadecimal e `logo_url` HTTPS. O seed usa o nome e a cor institucionais como placeholder; uma configuração inválida usa esse placeholder. Mensagens já preparadas mantêm sua identidade original nos retries.

| Template                                                      | Destinatário                        | Preferência |
| ------------------------------------------------------------- | ----------------------------------- | ----------- |
| `reserva_criada`                                              | Monitores vinculados ao laboratório | Outros      |
| `prioridade_substituicao`                                     | Monitores do laboratório            | Outros      |
| `reserva_aprovada`, `reserva_recusada`, `reserva_substituida` | Solicitante                         | Essencial   |
| `reserva_cancelada`                                           | Solicitante e monitores             | Essencial   |
| `reserva_no_show`                                             | Solicitante e monitores             | Outros      |
| `lembrete_reserva`                                            | Solicitante, 24h e 1h antes         | Lembretes   |
| `pendencia_monitor`                                           | Monitores do laboratório            | Outros      |
| `pendencia_admin`                                             | Administradores                     | Outros      |
| `ocorrencia_grave`                                            | Administradores                     | Outros      |
| `convite`, `recuperacao`, `seguranca_conta`                   | Usuário da conta                    | Essencial   |

O payload comum contém `usuario_nome` e `email`. Reservas incluem `reserva_id`, `laboratorio_id`, `laboratorio_nome`, `inicio`, `fim`, `motivo`, `finalidade` e `prioridade` quando disponíveis. Lembretes acrescentam `antecedencia`; ocorrências, `ocorrencia_id` e `descricao`; pendências podem incluir `created_at`. Convite e recuperação usam `url` com `token_hash` e `type=invite|recovery`, apenas na origem `APP_URL`. Os templates não aceitam URLs arbitrárias de autenticação.

Na substituição, a RPC `sugerir_horarios_notificacao` busca até três alternativas nos próximos sete dias, com a mesma duração e equipamentos. Ela revalida modo, janela, antecedência, equipamentos ativos e bloqueios; conservadoramente descarta qualquer intervalo com ocupação aprovada/em uso no laboratório. As sugestões são verificadas na preparação do envio e precisam de uma nova solicitação e aprovação. Sem alternativa válida, a mensagem orienta consultar o calendário.

## Preferências e descadastro

`profiles.preferencias_notificacao` aceita somente `{ "lembretes": boolean, "outros": boolean }`, com padrões verdadeiros. Decisões de reserva, convites e segurança ignoram o opt-out. Uma conta inativa ou um endereço suprimido nunca recebe novos envios, inclusive essenciais.

Cada mensagem opcional inclui link `/api/descadastro?token=...`, `List-Unsubscribe` e `List-Unsubscribe-Post`. O token HMAC-SHA256 assina versão, UUID, categoria e validade de 30 dias; não contém e-mail nem permite alterar mensagens essenciais. Rotacionar o segredo invalida links anteriores. GET mostra confirmação sem alterar dados, evitando descadastro por scanners. POST do formulário exige `Origin` igual a `APP_URL`; o POST One-Click RFC 8058 sem Origin exige exatamente `List-Unsubscribe=One-Click` e o token assinado válido. Os endpoints públicos possuem rate limit em Postgres e respostas sem cache ou referrer.

## Variáveis e implantação

Todas as variáveis são de servidor; não criar versões `NEXT_PUBLIC_*`.

| Variável                                    | Aplicação Next                                      | Edge Function                           |
| ------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| `APP_URL`                                   | Origem HTTPS da aplicação                           | Mesma origem                            |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Serviço administrativo                              | Injetadas pelo Supabase                 |
| `RESEND_API_KEY`                            | SDK de verificação, sem chamada de envio no webhook | Chave de envio Resend                   |
| `RESEND_FROM`                               | Não utilizada pelo webhook                          | Nome e endereço do domínio verificado   |
| `RESEND_WEBHOOK_SECRET`                     | Segredo `whsec_...` do endpoint                     | Não necessário                          |
| `NOTIFICATION_WORKER_SECRET`                | Não necessário                                      | Segredo aleatório, mínimo 32 caracteres |
| `NOTIFICATION_UNSUBSCRIBE_SECRET`           | Segredo HMAC, mínimo 32 caracteres                  | Exatamente o mesmo segredo              |

1. Usar um projeto de homologação com dados fictícios, manter `enable_signup=false` e suspender o job `notificacoes-worker` em Integrations → Cron. Conferir o projeto de destino e aplicar as migrações, incluindo a redação dos envelopes. Deixar envios automáticos suspensos até o piloto. [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart#activatedeactivate-a-job)
2. Configurar as variáveis na hospedagem Next. Cadastrar no Resend o webhook HTTPS de homologação `APP_URL/api/webhooks/resend` para `email.bounced` e `email.complained`, guardar o segredo de assinatura no ambiente Next correspondente e testar a verificação.
3. Na Edge Function, cadastrar `APP_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `NOTIFICATION_WORKER_SECRET` e `NOTIFICATION_UNSUBSCRIBE_SECRET` no painel de secrets. Usar as credenciais e o domínio de teste e deixar `SUPABASE_*` sob gestão da plataforma.
4. Publicar `supabase functions deploy processar-notificacoes --project-ref <projeto-de-homologacao> --no-verify-jwt`. A função usa o segredo obrigatório no cabeçalho `x-worker-secret`. A versão do app, o SHA das migrações e a versão da função precisam corresponder à rodada testada. [Dependências de Edge Functions](https://supabase.com/docs/guides/functions/dependencies)
5. Depois do piloto manual, cadastrar no Vault de homologação `project_url` com a URL HTTPS do projeto e `notification_worker_secret` com o mesmo valor configurado na função. Cadastrar pelo painel, com o cron suspenso e sem escrever valores em migrações, logs ou arquivos versionados. Ativar o cron de homologação e conferir invocação, processamento e entrega separadamente.

## Inventário de produção em 16/11/2026

A consulta de metadados no Supabase de produção confirmou o job `notificacoes-worker` ativo a cada minuto e a ausência dos nomes `project_url` e `notification_worker_secret` em `vault.secrets`. Foram consultados somente os nomes e suas contagens. Sem ambos, a função agendada retorna antes da chamada HTTP.

A fila tinha apenas 35 linhas pendentes, de 21/10 a 11/11. Todas tinham mais de 24 horas. Nenhuma tinha envelope preparado, tentativa ou identificador de provedor.

| Classe de evento | Pendentes |
| ---------------- | --------: |
| Convite          |         2 |
| Recuperação      |         1 |
| Operacional      |        32 |

Antes de configurar a invocação em produção, suspender o cron de e-mail e revisar a fila com um operador autorizado. Classificar os registros em convites/recuperações que precisam de ação nova, eventos operacionais vencidos e eventual evento ainda válido. Confirmar o prazo de validade de cada tipo de link e preservar o histórico ao decidir quais linhas antigas devem ter envio dispensado. Gerar novos links apenas para contas elegíveis e sob autorização. Registrar contagens por decisão e conferir o saldo apto para envio, inclusive as linhas criadas enquanto o cron esteve suspenso. O inventário acima não autoriza envio, descarte ou alteração de estado. Com o cron ativo, preencher o segundo nome do Vault já permite invocação da fila inteira.

O proprietário informou que ainda não tinha conta Resend configurada. A entrega em homologação depende de remetente verificado, destinatário de teste controlado, projeto de homologação autorizado e credenciais próprias. Nenhum envio real foi feito na revisão de 16/11.

### Piloto de homologação

Usar apenas contas e reservas fictícias em um banco isolado, com cron suspenso durante as primeiras invocações manuais. Marcar as fixtures com identificadores de teste e conferir por agregados que toda a fila elegível pertence ao piloto. Criar uma fixture por cenário para que o worker, que reclama até 25 linhas, alcance somente os eventos destinados ao teste.

| Cenário                     | Ação e evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convite                     | Usar uma caixa de e-mail controlada. Convidar pelo app, invocar o worker manualmente e conferir um único envio no Resend, recebimento na caixa, link na origem de homologação e definição de senha. Confirmar que o link não pode ser reutilizado.                                                                                                                                                                                                                                                    |
| Recuperação                 | Solicitar pelo app para a mesma caixa controlada e conferir nova mensagem e troca da senha apenas para a conta fictícia. Exercitar link expirado ou usado sem registrar o token.                                                                                                                                                                                                                                                                                                                      |
| Falha de entrega            | Usar o endereço simulador de bounce do Resend para uma notificação operacional fictícia, com webhook assinado. Conferir transição para falha, supressão, ausência de nova tentativa para o destinatário suprimido e idempotência ao reapresentar o evento assinado. [Simuladores do Resend](https://resend.com/changelog/sending-test-emails)                                                                                                                                                         |
| Retry e confirmação perdida | No harness isolado, induzir uma falha transitória antes do aceite, verificar backoff e repetir com o mesmo envelope e chave. Simular também perda da confirmação após o aceite e recuperação do lease. No teste controlado com API do Resend, repetir a requisição de teste idêntica dentro de 24 horas e conferir um único identificador e uma única entrega. A simulação precisa permanecer restrita ao piloto. [Idempotência do Resend](https://resend.com/docs/dashboard/emails/idempotency-keys) |
| Cron                        | Com a fila histórica fora de alcance, ativar o job de homologação e conferir que o HTTP 202 antecede o processamento. Comparar o histórico do cron com o destino HTTP, o estado da fila, o identificador do provedor e o recebimento.                                                                                                                                                                                                                                                                 |

Depois da homologação e da aprovação para ativar produção, manter o cron suspenso enquanto migração de redação, worker e app/webhook são preparados. Confirmar as novas permissões e o tratamento de um lote invalidado por anonimização. Revisar o backlog, executar um piloto manual com destinatário controlado após confirmar o saldo apto e só então ativar o job. Acompanhar por contagens de falhas, tentativas, leases, supressões e aceites no primeiro ciclo.

Para interromper o envio, desativar `notificacoes-worker` e suspender chamadas manuais. Aguardar o processamento que já iniciou e reconciliar mensagens aceitas antes de renovar a execução. Em caso de falha do worker, manter os envios pausados até confirmar uma versão compatível com a redação. Preservar mudanças de anonimização e estados de fila ao reverter app ou configuração. Manter a recepção dos eventos assinados do provedor durante a pausa. Se houver indício de exposição de credencial, rotacionar o segredo próprio do worker em conjunto no Vault e na função.

## DNS manual no Resend

Adicionar um domínio ou subdomínio de envio que a instituição controla. No provedor DNS, copiar **exatamente os nomes, tipos e valores apresentados pelo painel Resend** para SPF e DKIM; não usar placeholders como registros reais nem criar um segundo SPF no mesmo nome. Verificar propagação e o estado verificado no painel antes de usar `RESEND_FROM`. O [guia de domínios do Resend](https://resend.com/docs/dashboard/domains/introduction) explica a verificação e a separação de reputação por subdomínio.

Configurar também TXT `_dmarc` para o domínio remetente. Começar pela política de observação `p=none` com endereço institucional válido em `rua`, verificar os relatórios e o alinhamento de todas as fontes legítimas e então evoluir para `quarantine` ou `reject`. Não substituir uma política existente sem verificar os demais sistemas da instituição. Ver o [guia DMARC do Resend](https://resend.com/docs/dashboard/domains/dmarc).

## Webhook e operação

O Route Handler lê `request.text()` e passa o corpo bruto e os cabeçalhos `svix-id`, `svix-timestamp` e `svix-signature` ao SDK `resend.webhooks.verify`. JSON só é validado após a assinatura e a janela temporal serem conferidas. Não inserir parser que transforme o corpo antes dessa etapa. Ver a [verificação oficial de webhook](https://resend.com/docs/webhooks/verify-webhooks-requests).

Bounce/complaint são idempotentes pelo identificador Svix e destinatário. A RPC marca a entrega correspondente como falha, mantém a supressão por endereço e impede os próximos envios. A preferência de notificações não altera a supressão. A interface restringe payloads de autenticação e snapshots com links de convite/recuperação. O código do worker registra códigos genéricos, mas o SDK Resend emitiu o texto do erro HTTP no ensaio de 429. Na homologação, verificar essa saída com dados fictícios e confirmar a sanitização necessária antes de enviar para endereços reais. Manter payloads, HTML, endereços, segredos e tokens fora dos registros operacionais.

Monitorar `cron.job_run_details`, respostas de `net._http_response`, filas com `status='falhou'` e `erro`, contagem de `tentativas`, leases com mais de dez minutos e supressões. `envio_dispensado=true` distingue opt-out, conta inativa ou supressão de uma falha do provedor. O painel Resend complementa o aceite registrado em `enviada_em`.

## Verificação

Verificações locais sem envio real:

```sh
npm run lint
npm run typecheck
npm exec -- vitest run tests/unit/notificacoes.test.ts
node scripts/validar-banco.mjs
deno check --config supabase/functions/processar-notificacoes/deno.json supabase/functions/processar-notificacoes/index.ts
deno test --allow-env --config supabase/functions/processar-notificacoes/deno.json supabase/functions/processar-notificacoes/index_test.ts
```

Os testes unitários verificam todos os templates, escape HTML, essenciais, HMAC, expiração, CSRF/One-Click, assinatura real pelo SDK e idempotência do provider com cliente simulado. Em 16/11, passaram 13 testes de `tests/unit/notificacoes.test.ts`, o `deno check` e as seis etapas do teste Deno do worker. O teste Deno executa o entrypoint com banco e API Resend simulados e sem permissão de rede. `supabase/tests/008_email.sql` verifica permissões, snapshot estável, reconciliação, preferências, supressão e sugestões. O harness PostgreSQL embutido valida SQL/RLS com adaptadores para Vault, cron e net. As chamadas HTTP, o cron e a entrega dependem do piloto de homologação.

Antes do aceite em produção, rodar `supabase test db` e um teste controlado em projeto de homologação: evento → claim → entrega, falha → retry → encerramento, worker interrompido → recuperação, assinatura inválida → rejeição, bounce/complaint → supressão. Conferir SPF/DKIM/DMARC na mensagem recebida. Nenhum envio real foi executado durante a implementação, pois não foram fornecidas credenciais.
