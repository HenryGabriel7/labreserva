# E-mail transacional

O sistema usa exclusivamente `ResendNotificationProvider`, que implementa `NotificationProvider`. Convites e recuperação usam `auth.admin.generateLink`; o Supabase Auth não envia essas mensagens. Não habilitar o SMTP padrão como alternativa à fila.

## Fila e worker

As RPCs gravam eventos em `notificacoes` com `chave_idempotencia` única, normalmente `reserva_id:evento:destinatario`. O snapshot do endereço preserva o destinatário do evento. A fila também alimenta a central de notificações, inclusive quando o e-mail é dispensado pelas preferências.

`reclamar_notificacoes(25)` bloqueia linhas com `FOR UPDATE SKIP LOCKED`, marca `enviando`, recupera leases parados há mais de dez minutos e revalida conta ativa, preferências e supressões. `concluir_notificacao` registra aceite do provedor ou incrementa falhas: intervalos de 1, 5, 15 e 60 minutos, encerrando na quinta falha. `enviada` significa aceite pela API, não confirmação de leitura ou de entrega na caixa postal.

A Edge Function `processar-notificacoes` exige POST, corpo `{}` e `x-worker-secret`. O JWT da plataforma fica desativado apenas para essa função; o segredo próprio é obrigatório e comparado com HMAC. Ausência de configuração falha antes de reclamar a fila. O processamento usa `EdgeRuntime.waitUntil`, permitindo que a chamada `pg_net` receba 202 antes do envio do lote. Há uma pausa de 550 ms entre envios; 429 do provedor seguem o mesmo backoff. Execuções manuais paralelas podem compartilhar a cota da conta.

O envelope renderizado e o remetente ficam congelados em `mensagem_email` antes do envio. A chave Resend é `notificacao-` mais SHA-256 da chave da fila, preservando o limite de tamanho e evitando tokens no cabeçalho. Repetições reutilizam o mesmo envelope. Se o provedor aceitou e o banco ficou indisponível, o worker preserva o lease para reconciliação. Um `provedor_id` já registrado permite concluir sem novo envio. Sem esse identificador, envelopes com 23 horas são encerrados como `reconciliacao_manual_necessaria`, evitando ultrapassar a janela de 24 horas de idempotência do Resend. Conferir a mensagem no painel do provedor antes de qualquer reenvio administrativo. A janela e a exigência de conteúdo idêntico constam na [documentação de idempotência do Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

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

1. Aplicar migrações com `supabase db push` em um projeto já vinculado; manter `enable_signup=false` também no painel.
2. Configurar as variáveis na hospedagem Next. Na Edge Function, cadastrar somente `APP_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `NOTIFICATION_WORKER_SECRET` e `NOTIFICATION_UNSUBSCRIBE_SECRET` como secrets. Não sobrescrever os valores reservados `SUPABASE_*` fornecidos pela plataforma.
3. No painel Supabase, Vault, cadastrar `project_url` com a URL HTTPS do projeto e `notification_worker_secret` com o mesmo valor da variável do worker. Fazer isso fora de migrações e fora de arquivos versionados.
4. Publicar com `supabase functions deploy processar-notificacoes --no-verify-jwt`. O `config.toml` registra essa opção. A função tem seu próprio `deno.json` e lockfile com dependências pinadas, conforme o [guia de dependências Supabase](https://supabase.com/docs/guides/functions/dependencies). Conferir a execução dos dois jobs em Integrations → Cron.
5. No Resend, cadastrar o endpoint HTTPS `APP_URL/api/webhooks/resend` para `email.bounced` e `email.complained`. Guardar seu segredo de assinatura no servidor Next e não desativar a verificação.

## DNS manual no Resend

Adicionar um domínio ou subdomínio de envio que a instituição controla. No provedor DNS, copiar **exatamente os nomes, tipos e valores apresentados pelo painel Resend** para SPF e DKIM; não usar placeholders como registros reais nem criar um segundo SPF no mesmo nome. Verificar propagação e o estado verificado no painel antes de usar `RESEND_FROM`. O [guia de domínios do Resend](https://resend.com/docs/dashboard/domains/introduction) explica a verificação e a separação de reputação por subdomínio.

Configurar também TXT `_dmarc` para o domínio remetente. Começar pela política de observação `p=none` com endereço institucional válido em `rua`, verificar os relatórios e o alinhamento de todas as fontes legítimas e então evoluir para `quarantine` ou `reject`. Não substituir uma política existente sem verificar os demais sistemas da instituição. Ver o [guia DMARC do Resend](https://resend.com/docs/dashboard/domains/dmarc).

## Webhook e operação

O Route Handler lê `request.text()` e passa o corpo bruto e os cabeçalhos `svix-id`, `svix-timestamp` e `svix-signature` ao SDK `resend.webhooks.verify`. JSON só é validado após a assinatura e a janela temporal serem conferidas. Não inserir parser que transforme o corpo antes dessa etapa. Ver a [verificação oficial de webhook](https://resend.com/docs/webhooks/verify-webhooks-requests).

Bounce/complaint são idempotentes pelo identificador Svix e destinatário. A RPC marca a entrega correspondente como falha, mantém a supressão por endereço e impede os próximos envios. Ela não remove automaticamente a supressão por uma simples mudança de preferências. A interface não expõe payloads de autenticação nem snapshots com links de convite/recuperação; não registrar payloads, HTML, endereços, segredos ou tokens em logs. Os logs do worker usam somente códigos genéricos.

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

Os testes unitários verificam todos os templates, escape HTML, essenciais, HMAC, expiração, CSRF/One-Click, assinatura real pelo SDK e idempotência do provider com cliente simulado. O teste Deno executa o entrypoint real com banco e API Resend simulados, sem permissão de rede. `supabase/tests/008_email.sql` verifica permissões, snapshot estável, reconciliação, preferências, supressão e sugestões. O harness PostgreSQL embutido valida SQL/RLS com adaptadores para Vault/cron/net; não comprova chamadas HTTP, execução real de cron ou entrega.

Antes do aceite em produção, rodar `supabase test db` e um teste controlado em projeto de homologação: evento → claim → entrega, falha → retry → encerramento, worker interrompido → recuperação, assinatura inválida → rejeição, bounce/complaint → supressão. Conferir SPF/DKIM/DMARC na mensagem recebida. Nenhum envio real foi executado durante a implementação, pois não foram fornecidas credenciais.
